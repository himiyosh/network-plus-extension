const {
  delay,
  evaluate,
  findBrowserExecutable,
  launchPanelPage,
} = require('./helpers/browser-harness');

const executable = findBrowserExecutable();
const runningInCi =
  process.env.GITHUB_ACTIONS === 'true' || Boolean(process.env.CI && process.env.CI.toLowerCase() !== 'false');
if (!executable && runningInCi) {
  throw new Error('Visual clarity checks require an executable Chrome or Edge in CI.');
}
const browserTest = executable ? test : test.skip;

const themeCases = [
  { name: 'system light', theme: null, media: 'light', scheme: 'light' },
  { name: 'system dark', theme: null, media: 'dark', scheme: 'dark' },
  { name: 'forced light on dark system', theme: 'light', media: 'dark', scheme: 'light' },
  { name: 'forced dark on light system', theme: 'dark', media: 'light', scheme: 'dark' },
];

async function setTheme(cdp, { theme, media }) {
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: media },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await evaluate(
    cdp,
    theme
      ? `document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)}); true`
      : "document.documentElement.removeAttribute('data-theme'); true",
  );
  await delay(220);
}

async function loadSample(cdp) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, "!!document.querySelector('.empty-state-action')")) break;
    await delay(100);
  }
  const loaded = await evaluate(
    cdp,
    `(() => {
      const action = document.querySelector('.empty-state-action');
      if (!action) return false;
      action.click();
      const row = Array.from(document.querySelectorAll('#tbody tr[data-row-id]'))
        .find((item) => item.textContent.includes('503'));
      if (!row) return false;
      row.click();
      return document.querySelectorAll('#tbody tr[data-row-id]').length === 3;
    })()`,
  );
  if (!loaded) throw new Error('The local synthetic capture did not load all three requests.');
  await delay(150);
}

function measureContrast(selectors) {
  const rgba = (value) => {
    const channels = value.match(/[\d.]+/g).map(Number);
    return [channels[0], channels[1], channels[2], channels[3] ?? 1];
  };
  const over = (front, back) => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (alpha === 0) return [0, 0, 0, 0];
    return [
      ...[0, 1, 2].map(
        (channel) => (front[channel] * front[3] + back[channel] * back[3] * (1 - front[3])) / alpha,
      ),
      alpha,
    ];
  };
  const luminance = (color) => {
    const linear = color.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  return selectors.map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing contrast target: ${selector}`);
    if (!element.getClientRects().length) throw new Error(`Hidden contrast target: ${selector}`);
    const foreground = rgba(document.defaultView.getComputedStyle(element).color);
    let background = [0, 0, 0, 0];
    for (let parent = element; parent; parent = parent.parentElement) {
      background = over(background, rgba(document.defaultView.getComputedStyle(parent).backgroundColor));
      if (background[3] >= 1) break;
    }
    background = over(background, [255, 255, 255, 1]);
    const ink = luminance(foreground);
    const ground = luminance(background);
    return {
      selector,
      ratio: (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05),
      foreground: foreground.slice(0, 3).map(Math.round),
      background: background.slice(0, 3).map(Math.round),
    };
  });
}

async function assertContrast(cdp, selectors, label) {
  const measurements = await evaluate(
    cdp,
    `(${measureContrast.toString()})(${JSON.stringify(selectors)})`,
  );
  for (const { selector, ratio, foreground, background } of measurements) {
    if (!Number.isFinite(ratio) || ratio < 4.5) {
      throw new Error(
        `${label}: ${selector} contrast ${ratio.toFixed(2)}:1 < 4.5:1 (${foreground} on ${background})`,
      );
    }
  }
  return measurements;
}

browserTest(
  'the empty state and populated workbench maintain 4.5:1 text contrast in all theme modes',
  async () => {
    const page = await launchPanelPage({
      executable,
      width: 1440,
      height: 800,
      initScript: "localStorage.setItem('networkPlus.lang', 'en');",
    });
    try {
      for (const theme of themeCases) {
        await setTheme(page.cdp, theme);
        expect(await evaluate(page.cdp, 'getComputedStyle(document.documentElement).colorScheme')).toBe(
          theme.scheme,
        );
        await assertContrast(
          page.cdp,
          ['.empty-state-title', '.empty-state-description', '.empty-state-action', '#filterBtn'],
          theme.name,
        );
      }

      await loadSample(page.cdp);
      const workbenchText = [
        '#pauseBtn',
        '#filterBtn',
        '.title-row th.sortable-header',
        '.grid tbody tr.selected td[data-col-id="id"]',
        '.grid tbody tr.selected td[data-col-id="domain"]',
        '.grid tbody tr.selected td[data-col-id="path"]',
        '.grid tbody tr.selected .status-cell',
        '.details-title-host',
        '.details-title-path',
        '.details-summary-item',
        '.inspector-label',
        '#req-tab-headers',
        '#req-headers .kv .key',
        '#req-headers .kv .val',
        '#statusText',
      ];
      for (const theme of themeCases) {
        await setTheme(page.cdp, theme);
        await assertContrast(page.cdp, workbenchText, theme.name);
        await evaluate(page.cdp, "document.getElementById('filterBtn').click(); true");
        await assertContrast(page.cdp, ['.filter-popup-header', '.filter-section-name'], theme.name);
        await evaluate(page.cdp, "document.getElementById('filterBtn').click(); true");
        await evaluate(page.cdp, "document.getElementById('searchToggleBtn').click(); true");
        await assertContrast(page.cdp, ['.search-add-btn', '.search-matches-only-label'], theme.name);
        await evaluate(page.cdp, "document.getElementById('searchToggleBtn').click(); true");
      }
    } finally {
      await page.close();
    }
  },
  90000,
);

browserTest(
  'narrow widths retain an accessible stacked inspector and visible keyboard focus',
  async () => {
    const page = await launchPanelPage({
      executable,
      width: 1280,
      height: 700,
      initScript: "localStorage.setItem('networkPlus.lang', 'en');",
    });
    try {
      await loadSample(page.cdp);
      for (const width of [320, 375, 414, 600, 768, 800, 801, 1280]) {
        await page.cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 700,
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
        const observed = await evaluate(
          page.cdp,
          `(() => {
            const details = document.getElementById('details');
            const rect = details.getBoundingClientRect();
            document.getElementById('filterBtn').focus();
            return {
              rootWidth: document.documentElement.scrollWidth,
              detailsLeft: rect.left,
              detailsRight: rect.right,
              direction: getComputedStyle(document.getElementById('content')).flexDirection,
              focused: document.activeElement.id,
              focusVisible: document.activeElement.matches(':focus-visible'),
              outline: getComputedStyle(document.activeElement).outlineWidth,
              selected: document.querySelectorAll('#tbody tr.selected').length,
            };
          })()`,
        );
        expect({ width, observed }).toEqual(
          expect.objectContaining({
            observed: expect.objectContaining({
              focused: 'filterBtn',
              focusVisible: true,
              outline: '2px',
              selected: 1,
            }),
          }),
        );
        expect(observed.rootWidth).toBeLessThanOrEqual(width);
        if (width <= 800) {
          expect(observed.direction).toBe('column');
          expect(observed.detailsLeft).toBeGreaterThanOrEqual(0);
          expect(observed.detailsRight).toBeLessThanOrEqual(width);
        } else {
          expect(observed.direction).toBe('row');
        }
      }
    } finally {
      await page.close();
    }
  },
  90000,
);
