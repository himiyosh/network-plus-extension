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
    // The search-match badge must stay out of the ID column visually while
    // remaining in the accessibility tree.
    expect(js).toContain('label: searchMatchLabel, srOnly: true');
    expect(js).toContain("stateBadge.srOnly ? 'row-state-badge sr-only' : 'row-state-badge'");
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
    expect(emptyStateBlock).toContain("if (mode === 'capture')");
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
      /\.sample-guide-btn,\.sample-exit-btn,\.status-details-toggle\{[^}]*min-height:24px[^}]*white-space:nowrap/,
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
  test('provides a labelled narrow-safe retention dialog with an explicit unlimited warning', () => {
    expect(html).toMatch(/id="retentionBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="retentionDialog"/);
    expect(html).toMatch(/<dialog id="retentionDialog"[^>]*aria-labelledby="retentionDialogTitle"/);
    expect(html).toMatch(/<label for="retentionLimit">Maximum retained requests<\/label>/);
    expect(html).toMatch(/id="retentionUnlimited"[^>]*aria-describedby="retentionWarning"/);
    expect(html).toMatch(/id="retentionWarning"[^>]*role="alert"[^>]*hidden/);
    expect(html).toMatch(/id="retentionStatus"[^>]*>cache /);
    expect(html).not.toMatch(/id="retentionStatus"[^>]*>[^<]*Retention /);
    expect(html).toMatch(/id="retentionBtn"[^>]*>Retention: /);
    expect(html).not.toMatch(/id="retentionStatus"[^>]*(?:role|aria-live)=/);
    expect(html).toMatch(/id="retentionAnnouncement"[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
    expect(css).toMatch(/#retentionDialog\{[^}]*width:min\(420px,calc\(100vw - 16px\)\)[^}]*overflow:auto/);
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
    const catchBlock = js.slice(
      js.indexOf('} catch (error) {', js.indexOf("importFile.addEventListener('change'")),
      js.indexOf('} finally {', js.indexOf("importFile.addEventListener('change'")),
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

  test('uses one retention presentation for the visible and accessible button labels', () => {
    const statusStart = js.indexOf('function updateRetentionStatus');
    const statusEnd = js.indexOf('function updateTableSummary', statusStart);
    const statusSource = js.slice(statusStart, statusEnd);
    expect(statusSource).toContain(
      'const presentation = getRetentionPresentation(retention.requestLimit, retention.unlimited);',
    );
    expect(statusSource).toContain('button.textContent = presentation.buttonLabel;');
    expect(statusSource).toContain("button.setAttribute('aria-label', presentation.accessibleName);");
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
    expect(js).toContain("encoding === 'base64' && row.type && row.type.startsWith('image/')");
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
    const retentionSaveStart = js.indexOf("$('#retentionSaveBtn').addEventListener('click'");
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
    expect(js).toContain("outboundPolicy.mode === 'full' ? 'network-plus-full.har' : 'network-plus-sanitized.har'");
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
    expect(js).toContain("onConfirm: () => exportHAR({ mode: 'full', confirmed: true })");
    expect(js).toContain("exportHAR({ mode: 'sanitized' });");
    expect(js).not.toMatch(/addEventListener\('click',\s*exportHAR\)/);
    expect(js).not.toMatch(/localStorage\.(?:setItem|getItem)\([^)]*(?:full|safety)/i);
  });

  test('fails clipboard, download, and sanitizer errors closed without secret-bearing logs', () => {
    expect(js).toContain('Clipboard copy failed. No data was copied.');
    expect(js).toContain('Sanitized copy failed closed. No data was copied.');
    expect(js).toContain('HAR export failed. No file was downloaded.');
    expect(js).not.toContain("console.error('HAR export failed'");
    expect(js).not.toContain("setStatus('HAR export failed: ' + message)");
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
    expect(js).toContain("summary.textContent = 'What do the timing phases mean?'");
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
      /<kbd>Ctrl<\/kbd>\+<kbd>L<\/kbd> \(Windows\/Linux\) \/ <kbd>⌘<\/kbd>\+<kbd>K<\/kbd> \(macOS\)<\/td><td>Clear all requests<\/td>/,
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
    // dialog trigger role, the peeking cat, the steaming cup, and a hover-only
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
      'brand-otter-eye',
      'brand-otter-doze',
      'brand-otter-tail',
      'brand-otter-paw',
      'brand-zzz',
      'brand-heart',
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
    // never followed blind.
    for (const { url } of supportLinks) {
      expect(html).toContain(`<span class="support-option-hint">${url.replace('https://', '')} ·`);
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
    // The sleeping cat sits above the low, bottom-aligned "for DevTools"
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
    expect(css).toMatch(/\.brand-otter[^}]*\{transform:translateY\(-1px\)\}/);
    // Idle beats: breathing, a slow tail flick, a rare drifting z and heart.
    expect(css).toMatch(/\.brand-otter-motion\{[^}]*animation:brand-otter-breathe 4\.2s/);
    expect(css).toMatch(/\.brand-otter-tail\{[^}]*animation:brand-otter-tail-flick 7\.4s/);
    expect(css).toMatch(/\.brand-zzz\{[^}]*animation:brand-zzz-drift 13s/);
    expect(css).toMatch(/\.brand-heart\{[^}]*animation:brand-heart-float 19s/);
    // The floaters hang off .brand-sub, never inside the clipped cat window:
    // the motion wrapper closes, the window closes, and only then do they appear.
    expect(html).toMatch(/<span class="brand-otter-window"[^>]*>\s*<span class="brand-otter-motion">/);
    expect(html).toMatch(
      /<\/span>\s*<\/span>\s*<span class="brand-zzz"[^>]*>z<\/span>\s*<span class="brand-heart">/,
    );
    // Hover wakes the cat: closed lids give way to open eyes and breathing stops.
    expect(css).toMatch(/\.brand-otter-eye\{fill:var\(--brew\)[^}]*opacity:0/);
    expect(css).toMatch(/:hover \.brand-otter-eye[^{]*\{opacity:1\}/);
    expect(css).toMatch(/:hover \.brand-otter-doze[^{]*\{opacity:0\}/);
    // The woken pupils stay small dots set wide apart: eyes big enough to fill
    // the muzzle read as a stare at 15px, so most of the face stays fur, and no
    // drooping lid is drawn over them. Waking also raises the magnifying glass,
    // the investigator motif the otter brand mark exists for.
    expect(html.match(/class="brand-otter-eye"/g) || []).toHaveLength(2);
    expect(html).toContain('<circle class="brand-otter-eye" cx="10.5" cy="11.6" r="0.95"/>');
    expect(html).toContain('<circle class="brand-otter-eye" cx="15.0" cy="11.6" r="0.95"/>');
    // No catchlight: a 0.4-radius highlight cannot read as one inside a pupil
    // that is 1.75 device pixels wide, it only bleaches the pupil. Measured at
    // true 1x, the darkest eye pixel goes from L=65 with it to L=40 without,
    // against L=47 for the sleeping face the woken one has to out-read.
    expect(html).not.toContain('brand-otter-glint');
    expect(css).not.toContain('.brand-otter-glint{');
    expect(html).not.toContain('brand-otter-lid');
    expect(css).not.toContain('.brand-otter-lid{');
    // A blink only reads when there is a pupil to close, so it returns with the dots.
    expect(css).toMatch(/\.brand-otter-eye\{[^}]*animation:support-otter-blink 5\.2s/);
    expect(css).toMatch(/:hover \.brand-otter-motion[^{]*\{animation-play-state:paused\}/);
    // Steam is legible without hovering; hovering only strengthens it.
    expect(css).toContain('.brand-steam-group{opacity:.9;');
    expect(css).toMatch(/\.topbar button\.brand:hover \.brand-steam-group[^{]*\{opacity:1\}/);
    // Reduced motion freezes every brand animation.
    const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'));
    for (const part of ['.brand-otter', '.brand-otter-motion', '.brand-heart', '.brand-zzz', '.brand-otter-eye', '.brand-otter-doze', '.brand-otter-tail', '.brand-steam', '.brand-support-hint']) {
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
    for (const part of [
      'support-steam--a',
      'support-cup',
      'support-brew',
      'support-sparkle--a',
      'support-otter-head',
      'support-otter-tail',
      'support-otter-eye',
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
