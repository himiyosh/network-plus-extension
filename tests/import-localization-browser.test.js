'use strict';

const { findBrowserExecutable, launchPanelPage, evaluate, delay } = require('./helpers/browser-harness');

const browserExecutable = findBrowserExecutable();
const runningInCi = process.env.GITHUB_ACTIONS === 'true' || Boolean(process.env.CI && process.env.CI.toLowerCase() !== 'false');
if (!browserExecutable && runningInCi) throw new Error('Import localization browser tests require Chrome or Edge in CI.');
const browserTest = browserExecutable ? test : test.skip;

async function waitFor(page, expression) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await evaluate(page.cdp, expression);
    if (result) return result;
    await delay(25);
  }
  throw new Error('Import localization fixture did not reach the expected state.');
}

async function launchJapanesePanel() {
  return launchPanelPage({
    executable: browserExecutable,
    query: '?view=offline',
    initScript: `localStorage.setItem('networkPlus.lang', 'ja');
      window.__importErrors = []; console.error = (message) => window.__importErrors.push(String(message));`,
  });
}

browserTest('Japanese import failures localize their reason without translating the canonical error log', async () => {
  const page = await launchJapanesePanel();
  try {
    await evaluate(page.cdp, `(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['not JSON'], 'invalid.har'));
      const input = document.querySelector('#importFile');
      input.files = transfer.files; input.dispatchEvent(new Event('change')); return true;
    })()`);
    await waitFor(page, 'window.__importErrors.length > 0');
    expect(await evaluate(page.cdp, 'document.querySelector("#statusText").textContent')).toBe(
      'インポートに失敗しました：HAR には log.entries 配列が必要です。',
    );
    expect(await evaluate(page.cdp, 'window.__importErrors')).toEqual([
      'Network+ import failed: HAR must contain a log.entries array.',
    ]);
  } finally {
    await page.close();
  }
}, 60000);

browserTest('SAZ body admission uses the import-only localized omission notice', async () => {
  const page = await launchJapanesePanel();
  try {
    await evaluate(page.cdp, `(() => {
      const archive = window.fflate.zipSync({
        'raw/1_c.txt': window.fflate.strToU8('GET https://synthetic.invalid/saz HTTP/1.1\\r\\n\\r\\n'),
        'raw/1_s.txt': window.fflate.strToU8('HTTP/1.1 200 OK\\r\\nContent-Type: text/plain\\r\\n\\r\\n' + 'x'.repeat(1100000)),
      });
      const transfer = new DataTransfer();
      transfer.items.add(new File([archive], 'retained.saz'));
      const input = document.querySelector('#importFile');
      input.files = transfer.files; input.dispatchEvent(new Event('change')); return true;
    })()`);
    await waitFor(page, `document.querySelector('#retentionAnnouncement').textContent.includes('1 MiB')`);
    expect(await evaluate(page.cdp, 'document.querySelector("#retentionAnnouncement").textContent')).toBe(
      '1 MiB の保持上限によりレスポンスボディを省略しました。合計: リクエスト削除 0 件、ボディ省略 1 件、キャッシュ済みボディ削除 0 件、プレビュー省略 0 件。',
    );
    expect(await evaluate(page.cdp, 'window.__importErrors')).toEqual([]);
  } finally {
    await page.close();
  }
}, 60000);

browserTest('mirror validation and host failure reasons translate only when displayed', async () => {
  const page = await launchPanelPage({
    executable: browserExecutable,
    query: '?view=window&src=7',
    initScript: `localStorage.setItem('networkPlus.lang', 'ja');
      window.__sentToHost = []; window.__onConnectHandlers = [];
      globalThis.chrome = {
        storage: { local: { get: (keys, cb) => setTimeout(() => cb({}), 0), set: (data, cb) => cb && cb() } },
        runtime: { lastError: null, getManifest: () => ({ version: '0.0.0' }),
          onConnect: { addListener: (fn) => window.__onConnectHandlers.push(fn) } },
      };`,
  });
  try {
    await evaluate(page.cdp, `(() => {
      const port = { name: 'networkplus-mirror:7',
        onMessage: { addListener: (fn) => { window.__send = fn; } },
        onDisconnect: { addListener: () => {} },
        postMessage: (msg) => window.__sentToHost.push(msg), disconnect: () => {},
      };
      window.__onConnectHandlers.forEach((fn) => fn(port));
      window.__send({ type: 'snapshot-start', generation: 1, total: 0, protocolVersion: 2 });
      window.__send({ type: 'snapshot-end', generation: 1 });
      window.__setImportFile = (name) => {
        const transfer = new DataTransfer(); transfer.items.add(new File(['{}'], name));
        const input = document.querySelector('#viewerImportFile');
        input.files = transfer.files; input.dispatchEvent(new Event('change'));
      };
      window.__setImportFile('unsupported.txt'); return true;
    })()`);
    expect(await evaluate(page.cdp, 'document.querySelector("#statusText").textContent')).toBe(
      'インポートに失敗しました：HAR ファイルと SAZ ファイルのみ対応しています。',
    );
    await evaluate(page.cdp, "window.__setImportFile('transfer.har'); true");
    const begin = await waitFor(page, "window.__sentToHost.find((message) => message.type === 'import-begin')");
    await evaluate(page.cdp, `(() => {
      window.__failedReply = { type: 'command-result', commandId: ${begin.commandId}, ok: false,
        error: 'The transferred file could not be decoded.' };
      window.__send(window.__failedReply); return true;
    })()`);
    expect(await evaluate(page.cdp, 'document.querySelector("#statusText").textContent')).toBe(
      'インポートに失敗しました：転送されたファイルをデコードできませんでした。',
    );
    expect(await evaluate(page.cdp, 'window.__failedReply.error')).toBe('The transferred file could not be decoded.');
  } finally {
    await page.close();
  }
}, 60000);

browserTest('Japanese import retention announcements include localized omissions and totals', async () => {
  const page = await launchJapanesePanel();
  try {
    await evaluate(page.cdp, `(() => {
      document.querySelector('#retentionUnlimited').checked = false;
      document.querySelector('#retentionLimit').value = '100';
      document.querySelector('#retentionSaveBtn').click();
      const entries = Array.from({ length: 101 }, (_, index) => ({
        request: { method: 'GET', url: 'https://synthetic.invalid/' + index, headers: [] },
        response: { status: 200, headers: [], content: { mimeType: 'text/plain', text: index === 100 ? 'x'.repeat(1100000) : '', size: 0 } },
        timings: {},
      }));
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify({ log: { entries } })], 'retained.har'));
      const input = document.querySelector('#importFile');
      input.files = transfer.files; input.dispatchEvent(new Event('change')); return true;
    })()`);
    await waitFor(page, `(() => { const text = document.querySelector('#statusText').textContent;
      return text.includes('retained 100') || text.includes('100 件を保持'); })()`);
    await waitFor(page, `(() => { const text = document.querySelector('#retentionAnnouncement').textContent;
      return text.includes('response bodies omitted') || text.includes('インポート中'); })()`);
    expect(await evaluate(page.cdp, 'document.querySelector("#retentionAnnouncement").textContent')).toBe(
      'インポート中にレスポンスボディを 1 件省略し、0 件をキャッシュから削除しました。合計: リクエスト削除 1 件、ボディ省略 1 件、キャッシュ済みボディ削除 0 件、プレビュー省略 0 件。',
    );
    expect(await evaluate(page.cdp, 'window.__importErrors')).toEqual([]);
  } finally {
    await page.close();
  }
}, 60000);
