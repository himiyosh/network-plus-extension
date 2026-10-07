const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const {
  connectCdp,
  delay,
  evaluate,
  findBrowserExecutable,
  findPageTarget,
  removeProfileDirectory,
  repositoryRoot,
  stopBrowser,
  waitForDevTools,
  waitForPanelReady,
} = require('./helpers/browser-harness');
const { RUNTIME_FILES, validateExtension } = require('../scripts/check-extension-package');

const MAIN_SHA = '19a7f530a9117b3e4e73f7db80a3013cb053cc0e';
const STATUS_CODES = [200, 304, 404, 503];
const WIDTHS = [320, 375, 414, 600, 768, 800, 801, 1280];
const THEMES = [
  { name: 'system light', choice: null, system: 'light' },
  { name: 'system dark', choice: null, system: 'dark' },
  { name: 'forced light', choice: 'light', system: 'dark' },
  { name: 'forced dark', choice: 'dark', system: 'light' },
];
const executable = findBrowserExecutable();
const runningInCi =
  process.env.GITHUB_ACTIONS === 'true' || Boolean(process.env.CI && process.env.CI.toLowerCase() !== 'false');
if (!executable && runningInCi) {
  throw new Error('Unpacked status parity requires an executable Chrome or Edge in CI.');
}
const browserTest = executable ? test : test.skip;

const syntheticHar = JSON.stringify({
  log: {
    version: '1.2',
    creator: { name: 'unpacked-status-parity', version: '1' },
    entries: STATUS_CODES.map((status, index) => ({
      startedDateTime: new Date(Date.UTC(2026, 9, 7, 0, 0, index)).toISOString(),
      time: 30,
      request: {
        method: 'GET',
        url: `https://synthetic.network-plus.test/status/${status}`,
        headers: [],
        queryString: [],
        headersSize: -1,
        bodySize: 0,
      },
      response: {
        status,
        statusText: {
          200: 'OK',
          304: 'Not Modified',
          404: 'Not Found',
          503: 'Service Unavailable',
        }[status],
        httpVersion: 'HTTP/2',
        headers: [{ name: 'Content-Type', value: 'text/plain' }],
        content: { size: 1, mimeType: 'text/plain', text: 'x' },
        headersSize: -1,
        bodySize: 1,
      },
      cache: {},
      timings: { send: 1, wait: 28, receive: 1 },
    })),
  },
});

const pagePrelude = `
  globalThis.__unpackedConsoleErrors = [];
  const priorConsoleError = console.error;
  console.error = (...args) => {
    globalThis.__unpackedConsoleErrors.push(args.map(String).join(' '));
    priorConsoleError.apply(console, args);
  };
  addEventListener('error', (event) => globalThis.__unpackedConsoleErrors.push(event.message));
  addEventListener('unhandledrejection', (event) =>
    globalThis.__unpackedConsoleErrors.push(String(event.reason)));
  localStorage.setItem('networkPlus.lang', 'en');
  localStorage.setItem('networkPlus.theme', 'light');
`;

function materializeUnpacked(directory, readFile) {
  for (const name of RUNTIME_FILES) {
    const destination = path.join(directory, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, readFile(name), { flag: 'wx' });
  }
}

function assertRuntimeOnly(directory) {
  const walk = (current, prefix = '') =>
    fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in extension: ${name}`);
      if (entry.isDirectory()) return walk(path.join(current, entry.name), `${name}/`);
      if (!entry.isFile()) throw new Error(`Unexpected file type in extension: ${name}`);
      return [name];
    });
  expect(walk(directory).sort()).toEqual(RUNTIME_FILES.slice().sort());
  const errors = validateExtension(directory);
  if (errors.length) throw new Error(`Unpacked extension is invalid: ${errors.join('; ')}`);
}

async function startUnpackedBrowser(directory) {
  const failures = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-unpacked-parity-'));
    const browser = spawn(
      executable,
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        `--disable-extensions-except=${directory}`,
        `--load-extension=${directory}`,
        '--disable-background-networking',
        '--disable-default-apps',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox',
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    try {
      const websocket = await waitForDevTools(browser, profile);
      const cdp = await connectCdp(websocket);
      return { browser, profile, websocket, cdp };
    } catch (error) {
      failures.push(`attempt ${attempt}: ${error.message}`);
      await stopBrowser(browser);
      removeProfileDirectory(profile);
    }
  }
  throw new Error(`Edge/Chrome could not start with the unpacked extension: ${failures.join('; ')}`);
}

async function openUnpackedPanel(directory) {
  const session = await startUnpackedBrowser(directory);
  let page = null;
  let unsubscribe = null;
  const cdpErrors = [];
  try {
    let worker = null;
    for (let attempt = 0; attempt < 40 && !worker; attempt += 1) {
      const { targetInfos } = await session.cdp.send('Target.getTargets');
      worker = targetInfos.find(
        ({ type, url }) =>
          type === 'service_worker' && /^chrome-extension:\/\/[a-p]{32}\/background\.js$/.test(url),
      );
      if (!worker) await delay(150);
    }
    if (!worker) throw new Error(`Unpacked extension did not register its MV3 worker: ${directory}`);
    const panelUrl = `chrome-extension://${new URL(worker.url).host}/panel.html`;
    const target = await findPageTarget(session.websocket, (item) => item.url === 'about:blank');
    page = await connectCdp(target.webSocketDebuggerUrl);
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    unsubscribe = page.onEvent(({ method, params }) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        cdpErrors.push(`console.error: ${params.args.map((arg) => arg.value ?? arg.description).join(' ')}`);
      } else if (method === 'Runtime.exceptionThrown') {
        cdpErrors.push(`uncaught exception: ${params.exceptionDetails.text}`);
      } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
        cdpErrors.push(`browser log: ${params.entry.text}`);
      }
    });
    await page.send('Log.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: pagePrelude });
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send('Page.navigate', { url: panelUrl });
    await waitForPanelReady(page);
    return {
      cdp: page,
      cdpErrors,
      close: async () => {
        unsubscribe();
        await page.close();
        await session.cdp.close();
        await stopBrowser(session.browser);
        removeProfileDirectory(session.profile);
      },
    };
  } catch (error) {
    if (unsubscribe) unsubscribe();
    if (page) await page.close();
    await session.cdp.close();
    await stopBrowser(session.browser);
    removeProfileDirectory(session.profile);
    throw error;
  }
}

async function importSyntheticHar(cdp) {
  const assigned = await evaluate(
    cdp,
    `(() => {
      const input = document.getElementById('importFile');
      const transfer = new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(syntheticHar)}], 'synthetic.har', {
        type: 'application/json',
      }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return input.files.length;
    })()`,
  );
  if (assigned !== 1) throw new Error('Synthetic HAR could not be assigned to the real extension input.');
  let statuses = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    statuses = await evaluate(
      cdp,
      "Array.from(document.querySelectorAll('#tbody tr[data-row-id] .status-cell'), (cell) => Number(cell.textContent))",
    );
    if (statuses.length === STATUS_CODES.length) break;
    await delay(100);
  }
  expect(statuses).toEqual(STATUS_CODES);
  const selected = await evaluate(
    cdp,
    `(() => {
      const row = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'))
        .find((item) => item.querySelector('.status-cell')?.textContent === '503');
      if (!row) return false;
      row.click();
      return true;
    })()`,
  );
  if (!selected) throw new Error('The synthetic 503 request could not be selected.');
  await delay(220);
}

function statusPresentation() {
  const rows = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'));
  return {
    statuses: rows.map((row) => {
      const cell = row.querySelector('.status-cell');
      if (!cell) throw new Error('Status column was hidden in the test viewport.');
      const style = document.defaultView.getComputedStyle(cell);
      const pseudo = (part) => {
        const paint = document.defaultView.getComputedStyle(cell, part);
        return {
          content: paint.content,
          outline: paint.outline,
          border: paint.border,
          boxShadow: paint.boxShadow,
          background: paint.background,
          color: paint.color,
        };
      };
      return {
        code: Number(cell.textContent),
        childElements: cell.childElementCount,
        textOnly: cell.childNodes.length === 1 && cell.firstChild.nodeType === 3,
        before: pseudo('::before'),
        after: pseudo('::after'),
        outline: style.outline,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        border: style.border,
        borderTop: style.borderTop,
        borderRight: style.borderRight,
        borderBottom: style.borderBottom,
        borderLeft: style.borderLeft,
        boxShadow: style.boxShadow,
        background: style.background,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        padding: style.padding,
      };
    }),
    rowHeights: rows.map((row) => row.getBoundingClientRect().height),
    headerHeight: document.querySelector('.title-row th').getBoundingClientRect().height,
    rootWidth: document.documentElement.scrollWidth,
    selected: rows.filter((row) => row.getAttribute('aria-selected') === 'true').map((row) => row.querySelector('.status-cell').textContent),
    detailMarker: document.defaultView.getComputedStyle(
      document.querySelector('.details-summary-status--5xx'),
      '::before',
    ).width,
    consoleErrors: globalThis.__unpackedConsoleErrors,
  };
}

async function captureUnpacked(directory) {
  assertRuntimeOnly(directory);
  const panel = await openUnpackedPanel(directory);
  try {
    let emptyReady = false;
    for (let attempt = 0; attempt < 60 && !emptyReady; attempt += 1) {
      emptyReady = await evaluate(panel.cdp, "!!document.querySelector('.empty-state-action')");
      if (!emptyReady) await delay(100);
    }
    if (!emptyReady) throw new Error('The unpacked extension has no empty-state sample action.');
    const empty = await evaluate(
      panel.cdp,
      `(() => {
        const icon = document.querySelector('.empty-state .icon');
        const action = document.querySelector('.empty-state-action');
        const box = icon.getBoundingClientRect();
        return { width: box.width, height: box.height,
          borderWidth: document.defaultView.getComputedStyle(icon).borderTopWidth,
          visible: box.width > 0 && box.height > 0 && action.getBoundingClientRect().width > 0,
          errors: globalThis.__unpackedConsoleErrors };
      })()`,
    );
    await importSyntheticHar(panel.cdp);
    const views = [];
    for (const theme of THEMES) {
      await panel.cdp.send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme.system },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      await evaluate(
        panel.cdp,
        theme.choice
          ? `document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme.choice)}); true`
          : "document.documentElement.removeAttribute('data-theme'); true",
      );
      await delay(220);
      for (const width of WIDTHS) {
        await panel.cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        views.push({ theme: theme.name, width, ...await evaluate(panel.cdp, `(${statusPresentation.toString()})()`) });
      }
    }
    return { empty, views, cdpErrors: panel.cdpErrors };
  } finally {
    await panel.close();
  }
}

browserTest(
  'unpacked B status cells paint exactly like current main for all four codes in Edge/Chromium',
  async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-status-baseline-'));
    const mainDirectory = path.join(temporary, 'main', 'extension');
    const candidateDirectory = process.env.NETWORK_PLUS_UNPACKED_DIR || path.join(temporary, 'candidate', 'extension');
    try {
      materializeUnpacked(mainDirectory, (name) =>
        execFileSync('git', ['show', `${MAIN_SHA}:${name}`], {
          cwd: repositoryRoot,
          maxBuffer: 16 * 1024 * 1024,
        }),
      );
      if (!process.env.NETWORK_PLUS_UNPACKED_DIR) {
        materializeUnpacked(candidateDirectory, (name) => fs.readFileSync(path.join(repositoryRoot, name)));
      }
      const main = await captureUnpacked(mainDirectory);
      const candidate = await captureUnpacked(candidateDirectory);
      expect(main.empty.errors).toEqual([]);
      expect(main.cdpErrors).toEqual([]);
      expect(candidate.empty).toMatchObject({
        width: 52,
        height: 52,
        borderWidth: '1px',
        visible: true,
        errors: [],
      });
      expect(candidate.cdpErrors).toEqual([]);
      expect(main.views).toHaveLength(THEMES.length * WIDTHS.length);
      expect(candidate.views).toHaveLength(main.views.length);
      for (let index = 0; index < main.views.length; index += 1) {
        const baseline = main.views[index];
        const actual = candidate.views[index];
        expect(actual.theme).toBe(baseline.theme);
        expect(actual.width).toBe(baseline.width);
        expect(actual.statuses.map(({ code }) => code)).toEqual(STATUS_CODES);
        expect(actual.statuses).toEqual(baseline.statuses);
        expect(actual.statuses.every(({ childElements, textOnly }) => childElements === 0 && textOnly)).toBe(true);
        expect(actual.rowHeights).toEqual(baseline.rowHeights);
        expect(actual.headerHeight).toBe(baseline.headerHeight);
        expect(actual.rootWidth).toBeLessThanOrEqual(actual.width);
        expect(actual.selected).toEqual(['503']);
        expect(actual.detailMarker).toBe('5px');
        expect(actual.consoleErrors).toEqual([]);
        expect(baseline.consoleErrors).toEqual([]);
      }
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  },
  180000,
);
