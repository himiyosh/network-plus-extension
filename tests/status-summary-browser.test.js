const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { launchPanelPage } = require('./helpers/browser-harness');

const repositoryRoot = path.resolve(__dirname, '..');
const BROWSER_START_TIMEOUT_MS = 45000;
const PANEL_TARGET_TIMEOUT_MS = 15000;
const STARTUP_POLL_INITIAL_DELAY_MS = 50;
const STARTUP_POLL_MAX_DELAY_MS = 1000;
const CDP_COMMAND_TIMEOUT_MS = 10000;
const TEST_TIMEOUT_MS = 90000;
const BROWSER_REQUIRED_IN_CI_MESSAGE =
  'Real-browser regression tests require an executable Chrome or Edge in CI. ' +
  'Set EDGE_BIN or CHROME_BIN to an executable browser path.';
const TRANSIENT_PROFILE_CLEANUP_ERRORS = new Set(['ENOTEMPTY', 'EBUSY']);
const TOOLBAR_VIEWPORT_WIDTHS = [375, 500, 800, 1254, 1255, 1280, 1500];
const TOOLBAR_FOCUS_VIEWPORT_WIDTHS = [375, 500, 800, 1280];
const GRID_FOCUS_VIEWPORT_WIDTHS = [375, 500, 800, 1280];
const STATUS_WORKSPACE_VIEWPORT_WIDTHS = [320, 375, 414, 768, 1280];
const SEPARATOR_FOCUS_VIEWPORT_WIDTHS = [320, 375, 414, 768, 800, 801, 1280];
const SEPARATOR_FOCUS_THEMES = [
  { name: 'system', dataTheme: null, mediaColorScheme: 'dark' },
  { name: 'dark', dataTheme: 'dark', mediaColorScheme: 'light' },
  { name: 'light', dataTheme: 'light', mediaColorScheme: 'dark' },
];
const SAFETY_STATUS_MESSAGE = 'Clipboard copy failed during sanitization. No data was copied.';
const REVERSE_TOOLBAR_FOCUS_CONTRACT = 'reverse-direction toolbar focus containment';
const SYNCHRONOUS_TOOLBAR_FOCUS_SCROLL_CONTRACT =
  'synchronous toolbar keyboard focus-scroll timing';
const GRID_FOCUS_ALLOWANCE_CONTRACT = 'painted request-grid focus allowance';
const CSS_PIXEL_TOLERANCE = 0.01;

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
    // Managed remote sandboxes ship Chromium here; probing it kills the
    // "green locally because the suite silently skipped" failure mode.
    '/opt/pw-browsers/chromium',
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
  const startedAt = Date.now();
  const deadline = startedAt + BROWSER_START_TIMEOUT_MS;
  let pollDelay = STARTUP_POLL_INITIAL_DELAY_MS;
  let lastObservation = 'DevToolsActivePort was never observed';
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
      lastObservation = 'DevToolsActivePort existed with incomplete content';
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      lastObservation = 'DevToolsActivePort was not created yet';
    }
    await delay(pollDelay);
    pollDelay = Math.min(pollDelay * 2, STARTUP_POLL_MAX_DELAY_MS);
  }
  throw new Error(
    'Timed out waiting for the browser DevTools endpoint after ' +
      (Date.now() - startedAt) +
      'ms (limit ' +
      BROWSER_START_TIMEOUT_MS +
      'ms); last observed: ' +
      lastObservation +
      '.',
  );
}

async function findPanelTarget(browserWebSocketUrl) {
  const browserUrl = new URL(browserWebSocketUrl);
  const targetListUrl = `http://${browserUrl.host}/json/list`;
  const startedAt = Date.now();
  const deadline = startedAt + PANEL_TARGET_TIMEOUT_MS;
  let pollDelay = STARTUP_POLL_INITIAL_DELAY_MS;
  let lastObservation = 'the target list was never fetched';
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(targetListUrl).then((response) => response.json());
      const panelTarget = targets.find((target) => target.type === 'page' && target.url.endsWith('/panel.html'));
      if (panelTarget) return panelTarget;
      lastObservation = 'the target list had ' + targets.length + ' targets without the panel page';
    } catch (error) {
      lastObservation = 'the target list fetch failed: ' + error.message;
    }
    await delay(pollDelay);
    pollDelay = Math.min(pollDelay * 2, STARTUP_POLL_MAX_DELAY_MS);
  }
  throw new Error(
    'Network+ panel target was not available after ' +
      (Date.now() - startedAt) +
      'ms (limit ' +
      PANEL_TARGET_TIMEOUT_MS +
      'ms); last observed: ' +
      lastObservation +
      '.',
  );
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
  const text = key === ' ' ? { text: ' ', unmodifiedText: ' ' } : {};
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    ...text,
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

async function waitForStatusDetailsState(cdp, expected, diagnostic) {
  const deadline = Date.now() + 3000;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(
      cdp,
      `(() => {
        const toggle = document.querySelector('#statusDetailsToggle');
        const details = document.querySelector('#statusDetails');
        return {
          activeElementId: document.activeElement?.id || '',
          detailsHidden: details?.hidden ?? null,
          expanded: toggle?.getAttribute('aria-expanded') || null,
          toggleHidden: toggle?.hidden ?? null,
        };
      })()`,
    );
    if (Object.entries(expected).every(([key, value]) => lastState[key] === value)) {
      return lastState;
    }
    await delay(50);
  }
  throw new Error(
    diagnostic +
      ': status disclosure did not reach ' +
      JSON.stringify(expected) +
      '; last observed ' +
      JSON.stringify(lastState),
  );
}

async function waitForSampleCaptureAction(cdp) {
  const deadline = Date.now() + 5000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const available = await evaluate(
        cdp,
        `Array.from(document.querySelectorAll('button')).some(
          (button) => button.textContent.trim() === 'Explore sample capture',
        )`,
      );
      if (available) return;
      lastError = null;
    } catch (error) {
      if (!error.message.includes('Execution context was destroyed')) throw error;
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(
    'Sample capture action was not ready within 5000ms' +
      (lastError ? '; last transient error: ' + lastError.message : '.'),
  );
}

async function waitForLiveNetworkListener(cdp, expectedUrl) {
  const deadline = Date.now() + 5000;
  let lastState = null;
  while (Date.now() < deadline) {
    try {
      lastState = await evaluate(
        cdp,
        `({
          listenerType: typeof window.__networkPlusLiveListener,
          readyState: document.readyState,
          status: document.querySelector('#status')?.textContent || '',
          url: location.href,
        })`,
      );
      if (
        lastState.listenerType === 'function' &&
        (!expectedUrl || lastState.url === expectedUrl)
      ) {
        return;
      }
    } catch (error) {
      if (!error.message.includes('Execution context was destroyed')) throw error;
    }
    await delay(50);
  }
  throw new Error(
    'Live network listener was not registered within 5000ms; last observed ' +
      JSON.stringify(lastState),
  );
}

function assertToolbarFocusContainment(trace, contractName) {
  const violation = trace.find((entry) => !entry.fullyVisibleWithOutline);
  if (!violation) return;
  throw new Error(
    contractName +
      ': ' +
      violation.id +
      ' at ' +
      violation.width +
      'px is clipped on the ' +
      violation.clippedSide +
      ' side (' +
      violation.visibleWidth +
      '/' +
      violation.actionWidth +
      'px visible).',
  );
}

function assertSynchronousToolbarFocusScroll(trace) {
  const violation = trace.find((entry) => entry.scrollIntoViewCallsDuringFocusin !== 1);
  if (!violation) return;
  throw new Error(
    SYNCHRONOUS_TOOLBAR_FOCUS_SCROLL_CONTRACT +
      ': ' +
      violation.actionId +
      ' at ' +
      violation.width +
      'px observed ' +
      violation.scrollIntoViewCallsDuringFocusin +
      ' toolbar scrollIntoView calls before focusin completed; expected exactly 1.',
  );
}

function assertGridFocusAllowancePolicy(trace) {
  const underAllocated = trace.find(
    (entry) =>
      !entry.fullyVisibleWithPaintedIndicator ||
      entry.edgeClearance + CSS_PIXEL_TOLERANCE < entry.paintedExternalFootprint,
  );
  if (underAllocated) {
    throw new Error(
      GRID_FOCUS_ALLOWANCE_CONTRACT +
        ': ' +
        underAllocated.key +
        ' at ' +
        underAllocated.width +
        'px during ' +
        underAllocated.direction +
        ' traversal keeps ' +
        underAllocated.edgeClearance +
        'px at the constrained edge, smaller than the ' +
        underAllocated.paintedExternalFootprint +
        'px painted external footprint.',
    );
  }

  const overReserved = trace.find(
    (entry) =>
      entry.reservedInlineAllowance - entry.paintedExternalFootprint > CSS_PIXEL_TOLERANCE,
  );
  if (overReserved) {
    throw new Error(
      GRID_FOCUS_ALLOWANCE_CONTRACT +
        ': #tableWrap reserves ' +
        overReserved.reservedInlineAllowance +
        'px for ' +
        overReserved.key +
        ' at ' +
        overReserved.width +
        'px, exceeding its ' +
        overReserved.paintedExternalFootprint +
        'px painted external footprint.',
    );
  }

  const overScrolled = trace.find(
    (entry) =>
      Math.abs(entry.actualScrollDelta) - Math.abs(entry.minimumScrollDelta) > CSS_PIXEL_TOLERANCE,
  );
  if (overScrolled) {
    throw new Error(
      GRID_FOCUS_ALLOWANCE_CONTRACT +
        ': ' +
        overScrolled.key +
        ' at ' +
        overScrolled.width +
        'px during ' +
        overScrolled.direction +
        ' traversal scrolled ' +
        overScrolled.actualScrollDelta +
        'px; the painted footprint required only ' +
        overScrolled.minimumScrollDelta +
        'px.',
    );
  }
}

function completeGridFocusTransition(end) {
  const actualScrollDelta = end.focusScrollWrites.reduce(
    (total, write) => total + write.actualScrollDelta,
    0,
  );
  const minimumScrollDelta = end.focusScrollWrites.reduce(
    (total, write) => total + write.minimumScrollDelta,
    0,
  );
  const edgeClearance =
    minimumScrollDelta < 0 || (minimumScrollDelta === 0 && actualScrollDelta < 0)
      ? end.leftEdgeClearance
      : end.rightEdgeClearance;
  return {
    ...end,
    actualScrollDelta,
    edgeClearance,
    minimumScrollDelta,
  };
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

function createInstrumentedPanelFixture() {
  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-retention-fixture-'));
  const vendorDirectory = path.join(fixtureDirectory, 'vendor');
  fs.mkdirSync(vendorDirectory);
  fs.copyFileSync(path.join(repositoryRoot, 'panel.html'), path.join(fixtureDirectory, 'panel.html'));
  fs.copyFileSync(path.join(repositoryRoot, 'panel.css'), path.join(fixtureDirectory, 'panel.css'));
  fs.copyFileSync(path.join(repositoryRoot, 'vendor', 'fflate.js'), path.join(vendorDirectory, 'fflate.js'));

  const panelSource = fs.readFileSync(path.join(repositoryRoot, 'panel.js'), 'utf8');
  const stateExposureMarker = "  document.addEventListener('DOMContentLoaded', init);";
  const mutationCountMarker =
    "    if (queuedRows.length === 0) return [];\n    const liveRows = addRowsWithRetention(queuedRows, 'live');";
  if (!panelSource.includes(stateExposureMarker) || !panelSource.includes(mutationCountMarker)) {
    throw new Error('Instrumented retention fixture could not expose panel state.');
  }
  const instrumentedPanelSource = panelSource
    .replace(
      mutationCountMarker,
      "    if (queuedRows.length === 0) return [];\n" +
        '    globalThis.__networkPlusLiveMutationCount =\n' +
        '      (globalThis.__networkPlusLiveMutationCount || 0) + 1;\n' +
        "    const liveRows = addRowsWithRetention(queuedRows, 'live');",
    )
    .replace(
      stateExposureMarker,
      '  globalThis.__networkPlusState = state;\n\n' + stateExposureMarker,
    );
  fs.writeFileSync(
    path.join(fixtureDirectory, 'panel.js'),
    instrumentedPanelSource,
  );
  return fixtureDirectory;
}

async function installControllableLiveScheduler(cdp) {
  await evaluate(
    cdp,
    `(() => {
      let now = 0;
      let nextFrameId = 1;
      let nextTimerId = 1;
      const frames = new Map();
      const timers = new Map();
      const timerArms = new Map();
      const timerCancels = new Map();
      const normalizeDelay = (delay) => {
        const value = Number(delay);
        return Number.isFinite(value) && value > 0 ? value : 0;
      };
      const increment = (counts, delay) => {
        counts.set(delay, (counts.get(delay) || 0) + 1);
      };
      globalThis.requestAnimationFrame = (callback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        frames.set(id, callback);
        return id;
      };
      globalThis.cancelAnimationFrame = (id) => {
        frames.delete(id);
      };
      globalThis.setTimeout = (callback, delay, ...args) => {
        const id = nextTimerId;
        nextTimerId += 1;
        const normalizedDelay = normalizeDelay(delay);
        timers.set(id, {
          args,
          callback,
          delay: normalizedDelay,
          due: now + normalizedDelay,
        });
        increment(timerArms, normalizedDelay);
        return id;
      };
      globalThis.clearTimeout = (id) => {
        const timer = timers.get(id);
        if (!timer) return;
        timers.delete(id);
        increment(timerCancels, timer.delay);
      };
      globalThis.__networkPlusSchedulerSnapshot = () => ({
        frameCount: frames.size,
        timerArmCounts: Object.fromEntries(timerArms),
        timerCancelCounts: Object.fromEntries(timerCancels),
        timerDelays: Array.from(timers.values(), (timer) => timer.delay),
      });
      globalThis.__networkPlusAdvanceTime = async (milliseconds) => {
        now += normalizeDelay(milliseconds);
        while (true) {
          const dueTimers = Array.from(timers.entries())
            .filter((entry) => entry[1].due <= now)
            .sort((left, right) => left[1].due - right[1].due || left[0] - right[0]);
          if (dueTimers.length === 0) break;
          for (const [id, timer] of dueTimers) {
            if (!timers.delete(id)) continue;
            timer.callback(...timer.args);
            await Promise.resolve();
          }
        }
        return globalThis.__networkPlusSchedulerSnapshot();
      };
      globalThis.__networkPlusRunNextFrame = async () => {
        const nextFrame = frames.entries().next().value;
        if (!nextFrame) return false;
        const [id, callback] = nextFrame;
        frames.delete(id);
        callback(now);
        await Promise.resolve();
        return true;
      };
    })()`,
  );
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

test('grid focus allowance reports an under-allocation separately from clipping', () => {
  const measurement = {
    key: 'header:size',
    width: 375,
    direction: 'forward',
    fullyVisibleWithPaintedIndicator: false,
    edgeClearance: 0,
    paintedExternalFootprint: 1,
    reservedInlineAllowance: 0,
    actualScrollDelta: 10,
    minimumScrollDelta: 11,
  };

  expect(() => assertGridFocusAllowancePolicy([measurement])).toThrow(
    new Error(
      'painted request-grid focus allowance: header:size at 375px during forward traversal keeps 0px at the constrained edge, smaller than the 1px painted external footprint.',
    ),
  );
});

test('grid focus allowance reports unexplained reserve and scroll beyond the painted footprint', () => {
  const measurement = {
    key: 'separator:size',
    width: 375,
    direction: 'reverse',
    fullyVisibleWithPaintedIndicator: true,
    edgeClearance: 2,
    paintedExternalFootprint: 0,
    reservedInlineAllowance: 2,
    actualScrollDelta: -12,
    minimumScrollDelta: -10,
  };

  expect(() => assertGridFocusAllowancePolicy([measurement])).toThrow(
    new Error(
      'painted request-grid focus allowance: #tableWrap reserves 2px for separator:size at 375px, exceeding its 0px painted external footprint.',
    ),
  );
  expect(() =>
    assertGridFocusAllowancePolicy([{ ...measurement, reservedInlineAllowance: 0 }]),
  ).toThrow(
    new Error(
      'painted request-grid focus allowance: separator:size at 375px during reverse traversal scrolled -12px; the painted footprint required only -10px.',
    ),
  );
});

browserTest(
  'same-frame live bursts batch retention cleanup and prefetch only retained rows',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-live-retention-'));
    const fixtureDirectory = createInstrumentedPanelFixture();
    const panelUrl = pathToFileURL(path.join(repositoryRoot, 'panel.html')).href;
    const instrumentedPanelUrl = pathToFileURL(path.join(fixtureDirectory, 'panel.html')).href;
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
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const chromeApi = globalThis.chrome || {};
          chromeApi.storage = {
            local: {
              get(_keys, callback) {
                callback({});
              },
              set(_value, callback) {
                if (callback) callback();
              },
            },
          };
          chromeApi.runtime = {
            lastError: null,
            getManifest() {
              return { version: '1.6.0' };
            },
          };
          chromeApi.devtools = {
            network: {
              onRequestFinished: {
                addListener(listener) {
                  globalThis.__networkPlusLiveListener = listener;
                },
              },
            },
            panels: {
              openResource() {},
            },
          };
          globalThis.chrome = chromeApi;
          globalThis.__networkPlusPrefetchStarted = [];
        })();`,
      });
      await cdp.send('Page.reload', { ignoreCache: true });
      await waitForLiveNetworkListener(cdp);

      const boundaryResult = await evaluate(
        cdp,
        `(async () => {
          const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
          const settleFrames = async () => {
            await nextFrame();
            await nextFrame();
          };
          const makeRequest = (sourceId) => ({
            startedDateTime: new Date(1704067200000 + sourceId).toISOString(),
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.test/boundary/' + sourceId,
              headers: [],
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/2',
              headers: [],
              bodySize: 42,
              content: { size: 42, mimeType: 'text/plain' },
            },
            timings: { wait: 10 },
            getContent(callback) {
              callback('', '');
            },
          });
          const emitRange = (start, count) => {
            for (let offset = 0; offset < count; offset += 1) {
              window.__networkPlusLiveListener(makeRequest(start + offset));
            }
          };
          const captureGrid = () => {
            const tbody = document.querySelector('#tbody');
            const renderedRows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
            return {
              rowCount: renderedRows.length,
              rowIds: renderedRows.map((row) => Number(row.dataset.rowId)),
              counter: document.querySelector('#counter').textContent,
              totalSize: document.querySelector('#totalSize').textContent,
              statsText: document.querySelector('#statsSummary').textContent.replace(/\\s+/g, ' ').trim(),
              tabStopIds: Array.from(tbody.querySelectorAll('tr[tabindex="0"]')).map(
                (row) => row.dataset.rowId,
              ),
            };
          };

          emitRange(1, 1);
          document.querySelector('#exportHarBtn').click();
          document.querySelector('#dataSafetyCancelBtn').click();
          await settleFrames();
          const exportBoundary = captureGrid();

          emitRange(2, 1);
          document.querySelector('#settingsBtn').click();
          document.querySelector('#retentionUnlimited').checked = false;
          document.querySelector('#retentionLimit').value = '99';
          document.querySelector('#retentionSaveBtn').click();
          await settleFrames();
          const invalidRetentionBoundary = captureGrid();
          document.querySelector('#settingsCloseBtn').click();

          document.querySelector('#settingsBtn').click();
          // Retention is unlimited out of the box, and the rejected 99 restored
          // that default, so this scenario has to opt back into a bound.
          document.querySelector('#retentionUnlimited').checked = false;
          document.querySelector('#retentionLimit').value = '100';
          document.querySelector('#retentionSaveBtn').click();
          await settleFrames();
          emitRange(3, 98);
          await settleFrames();
          document.querySelector('#clearBtn').click();
          const undoButton = document.querySelector('#undoClearBtn');
          const undoWasAvailable = !undoButton.hidden && !undoButton.disabled;
          emitRange(101, 100);
          undoButton.click();
          await settleFrames();

          return {
            exportBoundary,
            invalidRetentionBoundary,
            undoBoundary: {
              ...captureGrid(),
              undoWasAvailable,
            },
          };
        })()`,
        true,
      );
      await evaluate(cdp, 'localStorage.clear()');
      const visiblePanelUrl = panelUrl + '?scenario=visible-burst';
      await cdp.send('Page.navigate', { url: visiblePanelUrl });
      await waitForLiveNetworkListener(cdp, visiblePanelUrl);

      const result = await evaluate(
        cdp,
        `(async () => {
          const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
          const settleFrames = async () => {
            await nextFrame();
            await nextFrame();
          };
          const makeRequest = (sourceId) => ({
            startedDateTime: new Date(1704067200000 + sourceId).toISOString(),
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.test/live/' + sourceId,
              headers: [],
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/2',
              headers: [],
              bodySize: 0,
              content: { size: 0, mimeType: 'text/plain' },
            },
            timings: { wait: 10 },
            getContent(callback) {
              window.__networkPlusPrefetchStarted.push(sourceId);
              callback('', '');
            },
          });
          const emitRange = (start, count) => {
            for (let offset = 0; offset < count; offset += 1) {
              window.__networkPlusLiveListener(makeRequest(start + offset));
            }
          };

          // Pin the eviction boundary for this scenario instead of inheriting
          // DEFAULT_REQUEST_RETENTION_LIMIT, so the burst numbers below keep
          // exercising eviction when the shipped default changes.
          document.querySelector('#settingsBtn').click();
          document.querySelector('#retentionUnlimited').checked = false;
          document.querySelector('#retentionLimit').value = '5000';
          document.querySelector('#retentionSaveBtn').click();

          emitRange(1, 5000);
          await settleFrames();
          if (window.__networkPlusPrefetchStarted.length !== 5000) {
            throw new Error(
              'Initial prefetch did not settle: ' + window.__networkPlusPrefetchStarted.length + '/5000',
            );
          }

          const tbody = document.querySelector('#tbody');
          const tableWrap = document.querySelector('#tableWrap');
          tbody.querySelector('tr[data-row-id="2500"]').click();
          const focusRow = tbody.querySelector('tr[data-row-id="2500"]');
          focusRow.focus({ preventScroll: true });
          tableWrap.scrollTop = Math.floor(tableWrap.scrollHeight / 2);
          tableWrap.dispatchEvent(new Event('scroll'));
          const scrollTopBefore = tableWrap.scrollTop;
          window.__networkPlusFocusedRow = focusRow;
          window.__networkPlusPrefetchStarted = [];

          let cleanupQueries = 0;
          let mutationBatches = 0;
          const originalQuerySelectorAll = Element.prototype.querySelectorAll;
          Element.prototype.querySelectorAll = function (selector) {
            if (
              this === tbody &&
              selector === 'tr[data-row-id]' &&
              new Error().stack.includes('cleanupEvictedRowReferences')
            ) {
              cleanupQueries += 1;
            }
            return originalQuerySelectorAll.call(this, selector);
          };
          const observer = new MutationObserver((records) => {
            if (records.some((record) => record.type === 'childList')) mutationBatches += 1;
          });
          observer.observe(tbody, { childList: true });

          emitRange(5001, 100);
          await settleFrames();
          observer.disconnect();
          Element.prototype.querySelectorAll = originalQuerySelectorAll;

          const renderedRows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
          const renderedIds = renderedRows.map((row) => Number(row.dataset.rowId));
          const firstBurst = {
            cleanupQueries,
            mutationBatches,
            rowCount: renderedRows.length,
            uniqueRowCount: new Set(renderedIds).size,
            firstRowId: renderedIds[0],
            lastRowId: renderedIds.at(-1),
            sameFocusedNode: tbody.querySelector('tr[data-row-id="2500"]') === window.__networkPlusFocusedRow,
            selectedRowId: tbody.querySelector('tr.selected')?.dataset.rowId || null,
            focusedRowId: document.activeElement?.closest?.('tr[data-row-id]')?.dataset.rowId || null,
            autoScrollPressed: document.querySelector('#autoScrollBtn')?.getAttribute('aria-pressed'),
            stayedAwayFromBottom:
              tableWrap.scrollTop + tableWrap.clientHeight < tableWrap.scrollHeight - 2,
            scrollTopBefore,
            scrollTopAfter: tableWrap.scrollTop,
            documentHasHorizontalOverflow:
              document.documentElement.scrollWidth > document.documentElement.clientWidth,
            documentHasVerticalOverflow:
              document.documentElement.scrollHeight > document.documentElement.clientHeight,
            prefetchedSourceIds: window.__networkPlusPrefetchStarted.slice(),
          };

          document.querySelector('#settingsBtn').click();
          document.querySelector('#retentionUnlimited').checked = false;
          document.querySelector('#retentionLimit').value = '100';
          document.querySelector('#retentionSaveBtn').click();
          await settleFrames();
          document.querySelector('#clearBtn').click();
          window.__networkPlusPrefetchStarted = [];
          emitRange(10001, 200);
          await settleFrames();

          const boundedRows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
          return {
            firstBurst,
            transientBurst: {
              rowCount: boundedRows.length,
              firstRowId: Number(boundedRows[0]?.dataset.rowId),
              lastRowId: Number(boundedRows.at(-1)?.dataset.rowId),
              prefetchedSourceIds: window.__networkPlusPrefetchStarted.slice(),
            },
          };
        })()`,
        true,
      );

      await evaluate(cdp, 'localStorage.clear()');
      const highWaterPanelUrl = instrumentedPanelUrl + '?scenario=high-water';
      await cdp.send('Page.navigate', { url: highWaterPanelUrl });
      await waitForLiveNetworkListener(cdp, highWaterPanelUrl);
      await installControllableLiveScheduler(cdp);

      const highWaterResult = await evaluate(
        cdp,
        `(async () => {
          const state = window.__networkPlusState;
          const tbody = document.querySelector('#tbody');
          const makeRequest = (sourceId) => ({
            startedDateTime: new Date(1704067200000 + sourceId).toISOString(),
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.test/high-water/' + sourceId,
              headers: [],
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/2',
              headers: [],
              bodySize: 0,
              content: { size: 0, mimeType: 'text/plain' },
            },
            timings: { wait: 10 },
            getContent(callback) {
              window.__networkPlusPrefetchStarted.push(sourceId);
              callback('', '');
            },
          });
          const fallbackTimerCount = () =>
            window
              .__networkPlusSchedulerSnapshot()
              .timerDelays.filter((delay) => delay === 250).length;
          const emitRange = (start, count) => {
            let maxAwaitingCount = 0;
            let maxPendingCount = 0;
            for (let offset = 0; offset < count; offset += 1) {
              window.__networkPlusLiveListener(makeRequest(start + offset));
              maxAwaitingCount = Math.max(
                maxAwaitingCount,
                state.liveRowsAwaitingRender.length,
              );
              maxPendingCount = Math.max(maxPendingCount, state.pendingLiveRows.length);
            }
            return { maxAwaitingCount, maxPendingCount };
          };
          let cleanupQueries = 0;
          const originalQuerySelectorAll = Element.prototype.querySelectorAll;
          Element.prototype.querySelectorAll = function (selector) {
            if (
              this === tbody &&
              selector === 'tr[data-row-id]' &&
              new Error().stack.includes('cleanupEvictedRowReferences')
            ) {
              cleanupQueries += 1;
            }
            return originalQuerySelectorAll.call(this, selector);
          };

          // Pin the bounded limit for this scenario instead of inheriting
          // DEFAULT_REQUEST_RETENTION_LIMIT, so the 20,000-row high-water burst
          // keeps crossing the eviction boundary when the shipped default moves.
          state.retention.requestLimit = 5000;
          state.retention.unlimited = false;

          const limitedHighWater = emitRange(1, 20000);
          const limitedScheduler = window.__networkPlusSchedulerSnapshot();
          const beforeFrame = {
            awaitingCount: state.liveRowsAwaitingRender.length,
            awaitingMatchesRows: state.liveRowsAwaitingRender.every(
              (row, index) => row === state.rows[index],
            ),
            cleanupQueries,
            evictedRequests: state.retention.evictedRequests,
            fallbackArms: limitedScheduler.timerArmCounts['250'] || 0,
            fallbackCancels: limitedScheduler.timerCancelCounts['250'] || 0,
            fallbackTimerCount: fallbackTimerCount(),
            firstRetainedId: state.rows[0]?.id || null,
            frameCount: limitedScheduler.frameCount,
            lastRetainedId: state.rows.at(-1)?.id || null,
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            maxAwaitingCount: limitedHighWater.maxAwaitingCount,
            maxPendingCount: limitedHighWater.maxPendingCount,
            pendingCount: state.pendingLiveRows.length,
            retainedCount: state.rows.length,
            renderedCount: tbody.querySelectorAll('tr[data-row-id]').length,
          };

          const frameRan = await window.__networkPlusRunNextFrame();
          await Promise.resolve();
          await Promise.resolve();
          const renderedRows = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
          const afterFrame = {
            awaitingCount: state.liveRowsAwaitingRender.length,
            firstRenderedId: Number(renderedRows[0]?.dataset.rowId),
            frameRan,
            lastRenderedId: Number(renderedRows.at(-1)?.dataset.rowId),
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            pendingCount: state.pendingLiveRows.length,
            renderedCount: renderedRows.length,
            retainedCount: state.rows.length,
          };

          state.retention.unlimited = true;
          const unlimitedHighWater = emitRange(20001, 10000);
          const unlimitedScheduler = window.__networkPlusSchedulerSnapshot();
          const unlimited = {
            awaitingCount: state.liveRowsAwaitingRender.length,
            awaitingMatchesRows: state.liveRowsAwaitingRender.every(
              (row, index) => row === state.rows[index + 5000],
            ),
            evictedRequests: state.retention.evictedRequests,
            fallbackArms: unlimitedScheduler.timerArmCounts['250'] || 0,
            fallbackCancels: unlimitedScheduler.timerCancelCounts['250'] || 0,
            fallbackTimerCount: fallbackTimerCount(),
            firstRetainedId: state.rows[0]?.id || null,
            frameCount: unlimitedScheduler.frameCount,
            lastRetainedId: state.rows.at(-1)?.id || null,
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            maxAwaitingCount: unlimitedHighWater.maxAwaitingCount,
            maxPendingCount: unlimitedHighWater.maxPendingCount,
            pendingCount: state.pendingLiveRows.length,
            retainedCount: state.rows.length,
          };
          Element.prototype.querySelectorAll = originalQuerySelectorAll;
          return { afterFrame, beforeFrame, unlimited };
        })()`,
        true,
      );

      await evaluate(cdp, 'localStorage.clear()');
      const maxWaitPanelUrl = instrumentedPanelUrl + '?scenario=max-wait';
      await cdp.send('Page.navigate', { url: maxWaitPanelUrl });
      await waitForLiveNetworkListener(cdp, maxWaitPanelUrl);
      await installControllableLiveScheduler(cdp);

      const suspendedFrameResult = await evaluate(
        cdp,
        `(async () => {
          const state = window.__networkPlusState;
          const makeRequest = (sourceId) => ({
            startedDateTime: new Date(1704067200000 + sourceId).toISOString(),
            time: 10,
            request: {
              method: 'GET',
              url: 'https://example.test/suspended/' + sourceId,
              headers: [],
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/2',
              headers: [],
              bodySize: 0,
              content: { size: 0, mimeType: 'text/plain' },
            },
            timings: { wait: 10 },
            getContent(callback) {
              window.__networkPlusPrefetchStarted.push(sourceId);
              callback('', '');
            },
          });
          const emitRange = (start, count) => {
            for (let offset = 0; offset < count; offset += 1) {
              window.__networkPlusLiveListener(makeRequest(start + offset));
            }
          };
          const fallbackTimerCount = () =>
            window
              .__networkPlusSchedulerSnapshot()
              .timerDelays.filter((delay) => delay === 250).length;
          const waitForPrefetch = async () => {
            await state.automaticResponsePrefetchScheduler.whenIdle();
            await Promise.resolve();
          };
          const captureBoundedState = () => ({
            awaitingIds: state.liveRowsAwaitingRender.map((row) => row.id),
            awaitingMatchesRows: state.liveRowsAwaitingRender.every(
              (row, index) => row === state.rows[index],
            ),
            pendingCount: state.pendingLiveRows.length,
            rowIds: state.rows.map((row) => row.id),
          });

          document.querySelector('#settingsBtn').click();
          document.querySelector('#retentionUnlimited').checked = false;
          document.querySelector('#retentionLimit').value = '100';
          document.querySelector('#retentionSaveBtn').click();

          emitRange(1, 150);
          const firstPendingRows = state.pendingLiveRows.slice();
          const beforeFallback = {
            awaitingCount: state.liveRowsAwaitingRender.length,
            fallbackTimerCount: fallbackTimerCount(),
            frameCount: window.__networkPlusSchedulerSnapshot().frameCount,
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            pendingCount: state.pendingLiveRows.length,
            rowCount: state.rows.length,
          };
          let firstCleanupQueries = 0;
          const tbody = document.querySelector('#tbody');
          const originalQuerySelectorAll = Element.prototype.querySelectorAll;
          Element.prototype.querySelectorAll = function (selector) {
            if (
              this === tbody &&
              selector === 'tr[data-row-id]' &&
              new Error().stack.includes('cleanupEvictedRowReferences')
            ) {
              firstCleanupQueries += 1;
            }
            return originalQuerySelectorAll.call(this, selector);
          };
          await window.__networkPlusAdvanceTime(250);
          await waitForPrefetch();
          Element.prototype.querySelectorAll = originalQuerySelectorAll;
          const firstFallback = {
            ...captureBoundedState(),
            cleanupQueries: firstCleanupQueries,
            disposedTransientRows: firstPendingRows
              .slice(0, 50)
              .every((row) => row._retentionDisposed === true && row._reqObj === null),
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            prefetchedSourceIds: window.__networkPlusPrefetchStarted.slice(),
            retainedIncomingIdentity: state.rows.every(
              (row, index) => row === firstPendingRows[index + 50],
            ),
          };

          window.__networkPlusPrefetchStarted = [];
          emitRange(151, 80);
          await window.__networkPlusAdvanceTime(250);
          await waitForPrefetch();
          const secondFallback = {
            ...captureBoundedState(),
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            prefetchedSourceIds: window.__networkPlusPrefetchStarted.slice(),
          };

          window.__networkPlusPrefetchStarted = [];
          emitRange(231, 160);
          const thirdPendingRows = state.pendingLiveRows.slice();
          await window.__networkPlusAdvanceTime(250);
          await waitForPrefetch();
          const thirdFallback = {
            ...captureBoundedState(),
            disposedTransientRows: thirdPendingRows
              .slice(0, 60)
              .every((row) => row._retentionDisposed === true && row._reqObj === null),
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            prefetchedSourceIds: window.__networkPlusPrefetchStarted.slice(),
            retainedIncomingIdentity: state.rows.every(
              (row, index) => row === thirdPendingRows[index + 60],
            ),
          };

          window.__networkPlusPrefetchStarted = [];
          let finalCleanupQueries = 0;
          let mutationBatches = 0;
          Element.prototype.querySelectorAll = function (selector) {
            if (
              this === tbody &&
              selector === 'tr[data-row-id]' &&
              new Error().stack.includes('cleanupEvictedRowReferences')
            ) {
              finalCleanupQueries += 1;
            }
            return originalQuerySelectorAll.call(this, selector);
          };
          const observer = new MutationObserver((records) => {
            if (records.some((record) => record.type === 'childList')) mutationBatches += 1;
          });
          observer.observe(tbody, { childList: true });
          emitRange(391, 30);
          const beforeDelayedFrame = {
            fallbackTimerCount: fallbackTimerCount(),
            frameCount: window.__networkPlusSchedulerSnapshot().frameCount,
            pendingCount: state.pendingLiveRows.length,
          };
          const frameRan = await window.__networkPlusRunNextFrame();
          await waitForPrefetch();
          await Promise.resolve();
          await Promise.resolve();
          observer.disconnect();
          Element.prototype.querySelectorAll = originalQuerySelectorAll;
          const renderedIds = Array.from(
            tbody.querySelectorAll('tr[data-row-id]'),
            (row) => Number(row.dataset.rowId),
          );
          const afterDelayedFrame = {
            ...captureBoundedState(),
            cleanupQueries: finalCleanupQueries,
            fallbackTimerCount: fallbackTimerCount(),
            frameCount: window.__networkPlusSchedulerSnapshot().frameCount,
            frameRan,
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            mutationBatches,
            prefetchedSourceIds: window.__networkPlusPrefetchStarted.slice(),
            renderedIds,
            documentHasHorizontalOverflow:
              document.documentElement.scrollWidth > document.documentElement.clientWidth,
            documentHasVerticalOverflow:
              document.documentElement.scrollHeight > document.documentElement.clientHeight,
          };
          const prefetchCountBeforeCanceledFallback =
            window.__networkPlusPrefetchStarted.length;
          await window.__networkPlusAdvanceTime(250);
          await waitForPrefetch();
          const afterCanceledFallback = {
            awaitingCount: state.liveRowsAwaitingRender.length,
            liveMutationCount: window.__networkPlusLiveMutationCount || 0,
            pendingCount: state.pendingLiveRows.length,
            prefetchCount: window.__networkPlusPrefetchStarted.length,
            prefetchCountBeforeCanceledFallback,
            renderedIds: Array.from(
              tbody.querySelectorAll('tr[data-row-id]'),
              (row) => Number(row.dataset.rowId),
            ),
            rowIds: state.rows.map((row) => row.id),
          };

          return {
            afterCanceledFallback,
            afterDelayedFrame,
            beforeDelayedFrame,
            beforeFallback,
            firstFallback,
            secondFallback,
            thirdFallback,
          };
        })()`,
        true,
      );

      expect(boundaryResult.exportBoundary).toEqual(
        expect.objectContaining({
          rowCount: 1,
          rowIds: [1],
          counter: '1 requests',
          totalSize: '42 B',
          tabStopIds: ['1'],
        }),
      );
      expect(boundaryResult.exportBoundary.statsText).toContain('2xx');
      expect(boundaryResult.exportBoundary.statsText).toContain('1');
      expect(boundaryResult.invalidRetentionBoundary).toEqual(
        expect.objectContaining({
          rowCount: 2,
          rowIds: [1, 2],
          counter: '2 requests',
          totalSize: '84 B',
          tabStopIds: ['1'],
        }),
      );
      expect(boundaryResult.invalidRetentionBoundary.statsText).toContain('2xx');
      expect(boundaryResult.invalidRetentionBoundary.statsText).toContain('2');
      expect(boundaryResult.undoBoundary).toEqual(
        expect.objectContaining({
          rowCount: 100,
          rowIds: Array.from({ length: 100 }, (_, index) => 101 + index),
          counter: '100 requests',
          tabStopIds: ['101'],
          undoWasAvailable: true,
        }),
      );
      expect(boundaryResult.undoBoundary.statsText).toContain('2xx');
      expect(boundaryResult.undoBoundary.statsText).toContain('100');
      expect(result.firstBurst).toEqual(
        expect.objectContaining({
          cleanupQueries: 1,
          mutationBatches: 1,
          rowCount: 5000,
          uniqueRowCount: 5000,
          firstRowId: 101,
          lastRowId: 5100,
          sameFocusedNode: true,
          selectedRowId: '2500',
          focusedRowId: '2500',
          autoScrollPressed: 'false',
          stayedAwayFromBottom: true,
          documentHasHorizontalOverflow: false,
          documentHasVerticalOverflow: false,
          prefetchedSourceIds: Array.from({ length: 100 }, (_, index) => 5001 + index),
        }),
      );
      expect(result.firstBurst.scrollTopAfter).toBeGreaterThan(0);
      expect(result.transientBurst).toEqual({
        rowCount: 100,
        firstRowId: 5201,
        lastRowId: 5300,
        prefetchedSourceIds: Array.from({ length: 100 }, (_, index) => 10101 + index),
      });
      expect(highWaterResult.beforeFrame).toEqual({
        awaitingCount: 5000,
        awaitingMatchesRows: true,
        cleanupQueries: 3,
        evictedRequests: 15000,
        fallbackArms: 4,
        fallbackCancels: 4,
        fallbackTimerCount: 0,
        firstRetainedId: 15001,
        frameCount: 1,
        lastRetainedId: 20000,
        liveMutationCount: 4,
        maxAwaitingCount: 5000,
        maxPendingCount: 4999,
        pendingCount: 0,
        retainedCount: 5000,
        renderedCount: 0,
      });
      expect(highWaterResult.afterFrame).toEqual({
        awaitingCount: 0,
        firstRenderedId: 15001,
        frameRan: true,
        lastRenderedId: 20000,
        liveMutationCount: 4,
        pendingCount: 0,
        renderedCount: 5000,
        retainedCount: 5000,
      });
      expect(highWaterResult.unlimited).toEqual({
        awaitingCount: 10000,
        awaitingMatchesRows: true,
        evictedRequests: 15000,
        fallbackArms: 6,
        fallbackCancels: 6,
        fallbackTimerCount: 0,
        firstRetainedId: 15001,
        frameCount: 1,
        lastRetainedId: 30000,
        liveMutationCount: 6,
        maxAwaitingCount: 10000,
        maxPendingCount: 4999,
        pendingCount: 0,
        retainedCount: 15000,
      });
      expect(suspendedFrameResult.beforeFallback).toEqual({
        awaitingCount: 0,
        fallbackTimerCount: 1,
        frameCount: 1,
        liveMutationCount: 0,
        pendingCount: 150,
        rowCount: 0,
      });
      expect(suspendedFrameResult.firstFallback).toEqual({
        awaitingIds: Array.from({ length: 100 }, (_, index) => 51 + index),
        awaitingMatchesRows: true,
        cleanupQueries: 1,
        disposedTransientRows: true,
        liveMutationCount: 1,
        pendingCount: 0,
        prefetchedSourceIds: Array.from({ length: 100 }, (_, index) => 51 + index),
        retainedIncomingIdentity: true,
        rowIds: Array.from({ length: 100 }, (_, index) => 51 + index),
      });
      expect(suspendedFrameResult.secondFallback).toEqual({
        awaitingIds: Array.from({ length: 100 }, (_, index) => 131 + index),
        awaitingMatchesRows: true,
        liveMutationCount: 2,
        pendingCount: 0,
        prefetchedSourceIds: Array.from({ length: 80 }, (_, index) => 151 + index),
        rowIds: Array.from({ length: 100 }, (_, index) => 131 + index),
      });
      expect(suspendedFrameResult.thirdFallback).toEqual({
        awaitingIds: Array.from({ length: 100 }, (_, index) => 291 + index),
        awaitingMatchesRows: true,
        disposedTransientRows: true,
        liveMutationCount: 3,
        pendingCount: 0,
        prefetchedSourceIds: Array.from({ length: 100 }, (_, index) => 291 + index),
        retainedIncomingIdentity: true,
        rowIds: Array.from({ length: 100 }, (_, index) => 291 + index),
      });
      expect(suspendedFrameResult.beforeDelayedFrame).toEqual({
        fallbackTimerCount: 1,
        frameCount: 1,
        pendingCount: 30,
      });
      expect(suspendedFrameResult.afterDelayedFrame).toEqual({
        awaitingIds: [],
        awaitingMatchesRows: true,
        cleanupQueries: 1,
        documentHasHorizontalOverflow: false,
        documentHasVerticalOverflow: false,
        fallbackTimerCount: 0,
        frameCount: 0,
        frameRan: true,
        liveMutationCount: 4,
        mutationBatches: 1,
        pendingCount: 0,
        prefetchedSourceIds: Array.from({ length: 30 }, (_, index) => 391 + index),
        renderedIds: Array.from({ length: 100 }, (_, index) => 321 + index),
        rowIds: Array.from({ length: 100 }, (_, index) => 321 + index),
      });
      expect(suspendedFrameResult.afterCanceledFallback).toEqual({
        awaitingCount: 0,
        liveMutationCount: 4,
        pendingCount: 0,
        prefetchCount: 30,
        prefetchCountBeforeCanceledFallback: 30,
        renderedIds: Array.from({ length: 100 }, (_, index) => 321 + index),
        rowIds: Array.from({ length: 100 }, (_, index) => 321 + index),
      });
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
      removeProfileDirectory(fixtureDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'a binary response reaches the panes as a hex dump and a visible image, not mojibake',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-binary-body-'));
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
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const chromeApi = globalThis.chrome || {};
          chromeApi.storage = {
            local: {
              get(_keys, callback) {
                callback({});
              },
              set(_value, callback) {
                if (callback) callback();
              },
            },
          };
          chromeApi.runtime = {
            lastError: null,
            getManifest() {
              return { version: '1.6.0' };
            },
          };
          chromeApi.devtools = {
            network: {
              onRequestFinished: {
                addListener(listener) {
                  globalThis.__networkPlusLiveListener = listener;
                },
              },
            },
            panels: {
              openResource() {},
            },
          };
          globalThis.chrome = chromeApi;
        })();`,
      });
      await cdp.send('Page.reload', { ignoreCache: true });
      await waitForLiveNetworkListener(cdp);

      const observed = await evaluate(
        cdp,
        `(async () => {
          const settle = async () => {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await new Promise((resolve) => setTimeout(resolve, 150));
          };
          // The 1x1 transparent GIF a cookie-sync endpoint returns, and a JSON
          // body alongside it to prove text bodies keep their existing path.
          const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          const json = '{"ok":true}';
          const makeRequest = (sourceId, contentType, harMime, content, encoding) => ({
            startedDateTime: new Date(1704067200000 + sourceId).toISOString(),
            time: 12,
            request: { method: 'GET', url: 'https://binary.example.test/' + sourceId, headers: [] },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/2',
              headers: [{ name: 'content-type', value: contentType }],
              content: { size: 42, mimeType: harMime },
            },
            getContent(callback) {
              callback(content, encoding);
            },
          });
          const listener = globalThis.__networkPlusLiveListener;
          listener(makeRequest(1, 'image/gif', 'image/gif', gif, 'base64'));
          // A row whose recorded HAR type came back as x-unknown: before the
          // fix this fell through to "(no preview available)".
          listener(makeRequest(2, 'image/gif', 'x-unknown', gif, 'base64'));
          listener(makeRequest(3, 'application/json', 'application/json', json, ''));
          await settle();

          const read = async (rowId) => {
            document.querySelector('#tbody tr[data-row-id="' + rowId + '"]').click();
            await settle();
            document.querySelector('#res-tab-preview').click();
            await settle();
            await new Promise((resolve) => setTimeout(resolve, 350));
            const body = document.querySelector('#res-body');
            const preview = document.querySelector('#res-preview');
            const raw = document.querySelector('#res-raw');
            const image = preview.querySelector('.image-preview-stage img');
            const stage = preview.querySelector('.image-preview-stage');
            const imageBox = image ? image.getBoundingClientRect() : null;
            const stageBox = stage ? stage.getBoundingClientRect() : null;
            return {
              hasNotice: !!body.querySelector('.body-notice'),
              dump: body.querySelector('pre.hex-dump')?.textContent?.split('\\n')[0] || null,
              bodyText: body.textContent,
              rawText: raw.textContent,
              hasJsonTree: !!body.querySelector('.json-tree'),
              caption: preview.querySelector('.image-preview-caption')?.textContent || null,
              renderedWidth: imageBox ? Math.round(imageBox.width) : 0,
              renderedHeight: imageBox ? Math.round(imageBox.height) : 0,
              stagePainted: !!stageBox && stageBox.width > 0 && stageBox.height > 0,
              previewText: preview.textContent,
            };
          };
          return { gif: await read(1), unknownType: await read(2), json: await read(3) };
        })()`,
        true,
      );

      // U+FFFD is the decoder's "these bytes are not text" marker, and it is
      // exactly what the panes used to show. No pane may carry it any more.
      for (const [label, pane] of [
        ['gif body', observed.gif.bodyText],
        ['gif raw', observed.gif.rawText],
        ['x-unknown body', observed.unknownType.bodyText],
      ]) {
        expect({ label, hasReplacementCharacter: pane.includes('\uFFFD') }).toEqual({
          label,
          hasReplacementCharacter: false,
        });
      }

      expect(observed.gif.hasNotice).toBe(true);
      expect(observed.gif.dump).toBe(
        '00000000  47 49 46 38 39 61 01 00  01 00 80 00 00 00 00 00  |GIF89a..........|',
      );
      expect(observed.gif.rawText).toContain('47 49 46 38 39 61');

      // A 1x1 transparent pixel at its intrinsic size is invisible; the fix is
      // only real if the pane actually paints something a reader can see.
      expect(observed.gif.caption).toBe('image/gif · 1 × 1 px · 42 B · enlarged 48×');
      expect(observed.gif.renderedWidth).toBe(48);
      expect(observed.gif.renderedHeight).toBe(48);
      expect(observed.gif.stagePainted).toBe(true);

      // The header carries the type even when the recorded type does not.
      expect(observed.unknownType.caption).toBe('image/gif · 1 × 1 px · 42 B · enlarged 48×');
      expect(observed.unknownType.renderedWidth).toBe(48);

      // Text bodies keep the JSON tree and the JSON preview they always had.
      expect(observed.json.hasNotice).toBe(false);
      expect(observed.json.dump).toBeNull();
      expect(observed.json.hasJsonTree).toBe(true);
      expect(observed.json.previewText).toContain('"ok"');
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'the row menu stays bounded and hands out full copies without a dialog',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-row-menu-'));
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
      await cdp.send('Page.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1500,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const chromeApi = globalThis.chrome || {};
          chromeApi.storage = {
            local: {
              get(_keys, callback) {
                callback({});
              },
              set(_value, callback) {
                if (callback) callback();
              },
            },
          };
          chromeApi.runtime = {
            lastError: null,
            getManifest() {
              return { version: '1.6.0' };
            },
          };
          chromeApi.devtools = {
            network: {
              onRequestFinished: {
                addListener(listener) {
                  globalThis.__networkPlusLiveListener = listener;
                },
              },
            },
            panels: {
              openResource() {},
            },
          };
          globalThis.chrome = chromeApi;
          globalThis.__networkPlusCopied = [];
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              writeText(text) {
                globalThis.__networkPlusCopied.push(text);
                return Promise.resolve();
              },
            },
          });
        })();`,
      });
      await cdp.send('Page.reload', { ignoreCache: true });
      await waitForLiveNetworkListener(cdp);

      const observed = await evaluate(
        cdp,
        `(async () => {
          const settle = async () => {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await new Promise((resolve) => setTimeout(resolve, 140));
          };
          // The shape that wrapped the menu across the viewport: an ad-tech
          // path whose query alone runs past a thousand characters.
          const noisyPath = '/vevent?an_audit=0&referrer=https%3A%2F%2Fwww.msn.test%2F' + 'x'.repeat(1200) + '&ft=3';
          globalThis.__networkPlusLiveListener({
            startedDateTime: new Date(1704067200000).toISOString(),
            time: 12,
            request: {
              method: 'POST',
              url: 'https://zks1-ib.msn.test' + noisyPath,
              headers: [{ name: 'authorization', value: 'Bearer row-menu-secret' }],
              postData: { mimeType: 'application/json', text: '{"a":1}' },
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/2',
              headers: [{ name: 'content-type', value: 'text/html' }],
              content: { size: 9, mimeType: 'text/html' },
            },
            getContent(callback) {
              callback('<p>hi</p>', '');
            },
          });
          await settle();

          const cell = document.querySelector('#tbody tr[data-row-id="1"] td[data-col-id="path"]');
          cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 120 }));
          await settle();

          const menu = document.querySelector('.context-menu');
          const shownItems = () =>
            Array.from(menu.querySelectorAll('.context-menu-item')).filter((item) => !item.closest('[hidden]'));
          const measure = () => {
            const rect = menu.getBoundingClientRect();
            return { width: Math.round(rect.width), height: Math.round(rect.height), bottom: Math.round(rect.bottom) };
          };
          // Two disclosures now: sanitized first, full last. The full-copy
          // group is what this journey exercises.
          const disclosures = () => Array.from(menu.querySelectorAll('.context-menu-disclosure'));
          const toggle = disclosures().find((item) => item.textContent.includes('Copy full'));
          const fullCopyItems = () =>
            Array.from(
              menu.querySelectorAll('.context-menu-submenu[aria-label="Copy full (unsanitized)"] .context-menu-item'),
            );
          const tallestItem = () =>
            Math.max(...shownItems().map((item) => Math.round(item.getBoundingClientRect().height)));

          const collapsed = {
            box: measure(),
            itemCount: shownItems().length,
            tallestItem: tallestItem(),
            toggleLabel: toggle.textContent,
            expanded: toggle.getAttribute('aria-expanded'),
            firstItemLabel: shownItems()[0].textContent,
            disclosureLabels: disclosures().map((item) => item.textContent),
            disclosureOrder: disclosures().map((item) => shownItems().indexOf(item)),
            lastActionBeforeCopies: shownItems()[shownItems().indexOf(disclosures()[0]) - 1].textContent,
            filterLabels: shownItems()
              .filter((item) => /^(Only|Exclude) /.test(item.textContent))
              .map((item) => item.textContent),
            filterTitleLengths: shownItems()
              .filter((item) => /^(Only|Exclude) /.test(item.textContent))
              .map((item) => (item.title || '').length),
            // Arrow-key rotation must not visit what the reader cannot see.
            reachableByArrows: Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(
              (item) => item.tabIndex !== -1 && !item.closest('[hidden]'),
            ).length,
          };

          toggle.click();
          await settle();
          const expanded = {
            box: measure(),
            toggleLabel: toggle.textContent,
            expanded: toggle.getAttribute('aria-expanded'),
            formats: fullCopyItems().map((item) => item.textContent),
            menuStillOpen: menu.classList.contains('show'),
          };

          fullCopyItems()
            .find((item) => item.textContent === 'Copy full cURL')
            .click();
          await settle();
          await new Promise((resolve) => setTimeout(resolve, 250));
          const copied = globalThis.__networkPlusCopied[0] || '';
          return {
            collapsed,
            expanded,
            afterCopy: {
              dialogOpened: document.querySelector('#dataSafetyDialog').open,
              copiedCount: globalThis.__networkPlusCopied.length,
              carriesTheRealToken: copied.includes('Bearer row-menu-secret'),
              redacted: copied.includes('[REDACTED]'),
            },
            viewport: { width: window.innerWidth, height: window.innerHeight },
          };
        })()`,
        true,
      );

      // The whole complaint in two numbers: the menu used to fill the screen.
      expect(observed.collapsed.box.width).toBeLessThanOrEqual(420);
      expect(observed.collapsed.box.bottom).toBeLessThanOrEqual(observed.viewport.height);
      // One line per entry — a wrapped label is what made it tall.
      expect(observed.collapsed.tallestItem).toBeLessThanOrEqual(34);

      // The rule is built from the path, not from per-request query state,
      // and the domain pair follows whichever cell was right-clicked.
      expect(observed.collapsed.filterLabels).toEqual([
        'Only Path /vevent',
        'Exclude Path /vevent',
        'Only Domain zks1-ib.msn.test',
        'Exclude Domain zks1-ib.msn.test',
      ]);
      // Filters lead the menu; the copy formats sit behind two disclosures at
      // the end, after the selection actions.
      expect(observed.collapsed.firstItemLabel).toBe('Only Path /vevent');
      expect(observed.collapsed.disclosureLabels).toEqual(['▸ Copy sanitized', '▸ Copy full (unsanitized)']);
      expect(observed.collapsed.disclosureOrder).toEqual([observed.collapsed.itemCount - 2, observed.collapsed.itemCount - 1]);
      expect(observed.collapsed.lastActionBeforeCopies).toBe('Select');

      // Collapsed by default, and its items are not arrow-key destinations.
      expect(observed.collapsed.toggleLabel).toBe('▸ Copy full (unsanitized)');
      expect(observed.collapsed.expanded).toBe('false');
      expect(observed.collapsed.reachableByArrows).toBe(observed.collapsed.itemCount + 6);

      expect(observed.expanded.toggleLabel).toBe('▾ Copy full (unsanitized)');
      expect(observed.expanded.expanded).toBe('true');
      expect(observed.expanded.menuStillOpen).toBe(true);
      expect(observed.expanded.formats).toEqual([
        'Copy full request summary',
        'Copy full URL',
        'Copy full cURL',
        'Copy full fetch',
        'Copy full PowerShell',
        'Copy full Markdown',
        'Copy full raw request',
        'Copy full request body',
      ]);
      // Expanding grows the menu but must not push it off the viewport.
      expect(observed.expanded.box.height).toBeGreaterThan(observed.collapsed.box.height);
      expect(observed.expanded.box.bottom).toBeLessThanOrEqual(observed.viewport.height);

      // No dialog, one copy, and it really is the unsanitized form.
      expect(observed.afterCopy).toEqual({
        dialogOpened: false,
        copiedCount: 1,
        carriesTheRealToken: true,
        redacted: false,
      });
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

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
      await waitForSampleCaptureAction(cdp);

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
          const statusDetailsToggle = document.querySelector('#statusDetailsToggle');
          if (!statusDetailsToggle || statusDetailsToggle.hidden) {
            throw new Error('Narrow status details disclosure was not available.');
          }
          statusDetailsToggle.click();
          await new Promise((resolve) => requestAnimationFrame(resolve));
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
      expect(after.detailsTitle).toBe('POST checkout.network-plus.test/v1/orders/preview');
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
      await waitForSampleCaptureAction(cdp);

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
      expect(wideReopened.detailsTitle).toBe('POST checkout.network-plus.test/v1/orders/preview');

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

      // Closing the pane hides it but leaves the row selected — that is how
      // clicking the row reopens it. The language repaint gated on the
      // selection alone, and its first act is showDetailsPanel(), so
      // switching language pushed a pane the reader had just dismissed back
      // over the workbench. A closed pane stays closed through the switch.
      const closedAcrossLanguage = await evaluate(
        cdp,
        `(async () => {
          const details = document.querySelector('#details');
          const select = document.querySelector('#langSelect');
          const before = { detailsHidden: details.hidden, selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null };
          select.value = 'ja';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const afterJapanese = {
            lang: document.documentElement.lang,
            detailsHidden: details.hidden,
            resizerHidden: document.querySelector('#resizer').hidden,
            detailsDisplay: getComputedStyle(details).display,
            selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
          };
          select.value = 'en';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return {
            before,
            afterJapanese,
            afterEnglish: { lang: document.documentElement.lang, detailsHidden: details.hidden },
          };
        })()`,
        true,
      );
      expect(closedAcrossLanguage.before).toEqual({ detailsHidden: true, selectedRowId: wideReopened.selectedRowId });
      // The switch really happened, so the pane staying shut is not the
      // result of nothing running.
      expect(closedAcrossLanguage.afterJapanese.lang).toBe('ja');
      expect(closedAcrossLanguage.afterJapanese.detailsHidden).toBe(true);
      expect(closedAcrossLanguage.afterJapanese.resizerHidden).toBe(true);
      expect(closedAcrossLanguage.afterJapanese.detailsDisplay).toBe('none');
      // The selection is untouched: the row is still the one a click reopens.
      expect(closedAcrossLanguage.afterJapanese.selectedRowId).toBe(wideReopened.selectedRowId);
      expect(closedAcrossLanguage.afterEnglish).toEqual({ lang: 'en', detailsHidden: true });

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
          titlePathClipped: (() => {
            const pathEl = document.querySelector('#detailsTitle .details-title-path');
            return pathEl ? pathEl.scrollWidth > pathEl.clientWidth : null;
          })(),
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
        }))()`,
      );
      expect(narrowReopened.detailsHidden).toBe(false);
      expect(narrowReopened.resizerHidden).toBe(false);
      // At 375px the pathname is middle-ellipsised by measurement (font
      // metrics differ per platform), so the pin is the badge, the host, and
      // the file name's tail; the path span itself must never clip.
      expect(narrowReopened.detailsTitle).toMatch(/^GET static\.network-plus\.test\S*plus\.css$/);
      expect(narrowReopened.titlePathClipped).toBe(false);
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
  'narrow sample status disclosure preserves the evidence workspace and interaction state',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-status-workspace-dom-'));
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
      await waitForSampleCaptureAction(cdp);

      const initialState = await evaluate(
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

          document.querySelector('#res-tab-timing').click();
          document.querySelector('#searchToggleBtn').click();
          const searchInput = document.querySelector('.search-keyword-input');
          searchInput.value = '503';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 1400));

          return {
            activeResponseTabId: document.querySelector('#res-tab-bar [aria-selected="true"]')?.id || null,
            pauseDisabled: document.querySelector('#pauseBtn').disabled,
            pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
            requestCount: document.querySelector('#counter').textContent,
            requestCountAnnouncement: document.querySelector('#requestCountStatus').textContent,
            searchPanelDisplay: getComputedStyle(document.querySelector('#searchPanel')).display,
            searchQuery: document.querySelector('.search-keyword-input')?.value || '',
            selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
            statusText: document.querySelector('#statusText').textContent,
          };
        })()`,
        true,
      );
      expect(initialState).toMatchObject({
        activeResponseTabId: 'res-tab-timing',
        pauseDisabled: true,
        requestCount: '3 requests · 1 matching',
        requestCountAnnouncement: '3 requests, 1 matching the search',
        searchPanelDisplay: 'block',
        searchQuery: '503',
      });
      expect(initialState.pauseLabel).toMatch(/local sample capture is active/i);
      expect(initialState.selectedRowId).not.toBeNull();
      expect(initialState.statusText).toMatch(/^Local sample capture: 3 synthetic requests loaded\./);

      const viewportMeasurements = [];
      for (const width of STATUS_WORKSPACE_VIEWPORT_WIDTHS) {
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
              const statusbar = document.querySelector('.statusbar');
              const statusbarRect = statusbar.getBoundingClientRect();
              const immediateIds = [
                'sampleCaptureStatus',
                'sampleGuideBtn',
                'sampleExitBtn',
                'statusText',
                'counter',
              ];
              const immediate = immediateIds.map((id) => {
                const element = document.getElementById(id);
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return {
                  id,
                  keyboardReachable:
                    element.tagName !== 'BUTTON' || (!element.disabled && element.tabIndex >= 0),
                  visible:
                    !element.hidden &&
                    style.display !== 'none' &&
                    rect.width > 0 &&
                    rect.height > 0 &&
                    rect.top >= statusbarRect.top &&
                    rect.bottom <= statusbarRect.bottom,
                };
              });
              const visibleActions = Array.from(statusbar.querySelectorAll('button'))
                .filter((button) => {
                  const rect = button.getBoundingClientRect();
                  const style = getComputedStyle(button);
                  return (
                    !button.hidden &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    rect.width > 0 &&
                    rect.height > 0
                  );
                })
                .map((button) => ({
                  id: button.id,
                  keyboardReachable: !button.disabled && button.tabIndex >= 0,
                  singleLine:
                    getComputedStyle(button).whiteSpace === 'nowrap' &&
                    button.scrollHeight <= button.clientHeight + 1,
                }));
              const disclosure = document.querySelector('#statusDetailsToggle');
              const details = document.querySelector('#statusDetails');
              return {
                width: innerWidth,
                documentOverflow:
                  document.documentElement.scrollWidth - document.documentElement.clientWidth,
                height: Math.round(statusbarRect.height),
                heightRatio: statusbarRect.height / innerHeight,
                immediate,
                visibleActions,
                disclosureExists: !!disclosure,
                disclosureDisplay: disclosure ? getComputedStyle(disclosure).display : null,
                detailsExists: !!details,
                detailsDisplay: details ? getComputedStyle(details).display : null,
                detailsHidden: details ? details.hidden : null,
              };
            })()`,
          ),
        );
      }

      const narrowMeasurements = viewportMeasurements.slice(0, -1);
      for (const measurement of viewportMeasurements) {
        expect(measurement.documentOverflow).toBe(0);
        expect(measurement.immediate.every((item) => item.visible)).toBe(true);
        expect(measurement.immediate.every((item) => item.keyboardReachable)).toBe(true);
        expect(measurement.visibleActions.length).toBeGreaterThan(0);
        expect(measurement.visibleActions.every((action) => action.singleLine)).toBe(true);
        expect(measurement.visibleActions.every((action) => action.keyboardReachable)).toBe(true);
      }
      for (const measurement of narrowMeasurements) {
        expect(measurement.height).toBeLessThanOrEqual(160);
        expect(measurement.heightRatio).toBeLessThanOrEqual(0.2);
        expect(measurement.disclosureExists).toBe(true);
        expect(measurement.disclosureDisplay).not.toBe('none');
        expect(measurement.detailsExists).toBe(true);
        expect(measurement.detailsHidden).toBe(true);
      }
      const wideMeasurement = viewportMeasurements.at(-1);
      expect(wideMeasurement).toMatchObject({
        width: 1280,
        disclosureExists: true,
        disclosureDisplay: 'none',
        detailsExists: true,
        detailsDisplay: 'contents',
        detailsHidden: false,
      });

      const safetyStatusMeasurements = [];
      for (const width of STATUS_WORKSPACE_VIEWPORT_WIDTHS.slice(0, -1)) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        safetyStatusMeasurements.push(
          await evaluate(
            cdp,
            `(async () => {
              const status = document.querySelector('#statusText');
              status.textContent = ${JSON.stringify(SAFETY_STATUS_MESSAGE)};
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const statusbarRect = document.querySelector('.statusbar').getBoundingClientRect();
              const statusRect = status.getBoundingClientRect();
              const style = getComputedStyle(status);
              return {
                width: innerWidth,
                documentOverflow:
                  document.documentElement.scrollWidth - document.documentElement.clientWidth,
                fullText: status.textContent,
                statusFits:
                  status.scrollWidth <= status.clientWidth + 1 &&
                  status.scrollHeight <= status.clientHeight + 1,
                statusInsideBar:
                  statusRect.top >= statusbarRect.top &&
                  statusRect.bottom <= statusbarRect.bottom,
                statusbarHeight: Math.round(statusbarRect.height),
                statusbarHeightRatio: statusbarRect.height / innerHeight,
                textOverflow: style.textOverflow,
                whiteSpace: style.whiteSpace,
              };
            })()`,
            true,
          ),
        );
      }
      for (const measurement of safetyStatusMeasurements) {
        expect(measurement).toMatchObject({
          documentOverflow: 0,
          fullText: SAFETY_STATUS_MESSAGE,
          statusFits: true,
          statusInsideBar: true,
          textOverflow: 'clip',
          whiteSpace: 'normal',
        });
        expect(measurement.statusbarHeight).toBeLessThanOrEqual(160);
        expect(measurement.statusbarHeightRatio).toBeLessThanOrEqual(0.2);
      }
      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#statusText').textContent = ${JSON.stringify(initialState.statusText)};
        })()`,
      );
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      // The media-query change is asynchronous. Focusing the chip before the
      // wide sync ran only ever worked because [hidden] used to be defeated by
      // display:contents at wide widths — focusing a display:none element is a
      // no-op, so wait for the details to actually be visible first.
      await waitForStatusDetailsState(
        cdp,
        { detailsHidden: false, toggleHidden: true },
        'Wide breakpoint status-details visibility',
      );

      const reverseBreakpointBaseline = await evaluate(
        cdp,
        `(() => {
          const chip = document.querySelector('.status-summary-chip--5xx');
          if (!chip) throw new Error('Wide status action was not available.');
          chip.focus({ preventScroll: true });
          return {
            activeResponseTabId:
              document.querySelector('#res-tab-bar [aria-selected="true"]')?.id || null,
            documentScrollLeft: document.scrollingElement.scrollLeft,
            documentScrollTop: document.scrollingElement.scrollTop,
            pauseDisabled: document.querySelector('#pauseBtn').disabled,
            pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
            searchPanelDisplay: getComputedStyle(document.querySelector('#searchPanel')).display,
            searchQuery: document.querySelector('.search-keyword-input')?.value || '',
            selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
            tableScrollLeft: document.querySelector('#tableWrap').scrollLeft,
            tableScrollTop: document.querySelector('#tableWrap').scrollTop,
          };
        })()`,
      );
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 375,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForStatusDetailsState(
        cdp,
        {
          activeElementId: 'statusDetailsToggle',
          detailsHidden: true,
          expanded: 'false',
          toggleHidden: false,
        },
        'Narrow breakpoint status-action focus transfer',
      );
      const reverseNarrowState = await evaluate(
        cdp,
        `(() => ({
          activeResponseTabId:
            document.querySelector('#res-tab-bar [aria-selected="true"]')?.id || null,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          documentScrollLeft: document.scrollingElement.scrollLeft,
          documentScrollTop: document.scrollingElement.scrollTop,
          pauseDisabled: document.querySelector('#pauseBtn').disabled,
          pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
          searchPanelDisplay: getComputedStyle(document.querySelector('#searchPanel')).display,
          searchQuery: document.querySelector('.search-keyword-input')?.value || '',
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
          tableScrollLeft: document.querySelector('#tableWrap').scrollLeft,
          tableScrollTop: document.querySelector('#tableWrap').scrollTop,
        }))()`,
      );
      expect(reverseNarrowState).toEqual({
        ...reverseBreakpointBaseline,
        documentOverflow: 0,
      });
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForStatusDetailsState(
        cdp,
        {
          activeElementId: 'sampleExitBtn',
          detailsHidden: false,
          expanded: 'false',
          toggleHidden: true,
        },
        'Wide breakpoint toggle focus transfer',
      );

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 375,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await evaluate(
        cdp,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );

      const collapsedState = await evaluate(
        cdp,
        `(() => {
          const details = document.querySelector('#statusDetails');
          return {
            detailsHidden: details.hidden,
            retentionText: document.querySelector('#retentionStatus').textContent,
            statusSummaryText: document.querySelector('.status-summary-accessible').textContent,
            totalSizeText: document.querySelector('#totalSize').textContent,
          };
        })()`,
      );
      const collapsedAccessibilityTree = await cdp.send('Accessibility.getFullAXTree');
      const collapsedAccessibleNames = collapsedAccessibilityTree.nodes.map((node) => node.name?.value).filter(Boolean);
      expect(
        collapsedAccessibilityTree.nodes.some(
          (node) => node.role?.value === 'button' && node.name?.value === 'More status',
        ),
      ).toBe(true);
      for (const immediateFact of [
        'Local sample · live paused',
        'Sample guide',
        'Exit · restore prior recording state',
        initialState.statusText,
        initialState.requestCountAnnouncement,
      ]) {
        expect(collapsedAccessibleNames.some((name) => name.includes(immediateFact))).toBe(true);
      }
      expect(collapsedAccessibleNames.some((name) => name.includes(collapsedState.retentionText))).toBe(false);

      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#statusDetailsToggle').focus();
        })()`,
      );
      await pressKey(cdp, ' ', 'Space', 32);
      await waitForStatusDetailsState(
        cdp,
        {
          activeElementId: 'statusDetailsToggle',
          detailsHidden: false,
          expanded: 'true',
          toggleHidden: false,
        },
        'Space expansion',
      );

      const expandedState = await evaluate(
        cdp,
        `(() => {
          const details = document.querySelector('#statusDetails');
          const statusbar = document.querySelector('.statusbar');
          return {
            activeElementId: document.activeElement.id,
            activeResponseTabId:
              document.querySelector('#res-tab-bar [aria-selected="true"]')?.id || null,
            detailsHidden: details.hidden,
            detailsPosition: getComputedStyle(details).position,
            documentOverflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
            documentScrollLeft: document.scrollingElement.scrollLeft,
            documentScrollTop: document.scrollingElement.scrollTop,
            expanded: document.querySelector('#statusDetailsToggle').getAttribute('aria-expanded'),
            pauseDisabled: document.querySelector('#pauseBtn').disabled,
            pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
            searchPanelDisplay: getComputedStyle(document.querySelector('#searchPanel')).display,
            searchQuery: document.querySelector('.search-keyword-input')?.value || '',
            selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
            statusbarPosition: getComputedStyle(statusbar).position,
            tableScrollLeft: document.querySelector('#tableWrap').scrollLeft,
            tableScrollTop: document.querySelector('#tableWrap').scrollTop,
          };
        })()`,
      );
      expect(expandedState).toMatchObject({
        activeElementId: 'statusDetailsToggle',
        activeResponseTabId: initialState.activeResponseTabId,
        detailsHidden: false,
        detailsPosition: 'static',
        documentOverflow: 0,
        documentScrollLeft: 0,
        documentScrollTop: 0,
        expanded: 'true',
        pauseDisabled: initialState.pauseDisabled,
        pauseLabel: initialState.pauseLabel,
        searchPanelDisplay: initialState.searchPanelDisplay,
        searchQuery: initialState.searchQuery,
        selectedRowId: initialState.selectedRowId,
        statusbarPosition: 'static',
        tableScrollLeft: 0,
        tableScrollTop: 0,
      });

      const expandedAccessibilityTree = await cdp.send('Accessibility.getFullAXTree');
      const expandedAccessibleNames = expandedAccessibilityTree.nodes.map((node) => node.name?.value).filter(Boolean);
      expect(
        expandedAccessibilityTree.nodes.some(
          (node) => node.role?.value === 'button' && node.name?.value === 'Less status',
        ),
      ).toBe(true);
      for (const disclosedFact of [
        collapsedState.retentionText,
        collapsedState.statusSummaryText,
        collapsedState.totalSizeText,
      ]) {
        expect(expandedAccessibleNames.some((name) => name.includes(disclosedFact))).toBe(true);
      }
      expect(expandedAccessibleNames.some((name) => name.includes('Inspect first visible 2xx request'))).toBe(true);
      expect(expandedAccessibleNames.some((name) => name.includes('Inspect first visible 5xx request'))).toBe(true);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForStatusDetailsState(
        cdp,
        {
          activeElementId: 'sampleExitBtn',
          detailsHidden: false,
          expanded: 'false',
          toggleHidden: true,
        },
        'Wide breakpoint focus transfer',
      );
      const wideBreakpointState = await evaluate(
        cdp,
        `(() => ({
          activeResponseTabId:
            document.querySelector('#res-tab-bar [aria-selected="true"]')?.id || null,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          documentScrollLeft: document.scrollingElement.scrollLeft,
          documentScrollTop: document.scrollingElement.scrollTop,
          pauseDisabled: document.querySelector('#pauseBtn').disabled,
          pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
          searchPanelDisplay: getComputedStyle(document.querySelector('#searchPanel')).display,
          searchQuery: document.querySelector('.search-keyword-input')?.value || '',
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
          tableScrollLeft: document.querySelector('#tableWrap').scrollLeft,
          tableScrollTop: document.querySelector('#tableWrap').scrollTop,
        }))()`,
      );
      expect(wideBreakpointState).toEqual({
        activeResponseTabId: initialState.activeResponseTabId,
        documentOverflow: 0,
        documentScrollLeft: expandedState.documentScrollLeft,
        documentScrollTop: expandedState.documentScrollTop,
        pauseDisabled: initialState.pauseDisabled,
        pauseLabel: initialState.pauseLabel,
        searchPanelDisplay: initialState.searchPanelDisplay,
        searchQuery: initialState.searchQuery,
        selectedRowId: initialState.selectedRowId,
        tableScrollLeft: expandedState.tableScrollLeft,
        tableScrollTop: expandedState.tableScrollTop,
      });

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 375,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await waitForStatusDetailsState(
        cdp,
        {
          activeElementId: 'sampleExitBtn',
          detailsHidden: false,
          expanded: 'true',
          toggleHidden: false,
        },
        'Narrow breakpoint state restoration',
      );
      const narrowBreakpointState = await evaluate(
        cdp,
        `(() => ({
          activeResponseTabId:
            document.querySelector('#res-tab-bar [aria-selected="true"]')?.id || null,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          documentScrollLeft: document.scrollingElement.scrollLeft,
          documentScrollTop: document.scrollingElement.scrollTop,
          pauseDisabled: document.querySelector('#pauseBtn').disabled,
          pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
          searchPanelDisplay: getComputedStyle(document.querySelector('#searchPanel')).display,
          searchQuery: document.querySelector('.search-keyword-input')?.value || '',
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
          tableScrollLeft: document.querySelector('#tableWrap').scrollLeft,
          tableScrollTop: document.querySelector('#tableWrap').scrollTop,
        }))()`,
      );
      expect(narrowBreakpointState).toEqual(wideBreakpointState);

      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#statusDetailsToggle').focus({ preventScroll: true });
        })()`,
      );
      await pressKey(cdp, ' ', 'Space', 32);
      await waitForStatusDetailsState(
        cdp,
        {
          activeElementId: 'statusDetailsToggle',
          detailsHidden: true,
          expanded: 'false',
          toggleHidden: false,
        },
        'Space collapse',
      );
      const closedState = await evaluate(
        cdp,
        `(() => ({
          activeElementId: document.activeElement.id,
          activeResponseTabId:
            document.querySelector('#res-tab-bar [aria-selected="true"]')?.id || null,
          detailsHidden: document.querySelector('#statusDetails').hidden,
          expanded: document.querySelector('#statusDetailsToggle').getAttribute('aria-expanded'),
          pauseDisabled: document.querySelector('#pauseBtn').disabled,
          pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
          searchPanelDisplay: getComputedStyle(document.querySelector('#searchPanel')).display,
          searchQuery: document.querySelector('.search-keyword-input')?.value || '',
          selectedRowId: document.querySelector('#tbody tr.selected')?.dataset.rowId || null,
        }))()`,
      );
      expect(closedState).toEqual({
        activeElementId: 'statusDetailsToggle',
        activeResponseTabId: initialState.activeResponseTabId,
        detailsHidden: true,
        expanded: 'false',
        pauseDisabled: initialState.pauseDisabled,
        pauseLabel: initialState.pauseLabel,
        searchPanelDisplay: initialState.searchPanelDisplay,
        searchQuery: initialState.searchQuery,
        selectedRowId: initialState.selectedRowId,
      });

      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#sampleExitBtn').click();
        })()`,
      );
      await evaluate(
        cdp,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );
      const exitedState = await evaluate(
        cdp,
        `(() => ({
          pauseDisabled: document.querySelector('#pauseBtn').disabled,
          pauseLabel: document.querySelector('#pauseBtn').getAttribute('aria-label'),
          requestCount: document.querySelector('#counter').textContent,
          sampleStatusHidden: document.querySelector('#sampleCaptureStatus').hidden,
        }))()`,
      );
      expect(exitedState).toEqual({
        pauseDisabled: false,
        pauseLabel: 'Pause recording',
        requestCount: '0 requests',
        sampleStatusHidden: true,
      });
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
      await waitForSampleCaptureAction(cdp);
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
                  hidden: button.hidden === true,
                  width: rect.width,
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
                  document.querySelector('.brand-sub-text'),
                ).display,
              };
            })()`,
          ),
        );
      }

      const expectedActionOrder = [
        'pauseBtn',
        'supportBtn',
        'searchToggleBtn',
        'clearBtn',
        'importBtn',
        'exportHarBtn',
        'autoScrollBtn',
        'filterBtn',
        'columnsBtn',
        'settingsBtn',
        'popoutBtn',
        'shortcutBtn',
      ];
      for (const measurement of viewportMeasurements) {
        expect(measurement.documentOverflow).toBe(0);
        expect(measurement.toolbarOverflowX).toBe('auto');
        expect(measurement.actions).toHaveLength(12);
        expect(measurement.actions.map((action) => action.id)).toEqual(expectedActionOrder);
        // The pop-out button exists only for a DevTools session; outside one
        // it must not just carry the hidden attribute but actually render at
        // zero width (the .topbar button[hidden] guard).
        const popoutAction = measurement.actions.find((action) => action.id === 'popoutBtn');
        expect(popoutAction.hidden).toBe(true);
        expect(popoutAction.width).toBe(0);
      }
      expect(viewportMeasurements.slice(0, 3).every((measurement) => measurement.toolbarOverflow > 0)).toBe(true);
      const measurementsByWidth = new Map(viewportMeasurements.map((measurement) => [measurement.width, measurement]));
      // The "for DevTools" sub-label hides only below the width where every
      // toolbar control still fits beside it (the full toolbar fits from
      // 1249px; 1254px adds margin for font-metric jitter). Wherever the
      // label is visible, nothing may need scrolling to reach.
      const compactBoundaryMeasurement = measurementsByWidth.get(1254);
      expect(compactBoundaryMeasurement.brandSubtitleDisplay).toBe('none');
      expect(compactBoundaryMeasurement.brandWidth).toBeLessThan(150);
      // Compact mode drops only the sub-label words; the otter keeps a fixed
      // 22px perch between the wordmark and the cup, inside symmetric paddings.
      expect(compactBoundaryMeasurement.brandPaddingLeft).toBe('8px');
      expect(compactBoundaryMeasurement.brandPaddingRight).toBe('8px');

      const wideBoundaryMeasurement = measurementsByWidth.get(1255);
      const desktopMeasurement = measurementsByWidth.get(1280);
      const wideMeasurement = measurementsByWidth.get(1500);
      for (const measurement of [wideBoundaryMeasurement, desktopMeasurement, wideMeasurement]) {
        expect(measurement.toolbarOverflow).toBe(0);
        expect(measurement.actions.every((action) => action.hidden || action.fullyVisible)).toBe(true);
        expect(measurement.brandDisplay).not.toBe('none');
        expect(measurement.brandSubtitleDisplay).not.toBe('none');
        expect(measurement.brandPaddingLeft).toBe('14px');
        expect(measurement.brandPaddingRight).toBe('14px');
        expect(measurement.brandWidth).toBeGreaterThan(compactBoundaryMeasurement.brandWidth);
      }

      const expectedTabOrder = [
        'supportBtn',
        'searchToggleBtn',
        'clearBtn',
        'importBtn',
        'exportHarBtn',
        'autoScrollBtn',
        'filterBtn',
        'columnsBtn',
        'settingsBtn',
        'shortcutBtn',
      ];
      const reverseTabOrder = expectedTabOrder.slice().reverse();
      await evaluate(
        cdp,
        `(() => {
          const toolbar = document.querySelector('.topbar');
          const originalScrollIntoView = Element.prototype.scrollIntoView;
          const controller = new AbortController();
          const probe = {
            calls: [],
            controller,
            currentActionId: null,
            currentEventId: null,
            focusEvents: [],
            nextEventId: 0,
            originalScrollIntoView,
          };
          window.__toolbarFocusScrollTimingProbe = probe;
          toolbar.addEventListener(
            'focusin',
            (event) => {
              const action = event.target.closest('button');
              if (!action || !toolbar.contains(action)) return;
              probe.currentActionId = action.id;
              probe.currentEventId = ++probe.nextEventId;
            },
            { capture: true, signal: controller.signal },
          );
          Element.prototype.scrollIntoView = function (options) {
            if (toolbar.contains(this)) {
              probe.calls.push({
                actionId: this.id,
                eventId: probe.currentEventId,
              });
            }
            originalScrollIntoView.call(this, options);
          };
          toolbar.addEventListener(
            'focusin',
            (event) => {
              const action = event.target.closest('button');
              if (!action || !toolbar.contains(action)) return;
              probe.focusEvents.push({
                actionId: action.id,
                scrollIntoViewCallsDuringFocusin: probe.calls.filter(
                  (call) =>
                    call.eventId === probe.currentEventId &&
                    call.actionId === probe.currentActionId,
                ).length,
                width: innerWidth,
              });
              probe.currentActionId = null;
              probe.currentEventId = null;
            },
            { signal: controller.signal },
          );
        })()`,
      );
      const measureToolbarFocusTarget = () =>
        evaluate(
          cdp,
          `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
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
              toolbarScrollLeft: toolbar.scrollLeft,
              toolbarScrollMax: toolbar.scrollWidth - toolbar.clientWidth,
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
                activeRect.left - outlineAllowance < visibleLeft
                  ? 'left'
                  : activeRect.right + outlineAllowance > visibleRight
                    ? 'right'
                    : null,
            });
          })))`,
          true,
        );
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
          const traceEntry = await measureToolbarFocusTarget();
          expect(traceEntry.id).toBe(expectedId);
          tabTrace.push({ ...traceEntry, width, direction: 'forward' });
        }
        await pressKey(cdp, 'Tab', 'Tab', 9);
        const reverseStart = await evaluate(
          cdp,
          `(() => {
            const toolbar = document.querySelector('.topbar');
            return {
              activeId: document.activeElement.id,
              inToolbar: toolbar.contains(document.activeElement),
              documentScrollLeft: document.scrollingElement.scrollLeft,
              documentScrollTop: document.scrollingElement.scrollTop,
              documentOverflow:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
              toolbarScrollLeft: toolbar.scrollLeft,
              toolbarScrollMax: toolbar.scrollWidth - toolbar.clientWidth,
            };
          })()`,
        );
        expect(reverseStart.inToolbar).toBe(false);
        expect(reverseStart.documentScrollLeft).toBe(0);
        expect(reverseStart.documentScrollTop).toBe(0);
        expect(reverseStart.documentOverflow).toBe(0);
        if (reverseStart.toolbarScrollMax > 0) {
          expect(reverseStart.toolbarScrollLeft).toBeGreaterThan(0);
        }

        const reverseTabTrace = [];
        for (const expectedId of reverseTabOrder) {
          await pressKey(cdp, 'Tab', 'Tab', 9, 8);
          const traceEntry = await measureToolbarFocusTarget();
          expect(traceEntry.id).toBe(expectedId);
          reverseTabTrace.push({ ...traceEntry, width, direction: 'reverse' });
        }
        focusMeasurements.push({ width, tabTrace, reverseStart, reverseTabTrace });
      }
      for (const measurement of focusMeasurements) {
        expect(measurement.tabTrace.map((entry) => entry.id)).toEqual(expectedTabOrder);
        expect(measurement.reverseTabTrace.map((entry) => entry.id)).toEqual(reverseTabOrder);
        expect(
          [...measurement.tabTrace, ...measurement.reverseTabTrace].every(
            (entry) =>
              entry.inToolbar &&
              entry.focusVisible &&
              entry.outlineStyle === 'solid' &&
              entry.outlineWidth === '2px' &&
              entry.documentScrollLeft === 0 &&
              entry.documentScrollTop === 0 &&
              entry.documentOverflow === 0 &&
              entry.toolbarScrollLeft >= 0 &&
              entry.toolbarScrollLeft <= entry.toolbarScrollMax,
          ),
        ).toBe(true);
        assertToolbarFocusContainment(
          measurement.reverseTabTrace,
          REVERSE_TOOLBAR_FOCUS_CONTRACT,
        );
        if (measurement.reverseStart.toolbarScrollMax > 0) {
          expect(measurement.reverseTabTrace.at(-1).toolbarScrollLeft).toBeLessThan(
            measurement.reverseStart.toolbarScrollLeft,
          );
        } else {
          expect(measurement.reverseStart.toolbarScrollLeft).toBe(0);
          expect(measurement.reverseTabTrace.every((entry) => entry.toolbarScrollLeft === 0)).toBe(
            true,
          );
        }
      }
      const clippedFocusMeasurements = focusMeasurements.flatMap((measurement) =>
        [...measurement.tabTrace, ...measurement.reverseTabTrace]
          .filter((entry) => !entry.fullyVisibleWithOutline)
          .map((entry) => ({
            width: measurement.width,
            direction: entry.direction,
            id: entry.id,
            visibleWidth: entry.visibleWidth,
            actionWidth: entry.actionWidth,
            clippedSide: entry.clippedSide,
            toolbarScrollLeft: entry.toolbarScrollLeft,
          })),
      );
      expect(clippedFocusMeasurements).toEqual([]);
      const focusScrollTimingTrace = await evaluate(
        cdp,
        `(() => {
          const probe = window.__toolbarFocusScrollTimingProbe;
          probe.controller.abort();
          Element.prototype.scrollIntoView = probe.originalScrollIntoView;
          delete window.__toolbarFocusScrollTimingProbe;
          return probe.focusEvents;
        })()`,
      );
      expect(
        focusScrollTimingTrace.map(({ actionId, width }) => ({ actionId, width })),
      ).toEqual(
        TOOLBAR_FOCUS_VIEWPORT_WIDTHS.flatMap((width) =>
          [...expectedTabOrder, ...reverseTabOrder].map((actionId) => ({
            actionId,
            width,
          })),
        ),
      );
      assertSynchronousToolbarFocusScroll(focusScrollTimingTrace);

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 375,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const mutatedReverseTabTrace = [];
      try {
        const mutationStart = await evaluate(
          cdp,
          `(async () => {
            const toolbar = document.querySelector('.topbar');
            const firstGridTarget = document.querySelector('th[data-col-id]');
            if (!firstGridTarget) throw new Error('Request-grid focus target was not found.');
            document.body.focus();
            const lockedToolbarScrollLeft = toolbar.scrollWidth - toolbar.clientWidth;
            toolbar.scrollLeft = lockedToolbarScrollLeft;
            window.__reverseToolbarOriginalScrollIntoView = Element.prototype.scrollIntoView;
            const originalScrollIntoView = Element.prototype.scrollIntoView;
            Element.prototype.scrollIntoView = function (options) {
              if (toolbar.contains(this)) {
                toolbar.scrollLeft = lockedToolbarScrollLeft;
                return;
              }
              originalScrollIntoView.call(this, options);
            };
            firstGridTarget.focus({ preventScroll: true });
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            return {
              activeInToolbar: toolbar.contains(document.activeElement),
              toolbarScrollLeft: toolbar.scrollLeft,
              toolbarScrollMax: toolbar.scrollWidth - toolbar.clientWidth,
            };
          })()`,
          true,
        );
        expect(mutationStart.activeInToolbar).toBe(false);
        expect(mutationStart.toolbarScrollMax).toBeGreaterThan(0);
        expect(mutationStart.toolbarScrollLeft).toBe(mutationStart.toolbarScrollMax);

        for (const expectedId of reverseTabOrder) {
          await pressKey(cdp, 'Tab', 'Tab', 9, 8);
          const traceEntry = await measureToolbarFocusTarget();
          expect(traceEntry.id).toBe(expectedId);
          mutatedReverseTabTrace.push({
            ...traceEntry,
            width: 375,
            direction: 'reverse',
          });
        }
      } finally {
        await evaluate(
          cdp,
          `(() => {
            if (window.__reverseToolbarOriginalScrollIntoView) {
              Element.prototype.scrollIntoView = window.__reverseToolbarOriginalScrollIntoView;
              delete window.__reverseToolbarOriginalScrollIntoView;
            }
          })()`,
        );
      }
      expect(mutatedReverseTabTrace.map((entry) => entry.id)).toEqual(reverseTabOrder);
      expect(() =>
        assertToolbarFocusContainment(
          mutatedReverseTabTrace,
          REVERSE_TOOLBAR_FOCUS_CONTRACT,
        ),
      ).toThrow(REVERSE_TOOLBAR_FOCUS_CONTRACT);

      const pointerCases = [
        // Natural partial-visibility cases derive their viewport width from the
        // button's own measured midpoint, so brand or font metric changes can
        // never silently push the cut line off the button.
        { caseId: 'exportHarBtn@mid', actionId: 'exportHarBtn' },
        { caseId: 'columnsBtn@mid', actionId: 'columnsBtn' },
        {
          caseId: 'exportHarBtn@500-sub-4px',
          width: 500,
          actionId: 'exportHarBtn',
          forcedVisibleWidth: 2,
        },
      ];
      const pointerMeasurements = [];
      for (const pointerCase of pointerCases) {
        let pointerWidth = pointerCase.width;
        if (pointerWidth == null) {
          // Measure at a width where the toolbar overflows: packed positions
          // are width-independent, unlike the space-between spread layout.
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 375,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false,
          });
          const midpointExpression = `(async () => {
              document.body.focus();
              await document.fonts.ready;
              document.querySelector('.topbar').scrollLeft = 0;
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const rect = document.querySelector('#${pointerCase.actionId}').getBoundingClientRect();
              return Math.round((rect.left + rect.right) / 2);
            })()`;
          pointerWidth = await evaluate(cdp, midpointExpression, true);
          for (let settleAttempt = 0; settleAttempt < 10; settleAttempt++) {
            await delay(120);
            const nextWidth = await evaluate(cdp, midpointExpression, true);
            const settled = nextWidth === pointerWidth;
            pointerWidth = nextWidth;
            if (settled) break;
          }
        }
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: pointerWidth,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        const pointExpression = `(async () => {
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
          })()`;
        // Async settle work (font loads, deferred renders) can shift the row
        // between measuring and clicking; re-measure until two consecutive
        // reads agree so the dispatch coordinates match the final layout.
        let point = await evaluate(cdp, pointExpression, true);
        for (let settleAttempt = 0; settleAttempt < 10; settleAttempt++) {
          await delay(120);
          const nextPoint = await evaluate(cdp, pointExpression, true);
          const settled = nextPoint.x === point.x && nextPoint.y === point.y;
          point = nextPoint;
          if (settled) break;
        }
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
                width: ${pointerWidth},
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
          actionId: measurement.actionId,
          clickTargets: measurement.clickTargets,
          actionDeliveries: measurement.actionDeliveries,
          toolbarScrollLeft: measurement.toolbarScrollLeft,
        })),
      ).toEqual([
        {
          caseId: 'exportHarBtn@mid',
          actionId: 'exportHarBtn',
          clickTargets: ['exportHarBtn'],
          actionDeliveries: 1,
          toolbarScrollLeft: 0,
        },
        {
          caseId: 'columnsBtn@mid',
          actionId: 'columnsBtn',
          clickTargets: ['columnsBtn'],
          actionDeliveries: 1,
          toolbarScrollLeft: 0,
        },
        {
          caseId: 'exportHarBtn@500-sub-4px',
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
  'request-grid focus allowance matches the painted outline without disrupting pointer sorting or resizing',
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
      await waitForSampleCaptureAction(cdp);
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
        'supportBtn',
        'searchToggleBtn',
        'clearBtn',
        'importBtn',
        'exportHarBtn',
        'autoScrollBtn',
        'filterBtn',
        'columnsBtn',
        'settingsBtn',
        'shortcutBtn',
      ];
      const visibleColumns = [
        ['match', 'Match'],
        ['id', 'ID'],
        ['method', 'Method'],
        ['status', 'Status'],
        ['domain', 'Domain'],
        ['path', 'Path'],
        ['type', 'Type'],
        ['duration', 'Duration'],
        ['size', 'Size'],
        ['clientStart', 'Client start'],
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
      const prepareGridFocusTransition = () =>
        evaluate(
          cdp,
          `(() => {
            const tableWrap = document.querySelector('#tableWrap');
            if (!Object.prototype.hasOwnProperty.call(tableWrap, 'scrollLeft')) {
              let prototype = tableWrap;
              let scrollLeftDescriptor = null;
              while (prototype && !scrollLeftDescriptor) {
                prototype = Object.getPrototypeOf(prototype);
                scrollLeftDescriptor = Object.getOwnPropertyDescriptor(prototype, 'scrollLeft');
              }
              if (!scrollLeftDescriptor) {
                throw new Error('Element.scrollLeft descriptor was not found.');
              }
              Object.defineProperty(tableWrap, 'scrollLeft', {
                configurable: true,
                get() {
                  return scrollLeftDescriptor.get.call(this);
                },
                set(value) {
                  const before = scrollLeftDescriptor.get.call(this);
                  const control = document.activeElement.closest('th[data-col-id], .col-resizer');
                  let minimumScrollLeft = before;
                  if (control && this.contains(control)) {
                    const tableRect = this.getBoundingClientRect();
                    const controlRect = control.getBoundingClientRect();
                    const style = getComputedStyle(control);
                    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
                    const outlineOffset = Number.parseFloat(style.outlineOffset) || 0;
                    const paintedExternalFootprint = Math.max(0, outlineWidth + outlineOffset);
                    const visibleLeft = tableRect.left + this.clientLeft;
                    const visibleRight = visibleLeft + this.clientWidth;
                    let requiredDelta = 0;
                    if (controlRect.left - paintedExternalFootprint < visibleLeft) {
                      requiredDelta =
                        controlRect.left - paintedExternalFootprint - visibleLeft;
                    } else if (controlRect.right + paintedExternalFootprint > visibleRight) {
                      requiredDelta =
                        controlRect.right + paintedExternalFootprint - visibleRight;
                    }
                    minimumScrollLeft = Math.min(
                      this.scrollWidth - this.clientWidth,
                      Math.max(0, before + requiredDelta),
                    );
                  }
                  scrollLeftDescriptor.set.call(this, value);
                  window.__gridFocusScrollWrites.push({
                    actualScrollDelta: scrollLeftDescriptor.get.call(this) - before,
                    minimumScrollDelta: minimumScrollLeft - before,
                  });
                },
              });
            }
            window.__gridFocusScrollWrites = [];
          })()`,
          true,
        );
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
            const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
            const outlineOffset = Number.parseFloat(style.outlineOffset) || 0;
            const paintedExternalFootprint = Math.max(0, outlineWidth + outlineOffset);
            const tableStyle = getComputedStyle(tableWrap);
            const reservedInlineAllowance = Math.max(
              Number.parseFloat(tableStyle.paddingInlineStart) || 0,
              Number.parseFloat(tableStyle.paddingInlineEnd) || 0,
              Number.parseFloat(tableStyle.scrollPaddingInlineStart) || 0,
              Number.parseFloat(tableStyle.scrollPaddingInlineEnd) || 0,
            );
            const kind = active.classList.contains('col-resizer') ? 'separator' : 'header';
            resolve({
              key: kind + ':' + (header?.dataset.colId || ''),
              role: active.getAttribute('role'),
              accessibleName: active.getAttribute('aria-label'),
              inTableWrap: tableWrap.contains(active),
              focusVisible: active.matches(':focus-visible'),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              outlineOffset: style.outlineOffset,
              paintedExternalFootprint,
              reservedInlineAllowance,
              focusScrollWrites: window.__gridFocusScrollWrites.slice(),
              documentScrollLeft: document.scrollingElement.scrollLeft,
              documentScrollTop: document.scrollingElement.scrollTop,
              documentOverflow:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
              tableScrollLeft: tableWrap.scrollLeft,
              tableScrollMax: tableWrap.scrollWidth - tableWrap.clientWidth,
              fullyVisibleWithPaintedIndicator:
                activeRect.left - paintedExternalFootprint >= visibleLeft &&
                activeRect.right + paintedExternalFootprint <= visibleRight,
              leftEdgeClearance: activeRect.left - visibleLeft,
              rightEdgeClearance: visibleRight - activeRect.right,
              visibleWidth: Math.round(
                Math.max(
                  0,
                  Math.min(activeRect.right, visibleRight) -
                    Math.max(activeRect.left, visibleLeft),
                ),
              ),
              targetWidth: Math.round(activeRect.width),
              clippedSide:
                activeRect.left - paintedExternalFootprint < visibleLeft ? 'left' : 'right',
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
          await prepareGridFocusTransition();
          await pressKey(cdp, 'Tab', 'Tab', 9);
          const traceEntry = completeGridFocusTransition(await measureGridFocusTarget());
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
          await prepareGridFocusTransition();
          await pressKey(cdp, 'Tab', 'Tab', 9, 8);
          const traceEntry = completeGridFocusTransition(await measureGridFocusTarget());
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
              entry.focusScrollWrites.length <= 1 &&
              entry.documentScrollLeft === 0 &&
              entry.documentScrollTop === 0 &&
              entry.documentOverflow === 0 &&
              entry.tableScrollLeft >= 0 &&
              entry.tableScrollLeft <= entry.tableScrollMax,
          ),
        ).toBe(true);
      }
      const focusAllowanceMeasurements = focusMeasurements.flatMap((measurement) =>
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
          .map((entry) => ({
            width: measurement.width,
            direction: entry.direction,
            key: entry.key,
            actualScrollDelta: entry.actualScrollDelta,
            edgeClearance: entry.edgeClearance,
            fullyVisibleWithPaintedIndicator: entry.fullyVisibleWithPaintedIndicator,
            minimumScrollDelta: entry.minimumScrollDelta,
            outlineOffset: entry.outlineOffset,
            paintedExternalFootprint: entry.paintedExternalFootprint,
            reservedInlineAllowance: entry.reservedInlineAllowance,
            visibleWidth: entry.visibleWidth,
            targetWidth: entry.targetWidth,
            clippedSide: entry.clippedSide,
            tableScrollLeft: entry.tableScrollLeft,
          })),
      );
      await evaluate(
        cdp,
        `(() => {
          const tableWrap = document.querySelector('#tableWrap');
          delete tableWrap.scrollLeft;
          delete window.__gridFocusScrollWrites;
        })()`,
        true,
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
          // Probe the LAST visible header: it is the final th in DOM order, so
          // once translated over the right edge it paints above the column that
          // naturally sits there. Method was only probe-safe while the old
          // default widths happened to place it across the 375px edge.
          const header = document.querySelector('th[data-col-id="clientStart"]');
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
          const x = (visibleHeaderLeft + visibleHeaderRight) / 2;
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
          const header = document.querySelector('th[data-col-id="clientStart"]');
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
          // Header cells clip their overflow (wide fallback fonts); this probe
          // deliberately drags the separator outside its cell, so lift the clip
          // for the duration of the probe only.
          separator.closest('th').style.overflow = 'visible';
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
          const x = (visibleSeparatorLeft + visibleSeparatorRight) / 2;
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
          separator.closest('th').style.overflow = '';
          document.querySelector('#tableWrap').style.transform = '';
          return measurement;
        })()`,
      );
      expect({
        clientStart: {
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
        clientStart: {
          columnId: 'clientStart',
          hitHeader: true,
          clickTargets: [{ columnId: 'clientStart', kind: 'header' }],
          headerDeliveries: 1,
          ariaSort: 'ascending',
          focusedColumnId: 'clientStart',
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
      assertGridFocusAllowancePolicy(focusAllowanceMeasurements);
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'workbench separators preserve inset focus rings across responsive themes and resizing inputs',
  async () => {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-separator-focus-dom-'));
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
      await waitForSampleCaptureAction(cdp);
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

      const accessibilityTree = await cdp.send('Accessibility.getFullAXTree');
      const getSeparatorAccessibility = (accessibleName) => {
        const node = accessibilityTree.nodes.find(
          (candidate) =>
            candidate.role?.value === 'separator' &&
            candidate.name?.value === accessibleName,
        );
        expect(node).toBeDefined();
        return Object.fromEntries(
          (node.properties || []).map((property) => [property.name, property.value?.value]),
        );
      };
      expect({
        main: getSeparatorAccessibility('Resize request list and request details'),
        inspector: getSeparatorAccessibility('Resize request and response inspectors'),
      }).toMatchObject({
        main: { focusable: true, orientation: 'vertical' },
        inspector: { focusable: true, orientation: 'horizontal' },
      });

      const applyScenario = async (width, theme) => {
        await cdp.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: theme.mediaColorScheme }],
        });
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await evaluate(
          cdp,
          `(async () => {
            const dataTheme = ${JSON.stringify(theme.dataTheme)};
            if (dataTheme == null) {
              document.documentElement.removeAttribute('data-theme');
            } else {
              document.documentElement.setAttribute('data-theme', dataTheme);
            }
            const tableWrap = document.querySelector('#tableWrap');
            const details = document.querySelector('#details');
            const requestPane = document.querySelector('#inspector-request');
            const responsePane = document.querySelector('#inspector-response');
            tableWrap.style.flexBasis = '';
            details.style.flexBasis = '';
            requestPane.style.flex = '';
            requestPane.style.height = '';
            responsePane.style.flex = '';
            responsePane.style.height = '';
            document.scrollingElement.scrollTo(0, 0);
            window.dispatchEvent(new Event('resize'));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          })()`,
          true,
        );
      };

      const focusSeparatorFromAnchor = async (anchorSelector) => {
        await evaluate(cdp, `document.querySelector(${JSON.stringify(anchorSelector)}).focus()`);
        await pressKey(cdp, 'Tab', 'Tab', 9, 8);
      };

      const measureFocusedSeparator = (
        selector,
        containerSelector,
        primarySelector,
        axis,
        inlineProperty,
      ) =>
        evaluate(
          cdp,
          `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const separator = document.querySelector(${JSON.stringify(selector)});
            const container = document.querySelector(${JSON.stringify(containerSelector)});
            const primary = document.querySelector(${JSON.stringify(primarySelector)});
            const separatorRect = separator.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const primaryRect = primary.getBoundingClientRect();
            const style = getComputedStyle(separator);
            const rootStyle = getComputedStyle(document.documentElement);
            const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
            const outlineOffset = Number.parseFloat(style.outlineOffset) || 0;
            const paintedExternalFootprint = Math.max(0, outlineWidth + outlineOffset);
            const accentProbe = document.createElement('span');
            accentProbe.style.color = 'var(--accent)';
            document.body.appendChild(accentProbe);
            const accentColor = getComputedStyle(accentProbe).color;
            accentProbe.remove();
            resolve({
              activeId: document.activeElement.id,
              focusVisible: separator.matches(':focus-visible'),
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              outlineOffset: style.outlineOffset,
              outlineColor: style.outlineColor,
              accentColor,
              paintedExternalFootprint,
              contained:
                separatorRect.left - paintedExternalFootprint >= Math.max(0, containerRect.left) &&
                separatorRect.top - paintedExternalFootprint >= Math.max(0, containerRect.top) &&
                separatorRect.right + paintedExternalFootprint <= Math.min(innerWidth, containerRect.right) &&
                separatorRect.bottom + paintedExternalFootprint <= Math.min(innerHeight, containerRect.bottom),
              role: separator.getAttribute('role'),
              ariaLabel: separator.getAttribute('aria-label'),
              ariaControls: separator.getAttribute('aria-controls'),
              ariaOrientation: separator.getAttribute('aria-orientation'),
              ariaValueMin: separator.getAttribute('aria-valuemin'),
              ariaValueMax: separator.getAttribute('aria-valuemax'),
              ariaValueNow: separator.getAttribute('aria-valuenow'),
              ariaValueText: separator.getAttribute('aria-valuetext'),
              cursor: style.cursor,
              primarySize: ${JSON.stringify(axis)} === 'width' ? primaryRect.width : primaryRect.height,
              primaryInlineSize:
                Number.parseFloat(primary.style[${JSON.stringify(inlineProperty)}]) || null,
              separatorWidth: separatorRect.width,
              separatorHeight: separatorRect.height,
              dataTheme: document.documentElement.getAttribute('data-theme'),
              systemDark: matchMedia('(prefers-color-scheme: dark)').matches,
              accentToken: rootStyle.getPropertyValue('--accent').trim(),
              pageBackground: getComputedStyle(document.body).backgroundColor,
              documentScrollLeft: document.scrollingElement.scrollLeft,
              documentScrollTop: document.scrollingElement.scrollTop,
              documentOverflowX:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
              documentOverflowY:
                document.documentElement.scrollHeight - document.documentElement.clientHeight,
            });
          })))`,
          true,
        );

      const expectFocusContract = (measurement, expected) => {
        expect({
          activeId: measurement.activeId,
          focusVisible: measurement.focusVisible,
          outlineStyle: measurement.outlineStyle,
          outlineWidth: measurement.outlineWidth,
          outlineOffset: measurement.outlineOffset,
          paintedExternalFootprint: measurement.paintedExternalFootprint,
          contained: measurement.contained,
          role: measurement.role,
          ariaLabel: measurement.ariaLabel,
          ariaControls: measurement.ariaControls,
          ariaOrientation: measurement.ariaOrientation,
          ariaValueMin: measurement.ariaValueMin,
          ariaValueMax: measurement.ariaValueMax,
          cursor: measurement.cursor,
          documentScrollLeft: measurement.documentScrollLeft,
          documentScrollTop: measurement.documentScrollTop,
          documentOverflowX: measurement.documentOverflowX,
          documentOverflowY: measurement.documentOverflowY,
        }).toEqual({
          activeId: expected.id,
          focusVisible: true,
          outlineStyle: 'solid',
          outlineWidth: '2px',
          outlineOffset: '-2px',
          paintedExternalFootprint: 0,
          contained: true,
          role: 'separator',
          ariaLabel: expected.ariaLabel,
          ariaControls: expected.ariaControls,
          ariaOrientation: expected.orientation,
          ariaValueMin: '0',
          ariaValueMax: '100',
          cursor: expected.cursor,
          documentScrollLeft: 0,
          documentScrollTop: 0,
          documentOverflowX: 0,
          documentOverflowY: 0,
        });
        expect(measurement.outlineColor).toBe(measurement.accentColor);
        expect(Number(measurement.ariaValueNow)).toBeGreaterThanOrEqual(0);
        expect(Number(measurement.ariaValueNow)).toBeLessThanOrEqual(100);
        expect(measurement.ariaValueText).toMatch(expected.valueTextPattern);
        expect(measurement.separatorWidth).toBeGreaterThan(0);
        expect(measurement.separatorHeight).toBeGreaterThan(0);
      };

      const themeMeasurements = [];
      for (const theme of SEPARATOR_FOCUS_THEMES) {
        for (const width of SEPARATOR_FOCUS_VIEWPORT_WIDTHS) {
          await applyScenario(width, theme);
          const isNarrow = width <= 800;
          const mainAxis = isNarrow ? 'height' : 'width';
          const mainKey = isNarrow ? 'ArrowDown' : 'ArrowRight';
          const mainCode = isNarrow ? 'ArrowDown' : 'ArrowRight';
          const mainKeyCode = isNarrow ? 40 : 39;

          // Shift+Tab from the first header control (Copy URL sits before ✕)
          // must land on the main separator.
          await focusSeparatorFromAnchor('#detailsCopyUrlBtn');
          const mainBefore = await measureFocusedSeparator(
            '#resizer',
            '#content',
            '#tableWrap',
            mainAxis,
            'flexBasis',
          );
          expectFocusContract(mainBefore, {
            id: 'resizer',
            ariaLabel: 'Resize request list and request details',
            ariaControls: 'tableWrap details',
            orientation: isNarrow ? 'horizontal' : 'vertical',
            cursor: isNarrow ? 'row-resize' : 'col-resize',
            valueTextPattern: /^Request list \d+ percent$/,
          });
          expect(isNarrow ? mainBefore.separatorHeight : mainBefore.separatorWidth).toBe(4);
          await pressKey(cdp, mainKey, mainCode, mainKeyCode);
          const mainAfter = await measureFocusedSeparator(
            '#resizer',
            '#content',
            '#tableWrap',
            mainAxis,
            'flexBasis',
          );
          expectFocusContract(mainAfter, {
            id: 'resizer',
            ariaLabel: 'Resize request list and request details',
            ariaControls: 'tableWrap details',
            orientation: isNarrow ? 'horizontal' : 'vertical',
            cursor: isNarrow ? 'row-resize' : 'col-resize',
            valueTextPattern: /^Request list \d+ percent$/,
          });
          expect(mainAfter.primarySize).toBeGreaterThan(mainBefore.primarySize);
          expect(mainAfter.primaryInlineSize).toBe(Math.round(mainBefore.primarySize + 10));
          expect(Number(mainAfter.ariaValueNow)).toBeGreaterThan(Number(mainBefore.ariaValueNow));
          expect(mainAfter.ariaValueText).not.toBe(mainBefore.ariaValueText);

          await focusSeparatorFromAnchor('#inspector-response-toggle');
          const inspectorBefore = await measureFocusedSeparator(
            '#inspector-divider',
            '.inspector-panels',
            '#inspector-request',
            'height',
            'height',
          );
          expectFocusContract(inspectorBefore, {
            id: 'inspector-divider',
            ariaLabel: 'Resize request and response inspectors',
            ariaControls: 'inspector-request inspector-response',
            orientation: 'horizontal',
            cursor: 'row-resize',
            valueTextPattern: /^Request inspector \d+ percent$/,
          });
          expect(inspectorBefore.separatorHeight).toBe(3);
          await pressKey(cdp, 'ArrowDown', 'ArrowDown', 40);
          const inspectorAfter = await measureFocusedSeparator(
            '#inspector-divider',
            '.inspector-panels',
            '#inspector-request',
            'height',
            'height',
          );
          expectFocusContract(inspectorAfter, {
            id: 'inspector-divider',
            ariaLabel: 'Resize request and response inspectors',
            ariaControls: 'inspector-request inspector-response',
            orientation: 'horizontal',
            cursor: 'row-resize',
            valueTextPattern: /^Request inspector \d+ percent$/,
          });
          expect(inspectorAfter.primarySize).toBeGreaterThan(inspectorBefore.primarySize);
          expect(inspectorAfter.primaryInlineSize).toBe(
            Math.round(inspectorBefore.primarySize + 10),
          );
          expect(Number(inspectorAfter.ariaValueNow)).toBeGreaterThan(
            Number(inspectorBefore.ariaValueNow),
          );
          expect(inspectorAfter.ariaValueText).not.toBe(inspectorBefore.ariaValueText);

          themeMeasurements.push({
            theme: theme.name,
            width,
            dataTheme: mainBefore.dataTheme,
            systemDark: mainBefore.systemDark,
            accentToken: mainBefore.accentToken,
            pageBackground: mainBefore.pageBackground,
          });
        }
      }

      const systemTheme = themeMeasurements.filter((measurement) => measurement.theme === 'system');
      const darkTheme = themeMeasurements.filter((measurement) => measurement.theme === 'dark');
      const lightTheme = themeMeasurements.filter((measurement) => measurement.theme === 'light');
      for (const measurements of [systemTheme, darkTheme, lightTheme]) {
        expect(measurements).toHaveLength(SEPARATOR_FOCUS_VIEWPORT_WIDTHS.length);
        expect(new Set(measurements.map((measurement) => measurement.accentToken)).size).toBe(1);
        expect(new Set(measurements.map((measurement) => measurement.pageBackground)).size).toBe(1);
      }
      expect(systemTheme.every((measurement) => measurement.dataTheme === null && measurement.systemDark)).toBe(
        true,
      );
      expect(darkTheme.every((measurement) => measurement.dataTheme === 'dark' && !measurement.systemDark)).toBe(
        true,
      );
      expect(lightTheme.every((measurement) => measurement.dataTheme === 'light' && measurement.systemDark)).toBe(
        true,
      );
      expect(systemTheme[0].accentToken).toBe(darkTheme[0].accentToken);
      expect(systemTheme[0].pageBackground).toBe(darkTheme[0].pageBackground);
      expect(lightTheme[0].accentToken).not.toBe(darkTheme[0].accentToken);
      expect(lightTheme[0].pageBackground).not.toBe(darkTheme[0].pageBackground);

      const dragSeparator = async (selector, primarySelector, axis, delta) => {
        const before = await evaluate(
          cdp,
          `(() => {
            const separator = document.querySelector(${JSON.stringify(selector)});
            const primary = document.querySelector(${JSON.stringify(primarySelector)});
            const rect = separator.getBoundingClientRect();
            const controller = new AbortController();
            window.__workbenchSeparatorPointerProbe?.controller.abort();
            window.__workbenchSeparatorPointerProbe = {
              controller,
              deliveries: 0,
              mouseDownTargetIds: [],
            };
            document.addEventListener(
              'mousedown',
              (event) => {
                window.__workbenchSeparatorPointerProbe.mouseDownTargetIds.push(event.target.id);
              },
              { capture: true, signal: controller.signal },
            );
            separator.addEventListener(
              'mousedown',
              () => {
                window.__workbenchSeparatorPointerProbe.deliveries += 1;
              },
              { capture: true, signal: controller.signal },
            );
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            return {
              x,
              y,
              hitTargetId: document.elementFromPoint(x, y)?.id || null,
              primarySize:
                ${JSON.stringify(axis)} === 'width'
                  ? primary.getBoundingClientRect().width
                  : primary.getBoundingClientRect().height,
              ariaValueNow: separator.getAttribute('aria-valuenow'),
              ariaValueText: separator.getAttribute('aria-valuetext'),
            };
          })()`,
        );
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: before.x,
          y: before.y,
          button: 'left',
          clickCount: 1,
        });
        await delay(80);
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: before.x + (axis === 'width' ? delta : 0),
          y: before.y + (axis === 'height' ? delta : 0),
          button: 'left',
          buttons: 1,
        });
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: before.x + (axis === 'width' ? delta : 0),
          y: before.y + (axis === 'height' ? delta : 0),
          button: 'left',
          clickCount: 1,
        });
        const after = await evaluate(
          cdp,
          `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const separator = document.querySelector(${JSON.stringify(selector)});
            const primary = document.querySelector(${JSON.stringify(primarySelector)});
            const probe = window.__workbenchSeparatorPointerProbe;
            resolve({
              deliveries: probe.deliveries,
              mouseDownTargetIds: probe.mouseDownTargetIds,
              primarySize:
                ${JSON.stringify(axis)} === 'width'
                  ? primary.getBoundingClientRect().width
                  : primary.getBoundingClientRect().height,
              ariaValueNow: separator.getAttribute('aria-valuenow'),
              ariaValueText: separator.getAttribute('aria-valuetext'),
              documentScrollLeft: document.scrollingElement.scrollLeft,
              documentScrollTop: document.scrollingElement.scrollTop,
              documentOverflowX:
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
              documentOverflowY:
                document.documentElement.scrollHeight - document.documentElement.clientHeight,
            });
            probe.controller.abort();
          })))`,
          true,
        );
        expect({
          hitTargetId: before.hitTargetId,
          deliveries: after.deliveries,
          mouseDownTargetIds: after.mouseDownTargetIds,
          documentScrollLeft: after.documentScrollLeft,
          documentScrollTop: after.documentScrollTop,
          documentOverflowX: after.documentOverflowX,
          documentOverflowY: after.documentOverflowY,
        }).toEqual({
          hitTargetId: selector.slice(1),
          deliveries: 1,
          mouseDownTargetIds: [selector.slice(1)],
          documentScrollLeft: 0,
          documentScrollTop: 0,
          documentOverflowX: 0,
          documentOverflowY: 0,
        });
        expect(after.primarySize).toBeGreaterThan(before.primarySize);
        expect(Number(after.ariaValueNow)).toBeGreaterThan(Number(before.ariaValueNow));
        expect(after.ariaValueText).not.toBe(before.ariaValueText);
      };

      for (const width of [800, 801]) {
        await applyScenario(width, SEPARATOR_FOCUS_THEMES[0]);
        await dragSeparator(
          '#resizer',
          '#tableWrap',
          width <= 800 ? 'height' : 'width',
          20,
        );
        await dragSeparator('#inspector-divider', '#inspector-request', 'height', 20);
      }
    } finally {
      if (cdp) await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  },
  TEST_TIMEOUT_MS,
);

// Tier 1 UX review fix-ups: the reopened details pane re-clamps its remembered
// width, the grid's elastic Path column fills a wide wrap without changing the
// stored widths, and the Match gutter clips its label by real width.
const settleLayout = (cdp) =>
  evaluate(
    cdp,
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))))',
    true,
  );

// Reloads the already-open panel in another language. Everything the panel
// persists is cleared first, so the next pass starts from the same blank
// profile a second launchPanelPage() gave it — and the preference, read once
// at load, is the only thing that differs. This replaces a second browser
// spawn, and spawning is the suite's one flaky step.
const reloadInLanguage = async (page, language) => {
  await evaluate(page.cdp, "localStorage.clear(); localStorage.setItem('networkPlus.lang', '" + language + "'); true");
  await page.navigate();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(page.cdp, "document.documentElement.lang === '" + language + "'")) return;
    await delay(50);
  }
  throw new Error('The panel never reloaded in ' + language + '.');
};

const activateSampleCapture = (cdp) =>
  evaluate(
    cdp,
    `(async () => {
      const sampleButton = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent.trim() === 'Explore sample capture',
      );
      if (!sampleButton) throw new Error('Sample capture action was not found.');
      sampleButton.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document.querySelectorAll('#tbody tr[data-row-id]').length;
    })()`,
    true,
  );

const MAIN_SPLIT_MEASURE = `(() => {
  const content = document.querySelector('#content').getBoundingClientRect();
  const table = document.querySelector('#tableWrap').getBoundingClientRect();
  const details = document.querySelector('#details');
  return {
    detailsHidden: details.hidden,
    detailsFlexBasis: details.style.flexBasis,
    detailsWidth: Math.round(details.getBoundingClientRect().width),
    tableWidth: Math.round(table.width),
    contentWidth: Math.round(content.width),
    ariaValueNow: document.querySelector('#resizer').getAttribute('aria-valuenow'),
  };
})()`;

browserTest(
  'reopening the details pane re-clamps its remembered width to the narrower window',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: "localStorage.setItem('networkPlus.detailsWidth.v1', '700');",
    });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      const restored = await evaluate(cdp, MAIN_SPLIT_MEASURE);
      expect(restored).toEqual({
        detailsHidden: false,
        detailsFlexBasis: '700px',
        detailsWidth: 700,
        tableWidth: 576,
        contentWidth: 1280,
        ariaValueNow: '45',
      });

      // Close the pane, shrink the window past what the remembered 700px
      // allows, then reopen it by selecting another row.
      await evaluate(cdp, "document.querySelector('#detailsCloseBtn').click()");
      await settleLayout(cdp);
      expect((await evaluate(cdp, MAIN_SPLIT_MEASURE)).detailsHidden).toBe(true);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 900,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await settleLayout(cdp);
      await evaluate(cdp, "document.querySelectorAll('#tbody tr[data-row-id]')[1].click()");
      await settleLayout(cdp);
      const reopened = await evaluate(cdp, MAIN_SPLIT_MEASURE);
      // 900 - 4px resizer - 240px minimum grid = 656px, the widest pane that
      // still honours the minimum grid; the stale 700px would have left 196px.
      expect(reopened).toEqual({
        detailsHidden: false,
        detailsFlexBasis: '656px',
        detailsWidth: 656,
        tableWidth: 240,
        contentWidth: 900,
        ariaValueNow: '27',
      });
      expect(reopened.detailsWidth).toBeGreaterThanOrEqual(400);
      expect(reopened.detailsWidth).toBeLessThanOrEqual(900 - 4 - 240);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

// A wide header font (Linux fallback faces, Verdana) once pushed the last
// label past the table edge and forced a horizontal scrollbar even though the
// grid filled the wrap exactly; header cells now clip their labels instead.
browserTest(
  'header labels wider than their column clip instead of forcing a horizontal scrollbar',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript:
        "document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.title-row th { font-size: 18px !important; letter-spacing: 2px !important; }'; document.head.appendChild(style); });",
    });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await evaluate(cdp, "document.querySelector('#detailsCloseBtn').click()");
      await settleLayout(cdp);
      const measured = await evaluate(
        cdp,
        `(() => {
          const wrap = document.querySelector('#tableWrap');
          const last = document.querySelector('th[data-col-id="clientStart"]');
          const label = last.querySelector('.column-header-label');
          return {
            horizontalScroll: wrap.scrollWidth > wrap.clientWidth,
            gridWidth: Math.round(document.querySelector('#grid').getBoundingClientRect().width),
            wrapClientWidth: wrap.clientWidth,
            labelWiderThanCell:
              label.getBoundingClientRect().width >
              last.clientWidth - parseFloat(getComputedStyle(last).paddingLeft) - parseFloat(getComputedStyle(last).paddingRight),
            headerOverflow: getComputedStyle(last).overflow,
          };
        })()`,
      );
      expect(measured.labelWiderThanCell).toBe(true);
      expect(measured).toMatchObject({
        horizontalScroll: false,
        gridWidth: measured.wrapClientWidth,
        headerOverflow: 'hidden',
      });
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

const ELASTIC_GRID_MEASURE = `(() => {
  const tableWrap = document.querySelector('#tableWrap');
  const grid = document.querySelector('#grid');
  const headers = Array.from(document.querySelectorAll('thead th[data-col-id]'));
  const pathResizer = document.querySelector('th[data-col-id="path"] .col-resizer');
  const stored = JSON.parse(localStorage.getItem('networkPlus.cols') || '[]');
  return {
    wrapClientWidth: tableWrap.clientWidth,
    horizontalScroll: tableWrap.scrollWidth > tableWrap.clientWidth,
    gridStyleWidth: grid.style.width,
    gridWidth: Math.round(grid.getBoundingClientRect().width),
    headerWidths: Object.fromEntries(
      headers.map((th) => [th.dataset.colId, Math.round(th.getBoundingClientRect().width)]),
    ),
    pathAriaValueNow: pathResizer ? pathResizer.getAttribute('aria-valuenow') : null,
    storedPathWidth: (stored.find((column) => column.id === 'path') || {}).width ?? null,
  };
})()`;

browserTest(
  'the elastic Path column fills a wide wrap while the stored widths stay authoritative',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, width: 1280, height: 800 });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      // A synchronous style write inside the observer callback surfaces as
      // the "ResizeObserver loop completed with undelivered notifications"
      // window error; every layout change below must leave this list empty.
      await evaluate(
        cdp,
        `(() => {
          window.__resizeObserverErrors = [];
          window.addEventListener('error', (event) => {
            window.__resizeObserverErrors.push(event.message);
          });
        })()`,
      );
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      // Sample activation selects a row, so the pane is open: 1280 - 4 - the
      // stylesheet's clamp() basis leaves a wrap narrower than the 992px sum.
      const paneOpen = await evaluate(cdp, ELASTIC_GRID_MEASURE);
      expect(paneOpen.wrapClientWidth).toBeLessThan(992);
      expect(paneOpen).toMatchObject({
        horizontalScroll: true,
        gridStyleWidth: '992px',
        gridWidth: 992,
        pathAriaValueNow: '260',
      });
      expect(paneOpen.headerWidths).toEqual({
        match: 36,
        id: 60,
        method: 80,
        status: 70,
        domain: 140,
        path: 260,
        type: 90,
        duration: 80,
        size: 72,
        clientStart: 104,
      });

      // Closing the pane widens the wrap past the sum: the surplus lands on
      // Path's rendered width only, and the grid spans the wrap exactly.
      await evaluate(cdp, "document.querySelector('#detailsCloseBtn').click()");
      await settleLayout(cdp);
      const paneClosed = await evaluate(cdp, ELASTIC_GRID_MEASURE);
      expect(paneClosed.wrapClientWidth).toBeGreaterThan(992);
      const closedSurplus = paneClosed.wrapClientWidth - 992;
      expect(paneClosed).toMatchObject({
        horizontalScroll: false,
        gridStyleWidth: paneClosed.wrapClientWidth + 'px',
        gridWidth: paneClosed.wrapClientWidth,
        pathAriaValueNow: '260',
      });
      expect(paneClosed.headerWidths).toEqual({
        ...paneOpen.headerWidths,
        path: 260 + closedSurplus,
      });

      // A keyboard resize on the elastic Path stores the new px (270) while
      // the rendered width keeps absorbing the recomputed surplus.
      await evaluate(
        cdp,
        `(() => {
          const resizer = document.querySelector('th[data-col-id="path"] .col-resizer');
          resizer.focus();
          resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        })()`,
      );
      await settleLayout(cdp);
      const afterKeyboard = await evaluate(cdp, ELASTIC_GRID_MEASURE);
      expect(afterKeyboard).toMatchObject({
        horizontalScroll: false,
        gridWidth: paneClosed.wrapClientWidth,
        pathAriaValueNow: '270',
        storedPathWidth: 270,
      });
      expect(afterKeyboard.headerWidths.path).toBe(270 + (paneClosed.wrapClientWidth - 1002));

      // Path hidden: the surplus moves to the last visible column instead.
      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#columnsBtn').click();
          const item = Array.from(document.querySelectorAll('#columnsMenu [role="menuitemcheckbox"]')).find(
            (button) => button.textContent.trim() === '☑ Path',
          );
          if (!item) throw new Error('The Path column toggle was not found.');
          item.click();
          document.querySelector('#columnsBtn').click();
        })()`,
      );
      await settleLayout(cdp);
      const pathHidden = await evaluate(cdp, ELASTIC_GRID_MEASURE);
      expect(pathHidden.headerWidths.path).toBeUndefined();
      expect(pathHidden).toMatchObject({
        horizontalScroll: false,
        gridWidth: pathHidden.wrapClientWidth,
        pathAriaValueNow: null,
      });
      expect(pathHidden.headerWidths.clientStart).toBe(104 + (pathHidden.wrapClientWidth - 732));

      // Widening the wrap with the pane closed (window resize) re-applies the
      // surplus from the observer without tripping the loop-limit error.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1920,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await settleLayout(cdp);
      const widened = await evaluate(cdp, ELASTIC_GRID_MEASURE);
      expect(widened.wrapClientWidth).toBeGreaterThan(pathHidden.wrapClientWidth);
      expect(widened).toMatchObject({ horizontalScroll: false, gridWidth: widened.wrapClientWidth });
      expect(widened.headerWidths.clientStart).toBe(104 + (widened.wrapClientWidth - 732));
      expect(await evaluate(cdp, 'window.__resizeObserverErrors')).toEqual([]);
      expect(await evaluate(cdp, "document.querySelector('#statusText').textContent")).not.toContain(
        'ResizeObserver',
      );
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

const MATCH_GUTTER_MEASURE = `(() => {
  const th = document.querySelector('thead th[data-col-id="match"]');
  const label = th.querySelector('.column-header-label');
  const stored = JSON.parse(localStorage.getItem('networkPlus.cols') || '[]');
  return {
    order: Array.from(document.querySelectorAll('thead th[data-col-id]')).map((header) => header.dataset.colId).slice(0, 3),
    styleWidth: th.style.width,
    gutterHeader: th.classList.contains('gutter-header'),
    labelClipped: label.getBoundingClientRect().width <= 1,
    ariaLabel: th.getAttribute('aria-label'),
    title: th.title,
    storedMatchWidth: (stored.find((column) => column.id === 'match') || {}).width ?? null,
    storedVersion: localStorage.getItem('networkPlus.cols.v'),
  };
})()`;

browserTest(
  'the Match gutter takes the v4 width on upgrade, clips its label only at gutter width, and fits two chips',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: `if (!localStorage.getItem('__networkPlusSeeded')) {
        localStorage.setItem('__networkPlusSeeded', '1');
        localStorage.setItem('networkPlus.cols', JSON.stringify([
          { id: 'id', visible: true, width: 60 },
          { id: 'match', visible: true, width: 64 },
          { id: 'method', visible: true, width: 80 },
        ]));
        localStorage.setItem('networkPlus.cols.v', '3');
      }`,
    });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      // v3 prefs: the version bump resets Match to the 36px gutter width and
      // keeps the saved order (ID before Match) and the other widths.
      expect(await evaluate(cdp, MATCH_GUTTER_MEASURE)).toEqual({
        order: ['id', 'match', 'method'],
        styleWidth: '36px',
        gutterHeader: true,
        labelClipped: true,
        ariaLabel: 'Match',
        title: 'Match: search and selection state; Alt+Left/Right Arrow to reorder',
        storedMatchWidth: 36,
        storedVersion: '4',
      });

      // v4 prefs with a user-kept 64px Match: no reset, label stays visible.
      await evaluate(
        cdp,
        `(() => {
          localStorage.setItem('networkPlus.cols', JSON.stringify([
            { id: 'match', visible: true, width: 64 },
            { id: 'id', visible: true, width: 60 },
          ]));
          localStorage.setItem('networkPlus.cols.v', '4');
        })()`,
      );
      await page.navigate();
      await waitForSampleCaptureAction(cdp);
      expect(await evaluate(cdp, MATCH_GUTTER_MEASURE)).toEqual({
        order: ['match', 'id', 'method'],
        styleWidth: '64px',
        gutterHeader: false,
        labelClipped: false,
        ariaLabel: 'Match',
        title: 'Match: search and selection state; Alt+Left/Right Arrow to reorder',
        storedMatchWidth: 64,
        storedVersion: '4',
      });

      // Factory defaults: the selected row's ✓ chip and one keyword chip both
      // fit inside the 36px gutter's content box without clipping.
      await evaluate(
        cdp,
        "localStorage.removeItem('networkPlus.cols'); localStorage.removeItem('networkPlus.cols.v');",
      );
      await page.navigate();
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      await evaluate(
        cdp,
        `(() => {
          const domain = document.querySelector('#tbody tr.selected td[data-col-id="domain"]').textContent.trim();
          document.querySelector('#searchToggleBtn').click();
          const input = document.querySelector('.search-keyword-input');
          input.value = domain;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`,
      );
      await delay(600);
      await settleLayout(cdp);
      const chips = await evaluate(
        cdp,
        `(() => {
          const td = document.querySelector('#tbody tr.selected td[data-col-id="match"]');
          const tdRect = td.getBoundingClientRect();
          const badges = Array.from(td.querySelectorAll('.row-state-badge')).map((badge) => {
            const rect = badge.getBoundingClientRect();
            return { text: badge.textContent.trim(), inside: rect.left >= tdRect.left && rect.right <= tdRect.right };
          });
          return {
            columnWidth: Math.round(tdRect.width),
            clipped: td.scrollWidth > td.clientWidth,
            badges,
          };
        })()`,
      );
      expect(chips).toEqual({
        columnWidth: 36,
        clipped: false,
        badges: [
          { text: '✓', inside: true },
          { text: '1', inside: true },
        ],
      });
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

// Tier 2 UX: the details header names the request in parts (method badge,
// host, middle-ellipsised pathname, query count), copies its sanitized URL,
// and a summary strip under it keeps the response facts visible on every tab.
const DETAILS_HEADER_MEASURE = `(() => {
  const title = document.querySelector('#detailsTitle');
  const pathEl = title.querySelector('.details-title-path');
  const summary = document.querySelector('#detailsSummary');
  const details = document.querySelector('#details').getBoundingClientRect();
  const summaryRect = summary.getBoundingClientRect();
  const badge = title.querySelector('.details-title-method');
  const query = title.querySelector('.details-title-query');
  return {
    text: title.textContent,
    titleAttr: title.getAttribute('title'),
    badge: badge ? { text: badge.textContent, className: badge.className } : null,
    host: title.querySelector('.details-title-host')?.textContent ?? null,
    path: pathEl ? pathEl.textContent : null,
    pathClipped: pathEl ? pathEl.scrollWidth > pathEl.clientWidth : null,
    titleClipped: title.scrollWidth > title.clientWidth,
    query: query ? { text: query.textContent, title: query.title } : null,
    copyHidden: document.querySelector('#detailsCopyUrlBtn').hidden,
    copyLabel: document.querySelector('#detailsCopyUrlBtn').getAttribute('aria-label'),
    summaryHidden: summary.hidden,
    summaryItems: Array.from(summary.children).map((item) => ({ text: item.textContent, className: item.className })),
    summaryInsidePane: summary.hidden || (summaryRect.left >= details.left && summaryRect.right <= details.right + 0.5),
    summaryOverflows: summary.scrollWidth > summary.clientWidth,
    responseInfoKeys: Array.from(document.querySelectorAll('#res-headers .kv .key')).map((key) => key.textContent),
    requestInfoKeys: Array.from(document.querySelectorAll('#req-headers .kv:first-of-type .key')).map(
      (key) => key.textContent,
    ),
  };
})()`;

// The empty tab keeps full-opacity token text plus its marker, so its
// composited contrast is measured the way a reader sees it: colour and
// opacity resolved, over the first opaque background behind the button.
// The inspector tabs that carry a count, pinned here as a literal. The
// marker expectation below is derived from THIS list, never read back from
// the data-count attribute that draws the marker: an expectation taken from
// its own driver agrees with whatever the panel does. Headers, Body, Preview
// and Raw hold one document or none, so an empty one takes an en dash rather
// than a "0" that would read as a count of zero items.
const COUNTED_INSPECTOR_TABS = ['req-query', 'req-cookies', 'res-cookies'];

const EMPTY_TAB_CONTRAST_MEASURE = `(() => {
  const parse = (value) => value.match(/[\\d.]+/g).map(Number);
  const luminance = (rgb) =>
    rgb.slice(0, 3).reduce((total, channel, index) => {
      const srgb = channel / 255;
      const linear = srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
      return total + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  const ratio = (a, b) => {
    const lighter = Math.max(luminance(a), luminance(b));
    const darker = Math.min(luminance(a), luminance(b));
    return (lighter + 0.05) / (darker + 0.05);
  };
  const opaqueBackground = (element) => {
    let node = element;
    while (node && node !== document.documentElement) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour.length < 4 || colour[3] > 0) return colour;
      node = node.parentElement;
    }
    return [255, 255, 255, 1];
  };
  return Array.from(document.querySelectorAll('.tab-btn.is-empty')).map((button) => {
    const style = getComputedStyle(button);
    const background = opaqueBackground(button);
    const alpha = Number(style.opacity);
    const foreground = parse(style.color).slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
    return {
      tab: button.dataset.tab,
      label: button.textContent,
      counted: button.hasAttribute('data-count'),
      opacity: style.opacity,
      marker: getComputedStyle(button, '::after').content,
      ratio: Number(ratio(foreground, background).toFixed(2)),
    };
  });
})()`;

// Counts ResizeObservers that are alive right now: constructed minus
// disconnected. A pane that builds a fresh observer per render leaks two to
// four per row selection, which is invisible in the DOM and only shows here.
const RESIZE_OBSERVER_CENSUS_INIT_SCRIPT = `(() => {
  const Native = window.ResizeObserver;
  let live = 0;
  globalThis.__networkPlusLiveResizeObservers = () => live;
  window.ResizeObserver = class extends Native {
    constructor(callback) {
      super(callback);
      this.__networkPlusCounted = true;
      live += 1;
    }
    disconnect() {
      if (this.__networkPlusCounted) {
        this.__networkPlusCounted = false;
        live -= 1;
      }
      return super.disconnect();
    }
  };
})();`;

const CLIPBOARD_CAPTURE_INIT_SCRIPT = `(() => {
  globalThis.__networkPlusCopied = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText(text) {
        globalThis.__networkPlusCopied.push(text);
        return Promise.resolve();
      },
    },
  });
})();`;

// Waits, inside the page, for the thing an assertion is about instead of
// sleeping a fixed stretch against the 150ms pane-search debounce. The old
// stretch stays as the timeout, so the wait can only get shorter: when the
// observable never moves this degrades to exactly the sleep it replaced.
const WAIT_FOR_IN_PAGE = `
  const waitFor = async (predicate, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return predicate();
  };
`;

const LIVE_CAPTURE_INIT_SCRIPT = `(() => {
  const chromeApi = globalThis.chrome || {};
  chromeApi.storage = {
    local: {
      get(_keys, callback) {
        callback({});
      },
      set(_value, callback) {
        if (callback) callback();
      },
    },
  };
  chromeApi.runtime = {
    lastError: null,
    getManifest() {
      return { version: '1.6.0' };
    },
  };
  chromeApi.devtools = {
    network: {
      onRequestFinished: {
        addListener(listener) {
          globalThis.__networkPlusLiveListener = listener;
        },
      },
    },
    panels: {
      openResource() {},
    },
  };
  globalThis.chrome = chromeApi;
})();`;

browserTest(
  'the details header names the request in parts and the summary strip survives tab changes',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: CLIPBOARD_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);

      // Nothing the sample selects should leave the strip hidden: the first
      // selected row is the 200, so the strip already shows.
      await evaluate(
        cdp,
        `(() => {
          const row = Array.from(document.querySelectorAll('#tbody tr[data-row-id]')).find((tr) =>
            tr.textContent.includes('503'),
          );
          if (!row) throw new Error('The sample 503 row was not found.');
          row.click();
          document.querySelector('#res-tab-body').click();
        })()`,
      );
      await settleLayout(cdp);
      const failed = await evaluate(cdp, DETAILS_HEADER_MEASURE);
      expect(failed).toEqual({
        text: 'POST checkout.network-plus.test/v1/orders/preview',
        titleAttr: 'POST https://checkout.network-plus.test/v1/orders/preview',
        badge: { text: 'POST', className: 'details-title-method method-POST' },
        host: 'checkout.network-plus.test',
        path: '/v1/orders/preview',
        pathClipped: false,
        titleClipped: false,
        query: null,
        copyHidden: false,
        copyLabel: 'Copy sanitized URL',
        summaryHidden: false,
        summaryItems: [
          { text: '503 Service Unavailable', className: 'details-summary-item details-summary-status details-summary-status--5xx' },
          { text: 'application/json', className: 'details-summary-item details-summary-type' },
          { text: '78 B', className: 'details-summary-item details-summary-size' },
          { text: '2.45 s', className: 'details-summary-item details-summary-duration' },
          { text: 'HTTP/2', className: 'details-summary-item details-summary-protocol' },
          { text: 'Retry-After: 30', className: 'details-summary-item details-summary-chip' },
        ],
        summaryInsidePane: true,
        summaryOverflows: false,
        // The strip already states status, protocol, size, and duration, so
        // Response > Headers no longer repeats them above the header list —
        // and Request > Headers drops the same Protocol row, keeping Method,
        // Operation and the URL breakdown.
        responseInfoKeys: expect.not.arrayContaining(['Status', 'Protocol', 'Size', 'Duration']),
        requestInfoKeys: ['Method', 'URL'],
      });
      expect(
        await evaluate(cdp, "document.querySelector('#res-body').classList.contains('active')"),
      ).toBe(true);

      // The status badge takes its colour from the same 5xx token as the grid.
      const colours = await evaluate(
        cdp,
        `(() => ({
          strip: getComputedStyle(document.querySelector('.details-summary-status--5xx')).color,
          grid: getComputedStyle(document.querySelector('#tbody tr.status-5xx .status-cell')).color,
          badgeBg: getComputedStyle(document.querySelector('.details-title-method')).backgroundColor,
          gridBadgeBg: getComputedStyle(document.querySelector('#tbody tr.method-POST .method-badge')).backgroundColor,
        }))()`,
      );
      expect(colours.strip).toBe(colours.grid);
      expect(colours.badgeBg).toBe(colours.gridBadgeBg);

      // An empty pane's tab stays clickable, so its label is interactive text.
      // The signal is the marker after the label, never a dimmed label: the
      // old opacity:.55 composited the 12px/600 text below AA on the tab bar.
      // Counted tabs take a 0; Body and Raw count nothing and take an en dash.
      const emptyTabs = await evaluate(cdp, EMPTY_TAB_CONTRAST_MEASURE);
      expect(emptyTabs.length).toBeGreaterThan(0);
      // Not vacuous: this state really does hold a counted empty tab, so the
      // "0" branch of the rule below is exercised here. The en-dash branch
      // belongs to Body and Raw and is exercised in the tabs test above,
      // which selects a row with neither a request body nor a response one.
      expect(emptyTabs.some((tab) => COUNTED_INSPECTOR_TABS.includes(tab.tab))).toBe(true);
      for (const tab of emptyTabs) {
        const counted = COUNTED_INSPECTOR_TABS.includes(tab.tab);
        expect([tab.tab, tab.opacity]).toEqual([tab.tab, '1']);
        // Both halves of the pair are checked against the literal: the
        // attribute the panel stamps, and the marker CSS draws from it.
        expect([tab.tab, tab.counted]).toEqual([tab.tab, counted]);
        expect([tab.tab, tab.marker]).toEqual([tab.tab, counted ? '"0"' : '"\u2013"']);
        expect([tab.tab, tab.ratio >= 4.5]).toEqual([tab.tab, true]);
      }

      // At the 440px pane minimum the strip wraps. The separator is drawn on
      // the item before it, so no wrapped line can open on a dangling middot.
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = '440px'");
      await settleLayout(cdp);
      const wrappedStrip = await evaluate(
        cdp,
        `(() => {
          const strip = document.querySelector('#detailsSummary');
          const items = Array.from(strip.children);
          const rows = new Map();
          for (const item of items) {
            const top = Math.round(item.getBoundingClientRect().top);
            if (!rows.has(top)) rows.set(top, []);
            rows.get(top).push(item);
          }
          return {
            rowCount: rows.size,
            overflow: strip.scrollWidth - strip.clientWidth,
            leadingSeparators: Array.from(rows.values()).map(
              (row) => getComputedStyle(row[0], '::before').content,
            ),
            trailingSeparators: items.map((item) => getComputedStyle(item, '::after').content),
            firstOfEachRow: Array.from(rows.values()).map((row) => row[0].textContent),
          };
        })()`,
      );
      expect(wrappedStrip.rowCount).toBe(2);
      expect(wrappedStrip.overflow).toBeLessThanOrEqual(0);
      expect(wrappedStrip.firstOfEachRow).toEqual(['503 Service Unavailable', 'Retry-After: 30']);
      // Nothing draws a leading separator any more; every item but the last
      // draws a trailing one, so it travels with the item it follows.
      expect(wrappedStrip.leadingSeparators).toEqual(['none', 'none']);
      expect(wrappedStrip.trailingSeparators).toEqual(['"·"', '"·"', '"·"', '"·"', '"·"', 'none']);
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = ''");
      await settleLayout(cdp);

      // Copy URL goes through the same sanitized payload and toast as the row menu.
      const copied = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const before = globalThis.__networkPlusCopied.length;
          document.querySelector('#detailsCopyUrlBtn').click();
          await waitFor(() => globalThis.__networkPlusCopied.length > before, 100);
          const toast = document.querySelector('#copyToast');
          return {
            copied: globalThis.__networkPlusCopied,
            toast: toast.textContent,
            toastShown: toast.classList.contains('show'),
          };
        })()`,
        true,
      );
      expect(copied).toEqual({
        copied: ['https://checkout.network-plus.test/v1/orders/preview'],
        toast: 'Copied sanitized URL',
        toastShown: true,
      });

      // The 304 row: a bare code plus reason, the ETag row in monospace.
      await evaluate(
        cdp,
        `(() => {
          Array.from(document.querySelectorAll('#tbody tr[data-row-id]')).find((tr) => tr.textContent.includes('304')).click();
          document.querySelector('#res-tab-headers').click();
        })()`,
      );
      await settleLayout(cdp);
      const notModified = await evaluate(cdp, DETAILS_HEADER_MEASURE);
      expect(notModified.text).toBe('GET static.network-plus.test/assets/network-plus.css');
      expect(notModified.summaryItems.map((item) => item.text)).toEqual([
        '304 Not Modified',
        'text/css',
        '0 B',
        '24 ms',
        'HTTP/2',
      ]);
      expect(notModified.responseInfoKeys).not.toContain('Status');
      expect(notModified.requestInfoKeys).toEqual(['Method', 'URL']);
      const monoRows = await evaluate(
        cdp,
        `(() => {
          const rows = Array.from(document.querySelectorAll('#res-headers .kv .key')).map((key) => ({
            key: key.textContent,
            mono: key.nextElementSibling.classList.contains('val--mono'),
            font: getComputedStyle(key.nextElementSibling).fontFamily,
            fontSize: getComputedStyle(key.nextElementSibling).fontSize,
          }));
          return rows.filter((row) => row.key === 'ETag' || row.key === 'Cache-Control');
        })()`,
      );
      expect(monoRows).toEqual([
        {
          key: 'Cache-Control',
          mono: false,
          font: expect.not.stringContaining('Cascadia Code'),
          fontSize: '13px',
        },
        {
          key: 'ETag',
          mono: true,
          font: expect.stringContaining('Cascadia Code'),
          fontSize: '12px',
        },
      ]);

      // Leaving the sample clears the pane: the plain empty-state title comes
      // back and the request identity that belongs to nothing is hidden.
      await evaluate(cdp, "document.querySelector('#sampleExitBtn').click()");
      await settleLayout(cdp);
      const closed = await evaluate(
        cdp,
        `(() => {
          const title = document.querySelector('#detailsTitle');
          return {
            text: title.textContent,
            // #detailsTitle is a flex row, so the empty state cannot be a bare
            // text node: an anonymous flex item takes no overflow of its own
            // and pushed the pane instead of ellipsising. One element, and no
            // part of the previous request's identity beside it.
            childClasses: Array.from(title.children).map((child) => child.className),
            labelOverflow: getComputedStyle(title.querySelector('.details-title-text')).textOverflow,
            titleAttr: title.getAttribute('title'),
            summaryHidden: document.querySelector('#detailsSummary').hidden,
            copyHidden: document.querySelector('#detailsCopyUrlBtn').hidden,
          };
        })()`,
      );
      expect(closed).toEqual({
        text: 'Select a request...',
        childClasses: ['details-title-text'],
        labelOverflow: 'ellipsis',
        titleAttr: null,
        summaryHidden: true,
        copyHidden: true,
      });
      // At a pane far narrower than the label, the label clips itself and
      // paints the ellipsis; the row it sits in does not overflow.
      const narrowEmptyTitle = await evaluate(
        cdp,
        `(async () => {
          const details = document.querySelector('#details');
          const title = document.querySelector('#detailsTitle');
          const label = title.querySelector('.details-title-text');
          label.textContent = 'Select a request from the list on the left to inspect every part of it';
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const before = { paneWidth: Math.round(details.getBoundingClientRect().width) };
          details.style.flexBasis = '440px';
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const result = {
            before,
            labelClipped: label.scrollWidth > label.clientWidth,
            labelInsideTitle:
              Math.round(label.getBoundingClientRect().right) <= Math.round(title.getBoundingClientRect().right),
            titleOverflows: title.scrollWidth > title.clientWidth,
          };
          details.style.flexBasis = '';
          return result;
        })()`,
        true,
      );
      expect(narrowEmptyTitle.labelClipped).toBe(true);
      expect(narrowEmptyTitle.labelInsideTitle).toBe(true);
      expect(narrowEmptyTitle.titleOverflows).toBe(false);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'long URLs ellipsise in the header, break down in the URL row, and clamp long header values',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: LIVE_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      await waitForLiveNetworkListener(cdp);
      const injected = await evaluate(
        cdp,
        `(async () => {
          const settle = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
          const query = Array.from({ length: 31 }, (_u, i) => 'p' + i + '=' + 'v'.repeat(30) + i).join('&');
          const adUrl =
            'https://securepubads.example.test/gampad/ads/deep/nested/segments/for/ellipsis/final-segment.js?' + query;
          const cookie = Array.from({ length: 25 }, (_u, i) => 'c' + i + '=' + 'x'.repeat(8)).join(';');
          const entries = [
            {
              request: {
                method: 'GET',
                url: adUrl,
                headers: [
                  { name: 'Accept', value: 'text/html' },
                  { name: 'Cookie', value: cookie },
                  { name: 'Authorization', value: 'Bearer abc.def.ghi' },
                  { name: 'User-Agent', value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
                ],
              },
              response: { status: 200, statusText: 'OK', headers: [{ name: 'content-type', value: 'text/javascript; charset=utf-8' }] },
            },
            {
              request: { method: 'GET', url: 'https://app.example.test/dashboard', headers: [] },
              response: {
                status: 302,
                statusText: 'Found',
                headers: [{ name: 'Location', value: 'https://auth.example.test/login?next=%2Fdashboard' }],
              },
            },
            {
              request: { method: 'GET', url: 'https://api.example.test/customers/cus_8842', headers: [] },
              response: {
                status: 401,
                statusText: 'Unauthorized',
                headers: [
                  { name: 'content-type', value: 'application/problem+json' },
                  { name: 'www-authenticate', value: 'Bearer realm="api", error="invalid_token"' },
                ],
              },
            },
            {
              request: {
                method: 'POST',
                url: 'https://api.deep-nested-graphql-host.example.test/v1/graphql/gateway/edge',
                headers: [{ name: 'Content-Type', value: 'application/json' }],
                postData: {
                  mimeType: 'application/json',
                  text: JSON.stringify({ query: 'query ViewerProfileWithEverything { viewer { fullName } }' }),
                },
              },
              response: { status: 200, statusText: 'OK', headers: [{ name: 'content-type', value: 'application/json' }] },
            },
            {
              // A method is captured request data, and it reaches a class
              // attribute in both the grid and the details header. This one
              // carries a space and a quote so an unguarded className would
              // break out of its token.
              request: { method: 'GET" onload="x', url: 'https://api.example.test/v1/unknown-verb', headers: [] },
              response: { status: 200, statusText: 'OK', headers: [{ name: 'content-type', value: 'text/plain' }] },
            },
          ];
          entries.forEach((entry, index) => {
            globalThis.__networkPlusLiveListener({
              startedDateTime: new Date(1704067200000 + index * 1000).toISOString(),
              time: 40 + index,
              request: { ...entry.request, httpVersion: 'HTTP/2' },
              response: { ...entry.response, httpVersion: 'HTTP/2', content: { size: 9, mimeType: 'text/plain' } },
              getContent(callback) {
                callback('', '');
              },
            });
          });
          await settle();
          return { rows: document.querySelectorAll('#tbody tr[data-row-id]').length, cookieLength: cookie.length, adUrl };
        })()`,
        true,
      );
      expect(injected.rows).toBe(5);
      expect(injected.cookieLength).toBeGreaterThan(240);

      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#tbody tr[data-row-id="1"]').click();
          document.querySelector('#req-tab-headers').click();
        })()`,
      );
      await settleLayout(cdp);
      const adHeader = await evaluate(cdp, DETAILS_HEADER_MEASURE);
      expect(adHeader.badge).toEqual({ text: 'GET', className: 'details-title-method method-GET' });
      expect(adHeader.host).toBe('securepubads.example.test');
      // The pathname is longer than the header can hold: the middle gives way
      // and the file name stays, and the span itself does not clip.
      expect(adHeader.path).toContain('…');
      expect(adHeader.path.endsWith('/final-segment.js')).toBe(true);
      expect(adHeader.path.length).toBeLessThan('/gampad/ads/deep/nested/segments/for/ellipsis/final-segment.js'.length);
      expect(adHeader.pathClipped).toBe(false);
      expect(adHeader.titleClipped).toBe(false);
      expect(adHeader.query).toEqual({ text: '?31', title: '31 query parameters' });
      // A URL past the tooltip budget is truncated at the tail, never at the
      // head: the method and the scheme survive, and the query is cut where
      // the budget runs out instead of being dropped whole. Dropping it made
      // the tooltip say less than the header for exactly the rows that need it.
      expect(injected.adUrl.length).toBeGreaterThan(300);
      expect(adHeader.titleAttr).toBe(('GET ' + injected.adUrl).slice(0, 300) + '…');
      expect(adHeader.titleAttr).toHaveLength(301);
      expect(
        adHeader.titleAttr.startsWith(
          'GET https://securepubads.example.test/gampad/ads/deep/nested/segments/for/ellipsis/final-segment.js?p0=',
        ),
      ).toBe(true);
      expect(adHeader.text).toBe('GET securepubads.example.test' + adHeader.path + '?31');

      // A narrower pane re-runs the ellipsis: the path shortens further but
      // still ends with the file name — the host gives way (it ellipsises)
      // before the endpoint name does.
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = '440px'");
      await settleLayout(cdp);
      const narrowHeader = await evaluate(cdp, DETAILS_HEADER_MEASURE);
      expect(narrowHeader.path.length).toBeLessThan(adHeader.path.length);
      expect(narrowHeader.path.endsWith('/final-segment.js')).toBe(true);
      expect(narrowHeader.pathClipped).toBe(false);
      expect(narrowHeader.titleClipped).toBe(false);
      expect(narrowHeader.host).toBe('securepubads.example.test');
      expect(narrowHeader.summaryInsidePane).toBe(true);
      expect(narrowHeader.summaryOverflows).toBe(false);
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = ''");
      await settleLayout(cdp);

      // The URL row: origin, pathname, a link into Query, and the raw string
      // behind a toggle.
      const breakdown = await evaluate(
        cdp,
        `(() => {
          const wrap = document.querySelector('#req-headers .url-breakdown');
          const val = wrap.closest('.val');
          const lines = Array.from(wrap.querySelectorAll('.url-breakdown-line'));
          const full = wrap.querySelector('.url-breakdown-full');
          const queryText = wrap.querySelector('.url-breakdown-query-text');
          const address = wrap.querySelector('.url-breakdown-address');
          return {
            mono: val.classList.contains('val--mono'),
            lines: lines.map((line) => ({
              className: line.className,
              // The value text of the line, with the interactive controls
              // taken out: that is what a drag-select can reach.
              value: Array.from(line.childNodes)
                .filter((node) => !(node.nodeType === 1 && node.tagName === 'BUTTON'))
                .map((node) => node.textContent)
                .join(''),
              control: (line.querySelector('button') || {}).textContent || null,
            })),
            hostWeight: getComputedStyle(wrap.querySelector('.url-breakdown-host')).fontWeight,
            addressText: address.textContent,
            addressBlocks: address.querySelectorAll('div,p,li').length,
            addressClamped: address.scrollHeight > address.clientHeight,
            addressLineClamp: getComputedStyle(address).webkitLineClamp,
            fullHidden: full.hidden,
            fullText: full.textContent,
            fullHasWbr: full.querySelectorAll('wbr').length > 30,
            toggleControls: wrap.querySelector('.url-breakdown-toggle-btn').getAttribute('aria-controls'),
            fullId: full.id,
            valHeight: Math.round(val.getBoundingClientRect().height),
          };
        })()`,
      );
      expect(breakdown.mono).toBe(true);
      // The address is one block; only the chrome that is NOT part of the URL
      // keeps a line of its own. A block boundary between the parts of an
      // address puts a newline inside the URL, and the selection below is the
      // assertion that says so.
      expect(breakdown.lines).toEqual([
        {
          className: 'url-breakdown-line url-breakdown-query-action',
          value: '',
          control: '?31 params — open Query',
        },
        { className: 'url-breakdown-line url-breakdown-toggle', value: '', control: 'Show full URL' },
      ]);
      expect(breakdown.addressText).toBe(injected.adUrl);
      expect(breakdown.addressBlocks).toBe(0);
      expect(breakdown.hostWeight).toBe('600');
      // Four lines of address, clipped by CSS, never truncated: the whole
      // string stays in the text nodes, which is why the selection below is
      // complete.
      expect(breakdown.addressLineClamp).toBe('4');
      expect(breakdown.addressClamped).toBe(true);
      // The reveal names the node it owns, so a pane-search hit inside the
      // hidden text presses this toggle and not some other collapsed control.
      expect(breakdown.toggleControls).toBe(breakdown.fullId);
      expect(breakdown.fullId).toMatch(/^urlBreakdownFull-\d+$/);
      // Drag-selecting the row copies the URL, not the chrome around it: the
      // two buttons are interactive controls, and a selection across them
      // used to yield "?31 params — open Query" and "Show full URL" glued to
      // the address. The query used to live ONLY inside that button label and
      // the hidden full text, so the selection was a silently incomplete URL:
      // scheme + host + path, with the query dropped and nothing saying so.
      const selected = await evaluate(
        cdp,
        `(() => {
          const wrap = document.querySelector('#req-headers .url-breakdown');
          const selection = window.getSelection();
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(wrap);
          selection.addRange(range);
          const text = selection.toString();
          selection.removeAllRanges();
          return { text, buttonUserSelect: getComputedStyle(wrap.querySelector('button.link-btn')).userSelect };
        })()`,
      );
      expect(selected.buttonUserSelect).toBe('none');
      // Verbatim, with no normalisation: a selection that needs its newlines
      // stripped before it matches is not an address, and pasting it anywhere
      // that parses a URL fails.
      expect(selected.text).toBe(injected.adUrl);
      expect(selected.text).not.toContain('\n');
      expect(breakdown.fullHidden).toBe(true);
      expect(breakdown.fullText).toBe(injected.adUrl);
      expect(breakdown.fullHasWbr).toBe(true);

      const revealed = await evaluate(
        cdp,
        `(() => {
          const toggle = document.querySelector('#req-headers .url-breakdown-toggle-btn');
          toggle.click();
          const full = document.querySelector('#req-headers .url-breakdown-full');
          return {
            label: toggle.textContent,
            expanded: toggle.getAttribute('aria-expanded'),
            fullHidden: full.hidden,
            fullVisible: full.getBoundingClientRect().height > 0,
            fullHeight: Math.round(full.getBoundingClientRect().height),
          };
        })()`,
      );
      expect(revealed.label).toBe('Hide full URL');
      expect(revealed.expanded).toBe('true');
      expect(revealed.fullHidden).toBe(false);
      expect(revealed.fullVisible).toBe(true);
      // The whole breakdown — origin, the pathname, the two clipped lines of
      // query, the Query control, the reveal — is shorter than the raw URL
      // alone, which is the row it replaced. Pinned against the raw string's
      // own measured height rather than a line count: at the column's width a
      // line count lands within a pixel of the bound and flips with the font.
      expect(breakdown.valHeight).toBeLessThan(revealed.fullHeight);

      const opened = await evaluate(
        cdp,
        `(() => {
          document.querySelector('#req-headers .url-breakdown-query-btn').click();
          return {
            queryActive: document.querySelector('#req-query').classList.contains('active'),
            headersHidden: document.querySelector('#req-headers').hidden,
            tabSelected: document.querySelector('#req-tab-query').getAttribute('aria-selected'),
            focusedTab: document.activeElement?.id || '',
            queryRows: document.querySelectorAll('#req-query .kv .key').length,
          };
        })()`,
      );
      expect(opened).toEqual({
        queryActive: true,
        headersHidden: true,
        tabSelected: 'true',
        focusedTab: 'req-tab-query',
        queryRows: 31,
      });
      await evaluate(cdp, "document.querySelector('#req-tab-headers').click()");

      // Request headers: the 240+ character Cookie clamps to four lines with
      // a per-row toggle; Authorization and Cookie are monospace; a prose
      // User-Agent stays proportional; <wbr> leaves textContent untouched.
      const clamp = await evaluate(
        cdp,
        `(() => {
          const rows = Object.fromEntries(
            Array.from(document.querySelectorAll('#req-headers .kv .key')).map((key) => [key.textContent, key.nextElementSibling]),
          );
          const cookieVal = rows.Cookie;
          const textEl = cookieVal.querySelector('.val-text');
          const toggle = cookieVal.querySelector('.val-clamp-toggle');
          return {
            clampedCount: document.querySelectorAll('#req-headers .val--clamped').length,
            cookieMono: cookieVal.classList.contains('val--mono'),
            authorizationMono: rows.Authorization.classList.contains('val--mono'),
            userAgentMono: rows['User-Agent'].classList.contains('val--mono'),
            acceptMono: rows.Accept.classList.contains('val--mono'),
            textContent: textEl.textContent,
            wbrCount: textEl.querySelectorAll('wbr').length,
            clampedHeight: Math.round(textEl.getBoundingClientRect().height),
            clampedOverflow: textEl.scrollHeight > textEl.clientHeight,
            toggleLabel: toggle.textContent,
            toggleExpanded: toggle.getAttribute('aria-expanded'),
          };
        })()`,
      );
      expect(clamp.clampedCount).toBe(1);
      expect(clamp.cookieMono).toBe(true);
      expect(clamp.authorizationMono).toBe(true);
      expect(clamp.userAgentMono).toBe(false);
      expect(clamp.acceptMono).toBe(false);
      expect(clamp.textContent.length).toBe(injected.cookieLength);
      expect(clamp.wbrCount).toBe(24);
      expect(clamp.clampedHeight).toBe(4 * 18);
      expect(clamp.clampedOverflow).toBe(true);
      expect(clamp.toggleLabel).toBe('Show all (' + injected.cookieLength.toLocaleString('en-US') + ' chars)');
      expect(clamp.toggleExpanded).toBe('false');

      const expanded = await evaluate(
        cdp,
        `(() => {
          const toggle = document.querySelector('#req-headers .val-clamp-toggle');
          toggle.click();
          const textEl = toggle.previousElementSibling;
          return {
            clamped: textEl.classList.contains('val--clamped'),
            overflow: textEl.scrollHeight > textEl.clientHeight,
            taller: textEl.getBoundingClientRect().height > 4 * 18,
            toggleLabel: toggle.textContent,
            toggleExpanded: toggle.getAttribute('aria-expanded'),
          };
        })()`,
      );
      expect(expanded).toEqual({
        clamped: false,
        overflow: false,
        taller: true,
        toggleLabel: 'Show less',
        toggleExpanded: 'true',
      });

      // 3xx and 401 rows surface the header that explains the status.
      await evaluate(cdp, "document.querySelector('#tbody tr[data-row-id=\"2\"]').click()");
      await settleLayout(cdp);
      const redirect = await evaluate(cdp, DETAILS_HEADER_MEASURE);
      expect(redirect.summaryItems).toEqual([
        { text: '302 Found', className: 'details-summary-item details-summary-status details-summary-status--3xx' },
        { text: 'text/plain', className: 'details-summary-item details-summary-type' },
        { text: '9 B', className: 'details-summary-item details-summary-size' },
        { text: '41 ms', className: 'details-summary-item details-summary-duration' },
        { text: 'HTTP/2', className: 'details-summary-item details-summary-protocol' },
        {
          text: 'Location: https://auth.example.test/login?next=%2Fdashboard',
          className: 'details-summary-item details-summary-chip',
        },
      ]);
      expect(redirect.summaryOverflows).toBe(false);

      // https://app.example.test/dashboard has no query, no fragment and no
      // credentials, so the origin and path lines already show the whole URL:
      // the reveal would have disclosed the text beside it, so it is absent.
      const bareBreakdown = await evaluate(
        cdp,
        `(() => {
          const wrap = document.querySelector('#req-headers .url-breakdown');
          const lines = Array.from(wrap.querySelectorAll('.url-breakdown-line'));
          return {
            lines: lines.map((line) => ({ className: line.className, text: line.textContent })),
            toggles: wrap.querySelectorAll('.url-breakdown-toggle-btn').length,
            fulls: wrap.querySelectorAll('.url-breakdown-full').length,
            text: wrap.textContent,
          };
        })()`,
      );
      expect(bareBreakdown).toEqual({
        lines: [],
        toggles: 0,
        fulls: 0,
        text: 'https://app.example.test/dashboard',
      });

      await evaluate(cdp, "document.querySelector('#tbody tr[data-row-id=\"3\"]').click()");
      await settleLayout(cdp);
      const unauthorized = await evaluate(cdp, DETAILS_HEADER_MEASURE);
      expect(unauthorized.text).toBe('GET api.example.test/customers/cus_8842');
      expect(unauthorized.summaryItems.map((item) => item.text)).toEqual([
        '401 Unauthorized',
        'application/problem+json',
        '9 B',
        '42 ms',
        'HTTP/2',
        'WWW-Authenticate: Bearer',
      ]);
      expect(unauthorized.summaryItems[0].className).toContain('details-summary-status--4xx');

      // A GraphQL row on a long host at the 440px pane minimum. The operation
      // is the first thing to yield — the summary strip below already states
      // it — so the header does not degenerate into a capped host beside an
      // ellipsised operation with no readable endpoint between them.
      await evaluate(cdp, "document.querySelector('#tbody tr[data-row-id=\"4\"]').click()");
      await settleLayout(cdp);
      const OPERATION_MEASURE = `(() => {
        const title = document.querySelector('#detailsTitle');
        const pathEl = title.querySelector('.details-title-path');
        const hostEl = title.querySelector('.details-title-host');
        const operation = title.querySelector('.details-title-operation');
        return {
          detailsWidth: Math.round(document.querySelector('#details').getBoundingClientRect().width),
          operationHidden: operation.hidden,
          operationWidth: Math.round(operation.getBoundingClientRect().width),
          operationText: operation.textContent,
          path: pathEl.textContent,
          pathClipped: pathEl.scrollWidth > pathEl.clientWidth,
          titleClipped: title.scrollWidth > title.clientWidth,
          host: hostEl.textContent,
          hostClipped: hostEl.scrollWidth > hostEl.clientWidth,
          // Room the header row leaves unused: its content box minus the span
          // its visible parts actually occupy.
          titleRoomLeftOver: (() => {
            const parts = Array.from(title.children).filter((el) => !el.hidden);
            const first = parts[0].getBoundingClientRect();
            const last = parts[parts.length - 1].getBoundingClientRect();
            return title.clientWidth - (last.right - first.left);
          })(),
          pathLeadsWithEllipsis: pathEl.textContent.startsWith('\\u2026'),
          summaryOperation: document.querySelector('.details-summary-operation').textContent,
          text: title.textContent,
        };
      })()`;
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = '900px'");
      await settleLayout(cdp);
      const wideOperation = await evaluate(cdp, OPERATION_MEASURE);
      expect(wideOperation.detailsWidth).toBe(900);
      expect(wideOperation.operationHidden).toBe(false);
      expect(wideOperation.operationText).toBe('· ViewerProfileWithEverything');
      expect(wideOperation.path).toBe('/v1/graphql/gateway/edge');

      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = '440px'");
      await settleLayout(cdp);
      const narrowOperation = await evaluate(cdp, OPERATION_MEASURE);
      expect(narrowOperation.detailsWidth).toBe(440);
      expect(narrowOperation.operationHidden).toBe(true);
      expect(narrowOperation.operationWidth).toBe(0);
      // It is not lost, only moved: the strip below still names it, and the
      // header keeps the node in its DOM text. `hidden` takes that node out
      // of the accessibility tree, so the strip — not the header — is what
      // assistive tech reads the endpoint from at this width.
      expect(narrowOperation.summaryOperation).toBe('ViewerProfileWithEverything');
      expect(narrowOperation.text).toContain('ViewerProfileWithEverything');
      // What the reader keeps: the host and a path that still ends on the
      // endpoint, neither of them clipped.
      expect(narrowOperation.host).toBe('api.deep-nested-graphql-host.example.test');
      expect(narrowOperation.path.endsWith('/edge')).toBe(true);
      expect(narrowOperation.pathClipped).toBe(false);
      expect(narrowOperation.titleClipped).toBe(false);
      // The room the row has is read back from the container, not from the
      // path's own content box: the host takes every pixel the endpoint does
      // not need. That is the property the old "the host shows 96% of its own
      // text" ratio stood for, and this states it without a font metric —
      // the row leaves no room unused, so whatever the host gives up it gives
      // up to the endpoint, not to the 60% CSS cap that used to hold it short.
      expect(narrowOperation.titleRoomLeftOver).toBeLessThanOrEqual(2);
      // Not vacuous: the host really is the half under pressure at this width,
      // so a row where nothing was clipped could not satisfy the line above.
      expect(narrowOperation.hostClipped).toBe(true);
      // Each half carries its OWN mark, and neither stands in for the other.
      // The rule used to be "exactly one mark in the row", which is how the
      // path came to lose its leading '…' whenever the host happened to
      // CSS-ellipsise: across the whole 400-450px band the row then painted
      // 'api.deep-nested-graphql-host.example.test/edge' for a path that had
      // dropped '/v1/graphql/gateway'. Two marks side by side is the honest
      // render, and they do not in fact collide — the capped host stops short
      // of its own box, so a gap separates its bold mark from the path's muted
      // one. Which half gives way still turns on a layout branch at 440px, so
      // the pin stays the rule rather than the branch.
      expect(narrowOperation.path === '/v1/graphql/gateway/edge' || narrowOperation.pathLeadsWithEllipsis).toBe(
        true,
      );
      expect(narrowOperation.path).toBe(
        narrowOperation.pathLeadsWithEllipsis ? '…/edge' : '/v1/graphql/gateway/edge',
      );
      // Not vacuous: at this width the path really has lost its head, so the
      // line above is not satisfied by a row that was never shortened.
      expect(narrowOperation.pathLeadsWithEllipsis).toBe(true);
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = '900px'");
      await settleLayout(cdp);
      // Widening gives the operation back: it yields, it is not discarded.
      // This one discriminates — fitDetailsTitle only unhides the operation
      // because it resets `hidden` before it re-measures. Its neighbour, the
      // `hostEl.style.maxWidth = ''` reset, is defence in depth and is not
      // pinned here: the cap is recomputed from the pool on every pass, so
      // removing the reset produces byte-identical values (measured).
      expect((await evaluate(cdp, OPERATION_MEASURE)).operationHidden).toBe(false);
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = ''");
      await settleLayout(cdp);

      // A method is captured request data that lands in a class attribute.
      // methodClassToken keeps the badge to the known method tokens, so a
      // method carrying a space and a quote contributes none of its own —
      // while the text itself still renders verbatim in both places.
      await evaluate(cdp, "document.querySelector('#tbody tr[data-row-id=\"5\"]').click()");
      await settleLayout(cdp);
      const unknownVerb = await evaluate(cdp, DETAILS_HEADER_MEASURE);
      expect(unknownVerb.badge).toEqual({
        text: 'GET" onload="x',
        className: 'details-title-method',
      });
      const unknownVerbRow = await evaluate(
        cdp,
        `(() => {
          const tr = document.querySelector('#tbody tr[data-row-id="5"]');
          return {
            rowClassTokens: tr.className.split(/\\s+/).filter(Boolean),
            cell: tr.querySelector('td .method-badge').textContent,
            cellClass: tr.querySelector('td .method-badge').className,
          };
        })()`,
      );
      expect(unknownVerbRow.rowClassTokens.filter((token) => token.startsWith('method-'))).toEqual([]);
      expect(unknownVerbRow.rowClassTokens.filter((token) => !/^[a-z0-9-]+$/.test(token))).toEqual([]);
      expect(unknownVerbRow.cellClass).toBe('method-badge');
      expect(unknownVerbRow.cell).toBe('GET" onload="x');
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

// Selecting the URL row and copying it must yield the address the request
// actually used, for every shape a URL can take. The row is assembled from
// parts, so any part the assembly forgets leaves a plausible-but-wrong URL
// behind with nothing saying so: URL.host excludes credentials, and the row
// rendered 'https://creds.example.test/vault/item?k=1' for a request made as
// 'https://alice:s3cret@creds.example.test/vault/item?k=1'.
const URL_ROW_FIXTURES = [
  { label: 'bare', url: 'https://app.example.test/dashboard' },
  { label: 'query', url: 'https://api.example.test/search?q=beacon&page=2' },
  { label: 'fragment', url: 'https://docs.example.test/guide/setup#step-three' },
  { label: 'credentialed', url: 'https://alice:s3cret@creds.example.test/vault/item?k=1' },
  { label: 'credentialed-bare', url: 'https://svc@creds.example.test/vault' },
  { label: 'ported', url: 'http://api.example.test:8080/ported/endpoint?a=1&b=2' },
  { label: 'ported-fragment', url: 'https://api.example.test:8443/v2/orders?status=open#totals' },
];

const URL_ROW_FIXTURE_INJECT = `(async () => {
  const settle = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
  const fixtures = ${JSON.stringify(URL_ROW_FIXTURES)};
  fixtures.forEach((fixture, index) => {
    globalThis.__networkPlusLiveListener({
      startedDateTime: new Date(1704067200000 + index * 1000).toISOString(),
      time: 40 + index,
      request: { method: 'GET', url: fixture.url, httpVersion: 'HTTP/2', headers: [] },
      response: {
        status: 200,
        statusText: 'OK',
        httpVersion: 'HTTP/2',
        headers: [{ name: 'content-type', value: 'text/plain' }],
        content: { size: 9, mimeType: 'text/plain' },
      },
      getContent(callback) {
        callback('', '');
      },
    });
  });
  await settle();
  return document.querySelectorAll('#tbody tr[data-row-id]').length;
})()`;

// Selects the whole URL row the way a reader drags across it, and reports the
// text that selection carries plus the colours the parts are painted in.
const URL_ROW_SELECT_MEASURE = `(() => {
  const wrap = document.querySelector('#req-headers .url-breakdown');
  const selection = window.getSelection();
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(wrap);
  selection.addRange(range);
  const text = selection.toString();
  selection.removeAllRanges();
  const colourOf = (target) => (target ? getComputedStyle(target).color : null);
  const fragmentLine = wrap.querySelector('.url-breakdown-fragment');
  return {
    selected: text,
    lines: Array.from(wrap.querySelectorAll('.url-breakdown-line')).map((line) => line.className),
    addressBlocks: wrap.querySelectorAll('.url-breakdown-address div,.url-breakdown-address p').length,
    userinfoText: (wrap.querySelector('.url-breakdown-userinfo') || {}).textContent ?? null,
    fragmentText: fragmentLine ? fragmentLine.textContent : null,
    fragmentColour: colourOf(fragmentLine),
    schemeColour: colourOf(wrap.querySelector('.url-breakdown-scheme')),
    pathColour: colourOf(wrap.querySelector('.url-breakdown-path')),
    fragmentWrap: fragmentLine ? getComputedStyle(fragmentLine).overflowWrap : null,
    userinfoColour: colourOf(wrap.querySelector('.url-breakdown-userinfo')),
    revealHidden: wrap.querySelector('.url-breakdown-full')
      ? wrap.querySelector('.url-breakdown-full').hidden
      : null,
    revealText: wrap.querySelector('.url-breakdown-full')
      ? wrap.querySelector('.url-breakdown-full').textContent
      : null,
  };
})()`;

browserTest(
  'selecting the URL row yields the whole address for every URL shape, credentials and fragment included',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: LIVE_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      await waitForLiveNetworkListener(cdp);
      expect(await evaluate(cdp, URL_ROW_FIXTURE_INJECT, true)).toBe(URL_ROW_FIXTURES.length);
      for (let index = 0; index < URL_ROW_FIXTURES.length; index += 1) {
        const fixture = URL_ROW_FIXTURES[index];
        await evaluate(cdp, `document.querySelector('#tbody tr[data-row-id="${index + 1}"]').click()`);
        await settleLayout(cdp);
        const measured = await evaluate(cdp, URL_ROW_SELECT_MEASURE);
        // The property, per shape: what a drag-select carries IS the URL —
        // verbatim, with no newline anywhere inside it, because the address is
        // one block of inline spans and not a stack of sibling blocks.
        expect([fixture.label, measured.selected]).toEqual([fixture.label, fixture.url]);
        expect([fixture.label, measured.addressBlocks]).toEqual([fixture.label, 0]);
        // And where a reveal exists it holds the same string, so neither path
        // to the address disagrees with the other.
        if (measured.revealText !== null) {
          expect([fixture.label, measured.revealText]).toEqual([fixture.label, fixture.url]);
          expect([fixture.label, measured.revealHidden]).toEqual([fixture.label, true]);
        }
        const credentials = new URL(fixture.url).username
          ? new URL(fixture.url).username +
            (new URL(fixture.url).password ? ':' + new URL(fixture.url).password : '') +
            '@'
          : null;
        expect([fixture.label, measured.userinfoText]).toEqual([fixture.label, credentials]);
        const fragment = new URL(fixture.url).hash || null;
        expect([fixture.label, measured.fragmentText]).toEqual([fixture.label, fragment]);
        // The fragment line has a rule of its own: muted like the scheme, not
        // the value colour it inherited while no rule existed, and breakable.
        if (fragment) {
          expect([fixture.label, measured.fragmentColour]).toEqual([fixture.label, measured.schemeColour]);
          expect([fixture.label, measured.fragmentColour === measured.pathColour]).toEqual([fixture.label, false]);
          expect([fixture.label, measured.fragmentWrap]).toEqual([fixture.label, 'anywhere']);
        }
        if (credentials) {
          expect([fixture.label, measured.userinfoColour]).toEqual([fixture.label, measured.schemeColour]);
        }
      }
      // The shapes really are distinct, so the loop is not seven runs of one
      // case: a row with credentials, a row with a fragment, and a row with
      // neither all occur above.
      expect(URL_ROW_FIXTURES.some((fixture) => new URL(fixture.url).username)).toBe(true);
      expect(URL_ROW_FIXTURES.some((fixture) => new URL(fixture.url).hash)).toBe(true);
      expect(URL_ROW_FIXTURES.some((fixture) => new URL(fixture.url).port)).toBe(true);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS * 2,
);

// The header must never assert a URL the request did not have. This is stated
// as a property over the whole matrix rather than as a spot check, because
// three rounds of spot fixes each repaired one branch of the fit and broke
// another: at the 440px pane the ad-tech row painted
// "GET securepubads.example.test/final-segment.js" with an unclipped host and
// no ellipsis anywhere — a plausible URL the request never made.
//
// The invariant: what the header renders (method + host + path + query chip)
// either IS the request's own "METHOD host/pathname?N", or it carries at
// least one visible truncation marker — a '…' in the path text, or a CSS
// ellipsis on an element whose scrollWidth exceeds its clientWidth. There is
// no third case. The query chip is a COUNT, not query text, so it cannot lie
// about a query; that it stays a count is pinned here in the same pass.
const DETAILS_TITLE_PANE_WIDTHS = [400, 440, 538, 700, 900, 1280, 1920];
const DETAILS_TITLE_LANGUAGES = ['en', 'ja'];
const DETAILS_TITLE_INVARIANT_MEASURE = `(() => {
  const title = document.querySelector('#detailsTitle');
  const badge = title.querySelector('.details-title-method');
  const hostEl = title.querySelector('.details-title-host');
  const pathEl = title.querySelector('.details-title-path');
  const queryEl = title.querySelector('.details-title-query');
  const operationEl = title.querySelector('.details-title-operation');
  // A box whose text is wider than the room it has, while its own
  // text-overflow paints an ellipsis: that mark is what the reader sees in
  // place of the rest. Both widths are read fractionally — scrollWidth and
  // clientWidth are integers, so a sub-pixel clip rounded to "it all fits"
  // and the invariant read a truncated row as an exact one.
  const contentWidth = (el) => {
    const style = getComputedStyle(el);
    return (
      el.getBoundingClientRect().width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      parseFloat(style.borderLeftWidth) -
      parseFloat(style.borderRightWidth)
    );
  };
  const textWidth = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
  };
  const ellipsised = (el) =>
    !!el && textWidth(el) > contentWidth(el) + 0.05 && getComputedStyle(el).textOverflow === 'ellipsis';
  return {
    paneWidth: Math.round(document.querySelector('#details').getBoundingClientRect().width),
    method: badge ? badge.textContent : '',
    host: hostEl ? hostEl.textContent : '',
    path: pathEl ? pathEl.textContent : '',
    queryChip: queryEl ? queryEl.textContent : '',
    hostEllipsised: ellipsised(hostEl),
    pathEllipsised: ellipsised(pathEl),
    titleOverflows: title.scrollWidth > title.clientWidth,
    operationHidden: operationEl ? operationEl.hidden : null,
  };
})()`;

// The fixtures span every shape the fit has a branch for: a long multi-segment
// path, a long host beside a short path and an operation, a URL that fits
// whole at every width, a bare root path, and one unsplittable segment that
// is longer than the whole row.
const DETAILS_TITLE_FIXTURES = [
  {
    label: 'ad-tech',
    method: 'GET',
    host: 'securepubads.example.test',
    pathname: '/gampad/ads/deep/nested/segments/for/ellipsis/final-segment.js',
    queryCount: 31,
  },
  {
    label: 'graphql',
    method: 'POST',
    host: 'api.deep-nested-graphql-host.example.test',
    pathname: '/v1/graphql/gateway/edge',
    queryCount: 0,
  },
  { label: 'short', method: 'GET', host: 's.test', pathname: '/a', queryCount: 0 },
  { label: 'root', method: 'HEAD', host: 'api.example.test', pathname: '/', queryCount: 0 },
  {
    label: 'one-segment',
    method: 'GET',
    host: 'cdn.example.test',
    pathname: '/a-single-unsplittable-segment-longer-than-the-whole-header-row.min.js',
    queryCount: 2,
  },
];

const DETAILS_TITLE_FIXTURE_INJECT = `(async () => {
  const settle = () =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
  const fixtures = ${JSON.stringify(DETAILS_TITLE_FIXTURES)};
  fixtures.forEach((fixture, index) => {
    const query = fixture.queryCount
      ? '?' + Array.from({ length: fixture.queryCount }, (_u, i) => 'p' + i + '=' + 'v'.repeat(30) + i).join('&')
      : '';
    const isGraphql = fixture.label === 'graphql';
    globalThis.__networkPlusLiveListener({
      startedDateTime: new Date(1704067200000 + index * 1000).toISOString(),
      time: 40 + index,
      request: {
        method: fixture.method,
        url: 'https://' + fixture.host + fixture.pathname + query,
        httpVersion: 'HTTP/2',
        headers: isGraphql ? [{ name: 'Content-Type', value: 'application/json' }] : [],
        postData: isGraphql
          ? {
              mimeType: 'application/json',
              text: JSON.stringify({ query: 'query ViewerProfileWithEverything { viewer { fullName } }' }),
            }
          : undefined,
      },
      response: {
        status: 200,
        statusText: 'OK',
        httpVersion: 'HTTP/2',
        headers: [{ name: 'content-type', value: 'text/plain' }],
        content: { size: 9, mimeType: 'text/plain' },
      },
      getContent(callback) {
        callback('', '');
      },
    });
  });
  await settle();
  return document.querySelectorAll('#tbody tr[data-row-id]').length;
})()`;

// One row of the invariant table. 'exact' means the header renders the whole
// truth; 'marked' means it renders less and says so. Anything else is a lie
// and is returned verbatim so the failure names the width that produced it.
//
// Marked is judged PER PART, never once for the whole row. Accepting a marker
// anywhere let a capped host license a silently shortened path: the ad-tech
// row painted "securepubads.example.test/final-segment.js" across the whole
// 400-440px band and this table called it 'marked', because the host's own
// CSS ellipsis stood in for the mark the path had lost.
function classifyDetailsTitleRender(fixture, measured) {
  const rendered = measured.method + ' ' + measured.host + measured.path + measured.queryChip;
  const truth =
    fixture.method + ' ' + fixture.host + fixture.pathname + (fixture.queryCount ? '?' + fixture.queryCount : '');
  if (rendered === truth) return 'exact';
  const hostMarked = measured.host === fixture.host || measured.hostEllipsised;
  const pathMarked =
    measured.path === fixture.pathname || measured.path.indexOf('…') !== -1 || measured.pathEllipsised;
  return hostMarked && pathMarked ? 'marked' : 'UNMARKED: ' + rendered;
}

browserTest(
  'the details header is either the whole URL or visibly truncated, at every pane width in both languages',
  async () => {
    const table = [];
    // One browser for both languages: the language is stored and the document
    // reloaded, which hands the second pass the same fresh page a second
    // launch handed it with one fewer spawn to fail on.
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: LIVE_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      for (const [languageIndex, language] of DETAILS_TITLE_LANGUAGES.entries()) {
        if (languageIndex > 0) {
          await reloadInLanguage(page, language);
          // The pane-width sweep leaves the window at its last size; the next
          // language starts from the same window a fresh launch started from.
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false,
          });
        }
        await waitForLiveNetworkListener(cdp);
        expect(await evaluate(cdp, DETAILS_TITLE_FIXTURE_INJECT, true)).toBe(DETAILS_TITLE_FIXTURES.length);
        expect(await evaluate(cdp, 'document.documentElement.lang')).toBe(language);
        for (let index = 0; index < DETAILS_TITLE_FIXTURES.length; index += 1) {
          const fixture = DETAILS_TITLE_FIXTURES[index];
          await evaluate(cdp, `document.querySelector('#tbody tr[data-row-id="${index + 1}"]').click()`);
          await settleLayout(cdp);
          for (const paneWidth of DETAILS_TITLE_PANE_WIDTHS) {
            // The pane cannot be wider than the window that holds it, so the
            // window grows with it; the grid keeps a constant share beside it.
            await cdp.send('Emulation.setDeviceMetricsOverride', {
              width: paneWidth + 480,
              height: 800,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await settleLayout(cdp);
            await evaluate(cdp, `document.querySelector('#details').style.flexBasis = '${paneWidth}px'`);
            await settleLayout(cdp);
            const measured = await evaluate(cdp, DETAILS_TITLE_INVARIANT_MEASURE);
            table.push({
              row: fixture.label,
              lang: language,
              pane: measured.paneWidth,
              verdict: classifyDetailsTitleRender(fixture, measured),
              path: measured.path,
              hostMark: measured.hostEllipsised,
              // The chip is a count in every cell of the table, so it is not
              // a URL claim and cannot be the thing that lies.
              chip: measured.queryChip,
              titleOverflows: measured.titleOverflows,
            });
          }
        }
      }
    } finally {
      await page.close();
    }

    expect(table).toHaveLength(
      DETAILS_TITLE_LANGUAGES.length * DETAILS_TITLE_FIXTURES.length * DETAILS_TITLE_PANE_WIDTHS.length,
    );
    // The property. Every cell is one of the two legal cases and no cell
    // renders a URL the request never had.
    expect(table.filter((cell) => cell.verdict !== 'exact' && cell.verdict !== 'marked')).toEqual([]);
    // Both cases really occur, so the property is not vacuously satisfied by
    // a matrix in which nothing is ever truncated (or never fits).
    expect(table.some((cell) => cell.verdict === 'exact')).toBe(true);
    expect(table.some((cell) => cell.verdict === 'marked')).toBe(true);
    // The query chip is a count at every width — never the query text, which
    // is the one thing in the row that could claim parameters that never were.
    for (const cell of table) {
      const fixture = DETAILS_TITLE_FIXTURES.find((candidate) => candidate.label === cell.row);
      expect([cell.row, cell.pane, cell.lang, cell.chip]).toEqual([
        cell.row,
        cell.pane,
        cell.lang,
        fixture.queryCount ? '?' + fixture.queryCount : '',
      ]);
      // Nothing is pushed out of the header's own box at any width.
      expect([cell.row, cell.pane, cell.lang, cell.titleOverflows]).toEqual([cell.row, cell.pane, cell.lang, false]);
    }
    // The endpoint name is the token the rule protects: whenever the path is
    // shortened at all it either still ends on the whole last segment, or the
    // segment itself did not fit and its head gave way behind a leading '…'.
    for (const cell of table) {
      const fixture = DETAILS_TITLE_FIXTURES.find((candidate) => candidate.label === cell.row);
      const slash = fixture.pathname.lastIndexOf('/');
      const endpoint = slash > 0 ? fixture.pathname.slice(slash) : fixture.pathname;
      const keepsEndpoint =
        cell.path === fixture.pathname || cell.path.endsWith(endpoint) || cell.path.charAt(0) === '…';
      expect([cell.row, cell.pane, cell.lang, cell.path, keepsEndpoint]).toEqual([
        cell.row,
        cell.pane,
        cell.lang,
        cell.path,
        true,
      ]);
    }
  },
  TEST_TIMEOUT_MS * 3,
);

// Tier 2 tabs-and-panes: tabs signal what their pane holds and fall back to
// Headers for an empty pick, Body/Raw carry one top toolbar, the JSON tree
// aligns and folds, and Raw splits the request line above a highlighted body.
const TAB_SIGNAL_MEASURE = (barId) => `(() => {
  const bar = document.querySelector('#${barId}');
  return Array.from(bar.querySelectorAll('.tab-btn')).map((button) => ({
    tab: button.dataset.tab,
    count: button.dataset.count ?? null,
    empty: button.classList.contains('is-empty'),
    active: button.classList.contains('active'),
    selected: button.getAttribute('aria-selected'),
    label: button.textContent,
    opacity: getComputedStyle(button).opacity,
    marker: getComputedStyle(button, '::after').content,
  }));
})()`;

const PANE_EMPTY_MEASURE = (paneId) => `(() => {
  const pane = document.querySelector('#${paneId}');
  const message = pane.querySelector('.pane-empty');
  return message
    ? { text: message.textContent, fontSize: getComputedStyle(message).fontSize, color: getComputedStyle(message).color, muted: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() }
    : { text: pane.textContent.slice(0, 40), fontSize: null, color: null, muted: null };
})()`;

browserTest(
  'tabs carry counts, mark an empty pane instead of dimming it, and fall back to Headers without losing the picked tab',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: LIVE_CAPTURE_INIT_SCRIPT + CLIPBOARD_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      await waitForLiveNetworkListener(cdp);
      const injected = await evaluate(
        cdp,
        `(async () => {
          const settle = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
          const query = Array.from({ length: 31 }, (_u, i) => 'p' + i + '=v' + i).join('&');
          const operation = 'query Viewer {\\n  viewer {\\n    id\\n    name\\n  }\\n}';
          const body = JSON.stringify({
            query: operation,
            variables: { input: { filters: { deep: { level: 3 } } }, ids: Array.from({ length: 30 }, (_u, i) => i) },
            note: 'n'.repeat(130),
          });
          const entries = [
            {
              request: { method: 'GET', url: 'https://securepubads.example.test/gampad/ads?' + query, headers: [{ name: 'Accept', value: '*/*' }] },
              response: { status: 200, statusText: 'OK', headers: [{ name: 'content-type', value: 'text/javascript' }] },
              content: 'ok();',
            },
            {
              request: {
                method: 'POST',
                url: 'https://api.example.test/graphql',
                headers: [
                  { name: 'Content-Type', value: 'application/json' },
                  { name: 'Cookie', value: 'a=1; b=2; c=3' },
                ],
                postData: { mimeType: 'application/json', text: body },
              },
              response: {
                status: 200,
                statusText: 'OK',
                headers: [
                  { name: 'content-type', value: 'application/json' },
                  { name: 'set-cookie', value: 'sid=1; Path=/' },
                  { name: 'set-cookie', value: 'theme=dark; Path=/' },
                ],
              },
              content: '{"data":{"viewer":{"id":"u1","name":"Ada"}}}',
            },
            {
              request: { method: 'GET', url: 'https://api.example.test/ping', headers: [] },
              response: { status: 204, statusText: 'No Content', headers: [{ name: 'content-type', value: 'text/plain' }] },
              content: '',
            },
          ];
          entries.forEach((entry, index) => {
            globalThis.__networkPlusLiveListener({
              startedDateTime: new Date(1704067200000 + index * 1000).toISOString(),
              time: 40 + index,
              request: { ...entry.request, httpVersion: 'HTTP/1.1' },
              response: { ...entry.response, httpVersion: 'HTTP/1.1', content: { size: entry.content.length, mimeType: entry.response.headers[0].value } },
              getContent(callback) {
                callback(entry.content, '');
              },
            });
          });
          await settle();
          return { rows: document.querySelectorAll('#tbody tr[data-row-id]').length, body, operation };
        })()`,
        true,
      );
      expect(injected.rows).toBe(3);

      // The POST row: three cookies, no query string, a body.
      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#tbody tr[data-row-id="2"]').click();
          document.querySelector('#req-tab-cookies').click();
          document.querySelector('#res-tab-cookies').click();
        })()`,
      );
      await settleLayout(cdp);
      const postTabs = await evaluate(cdp, TAB_SIGNAL_MEASURE('req-tab-bar'));
      expect(postTabs.map((tab) => [tab.tab, tab.count, tab.empty, tab.active])).toEqual([
        ['req-headers', null, false, false],
        ['req-body', null, false, false],
        ['req-query', '0', true, false],
        ['req-cookies', '3', false, true],
        ['req-raw', null, false, false],
      ]);
      // The count lives in CSS, so the accessible name stays the bare label.
      expect(postTabs.map((tab) => tab.label)).toEqual(['Headers', 'Body', 'Query', 'Cookies', 'Raw']);
      // The empty tab is signalled by the marker after its label, never by a
      // dimmed one: it stays clickable, so its label is interactive text and
      // opacity:.55 put it below AA in both themes. Query counts parameters,
      // so its empty marker is a real 0.
      expect(postTabs.find((tab) => tab.tab === 'req-query')).toMatchObject({ opacity: '1', marker: '"0"' });
      expect(postTabs.find((tab) => tab.tab === 'req-cookies')).toMatchObject({ opacity: '1', marker: '"3"' });
      expect(postTabs.find((tab) => tab.tab === 'req-headers')).toMatchObject({ opacity: '1', marker: 'none' });
      const postQuery = await evaluate(cdp, PANE_EMPTY_MEASURE('req-query'));
      expect(postQuery.text).toBe('No query parameters — this POST carries its data in Body');
      expect(postQuery.fontSize).toBe('12px');
      const postResTabs = await evaluate(cdp, TAB_SIGNAL_MEASURE('res-tab-bar'));
      expect(postResTabs.find((tab) => tab.tab === 'res-cookies')).toMatchObject({ count: '2', empty: false, active: true });

      // The GET row has no cookies: the picked Cookies tabs take the empty
      // marker, Headers shows on both halves, and Query announces its 31
      // parameters.
      await evaluate(cdp, "document.querySelector('#tbody tr[data-row-id=\"1\"]').click()");
      await settleLayout(cdp);
      const getTabs = await evaluate(cdp, TAB_SIGNAL_MEASURE('req-tab-bar'));
      expect(getTabs.map((tab) => [tab.tab, tab.count, tab.empty, tab.active, tab.selected])).toEqual([
        ['req-headers', null, false, true, 'true'],
        ['req-body', null, true, false, 'false'],
        ['req-query', '31', false, false, 'false'],
        ['req-cookies', '0', true, false, 'false'],
        ['req-raw', null, false, false, 'false'],
      ]);
      expect(getTabs.find((tab) => tab.tab === 'req-cookies')).toMatchObject({ opacity: '1', marker: '"0"' });
      // Body counts nothing — it holds one document — so its empty marker is
      // an en dash, not a "0" that would read as a count of zero items.
      expect(getTabs.find((tab) => tab.tab === 'req-body')).toMatchObject({ opacity: '1', marker: '"\u2013"' });
      const getCookies = await evaluate(cdp, PANE_EMPTY_MEASURE('req-cookies'));
      expect(getCookies.text).toBe('No cookies were sent');
      expect(getCookies.fontSize).toBe('12px');
      expect(await evaluate(cdp, PANE_EMPTY_MEASURE('req-query'))).toMatchObject({ fontSize: null });
      const getResTabs = await evaluate(cdp, TAB_SIGNAL_MEASURE('res-tab-bar'));
      expect(getResTabs.find((tab) => tab.tab === 'res-cookies')).toMatchObject({ count: '0', empty: true, active: false });
      expect(getResTabs.find((tab) => tab.tab === 'res-headers').active).toBe(true);
      expect((await evaluate(cdp, PANE_EMPTY_MEASURE('res-cookies'))).text).toBe('No set-cookie headers');
      expect((await evaluate(cdp, PANE_EMPTY_MEASURE('req-body'))).text).toBe('No request body');
      // A tab marked empty still opens on click.
      await evaluate(cdp, "document.querySelector('#req-tab-cookies').click()");
      expect(await evaluate(cdp, "document.querySelector('#req-cookies').classList.contains('active')")).toBe(true);
      await evaluate(cdp, "document.querySelector('#req-tab-headers').click()");
      await evaluate(cdp, "document.querySelector('#req-tab-cookies').click()");

      // The response half stamps Body and Raw too, once the cached body has
      // landed — until this the bar was given only the cookies count, so an
      // empty response Body never took the marker the request Body does. A
      // 204 leaves Body with nothing; Raw still holds the status line and the
      // headers, so it is not empty.
      await evaluate(cdp, "document.querySelector('#tbody tr[data-row-id=\"3\"]').click()");
      await settleLayout(cdp);
      const emptyBodyTabs = await evaluate(cdp, TAB_SIGNAL_MEASURE('res-tab-bar'));
      expect(emptyBodyTabs.map((tab) => [tab.tab, tab.count, tab.empty])).toEqual([
        ['res-headers', null, false],
        ['res-body', null, true],
        ['res-preview', null, false],
        ['res-cookies', '0', true],
        ['res-timing', null, false],
        ['res-raw', null, false],
      ]);
      // Body counts nothing, so its empty marker is the en dash — the same
      // rule the request half's Body follows.
      expect(emptyBodyTabs.find((tab) => tab.tab === 'res-body')).toMatchObject({
        opacity: '1',
        marker: '"\u2013"',
      });
      expect(emptyBodyTabs.find((tab) => tab.tab === 'res-raw')).toMatchObject({ marker: 'none' });

      // Back on the POST row the fallback has not overwritten the pick: the
      // Cookies tabs come back on both halves.
      await evaluate(cdp, "document.querySelector('#tbody tr[data-row-id=\"2\"]').click()");
      await settleLayout(cdp);
      expect(await evaluate(cdp, "document.querySelector('#req-cookies').classList.contains('active')")).toBe(true);
      expect(await evaluate(cdp, "document.querySelector('#res-cookies').classList.contains('active')")).toBe(true);

      // Clearing the capture empties the panes and their tab signals, so
      // nothing stale survives into the next recording.
      await evaluate(cdp, "document.querySelector('#clearBtn').click()");
      await settleLayout(cdp);
      expect(await evaluate(cdp, "document.querySelectorAll('#tbody tr[data-row-id]').length")).toBe(0);
      const cleared = await evaluate(cdp, TAB_SIGNAL_MEASURE('req-tab-bar'));
      expect(cleared.every((tab) => tab.count === null && !tab.empty)).toBe(true);
      expect(await evaluate(cdp, "document.querySelector('#req-cookies').textContent")).toBe('');
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

const PANE_TOOLBAR_MEASURE = (paneId) => `(() => {
  const pane = document.querySelector('#${paneId}');
  const area = pane.parentElement;
  const bar = pane.firstElementChild;
  const barRect = bar.getBoundingClientRect();
  const areaRect = area.getBoundingClientRect();
  const content = bar.nextElementSibling;
  return {
    barClass: bar.className,
    position: getComputedStyle(bar).position,
    top: getComputedStyle(bar).top,
    barTopOffset: Math.round(barRect.top - areaRect.top),
    barLeftOffset: Math.round(barRect.left - areaRect.left),
    barWidthDelta: Math.round(area.clientWidth - barRect.width),
    barHeight: Math.round(barRect.height),
    copyLabels: Array.from(bar.querySelectorAll('.copy-actions .copy-btn')).map((button) => button.textContent),
    copyRight: Math.round(areaRect.left + area.clientWidth - bar.querySelector('.copy-actions').getBoundingClientRect().right),
    strayCopyActions: pane.querySelectorAll(':scope > .copy-actions').length,
    contentTopGap: content ? Math.round(content.getBoundingClientRect().top - barRect.bottom) : null,
    contentClass: content ? content.className : null,
    lastChildIsBar: pane.lastElementChild === bar,
    scrollTop: area.scrollTop,
    scrollable: area.scrollHeight > area.clientHeight,
  };
})()`;

// The 440px pane's toolbar, and the rows its parts land on. A cluster row is
// keyed on the vertical centre: the count is shorter than the buttons beside
// it, so its box top differs by a few pixels on the same row.
const PANE_TOOLBAR_NARROW_MEASURE = `(() => {
  const pane = document.querySelector('#res-body');
  const area = pane.parentElement;
  const bar = pane.firstElementChild;
  const barRect = bar.getBoundingClientRect();
  const copy = bar.querySelector('.copy-actions').getBoundingClientRect();
  const input = bar.querySelector('.pane-search-input').getBoundingClientRect();
  const copyButtons = Array.from(bar.querySelectorAll('.copy-btn'));
  const navButtons = Array.from(bar.querySelectorAll('.pane-search-nav:not(.pane-search-expand)'));
  const cluster = Array.from(bar.querySelectorAll('.pane-search-count,.pane-search-nav')).filter(
    (element) => !element.hidden && element.getBoundingClientRect().width > 0,
  );
  const rowsOf = (elements) => {
    const centres = [];
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      const centre = rect.top + rect.height / 2;
      if (!centres.some((known) => Math.abs(known - centre) < 8)) centres.push(centre);
    }
    return centres.length;
  };
  return {
    detailsWidth: Math.round(document.querySelector('#details').getBoundingClientRect().width),
    expandHidden: bar.querySelector('.pane-search-expand').hidden,
    flexWrap: getComputedStyle(bar).flexWrap,
    barOverflow: bar.scrollWidth - bar.clientWidth,
    paneOverflow: pane.scrollWidth - pane.clientWidth,
    areaOverflow: area.scrollWidth - area.clientWidth,
    barHeight: Math.round(barRect.height),
    copyOnSecondRow: Math.round(copy.top) > Math.round(input.bottom),
    copyRight: Math.round(barRect.right - copy.right),
    scrollPaddingTop: getComputedStyle(area).scrollPaddingTop,
    // The labels are gone from the paint but not from the name: the Japanese
    // pair alone made this bar 63px tall in every pane, query or no query.
    copyLabelDisplay: copyButtons.map((button) => {
      const label = button.querySelector('.copy-btn-label');
      return label ? getComputedStyle(label).display : null;
    }),
    copyIcons: copyButtons.map((button) => getComputedStyle(button, '::before').content),
    copyNames: copyButtons.map((button) => button.getAttribute('aria-label')),
    copyTitles: copyButtons.map((button) => button.title),
    copyText: copyButtons.map((button) => button.textContent),
    // The count and its two nav buttons are one control: one row, or they
    // wrap together. Flat in the bar, the up arrow landed on row 1 and the
    // down arrow of the same control on row 2.
    navRows: rowsOf(navButtons),
    clusterRows: rowsOf(cluster),
    navGroupWraps: bar.querySelector('.pane-search-nav-group')
      ? getComputedStyle(bar.querySelector('.pane-search-nav-group')).flexWrap
      : null,
  };
})()`;

browserTest(
  'Body and Raw carry one sticky top toolbar that holds search and the copy actions',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript:
        LIVE_CAPTURE_INIT_SCRIPT + CLIPBOARD_CAPTURE_INIT_SCRIPT + RESIZE_OBSERVER_CENSUS_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      await waitForLiveNetworkListener(cdp);
      const injected = await evaluate(
        cdp,
        `(async () => {
          const settle = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
          const body = JSON.stringify({
            query: 'query Viewer {\\n  viewer {\\n    fullName\\n  }\\n}',
            // Past the tree's 100-child limit, so the tail sits behind
            // "... Show all 140 items" and a search for it has something real
            // to reveal.
            variables: { ids: Array.from({ length: 140 }, (_u, i) => 'id-' + i) },
          });
          // A second row whose response body is plain text past the 2,000
          // character preview limit, with the needle only in the cut-off
          // tail: the pane can then decide on its own that matches are
          // hiding behind "Show full cached body".
          const cssBody = 'body{color:red}\\n' + 'a{margin:0}\\n'.repeat(400) + '\\n.needle-in-the-tail{}';
          globalThis.__networkPlusLiveListener({
            startedDateTime: new Date(1704067200000).toISOString(),
            time: 40,
            request: {
              method: 'POST',
              url: 'https://api.example.test/graphql',
              httpVersion: 'HTTP/1.1',
              headers: [{ name: 'Content-Type', value: 'application/json' }],
              postData: { mimeType: 'application/json', text: body },
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/1.1',
              headers: [{ name: 'content-type', value: 'application/json' }],
              content: { size: 30, mimeType: 'application/json' },
            },
            getContent(callback) {
              callback('{"data":{"viewer":{"id":"u1"}}}', '');
            },
          });
          globalThis.__networkPlusLiveListener({
            startedDateTime: new Date(1704067201000).toISOString(),
            time: 12,
            request: {
              method: 'GET',
              url: 'https://static.example.test/assets/app.css',
              httpVersion: 'HTTP/1.1',
              headers: [],
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/1.1',
              headers: [{ name: 'content-type', value: 'text/css' }],
              content: { size: cssBody.length, mimeType: 'text/css' },
            },
            getContent(callback) {
              callback(cssBody, '');
            },
          });
          await settle();
          document.querySelector('#tbody tr[data-row-id="1"]').click();
          document.querySelector('#req-tab-body').click();
          document.querySelector('#res-tab-raw').click();
          await settle();
          return { body, cssBodyLength: cssBody.length };
        })()`,
        true,
      );
      await settleLayout(cdp);

      const bodyBar = await evaluate(cdp, PANE_TOOLBAR_MEASURE('req-body'));
      expect(bodyBar).toMatchObject({
        barClass: 'pane-search-bar',
        position: 'sticky',
        top: '0px',
        barTopOffset: 0,
        barLeftOffset: 0,
        barWidthDelta: 0,
        copyLabels: ['Copy sanitized', 'Copy full...'],
        strayCopyActions: 0,
        contentClass: 'json-tree code-block',
        lastChildIsBar: false,
        scrollable: true,
      });
      expect(bodyBar.barHeight).toBeLessThanOrEqual(36);
      // Copy actions hug the right edge of the bar; content starts directly
      // under it (8px breathing room, no second band).
      expect(bodyBar.copyRight).toBeLessThanOrEqual(10);
      expect(bodyBar.contentTopGap).toBe(8);

      // Scrolling the pane keeps the bar at the top edge.
      await evaluate(cdp, "document.querySelector('#req-body').parentElement.scrollTop = 120");
      await settleLayout(cdp);
      const scrolled = await evaluate(cdp, PANE_TOOLBAR_MEASURE('req-body'));
      expect(scrolled.scrollTop).toBeGreaterThan(0);
      expect(scrolled.barTopOffset).toBe(0);
      await evaluate(cdp, "document.querySelector('#req-body').parentElement.scrollTop = 0");

      // Raw on both halves gets the same toolbar.
      expect(await evaluate(cdp, PANE_TOOLBAR_MEASURE('res-raw'))).toMatchObject({
        barClass: 'pane-search-bar',
        position: 'sticky',
        barTopOffset: 0,
        copyLabels: ['Copy sanitized', 'Copy full...'],
        strayCopyActions: 0,
        contentClass: 'code-block code-raw',
      });

      // The moved buttons still run the sanitized clipboard flow.
      const copied = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const before = globalThis.__networkPlusCopied.length;
          document.querySelector('#req-body .pane-search-bar .copy-btn').click();
          await waitFor(() => globalThis.__networkPlusCopied.length > before, 100);
          return { copied: globalThis.__networkPlusCopied, toast: document.querySelector('#copyToast').textContent };
        })()`,
        true,
      );
      expect(copied.copied).toHaveLength(1);
      expect(JSON.parse(copied.copied[0])).toEqual(JSON.parse(injected.body));
      expect(copied.toast).toBe('Copied sanitized request body');

      // Ctrl+F with focus inside the pane goes to that pane's search input
      // and leaves the request search panel closed.
      const shortcut = await evaluate(
        cdp,
        `(() => {
          const button = document.querySelector('#req-body .pane-search-bar .copy-btn');
          button.focus();
          button.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
          return {
            focused: document.activeElement.className,
            insidePane: !!document.activeElement.closest('#req-body'),
            searchPanelDisplay: document.querySelector('#searchPanel').style.display,
          };
        })()`,
      );
      expect(shortcut).toEqual({ focused: 'pane-search-input', insidePane: true, searchPanelDisplay: 'none' });
      // Search still walks the body text, and a hit on the third line of the
      // folded string (hidden by the fold) is revealed by navigating to it.
      const search = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const countBefore = count();
          input.value = 'fullName';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== countBefore, 400);
          const str = document.querySelector('#req-body .json-tree-str');
          const before = str.classList.contains('json-tree-str--expanded');
          document.querySelector('#req-body .pane-search-nav[title="Next match (Enter)"]').click();
          return {
            count: document.querySelector('#req-body .pane-search-count').textContent,
            hits: document.querySelectorAll('#req-body mark.pane-search-hit').length,
            expandedBefore: before,
            expandedAfter: str.classList.contains('json-tree-str--expanded'),
          };
        })()`,
        true,
      );
      expect(search.hits).toBe(1);
      expect(search.count).toBe('1 / 1');
      expect(search.expandedBefore).toBe(false);
      expect(search.expandedAfter).toBe(true);

      // One expand-everything owner per pane. Request > Body renders a JSON
      // tree, and the tree's own Expand / Collapse controls do that job, so
      // the toolbar does not stack a second "Expand all" beside them.
      const treeOwnership = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const before = count();
          input.value = 'id-139';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
          return {
            treeControls: Array.from(document.querySelectorAll('#req-body .json-tree-controls button')).map(
              (button) => button.textContent,
            ),
            truncationControls: document.querySelectorAll('#req-body button.link-btn').length,
            toolbarExpandHidden: document.querySelector('#req-body .pane-search-expand').hidden,
            count: document.querySelector('#req-body .pane-search-count').textContent,
            hits: document.querySelectorAll('#req-body mark.pane-search-hit').length,
          };
        })()`,
        true,
      );
      expect(treeOwnership).toEqual({
        treeControls: ['Expand all', 'Collapse all'],
        truncationControls: 1,
        // The count still points at the hidden matches; only the second
        // button next to the tree's own controls is gone.
        toolbarExpandHidden: true,
        count: 'No matches (+1 collapsed)',
        hits: 0,
      });

      // The tree's Expand all is now the only owner, so it must reveal what
      // the toolbar button used to: it clicks through the truncation controls
      // and the pane search re-runs on what they rendered.
      const treeExpanded = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const countBefore = count();
          const [expandAll] = document.querySelectorAll('#req-body .json-tree-controls button');
          expandAll.click();
          // The controls go first; the pane search re-running on what they
          // rendered is the thing this measures, and the count says so.
          await waitFor(() => count() !== countBefore, 200);
          return {
            truncationControls: document.querySelectorAll('#req-body button.link-btn:not([data-pane-search-expanded])').length,
            count: document.querySelector('#req-body .pane-search-count').textContent,
            hits: document.querySelectorAll('#req-body mark.pane-search-hit').length,
            toolbarExpandHidden: document.querySelector('#req-body .pane-search-expand').hidden,
          };
        })()`,
        true,
      );
      expect(treeExpanded).toEqual({
        truncationControls: 0,
        count: '1 / 1',
        hits: 1,
        toolbarExpandHidden: true,
      });
      await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const before = count();
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
        })()`,
        true,
      );

      // Response > Body for the plain-text row is truncated at 2,000
      // characters behind "Show full cached body", and the query matches only
      // inside the part that was cut. The pane works that out for itself, so
      // Expand all appears because the product decided to show it.
      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#tbody tr[data-row-id="2"]').click();
          document.querySelector('#res-tab-body').click();
        })()`,
      );
      await settleLayout(cdp);
      const collapsedHits = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#res-body .pane-search-count').textContent;
          const input = document.querySelector('#res-body .pane-search-input');
          const before = count();
          input.value = 'needle-in-the-tail';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
          const expand = document.querySelector('#res-body .pane-search-expand');
          return {
            truncationControls: document.querySelectorAll('#res-body button.link-btn').length,
            treeControls: document.querySelectorAll('#res-body .json-tree-controls').length,
            expandHidden: expand.hidden,
            expandLabel: expand.textContent,
            count: document.querySelector('#res-body .pane-search-count').textContent,
            renderedHits: document.querySelectorAll('#res-body mark.pane-search-hit').length,
          };
        })()`,
        true,
      );
      expect(injected.cssBodyLength).toBeGreaterThan(2000);
      expect(collapsedHits).toEqual({
        truncationControls: 1,
        treeControls: 0,
        expandHidden: false,
        expandLabel: 'Expand all',
        count: 'No matches (+1 collapsed)',
        renderedHits: 0,
      });

      // At the pane's 440px minimum (clamp(440px,42%,760px) bottoms out at a
      // 1000px viewport) the bar holds search + count + Expand all + two nav
      // buttons + two copy buttons — its widest state. The copy pair gives up
      // its labels for its icons, and then, if the row still cannot hold
      // everything, the copy pair is what gives way: it takes the second row
      // so the query field keeps a width its query can be read in. Nothing
      // overflows the pane either way, and the scrollport's sticky inset
      // follows the measured bar however many rows it takes.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1000,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await settleLayout(cdp);
      const narrow = await evaluate(cdp, PANE_TOOLBAR_NARROW_MEASURE);
      expect(narrow.detailsWidth).toBe(440);
      expect(narrow.expandHidden).toBe(false);
      expect(narrow.flexWrap).toBe('wrap');
      expect(narrow.barOverflow).toBeLessThanOrEqual(0);
      expect(narrow.paneOverflow).toBeLessThanOrEqual(0);
      expect(narrow.areaOverflow).toBeLessThanOrEqual(0);
      // Right-aligned at the end of its row, inside the bar's 8px padding.
      expect(narrow.copyRight).toBe(8);
      // The inset is the measured bar, not the stylesheet's one-row fallback.
      expect(narrow.scrollPaddingTop).toBe(narrow.barHeight + 'px');
      expect(narrow.copyLabelDisplay).toEqual(['none', 'none']);
      // Two icons in a row have to be told apart: the second is the one that
      // opens the confirmation, and carries the same "..." as its label.
      expect(narrow.copyIcons).toEqual(['"⧉"', '"⧉…"']);
      expect(narrow.copyNames).toEqual(['Copy sanitized', 'Copy full...']);
      expect(narrow.copyTitles).toEqual(['Copy sanitized', 'Copy full...']);
      expect(narrow.copyText).toEqual(['Copy sanitized', 'Copy full...']);
      // The whole cluster, not just the two arrows: with the count as a flat
      // child of the wrapping bar this pane measured clusterRows 2 (count on
      // row 1, the arrows below it) — and at 440px the arrows split from each
      // other too, so both numbers move here.
      expect(narrow.navRows).toBe(1);
      expect(narrow.clusterRows).toBe(1);
      expect(narrow.navGroupWraps).toBe('nowrap');

      // Below the pane minimum the bar still has to wrap, and that is the
      // case the cluster has to survive: as flat children of the wrapping bar
      // the ↑ landed on row 1 and the ↓ of the same control on row 2.
      // 400px is where the split is a property of the band rather than of one
      // width: flattened, the cluster measures two rows at 420px and at every
      // narrower width, while navRows alone is back to 1 there. clusterRows
      // is therefore the number that catches the flat bar away from the 440px
      // turn, and neither number ever exceeds 1 with the group in place.
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = '400px'");
      await settleLayout(cdp);
      const wrapped = await evaluate(cdp, PANE_TOOLBAR_NARROW_MEASURE);
      expect(wrapped.detailsWidth).toBe(400);
      expect(wrapped.copyOnSecondRow).toBe(true);
      expect(wrapped.barOverflow).toBeLessThanOrEqual(0);
      expect(wrapped.navRows).toBe(1);
      expect(wrapped.clusterRows).toBe(1);
      expect(wrapped.navGroupWraps).toBe('nowrap');
      await evaluate(cdp, "document.querySelector('#details').style.flexBasis = ''");
      await settleLayout(cdp);

      // One scrollport carries all five panes of the half. Headers has no
      // toolbar, so the wrapped Body bar must not leave it scrolling under a
      // 58px gap that is not there.
      const insetAcrossTabs = await evaluate(
        cdp,
        `(() => {
          const area = document.querySelector('#res-headers').parentElement;
          const read = () => getComputedStyle(area).scrollPaddingTop;
          document.querySelector('#res-tab-headers').click();
          const headers = read();
          document.querySelector('#res-tab-body').click();
          const backOnBody = read();
          return { headers, backOnBody, sameScrollport: area === document.querySelector('#res-body').parentElement };
        })()`,
      );
      expect(insetAcrossTabs.sameScrollport).toBe(true);
      expect(insetAcrossTabs.headers).toBe('0px');
      expect(insetAcrossTabs.backOnBody).toBe(narrow.barHeight + 'px');

      // Rebuilding the toolbars on every selection must not accumulate
      // observers: attachPaneSearch runs two to four times per row.
      const observersAfterFirst = await evaluate(cdp, 'globalThis.__networkPlusLiveResizeObservers()');
      await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const rows = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'));
          for (let round = 0; round < 12; round++) {
            const wanted = rows[round % rows.length].dataset.rowId;
            rows[round % rows.length].click();
            await waitFor(() => {
              const selected = document.querySelector('#tbody tr.selected');
              return !!selected && selected.dataset.rowId === wanted;
            }, 20);
          }
        })()`,
        true,
      );
      await settleLayout(cdp);
      const observersAfterMany = await evaluate(cdp, 'globalThis.__networkPlusLiveResizeObservers()');
      expect(observersAfterFirst).toBeGreaterThan(0);
      // One per pane that owns a toolbar, plus the details-title observer —
      // never one per render.
      expect(observersAfterMany).toBeLessThanOrEqual(observersAfterFirst);
      expect(observersAfterMany).toBeLessThanOrEqual(8);

      await cdp.send('Emulation.clearDeviceMetricsOverride');
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

// Two reveals of the shape the panel builds around hidden text ("Show full
// URL" and its kind), planted in a searchable pane. The first declares what it
// owns with aria-controls and sits behind a decoy that declares something
// else; the second declares nothing, so only a collapsed control that is a
// DIRECT sibling of the hidden node may be pressed — never one nested inside
// another element beside it. Both are built the way createUrlBreakdown builds
// its own: a link-btn with aria-expanded="false" and a hidden node holding the
// text, the toggle flipping both on click.
const PANE_SEARCH_REVEAL_FIXTURE = `(() => {
  const pane = document.querySelector('#res-body');
  globalThis.__networkPlusDecoyClicks = 0;
  const collapsedButton = (label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-btn';
    button.textContent = label;
    button.setAttribute('aria-expanded', 'false');
    return button;
  };
  const revealPair = (button, target) => {
    button.addEventListener('click', () => {
      const reveal = target.hidden;
      target.hidden = !reveal;
      button.setAttribute('aria-expanded', String(reveal));
    });
  };

  const owned = document.createElement('div');
  owned.className = 'url-breakdown reveal-fixture-owned';
  const decoyToggle = collapsedButton('Show all (240 chars)');
  const decoyTarget = document.createElement('div');
  decoyTarget.id = 'revealFixtureDecoy';
  decoyTarget.hidden = true;
  decoyTarget.textContent = 'a value with no needle in it';
  decoyToggle.setAttribute('aria-controls', decoyTarget.id);
  decoyToggle.addEventListener('click', () => {
    globalThis.__networkPlusDecoyClicks += 1;
  });
  revealPair(decoyToggle, decoyTarget);
  const ownerToggle = collapsedButton('Show full URL');
  const ownedTarget = document.createElement('div');
  ownedTarget.id = 'revealFixtureFull';
  ownedTarget.hidden = true;
  ownedTarget.textContent = 'https://api.example.test/v1?token=reveal-needle-one';
  ownerToggle.setAttribute('aria-controls', ownedTarget.id);
  revealPair(ownerToggle, ownedTarget);
  // The decoy comes first, so a selector that takes the first collapsed
  // control in the row rather than the one that owns the node presses it.
  owned.appendChild(decoyToggle);
  owned.appendChild(decoyTarget);
  owned.appendChild(ownerToggle);
  owned.appendChild(ownedTarget);

  const undeclared = document.createElement('div');
  undeclared.className = 'url-breakdown reveal-fixture-undeclared';
  const nestedWrap = document.createElement('div');
  const nestedToggle = collapsedButton('Show all (900 chars)');
  nestedToggle.className += ' reveal-fixture-nested';
  nestedWrap.appendChild(nestedToggle);
  const siblingToggle = collapsedButton('Show full URL');
  siblingToggle.className += ' reveal-fixture-sibling';
  const undeclaredTarget = document.createElement('div');
  undeclaredTarget.hidden = true;
  undeclaredTarget.textContent = 'https://api.example.test/v2?token=reveal-needle-two';
  revealPair(siblingToggle, undeclaredTarget);
  undeclared.appendChild(nestedWrap);
  undeclared.appendChild(siblingToggle);
  undeclared.appendChild(undeclaredTarget);

  pane.appendChild(owned);
  pane.appendChild(undeclared);
  return { owned: owned.className, undeclared: undeclared.className };
})()`;

const PANE_SEARCH_REVEAL_MEASURE = `(() => {
  const read = (selector) => {
    const element = document.querySelector(selector);
    return { hidden: element.hidden, expanded: element.getAttribute('aria-expanded') };
  };
  const marks = Array.from(document.querySelectorAll('#res-body mark.pane-search-hit'));
  return {
    count: document.querySelector('#res-body .pane-search-count').textContent,
    marks: marks.length,
    markBoxes: marks.map((mark) => mark.getClientRects().length),
    owner: read('.reveal-fixture-owned .link-btn[aria-controls="revealFixtureFull"]'),
    ownedTarget: read('#revealFixtureFull'),
    decoy: read('.reveal-fixture-owned .link-btn[aria-controls="revealFixtureDecoy"]'),
    decoyTarget: read('#revealFixtureDecoy'),
    decoyClicks: globalThis.__networkPlusDecoyClicks,
    nested: read('.reveal-fixture-nested'),
    sibling: read('.reveal-fixture-sibling'),
    undeclaredTarget: {
      hidden: document.querySelector('.reveal-fixture-undeclared > div:last-child').hidden,
    },
  };
})()`;

browserTest(
  'a pane-search hit behind a reveal presses the control that owns the hidden node',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: LIVE_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      await waitForLiveNetworkListener(cdp);
      await evaluate(
        cdp,
        `(async () => {
          const settle = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
          const body = 'plain response text with no needle in it';
          globalThis.__networkPlusLiveListener({
            startedDateTime: new Date(1704067200000).toISOString(),
            time: 12,
            request: { method: 'GET', url: 'https://api.example.test/v1/report', httpVersion: 'HTTP/1.1', headers: [] },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/1.1',
              headers: [{ name: 'content-type', value: 'text/plain' }],
              content: { size: body.length, mimeType: 'text/plain' },
            },
            getContent(callback) {
              callback(body, '');
            },
          });
          await settle();
          document.querySelector('#tbody tr[data-row-id="1"]').click();
          document.querySelector('#res-tab-body').click();
          await settle();
          return true;
        })()`,
        true,
      );
      await settleLayout(cdp);
      const planted = await evaluate(cdp, PANE_SEARCH_REVEAL_FIXTURE);
      expect(planted).toEqual({
        owned: 'url-breakdown reveal-fixture-owned',
        undeclared: 'url-breakdown reveal-fixture-undeclared',
      });

      // Both hidden nodes carry the term. The first hit is revealed by the
      // search itself: a match behind `hidden` has no box at all, so it is
      // obscured whether or not a jump was asked for.
      await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#res-body .pane-search-count').textContent;
          const input = document.querySelector('#res-body .pane-search-input');
          const before = count();
          input.value = 'reveal-needle';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
        })()`,
        true,
      );
      await settleLayout(cdp);
      const first = await evaluate(cdp, PANE_SEARCH_REVEAL_MEASURE);
      expect(first.marks).toBe(2);
      expect(first.count).toBe('1 / 2');
      // The toggle that names the node is the one pressed, and the decoy
      // beside it — collapsed, first in the row, owning something else — is
      // neither pressed nor expanded.
      expect(first.owner).toEqual({ hidden: false, expanded: 'true' });
      expect(first.ownedTarget.hidden).toBe(false);
      expect(first.decoy).toEqual({ hidden: false, expanded: 'false' });
      expect(first.decoyTarget.hidden).toBe(true);
      expect(first.decoyClicks).toBe(0);
      // The second hit is still behind its own reveal, so it still has no box.
      expect(first.markBoxes).toEqual([1, 0]);
      expect(first.sibling.expanded).toBe('false');

      // Stepping to the second hit takes the fallback path: nothing declares
      // ownership there, so the direct sibling is pressed and the collapsed
      // control nested beside it is left alone.
      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#res-body .pane-search-input').focus();
          document.querySelector('#res-body .pane-search-input').dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
          );
        })()`,
      );
      await settleLayout(cdp);
      const second = await evaluate(cdp, PANE_SEARCH_REVEAL_MEASURE);
      // Pressing any reveal re-runs the highlight (the pane re-applies its
      // hits after every link-btn click), so the cursor restarts at the first
      // match. What this step is about is which control was pressed.
      expect(second.marks).toBe(2);
      expect(second.sibling).toEqual({ hidden: false, expanded: 'true' });
      expect(second.undeclaredTarget.hidden).toBe(false);
      expect(second.nested).toEqual({ hidden: false, expanded: 'false' });
      expect(second.decoyClicks).toBe(0);
      // Both hits are on screen now, and neither reveal opened the other's.
      expect(second.markBoxes).toEqual([1, 1]);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'the JSON tree aligns sibling keys, folds deep nodes and long strings, and Raw splits the request line',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 800,
      initScript: LIVE_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      await waitForLiveNetworkListener(cdp);
      const injected = await evaluate(
        cdp,
        `(async () => {
          const settle = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
          // A quote and a backslash inside the value, so the folded form has
          // something to escape, and long enough that the escaped one-liner
          // wraps once unfolded.
          const operation =
            'query Viewer {\\n  viewer(alias: "a\\\\b") {\\n    id\\n    name\\n    email\\n    avatarUrl\\n    organizationRole\\n  }\\n}';
          // 'hint' is short but multi-line, so it folds like 'query' while
          // leaving room in the row: that is the only shape in which a value
          // box allowed to grow would carry the comma away from the value.
          const body = JSON.stringify({
            query: operation,
            variables: { input: { filters: { deep: { level: 4 } } } },
            hint: 'a\\nb',
            note: 'short',
          });
          globalThis.__networkPlusLiveListener({
            startedDateTime: new Date(1704067200000).toISOString(),
            time: 40,
            request: {
              method: 'POST',
              url: 'https://api.example.test/graphql?op=Viewer',
              httpVersion: 'HTTP/1.1',
              headers: [{ name: 'Content-Type', value: 'application/json' }],
              postData: { mimeType: 'application/json', text: body },
            },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/1.1',
              headers: [{ name: 'content-type', value: 'application/json' }],
              content: { size: 30, mimeType: 'application/json' },
            },
            getContent(callback) {
              callback('{"data":{"viewer":{"id":"u1"}}}', '');
            },
          });
          await settle();
          document.querySelector('#tbody tr[data-row-id="1"]').click();
          document.querySelector('#req-tab-body').click();
          document.querySelector('#res-tab-raw').click();
          await settle();
          return { body, operation };
        })()`,
        true,
      );
      await settleLayout(cdp);

      const tree = await evaluate(
        cdp,
        `(() => {
          const tree = document.querySelector('#req-body .json-tree');
          const rootChildren = tree.querySelector(':scope > details > .json-tree-children');
          const keyLeft = (el) => Math.round(el.querySelector('.syn-key').getBoundingClientRect().left * 10) / 10;
          const lineFor = (name) => Array.from(rootChildren.children).find((child) => (child.querySelector('.syn-key') || {}).textContent === JSON.stringify(name));
          const queryLine = lineFor('query');
          const variablesNode = lineFor('variables');
          const noteLine = lineFor('note');
          const str = queryLine.querySelector('.json-tree-str');
          const toggle = str.nextElementSibling;
          const lineHeight = parseFloat(getComputedStyle(queryLine).lineHeight);
          const rootClose = tree.querySelector(':scope > details > .json-tree-close');
          return {
            controls: Array.from(tree.querySelectorAll('.json-tree-controls button')).map((button) => button.textContent + ':' + button.className),
            controlsFirst: tree.firstElementChild.className,
            linkBtnCount: tree.querySelectorAll('button.link-btn').length,
            depths: Array.from(tree.querySelectorAll('details')).map((node) => node.dataset.depth + ':' + node.open),
            queryKeyLeft: keyLeft(queryLine),
            variablesKeyLeft: keyLeft(variablesNode.querySelector('summary')),
            noteKeyLeft: keyLeft(noteLine),
            linePadding: getComputedStyle(noteLine).paddingLeft,
            closePadding: getComputedStyle(rootClose).paddingLeft,
            closeDisplay: getComputedStyle(rootClose).display,
            strText: str.textContent,
            strHeight: Math.round(str.getBoundingClientRect().height),
            lineHeight,
            toggleText: toggle.textContent,
            toggleExpanded: toggle.getAttribute('aria-expanded'),
            queryLineDisplay: getComputedStyle(queryLine).display,
            noteText: noteLine.querySelector('.syn-str').textContent,
            // The gap the key's ': ' opens, on the folded flex row and on a
            // plain sibling, plus the separator's own width against a bare
            // colon's — that trailing space is what a flex container drops.
            sepGaps: [queryLine, noteLine].map((line) => {
              const key = line.querySelector('.syn-key').getBoundingClientRect();
              const value = line.querySelector('.syn-str').getBoundingClientRect();
              return Math.round((value.left - key.right) * 100) / 100;
            }),
            sepTexts: [queryLine, noteLine].map((line) => line.textContent),
            // The distance from the end of the value's own text to the comma,
            // on the folded row that does not already fill its line. Measured
            // against the text and not the box: the comma is the next flex
            // item either way, so only the box growing past its text moves it.
            commaGap: (() => {
              const line = lineFor('hint');
              const value = line.querySelector('.json-tree-str');
              const textRange = document.createRange();
              textRange.selectNodeContents(value);
              const comma = Array.from(line.childNodes).find(
                (child) => child.nodeType === 3 && child.textContent === ',',
              );
              const commaRange = document.createRange();
              commaRange.selectNodeContents(comma);
              return (
                Math.round(
                  (commaRange.getBoundingClientRect().left - textRange.getBoundingClientRect().right) * 100,
                ) / 100
              );
            })(),
            hintLineDisplay: getComputedStyle(lineFor('hint')).display,
          };
        })()`,
      );
      expect(tree.controls).toEqual(['Expand all:json-tree-ctl', 'Collapse all:json-tree-ctl']);
      expect(tree.controlsFirst).toBe('json-tree-controls');
      expect(tree.linkBtnCount).toBe(0);
      // Root, variables (1), input (2) open; filters (3) and deep (4) folded.
      expect(tree.depths).toEqual(['0:true', '1:true', '2:true', '3:false', '4:false']);
      // Sibling keys under the same parent share one x, whether the row is a
      // summary (marker + gap), a plain line, or a folded long string.
      expect(tree.variablesKeyLeft).toBe(tree.noteKeyLeft);
      expect(tree.queryKeyLeft).toBe(tree.noteKeyLeft);
      expect(tree.linePadding).toBe('11px');
      expect(tree.closePadding).toBe('11px');
      expect(tree.closeDisplay).toBe('block');
      expect(tree.queryLineDisplay).toBe('flex');
      // The folded string is escaped exactly the way a short one is, so a
      // value carrying a quote, a backslash or a newline reads unambiguously
      // and round-trips; one text node still holds all of it, clamped to one
      // line until unfolded.
      expect(tree.strText).toBe(JSON.stringify(injected.operation));
      expect(JSON.parse(tree.strText)).toBe(injected.operation);
      expect(tree.strText).toContain('\\"a\\\\b\\"');
      expect(tree.strText).not.toContain('\n');
      expect(tree.strHeight).toBeLessThanOrEqual(Math.ceil(tree.lineHeight) + 2);
      expect(tree.toggleText).toBe('▸');
      expect(tree.toggleExpanded).toBe('false');
      expect(tree.noteText).toBe('"short"');
      // The comma closes the value, so it sits immediately after the value
      // box. With the value box allowed to grow (flex:1 1 auto) it filled the
      // row and pushed the comma to the far right of the line.
      expect(tree.hintLineDisplay).toBe('flex');
      expect(Math.abs(tree.commaGap)).toBeLessThanOrEqual(1);
      // The space after the key's colon is in both rows, not only the plain
      // one. The characters are pinned first — so a separator that lost the
      // space everywhere cannot satisfy the equality below by symmetry — then
      // the room they take: the folded row is a flex container, and a bare
      // ': ' text node there is an anonymous item whose trailing space goes.
      expect(tree.sepTexts[0].startsWith('"query": ')).toBe(true);
      expect(tree.sepTexts[1].startsWith('"note": ')).toBe(true);
      expect(Math.abs(tree.sepGaps[0] - tree.sepGaps[1])).toBeLessThanOrEqual(0.5);

      // Drag-selecting a folded row copies the JSON and nothing else. The
      // three controls this pane added — Expand all / Collapse all, the long
      // string's fold caret, and the collapsed node's " N items " summary —
      // are chrome, and without a user-select rule they landed in the drag and
      // in the copy, which is the same defect the URL row's rule closes.
      const foldedSelection = await evaluate(
        cdp,
        `(() => {
          const tree = document.querySelector('#req-body .json-tree');
          const select = (node) => {
            const selection = window.getSelection();
            selection.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(node);
            selection.addRange(range);
            const text = selection.toString();
            selection.removeAllRanges();
            // The folded row is a flex line, so the selection carries a break
            // between its boxes. Empty pieces are dropped and the rest joined:
            // nothing that was selected is removed, only the layout's breaks.
            return text.split('\\n').filter(Boolean).join('');
          };
          const rootChildren = tree.querySelector(':scope > details > .json-tree-children');
          const lineFor = (name) => Array.from(rootChildren.children).find((child) => (child.querySelector('.syn-key') || {}).textContent === JSON.stringify(name));
          const collapsed = tree.querySelector('details[data-depth="3"]');
          return {
            foldedStringRow: select(lineFor('query')),
            collapsedSummary: select(collapsed.querySelector('summary')),
            controls: select(tree.querySelector('.json-tree-controls')),
            caretUserSelect: getComputedStyle(tree.querySelector('.json-tree-str-toggle')).userSelect,
            previewUserSelect: getComputedStyle(tree.querySelector('.json-tree-preview')).userSelect,
            ctlUserSelect: getComputedStyle(tree.querySelector('.json-tree-ctl')).userSelect,
            collapsedOpen: collapsed.open,
            previewText: collapsed.querySelector('.json-tree-preview').textContent,
          };
        })()`,
      );
      // The row is really folded, and its summary really carries a preview,
      // so neither assertion below is about an element that is not there.
      expect(foldedSelection.collapsedOpen).toBe(false);
      expect(foldedSelection.previewText.length).toBeGreaterThan(0);
      // What the drag carries IS the JSON of that row — the fold caret is not
      // in it, and the string is the whole escaped value even though only its
      // first line is painted. The behaviour is asserted before the mechanism,
      // so a regression names the copied text rather than a style property.
      expect(foldedSelection.foldedStringRow).toBe('"query": ' + JSON.stringify(injected.operation) + ',');
      expect(foldedSelection.collapsedSummary).toBe('"filters": {');
      expect(foldedSelection.controls).toBe('');
      expect(foldedSelection.caretUserSelect).toBe('none');
      expect(foldedSelection.previewUserSelect).toBe('none');
      expect(foldedSelection.ctlUserSelect).toBe('none');

      // The whole document is in the DOM, so a hit inside a folded node is an
      // ordinary match with no layout box: the count read "1 / 1" while the
      // pane showed nothing and the collapsed suffix had nothing to point at.
      // Landing on a hit that has no box now opens what hides it.
      const foldedHit = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const folded = document.querySelector('#req-body details[data-depth="4"]');
          const openedBefore = folded.open;
          const before = count();
          input.value = 'level';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
          const mark = document.querySelector('#req-body mark.pane-search-hit-current');
          return {
            openedBefore,
            count: document.querySelector('#req-body .pane-search-count').textContent,
            hits: document.querySelectorAll('#req-body mark.pane-search-hit').length,
            insideFolded: !!mark && folded.contains(mark),
            openedAfter: folded.open,
            hasLayoutBox: !!mark && mark.offsetParent !== null,
            markWidth: mark ? Math.round(mark.getBoundingClientRect().width) : 0,
          };
        })()`,
        true,
      );
      expect(foldedHit.openedBefore).toBe(false);
      expect(foldedHit.count).toBe('1 / 1');
      expect(foldedHit.hits).toBe(1);
      expect(foldedHit.insideFolded).toBe(true);
      expect(foldedHit.openedAfter).toBe(true);
      expect(foldedHit.hasLayoutBox).toBe(true);
      expect(foldedHit.markWidth).toBeGreaterThan(0);
      await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const before = count();
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
        })()`,
        true,
      );

      // A hit inside a FOLDED long string is the case the reveal was written
      // for and the one it missed: -webkit-line-clamp keeps the mark's box in
      // layout, so offsetParent is not null and nothing unfolded. "Obscured"
      // now also means "an ancestor that can be unfolded clips it".
      const clippedHit = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const str = document.querySelector('#req-body .json-tree-str');
          const before = {
            expanded: str.classList.contains('json-tree-str--expanded'),
            clipped: str.scrollHeight > str.clientHeight,
          };
          const beforeCount = count();
          input.value = 'organizationRole';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== beforeCount, 400);
          const mark = document.querySelector('#req-body mark.pane-search-hit-current');
          const markRect = mark ? mark.getBoundingClientRect() : null;
          const strRect = str.getBoundingClientRect();
          return {
            before,
            insideString: !!mark && str.contains(mark),
            // The mark always had a box; that is why offsetParent never fired.
            hasLayoutBox: !!mark && mark.getClientRects().length > 0,
            expandedAfter: str.classList.contains('json-tree-str--expanded'),
            markInsideBox:
              !!markRect && markRect.top >= strRect.top - 0.5 && markRect.bottom <= strRect.bottom + 0.5,
            toggleExpanded: str.nextElementSibling.getAttribute('aria-expanded'),
          };
        })()`,
        true,
      );
      expect(clippedHit.before).toEqual({ expanded: false, clipped: true });
      expect(clippedHit.insideString).toBe(true);
      expect(clippedHit.hasLayoutBox).toBe(true);
      expect(clippedHit.expandedAfter).toBe(true);
      expect(clippedHit.markInsideBox).toBe(true);
      expect(clippedHit.toggleExpanded).toBe('true');

      // The same query, stored, is re-applied to every Body/Raw pane on the
      // next render — including the three the reader is not looking at, where
      // a mark also has offsetParent === null. Revealing there opened nodes
      // and pressed controls in a pane nobody had on screen.
      const hiddenPane = await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const settle = () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 80))));
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const before = count();
          input.value = 'level';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
          // Move the reader to Raw, then re-render the row so Body is rebuilt
          // and re-highlighted while it is the hidden pane.
          document.querySelector('#req-tab-raw').click();
          await settle();
          document.querySelector('#tbody tr[data-row-id="1"]').click();
          await settle();
          const body = document.querySelector('#req-body');
          const folded = body.querySelector('details[data-depth="4"]');
          const mark = body.querySelector('mark.pane-search-hit-current');
          return {
            activePane: document.querySelector('#req-tab-raw').getAttribute('aria-selected'),
            bodyDisplayed: body.getClientRects().length > 0,
            hitExists: !!mark,
            hitInsideFolded: !!mark && folded.contains(mark),
            // Untouched: the node the reveal would have opened is still shut.
            foldedOpen: folded.open,
            openNodes: Array.from(body.querySelectorAll('details')).map((node) => node.open),
            count: body.querySelector('.pane-search-count').textContent,
          };
        })()`,
        true,
      );
      expect(hiddenPane.activePane).toBe('true');
      expect(hiddenPane.bodyDisplayed).toBe(false);
      expect(hiddenPane.hitExists).toBe(true);
      expect(hiddenPane.hitInsideFolded).toBe(true);
      expect(hiddenPane.foldedOpen).toBe(false);
      expect(hiddenPane.openNodes).toEqual([true, true, true, false, false]);
      expect(hiddenPane.count).toBe('1 / 1');
      await evaluate(
        cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          document.querySelector('#req-tab-body').click();
          const count = () => document.querySelector('#req-body .pane-search-count').textContent;
          const input = document.querySelector('#req-body .pane-search-input');
          const before = count();
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await waitFor(() => count() !== before, 400);
        })()`,
        true,
      );
      await settleLayout(cdp);

      const unfolded = await evaluate(
        cdp,
        `(() => {
          const str = document.querySelector('#req-body .json-tree-str');
          str.nextElementSibling.click();
          return {
            height: Math.round(str.getBoundingClientRect().height),
            lineHeight: parseFloat(getComputedStyle(str).lineHeight),
            toggleText: str.nextElementSibling.textContent,
            clipped: str.scrollHeight > str.clientHeight,
          };
        })()`,
      );
      // Unfolded it wraps instead of clamping: more than the one line the
      // fold showed.
      expect(unfolded.height).toBeGreaterThanOrEqual(Math.floor(unfolded.lineHeight * 2));
      expect(unfolded.toggleText).toBe('▾');
      expect(unfolded.clipped).toBe(false);

      // Collapse all keeps only the root open; Expand all opens everything.
      const folding = await evaluate(
        cdp,
        `(() => {
          const tree = document.querySelector('#req-body .json-tree');
          const [expandAll, collapseAll] = tree.querySelectorAll('.json-tree-controls button');
          const state = () => Array.from(tree.querySelectorAll('details')).map((node) => node.open);
          collapseAll.click();
          const collapsed = state();
          expandAll.click();
          const expanded = state();
          return { collapsed, expanded };
        })()`,
      );
      expect(folding).toEqual({
        collapsed: [true, false, false, false, false],
        expanded: [true, true, true, true, true],
      });

      // A click that ends with a live selection across the summary text is
      // a selection, not a toggle; a plain click still toggles.
      const guard = await evaluate(
        cdp,
        `(() => {
          const node = document.querySelector('#req-body details[data-depth="1"]');
          const summary = node.querySelector('summary');
          const before = node.open;
          const selection = window.getSelection();
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(summary.querySelector('.syn-key'));
          selection.addRange(range);
          summary.click();
          const afterSelectedClick = node.open;
          selection.removeAllRanges();
          summary.click();
          return { before, afterSelectedClick, afterPlainClick: node.open };
        })()`,
      );
      expect(guard).toEqual({ before: true, afterSelectedClick: true, afterPlainClick: false });

      // Raw: the request line splits into method / path / protocol, a
      // hairline divides headers from the body, the body is the original
      // JSON text highlighted in place, and there is no nested <pre>.
      await evaluate(cdp, "document.querySelector('#req-tab-raw').click()");
      await settleLayout(cdp);
      const raw = await evaluate(
        cdp,
        `(() => {
          const pre = document.querySelector('#req-raw .code-raw');
          const nodes = Array.from(pre.childNodes);
          const divider = pre.querySelector('.raw-body-divider');
          const dividerAt = nodes.indexOf(divider);
          const bodyText = nodes.slice(dividerAt + 1).map((node) => node.textContent).join('');
          const described = (node) => (node.nodeType === 1 ? node.className + '=' + node.textContent : JSON.stringify(node.textContent));
          return {
            head: nodes.slice(0, 6).map(described),
            dividerCount: pre.querySelectorAll('.raw-body-divider').length,
            dividerDisplay: getComputedStyle(divider).display,
            dividerBorder: getComputedStyle(divider).borderTopWidth,
            dividerHeight: Math.round(divider.getBoundingClientRect().height),
            bodyText,
            bodyKeys: Array.from(pre.querySelectorAll('.syn-key')).map((key) => key.textContent).slice(0, 3),
            nestedPre: pre.querySelectorAll('pre').length,
            weightMethod: getComputedStyle(nodes[0]).fontWeight,
            weightPath: getComputedStyle(nodes[2]).fontWeight,
            toolbarFirst: document.querySelector('#req-raw').firstElementChild.className,
          };
        })()`,
      );
      expect(raw.head).toEqual([
        'syn-status-line=POST',
        '" "',
        'syn-hdr-val=/graphql?op=Viewer',
        '" "',
        'syn-status-line=HTTP/1.1',
        '"\\r"',
      ]);
      expect(raw.dividerCount).toBe(1);
      expect(raw.dividerDisplay).toBe('block');
      expect(raw.dividerBorder).toBe('1px');
      expect(raw.dividerHeight).toBe(1);
      expect(raw.bodyText).toBe(injected.body);
      expect(raw.bodyKeys).toEqual(['"query"', '"variables"', '"input"']);
      expect(raw.nestedPre).toBe(0);
      expect(raw.weightMethod).toBe('700');
      expect(raw.weightPath).toBe('400');
      expect(raw.toolbarFirst).toBe('pane-search-bar');

      // The response status line stays one span; its JSON body is highlighted too.
      const resRaw = await evaluate(
        cdp,
        `(() => {
          const pre = document.querySelector('#res-raw .code-raw');
          return {
            first: pre.firstChild.className + '=' + pre.firstChild.textContent,
            dividerCount: pre.querySelectorAll('.raw-body-divider').length,
            keys: Array.from(pre.querySelectorAll('.syn-key')).map((key) => key.textContent),
          };
        })()`,
      );
      expect(resRaw).toEqual({
        first: 'syn-status-line=HTTP/1.1 200 OK',
        dividerCount: 1,
        keys: ['"data"', '"viewer"', '"id"'],
      });
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

// Tier 2 UX: collapsible inspector halves, the pane's guidance line, the
// status bar's 900px compact breakpoint, the reopened status text, the grouped
// Columns menu with Reset, and the four distinct row-state looks.
const INSPECTOR_HALVES_MEASURE = `(() => {
  const panels = document.querySelector('.inspector-panels');
  const request = document.querySelector('#inspector-request');
  const response = document.querySelector('#inspector-response');
  const divider = document.querySelector('#inspector-divider');
  const requestToggle = document.querySelector('#inspector-request-toggle');
  const responseToggle = document.querySelector('#inspector-response-toggle');
  return {
    panelsHeight: Math.round(panels.getBoundingClientRect().height),
    requestHeight: Math.round(request.getBoundingClientRect().height),
    responseHeight: Math.round(response.getBoundingClientRect().height),
    requestCollapsed: request.classList.contains('is-collapsed'),
    responseCollapsed: response.classList.contains('is-collapsed'),
    requestContentDisplay: getComputedStyle(document.querySelector('#inspector-request-content')).display,
    responseContentDisplay: getComputedStyle(document.querySelector('#inspector-response-content')).display,
    requestExpanded: requestToggle.getAttribute('aria-expanded'),
    responseExpanded: responseToggle.getAttribute('aria-expanded'),
    requestTitle: requestToggle.title,
    toggleTag: requestToggle.tagName,
    dividerValueNow: divider.getAttribute('aria-valuenow'),
    dividerValueText: divider.getAttribute('aria-valuetext'),
    dividerDisabled: divider.getAttribute('aria-disabled'),
    dividerCursor: getComputedStyle(divider).cursor,
    stored: localStorage.getItem('networkPlus.inspectorSplit.v1'),
  };
})()`;

// The pane toolbar's height must fall, never rise, as the pane widens, and the
// query field must stay wide enough to read the query in. Both were pinned at
// one width before, and one width is exactly what hid the defects: the copy
// pair switched to icons at 460px while the bar really wrapped past 700px in
// Japanese, so the toolbar was one row at 440px and two at 538px; and the
// field, at flex:1 1 60px, was ~62px at the 440px pane and showed "BEACON"
// for a typed "BEACONWORD". These are properties over the band, not values.
const PANE_TOOLBAR_BAND_WIDTHS = [400, 440, 480, 520, 560, 600, 640, 680, 720, 760, 800, 860, 900];
const PANE_TOOLBAR_BAND_QUERY = 'BEACONWORD';
const PANE_TOOLBAR_BAND_MEASURE = `(() => {
  const pane = document.querySelector('#res-body');
  const bar = pane.querySelector('.pane-search-bar');
  const input = bar.querySelector('.pane-search-input');
  const inputStyle = getComputedStyle(input);
  const context = document.createElement('canvas').getContext('2d');
  context.font = [inputStyle.fontStyle, inputStyle.fontWeight, inputStyle.fontSize, inputStyle.fontFamily].join(' ');
  // An <input> reports scrollWidth === clientWidth until it is scrolled, so
  // "does the typed query fit" is measured in the field's own font instead.
  const textWidth = context.measureText(input.value).width;
  const contentWidth =
    input.clientWidth - parseFloat(inputStyle.paddingLeft) - parseFloat(inputStyle.paddingRight);
  const rowsOf = (elements) => {
    const centres = [];
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (!rect.width) continue;
      const centre = rect.top + rect.height / 2;
      if (!centres.some((known) => Math.abs(known - centre) < 8)) centres.push(centre);
    }
    return centres.length;
  };
  return {
    paneWidth: Math.round(document.querySelector('#details').getBoundingClientRect().width),
    barRows: rowsOf(Array.from(bar.children)),
    barHeight: Math.round(bar.getBoundingClientRect().height),
    queryFits: textWidth <= contentWidth,
    queryContentWidth: Math.round(contentWidth),
    expandShown: !bar.querySelector('.pane-search-expand').hidden,
    copyLabelShown: getComputedStyle(bar.querySelector('.copy-btn-label')).display !== 'none',
    barOverflow: Math.round(bar.scrollWidth - bar.clientWidth),
    paneOverflow: Math.round(pane.scrollWidth - pane.clientWidth),
  };
})()`;

browserTest(
  'the pane toolbar height only falls as the pane widens and the query field stays readable',
  async () => {
    // A plain-text body past the 2,000-character preview limit with the query
    // beyond the cut, so the bar carries its widest set: a hit count with the
    // collapsed suffix, Expand all, two nav buttons and the copy pair.
    const body = 'lorem ipsum ' + PANE_TOOLBAR_BAND_QUERY + ' dolor sit amet '.repeat(1);
    const table = [];
    const shippedPaneCeilings = [];
    // One browser for both languages: the language is stored and the document
    // reloaded, which hands the second pass the same fresh page a second
    // launch handed it with one fewer spawn to fail on.
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1400,
      height: 800,
      initScript: LIVE_CAPTURE_INIT_SCRIPT,
    });
    const { cdp } = page;
    try {
      for (const [languageIndex, language] of ['en', 'ja'].entries()) {
        if (languageIndex > 0) {
          await reloadInLanguage(page, language);
          // The band sweep leaves the window at the 4000px ceiling probe; the
          // next language starts from the window a fresh launch started from.
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: 1400,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false,
          });
        }
        expect(await evaluate(cdp, 'document.documentElement.lang')).toBe(language);
        await waitForLiveNetworkListener(cdp);
        const injected = await evaluate(
          cdp,
          `(async () => {
            const settle = () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60))));
            const body = ${JSON.stringify(body)}.repeat(160);
            globalThis.__networkPlusLiveListener({
              startedDateTime: new Date(1704067200000).toISOString(),
              time: 40,
              request: { method: 'GET', url: 'https://api.example.test/beacon', httpVersion: 'HTTP/1.1', headers: [] },
              response: {
                status: 200,
                statusText: 'OK',
                httpVersion: 'HTTP/1.1',
                headers: [{ name: 'content-type', value: 'text/plain' }],
                content: { size: body.length, mimeType: 'text/plain' },
              },
              getContent(callback) {
                callback(body, '');
              },
            });
            await settle();
            return body.length;
          })()`,
          true,
        );
        expect(injected).toBeGreaterThan(2000);
        await evaluate(
          cdp,
          `(() => {
            document.querySelector('#tbody tr[data-row-id="1"]').click();
            document.querySelector('#res-tab-body').click();
          })()`,
        );
        await settleLayout(cdp);
        await evaluate(
          cdp,
          `(async () => {${WAIT_FOR_IN_PAGE}
            const count = () => document.querySelector('#res-body .pane-search-count').textContent;
            const input = document.querySelector('#res-body .pane-search-input');
            const before = count();
            input.value = ${JSON.stringify(PANE_TOOLBAR_BAND_QUERY)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await waitFor(() => count() !== before, 400);
          })()`,
          true,
        );
        for (const paneWidth of PANE_TOOLBAR_BAND_WIDTHS) {
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: paneWidth + 480,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await settleLayout(cdp);
          await evaluate(cdp, `document.querySelector('#details').style.flexBasis = '${paneWidth}px'`);
          await settleLayout(cdp);
          table.push({ language, requested: paneWidth, ...(await evaluate(cdp, PANE_TOOLBAR_BAND_MEASURE)) });
        }
        // The pane's own shipped ceiling, read back rather than restated: the
        // override above is what lets the band reach widths the layout cannot,
        // and the label threshold has to be reachable UNDER this number.
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: 4000,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await evaluate(cdp, "document.querySelector('#details').style.flexBasis = ''");
        await settleLayout(cdp);
        shippedPaneCeilings.push({
          language,
          ceiling: await evaluate(
            cdp,
            "Math.round(document.querySelector('#details').getBoundingClientRect().width)",
          ),
        });
      }
    } finally {
      await page.close();
    }

    expect(table).toHaveLength(2 * PANE_TOOLBAR_BAND_WIDTHS.length);
    for (const cell of table) {
      const at = [cell.language, cell.requested];
      // The widest bar state really is the one being measured.
      expect([...at, cell.expandShown]).toEqual([...at, true]);
      // The typed query is legible at every width in the band: this is the
      // field's floor doing its work, and the count or the copy pair giving
      // way instead of the field.
      expect([...at, cell.queryFits]).toEqual([...at, true]);
      expect([...at, cell.queryContentWidth >= 100]).toEqual([...at, true]);
      // Nothing is pushed out of the bar or the pane at any width.
      expect([...at, cell.barOverflow <= 0]).toEqual([...at, true]);
      expect([...at, cell.paneOverflow <= 0]).toEqual([...at, true]);
      expect([...at, cell.barRows <= 2]).toEqual([...at, true]);
      // The copy pair's labels are only painted where the row can hold them:
      // that is what the container query is for, and its threshold has to
      // cover the whole band where the bar really wraps. At 460px the labels
      // came back at 480 while the bar still needed two rows to 620 in
      // Japanese, which is the non-monotonic step this replaced.
      expect([...at, cell.copyLabelShown && cell.barRows > 1]).toEqual([...at, false]);
    }
    // Not vacuous, and this is the assertion the vacuity hid: the labels are
    // painted at a width the pane can actually reach. The threshold used to be
    // 760px while .details is flex:0 0 clamp(440px,42%,760px) and is its own
    // size container, so the labelled state existed only at the band widths
    // this test forces past the clamp — every shipped width showed icons and
    // the "never labels beside a wrapped bar" line above asserted nothing.
    expect(shippedPaneCeilings).toHaveLength(2);
    for (const { language, ceiling } of shippedPaneCeilings) {
      const reachable = table.filter((cell) => cell.language === language && cell.requested <= ceiling);
      expect([language, ceiling > 0]).toEqual([language, true]);
      expect([language, reachable.some((cell) => cell.copyLabelShown)]).toEqual([language, true]);
      // And the icon state is still reached, so the container query is doing
      // work at both ends rather than having been switched off outright.
      expect([language, reachable.some((cell) => !cell.copyLabelShown)]).toEqual([language, true]);
    }
    // The property that a single width cannot state: widening the pane never
    // costs the reader a toolbar row. The row count is what monotonicity is
    // about — a 1px change in a one-row bar between languages is not a step.
    for (const language of ['en', 'ja']) {
      const band = table.filter((cell) => cell.language === language);
      for (let index = 1; index < band.length; index += 1) {
        expect([language, band[index - 1].requested, band[index].requested, band[index].barRows]).toEqual([
          language,
          band[index - 1].requested,
          band[index].requested,
          Math.min(band[index - 1].barRows, band[index].barRows),
        ]);
      }
      // Not vacuous: the band really does contain a width where the bar wraps
      // and a width where it does not.
      expect([language, band.some((cell) => cell.barRows === 2)]).toEqual([language, true]);
      expect([language, band.some((cell) => cell.barRows === 1)]).toEqual([language, true]);
    }
  },
  TEST_TIMEOUT_MS * 3,
);

browserTest(
  'the inspector halves collapse from their labels, persist, and restore with a double-click',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, width: 1440, height: 420 });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      const open = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(open).toMatchObject({
        requestCollapsed: false,
        responseCollapsed: false,
        requestExpanded: 'true',
        responseExpanded: 'true',
        requestTitle: 'Collapse the Request inspector to its tabs',
        toggleTag: 'BUTTON',
        dividerDisabled: 'false',
        dividerCursor: 'row-resize',
        stored: null,
      });
      expect(Math.abs(open.requestHeight - open.responseHeight)).toBeLessThanOrEqual(1);

      // Collapse Request: label + tab bar remain (~50px) and Response takes the rest.
      await evaluate(cdp, "document.querySelector('#inspector-request-toggle').click()");
      await settleLayout(cdp);
      const requestCollapsed = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(requestCollapsed).toMatchObject({
        requestCollapsed: true,
        responseCollapsed: false,
        requestContentDisplay: 'none',
        responseContentDisplay: 'block',
        requestExpanded: 'false',
        responseExpanded: 'true',
        requestTitle: 'Expand the Request inspector',
        dividerValueNow: '0',
        dividerValueText: 'Request inspector collapsed',
        dividerDisabled: 'true',
        dividerCursor: 'default',
        stored: '{"percent":50,"collapsed":"request"}',
      });
      expect(requestCollapsed.requestHeight).toBeLessThanOrEqual(60);
      // Three heights rounded independently of one another, so the relation is
      // asserted to the pixel that rounding alone can move it.
      expect(
        Math.abs(
          requestCollapsed.responseHeight -
            (requestCollapsed.panelsHeight - requestCollapsed.requestHeight - 3),
        ),
      ).toBeLessThanOrEqual(1);
      expect(await evaluate(cdp, "document.querySelector('#statusText').textContent")).toBe(
        'Request inspector collapsed. Double-click the divider to restore 50/50.',
      );

      // Resizing is paused while a half is collapsed.
      await evaluate(cdp, "document.querySelector('#inspector-divider').focus()");
      await pressKey(cdp, 'ArrowDown', 'ArrowDown', 40);
      await settleLayout(cdp);
      expect((await evaluate(cdp, INSPECTOR_HALVES_MEASURE)).requestHeight).toBe(requestCollapsed.requestHeight);

      // Collapsing the other half re-expands the first: both collapsed is not allowed.
      await evaluate(cdp, "document.querySelector('#inspector-response-toggle').click()");
      await settleLayout(cdp);
      const responseCollapsed = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(responseCollapsed).toMatchObject({
        requestCollapsed: false,
        responseCollapsed: true,
        requestExpanded: 'true',
        responseExpanded: 'false',
        dividerValueNow: '100',
        dividerValueText: 'Response inspector collapsed',
        stored: '{"percent":50,"collapsed":"response"}',
      });
      expect(responseCollapsed.responseHeight).toBeLessThanOrEqual(60);

      // The collapsed half survives a reload.
      await page.navigate();
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      const restored = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(restored).toMatchObject({ requestCollapsed: false, responseCollapsed: true, responseExpanded: 'false' });
      expect(restored.responseHeight).toBeLessThanOrEqual(60);

      // Clicking a tab in the collapsed half opens it again.
      await evaluate(cdp, "document.querySelector('#res-tab-body').click()");
      await settleLayout(cdp);
      const reopenedByTab = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(reopenedByTab).toMatchObject({ responseCollapsed: false, responseExpanded: 'true', stored: '{"percent":50,"collapsed":null}' });
      expect(await evaluate(cdp, "document.querySelector('#res-tab-body').classList.contains('active')")).toBe(true);

      // A keyed split persists and is restored on the next load ...
      await evaluate(cdp, "document.querySelector('#inspector-divider').focus()");
      await pressKey(cdp, 'ArrowDown', 'ArrowDown', 40, 8);
      await settleLayout(cdp);
      const keyed = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(Number(keyed.dividerValueNow)).toBeGreaterThan(50);
      expect(keyed.stored).toBe('{"percent":' + keyed.dividerValueNow + ',"collapsed":null}');
      await page.navigate();
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      const restoredSplit = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(restoredSplit.dividerValueNow).toBe(keyed.dividerValueNow);
      // The pane's height differs between loads (the status bar wraps a
      // different message), so the restored split is checked as a share.
      expect(
        Math.abs(restoredSplit.requestHeight - (Number(keyed.dividerValueNow) / 100) * (restoredSplit.panelsHeight - 3)),
      ).toBeLessThanOrEqual(1);

      // ... and a double-click on the divider restores 50/50 with both halves open.
      await evaluate(
        cdp,
        "document.querySelector('#inspector-divider').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))",
      );
      await settleLayout(cdp);
      const reset = await evaluate(cdp, INSPECTOR_HALVES_MEASURE);
      expect(reset).toMatchObject({
        requestCollapsed: false,
        responseCollapsed: false,
        dividerValueNow: '50',
        dividerDisabled: 'false',
        stored: '{"percent":50,"collapsed":null}',
      });
      expect(Math.abs(reset.requestHeight - reset.responseHeight)).toBeLessThanOrEqual(1);
      expect(await evaluate(cdp, "document.querySelector('#statusText').textContent")).toBe(
        'Request and response inspectors restored to 50/50.',
      );
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

const INSPECTOR_EMPTY_MEASURE = `(() => {
  const empty = document.querySelector('#inspectorEmptyState');
  const panels = document.querySelector('.inspector-panels');
  return {
    detailsHidden: document.querySelector('#details').hidden,
    emptyHidden: empty.hidden,
    emptyDisplay: getComputedStyle(empty).display,
    emptyText: empty.textContent,
    panelsHidden: panels.hidden,
    panelsDisplay: getComputedStyle(panels).display,
    panelsAriaHidden: panels.getAttribute('aria-hidden'),
    title: document.querySelector('#detailsTitle').textContent,
  };
})()`;

browserTest(
  'the details pane shows one guidance line until a request is selected',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, width: 1280, height: 800 });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      await settleLayout(cdp);
      expect(await evaluate(cdp, INSPECTOR_EMPTY_MEASURE)).toEqual({
        detailsHidden: false,
        emptyHidden: false,
        emptyDisplay: 'block',
        emptyText: 'Select a request to inspect it — click a row, ↑↓ to move, Enter to open',
        panelsHidden: true,
        panelsDisplay: 'none',
        panelsAriaHidden: 'true',
        title: 'Select a request...',
      });
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      expect(await evaluate(cdp, INSPECTOR_EMPTY_MEASURE)).toMatchObject({
        detailsHidden: false,
        emptyHidden: true,
        emptyDisplay: 'none',
        panelsHidden: false,
        panelsDisplay: 'flex',
        panelsAriaHidden: null,
      });
      // Leaving the sample clears the pane: the guidance line returns.
      await evaluate(cdp, "document.querySelector('#sampleExitBtn').click()");
      await settleLayout(cdp);
      expect(await evaluate(cdp, INSPECTOR_EMPTY_MEASURE)).toMatchObject({
        emptyHidden: false,
        panelsHidden: true,
        title: 'Select a request...',
      });
      // The guidance line translates with the rest of the pane.
      await reloadInLanguage(page, 'ja');
      await settleLayout(cdp);
      expect(await evaluate(cdp, INSPECTOR_EMPTY_MEASURE)).toMatchObject({
        emptyHidden: false,
        emptyText: 'リクエストを選択すると内容を確認できます — 行をクリック、↑↓ で移動、Enter で開く',
        panelsHidden: true,
      });
      // Screen readers hear the same language as the tooltip: the header's
      // icon-only buttons translate their aria-label, not just their title.
      expect(
        await evaluate(
          cdp,
          `(() => {
            const describe = (id) => {
              const el = document.querySelector(id);
              return { label: el.getAttribute('aria-label'), title: el.title };
            };
            return { close: describe('#detailsCloseBtn'), copyUrl: describe('#detailsCopyUrlBtn') };
          })()`,
        ),
      ).toEqual({
        close: { label: 'リクエスト詳細を閉じる', title: 'リクエスト詳細を閉じる' },
        copyUrl: { label: 'サニタイズ済み URL をコピー', title: 'サニタイズ済み URL をコピー' },
      });
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'reopening the details pane by selection replaces the close notice with the new request',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, width: 1280, height: 800 });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      const statusText = () => evaluate(cdp, "document.querySelector('#statusText').textContent");
      const before = await statusText();
      expect(before).toMatch(/^Local sample capture: 3 synthetic requests loaded\./);
      await evaluate(cdp, "document.querySelector('#detailsCloseBtn').click()");
      await settleLayout(cdp);
      expect(await statusText()).toBe('Request details closed. Select a request to reopen.');
      await evaluate(cdp, "document.querySelectorAll('#tbody tr[data-row-id]')[1].click()");
      await settleLayout(cdp);
      expect(await evaluate(cdp, "document.querySelector('#details').hidden")).toBe(false);
      // The notice is answered by the request that answered it, not by the
      // sample-capture line the notice happened to displace.
      expect(await statusText()).toBe('Selected POST · checkout.network-plus.test · 503 Service Unavailable.');
      expect(await statusText()).not.toBe(before);
      // That line names one request. Selecting another one must not leave the
      // bar naming the request that is no longer selected.
      await evaluate(cdp, "document.querySelectorAll('#tbody tr[data-row-id]')[2].click()");
      await settleLayout(cdp);
      const afterSecond = await statusText();
      expect(afterSecond).not.toContain('checkout.network-plus.test');
      expect(afterSecond).toBe('Selected GET · static.network-plus.test · 304 Not Modified.');
      await evaluate(cdp, "document.querySelectorAll('#tbody tr[data-row-id]')[0].click()");
      await settleLayout(cdp);
      expect(await statusText()).toBe('Selected GET · api.network-plus.test · 200 OK.');
      // A message written while the pane was closed is not replaced. It is
      // written through a real setStatus path (the Columns menu's Reset), so
      // the guard cannot pass on a hand-planted #statusText string.
      await evaluate(cdp, "document.querySelector('#detailsCloseBtn').click()");
      await settleLayout(cdp);
      expect(await statusText()).toBe('Request details closed. Select a request to reopen.');
      await evaluate(cdp, "document.querySelector('#columnsBtn').click()");
      await settleLayout(cdp);
      await evaluate(
        cdp,
        `(() => {
          Array.from(document.querySelectorAll('#columnsMenu .columns-header-action'))
            .find((button) => button.textContent === 'Reset')
            .click();
        })()`,
      );
      await settleLayout(cdp);
      const other = 'Columns reset to the default visibility and widths.';
      expect(await statusText()).toBe(other);
      expect(await evaluate(cdp, "document.querySelector('#details').hidden")).toBe(true);
      await evaluate(cdp, "document.querySelectorAll('#tbody tr[data-row-id]')[2].click()");
      await settleLayout(cdp);
      expect(await evaluate(cdp, "document.querySelector('#details').hidden")).toBe(false);
      expect(await statusText()).toBe(other);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

const STATUS_ROW_MEASURE = `(() => {
  const statusbar = document.querySelector('.statusbar');
  const items = Array.from(statusbar.children)
    .filter((child) => !child.hidden && !child.classList.contains('sr-only'))
    .map((child) => child.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const wrapped = items.some((a) => items.some((b) => a.top >= b.bottom - 0.5));
  const toggle = document.querySelector('#statusDetailsToggle');
  const details = document.querySelector('#statusDetails');
  return {
    width: innerWidth,
    wrapped,
    rows: wrapped ? 2 : 1,
    toggleHidden: toggle.hidden,
    toggleDisplay: getComputedStyle(toggle).display,
    detailsHidden: details.hidden,
    detailsDisplay: getComputedStyle(details).display,
    spacerDisplay: getComputedStyle(statusbar.querySelector('.spacer')).display,
    stacked: getComputedStyle(document.querySelector('#content')).flexDirection === 'column',
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

browserTest(
  'the status bar compacts to one row between 801 and 900px while the workbench stacks only at 800',
  async () => {
    // Live rows through a DevTools shim: the sample capture's own buttons
    // would fill the bar on their own, which is not the audit's complaint.
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 850,
      height: 800,
      initScript: `(() => {
        const chromeApi = globalThis.chrome || {};
        chromeApi.storage = { local: { get(_keys, callback) { callback({}); }, set(_value, callback) { if (callback) callback(); } } };
        chromeApi.runtime = { lastError: null, getManifest() { return { version: '1.6.0' }; } };
        chromeApi.devtools = {
          network: { onRequestFinished: { addListener(listener) { globalThis.__networkPlusLiveListener = listener; } } },
          panels: { openResource() {} },
        };
        globalThis.chrome = chromeApi;
      })();`,
    });
    const { cdp } = page;
    try {
      await waitForLiveNetworkListener(cdp);
      await evaluate(
        cdp,
        `(() => {
          for (let index = 0; index < 3; index += 1) {
            globalThis.__networkPlusLiveListener({
              startedDateTime: new Date(1704067200000 + index * 1000).toISOString(),
              time: 12,
              request: { method: 'GET', url: 'https://api.example.test/v1/items/' + index, headers: [] },
              response: {
                status: 200,
                statusText: 'OK',
                httpVersion: 'HTTP/2',
                headers: [{ name: 'content-type', value: 'application/json' }],
                content: { size: 1200, mimeType: 'application/json' },
              },
              getContent(callback) { callback('{"ok":true}', ''); },
            });
          }
        })()`,
      );
      await settleLayout(cdp);
      await evaluate(cdp, "document.querySelectorAll('#tbody tr[data-row-id]')[0].click()");
      await settleLayout(cdp);
      const setWidth = async (width) => {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
        await settleLayout(cdp);
        return evaluate(cdp, STATUS_ROW_MEASURE);
      };
      expect(await evaluate(cdp, STATUS_ROW_MEASURE)).toEqual({
        width: 850,
        wrapped: false,
        rows: 1,
        toggleHidden: false,
        toggleDisplay: 'flex',
        detailsHidden: true,
        detailsDisplay: 'none',
        spacerDisplay: 'none',
        stacked: false,
        documentOverflow: 0,
      });
      expect(await setWidth(801)).toMatchObject({ rows: 1, toggleHidden: false, detailsHidden: true, stacked: false });
      expect(await setWidth(900)).toMatchObject({ rows: 1, toggleHidden: false, detailsHidden: true, stacked: false });
      // Wide: the details are inline again and the spacer separates message
      // and counter — and the bar is still one row. Measured at 901px with
      // the row selected: message 182px + spacer 120px + counter 56px = 358px
      // of 901px, so the inline details buy back the width, not a second row.
      expect(await setWidth(901)).toMatchObject({
        rows: 1,
        wrapped: false,
        toggleHidden: true,
        toggleDisplay: 'none',
        detailsHidden: false,
        detailsDisplay: 'contents',
        spacerDisplay: 'block',
        stacked: false,
        documentOverflow: 0,
      });
      // The layout breakpoint has not moved.
      expect(await setWidth(800)).toMatchObject({ rows: 1, toggleHidden: false, detailsHidden: true, stacked: true });
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

const COLUMNS_MENU_MEASURE = `(() => {
  const menu = document.querySelector('#columnsMenu');
  const rect = menu.getBoundingClientRect();
  const button = document.querySelector('#columnsBtn').getBoundingClientRect();
  const checkboxes = Array.from(menu.querySelectorAll('[role="menuitemcheckbox"]'));
  const stored = JSON.parse(localStorage.getItem('networkPlus.cols') || '[]');
  return {
    shown: menu.classList.contains('show'),
    inlineTop: menu.style.top,
    inlineMaxHeight: menu.style.maxHeight,
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    buttonBottom: Math.round(button.bottom),
    viewportHeight: innerHeight,
    scrolls: menu.scrollHeight > menu.clientHeight + 1,
    headerActions: Array.from(menu.querySelectorAll('.columns-header-action')).map((item) => item.textContent),
    hints: Array.from(menu.querySelectorAll('.columns-preset-hint')).map((item) => item.textContent),
    firstOfEachGroup: Array.from(menu.querySelectorAll('.columns-group-hint')).map(
      (hint) => hint.nextElementSibling.textContent,
    ),
    checkboxCount: checkboxes.length,
    // The header-name field and the Apply button share one row: the menu-item
    // width:100% resolved Apply's flex basis to the whole row and left the
    // input 14px wide, too narrow to read its own placeholder.
    headerInputWidth: Math.round(menu.querySelector('#customHeaderNameInput').getBoundingClientRect().width),
    headerApplyWidth: Math.round(menu.querySelector('#customHeaderApplyBtn').getBoundingClientRect().width),
    headerRowWidth: Math.round(menu.querySelector('.columns-header-row').getBoundingClientRect().width),
    headerInputSameRow:
      Math.round(menu.querySelector('#customHeaderNameInput').getBoundingClientRect().top) ===
      Math.round(menu.querySelector('#customHeaderApplyBtn').getBoundingClientRect().top),
    pathChecked: checkboxes.find((item) => item.textContent.endsWith(' Path'))?.getAttribute('aria-checked'),
    storedPath: stored.find((column) => column.id === 'path') || null,
    pathHeader: !!document.querySelector('thead th[data-col-id="path"]'),
  };
})()`;

browserTest(
  'the Columns menu groups its checkboxes under the button and Reset restores the defaults',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, width: 1280, height: 800 });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      const openMenu = async () => {
        await evaluate(cdp, "document.querySelector('#columnsBtn').click()");
        await settleLayout(cdp);
        return evaluate(cdp, COLUMNS_MENU_MEASURE);
      };
      const opened = await openMenu();
      expect(opened).toMatchObject({
        shown: true,
        headerActions: ['Select all', 'Deselect all', 'Reset'],
        hints: ['Identity', 'Timing', 'Payload', 'Header column', 'Domain summary', 'Saved view'],
        firstOfEachGroup: ['☑ Match', '☑ Client start', '☑ Type'],
        checkboxCount: 17,
        pathChecked: 'true',
      });
      // Anchored under the button and never past the bottom of the viewport.
      expect(opened.top).toBeGreaterThanOrEqual(opened.buttonBottom);
      expect(opened.bottom).toBeLessThanOrEqual(opened.viewportHeight);
      // The name field keeps a readable minimum and the Apply button takes
      // only its own text: they share the row instead of one swallowing it.
      expect(opened.headerInputSameRow).toBe(true);
      expect(opened.headerInputWidth).toBeGreaterThanOrEqual(110);
      expect(opened.headerApplyWidth).toBeLessThan(opened.headerRowWidth / 2);
      expect(opened.headerInputWidth + opened.headerApplyWidth).toBeLessThanOrEqual(opened.headerRowWidth);

      // Hide Path and widen it, then Reset: default visibility and width come back.
      await evaluate(
        cdp,
        `(() => {
          const item = Array.from(document.querySelectorAll('#columnsMenu [role="menuitemcheckbox"]')).find(
            (button) => button.textContent.trim() === '☑ Path',
          );
          item.click();
        })()`,
      );
      await settleLayout(cdp);
      const hidden = await evaluate(cdp, COLUMNS_MENU_MEASURE);
      expect(hidden).toMatchObject({ shown: true, pathChecked: 'false', pathHeader: false });
      expect(hidden.storedPath).toMatchObject({ visible: false });
      await evaluate(
        cdp,
        `(() => {
          Array.from(document.querySelectorAll('#columnsMenu .columns-header-action'))
            .find((button) => button.textContent === 'Reset')
            .click();
        })()`,
      );
      await settleLayout(cdp);
      const reset = await evaluate(cdp, COLUMNS_MENU_MEASURE);
      expect(reset).toMatchObject({ shown: true, pathChecked: 'true', pathHeader: true, checkboxCount: 17 });
      expect(reset.storedPath).toEqual({ id: 'path', visible: true, width: 260 });
      expect(await evaluate(cdp, "document.querySelector('#statusText').textContent")).toBe(
        'Columns reset to the default visibility and widths.',
      );
      expect(await evaluate(cdp, "document.activeElement.closest('#columnsMenu') !== null")).toBe(true);

      // Open, resize, reopen. The handler caps the menu only when there is
      // space below the button, so it clears top and maxHeight first: a cap
      // measured against a different viewport must never survive into the
      // next open and clip a menu that now fits.
      const closeMenu = async () => {
        await evaluate(cdp, "document.querySelector('#columnsBtn').click()");
        await settleLayout(cdp);
      };
      await closeMenu();
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 220,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await settleLayout(cdp);
      const shortViewport = await openMenu();
      expect(shortViewport.shown).toBe(true);
      expect(shortViewport.bottom).toBeLessThanOrEqual(shortViewport.viewportHeight);
      expect(parseFloat(shortViewport.inlineMaxHeight)).toBeLessThan(220);
      await closeMenu();
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await settleLayout(cdp);
      const reopened = await openMenu();
      expect(reopened.shown).toBe(true);
      expect(reopened.inlineTop).toBe(opened.inlineTop);
      expect(reopened.inlineMaxHeight).toBe(opened.inlineMaxHeight);
      expect(parseFloat(reopened.inlineMaxHeight)).toBeGreaterThan(
        parseFloat(shortViewport.inlineMaxHeight),
      );
      expect(reopened.top).toBeGreaterThanOrEqual(reopened.buttonBottom);
      expect(reopened.bottom).toBeLessThanOrEqual(reopened.viewportHeight);
      await cdp.send('Emulation.clearDeviceMetricsOverride');
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

const ROW_STATES_MEASURE = `(() => {
  const describe = (tr) => {
    const style = getComputedStyle(tr);
    return {
      classes: Array.from(tr.classList).filter((name) => /^(selected|multi-selected|highlighted-row|hl-|search-)/.test(name)).sort(),
      boxShadow: style.boxShadow,
      background: style.backgroundColor,
      badges: Array.from(tr.querySelectorAll('.row-state-badge')).map((badge) => badge.textContent.trim()),
    };
  };
  const rows = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'));
  return {
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    yellow: getComputedStyle(document.documentElement).getPropertyValue('--search-yellow').trim(),
    rows: rows.map(describe),
  };
})()`;

browserTest(
  'primary, multi, highlighted, hit, and current-hit rows each carry their own look',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, width: 1280, height: 800 });
    const { cdp } = page;
    try {
      await waitForSampleCaptureAction(cdp);
      expect(await activateSampleCapture(cdp)).toBeGreaterThan(1);
      await settleLayout(cdp);
      const toRgb = (hex) => {
        const value = parseInt(hex.slice(1), 16);
        return 'rgb(' + [value >> 16, (value >> 8) & 255, value & 255].join(', ') + ')';
      };
      // Search "503" (one hit among the three sample rows): make that row the
      // current hit, multi-select another row, highlight a third.
      await evaluate(
        cdp,
        `(() => {
          document.querySelector('#searchToggleBtn').click();
          const input = document.querySelector('.search-keyword-input');
          input.value = '503';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`,
      );
      await delay(600);
      await settleLayout(cdp);
      const navDeadline = Date.now() + 3000;
      while (Date.now() < navDeadline) {
        if (await evaluate(cdp, "!!document.querySelector('.search-kw-nav[data-search-direction=\"1\"]:not([disabled])')")) break;
        await delay(50);
      }
      await evaluate(
        cdp,
        `(() => {
          const rows = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'));
          const next = document.querySelector('.search-kw-nav[data-search-direction="1"]');
          if (!next) {
            throw new Error(
              'The keyword navigation button was not rendered; search rows: ' +
                document.querySelectorAll('#searchRows > *').length +
                ', panel display: ' + getComputedStyle(document.querySelector('#searchPanel')).display,
            );
          }
          next.click();
          const others = rows.filter((tr) => !tr.classList.contains('search-match-row'));
          if (others.length < 2) throw new Error('Expected at least two rows outside the search hit.');
          others[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, metaKey: true }));
          const rect = others[1].getBoundingClientRect();
          others[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }));
        })()`,
      );
      await settleLayout(cdp);
      await evaluate(
        cdp,
        `(() => {
          const swatch = document.querySelector('.context-menu .hl-swatch.hl-green');
          if (!swatch) throw new Error('The highlight swatch was not rendered in the row menu.');
          swatch.click();
        })()`,
      );
      await settleLayout(cdp);
      const observed = await evaluate(cdp, ROW_STATES_MEASURE);
      const accent = toRgb(observed.accent);
      const yellow = toRgb(observed.yellow);
      const byClasses = (needle) => observed.rows.find((row) => row.classes.includes(needle));
      const current = byClasses('search-match-current');
      const multi = byClasses('multi-selected');
      const highlighted = byClasses('highlighted-row');
      // Current hit (also the primary selection): accent bar + keyword ring, ✓ and keyword chips.
      expect(current.classes).toEqual(['search-match-current', 'search-match-row', 'search-row-0', 'selected']);
      expect(current.boxShadow).toBe(accent + ' 3px 0px 0px 0px inset, ' + yellow + ' 0px 0px 0px 2px inset');
      expect(current.badges).toEqual(['✓', '1']);
      // Multi-selection: tint and ✓, no ring. Highlight: tint and ★, no ring.
      expect(multi.classes).toEqual(['multi-selected']);
      expect(multi.boxShadow).toBe('none');
      expect(multi.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(multi.badges).toEqual(['✓']);
      expect(highlighted.classes).toEqual(['highlighted-row', 'hl-green']);
      expect(highlighted.boxShadow).toBe('none');
      expect(highlighted.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(highlighted.badges).toEqual(['★']);
      // Selecting another row leaves the current hit with only the keyword ring.
      await evaluate(cdp, "document.querySelector('#tbody tr.multi-selected').click()");
      await settleLayout(cdp);
      const after = await evaluate(cdp, ROW_STATES_MEASURE);
      const hit = after.rows.find((row) => row.classes.includes('search-match-current'));
      expect(hit.classes).toEqual(['search-match-current', 'search-match-row', 'search-row-0']);
      expect(hit.boxShadow).toBe(yellow + ' 0px 0px 0px 2px inset');
      const primary = after.rows.find((row) => row.classes.includes('selected'));
      expect(primary.boxShadow).toBe(accent + ' 3px 0px 0px 0px inset, ' + accent + ' 0px 0px 0px 2px inset');
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);


// Opens the row menu at its fullest — filters, select, highlight, unhighlight,
// clear, compare, keep/delete and both copy groups expanded — and reports every
// string it paints. Resend is absent by design: it needs a DevTools session,
// and its dictionary entries are pinned in tests/panel.test.js instead.
const ROW_MENU_STRINGS_BUILD = `(async () => {
  const settle = async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 120));
  };
  const rows = () => Array.from(document.querySelectorAll('#tbody tr[data-row-id]'));
  const rightClickPath = (tr) => {
    const cell = tr.querySelector('td[data-col-id="path"]');
    const rect = tr.getBoundingClientRect();
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: Math.round(rect.top) }));
  };
  for (let index = 0; index < 2; index += 1) {
    // renderBody() replaces the <tr> after each highlight, so re-query it.
    rightClickPath(rows()[index]);
    await settle();
    document.querySelector('.context-menu .hl-swatch.hl-green').click();
    await settle();
  }
  for (const tr of rows().slice(0, 2)) {
    tr.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, metaKey: true }));
  }
  await settle();
  rightClickPath(rows()[0]);
  await settle();
  for (const toggle of Array.from(document.querySelectorAll('.context-menu .context-menu-disclosure'))) {
    toggle.click();
    await settle();
  }
  const menu = document.querySelector('.context-menu');
  const rect = menu.getBoundingClientRect();
  return {
    ariaLabel: menu.getAttribute('aria-label'),
    labels: Array.from(menu.querySelectorAll('.context-menu-label')).map((el) => el.textContent),
    items: Array.from(menu.querySelectorAll('.context-menu-item'))
      .filter((el) => !el.closest('[hidden]'))
      .map((el) => el.textContent),
    swatchTitles: Array.from(menu.querySelectorAll('.hl-swatch')).map((el) => el.title),
    swatchLabels: Array.from(menu.querySelectorAll('.hl-swatch')).map((el) => el.getAttribute('aria-label')),
    groupLabels: Array.from(menu.querySelectorAll('.context-menu-submenu')).map((el) => el.getAttribute('aria-label')),
    colorGroupLabel: menu.querySelector('.context-menu-colors').getAttribute('aria-label'),
    width: Math.round(rect.width),
    tallestItem: Math.max(
      ...Array.from(menu.querySelectorAll('.context-menu-item'))
        .filter((el) => !el.closest('[hidden]'))
        .map((el) => Math.round(el.getBoundingClientRect().height)),
    ),
  };
})()`;

// Everything in the Japanese menu that may legitimately stay in Latin script:
// format and protocol proper nouns, plus the captured values the filter
// entries interpolate verbatim (they are request data, not UI copy).
const ROW_MENU_JA_ALLOWED_LATIN = [
  'PowerShell',
  'Markdown',
  'cURL',
  'fetch',
  'URL',
  'ID',
  'HTTP',
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'WS',
  'Authorization',
  'Content-Type',
];
const ROW_MENU_JA_CAPTURE_VALUES = ['/v1/projects/demo', 'api.network-plus.test'];

const openSampleCaptureInAnyLanguage = async (cdp, language) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const ready = await evaluate(
      cdp,
      "document.documentElement.lang === '" + language + "' && !!document.querySelector('.empty-state-action')",
    );
    if (ready) break;
    await delay(50);
  }
  await evaluate(cdp, "document.querySelector('.empty-state-action').click(); true");
  await settleLayout(cdp);
};

browserTest(
  'the row context menu speaks one language end to end',
  async () => {
    // The bug: one translated disclosure among a dozen pinned-English
    // siblings. English must be byte-identical to what it always was, and
    // Japanese must not leak a single English menu word.
    const page = await launchPanelPage({ executable: browserExecutable, width: 1280, height: 1000 });
    try {
      await openSampleCaptureInAnyLanguage(page.cdp, 'en');
      const englishObserved = await evaluate(page.cdp, ROW_MENU_STRINGS_BUILD, true);
      // The two measurements are checked by the bounds below, not folded into
      // the string comparison where they would assert against themselves.
      const { width: englishWidth, tallestItem: englishTallestItem, ...englishStrings } = englishObserved;
      expect(englishStrings).toEqual({
        ariaLabel: 'Request actions',
        labels: ['Filter', 'Highlight (2 rows)', 'Compare'],
        items: [
          'Only Path /v1/projects/demo',
          'Exclude Path /v1/projects/demo',
          'Only Domain api.network-plus.test',
          'Exclude Domain api.network-plus.test',
          'Deselect',
          'Unhighlight (2)',
          'Clear All Highlights',
          'Compare 2 selected requests',
          'Keep Selected (2)',
          'Delete Selected (2)',
          '▾ Copy sanitized',
          'Copy sanitized summary',
          'Copy sanitized URL',
          'Copy sanitized cURL',
          'Copy sanitized fetch',
          'Copy sanitized PowerShell',
          'Copy sanitized Markdown',
          'Copy sanitized Markdown table (2 rows)',
          '▾ Copy full (unsanitized)',
          'Copy full request summary',
          'Copy full URL',
          'Copy full cURL',
          'Copy full fetch',
          'Copy full PowerShell',
          'Copy full Markdown',
          'Copy full raw request',
          'Copy full request body',
        ],
        swatchTitles: ['Yellow', 'Red', 'Green', 'Blue', 'Purple', 'Orange'],
        swatchLabels: [
          'Highlight Yellow',
          'Highlight Red',
          'Highlight Green',
          'Highlight Blue',
          'Highlight Purple',
          'Highlight Orange',
        ],
        groupLabels: ['Copy sanitized', 'Copy full (unsanitized)'],
        colorGroupLabel: 'Highlight color',
      });
      // Localizing must not have widened or wrapped the menu.
      expect(englishWidth).toBeLessThanOrEqual(420);
      expect(englishTallestItem).toBeLessThanOrEqual(34);

      // The same journey again, in Japanese, on a document reloaded in place.
      await reloadInLanguage(page, 'ja');
      await openSampleCaptureInAnyLanguage(page.cdp, 'ja');
      const observed = await evaluate(page.cdp, ROW_MENU_STRINGS_BUILD, true);
      const { width, tallestItem, ...strings } = observed;
      expect(strings).toEqual({
        ariaLabel: 'リクエストの操作',
        labels: ['フィルター', 'ハイライト (2 行)', '比較'],
        items: [
          'パス: /v1/projects/demo のみ',
          'パス: /v1/projects/demo を除外',
          'ドメイン: api.network-plus.test のみ',
          'ドメイン: api.network-plus.test を除外',
          '選択解除',
          'ハイライト解除 (2)',
          'すべてのハイライトを解除',
          '選択した 2 件のリクエストを比較',
          '選択した行を残す (2)',
          '選択した行を削除 (2)',
          '▾ サニタイズ済みをコピー',
          'サニタイズ済みの概要をコピー',
          'サニタイズ済み URL をコピー',
          'サニタイズ済み cURL をコピー',
          'サニタイズ済み fetch をコピー',
          'サニタイズ済み PowerShell をコピー',
          'サニタイズ済み Markdown をコピー',
          'サニタイズ済み Markdown テーブルをコピー (2 行)',
          '▾ フル (未サニタイズ) でコピー',
          'リクエスト概要をフルコピー',
          'URL をフルコピー',
          'cURL をフルコピー',
          'fetch をフルコピー',
          'PowerShell をフルコピー',
          'Markdown をフルコピー',
          '生リクエストをフルコピー',
          'リクエストボディをフルコピー',
        ],
        swatchTitles: ['黄', '赤', '緑', '青', '紫', 'オレンジ'],
        // No ASCII space before the colour name: it is a Japanese noun the
        // frame slots in, and the English frame's space must not follow it.
        swatchLabels: [
          '黄でハイライト',
          '赤でハイライト',
          '緑でハイライト',
          '青でハイライト',
          '紫でハイライト',
          'オレンジでハイライト',
        ],
        groupLabels: ['サニタイズ済みをコピー', 'フル (未サニタイズ) でコピー'],
        colorGroupLabel: 'ハイライトの色',
      });
      expect(width).toBeLessThanOrEqual(420);
      expect(tallestItem).toBeLessThanOrEqual(34);

      // The standing guard: nothing the Japanese menu paints may be English
      // text. Longest allowed token first, so cURL is not shortened to "c".
      const allowed = [...ROW_MENU_JA_ALLOWED_LATIN, ...ROW_MENU_JA_CAPTURE_VALUES].sort(
        (a, b) => b.length - a.length,
      );
      const stripAllowed = (text) => allowed.reduce((rest, token) => rest.split(token).join(''), text);
      const painted = [
        observed.ariaLabel,
        observed.colorGroupLabel,
        ...observed.labels,
        ...observed.items,
        ...observed.swatchTitles,
        ...observed.swatchLabels,
        ...observed.groupLabels,
      ];
      expect(painted.length).toBe(46);
      for (const text of painted) {
        expect([text, /[\u3040-\u30ff\u3400-\u9fff]/.test(text)]).toEqual([text, true]);
        expect([text, /[A-Za-z]/.test(stripAllowed(text))]).toEqual([text, false]);
      }
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

// The same journey as the row menu, for the surfaces the Tier 2 pass created
// or restructured: the merged pane toolbar, the regrouped Columns menu, the
// inspector divider's value text and the tab bars' accessible names. It reads
// only what those surfaces paint, through the same clicks a person makes.
const LOCALIZED_SURFACES_BUILD = `(async () => {${WAIT_FOR_IN_PAGE}
  const settle = async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 120));
  };
  const text = (el) => (el ? el.textContent : null);
  const statusText = () => document.querySelector('#statusText').textContent;

  // --- The detail-pane toolbar, reached the way a reader reaches it.
  document.querySelectorAll('#tbody tr[data-row-id]')[0].click();
  // What the three response panes say until the cached body lands. The click
  // writes it synchronously, so reading it in the same turn is not a race.
  const bodyLoading = text(document.querySelector('#res-body'));
  await settle();
  document.querySelector('#res-tab-raw').click();
  await settle();
  const bar = document.querySelector('#res-raw .pane-search-bar');
  const input = bar.querySelector('.pane-search-input');
  // A query with no hits is what makes the count line write its own words.
  const countText = () => text(bar.querySelector('.pane-search-count'));
  const countBefore = countText();
  input.value = 'zzqqxx-no-such-token';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  await waitFor(() => countText() !== countBefore, 250);
  const expand = bar.querySelector('.pane-search-expand');
  const navButtons = Array.from(bar.querySelectorAll('.pane-search-nav')).filter((el) => el !== expand);
  const pane = {
    placeholder: input.placeholder,
    inputLabel: input.getAttribute('aria-label'),
    count: text(bar.querySelector('.pane-search-count')),
    expandText: text(expand),
    expandTitle: expand.title,
    expandLabel: expand.getAttribute('aria-label'),
    navTitles: navButtons.map((el) => el.title),
    navLabels: navButtons.map((el) => el.getAttribute('aria-label')),
    copyLabels: Array.from(bar.querySelectorAll('.copy-btn')).map(text),
  };
  // The sanitized copy button writes its own toast.
  const copiedBefore = globalThis.__networkPlusCopied.length;
  bar.querySelector('.copy-btn').click();
  await waitFor(() => globalThis.__networkPlusCopied.length > copiedBefore, 150);
  pane.copyToast = text(document.querySelector('#copyToast'));

  // --- The Headers panes either side of that toolbar. The leading grid names
  // request facts and the group heading sits above the captured header names:
  // both are panel nouns, so both have to follow the language the toolbar is
  // already speaking.
  // The Timing pane's own heading is a panel noun too; the phase names under
  // it are the capture's own keys and are not measured here. The LAST key in
  // that grid is the exception: 'Total' is written by the panel, not read from
  // the HAR, so it belongs to the heading's language and is measured with it.
  document.querySelector('#res-tab-timing').click();
  await settle();
  const timingHeading = text(document.querySelector('#res-timing .kv-group-heading'));
  const timingKeys = Array.from(document.querySelectorAll('#res-timing .kv .key')).map(text);
  const timingTotalKey = timingKeys[timingKeys.length - 1];
  document.querySelector('#res-tab-raw').click();
  await settle();
  const details = {
    bodyLoading,
    requestInfoKeys: Array.from(document.querySelectorAll('#req-headers .kv:first-of-type .key')).map(text),
    requestHeadersHeading: text(document.querySelector('#req-headers .kv-group-heading')),
    responseHeadersHeading: text(document.querySelector('#res-headers .kv-group-heading')),
    timingHeading,
    timingTotalKey,
  };

  // --- The inspector chrome the toolbar sits inside.
  const divider = document.querySelector('#inspector-divider');
  const inspector = {
    dividerValue: divider.getAttribute('aria-valuetext'),
    dividerLabel: divider.getAttribute('aria-label'),
    requestTabs: document.querySelector('#req-tab-bar').getAttribute('aria-label'),
    responseTabs: document.querySelector('#res-tab-bar').getAttribute('aria-label'),
    requestToggle: document.querySelector('#inspector-request-toggle').getAttribute('aria-label'),
    responseToggle: document.querySelector('#inspector-response-toggle').getAttribute('aria-label'),
    // The visible caption beside the localized name: WCAG 2.5.3 wants the
    // name to contain it, so both are read here rather than only the name.
    requestToggleText: text(document.querySelector('#inspector-request-toggle')),
    responseToggleText: text(document.querySelector('#inspector-response-toggle')),
    requestToggleTitle: document.querySelector('#inspector-request-toggle').title,
    responseToggleTitle: document.querySelector('#inspector-response-toggle').title,
  };
  // Keyboard resize writes the same sentence to the status bar.
  divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  await settle();
  inspector.resizeStatus = statusText();
  inspector.resizedValue = divider.getAttribute('aria-valuetext');

  // --- The Columns menu, opened from its own button.
  document.querySelector('#columnsBtn').click();
  await settle();
  const menu = document.querySelector('#columnsMenu');
  const presetButtons = () =>
    Array.from(menu.querySelectorAll('.columns-preset-section .context-menu-item')).map((el) => ({
      label: text(el),
      title: el.title,
    }));
  const columns = {
    menuLabel: menu.getAttribute('aria-label'),
    hints: Array.from(menu.querySelectorAll('.columns-preset-hint')).map(text),
    headerActions: Array.from(menu.querySelectorAll('.columns-header-action')).map((el) => ({
      label: text(el),
      title: el.title,
    })),
    checkboxes: Array.from(menu.querySelectorAll('[role="menuitemcheckbox"]')).map(text),
    headerInputLabel: menu.querySelector('#customHeaderNameInput').getAttribute('aria-label'),
    headerApply: text(menu.querySelector('#customHeaderApplyBtn')),
    presetButtons: presetButtons(),
  };
  // Saving a preset is what makes the third preset button exist.
  menu.querySelector('.columns-preset-update').click();
  await settle();
  columns.presetUpdatedStatus = statusText();
  columns.presetButtonsAfterSave = presetButtons();
  // The domain-summary toggle writes its own status line.
  menu.querySelector('#domainSummaryToggle').click();
  await settle();
  columns.domainSummaryStatus = statusText();
  // Binding the configurable column: its menu entry must quote the header
  // the reader typed, in either language — that name is request data, not a
  // UI noun, so it is the one column name the dictionary must not replace.
  document.querySelector('#columnsMenu #customHeaderNameInput').value = 'x-request-id';
  document.querySelector('#columnsMenu #customHeaderApplyBtn').click();
  await settle();
  columns.boundHeaderCheckbox = text(
    Array.from(document.querySelectorAll('#columnsMenu [role="menuitemcheckbox"]')).find((el) =>
      el.textContent.includes('x-request-id'),
    ),
  );
  return { pane, inspector, columns, details };
})()`;

// Latin that may legitimately survive in the Japanese rendering of these
// surfaces: the product name, the shortcut key names the tooltips quote, the
// English chrome caption the collapse toggles keep visible, and the format
// and column proper nouns the row-menu journey already allows.
const LOCALIZED_SURFACES_JA_ALLOWED_LATIN = [
  ...ROW_MENU_JA_ALLOWED_LATIN,
  'Network+ for DevTools',
  'Shift+Enter',
  'Enter',
  'Request',
  'Response',
  'HAR',
  'SAZ',
  // The header name the Columns menu binds is captured request data.
  'x-request-id',
];

browserTest(
  'the pane toolbar, Columns menu, inspector divider and tab bars speak one language',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      width: 1280,
      height: 1000,
      initScript: CLIPBOARD_CAPTURE_INIT_SCRIPT,
    });
    try {
      await openSampleCaptureInAnyLanguage(page.cdp, 'en');
      const english = await evaluate(page.cdp, LOCALIZED_SURFACES_BUILD, true);
      // English is the byte-for-byte text these surfaces have always shown.
      expect(english.pane).toEqual({
        placeholder: 'Search in raw response',
        inputLabel: 'Search within the raw response view',
        count: 'No matches',
        expandText: 'Expand all',
        expandTitle:
          'Some matches are inside collapsed or truncated content. Expand everything to include them.',
        expandLabel: 'Expand collapsed content in the raw response view to reveal all matches',
        navTitles: ['Previous match (Shift+Enter)', 'Next match (Enter)'],
        navLabels: ['Previous match in the raw response view', 'Next match in the raw response view'],
        copyLabels: ['Copy sanitized', 'Copy full...'],
        copyToast: 'Copied sanitized raw response',
      });
      expect(english.details).toEqual({
        bodyLoading: '(loading...)',
        requestInfoKeys: ['Method', 'URL'],
        requestHeadersHeading: 'Request Headers',
        responseHeadersHeading: 'Response Headers',
        timingHeading: 'Timing Breakdown',
        timingTotalKey: 'Total',
      });
      expect(english.inspector).toEqual({
        dividerValue: 'Request inspector 50 percent',
        dividerLabel: 'Resize request and response inspectors',
        requestTabs: 'Request details',
        responseTabs: 'Response details',
        requestToggle: 'Request',
        responseToggle: 'Response',
        requestToggleText: 'Request',
        responseToggleText: 'Response',
        requestToggleTitle: 'Collapse the Request inspector to its tabs',
        responseToggleTitle: 'Collapse the Response inspector to its tabs',
        resizeStatus: 'Request inspector 49 percent',
        resizedValue: 'Request inspector 49 percent',
      });
      expect(english.columns).toEqual({
        menuLabel: 'Visible columns',
        hints: ['Identity', 'Timing', 'Payload', 'Header column', 'Domain summary', 'Saved view'],
        headerActions: [
          { label: 'Select all', title: '' },
          { label: 'Deselect all', title: '' },
          { label: 'Reset', title: 'Restore the default column visibility and widths' },
        ],
        checkboxes: [
          '☑ Match',
          '☑ ID',
          '☑ Method',
          '☑ Status',
          '☑ Domain',
          '☑ Path',
          '☐ URL',
          '☐ Operation',
          '☐ Header',
          '☑ Client start',
          '☐ Server done',
          '☑ Duration',
          '☐ Waterfall',
          '☑ Type',
          '☑ Size',
          '☐ Initiator',
          '☐ Show domain summary',
        ],
        headerInputLabel: 'Header name for the configurable column',
        headerApply: 'Apply',
        presetButtons: [
          { label: 'Apply', title: 'Restore the default columns and clear filters' },
          { label: 'Update', title: 'Save the current columns and filters as the preset' },
        ],
        presetUpdatedStatus: 'Preset updated with the current view.',
        presetButtonsAfterSave: [
          { label: 'Apply', title: 'Restore your saved columns and filters' },
          { label: 'Update', title: 'Save the current columns and filters as the preset' },
          {
            label: 'Forget saved preset',
            title: 'Delete the saved preset — Apply then restores the default view',
          },
        ],
        domainSummaryStatus: 'Domain summary shown.',
        boundHeaderCheckbox: '☑ x-request-id',
      });

      // The same surfaces again in Japanese, on a document reloaded in place:
      // everything the English pass persisted is cleared with it.
      await reloadInLanguage(page, 'ja');
      await openSampleCaptureInAnyLanguage(page.cdp, 'ja');
      const observed = await evaluate(page.cdp, LOCALIZED_SURFACES_BUILD, true);
      expect(observed.pane).toEqual({
        placeholder: '生レスポンス内を検索',
        inputLabel: '生レスポンスビュー内を検索',
        count: '一致なし',
        expandText: 'すべて展開',
        expandTitle:
          '一部の一致は折りたたまれた内容や省略された内容の中にあります。すべて展開すると含まれます。',
        expandLabel: '生レスポンスビューの折りたたまれた内容を展開してすべての一致を表示',
        navTitles: ['前の一致 (Shift+Enter)', '次の一致 (Enter)'],
        navLabels: ['生レスポンスビュー内の前の一致', '生レスポンスビュー内の次の一致'],
        copyLabels: ['サニタイズ済みをコピー', 'フルでコピー...'],
        copyToast: 'サニタイズ済み生レスポンスをコピーしました',
      });
      expect(observed.details).toEqual({
        bodyLoading: '（読み込み中...）',
        requestInfoKeys: ['メソッド', 'URL'],
        requestHeadersHeading: 'リクエストヘッダー',
        responseHeadersHeading: 'レスポンスヘッダー',
        timingHeading: 'タイミング内訳',
        timingTotalKey: '合計',
      });
      expect(observed.inspector).toEqual({
        // No ASCII space either side of the half's name: the noun is
        // Japanese, so nothing separates it from the word it qualifies.
        dividerValue: 'リクエストインスペクター 50 パーセント',
        dividerLabel: 'リクエストとレスポンスのインスペクターのサイズを変更',
        requestTabs: 'リクエストの詳細',
        responseTabs: 'レスポンスの詳細',
        // The name says the half the way its own tooltip and status line say
        // it, and still ends on the English caption the button paints, so
        // WCAG 2.5.3 label-in-name — what voice control matches — holds.
        requestToggle: 'リクエストインスペクター (Request)',
        responseToggle: 'レスポンスインスペクター (Response)',
        requestToggleText: 'Request',
        responseToggleText: 'Response',
        requestToggleTitle: 'リクエストインスペクターをタブだけに折りたたむ',
        responseToggleTitle: 'レスポンスインスペクターをタブだけに折りたたむ',
        resizeStatus: 'リクエストインスペクター 49 パーセント',
        resizedValue: 'リクエストインスペクター 49 パーセント',
      });
      expect(observed.columns).toEqual({
        menuLabel: '表示する列',
        hints: ['識別', 'タイミング', 'ペイロード', 'ヘッダー列', 'ドメイン別サマリー', '保存したビュー'],
        headerActions: [
          { label: 'すべて選択', title: '' },
          { label: 'すべて解除', title: '' },
          { label: 'リセット', title: '列の表示と幅を既定に戻す' },
        ],
        checkboxes: [
          '☑ マッチ',
          '☑ ID',
          '☑ メソッド',
          '☑ ステータス',
          '☑ ドメイン',
          '☑ パス',
          '☐ URL',
          '☐ オペレーション',
          '☐ ヘッダー',
          '☑ クライアント開始',
          '☐ サーバー完了',
          '☑ 所要時間',
          '☐ ウォーターフォール',
          '☑ 種別',
          '☑ サイズ',
          '☐ 呼び出し元',
          '☐ ドメイン別サマリーを表示',
        ],
        headerInputLabel: '設定可能な列に表示するヘッダー名',
        headerApply: '適用',
        presetButtons: [
          { label: '適用', title: '既定の列に戻し、フィルターを消去する' },
          { label: '更新', title: '現在の列とフィルターをプリセットとして保存する' },
        ],
        presetUpdatedStatus: '現在のビューでプリセットを更新しました。',
        presetButtonsAfterSave: [
          { label: '適用', title: '保存した列とフィルターを復元する' },
          { label: '更新', title: '現在の列とフィルターをプリセットとして保存する' },
          {
            label: '保存したプリセットを破棄',
            title: '保存したプリセットを削除する — 以後 [適用] は既定のビューに戻します',
          },
        ],
        domainSummaryStatus: 'ドメイン別サマリーを表示しました。',
        boundHeaderCheckbox: '☑ x-request-id',
      });

      // Switching language with a request still selected repaints the open
      // pane in place. Before this, the pane chrome was painted once per
      // selection, so the toolbar the reader was looking at stayed in the
      // previous language until they clicked another row. The tab they picked
      // survives the repaint, and so does the selection itself.
      const switched = await evaluate(
        page.cdp,
        `(async () => {${WAIT_FOR_IN_PAGE}
          const placeholder = () => {
            const input = document.querySelector('#res-raw .pane-search-bar .pane-search-input');
            return input ? input.placeholder : null;
          };
          const before = placeholder();
          const select = document.querySelector('#langSelect');
          select.value = 'en';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise((resolve) => requestAnimationFrame(resolve));
          // The pane chrome is repainted in place, so the toolbar's own text
          // changing is what says the repaint has run.
          await waitFor(() => placeholder() !== before, 250);
          const bar = document.querySelector('#res-raw .pane-search-bar');
          return {
            lang: document.documentElement.lang,
            activeTab: document.querySelector('#res-tab-bar .tab-btn.active').dataset.tab,
            selectedRows: document.querySelectorAll('#tbody tr.selected').length,
            placeholder: bar.querySelector('.pane-search-input').placeholder,
            copyLabels: Array.from(bar.querySelectorAll('.copy-btn')).map((el) => el.textContent),
            requestHeadersHeading: document.querySelector('#req-headers .kv-group-heading').textContent,
            requestInfoKeys: Array.from(
              document.querySelectorAll('#req-headers .kv:first-of-type .key'),
            ).map((el) => el.textContent),
          };
        })()`,
        true,
      );
      expect(switched).toEqual({
        lang: 'en',
        activeTab: 'res-raw',
        selectedRows: 1,
        placeholder: 'Search in raw response',
        copyLabels: ['Copy sanitized', 'Copy full...'],
        requestHeadersHeading: 'Request Headers',
        requestInfoKeys: ['Method', 'URL'],
      });

      // The standing guard: nothing these surfaces paint may be ASCII-only
      // English. Longest allowed token first, so Shift+Enter is stripped
      // whole rather than leaving a bare "Shift".
      const allowed = [...LOCALIZED_SURFACES_JA_ALLOWED_LATIN].sort((a, b) => b.length - a.length);
      const stripAllowed = (value) => allowed.reduce((rest, token) => rest.split(token).join(''), value);
      const flatten = (value) =>
        typeof value === 'string'
          ? [value]
          : Array.isArray(value)
            ? value.flatMap(flatten)
            : Object.values(value).flatMap(flatten);
      const painted = flatten(observed).filter((value) => value.trim() !== '');
      // 75 with the Timing pane's 'Total' key, which the panel writes itself.
      expect(painted.length).toBe(75);
      for (const value of painted) {
        // No English word may survive the allow-list.
        expect([value, /[A-Za-z]/.test(stripAllowed(value))]).toEqual([value, false]);
        // And a label that is more than a bare proper noun ("☐ URL") has to
        // be Japanese, not an untranslated string that happens to be symbols.
        const bareProperNoun = stripAllowed(value).replace(/[\s☑☐]/g, '') === '';
        expect([value, bareProperNoun || /[\u3040-\u30ff\u3400-\u9fff]/.test(value)]).toEqual([
          value,
          true,
        ]);
      }
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);
