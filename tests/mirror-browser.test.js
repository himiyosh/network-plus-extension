'use strict';
// Real-browser regression for the pop-out mirror: the viewer tab's remote
// control surface, the host's command execution, session adoption after a
// DevTools reopen, and the pop-out minimize handshake. Chrome APIs are
// stubbed via Page.addScriptToEvaluateOnNewDocument so panel.js sees them
// at load, and a scripted peer drives the real page over the port wiring.
// Previously this coverage lived only in ephemeral session scratchpads.
const {
  findBrowserExecutable,
  launchPanelPage,
  evaluate,
  delay,
} = require('./helpers/browser-harness');

const TEST_TIMEOUT_MS = 90000;
const browserExecutable = findBrowserExecutable();
const runningInCi =
  process.env.GITHUB_ACTIONS === 'true' || Boolean(process.env.CI && process.env.CI.toLowerCase() !== 'false');
if (!browserExecutable && runningInCi) {
  throw new Error(
    'Real-browser regression tests require an executable Chrome or Edge in CI. ' +
      'Set EDGE_BIN or CHROME_BIN to an executable browser path.',
  );
}
const browserTest = browserExecutable ? test : test.skip;

const MINI_HAR = JSON.stringify({
  log: {
    version: '1.2',
    creator: { name: 'mirror-browser-test', version: '1' },
    entries: [
      {
        startedDateTime: '2026-08-22T10:00:00.000Z',
        time: 42,
        request: {
          method: 'GET',
          url: 'https://imported.example.test/one',
          headers: [],
          queryString: [],
          headersSize: -1,
          bodySize: 0,
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [{ name: 'Content-Type', value: 'text/plain' }],
          content: { size: 2, mimeType: 'text/plain', text: 'ok' },
          headersSize: -1,
          bodySize: 2,
        },
        cache: {},
        timings: { send: 1, wait: 40, receive: 1 },
      },
    ],
  },
});

const wireRow = (id) => ({
  id,
  startedDateTime: new Date(1755750000000 + id * 1000).toISOString(),
  time: 120,
  initiator: { text: 'JS: app.js:1', url: 'https://example.test/app.js', lineNumber: 1, typeLabel: 'JS' },
  request: { method: 'GET', url: 'https://api.example.test/v1/items/' + id, headers: [], postData: null },
  response: {
    status: 200,
    statusText: 'OK',
    httpVersion: 'HTTP/2.0',
    headers: [{ name: 'Content-Type', value: 'application/json' }],
    bodySize: 100,
    content: { mimeType: 'application/json', size: 100 },
  },
  timings: { wait: 90, receive: 10 },
});

const syncControl = (over) =>
  Object.assign(
    {
      paused: false,
      retention: { requestLimit: 20000, unlimited: false },
      undoAvailable: false,
      streamCapture: { supported: true, enabled: false },
    },
    over,
  );

// The viewer stub: storage plus a runtime whose onConnect handlers the test
// invokes with a scripted host port. Reinstalled on every navigation.
const VIEWER_STUB = `
  window.__sentToHost = [];
  window.__onConnectHandlers = [];
  globalThis.chrome = {
    storage: { local: { get: (keys, cb) => setTimeout(() => cb({}), 0), set: (data, cb) => cb && cb() } },
    runtime: {
      lastError: null,
      getManifest: () => ({ version: '0.0.0' }),
      onConnect: { addListener: (fn) => window.__onConnectHandlers.push(fn) },
    },
  };
`;

// The host stub: devtools APIs plus a singleton fake port whose message
// listener the test drives as the scripted viewer.
const HOST_STUB = `
  window.__fromHost = [];
  window.__evals = [];
  window.__requestListeners = [];
  window.__openedUrls = [];
  window.__minimizeCalls = 0;
  window.__minimizeAnswer = { minimized: true };
  const fakePort = {
    name: 'networkplus-mirror:42',
    onMessage: { addListener: (fn) => (window.__hostPortListener = fn) },
    onDisconnect: { addListener: () => {} },
    postMessage: (msg) => window.__fromHost.push(msg),
    disconnect: () => {},
  };
  globalThis.chrome = {
    storage: { local: { get: (keys, cb) => setTimeout(() => cb({}), 0), set: (data, cb) => cb && cb() } },
    runtime: {
      lastError: null,
      connect: () => fakePort,
      sendMessage: (message, cb) => {
        window.__minimizeCalls += 1;
        if (cb) cb(window.__minimizeAnswer);
      },
    },
    devtools: {
      inspectedWindow: {
        tabId: 42,
        eval: (source, cb) => {
          window.__evals.push(String(source));
          if (cb) cb(undefined, undefined);
        },
      },
      network: {
        onRequestFinished: { addListener: (fn) => window.__requestListeners.push(fn) },
        onNavigated: { addListener: () => {} },
      },
      panels: { openResource: () => {} },
    },
  };
  window.open = (url) => {
    window.__openedUrls.push(String(url));
    return { closed: false, focus: () => {} };
  };
`;

const attachScriptedHostPort = (cdp) =>
  evaluate(
    cdp,
    `(() => {
      window.__hostListeners = { message: [], disconnect: [] };
      const port = {
        name: 'networkplus-mirror:7',
        onMessage: { addListener: (fn) => window.__hostListeners.message.push(fn) },
        onDisconnect: { addListener: (fn) => window.__hostListeners.disconnect.push(fn) },
        postMessage: (msg) => window.__sentToHost.push(msg),
        disconnect: () => {},
      };
      window.__send = (msg) => window.__hostListeners.message.forEach((fn) => fn(msg));
      window.__onConnectHandlers.forEach((fn) => fn(port));
      return true;
    })()`,
  );

const sendSnapshot = (cdp, rows, control) =>
  evaluate(
    cdp,
    `(() => {
      const rows = ${JSON.stringify(rows)};
      window.__send({ type: 'snapshot-start', generation: 1, total: rows.length, protocolVersion: 2 });
      window.__send({ type: 'snapshot-rows', generation: 1, rows });
      window.__send({ type: 'snapshot-end', generation: 1 });
      window.__send({ type: 'sync', count: rows.length, maxId: rows.length, paused: false, control: ${JSON.stringify(
        control,
      )} });
      return true;
    })()`,
  );

const lastViewerCommand = (cdp) =>
  evaluate(cdp, "window.__sentToHost.filter((m) => m.type === 'command').at(-1) || null");

const answerCommand = (cdp, commandId, control) =>
  evaluate(
    cdp,
    `(() => {
      window.__send({ type: 'command-result', commandId: ${commandId}, ok: true, error: '' });
      window.__send({ type: 'sync', count: 3, maxId: 3, paused: ${control.paused === true}, control: ${JSON.stringify(
        control,
      )} });
      return true;
    })()`,
  );

browserTest(
  'the mirror viewer drives the session remotely and explains the docked case once',
  async () => {
    const page = await launchPanelPage({
      executable: browserExecutable,
      query: '?view=window&src=7',
      initScript: VIEWER_STUB,
    });
    try {
      await attachScriptedHostPort(page.cdp);
      expect(
        await evaluate(page.cdp, "document.querySelectorAll('.empty-state-action').length"),
      ).toBe(0);
      await sendSnapshot(page.cdp, [wireRow(1), wireRow(2), wireRow(3)], syncControl());
      await delay(300);

      const visible = await evaluate(
        page.cdp,
        `Object.fromEntries(
          ['pauseBtn', 'clearBtn', 'importBtn', 'settingsBtn', 'popoutBtn', 'wsCaptureBtn'].map((id) => {
            const el = document.getElementById(id);
            return [id, el ? !el.hidden && el.getBoundingClientRect().width > 0 : null];
          }),
        )`,
      );
      expect(visible.pauseBtn).toBe(true);
      expect(visible.settingsBtn).toBe(true);
      expect(visible.popoutBtn).toBe(false);
      expect(visible.wsCaptureBtn).toBe(true);

      // Pause is a remote command; the answered sync flips the status line.
      await evaluate(page.cdp, "document.getElementById('pauseBtn').click(); true");
      await delay(100);
      let command = await lastViewerCommand(page.cdp);
      expect(command.name).toBe('pause-toggle');
      await answerCommand(page.cdp, command.commandId, syncControl({ paused: true }));
      await delay(150);
      expect(await evaluate(page.cdp, "document.getElementById('statusText').textContent")).toContain(
        '(recording paused)',
      );

      // Retention travels as retention-set from inside the Settings dialog.
      await evaluate(page.cdp, "document.getElementById('settingsBtn').click(); true");
      await delay(100);
      expect(await evaluate(page.cdp, "document.getElementById('retentionLimit').value")).toBe('20000');
      await evaluate(
        page.cdp,
        `(() => {
          document.getElementById('retentionLimit').value = '500';
          document.getElementById('retentionSaveBtn').click();
          return true;
        })()`,
      );
      await delay(100);
      command = await lastViewerCommand(page.cdp);
      expect(command.name).toBe('retention-set');
      expect(command.args.requestLimit).toBe(500);
      await answerCommand(
        page.cdp,
        command.commandId,
        syncControl({ paused: true, retention: { requestLimit: 500, unlimited: false } }),
      );
      await delay(150);
      expect(await evaluate(page.cdp, "document.getElementById('settingsDialog').open")).toBe(false);
      expect(
        await evaluate(page.cdp, "document.getElementById('retentionStatus').getAttribute('title')"),
      ).toContain('Retention: 500');

      // Import transfers as begin/chunk/end carrying the file bytes.
      await evaluate(
        page.cdp,
        `(() => {
          const input = document.getElementById('viewerImportFile');
          const dt = new DataTransfer();
          dt.items.add(new File([${JSON.stringify(MINI_HAR)}], 'transfer.har', { type: 'application/json' }));
          input.files = dt.files;
          input.dispatchEvent(new Event('change'));
          return true;
        })()`,
      );
      await delay(300);
      const importParts = await evaluate(
        page.cdp,
        `(() => {
          const msgs = window.__sentToHost.filter((m) => m.type && m.type.startsWith('import-'));
          return {
            begin: msgs.find((m) => m.type === 'import-begin') || null,
            end: msgs.some((m) => m.type === 'import-end'),
            data: msgs.filter((m) => m.type === 'import-chunk').map((m) => m.data).join(''),
          };
        })()`,
      );
      expect(importParts.begin.fileName).toBe('transfer.har');
      expect(importParts.end).toBe(true);
      expect(Buffer.from(importParts.data, 'base64').toString('utf8')).toBe(MINI_HAR);

      // The docked report raises the undock explainer exactly once per load,
      // and "Don't show this again" persists across a reload.
      await evaluate(
        page.cdp,
        `window.__send({ type: 'sync', count: 3, maxId: 3, paused: true, control: ${JSON.stringify(
          syncControl({ paused: true, devtoolsMinimized: false }),
        )} }); true`,
      );
      await delay(150);
      expect(await evaluate(page.cdp, "document.getElementById('undockHintDialog').open")).toBe(true);
      await evaluate(
        page.cdp,
        `(() => {
          document.getElementById('undockHintDontShowAgain').checked = true;
          document.getElementById('undockHintCloseBtn').click();
          return true;
        })()`,
      );
      await delay(100);
      expect(await evaluate(page.cdp, "localStorage.getItem('networkPlus.undockHint.v1')")).toBe('1');
      await page.navigate();
      await attachScriptedHostPort(page.cdp);
      await evaluate(
        page.cdp,
        `window.__send({ type: 'sync', count: 0, maxId: 0, paused: false, control: ${JSON.stringify(
          syncControl({ devtoolsMinimized: false }),
        )} }); true`,
      );
      await delay(150);
      expect(await evaluate(page.cdp, "document.getElementById('undockHintDialog').open")).toBe(false);

      // Language applies to explanations instantly; labels stay English.
      await evaluate(
        page.cdp,
        `(() => {
          const select = document.getElementById('langSelect');
          select.value = 'ja';
          select.dispatchEvent(new Event('change'));
          return true;
        })()`,
      );
      await delay(100);
      const jaTexts = await evaluate(
        page.cdp,
        `(() => ({
          help: document.getElementById('langHelp').textContent,
          label: document.querySelector('label[for="retentionLimit"]').textContent,
          searchTitle: document.getElementById('searchToggleBtn').title,
          resendIntro: document.getElementById('resendDialogIntro').textContent,
          emptyDesc: (document.getElementById('empty-state-description') || {}).textContent || '',
        }))()`,
      );
      expect(jaTexts.help).toBe('説明文とガイドに適用されます。ボタンなどの項目名は英語のままです。');
      expect(jaTexts.label).toBe('Maximum retained requests');
      // Wave 2: tooltips, dialog prose, and the JS-composed empty state all
      // swap in place from the same dictionary.
      expect(jaTexts.searchTitle).toBe('検索パネルを開閉 (Ctrl+F)');
      expect(jaTexts.resendIntro).toContain('検査中のページ自身が送信します');
      expect(jaTexts.emptyDesc).toBe(
        'リクエストは DevTools セッションから流れてきます。ガイド付きローカルサンプルは DevTools 側でのみ使えます。',
      );

      // A disconnected remote resend reports inside the dialog and keeps it
      // open with the edited request instead of throwing.
      await sendSnapshot(page.cdp, [wireRow(1)], syncControl());
      await delay(250);
      await evaluate(page.cdp, 'window.__hostListeners.disconnect.forEach((fn) => fn()); true');
      await delay(100);
      await evaluate(
        page.cdp,
        `(() => {
          const row = document.querySelector('#tbody tr[data-row-id="1"]');
          const rect = row.getBoundingClientRect();
          row.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 5, clientY: rect.top + 5 }),
          );
          return true;
        })()`,
      );
      await delay(150);
      await evaluate(
        page.cdp,
        `(() => {
          const item = Array.from(document.querySelectorAll('.context-menu-item')).find(
            (el) => el.textContent === 'Edit and resend...',
          );
          item.click();
          return true;
        })()`,
      );
      await delay(150);
      await evaluate(page.cdp, "document.getElementById('resendSendBtn').click(); true");
      await delay(150);
      const resendState = await evaluate(
        page.cdp,
        `(() => ({
          open: document.getElementById('resendDialog').open,
          hidden: document.getElementById('resendError').hidden,
          error: document.getElementById('resendError').textContent,
        }))()`,
      );
      expect(resendState.open).toBe(true);
      expect(resendState.hidden).toBe(false);
      expect(resendState.error.startsWith('Re-send failed:')).toBe(true);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'the host executes remote commands against its own controls and answers each one',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, initScript: HOST_STUB });
    try {
      // One captured live row so the snapshot has content.
      await evaluate(
        page.cdp,
        `(() => {
          const entry = {
            startedDateTime: new Date().toISOString(),
            time: 50,
            request: { method: 'GET', url: 'https://live.example.test/a', headers: [], postData: null },
            response: {
              status: 200,
              statusText: 'OK',
              httpVersion: 'HTTP/2',
              headers: [],
              bodySize: 2,
              content: { mimeType: 'text/plain', size: 2 },
            },
            timings: {},
            getContent: (cb) => cb('ok', ''),
          };
          window.__requestListeners.forEach((fn) => fn(entry));
          return true;
        })()`,
      );
      await delay(200);
      await evaluate(page.cdp, "document.getElementById('popoutBtn').click(); true");
      await delay(200);
      expect(await evaluate(page.cdp, 'window.__openedUrls')).toEqual(['panel.html?view=window&src=42']);
      expect(await evaluate(page.cdp, 'window.__minimizeCalls')).toBe(1);

      const drive = (message) =>
        evaluate(page.cdp, `window.__hostPortListener(${JSON.stringify(message)}); true`);
      const fromHost = () => evaluate(page.cdp, 'window.__fromHost');

      await drive({ type: 'hello', protocolVersion: 2 });
      await delay(150);
      let messages = await fromHost();
      const firstSync = messages.find((m) => m.type === 'sync');
      expect(firstSync.control.retention.requestLimit).toBe(20000);
      expect(firstSync.control.streamCapture.supported).toBe(true);
      expect(firstSync.control.devtoolsMinimized).toBe(true);

      await drive({ type: 'command', commandId: 11, name: 'pause-toggle', args: {} });
      await delay(150);
      messages = await fromHost();
      expect(messages.find((m) => m.type === 'command-result' && m.commandId === 11).ok).toBe(true);
      expect(messages.filter((m) => m.type === 'sync').at(-1).paused).toBe(true);

      await drive({ type: 'command', commandId: 12, name: 'retention-set', args: { requestLimit: 7, unlimited: false } });
      await delay(150);
      messages = await fromHost();
      const retentionReject = messages.find((m) => m.type === 'command-result' && m.commandId === 12);
      expect(retentionReject.ok).toBe(false);
      expect(retentionReject.error).toContain('100');

      // A transfer that exceeds its declared size is refused mid-flight.
      await drive({ type: 'import-begin', commandId: 13, fileName: 'lie.har', size: 10 });
      await drive({ type: 'import-chunk', commandId: 13, data: 'A'.repeat(64) });
      await delay(100);
      messages = await fromHost();
      expect(messages.find((m) => m.type === 'command-result' && m.commandId === 13).error).toBe(
        'The transfer exceeded its declared size and was refused.',
      );

      // A well-formed transfer imports into the host's own pipeline.
      const harBase64 = Buffer.from(MINI_HAR).toString('base64');
      await drive({ type: 'import-begin', commandId: 14, fileName: 'transfer.har', size: MINI_HAR.length });
      await drive({ type: 'import-chunk', commandId: 14, data: harBase64 });
      await drive({ type: 'import-end', commandId: 14 });
      await delay(400);
      messages = await fromHost();
      expect(messages.find((m) => m.type === 'command-result' && m.commandId === 14).ok).toBe(true);
      expect(await evaluate(page.cdp, "document.querySelectorAll('#tbody tr').length")).toBe(1);
      expect(await evaluate(page.cdp, "document.getElementById('tbody').textContent")).toContain(
        'imported.example.test',
      );

      await drive({ type: 'command', commandId: 15, name: 'stream-toggle', args: {} });
      await delay(200);
      messages = await fromHost();
      expect(messages.find((m) => m.type === 'command-result' && m.commandId === 15).ok).toBe(true);
      expect(await evaluate(page.cdp, "document.getElementById('wsCaptureBtn').textContent")).toBe(
        'Stream capture: On',
      );
      expect(
        await evaluate(page.cdp, "window.__evals.some((s) => s.startsWith('(function pageWebSocketWrapper('))"),
      ).toBe(true);

      await drive({
        type: 'command',
        commandId: 16,
        name: 'resend',
        args: { spec: { method: 'GET', url: 'https://api.example.test/echo', headers: [], body: '', credentials: true } },
      });
      await delay(200);
      messages = await fromHost();
      expect(messages.find((m) => m.type === 'command-result' && m.commandId === 16).ok).toBe(true);
      expect(
        await evaluate(
          page.cdp,
          "window.__evals.some((s) => s.startsWith('(function pageResendRunner(') && s.includes('api.example.test/echo'))",
        ),
      ).toBe(true);

      await drive({ type: 'command', commandId: 17, name: 'nope', args: {} });
      await delay(100);
      messages = await fromHost();
      expect(messages.find((m) => m.type === 'command-result' && m.commandId === 17).error).toBe(
        'Unknown mirror command: nope',
      );
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'a surviving mirror tab is adopted at startup and never duplicated',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, initScript: HOST_STUB });
    try {
      // The startup probe registered the port listener without any pop-out.
      expect(await evaluate(page.cdp, "typeof window.__hostPortListener === 'function'")).toBe(true);
      await evaluate(page.cdp, "window.__hostPortListener({ type: 'hello', protocolVersion: 2 }); true");
      await delay(200);
      expect(await evaluate(page.cdp, "document.getElementById('statusText').textContent")).toContain(
        'reattached and mirrors this DevTools session again',
      );
      const sync = await evaluate(page.cdp, "window.__fromHost.find((m) => m.type === 'sync') || null");
      expect(sync.control.devtoolsMinimized).toBeNull();

      await evaluate(page.cdp, "document.getElementById('popoutBtn').click(); true");
      await delay(150);
      expect(await evaluate(page.cdp, "document.getElementById('statusText').textContent")).toContain(
        'already mirroring this session',
      );
      expect(await evaluate(page.cdp, 'window.__openedUrls.length')).toBe(0);
      expect(await evaluate(page.cdp, 'window.__minimizeCalls')).toBe(0);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);

browserTest(
  'the pop-out reports the minimize outcome either way and never re-sends on focus',
  async () => {
    const page = await launchPanelPage({ executable: browserExecutable, initScript: HOST_STUB });
    try {
      await evaluate(page.cdp, 'window.__minimizeAnswer = { minimized: false }; true');
      await evaluate(page.cdp, "document.getElementById('popoutBtn').click(); true");
      await delay(200);
      expect(await evaluate(page.cdp, "document.getElementById('statusText').textContent")).toContain(
        'DevTools stayed put — undock it into its own window',
      );
      // A second click focuses the existing tab without a second minimize.
      await evaluate(page.cdp, "document.getElementById('popoutBtn').click(); true");
      await delay(150);
      expect(await evaluate(page.cdp, 'window.__minimizeCalls')).toBe(1);
      expect(await evaluate(page.cdp, 'window.__openedUrls.length')).toBe(1);
    } finally {
      await page.close();
    }
  },
  TEST_TIMEOUT_MS,
);
