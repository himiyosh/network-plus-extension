const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const repositoryRoot = path.resolve(__dirname, '..');
const BROWSER_START_TIMEOUT_MS = 15000;
const CDP_COMMAND_TIMEOUT_MS = 10000;
const TEST_TIMEOUT_MS = 45000;
const BROWSER_REQUIRED_IN_CI_MESSAGE =
  'Real-browser regression tests require an executable Chrome or Edge in CI. ' +
  'Set EDGE_BIN or CHROME_BIN to an executable browser path.';
const TRANSIENT_PROFILE_CLEANUP_ERRORS = new Set(['ENOTEMPTY', 'EBUSY']);
const TOOLBAR_VIEWPORT_WIDTHS = [375, 500, 800, 1280, 1366, 1367, 1500];
const TOOLBAR_FOCUS_VIEWPORT_WIDTHS = [375, 500, 800, 1280];
const GRID_FOCUS_VIEWPORT_WIDTHS = [375, 500, 800, 1280];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function findBrowserExecutable() {
  const programFiles = process.env.PROGRAMFILES;
  const programFilesX86 = process.env['PROGRAMFILES(X86)'];
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.EDGE_BIN,
    process.env.CHROME_BIN,
    programFiles && path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 && path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFiles && path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

const browserExecutable = findBrowserExecutable();
const runningInCi =
  process.env.GITHUB_ACTIONS === 'true' || Boolean(process.env.CI && process.env.CI.toLowerCase() !== 'false');
if (!browserExecutable && runningInCi) {
  throw new Error(BROWSER_REQUIRED_IN_CI_MESSAGE);
}
const browserTest = browserExecutable ? test : test.skip;

async function waitForDevTools(browserProcess, profileDirectory) {
  const activePortPath = path.join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + BROWSER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
      throw new Error(
        'Browser exited before DevTools started with code ' +
          browserProcess.exitCode +
          ' and signal ' +
          browserProcess.signalCode +
          '.',
      );
    }
    try {
      const [port, browserPath] = fs.readFileSync(activePortPath, 'utf8').trim().split(/\r?\n/);
      if (/^\d+$/.test(port) && browserPath) {
        return `ws://127.0.0.1:${port}${browserPath}`;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the browser DevTools endpoint.');
}

async function findPanelTarget(browserWebSocketUrl) {
  const browserUrl = new URL(browserWebSocketUrl);
  const targetListUrl = `http://${browserUrl.host}/json/list`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const targets = await fetch(targetListUrl).then((response) => response.json());
    const panelTarget = targets.find((target) => target.type === 'page' && target.url.endsWith('/panel.html'));
    if (panelTarget) return panelTarget;
    await delay(100);
  }
  throw new Error('Network+ panel target was not available.');
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed.')), {
      once: true,
    });
  });

  let nextId = 0;
  const pending = new Map();
  const rejectPending = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) {
      request.reject(new Error(message.error.message));
    } else {
      request.resolve(message.result);
    }
  });
  socket.addEventListener('close', () => {
    rejectPending(new Error('CDP WebSocket closed before the command completed.'));
  });
  socket.addEventListener('error', () => {
    rejectPending(new Error('CDP WebSocket failed before the command completed.'));
  });

  return {
    close: () => {
      if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
      return new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        socket.addEventListener(
          'close',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        socket.close();
      });
    },
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error('Cannot send ' + method + ' because the CDP WebSocket is not open.'));
          return;
        }
        const id = ++nextId;
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Timed out waiting for CDP command ' + method + '.'));
        }, CDP_COMMAND_TIMEOUT_MS);
        pending.set(id, {
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
          resolve: (result) => {
            clearTimeout(timeout);
            resolve(result);
          },
        });
        socket.send(JSON.stringify({ id, method, params }));
      }),
  };
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

async function pressKey(cdp, key, code, windowsVirtualKeyCode, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

async function expectFullAccessibilityTreeWithoutControl(cdp, accessibleName) {
  const accessibilityTree = await cdp.send('Accessibility.getFullAXTree');
  expect(accessibilityTree.nodes.length).toBeGreaterThan(0);
  expect(accessibilityTree.nodes.some((node) => node.name?.value === accessibleName)).toBe(false);
}

async function stopBrowser(browserProcess) {
  const hasExited = () => !browserProcess || browserProcess.exitCode !== null || browserProcess.signalCode !== null;
  const waitForExit = (timeoutMs) =>
    new Promise((resolve) => {
      if (hasExited()) {
        resolve(true);
        return;
      }
      let timeout;
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        browserProcess.removeListener('exit', onExit);
      };
      const onExit = () => {
        cleanup();
        resolve(true);
      };
      browserProcess.once('exit', onExit);
      if (Number.isFinite(timeoutMs)) {
        timeout = setTimeout(() => {
          cleanup();
          resolve(false);
        }, timeoutMs);
      }
    });
  if (hasExited()) return;
  const exited = waitForExit(2000);
  browserProcess.kill('SIGTERM');
  if (await exited) return;
  const killed = waitForExit();
  browserProcess.kill('SIGKILL');
  await killed;
}

function removeProfileDirectory(profileDirectory) {
  try {
    fs.rmSync(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch (error) {
    if (!error || !TRANSIENT_PROFILE_CLEANUP_ERRORS.has(error.code)) throw error;
    console.warn('Browser profile cleanup exhausted retries for ' + profileDirectory + ' (' + error.code + ').');
  }
}

test('profile cleanup warns after bounded retries exhaust a transient ENOTEMPTY error', () => {
  const profileDirectory = '/tmp/network-plus-cleanup-test';
  const cleanupError = Object.assign(new Error('Directory not empty'), { code: 'ENOTEMPTY' });
  const removeSpy = jest.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
    throw cleanupError;
  });
  const warningSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    expect(() => removeProfileDirectory(profileDirectory)).not.toThrow();
    expect(removeSpy).toHaveBeenCalledWith(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    expect(warningSpy).toHaveBeenCalledWith(
      'Browser profile cleanup exhausted retries for ' + profileDirectory + ' (ENOTEMPTY).',
    );
  } finally {
    removeSpy.mockRestore();
    warningSpy.mockRestore();
  }
});

test('profile cleanup rethrows non-transient removal errors', () => {
  const cleanupError = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
  const removeSpy = jest.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
    throw cleanupError;
  });

  try {
    expect(() => removeProfileDirectory('/tmp/network-plus-cleanup-test')).toThrow(cleanupError);
  } finally {
    removeSpy.mockRestore();
  }
});

test('collapsed accessibility check rejects an empty second AX tree', async () => {
  const cdp = {
    send: jest
      .fn()
      .mockResolvedValueOnce({
        nodes: [{ name: { value: 'Close request details' }, role: { value: 'button' } }],
      })
      .mockResolvedValueOnce({ nodes: [] }),
  };

  const initialAccessibilityTree = await cdp.send('Accessibility.getFullAXTree');
  expect(
    initialAccessibilityTree.nodes.some(
      (node) => node.role?.value === 'button' && node.name?.value === 'Close request details',
    ),
  ).toBe(true);
  await expect(expectFullAccessibilityTreeWithoutControl(cdp, 'Close request details')).rejects.toThrow();
  expect(cdp.send).toHaveBeenNthCalledWith(2, 'Accessibility.getFullAXTree');
});

browserTest(
  'live summary update preserves focused status chip identity and the pending click gesture',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-status-dom-'));
    const panelUrl = pathToFileURL(path.join(repositoryRoot, 'panel.html')).href;
    const browserProcess = spawn(
      browserExecutable,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        '--allow-file-access-from-files',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox',
        panelUrl,
      ],
      { stdio: 'ignore' },
    );

    let cdp;
    try {
      const browserWebSocketUrl = await waitForDevTools(browserProcess, profileDirectory);
      const panelTarget = await findPanelTarget(browserWebSocketUrl);
      cdp = await connectCdp(panelTarget.webSocketDebuggerUrl);
      await cdp.send('Runtime.enable');
      await cdp.send('Page.bringToFront');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 500,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });

      const before = await evaluate(
        cdp,
        `(async () => {
          if (document.readyState === 'loading') {
            await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
          }
          const sampleButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent.trim() === 'Explore sample capture',
          );
          if (!sampleButton) throw new Error('Sample capture action was not found.');
          sampleButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const chip = document.querySelector('.status-summary-chip--5xx');
          if (!chip) throw new Error('5xx status triage chip was not rendered.');
          chip.focus();
          window.__statusSummaryFocusedChip = chip;
          const rect = chip.getBoundingClientRect();
          return {
            selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
            first5xxRowId: document.querySelector('#tbody tr.status-5xx')?.dataset.rowId || null,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        })()`,
        true,
      );

      expect(before.selectedRowId).not.toBe(before.first5xxRowId);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: before.x,
        y: before.y,
        button: 'left',
        clickCount: 1,
      });

      const duringFlush = await evaluate(
        cdp,
        `(() => {
          const chip = window.__statusSummaryFocusedChip;
          _NetworkPlus.updateTableSummary();
          return {
            sameNode: document.querySelector('.status-summary-chip--5xx') === chip,
            focusHeld: document.activeElement === chip,
            connected: chip.isConnected,
          };
        })()`,
      );
      expect(duringFlush).toEqual({
        sameNode: true,
        focusHeld: true,
        connected: true,
      });

      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: before.x,
        y: before.y,
        button: 'left',
        clickCount: 1,
      });
      await evaluate(
        cdp,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );

      const after = await evaluate(
        cdp,
        `(() => ({
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
          focusedRowId: document.activeElement?.closest?.('tr[data-row-id]')?.dataset.rowId || null,
          detailsTitle: document.querySelector('#detailsTitle')?.textContent || '',
        }))()`,
      );
      expect(after.selectedRowId).toBe(before.first5xxRowId);
      expect(after.focusedRowId).toBe(before.first5xxRowId);
      expect(after.detailsTitle).toMatch(/^503 POST /);
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'details close control reclaims the workbench and row selection reopens it',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-details-dom-'));
    const panelUrl = pathToFileURL(path.join(repositoryRoot, 'panel.html')).href;
    const browserProcess = spawn(
      browserExecutable,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        '--allow-file-access-from-files',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox',
        panelUrl,
      ],
      { stdio: 'ignore' },
    );

    let cdp;
    try {
      const browserWebSocketUrl = await waitForDevTools(browserProcess, profileDirectory);
      const panelTarget = await findPanelTarget(browserWebSocketUrl);
      cdp = await connectCdp(panelTarget.webSocketDebuggerUrl);
      await cdp.send('Runtime.enable');
      await cdp.send('Page.bringToFront');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });

      const initial = await evaluate(
        cdp,
        `(async () => {
          if (document.readyState === 'loading') {
            await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
          }
          const sampleButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent.trim() === 'Explore sample capture',
          );
          if (!sampleButton) throw new Error('Sample capture action was not found.');
          sampleButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const closeButton = document.querySelector('#detailsCloseBtn');
          if (!closeButton) throw new Error('Details close control was not found.');
          const tbody = document.querySelector('#tbody');
          const selectedRow = tbody.querySelector('tr.selected');
          const spacer = document.createElement('tr');
          spacer.id = 'details-close-scroll-spacer';
          spacer.setAttribute('aria-hidden', 'true');
          const spacerCell = document.createElement('td');
          spacerCell.colSpan = 20;
          spacerCell.style.height = '1200px';
          spacer.appendChild(spacerCell);
          tbody.insertBefore(spacer, tbody.firstChild);
          document.querySelector('#tableWrap').scrollTop = 0;
          closeButton.focus();
          const tableRect = document.querySelector('#tableWrap').getBoundingClientRect();
          const selectedRect = selectedRow.getBoundingClientRect();
          return {
            closeLabel: closeButton.getAttribute('aria-label'),
            selectedRowId: selectedRow?.dataset.rowId || null,
            selectedRowInitiallyVisible:
              selectedRect.bottom > tableRect.top && selectedRect.top < tableRect.bottom,
          };
        })()`,
        true,
      );
      expect(initial.closeLabel).toBe('Close request details');
      expect(initial.selectedRowId).not.toBeNull();
      expect(initial.selectedRowInitiallyVisible).toBe(false);
      const initialAccessibilityTree = await cdp.send('Accessibility.getFullAXTree');
      expect(
        initialAccessibilityTree.nodes.some(
          (node) => node.role?.value === 'button' && node.name?.value === 'Close request details',
        ),
      ).toBe(true);

      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: ' ',
        code: 'Space',
        text: ' ',
        unmodifiedText: ' ',
        windowsVirtualKeyCode: 32,
        nativeVirtualKeyCode: 32,
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: ' ',
        code: 'Space',
        windowsVirtualKeyCode: 32,
        nativeVirtualKeyCode: 32,
      });
      await evaluate(
        cdp,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );

      const wideCollapsed = await evaluate(
        cdp,
        `(() => {
          const content = document.querySelector('#content').getBoundingClientRect();
          const table = document.querySelector('#tableWrap').getBoundingClientRect();
          const focusedRow = document.activeElement?.closest?.('tr[data-row-id]');
          const focusedRect = focusedRow?.getBoundingClientRect();
          return {
            detailsHidden: document.querySelector('#details').hidden,
            detailsDisplay: getComputedStyle(document.querySelector('#details')).display,
            resizerHidden: document.querySelector('#resizer').hidden,
            resizerDisplay: getComputedStyle(document.querySelector('#resizer')).display,
            focusedRowId: focusedRow?.dataset.rowId || null,
            focusedRowVisible:
              !!focusedRect && focusedRect.bottom > table.top && focusedRect.top < table.bottom,
            contentWidth: Math.round(content.width),
            tableWidth: Math.round(table.width),
          };
        })()`,
      );
      expect(wideCollapsed).toEqual({
        detailsHidden: true,
        detailsDisplay: 'none',
        resizerHidden: true,
        resizerDisplay: 'none',
        focusedRowId: initial.selectedRowId,
        focusedRowVisible: true,
        contentWidth: 1280,
        tableWidth: 1280,
      });
      await expectFullAccessibilityTreeWithoutControl(cdp, 'Close request details');
      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#details-close-scroll-spacer')?.remove();
        })()`,
      );

      const secondRowPoint = await evaluate(
        cdp,
        `(() => {
          const row = document.querySelectorAll('#tbody tr[data-row-id]')[1];
          if (!row) throw new Error('Second sample request was not found.');
          const rect = row.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`,
      );
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: secondRowPoint.x,
        y: secondRowPoint.y,
        button: 'left',
        clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: secondRowPoint.x,
        y: secondRowPoint.y,
        button: 'left',
        clickCount: 1,
      });
      await evaluate(
        cdp,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );

      const wideReopened = await evaluate(
        cdp,
        `(() => ({
          detailsHidden: document.querySelector('#details').hidden,
          resizerHidden: document.querySelector('#resizer').hidden,
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
          detailsTitle: document.querySelector('#detailsTitle')?.textContent || '',
        }))()`,
      );
      expect(wideReopened.detailsHidden).toBe(false);
      expect(wideReopened.resizerHidden).toBe(false);
      expect(wideReopened.selectedRowId).not.toBe(initial.selectedRowId);
      expect(wideReopened.detailsTitle).toMatch(/^503 POST /);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 375,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        cdp,
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
        true,
      );
      await evaluate(
        cdp,
        `(() => {
          const closeButton = document.querySelector('#detailsCloseBtn');
          closeButton.focus();
        })()`,
      );
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: ' ',
        code: 'Space',
        text: ' ',
        unmodifiedText: ' ',
        windowsVirtualKeyCode: 32,
        nativeVirtualKeyCode: 32,
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: ' ',
        code: 'Space',
        windowsVirtualKeyCode: 32,
        nativeVirtualKeyCode: 32,
      });
      await evaluate(
        cdp,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );

      const narrowCollapsed = await evaluate(
        cdp,
        `(() => {
          const content = document.querySelector('#content').getBoundingClientRect();
          const table = document.querySelector('#tableWrap').getBoundingClientRect();
          return {
            detailsHidden: document.querySelector('#details').hidden,
            detailsDisplay: getComputedStyle(document.querySelector('#details')).display,
            resizerHidden: document.querySelector('#resizer').hidden,
            resizerDisplay: getComputedStyle(document.querySelector('#resizer')).display,
            documentOverflowX:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
            focusedRowId: document.activeElement?.closest?.('tr[data-row-id]')?.dataset.rowId || null,
            contentHeight: Math.round(content.height),
            tableHeight: Math.round(table.height),
          };
        })()`,
      );
      expect(narrowCollapsed.detailsHidden).toBe(true);
      expect(narrowCollapsed.detailsDisplay).toBe('none');
      expect(narrowCollapsed.resizerHidden).toBe(true);
      expect(narrowCollapsed.resizerDisplay).toBe('none');
      expect(narrowCollapsed.documentOverflowX).toBe(0);
      expect(narrowCollapsed.focusedRowId).toBe(wideReopened.selectedRowId);
      expect(narrowCollapsed.tableHeight).toBe(narrowCollapsed.contentHeight);

      const thirdRowPoint = await evaluate(
        cdp,
        `(() => {
          const row = document.querySelectorAll('#tbody tr[data-row-id]')[2];
          if (!row) throw new Error('Third sample request was not found.');
          const rect = row.getBoundingClientRect();
          return { x: Math.max(8, rect.left + 8), y: rect.top + rect.height / 2 };
        })()`,
      );
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: thirdRowPoint.x,
        y: thirdRowPoint.y,
        button: 'left',
        clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: thirdRowPoint.x,
        y: thirdRowPoint.y,
        button: 'left',
        clickCount: 1,
      });
      await evaluate(
        cdp,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );

      const narrowReopened = await evaluate(
        cdp,
        `(() => ({
          detailsHidden: document.querySelector('#details').hidden,
          resizerHidden: document.querySelector('#resizer').hidden,
          detailsTitle: document.querySelector('#detailsTitle')?.textContent || '',
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
        }))()`,
      );
      expect(narrowReopened.detailsHidden).toBe(false);
      expect(narrowReopened.resizerHidden).toBe(false);
      expect(narrowReopened.detailsTitle).toMatch(/^304 GET /);
      expect(narrowReopened.selectedRowId).not.toBe(wideReopened.selectedRowId);
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'constrained toolbar prioritizes actions while preserving local overflow access',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-toolbar-dom-'));
    const panelUrl = pathToFileURL(path.join(repositoryRoot, 'panel.html')).href;
    const browserProcess = spawn(
      browserExecutable,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        '--allow-file-access-from-files',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox',
        panelUrl,
      ],
      { stdio: 'ignore' },
    );

    let cdp;
    try {
      const browserWebSocketUrl = await waitForDevTools(browserProcess, profileDirectory);
      const panelTarget = await findPanelTarget(browserWebSocketUrl);
      cdp = await connectCdp(panelTarget.webSocketDebuggerUrl);
      await cdp.send('Runtime.enable');
      await cdp.send('Page.bringToFront');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        cdp,
        `(async () => {
          if (document.readyState === 'loading') {
            await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
          }
          const sampleButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent.trim() === 'Explore sample capture',
          );
          if (!sampleButton) throw new Error('Sample capture action was not found.');
          sampleButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        })()`,
        true,
      );

      const viewportMeasurements = [];
      for (const width of TOOLBAR_VIEWPORT_WIDTHS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await evaluate(
          cdp,
          'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
          true,
        );
        viewportMeasurements.push(
          await evaluate(
            cdp,
            `(() => {
              const toolbar = document.querySelector('.topbar');
              toolbar.scrollLeft = 0;
              const toolbarRect = toolbar.getBoundingClientRect();
              const actions = Array.from(toolbar.querySelectorAll('button')).map((button) => {
                const rect = button.getBoundingClientRect();
                return {
                  id: button.id,
                  fullyVisible: rect.left >= toolbarRect.left && rect.right <= toolbarRect.right,
                };
              });
              const brand = document.querySelector('.brand');
              const brandStyle = getComputedStyle(brand);
              return {
                width: innerWidth,
                documentOverflow:
                  document.documentElement.scrollWidth - document.documentElement.clientWidth,
                toolbarOverflow: toolbar.scrollWidth - toolbar.clientWidth,
                toolbarOverflowX: getComputedStyle(toolbar).overflowX,
                actions,
                brandWidth: brand.getBoundingClientRect().width,
                brandDisplay: brandStyle.display,
                brandPaddingLeft: brandStyle.paddingLeft,
                brandPaddingRight: brandStyle.paddingRight,
                brandSubtitleDisplay: getComputedStyle(
                  document.querySelector('.brand-sub'),
                ).display,
              };
            })()`,
          ),
        );
      }

      const expectedActionOrder = [
        'pauseBtn',
        'searchToggleBtn',
        'clearBtn',
        'importBtn',
        'exportHarBtn',
        'autoScrollBtn',
        'filterBtn',
        'presetsBtn',
        'columnsBtn',
        'retentionBtn',
        'themeBtn',
        'shortcutBtn',
      ];
      for (const measurement of viewportMeasurements) {
        expect(measurement.documentOverflow).toBe(0);
        expect(measurement.toolbarOverflowX).toBe('auto');
        expect(measurement.actions).toHaveLength(12);
        expect(measurement.actions.map((action) => action.id)).toEqual(expectedActionOrder);
      }
      expect(viewportMeasurements.slice(0, 3).every((measurement) => measurement.toolbarOverflow > 0)).toBe(true);
      const measurementsByWidth = new Map(viewportMeasurements.map((measurement) => [measurement.width, measurement]));
      const desktopMeasurement = measurementsByWidth.get(1280);
      expect(desktopMeasurement.toolbarOverflow).toBe(0);
      expect(desktopMeasurement.actions.every((action) => action.fullyVisible)).toBe(true);
      expect(desktopMeasurement.brandDisplay).not.toBe('none');
      expect(desktopMeasurement.brandSubtitleDisplay).toBe('none');
      expect(desktopMeasurement.brandWidth).toBeLessThan(150);
      expect(desktopMeasurement.brandPaddingLeft).toBe('8px');
      expect(desktopMeasurement.brandPaddingRight).toBe('8px');

      const compactBoundaryMeasurement = measurementsByWidth.get(1366);
      expect(compactBoundaryMeasurement.brandSubtitleDisplay).toBe('none');
      expect(compactBoundaryMeasurement.brandPaddingLeft).toBe('8px');
      expect(compactBoundaryMeasurement.brandPaddingRight).toBe('8px');

      const wideBoundaryMeasurement = measurementsByWidth.get(1367);
      const wideMeasurement = measurementsByWidth.get(1500);
      for (const measurement of [wideBoundaryMeasurement, wideMeasurement]) {
        expect(measurement.brandSubtitleDisplay).not.toBe('none');
        expect(measurement.brandPaddingLeft).toBe('14px');
        expect(measurement.brandPaddingRight).toBe('14px');
        expect(measurement.brandWidth).toBeGreaterThan(compactBoundaryMeasurement.brandWidth);
      }

      const expectedTabOrder = [
        'searchToggleBtn',
        'clearBtn',
        'importBtn',
        'exportHarBtn',
        'autoScrollBtn',
        'filterBtn',
        'presetsBtn',
        'columnsBtn',
        'retentionBtn',
        'themeBtn',
        'shortcutBtn',
      ];
      const focusMeasurements = [];
      for (const width of TOOLBAR_FOCUS_VIEWPORT_WIDTHS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await evaluate(
          cdp,
          `(async () => {
            document.body.tabIndex = -1;
            document.body.focus();
            document.querySelector('.topbar').scrollLeft = 0;
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          })()`,
          true,
        );
        const tabTrace = [];
        for (const expectedId of expectedTabOrder) {
          await pressKey(cdp, 'Tab', 'Tab', 9);
          const traceEntry = await evaluate(
            cdp,
            `new Promise((resolve) => requestAnimationFrame(() => {
              const active = document.activeElement;
              const toolbar = document.querySelector('.topbar');
              const toolbarRect = toolbar.getBoundingClientRect();
              const visibleLeft = toolbarRect.left + toolbar.clientLeft;
              const visibleRight = visibleLeft + toolbar.clientWidth;
              const activeRect = active.getBoundingClientRect();
              const style = getComputedStyle(active);
              const outlineAllowance = Number.parseFloat(style.outlineWidth) || 0;
              resolve({
                id: active.id,
                inToolbar: toolbar.contains(active),
                focusVisible: active.matches(':focus-visible'),
                outlineStyle: style.outlineStyle,
                outlineWidth: style.outlineWidth,
                documentScrollLeft: document.scrollingElement.scrollLeft,
                documentScrollTop: document.scrollingElement.scrollTop,
                documentOverflow:
                  document.documentElement.scrollWidth - document.documentElement.clientWidth,
                fullyVisibleWithOutline:
                  activeRect.left - outlineAllowance >= visibleLeft &&
                  activeRect.right + outlineAllowance <= visibleRight,
                visibleWidth: Math.round(
                  Math.max(
                    0,
                    Math.min(activeRect.right, visibleRight) -
                      Math.max(activeRect.left, visibleLeft),
                  ),
                ),
                actionWidth: Math.round(activeRect.width),
                clippedSide:
                  activeRect.left - outlineAllowance < visibleLeft ? 'left' : 'right',
              });
            }))`,
            true,
          );
          expect(traceEntry.id).toBe(expectedId);
          tabTrace.push(traceEntry);
        }
        focusMeasurements.push({ width, tabTrace });
      }
      for (const measurement of focusMeasurements) {
        expect(measurement.tabTrace.map((entry) => entry.id)).toEqual(expectedTabOrder);
        expect(
          measurement.tabTrace.every(
            (entry) =>
              entry.inToolbar &&
              entry.focusVisible &&
              entry.outlineStyle === 'solid' &&
              entry.outlineWidth === '2px' &&
              entry.documentScrollLeft === 0 &&
              entry.documentScrollTop === 0 &&
              entry.documentOverflow === 0,
          ),
        ).toBe(true);
      }
      const clippedFocusMeasurements = focusMeasurements.flatMap((measurement) =>
        measurement.tabTrace
          .filter((entry) => !entry.fullyVisibleWithOutline)
          .map((entry) => ({
            width: measurement.width,
            id: entry.id,
            visibleWidth: entry.visibleWidth,
            actionWidth: entry.actionWidth,
            clippedSide: entry.clippedSide,
          })),
      );
      expect(clippedFocusMeasurements).toEqual([]);

      const pointerCases = [
        { caseId: 'exportHarBtn@500', width: 500, actionId: 'exportHarBtn' },
        { caseId: 'presetsBtn@800', width: 800, actionId: 'presetsBtn' },
        {
          caseId: 'exportHarBtn@500-sub-4px',
          width: 500,
          actionId: 'exportHarBtn',
          forcedVisibleWidth: 2,
        },
      ];
      const pointerMeasurements = [];
      for (const pointerCase of pointerCases) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: pointerCase.width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        const point = await evaluate(
          cdp,
          `(async () => {
            document.body.focus();
            const toolbar = document.querySelector('.topbar');
            toolbar.scrollLeft = 0;
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const action = document.querySelector('#${pointerCase.actionId}');
            action.style.transform = '';
            const toolbarRect = toolbar.getBoundingClientRect();
            const toolbarLeft = toolbarRect.left + toolbar.clientLeft;
            const toolbarRight = toolbarLeft + toolbar.clientWidth;
            const toolbarTop = toolbarRect.top + toolbar.clientTop;
            const toolbarBottom = toolbarTop + toolbar.clientHeight;
            const forcedVisibleWidth = ${pointerCase.forcedVisibleWidth ?? 'null'};
            if (forcedVisibleWidth !== null) {
              const initialActionRect = action.getBoundingClientRect();
              action.style.transform =
                'translateX(' +
                (toolbarRight - forcedVisibleWidth - initialActionRect.left) +
                'px)';
            }
            const actionRect = action.getBoundingClientRect();
            const visibleLeft = Math.max(actionRect.left, toolbarLeft);
            const visibleRight = Math.min(actionRect.right, toolbarRight);
            const visibleTop = Math.max(actionRect.top, toolbarTop);
            const visibleBottom = Math.min(actionRect.bottom, toolbarBottom);
            const controller = new AbortController();
            window.__toolbarPointerProbeController?.abort();
            window.__toolbarPointerProbeController = controller;
            window.__toolbarPointerProbe = { actionDeliveries: 0, clickTargets: [] };
            document.addEventListener(
              'click',
              (event) => {
                const target = event.target;
                window.__toolbarPointerProbe.clickTargets.push(
                  target.id || target.className || target.tagName.toLowerCase(),
                );
              },
              { capture: true, signal: controller.signal },
            );
            action.addEventListener(
              'click',
              () => {
                window.__toolbarPointerProbe.actionDeliveries += 1;
              },
              { signal: controller.signal },
            );
            return {
              x: (visibleLeft + visibleRight) / 2,
              y: (visibleTop + visibleBottom) / 2,
              visibleWidth: Math.round(Math.max(0, visibleRight - visibleLeft)),
              actionWidth: Math.round(actionRect.width),
            };
          })()`,
          true,
        );
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: point.x,
          y: point.y,
          button: 'left',
          clickCount: 1,
        });
        await delay(80);
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: point.x,
          y: point.y,
          button: 'left',
          clickCount: 1,
        });
        pointerMeasurements.push(
          await evaluate(
            cdp,
            `(async () => {
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const measurement = {
                caseId: '${pointerCase.caseId}',
                width: ${pointerCase.width},
                actionId: '${pointerCase.actionId}',
                visibleWidth: ${point.visibleWidth},
                actionWidth: ${point.actionWidth},
                clickTargets: window.__toolbarPointerProbe.clickTargets,
                actionDeliveries: window.__toolbarPointerProbe.actionDeliveries,
                toolbarScrollLeft: document.querySelector('.topbar').scrollLeft,
              };
              window.__toolbarPointerProbeController.abort();
              document.querySelector('#${pointerCase.actionId}').style.transform = '';
              if (document.querySelector('#dataSafetyDialog').open) {
                document.querySelector('#dataSafetyDialog').close();
              }
              return measurement;
            })()`,
            true,
          ),
        );
      }
      expect(
        pointerMeasurements.every(
          (measurement) => measurement.visibleWidth > 0 && measurement.visibleWidth < measurement.actionWidth,
        ),
      ).toBe(true);
      expect(
        pointerMeasurements.find((measurement) => measurement.caseId === 'exportHarBtn@500-sub-4px').visibleWidth,
      ).toBe(2);
      expect(
        pointerMeasurements.map((measurement) => ({
          caseId: measurement.caseId,
          width: measurement.width,
          actionId: measurement.actionId,
          clickTargets: measurement.clickTargets,
          actionDeliveries: measurement.actionDeliveries,
          toolbarScrollLeft: measurement.toolbarScrollLeft,
        })),
      ).toEqual([
        {
          caseId: 'exportHarBtn@500',
          width: 500,
          actionId: 'exportHarBtn',
          clickTargets: ['exportHarBtn'],
          actionDeliveries: 1,
          toolbarScrollLeft: 0,
        },
        {
          caseId: 'presetsBtn@800',
          width: 800,
          actionId: 'presetsBtn',
          clickTargets: ['presetsBtn'],
          actionDeliveries: 1,
          toolbarScrollLeft: 0,
        },
        {
          caseId: 'exportHarBtn@500-sub-4px',
          width: 500,
          actionId: 'exportHarBtn',
          clickTargets: ['exportHarBtn'],
          actionDeliveries: 1,
          toolbarScrollLeft: 0,
        },
      ]);
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'request-grid focus stays visible without disrupting pointer sorting or resizing',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-grid-focus-dom-'));
    const panelUrl = pathToFileURL(path.join(repositoryRoot, 'panel.html')).href;
    const browserProcess = spawn(
      browserExecutable,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDirectory}`,
        '--allow-file-access-from-files',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox',
        panelUrl,
      ],
      { stdio: 'ignore' },
    );

    let cdp;
    try {
      const browserWebSocketUrl = await waitForDevTools(browserProcess, profileDirectory);
      const panelTarget = await findPanelTarget(browserWebSocketUrl);
      cdp = await connectCdp(panelTarget.webSocketDebuggerUrl);
      await cdp.send('Runtime.enable');
      await cdp.send('Page.bringToFront');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        cdp,
        `(async () => {
          if (document.readyState === 'loading') {
            await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
          }
          const sampleButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent.trim() === 'Explore sample capture',
          );
          if (!sampleButton) throw new Error('Sample capture action was not found.');
          sampleButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        })()`,
        true,
      );

      const toolbarTabOrder = [
        'searchToggleBtn',
        'clearBtn',
        'importBtn',
        'exportHarBtn',
        'autoScrollBtn',
        'filterBtn',
        'presetsBtn',
        'columnsBtn',
        'retentionBtn',
        'themeBtn',
        'shortcutBtn',
      ];
      const visibleColumns = [
        ['id', 'ID'],
        ['clientStart', 'ClientStart'],
        ['serverDone', 'ServerDone'],
        ['method', 'Method'],
        ['status', 'Status'],
        ['domain', 'Domain'],
        ['path', 'Path'],
        ['type', 'Type'],
        ['duration', 'Duration'],
        ['size', 'Size'],
      ];
      const expectedGridTargets = visibleColumns.flatMap(([columnId, label]) => [
        {
          key: `header:${columnId}`,
          role: 'columnheader',
          accessibleName: label,
        },
        {
          key: `separator:${columnId}`,
          role: 'separator',
          accessibleName: `Resize ${label} column`,
        },
      ]);
      const reverseGridTargets = expectedGridTargets.slice().reverse();
      const measureGridFocusTarget = () =>
        evaluate(
          cdp,
          `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const active = document.activeElement;
            const header = active.closest('th[data-col-id]');
            const tableWrap = document.querySelector('#tableWrap');
            const tableRect = tableWrap.getBoundingClientRect();
            const visibleLeft = tableRect.left + tableWrap.clientLeft;
            const visibleRight = visibleLeft + tableWrap.clientWidth;
            const activeRect = active.getBoundingClientRect();
            const style = getComputedStyle(active);
            const outlineAllowance = Number.parseFloat(style.outlineWidth) || 0;
            const kind = active.classList.contains('col-resizer') ? 'separator' : 'header';
            resolve({
              key: kind + ':' + (header?.dataset.colId || ''),
              role: active.getAttribute('role'),
              accessibleName: active.getAttribute('aria-label'),
              inTableWrap: tableWrap.contains(active),
              focusVisible: active.matches(':focus-visible'),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              documentScrollLeft: document.scrollingElement.scrollLeft,
              documentScrollTop: document.scrollingElement.scrollTop,
              documentOverflow:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
              tableScrollLeft: tableWrap.scrollLeft,
              tableScrollMax: tableWrap.scrollWidth - tableWrap.clientWidth,
              fullyVisibleWithOutline:
                activeRect.left - outlineAllowance >= visibleLeft &&
                activeRect.right + outlineAllowance <= visibleRight,
              visibleWidth: Math.round(
                Math.max(
                  0,
                  Math.min(activeRect.right, visibleRight) -
                    Math.max(activeRect.left, visibleLeft),
                ),
              ),
              targetWidth: Math.round(activeRect.width),
              clippedSide:
                activeRect.left - outlineAllowance < visibleLeft ? 'left' : 'right',
            });
          })))`,
          true,
        );
      const focusMeasurements = [];
      for (const width of GRID_FOCUS_VIEWPORT_WIDTHS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await evaluate(
          cdp,
          `(async () => {
            document.body.tabIndex = -1;
            document.body.focus();
            document.querySelector('.topbar').scrollLeft = 0;
            document.querySelector('#tableWrap').scrollLeft = 0;
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          })()`,
          true,
        );
        const traversedToolbar = [];
        for (const expectedId of toolbarTabOrder) {
          await pressKey(cdp, 'Tab', 'Tab', 9);
          const activeId = await evaluate(cdp, 'document.activeElement.id');
          expect(activeId).toBe(expectedId);
          traversedToolbar.push(activeId);
        }
        const forwardTabTrace = [];
        for (const expectedTarget of expectedGridTargets) {
          await pressKey(cdp, 'Tab', 'Tab', 9);
          const traceEntry = await measureGridFocusTarget();
          expect({
            key: traceEntry.key,
            role: traceEntry.role,
            accessibleName: traceEntry.accessibleName,
          }).toEqual(expectedTarget);
          forwardTabTrace.push(traceEntry);
        }
        await pressKey(cdp, 'Tab', 'Tab', 9);
        const reverseStart = await evaluate(
          cdp,
          `(() => ({
            focusedRowId:
              document.activeElement.closest('tr[data-row-id]')?.dataset.rowId || null,
            documentScrollLeft: document.scrollingElement.scrollLeft,
            documentScrollTop: document.scrollingElement.scrollTop,
          }))()`,
        );
        expect(reverseStart.focusedRowId).not.toBeNull();
        expect(reverseStart.documentScrollLeft).toBe(0);
        expect(reverseStart.documentScrollTop).toBe(0);

        const reverseTabTrace = [];
        for (const expectedTarget of reverseGridTargets) {
          await pressKey(cdp, 'Tab', 'Tab', 9, 8);
          const traceEntry = await measureGridFocusTarget();
          expect({
            key: traceEntry.key,
            role: traceEntry.role,
            accessibleName: traceEntry.accessibleName,
          }).toEqual(expectedTarget);
          reverseTabTrace.push(traceEntry);
        }
        focusMeasurements.push({
          width,
          traversedToolbar,
          forwardTabTrace,
          reverseTabTrace,
        });
      }

      for (const measurement of focusMeasurements) {
        expect(measurement.traversedToolbar).toEqual(toolbarTabOrder);
        expect(measurement.forwardTabTrace.map((entry) => entry.key)).toEqual(
          expectedGridTargets.map((target) => target.key),
        );
        expect(measurement.reverseTabTrace.map((entry) => entry.key)).toEqual(
          reverseGridTargets.map((target) => target.key),
        );
        expect(
          [...measurement.forwardTabTrace, ...measurement.reverseTabTrace].every(
            (entry) =>
              entry.inTableWrap &&
              entry.focusVisible &&
              entry.outlineStyle === 'solid' &&
              entry.outlineWidth === '2px' &&
              entry.documentScrollLeft === 0 &&
              entry.documentScrollTop === 0 &&
              entry.documentOverflow === 0 &&
              entry.tableScrollLeft >= 0 &&
              entry.tableScrollLeft <= entry.tableScrollMax,
          ),
        ).toBe(true);
      }
      const clippedFocusMeasurements = focusMeasurements.flatMap((measurement) =>
        [
          ...measurement.forwardTabTrace.map((entry) => ({
            ...entry,
            direction: 'forward',
          })),
          ...measurement.reverseTabTrace.map((entry) => ({
            ...entry,
            direction: 'reverse',
          })),
        ]
          .filter((entry) => !entry.fullyVisibleWithOutline)
          .map((entry) => ({
            width: measurement.width,
            direction: entry.direction,
            key: entry.key,
            visibleWidth: entry.visibleWidth,
            targetWidth: entry.targetWidth,
            clippedSide: entry.clippedSide,
            tableScrollLeft: entry.tableScrollLeft,
          })),
      );

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 375,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const headerPointerPoint = await evaluate(
        cdp,
        `(async () => {
          document.body.focus();
          const tableWrap = document.querySelector('#tableWrap');
          tableWrap.scrollLeft = 0;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const header = document.querySelector('th[data-col-id="method"]');
          header.style.transform = '';
          const tableRect = tableWrap.getBoundingClientRect();
          const visibleLeft = tableRect.left + tableWrap.clientLeft;
          const visibleRight = visibleLeft + tableWrap.clientWidth;
          const forcedVisibleWidth = 2;
          const initialHeaderRect = header.getBoundingClientRect();
          header.style.transform =
            'translateX(' +
            (visibleRight - forcedVisibleWidth - initialHeaderRect.left) +
            'px)';
          const headerRect = header.getBoundingClientRect();
          const visibleHeaderLeft = Math.max(headerRect.left, visibleLeft);
          const visibleHeaderRight = Math.min(headerRect.right, visibleRight);
          const controller = new AbortController();
          window.__gridPointerProbeController?.abort();
          window.__gridPointerProbeController = controller;
          window.__gridPointerProbe = { clickTargets: [], headerDeliveries: 0 };
          document.addEventListener(
            'click',
            (event) => {
              const targetHeader = event.target.closest('th[data-col-id]');
              window.__gridPointerProbe.clickTargets.push({
                columnId: targetHeader?.dataset.colId || null,
                kind: event.target.classList.contains('col-resizer') ? 'separator' : 'header',
              });
            },
            { capture: true, signal: controller.signal },
          );
          header.addEventListener(
            'click',
            () => {
              window.__gridPointerProbe.headerDeliveries += 1;
            },
            { capture: true, signal: controller.signal },
          );
          const x = Math.min(headerRect.right - 8, visibleRight - 4);
          const y = headerRect.top + headerRect.height / 2;
          const hitTarget = document.elementFromPoint(x, y);
          return {
            x,
            y,
            columnId: hitTarget?.closest('th[data-col-id]')?.dataset.colId || null,
            hitHeader:
              hitTarget?.closest('th[data-col-id]') === header &&
              !hitTarget.classList.contains('col-resizer'),
            visibleWidth: Math.round(Math.max(0, visibleHeaderRight - visibleHeaderLeft)),
            headerWidth: Math.round(headerRect.width),
            tableScrollLeft: tableWrap.scrollLeft,
          };
        })()`,
        true,
      );
      expect(headerPointerPoint.visibleWidth).toBeGreaterThan(0);
      expect(headerPointerPoint.visibleWidth).toBeLessThan(headerPointerPoint.headerWidth);
      expect(headerPointerPoint.visibleWidth).toBe(2);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: headerPointerPoint.x,
        y: headerPointerPoint.y,
        button: 'left',
        clickCount: 1,
      });
      await delay(80);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: headerPointerPoint.x,
        y: headerPointerPoint.y,
        button: 'left',
        clickCount: 1,
      });
      const headerPointerMeasurement = await evaluate(
        cdp,
        `(async () => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const header = document.querySelector('th[data-col-id="method"]');
          const measurement = {
            clickTargets: window.__gridPointerProbe.clickTargets,
            headerDeliveries: window.__gridPointerProbe.headerDeliveries,
            ariaSort: header.getAttribute('aria-sort'),
            focusedColumnId: document.activeElement.closest('th[data-col-id]')?.dataset.colId || null,
            tableScrollLeft: document.querySelector('#tableWrap').scrollLeft,
            documentScrollLeft: document.scrollingElement.scrollLeft,
            documentScrollTop: document.scrollingElement.scrollTop,
          };
          window.__gridPointerProbeController.abort();
          header.style.transform = '';
          return measurement;
        })()`,
        true,
      );

      const separatorPointerPoint = await evaluate(
        cdp,
        `(async () => {
          document.body.focus();
          const tableWrap = document.querySelector('#tableWrap');
          tableWrap.style.transform = '';
          tableWrap.scrollLeft = tableWrap.scrollWidth - tableWrap.clientWidth - 3;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          tableWrap.style.transform = 'translateX(2px)';
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const separator = document.querySelector('th[data-col-id="size"] .col-resizer');
          separator.style.transform = '';
          const tableRect = tableWrap.getBoundingClientRect();
          const visibleLeft = tableRect.left + tableWrap.clientLeft;
          const visibleRight = visibleLeft + tableWrap.clientWidth;
          const forcedVisibleWidth = 0.5;
          const initialSeparatorRect = separator.getBoundingClientRect();
          separator.style.transform =
            'translateX(' +
            (visibleLeft + forcedVisibleWidth - initialSeparatorRect.right) +
            'px)';
          separator.style.clipPath =
            'inset(0 0 0 calc(100% - ' + forcedVisibleWidth + 'px))';
          const separatorRect = separator.getBoundingClientRect();
          const visibleSeparatorLeft = Math.max(separatorRect.left, visibleLeft);
          const visibleSeparatorRight = Math.min(separatorRect.right, visibleRight);
          const x = Math.min(separatorRect.right - 1, visibleRight - 1);
          const y = separatorRect.top + separatorRect.height / 2;
          const hitTarget = document.elementFromPoint(x, y);
          const controller = new AbortController();
          window.__gridResizeProbeController?.abort();
          window.__gridResizeProbeController = controller;
          window.__gridResizeProbe = { mouseDownTargets: [], resizeDeliveries: 0 };
          document.addEventListener(
            'mousedown',
            (event) => {
              const targetHeader = event.target.closest('th[data-col-id]');
              window.__gridResizeProbe.mouseDownTargets.push({
                columnId: targetHeader?.dataset.colId || null,
                kind: event.target.classList.contains('col-resizer') ? 'separator' : 'header',
              });
            },
            { capture: true, signal: controller.signal },
          );
          separator.addEventListener(
            'mousedown',
            () => {
              window.__gridResizeProbe.resizeDeliveries += 1;
            },
            { capture: true, signal: controller.signal },
          );
          return {
            x,
            y,
            columnId: hitTarget?.closest('th[data-col-id]')?.dataset.colId || null,
            hitSeparator: hitTarget === separator,
            visibleWidth: Math.max(0, visibleSeparatorRight - visibleSeparatorLeft),
            separatorWidth: Math.round(separatorRect.width),
            columnWidth: Number(separator.getAttribute('aria-valuenow')),
            tableScrollLeft: tableWrap.scrollLeft,
          };
        })()`,
        true,
      );
      expect(separatorPointerPoint.visibleWidth).toBeGreaterThan(0);
      expect(separatorPointerPoint.visibleWidth).toBeLessThan(separatorPointerPoint.separatorWidth);
      expect(separatorPointerPoint.visibleWidth).toBeCloseTo(0.5, 5);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: separatorPointerPoint.x,
        y: separatorPointerPoint.y,
        button: 'left',
        clickCount: 1,
      });
      await delay(80);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: separatorPointerPoint.x + 20,
        y: separatorPointerPoint.y,
        button: 'left',
        buttons: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: separatorPointerPoint.x + 20,
        y: separatorPointerPoint.y,
        button: 'left',
        clickCount: 1,
      });
      const separatorPointerMeasurement = await evaluate(
        cdp,
        `(() => {
          const separator = document.querySelector('th[data-col-id="size"] .col-resizer');
          const measurement = {
            mouseDownTargets: window.__gridResizeProbe.mouseDownTargets,
            resizeDeliveries: window.__gridResizeProbe.resizeDeliveries,
            columnWidth: Number(separator.getAttribute('aria-valuenow')),
            tableScrollLeft: document.querySelector('#tableWrap').scrollLeft,
            documentScrollLeft: document.scrollingElement.scrollLeft,
            documentScrollTop: document.scrollingElement.scrollTop,
          };
          window.__gridResizeProbeController.abort();
          separator.style.transform = '';
          separator.style.clipPath = '';
          document.querySelector('#tableWrap').style.transform = '';
          return measurement;
        })()`,
      );
      expect({
        method: {
          columnId: headerPointerPoint.columnId,
          hitHeader: headerPointerPoint.hitHeader,
          ...headerPointerMeasurement,
          tableScrollDelta:
            headerPointerMeasurement.tableScrollLeft - headerPointerPoint.tableScrollLeft,
        },
        size: {
          columnId: separatorPointerPoint.columnId,
          hitSeparator: separatorPointerPoint.hitSeparator,
          ...separatorPointerMeasurement,
          tableScrollDelta:
            separatorPointerMeasurement.tableScrollLeft - separatorPointerPoint.tableScrollLeft,
        },
      }).toEqual({
        method: {
          columnId: 'method',
          hitHeader: true,
          clickTargets: [{ columnId: 'method', kind: 'header' }],
          headerDeliveries: 1,
          ariaSort: 'ascending',
          focusedColumnId: 'method',
          tableScrollLeft: headerPointerPoint.tableScrollLeft,
          documentScrollLeft: 0,
          documentScrollTop: 0,
          tableScrollDelta: 0,
        },
        size: {
          columnId: 'size',
          hitSeparator: true,
          mouseDownTargets: [{ columnId: 'size', kind: 'separator' }],
          resizeDeliveries: 1,
          columnWidth: separatorPointerPoint.columnWidth + 20,
          tableScrollLeft: separatorPointerPoint.tableScrollLeft,
          documentScrollLeft: 0,
          documentScrollTop: 0,
          tableScrollDelta: 0,
        },
      });
      expect({
        contract: 'forward and reverse request-grid focus containment',
        clippedFocusMeasurements,
      }).toEqual({
        contract: 'forward and reverse request-grid focus containment',
        clippedFocusMeasurements: [],
      });
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);
