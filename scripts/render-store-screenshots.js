#!/usr/bin/env node
// Regenerates the four store screenshots in docs/store-assets from the CURRENT
// panel, so a UI change can be reflected without reverse-engineering the images.
//
// Each screenshot is a designed composition: a numbered eyebrow, a white headline,
// the mascot, and a gradient-ring frame on a starfield. That template is kept
// byte-for-byte from the committed PNG; only the panel interior — the rounded
// rectangle inside the ring — is replaced with a live capture of the panel running
// its built-in local sample capture. Every pixel outside that rectangle is copied
// unchanged, so the design cannot drift through regeneration.
//
// Usage: CHROME_BIN=/path/to/chrome npm run store:screenshots
//
// The panel typeface follows the machine that renders it. The committed images were
// rendered on macOS; rendering on Linux changes the panel's text to its fallback face.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'docs', 'store-assets');

// Measured on the committed template: the ring's outer box is (8,96)-(1271,763) with
// a 14px radius and a 2px stroke, so the panel interior is (10,98) 1260x664, radius 12.
const INNER = Object.freeze({ x: 10, y: 98, width: 1260, height: 664, radius: 12 });
const CANVAS = Object.freeze({ width: 1280, height: 800 });

// Headless Chrome does not advance the animation clock while no frame is requested,
// so the panel's 150ms tab crossfade was captured at its start: the DOM had Timing
// active while the pixels still painted Headers. Transitions are off while capturing.
const NO_TRANSITIONS =
  "document.addEventListener('DOMContentLoaded', () => {" +
  " const style = document.createElement('style');" +
  " style.textContent = '*,*::before,*::after{transition:none !important}';" +
  ' document.head.appendChild(style); });';

// The toolbar mascot bobs, blinks and steams, so two captures of the same state
// differed in the pixels those animations cover. The panel's reduced-motion design is
// its own still frame — the mascot at rest, the steam at a fixed opacity — and is what
// the screenshots show. A capture is refused while any animation is still running.
const REDUCED_MOTION = Object.freeze({ features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const SCREENSHOTS = Object.freeze([
  Object.freeze({
    file: 'screenshot-1-request-detail-1280x800.png',
    verifyTab: true,
    steps: Object.freeze({ before: [], after: [{ click: 'res-tab-headers' }] }),
  }),
  Object.freeze({
    file: 'screenshot-2-timing-guidance-1280x800.png',
    verifyTab: true,
    // The phase guidance needs the height the request half holds. The half is
    // collapsed before the sample loads — the choice persists — so the status bar
    // reads the sample capture's sentence, as in the other three shots.
    steps: Object.freeze({
      before: [{ click: 'inspector-request-toggle' }],
      after: [{ click: 'res-tab-timing' }, { openTimingGuide: true }],
    }),
  }),
  Object.freeze({
    file: 'screenshot-3-sample-guide-1280x800.png',
    // A dialog dims the tab bar behind its backdrop, so the painted-tab check is
    // reserved for the two shots whose bar is unobscured.
    verifyTab: false,
    steps: Object.freeze({ before: [], after: [{ click: 'res-tab-timing' }, { clickText: 'Sample guide' }] }),
  }),
  Object.freeze({
    file: 'screenshot-4-sanitized-export-1280x800.png',
    verifyTab: false,
    steps: Object.freeze({ before: [], after: [{ click: 'res-tab-timing' }, { click: 'exportHarBtn' }] }),
  }),
]);

function loadHarness() {
  return require(path.join(ROOT, 'tests', 'helpers', 'browser-harness.js'));
}

async function settle(evaluate, cdp) {
  await evaluate(
    cdp,
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))',
    true,
  );
}

async function runStep(harness, cdp, step) {
  const { evaluate, delay } = harness;
  if (step.click) {
    const found = await evaluate(
      cdp,
      `(() => { const el = document.getElementById(${JSON.stringify(step.click)}); if (!el) return false; el.click(); return true; })()`,
    );
    if (!found) throw new Error(`element not found: #${step.click}`);
  } else if (step.clickText) {
    const found = await evaluate(
      cdp,
      `(() => { const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(step.clickText)}); if (!el) return false; el.click(); return true; })()`,
    );
    if (!found) throw new Error(`control not found: ${step.clickText}`);
    await delay(400);
  } else if (step.openTimingGuide) {
    const found = await evaluate(
      cdp,
      "(() => { const d = document.querySelector('#res-timing details.timing-guidance'); if (!d) return false; d.open = true; return true; })()",
    );
    if (!found) throw new Error('the timing guidance disclosure was not found');
  } else {
    throw new Error(`unknown step: ${JSON.stringify(step)}`);
  }
  await settle(evaluate, cdp);
}

async function openSampleCapture(harness, cdp) {
  const { evaluate, delay } = harness;
  let ready = false;
  for (let attempt = 0; attempt < 80 && !ready; attempt += 1) {
    await delay(120);
    ready = await evaluate(
      cdp,
      "Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Explore sample capture')",
    );
  }
  if (!ready) throw new Error('the sample capture action never appeared');
  await runStep(harness, cdp, { clickText: 'Explore sample capture' });
  // The 503 row is the one every screenshot selects.
  const picked = await evaluate(
    cdp,
    "(() => { const tr = Array.from(document.querySelectorAll('#tbody tr[data-row-id]')).find((r) => r.textContent.includes('503')); if (!tr) return false; tr.click(); return true; })()",
  );
  if (!picked) throw new Error('the 503 sample row was not found');
  await settle(evaluate, cdp);
}

// A still image of a live panel is accepted only when the response tab the pixels
// paint as active is the one the DOM marks active.
async function assertPaintedTabMatchesDom(evaluate, cdp, pngBase64) {
  const dom = await evaluate(
    cdp,
    `(() => {
      const bar = document.getElementById('res-tab-bar');
      const active = bar.querySelector('.tab-btn.active');
      const at = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + 5), Math.round(r.top + 4)]; };
      return { id: active.id, active: at(active), others: Array.from(bar.querySelectorAll('.tab-btn:not(.active)')).map(at) };
    })()`,
  );
  const verdict = await evaluate(
    cdp,
    `(async () => {
      const image = new Image(); image.src = 'data:image/png;base64,${pngBase64}'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const g = canvas.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
      const lum = ([x, y]) => { const d = g.getImageData(x, y, 1, 1).data; return d[0] + d[1] + d[2]; };
      return { active: lum(${JSON.stringify(dom.active)}), brightestOther: Math.max(...${JSON.stringify(dom.others)}.map(lum)) };
    })()`,
    true,
  );
  if (!(verdict.active > verdict.brightestOther + 20)) {
    throw new Error(`painted tab disagrees with the DOM (#${dom.id} is active): ${JSON.stringify(verdict)}`);
  }
}

async function capturePanel(harness, screenshot) {
  const { launchPanelPage, evaluate } = harness;
  const page = await launchPanelPage({
    executable: process.env.CHROME_BIN,
    width: INNER.width,
    height: INNER.height,
    initScript:
      "localStorage.setItem('networkPlus.theme','dark');localStorage.setItem('networkPlus.lang','en');" +
      NO_TRANSITIONS,
  });
  const { cdp } = page;
  try {
    await cdp.send('Emulation.setEmulatedMedia', REDUCED_MOTION);
    for (const step of screenshot.steps.before) await runStep(harness, cdp, step);
    await openSampleCapture(harness, cdp);
    for (const step of screenshot.steps.after) await runStep(harness, cdp, step);
    const running = await evaluate(
      cdp,
      "document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.transitionProperty || a.constructor.name)",
    );
    if (running.length > 0) throw new Error(`animations still running at capture: ${running.join(', ')}`);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    if (screenshot.verifyTab) await assertPaintedTabMatchesDom(evaluate, cdp, data);
    return data;
  } finally {
    await page.close();
  }
}

// Composes the capture into the template and returns the PNG. A pixel is replaced
// exactly when its centre lies inside the panel interior and is kept byte-for-byte
// otherwise. An anti-aliased clip would blend the corner pixels with whatever the
// template already held there — the previous capture — so every rerun would shift
// them; with a hard mask a rerun replaces the same pixels with the same capture.
async function compose(harness, templateBase64, panelBase64) {
  const { launchPanelPage, evaluate } = harness;
  const page = await launchPanelPage({ executable: process.env.CHROME_BIN, width: 400, height: 300 });
  const { cdp } = page;
  try {
    return await evaluate(
      cdp,
      `(async () => {
        const INNER = ${JSON.stringify(INNER)};
        const pixels = async (b64, width, height, label) => {
          const image = new Image(); image.src = 'data:image/png;base64,' + b64; await image.decode();
          if (image.naturalWidth !== width || image.naturalHeight !== height) {
            throw new Error(label + ' is ' + image.naturalWidth + 'x' + image.naturalHeight + ', expected ' + width + 'x' + height);
          }
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const g = canvas.getContext('2d', { willReadFrequently: true }); g.drawImage(image, 0, 0);
          return { canvas, g, image: g.getImageData(0, 0, width, height) };
        };
        const out = await pixels(${JSON.stringify(templateBase64)}, ${CANVAS.width}, ${CANVAS.height}, 'template');
        const panel = (await pixels(${JSON.stringify(panelBase64)}, INNER.width, INNER.height, 'panel capture')).image.data;
        const data = out.image.data;
        // Signed distance from a pixel centre to the inner rounded rectangle.
        const outsideBy = (px, py) => {
          const x = px + 0.5, y = py + 0.5;
          const qx = Math.abs(x - (INNER.x + INNER.width / 2)) - (INNER.width / 2 - INNER.radius);
          const qy = Math.abs(y - (INNER.y + INNER.height / 2)) - (INNER.height / 2 - INNER.radius);
          return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - INNER.radius;
        };
        for (let y = INNER.y; y < INNER.y + INNER.height; y++) {
          for (let x = INNER.x; x < INNER.x + INNER.width; x++) {
            if (outsideBy(x, y) >= 0) continue;
            const to = (y * ${CANVAS.width} + x) * 4;
            const from = ((y - INNER.y) * INNER.width + (x - INNER.x)) * 4;
            data[to] = panel[from]; data[to + 1] = panel[from + 1]; data[to + 2] = panel[from + 2]; data[to + 3] = 255;
          }
        }
        out.g.putImageData(out.image, 0, 0);
        return out.canvas.toDataURL('image/png').split(',')[1];
      })()`,
      true,
    );
  } finally {
    await page.close();
  }
}

async function main() {
  if (!process.env.CHROME_BIN) {
    throw new Error('Set CHROME_BIN to a Chrome or Chromium executable to render the store screenshots.');
  }
  const harness = loadHarness();
  for (const screenshot of SCREENSHOTS) {
    const target = path.join(ASSET_DIR, screenshot.file);
    const template = fs.readFileSync(target).toString('base64');
    const panel = await capturePanel(harness, screenshot);
    const composed = await compose(harness, template, panel);
    fs.writeFileSync(target, Buffer.from(composed, 'base64'));
    console.log(`rendered ${path.relative(ROOT, target)}`);
  }
}

module.exports = { CANVAS, INNER, SCREENSHOTS };

if (require.main === module) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
