const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'panel.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'panel.js'), 'utf8');
const testSources = fs
  .readdirSync(__dirname)
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => fs.readFileSync(path.join(__dirname, name), 'utf8'))
  .join('\n');

const getBlock = (pattern) => {
  const match = css.match(pattern);
  expect(match).not.toBeNull();
  return match[1];
};

const getUniqueCssRuleBlock = (selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(css.matchAll(new RegExp(`^\\s*${escapedSelector}\\{([^}]*)}`, 'gm')));
  expect(matches).toHaveLength(1);
  return matches[0][1];
};

const parseTokens = (block) =>
  Object.fromEntries(Array.from(block.matchAll(/--([a-z0-9-]+):([^;}]*)/g), (match) => [match[1], match[2].trim()]));

const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
};

const relativeLuminance = (hex) => {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (foreground, background) => {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

const light = parseTokens(getBlock(/\/\* --- Light Theme --- \*\/\s*:root\{([^}]*)\}/s));
const systemDark = parseTokens(getBlock(/@media \(prefers-color-scheme: dark\)\{:root\{([^}]*)\}\}/s));
const forcedDark = parseTokens(getBlock(/html\[data-theme="dark"\]\{([^}]*)\}/s));
const forcedLight = parseTokens(getBlock(/html\[data-theme="light"\]\{([^}]*)\}/s));

const semanticTextTokens = [
  'text-muted',
  'text-accent',
  'status-2xx-text',
  'status-3xx-text',
  'status-4xx-text',
  'status-5xx-text',
  'dur-ok-text',
  'dur-med-text',
  'dur-slow-text',
];
const searchColorTokens = [
  'search-yellow',
  'search-red',
  'search-green',
  'search-blue',
  'search-purple',
  'search-orange',
];
const nonTextContrastTokens = ['control-border', 'separator'];
const SEPARATOR_FOCUS_CASCADE_CONTRACT = 'workbench separator focus cascade';
const LIVE_COMMIT_BOUNDARIES = [
  {
    label: 'Export HAR',
    startMarker: "$('#exportHarBtn').addEventListener('click'",
    endMarker: '// Column settings menu and filter dialog',
    requiredPattern: /commitPendingLiveRows\(\);[\s\S]*openExportSafetyDialog\(/,
    diagnostic: 'Export HAR must commit pending live rows before openExportSafetyDialog.',
  },
  {
    label: 'Keep Selected',
    startMarker: "createRowMenuButton('Keep Selected (",
    endMarker: "createRowMenuButton('Delete Selected (",
    requiredPattern: /commitPendingLiveRows\(\);[\s\S]*removeRowsFromState\(/,
    diagnostic: 'Keep Selected must commit pending live rows before removeRowsFromState.',
  },
  {
    label: 'Delete Selected',
    startMarker: "createRowMenuButton('Delete Selected (",
    endMarker: 'showAccessiblePopupAt(contextMenu',
    requiredPattern: /commitPendingLiveRows\(\);[\s\S]*removeRowsFromState\(/,
    diagnostic: 'Delete Selected must commit pending live rows before removeRowsFromState.',
  },
];

const getLiveCommitBoundarySlice = (source, boundary) => {
  const start = source.indexOf(boundary.startMarker);
  const end = source.indexOf(boundary.endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`${boundary.label} live commit boundary markers are missing or out of order.`);
  }
  return { block: source.slice(start, end), end, start };
};

const assertLiveCommitBoundary = (source, boundary) => {
  const { block } = getLiveCommitBoundarySlice(source, boundary);
  if (!boundary.requiredPattern.test(block)) throw new Error(boundary.diagnostic);
};

const assertLiveCommitFallbackContract = (source) => {
  if (!source.includes('const LIVE_COMMIT_MAX_WAIT_MS = 250;')) {
    throw new Error('Live commit fallback must keep one named 250ms maximum wait.');
  }
  if (!source.includes('const LIVE_PENDING_HIGH_WATER_MARK = 5000;')) {
    throw new Error('Live commit scheduling must keep one named 5,000-row pending high-water.');
  }
  if (!source.includes('let pendingLiveCommitTimer = null;')) {
    throw new Error('Live commit fallback must keep one shared timer handle.');
  }

  const cancelStart = source.indexOf('function cancelPendingLiveCommitTimer');
  const armStart = source.indexOf('function armPendingLiveCommitTimer');
  const commitStart = source.indexOf('function commitPendingLiveRows');
  const commitEnd = source.indexOf('function recordSkippedImportRows', commitStart);
  const scheduleStart = source.indexOf('const scheduleLiveRows =');
  const scheduleEnd = source.indexOf('if (chrome && chrome.devtools', scheduleStart);
  if (
    cancelStart < 0 ||
    armStart <= cancelStart ||
    commitStart <= armStart ||
    commitEnd <= commitStart ||
    scheduleStart < 0 ||
    scheduleEnd <= scheduleStart
  ) {
    throw new Error('Live commit fallback functions are missing or out of order.');
  }

  const cancelBlock = source.slice(cancelStart, armStart);
  const armBlock = source.slice(armStart, commitStart);
  const commitBlock = source.slice(commitStart, commitEnd);
  const scheduleBlock = source.slice(scheduleStart, scheduleEnd);
  const cancelGuard = 'if (pendingLiveCommitTimer === null) return;';
  const clearTimer = 'clearTimeout(pendingLiveCommitTimer);';
  const clearHandle = 'pendingLiveCommitTimer = null;';
  if (!cancelBlock.includes(cancelGuard) || !cancelBlock.includes(clearTimer)) {
    throw new Error('Live commit fallback cancellation must guard and clear the shared timer.');
  }
  if (cancelBlock.indexOf(clearTimer) > cancelBlock.indexOf(clearHandle)) {
    throw new Error('Live commit fallback cancellation must clear the timer before its handle.');
  }

  const armGuard = 'if (pendingLiveCommitTimer !== null) return;';
  const setTimer = 'pendingLiveCommitTimer = setTimeout(() => {';
  const callbackCommit = 'commitPendingLiveRows();';
  if (!armBlock.includes(armGuard) || !armBlock.includes(setTimer)) {
    throw new Error('Live commit fallback must coalesce requests behind one armed timer.');
  }
  if (!armBlock.includes('}, LIVE_COMMIT_MAX_WAIT_MS);')) {
    throw new Error('Live commit fallback must use the named maximum wait.');
  }
  if (armBlock.indexOf(armGuard) > armBlock.indexOf(setTimer)) {
    throw new Error('Live commit fallback must guard before arming its timer.');
  }
  if (
    armBlock.indexOf(clearHandle) < armBlock.indexOf(setTimer) ||
    armBlock.indexOf(clearHandle) > armBlock.indexOf(callbackCommit)
  ) {
    throw new Error('Live commit fallback callback must clear its handle before committing.');
  }

  const cancelCommit = 'cancelPendingLiveCommitTimer();';
  const takePendingRows = 'state.pendingLiveRows.splice(0, state.pendingLiveRows.length)';
  if (
    !commitBlock.includes(cancelCommit) ||
    commitBlock.indexOf(cancelCommit) > commitBlock.indexOf(takePendingRows)
  ) {
    throw new Error('Every live commit must cancel the fallback before taking pending rows.');
  }

  const armCommit = 'armPendingLiveCommitTimer();';
  const pendingFrameGuard = 'if (pendingLiveFrame) return;';
  const drainAwaitingRows = 'const liveRows = state.liveRowsAwaitingRender';
  const highWaterCommit =
    'if (pendingLiveRows.length >= LIVE_PENDING_HIGH_WATER_MARK) {\n' +
    '        commitPendingLiveRows();\n' +
    '      }';
  const armPendingBatch =
    'if (pendingLiveRows.length > 0) {\n' +
    '        armPendingLiveCommitTimer();\n' +
    '      }';
  if (!scheduleBlock.includes(highWaterCommit) || !scheduleBlock.includes(armPendingBatch)) {
    throw new Error('Live scheduling must independently flush high-water and arm max-wait batches.');
  }
  if (scheduleBlock.includes('state.rows.length + pendingLiveRows.length')) {
    throw new Error('Live high-water must not restore per-request flushing from retained row count.');
  }
  if (
    !scheduleBlock.includes(armCommit) ||
    scheduleBlock.indexOf(highWaterCommit) > scheduleBlock.indexOf(armPendingBatch) ||
    scheduleBlock.indexOf(armCommit) > scheduleBlock.indexOf(pendingFrameGuard)
  ) {
    throw new Error('Live scheduling must flush high-water before arming max-wait and coalescing the frame.');
  }
  const frameStart = scheduleBlock.indexOf('window.requestAnimationFrame(() => {');
  const frameBlock = scheduleBlock.slice(frameStart);
  if (
    frameStart < 0 ||
    frameBlock.indexOf(callbackCommit) < 0 ||
    frameBlock.indexOf(callbackCommit) > frameBlock.indexOf(drainAwaitingRows)
  ) {
    throw new Error('The delayed frame must commit and cancel fallback work before rendering.');
  }
};

const getOutlineSelectorRule = (source, selectorSuffix) => {
  const matches = Array.from(source.matchAll(/^([^@{}\n]+)\{([^{}]*)\}$/gm)).flatMap((match) =>
    match[1]
      .split(',')
      .map((selector) => selector.trim())
      .filter(
        (selector) =>
          selector.endsWith(selectorSuffix) &&
          match[2].includes('outline:') &&
          match[2].includes('outline-offset:'),
      )
      .map((selector) => ({
        declarations: match[2],
        index: match.index,
        selector,
      })),
  );
  if (matches.length !== 1) {
    throw new Error(
      `${SEPARATOR_FOCUS_CASCADE_CONTRACT}: expected exactly one outline rule ending in ${selectorSuffix}; received ${matches.length}.`,
    );
  }
  return matches[0];
};

const getSelectorSpecificity = (selector) => {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classLike = (
    selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) || []
  ).length;
  const types = (
    selector
      .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?|[>+~*]/g, ' ')
      .match(/\b[a-z][\w-]*\b/gi) || []
  ).length;
  return [ids, classLike, types];
};

const compareSpecificity = (left, right) => {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

const assertSeparatorFocusCascade = (source) => {
  const genericRule = getOutlineSelectorRule(source, '[tabindex]:focus-visible');
  if (!genericRule.declarations.includes('outline-offset:2px')) {
    throw new Error(
      `${SEPARATOR_FOCUS_CASCADE_CONTRACT}: the generic tabindex focus rule must retain its +2px offset.`,
    );
  }

  for (const selectorSuffix of ['.resizer:focus-visible', '.inspector-divider:focus-visible']) {
    const componentRule = getOutlineSelectorRule(source, selectorSuffix);
    if (
      !componentRule.declarations.includes('outline:2px solid var(--accent)') ||
      !componentRule.declarations.includes('outline-offset:-2px')
    ) {
      throw new Error(
        `${SEPARATOR_FOCUS_CASCADE_CONTRACT}: ${componentRule.selector} must declare the 2px solid inset outline.`,
      );
    }
    const componentSpecificity = getSelectorSpecificity(componentRule.selector);
    const genericSpecificity = getSelectorSpecificity(genericRule.selector);
    const comparison = compareSpecificity(componentSpecificity, genericSpecificity);
    if (comparison > 0 || (comparison === 0 && componentRule.index > genericRule.index)) continue;
    const componentSpecificityText = componentSpecificity.join('-');
    if (comparison === 0) {
      throw new Error(
        `${SEPARATOR_FOCUS_CASCADE_CONTRACT}: ${componentRule.selector} ties ${genericRule.selector} at specificity ${componentSpecificityText} and appears before the later generic rule, so its -2px outline offset loses to +2px.`,
      );
    }
    throw new Error(
      `${SEPARATOR_FOCUS_CASCADE_CONTRACT}: ${componentRule.selector} has lower specificity ${componentSpecificityText} than ${genericRule.selector}, so its -2px outline offset loses to +2px.`,
    );
  }
};


describe('accessible theme contract', () => {
  test('defines every text semantic token in all four theme locations', () => {
    for (const token of semanticTextTokens.concat(['accent-fill', 'on-accent'], searchColorTokens)) {
      for (const theme of [light, systemDark, forcedDark, forcedLight]) {
        expect(theme[token]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
    expect(forcedLight).toEqual(
      expect.objectContaining(Object.fromEntries(semanticTextTokens.map((token) => [token, light[token]]))),
    );
    expect(forcedDark).toEqual(
      expect.objectContaining(Object.fromEntries(semanticTextTokens.map((token) => [token, systemDark[token]]))),
    );
    for (const token of searchColorTokens) {
      expect(systemDark[token]).toBe(light[token]);
      expect(forcedDark[token]).toBe(light[token]);
      expect(forcedLight[token]).toBe(light[token]);
    }
  });

  test('defines non-text contrast tokens with four-theme parity', () => {
    for (const token of nonTextContrastTokens) {
      for (const theme of [light, systemDark, forcedDark, forcedLight]) {
        expect(theme[token]).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(forcedLight[token]).toBe(light[token]);
      expect(forcedDark[token]).toBe(systemDark[token]);
    }
  });

  test('keeps control and separator boundaries at WCAG non-text contrast', () => {
    for (const [themeName, theme] of [
      ['light', light],
      ['system dark', systemDark],
      ['forced dark', forcedDark],
      ['forced light', forcedLight],
    ]) {
      for (const token of nonTextContrastTokens) {
        for (const background of ['bg', 'surface', 'content-bg']) {
          const ratio = contrastRatio(theme[token], theme[background]);
          expect({ themeName, token, background, ratio }).toEqual(
            expect.objectContaining({ ratio: expect.any(Number) }),
          );
          expect(ratio).toBeGreaterThanOrEqual(3);
        }
      }
    }
    expect(css).toContain('border:1px solid var(--control-border)');
    expect(css).toContain('input[type="checkbox"]:not(:disabled){outline:1px solid var(--control-border)');
    expect(css).toContain('.resizer{flex:0 0 4px;cursor:col-resize;background:var(--separator)');
    expect(css).toContain('.inspector-divider{flex:0 0 3px;background:var(--separator)');
  });

  test('keeps representative small semantic text at WCAG AA contrast', () => {
    for (const [themeName, theme] of [
      ['light', light],
      ['dark', systemDark],
    ]) {
      for (const token of semanticTextTokens) {
        for (const background of ['bg', 'surface', 'content-bg']) {
          const ratio = contrastRatio(theme[token], theme[background]);
          expect({ themeName, token, background, ratio }).toEqual(
            expect.objectContaining({
              ratio: expect.any(Number),
            }),
          );
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrastRatio(theme['on-accent'], theme['accent-fill'])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('accessible workbench static contracts', () => {
  test('does not use gradient text or thick colored side borders for row states', () => {
    expect(css).not.toMatch(/background-clip\s*:\s*text|-webkit-text-fill-color/i);
    const stateRules = Array.from(
      css.matchAll(/\.(?:highlighted-row|search-match-row|search-row-\d|multi-selected)[^{]*\{([^}]*)\}/g),
    );
    expect(stateRules.length).toBeGreaterThan(0);
    for (const rule of stateRules) {
      expect(rule[1]).not.toMatch(/border-(?:left|right)\s*:\s*(?:[2-9]|\d{2,})px/i);
    }
    expect(css).toContain('.row-state-badge');
    expect(js).toContain('Matches search ');
    // Keyword badges are visible now: a row can match several keywords while
    // the tint can only carry the first, so the badges are the only thing that
    // answers which ones a row hit. One chip per keyword, in its own colour.
    expect(js).toContain("badge.classList.add('row-state-badge--kw' + stateBadge.keywordColorIdx);");
    expect(js).toContain('const MAX_VISIBLE_KEYWORD_BADGES = 3;');
    expect(js).toContain("text: '+' + (matchedKeywords.length - shownKeywords.length),");
    // Every chip still names the full match set for a screen reader.
    expect(js).toContain('label: searchMatchLabel,');
    // Nothing renders screen-reader-only badges any more, so that branch is gone.
    expect(js).not.toContain('srOnly');
    expect(js).toContain('aria-label');
    expect(js).not.toContain("tr.setAttribute('aria-label'");
  });

  test('honors reduced motion for scale, slide, and timing width changes', () => {
    const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
    expect(reducedMotion).toContain('.timing-bar-seg');
    expect(reducedMotion).toContain('transition:none');
    expect(reducedMotion).toContain('transform:none');
    expect(reducedMotion).toContain('.copy-toast,.copy-toast.show{transform:translateX(-50%)}');
  });

  test('constrains every fixed popup to the viewport and uses measured clamping', () => {
    expect(css).toMatch(
      /\.filter-popup\{[^}]*position:fixed[^}]*max-width:calc\(100vw - 16px\)[^}]*max-height:calc\(100vh - 16px\)[^}]*overflow:auto/,
    );
    expect(css).toMatch(
      /\.filter-dropdown-content,\.search-color-popup,\.search-scope-popup,\.context-menu\{[^}]*max-width:calc\(100vw - 16px\)[^}]*max-height:calc\(100vh - 16px\)[^}]*overflow:auto/,
    );
    expect((js.match(/showAccessiblePopupAt\(/g) || []).length).toBeGreaterThanOrEqual(6);
    expect(js).toContain('const rect = popup.getBoundingClientRect();');
    expect(js).toContain('reclampOpenPopups();');
    expect(js).not.toContain("'var(--status-5xx)'");
    expect(js).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  test('keeps every visible deep-search target at least 24px without forcing narrow overflow', () => {
    expect(css).toMatch(/\.search-keyword-row\{[^}]*min-width:0/);
    expect(css).toMatch(/\.search-color-btn\{[^}]*width:24px[^}]*height:24px/);
    expect(css).toMatch(/\.search-keyword-input\{[^}]*min-width:0[^}]*min-height:24px/);
    expect(css).toMatch(/\.search-kw-nav\{[^}]*min-width:24px[^}]*min-height:24px/);
    expect(css).toMatch(/\.search-remove-btn\{[^}]*min-width:24px[^}]*min-height:24px/);
    expect(css).toMatch(/\.search-add-btn\{[^}]*min-height:24px[^}]*white-space:nowrap/);
    expect(css).toMatch(/\.search-scope-btn\{[^}]*min-height:24px[^}]*white-space:nowrap/);
    expect(css).toMatch(/\.search-color-swatch\{[^}]*width:24px[^}]*height:24px/);
    expect(css).toMatch(/\.search-scope-popup input\{[^}]*width:24px[^}]*height:24px/);
    expect(css).toMatch(/\.topbar button\{[^}]*min-height:32px[^}]*white-space:nowrap/);
  });

  test('stacks the workbench and rotates the main separator at 700px', () => {
    const narrowStart = css.indexOf('@media (max-width:700px)');
    const narrow = css.slice(narrowStart, css.indexOf('@media (prefers-reduced-motion:reduce)', narrowStart));
    expect(narrow).toContain('.content{flex-direction:column}');
    expect(narrow).toContain('cursor:row-resize');
    expect(narrow).toContain('border-top:1px solid var(--separator)');
    expect(js).toContain("isNarrow ? 'horizontal' : 'vertical'");
  });

  test('provides polite atomic status regions without exposing the visual count twice', () => {
    expect(html).toMatch(/<header class="topbar" aria-label="Network controls">/);
    expect(html).not.toMatch(/<header[^>]*role="toolbar"/);
    expect(html).toMatch(/id="statusText"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    expect(html).toMatch(/id="searchCount"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/id="searchCountStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    expect(html).toMatch(/id="counter"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/id="requestCountStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    expect(html).toMatch(/id="copyToast"[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/id="copyToast"[^>]*(?:role="status"|aria-live=)/);
    expect(html).toMatch(/id="resizer"[^>]*role="separator"[^>]*aria-orientation="vertical"[^>]*aria-valuenow="50"/);
    expect(html).not.toMatch(/id="pauseBtn"[^>]*aria-pressed/);
    expect(js).not.toContain("pauseBtn.setAttribute('aria-pressed'");
  });
});

describe('details collapse static contracts', () => {
  test('does not preserve a behavior-free collapse class contract', () => {
    const className = ['details', 'collapsed'].join('-');
    const countOccurrences = (source) => source.split(className).length - 1;

    expect({
      implementation: countOccurrences(js),
      markup: countOccurrences(html),
      styles: countOccurrences(css),
      tests: countOccurrences(testSources),
    }).toEqual({
      implementation: 0,
      markup: 0,
      styles: 0,
      tests: 0,
    });
  });
});

describe('guided sample capture static contracts', () => {
  test('renders one local-only action only for a truly empty capture', () => {
    expect(js).toContain('const mode = getEmptyStateMode(state.rows.length, visibleRowCount);');
    expect(js).toContain("if (mode === 'filtered')");
    expect(js).toContain("action.textContent = 'Clear column filters';");
    expect(js).toContain("action.addEventListener('click', clearColumnFilters);");
    expect(js).toContain("action.textContent = 'Explore sample capture';");
    expect(js).not.toContain("action.setAttribute('aria-label'");
    expect(js).toContain("action.setAttribute('aria-describedby', description.id);");
    expect(js).toContain("action.addEventListener('click', activateSampleCapture);");
    expect(js).toContain('No network request is sent.');
    expect(html).not.toContain('Explore sample capture');

    const emptyStateBlock = js.slice(
      js.indexOf('function updateEmptyState'),
      js.indexOf('function updateRetentionStatus'),
    );
    expect(emptyStateBlock).not.toContain('innerHTML');
    // The sample action is DevTools-only: the mirror tab captures nothing
    // itself and its local sample ids would collide with the host's rows.
    expect(emptyStateBlock).toContain(
      "if (mode === 'capture' && !getMirrorViewParams(window.location ? window.location.search : '').viewerMode)",
    );
  });

  test('reclaims the narrow inspector only for a genuine capture-empty state', () => {
    const emptyStateBlock = js.slice(
      js.indexOf('function updateEmptyState'),
      js.indexOf('function updateRetentionStatus'),
    );
    expect(emptyStateBlock).toContain(
      "content.classList.toggle('capture-empty', mode === 'capture');",
    );
    expect(emptyStateBlock).not.toMatch(
      /classList\.toggle\('capture-empty',\s*(?:visibleRowCount|mode !== 'hidden')/,
    );

    const narrowStart = css.indexOf('@media (max-width:700px)');
    const narrow = css.slice(narrowStart, css.indexOf('@media (max-width:420px)', narrowStart));
    expect(css.slice(0, narrowStart)).not.toContain('.content.capture-empty');
    expect(narrow).toContain(
      '.content.capture-empty .tableWrap{flex:1 1 100%;min-height:0}',
    );
    expect(narrow).toContain(
      '.content.capture-empty .resizer,.content.capture-empty .details{display:none}',
    );
  });

  test('skips empty grid controls and restores them for filtered, sample, and live rows', () => {
    const syncBlock = js.slice(
      js.indexOf('function syncGridControlTabStops'),
      js.indexOf('function renderHeader'),
    );
    const renderHeaderBlock = js.slice(
      js.indexOf('function renderHeader'),
      js.indexOf('function refreshSearchMatches'),
    );
    const emptyStateBlock = js.slice(
      js.indexOf('function updateEmptyState'),
      js.indexOf('function updateRetentionStatus'),
    );
    const sampleActivationBlock = js.slice(
      js.indexOf('function activateSampleCapture'),
      js.indexOf('function updateEmptyState'),
    );
    const incrementalBlock = js.slice(
      js.indexOf('function appendIncrementalRows'),
      js.indexOf('function replaceRenderedRowStates'),
    );

    expect(syncBlock).toContain(
      'const tabIndex = getGridControlTabIndex(totalRowCount, visibleRowCount);',
    );
    expect(syncBlock).toContain("$all('th[data-col-id], .col-resizer', thead)");
    expect(syncBlock).toContain('control.tabIndex = tabIndex;');
    expect(syncBlock).not.toMatch(/setAttribute|removeAttribute|disabled|hidden/);
    expect(renderHeaderBlock).toContain('th.tabIndex = gridControlTabIndex;');
    expect(renderHeaderBlock).toContain('columnResizer.tabIndex = gridControlTabIndex;');
    expect(renderHeaderBlock).toContain("th.setAttribute('aria-sort', sortState);");
    expect(renderHeaderBlock).toContain(
      "columnResizer.setAttribute('aria-valuenow', String(c.width));",
    );
    expect(emptyStateBlock).toContain(
      'syncGridControlTabStops(state.rows.length, visibleRowCount);',
    );
    expect(sampleActivationBlock).toContain('renderBody();');
    expect(incrementalBlock).toContain('updateEmptyState(state.filteredRows.length);');
  });

  test('recovers filtered requests through the shared reset path without clearing search keywords', () => {
    const clearFiltersBlock = js.slice(
      js.indexOf('function clearColumnFilters'),
      js.indexOf('function saveViewPreset'),
    );
    expect(clearFiltersBlock).toContain('state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();');
    expect(clearFiltersBlock).toContain('renderBody();');
    expect(clearFiltersBlock).toContain('syncSearchUIAfterRender();');
    expect(clearFiltersBlock).toContain("setStatus('Column filters cleared');");
    expect(clearFiltersBlock).not.toMatch(/state\.search|keywords/);

    const renderBodyBlock = js.slice(
      js.indexOf('function renderBody'),
      js.indexOf('function scrollToSelectedRow'),
    );
    expect(renderBodyBlock).toContain('const restoreEmptyStateFocus = isFocusInsideEmptyState();');
    expect(renderBodyBlock).toContain('restoreFocusAfterEmptyStateChange(restoreEmptyStateFocus);');
  });

  test('exposes one native heading per rendered empty state without changing its layout', () => {
    const emptyStateBlock = js.slice(
      js.indexOf('function updateEmptyState'),
      js.indexOf('function updateRetentionStatus'),
    );
    expect(emptyStateBlock.match(/document\.createElement\('h2'\)/g) || []).toHaveLength(1);
    expect(emptyStateBlock.match(/emptyState\.appendChild\(title\);/g) || []).toHaveLength(1);
    expect(emptyStateBlock).not.toContain("setAttribute('role', 'heading')");
    expect(css).toMatch(
      /\.empty-state-title\{[^}]*margin:0[^}]*color:var\(--fg\)[^}]*font:inherit[^}]*font-weight:700/,
    );
  });

  test('keeps the action responsive, keyboard visible, and on existing theme tokens', () => {
    expect(css).toMatch(
      /\.empty-state-action\{[^}]*min-height:32px[^}]*max-width:100%[^}]*background:var\(--accent-dim\)[^}]*color:var\(--text-accent\)[^}]*white-space:nowrap/,
    );
    expect(css).toContain('.empty-state-action:focus-visible{outline:2px solid var(--accent);outline-offset:2px}');
    expect(css).toContain(
      '.empty-state-action:active{background:var(--accent-fill);color:var(--on-accent);box-shadow:inset 0 0 0 1px var(--on-accent)}',
    );
    expect(css).toContain('.empty-state-action:disabled,.empty-state-action[aria-busy="true"]');
    expect(css).toMatch(/\.empty-state\{[^}]*min-width:0[^}]*padding:24px 16px[^}]*text-align:center/);
    expect(css).toMatch(/\.empty-state-description\{[^}]*max-width:380px[^}]*overflow-wrap:anywhere/);
  });

  test('rechecks emptiness, pauses live capture, selects the first row, and performs no external action', () => {
    const activationBlock = js.slice(
      js.indexOf('function activateSampleCapture'),
      js.indexOf('function updateEmptyState'),
    );
    expect(activationBlock).toContain('if (!enterSampleCaptureMode())');
    expect(activationBlock).toContain('createSampleCaptureRequests(SAMPLE_CAPTURE_BASE_TIMESTAMP)');
    expect(activationBlock).toContain("addRowsWithRetention(rows, 'sample')");
    expect(activationBlock).toContain('selectRow(retainedRows[0], null, true);');
    expect(activationBlock).toContain('No network traffic was sent.');
    expect(activationBlock).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|chrome\.storage|localStorage|triggerObjectUrlDownload|exportHAR|\.click\(\)/,
    );
    const enterModeBlock = js.slice(
      js.indexOf('function enterSampleCaptureMode'),
      js.indexOf('function exitSampleCaptureMode'),
    );
    expect(enterModeBlock).toContain("}, 'enter');");
    expect(enterModeBlock).toContain('state.sampleCaptureActive = transition.active;');
    expect(enterModeBlock).toContain('state.paused = transition.paused;');

    const generatorBlock = js.slice(
      js.indexOf('function createSampleCaptureRequests'),
      js.indexOf('function serializeFilterState'),
    );
    expect(generatorBlock).not.toContain('Date.now');
    expect((generatorBlock.match(/\.test/g) || [])).toHaveLength(5);
  });

  test('prevents sample/live mixing and restores the normal capture path on Clear', () => {
    expect(js).toContain('if (state.paused || state.sampleCaptureActive) return;');
    expect(js).toContain('pauseBtn.disabled = state.sampleCaptureActive;');
    expect(js).toContain(
      'if (state.sampleCaptureActive && state.rows.length === 0 && exitSampleCaptureMode())',
    );
    expect(js).toContain('else if (sampleCaptureWasActive && evictedRows.length > 0)');
    expect(js).toContain('setStatus(formatSampleCaptureRemainingStatus(state.rows.length));');
    expect(js).toContain('Local sample capture removed. Live capture resumed.');
    const clearBlock = js.slice(
      js.indexOf("clearButton.addEventListener('click'"),
      js.indexOf('// Pause/Resume'),
    );
    expect(clearBlock).toContain('const clearedSampleCapture = snapshot.sampleCaptureActive;');
    expect(clearBlock).toContain('updateRecordState(false);');
    expect(clearBlock).toContain('detachStoredRowsForClearUndo();');
    expect(clearBlock.indexOf('detachStoredRowsForClearUndo();')).toBeLessThan(
      clearBlock.indexOf('state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();'),
    );
    expect(clearBlock).toContain('render();');
    expect(clearBlock).toContain('clearButton.focus({ preventScroll: true });');
    expect(clearBlock).toContain('Local sample capture cleared. Live capture resumed.');
    expect(clearBlock).toContain('Undo available for ');
    expect(js).toContain("const fallbackControl = document.querySelector('.empty-state-action') || $('#clearBtn');");

    const importCommitBlock = js.slice(
      js.indexOf('const commitStagedImport = (stagedImport) => {'),
      js.indexOf('importBtn.addEventListener', js.indexOf('const commitStagedImport = (stagedImport) => {')),
    );
    expect(importCommitBlock).toContain('exitSampleCaptureMode();');
    expect(importCommitBlock.indexOf('exitSampleCaptureMode();')).toBeLessThan(
      importCommitBlock.indexOf('state.paused = true;'),
    );
  });

  test('preserves user filters across temporary sample mode without persistence', () => {
    expect(js).toContain('sampleCapturePreviousColumnFilterRules: null');
    const enterModeBlock = js.slice(
      js.indexOf('function enterSampleCaptureMode'),
      js.indexOf('function exitSampleCaptureMode'),
    );
    expect(enterModeBlock).toContain('planSampleCaptureFilterTransition(');
    expect(enterModeBlock).toContain('state.columnFilterRules,');
    expect(enterModeBlock).toContain("'enter',");
    expect(enterModeBlock).toContain('state.columnFilterRules = filterTransition.columnFilterRules;');
    expect(enterModeBlock).toContain(
      'state.sampleCapturePreviousColumnFilterRules = filterTransition.previousColumnFilterRules;',
    );

    const exitModeBlock = js.slice(
      js.indexOf('function exitSampleCaptureMode'),
      js.indexOf('function isFocusInsideEmptyState'),
    );
    expect(exitModeBlock).toContain('planSampleCaptureFilterTransition(');
    expect(exitModeBlock).toContain('state.sampleCapturePreviousColumnFilterRules,');
    expect(exitModeBlock).toContain("'exit',");
    expect(exitModeBlock).toContain('state.columnFilterRules = filterTransition.columnFilterRules;');
    expect(exitModeBlock).toContain(
      'state.sampleCapturePreviousColumnFilterRules = filterTransition.previousColumnFilterRules;',
    );

    const activationBlock = js.slice(
      js.indexOf('function activateSampleCapture'),
      js.indexOf('function updateEmptyState'),
    );
    expect(activationBlock).not.toContain('state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();');

    const filterTransitionBlock = js.slice(
      js.indexOf('function planSampleCaptureFilterTransition'),
      js.indexOf('function normalizeViewPreset'),
    );
    expect(filterTransitionBlock).toContain('deserializeFilterState(serializeFilterState(currentRules))');
    expect(filterTransitionBlock).toContain('deserializeFilterState(serializeFilterState(previousRules))');
    expect(filterTransitionBlock).not.toMatch(/localStorage|chrome\.storage|state\.rows|requestHeaders|responseContent/);
  });

  test('keeps sample trust visible and transfers focus when the empty action disappears', () => {
    expect(html).toMatch(/id="sampleCaptureStatus"[^>]*class="sample-capture-status"[^>]*hidden/);
    expect(js).toContain("status.textContent = active ? 'Local sample · live paused' : '';");
    expect(js).toContain('Local synthetic requests are loaded. No network traffic was sent.');
    expect(css).toMatch(
      /\.sample-capture-status\{[^}]*border:1px solid var\(--accent\)[^}]*background:var\(--accent-dim\)[^}]*color:var\(--text-accent\)[^}]*white-space:nowrap/,
    );
    expect(css).toContain('.sample-capture-status[hidden]{display:none}');
    expect(css).toMatch(
      /\.statusbar\{[^}]*flex-wrap:wrap[^}]*overflow-x:visible[^}]*white-space:normal/,
    );
    expect(css).not.toMatch(/\.statusbar\{[^}]*overflow-x:auto/);
    expect(css).toMatch(
      /\.statusbar > span:not\(\.sr-only\),\.status-details > span\{[^}]*min-width:0[^}]*max-width:100%[^}]*overflow-wrap:anywhere/,
    );
    expect(css).toMatch(
      /#retentionStatus\{[^}]*white-space:normal[^}]*\}\s*#statsSummary\{[^}]*white-space:normal/,
    );
    expect(css).toMatch(
      /\.status-summary-visual\{[^}]*display:inline-flex[^}]*flex-wrap:wrap[^}]*max-width:100%/,
    );
    expect(css).toMatch(
      /\.status-summary-chips\{[^}]*display:inline-flex[^}]*flex-wrap:wrap/,
    );
    expect(css).toMatch(
      /\.status-summary-duration\{[^}]*min-width:0[^}]*overflow-wrap:anywhere/,
    );
    expect(css).toMatch(/#counter\{[^}]*white-space:normal/);
    expect(js).toContain('const restoreEmptyStateFocus = isFocusInsideEmptyState();');
    expect(js).toContain('restoreFocusAfterEmptyStateChange(restoreEmptyStateFocus);');
    expect(js).toContain("const target = (tbody && tbody.querySelector('tr[tabindex=\"0\"]')) || $('#filterBtn');");
    expect(js).toContain('Resume recording to capture real requests');
    const pauseBlock = js.slice(
      js.indexOf("pauseBtn.addEventListener('click'"),
      js.indexOf('// Export', js.indexOf("pauseBtn.addEventListener('click'")),
    );
    expect(pauseBlock).toContain('updateRecordState();');
    expect(pauseBlock).toContain('updateEmptyState(state.filteredRows.length);');
  });

  test('uses a narrow-only accessible disclosure for secondary status telemetry', () => {
    expect(html).toMatch(
      /id="statusDetails" class="status-details" role="group" aria-label="Retention and aggregate status details"/,
    );
    expect(html).toMatch(
      /id="statusDetailsToggle"[^>]*aria-controls="statusDetails"[^>]*aria-expanded="false"[^>]*hidden>More status<\/button>/,
    );
    const toggleTag = html.match(/<button id="statusDetailsToggle"[^>]*>/)?.[0] || '';
    expect(toggleTag).not.toContain('aria-label=');
    expect(css).toContain('.status-details{display:contents}');
    expect(css).toContain('@media (max-width:800px)');
    expect(css).toMatch(
      /\.status-details\{display:flex;[^}]*flex:1 0 100%;[^}]*flex-wrap:wrap[^}]*border-top:1px solid var\(--border\)/,
    );
    expect(css).toContain('.status-details[hidden]{display:none}');
    expect(css).toMatch(
      /@media \(max-width:800px\)\{[\s\S]*?\.status-details > span\{[^}]*min-width:0[^}]*max-width:100%[^}]*overflow-wrap:anywhere/,
    );
    const narrowStatusRule = css.match(/\.statusbar #statusText\{([^}]*)\}/)?.[1] || '';
    expect(narrowStatusRule).toContain('flex:1 0 100%');
    expect(narrowStatusRule).toContain('overflow-wrap:anywhere');
    expect(narrowStatusRule).toContain('white-space:normal');
    expect(narrowStatusRule).not.toMatch(/overflow:hidden|text-overflow:ellipsis|white-space:nowrap/);
    expect(css).toMatch(
      /\.statusbar #counter\{[^}]*flex:1 0 100%[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/,
    );

    const initializerStart = js.indexOf('function initializeStatusDetailsDisclosure()');
    const initializerEnd = js.indexOf('\n  function ', initializerStart + 1);
    const initializer = js.slice(initializerStart, initializerEnd);
    expect(initializer).toContain('const matchMediaApi = getMatchMediaApi();');
    expect(initializer).toContain('if (!matchMediaApi) return;');
    expect(initializer).toContain('mediaQuery = matchMediaApi(STATUS_DETAILS_MEDIA_QUERY)');
    expect(initializer).toContain('if (!mediaQuery || typeof mediaQuery.matches');
    expect(initializer).toContain('document.activeElement === toggle');
    expect(initializer).toContain("['sampleExitBtn', 'sampleGuideBtn', 'undoClearBtn', 'clearBtn']");
    expect(initializer).toContain('fallback.focus({ preventScroll: true })');
    expect(initializer).toContain('toggle.hidden = !available');
    expect(initializer).toContain("details.addEventListener('focusin'");
    expect(initializer).toContain("details.addEventListener('focusout'");
    expect(initializer).toContain('event.relatedTarget && !details.contains(event.relatedTarget)');
    expect(initializer).toContain('detailsHadFocus || details.contains(document.activeElement)');
    expect(initializer).toContain('details.contains(document.activeElement)');
    expect(initializer).toContain('toggle.focus({ preventScroll: true })');
    expect(initializer).toContain('details.hidden = available && !expanded');
    expect(initializer).toContain("toggle.setAttribute('aria-expanded', String(visible))");
    expect(initializer).not.toContain("toggle.setAttribute('aria-label'");
    expect(initializer).not.toContain("'Show retention and aggregate status details'");
    expect(initializer).not.toContain("'Hide retention and aggregate status details'");
    expect(initializer).not.toContain('innerHTML');
    expect(js).toContain('initializeStatusDetailsDisclosure();');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion:reduce\)\{[^}]*\.status-details-toggle\{transition:none\}/,
    );
  });
});

describe('sample evidence guide static contracts', () => {
  const dialogStart = html.indexOf('<dialog id="sampleGuideDialog"');
  const dialogEnd = html.indexOf('</dialog>', dialogStart);
  const dialogBlock = html.slice(dialogStart, dialogEnd);
  const tabHelperStart = js.indexOf('function getInspectorTabButton');
  const tabHelperEnd = js.indexOf('let sampleGuideDialogTrigger', tabHelperStart);
  const tabHelperBlock = js.slice(tabHelperStart, tabHelperEnd);
  const guideUiStart = js.indexOf('function resetSampleGuideDialog');
  const guideUiEnd = js.indexOf('function toggleSort', guideUiStart);
  const guideUiBlock = js.slice(guideUiStart, guideUiEnd);

  test('keeps one sample-only entry and an answer-free prompt before explicit reveal', () => {
    expect(html).toMatch(
      /id="sampleGuideBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="sampleGuideDialog"[^>]*aria-expanded="false"[^>]*hidden disabled>Sample guide<\/button>/,
    );
    expect(dialogBlock).toContain('Which request failed?');
    expect(dialogBlock).toContain('Which Timing phase accounts for most of its duration?');
    expect(dialogBlock).toContain('Which response header gives a retry hint?');
    expect(dialogBlock).toContain('What limitation applies to what browser timing can prove?');
    expect(dialogBlock).toMatch(
      /id="sampleGuideEvidence"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*hidden><\/div>/,
    );
    expect(dialogBlock).not.toMatch(
      /\bPOST\b|\/v1\/orders\/preview|\b503\b|2,?200|Retry-After|root cause/i,
    );
    expect(dialogBlock).not.toMatch(/Inspect Timing evidence|Inspect Retry-After header/);
    expect(dialogBlock).toContain('Exit · restore prior recording state');
    expect(dialogBlock).toContain(
      'restores the recording state and column filters from before the sample',
    );
    expect(dialogBlock.match(/<button/g)).toHaveLength(3);
    expect(html.match(/>Sample guide<\/button>/g)).toHaveLength(1);
  });

  test('creates revealed evidence from the deterministic source using safe DOM APIs', () => {
    expect(guideUiBlock).toContain(
      'deriveSampleGuideEvidence(\n      createSampleCaptureRequests(SAMPLE_CAPTURE_BASE_TIMESTAMP)',
    );
    expect(guideUiBlock).toContain("heading.textContent = 'Evidence to verify';");
    expect(guideUiBlock).toContain("document.createElement('dl')");
    expect(guideUiBlock).toContain("appendSampleGuideEvidenceItem(\n      list,\n      'Failed request'");
    expect(guideUiBlock).toContain("'Dominant Timing phase'");
    expect(guideUiBlock).toContain("'Retry hint'");
    expect(guideUiBlock).toContain("'Browser evidence limit'");
    expect(guideUiBlock).toContain("navigationActions.className = 'sample-guide-evidence-actions';");
    expect(guideUiBlock).toContain("document.createElement('button')");
    expect(guideUiBlock).toContain("button.textContent = label;");
    expect(guideUiBlock).toContain("'Inspect Timing evidence'");
    expect(guideUiBlock).toContain("'Inspect Retry-After header'");
    expect(guideUiBlock).toContain("navigationStatus.setAttribute('role', 'status');");
    expect(guideUiBlock).not.toContain('innerHTML');
    expect(guideUiBlock).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|chrome\.storage|localStorage|analytics|telemetry/,
    );
  });

  test('shows only in sample mode and resets on close, Clear exit, and sample Undo', () => {
    const availabilityStart = js.indexOf('function updateSampleGuideAvailability');
    const availabilityEnd = js.indexOf('function updateSampleCaptureStatus', availabilityStart);
    const availabilityBlock = js.slice(availabilityStart, availabilityEnd);
    expect(availabilityBlock).toContain(
      'state.sampleCaptureActive && Number.isFinite(visibleRowCount) && visibleRowCount > 0',
    );
    expect(availabilityBlock).toContain('guideButton.hidden = !available;');
    expect(availabilityBlock).toContain('guideButton.disabled = !available;');
    expect(availabilityBlock).toContain('closeSampleGuideDialog(false);');

    const emptyStateStart = js.indexOf('function updateEmptyState');
    const emptyStateEnd = js.indexOf('function updateRetentionStatus', emptyStateStart);
    expect(js.slice(emptyStateStart, emptyStateEnd)).toContain(
      'updateSampleGuideAvailability(visibleRowCount);',
    );

    const openStart = js.indexOf('function openSampleGuideDialog');
    const openEnd = js.indexOf('function closeSampleGuideDialog', openStart);
    expect(js.slice(openStart, openEnd)).toContain('if (!state.sampleCaptureActive');

    const exitStart = js.indexOf('function exitSampleCaptureMode');
    const exitEnd = js.indexOf('function isFocusInsideEmptyState', exitStart);
    expect(js.slice(exitStart, exitEnd)).toContain('closeSampleGuideDialog(false);');

    const resetStart = js.indexOf('function resetSampleGuideDialog');
    const resetEnd = js.indexOf('function appendSampleGuideEvidenceItem', resetStart);
    const resetBlock = js.slice(resetStart, resetEnd);
    expect(resetBlock).toContain("evidence.textContent = '';");
    expect(resetBlock).toContain('evidence.hidden = true;');
    expect(resetBlock).toContain('revealButton.hidden = false;');

    const restoreStart = js.indexOf('const restoreClearUndoSnapshot = (snapshot) => {');
    const restoreEnd = js.indexOf('// [U4] Clear', restoreStart);
    expect(js.slice(restoreStart, restoreEnd)).toContain('updateRecordState(false);');
    expect(js).not.toContain('sampleGuideRevealed');
    expect(js).not.toContain('sampleGuideNavigationAttempt');
  });

  test('offers one shared fail-closed sample exit from status and guide surfaces', () => {
    expect(html).toMatch(
      /id="sampleExitBtn"[^>]*class="sample-exit-btn"[^>]*hidden disabled>Exit · restore prior recording state<\/button>/,
    );
    expect(dialogBlock).toMatch(
      /id="sampleGuideExitBtn"[^>]*class="sample-guide-exit-btn"[^>]*aria-describedby="sampleGuideExitHelp"[^>]*hidden disabled>Exit · restore prior recording state<\/button>/,
    );
    const exitPlanStart = js.indexOf('function planSampleCaptureExit');
    const exitPlanEnd = js.indexOf('function createSampleCaptureRequests', exitPlanStart);
    const exitPlanBlock = js.slice(exitPlanStart, exitPlanEnd);
    expect(exitPlanBlock).toContain("context.sampleCaptureActive !== true");
    expect(exitPlanBlock).toContain('rows.length !== SAMPLE_CAPTURE_SIGNATURES.length');
    expect(exitPlanBlock).toContain("row._captureSource !== 'sample'");
    expect(exitPlanBlock).toContain("unavailable('sample-signature-mismatch')");
    expect(exitPlanBlock).not.toMatch(/fetch\s*\(|chrome\.storage|localStorage|innerHTML/);

    const exitUiStart = js.indexOf('function getSampleCaptureExitPlan');
    const exitUiEnd = js.indexOf('function toggleSort', exitUiStart);
    const exitUiBlock = js.slice(exitUiStart, exitUiEnd);
    const guardIndex = exitUiBlock.indexOf('if (!plan.available)');
    const removalIndex = exitUiBlock.indexOf('removeRowsFromState(plan.rows, false);');
    expect(exitUiBlock).toContain(
      'isActiveRetainedRow(row, state.retainedRows, state.activeRows)',
    );
    expect(guardIndex).toBeGreaterThan(-1);
    expect(removalIndex).toBeGreaterThan(guardIndex);
    expect(exitUiBlock).toContain('render();');
    expect(exitUiBlock).toContain('syncSearchUIAfterRender();');
    expect(exitUiBlock).toContain('clearDetailsPanel();');
    expect(exitUiBlock).toContain(
      "document.querySelector('.empty-state-action') || $('#clearBtn')",
    );
    expect(exitUiBlock).toContain('Previous recording state and column filters restored.');
    expect(exitUiBlock).toContain("state.paused ? 'Recording remains paused.' : 'Live recording is active.'");
    expect(exitUiBlock).toContain(
      "statusButton.addEventListener('click', exitLocalSampleCapture);",
    );
    expect(exitUiBlock).toContain(
      "guideButton.addEventListener('click', exitLocalSampleCapture);",
    );
    expect(exitUiBlock).not.toContain('createClearUndoSnapshot');
    expect(exitUiBlock).not.toContain('armClearUndoSnapshot');
  });

  test('restores focus for close and Escape without targeting a hidden trigger on exit', () => {
    expect(guideUiBlock).toContain("dialog.addEventListener('cancel', (event) => {");
    expect(guideUiBlock).toContain('event.preventDefault();');
    expect(guideUiBlock).toContain('closeSampleGuideDialog(true);');
    expect(guideUiBlock).toContain('if (event.target === dialog) closeSampleGuideDialog(true);');
    expect(guideUiBlock).toContain('if (restoreFocus === false) sampleGuideDialogTrigger = null;');
    expect(guideUiBlock).toContain('trigger.isConnected !== false && !trigger.hidden');
    expect(guideUiBlock).toContain('trigger.focus({ preventScroll: true });');
    expect(guideUiBlock).toContain('heading.focus({ preventScroll: true });');
    expect(guideUiBlock).toContain("const closeButton = $('#sampleGuideCloseBtn');");
    expect(guideUiBlock).toContain('if (!dialog || !button || !closeButton || !revealButton) return;');
    expect(guideUiBlock).toContain(
      "closeButton.addEventListener('click', () => closeSampleGuideDialog(true));",
    );
    expect(guideUiBlock).toContain('closeSampleGuideDialog(false);');
    expect(guideUiBlock).toContain('selectRow(plan.targetRow, null, true);');
    expect(guideUiBlock).toContain('scrollToSelectedRow();');
    expect(guideUiBlock).toContain("activateInspectorTab('res-tab-bar', plan.tabId, true);");
    expect(js.indexOf('function scrollToSelectedRow')).toBeLessThan(js.indexOf('function init()'));
  });

  test('keeps unavailable evidence inert and clears only blocking sample-local column filters', () => {
    const navigationStart = guideUiBlock.indexOf('function navigateToSampleEvidence');
    const unavailableGuard = guideUiBlock.indexOf('if (!plan.available', navigationStart);
    const filterReset = guideUiBlock.indexOf('previousFilterRules = serializeFilterState', navigationStart);
    expect(unavailableGuard).toBeGreaterThan(navigationStart);
    expect(filterReset).toBeGreaterThan(unavailableGuard);
    expect(guideUiBlock).toContain(
      'isActiveRetainedRow(row, state.retainedRows, state.activeRows)',
    );
    expect(js).toContain(
      "const captureSource = ['sample', 'import', 'live'].includes(source) ? source : 'live';",
    );
    expect(js).toContain('row._captureSource = captureSource;');
    expect(guideUiBlock).toContain('for (const colId of plan.blockingFilterIds)');
    expect(guideUiBlock).toContain('state.columnFilterRules[colId] = defaults[colId];');
    expect(guideUiBlock).toContain(
      'state.columnFilterRules = deserializeFilterState(previousFilterRules);',
    );
    expect(guideUiBlock).toContain('sample-only column ');
    expect(guideUiBlock).toContain('pre-sample filters return when sample mode exits');
    expect(guideUiBlock).toContain('announceSampleEvidenceNavigation(statusElement, unavailableMessage);');
  });

  test('synchronizes search counts and navigation controls after filter reset and rollback', () => {
    const navigationStart = guideUiBlock.indexOf('function navigateToSampleEvidence');
    const navigationEnd = guideUiBlock.indexOf(
      'function createSampleGuideEvidenceAction',
      navigationStart,
    );
    const navigationBlock = guideUiBlock.slice(navigationStart, navigationEnd);
    expect(js).toContain('syncSearchUI: null,');
    expect(guideUiBlock).toContain(
      "if (typeof state.syncSearchUI === 'function') state.syncSearchUI();",
    );
    expect(navigationBlock.match(/syncSearchUIAfterRender\(\);/g)).toHaveLength(2);
    expect(navigationBlock).toMatch(
      /state\.columnFilterRules = deserializeFilterState\(previousFilterRules\);\s+renderBody\(\);\s+syncSearchUIAfterRender\(\);/,
    );
    expect(js).toContain('state.syncSearchUI = updateSearchUI;');
    expect(js).toContain("countSpan.textContent = '0';");
    expect(js).toContain('countSpan.textContent = (kwCurIdx + 1) + \'/\' + kwMatchCount;');
    expect(js).toContain('prevBtn.disabled = kwMatchCount === 0;');
    expect(js).toContain('nextBtn.disabled = kwMatchCount === 0;');
  });

  test('announces concise evidence destinations and preserves accessible tab keyboard behavior', () => {
    expect(guideUiBlock).toContain("'Opened Response '");
    expect(guideUiBlock).toContain("'Dominant phase: '");
    expect(guideUiBlock).toContain("evidence.retryHeaderName + ' is '");
    expect(guideUiBlock).toContain('setStatus(message, true);');
    expect(tabHelperBlock).toContain("candidate.setAttribute('aria-selected', String(isActive));");
    expect(tabHelperBlock).toContain('candidate.tabIndex = isActive ? 0 : -1;');
    expect(tabHelperBlock).toContain('pane.hidden = !isActive;');
    expect(tabHelperBlock).toContain('activeButton.focus();');
    expect(tabHelperBlock).toContain("['ArrowLeft', 'ArrowRight', 'Home', 'End']");
    expect(tabHelperBlock).toContain('getNextTabIndex(');
    expect(js).toContain("initializeInspectorTabBar('req-tab-bar');");
    expect(js).toContain("initializeInspectorTabBar('res-tab-bar');");
  });

  test('keeps prompt, reveal, and close controls narrow-safe and at least 24px', () => {
    expect(css).toMatch(
      /\.sample-guide-btn,\.sample-exit-btn,\.status-details-toggle,\.ws-capture-btn\{[^}]*min-height:24px[^}]*white-space:nowrap/,
    );
    expect(css).toMatch(
      /#sampleGuideDialog\{[^}]*width:min\(480px,calc\(100vw - 16px\)\)[^}]*max-height:min\(calc\(100vh - 16px\),calc\(100dvh - 16px\)\)[^}]*overflow:auto/,
    );
    expect(css).toMatch(/\.sample-guide-form button\{[^}]*min-height:32px/);
    expect(css).toContain('.sample-guide-form button:focus-visible');
    expect(css).toContain('.sample-guide-prompts{');
    expect(css).toContain('overflow-wrap:anywhere');
    expect(css).toContain('.sample-guide-actions{flex-wrap:wrap}');
    expect(css).toContain('.sample-guide-actions button{flex:1 1 auto}');
    expect(css).toContain('.sample-guide-form .sample-guide-exit-btn{white-space:nowrap}');
    expect(css).toMatch(
      /\.sample-guide-evidence-actions\{[^}]*display:flex[^}]*flex-wrap:wrap[^}]*min-width:0/,
    );
    expect(css).toMatch(
      /\.sample-guide-evidence-actions button\{[^}]*flex:1 1 180px[^}]*min-width:0[^}]*white-space:nowrap/,
    );
    expect(css).toContain('.sample-guide-navigation-status{min-height:16px');
    const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
    expect(reducedMotion).toContain('.sample-guide-btn');
    expect(reducedMotion).toContain('.sample-exit-btn');
    expect(reducedMotion).toContain('transition:none');
  });
});

describe('recoverable Clear Undo static contracts', () => {
  test('adds a transient named keyboard action beside the polite status text', () => {
    expect(html).toMatch(
      /<button id="undoClearBtn"[^>]*type="button"[^>]*aria-label="Undo clear"[^>]*hidden disabled>Undo clear<\/button><span id="statusText"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*>Loaded<\/span>/,
    );
    expect(css).toMatch(
      /\.undo-clear-btn\{[^}]*min-height:24px[^}]*border:1px solid var\(--accent\)[^}]*background:var\(--accent-dim\)[^}]*color:var\(--text-accent\)[^}]*white-space:nowrap[^}]*transition:background-color 0\.15s/,
    );
    expect(css).toContain('.undo-clear-btn:hover{background:var(--accent-fill);border-color:var(--accent);color:var(--on-accent)}');
    expect(css).toContain('.undo-clear-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}');
    expect(css).toContain('.undo-clear-btn:disabled{opacity:.5;cursor:not-allowed}');
    expect(css).toContain('.undo-clear-btn[hidden]{display:none}');
  });

  test('consumes each snapshot before restoring or disposing it and expires on a named timeout', () => {
    expect(js).toContain('const CLEAR_UNDO_TIMEOUT_MS = 10000;');
    const consumeStart = js.indexOf('function consumeClearUndoSnapshot');
    const consumeEnd = js.indexOf('function focusClearAfterUndoUnavailable', consumeStart);
    const consumeBlock = js.slice(consumeStart, consumeEnd);
    expect(consumeBlock).toContain('state.clearUndoSnapshot = null;');
    expect(consumeBlock.indexOf('state.clearUndoSnapshot = null;')).toBeLessThan(
      consumeBlock.indexOf('updateClearUndoAction();'),
    );
    expect(consumeBlock).toContain('clearTimeout(clearUndoTimer);');

    const armStart = js.indexOf('function armClearUndoSnapshot');
    const armEnd = js.indexOf('function reconcileClearUndoAfterRetentionPressure', armStart);
    const armBlock = js.slice(armStart, armEnd);
    expect(armBlock).toContain('setTimeout(() => {');
    expect(armBlock).toContain('}, CLEAR_UNDO_TIMEOUT_MS);');
    expect(armBlock).toContain("disposeClearUndoSnapshot(\n        'timeout'");

    const undoStart = js.indexOf("undoClearButton.addEventListener('click'");
    const undoEnd = js.indexOf('// Pause/Resume', undoStart);
    const undoBlock = js.slice(undoStart, undoEnd);
    expect(undoBlock).toContain("consumeClearUndoSnapshot('undo')");
    expect(undoBlock.indexOf("consumeClearUndoSnapshot('undo')")).toBeLessThan(
      undoBlock.indexOf('restoreClearUndoSnapshot(consumed.snapshot)'),
    );
  });

  test('holds row identities inside existing request and body-cache accounting', () => {
    const snapshotStart = js.indexOf('function createClearUndoSnapshot');
    const snapshotEnd = js.indexOf('function detachStoredRowsForClearUndo', snapshotStart);
    const snapshotBlock = js.slice(snapshotStart, snapshotEnd);
    expect(snapshotBlock).toContain('const rows = state.rows.slice();');
    expect(snapshotBlock).not.toMatch(/requestHeaders|responseHeaders|requestPostData|responseContent|localStorage|chrome\.storage/);

    const addStart = js.indexOf('function addRowsWithRetention');
    const addEnd = js.indexOf('function recordSkippedImportRows', addStart);
    const addBlock = js.slice(addStart, addEnd);
    expect(addBlock).toContain('undoSnapshot ? undoSnapshot.rows : []');
    expect(addBlock).toContain('state.rows = retentionPlan.retainedActiveRows;');
    expect(addBlock).toContain('undoSnapshot.rows = retentionPlan.retainedHeldRows;');
    expect(addBlock.indexOf('undoSnapshot ? undoSnapshot.rows : []')).toBeLessThan(
      addBlock.indexOf('state.rows,'),
    );
    expect(addBlock).toContain('cleanupEvictedRowReferences(retentionPlan.evictedRows, true);');
    expect(js).toContain("releaseResponseContent(row, 'row-evicted', false);");
    expect(js).toContain('row._responseContentPromise = null;');
    expect(js).toContain('row._reqObj = null;');
  });

  test('restores prior filters, search, selection, detail, sort, sample, pause, and focus context', () => {
    const restoreStart = js.indexOf('const restoreClearUndoSnapshot = (snapshot) => {');
    const restoreEnd = js.indexOf('// [U4] Clear', restoreStart);
    const restoreBlock = js.slice(restoreStart, restoreEnd);
    for (const expected of [
      'state.rows = restorePlan.rows.concat(activeRows);',
      'state.columnFilterRules = restorePlan.columnFilterRules;',
      'state.sort = restorePlan.sort;',
      'state.paused = restorePlan.paused;',
      'state.sampleCaptureActive = restorePlan.sampleCaptureActive;',
      'state.search.keywords = restorePlan.searchKeywords;',
      'state.search.scope = restorePlan.searchScope;',
      'state.selectedRows = new Set(restorePlan.selectedRows);',
      'state.highlightedRows.set(row, colorClass);',
      'selectRow(restorePlan.selectedRow, null, false);',
      'syncSearchScopeControls();',
      'toggleSearchPanel(restorePlan.searchPanelVisible, false);',
      'restoreSearchNavigation(restorePlan);',
      'state.pendingRowFocusId = focusRow ? String(focusRow.id) : null;',
      'Restored ',
    ]) {
      expect(restoreBlock).toContain(expected);
    }
    expect(restoreBlock).toContain('state.rows = restorePlan.rows.concat(activeRows);');
    expect(restoreBlock).not.toContain('state.nextId =');
  });

  test('commits superseded snapshots and invalidates a sample before accepting live traffic', () => {
    const clearStart = js.indexOf("clearButton.addEventListener('click'");
    const clearEnd = js.indexOf("undoClearButton.addEventListener('click'", clearStart);
    const clearBlock = js.slice(clearStart, clearEnd);
    expect(clearBlock.indexOf("disposeClearUndoSnapshot('clear')")).toBeLessThan(
      clearBlock.indexOf('createClearUndoSnapshot(searchPanelVisible)'),
    );

    const sampleStart = js.indexOf('function activateSampleCapture');
    const sampleEnd = js.indexOf('function updateEmptyState', sampleStart);
    const sampleBlock = js.slice(sampleStart, sampleEnd);
    expect(sampleBlock.indexOf("disposeClearUndoSnapshot('sample')")).toBeLessThan(
      sampleBlock.indexOf('enterSampleCaptureMode()'),
    );

    const importStart = js.indexOf('const commitStagedImport = (stagedImport) => {');
    const importEnd = js.indexOf('importBtn.addEventListener', importStart);
    const importBlock = js.slice(importStart, importEnd);
    expect(importBlock.indexOf("disposeClearUndoSnapshot('import')")).toBeLessThan(
      importBlock.indexOf('clearStoredRows();'),
    );

    const liveStart = js.indexOf('chrome.devtools.network.onRequestFinished.addListener');
    const liveEnd = js.indexOf('scheduleLiveRows(wasAtBottom);', liveStart);
    const liveBlock = js.slice(liveStart, liveEnd);
    const commitStart = js.indexOf('function commitPendingLiveRows');
    const commitEnd = js.indexOf('function recordSkippedImportRows', commitStart);
    const commitBlock = js.slice(commitStart, commitEnd);
    expect(liveBlock.indexOf("disposeClearUndoSnapshot(\n          'live'")).toBeLessThan(
      liveBlock.indexOf('const row = buildRowFromRequest(request);'),
    );
    expect(liveBlock).toContain('keep sample and live traffic separate');
    expect(liveBlock).toContain('pendingLiveRows.push(row);');
    expect(liveBlock).not.toContain('automaticResponsePrefetchScheduler.enqueue(row);');
    expect(commitBlock).toContain('state.automaticResponsePrefetchScheduler.enqueue(row);');
  });
});

describe('capture retention static contracts', () => {
  test('provides a labelled narrow-safe settings dialog with an explicit unlimited warning', () => {
    expect(html).toMatch(/id="settingsBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="settingsDialog"/);
    expect(html).toMatch(/<dialog id="settingsDialog"[^>]*aria-labelledby="settingsDialogTitle"/);
    expect(html).toMatch(
      /<label for="retentionLimit" data-i18n="settingsRetentionLimitLabel">Maximum retained requests<\/label>/,
    );
    expect(html).toMatch(/id="retentionUnlimited"[^>]*aria-describedby="retentionWarning"/);
    expect(html).toMatch(/id="retentionWarning"[^>]*role="alert"[^>]*hidden/);
    expect(html).toMatch(/id="retentionStatus"[^>]*>cache /);
    expect(html).not.toMatch(/id="retentionStatus"[^>]*>[^<]*Retention /);
    expect(html).toMatch(/id="settingsBtn"[^>]*>🎛️ Settings</);
    expect(html).not.toMatch(/id="retentionStatus"[^>]*(?:role|aria-live)=/);
    expect(html).toMatch(/id="retentionAnnouncement"[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
    expect(css).toMatch(/#settingsDialog\{[^}]*width:min\(420px,calc\(100vw - 16px\)\)[^}]*overflow:auto/);
  });

  test('persists named budgets and routes live and imported rows through one policy', () => {
    expect(js).toContain('const DEFAULT_REQUEST_RETENTION_LIMIT = 20000;');
    expect(js).toContain('const AUTOMATIC_RESPONSE_PREFETCH_CONCURRENCY = 4;');
    expect(js).toContain('const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;');
    expect(js).toContain('const MAX_RESPONSE_CACHE_BYTES = 32 * 1024 * 1024;');
    expect(js).toContain("const RETENTION_KEY = 'networkPlus.retention.v1';");
    expect(js).toContain("addRowsWithRetention(stagedImport.rows, 'import')");
    expect(js).toContain("addRowsWithRetention(queuedRows, 'live')");
    const clearBlock = js.slice(js.indexOf("clearButton.addEventListener('click'"), js.indexOf('// Pause/Resume'));
    expect(clearBlock).toContain('detachStoredRowsForClearUndo();');
    expect(clearBlock).not.toContain('state.nextId = 1');
  });

  test('uses constant-time row liveness and bounded import construction', () => {
    expect(js).toContain('retainedRows: new Set()');
    expect(js).toContain('activeRows: new Set()');
    expect(js).not.toContain('state.rows.includes(row)');
    expect(js).not.toContain('const importedRows = []');
    expect(js).toContain('const importPlan = planImportRetention(');
    expect(js).toContain('const extractedEntries = new Map();');
    expect(js).toContain('unzip.register(fflate.UnzipInflate);');
    expect(js).toContain('sourceOffset + SAZ_SOURCE_CHUNK_BYTES');
    expect(js).toContain('activeFileCount < MAX_SAZ_CONCURRENT_EXTRACTIONS');
    expect(js).not.toContain('AsyncUnzipInflate');
    expect(js).not.toContain('window.fflate.unzipSync');
    expect(js).toContain("const renderedRows = $('#tbody') ? $all('tr[data-row-id]', $('#tbody')) : [];");
    expect(js).not.toContain("document.querySelector('tr[data-row-id=\"' + row.id");
  });

  test('keeps imports atomic, bounded, and single-flight', () => {
    expect(html).toMatch(/id="importBtn"[^>]*aria-busy="false"/);
    expect(js).toContain('const commitStagedImport = (stagedImport) => {');
    expect(js).toContain('const stagedImport =');
    expect(js.indexOf('const stagedImport =')).toBeLessThan(js.indexOf('commitStagedImport(stagedImport)'));
    expect(js).toContain('let importInProgress = false;');
    expect(js).toContain('importBtn.disabled = busy;');
    expect(js).toContain("importBtn.setAttribute('aria-busy', busy ? 'true' : 'false');");
    expect(js).toContain('importFile.value = \'\';');
    expect(js).toContain('MAX_IMPORT_SOURCE_BYTES = 32 * 1024 * 1024');
    expect(js).toContain('MAX_SAZ_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024');
    expect(js).toContain('MAX_SAZ_CONCURRENT_EXTRACTIONS = 4');
    expect(js).not.toContain("console.error('Failed to parse SAZ pair'");
    // The shared import routine (file picker and mirror transfers alike)
    // must fail without touching capture state.
    const catchBlock = js.slice(
      js.indexOf('} catch (error) {', js.indexOf('importCapturedFile = async (file)')),
      js.indexOf('} finally {', js.indexOf('importCapturedFile = async (file)')),
    );
    expect(catchBlock).not.toContain('clearStoredRows');
    expect(catchBlock).not.toContain('state.paused');
  });

  test('debounces meaningful retention announcements without making cache bytes live', () => {
    expect(js).toContain('const RETENTION_ANNOUNCE_MS = 750;');
    expect(js).toContain("const el = $('#retentionAnnouncement');");
    const statusStart = js.indexOf('function updateRetentionStatus');
    const statusEnd = js.indexOf('function updateTableSummary', statusStart);
    expect(js.slice(statusStart, statusEnd)).not.toContain('queueRetentionAnnouncement');
    expect(js).toContain('const AUTOMATIC_RESPONSE_PREFETCH_FAILURE_DEBOUNCE_MS = 750;');
    expect(js).toContain('const AUTOMATIC_RESPONSE_PREFETCH_FAILURE_MAX_WAIT_MS = 5000;');
    expect(js).toContain('formatAutomaticResponsePrefetchFailureSummary(failureCount)');
  });

  test('bounds only automatic prefetch while foreground work shares or bypasses the queue', () => {
    const schedulerStart = js.indexOf('function createAutomaticResponsePrefetchScheduler');
    const schedulerEnd = js.indexOf('function cancelAutomaticResponsePrefetchRows', schedulerStart);
    const schedulerBlock = js.slice(schedulerStart, schedulerEnd);
    expect(schedulerBlock).toContain('const queuedRows = new Map();');
    expect(schedulerBlock).toContain('const backgroundRows = new Map();');
    expect(schedulerBlock).toContain('const observedForegroundRows = new Map();');
    expect(schedulerBlock).toContain('const pendingFailureRows = new Set();');
    expect(schedulerBlock).toContain('while (backgroundRows.size < concurrency)');
    expect(schedulerBlock).toContain('observeForegroundPromise(row, existingPromise);');
    expect(schedulerBlock).toContain('entry.row = null;');
    expect(schedulerBlock).toContain('.catch(reportInternalError)');
    expect(schedulerBlock).toContain('const resumeRows = (rows) => {');
    expect(schedulerBlock).toContain('const markRecovered = (row) => {');

    const cleanupStart = js.indexOf('function cleanupEvictedRowReferences');
    const cleanupEnd = js.indexOf('function removeRowsFromState', cleanupStart);
    expect(js.slice(cleanupStart, cleanupEnd)).toContain(
      'cancelAutomaticResponsePrefetchRows(evictedRows, false);',
    );
    const detachStart = js.indexOf('function detachStoredRowsForClearUndo');
    const detachEnd = js.indexOf('function updateClearUndoAction', detachStart);
    expect(js.slice(detachStart, detachEnd)).toContain(
      'cancelAutomaticResponsePrefetchRows(state.rows, true);',
    );
    const restoreStart = js.indexOf('const restoreClearUndoSnapshot = (snapshot) => {');
    const restoreEnd = js.indexOf('// [U4] Clear', restoreStart);
    expect(js.slice(restoreStart, restoreEnd)).toContain(
      'state.automaticResponsePrefetchScheduler.resumeRows(restorePlan.rows);',
    );

    const detailsStart = js.indexOf('function selectRow');
    const detailsEnd = js.indexOf('// Section 14: Export', detailsStart);
    const detailsBlock = js.slice(detailsStart, detailsEnd);
    expect(detailsBlock).toContain('cacheResponseContent(row)');
    expect(detailsBlock).toContain('Response-body retry failed for request ');
    expect(detailsBlock).toContain('. Open Response > Body for details.');
    expect(detailsBlock).toContain("'. Open Response > Body for details.',\n            true,");
    expect(js).toContain('const pending = fetchResponsePayload(row);');
    expect(js).toContain('let statusGeneration = 0;');
    expect(js).toContain('if (failureStatusGeneration === statusGeneration)');
    const statusStart = js.indexOf('function setStatus');
    const statusEnd = js.indexOf('let requestCountAnnouncementTimer', statusStart);
    const statusBlock = js.slice(statusStart, statusEnd);
    expect(statusBlock.indexOf('statusGeneration += 1;')).toBeLessThan(
      statusBlock.indexOf('planStatusAnnouncement('),
    );
    expect(statusBlock).toContain('if (statusGeneration === generation) el.textContent = plan.text;');
  });

  test('keeps the retention presentation in the status tooltip now that Settings holds the limit', () => {
    const statusStart = js.indexOf('function updateRetentionStatus');
    const statusEnd = js.indexOf('function updateTableSummary', statusStart);
    const statusSource = js.slice(statusStart, statusEnd);
    expect(statusSource).toContain(
      'const presentation = getRetentionPresentation(retention.requestLimit, retention.unlimited);',
    );
    expect(statusSource).toContain("'Retention: ' + presentation.policyLabel");
    // The toolbar button became the Settings opener; nothing relabels it.
    expect(statusSource).not.toContain('buttonLabel');
    expect(statusSource).not.toContain("$('#settingsBtn')");
  });

  test('marks unavailable HAR content and incomplete body search explicitly', () => {
    expect(js).toContain('content._networkPlus = {');
    expect(js).toContain('Redacted and omitted bodies are explicitly marked and are not complete source content.');
    expect(js).toContain('state.visibleBytes = Math.max(0, state.visibleBytes - evictedVisibleBytes);');
    expect(js).toContain('if (!shouldRenderSelectedRow(state.selectedRow, row)) return;');
    expect(js).toContain('renderCachedResponseContent(row);');
    expect(js).toContain("' bodies not searched'");
    expect(js).toContain("releaseResponseContent(row, 'row-evicted', false);");
  });
});

describe('scroll targets clear their sticky furniture', () => {
  // scrollIntoView stops once the target is inside the scrollport, and the
  // scrollport includes the strip a position:sticky element sits on top of, so
  // a hit landed underneath and looked like it had not moved. Measured, the
  // grid row came to rest 29px above the header's bottom edge.
  test('the grid and the panes inset their scrollport past the sticky element', () => {
    const wrap = css.match(/\.tableWrap\{([^}]*)\}/);
    expect(wrap).not.toBeNull();
    expect(wrap[1]).toContain('scroll-padding-top:30px');
    const pane = css.match(/\.tab-pane\{([^}]*)\}/);
    expect(pane).not.toBeNull();
    expect(pane[1]).toContain('scroll-padding-bottom:32px');
  });

  // The request line people copy out of the panel must not carry the response
  // status: it put "200 GET https://…" on the clipboard.
  test('the details header states the request line without the response status', () => {
    expect(js).toContain("if (row.method) titleParts.push(row.method);");
    expect(js).not.toContain('if (row.status) titleParts.push(String(row.status));');
  });

  // Turning auto-scroll on used to flip a flag and move nothing.
  test('enabling auto-scroll jumps to the newest row', () => {
    expect(js).toContain('if (state.autoScroll && scrollGridToNewest) scrollGridToNewest();');
    expect(js).toContain('scrollGridToNewest = () => {');
  });
});

describe('Japanese line breaking', () => {
  // overflow-wrap:anywhere offers a break at every character, so Japanese prose
  // split mid-word — ブラ|ウザ, プラッ|トフォーム, 知るこ|とも. Dialog prose uses
  // phrase-aware breaking, with break-word left as the emergency valve for a
  // token too long for its line.
  const ruleBody = (selector) => {
    const marker = selector + '{';
    const at = css.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    return css.slice(at + marker.length, css.indexOf('}', at));
  };

  // The support dialog also balances its lines: without it the intro left
  // 「なります。」 alone on a five-character second line.
  test('the support dialog balances its prose lines', () => {
    expect(ruleBody('.support-form p')).toContain('text-wrap:balance');
  });

  test('dialog prose breaks by phrase, never at an arbitrary character', () => {
    for (const selector of [
      '.support-form p',
      '.support-option-hint',
      '.shortcut-support-summary p',
      '.sample-guide-form p',
    ]) {
      const body = ruleBody(selector);
      expect(body).toContain('word-break:auto-phrase');
      expect(body).toContain('overflow-wrap:break-word');
      expect(body).not.toContain('overflow-wrap:anywhere');
    }
  });

  // Phrase-aware breaking analyses text in the document language, and a screen
  // reader needs it too; the panel shipped Japanese prose under lang="en".
  test('the active language is published on the document element', () => {
    expect(js).toContain('document.documentElement.lang = activeLanguage;');
  });
});

describe('translation coverage', () => {
  // A label tagged for translation but missing from the dictionary silently
  // renders English, which is exactly how "Maximum retained requests" stayed
  // English in a Japanese panel. Tagging and translating must stay in step.
  test('every data-i18n key in the markup has both an en and a ja string', () => {
    const used = new Set(
      Array.from(html.matchAll(/data-i18n(?:-title)?="([^"]+)"/g), (match) => match[1]),
    );
    expect(used.size).toBeGreaterThan(100);
    const dictionaryStart = js.indexOf('const UI_TEXT = {');
    expect(dictionaryStart).toBeGreaterThan(-1);
    const dictionary = js.slice(dictionaryStart, js.indexOf('\n  };', dictionaryStart));
    const translated = new Set(
      Array.from(
        dictionary.matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*): \{\n {6}en: .+,\n {6}ja: .+,\n {4}\},/gm),
        (match) => match[1],
      ),
    );
    expect(Array.from(used).filter((key) => !translated.has(key))).toEqual([]);
  });

  // The Settings dialog owns controls, not just prose: its checkbox label wraps
  // the text in a span so applying a translation cannot replace the input.
  test('labels that contain inputs translate a span, never the label itself', () => {
    for (const label of html.match(/<label[^>]*>[\s\S]*?<\/label>/g) || []) {
      if (!/<input/.test(label)) continue;
      expect(label).not.toMatch(/<label[^>]*data-i18n=/);
    }
    expect(html).toContain(
      '<span data-i18n="settingsRetentionUnlimitedLabel">Keep unlimited requests</span>',
    );
  });
});

describe('settings and language contracts', () => {
  test('the Settings dialog gathers language, theme, and retention with instant-apply selects', () => {
    expect(html).toMatch(/id="langSelect"[^>]*aria-describedby="langHelp"/);
    expect(html).toContain('<option value="ja">日本語</option>');
    expect(html).toMatch(/id="themeSelect"/);
    expect(html).toContain('<option value="dark" data-i18n="settingsOptionDark">Dark</option>');
    expect(js).toContain("const LANG_KEY = 'networkPlus.lang';");
    expect(js).toContain("const LANGS = ['system', 'en', 'ja'];");
    // Selects apply immediately; retention keeps its explicit Save button.
    expect(js).toContain('saveThemePref(chosen);');
    expect(js).toContain('saveLangPref(chosen);');
    expect(js).toContain("$('#settingsCloseBtn').addEventListener('click', () => settingsDialog.close());");
    expect(html).toMatch(/id="retentionSaveBtn"[^>]*>Save retention</);
  });

  test('only explanations translate: data-i18n swaps text and control labels stay English', () => {
    // The resolver honors an explicit choice and derives system from the browser.
    expect(js).toContain("if (pref === 'en' || pref === 'ja') return pref;");
    expect(js).toContain("/^ja([-_]|$)/i.test(String(nav || '')) ? 'ja' : 'en'");
    // The applier rewrites only data-i18n text nodes, so labels never translate.
    expect(js).toContain("document.querySelectorAll('[data-i18n]')");
    expect(js).toContain('el.textContent = entry[activeLanguage];');
    // A Japanese translation actually ships, including the critical stream warning.
    expect(js).toContain('DevTools を閉じるとキャプチャが止まり、このタブの更新も停止します。');
    // The authored English fallback matches the dictionary for the same key.
    expect(html).toContain('⚠️ Closing DevTools stops capture and freezes this tab.');
    expect(js).toContain("en: '⚠️ Closing DevTools stops capture and freezes this tab.',");
    // Language persists like the theme through one shared preference
    // machine: extension storage first, localStorage fallback.
    expect(js).toContain("loadStoredPref(LANG_KEY, 'Language', cb);");
    expect(js).toContain("saveStoredPref(LANG_KEY, 'Language', v);");
    expect(js).toContain("done(localStorage.getItem(key) || 'system');");
    expect(js).toContain('localStorage.setItem(key, v);');
  });

  test('every data-i18n key resolves to a complete dictionary entry', () => {
    // A dialog added with a typoed or missing key would silently ship
    // untranslated; this closes that gap deterministically.
    const htmlKeys = Array.from(html.matchAll(/data-i18n="([^"]+)"/g)).map((match) => match[1]);
    expect(htmlKeys.length).toBeGreaterThanOrEqual(32);
    const titleKeys = Array.from(html.matchAll(/data-i18n-title="([^"]+)"/g)).map(
      (match) => match[1],
    );
    expect(titleKeys.length).toBeGreaterThanOrEqual(17);
    // Strings the panel composes in JavaScript resolve through uiText(key);
    // a typoed key there would fall back to empty text just as silently.
    const uiTextKeys = Array.from(js.matchAll(/uiText\('(\w+)'\)/g)).map((match) => match[1]);
    expect(uiTextKeys.length).toBeGreaterThanOrEqual(10);
    const dictStart = js.indexOf('const UI_TEXT = {');
    expect(dictStart).toBeGreaterThan(-1);
    const dict = js.slice(dictStart, js.indexOf('\n  };', dictStart));
    const dictKeys = Array.from(dict.matchAll(/^ {4}(\w+): \{/gm)).map((match) => match[1]);
    for (const key of [...htmlKeys, ...titleKeys, ...uiTextKeys]) {
      expect(dictKeys).toContain(key);
    }
    for (const key of dictKeys) {
      const entry = dict.slice(dict.indexOf('    ' + key + ': {'));
      const body = entry.slice(0, entry.indexOf('},'));
      // en is a string literal or a reference to the canonical English
      // constant (the reason/timing texts also ship inside rows and exports).
      expect(body).toMatch(/en: ['"A-Z]/);
      expect(body).toMatch(/ja: ['"]/);
    }
  });

  test('tooltips and JS-composed strings translate through the same dictionary', () => {
    // Static tooltips carry data-i18n-title; dynamic titles (pause, undo,
    // retention) are JS-composed and deliberately keep their English text.
    expect(js).toContain("document.querySelectorAll('[data-i18n-title]')");
    expect(js).toContain("UI_TEXT[el.getAttribute('data-i18n-title')]");
    expect(js).toContain('el.title = entry[activeLanguage];');
    expect(html).not.toMatch(/id="pauseBtn"[^>]*data-i18n-title/);
    expect(html).not.toMatch(/id="undoClearBtn"[^>]*data-i18n-title/);
    // The empty state re-renders in place on a language change: the render
    // key includes the active language and applyLanguage triggers a refresh.
    expect(js).toContain(
      "const renderKey = mode + ':' + (state.paused ? 'paused' : 'recording') + ':' + activeLanguage;",
    );
    expect(js).toContain('refreshEmptyStateLanguage();');
    expect(js).toContain('updateEmptyState(lastEmptyStateRowCount);');
    // Stored body-unavailability reasons stay canonical English on the row
    // and translate only where rendered.
    expect(js).toContain(
      "setResponsePaneMessage('(response body ' + display.label + ': ' + localizeBodyReason(display.reason) + ')');",
    );
    expect(js).toContain('const key = LOCALIZED_REASON_KEYS.get(reason);');
    expect(js).toContain('en: NAVIGATION_BODY_UNAVAILABLE_REASON,');
    expect(js).toContain('en: TIMING_EVIDENCE_LIMITATION,');
  });

  test('the undock hint teaches visually: warning card, steps card, and a dock-side icon row', () => {
    expect(html).toContain('class="undock-hint-steps-card"');
    expect(html).toContain('class="undock-dockrow" aria-hidden="true"');
    expect(html).toContain('class="undock-dock-icon undock-dock-target"');
    expect(css).toMatch(/\.undock-hint-warning\{[^}]*border:1px solid var\(--status-5xx-text\)/);
    expect(css).toContain('.dock-glyph-undock::before');
  });
});


describe('release trust static contracts', () => {
  test('gives every dynamic search and filter field a contextual accessible name', () => {
    expect(js).toContain("input.setAttribute('aria-label', 'Search keyword ' + (i + 1));");
    expect(js).toContain("startInput.setAttribute('aria-label', columnLabel + ' filter start time');");
    expect(js).toContain("endInput.setAttribute('aria-label', columnLabel + ' filter end time');");
    // URL advanced fields route their accessible names through the shared field builder.
    expect(js).toContain("input.setAttribute('aria-label', ariaLabel);");
    expect(js).toContain("'URL filter Include any',");
    expect(js).toContain("'URL filter Include all',");
    expect(js).toContain("'URL filter Exclude any',");
    expect(js).toContain("opSelect.setAttribute('aria-label', columnLabel + ' filter condition ' + (idx + 1) + ' operator');");
    expect(js).toContain("input.setAttribute('aria-label', columnLabel + ' filter condition ' + (idx + 1) + ' value');");
    expect(js).toContain("removeBtn.setAttribute('aria-label', 'Remove ' + columnLabel + ' filter condition ' + (idx + 1));");
    expect(js).toContain("opSelect.setAttribute('aria-label', columnLabel + ' filter operator');");
    expect(js).toContain("input.setAttribute('aria-label', columnLabel + ' filter value');");
    expect(js).toContain("prevBtn.setAttribute('aria-label', 'Previous match for search keyword ' + (i + 1));");
    expect(js).toContain("nextBtn.setAttribute('aria-label', 'Next match for search keyword ' + (i + 1));");
    expect(js).toContain("removeBtn.setAttribute('aria-label', 'Remove search keyword ' + (i + 1));");
  });

  test('renders selected response details only from the guarded shared cache', () => {
    const selectStart = js.indexOf('function selectRow');
    const selectEnd = js.indexOf('// Section 14: Export', selectStart);
    const selectBlock = js.slice(selectStart, selectEnd);
    expect(selectBlock).toContain('cacheResponseContent(row)');
    expect(selectBlock).toContain('shouldRenderSelectedRow(state.selectedRow, cachedRow)');
    expect(selectBlock).toContain('shouldRenderSelectedRow(state.selectedRow, row)');
    expect(selectBlock).toContain('renderCachedResponseContent(cachedRow)');
    expect(selectBlock).not.toContain('row._reqObj.getContent');
    expect(js).toContain("iframe.sandbox = '';");
    expect(js).toContain("iframe.title = 'Response HTML preview';");
    expect(js).toContain("if (row.responseContentState !== 'cached')");
    expect(js).toContain("img.alt = 'Response image preview';");
    // The preview is still gated on holding real image bytes, but the MIME now
    // comes from the Content-Type header (guessMimeType) rather than the HAR
    // record: rows whose recorded type arrives as `x-unknown` still carry the
    // declared type in their headers, and those are exactly the rows that
    // previously fell through to "(no preview available)".
    expect(js).toContain("const previewMime = guessMimeType(row);");
    expect(js).toContain("if (encoding === 'base64' && rawContent && /^image\\//i.test(previewMime))");
  });

  test('shows bytes that are not text as a hex dump instead of decoder mojibake', () => {
    // A GIF pushed through TextDecoder comes back as `GIF89a` plus replacement
    // characters. These pin the escape hatch: detect it, and only claim a dump
    // where the real bytes exist (a base64 body), never from the lossy text.
    expect(js).toContain('function isUndecodableBodyText(text)');
    expect(js).toContain("encoding === 'base64' && rawContent && isUndecodableBodyText(text)");
    expect(js).toContain('? describeBinaryResponseBody(rawContent)');
    expect(js).toContain('const displayText = binaryDump ? binaryDump.text : text;');
    // Body, Raw and the truncation affordance all read the same display text,
    // so no pane can be left rendering the mojibake the others escaped.
    expect(js).toContain('buildRawResponseText(row, displayText)');
    expect(js).toContain("bodyPre.className = binaryDump ? 'code-block hex-dump' : 'code-block';");
    // A dump silently cut at the cap reads as the whole body.
    expect(js).toContain('truncated: dump.shownBytes < dump.totalBytes,');

    const dumpStart = js.indexOf('function formatHexDump');
    const dumpEnd = js.indexOf('function base64ByteLength', dumpStart);
    const dumpBlock = js.slice(dumpStart, dumpEnd);
    expect(dumpBlock).toContain("offset.toString(16).padStart(8, '0')");
    // The printable gutter is the half that makes a binary body legible.
    expect(dumpBlock).toContain("ascii += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.';");
  });

  test('keeps a tracking pixel visible instead of rendering an invisible dot', () => {
    // A 1x1 transparent GIF drawn at its intrinsic size leaves the pane
    // looking empty, which is the defect this replaces. The checkerboard gives
    // transparency a ground, and the zoom is stated so it cannot be read as
    // the image's real size.
    expect(css).toMatch(/\.image-preview-stage\{[^}]*background-image:linear-gradient/);
    expect(js).toContain("facts.push(uiText('imagePreviewZoom') + ' ' + zoom + '×');");
    expect(js).toContain("const facts = [mime, width + ' × ' + height + ' px', fmtBytes(byteLength)];");
    // Only the width is set, so clamping a wide image cannot squash its aspect
    // ratio, and the zoom is bounded by the box as well as by visibility.
    expect(js).toContain("img.style.width = width * zoom + 'px';");
    expect(js).not.toContain("img.style.height = height * zoom + 'px';");
    expect(js).toContain('Math.floor(IMAGE_PREVIEW_MAX_EDGE / largestEdge),');
    expect(css).toMatch(/\.image-preview-stage img\{[^}]*height:auto/);
    // A hex dump only reads as columns while the columns survive.
    expect(css).toMatch(/\.code-block\.hex-dump\{[^}]*white-space:pre[;}]/);
  });

  test('coalesces late live-body search refreshes without resetting navigation', () => {
    const scheduleStart = js.indexOf('const scheduleResponseSearchRefresh');
    const scheduleEnd = js.indexOf('const scheduleLiveRows', scheduleStart);
    const scheduleBlock = js.slice(scheduleStart, scheduleEnd);
    expect(scheduleBlock).toContain('pendingResponseSearchFrame');
    expect(scheduleBlock).toContain('window.requestAnimationFrame');
    expect(scheduleBlock).toContain('hasActiveSearchKeywords(state.search.keywords)');
    expect(scheduleBlock).toContain('renderBody();');
    expect(scheduleBlock).toContain('updateSearchUI();');
    expect(scheduleBlock).toContain('onSettled: (row, error, source, result) => {');
    expect(scheduleBlock).toContain('scheduleResponseSearchRefresh(row);');

    const refreshStart = js.indexOf('function refreshSearchMatches');
    const refreshEnd = js.indexOf('function updateEmptyState', refreshStart);
    const refreshBlock = js.slice(refreshStart, refreshEnd);
    expect(refreshBlock).toContain('preserveMatchingRowIndex');
    expect(refreshBlock).not.toContain('srch.currentIndex = srch.matches.length > 0 ? 0 : -1');
  });
});

describe('scale trust static contracts', () => {
  test('coalesces one bounded live fallback and cancels it before any commit drains pending rows', () => {
    expect(() => assertLiveCommitFallbackContract(js)).not.toThrow();
  });

  test.each([
    {
      label: 'maximum wait deletion',
      mutate: (source) => source.replace('  const LIVE_COMMIT_MAX_WAIT_MS = 250;\n', ''),
    },
    {
      label: 'pending high-water deletion',
      mutate: (source) =>
        source.replace('  const LIVE_PENDING_HIGH_WATER_MARK = 5000;\n', ''),
    },
    {
      label: 'shared timer deletion',
      mutate: (source) => source.replace('  let pendingLiveCommitTimer = null;\n', ''),
    },
    {
      label: 'timer guard deletion',
      mutate: (source) =>
        source.replace('    if (pendingLiveCommitTimer !== null) return;\n', ''),
    },
    {
      label: 'timer clear deletion',
      mutate: (source) => source.replace('    clearTimeout(pendingLiveCommitTimer);\n', ''),
    },
    {
      label: 'callback ordering reversal',
      mutate: (source) =>
        source.replace(
          '      pendingLiveCommitTimer = null;\n      commitPendingLiveRows();',
          '      commitPendingLiveRows();\n      pendingLiveCommitTimer = null;',
        ),
    },
    {
      label: 'commit cancellation deletion',
      mutate: (source) =>
        source.replace(
          '  function commitPendingLiveRows() {\n    cancelPendingLiveCommitTimer();',
          '  function commitPendingLiveRows() {',
        ),
    },
    {
      label: 'fallback arm deletion',
      mutate: (source) => source.replace('      armPendingLiveCommitTimer();\n', ''),
    },
    {
      label: 'high-water commit deletion',
      mutate: (source) =>
        source.replace(
          '      if (pendingLiveRows.length >= LIVE_PENDING_HIGH_WATER_MARK) {\n' +
            '        commitPendingLiveRows();\n' +
            '      }\n',
          '',
        ),
    },
    {
      label: 'pending timer ownership deletion',
      mutate: (source) =>
        source.replace(
          '      if (pendingLiveRows.length > 0) {\n' +
            '        armPendingLiveCommitTimer();\n' +
            '      }',
          '      armPendingLiveCommitTimer();',
        ),
    },
    {
      label: 'high-water and timer ordering reversal',
      mutate: (source) =>
        source.replace(
          '      if (pendingLiveRows.length >= LIVE_PENDING_HIGH_WATER_MARK) {\n' +
            '        commitPendingLiveRows();\n' +
            '      }\n' +
            '      if (pendingLiveRows.length > 0) {\n' +
            '        armPendingLiveCommitTimer();\n' +
            '      }',
          '      if (pendingLiveRows.length > 0) {\n' +
            '        armPendingLiveCommitTimer();\n' +
            '      }\n' +
            '      if (pendingLiveRows.length >= LIVE_PENDING_HIGH_WATER_MARK) {\n' +
            '        commitPendingLiveRows();\n' +
            '      }',
        ),
    },
    {
      label: 'frame commit deletion',
      mutate: (source) =>
        source.replace(
          '        pendingScrollToBottom = false;\n        commitPendingLiveRows();',
          '        pendingScrollToBottom = false;',
        ),
    },
  ])('rejects live fallback $label', ({ mutate }) => {
    const mutatedSource = mutate(js);
    expect(mutatedSource).not.toBe(js);
    expect(() => assertLiveCommitFallbackContract(mutatedSource)).toThrow();
  });

  test('batches live retention and retained-only prefetch before one incremental frame update', () => {
    const scheduleStart = js.indexOf('const scheduleLiveRows =');
    const listenerStart = js.indexOf('if (chrome && chrome.devtools', scheduleStart);
    const listenerEnd = js.indexOf('// Error handlers', listenerStart);
    const frameBlock = js.slice(scheduleStart, listenerStart);
    const listenerBlock = js.slice(listenerStart, listenerEnd);
    const commitStart = js.indexOf('function commitPendingLiveRows');
    const commitEnd = js.indexOf('function recordSkippedImportRows', commitStart);
    const commitBlock = js.slice(commitStart, commitEnd);
    expect(listenerBlock).toContain('pendingLiveRows.push(row);');
    expect(listenerBlock).not.toContain('addRowsWithRetention(');
    expect(listenerBlock).not.toContain('automaticResponsePrefetchScheduler.enqueue(');
    expect(commitBlock).toContain("const liveRows = addRowsWithRetention(queuedRows, 'live');");
    expect(commitBlock.match(/addRowsWithRetention\(/g)).toHaveLength(1);
    expect(commitBlock).toContain('for (const row of liveRows)');
    expect(commitBlock).toContain('state.automaticResponsePrefetchScheduler.enqueue(row);');
    expect(commitBlock).toContain('state.liveRowsAwaitingRender.push(...liveRows);');
    expect(commitBlock.indexOf("addRowsWithRetention(queuedRows, 'live')")).toBeLessThan(
      commitBlock.indexOf('state.automaticResponsePrefetchScheduler.enqueue(row);'),
    );
    expect(frameBlock).toContain('commitPendingLiveRows();');
    expect(frameBlock).toContain('const liveRows = state.liveRowsAwaitingRender');
    expect(frameBlock.match(/commitPendingLiveRows\(\)/g)).toHaveLength(2);
    expect(frameBlock).toContain('isIncrementalAppendEligible(');
    const cleanupStart = js.indexOf('function cleanupEvictedRowReferences');
    const cleanupEnd = js.indexOf('function removeRowsFromState', cleanupStart);
    expect(js.slice(cleanupStart, cleanupEnd)).toContain(
      'state.liveRowsAwaitingRender = state.liveRowsAwaitingRender.filter',
    );
    const resetStart = js.indexOf('const resetPendingLiveRows =');
    const resetEnd = js.indexOf('// Theme init', resetStart);
    expect(js.slice(resetStart, resetEnd)).toContain('state.liveRowsAwaitingRender.length = 0;');

    const appendBlock = js.slice(js.indexOf('function appendIncrementalRows'), js.indexOf('function replaceRenderedRowStates'));
    expect(appendBlock).toContain('document.createDocumentFragment()');
    expect(appendBlock).not.toContain('tbody.textContent =');
    expect(appendBlock).toContain('getIncrementalAppendBatch(liveRows, renderedRowIds)');

    expect(js).toContain('renderedRow.replaceWith(replacement);');
    const selectionBlock = js.slice(js.indexOf('function selectRow'), js.indexOf('const titleParts', js.indexOf('function selectRow')));
    expect(selectionBlock).toContain('replaceRenderedRowStates');
  });

  test('commits pending live rows before stateful action boundaries inspect capture state', () => {
    // The dialog Save button routes through applyRetentionSetting, which is
    // also the mirror tab's remote retention entry point.
    const retentionSaveStart = js.indexOf('applyRetentionSetting = (requestedSetting) => {');
    const retentionSaveEnd = js.indexOf('// [U4] Clear', retentionSaveStart);
    const clearStart = js.indexOf("clearButton.addEventListener('click'");
    const clearEnd = js.indexOf("undoClearButton.addEventListener('click'", clearStart);
    const undoStart = clearEnd;
    const undoEnd = js.indexOf('// Pause/Resume', undoStart);
    const importStart = js.indexOf('const commitStagedImport =');
    const importEnd = js.indexOf("importBtn.addEventListener('click'", importStart);
    const sampleStart = js.indexOf('function activateSampleCapture');
    const sampleEnd = js.indexOf('function updateEmptyState', sampleStart);

    expect(js.slice(retentionSaveStart, retentionSaveEnd)).toMatch(
      /commitPendingLiveRows\(\);[\s\S]*state\.retention\.requestLimit =/,
    );
    expect(js.slice(clearStart, clearEnd)).toMatch(
      /commitPendingLiveRows\(\);[\s\S]*createClearUndoSnapshot\(/,
    );
    expect(js.slice(undoStart, undoEnd)).toMatch(
      /commitPendingLiveRows\(\);[\s\S]*consumeClearUndoSnapshot\('undo'\)/,
    );
    expect(js.slice(importStart, importEnd)).toMatch(
      /commitPendingLiveRows\(\);[\s\S]*clearStoredRows\(\)/,
    );
    expect(js.slice(sampleStart, sampleEnd)).toMatch(
      /commitPendingLiveRows\(\);[\s\S]*enterSampleCaptureMode\(\)/,
    );
    for (const boundary of LIVE_COMMIT_BOUNDARIES) {
      expect(() => assertLiveCommitBoundary(js, boundary)).not.toThrow();
    }
  });

  test.each(LIVE_COMMIT_BOUNDARIES)(
    '$label boundary guard rejects deletion of commitPendingLiveRows',
    (boundary) => {
      const { block, end, start } = getLiveCommitBoundarySlice(js, boundary);
      const mutatedBlock = block.replace('commitPendingLiveRows();', '');
      expect(mutatedBlock).not.toBe(block);
      const mutatedSource = js.slice(0, start) + mutatedBlock + js.slice(end);

      expect(() => assertLiveCommitBoundary(mutatedSource, boundary)).toThrow(
        new Error(boundary.diagnostic),
      );
    },
  );

  test('navigates search matches through targeted row replacement without full-table rendering', () => {
    const scrollStart = js.indexOf('function scrollToSearchMatch');
    const navigationStart = js.indexOf('function navigateKeywordSearch');
    const navigationEnd = js.indexOf("searchToggleBtn.addEventListener('click'", navigationStart);
    const scrollBlock = js.slice(scrollStart, navigationStart);
    const navigationBlock = js.slice(navigationStart, navigationEnd);
    const selectionStart = js.indexOf('function selectRow');
    const selectionEnd = js.indexOf('const titleParts', selectionStart);
    const selectionBlock = js.slice(selectionStart, selectionEnd);

    expect(navigationBlock).toContain('planKeywordSearchNavigation(');
    expect(navigationBlock).toContain('selectRow(navigation.targetRow, null, false, [previousCurrentRow]);');
    expect(navigationBlock).toContain('scrollToSearchMatch(navigation.targetRow);');
    expect(navigationBlock).not.toContain('renderBody();');
    expect(scrollBlock).not.toContain('renderBody();');
    expect(scrollBlock).not.toContain('selectRow(');
    const searchRowsStart = js.indexOf('function renderSearchRows');
    const searchRowsEnd = js.indexOf("searchAddBtn.addEventListener('click'", searchRowsStart);
    const searchRowsBlock = js.slice(searchRowsStart, searchRowsEnd);
    expect(searchRowsBlock).toContain("activeEl.classList.contains('search-kw-nav')");
    expect(searchRowsBlock).toContain('prevBtn.dataset.searchDirection = \'-1\';');
    expect(searchRowsBlock).toContain('nextBtn.dataset.searchDirection = \'1\';');
    expect(searchRowsBlock).toContain('if (navButton) navButton.focus();');
    expect(selectionBlock).toContain('...state.selectedRows');
    expect(selectionBlock).toContain('extraAffectedRows');
    expect(selectionBlock).toContain('if (!replaceRenderedRowStates(affectedRows)) renderBody();');
    const replacementStart = js.indexOf('function replaceRenderedRowStates');
    const replacementEnd = js.indexOf('function renderBody', replacementStart);
    const replacementBlock = js.slice(replacementStart, replacementEnd);
    expect(replacementBlock).toContain("const previousTabStop = tbody.querySelector('tr[tabindex=\"0\"]');");
    expect(replacementBlock).toContain('previousTabStop.tabIndex = -1;');
    expect(replacementBlock).toContain('nextTabStop.tabIndex = 0;');
    expect(js).not.toMatch(/renderBody\(\);[\s\S]{0,300}scrollToSearchMatch\([^)]*\);[\s\S]{0,300}renderBody\(\);/);
  });
});

describe('keyboard trust static contracts', () => {
  test('uses a selectable grid with native cells and stable focusable rows', () => {
    expect(html).toMatch(/<table class="grid" id="grid" role="grid"[^>]*aria-multiselectable="true"/);
    expect(js).toContain("tr.id = 'request-row-' + row.id;");
    expect(js).toContain("tr.setAttribute('role', 'row');");
    expect(js).toContain("td.setAttribute('role', 'gridcell');");
    expect(js).toContain("tr.setAttribute('aria-selected', String(isSelected));");
    expect(js).not.toContain("tr.setAttribute('aria-haspopup'");
    expect(js).not.toContain("tr.setAttribute('aria-expanded'");
    expect(js).not.toContain("tr.setAttribute('aria-label'");
    // td aria-label is only permitted in the waterfall cell for describing decorative bar geometry;
    // it must not appear on other gridcells where textContent already provides the accessible name.
    const waterfallCellStart = js.indexOf("'waterfall-cell'");
    const waterfallCellEnd = js.indexOf('} else {', waterfallCellStart + 1);
    const outsideWaterfall = js.slice(0, waterfallCellStart) + js.slice(waterfallCellEnd);
    expect(outsideWaterfall).not.toContain("td.setAttribute('aria-label'");
    expect(js).toContain('focus({ preventScroll: true })');
    const rowKeyboardBlock = js.slice(js.indexOf("tableWrap.addEventListener('keydown'"), js.indexOf('// Main workbench divider'));
    expect(rowKeyboardBlock).toContain("event.key === 'Enter' || event.key === ' '");
    expect(rowKeyboardBlock).toContain('selectRow(focusedRow, event, true);');
  });

  test('exposes sortable headers and keyboard column reordering', () => {
    expect(js).toContain("th.setAttribute('aria-sort', sortState);");
    expect(js).toContain("th.setAttribute('aria-label', c.label);");
    expect(js).toContain("event.key === 'Enter' || event.key === ' '");
    expect(js).toContain("event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')");
    expect(js).toContain("state.pendingHeaderFocusId = c.id;");
    expect(css).toContain('.title-row th.sortable-header:focus-visible');
  });

  test('makes all four divider classes focusable and keyboard adjustable', () => {
    expect(html).toMatch(/id="resizer"[^>]*role="separator"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="inspector-divider"[^>]*role="separator"[^>]*tabindex="0"[^>]*aria-orientation="horizontal"/);
    expect(js).toContain("columnResizer.setAttribute('role', 'separator');");
    expect(js).toContain("columnResizer.setAttribute('aria-valuenow', String(c.width));");
    expect(js).toContain("adjustMainSplitByKeyboard(currentPrimarySize, totalSize, isNarrow, event.key, event.shiftKey)");
    expect(js).toContain("adjustInspectorSplitByKeyboard(");
    expect(css).toContain('.col-resizer:focus-visible');
  });

  test('keeps workbench separator inset focus rules above the generic tabindex cascade', () => {
    expect(() => assertSeparatorFocusCascade(css)).not.toThrow();
  });

  test.each([
    {
      label: 'main workbench separator',
      winningSelector: '.content .resizer:focus-visible',
      losingSelector: '.resizer:focus-visible',
    },
    {
      label: 'request and response inspector separator',
      winningSelector: '.inspector-panels .inspector-divider:focus-visible',
      losingSelector: '.inspector-divider:focus-visible',
    },
  ])('$label equal-specificity mutation fails with the named cascade reason', ({ winningSelector, losingSelector }) => {
    const fixture = [
      '.content .resizer:focus-visible,.inspector-panels .inspector-divider:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}',
      'button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    ].join('\n');
    const mutatedFixture = fixture.replace(winningSelector, losingSelector);

    expect(() => assertSeparatorFocusCascade(mutatedFixture)).toThrow(
      new Error(
        `${SEPARATOR_FOCUS_CASCADE_CONTRACT}: ${losingSelector} ties [tabindex]:focus-visible at specificity 0-2-0 and appears before the later generic rule, so its -2px outline offset loses to +2px.`,
      ),
    );
  });

  test('omits ineffective scroll margins from request-grid focus targets', () => {
    const deadScrollMarginOwners = ['.title-row th', '.col-resizer'].filter((selector) =>
      /(?:^|;)\s*scroll-margin-inline\s*:/.test(getUniqueCssRuleBlock(selector)),
    );

    expect(deadScrollMarginOwners).toEqual([]);
  });

  test('gives popup triggers matching roles, ownership, focus entry, and restoration', () => {
    expect(html).toMatch(/id="filterBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="columnFilterPopup"/);
    expect(html).toMatch(/id="columnsBtn"[^>]*aria-haspopup="menu"[^>]*aria-controls="columnsMenu"/);
    expect(html).toMatch(/id="searchScopeBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="searchScopePopup"/);
    expect(js).toContain("columnsContextMenu.setAttribute('role', 'menu');");
    expect(js).toContain("filterPopup.setAttribute('role', 'dialog');");
    expect(js).toContain("scopePopup.setAttribute('role', 'dialog');");
    expect(js).toContain("colorPopup.setAttribute('role', 'menu');");
    expect(js).toContain('showAccessiblePopupAt');
    expect(js).toContain('closeAccessiblePopup');
    expect(js).toContain('_networkPlusRestoreFocus');
  });

  test('supports complete row context-menu keyboard behavior', () => {
    expect(js).toContain("event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')");
    expect(js).toContain('suppressNextNativeContextMenuRowId');
    expect(js).toContain("contextMenu.setAttribute('role', 'menu');");
    expect(js).toContain("button.setAttribute('role', 'menuitem');");
    expect(js).toContain("['ArrowUp', 'ArrowDown', 'Home', 'End']");
    expect(js).toContain("event.key === 'Escape'");
    expect(js).toContain('restoreContextMenuFocus');
    expect(js).not.toContain('closeRowContextMenu(false)');
  });
});

describe('outbound data-safety static contracts', () => {
  test('provides one narrow-safe native dialog with explicit per-action warning categories', () => {
    expect(html).toMatch(/<dialog id="dataSafetyDialog"[^>]*aria-labelledby="dataSafetyDialogTitle"[^>]*aria-describedby="dataSafetyDialogDetail"/);
    expect(html).toMatch(/id="dataSafetySanitizedBtn"[^>]*>Export sanitized HAR</);
    expect(html).toMatch(/id="dataSafetyFullBtn"[^>]*>Review full HAR warning</);
    expect(html).toMatch(/id="dataSafetyConfirmBtn"[^>]*hidden>Confirm full output</);
    expect(html).toContain('every URL query and form-like fragment value');
    expect(html).toContain('every header value outside a small structural allowlist');
    expect(html).toContain('Authorization, proxy authorization, custom, security, trace, request-ID, and client-certificate headers');
    expect(html).toContain('Cookie and Set-Cookie values');
    expect(html).toContain('URL usernames, passwords, query values, and fragment values');
    expect(html).toContain('Request and response bodies, including base64 content');
    expect(html).toContain('does not save a full-output preference');
    expect(html).toMatch(/id="dataSafetyStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    expect(css).toMatch(/#dataSafetyDialog\{[^}]*position:fixed[^}]*inset:0[^}]*width:min\(460px,calc\(100vw - 16px\)\)[^}]*max-height:calc\(100vh - 16px\)[^}]*overflow:auto/);
    expect(css).toContain('@media (max-width:420px){.data-safety-choices{grid-template-columns:1fr}');
    // Every non-export mode sets choices.hidden, and `display:grid` outranks
    // the UA hidden rule — the same trap that once left "hidden" toolbar
    // buttons painted. Without this guard a per-action copy confirmation also
    // offers Export sanitized HAR/CSV, which is not what it is confirming.
    expect(js).toContain("choices.hidden = mode !== 'export';");
    expect(css).toContain('.data-safety-choices[hidden]{display:none}');
  });

  test('uses native dialog focus, Escape, close restoration, and debounced polite feedback', () => {
    expect(js).toContain("if (!dialog.open) dialog.showModal();");
    expect(js).toContain("dialog.addEventListener('cancel'");
    expect(js).toContain("dialog.addEventListener('close'");
    expect(js).toContain("if (event.target === dialog) dialog.close('backdrop');");
    expect(js).toContain('if (trigger && trigger.focus && trigger.isConnected !== false) trigger.focus();');
    expect(js).toContain('const DATA_SAFETY_ANNOUNCE_MS = 500;');
    expect(js).toContain("const el = $('#dataSafetyStatus');");
    expect(css).toContain('.data-safety-form button:disabled,.data-safety-form button[aria-busy="true"]');
    expect(css).toContain('button:focus-visible');
  });

  test('routes every clipboard and download sink through the shared policy', () => {
    expect((js.match(/navigator\.clipboard\.writeText/g) || [])).toHaveLength(1);
    expect(js).toContain('function writeClipboardPayload(text, message)');
    expect(js).not.toContain('copyTextWithFeedback');
    expect((js.match(/\.download\s*=/g) || [])).toHaveLength(1);
    expect(js).toContain('anchor.download = filename;');
    expect(js).toContain("? 'network-plus-full' + scopeSuffix + '.har'");
    expect(js).toContain(": 'network-plus-sanitized' + scopeSuffix + '.har'");
    expect(js).toContain("exportScope === 'selected' ? '-selected' : ''");
    expect(js).toContain("const payload = buildClipboardPayload(action, row, { mode: 'sanitized', responseBody });");
    expect(js).toContain("buildMultiRowClipboardPayload(rows, 'summary', { mode: 'sanitized' })");
    expect(js).toContain("['url', 'Copy sanitized URL']");
    expect(js).toContain("['curl', 'Copy sanitized cURL']");
    expect(js).toContain("['fetch', 'Copy sanitized fetch']");
    expect(js).toContain("['powershell', 'Copy sanitized PowerShell']");
    expect((js.match(/label: 'Copy sanitized'/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  test('cannot build full clipboard or HAR output until a confirmation callback runs', () => {
    expect(js).toContain("if (source.mode === 'full') {");
    expect(js).toContain("if (!isFullOutputAuthorized(source)) throw new Error('Full output requires per-action confirmation.');");
    expect(js).toMatch(/onConfirm: \(\) => \{\s*const payload = buildClipboardPayload\(action, row, \{\s*mode: 'full',\s*confirmed: true,/s);
    expect(js).toContain("onConfirm: () => exportHAR({ mode: 'full', confirmed: true, scope })");
    expect(js).toContain("exportHAR({ mode: 'sanitized', scope });");
    expect(js).not.toMatch(/addEventListener\('click',\s*exportHAR\)/);
    expect(js).not.toMatch(/localStorage\.(?:setItem|getItem)\([^)]*(?:full|safety)/i);
  });

  test('fails clipboard, download, and sanitizer errors closed without secret-bearing logs', () => {
    expect(js).toContain('Clipboard copy failed. No data was copied.');
    expect(js).toContain('Sanitized copy failed closed. No data was copied.');
    // Failure categories stay static text: the sanitizer fail-closed case
    // and the generic build failure each get their own message, and the
    // raw error never reaches the status line.
    expect(js).toContain(
      'HAR export failed: sanitization failed closed, so nothing left the sanitizer. No file was downloaded.',
    );
    expect(js).toContain(
      'HAR export failed while building the file; retry or narrow the scope. No file was downloaded.',
    );
    expect(js).not.toContain("console.error('HAR export failed'");
    expect(js).not.toContain("setStatus('HAR export failed: ' + message)");
    expect(js).not.toMatch(/HAR export failed[^']*' \+ error/);
    expect(js).toContain('return failClosed();');
  });

  test('keeps user-derived rendering out of innerHTML while adding safety controls', () => {
    const innerHtmlAssignments = js.match(/\.innerHTML\s*=/g) || [];
    expect(innerHtmlAssignments).toHaveLength(1);
    expect(js).toContain('pauseBtn.innerHTML = state.paused ? PLAY_ICON_SVG : PAUSE_ICON_SVG;');
    expect(js).not.toMatch(/dataSafety[^\n]*innerHTML|innerHTML[^\n]*dataSafety/);
    expect(js).toContain("button.textContent = action.label;");
    expect(js).toContain("$('#dataSafetyDialogDetail').textContent = detail;");
  });

  test('rejects unconfirmed full HAR before body preparation and fails sanitized export before Blob creation', () => {
    const exportStart = js.indexOf('async function exportHAR(policy)');
    const exportEnd = js.indexOf('// Section 15', exportStart);
    const exportSource = js.slice(exportStart, exportEnd);
    const authorizationGuard = exportSource.indexOf(
      "outboundPolicy.mode === 'full' && !isFullOutputAuthorized(outboundPolicy)",
    );
    expect(authorizationGuard).toBeGreaterThan(-1);
    expect(authorizationGuard).toBeLessThan(exportSource.indexOf('resolveHarResponseContent(row)'));
    expect(exportSource.indexOf('har.log._networkPlus.failedClosed')).toBeLessThan(exportSource.indexOf('new Blob'));
    expect(exportSource).toContain('const downloadUrl = objectUrl;');
    expect(exportSource.indexOf('objectUrl = null;')).toBeLessThan(
      exportSource.indexOf('triggerObjectUrlDownload('),
    );
    expect(js).toContain('schedule(revokeOnce, OBJECT_URL_REVOKE_DELAY_MS);');
    expect(js).toMatch(/finally \{\s*revoker\.revokeOnFailure\(\);/s);
  });

  test('announces each outbound event through only one live region', () => {
    expect(html).toMatch(/id="copyToast"[^>]*aria-hidden="true"/);
    expect((js.match(/queueDataSafetyAnnouncement\(/g) || [])).toHaveLength(2);
    const clipboardStart = js.indexOf('function writeClipboardPayload');
    const clipboardEnd = js.indexOf('let pendingFullOutboundAction', clipboardStart);
    const clipboardSource = js.slice(clipboardStart, clipboardEnd);
    expect(clipboardSource.slice(0, clipboardSource.indexOf('.catch'))).toContain('queueDataSafetyAnnouncement(message);');
    expect(clipboardSource.slice(clipboardSource.indexOf('.catch'))).not.toContain('queueDataSafetyAnnouncement');
    const exportStart = js.indexOf('async function exportHAR(policy)');
    const exportEnd = js.indexOf('// Section 15', exportStart);
    expect(js.slice(exportStart, exportEnd)).not.toContain('queueDataSafetyAnnouncement');
  });

  test('reads the HAR creator version from the runtime manifest without a production literal', () => {
    expect(js).toContain("runtime.getManifest()");
    expect(js).toContain("typeof module !== 'undefined' && module.exports ? TEST_EXTENSION_VERSION_FALLBACK : 'unknown'");
    expect(js).not.toContain("const EXTENSION_VERSION = '1.5.0'");
    expect(js).toContain("creator: { name: 'Network+ for DevTools', version: getExtensionVersion() }");
  });

  test('consumes full confirmation synchronously to prevent double activation', () => {
    expect(js).toContain("$('#dataSafetyConfirmBtn').disabled = true;");
    expect(js).toContain('createOneTimeConfirmationAction(source.onConfirm)');
  });
});

describe('waterfall and stats topology', () => {
  test('statsSummary span exists in the statusbar', () => {
    expect(html).toContain('id="statsSummary"');
    // Must be inside the footer.statusbar
    const statusbarStart = html.indexOf('<footer class="statusbar">');
    const statusbarEnd = html.indexOf('</footer>', statusbarStart);
    expect(statusbarStart).toBeGreaterThan(-1);
    const statusbar = html.slice(statusbarStart, statusbarEnd);
    expect(statusbar).toContain('id="statsSummary"');
  });

  test('Waterfall column is declared in DEFAULT_COLUMNS as hidden', () => {
    // Check the DEFAULT_COLUMNS definition contains waterfall with visible: false
    const colsMatch = js.match(/const DEFAULT_COLUMNS\s*=\s*\[([\s\S]*?)\];/);
    expect(colsMatch).not.toBeNull();
    const colsBlock = colsMatch[1];
    expect(colsBlock).toContain("id: 'waterfall'");
    expect(colsBlock).toContain("visible: false");
    // Specifically for waterfall entry
    const waterfallEntry = colsBlock.slice(colsBlock.indexOf("id: 'waterfall'"));
    expect(waterfallEntry).toContain("visible: false");
  });

  test('Waterfall remains reorderable and resizable without no-op sort or filter controls', () => {
    const renderHeaderStart = js.indexOf('function renderHeader()');
    const renderHeaderEnd = js.indexOf('\n  function ', renderHeaderStart + 1);
    const renderHeaderFn = js.slice(renderHeaderStart, renderHeaderEnd);
    expect(renderHeaderFn).toContain("const isVisualOnly = isVisualOnlyColumn(c.id);");
    expect(renderHeaderFn).toContain("th.className = 'waterfall-header';");
    expect(renderHeaderFn).toContain("th.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');");
    expect(renderHeaderFn).toContain("if (!isVisualOnly && (event.key === 'Enter'");
    const visualHeaderStart = renderHeaderFn.indexOf('if (isVisualOnly)');
    const visualHeaderEnd = renderHeaderFn.indexOf('} else {', visualHeaderStart);
    const visualHeaderBranch = renderHeaderFn.slice(visualHeaderStart, visualHeaderEnd);
    expect(visualHeaderBranch).not.toContain('aria-sort');
    expect(visualHeaderBranch).not.toContain('aria-haspopup');

    const filterPopupStart = js.indexOf('function createFilterPopupContent(');
    const filterPopupEnd = js.indexOf('\n  function ', filterPopupStart + 1);
    const filterPopupFn = js.slice(filterPopupStart, filterPopupEnd);
    expect(filterPopupFn).toContain('if (isVisualOnlyColumn(col.id)) continue;');

    const filterRowsStart = js.indexOf('function filterRows()');
    const filterRowsEnd = js.indexOf('\n  function ', filterRowsStart + 1);
    const filterRowsFn = js.slice(filterRowsStart, filterRowsEnd);
    expect(filterRowsFn).toContain('if (isVisualOnlyColumn(colId)) continue;');

    const headerContextStart = js.indexOf("$('#thead').addEventListener('contextmenu'");
    const headerContextEnd = js.indexOf('\n\n    const columnsBtn', headerContextStart);
    const headerContextBlock = js.slice(headerContextStart, headerContextEnd);
    const visualOnlyGuard = headerContextBlock.indexOf('if (isVisualOnlyColumn(focusColId))');
    const guardReturn = headerContextBlock.indexOf('return;', visualOnlyGuard);
    const openFilter = headerContextBlock.indexOf(
      'openFilterPopup(event.clientX, event.clientY, focusColId, th);',
    );
    expect(visualOnlyGuard).toBeGreaterThan(-1);
    expect(guardReturn).toBeGreaterThan(visualOnlyGuard);
    expect(openFilter).toBeGreaterThan(guardReturn);

    expect(css).toContain('.title-row th.waterfall-header{cursor:default');
    expect(css).toContain('.title-row th.waterfall-header:focus-visible');
  });

  test('statistics and waterfall helpers are exported', () => {
    const np = require('../panel.js');
    expect(typeof np.classifyStatusClass).toBe('function');
    expect(typeof np.getStatusClassIndicators).toBe('function');
    expect(typeof np.formatStatusClassSummary).toBe('function');
    expect(typeof np.findFirstStatusClassRow).toBe('function');
    expect(typeof np.renderStatsSummary).toBe('function');
    expect(typeof np.computeStats).toBe('function');
    expect(typeof np.computeWaterfallBar).toBe('function');
    expect(typeof np.computeWaterfallRange).toBe('function');
  });

  test('waterfall cell uses safe DOM creation (no innerHTML)', () => {
    // Find waterfall-cell block in panel.js
    const waterfallStart = js.indexOf("'waterfall-cell'");
    expect(waterfallStart).toBeGreaterThan(-1);
    // Find the block that follows the waterfall-cell class assignment
    // up to the next '} else {' that ends the waterfall branch
    const waterfallBlock = js.slice(waterfallStart, js.indexOf('} else {', waterfallStart + 1));
    // The waterfall cell block must not use innerHTML
    expect(waterfallBlock).not.toContain('innerHTML');
    // Must use createElement and appendChild for the bar
    expect(waterfallBlock).toContain('createElement');
    expect(waterfallBlock).toContain('appendChild');
  });

  // Regression guard: createTableRow must NOT scan state.filteredRows per row to compute
  // the waterfall range — that caused O(n²) full-render behavior. The range must be read
  // from the pre-computed state.waterfallRange cache instead.
  test('waterfall cell reads state.waterfallRange, never scans state.filteredRows', () => {
    const waterfallStart = js.indexOf("'waterfall-cell'");
    expect(waterfallStart).toBeGreaterThan(-1);
    const waterfallBlock = js.slice(waterfallStart, js.indexOf('} else {', waterfallStart + 1));
    expect(waterfallBlock).not.toContain('state.filteredRows');
    expect(waterfallBlock).toContain('state.waterfallRange');
  });

  // Regression guard: renderBody() must compute and cache the waterfall range before
  // iterating rows, so createTableRow reads it in O(1).
  test('renderBody computes and caches state.waterfallRange once per render', () => {
    const renderBodyStart = js.indexOf('function renderBody()');
    expect(renderBodyStart).toBeGreaterThan(-1);
    const renderBodyEnd = js.indexOf('\n  function ', renderBodyStart + 1);
    const renderBodyFn = js.slice(renderBodyStart, renderBodyEnd);
    expect(renderBodyFn).toContain('state.waterfallRange');
    expect(renderBodyFn).toContain('computeWaterfallRange(');
  });

  // Accessibility: waterfall gridcell must have an aria-label describing start/duration,
  // and decorative bar internals must be aria-hidden.
  test('waterfall cell has aria-label and decorative track is aria-hidden', () => {
    const waterfallStart = js.indexOf("'waterfall-cell'");
    const waterfallBlock = js.slice(waterfallStart, js.indexOf('} else {', waterfallStart + 1));
    expect(waterfallBlock).toContain("td.setAttribute(");
    expect(waterfallBlock).toContain("'aria-label'");
    expect(waterfallBlock).toContain("'aria-hidden', 'true'");
  });

  // Incremental-append fast path must be disabled when Waterfall column is visible
  // because appending a row changes the shared time range, invalidating existing bars.
  test('appendIncrementalRows disables fast path when waterfall column is visible', () => {
    const fnStart = js.indexOf('function appendIncrementalRows(');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = js.indexOf('\n  function ', fnStart + 1);
    const fnBody = js.slice(fnStart, fnEnd);
    expect(fnBody).toContain("id === 'waterfall'");
    expect(fnBody).toContain('return false');
  });

  test('updateTableSummary delegates semantic statsSummary rendering', () => {
    const summaryFnStart = js.indexOf('function updateTableSummary(');
    const summaryFnEnd = js.indexOf('\n  function ', summaryFnStart + 1);
    const summaryFn = js.slice(summaryFnStart, summaryFnEnd);
    expect(summaryFn).toContain("'#statsSummary'");
    expect(summaryFn).toContain('computeStats(');
    expect(summaryFn).toContain(
      'renderStatsSummary(statsEl, stats, inspectFirstStatusClassRequest)',
    );
    expect(summaryFn).toContain('clearStatsSummary(statsEl)');
    expect(summaryFn).not.toContain('innerHTML');
  });

  test('renders semantic status triage controls with a complete accessible text alternative', () => {
    const rendererStart = js.indexOf('function renderStatsSummary(');
    const rendererEnd = js.indexOf('\n  function ', rendererStart + 1);
    const renderer = js.slice(rendererStart, rendererEnd);
    expect(renderer).toContain('getStatusClassIndicators(stats.statusClassCounts)');
    expect(renderer).toContain('formatStatusClassSummary(stats.statusClassCounts)');
    expect(renderer).toContain('getOrCreateStatsSummaryStructure(statsElement)');
    expect(renderer).toContain(
      "structure.accessibleSummary.textContent = statusText + ' | ' + durationText",
    );
    expect(renderer).toContain(
      'updateStatusSummaryChip(structure, indicator, onInspectStatusClass)',
    );
    expect(renderer).toContain("structure.duration.textContent = '| avg ' + fmtTime(stats.avgDuration)");
    expect(renderer).not.toContain("statsElement.textContent = ''");
    expect(renderer).not.toContain('innerHTML');
  });

  test('reuses keyed status chip nodes across non-empty summary updates', () => {
    const updaterStart = js.indexOf('function updateStatusSummaryChip(');
    const updaterEnd = js.indexOf('\n  function ', updaterStart + 1);
    const updater = js.slice(updaterStart, updaterEnd);
    expect(updater).toContain('structure.chipElements.get(indicator.statusClass)');
    expect(updater).toContain("const expectedTagName = canInspect ? 'BUTTON' : 'SPAN'");
    expect(updater).toContain('structure.chipElements.set(indicator.statusClass, replacement)');
    expect(updater).not.toContain('innerHTML');
  });

  test('status triage selects and focuses the first matching visible sorted request', () => {
    const triageStart = js.indexOf('function inspectFirstStatusClassRequest(');
    const triageEnd = js.indexOf('\n  function ', triageStart + 1);
    const triage = js.slice(triageStart, triageEnd);
    expect(triage).toContain('getSortedRows(state.filteredRows)');
    expect(triage).toContain('findFirstStatusClassRow(');
    expect(triage).toContain('selectRow(targetRow, null, true)');
    expect(triage).toContain('scrollToSelectedRow()');
    expect(triage).not.toMatch(/filterRows|columnFilterRules|renderBody/);
  });

  test('waterfall CSS classes are defined: wf-track, wf-fill, wf-seg, waterfall-cell', () => {
    expect(css).toContain('.wf-track');
    expect(css).toContain('.wf-fill');
    expect(css).toContain('.wf-seg');
    expect(css).toContain('.waterfall-cell');
  });

  test('statsSummary CSS is defined in the status bar section', () => {
    expect(css).toContain('#statsSummary');
    for (const statusClass of ['2xx', '3xx', '4xx', '5xx']) {
      expect(css).toContain(
        `.status-summary-chip--${statusClass}{color:var(--status-${statusClass}-text)}`,
      );
    }
    expect(css).toContain(
      '.status-summary-chip--other{border-color:var(--control-border);color:var(--text-muted)}',
    );
    expect(css).toContain(
      '.status-summary-chip--empty{border-color:var(--control-border);color:var(--text-muted);font-weight:600}',
    );
    expect(css).toContain('.status-summary-chip--action{min-height:24px;cursor:pointer');
    expect(css).toContain(
      '.status-summary-chip--action:active{border-color:var(--accent);background:var(--accent-fill);color:var(--on-accent)}',
    );
    expect(css).toContain(
      '.status-summary-chip--action:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    );
  });
});

describe('timing guidance static contracts', () => {
  test('keeps phase definitions and the evidence limit visible and keyboard-accessible', () => {
    expect(js).toContain('function createTimingPhaseGuide()');
    expect(js).toContain("const guide = document.createElement('details');");
    expect(js).toContain("summary.textContent = uiText('timingGuideSummary');");
    expect(js).toContain("description.textContent = uiText(TIMING_PHASE_TEXT_KEYS[phase]) || guidance.description;");
    expect(js).toContain('TIMING_EVIDENCE_LIMITATION');
    expect(js).toContain('resTimingPane.appendChild(createTimingPhaseGuide());');
    expect(js).toContain('document.createElement(\'dl\')');
    expect(css).toContain('.timing-evidence-note');
    expect(css).toContain('.timing-guidance-summary:focus-visible');
  });

  test('stacks the phase definitions at narrow widths without adding new color tokens', () => {
    expect(css).toContain('@media (max-width:420px)');
    expect(css).toContain('.timing-guidance-list{grid-template-columns:minmax(0,1fr)}');
    expect(css).toContain('background:var(--surface)');
  });
});

describe('visual-state dark-mode parity', () => {
  const visualStateTokens = [
    'hl-primary-pct',
    'hl-secondary-pct',
    'hl-row-primary-pct',
    'hl-row-secondary-pct',
    'multi-selected-pct',
    'danger-tint',
    'shadow-context-menu',
  ];

  test('defines visual-state custom properties in all four theme locations', () => {
    for (const token of visualStateTokens) {
      for (const [themeName, theme] of [
        ['light', light],
        ['system dark', systemDark],
        ['forced dark', forcedDark],
        ['forced light', forcedLight],
      ]) {
        expect({ themeName, token, value: theme[token] }).toMatchObject({
          value: expect.stringMatching(/\S/),
        });
      }
    }
  });

  test('forced dark matches system dark and forced light matches light for visual-state tokens', () => {
    for (const token of visualStateTokens) {
      expect({ token, value: forcedDark[token] }).toMatchObject({ value: systemDark[token] });
      expect({ token, value: forcedLight[token] }).toMatchObject({ value: light[token] });
    }
  });

  test('no unapproved color or shadow literals in component rules outside theme token blocks', () => {
    // Component CSS begins after the four theme blocks (the forced-light block is last)
    const componentCss = css.slice(css.indexOf('/* === Top Bar === */'));
    // All colors must flow through CSS custom properties; bare rgba() is not permitted in component rules
    expect(componentCss).not.toMatch(/rgba\(/);
  });

  test('hit rows stay tint-only and the selected row carries the outline', () => {
    // Dark rows sit on very dark surfaces; a mix percentage below ~15% is
    // visually indistinguishable from the plain row background.
    for (const [themeName, theme] of [
      ['system dark', systemDark],
      ['forced dark', forcedDark],
    ]) {
      expect({ themeName, value: parseInt(theme['hl-row-primary-pct'], 10) }).toMatchObject({
        value: expect.any(Number),
      });
      expect(parseInt(theme['hl-row-primary-pct'], 10)).toBeGreaterThanOrEqual(18);
      expect(parseInt(theme['hl-row-secondary-pct'], 10)).toBeGreaterThanOrEqual(15);
      expect(parseInt(theme['hl-primary-pct'], 10)).toBeGreaterThanOrEqual(30);
    }
    // A hit alone draws no outline — outlines mean selection, nothing else —
    // so the selected-row ring is never masked by search styling.
    for (const selector of [0, 1, 2, 3, 4, 5]) {
      const rule = css.match(new RegExp(`\\.search-row-${selector}\\{([^}]*)\\}`))[1];
      expect(rule).not.toContain('box-shadow');
    }
    for (const color of ['yellow', 'red', 'green', 'blue', 'purple', 'orange']) {
      const rule = css.match(new RegExp(`\\.hl-${color}\\{([^}]*)\\}`))[1];
      expect(rule).not.toContain('box-shadow');
    }
    expect(css).toContain('.grid tbody tr.selected{background:var(--selected);box-shadow:inset 0 0 0 2px var(--accent)}');
  });

  test('visual-state highlight rules do not use dark-only selector overrides', () => {
    // Parity with system dark is achieved through CSS custom properties defined in the theme blocks,
    // not through html[data-theme="dark"] selector overrides on visual-state classes
    expect(css).not.toMatch(/html\[data-theme="dark"\]\s+\.search-hl-/);
    expect(css).not.toMatch(/html\[data-theme="dark"\]\s+\.search-highlight\b/);
    expect(css).not.toMatch(/html\[data-theme="dark"\]\s+\.hl-(?:yellow|red|green|blue|purple|orange)\b/);
    expect(css).not.toMatch(/html\[data-theme="dark"\]\s+\.search-row-/);
    expect(css).not.toMatch(/html\[data-theme="dark"\]\s+\.multi-selected\b/);
    expect(css).not.toMatch(/html\[data-theme="dark"\]\s+\.context-menu\b/);
  });
});

describe('column filter value-less operator contracts', () => {
  test('multiText evaluation and active detection route value-less operators through isValuelessFilterOperator', () => {
    const evaluateBlock = js.slice(
      js.indexOf('function evaluateFilterRule'),
      js.indexOf('// --- Standard operator-based rules ---'),
    );
    expect(evaluateBlock).toContain("rule.mode === 'multiText'");
    expect(evaluateBlock).toContain('const needsValue = !isValuelessFilterOperator(cond && cond.op);');

    const activeBlock = js.slice(js.indexOf('function isRuleActive'), js.indexOf('function countActiveColumnFilters'));
    expect(activeBlock).toContain('isValuelessFilterOperator(condition && condition.op)');
    expect(activeBlock).toContain('if (isValuelessFilterOperator(rule.op)) return true;');
  });

  test('multi-condition filter rows disable the value input for value-less operators', () => {
    const multiBlock = js.slice(
      js.indexOf("if (colId === 'domain' || colId === 'path')"),
      js.indexOf('// --- Default: generic operator + value ---'),
    );
    expect(multiBlock).toContain('const updateInputState = () => {');
    expect(multiBlock).toContain('isValuelessFilterOperator(opSelect.value)');
    expect(multiBlock).toContain('input.disabled = noValueRequired;');
    expect(multiBlock).toContain("if (noValueRequired) input.value = '';");
  });
});

describe('view preset static contracts', () => {
  const columnsMenuBlock = () =>
    js.slice(
      js.indexOf('const renderColumnsContextMenu'),
      js.indexOf("$('#thead').addEventListener('contextmenu'"),
    );

  test('view preset storage keys and size bound are defined in panel.js', () => {
    expect(js).toContain("const VIEW_PRESET_KEY = 'networkPlus.viewPreset.v1';");
    expect(js).toContain("const LEGACY_FILTER_PRESET_KEY = 'networkPlus.filterPresets.v1';");
    expect(js).toContain('const MAX_PRESET_TOTAL_BYTES =');
  });

  test('view preset helpers are exported for unit tests', () => {
    const np = require('../panel.js');
    expect(typeof np.serializeFilterState).toBe('function');
    expect(typeof np.deserializeFilterState).toBe('function');
    expect(typeof np.normalizeViewPreset).toBe('function');
    expect(typeof np.loadViewPreset).toBe('function');
    expect(typeof np.saveViewPreset).toBe('function');
    expect(typeof np.clearViewPreset).toBe('function');
  });

  test('the standalone Presets toolbar button is fully retired', () => {
    expect(html).not.toContain('presetsBtn');
    expect(js).not.toContain('presetsBtn');
    expect(js).not.toContain('presetsMenu');
    expect(js).not.toContain('createPresetDropdownContent');
  });

  test('Columns menu hosts the single preset section built with safe DOM APIs', () => {
    const menuBlock = columnsMenuBlock();
    expect(menuBlock).toContain("presetSection.className = 'columns-preset-section';");
    expect(menuBlock).toContain('columns-preset-apply');
    expect(menuBlock).toContain('columns-preset-update');
    expect(menuBlock).toContain('columns-preset-reset');
    expect(menuBlock).not.toContain('.innerHTML =');
    expect(css).toContain('.columns-preset-section{');
    expect(css).toContain('.columns-preset-actions{');
  });

  test('filter preset save never persists captured network traffic', () => {
    // serializeFilterState must operate on columnFilterRules only, not state.rows or row objects
    const serBlock = js.slice(js.indexOf('function serializeFilterState'), js.indexOf('function deserializeFilterState'));
    expect(serBlock).not.toContain('state.rows');
    expect(serBlock).not.toContain('.url');
    expect(serBlock).not.toContain('.body');
    expect(serBlock).not.toContain('request');
    expect(serBlock).not.toContain('response');
    // The preset snapshot itself carries only column visibility booleans + filter rules.
    const buildBlock = js.slice(js.indexOf('function buildViewPresetFromState'), js.indexOf('function applyViewPreset'));
    expect(buildBlock).toContain('!!column.visible');
    expect(buildBlock).toContain('serializeFilterState(state.columnFilterRules)');
    expect(buildBlock).not.toContain('state.rows');
  });

  test('applying the preset refreshes columns, filters, table, and search UI', () => {
    const menuBlock = columnsMenuBlock();
    expect(menuBlock).toContain('applyViewPreset(preset);');
    expect(menuBlock).toContain('saveColumnPrefs();');
    expect(menuBlock).toContain('filterRows();');
    expect(menuBlock).toContain('syncSearchUIAfterRender();');
    expect(menuBlock).toContain('updateTableSummary(countVisibleRows());');
  });

  test('a null preset applies the factory default view instead of failing', () => {
    const applyBlock = js.slice(js.indexOf('function applyViewPreset'), js.indexOf('// Section 8'));
    expect(applyBlock).toContain('DEFAULT_COLUMNS.find');
    expect(applyBlock).toContain("deserializeFilterState(preset ? preset.filterRules : {})");
  });

  test('load, save, and clear all target VIEW_PRESET_KEY', () => {
    const loadBlock = js.slice(js.indexOf('function loadViewPreset'), js.indexOf('function clearViewPreset'));
    expect(loadBlock).toContain('localStorage.getItem(VIEW_PRESET_KEY)');
    const saveBlock = js.slice(js.indexOf('function saveViewPreset'), js.indexOf('function migrateLegacyFilterPresets'));
    expect(saveBlock).toContain('localStorage.setItem(VIEW_PRESET_KEY, serialized);');
    const clearBlock = js.slice(js.indexOf('function clearViewPreset'), js.indexOf('function hasStoredViewPreset'));
    expect(clearBlock).toContain('localStorage.removeItem(VIEW_PRESET_KEY);');
  });

  test('legacy multi-preset store migrates once and is removed', () => {
    const migrateBlock = js.slice(js.indexOf('function migrateLegacyFilterPresets'), js.indexOf('function loadViewPreset'));
    expect(migrateBlock).toContain('localStorage.removeItem(LEGACY_FILTER_PRESET_KEY);');
    expect(migrateBlock).toContain('saveViewPreset(preset);');
  });

  test('saveViewPreset normalizes input and enforces the byte limit with real UTF-8 counts', () => {
    const saveBlock = js.slice(js.indexOf('function saveViewPreset'), js.indexOf('function migrateLegacyFilterPresets'));
    expect(saveBlock).toContain('normalizeViewPreset(preset)');
    expect(saveBlock).toContain('MAX_PRESET_TOTAL_BYTES');
    expect(saveBlock).toContain('TextEncoder');
    expect(saveBlock).toContain('return false;');
    const normBlock = js.slice(js.indexOf('function normalizeViewPreset'), js.indexOf('function getExtensionVersion'));
    expect(normBlock).toContain('serializeFilterState(deserializeFilterState(');
  });

  test('loadViewPreset returns { preset, error } and the apply handler surfaces errors', () => {
    const loadBlock = js.slice(js.indexOf('function loadViewPreset'), js.indexOf('function clearViewPreset'));
    expect(loadBlock).toContain('{ preset:');
    expect(loadBlock).toContain('error:');
    const menuBlock = columnsMenuBlock();
    expect(menuBlock).toContain('const { preset, error: presetError } = loadViewPreset();');
    expect(menuBlock).toContain('setStatus(presetError);');
  });

  test('update and reset handlers check return values and surface storage errors', () => {
    const menuBlock = columnsMenuBlock();
    expect(menuBlock).toContain('const ok = saveViewPreset(buildViewPresetFromState());');
    expect(menuBlock).toContain("setStatus('Could not save preset. Storage unavailable or data too large.');");
    expect(menuBlock).toContain('if (!clearViewPreset())');
    expect(menuBlock).toContain("setStatus('Could not reset preset. Storage unavailable.');");
  });

  test('clicks on controls a handler re-rendered away never dismiss the hosting popup', () => {
    // Select All, preset Update/Apply, and add/remove-condition all rebuild popup
    // content inside their own click handlers, detaching the clicked button before
    // the window-level dismisser runs. A detached target must be ignored.
    const dismissBlock = js.slice(
      js.indexOf('// Outside pointer actions dismiss transient surfaces'),
      js.indexOf('// Auto-scroll button'),
    );
    expect(dismissBlock).toContain('if (!event.target.isConnected) return;');
  });
});

describe('shortcut help static contracts', () => {
  test('shortcutDialog exists in HTML with correct aria labeling', () => {
    expect(html).toMatch(/<dialog id="shortcutDialog"[^>]*aria-labelledby="shortcutDialogTitle"/);
    expect(html).toContain('id="shortcutDialogTitle"');
    expect(html).toContain('id="shortcutCloseBtn"');
  });

  test('shortcut table documents all primary keyboard interactions', () => {
    // Verify core shortcuts are documented in the static HTML
    expect(html).toContain('Ctrl');
    expect(html).toContain('⌘');
    expect(html).toContain('Navigate rows');
    expect(html).toContain('Row context menu');
    expect(html).toContain('Reorder column');
    expect(html).toContain('Sort by column');
  });

  test('clear control and help expose the platform-specific request-log shortcuts', () => {
    expect(html).toMatch(
      /id="clearBtn"[^>]*aria-label="Clear all requests"[^>]*aria-keyshortcuts="Control\+L Meta\+K"/,
    );
    expect(html).toMatch(
      /<kbd>Ctrl<\/kbd>\+<kbd>L<\/kbd> \(Windows\/Linux\) \/ <kbd>⌘<\/kbd>\+<kbd>K<\/kbd> \(macOS\)<\/td><td data-i18n="shortcutActionClear">Clear all requests<\/td>/,
    );
  });

  test('clear shortcut delegates to the existing button flow only when the workbench is safe', () => {
    const blockingHelper = js.slice(
      js.indexOf('function isEditableShortcutTarget'),
      js.indexOf('// Section 3: Pure Utility Functions'),
    );
    const shortcutHandlerStart = js.indexOf('const keyboardPlatform = getKeyboardPlatform();');
    const shortcutHandlerEnd = js.indexOf("undoClearButton.addEventListener('click'", shortcutHandlerStart);
    const shortcutHandler = js.slice(shortcutHandlerStart, shortcutHandlerEnd);

    expect(blockingHelper).toContain("tagName === 'INPUT'");
    expect(blockingHelper).toContain("tagName === 'TEXTAREA'");
    expect(blockingHelper).toContain("tagName === 'SELECT'");
    expect(blockingHelper).toContain('element.isContentEditable');
    expect(blockingHelper).toContain("document.querySelector('dialog[open]')");
    expect(blockingHelper).toContain('TRANSIENT_POPUP_SELECTOR');
    expect(blockingHelper).toContain("classList.contains('show')");
    expect(shortcutHandlerStart).toBeGreaterThan(-1);
    expect(shortcutHandler).toContain(
      'if (!isClearNetworkLogShortcut(event, keyboardPlatform) || isClearShortcutBlocked()) return;',
    );
    expect(shortcutHandler).toContain('clearButton.click();');
    expect(shortcutHandler).not.toMatch(/\bstate\./);
    expect(js).toContain("if ((e.ctrlKey || e.metaKey) && e.key === 'f')");
  });

  test('shortcut table includes orientation-aware divider arrows for both layouts', () => {
    // Horizontal layout uses ← / →; vertical (≤700 px) uses ↑ / ↓ for the panel divider
    expect(html).toMatch(/panel divider.*horizontal/i);
    expect(html).toMatch(/panel divider.*vertical/i);
  });

  test('shortcutBtn is in HTML with correct aria attributes', () => {
    expect(html).toMatch(/id="shortcutBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="shortcutDialog"/);
    expect(html).toMatch(/id="shortcutBtn"[^>]*aria-keyshortcuts="\?"/);
  });

  test('panel.js wires the ? key to open the shortcut dialog', () => {
    expect(js).toContain("if (e.key !== '?') return;");
    expect(js).toContain("tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'");
    expect(js).toContain('openShortcutDialog(');
  });

  test('openShortcutDialog guards against opening when another modal is already active', () => {
    const openBlock = js.slice(js.indexOf('const openShortcutDialog'), js.indexOf('if (shortcutDialog) {'));
    expect(openBlock).toContain("if (shortcutDialog.open) return;");
    expect(openBlock).toContain("querySelectorAll('dialog[open]')");
  });

  test('shortcut dialog uses native dialog with Escape, backdrop-close, and focus restoration', () => {
    expect(js).toContain("shortcutDialog.addEventListener('cancel'");
    expect(js).toContain("shortcutDialog.addEventListener('close'");
    expect(js).toContain("if (event.target === shortcutDialog) shortcutDialog.close();");
    // Guard: must not open when already open (preserves original trigger)
    expect(js).toContain("if (shortcutDialog.open) return;");
    expect(js).toContain("shortcutDialog.showModal();");
  });

  test('safe support summary is an explicitly activated, accessible dialog action', () => {
    expect(html).toMatch(
      /id="copySafeSupportSummaryBtn"[^>]*type="button"[^>]*class="shortcut-primary-action"[^>]*aria-describedby="shortcutSupportSummaryHelp"[^>]*>Copy safe support summary</,
    );
    expect(html).toContain('id="shortcutSupportSummaryTitle"');
    expect(html).toContain('Captured traffic is excluded. Review the summary before posting.');
    expect(html).toMatch(
      /id="shortcutSupportSummaryStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
    );

    const handlerStart = js.indexOf("safeSupportSummaryBtn.addEventListener('click'");
    const handlerEnd = js.indexOf("$('#shortcutCloseBtn')", handlerStart);
    const handler = js.slice(handlerStart, handlerEnd);
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain('buildSafeSupportSummary({');
    expect(handler).toContain("writeClipboardPayload(summary, 'Copied safe support summary').then");
    expect(handler).toContain("supportStatus.textContent = copied");
    expect(handler).toContain("'Clipboard copy failed. No data was copied.'");
    expect(handler).not.toContain('shortcutDialog.close');
    expect(handler).not.toContain('.focus()');
    expect(handler).not.toMatch(/state\.(?:rows|filteredRows|selectedRow|selectedRows|search|columnFilterRules)/);
    expect(handler).not.toMatch(/localStorage|chrome\.storage|fetch\(|XMLHttpRequest|sendBeacon/);
  });

  test('support summary has no state or row dependency and is not collected when the dialog opens', () => {
    const builderStart = js.indexOf('function buildSafeSupportSummary(input)');
    const builderEnd = js.indexOf('function createObjectUrlRevoker', builderStart);
    const builder = js.slice(builderStart, builderEnd);
    const initStart = js.indexOf('function init()');
    const handlerStart = js.indexOf("safeSupportSummaryBtn.addEventListener('click'");
    const handlerEnd = js.indexOf("$('#shortcutCloseBtn')", handlerStart);
    const handler = js.slice(handlerStart, handlerEnd);
    const initBeforeHandler = js.slice(initStart, handlerStart);

    expect(builderStart).toBeGreaterThan(-1);
    expect(builder).not.toMatch(/\bstate\.|\brows?\b|navigator|document|localStorage|chrome\.storage/);
    expect(initBeforeHandler).not.toContain('buildSafeSupportSummary({');
    expect((js.match(/buildSafeSupportSummary\(\{/g) || [])).toHaveLength(1);
    expect((handler.match(/navigator\.userAgentData/g) || [])).toHaveLength(1);
    expect((handler.match(/navigator\.userAgent\b/g) || [])).toHaveLength(1);
    expect(handler).toContain('getMatchMediaApi()');
    expect((js.match(/window\.matchMedia/g) || [])).toHaveLength(2);
  });

  test('support summary reuses shared success, live-region, and failure feedback', () => {
    const clipboardStart = js.indexOf('function writeClipboardPayload');
    const clipboardEnd = js.indexOf('let pendingFullOutboundAction', clipboardStart);
    const clipboardSource = js.slice(clipboardStart, clipboardEnd);
    expect(clipboardSource).toContain('showCopyFeedback(message);');
    expect(clipboardSource).toContain('queueDataSafetyAnnouncement(message);');
    expect(clipboardSource).toContain("setStatus('Clipboard copy failed. No data was copied.');");
    expect(clipboardSource).toContain('return true;');
    expect(clipboardSource).toContain('return false;');
    expect(html).toMatch(
      /id="dataSafetyStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
    );
  });

  test('shortcut dialog CSS uses theme tokens for shortcut-form and kbd elements', () => {
    expect(css).toContain('#shortcutDialog{');
    expect(css).toContain('#shortcutDialog::backdrop{');
    expect(css).toContain('.shortcut-form{');
    expect(css).toContain('kbd{');
    // Must use CSS custom properties, not hard-coded colours
    expect(css).toMatch(/kbd\{[^}]*var\(--/);
    expect(css).toMatch(/\.shortcut-support-summary\{[^}]*var\(--control-border\)[^}]*var\(--content-bg\)/);
    expect(css).toMatch(
      /\.shortcut-form \.shortcut-primary-action\{[^}]*var\(--accent\)[^}]*var\(--accent-dim\)[^}]*var\(--text-accent\)/,
    );
  });

  test('shortcut dialog first-column cells do not have forced nowrap', () => {
    // Forcing white-space:nowrap on long shortcut descriptions makes the 320px dialog unusable
    const tdRule = css.match(/\.shortcut-table td:first-child\{([^}]*)\}/);
    expect(tdRule).not.toBeNull();
    expect(tdRule[1]).not.toContain('white-space:nowrap');
  });

  test('shortcut dialog uses dvh for max-height to handle mobile toolbars', () => {
    const dialogRule = css.match(/#shortcutDialog\{([^}]*)\}/);
    expect(dialogRule).not.toBeNull();
    expect(dialogRule[1]).toContain('dvh');
  });

  test('shortcut dialog actions keep objective pointer targets and bounded narrow-width geometry', () => {
    const buttonRule = css.match(/\.shortcut-form button\{([^}]*)\}/);
    const supportButtonRule = css.match(/\.shortcut-support-summary button\{([^}]*)\}/);
    expect(buttonRule).not.toBeNull();
    expect(buttonRule[1]).toContain('min-height:28px');
    expect(supportButtonRule).not.toBeNull();
    expect(supportButtonRule[1]).toContain('max-width:100%');
    expect(supportButtonRule[1]).toContain('white-space:nowrap');
    expect(css).toContain(
      '@media (max-width:280px){\n  .shortcut-support-summary button{white-space:normal;text-align:center}\n  .support-option-cta{width:100%;justify-content:center}\n}',
    );
  });

  test('shortcut dialog starts on Close and keeps copy focus while reporting inside the modal', () => {
    const openBlock = js.slice(js.indexOf('const openShortcutDialog'), js.indexOf('if (shortcutDialog) {'));
    const handlerStart = js.indexOf("safeSupportSummaryBtn.addEventListener('click'");
    const handlerEnd = js.indexOf("$('#shortcutCloseBtn')", handlerStart);
    const handler = js.slice(handlerStart, handlerEnd);

    expect(openBlock).toContain("const supportStatus = $('#shortcutSupportSummaryStatus');");
    expect(openBlock).toContain("if (supportStatus) supportStatus.textContent = '';");
    expect(openBlock).toContain("if (shortcutDialog.open && closeButton) closeButton.focus();");
    expect(handler).toContain("const supportStatus = $('#shortcutSupportSummaryStatus');");
    expect(handler).not.toContain('safeSupportSummaryBtn.focus');
    expect(handler).not.toContain('shortcutDialog.close');
  });
});

// ============================================================
// Optional support dialog — static UI / privacy regression
// ============================================================
describe('optional support dialog', () => {
  const supportLinks = [
    { id: 'supportSponsorsLink', url: 'https://github.com/sponsors/himiyosh' },
    { id: 'supportKofiLink', url: 'https://ko-fi.com/studio344' },
  ];
  const supportBlock = js.slice(
    js.indexOf("const supportDialog = $('#supportDialog');"),
    js.indexOf('// Tab switching for inspector panels'),
  );

  test('the brand pill itself is the support trigger, with the cat and cup inline', () => {
    // The brand and the support trigger are one control: the pill carries the
    // dialog trigger role, the peeking otter, the steaming cup, and a hover-only
    // hint — no separate ☕ button that would spend toolbar width.
    const trigger = html.match(/<button id="supportBtn"[^>]*>/)[0];
    expect(trigger).toContain('class="brand support-btn"');
    expect(trigger).toContain('aria-haspopup="dialog"');
    expect(trigger).toContain('aria-controls="supportDialog"');
    expect(trigger).toContain('aria-label="Network+ for DevTools — support development, optional"');
    // A modal dialog trigger must not advertise an expandable region.
    expect(trigger).not.toContain('aria-expanded');
    const brandBlock = html.slice(html.indexOf('<button id="supportBtn"'), html.indexOf('</button>', html.indexOf('<button id="supportBtn"')));
    for (const part of [
      'brand-otter-window',
      'brand-otter-motion',
      'brand-otter',
      'brand-otter-sleep',
      'brand-otter-wake',
      'brand-otter-lid',
      'brand-otter-glint',
      'brand-heart-px',
      'brand-cup',
      'brand-steam',
      'brand-support-hint',
      'brand-sub',
    ]) {
      expect(brandBlock).toContain(part);
    }
    // Decorative art stays out of the accessibility tree and inline (CSP).
    expect(brandBlock).toMatch(/<span class="brand-otter-window" aria-hidden="true">/);
    expect(brandBlock).not.toMatch(/<img\b|<use\b|href=|url\(/);
    // Exactly one toolbar support trigger remains.
    expect(html.match(/id="supportBtn"/g)).toHaveLength(1);
  });

  test('support dialog links are exact and external-safe', () => {
    for (const { id, url } of supportLinks) {
      const anchor = html.match(new RegExp(`<a id="${id}"[^>]*>`))[0];
      expect(anchor).toContain(`href="${url}"`);
      expect(anchor).toContain('target="_blank"');
      // rel is required: _blank without noopener leaks window.opener to the payment host.
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
    expect(html).toMatch(/<dialog id="supportDialog"[^>]*aria-labelledby="supportDialogTitle"/);
    // The destination stays legible next to the action so a payment link is
    // never followed blind — in the authored English and in the Japanese
    // translation alike.
    for (const { url } of supportLinks) {
      const host = url.replace('https://', '');
      expect(html).toMatch(
        new RegExp(`<span class="support-option-hint"[^>]*>${host.replace(/[./]/g, '\\$&')} ·`),
      );
      expect(js).toContain(`ja: '${host} · `);
    }
  });

  test('support dialog states the no-transmission and no-gating boundary it must keep', () => {
    expect(html).toContain('Contributing is optional and never unlocks, limits, or changes any feature.');
    expect(html).toContain('Network+ sends them no captured traffic and no usage data');
  });

  test('support dialog issues no request and stores no contribution state', () => {
    expect(supportBlock).not.toBe('');
    for (const forbidden of [
      'fetch(',
      'XMLHttpRequest',
      'sendBeacon',
      'chrome.storage',
      'localStorage',
      'new Image',
      'navigator.clipboard',
    ]) {
      expect(supportBlock).not.toContain(forbidden);
    }
    // Opening the dialog is pure UI: the links carry the navigation themselves.
    expect(supportBlock).not.toContain('window.open');
  });

  test('support dialog keeps modal focus discipline and restores the trigger', () => {
    expect(supportBlock).toContain('if (supportDialog.open) return;');
    expect(supportBlock).toContain("const otherModal = Array.from(document.querySelectorAll('dialog[open]'))");
    expect(supportBlock).toContain('if (supportDialog.open && closeButton) closeButton.focus();');
    expect(supportBlock).toContain('if (trigger && trigger.focus && trigger.isConnected !== false) trigger.focus();');
    expect(supportBlock).toMatch(/addEventListener\('cancel'.*supportDialog\.close\(\)/);
  });

  test('the brand trigger keeps a reflow-free border box and visible focus', () => {
    const rule = css.match(/\.topbar button\.brand\{([^}]*)\}/)[1];
    // Transparent border, not removed: the toolbar keeps the border box so the
    // row never reflows when the generic hover border appears.
    expect(rule).toContain('border-color:transparent');
    expect(rule).not.toContain('border:none');
    expect(css).toMatch(/\.topbar button:hover\{[^}]*border-color:var\(--accent\)/);
    expect(css).toMatch(/\.topbar button:focus-visible[^{]*\{[^}]*outline:2px solid var\(--accent\)/);
    // The investigating otter sits above the low, bottom-aligned "for DevTools"
    // sub-label — the roomiest spot in the pill — with a deliberate 2px air
    // gap so no paw ever touches the letters. The art grazes at most ~4.5px
    // above the pill (~5.5px with the 1px hover rise), inside the topbar's
    // 6px clip budget, and compact widths keep a fixed 22px perch when the
    // words are hidden.
    expect(css).toContain('.brand-otter-window{position:absolute;bottom:calc(100% + 2px);');
    expect(css).toMatch(/\.brand-sub\{position:relative;display:inline-flex/);
    expect(css).toContain('.brand-sub-text{display:none}');
    expect(css).toContain('.brand-sub{width:22px;height:11px}');
    expect(css).toMatch(/\.brand-otter-window\{[^}]*overflow:hidden/);
    // The cup is white porcelain with a brew-toned edge so it reads against
    // both the light and dark pill fills (an unedged accent-colored cup sank
    // into the background), and it carries three always-on steam wisps.
    expect(css).toMatch(/\.brand-cup-body\{fill:var\(--cup\);stroke:var\(--brew\)/);
    expect(css).toMatch(/\.brand-cup-handle\{fill:none;stroke:var\(--cup\)/);
    expect(css).toContain('.brand-cup{width:20px;height:20px');
    expect(html.match(/class="brand-steam[ "]/g) || []).toHaveLength(3);
    // The toolbar mark is pixel art: a 22x15 sprite of whole-unit rects drawn
    // at true 1x. crispEdges keeps device pixels square instead of letting the
    // rasterizer feather 1-unit rects into mush, which is exactly the
    // "unreadable vector at 15px" failure the sprite replaced.
    expect(html).toMatch(
      /<svg class="brand-otter" viewBox="0 0 22 15" shape-rendering="crispEdges" focusable="false">/,
    );
    // Two complete sprites live in the markup. The woken investigator
    // (magnifying glass up) is the default — a network inspector's mascot is
    // on duty — and hover or focus soothes it into the shut-eyed sleeping
    // face while pixel hearts rise: the pointer reads as petting. CSS only
    // toggles display, so the swap is a single-frame cut — tweening between
    // sprites would blur.
    const brandBlock = html.slice(
      html.indexOf('<button id="supportBtn"'),
      html.indexOf('</button>', html.indexOf('<button id="supportBtn"')),
    );
    expect(html.match(/<g class="brand-otter-sleep">/g) || []).toHaveLength(1);
    expect(html.match(/<g class="brand-otter-wake">/g) || []).toHaveLength(1);
    expect(css).toContain('.brand-otter-sleep{display:none}');
    expect(css).toMatch(/:hover \.brand-otter-wake[^{]*\{display:none\}/);
    expect(css).toMatch(/:hover \.brand-otter-sleep[^{]*\{display:inline\}/);
    // Every sprite cell is an integer-aligned rect with an inline hex fill:
    // fractional geometry would break the pixel grid, and the palette is baked
    // per-cell (shading is the sprite's own, identical in both themes).
    const spriteRects = brandBlock.match(/<rect [^>]*\/>/g) || [];
    expect(spriteRects.length).toBeGreaterThan(150);
    for (const rect of spriteRects) {
      expect(rect).toMatch(/^<rect x="\d+" y="\d+" width="\d+" height="\d+" fill="#[0-9a-f]{6}"\/>$/);
    }
    // The idle beat is a two-frame bob: steps(1,end) holds each frame, and the
    // 1px offset stays on the pixel grid. Hover cuts to the woken sprite and
    // stops the bob entirely — a paused bob could freeze mid-bob 1px low.
    expect(css).toMatch(/\.brand-otter-motion\{[^}]*animation:brand-otter-bob 2\.4s steps\(1,end\) infinite\}/);
    expect(css).toMatch(/@keyframes brand-otter-bob\{\s*0%,100%\{transform:translateY\(0\)\}\s*50%\{transform:translateY\(1px\)\}\s*\}/);
    expect(css).toMatch(/:hover \.brand-otter-motion[^{]*\{animation:none\}/);
    // Idle beats on the working otter: a rare one-frame blink of the visible
    // eye (the lid overlay repaints its two cells in fur) and a rarer one-cell
    // glint in the lens. Both are steps() so no intermediate opacity ever
    // renders a half-lit pixel, and both hide on hover with the woken sprite.
    expect(html).toContain('<g class="brand-otter-lid"><rect x="5" y="7" width="2" height="1" fill="#a9744f"/></g>');
    expect(html).toContain('<g class="brand-otter-glint"><rect x="15" y="8" width="1" height="1" fill="#ffffff"/></g>');
    expect(css).toMatch(/\.brand-otter-lid\{opacity:0;animation:brand-otter-blink 5\.2s steps\(1,end\) infinite\}/);
    expect(css).toMatch(/\.brand-otter-glint\{opacity:0;animation:brand-otter-glint 8\.8s steps\(1,end\) infinite/);
    expect(css).toMatch(/:hover \.brand-otter-lid[^{]*\{display:none\}/);
    // Petting hearts: two 5x4 pixel hearts, hidden at rest, rising on hover in
    // whole-pixel steps(6) hops so they stay on the grid, the second delayed
    // half a beat so the pair reads as a stream rather than a stamp.
    expect(html.match(/class="brand-heart-px brand-heart-px--[ab]"/g) || []).toHaveLength(2);
    expect(html).toMatch(/<span class="brand-heart-px brand-heart-px--a"[^>]*><svg viewBox="0 0 5 4" shape-rendering="crispEdges"/);
    expect(css).toContain('.brand-heart-px{position:absolute;width:5px;height:4px;bottom:calc(100% + 1px);opacity:0;pointer-events:none}');
    expect(css).toMatch(/:hover \.brand-heart-px--a[^{]*\{animation:brand-heart-rise 1\.6s steps\(6,end\) infinite\}/);
    expect(css).toMatch(/:hover \.brand-heart-px--b[^{]*\{animation:brand-heart-rise 1\.6s steps\(6,end\) 0\.8s infinite\}/);
    // The retired ambient beats stay retired: a drifting "z" contradicts an
    // otter that is awake by default.
    expect(html).not.toContain('brand-zzz');
    expect(css).not.toContain('brand-zzz-drift');
    expect(css).not.toContain('brand-heart-float');
    // The floaters hang off .brand-sub, never inside the clipped sprite window:
    // the motion wrapper closes, the window closes, and only then do they appear.
    expect(html).toMatch(/<span class="brand-otter-window"[^>]*>\s*<span class="brand-otter-motion">/);
    expect(html).toMatch(
      /<\/span>\s*<\/span>\s*<span class="brand-heart-px brand-heart-px--a"/,
    );
    // The magnifying-glass lens tint belongs to the woken sprite alone, and the
    // sleeping face keeps shut eyes (no pupil cells) — waking must change the
    // face, or hover reads as nothing happening.
    const sleepSprite = brandBlock.slice(
      brandBlock.indexOf('<g class="brand-otter-sleep">'),
      brandBlock.indexOf('<g class="brand-otter-wake">'),
    );
    const wakeSprite = brandBlock.slice(brandBlock.indexOf('<g class="brand-otter-wake">'));
    expect(sleepSprite).not.toContain('#aee0f7');
    expect(wakeSprite).toContain('#aee0f7');
    expect(wakeSprite).toContain('#ffffff');
    // Steam is legible without hovering; hovering only strengthens it.
    expect(css).toContain('.brand-steam-group{opacity:.9;');
    expect(css).toMatch(/\.topbar button\.brand:hover \.brand-steam-group[^{]*\{opacity:1\}/);
    // Reduced motion freezes every brand animation.
    const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
    for (const part of ['.brand-otter', '.brand-otter-motion', '.brand-otter-lid', '.brand-otter-glint', '.brand-heart-px', '.brand-steam', '.brand-support-hint']) {
      expect(reducedMotion).toContain(part);
    }
  });

  test('support illustration is inline, decorative, and free of remote assets', () => {
    const heroStart = html.indexOf('<div class="support-hero">');
    const hero = html.slice(heroStart, html.indexOf('</svg>', heroStart));
    expect(hero).toContain('aria-hidden="true"');
    expect(hero).toContain('focusable="false"');
    // The MV3 CSP and the package check both forbid non-local assets, so the
    // artwork has to stay inline markup rather than an image or sprite <use>.
    expect(hero).not.toMatch(/<img\b|<use\b|href=|url\(/);
    // The identifying parts of the drawing: the muzzle and ears are what make
    // it an otter rather than a generic round animal, and the cup is the ask.
    for (const part of [
      'support-steam--a',
      'support-cup',
      'support-brew',
      'support-sparkle--a',
      'support-otter-pix',
      'support-otter-body',
      'support-otter-muzzle',
      'support-otter-ear',
      'support-otter-lid',
    ]) {
      expect(hero).toContain(part);
    }
  });

  test('each support option offers exactly one action so the ask is not diluted', () => {
    const listStart = html.indexOf('<ul class="support-options">');
    const list = html.slice(listStart, html.indexOf('</ul>', listStart));
    for (const { id } of supportLinks) {
      const anchor = html.match(new RegExp(`<a id="${id}"[^>]*>`))[0];
      expect(anchor).toContain('class="support-option-cta"');
      // Screen-reader users must learn the destination opens a new tab.
      expect(anchor).toMatch(/aria-label="[^"]*opens a new browser tab"/);
    }
    // One anchor per option and no competing secondary button in the row.
    expect(list.match(/<a\b/g)).toHaveLength(supportLinks.length);
    expect(list).not.toContain('<button');
    // The panel must not imply payment happens inside DevTools.
    expect(html).toContain('the payment itself happens on that site, never inside DevTools');
  });

  test('every support animation is disabled under reduced motion', () => {
    // Slice the block itself, not the rest of the stylesheet: an open-ended
    // slice would count any later rule as "covered" and hide a real gap.
    const reducedStart = css.indexOf('@media (prefers-reduced-motion:reduce)');
    const reduced = css.slice(reducedStart, css.indexOf('\n}', reducedStart) + 2);
    expect(reduced).toContain('prefers-reduced-motion');
    const animatedSelectors = Array.from(
      css.matchAll(/^([^{@\n][^{\n]*)\{[^}]*animation:support-[^}]*\}/gm),
      (match) => match[1].trim(),
    );
    expect(animatedSelectors.length).toBeGreaterThanOrEqual(5);
    for (const selector of animatedSelectors) {
      expect(reduced).toContain(selector.split(',')[0].trim());
    }
    // Steam and sparkles animate up from opacity:0, so stopping the animation
    // without restoring opacity would erase them instead of stilling them.
    expect(reduced).toContain('.support-steam{opacity:.55}');
    expect(reduced).toContain('.support-sparkle{opacity:.7}');
    // Same trap for the rising hearts.
    expect(reduced).toContain('.support-heart{opacity:.9}');
  });

  test('support dialog CSS uses theme tokens and stays within the viewport', () => {
    expect(css).toContain('#supportDialog{');
    expect(css).toContain('#supportDialog::backdrop{');
    const dialogRule = css.match(/#supportDialog\{([^}]*)\}/);
    expect(dialogRule[1]).toContain('dvh');
    expect(css).toMatch(/\.support-option\{[^}]*var\(--control-border\)[^}]*var\(--content-bg\)/);
    // The primary action is a filled CTA, so it must use the accent pair whose
    // contrast is already asserted by the theme contract above.
    expect(css).toMatch(/\.support-option-cta\{[^}]*var\(--accent-fill\)[^}]*var\(--on-accent\)/);
    expect(css).toContain('.support-option-cta:focus-visible{');
    expect(css).toMatch(/\.support-otter-body,[^{]*\{fill:var\(--otter\)\}/);
  });
});

// ============================================================
// Two-request diff comparison — static UI / security regression
// ============================================================
describe('two-request diff comparison', () => {
  const diffTokens = [
    'diff-add-bg',
    'diff-add-border',
    'diff-remove-bg',
    'diff-remove-border',
    'diff-changed-bg',
    'diff-changed-border',
    'diff-badge-a-color',
    'diff-badge-b-color',
  ];

  test('diff color tokens are defined in all four theme locations', () => {
    for (const token of diffTokens) {
      for (const [themeName, theme] of [
        ['light', light],
        ['system dark', systemDark],
        ['forced dark', forcedDark],
        ['forced light', forcedLight],
      ]) {
        expect({ themeName, token, value: theme[token] }).toMatchObject({
          value: expect.stringMatching(/\S/),
        });
      }
    }
  });

  test('forced dark diff tokens match system dark; forced light matches light', () => {
    for (const token of diffTokens) {
      expect({ token, value: forcedDark[token] }).toMatchObject({ value: systemDark[token] });
      expect({ token, value: forcedLight[token] }).toMatchObject({ value: light[token] });
    }
  });

  test('comparePanel element is present and hidden by default in HTML', () => {
    expect(html).toContain('id="comparePanel"');
    expect(html).toMatch(/id="comparePanel"[^>]*hidden/);
    expect(html).toMatch(/id="comparePanel"[^>]*aria-hidden="true"/);
  });

  test('comparison rendering functions use textContent and createElement, not innerHTML', () => {
    const renderStart = js.indexOf('function renderComparisonPanel(');
    const renderEnd = js.indexOf('function showComparisonPanel(', renderStart);
    const renderSource = js.slice(renderStart, renderEnd);
    // No innerHTML with user data inside renderComparisonPanel
    expect(renderSource).not.toMatch(/\.innerHTML\s*=/);
    // textContent must be used for user-derived string display
    expect(renderSource).toContain('.textContent =');
    // createElement must be used for DOM construction
    expect(renderSource).toContain('createElement(');
  });

  test('diffHeaders and diffQueryParams are exported as testable pure functions', () => {
    expect(js).toContain('diffHeaders,');
    expect(js).toContain('diffQueryParams,');
    expect(js).toContain('describeBodyForComparison,');
    expect(js).toContain('describeRequestBodyForComparison,');
  });

  test('compare context menu item requires exactly two selected rows', () => {
    // The comparison action must only appear when exactly 2 rows are selected
    expect(js).toContain("selectedCount === 2");
    expect(js).toContain("'Compare 2 selected requests'");
  });

  test('comparison panel is dismissed when a single row is clicked (selectRow clears comparedRows)', () => {
    const selectRowStart = js.indexOf('function selectRow(');
    const selectRowEnd = js.indexOf('const titleParts', selectRowStart);
    const selectRowSource = js.slice(selectRowStart, selectRowEnd);
    expect(selectRowSource).toContain('state.comparedRows = null');
    expect(selectRowSource).toContain('hideComparisonPanel()');
  });

  test('evicted rows hide the comparison panel and clear state', () => {
    const evictStart = js.indexOf('function cleanupEvictedRowReferences(');
    const evictEnd = js.indexOf('function removeRowsFromState(', evictStart);
    const evictSource = js.slice(evictStart, evictEnd);
    expect(evictSource).toContain('state.comparedRows = null');
    expect(evictSource).toContain('hideComparisonPanel()');
    expect(evictSource).toContain('detailsWereCleared = true');
  });

  test('comparison bodies use only cached data — no new fetch is triggered', () => {
    const descStart = js.indexOf('function describeBodyForComparison(');
    const descEnd = js.indexOf('// ============================================================', descStart);
    const descSource = js.slice(descStart, descEnd);
    // Must not call cacheResponseContent or fetchResponsePayload inside the body helper
    expect(descSource).not.toContain('cacheResponseContent(');
    expect(descSource).not.toContain('fetchResponsePayload(');
    expect(descSource).not.toContain('chrome.devtools');
  });

  test('request body descriptor does not fetch — reads only requestPostData', () => {
    const reqDescStart = js.indexOf('function describeRequestBodyForComparison(');
    const reqDescEnd = js.indexOf('\n  }', reqDescStart) + 4;
    const reqDescSource = js.slice(reqDescStart, reqDescEnd);
    expect(reqDescSource).not.toContain('cacheResponseContent(');
    expect(reqDescSource).not.toContain('fetchResponsePayload(');
    expect(reqDescSource).not.toContain('chrome.devtools');
    // Must read requestPostData
    expect(reqDescSource).toContain('requestPostData');
  });

  test('comparison panel renders both request and response body sections', () => {
    const renderStart = js.indexOf('function renderComparisonPanel(');
    const renderEnd = js.indexOf('function showComparisonPanel(', renderStart);
    const renderSource = js.slice(renderStart, renderEnd);
    expect(renderSource).toContain('Request Bodies');
    expect(renderSource).toContain('Response Bodies');
    expect(renderSource).toContain('describeRequestBodyForComparison(');
    expect(renderSource).toContain('describeBodyForComparison(');
  });

  test('showComparisonPanel focuses close button via setTimeout after context menu closes', () => {
    const showStart = js.indexOf('function showComparisonPanel(');
    const showEnd = js.indexOf('function hideComparisonPanel(', showStart);
    const showSource = js.slice(showStart, showEnd);
    expect(showSource).toContain('setTimeout(');
    expect(showSource).toContain('.compare-close-btn');
    expect(showSource).toContain('.focus()');
  });

  test('comparison panel Escape key handler is installed in init', () => {
    const initStart = js.indexOf('function init()');
    const initEnd = js.indexOf('\n  document.addEventListener(', initStart);
    const initSource = js.slice(initStart, initEnd);
    expect(initSource).toContain("e.key === 'Escape'");
    expect(initSource).toContain('comparePanel');
    expect(initSource).toContain('hideComparisonPanel()');
  });

  test('close button restores focus to invoking row on click', () => {
    const renderStart = js.indexOf('function renderComparisonPanel(');
    const renderEnd = js.indexOf('function showComparisonPanel(', renderStart);
    const renderSource = js.slice(renderStart, renderEnd);
    expect(renderSource).toContain('comparisonInvokingRowId');
    expect(renderSource).toContain('tr.focus(');
  });

  test('diffHeaders uses multimap to preserve duplicate header names', () => {
    const diffStart = js.indexOf('function diffHeaders(');
    const diffEnd = js.indexOf('function diffQueryParams(', diffStart);
    const diffSource = js.slice(diffStart, diffEnd);
    // Must use a multimap pattern (array of occurrences), not a plain Map first-occurrence
    expect(diffSource).toContain('makeMultimap');
    expect(diffSource).toContain('Math.max(listA.length, listB.length)');
  });

  test('compare-close-btn has explicit focus-visible style in CSS', () => {
    expect(css).toContain('.compare-close-btn:focus-visible');
  });
});

describe('search matches-only toggle contracts', () => {
  test('exposes a switch control in the search panel footer', () => {
    expect(html).toMatch(/id="searchMatchesOnlyToggle"[^>]*role="switch"/);
    expect(html).toContain('class="search-matches-only"');
    expect(css).toContain('.search-toggle-track');
    expect(css).toContain('.search-matches-only input:checked + .search-toggle-track');
    expect(css).toContain('.search-matches-only input:focus-visible + .search-toggle-track');
    // The switch sits directly after "+ Add keyword" so it is visible even in
    // narrow panels, and the footer wraps instead of clipping.
    expect(html).toMatch(/id="searchAddBtn"[^>]*>[^<]*<\/button>\s*<label class="search-matches-only"/);
    expect(css).toMatch(/\.search-panel-footer\{[^}]*flex-wrap:wrap/);
  });

  test('keeps capture-time search notices out of the top bar so buttons do not jitter', () => {
    expect(html).toContain('id="searchPanelNotice"');
    expect(css).toMatch(/\.search-panel-notice\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
    // The top-bar count must not carry the variable-width body-progress text.
    expect(js).not.toMatch(/searchCount\.textContent \+= ' · ' \+ unsearchedBodies/);
    expect(js).toContain("noticeParts.push(unsearchedBodies + ' bodies not searched')");
    // The count box itself is fixed-width, so the trash/import/export icons
    // after it never move as match counts change during capture.
    expect(css).toMatch(/\.search-count\{[^}]*flex:0 0 70px[^}]*width:70px[^}]*overflow:hidden/);
  });

  test('renders and exports through the shared matches-only visibility planner', () => {
    expect(js).toContain('matchesOnly: false');
    // Both the table render and HAR export must consult the same planner so the
    // exported set is exactly what the list shows.
    const plannerCalls = js.match(/planVisibleSearchRows\(/g) || [];
    expect(plannerCalls.length).toBeGreaterThanOrEqual(3); // definition + render + export
    expect(js).toMatch(/function getExportRows\(\) \{[^}]*planVisibleSearchRows\(/s);
  });

  test('survives Clear undo like the other search settings', () => {
    expect(js).toContain('searchMatchesOnly: state.search.matchesOnly === true');
    expect(js).toContain('searchMatchesOnly: context.searchMatchesOnly === true');
    expect(js).toContain('state.search.matchesOnly = restorePlan.searchMatchesOnly;');
  });
});

describe('detail pane search contracts', () => {
  test('attaches the in-pane search bar to the Body and Raw views of both inspectors', () => {
    expect(js).toContain('attachPaneSearch(reqBodyPane, text);');
    expect(js).toContain('attachPaneSearch(reqRawPane);');
    expect(js).toContain('attachPaneSearch(resBodyPane, text);');
    expect(js).toContain('attachPaneSearch(resRawPane);');
  });

  test('renders hits through safe DOM APIs with theme-token styling', () => {
    // Hits are wrapped via createElement/textContent (never innerHTML).
    expect(js).toMatch(/mark\.className = 'pane-search-hit';\s*\n\s*mark\.textContent =/);
    expect(css).toContain('mark.pane-search-hit{background:color-mix(in srgb,var(--search-yellow) var(--hl-primary-pct),transparent)');
    expect(css).toContain('mark.pane-search-hit-current');
    // The bar is pinned to the bottom of the pane, flush with its edges.
    expect(css).toMatch(/\.pane-search-bar\{[^}]*position:sticky[^}]*bottom:0/);
    expect(css).toMatch(/\.tab-pane\.pane-search-host\.active\{[^}]*flex-direction:column[^}]*min-height:100%/);
    expect(js).toContain('pane.appendChild(bar);');
  });

  test('bounds the hit count so huge bodies stay responsive', () => {
    expect(js).toContain('PANE_SEARCH_MAX_HITS = 1500');
    expect(js).toMatch(/marks\.length >= PANE_SEARCH_MAX_HITS/);
  });

  test('counts hits hidden in collapsed content and offers Expand all', () => {
    expect(js).toContain('function expandPaneTruncations(pane, bar)');
    expect(js).toContain("count.textContent += ' (+' + collapsedHits + ' collapsed)';");
    expect(js).toContain('expandBtn.hidden = collapsedHits === 0;');
    // Both truncating panes provide their full source text for the count.
    expect(js).toContain('attachPaneSearch(resBodyPane, text);');
    expect(js).toContain('attachPaneSearch(reqBodyPane, text);');
    expect(css).toContain('.pane-search-expand');
  });

  test('decodes html bodies via the meta-declared charset when headers lack one', () => {
    expect(js).toContain('function extractHtmlMetaCharset(prefixText)');
    expect(js).toContain('function isHtmlLikeMime(mime)');
    // The sniff is gated on html-like mime types at every decode site.
    const gatedCalls = js.match(/isHtmlLikeMime\(/g) || [];
    expect(gatedCalls.length).toBeGreaterThanOrEqual(5); // definition + 3 live sites + SAZ
  });
});

describe('search options and preference persistence contracts', () => {
  test('exposes the three match-option buttons with pressed states', () => {
    for (const id of ['searchOptCaseBtn', 'searchOptWordBtn', 'searchOptRegexBtn']) {
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*aria-pressed="false"`));
    }
    expect(css).toContain('.search-opt-btn[aria-pressed="true"]');
    expect(css).toContain('.search-keyword-input-error,.pane-search-input-error');
  });

  test('persists only boolean search preferences, never keyword text', () => {
    expect(js).toContain("const SEARCH_PREFS_KEY = 'networkPlus.searchPrefs';");
    expect(js).toContain('function normalizeSearchPrefs(raw)');
    // The saved shape is rebuilt from scope/options/matchesOnly exclusively.
    expect(js).toMatch(/function currentSearchPrefs\(\) \{\s*return \{\s*scope: \{ \.\.\.state\.search\.scope \},\s*options: \{ \.\.\.state\.search\.options \},\s*matchesOnly: state\.search\.matchesOnly === true,\s*\};/);
    expect(js).not.toMatch(/SEARCH_PREFS_KEY[^\n]*keywords/);
  });

  test('Ctrl+F prefers the focused detail pane search bar', () => {
    expect(js).toMatch(/closest\('\.tab-pane'\)[\s\S]{0,200}querySelector\('\.pane-search-input'\)/);
    expect(js).toContain('paneSearchInput.focus();');
  });
});

describe('devtools-session mirror contracts', () => {
  test('the toolbar offers a pop-out that opens this panel as a browser tab', () => {
    expect(html).toContain(
      '<button id="popoutBtn" title="Open Network+ in a browser tab; it mirrors this DevTools session (Ctrl/⌘+Shift+M)" data-i18n-title="titlePopoutBtn" aria-label="Open Network+ in a browser tab; it mirrors this DevTools session" aria-keyshortcuts="Control+Shift+M Meta+Shift+M" class="icon-btn" hidden>🪟</button>',
    );
    expect(js).toContain("window.open('panel.html?view=window&src=' + encodeURIComponent(String(inspectedTabId)))");
    // The button only appears where a DevTools session can host a mirror.
    expect(js).toContain('popoutBtn.hidden = false;');
  });

  test('the mirror tab drives capture remotely and reports its session state', () => {
    // Only the pop-out button itself is meaningless inside the tab; every
    // capture control stays visible and executes in the host over the port.
    expect(js).toContain('const popoutControl = $(\'#popoutBtn\');\n      if (popoutControl) popoutControl.hidden = true;');
    expect(js).toContain("pauseBtn: () => sendViewerCommand('pause-toggle', {}, 'Pause/resume'),");
    expect(js).toContain("clearBtn: () => sendViewerCommand('clear', {}, 'Clear'),");
    expect(js).toContain("undoClearBtn: () => sendViewerCommand('undo-clear', {}, 'Undo clear'),");
    expect(js).toContain("wsCaptureBtn: () => sendViewerCommand('stream-toggle', {}, 'Stream capture'),");
    expect(js).toContain('retentionSaveBtn: () =>');
    expect(js).toContain("viewerSession.sendImportFile(file.name, importBytes, (error) => {");
    expect(js).toContain("mirrorViewerResendDispatch = (spec, done) => viewerSession.sendCommand('resend', { spec }, done);");
    // Same-element listeners fire in registration order, so remote control
    // must intercept at the document capture phase, ahead of any target
    // listener, and stop the event there.
    expect(js).toContain('viewerControlCommands[control.id]();');
    expect(js).toContain('event.stopPropagation();');
    // Host-side execution reuses the real controls so undo snapshots and
    // guards behave exactly like a local click, and every command answers.
    expect(js).toContain("done('Unknown mirror command: ' + name);");
    expect(js).toContain('streamCapture: mirrorStreamCaptureState(),');
    expect(js).toContain('undoAvailable: !!state.clearUndoSnapshot,');
    // The toolbar display rule would defeat the hidden attribute without this
    // guard, leaving "hidden" controls visible (caught by browser smoke).
    expect(css).toContain('.topbar button[hidden]{display:none}');
    expect(js).toContain("'Waiting for the DevTools session...'");
    expect(js).toContain("'Mirroring the DevTools session'");
    expect(js).toContain("'Mirroring the DevTools session (recording paused)'");
    expect(js).toContain("'The DevTools session disconnected; captured requests remain available. '");
    // Opening the pop-out asks the background worker to tuck an undocked
    // DevTools window away; the worker reads no tab data and answers a
    // docked session with minimized: false.
    const backgroundJs = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
    expect(js).toContain("mirrorRuntime.sendMessage({ type: 'networkplus-minimize-devtools' }, (response) => {");
    // The pop-out status reports the outcome either way; a silent no-op
    // never leaves the user guessing why DevTools did not move.
    expect(js).toContain('the DevTools window is minimized and keeps capturing');
    expect(js).toContain('DevTools stayed put — undock it into its own window');
    // The minimize outcome also rides the sync control payload, so the
    // mirror tab can explain the docked duplication itself: a one-time
    // dialog warns that closing DevTools stops capture and teaches the
    // single undock that makes future pop-outs tidy.
    expect(js).toContain('popoutDevtoolsMinimized = !!(response && response.minimized === true);');
    expect(js).toContain('devtoolsMinimized: popoutDevtoolsMinimized,');
    expect(js).toContain('if (control.devtoolsMinimized === false) maybeShowUndockHint();');
    expect(js).toContain("const UNDOCK_HINT_KEY = 'networkPlus.undockHint.v1';");
    expect(js).toContain("localStorage.getItem(UNDOCK_HINT_KEY) === '1'");
    expect(js).toContain("localStorage.setItem(UNDOCK_HINT_KEY, '1');");
    expect(html).toContain('<dialog id="undockHintDialog"');
    expect(html).toContain('Closing DevTools stops capture and freezes this tab.');
    expect(html).toContain('id="undockHintDontShowAgain"');
    expect(backgroundJs).toContain("message.type !== 'networkplus-minimize-devtools'");
    // windowTypes is ignored by getLastFocused (deprecated since Chrome 46)
    // and the fresh tab steals focus before the worker answers, so getAll
    // filters by type and focus only breaks ties between DevTools windows.
    expect(backgroundJs).toContain("chrome.windows.getAll({ windowTypes: ['devtools'] }");
    expect(backgroundJs).toContain('devtoolsWindows.find((candidate) => candidate.focused === true)');
    expect(backgroundJs).toContain("(devtoolsWindows.length === 1 ? devtoolsWindows[0] : null)");
    expect(backgroundJs).toContain("chrome.windows.update(target.id, { state: 'minimized' }");
    expect(backgroundJs).not.toContain('tabs');
    const manifestJson = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    expect(manifestJson.background).toEqual({ service_worker: 'background.js' });
    expect(manifestJson.permissions).toEqual(['storage']);
    // The viewer never runs automatic body prefetch: bodies cross the port
    // only when a row asks, and a closed DevTools session must not turn the
    // queued prefetches into logged failures on the extension-errors page.
    expect(js).toContain(
      "if (getMirrorViewParams(window.location ? window.location.search : '').viewerMode) {\n      state.automaticResponsePrefetchScheduler = null;\n    }",
    );
    // Live-row commits must tolerate the absent scheduler instead of crashing.
    expect(js).toContain(
      'if (state.automaticResponsePrefetchScheduler) {\n      for (const row of liveRows) {\n        state.automaticResponsePrefetchScheduler.enqueue(row);\n      }\n    }',
    );
    // The disconnect message teaches the keep-capturing workaround instead
    // of leaving the viewer to discover why the stream stopped.
    expect(js).toContain(
      "'To capture without interruption, keep DevTools open — undocked into its own window and minimized is fine.'",
    );
  });

  test('the mirror link survives real life: reattach, timeouts, leaks, and disconnected controls', () => {
    // A mirror tab that outlived its DevTools session reattaches through a
    // bounded startup probe instead of stranding behind a duplicate tab.
    expect(js).toContain('let mirrorProbeAttemptsLeft = MIRROR_ADOPT_PROBE_ATTEMPTS;');
    expect(js).toContain("setStatus('An existing Network+ tab reattached and mirrors this DevTools session again.');");
    expect(js).toContain("setStatus('A Network+ tab is already mirroring this session; switch to it in the tab strip.');");
    // An adopted tab that reloads gets fresh probe attempts.
    expect(js).toContain('mirrorProbeAttemptsLeft = MIRROR_ADOPT_PROBE_ATTEMPTS;\n            startMirrorReconnect();');
    // Commands time out instead of hanging their affordance, with a budget
    // that respects a legitimate 64 MiB import decode.
    expect(js).toContain('const MIRROR_COMMAND_TIMEOUT_MS = 30 * 1000;');
    expect(js).toContain('const MIRROR_IMPORT_RESULT_TIMEOUT_MS = 120 * 1000;');
    expect(js).toContain("'The DevTools session did not answer in time; the command may still have applied.'");
    // A disconnected viewer's accumulated import chunks are dropped, and a
    // transfer lying about its size is refused during accumulation.
    expect(js).toContain('hostSession.dropImportTransfers();');
    expect(js).toContain("'The transfer exceeded its declared size and was refused.'");
    // A disconnected remote resend reports inside the dialog instead of
    // throwing with the dialog stuck open.
    expect(js).toContain("showResendError('Re-send failed: ' + dispatchError.message);");
    // Theme and language changes propagate live between the panel and the
    // mirror tab over the shared extension storage.
    expect(js).toContain('chrome.storage.onChanged.addListener((changes, areaName) => {');
  });

  test('mirror transport stays inside the extension with no new permissions', () => {
    // The port name is namespaced and scoped per inspected tab; capture stays
    // in the DevTools session and bodies travel only on demand.
    expect(js).toContain("const MIRROR_PORT_PREFIX = 'networkplus-mirror:';");
    expect(js).toContain("mirrorRuntime.connect({ name: mirrorPortName })");
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    expect(manifest.permissions).toEqual(['storage']);
  });

  test('the initiator column links into Sources only where DevTools exists', () => {
    expect(js).toContain('initiator && initiator.url && canOpenDevtoolsResource()');
  });
});

describe('navigation persistence contracts', () => {
  test('navigation marks unfetched bodies and never clears the table', () => {
    const navStart = js.indexOf('chrome.devtools.network.onNavigated.addListener');
    expect(navStart).toBeGreaterThan(-1);
    const navBlock = js.slice(navStart, js.indexOf("setStatus('Capturing...')", navStart));
    // The sweep must cover rows held by a pending clear-undo snapshot too:
    // they were detached from state.rows but keep their request objects, and
    // Undo would otherwise restore them into doomed body fetches.
    expect(navBlock).toContain('state.clearUndoSnapshot ? state.clearUndoSnapshot.rows : []');
    expect(navBlock).toContain('markUnfetchedRowsForNavigation(');
    expect(navBlock).toContain('pendingLiveRows.concat(state.rows, heldSnapshotRows)');
    expect(navBlock).toContain("'Page navigated; kept '");
    expect(navBlock).toContain("' response bodies were not retrieved in time.'");
    // The listener may mark bodies, but must never drop rows.
    for (const forbidden of [
      'removeRowsFromState(',
      'state.rows = [',
      'clearStoredRows(',
      'detachStoredRowsForClearUndo(',
    ]) {
      expect(navBlock).not.toContain(forbidden);
    }
    expect(js).toContain(
      "'The inspected page navigated away before this response body was retrieved.'",
    );
    // The mirror tab receives the same terminal reason instead of a generic
    // unavailable message.
    expect(js).toContain('row.responseContentReason');
  });
});

describe('export scope contracts', () => {
  test('CSV export is sanitized-only metadata riding the shared scope machinery', () => {
    expect(html).toMatch(/id="dataSafetyCsvBtn"[^>]*>Export sanitized CSV</);
    expect(js).toContain("$('#dataSafetyCsvBtn').addEventListener('click', () => {");
    expect(js).toContain('exportCsv(scope);');
    expect(js).toContain("'id,method,status,statusText,domain,type,operation,durationMs,sizeBytes,url'");
    // Sanitize-first: rows route through the clipboard sanitizer before any
    // CSV text exists, and no header or body fields join the line.
    expect(js).toMatch(
      /function buildCsvPayload[\s\S]{0,400}sanitizeClipboardRow\('markdown', row, '', \{ mode: 'sanitized' \}\)/,
    );
    const csvBlock = js.slice(js.indexOf('function formatRowsCsv'), js.indexOf('function buildCsvPayload'));
    expect(csvBlock).not.toMatch(/requestHeaders|responseHeaders|requestPostData|responseContent/);
  });

  test('the pop-out has a panel-scoped keyboard shortcut that no-ops without a session', () => {
    expect(html).toMatch(/id="popoutBtn"[^>]*aria-keyshortcuts="Control\+Shift\+M Meta\+Shift\+M"/);
    expect(html).toContain('Open the pop-out mirror tab (DevTools sessions only)');
    expect(js).toContain('function isPopoutShortcut(');
    expect(js).toContain('if (!popoutControl || popoutControl.hidden) return;');
  });

  test('row quick filters feed the same multiText rules the Filters popup edits', () => {
    // The pair is built for whichever column the pointer landed on, so any
    // column can be isolated or excluded in one click, not only the domain.
    expect(js).toContain("createRowMenuButton('Only ' + suffix, () => applyQuickFilter('contains'), 'Only ' + fullSuffix)");
    expect(js).toContain(
      "createRowMenuButton('Exclude ' + suffix, () => applyQuickFilter('notcontains'), 'Exclude ' + fullSuffix)",
    );
    // The rule carries the whole value; only the menu label is shortened, and
    // the tooltip keeps the full text so it stays inspectable before clicking.
    expect(js).toContain('applyColumnQuickFilterTo(quickFilterTarget.id, quickFilterTarget.value, op)');
    expect(js).toContain("const suffix = quickFilterTarget.label + ' ' + shortenMenuValue(quickFilterTarget.value);");
    expect(js).toContain("if (title && title !== text) button.title = title;");
    // A query string is per-request state, so a rule built from one matches a
    // single request — the opposite of what excluding noise asks for.
    expect(js).toContain('const value = getQuickFilterValue(contextMenuRow, invokingColId);');
    expect(js).toContain("if (colId !== 'path' && colId !== 'url') return value;");
    // No single menu entry may stretch the menu across the viewport again.
    expect(css).toMatch(/\.context-menu\{[^}]*max-width:min\(420px,calc\(100vw - 16px\)\)/);
    expect(css).toMatch(/\.context-menu-item\{[^}]*text-overflow:ellipsis/);
    // "Only" replaces earlier inclusions so two picks never intersect to
    // zero rows; exclusions accumulate.
    expect(js).toContain("if (op === 'contains') conditions = conditions.filter((cond) => cond.op !== 'contains');");
    expect(js).toContain("state.columnFilterRules[colId] = { mode: 'multiText', conditions };");
    // The context menu and the domain summary panel still delegate to one
    // writer, so both surfaces stay behaviorally identical.
    expect(js).toContain(
      "const applyDomainQuickFilterTo = (domain, op) => applyColumnQuickFilterTo('domain', domain, op);",
    );
    // The column is read off the clicked cell rather than counted by index,
    // which would break as soon as a column is hidden or reordered.
    expect(js).toContain('td.dataset.colId = c.id;');
    expect(js).toContain("const cell = event.target.closest('td[data-col-id]');");
    // A column with nothing to filter on falls back to the domain pair.
    expect(js).toContain('quickFilterColumn || (quickFilterDomain ?');
    expect(js).toContain('if (!invokingColId || isVisualOnlyColumn(invokingColId)) return null;');
  });

  test('full copy formats sit in the row menu, not behind a modal', () => {
    // The retired dialog picked the format and took the confirmation in one
    // modal. The picker is what people came for, so all eight formats it
    // offered are reachable straight from the menu.
    expect(js).toContain('const FULL_COPY_FORMATS = [');
    for (const action of ['summary', 'url', 'curl', 'fetch', 'powershell', 'markdown', 'rawRequest', 'requestBody']) {
      expect(js).toContain("['" + action + "', '");
    }
    expect(js).not.toContain('function requestFullRequestCopy');
    expect(js).not.toContain('showCopyFormat');
    expect(html).not.toContain('id="dataSafetyCopyFormat"');

    // Collapsed by default, so the menu keeps the height it had; the label
    // names what it hands out at the point of choosing rather than after.
    expect(js).toContain("fullCopyToggle.textContent = '▸ Copy full (unsanitized)';");
    expect(js).toContain("fullCopyToggle.setAttribute('aria-expanded', 'false');");
    expect(js).toContain('fullCopyGroup.hidden = true;');
    expect(js).toContain('fullCopyGroup.hidden = !expanding;');
    // Expanding changes the menu's height, so it has to be re-clamped.
    expect(js).toContain('reclampOpenPopups();');
    // A collapsed item is not an arrow-key destination.
    expect(js).toContain("(element) => element.tabIndex !== -1 && !element.closest('[hidden]'),");
    // No display rule on the group, so the hidden attribute works unaided.
    expect(css).toMatch(/\.context-menu-submenu\{(?![^}]*display:)[^}]*\}/);

    // Full HAR export and the full body copies keep their confirmation.
    expect(js).toContain("title: 'Copy full ' + label + '?',");
    expect(js).toContain("onConfirm: () => exportHAR({ mode: 'full', confirmed: true, scope })");
  });

  test('a popup clamp never widens a popup past its own stylesheet cap', () => {
    // An inline style outranks the sheet, so writing the viewport width here
    // unconditionally undid the context menu's 420px bound every time it
    // opened — the CSS cap only looked like it was working.
    expect(js).toContain('const styleMaxWidth = parseFloat(window.getComputedStyle(popup).maxWidth);');
    expect(js).toContain(
      "Math.min(position.maxWidth, Number.isFinite(styleMaxWidth) ? styleMaxWidth : Infinity) + 'px';",
    );
  });

  test('the domain summary panel lives outside the pinned toolbar and tbody', () => {
    // The toolbar's button set, tab order, and fit breakpoints are pinned by
    // the responsive journeys, so the toggle lives in the Columns menu; the
    // panel itself sits above the whole workbench, outside #content and
    // #tbody, keeping every flat-grid invariant untouched.
    expect(js).toContain("const DOMAIN_SUMMARY_KEY = 'networkPlus.domainSummary.v1';");
    expect(js).toContain("contentElement.insertAdjacentElement('beforebegin', domainSummaryPanel);");
    expect(js).toContain("domainToggle.id = 'domainSummaryToggle';");
    expect(js).toContain('localStorage.removeItem(DOMAIN_SUMMARY_KEY);');
    expect(html).not.toContain('domainSummary');
    // The flex display rule must not defeat the hidden attribute (the
    // toolbar once shipped exactly that bug).
    expect(css).toContain('#domainSummary[hidden]{display:none}');
    // The refresh hook rides updateTableSummary, which every full render and
    // both incremental-append exits already call — the streaming fast path
    // needs no edits and never re-enters eligibility logic for the panel.
    const summaryStart = js.indexOf('function updateTableSummary(');
    const summaryBlock = js.slice(summaryStart, js.indexOf('\n  function ', summaryStart + 1));
    expect(summaryBlock).toContain('if (state.syncDomainSummary) state.syncDomainSummary();');
    // The panel block builds DOM without innerHTML. init() is the last
    // top-level function in the file, so the slice ends at an explicit
    // literal marker instead of the usual next-function idiom.
    const panelStart = js.indexOf('const domainSummaryPanel = document.createElement');
    const panelEnd = js.indexOf('// [U6] Roving row focus', panelStart);
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelBlock = js.slice(panelStart, panelEnd);
    expect(panelBlock).not.toContain('innerHTML');
    expect(panelBlock).toContain('state.syncDomainSummary = renderDomainSummary;');
    expect(panelBlock).toContain("applyDomainQuickFilterTo(entry.domain, 'contains');");
    // The no-host bucket is informational only: an empty-value condition
    // would be silently skipped by the filter engine.
    expect(panelBlock).toContain("if (entry.domain === '')");
    // A click on a domain that already spans every filtered row changes no
    // aggregate, so the rebuild-skip signature carries the pressed state.
    expect(panelBlock).toContain("activeDomains.has(entry.domain) ? 1 : 0,");
  });

  test('the configurable header column rides the shared column pipeline', () => {
    expect(js).toContain("{ id: 'customHeader', label: 'Header', width: 160, visible: false },");
    expect(js).toContain("const CUSTOM_HEADER_COLUMN_KEY = 'networkPlus.customHeaderColumn.v1';");
    // Filtering, sorting, and cell rendering all resolve through one lookup
    // with response-header precedence.
    expect(js).toContain("if (colId === 'customHeader') return getRowHeaderColumnValue(row);");
    expect(js).toContain("if (c.id === 'customHeader') v = getRowHeaderColumnValue(row);");
    // The Columns menu hosts the binding UI; applying a name reveals the
    // column so the setting is never invisible.
    expect(js).toContain("headerInput.id = 'customHeaderNameInput';");
    expect(js).toContain('saveCustomHeaderColumnName(headerInput.value);');
    expect(js).toContain('if (column && customHeaderColumnName && !column.visible) {');
  });

  test('a pasted cURL command fills the resend dialog and fails closed on the unknown', () => {
    expect(html).toMatch(/id="resendCurlInput"/);
    expect(html).toMatch(/id="resendCurlFillBtn"[^>]*>Fill fields from cURL</);
    expect(js).toContain('const parsed = parseCurlCommand(resendCurlInput.value);');
    expect(js).toContain("showResendError('cURL import failed: ' + parsed.error + '.');");
    expect(js).toContain("return { ok: false, error: 'the cURL flag ' + token + ' is not supported here' };");
    // The parser is pure string work: no network, DOM, or storage access.
    const parserBlock = js.slice(
      js.indexOf('function tokenizeShellCommand'),
      js.indexOf('function pageResendRunner'),
    );
    expect(parserBlock.length).toBeGreaterThan(0);
    expect(parserBlock).not.toMatch(/fetch\s*\(|XMLHttpRequest|document\.|localStorage|chrome\./);
  });

  test('the export dialog offers a selected-rows scope only when a selection exists', () => {
    expect(html).toContain('<fieldset id="dataSafetyScope" class="data-safety-scope" hidden>');
    expect(html).toContain(
      '<label><input type="radio" name="dataSafetyScopeChoice" id="dataSafetyScopeDisplayed" value="displayed" checked> <span data-i18n="dataSafetyScopeDisplayed">All displayed requests</span> (<span id="dataSafetyScopeDisplayedCount">0</span>)</label>',
    );
    expect(html).toContain(
      '<label><input type="radio" name="dataSafetyScopeChoice" id="dataSafetyScopeSelected" value="selected"> <span data-i18n="dataSafetyScopeSelected">Selected requests only</span> (<span id="dataSafetyScopeSelectedCount">0</span>)</label>',
    );
    expect(js).toContain('scope.hidden = selectedCount === 0;');
    // Displayed rows are re-checked on every open so a leftover selection
    // never silently narrows an export.
    expect(js).toContain("$('#dataSafetyScopeDisplayed').checked = true;");
    expect(css).toContain('.data-safety-scope[hidden]{display:none}');
  });

  test('both export modes honor the captured scope and the empty-selection guard', () => {
    expect(js).toContain("exportHAR({ mode: 'sanitized', scope });");
    expect(js).toContain("onConfirm: () => exportHAR({ mode: 'full', confirmed: true, scope }),");
    expect(js).toContain("setStatus('No selected requests to export.');");
    expect(js).toContain("(exportScope === 'selected' ? getSelectedExportRows() : getExportRows()).slice()");
  });
});

describe('method badge contracts', () => {
  const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'ws', 'sse'];

  test('every method badge pair meets WCAG AA in every theme state', () => {
    for (const [name, theme] of [
      ['light', light],
      ['systemDark', systemDark],
      ['forcedDark', forcedDark],
      ['forcedLight', forcedLight],
    ]) {
      for (const method of METHODS) {
        const fg = theme['method-' + method + '-fg'];
        const bg = theme['method-' + method + '-bg'];
        expect(fg).toBeDefined();
        expect(bg).toBeDefined();
        const ratio = contrastRatio(fg, bg);
        if (ratio < 4.5) {
          throw new Error(name + ' method-' + method + ' badge contrast ' + ratio.toFixed(2) + ' < 4.5');
        }
      }
    }
  });

  test('badges color through row method classes so unknown methods stay plain', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'WS', 'SSE']) {
      const lower = method.toLowerCase();
      expect(css).toContain(
        '.grid tbody tr.method-' +
          method +
          ' .method-badge{color:var(--method-' +
          lower +
          '-fg);background:var(--method-' +
          lower +
          '-bg)}',
      );
    }
    expect(css).toContain('.method-badge{display:inline-block;min-width:34px;');
    expect(js).toContain("contentHost.className = 'method-badge';");
  });
});

describe('stream capture contracts (WebSocket + SSE)', () => {
  test('WS conversations round-trip through HAR with honest losses and sanitized omission', () => {
    expect(js).toContain('function recordWsFrame(row, frame) {');
    expect(js).toContain('entry._webSocketMessages = r._wsFrames.map((frame) => {');
    // Chrome-shaped output: epoch seconds, opcode 1 text, opcode 2 binary
    // without data, fidelity losses declared on the entry.
    expect(js).toContain('time: Number.isFinite(frame.time) ? frame.time / 1000 : 0,');
    expect(js).toContain('if (!frame.binary) message.data = frame.data;');
    expect(js).toContain('binaryFramesWithoutPayload: binaryFrames,');
    // SSE rows never get the WebSocket-entry key.
    expect(js).toContain("if (row.method !== 'SSE') {");
    // Sanitized output stays allowlist-built and marks the omission.
    expect(js).toContain('webSocketFramesOmitted: entry._webSocketMessages.length,');
  });

  test('capture is an explicit statusbar opt-in that names its own limits', () => {
    expect(html).toContain('id="wsCaptureBtn"');
    expect(html).toContain('only connections created while capture is on are seen, and traffic is never altered');
    expect(html).toMatch(/id="wsCaptureBtn"[^>]*aria-pressed="false"[^>]*hidden/);
    expect(html).toContain('>Stream capture: Off</button>');
    expect(css).toContain('.ws-capture-btn[aria-pressed="true"]{');
    expect(js).toContain(
      "wsCaptureBtn.textContent = streamCapture.enabled ? 'Stream capture: On' : 'Stream capture: Off';",
    );
    expect(js).toContain("setStatus('Stream capture on; WebSocket and SSE connections created from now on are recorded.');");
    expect(js).toContain("setStatus('Stream capture off; recorded connections stay in the table.');");
  });

  test('both wrappers inject through inspectedWindow.eval and survive navigation', () => {
    expect(js).toContain('chrome.devtools.inspectedWindow.eval.bind(chrome.devtools.inspectedWindow)');
    expect(js).toContain('inspectedEval(buildWsWrapperSource(), () => {});');
    expect(js).toContain('inspectedEval(buildSseWrapperSource(), () => {});');
    expect(js).toContain("inspectedEval('window.__networkPlusWS__ ? window.__networkPlusWS__.drain() : []'");
    expect(js).toContain("inspectedEval('window.__networkPlusSSE__ ? window.__networkPlusSSE__.drain() : []'");
    expect(js).toContain('if (streamCapture.enabled) injectStreamWrappers();');
    // Recording discipline matches live capture: paused and sample sessions
    // drop drained events instead of recording them.
    expect(js).toContain('if (state.paused || state.sampleCaptureActive) return;');
    // First-batch frames arrive while the row still sits in the live-flush
    // queue; queued rows must count as alive or the connection goes silent.
    expect(js).toContain('(!state.activeRows.has(row) && !pendingLiveRows.includes(row))');
  });

  test('the SSE wrapper observes without altering and reuses the ws event dialect', () => {
    // Named events are seen only once the page listens for them; the wrapped
    // addEventListener records the type and always forwards to the native.
    expect(js).toContain('source.addEventListener = function (type, listener, options) {');
    expect(js).toContain('return nativeAdd(type, listener, options);');
    expect(js).toContain("record({ kind: 'ws-open-attempt', socketId, url: String(url), protocols: '' });");
    expect(js).toContain('Wrapped.prototype = Native.prototype;');
    expect(js).toContain("window.EventSource = Wrapped;");
    // SSE close carries no code, so the shared line formatter renders a bare close.
    expect(js).toContain("if (event.code == null) return '— ' + stamp + ' closed';");
  });
});

describe('markdown copy and HAR websocket import contracts', () => {
  test('markdown copy is offered sanitized in the menu and as a full format', () => {
    expect(js).toContain("['markdown', 'Copy sanitized Markdown'],");
    expect(js).toContain("'Copy sanitized Markdown table (' + targetRows.length + ' rows)'");
    expect(js).toContain("if (action === 'markdown') return formatRowMarkdown(targetRow);");
    expect(js).toContain("action === 'markdown' || REQUEST_CLIPBOARD_ACTIONS.has(action)");
    // The full variant moved out of the retired dialog's <select> and into the
    // row menu's collapsed full-copy group, keeping every format it offered.
    expect(js).toContain("['markdown', 'Markdown'],");
    expect(html).not.toContain('id="dataSafetyCopyFormat"');
  });

  test('HAR imports thread _webSocketMessages through the shared frame pipeline', () => {
    expect(js).toContain('applyHarWebSocketMessages(row, entries[index] ? entries[index]._webSocketMessages : null);');
    expect(js).toContain('const HAR_WS_MESSAGE_IMPORT_LIMIT = 1000;');
  });
});

describe('edit-and-resend contracts', () => {
  test('the resend dialog states the page-context boundary and the managed-header limit', () => {
    expect(html).toContain('<dialog id="resendDialog"');
    expect(html).toContain('the inspected page itself issues it');
    expect(html).toContain(
      'Browser-managed headers (Host, Cookie, Content-Length, Origin, Referer, and the Sec-* and Proxy-* families) are set by the browser and cannot be overridden here.',
    );
    for (const id of ['resendMethod', 'resendUrl', 'resendHeaders', 'resendBody', 'resendCredentials', 'resendSendBtn']) {
      expect(html).toContain('id="' + id + '"');
    }
    expect(html).toContain('<p id="resendError" class="resend-error" role="alert" hidden></p>');
    expect(css).toContain('.resend-error[hidden]{display:none}');
  });

  test('resend rides the DevTools eval channel and stays out of the mirror viewer', () => {
    expect(js).toContain('if (resendDialog && (mirrorViewerResendDispatch || (inspectedEval && !mirrorViewerActive))) {');
    expect(js).toContain('inspectedEval(buildResendEvalSource(spec), (result, errorInfo) => {');
    expect(js).toContain('if (resendActions && canResendRow(contextMenuRow)) {');
    expect(js).toContain("createRowMenuButton('Resend unchanged', () => {");
    expect(js).toContain("createRowMenuButton('Edit and resend...', () => {");
    // The composed request is a new fetch in the page; nothing in-flight is touched.
    expect(js).toContain('fetch(spec.url, init).catch(function () {});');
    expect(js).toContain("row.method !== 'WS'");
  });
});

describe('jwt decode display contracts', () => {
  test('JWT sections decode into both header panes and disclaim verification', () => {
    expect(js).toContain("const JWT_DISPLAY_NOTE = 'Decoded locally for display; the signature is not verified.';");
    expect(js).toContain('createJwtDetailsSection(row.requestHeaders)');
    expect(js).toContain('createJwtDetailsSection(row.responseHeaders)');
    expect(css).toContain('.jwt-details summary.jwt-expired{color:var(--status-5xx-text)}');
    // Display only: the decoder never feeds the clipboard/export pipeline.
    expect(js).not.toContain('decodeJwt(sanitize');
    expect(js).toContain('const JWT_MAX_TOKEN_CHARS = 8192;');
  });
});
