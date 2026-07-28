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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function findBrowserExecutable() {
  const programFiles = process.env.PROGRAMFILES;
  const programFilesX86 = process.env['PROGRAMFILES(X86)'];
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.EDGE_BIN,
    process.env.CHROME_BIN,
    programFiles && path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 &&
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
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
    const panelTarget = targets.find(
      (target) => target.type === 'page' && target.url.endsWith('/panel.html'),
    );
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

async function stopBrowser(browserProcess) {
  const hasExited = () =>
    !browserProcess || browserProcess.exitCode !== null || browserProcess.signalCode !== null;
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
      fs.rmSync(profileDirectory, { recursive: true, force: true });
    }
  },
  TEST_TIMEOUT_MS,
);
