'use strict';
// Shared real-browser harness: spawns a headless Chromium/Edge with a
// throwaway profile and speaks raw CDP over WebSocket — no Playwright or
// Puppeteer dependency. Extracted from status-summary-browser.test.js so
// new browser suites (mirror-browser.test.js) reuse one lifecycle.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const BROWSER_START_TIMEOUT_MS = 45000;
const PAGE_TARGET_TIMEOUT_MS = 15000;
const STARTUP_POLL_INITIAL_DELAY_MS = 50;
const STARTUP_POLL_MAX_DELAY_MS = 1000;
const CDP_COMMAND_TIMEOUT_MS = 10000;
const TRANSIENT_PROFILE_CLEANUP_ERRORS = new Set(['ENOTEMPTY', 'EBUSY']);
// Chromium sometimes dies during startup before it ever writes
// DevToolsActivePort ("Browser exited before DevTools started ... SIGKILL"),
// which failed the suite on a non-assertion. One more spawn, on a brand-new
// profile directory, turns that into a slow launch instead of a red suite.
const BROWSER_START_ATTEMPTS = 2;

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

async function findPageTarget(browserWebSocketUrl, matcher) {
  const browserUrl = new URL(browserWebSocketUrl);
  const targetListUrl = `http://${browserUrl.host}/json/list`;
  const startedAt = Date.now();
  const deadline = startedAt + PAGE_TARGET_TIMEOUT_MS;
  let pollDelay = STARTUP_POLL_INITIAL_DELAY_MS;
  let lastObservation = 'the target list was never fetched';
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(targetListUrl).then((response) => response.json());
      const pageTarget = targets.find((target) => target.type === 'page' && matcher(target));
      if (pageTarget) return pageTarget;
      lastObservation = 'the target list had ' + targets.length + ' targets without a match';
    } catch (error) {
      lastObservation = 'the target list fetch failed: ' + error.message;
    }
    await delay(pollDelay);
    pollDelay = Math.min(pollDelay * 2, STARTUP_POLL_MAX_DELAY_MS);
  }
  throw new Error(
    'Browser page target was not available after ' +
      (Date.now() - startedAt) +
      'ms (limit ' +
      PAGE_TARGET_TIMEOUT_MS +
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

function panelUrlWithQuery(query) {
  return pathToFileURL(path.join(repositoryRoot, 'panel.html')).href + (query || '');
}

async function waitForPanelReady(cdp) {
  const deadline = Date.now() + PAGE_TARGET_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate(
        cdp,
        "document.readyState === 'complete' && !!document.getElementById('statusText')",
      );
      if (ready) {
        await delay(200);
        return;
      }
      lastError = null;
    } catch (error) {
      // Navigation destroys the execution context mid-poll; retry.
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(
    'panel.html never became ready' + (lastError ? '; last transient error: ' + lastError.message : '.'),
  );
}

function browserArguments(profileDirectory) {
  return [
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
    'about:blank',
  ];
}

// Spawns the browser and connects CDP to its first page target, retrying the
// whole bring-up once on a fresh profile directory. Only the bring-up is
// retried: once CDP is attached, a failure is the panel's, not the browser's,
// and must reach the test unchanged.
async function startBrowserSession(executable) {
  const failures = [];
  for (let attempt = 1; attempt <= BROWSER_START_ATTEMPTS; attempt += 1) {
    const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-browser-'));
    const browserProcess = spawn(executable, browserArguments(profileDirectory), { stdio: 'ignore' });
    try {
      const browserWebSocketUrl = await waitForDevTools(browserProcess, profileDirectory);
      const pageTarget = await findPageTarget(browserWebSocketUrl, () => true);
      const cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
      return { browserProcess, profileDirectory, cdp };
    } catch (error) {
      failures.push('attempt ' + attempt + ' failed: ' + error.message);
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    }
  }
  throw new Error(
    'The browser never started in ' +
      BROWSER_START_ATTEMPTS +
      ' attempts, each on its own fresh profile directory (' +
      executable +
      '). ' +
      failures.join(' '),
  );
}

// Launches the panel with a stub script installed BEFORE panel.js runs —
// the piece plain evaluate() cannot do — by starting on about:blank,
// registering Page.addScriptToEvaluateOnNewDocument, then navigating.
async function launchPanelPage({ executable, query = '', initScript = null, width = 1280, height = 800 }) {
  const { browserProcess, profileDirectory, cdp } = await startBrowserSession(executable);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    if (initScript) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: panelUrlWithQuery(query) });
    await waitForPanelReady(cdp);
  } catch (error) {
    await cdp.close();
    await stopBrowser(browserProcess);
    removeProfileDirectory(profileDirectory);
    throw error;
  }
  return {
    cdp,
    navigate: async (nextQuery = query) => {
      await cdp.send('Page.navigate', { url: panelUrlWithQuery(nextQuery) });
      await waitForPanelReady(cdp);
    },
    close: async () => {
      await cdp.close();
      await stopBrowser(browserProcess);
      removeProfileDirectory(profileDirectory);
    },
  };
}

module.exports = {
  repositoryRoot,
  delay,
  findBrowserExecutable,
  waitForDevTools,
  findPageTarget,
  connectCdp,
  evaluate,
  stopBrowser,
  removeProfileDirectory,
  startBrowserSession,
  launchPanelPage,
  panelUrlWithQuery,
};
