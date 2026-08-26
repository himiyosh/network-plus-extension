const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

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
const SEPARATOR_FOCUS_VIEWPORT_WIDTHS = [320, 375, 414, 700, 701, 768, 1280];
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
      expect(after.detailsTitle).toMatch(/^POST https:\/\//);
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
      expect(wideReopened.detailsTitle).toMatch(/^POST https:\/\//);

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
      expect(narrowReopened.detailsTitle).toMatch(/^GET https:\/\//);
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
        ['id', 'ID'],
        ['match', 'Match'],
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
          const isNarrow = width <= 700;
          const mainAxis = isNarrow ? 'height' : 'width';
          const mainKey = isNarrow ? 'ArrowDown' : 'ArrowRight';
          const mainCode = isNarrow ? 'ArrowDown' : 'ArrowRight';
          const mainKeyCode = isNarrow ? 40 : 39;

          await focusSeparatorFromAnchor('#detailsCloseBtn');
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

          await focusSeparatorFromAnchor('#res-tab-headers');
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

      for (const width of [700, 701]) {
        await applyScenario(width, SEPARATOR_FOCUS_THEMES[0]);
        await dragSeparator(
          '#resizer',
          '#tableWrap',
          width <= 700 ? 'height' : 'width',
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
