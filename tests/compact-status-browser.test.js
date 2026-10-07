const { delay, evaluate, findBrowserExecutable, launchPanelPage } = require('./helpers/browser-harness');

const executable = findBrowserExecutable();
const runningInCi =
  process.env.GITHUB_ACTIONS === 'true' || Boolean(process.env.CI && process.env.CI.toLowerCase() !== 'false');
if (!executable && runningInCi) {
  throw new Error('Compact status UI checks require an executable Chrome or Edge in CI.');
}
const browserTest = executable ? test : test.skip;
const themes = [
  { name: 'system light', choice: null, system: 'light' },
  { name: 'system dark', choice: null, system: 'dark' },
  { name: 'forced light', choice: 'light', system: 'dark' },
  { name: 'forced dark', choice: 'dark', system: 'light' },
];

async function setTheme(cdp, { choice, system }) {
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: system },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await evaluate(
    cdp,
    choice
      ? `document.documentElement.setAttribute('data-theme', ${JSON.stringify(choice)}); true`
      : "document.documentElement.removeAttribute('data-theme'); true",
  );
  await delay(220);
}

async function loadSample(cdp) {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    ready = await evaluate(cdp, "!!document.querySelector('.empty-state-action')");
    if (!ready) await delay(100);
  }
  if (!ready) throw new Error('The local synthetic sample action did not appear.');
  const loaded = await evaluate(
    cdp,
    `(() => {
      document.querySelector('.empty-state-action').click();
      const rows = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'));
      const errorRow = rows.find((row) => row.querySelector('.status-cell')?.textContent === '503');
      if (!errorRow || rows.length !== 3) return false;
      errorRow.click();
      return true;
    })()`,
  );
  if (!loaded) throw new Error('The three-request synthetic capture did not load its 503 request.');
  await delay(150);
  const selected = await evaluate(
    cdp,
    "document.querySelector('tr.status-5xx')?.getAttribute('aria-selected') === 'true'",
  );
  if (!selected) throw new Error('The synthetic 503 request did not become selected.');
}

function measuredSignals() {
  const rgba = (value) => {
    const parts = value.match(/[\d.]+/g);
    if (!parts || parts.length < 3) throw new Error(`Unsupported computed color ${value}`);
    return [Number(parts[0]), Number(parts[1]), Number(parts[2]), parts[3] === undefined ? 1 : Number(parts[3])];
  };
  const over = (front, back) => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    return [
      ...[0, 1, 2].map((channel) =>
        alpha ? (front[channel] * front[3] + back[channel] * back[3] * (1 - front[3])) / alpha : 0,
      ),
      alpha,
    ];
  };
  const background = (element) => {
    let paint = [0, 0, 0, 0];
    for (let parent = element; parent; parent = parent.parentElement) {
      paint = over(paint, rgba(document.defaultView.getComputedStyle(parent).backgroundColor));
      if (paint[3] === 1) break;
    }
    return over(paint, [255, 255, 255, 1]);
  };
  const luminance = (color) => {
    const linear = color.slice(0, 3).map((part) => {
      const srgb = part / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const ratio = (first, second) => {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const contrast = (selector) => {
    const element = document.querySelector(selector);
    if (!element || !element.getClientRects().length) throw new Error(`Missing visible target ${selector}`);
    const css = document.defaultView.getComputedStyle(element);
    return {
      selector,
      text: ratio(rgba(css.color), background(element)),
      border: ratio(rgba(css.borderTopColor), background(element)),
    };
  };
  const rows = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'));
  const header = document.querySelector('.title-row th');
  const selected = rows.find((row) => row.getAttribute('aria-selected') === 'true');
  const response = document.querySelector('.details-summary-status');
  const focus = document.querySelector('#filterBtn');
  focus.focus();
  const focusCss = document.defaultView.getComputedStyle(focus);
  return {
    signals: [
      contrast('tr.status-3xx .status-badge'),
      contrast('tr.status-5xx .status-badge'),
      contrast('tr.status-2xx .status-cell'),
      contrast('.details-summary-status--5xx'),
      contrast('#req-headers .kv .val'),
    ],
    labels: rows.map((row) => ({
      status: row.querySelector('.status-cell').textContent,
      badge: row.querySelector('.status-badge')?.textContent ?? null,
    })),
    marker: document.defaultView.getComputedStyle(response, '::before').width,
    selectedCount: rows.filter((row) => row.getAttribute('aria-selected') === 'true').length,
    selectedStatus: selected?.querySelector('.status-cell').textContent,
    rowHeights: rows.map((row) => row.getBoundingClientRect().height),
    headerHeight: header.getBoundingClientRect().height,
    headerPadding: document.defaultView.getComputedStyle(header).paddingTop,
    focusVisible: focus.matches(':focus-visible'),
    focusWidth: focusCss.outlineWidth,
    focusContrast: ratio(rgba(focusCss.outlineColor), background(focus)),
    controlBoundary: contrast('#filterBtn').border,
    rootWidth: document.documentElement.scrollWidth,
    detailsWidth: document.getElementById('details').getBoundingClientRect().width,
    detailsDirection: document.defaultView.getComputedStyle(document.getElementById('content')).flexDirection,
    reducedMotion: document.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

browserTest(
  'status cues keep the original dense geometry, semantic contrast, and focus from 320 to 1280px',
  async () => {
    const page = await launchPanelPage({
      executable,
      width: 1440,
      height: 800,
      initScript: "localStorage.setItem('networkPlus.lang', 'en');",
    });
    try {
      for (const theme of themes) {
        await setTheme(page.cdp, theme);
        const empty = await evaluate(
          page.cdp,
          `(() => {
            const icon = document.querySelector('.empty-state .icon');
            const css = getComputedStyle(icon);
            return { width: icon.getBoundingClientRect().width, border: css.borderTopWidth,
              opacity: css.opacity, color: css.borderTopColor };
          })()`,
        );
        expect({ theme: theme.name, empty }).toMatchObject({
          empty: { width: 52, border: '1px', opacity: '1' },
        });
      }

      await loadSample(page.cdp);
      for (const theme of themes) {
        await setTheme(page.cdp, theme);
        for (const width of [320, 375, 414, 600, 768, 800, 801, 1280]) {
          await page.cdp.send('Emulation.setDeviceMetricsOverride', {
            width,
            height: 800,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await page.cdp.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Tab',
            code: 'Tab',
            windowsVirtualKeyCode: 9,
          });
          await page.cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Tab',
            code: 'Tab',
            windowsVirtualKeyCode: 9,
          });
          const result = await evaluate(page.cdp, `(${measuredSignals.toString()})()`);
          expect(result.labels).toEqual([
            { status: '200', badge: null },
            { status: '503', badge: '503' },
            { status: '304', badge: '304' },
          ]);
          expect(result.selectedStatus).toBe('503');
          expect(result.selectedCount).toBe(1);
          expect(result.marker).toBe('5px');
          expect(result.rowHeights.every((height) => height >= 25 && height <= 26)).toBe(true);
          expect(result.headerPadding).toBe('7px');
          expect(result.headerHeight).toBeLessThan(31);
          expect(result.rootWidth).toBeLessThanOrEqual(width);
          expect(result.detailsWidth).toBeLessThanOrEqual(width);
          expect(result.detailsDirection).toBe(width <= 800 ? 'column' : 'row');
          expect(result.focusVisible).toBe(true);
          expect(result.focusWidth).toBe('2px');
          expect(result.focusContrast).toBeGreaterThanOrEqual(3);
          expect(result.controlBoundary).toBeGreaterThanOrEqual(3);
          expect(result.reducedMotion).toBe(true);
          for (const item of result.signals) {
            expect({ theme: theme.name, width, item }).toEqual(
              expect.objectContaining({ item: expect.objectContaining({ text: expect.any(Number) }) }),
            );
            expect(item.text).toBeGreaterThanOrEqual(4.5);
            if (item.selector.includes('.status-badge')) expect(item.border).toBeGreaterThanOrEqual(3);
          }
        }
      }
    } finally {
      await page.close();
    }
  },
  120000,
);
