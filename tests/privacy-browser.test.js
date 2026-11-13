'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const {
  delay,
  findBrowserExecutable,
  connectCdp,
  startBrowserSession,
  evaluate,
  stopBrowser,
  removeProfileDirectory,
} = require('./helpers/browser-harness');
const np = require('../panel');

const browserExecutable = findBrowserExecutable();
const runningInCi =
  process.env.GITHUB_ACTIONS === 'true' || Boolean(process.env.CI && process.env.CI.toLowerCase() !== 'false');
if (!browserExecutable && runningInCi) {
  throw new Error('Privacy browser regressions require an executable Chrome or Edge in CI.');
}
const browserTest = browserExecutable ? test : test.skip;
const panelSource = fs.readFileSync(path.join(__dirname, '..', 'panel.js'), 'utf8');
const previewSource = panelSource.slice(
  panelSource.indexOf('  function buildHtmlBodyFrame(text) {'),
  panelSource.indexOf('\n  function renderCachedResponseContent(row)', panelSource.indexOf('  function buildHtmlBodyFrame(text) {')),
);
const manifest = require('../manifest.json');
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';

async function waitUntil(read, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await delay(25);
  }
  throw new Error('The privacy fixture did not reach the expected state.');
}

async function watchConnections() {
  let count = 0;
  const listener = net.createServer((socket) => {
    count += 1;
    socket.destroy();
  });
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  return {
    url: 'http://127.0.0.1:' + listener.address().port,
    count: () => count,
    close: () => new Promise((resolve) => listener.close(resolve)),
  };
}

describe('captured content and resend privacy in a real browser', () => {
  let server;
  let browser;
  let origin;
  const previewConnections = [];
  const hits = [];

  beforeAll(async () => {
    if (!browserExecutable) return;
    server = http.createServer((request, response) => {
      if (request.url === '/') {
        response.writeHead(200, {
          'Content-Type': 'text/html',
          'Content-Security-Policy': manifest.content_security_policy.extension_pages,
          'Set-Cookie': 'privacy_probe=synthetic; SameSite=Lax; HttpOnly; Path=/',
        });
        response.end('<!doctype html><html><body style="margin:0"></body></html>');
        return;
      }
      if (request.url !== '/favicon.ico') hits.push({ url: request.url, cookie: request.headers.cookie || '' });
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('synthetic fixture');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    browser = await startBrowserSession(browserExecutable);
    await browser.cdp.send('Page.enable');
    await browser.cdp.send('Runtime.enable');
  }, 90000);

  beforeEach(async () => {
    if (!browser) return;
    await browser.cdp.send('Page.navigate', { url: origin + '/' });
    await waitUntil(() => evaluate(browser.cdp, 'document.readyState === "complete" && location.pathname === "/"'));
    hits.length = 0;
  });

  afterAll(async () => {
    if (browser) {
      await browser.cdp.close();
      await stopBrowser(browser.browserProcess);
      removeProfileDirectory(browser.profileDirectory);
    }
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  afterEach(async () => {
    for (const connection of previewConnections.splice(0)) await connection.close();
  });

  async function renderPreview(html) {
    await evaluate(browser.cdp, `(() => {
      const uiText = () => 'Captured HTML preview';
      ${previewSource}
      const frame = buildHtmlBodyFrame(${JSON.stringify(html)});
      frame.id = 'preview';
      document.body.appendChild(frame);
    })()`);
    let parentCdp = browser.cdp;
    let parentFrameId = null;
    for (let depth = 0; depth < 3; depth += 1) {
      const child = await waitUntil(async () => {
        const tree = await parentCdp.send('Page.getFrameTree');
        if (!parentFrameId) parentFrameId = tree.frameTree.frame.id;
        const nodes = [tree.frameTree];
        let parent;
        while (nodes.length) {
          const node = nodes.shift();
          if (node.frame.id === parentFrameId) parent = node;
          nodes.push(...(node.childFrames || []));
        }
        const frame = parent?.childFrames?.find(({ frame }) => frame.url === 'about:srcdoc')?.frame;
        if (frame) return { id: frame.id };
        const targets = await browser.cdp.send('Target.getTargets');
        const target = targets.targetInfos.find((target) =>
          target.type === 'iframe' && target.url === 'about:srcdoc' && target.parentFrameId === parentFrameId,
        );
        return target && { id: target.targetId, separateTarget: true };
      });
      let previewCdp = parentCdp;
      if (child.separateTarget) {
        const port = fs.readFileSync(path.join(browser.profileDirectory, 'DevToolsActivePort'), 'utf8').split(/\r?\n/)[0];
        previewCdp = await connectCdp(`ws://127.0.0.1:${port}/devtools/page/${child.id}`);
        previewConnections.push(previewCdp);
      }
      const world = await previewCdp.send('Page.createIsolatedWorld', {
        frameId: child.id,
        worldName: 'privacy-test-observation',
      });
      const inFrame = async (expression) => {
        const result = await previewCdp.send('Runtime.evaluate', {
          expression,
          contextId: world.executionContextId,
          returnByValue: true,
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
      };
      await waitUntil(() => inFrame('document.readyState === "complete"'));
      if (await inFrame('!!document.querySelector("#visible, #link")')) return inFrame;
      parentCdp = previewCdp;
      parentFrameId = child.id;
    }
    throw new Error('The captured HTML fixture was not found inside the preview.');
  }

  browserTest('unchecked resend excludes same-site cookies while checked resend preserves them', async () => {
    for (const credentials of [false, true]) {
      const suffix = credentials ? '/checked' : '/unchecked';
      const source = np.buildResendEvalSource({ method: 'GET', url: origin + suffix, headers: [], credentials });
      expect(await evaluate(browser.cdp, source)).toEqual({ ok: true });
      const hit = await waitUntil(() => hits.find(({ url }) => url === suffix));
      expect(hit.cookie).toBe(credentials ? 'privacy_probe=synthetic' : '');
    }
  }, 30000);

  browserTest('HTML preview makes no passive requests and retains embedded styling and images', async () => {
    const inFrame = await renderPreview(`<!doctype html><html><head>
      <link rel="stylesheet" href="${origin}/stylesheet">
      <link rel="prefetch" href="${origin}/prefetch">
      <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' data:">
      <style>@import url('${origin}/style-import'); .probe { color: rgb(12, 34, 56); background-image: url('${origin}/background'); }</style>
      </head><body style="margin:17px">
      <p class="probe" id="visible">Readable captured response</p><p id="quoted">&quot;&gt;&lt;/iframe&gt;&lt;img src=x&gt;</p>
      <img id="embedded" src="${pixel}">
      <img src="${origin}/image"><img srcset="${origin}/srcset 1x">
      <svg xmlns="http://www.w3.org/2000/svg"><image href="${origin}/svg-image"></image></svg>
      <video poster="${origin}/poster" src="${origin}/video" preload="auto"></video>
      <audio src="${origin}/audio" preload="auto"></audio>
      <iframe src="${origin}/frame"></iframe>
      <iframe srcdoc="&lt;img src='${origin}/nested-image'&gt;"></iframe>
      <object data="${origin}/object"></object><embed src="${origin}/embed">
      <script src="${origin}/script"></script><script>fetch('${origin}/inline-script')</script>
      </body></html>`);
    await waitUntil(() => inFrame('document.getElementById("embedded").complete'));
    await delay(500);
    expect(hits).toEqual([]);
    expect(await evaluate(browser.cdp, 'document.getElementById("preview").getAttribute("sandbox")')).toBe('');
    expect(await inFrame(`({
      text: document.getElementById('visible').textContent,
      color: getComputedStyle(document.getElementById('visible')).color,
      margin: getComputedStyle(document.body).marginTop,
      imageWidth: document.getElementById('embedded').naturalWidth,
      quoted: document.getElementById('quoted').textContent
    })`)).toEqual({ text: 'Readable captured response', color: 'rgb(12, 34, 56)', margin: '17px', imageWidth: 1,
      quoted: '"></iframe><img src=x>' });
  }, 30000);

  browserTest('HTML preview suppresses speculative connections, including hidden and nested hints', async () => {
    const control = await watchConnections();
    const probe = await watchConnections();
    try {
      await evaluate(browser.cdp, `(() => {
        const link = document.createElement('link');
        link.rel = 'preconnect'; link.href = ${JSON.stringify(control.url)};
        document.head.appendChild(link);
      })()`);
      await waitUntil(() => control.count() > 0);
      await renderPreview(`<p id="visible">Preview</p>
        <link rel="preconnect" href="${probe.url}">
        <noscript><link rel="preconnect" href="${probe.url}"></noscript>
        <div><template shadowrootmode="open"><link rel="preconnect" href="${probe.url}"></template></div>
        <iframe srcdoc="&lt;link rel='preconnect' href='${probe.url}'&gt;"></iframe>`);
      await delay(1000);
      expect(probe.count()).toBe(0);
    } finally {
      await control.close();
      await probe.close();
    }
  }, 30000);

  browserTest.each([
    ['meta refresh', null],
    ['same-frame link and ping', "document.getElementById('link').click()"],
    ['parent navigation', "document.getElementById('parent-link').click()"],
    ['top navigation', "document.getElementById('top-link').click()"],
    ['popup navigation', "document.getElementById('popup-link').click()"],
    ['SVG xlink', "document.getElementById('svg-link').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))"],
    ['animated SVG link', "document.getElementById('animated-link').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))"],
    ['form submission', "document.querySelector('button').click()"],
  ])('HTML preview blocks %s', async (_name, action) => {
    const inFrame = await renderPreview(`<!doctype html><html><head>
      <base href="${origin}/"><meta http-equiv="refresh" content="0;url=${origin}/refresh">
      </head><body>
      <a id="link" href="${origin}/link" ping="${origin}/ping">A captured link</a>
      <a id="parent-link" target="_parent" href="${origin}/parent">Parent</a>
      <a id="top-link" target="_top" href="${origin}/top">Top</a>
      <a id="popup-link" target="_blank" href="${origin}/popup">Popup</a>
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <a id="svg-link" xlink:href="${origin}/svg-link"><text y="20">SVG link</text></a>
        <a id="animated-link" href="#safe"><set attributeName="href" to="${origin}/animated" begin="0s"></set><text y="40">Animated link</text></a>
      </svg>
      <form action="${origin}/form"><button type="submit">Send</button></form>
      </body></html>`);
    await delay(250);
    // CDP activates the real browser's default actions; the captured document
    // remains sandboxed and cannot itself execute scripts or access its parent.
    if (action) await inFrame(action);
    await delay(500);
    expect(hits).toEqual([]);
    expect(await evaluate(browser.cdp, 'location.href')).toBe(origin + '/');
  }, 30000);
});
