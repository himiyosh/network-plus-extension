const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'panel.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'panel.js'), 'utf8');

const getBlock = (pattern) => {
  const match = css.match(pattern);
  expect(match).not.toBeNull();
  return match[1];
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

describe('capture retention static contracts', () => {
  test('provides a labelled narrow-safe retention dialog with an explicit unlimited warning', () => {
    expect(html).toMatch(/id="retentionBtn"[^>]*aria-haspopup="dialog"[^>]*aria-controls="retentionDialog"/);
    expect(html).toMatch(/<dialog id="retentionDialog"[^>]*aria-labelledby="retentionDialogTitle"/);
    expect(html).toMatch(/<label for="retentionLimit">Maximum retained requests<\/label>/);
    expect(html).toMatch(/id="retentionUnlimited"[^>]*aria-describedby="retentionWarning"/);
    expect(html).toMatch(/id="retentionWarning"[^>]*role="alert"[^>]*hidden/);
    expect(html).toMatch(/id="retentionStatus">Retention:/);
    expect(html).not.toMatch(/id="retentionStatus"[^>]*(?:role|aria-live)=/);
    expect(html).toMatch(/id="retentionAnnouncement"[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
    expect(css).toMatch(/#retentionDialog\{[^}]*width:min\(420px,calc\(100vw - 16px\)\)[^}]*overflow:auto/);
  });

  test('persists named budgets and routes live and imported rows through one policy', () => {
    expect(js).toContain('const DEFAULT_REQUEST_RETENTION_LIMIT = 5000;');
    expect(js).toContain('const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;');
    expect(js).toContain('const MAX_RESPONSE_CACHE_BYTES = 32 * 1024 * 1024;');
    expect(js).toContain("const RETENTION_KEY = 'networkPlus.retention.v1';");
    expect(js).toContain("addRowsWithRetention(retainedCandidates, 'import')");
    expect(js).toContain("addRowsWithRetention(chunk, 'import-buffer')");
    expect(js).toContain("addRowsWithRetention([row], 'live')");
    const clearBlock = js.slice(js.indexOf("$('#clearBtn').addEventListener"), js.indexOf('// Pause/Resume'));
    expect(clearBlock).toContain('clearStoredRows();');
    expect(clearBlock).not.toContain('state.nextId = 1');
  });

  test('uses constant-time row liveness and bounded import construction', () => {
    expect(js).toContain('retainedRows: new Set()');
    expect(js).not.toContain('state.rows.includes(row)');
    expect(js).not.toContain('const importedRows = []');
    expect(js).toContain('const importPlan = planImportRetention(');
    expect(js).toContain('if (importChunk.length >= IMPORT_CHUNK_SIZE) flushImportChunk();');
    expect(js).toContain("const renderedRows = $('#tbody') ? $all('tr[data-row-id]', $('#tbody')) : [];");
    expect(js).not.toContain("document.querySelector('tr[data-row-id=\"' + row.id");
  });

  test('debounces meaningful retention announcements without making cache bytes live', () => {
    expect(js).toContain('const RETENTION_ANNOUNCE_MS = 750;');
    expect(js).toContain("const el = $('#retentionAnnouncement');");
    const statusStart = js.indexOf('function updateRetentionStatus');
    const statusEnd = js.indexOf('function updateTableSummary', statusStart);
    expect(js.slice(statusStart, statusEnd)).not.toContain('queueRetentionAnnouncement');
    expect(js).toContain("if (display.label === 'error')");
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
    expect(js).toContain("inclAnyInput.setAttribute('aria-label', 'URL filter Include any');");
    expect(js).toContain("inclAllInput.setAttribute('aria-label', 'URL filter Include all');");
    expect(js).toContain("exclInput.setAttribute('aria-label', 'URL filter Exclude any');");
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
    expect(js).toContain('.then(() => scheduleResponseSearchRefresh(row))');

    const refreshStart = js.indexOf('function refreshSearchMatches');
    const refreshEnd = js.indexOf('function updateEmptyState', refreshStart);
    const refreshBlock = js.slice(refreshStart, refreshEnd);
    expect(refreshBlock).toContain('preserveMatchingRowIndex');
    expect(refreshBlock).not.toContain('srch.currentIndex = srch.matches.length > 0 ? 0 : -1');
  });
});

describe('scale trust static contracts', () => {
  test('batches live rows and targets selection updates without rebuilding existing rows', () => {
    expect(js).toContain('pendingLiveRows.push(row);');
    const frameBlock = js.slice(js.indexOf('window.requestAnimationFrame(() => {'), js.indexOf('if (chrome && chrome.devtools'));
    expect(frameBlock).toContain('isIncrementalAppendEligible(');

    const appendBlock = js.slice(js.indexOf('function appendIncrementalRows'), js.indexOf('function replaceRenderedRowStates'));
    expect(appendBlock).toContain('document.createDocumentFragment()');
    expect(appendBlock).not.toContain('tbody.textContent =');
    expect(appendBlock).toContain('getIncrementalAppendBatch(liveRows, renderedRowIds)');
    expect(js).toContain('queuedRows.filter((row) => isRetainedRow(row, state.retainedRows))');

    expect(js).toContain('renderedRow.replaceWith(replacement);');
    const selectionBlock = js.slice(js.indexOf('function selectRow'), js.indexOf('const titleParts', js.indexOf('function selectRow')));
    expect(selectionBlock).toContain('replaceRenderedRowStates');
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
    expect(js).not.toContain("td.setAttribute('aria-label'");
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
