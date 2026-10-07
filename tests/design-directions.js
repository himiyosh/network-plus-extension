#!/usr/bin/env node
'use strict';

// Reproducible, extension-backed concept captures. Nothing here is loaded by
// panel.html or shipped to the extension. Usage:
// EDGE_BIN=/path/to/edge node tests/design-directions.js --output-dir /path/outside/repo
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  connectCdp,
  delay,
  evaluate,
  findBrowserExecutable,
  removeProfileDirectory,
  stopBrowser,
  waitForDevTools,
} = require('./helpers/browser-harness');

const root = path.resolve(__dirname, '..');
const stylesheet = fs.readFileSync(path.join(__dirname, 'design-directions.css'), 'utf8');
const dimensions = [
  { name: 'desktop', width: 1440, height: 800 },
  { name: 'narrow', width: 420, height: 800 },
];
const directions = ['baseline', 'clean', 'inspector', 'triage'];
const themes = ['light', 'dark'];
const expectedRows = ['GET 200', 'POST 503', 'GET 304'];
const sourcePage = 'data:text/html,%3Ctitle%3ENetwork%2B%20synthetic%20fixture%3C%2Ftitle%3E';

function requireOutputDirectory() {
  const index = process.argv.indexOf('--output-dir');
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error('Pass --output-dir pointing to a directory outside the repository.');
  }
  const output = path.resolve(process.argv[index + 1]);
  const relative = path.relative(root, output);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Concept screenshots and reports must stay outside the repository.');
  }
  fs.mkdirSync(output, { recursive: true });
  return output;
}

async function targetsAt(host) {
  const response = await fetch(`http://${host}/json/list`);
  if (!response.ok) throw new Error(`CDP target listing failed: HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(host, predicate, description) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const target = (await targetsAt(host)).find(predicate);
    if (target) return target;
    await delay(150);
  }
  throw new Error(`Timed out waiting for the real browser ${description} target.`);
}

async function openExtension(executable) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-design-'));
  const browser = spawn(
    executable,
    [
      '--headless=new',
      '--window-size=1600,950',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      '--auto-open-devtools-for-tabs',
      '--disable-background-networking',
      '--disable-default-apps',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-sandbox',
      sourcePage,
    ],
    { stdio: 'ignore' },
  );
  let ui;
  let panel;
  try {
    const host = new URL(await waitForDevTools(browser, profile)).host;
    const devtools = await waitForTarget(
      host,
      (target) => target.type === 'iframe' && /^chrome-extension:\/\/[^/]+\/devtools\.html$/.test(target.url),
      'extension DevTools page',
    );
    const id = new URL(devtools.url).host;
    const background = (await targetsAt(host)).some(
      (target) => target.type === 'service_worker' && target.url === `chrome-extension://${id}/background.js`,
    );
    if (!background) throw new Error('The unpacked Network+ service worker was not running.');
    const frontend = await waitForTarget(
      host,
      (target) => target.type === 'page' && target.url.startsWith('devtools://devtools/bundled/devtools_app.html'),
      'Edge DevTools front end',
    );
    ui = await connectCdp(frontend.webSocketDebuggerUrl);
    await ui.send('Runtime.enable');
    await ui.send('Page.enable');
    let selected;
    for (let attempt = 0; attempt < 70; attempt += 1) {
      selected = await evaluate(
        ui,
        `import('devtools://devtools/bundled/ui/legacy/legacy.js').then((modules) => {
          const original = Object.keys(UI.panels).find((key) => key === 'chrome-extension://${id}Network+');
          if (!original) return false;
          const inspector = modules.InspectorView.InspectorView.instance();
          if (!inspector.tabbedPane.selectTab(original, true)) throw new Error('Network+ tab selection failed');
          modules.DockController.DockController.instance().setDockSide('undocked');
          return inspector.tabbedPane.selectedTabId === original;
        })`,
        true,
      );
      if (selected) break;
      await delay(150);
    }
    if (!selected) throw new Error('The original Network+ tab was not registered in Edge DevTools.');
    const extensionPanel = await waitForTarget(
      host,
      (target) => target.type === 'iframe' && target.url === `chrome-extension://${id}/panel.html`,
      'selected Network+ panel',
    );
    panel = await connectCdp(extensionPanel.webSocketDebuggerUrl);
    const errors = [];
    panel.onEvent('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') errors.push(`console.error: ${params.args.map((arg) => arg.value || arg.description).join(' ')}`);
    });
    panel.onEvent('Runtime.exceptionThrown', (params) => {
      errors.push(`uncaught exception: ${params.exceptionDetails.exception?.description || params.exceptionDetails.text}`);
    });
    panel.onEvent('Log.entryAdded', (params) => {
      if (params.entry.level === 'error') errors.push(`browser log: ${params.entry.text}`);
    });
    let monitorReady = false;
    const stopMonitorProbe = panel.onEvent('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'log' && params.args[0]?.value === 'Network+ audit monitor ready') monitorReady = true;
    });
    await panel.send('Runtime.enable');
    await panel.send('Log.enable');
    await panel.send('Page.enable');
    await evaluate(panel, "console.log('Network+ audit monitor ready')");
    await delay(50);
    stopMonitorProbe();
    if (!monitorReady) throw new Error('The real panel console monitor did not receive its readiness event.');
    await panel.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(panel, "document.readyState === 'complete' && !!document.getElementById('statusText')")) {
        break;
      }
      await delay(100);
    }
    const identity = await evaluate(panel, `({
      url: location.href,
      id: chrome.runtime.id,
      devtoolsNetwork: !!chrome.devtools?.network,
      ready: document.readyState
    })`);
    if (
      identity.id !== id ||
      identity.url !== extensionPanel.url ||
      !identity.devtoolsNetwork ||
      identity.ready !== 'complete'
    ) {
      throw new Error(`Network+ must run inside its real extension DevTools panel: ${JSON.stringify(identity)}`);
    }
    return {
      ui,
      panel,
      id,
      identity,
      errors,
      async close() {
        await panel.close();
        await ui.close();
        await stopBrowser(browser);
        removeProfileDirectory(profile);
      },
    };
  } catch (error) {
    if (panel) await panel.close();
    if (ui) await ui.close();
    await stopBrowser(browser);
    removeProfileDirectory(profile);
    throw error;
  }
}

async function inPanel(panel, fn, ...arguments_) {
  return evaluate(panel, `(${fn.toString()})(${arguments_.map((argument) => JSON.stringify(argument)).join(',')})`, true);
}

function preparePanel(theme) {
  const language = document.getElementById('langSelect');
  const themeControl = document.getElementById('themeSelect');
  language.value = 'en';
  language.dispatchEvent(new Event('change', { bubbles: true }));
  themeControl.value = theme;
  themeControl.dispatchEvent(new Event('change', { bubbles: true }));
  return { language: language.value, theme: document.documentElement.dataset.theme };
}

function activateSample() {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === 'Explore sample capture',
  );
  if (!button) throw new Error('The real DevTools-only sample action did not render.');
  button.click();
  const rows = [...document.querySelectorAll('#tbody tr[data-row-id]')];
  const signatures = rows.map(
    (row) => `${row.querySelector('.method-badge')?.textContent} ${row.querySelector('.status-cell')?.textContent}`,
  );
  const failed = rows.find((row) => row.classList.contains('status-5xx'));
  if (!failed) throw new Error('The built-in 503 sample request is absent.');
  failed.click();
  return {
    signatures,
    selected: document.querySelector('#tbody tr.selected .status-cell')?.textContent === '503',
    sampleActive: !!document.getElementById('sampleCaptureStatus')?.textContent.trim(),
  };
}

function changeDirection(direction, css) {
  const prior = document.getElementById('design-direction-style');
  if (prior) prior.remove();
  document.querySelectorAll('.concept-timing, .concept-preview-heading').forEach((node) => node.remove());
  if (direction === 'baseline') {
    delete document.documentElement.dataset.designDirection;
  } else {
    const sheet = document.createElement('style');
    sheet.id = 'design-direction-style';
    sheet.textContent = css;
    document.head.appendChild(sheet);
    document.documentElement.dataset.designDirection = direction;
  }
  if (direction === 'triage') {
    const button = document.getElementById('columnsBtn');
    const menu = document.getElementById('columnsMenu');
    button.click();
    for (const id of ['id', 'domain']) {
      const item = menu.querySelector(`[data-column-id="${id}"]`);
      if (!item) throw new Error(`The real Columns menu has no ${id} control.`);
      if (item.getAttribute('aria-checked') === 'true') item.click();
    }
    button.click();
  }
  const responseTab = document.getElementById(
    direction === 'triage' ? 'res-tab-timing' : direction === 'inspector' ? 'res-tab-body' : 'res-tab-headers',
  );
  responseTab.click();
  return {
    direction: document.documentElement.dataset.designDirection || 'baseline',
    responseTab: document.querySelector('#res-tab-bar .tab-btn.active')?.textContent.trim(),
  };
}

function arrangeInspector(direction, width) {
  const toggle = document.getElementById('inspector-request-toggle');
  const collapse = width <= 800 && (direction === 'inspector' || direction === 'triage');
  if ((toggle.getAttribute('aria-expanded') === 'true') === collapse) toggle.click();
  return { requestExpanded: toggle.getAttribute('aria-expanded') === 'true', narrowPriority: collapse };
}

function augmentInspector() {
  const timingButton = document.getElementById('res-tab-timing');
  timingButton.click();
  const source = document.getElementById('res-timing');
  const total = source.querySelector('.timing-duration.timing-row--total')?.textContent.trim();
  const segments = [...source.querySelectorAll('.timing-bar-seg:not(.timing-bar-seg--rest)')];
  if (!total || !segments.length) throw new Error('The real selected 503 timing data did not render.');
  const bridge = document.createElement('div');
  bridge.className = 'concept-timing';
  bridge.setAttribute('role', 'group');
  bridge.setAttribute('aria-label', 'Timing overview');
  const heading = document.createElement('div');
  heading.className = 'concept-timing-heading';
  const title = document.createElement('span');
  title.textContent = 'Timing overview';
  const duration = document.createElement('span');
  duration.textContent = total;
  heading.append(title, duration);
  const rail = document.createElement('div');
  rail.className = 'concept-timing-rail';
  rail.setAttribute('aria-hidden', 'true');
  for (const original of segments) {
    const segment = document.createElement('span');
    segment.className = original.className;
    segment.style.left = original.style.left;
    segment.style.width = original.style.width;
    rail.appendChild(segment);
  }
  bridge.append(heading, rail);
  document.getElementById('res-tab-bar').before(bridge);
  document.getElementById('res-tab-body').click();
  const body = document.getElementById('res-body');
  if (!body.querySelector('.json-tree')) throw new Error('The real 503 JSON response preview did not render.');
  const previewTitle = document.createElement('span');
  previewTitle.className = 'concept-preview-heading';
  previewTitle.textContent = 'Response preview';
  body.prepend(previewTitle);
  return { total, timingPhases: segments.length, copyButtons: document.querySelectorAll('.kv-copy-btn').length };
}

async function setViewport(session, size) {
  await session.ui.send('Emulation.setDeviceMetricsOverride', {
    width: size.width,
    height: size.height + 32,
    deviceScaleFactor: 1,
    mobile: false,
  });
  let frame;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    frame = await evaluate(
      session.ui,
      `(() => {
        const src = 'chrome-extension://${session.id}/panel.html';
        let panel;
        const find = (root) => {
          for (const frame of root.querySelectorAll('iframe')) if (frame.src === src) panel = frame;
          for (const element of root.querySelectorAll('*')) if (element.shadowRoot) find(element.shadowRoot);
        };
        find(document);
        if (!panel) return null;
        const rect = panel.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, src: panel.src };
      })()`,
    );
    if (frame && frame.width === size.width && frame.height === size.height) break;
    await delay(100);
  }
  if (!frame || frame.width !== size.width || frame.height !== size.height) {
    throw new Error(`The real panel iframe did not resize to ${size.width}x${size.height}: ${JSON.stringify(frame)}`);
  }
  const viewport = await evaluate(session.panel, '[innerWidth, innerHeight]');
  if (viewport[0] !== size.width || viewport[1] !== size.height) {
    throw new Error(`The panel viewport disagrees with its iframe: ${JSON.stringify(viewport)}`);
  }
  return frame;
}

function inspectBaseline() {
  const style = (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing baseline element: ${selector}`);
    const computed = globalThis.getComputedStyle(element);
    return {
      font: computed.fontFamily,
      size: computed.fontSize,
      weight: computed.fontWeight,
      transform: computed.textTransform,
      background: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      border: computed.borderBottom,
      borderLeft: computed.borderLeft,
      outline: computed.outline,
      shadow: computed.boxShadow,
      radius: computed.borderRadius,
      rowHeight: element.getBoundingClientRect().height,
    };
  };
  const secondRow = document.querySelector('#tbody tr:nth-child(2)');
  const wasSelected = secondRow.classList.contains('selected');
  secondRow.classList.remove('selected');
  const zebra = globalThis.getComputedStyle(secondRow).backgroundColor;
  if (wasSelected) secondRow.classList.add('selected');
  const visible = [...document.querySelectorAll('body *')].filter((element) => {
    const bounds = element.getBoundingClientRect();
    const computed = globalThis.getComputedStyle(element);
    return bounds.width > 2 && bounds.height > 2 && bounds.top < globalThis.innerHeight &&
      computed.display !== 'none' && computed.visibility === 'visible' && !element.closest('[hidden]');
  });
  return {
    header: style('.title-row th'),
    topbar: style('.topbar'),
    body: style('body'),
    rowCell: style('#tbody tr:nth-child(2) td'),
    getMethod: style('.grid tbody tr.method-GET .method-badge'),
    postMethod: style('.grid tbody tr.method-POST .method-badge'),
    status304: style('.grid tbody tr.status-3xx .status-cell'),
    status503: style('.grid tbody tr.status-5xx .status-cell'),
    zebra,
    fontSizes: [...new Set(visible.map((element) => globalThis.getComputedStyle(element).fontSize))].sort(
      (a, b) => parseFloat(a) - parseFloat(b),
    ),
    radii: [...new Set(visible.map((element) => globalThis.getComputedStyle(element).borderRadius))].sort(),
    rowHeights: [...document.querySelectorAll('#tbody tr[data-row-id]')].map(
      (row) => row.getBoundingClientRect().height,
    ),
  };
}

function auditVisiblePanel() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const color = (value) => {
    if (colorCache.has(value)) return colorCache.get(value);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const result = [...ctx.getImageData(0, 0, 1, 1).data].map((part, index) => index === 3 ? part / 255 : part);
    colorCache.set(value, result);
    return result;
  };
  const over = (front, back) => front.slice(0, 3).map((part, index) => (
    part * front[3] + back[index] * (1 - front[3])
  ));
  const luminance = (rgb) => {
    const linear = rgb.map((part) => {
      const channel = part / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const contrast = (first, second) => {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const imageBackgrounds = new Set();
  const background = (element) => {
    const ancestors = [];
    for (let current = element; current; current = current.parentElement) ancestors.unshift(current);
    const point = element.getBoundingClientRect();
    let result = [255, 255, 255];
    for (const ancestor of ancestors) {
      const computed = globalThis.getComputedStyle(ancestor);
      result = over(color(computed.backgroundColor), result);
      if (computed.backgroundImage === 'none') continue;
      const gradient = computed.backgroundImage.match(
        /^linear-gradient\((rgb\([^)]+\)) 0%, (rgb\([^)]+\)) 100%\)$/,
      );
      if (!gradient) {
        imageBackgrounds.add(`${ancestor.tagName}.${ancestor.className}`);
        continue;
      }
      const rect = ancestor.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (point.top + point.height / 2 - rect.top) / rect.height));
      const first = color(gradient[1]);
      const last = color(gradient[2]);
      const sampled = first.map((channel, index) => channel * (1 - fraction) + last[index] * fraction);
      result = over(sampled, result);
    }
    return result;
  };
  const visible = (element) => {
    if (!element || element.closest('[hidden], [aria-hidden="true"], .sr-only, [disabled]')) return false;
    const computed = globalThis.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility !== 'visible' || computed.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 2 || rect.height <= 2 || rect.right <= 0 || rect.bottom <= 0 ||
      rect.left >= globalThis.innerWidth || rect.top >= globalThis.innerHeight) return false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const parentStyle = globalThis.getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility !== 'visible') return false;
      if (!/auto|scroll|hidden/.test(parentStyle.overflow + parentStyle.overflowX + parentStyle.overflowY)) continue;
      const clip = parent.getBoundingClientRect();
      if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) {
        return false;
      }
    }
    return true;
  };
  const text = [];
  const walker = document.createTreeWalker(document.body, globalThis.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent.trim();
    if (!value || !visible(node.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    if (![...range.getClientRects()].some((rect) => rect.width > 2 && rect.height > 2 &&
      rect.right > 0 && rect.left < globalThis.innerWidth &&
      rect.bottom > 0 && rect.top < globalThis.innerHeight)) continue;
    const element = node.parentElement;
    const fg = color(globalThis.getComputedStyle(element).color);
    const bg = background(element);
    const ratio = contrast(over(fg, bg), bg);
    text.push({ value: value.slice(0, 50), ratio: Number(ratio.toFixed(2)) });
  }
  const controls = [...document.querySelectorAll(
    '.topbar button, .details-close-btn, .statusbar button, .status-summary-chip, .tab-btn, #resizer, .inspector-divider',
  )].filter(visible);
  const borders = [];
  for (const control of controls) {
    const style = globalThis.getComputedStyle(control);
    const separator = control.id === 'resizer' || control.classList.contains('inspector-divider');
    const borderColor = separator
      ? style.backgroundColor : style.borderTopColor;
    const width = separator ? 2 : parseFloat(style.borderTopWidth);
    if (width < 1 || color(borderColor)[3] < 0.1) continue;
    const outside = background(control.parentElement);
    const inside = background(control);
    const boundary = over(color(borderColor), outside);
    const ratio = separator
      ? contrast(boundary, outside)
      : Math.min(contrast(boundary, outside), contrast(boundary, inside));
    borders.push({ control: control.id || control.className, ratio: Number(ratio.toFixed(2)) });
  }
  const focus = [];
  for (const selector of [
    '#pauseBtn',
    '.title-row th.sortable-header',
    '#tbody tr.selected',
    '#resizer',
    '.inspector-divider',
    '#inspector-request-toggle',
    '#res-tab-bar .tab-btn.active',
    '#req-headers .kv-copy-btn',
  ]) {
    const element = document.querySelector(selector);
    if (!visible(element)) continue;
    element.focus({ preventScroll: true });
    const style = globalThis.getComputedStyle(element);
    const separator = element.id === 'resizer' || element.classList.contains('inspector-divider');
    const surrounding = background(separator ? element.parentElement : element);
    const ring = color(separator ? style.backgroundColor : style.outlineColor);
    const ratio = contrast(over(ring, surrounding), surrounding);
    focus.push({
      selector,
      visible: element.matches(':focus-visible'),
      width: parseFloat(style.outlineWidth),
      ratio: Number(ratio.toFixed(2)),
    });
  }
  const rootOverflow = Math.max(
    document.documentElement.scrollWidth - globalThis.innerWidth,
    document.body.scrollWidth - globalThis.innerWidth,
  );
  const rowHeights = [...document.querySelectorAll('#tbody tr[data-row-id]')].map(
    (row) => row.getBoundingClientRect().height,
  );
  const inViewport = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left < globalThis.innerWidth &&
      rect.right > 0 && rect.top < globalThis.innerHeight && rect.bottom > 0;
  };
  const table = document.getElementById('tableWrap');
  return {
    url: globalThis.location.href,
    extensionId: chrome.runtime.id,
    devtoolsNetwork: !!chrome.devtools?.network,
    viewport: [globalThis.innerWidth, globalThis.innerHeight],
    theme: document.documentElement.dataset.theme,
    direction: document.documentElement.dataset.designDirection || 'baseline',
    sample: !!document.getElementById('sampleCaptureStatus')?.textContent.trim(),
    selectedStatus: document.querySelector('#tbody tr.selected .status-cell')?.textContent,
    responseTab: document.querySelector('#res-tab-bar .tab-btn.active')?.textContent.trim(),
    reducedMotion: globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
    runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
    rootOverflow,
    toolbarScroll: document.querySelector('.topbar').scrollLeft,
    tableOverflow: table.scrollWidth - table.clientWidth,
    headers: [...document.querySelectorAll('.title-row th')].filter(visible).map(
      (header) => header.getAttribute('aria-label'),
    ),
    timingVisible: inViewport('#res-timing .timing-table'),
    previewVisible: inViewport('#res-body .json-tree'),
    rowHeights,
    text: {
      count: text.length,
      minimum: Number(Math.min(...text.map((entry) => entry.ratio)).toFixed(2)),
      failures: text.filter((entry) => entry.ratio < 4.5).slice(0, 20),
    },
    borders: {
      count: borders.length,
      minimum: Number(Math.min(...borders.map((entry) => entry.ratio)).toFixed(2)),
      failures: borders.filter((entry) => entry.ratio < 3).slice(0, 20),
    },
    focus,
    unsupportedBackgrounds: [...imageBackgrounds],
  };
}

async function keyboardCheck(session) {
  await evaluate(session.panel, "document.querySelector('#tbody tr.selected')?.focus()");
  const sendKey = async (key) => {
    await session.ui.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: 40 });
    await session.ui.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: 40 });
  };
  await sendKey('ArrowDown');
  const next = await evaluate(session.panel, "document.querySelector('#tbody tr.selected .status-cell')?.textContent");
  await sendKey('ArrowUp');
  const restored = await evaluate(session.panel, "document.querySelector('#tbody tr.selected .status-cell')?.textContent");
  if (next !== '304' || restored !== '503') {
    throw new Error(`The request grid lost Arrow keyboard navigation: ${next} then ${restored}.`);
  }
  const search = await evaluate(
    session.panel,
    `(() => {const button=document.getElementById('searchToggleBtn');button.click();
      const open=button.getAttribute('aria-expanded')==='true';button.click();
      return {open,closed:button.getAttribute('aria-expanded')==='false'};})()`,
  );
  if (!search.open || !search.closed) throw new Error('The real Search control stopped working.');
  return { next, restored, search };
}

async function capture(session, frame, output, name) {
  const response = await session.ui.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: frame.x, y: frame.y, width: frame.width, height: frame.height, scale: 1 },
  });
  const image = Buffer.from(response.data, 'base64');
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== frame.width || height !== frame.height) {
    throw new Error(`Screenshot dimensions disagree with the actual panel iframe: ${width}x${height}.`);
  }
  fs.writeFileSync(path.join(output, `${name}.png`), image);
  return crypto.createHash('sha256').update(image).digest('hex');
}

async function main() {
  const output = requireOutputDirectory();
  const executable = process.env.EDGE_BIN || process.env.CHROME_BIN || findBrowserExecutable();
  if (!executable || !fs.existsSync(executable)) throw new Error('No Edge or Chromium executable was found.');
  const session = await openExtension(executable);
  const captures = [];
  const baseline = {};
  try {
    for (const direction of directions) {
      for (const theme of themes) {
        const prepared = await inPanel(session.panel, preparePanel, theme);
        if (prepared.theme !== theme || prepared.language !== 'en') {
          throw new Error(`Theme or language selection failed: ${JSON.stringify(prepared)}`);
        }
        await delay(350);
        if (direction === 'baseline' && theme === 'light') {
          let available = false;
          for (let attempt = 0; attempt < 80 && !available; attempt += 1) {
            available = await evaluate(
              session.panel,
              "Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === 'Explore sample capture')",
            );
            if (!available) await delay(100);
          }
          if (!available) throw new Error('The real DevTools-only synthetic sample action never appeared.');
          const sample = await inPanel(session.panel, activateSample);
          if (JSON.stringify(sample.signatures) !== JSON.stringify(expectedRows) ||
            !sample.selected || !sample.sampleActive) {
            throw new Error(`The fixture must be GET 200 / POST 503 / GET 304, with 503 selected: ${JSON.stringify(sample)}`);
          }
        }
        for (const size of dimensions) {
          const frame = await setViewport(session, size);
          const changed = await inPanel(session.panel, changeDirection, direction, stylesheet);
          if (changed.direction !== direction) throw new Error('The requested concept did not load.');
          const arrangement = await inPanel(session.panel, arrangeInspector, direction, size.width);
          if (arrangement.requestExpanded === arrangement.narrowPriority) {
            throw new Error(`The request inspector priority did not apply: ${JSON.stringify(arrangement)}`);
          }
          if (direction !== 'baseline') await keyboardCheck(session);
          if (direction === 'inspector') await inPanel(session.panel, augmentInspector);
          if (direction === 'baseline') baseline[`${theme}-${size.name}`] = await inPanel(session.panel, inspectBaseline);
          await delay(300);
          await evaluate(session.panel, "document.querySelector('.topbar').scrollLeft = 0");
          if (direction === 'inspector' && size.width > 800) {
            const key = await evaluate(session.panel, `(() => {const rect=document.querySelector('#req-headers .kv .key').getBoundingClientRect();return {x:rect.x+10,y:rect.y+9}})()`);
            await session.ui.send('Input.dispatchMouseEvent', {
              type: 'mouseMoved', x: key.x + frame.x, y: key.y + frame.y, button: 'none',
            });
          } else {
            await session.ui.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: frame.x + 4, y: frame.y + 4, button: 'none' });
          }
          const name = `${direction}-${theme}-${size.name}`;
          const report = await inPanel(session.panel, auditVisiblePanel);
          report.name = name;
          report.keyboard = direction === 'baseline' ? null : { arrows: true, searchToggle: true };
          if (direction === 'inspector' && size.width > 800) {
            report.hoverCopyVisible = await evaluate(
              session.panel,
              "parseFloat(getComputedStyle(document.querySelector('#req-headers .kv-copy-btn')).opacity) === 1",
            );
          }
          report.consoleErrors = session.errors.slice();
          report.iframe = frame;
          report.pngSha256 = await capture(session, frame, output, name);
          captures.push(report);
          console.log(`${name}: ${frame.width}x${frame.height}, text ${report.text.minimum}:1, ` +
            `border ${report.borders.minimum}:1, root overflow ${report.rootOverflow}px, ` +
            `focus ${report.focus.length}, console errors ${report.consoleErrors.length}`);
        }
      }
    }
    const failures = captures.flatMap((report) => {
      const problems = [];
      if (report.text.failures.length) problems.push(`text ${JSON.stringify(report.text.failures)}`);
      if (report.borders.failures.length) problems.push(`borders ${JSON.stringify(report.borders.failures)}`);
      if (report.focus.some((entry) => !entry.visible || entry.width < 2 || entry.ratio < 3)) {
        problems.push(`focus ${JSON.stringify(report.focus.filter((entry) => !entry.visible || entry.width < 2 || entry.ratio < 3))}`);
      }
      if (report.rootOverflow > 0) problems.push(`root overflow ${report.rootOverflow}px`);
      if (report.toolbarScroll > 0) problems.push(`toolbar scrolled ${report.toolbarScroll}px`);
      if (report.rowHeights.some((height) => height < 24 || height > 27)) problems.push(`row height ${report.rowHeights}`);
      if (report.runningAnimations || !report.reducedMotion) problems.push('reduced motion');
      if (report.consoleErrors.length) problems.push(`console errors ${report.consoleErrors.join(' | ')}`);
      if (report.unsupportedBackgrounds.length) problems.push(`unmeasured image backgrounds ${report.unsupportedBackgrounds}`);
      if (!report.devtoolsNetwork || !report.sample || report.selectedStatus !== '503') problems.push('panel fixture');
      if (report.name.startsWith('inspector-') &&
        (!report.previewVisible || !report.hoverCopyVisible && report.viewport[0] > 800)) {
        problems.push('response preview or functional hover-copy affordance not visible');
      }
      if (report.name.startsWith('triage-') &&
        (!report.timingVisible || report.headers.includes('ID') || report.headers.includes('Domain') ||
          report.tableOverflow > 1)) {
        problems.push(`triage rail lost its Method/Status/Path priority: ${JSON.stringify(report.headers)}`);
      }
      return problems.map((problem) => `${report.name}: ${problem}`);
    });
    for (const theme of themes) {
      for (const size of dimensions) {
        const hashes = captures.filter((report) => report.name.endsWith(`${theme}-${size.name}`) &&
          !report.name.startsWith('baseline-')).map((report) => report.pngSha256);
        if (new Set(hashes).size !== 3) failures.push(`${theme}-${size.name}: three directions rendered identically`);
      }
    }
    fs.writeFileSync(
      path.join(output, 'report.json'),
      JSON.stringify({ browser: executable, extension: session.identity, baseline, captures, failures }, null, 2) + '\n',
    );
    if (failures.length) throw new Error(`Design checks failed:\n${failures.join('\n')}`);
    console.log('PASS: 12 concept captures and 4 main baselines came from the loaded Edge DevTools extension.');
    console.log(`Audit report: ${path.join(output, 'report.json')}`);
  } finally {
    await session.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
