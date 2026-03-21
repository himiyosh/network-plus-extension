/* exported for testing */
/* istanbul ignore next */
const _NetworkPlus = (function () {
  'use strict';

  // ============================================================
  // Section 1: Constants
  // ============================================================
  const MIN_COL_WIDTH = 20;
  const MIN_DETAILS_WIDTH = 300;
  const MIN_TABLE_WIDTH = 240;
  const RESIZER_WIDTH = 5;
  const SCROLL_THRESHOLD = 10;
  const TRUNCATE_LIMIT = 2000;
  const FILTER_DEBOUNCE_MS = 150;
  const DEEP_SEARCH_DEBOUNCE_MS = 250;
  const JSON_TREE_MAX_CHILDREN = 100;
  const JSON_TREE_MAX_DEPTH = 20;
  const JSON_TREE_PREVIEW_KEYS = 3;

  const THEME_KEY = 'networkPlus.theme';
  const THEMES = ['system', 'dark', 'light'];
  const COL_PREF_KEY = 'networkPlus.cols';
  const COL_PREF_VERSION_KEY = 'networkPlus.cols.v';
  const COL_PREF_VERSION = 2; // Bump when default visibility changes

  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  const NUMERIC_COLUMNS = ['id', 'status', 'duration', 'size'];
  const DATE_COLUMNS = ['clientStart', 'serverDone'];

  const FILTER_OPERATORS_STRING = [
    { value: 'contains', label: 'contains' },
    { value: 'notcontains', label: 'not contains' },
    { value: 'equals', label: '==' },
    { value: 'notequals', label: '!=' },
    { value: 'startswith', label: 'startsWith' },
    { value: 'endswith', label: 'endsWith' },
    { value: 'regex', label: 'regex' },
    { value: 'empty', label: 'isEmpty' },
    { value: 'notempty', label: 'isNotEmpty' },
  ];
  const FILTER_OPERATORS_NUMERIC = [
    { value: 'equals', label: '==' },
    { value: 'notequals', label: '!=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
    { value: 'empty', label: 'isEmpty' },
    { value: 'notempty', label: 'isNotEmpty' },
  ];

  const DEFAULT_COLUMNS = [
    { id: 'id', label: 'ID', width: 60, visible: true },
    { id: 'clientStart', label: 'ClientStart', width: 120, visible: true },
    { id: 'serverDone', label: 'ServerDone', width: 120, visible: true },
    { id: 'method', label: 'Method', width: 80, visible: true },
    { id: 'status', label: 'Status', width: 70, visible: true },
    { id: 'domain', label: 'Domain', width: 180, visible: true },
    { id: 'path', label: 'Path', width: 260, visible: true },
    { id: 'type', label: 'Type', width: 150, visible: true },
    { id: 'duration', label: 'Duration', width: 110, visible: true },
    { id: 'size', label: 'Size', width: 90, visible: true },
    { id: 'initiator', label: 'Initiator', width: 220, visible: false },
    { id: 'url', label: 'URL', width: 420, visible: false },
  ];

  const DEFAULT_METHOD_FILTERS = () => ({
    GET: true,
    POST: true,
    PUT: true,
    DELETE: true,
    PATCH: true,
    HEAD: true,
    OPTIONS: true,
  });

  const DEFAULT_COLUMN_FILTER_RULES = () => {
    const rules = {};
    for (const col of DEFAULT_COLUMNS) {
      rules[col.id] = {
        op: NUMERIC_COLUMNS.indexOf(col.id) > -1 ? 'equals' : 'contains',
        value: '',
      };
    }
    return rules;
  };

  const PLAY_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16px" height="16px"><path d="M8 5V19L19 12L8 5Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PAUSE_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="16px" height="16px"><path d="M6 5V19M18 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const HIGHLIGHT_COLORS = [
    { name: 'Yellow', cls: 'hl-yellow' },
    { name: 'Red', cls: 'hl-red' },
    { name: 'Green', cls: 'hl-green' },
    { name: 'Blue', cls: 'hl-blue' },
    { name: 'Purple', cls: 'hl-purple' },
    { name: 'Orange', cls: 'hl-orange' },
  ];

  // Colors for search keyword rows (index matches search-hl-N / search-row-N)
  const SEARCH_COLORS = [
    { name: 'Yellow', hex: '#fbbf24' },
    { name: 'Red', hex: '#ef4444' },
    { name: 'Green', hex: '#22c55e' },
    { name: 'Blue', hex: '#3b82f6' },
    { name: 'Purple', hex: '#a855f7' },
    { name: 'Orange', hex: '#f97316' },
  ];

  // ============================================================
  // Section 2: DOM Helpers
  // ============================================================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $all = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function setStatus(t) {
    const el = $('#statusText');
    if (el) el.textContent = t;
  }

  // ============================================================
  // Section 3: Pure Utility Functions (testable)
  // ============================================================
  function fmtBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return (v < 10 && i > 0 ? v.toFixed(1) : v.toFixed(0)) + ' ' + units[i];
  }

  function fmtTime(ms) {
    if (ms == null || isNaN(ms)) return '';
    return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s';
  }

  function extractUrlParts(url) {
    try {
      const u = new URL(url);
      return { domain: u.host, path: u.pathname + (u.search || '') };
    } catch (_e) {
      return { domain: '', path: url };
    }
  }

  function formatInitiator(initiator) {
    if (!initiator) return { text: '(unknown)', typeLabel: '' };
    switch (initiator.type) {
      case 'parser':
        return { text: 'HTML Parser', typeLabel: 'HTML' };
      case 'script':
        if (initiator.stack && initiator.stack.callFrames && initiator.stack.callFrames.length > 0) {
          const frame = initiator.stack.callFrames[0];
          const fileName = frame.url.substring(frame.url.lastIndexOf('/') + 1) || '(internal)';
          const text = 'JS: ' + fileName + ':' + frame.lineNumber;
          return { text, url: frame.url, lineNumber: frame.lineNumber, typeLabel: 'JS' };
        }
        return { text: 'JavaScript', typeLabel: 'JS' };
      case 'preload':
        return { text: 'Preload', typeLabel: 'Preload' };
      case 'preflight':
        return { text: 'CORS Preflight', typeLabel: 'CORS' };
      case 'SignedExchange':
        return { text: 'Signed Exchange', typeLabel: 'SXG' };
      default:
        return { text: initiator.type || '(unknown)', typeLabel: initiator.type || '' };
    }
  }

  function parseQueryString(url) {
    try {
      const u = new URL(url);
      const out = [];
      for (const [name, value] of u.searchParams.entries()) {
        out.push({ name, value });
      }
      return out;
    } catch (_e) {
      return [];
    }
  }

  function guessMimeType(row) {
    const rh = row.responseHeaders || [];
    for (let i = 0; i < rh.length; i++) {
      if ((rh[i].name || '').toLowerCase() === 'content-type') {
        return rh[i].value.split(';')[0].trim();
      }
    }
    return row.type || 'application/octet-stream';
  }

  function toHarHeaders(arr) {
    const out = [];
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const h = arr[i];
        out.push({ name: String(h.name || ''), value: String(h.value == null ? '' : h.value) });
      }
    }
    return out;
  }

  /** Debounce wrapper */
  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /**
   * Highlight search matches in text (XSS-safe, DOM-only)
   * @param {string} text - Text to search in
   * @param {string} query - Search query
   * @returns {DocumentFragment} - Text with <mark> elements for matches
   */
  function highlightText(text, query) {
    const fragment = document.createDocumentFragment();
    if (!query || !text) {
      fragment.appendChild(document.createTextNode(text || ''));
      return fragment;
    }

    const lcText = text.toLowerCase();
    const lcQuery = query.toLowerCase();
    let lastIndex = 0;
    let index = lcText.indexOf(lcQuery);

    while (index !== -1) {
      // Before match
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
      }
      // Match
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = text.substring(index, index + query.length);
      fragment.appendChild(mark);

      lastIndex = index + query.length;
      index = lcText.indexOf(lcQuery, lastIndex);
    }

    // After last match
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    return fragment;
  }

  /**
   * Highlight multiple keywords in text, each with its own color class.
   * @param {string} text
   * @param {Array<{query: string, colorIdx: number}>} keywords
   * @returns {DocumentFragment}
   */
  function highlightTextMulti(text, keywords) {
    const fragment = document.createDocumentFragment();
    if (!text || !keywords || keywords.length === 0) {
      fragment.appendChild(document.createTextNode(text || ''));
      return fragment;
    }

    // Build combined regex from all keywords (escaped, case-insensitive)
    const validKws = keywords.filter((kw) => kw.query && kw.query.trim());
    if (validKws.length === 0) {
      fragment.appendChild(document.createTextNode(text));
      return fragment;
    }

    const escapedParts = validKws.map((kw) => kw.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp('(' + escapedParts.join('|') + ')', 'gi');

    // Build a map from lowercase query to colorIdx
    const queryColorMap = new Map();
    for (const kw of validKws) {
      queryColorMap.set(kw.query.toLowerCase(), kw.colorIdx);
    }

    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }
      const mark = document.createElement('mark');
      const matchedLc = match[0].toLowerCase();
      const colorIdx = queryColorMap.get(matchedLc);
      mark.className = 'search-hl-' + (colorIdx != null ? colorIdx : 0);
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }
    return fragment;
  }

  /**
   * Deep search: check if a row matches query in deep content fields.
   * Pure function (no DOM/state dependency) — testable.
   * @param {object} row - Row object from buildRowFromRequest
   * @param {string} query - Search keyword (case-insensitive)
   * @param {object} scope - { reqBody, resBody, reqHeaders, resHeaders }
   * @returns {boolean}
   */
  function deepSearchMatch(row, query, scope) {
    if (!query) return false;
    const lcq = query.toLowerCase();

    // URL / Domain / Path search
    if (scope.url !== false) {
      const urlFields = [row.url, row.domain, row.path, row.method, String(row.status || ''), row.type];
      for (let i = 0; i < urlFields.length; i++) {
        if (urlFields[i] && urlFields[i].toLowerCase().indexOf(lcq) > -1) return true;
      }
    }

    if (scope.reqBody) {
      const postText = row.requestPostData && row.requestPostData.text ? row.requestPostData.text : '';
      if (postText && postText.toLowerCase().indexOf(lcq) > -1) return true;
    }

    if (scope.resBody) {
      const resText = row.responseContent || '';
      if (resText && resText.toLowerCase().indexOf(lcq) > -1) return true;
    }

    if (scope.reqHeaders) {
      const reqH = row.requestHeaders || [];
      for (let i = 0; i < reqH.length; i++) {
        const h = reqH[i];
        if ((h.name && h.name.toLowerCase().indexOf(lcq) > -1) ||
            (h.value && h.value.toLowerCase().indexOf(lcq) > -1)) return true;
      }
    }

    if (scope.resHeaders) {
      const resH = row.responseHeaders || [];
      for (let i = 0; i < resH.length; i++) {
        const h = resH[i];
        if ((h.name && h.name.toLowerCase().indexOf(lcq) > -1) ||
            (h.value && h.value.toLowerCase().indexOf(lcq) > -1)) return true;
      }
    }

    return false;
  }

  /**
   * Format a row's summary as human-readable text for clipboard copy.
   * Pure function (no DOM/state dependency) — testable.
   */
  function formatRowSummary(row) {
    const lines = [];
    lines.push('[' + row.id + '] ' + row.method + ' ' + (row.url || ''));
    lines.push('Status: ' + row.status + (row.statusText ? ' ' + row.statusText : ''));
    lines.push('Type: ' + (row.type || '(none)'));
    lines.push('Duration: ' + fmtTime(row.duration));
    lines.push('Size: ' + fmtBytes(row.size));
    lines.push('Time: ' + (row.clientStart || '') + ' - ' + (row.serverDone || ''));
    if (row.domain) lines.push('Domain: ' + row.domain);
    if (row.initiator && row.initiator.text) lines.push('Initiator: ' + row.initiator.text);
    return lines.join('\n');
  }

  // ============================================================
  // Section 4: State Management
  // ============================================================
  const state = {
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    rows: [],
    filteredRows: [], // [U5] cache for filtered rows
    selectedRow: null, // [U5] track by row object reference, not index
    selectedRows: new Set(), // [U7] multi-row selection
    highlightedRows: new Map(), // [U7] highlighted rows: row -> color class
    columnFilterRules: DEFAULT_COLUMN_FILTER_RULES(),
    sort: {
      colId: 'id',
      direction: 'asc',
    },
    nextId: 1,
    paused: false,
    autoScroll: true,
    // Unified search state (replaces globalFilter + deepSearch)
    search: {
      keywords: [],       // array of {query: string, colorIdx: number}
      matches: [],        // array of row references that match any keyword
      currentIndex: -1,   // index into matches[] for navigation
      scope: { url: true, reqBody: true, resBody: true, reqHeaders: true, resHeaders: true },
      // Per-row match map: row -> Set of colorIdx values
      rowColors: new Map(),
      // Per-keyword matches: kwIndex -> { matches: [rows], currentIndex: number }
      perKeyword: new Map(),
    },
  };

  // ============================================================
  // Section 5: Theme
  // ============================================================
  function loadThemePref(cb) {
    try {
      chrome.storage.local.get([THEME_KEY], (obj) => {
        cb(obj && obj[THEME_KEY] ? obj[THEME_KEY] : localStorage.getItem(THEME_KEY) || 'system');
      });
    } catch (_e) {
      try {
        cb(localStorage.getItem(THEME_KEY) || 'system');
      } catch (_err) {
        cb('system');
      }
    }
  }

  function saveThemePref(v) {
    try {
      const data = {};
      data[THEME_KEY] = v;
      chrome.storage.local.set(data, () => {});
    } catch (_e) {
      try {
        localStorage.setItem(THEME_KEY, v);
      } catch (_err) {
        console.warn('Failed to save theme preference');
      }
    }
  }

  function applyTheme(pref) {
    const html = document.documentElement;
    html.removeAttribute('data-theme');
    if (pref === 'light') html.setAttribute('data-theme', 'light');
    if (pref === 'dark') html.setAttribute('data-theme', 'dark');
    const b = $('#themeBtn');
    if (b) b.textContent = 'Theme: ' + pref.charAt(0).toUpperCase() + pref.slice(1);
    setStatus('Theme=' + pref);
  }

  function nextTheme(cur) {
    const i = THEMES.indexOf(cur);
    return THEMES[(i + 1) % THEMES.length] || 'system';
  }

  // ============================================================
  // Section 6: Column Preferences
  // ============================================================
  function saveColumnPrefs() {
    const prefs = state.columns.map((c) => ({ id: c.id, visible: c.visible, width: c.width }));
    try {
      localStorage.setItem(COL_PREF_KEY, JSON.stringify(prefs));
      localStorage.setItem(COL_PREF_VERSION_KEY, String(COL_PREF_VERSION));
    } catch (_e) {
      console.warn('Failed to save column preferences');
    }
  }

  function loadColumnPrefs() {
    try {
      const saved = localStorage.getItem(COL_PREF_KEY);
      if (saved) {
        const savedCols = JSON.parse(saved);
        const savedVersion = Number(localStorage.getItem(COL_PREF_VERSION_KEY)) || 0;
        const needsVisReset = savedVersion < COL_PREF_VERSION;

        // Restore saved order — iterate savedCols first, then append any new defaults
        const ordered = [];
        const used = new Set();
        for (const sc of savedCols) {
          const def = DEFAULT_COLUMNS.find((d) => d.id === sc.id);
          if (def) {
            // If schema version changed, reset visibility to current defaults (keep width/order)
            const vis = needsVisReset ? def.visible : sc.visible;
            ordered.push({ ...def, visible: vis, width: sc.width });
            used.add(sc.id);
          }
        }
        for (const def of DEFAULT_COLUMNS) {
          if (!used.has(def.id)) ordered.push({ ...def });
        }
        state.columns = ordered;

        // Persist new version so the reset is one-time
        if (needsVisReset) {
          localStorage.setItem(COL_PREF_VERSION_KEY, String(COL_PREF_VERSION));
          saveColumnPrefs();
        }
      }
    } catch (_e) {
      console.warn('Failed to load column preferences');
    }
  }

  function moveColumn(fromId, toId) {
    const fromIdx = state.columns.findIndex((c) => c.id === fromId);
    const toIdx = state.columns.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [col] = state.columns.splice(fromIdx, 1);
    state.columns.splice(toIdx, 0, col);
    saveColumnPrefs();
  }

  // ============================================================
  // Section 7: Filtering [U3][U5][P3]
  // ============================================================
  function getRowFilterValue(row, colId) {
    if (colId === 'initiator') return row.initiator ? row.initiator.text : '';
    if (colId === 'clientStart') return row.clientStartFilter || row.clientStart || '';
    if (colId === 'serverDone') return row.serverDoneFilter || row.serverDone || '';
    const v = row[colId];
    return v == null ? '' : v;
  }

  function compareRowValues(a, b, colId) {
    const av = getRowFilterValue(a, colId);
    const bv = getRowFilterValue(b, colId);

    if (NUMERIC_COLUMNS.indexOf(colId) > -1) {
      const na = Number(av);
      const nb = Number(bv);
      if (isNaN(na) && isNaN(nb)) return 0;
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb;
    }

    if (DATE_COLUMNS.indexOf(colId) > -1) {
      const da = new Date(av).getTime();
      const db = new Date(bv).getTime();
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return da - db;
    }

    const sa = String(av).toLowerCase();
    const sb = String(bv).toLowerCase();
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  }

  function evaluateFilterRule(rawValue, rule, isNumeric) {
    const value = rawValue == null ? '' : String(rawValue);

    // --- Mode-based rules (column-specific) ---
    if (rule && rule.mode === 'methodSet') {
      const upper = value.toUpperCase();
      return rule.include ? !!rule.include[upper] : true;
    }

    if (rule && rule.mode === 'statusSet') {
      // If no codes are unchecked, show all
      if (!rule.include || Object.keys(rule.include).length === 0) return true;
      return rule.include[value] !== false;
    }

    if (rule && rule.mode === 'urlAdvanced') {
      const cs = !!rule.caseSensitive;
      const v = cs ? value : value.toLowerCase();
      // includeAny: at least one keyword must be present
      if (rule.includeAny && rule.includeAny.trim()) {
        const terms = rule.includeAny.split(',').map((t) => t.trim()).filter(Boolean);
        const found = terms.some((t) => v.indexOf(cs ? t : t.toLowerCase()) > -1);
        if (!found) return false;
      }
      // includeAll: all keywords must be present
      if (rule.includeAll && rule.includeAll.trim()) {
        const terms = rule.includeAll.split(',').map((t) => t.trim()).filter(Boolean);
        const allFound = terms.every((t) => v.indexOf(cs ? t : t.toLowerCase()) > -1);
        if (!allFound) return false;
      }
      // excludeAny: none of these keywords should be present
      if (rule.excludeAny && rule.excludeAny.trim()) {
        const terms = rule.excludeAny.split(',').map((t) => t.trim()).filter(Boolean);
        const excluded = terms.some((t) => v.indexOf(cs ? t : t.toLowerCase()) > -1);
        if (excluded) return false;
      }
      return true;
    }

    if (rule && rule.mode === 'timeRange') {
      const start = rule.start || '';
      const end = rule.end || '';
      if (!start && !end) return true;
      const v = value; // HH:MM format
      if (start <= end) {
        // Normal range: 09:00 - 17:30
        return (!start || v >= start) && (!end || v <= end);
      } else {
        // Across midnight: 22:00 - 02:00
        return v >= start || v <= end;
      }
    }

    if (rule && rule.mode === 'multiText') {
      if (!rule.conditions || rule.conditions.length === 0) return true;
      return rule.conditions.every((cond) => {
        if (!cond.value || !cond.value.trim()) return true;
        return evaluateFilterRule(value, cond, false);
      });
    }

    // --- Standard operator-based rules ---
    const op = rule && rule.op ? rule.op : isNumeric ? 'equals' : 'contains';
    const keyword = rule && rule.value != null ? String(rule.value) : '';

    if (op === 'empty') return value.trim() === '';
    if (op === 'notempty') return value.trim() !== '';
    if (!keyword.trim()) return true;

    if (isNumeric) {
      const left = Number(value);
      const right = Number(keyword);
      if (isNaN(left) || isNaN(right)) return false;
      if (op === 'equals') return left === right;
      if (op === 'notequals') return left !== right;
      if (op === 'gt') return left > right;
      if (op === 'gte') return left >= right;
      if (op === 'lt') return left < right;
      if (op === 'lte') return left <= right;
      return false;
    }

    const left = value.toLowerCase();
    const right = keyword.toLowerCase();
    if (op === 'contains') return left.indexOf(right) > -1;
    if (op === 'notcontains') return left.indexOf(right) === -1;
    if (op === 'equals') return left === right;
    if (op === 'notequals') return left !== right;
    if (op === 'startswith') return left.startsWith(right);
    if (op === 'endswith') return left.endsWith(right);
    if (op === 'regex') {
      try {
        return new RegExp(keyword, 'i').test(value);
      } catch (_e) {
        return false;
      }
    }
    return true;
  }

  function getSortedRows(rows) {
    const sorted = rows.slice();
    if (!state.sort.colId || !state.sort.direction) return sorted;
    const dir = state.sort.direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => compareRowValues(a, b, state.sort.colId) * dir);
    return sorted;
  }

  function filterRows() {
    state.filteredRows = state.rows.filter((r) => {
      // Per-column advanced filters
      for (const col of state.columns) {
        const colId = col.id;
        const rule = state.columnFilterRules[colId];
        if (!rule) continue;
        const rowValue = getRowFilterValue(r, colId);
        const isNumeric = NUMERIC_COLUMNS.indexOf(colId) > -1;
        if (!evaluateFilterRule(rowValue, rule, isNumeric)) return false;
      }
      return true;
    });
  }

  // ============================================================
  // Section 8: Data Model
  // ============================================================
  function fmtLocalTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return hh + ':' + mm + ':' + ss + '.' + ms;
  }

  function fmtFilterTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function buildRowFromRequest(req) {
    const isoStr = (req && req.startedDateTime) || '';
    const durationMs = (req && req.time) || 0;
    let serverDoneIso = '';
    if (isoStr && durationMs > 0) {
      const startMs = new Date(isoStr).getTime();
      if (!isNaN(startMs)) {
        serverDoneIso = new Date(startMs + durationMs).toISOString();
      }
    }
    const r = {
      _reqObj: req,
      method: (req && req.request && req.request.method) || '',
      url: (req && req.request && req.request.url) || '',
      status: (req && req.response && req.response.status) || 0,
      statusText: (req && req.response && req.response.statusText) || '',
      type: (req && req.response && req.response.content && req.response.content.mimeType) || '',
      protocol: req && req.response && req.response.httpVersion ? String(req.response.httpVersion).toUpperCase() : '',
      size:
        Math.max(0, (req && req.response && (req.response.bodySize > 0 ? req.response.bodySize : (req.response.content && req.response.content.size > 0 ? req.response.content.size : 0))) || 0),
      clientStart: fmtLocalTime(isoStr),
      serverDone: fmtLocalTime(serverDoneIso),
      clientStartFilter: fmtFilterTime(isoStr),
      serverDoneFilter: fmtFilterTime(serverDoneIso),
      duration: durationMs,
      startedDateTime: isoStr,
      requestHeaders: (req && req.request && req.request.headers) || [],
      responseHeaders: (req && req.response && req.response.headers) || [],
      requestPostData: (req && req.request && req.request.postData) || null,
      timings: (req && req.timings) || {},
      initiator: formatInitiator(req.initiator),
      responseContent: null, // [U1] cache response body
    };
    const p = extractUrlParts(r.url);
    r.domain = p.domain;
    r.path = p.path;
    r.id = state.nextId++;
    return r;
  }

  // [U1] Pre-fetch response content for HAR export
  function cacheResponseContent(row) {
    if (row._reqObj && typeof row._reqObj.getContent === 'function') {
      row._reqObj.getContent((content, encoding) => {
        if (encoding === 'base64') {
          try {
            row.responseContent = atob(content);
          } catch (_e) {
            row.responseContent = content || '';
          }
        } else {
          row.responseContent = content || '';
        }
      });
    }
  }

  // ============================================================
  // Section 9: Safe DOM Rendering [S1][S2][S3] — NO innerHTML with user data
  // ============================================================
  function createKvGrid(items) {
    const grid = document.createElement('div');
    grid.className = 'kv';
    for (const item of items) {
      const keyEl = document.createElement('div');
      keyEl.className = 'key';
      keyEl.textContent = item.name || item.key || '';
      const valEl = document.createElement('div');
      valEl.className = 'val';
      valEl.textContent = item.value == null ? '' : String(item.value);
      grid.appendChild(keyEl);
      grid.appendChild(valEl);
    }
    return grid;
  }

  // createHeaderSection removed — replaced by tabbed inspector layout

  // ============================================================
  // Section 10: Table Row Creation (shared) [Q2]
  // ============================================================
  function createTableRow(row, onClick) {
    const tr = document.createElement('tr');
    tr.addEventListener('click', onClick);
    tr.dataset.rowId = row.id;

    if (state.selectedRow === row) tr.classList.add('selected');
    if (state.selectedRows.has(row)) tr.classList.add('multi-selected');
    // Manual highlight (context menu)
    const hlColor = state.highlightedRows.get(row);
    if (hlColor) tr.classList.add('highlighted-row', hlColor);
    // Unified search match highlight — apply first matching keyword color
    const srch = state.search;
    const rowColorSet = srch.rowColors.get(row);
    if (rowColorSet && rowColorSet.size > 0) {
      const firstColor = rowColorSet.values().next().value;
      tr.classList.add('search-match-row', 'search-row-' + firstColor);
      if (srch.currentIndex >= 0 && srch.matches[srch.currentIndex] === row) {
        tr.classList.add('search-match-current');
      }
    }
    if (row.method) {
      const method = row.method.toUpperCase();
      if (HTTP_METHODS.indexOf(method) > -1) tr.classList.add('method-' + method);
    }
    // Status code row class
    const st = row.status;
    if (st >= 200 && st < 300) tr.classList.add('status-2xx');
    else if (st >= 300 && st < 400) tr.classList.add('status-3xx');
    else if (st >= 400 && st < 500) tr.classList.add('status-4xx');
    else if (st >= 500) tr.classList.add('status-5xx');

    const visibleCols = state.columns.filter((c) => c.visible);
    for (const c of visibleCols) {
      const td = document.createElement('td');
      if (c.id === 'method') td.classList.add('method-cell');
      if (c.id === 'status') td.classList.add('status-cell');

      if (c.id === 'initiator') {
        const initiator = row.initiator;
        if (initiator && initiator.url) {
          const link = document.createElement('a');
          link.href = '#';
          link.title = initiator.url;
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chrome.devtools.panels.openResource(initiator.url, initiator.lineNumber, () => {});
          });
          if (srch.keywords.length > 0) {
            link.appendChild(highlightTextMulti(initiator.text, srch.keywords));
          } else {
            link.textContent = initiator.text;
          }
          td.appendChild(link);
        } else {
          const txt = initiator ? initiator.text : '';
          if (srch.keywords.length > 0) {
            td.appendChild(highlightTextMulti(txt, srch.keywords));
          } else {
            td.textContent = txt;
          }
        }
      } else {
        let v = row[c.id];
        if (c.id === 'size') v = fmtBytes(row.size);
        else if (c.id === 'duration') {
          v = fmtTime(row.duration);
          td.classList.add('duration-cell');
          // Color duration: green (<100ms), yellow (<500ms), orange (<2s), red (>2s)
          if (row.duration > 2000) td.classList.add('dur-slow');
          else if (row.duration > 500) td.classList.add('dur-med');
          else if (row.duration > 100) td.classList.add('dur-ok');
        }
        const text = v == null ? '' : String(v);
        if (srch.keywords.length > 0 && text) {
          td.appendChild(highlightTextMulti(text, srch.keywords));
        } else {
          td.textContent = text;
        }
      }

      if (c.id === 'url' || c.id === 'path') td.title = row[c.id] || '';
      tr.appendChild(td);
    }
    return tr;
  }

  // ============================================================
  // Section 11: UI Components
  // ============================================================
  function createCheckboxItem(text, checked, onChange) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', onChange);

    const checkContainer = document.createElement('div');
    checkContainer.className = 'check-container';
    const textContainer = document.createElement('div');
    textContainer.className = 'text-container';

    checkContainer.appendChild(cb);
    textContainer.textContent = text;
    label.appendChild(checkContainer);
    label.appendChild(textContainer);
    return label;
  }

  function getOperatorsForColumn(colId) {
    return NUMERIC_COLUMNS.indexOf(colId) > -1 ? FILTER_OPERATORS_NUMERIC : FILTER_OPERATORS_STRING;
  }

  function createColumnFilterControl(colId, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'filter-rule';

    // --- Time columns (clientStart / serverDone): time range picker with auto-range ---
    if (colId === 'clientStart' || colId === 'serverDone') {
      const filterField = colId === 'clientStart' ? 'clientStartFilter' : 'serverDoneFilter';
      const rule = state.columnFilterRules[colId];
      const isTimeRange = rule && rule.mode === 'timeRange';

      // Compute min/max from recorded rows
      let autoStart = '';
      let autoEnd = '';
      if (state.rows.length > 0) {
        let minT = '99:99';
        let maxT = '00:00';
        for (const row of state.rows) {
          const tv = row[filterField] || '';
          if (tv && tv < minT) minT = tv;
          if (tv && tv > maxT) maxT = tv;
        }
        if (minT !== '99:99') autoStart = minT;
        if (maxT !== '00:00') autoEnd = maxT;
      }

      const startVal = isTimeRange && rule.start ? rule.start : autoStart;
      const endVal = isTimeRange && rule.end ? rule.end : autoEnd;

      const startLabel = document.createElement('span');
      startLabel.textContent = 'From ';
      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.step = '1';
      startInput.className = 'filter-value';
      startInput.value = startVal;

      const endLabel = document.createElement('span');
      endLabel.textContent = ' To ';
      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.step = '1';
      endInput.className = 'filter-value';
      endInput.value = endVal;

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Reset';
      clearBtn.className = 'filter-clear-btn';
      clearBtn.addEventListener('click', () => {
        startInput.value = autoStart;
        endInput.value = autoEnd;
        state.columnFilterRules[colId] = { mode: 'timeRange', start: autoStart, end: autoEnd };
        onChange();
      });

      const update = () => {
        state.columnFilterRules[colId] = { mode: 'timeRange', start: startInput.value, end: endInput.value };
        onChange();
      };
      startInput.addEventListener('change', update);
      endInput.addEventListener('change', update);

      wrap.appendChild(startLabel);
      wrap.appendChild(startInput);
      wrap.appendChild(endLabel);
      wrap.appendChild(endInput);
      wrap.appendChild(clearBtn);
      return wrap;
    }

    // --- Method column: checkbox set (horizontal) ---
    if (colId === 'method') {
      const rule = state.columnFilterRules[colId];
      const isMethodSet = rule && rule.mode === 'methodSet';
      const include = isMethodSet ? Object.assign({}, rule.include) : DEFAULT_METHOD_FILTERS();

      // Select All / Deselect All
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
      const allBtn = document.createElement('button');
      allBtn.textContent = 'All';
      allBtn.className = 'filter-clear-btn';
      allBtn.style.flex = '1';
      allBtn.addEventListener('click', () => {
        HTTP_METHODS.forEach((m) => { include[m] = true; });
        state.columnFilterRules[colId] = { mode: 'methodSet', include: Object.assign({}, include) };
        onChange();
        // Re-render checkboxes
        grid.textContent = '';
        renderMethodCheckboxes();
      });
      const noneBtn = document.createElement('button');
      noneBtn.textContent = 'None';
      noneBtn.className = 'filter-clear-btn';
      noneBtn.style.flex = '1';
      noneBtn.addEventListener('click', () => {
        HTTP_METHODS.forEach((m) => { include[m] = false; });
        state.columnFilterRules[colId] = { mode: 'methodSet', include: Object.assign({}, include) };
        onChange();
        grid.textContent = '';
        renderMethodCheckboxes();
      });
      btnRow.appendChild(allBtn);
      btnRow.appendChild(noneBtn);
      wrap.appendChild(btnRow);

      const grid = document.createElement('div');
      grid.className = 'filter-checkbox-grid';
      const renderMethodCheckboxes = () => {
        for (const method of HTTP_METHODS) {
          const checked = include[method] !== false;
          const cb = createCheckboxItem(method, checked, () => {
            include[method] = !include[method];
            state.columnFilterRules[colId] = { mode: 'methodSet', include: Object.assign({}, include) };
            onChange();
          });
          cb.className = 'filter-checkbox-inline';
          grid.appendChild(cb);
        }
      };
      renderMethodCheckboxes();
      wrap.appendChild(grid);
      return wrap;
    }

    // --- Status column: checkbox set by category (horizontal) ---
    if (colId === 'status') {
      const STATUS_CATEGORIES = [
        { label: '2xx Success', codes: [200, 201, 202, 204, 206] },
        { label: '3xx Redirect', codes: [301, 302, 303, 304, 307, 308] },
        { label: '4xx Client Error', codes: [400, 401, 403, 404, 405, 408, 409, 429] },
        { label: '5xx Server Error', codes: [500, 502, 503, 504] },
      ];
      const rule = state.columnFilterRules[colId];
      const isStatusSet = rule && rule.mode === 'statusSet';
      const include = isStatusSet ? Object.assign({}, rule.include) : {};
      // Default: all enabled (empty = show all)

      for (const cat of STATUS_CATEGORIES) {
        const catLabel = document.createElement('div');
        catLabel.className = 'filter-status-category';
        catLabel.textContent = cat.label;
        wrap.appendChild(catLabel);

        const grid = document.createElement('div');
        grid.className = 'filter-checkbox-grid';
        for (const code of cat.codes) {
          const codeStr = String(code);
          const checked = include[codeStr] !== false;
          const cb = createCheckboxItem(codeStr, checked, () => {
            include[codeStr] = !include[codeStr];
            state.columnFilterRules[colId] = { mode: 'statusSet', include: Object.assign({}, include) };
            onChange();
          });
          cb.className = 'filter-checkbox-inline';
          grid.appendChild(cb);
        }
        wrap.appendChild(grid);
      }
      return wrap;
    }

    // --- URL column: advanced include/exclude ---
    if (colId === 'url') {
      const rule = state.columnFilterRules[colId];
      const isAdv = rule && rule.mode === 'urlAdvanced';

      const inclAnyLabel = document.createElement('label');
      inclAnyLabel.textContent = 'Include ANY (comma-separated):';
      const inclAnyInput = document.createElement('input');
      inclAnyInput.type = 'text';
      inclAnyInput.className = 'filter-value';
      inclAnyInput.placeholder = 'keyword1, keyword2';
      inclAnyInput.value = isAdv ? rule.includeAny || '' : '';

      const inclAllLabel = document.createElement('label');
      inclAllLabel.textContent = 'Include ALL (comma-separated):';
      const inclAllInput = document.createElement('input');
      inclAllInput.type = 'text';
      inclAllInput.className = 'filter-value';
      inclAllInput.placeholder = 'must1, must2';
      inclAllInput.value = isAdv ? rule.includeAll || '' : '';

      const exclLabel = document.createElement('label');
      exclLabel.textContent = 'Exclude ANY (comma-separated):';
      const exclInput = document.createElement('input');
      exclInput.type = 'text';
      exclInput.className = 'filter-value';
      exclInput.placeholder = 'exclude1, exclude2';
      exclInput.value = isAdv ? rule.excludeAny || '' : '';

      const csLabel = document.createElement('label');
      const csCb = document.createElement('input');
      csCb.type = 'checkbox';
      csCb.checked = isAdv ? !!rule.caseSensitive : false;
      csLabel.appendChild(csCb);
      const csText = document.createTextNode(' Case sensitive');
      csLabel.appendChild(csText);

      const update = () => {
        state.columnFilterRules[colId] = {
          mode: 'urlAdvanced',
          includeAny: inclAnyInput.value,
          includeAll: inclAllInput.value,
          excludeAny: exclInput.value,
          caseSensitive: csCb.checked,
        };
        onChange();
      };
      inclAnyInput.addEventListener('input', update);
      inclAllInput.addEventListener('input', update);
      exclInput.addEventListener('input', update);
      csCb.addEventListener('change', update);

      wrap.appendChild(inclAnyLabel);
      wrap.appendChild(inclAnyInput);
      wrap.appendChild(inclAllLabel);
      wrap.appendChild(inclAllInput);
      wrap.appendChild(exclLabel);
      wrap.appendChild(exclInput);
      wrap.appendChild(csLabel);
      return wrap;
    }

    // --- Domain / Path columns: multi-condition filter ---
    if (colId === 'domain' || colId === 'path') {
      const rule = state.columnFilterRules[colId];
      const isMulti = rule && rule.mode === 'multiText';
      const conditions = isMulti && rule.conditions ? rule.conditions.slice() : [{ op: 'contains', value: '' }];

      const renderConditions = () => {
        wrap.textContent = '';
        conditions.forEach((cond, idx) => {
          const row = document.createElement('div');
          row.className = 'filter-condition-row';

          const opSelect = document.createElement('select');
          opSelect.className = 'filter-op';
          for (const op of FILTER_OPERATORS_STRING) {
            const option = document.createElement('option');
            option.value = op.value;
            option.textContent = op.label;
            opSelect.appendChild(option);
          }
          opSelect.value = cond.op || 'contains';

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'filter-value';
          input.placeholder = 'value';
          input.value = cond.value || '';

          const removeBtn = document.createElement('button');
          removeBtn.textContent = 'x';
          removeBtn.className = 'filter-remove-btn';
          removeBtn.addEventListener('click', () => {
            conditions.splice(idx, 1);
            if (conditions.length === 0) conditions.push({ op: 'contains', value: '' });
            state.columnFilterRules[colId] = { mode: 'multiText', conditions: conditions.slice() };
            onChange();
            renderConditions();
          });

          opSelect.addEventListener('change', () => {
            conditions[idx].op = opSelect.value;
            state.columnFilterRules[colId] = { mode: 'multiText', conditions: conditions.slice() };
            onChange();
          });
          input.addEventListener('input', () => {
            conditions[idx].value = input.value;
            state.columnFilterRules[colId] = { mode: 'multiText', conditions: conditions.slice() };
            onChange();
          });

          row.appendChild(opSelect);
          row.appendChild(input);
          if (conditions.length > 1) row.appendChild(removeBtn);
          wrap.appendChild(row);
        });

        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add condition';
        addBtn.className = 'filter-add-btn';
        addBtn.addEventListener('click', () => {
          conditions.push({ op: 'contains', value: '' });
          state.columnFilterRules[colId] = { mode: 'multiText', conditions: conditions.slice() };
          renderConditions();
        });
        wrap.appendChild(addBtn);
      };
      renderConditions();
      return wrap;
    }

    // --- Default: generic operator + value ---
    const opSelect = document.createElement('select');
    opSelect.className = 'filter-op';
    const operators = getOperatorsForColumn(colId);
    for (const op of operators) {
      const option = document.createElement('option');
      option.value = op.value;
      option.textContent = op.label;
      opSelect.appendChild(option);
    }

    const rule = state.columnFilterRules[colId] || { op: operators[0].value, value: '' };
    opSelect.value = rule.op;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'filter-value';
    input.placeholder = 'value';
    input.value = rule.value || '';

    const updateInputState = () => {
      const noValueRequired = opSelect.value === 'empty' || opSelect.value === 'notempty';
      input.disabled = noValueRequired;
      if (noValueRequired) input.value = '';
    };
    updateInputState();

    opSelect.addEventListener('change', () => {
      state.columnFilterRules[colId].op = opSelect.value;
      updateInputState();
      state.columnFilterRules[colId].value = input.value;
      onChange();
    });
    input.addEventListener('input', () => {
      state.columnFilterRules[colId].value = input.value;
      onChange();
    });

    wrap.appendChild(opSelect);
    wrap.appendChild(input);
    return wrap;
  }

  function isRuleActive(rule) {
    if (!rule) return false;
    if (rule.mode === 'methodSet') {
      return rule.include ? Object.values(rule.include).some((v) => !v) : false;
    }
    if (rule.mode === 'statusSet') {
      return rule.include ? Object.values(rule.include).some((v) => !v) : false;
    }
    if (rule.mode === 'urlAdvanced') {
      return !!(rule.includeAny || '').trim() || !!(rule.includeAll || '').trim() || !!(rule.excludeAny || '').trim();
    }
    if (rule.mode === 'timeRange') {
      return !!(rule.start || '').trim() || !!(rule.end || '').trim();
    }
    if (rule.mode === 'multiText') {
      return rule.conditions ? rule.conditions.some((c) => (c.value || '').trim() !== '') : false;
    }
    if (rule.op === 'empty' || rule.op === 'notempty') return true;
    return String(rule.value || '').trim() !== '';
  }

  function getActiveFilterCount() {
    let count = 0;
    for (const col of state.columns) {
      if (isRuleActive(state.columnFilterRules[col.id])) count++;
    }
    return count;
  }

  function createFilterPopupContent(onChange, focusColId) {
    const root = document.createElement('div');
    root.className = 'filter-popup-body';

    const header = document.createElement('div');
    header.className = 'filter-popup-header';
    header.textContent = `Column Filters (${getActiveFilterCount()} active)`;
    root.appendChild(header);

    const list = document.createElement('div');
    list.className = 'filter-popup-list';

    const debouncedOnChange = debounce(onChange, FILTER_DEBOUNCE_MS);
    for (const col of state.columns) {
      const row = document.createElement('div');
      row.className = 'filter-popup-row';
      if (focusColId && focusColId === col.id) row.classList.add('focus-target');

      const label = document.createElement('div');
      label.className = 'filter-popup-label';
      label.textContent = col.label;
      row.appendChild(label);

      const control = createColumnFilterControl(col.id, debouncedOnChange);
      row.appendChild(control);
      list.appendChild(row);
    }

    root.appendChild(list);
    return root;
  }

  function createSingleColumnFilterContent(colId, onChange) {
    const root = document.createElement('div');
    root.className = 'filter-popup-body';

    const col = state.columns.find((c) => c.id === colId);
    if (!col) return root;

    const header = document.createElement('div');
    header.className = 'filter-popup-header';
    header.textContent = col.label + ' Filter';
    root.appendChild(header);

    const debouncedOnChange = debounce(onChange, FILTER_DEBOUNCE_MS);
    const control = createColumnFilterControl(colId, debouncedOnChange);
    control.style.marginTop = '8px';
    root.appendChild(control);

    return root;
  }

  function toggleSort(colId) {
    if (state.sort.colId !== colId) {
      state.sort.colId = colId;
      state.sort.direction = 'asc';
      return;
    }
    if (state.sort.direction === 'asc') {
      state.sort.direction = 'desc';
      return;
    }
    state.sort.colId = null;
    state.sort.direction = null;
  }

  // ============================================================
  // Section 12: Rendering
  // ============================================================
  function renderHeader() {
    const thead = $('#thead');
    thead.textContent = '';

    // Compute total table width from all visible columns
    const visibleCols = state.columns.filter((c) => c.visible);
    const totalW = visibleCols.reduce((sum, c) => sum + (c.width || 120), 0);
    const grid = $('#grid');
    grid.style.width = totalW + 'px';

    // Title row
    const tr = document.createElement('tr');
    tr.className = 'title-row';
    let dragSrcColId = null;
    for (const c of visibleCols) {
      const th = document.createElement('th');
      th.style.width = (c.width || 120) + 'px';
      th.className = 'sortable-header';
      th.dataset.colId = c.id;
      th.draggable = true;
      const sortIndicator =
        state.sort.colId === c.id ? (state.sort.direction === 'asc' ? ' ▲' : state.sort.direction === 'desc' ? ' ▼' : '') : '';
      th.textContent = c.label + sortIndicator;
      th.title = 'Click to sort, drag to reorder';
      th.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('col-resizer')) return;
        toggleSort(c.id);
        render();
      });

      // --- Drag-and-drop reorder ---
      th.addEventListener('dragstart', (e) => {
        dragSrcColId = c.id;
        th.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', c.id);
      });
      th.addEventListener('dragend', () => {
        th.classList.remove('dragging');
        tr.querySelectorAll('th').forEach((el) => {
          el.classList.remove('drag-over-left', 'drag-over-right');
        });
      });
      th.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragSrcColId || dragSrcColId === c.id) return;
        const rect = th.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        th.classList.toggle('drag-over-left', e.clientX < midX);
        th.classList.toggle('drag-over-right', e.clientX >= midX);
      });
      th.addEventListener('dragleave', () => {
        th.classList.remove('drag-over-left', 'drag-over-right');
      });
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('drag-over-left', 'drag-over-right');
        const fromId = e.dataTransfer.getData('text/plain');
        if (fromId && fromId !== c.id) {
          moveColumn(fromId, c.id);
          render();
        }
      });

      // --- Column resizer (independent width) ---
      const resizer = document.createElement('div');
      resizer.className = 'col-resizer';
      ((col, headerEl) => {
        resizer.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startWidth = headerEl.offsetWidth;
          const handleMouseMove = (ev) => {
            const newWidth = startWidth + (ev.clientX - startX);
            if (newWidth > MIN_COL_WIDTH) {
              col.width = newWidth;
              headerEl.style.width = newWidth + 'px';
              // Update total table width
              const newTotal = state.columns.filter((cc) => cc.visible).reduce((s, cc) => s + (cc.width || 120), 0);
              grid.style.width = newTotal + 'px';
            }
          };
          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            saveColumnPrefs();
          };
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        });
      })(c, th);
      th.appendChild(resizer);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }

  // Update search match state without triggering re-render.
  // Called from renderBody() so new rows are included in search.
  function refreshSearchMatches() {
    const srch = state.search;
    const activeKws = srch.keywords.filter((kw) => kw.query && kw.query.trim());
    if (activeKws.length === 0) {
      srch.rowColors.clear();
      srch.matches = [];
      srch.perKeyword.clear();
      return;
    }
    srch.rowColors.clear();
    const sorted = getSortedRows(state.filteredRows);
    const matchSet = new Set();
    // Build per-keyword match lists
    for (let ki = 0; ki < srch.keywords.length; ki++) {
      const kw = srch.keywords[ki];
      if (!kw.query || !kw.query.trim()) {
        srch.perKeyword.set(ki, { matches: [], currentIndex: -1 });
        continue;
      }
      const kwMatches = [];
      for (const row of sorted) {
        if (deepSearchMatch(row, kw.query, srch.scope)) {
          matchSet.add(row);
          if (!srch.rowColors.has(row)) srch.rowColors.set(row, new Set());
          srch.rowColors.get(row).add(kw.colorIdx);
          kwMatches.push(row);
        }
      }
      const prev = srch.perKeyword.get(ki);
      const prevIdx = prev ? prev.currentIndex : -1;
      const clampedIdx = prevIdx >= kwMatches.length ? kwMatches.length - 1 : prevIdx;
      srch.perKeyword.set(ki, { matches: kwMatches, currentIndex: clampedIdx });
    }
    // Remove stale per-keyword entries
    for (const key of srch.perKeyword.keys()) {
      if (key >= srch.keywords.length) srch.perKeyword.delete(key);
    }
    srch.matches = sorted.filter((r) => matchSet.has(r));
    // Keep global currentIndex in bounds
    if (srch.currentIndex >= srch.matches.length) {
      srch.currentIndex = srch.matches.length > 0 ? srch.matches.length - 1 : -1;
    }
  }

  function renderBody() {
    filterRows();
    // Refresh search matches so newly added rows are included
    refreshSearchMatches();
    const tbody = $('#tbody');
    // [P2] Use DocumentFragment for batch insert
    const frag = document.createDocumentFragment();
    tbody.textContent = '';

    const rows = getSortedRows(state.filteredRows);

    if (rows.length === 0 && !state.paused) {
      if ($('#tableWrap')) {
        let emptyState = document.getElementById('empty-state-msg');
        if (!emptyState) {
          emptyState = document.createElement('div');
          emptyState.id = 'empty-state-msg';
          emptyState.className = 'empty-state';
          const icon = document.createElement('div');
          icon.className = 'icon';
          icon.textContent = '📡';
          const text1 = document.createElement('div');
          text1.textContent = 'Recording network activity...';
          const text2 = document.createElement('div');
          text2.style.fontSize = '0.8em';
          text2.style.marginTop = '10px';
          text2.textContent = 'Perform a request or reload the page to see activity.';
          emptyState.appendChild(icon);
          emptyState.appendChild(text1);
          emptyState.appendChild(text2);
          $('#tableWrap').appendChild(emptyState);
        }
        emptyState.style.display = 'flex';
      }
    } else {
      const emptyState = document.getElementById('empty-state-msg');
      if (emptyState) emptyState.style.display = 'none';
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tr = createTableRow(row, (e) => selectRow(row, e));
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    $('#counter').textContent = rows.length + ' requests';
    // Update total size
    let totalBytes = 0;
    for (let i = 0; i < rows.length; i++) totalBytes += rows[i].size || 0;
    const totalSizeEl = $('#totalSize');
    if (totalSizeEl) totalSizeEl.textContent = totalBytes > 0 ? fmtBytes(totalBytes) + ' transferred' : '';
    // Update selected rows size
    const selectedSizeEl = $('#selectedSize');
    if (selectedSizeEl) {
      if (state.selectedRows.size > 0) {
        let selBytes = 0;
        for (const r of state.selectedRows) selBytes += r.size || 0;
        selectedSizeEl.textContent = state.selectedRows.size + ' selected / ' + fmtBytes(selBytes);
      } else {
        selectedSizeEl.textContent = '';
      }
    }
    // Update search count display for live updates during recording
    const srch = state.search;
    const activeKws = srch.keywords.filter((kw) => kw.query && kw.query.trim());
    const countEl = $('#searchCount');
    if (countEl) {
      if (srch.matches.length === 0 && activeKws.length > 0) {
        countEl.textContent = 'No matches';
        countEl.style.color = 'var(--status-5xx)';
      } else if (srch.matches.length > 0) {
        countEl.textContent = srch.matches.length + ' matches';
        countEl.style.color = '';
      } else {
        countEl.textContent = '';
        countEl.style.color = '';
      }
    }
  }

  function render() {
    renderHeader();
    renderBody();
  }

  // ============================================================
  // Section 13: Detail Panel — Fiddler-style tabbed inspector
  // ============================================================

  function parseCookieHeader(headerValue) {
    if (!headerValue) return [];
    return headerValue.split(';').map((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return { name: part.trim(), value: '' };
      return { name: part.substring(0, idx).trim(), value: part.substring(idx + 1).trim() };
    });
  }

  function getHeaderValue(headers, name) {
    if (!headers) return '';
    const lower = name.toLowerCase();
    for (const h of headers) {
      if ((h.name || '').toLowerCase() === lower) return h.value || '';
    }
    return '';
  }

  function buildRawRequestText(row) {
    const method = row.method || 'GET';
    const url = row.url || '/';
    let path;
    try {
      const u = new URL(url);
      path = u.pathname + u.search;
    } catch (_e) {
      path = url;
    }
    const proto = row.protocol || 'HTTP/1.1';
    let raw = method + ' ' + path + ' ' + proto + '\r\n';
    if (row.requestHeaders) {
      for (const h of row.requestHeaders) {
        raw += (h.name || '') + ': ' + (h.value || '') + '\r\n';
      }
    }
    raw += '\r\n';
    if (row.requestPostData && row.requestPostData.text) {
      raw += row.requestPostData.text;
    }
    return raw;
  }

  function buildRawResponseText(row, responseBody) {
    const proto = row.protocol || 'HTTP/1.1';
    const status = row.status || 0;
    const statusText = row.statusText || '';
    let raw = proto + ' ' + status + ' ' + statusText + '\r\n';
    if (row.responseHeaders) {
      for (const h of row.responseHeaders) {
        raw += (h.name || '') + ': ' + (h.value || '') + '\r\n';
      }
    }
    raw += '\r\n';
    if (responseBody) raw += responseBody;
    return raw;
  }

  function formatJsonSafe(text) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch (_e) {
      return null;
    }
  }

  /**
   * Render JSON text as a <pre> with syntax-highlighted spans.
   * Uses DOM API only (no innerHTML) for XSS safety.
   */
  function renderJsonHighlighted(jsonText) {
    const pre = document.createElement('pre');
    pre.className = 'code-block code-json';
    // Tokenize JSON string with a regex that captures keys, strings, numbers, booleans, null
    const TOKEN_RE = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;
    let lastIndex = 0;
    let match;
    while ((match = TOKEN_RE.exec(jsonText)) !== null) {
      // Append plain text before this match
      if (match.index > lastIndex) {
        pre.appendChild(document.createTextNode(jsonText.substring(lastIndex, match.index)));
      }
      const span = document.createElement('span');
      if (match[1]) {
        // JSON key (property name)
        span.className = 'syn-key';
        span.textContent = match[1];
        pre.appendChild(span);
        pre.appendChild(document.createTextNode(':'));
      } else if (match[2]) {
        // String value
        span.className = 'syn-str';
        span.textContent = match[2];
        pre.appendChild(span);
      } else if (match[3]) {
        // Number
        span.className = 'syn-num';
        span.textContent = match[3];
        pre.appendChild(span);
      } else if (match[4]) {
        // Boolean
        span.className = 'syn-bool';
        span.textContent = match[4];
        pre.appendChild(span);
      } else if (match[5]) {
        // null
        span.className = 'syn-null';
        span.textContent = match[5];
        pre.appendChild(span);
      }
      lastIndex = TOKEN_RE.lastIndex;
    }
    // Remaining text
    if (lastIndex < jsonText.length) {
      pre.appendChild(document.createTextNode(jsonText.substring(lastIndex)));
    }
    return pre;
  }

  /**
   * Render parsed JSON as a collapsible tree with syntax highlighting.
   * Objects and arrays are wrapped in <details>/<summary> elements.
   * Uses DOM API only (no innerHTML) for XSS safety.
   */
  function renderJsonTree(jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (_e) {
      return null;
    }

    const container = document.createElement('div');
    container.className = 'json-tree code-block';

    function createValueSpan(val) {
      const span = document.createElement('span');
      if (val === null) {
        span.className = 'syn-null';
        span.textContent = 'null';
      } else if (typeof val === 'boolean') {
        span.className = 'syn-bool';
        span.textContent = String(val);
      } else if (typeof val === 'number') {
        span.className = 'syn-num';
        span.textContent = String(val);
      } else {
        span.className = 'syn-str';
        span.textContent = JSON.stringify(val);
      }
      return span;
    }

    function childCount(val) {
      if (Array.isArray(val)) return val.length;
      if (val && typeof val === 'object') return Object.keys(val).length;
      return 0;
    }

    function buildNode(value, keyName, isLast, depth) {
      const isObj = value !== null && typeof value === 'object' && !Array.isArray(value);
      const isArr = Array.isArray(value);
      const comma = isLast ? '' : ',';

      // Depth limit — render as flat JSON string
      if ((isObj || isArr) && depth >= JSON_TREE_MAX_DEPTH) {
        const line = document.createElement('div');
        line.className = 'json-tree-line';
        if (keyName !== undefined) {
          const keySpan = document.createElement('span');
          keySpan.className = 'syn-key';
          keySpan.textContent = JSON.stringify(keyName);
          line.appendChild(keySpan);
          line.appendChild(document.createTextNode(': '));
        }
        const valSpan = document.createElement('span');
        valSpan.className = 'syn-str';
        valSpan.textContent = JSON.stringify(value);
        line.appendChild(valSpan);
        if (comma) line.appendChild(document.createTextNode(comma));
        return line;
      }

      if (!isObj && !isArr) {
        // Primitive value — single line
        const line = document.createElement('div');
        line.className = 'json-tree-line';
        if (keyName !== undefined) {
          const keySpan = document.createElement('span');
          keySpan.className = 'syn-key';
          keySpan.textContent = JSON.stringify(keyName);
          line.appendChild(keySpan);
          line.appendChild(document.createTextNode(': '));
        }
        line.appendChild(createValueSpan(value));
        if (comma) line.appendChild(document.createTextNode(comma));
        return line;
      }

      // Object or Array — collapsible
      const count = childCount(value);
      const openBrace = isArr ? '[' : '{';
      const closeBrace = isArr ? ']' : '}';

      if (count === 0) {
        // Empty object/array — single line
        const line = document.createElement('div');
        line.className = 'json-tree-line';
        if (keyName !== undefined) {
          const keySpan = document.createElement('span');
          keySpan.className = 'syn-key';
          keySpan.textContent = JSON.stringify(keyName);
          line.appendChild(keySpan);
          line.appendChild(document.createTextNode(': '));
        }
        line.appendChild(document.createTextNode(openBrace + closeBrace + comma));
        return line;
      }

      const details = document.createElement('details');
      details.className = 'json-tree-node';
      details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'json-tree-summary';
      if (keyName !== undefined) {
        const keySpan = document.createElement('span');
        keySpan.className = 'syn-key';
        keySpan.textContent = JSON.stringify(keyName);
        summary.appendChild(keySpan);
        summary.appendChild(document.createTextNode(': '));
      }
      summary.appendChild(document.createTextNode(openBrace));
      // Collapsed preview
      const preview = document.createElement('span');
      preview.className = 'json-tree-preview';
      if (isArr) {
        preview.textContent = ' ' + count + ' items ';
      } else {
        const keys = Object.keys(value);
        const previewKeys = keys.slice(0, JSON_TREE_PREVIEW_KEYS).map((k) => JSON.stringify(k)).join(', ');
        preview.textContent = ' ' + previewKeys + (keys.length > JSON_TREE_PREVIEW_KEYS ? ', ...' : '') + ' ';
      }
      summary.appendChild(preview);
      details.appendChild(summary);

      const childWrap = document.createElement('div');
      childWrap.className = 'json-tree-children';
      if (isArr) {
        const renderCount = Math.min(value.length, JSON_TREE_MAX_CHILDREN);
        for (let i = 0; i < renderCount; i++) {
          childWrap.appendChild(buildNode(value[i], undefined, i === value.length - 1 && renderCount === value.length, depth + 1));
        }
        if (value.length > JSON_TREE_MAX_CHILDREN) {
          const moreBtn = document.createElement('button');
          moreBtn.className = 'link-btn json-tree-more';
          moreBtn.textContent = '... Show all ' + value.length + ' items';
          moreBtn.addEventListener('click', () => {
            moreBtn.remove();
            for (let i = renderCount; i < value.length; i++) {
              childWrap.appendChild(buildNode(value[i], undefined, i === value.length - 1, depth + 1));
            }
          });
          childWrap.appendChild(moreBtn);
        }
      } else {
        const keys = Object.keys(value);
        const renderCount = Math.min(keys.length, JSON_TREE_MAX_CHILDREN);
        for (let i = 0; i < renderCount; i++) {
          childWrap.appendChild(buildNode(value[keys[i]], keys[i], i === keys.length - 1 && renderCount === keys.length, depth + 1));
        }
        if (keys.length > JSON_TREE_MAX_CHILDREN) {
          const moreBtn = document.createElement('button');
          moreBtn.className = 'link-btn json-tree-more';
          moreBtn.textContent = '... Show all ' + keys.length + ' properties';
          moreBtn.addEventListener('click', () => {
            moreBtn.remove();
            for (let i = renderCount; i < keys.length; i++) {
              childWrap.appendChild(buildNode(value[keys[i]], keys[i], i === keys.length - 1, depth + 1));
            }
          });
          childWrap.appendChild(moreBtn);
        }
      }
      details.appendChild(childWrap);

      const closeLine = document.createElement('div');
      closeLine.className = 'json-tree-close';
      closeLine.textContent = closeBrace + comma;
      details.appendChild(closeLine);

      return details;
    }

    container.appendChild(buildNode(parsed, undefined, true, 0));
    return container;
  }

  /**
   * Render raw HTTP text with syntax highlighting.
   * First line = status/request line (bold), header names colored, body as-is.
   */
  function renderRawHighlighted(rawText) {
    const pre = document.createElement('pre');
    pre.className = 'code-block code-raw';
    const lines = rawText.split('\n');
    let inBody = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) {
        // Request/Status line
        const span = document.createElement('span');
        span.className = 'syn-status-line';
        span.textContent = line;
        pre.appendChild(span);
      } else if (!inBody && line.trim() === '') {
        // Empty line = separator between headers and body
        inBody = true;
        pre.appendChild(document.createTextNode(line));
      } else if (!inBody) {
        // Header line: "Name: Value"
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const nameSpan = document.createElement('span');
          nameSpan.className = 'syn-hdr-name';
          nameSpan.textContent = line.substring(0, colonIdx);
          pre.appendChild(nameSpan);
          const valSpan = document.createElement('span');
          valSpan.className = 'syn-hdr-val';
          valSpan.textContent = line.substring(colonIdx);
          pre.appendChild(valSpan);
        } else {
          pre.appendChild(document.createTextNode(line));
        }
      } else {
        // Body — try to detect JSON for highlighting
        pre.appendChild(document.createTextNode(line));
      }
      if (i < lines.length - 1) pre.appendChild(document.createTextNode('\n'));
    }
    return pre;
  }

  function selectRow(row, event) {
    // Multi-row selection support
    if (event && event.ctrlKey) {
      // Ctrl+Click: toggle multi-selection
      if (state.selectedRows.has(row)) {
        state.selectedRows.delete(row);
      } else {
        state.selectedRows.add(row);
      }
      renderBody(); // Update row styling only
      return; // Don't update detail panel
    }

    if (event && event.shiftKey && state.selectedRow) {
      // Shift+Click: range selection
      const filtered = state.filteredRows;
      const lastIdx = filtered.indexOf(state.selectedRow);
      const currentIdx = filtered.indexOf(row);
      if (lastIdx !== -1 && currentIdx !== -1) {
        const [start, end] = lastIdx < currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx];
        for (let i = start; i <= end; i++) {
          state.selectedRows.add(filtered[i]);
        }
        renderBody(); // Update row styling only
        return; // Don't update detail panel
      }
    }

    // Normal click: clear multi-selection and show detail
    state.selectedRows.clear();
    state.selectedRow = row;
    renderBody();
    if (!row) return;

    const tableWrap = $('#tableWrap');
    if (tableWrap) tableWrap.focus();

    const titleParts = [];
    if (row.status) titleParts.push(String(row.status));
    if (row.method) titleParts.push(row.method);
    titleParts.push(row.url || '');
    $('#detailsTitle').textContent = titleParts.join(' ');

    // === REQUEST TABS ===

    // Request > Headers
    const reqHeadersPane = $('#req-headers');
    reqHeadersPane.textContent = '';
    const reqInfo = createKvGrid([
      { key: 'Method', value: row.method || '' },
      { key: 'URL', value: row.url || '' },
      { key: 'Protocol', value: row.protocol || '' },
    ]);
    reqHeadersPane.appendChild(reqInfo);
    if (row.requestHeaders && row.requestHeaders.length > 0) {
      const title = document.createElement('strong');
      title.textContent = 'Request Headers';
      title.style.display = 'block';
      title.style.marginTop = '8px';
      reqHeadersPane.appendChild(title);
      reqHeadersPane.appendChild(createKvGrid(row.requestHeaders.map((h) => ({ key: h.name, value: h.value }))));
    }

    // Request > Body
    const reqBodyPane = $('#req-body');
    reqBodyPane.textContent = '';
    if (row.requestPostData && row.requestPostData.text) {
      const text = row.requestPostData.text;
      const treeEl = renderJsonTree(text);
      if (treeEl) {
        reqBodyPane.appendChild(treeEl);
      } else {
        const pre = document.createElement('pre');
        pre.className = 'code-block';
        pre.textContent = text;
        reqBodyPane.appendChild(pre);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).catch((e) => console.error(e));
      });
      reqBodyPane.insertBefore(copyBtn, reqBodyPane.firstChild);
    } else {
      reqBodyPane.textContent = '(no request body)';
    }

    // Request > Query
    const reqQueryPane = $('#req-query');
    reqQueryPane.textContent = '';
    const queryParams = parseQueryString(row.url || '');
    if (queryParams.length > 0) {
      reqQueryPane.appendChild(createKvGrid(queryParams));
    } else {
      reqQueryPane.textContent = '(no query parameters)';
    }

    // Request > Cookies
    const reqCookiesPane = $('#req-cookies');
    reqCookiesPane.textContent = '';
    const cookieHeader = getHeaderValue(row.requestHeaders, 'cookie');
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader);
      reqCookiesPane.appendChild(createKvGrid(cookies.map((c) => ({ key: c.name, value: c.value }))));
    } else {
      reqCookiesPane.textContent = '(no cookies)';
    }

    // Request > Raw
    const reqRawPane = $('#req-raw');
    reqRawPane.textContent = '';
    const rawReqPre = renderRawHighlighted(buildRawRequestText(row));
    const copyRawReq = document.createElement('button');
    copyRawReq.className = 'copy-btn';
    copyRawReq.textContent = 'Copy';
    copyRawReq.addEventListener('click', () => {
      navigator.clipboard.writeText(rawReqPre.textContent).catch((e) => console.error(e));
    });
    reqRawPane.appendChild(copyRawReq);
    reqRawPane.appendChild(rawReqPre);

    // === RESPONSE TABS ===

    // Response > Headers
    const resHeadersPane = $('#res-headers');
    resHeadersPane.textContent = '';
    const resInfo = createKvGrid([
      { key: 'Status', value: row.status + ' ' + (row.statusText || '') },
      { key: 'Protocol', value: row.protocol || '' },
      { key: 'Size', value: fmtBytes(row.size) },
      { key: 'Duration', value: fmtTime(row.duration) },
    ]);
    resHeadersPane.appendChild(resInfo);
    if (row.responseHeaders && row.responseHeaders.length > 0) {
      const title = document.createElement('strong');
      title.textContent = 'Response Headers';
      title.style.display = 'block';
      title.style.marginTop = '8px';
      resHeadersPane.appendChild(title);
      resHeadersPane.appendChild(createKvGrid(row.responseHeaders.map((h) => ({ key: h.name, value: h.value }))));
    }

    // Response > Body, Preview, Raw — populated async
    const resBodyPane = $('#res-body');
    const resPreviewPane = $('#res-preview');
    const resRawPane = $('#res-raw');
    resBodyPane.textContent = '(loading...)';
    resPreviewPane.textContent = '(loading...)';
    resRawPane.textContent = '';

    if (row._reqObj && typeof row._reqObj.getContent === 'function') {
      row._reqObj.getContent((content, encoding) => {
        let text = content || '';
        if (encoding === 'base64') {
          try {
            text = atob(content);
          } catch (_e) {
            text = '(could not decode base64 response)';
          }
        }

        // Body tab — formatted text
        resBodyPane.textContent = '';
        const treeEl = renderJsonTree(text);
        if (treeEl) {
          resBodyPane.appendChild(treeEl);
        } else {
          const bodyPre = document.createElement('pre');
          bodyPre.className = 'code-block';
          if (text.length > TRUNCATE_LIMIT) {
            bodyPre.textContent = text.substring(0, TRUNCATE_LIMIT);
            const showMore = document.createElement('button');
            showMore.textContent = '... Show all (' + fmtBytes(text.length) + ')';
            showMore.className = 'link-btn';
            showMore.addEventListener('click', () => {
              bodyPre.textContent = text;
            });
            resBodyPane.appendChild(bodyPre);
            resBodyPane.appendChild(showMore);
          } else {
            bodyPre.textContent = text || '(no response body)';
            resBodyPane.appendChild(bodyPre);
          }
        }
        const copyBody = document.createElement('button');
        copyBody.className = 'copy-btn';
        copyBody.textContent = 'Copy';
        copyBody.addEventListener('click', () => {
          navigator.clipboard.writeText(text).catch((e) => console.error(e));
        });
        resBodyPane.insertBefore(copyBody, resBodyPane.firstChild);

        // Preview tab — image or rendered HTML
        resPreviewPane.textContent = '';
        if (encoding === 'base64' && row.type && row.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = 'data:' + row.type + ';base64,' + content;
          img.style.maxWidth = '100%';
          resPreviewPane.appendChild(img);
        } else if (row.type && (row.type.indexOf('html') > -1)) {
          const iframe = document.createElement('iframe');
          iframe.sandbox = '';
          iframe.style.width = '100%';
          iframe.style.height = '300px';
          iframe.style.border = '1px solid var(--border)';
          iframe.srcdoc = text;
          resPreviewPane.appendChild(iframe);
        } else {
          const previewFormatted = formatJsonSafe(text);
          if (previewFormatted) {
            resPreviewPane.appendChild(renderJsonHighlighted(previewFormatted));
          } else {
            resPreviewPane.textContent = '(no preview available)';
          }
        }

        // Raw tab
        resRawPane.textContent = '';
        const rawResPre = renderRawHighlighted(buildRawResponseText(row, text));
        const copyRawRes = document.createElement('button');
        copyRawRes.className = 'copy-btn';
        copyRawRes.textContent = 'Copy';
        copyRawRes.addEventListener('click', () => {
          navigator.clipboard.writeText(rawResPre.textContent).catch((e) => console.error(e));
        });
        resRawPane.appendChild(copyRawRes);
        resRawPane.appendChild(rawResPre);
      });
    } else {
      resBodyPane.textContent = '(response body not available)';
      resPreviewPane.textContent = '(response body not available)';
      resRawPane.textContent = '(response body not available)';
    }

    // Response > Cookies
    const resCookiesPane = $('#res-cookies');
    resCookiesPane.textContent = '';
    const setCookieHeaders = (row.responseHeaders || []).filter(
      (h) => (h.name || '').toLowerCase() === 'set-cookie',
    );
    if (setCookieHeaders.length > 0) {
      resCookiesPane.appendChild(
        createKvGrid(setCookieHeaders.map((h, i) => ({ key: 'Set-Cookie #' + (i + 1), value: h.value }))),
      );
    } else {
      resCookiesPane.textContent = '(no set-cookie headers)';
    }

    // Response > Timing
    const resTimingPane = $('#res-timing');
    resTimingPane.textContent = '';
    const timingItems = [];
    if (row.timings) {
      for (const key in row.timings) {
        if (typeof row.timings[key] === 'number' && row.timings[key] >= 0) {
          timingItems.push({ name: key, value: fmtTime(row.timings[key]) });
        }
      }
    }
    timingItems.push({ name: 'Total', value: fmtTime(row.duration) });
    const timingTitle = document.createElement('strong');
    timingTitle.textContent = 'Timing Breakdown';
    resTimingPane.appendChild(timingTitle);
    resTimingPane.appendChild(createKvGrid(timingItems));

    // Timing bar visualization
    if (row.timings) {
      const barWrap = document.createElement('div');
      barWrap.className = 'timing-bar-wrap';
      const total = row.duration || 1;
      const phases = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
      const colors = ['#999', '#6cf', '#f90', '#c6f', '#9c6', '#6c9', '#69c'];
      for (let i = 0; i < phases.length; i++) {
        const val = row.timings[phases[i]];
        if (typeof val === 'number' && val > 0) {
          const seg = document.createElement('div');
          seg.className = 'timing-bar-seg';
          seg.style.width = Math.max(1, (val / total) * 100) + '%';
          seg.style.background = colors[i];
          seg.title = phases[i] + ': ' + fmtTime(val);
          barWrap.appendChild(seg);
        }
      }
      resTimingPane.appendChild(barWrap);

      // Legend
      const legend = document.createElement('div');
      legend.className = 'timing-legend';
      for (let i = 0; i < phases.length; i++) {
        const item = document.createElement('span');
        item.className = 'timing-legend-item';
        const dot = document.createElement('span');
        dot.className = 'timing-legend-dot';
        dot.style.background = colors[i];
        item.appendChild(dot);
        item.appendChild(document.createTextNode(phases[i]));
        legend.appendChild(item);
      }
      resTimingPane.appendChild(legend);
    }
  }

  // ============================================================
  // Section 14: Export [U1][U2]
  // ============================================================
  function getExportRows() {
    // [U2] Export only filtered (displayed) rows
    filterRows();
    return state.filteredRows;
  }

  function buildHarLogFromRows() {
    const pageref = 'page_1';
    const entries = [];
    const rows = getExportRows();
    for (const r of rows) {
      const started = r.startedDateTime || new Date().toISOString();
      const url = r.url || '';
      const httpVersion = r.protocol || 'HTTP/2';
      const reqHeaders = toHarHeaders(r.requestHeaders);
      const resHeaders = toHarHeaders(r.responseHeaders);
      const postData = r.requestPostData
        ? { mimeType: r.requestPostData.mimeType || '', text: r.requestPostData.text || '' }
        : null;
      // [U1] Include response body text in HAR
      const content = {
        size: r.size || 0,
        mimeType: guessMimeType(r),
        text: r.responseContent || '',
      };
      const timings = { blocked: -1, dns: -1, connect: -1, ssl: -1, send: -1, wait: -1, receive: -1 };
      const t = (r._reqObj && r._reqObj.timings) || {};
      for (const k in timings) {
        if (typeof t[k] === 'number') timings[k] = t[k];
      }
      const entry = {
        pageref,
        startedDateTime: started,
        time: typeof r.duration === 'number' ? r.duration : 0,
        request: {
          method: r.method || '',
          url,
          httpVersion,
          cookies: [],
          headers: reqHeaders,
          queryString: parseQueryString(url),
          headersSize: -1,
          bodySize: r.requestPostData && r.requestPostData.text ? r.requestPostData.text.length : -1,
        },
        response: {
          status: r.status || 0,
          statusText: r.statusText || '',
          httpVersion,
          cookies: [],
          headers: resHeaders,
          content,
          redirectURL: '',
          headersSize: -1,
          bodySize: r.size || -1,
        },
        cache: {},
        timings,
      };
      if (postData) entry.request.postData = postData;
      entries.push(entry);
    }
    const now = new Date().toISOString();
    return {
      log: {
        version: '1.2',
        creator: { name: 'Network+ for DevTools', version: '1.2.0' },
        pages: [{ startedDateTime: now, id: pageref, title: 'Network+', pageTimings: {} }],
        entries,
      },
    };
  }

  function exportHAR() {
    const har = buildHarLogFromRows();
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'network-plus.har';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============================================================
  // Section 15: Initialization [U4][U5][U6][U7]
  // ============================================================
  function init() {
    loadColumnPrefs();
    setStatus('panel.js loaded');

    // Theme init
    loadThemePref((pref) => applyTheme(pref));
    $('#themeBtn').addEventListener('click', () => {
      loadThemePref((cur) => {
        const nxt = nextTheme(cur);
        saveThemePref(nxt);
        applyTheme(nxt);
      });
    });

    // [U4] Clear — reset filters properly, keeping method defaults
    $('#clearBtn').addEventListener('click', () => {
      state.rows = [];
      state.filteredRows = [];
      state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();
      state.nextId = 1;
      state.selectedRow = null;
      state.selectedRows.clear();
      state.highlightedRows.clear();
      // Reset search
      state.search.keywords = [];
      state.search.matches = [];
      state.search.currentIndex = -1;
      state.search.rowColors.clear();
      state.search.perKeyword.clear();
      render();
      setStatus('Cleared');
    });

    // Pause/Resume
    const pauseBtn = $('#pauseBtn');
    const topbar = $('.topbar');
    const updateRecordState = () => {
      pauseBtn.innerHTML = state.paused ? PLAY_ICON_SVG : PAUSE_ICON_SVG;
      if (state.paused) {
        topbar.classList.add('paused');
        topbar.classList.remove('recording');
      } else {
        topbar.classList.add('recording');
        topbar.classList.remove('paused');
      }
      setStatus(state.paused ? 'Paused' : 'Recording...');
    };
    pauseBtn.addEventListener('click', () => {
      state.paused = !state.paused;
      updateRecordState();
    });
    updateRecordState();

    // Export
    $('#exportHarBtn').addEventListener('click', exportHAR);

    // Column Settings Context Menu
    const columnsContextMenu = document.createElement('div');
    columnsContextMenu.className = 'filter-dropdown-content dropdown-content';
    columnsContextMenu.style.position = 'absolute';
    columnsContextMenu.style.display = 'none';
    document.body.appendChild(columnsContextMenu);

    const filterPopup = document.createElement('div');
    filterPopup.className = 'filter-popup dropdown-content';
    filterPopup.style.position = 'absolute';
    filterPopup.style.display = 'none';
    document.body.appendChild(filterPopup);

    const openFilterPopup = (x, y, focusColId) => {
      filterPopup.textContent = '';
      if (focusColId) {
        filterPopup.appendChild(createSingleColumnFilterContent(focusColId, renderBody));
      } else {
        filterPopup.appendChild(createFilterPopupContent(renderBody, null));
      }
      filterPopup.style.left = x + 'px';
      filterPopup.style.top = y + 'px';
      filterPopup.style.display = 'block';
      filterPopup.classList.add('show');
      // Clamp popup to viewport so <select> dropdowns are not clipped
      const rect = filterPopup.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        filterPopup.style.left = Math.max(0, window.innerWidth - rect.width - 8) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        filterPopup.style.top = Math.max(0, window.innerHeight - rect.height - 8) + 'px';
      }
    };

    const renderColumnsContextMenu = () => {
      columnsContextMenu.textContent = '';

      // Select All / Deselect All buttons
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;padding:4px 4px 8px;border-bottom:1px solid var(--border);margin-bottom:4px';
      const selectAllBtn = document.createElement('button');
      selectAllBtn.textContent = 'Select All';
      selectAllBtn.className = 'context-menu-item';
      selectAllBtn.style.cssText = 'flex:1;text-align:center;font-size:11px;padding:4px';
      selectAllBtn.addEventListener('click', () => {
        state.columns.forEach((c) => { c.visible = true; });
        saveColumnPrefs();
        render();
        renderColumnsContextMenu();
        columnsContextMenu.style.display = 'block';
      });
      const deselectAllBtn = document.createElement('button');
      deselectAllBtn.textContent = 'Deselect All';
      deselectAllBtn.className = 'context-menu-item';
      deselectAllBtn.style.cssText = 'flex:1;text-align:center;font-size:11px;padding:4px';
      deselectAllBtn.addEventListener('click', () => {
        state.columns.forEach((c) => { c.visible = false; });
        saveColumnPrefs();
        render();
        renderColumnsContextMenu();
        columnsContextMenu.style.display = 'block';
      });
      btnRow.appendChild(selectAllBtn);
      btnRow.appendChild(deselectAllBtn);
      columnsContextMenu.appendChild(btnRow);

      state.columns.forEach((current) => {
        const item = createCheckboxItem(current.label, current.visible, (e) => {
          const col = state.columns.find((c) => c.id === current.id);
          if (col) col.visible = e.target.checked;
          saveColumnPrefs();
          render();
          renderColumnsContextMenu();
          columnsContextMenu.style.display = 'block';
        });
        columnsContextMenu.appendChild(item);
      });
    };

    $('#thead').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      $all('.dropdown-content').forEach((d) => {
        d.style.display = 'none';
        d.classList.remove('show');
      });
      const th = e.target.closest('th');
      const focusColId = th ? th.dataset.colId : null;
      openFilterPopup(e.pageX, e.pageY, focusColId);
    });

    $('#columnsBtn').addEventListener('click', (e) => {
      const isVisible = columnsContextMenu.classList.contains('show');
      $all('.dropdown-content').forEach((d) => {
        d.style.display = 'none';
        d.classList.remove('show');
      });
      if (!isVisible) {
        renderColumnsContextMenu();
        const rect = e.currentTarget.getBoundingClientRect();
        columnsContextMenu.style.left = rect.left + window.scrollX + 'px';
        columnsContextMenu.style.top = rect.bottom + window.scrollY + 'px';
        columnsContextMenu.style.display = 'block';
        columnsContextMenu.classList.add('show');
      }
    });

    $('#filterBtn').addEventListener('click', (e) => {
      const isVisible = filterPopup.classList.contains('show');
      $all('.dropdown-content').forEach((d) => {
        d.style.display = 'none';
        d.classList.remove('show');
      });
      if (!isVisible) {
        const rect = e.currentTarget.getBoundingClientRect();
        openFilterPopup(rect.left + window.scrollX, rect.bottom + window.scrollY, null);
      }
    });

    // Tab switching for inspector panels
    const initTabBar = (barId) => {
      const bar = $('#' + barId);
      if (!bar) return;
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        const tabId = btn.dataset.tab;
        // Deactivate siblings
        bar.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        // Show target pane, hide others
        const contentArea = bar.nextElementSibling;
        if (contentArea) {
          contentArea.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
          const target = contentArea.querySelector('#' + tabId);
          if (target) target.classList.add('active');
        }
      });
    };
    initTabBar('req-tab-bar');
    initTabBar('res-tab-bar');

    render();

    // Global click handler to close dropdowns
    window.addEventListener('click', (e) => {
      if (
        e.target.closest('#filterBtn') ||
        e.target.closest('#columnsBtn') ||
        e.target.closest('#searchScopeBtn') ||
        e.target.closest('.filter-btn') ||
        e.target.closest('.dropdown-content')
      ) return;
      $all('.dropdown-content').forEach((d) => {
        d.classList.remove('show');
        d.style.display = 'none';
      });
    });

    // Auto-scroll button
    const autoScrollBtn = document.createElement('button');
    autoScrollBtn.id = 'autoScrollBtn';
    autoScrollBtn.textContent = 'Auto-scroll';
    if (state.autoScroll) autoScrollBtn.classList.add('active');
    autoScrollBtn.addEventListener('click', () => {
      state.autoScroll = !state.autoScroll;
      autoScrollBtn.classList.toggle('active', state.autoScroll);
    });
    $('#exportHarBtn').insertAdjacentElement('afterend', autoScrollBtn);

    // [U6] Keyboard navigation
    const tableWrap = $('#tableWrap');
    tableWrap.setAttribute('tabindex', '0');
    tableWrap.addEventListener('keydown', (e) => {
      if (!state.filteredRows.length) return;
      const currentIdx = state.selectedRow ? state.filteredRows.indexOf(state.selectedRow) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(currentIdx + 1, state.filteredRows.length - 1);
        selectRow(state.filteredRows[nextIdx]);
        scrollToSelectedRow();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(currentIdx - 1, 0);
        selectRow(state.filteredRows[prevIdx]);
        scrollToSelectedRow();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        // Ctrl+C: copy selected row(s) summary to clipboard
        const rows = state.selectedRows.size > 0
          ? [...state.selectedRows]
          : (state.selectedRow ? [state.selectedRow] : []);
        if (rows.length === 0) return;
        e.preventDefault();
        const text = rows.map((r) => formatRowSummary(r)).join('\n\n---\n\n');
        navigator.clipboard.writeText(text).then(() => {
          showCopyToast(rows.length === 1 ? 'Copied 1 request' : 'Copied ' + rows.length + ' requests');
        }).catch((_err) => {
          setStatus('Copy failed');
        });
      }
    });

    function scrollToSelectedRow() {
      if (!state.selectedRow) return;
      const selectedTr = tableWrap.querySelector(`tr[data-row-id="${state.selectedRow.id}"]`);
      if (selectedTr) selectedTr.scrollIntoView({ block: 'nearest' });
    }

    // Copy toast notification
    const copyToast = document.createElement('div');
    copyToast.className = 'copy-toast';
    document.body.appendChild(copyToast);
    let copyToastTimer = null;
    function showCopyToast(msg) {
      copyToast.textContent = msg;
      copyToast.classList.add('show');
      if (copyToastTimer) clearTimeout(copyToastTimer);
      copyToastTimer = setTimeout(() => {
        copyToast.classList.remove('show');
      }, 1800);
    }

    // Right-click context menu for marking/selecting rows
    const contextMenu = document.createElement('div');
    contextMenu.className = 'filter-dropdown-content dropdown-content context-menu';
    contextMenu.style.position = 'absolute';
    contextMenu.style.display = 'none';
    contextMenu.style.zIndex = '1000';
    document.body.appendChild(contextMenu);

    let contextMenuRow = null;

    tableWrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tr = e.target.closest('tr');
      if (!tr || !tr.dataset.rowId) {
        contextMenu.style.display = 'none';
        return;
      }

      const rowId = parseInt(tr.dataset.rowId, 10);
      contextMenuRow = state.rows.find((r) => r.id === rowId);
      if (!contextMenuRow) return;

      contextMenu.textContent = '';
      const isMultiSelected = state.selectedRows.has(contextMenuRow);
      const targetRows = isMultiSelected && state.selectedRows.size > 0 ? [...state.selectedRows] : [contextMenuRow];
      const allHighlighted = targetRows.every((r) => state.highlightedRows.has(r));

      // Highlight color picker
      const hlLabel = document.createElement('div');
      hlLabel.className = 'context-menu-item';
      hlLabel.style.cssText = 'font-weight:600;font-size:11px;cursor:default;padding-bottom:2px';
      hlLabel.textContent = targetRows.length > 1 ? `Highlight (${targetRows.length} rows)` : 'Highlight';
      contextMenu.appendChild(hlLabel);

      const colorRow = document.createElement('div');
      colorRow.style.cssText = 'display:flex;gap:4px;padding:4px 9px 6px;flex-wrap:wrap';
      for (const hc of HIGHLIGHT_COLORS) {
        const swatch = document.createElement('button');
        swatch.className = 'hl-swatch ' + hc.cls;
        swatch.title = hc.name;
        swatch.addEventListener('click', () => {
          targetRows.forEach((r) => { state.highlightedRows.set(r, hc.cls); });
          renderBody();
          contextMenu.style.display = 'none';
        });
        colorRow.appendChild(swatch);
      }
      contextMenu.appendChild(colorRow);

      // Unhighlight
      if (allHighlighted) {
        const unhighlightBtn = document.createElement('button');
        unhighlightBtn.textContent = targetRows.length > 1 ? `Unhighlight (${targetRows.length})` : 'Unhighlight';
        unhighlightBtn.className = 'context-menu-item';
        unhighlightBtn.addEventListener('click', () => {
          targetRows.forEach((r) => { state.highlightedRows.delete(r); });
          renderBody();
          contextMenu.style.display = 'none';
        });
        contextMenu.appendChild(unhighlightBtn);
      }

      // Add/Remove from multi-selection
      const selectBtn = document.createElement('button');
      selectBtn.textContent = isMultiSelected ? 'Deselect' : 'Select';
      selectBtn.className = 'context-menu-item';
      selectBtn.addEventListener('click', () => {
        if (isMultiSelected) {
          state.selectedRows.delete(contextMenuRow);
        } else {
          state.selectedRows.add(contextMenuRow);
        }
        renderBody();
        contextMenu.style.display = 'none';
      });
      contextMenu.appendChild(selectBtn);

      // Clear all highlights
      if (state.highlightedRows.size > 0) {
        const clearMarksBtn = document.createElement('button');
        clearMarksBtn.textContent = 'Clear All Highlights';
        clearMarksBtn.className = 'context-menu-item';
        clearMarksBtn.addEventListener('click', () => {
          state.highlightedRows.clear();
          renderBody();
          contextMenu.style.display = 'none';
        });
        contextMenu.appendChild(clearMarksBtn);
      }

      // Export/Keep/Delete selected rows
      if (state.selectedRows.size > 0) {
        const selCount = state.selectedRows.size;
        const keepBtn = document.createElement('button');
        keepBtn.textContent = `Keep Selected (${selCount})`;
        keepBtn.className = 'context-menu-item';
        keepBtn.addEventListener('click', () => {
          state.rows = state.rows.filter((r) => state.selectedRows.has(r));
          for (const r of state.highlightedRows.keys()) { if (!state.rows.includes(r)) state.highlightedRows.delete(r); }
          state.selectedRows.clear();
          renderBody();
          contextMenu.style.display = 'none';
        });
        contextMenu.appendChild(keepBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = `Delete Selected (${selCount})`;
        deleteBtn.className = 'context-menu-item';
        deleteBtn.addEventListener('click', () => {
          state.rows = state.rows.filter((r) => !state.selectedRows.has(r));
          for (const r of state.highlightedRows.keys()) { if (!state.rows.includes(r)) state.highlightedRows.delete(r); }
          state.selectedRows.clear();
          renderBody();
          contextMenu.style.display = 'none';
        });
        contextMenu.appendChild(deleteBtn);
      }

      // Show menu
      contextMenu.style.left = e.pageX + 'px';
      contextMenu.style.top = e.pageY + 'px';
      contextMenu.style.display = 'block';
    });

    // Close context menu on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown-content')) {
        contextMenu.style.display = 'none';
      }
    });

    // Resizer logic (left/right panel split)
    const resizer = $('#resizer');
    const details = $('#details');

    resizer.addEventListener('mousedown', () => {
      const handleMouseMove = (e) => {
        const totalWidth = $('#content').offsetWidth;
        const newDetailsWidth = totalWidth - e.clientX;
        if (newDetailsWidth > MIN_DETAILS_WIDTH && newDetailsWidth < totalWidth - MIN_TABLE_WIDTH) {
          details.style.flexBasis = newDetailsWidth + 'px';
          tableWrap.style.flexBasis = totalWidth - newDetailsWidth - RESIZER_WIDTH + 'px';
        }
      };
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });

    // Inspector divider (Request/Response pane resize)
    const inspectorDivider = $('#inspector-divider');
    const inspectorPanels = inspectorDivider ? inspectorDivider.parentElement : null;
    if (inspectorDivider && inspectorPanels) {
      inspectorDivider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const reqPane = $('#inspector-request');
        const resPane = $('#inspector-response');
        const startY = e.clientY;
        const startReqH = reqPane.offsetHeight;
        const startResH = resPane.offsetHeight;

        const handleMove = (ev) => {
          const delta = ev.clientY - startY;
          const newReqH = startReqH + delta;
          const newResH = startResH - delta;
          const minH = 80;
          if (newReqH >= minH && newResH >= minH) {
            reqPane.style.flex = 'none';
            resPane.style.flex = 'none';
            reqPane.style.height = newReqH + 'px';
            resPane.style.height = newResH + 'px';
          }
        };
        const handleUp = () => {
          document.removeEventListener('mousemove', handleMove);
          document.removeEventListener('mouseup', handleUp);
        };
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
      });
    }

    // ---- Unified Search Feature (multi-keyword, multi-row with per-keyword colors) ----
    const searchPanel = $('#searchPanel');
    const searchRows = $('#searchRows');
    const searchCount = $('#searchCount');
    const searchToggleBtn = $('#searchToggleBtn');
    const searchAddBtn = $('#searchAddBtn');
    const searchScopeBtn = $('#searchScopeBtn');
    const contentEl = $('#content');

    // Track search panel visibility
    let searchPanelVisible = false;

    function toggleSearchPanel(forceOpen) {
      const shouldShow = forceOpen != null ? forceOpen : !searchPanelVisible;
      searchPanelVisible = shouldShow;
      searchPanel.style.display = shouldShow ? 'block' : 'none';
      searchToggleBtn.classList.toggle('active', shouldShow);
      if (shouldShow) {
        // Ensure at least one keyword row exists
        if (state.search.keywords.length === 0) {
          addKeywordRow();
        }
        renderSearchRows();
        // Focus the first input
        const firstInput = searchRows.querySelector('.search-keyword-input');
        if (firstInput) firstInput.focus();
      }
      updateContentHeight();
    }

    function updateContentHeight() {
      if (searchPanelVisible) {
        const panelH = searchPanel.offsetHeight;
        contentEl.style.height = 'calc(100vh - 72px - ' + panelH + 'px)';
      } else {
        contentEl.style.height = '';
      }
    }

    // Scope popup (dynamically created)
    const scopePopup = document.createElement('div');
    scopePopup.className = 'search-scope-popup dropdown-content';
    scopePopup.style.position = 'absolute';
    scopePopup.style.display = 'none';
    document.body.appendChild(scopePopup);

    const scopeLabels = [
      { key: 'url', text: 'URL / Method / Status / Type', checked: true },
      { key: 'reqBody', text: 'Request Body', checked: true },
      { key: 'resBody', text: 'Response Body', checked: true },
      { key: 'reqHeaders', text: 'Request Headers', checked: true },
      { key: 'resHeaders', text: 'Response Headers', checked: true },
    ];

    for (const sl of scopeLabels) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = sl.checked;
      const span = document.createElement('span');
      span.textContent = sl.text;
      label.appendChild(cb);
      label.appendChild(span);
      scopePopup.appendChild(label);
      cb.addEventListener('change', () => {
        state.search.scope[sl.key] = cb.checked;
        executeSearch();
      });
    }

    searchScopeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = scopePopup.classList.contains('show');
      $all('.dropdown-content').forEach((d) => { d.style.display = 'none'; d.classList.remove('show'); });
      if (!isVisible) {
        const rect = searchScopeBtn.getBoundingClientRect();
        scopePopup.style.left = rect.left + window.scrollX + 'px';
        scopePopup.style.top = rect.bottom + window.scrollY + 'px';
        scopePopup.style.display = 'block';
        scopePopup.classList.add('show');
      }
    });

    // Color picker popup (shared, repositioned on open)
    const colorPopup = document.createElement('div');
    colorPopup.className = 'search-color-popup dropdown-content';
    colorPopup.style.position = 'absolute';
    colorPopup.style.display = 'none';
    document.body.appendChild(colorPopup);

    let colorPopupTargetIdx = -1;
    for (let ci = 0; ci < SEARCH_COLORS.length; ci++) {
      const swatch = document.createElement('button');
      swatch.className = 'search-color-swatch';
      swatch.style.background = SEARCH_COLORS[ci].hex;
      swatch.title = SEARCH_COLORS[ci].name;
      swatch.addEventListener('click', () => {
        if (colorPopupTargetIdx >= 0 && colorPopupTargetIdx < state.search.keywords.length) {
          state.search.keywords[colorPopupTargetIdx].colorIdx = ci;
          renderSearchRows();
          executeSearch();
        }
        colorPopup.style.display = 'none';
        colorPopup.classList.remove('show');
      });
      colorPopup.appendChild(swatch);
    }

    function addKeywordRow() {
      const colorIdx = state.search.keywords.length % SEARCH_COLORS.length;
      state.search.keywords.push({ query: '', colorIdx: colorIdx });
    }

    function renderSearchRows() {
      // Save focus state before destroying inputs
      const activeEl = document.activeElement;
      let focusedIdx = -1;
      let selStart = 0;
      let selEnd = 0;
      if (activeEl && activeEl.classList.contains('search-keyword-input')) {
        const inputs = searchRows.querySelectorAll('.search-keyword-input');
        focusedIdx = Array.from(inputs).indexOf(activeEl);
        selStart = activeEl.selectionStart || 0;
        selEnd = activeEl.selectionEnd || 0;
      }

      searchRows.textContent = '';
      for (let i = 0; i < state.search.keywords.length; i++) {
        const kw = state.search.keywords[i];
        const row = document.createElement('div');
        row.className = 'search-keyword-row';

        // Color button
        const colorBtn = document.createElement('button');
        colorBtn.className = 'search-color-btn';
        colorBtn.style.background = SEARCH_COLORS[kw.colorIdx].hex;
        colorBtn.title = 'Change color';
        colorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          colorPopupTargetIdx = i;
          $all('.dropdown-content').forEach((d) => { d.style.display = 'none'; d.classList.remove('show'); });
          // Highlight active swatch
          colorPopup.querySelectorAll('.search-color-swatch').forEach((s, si) => {
            s.classList.toggle('active', si === kw.colorIdx);
          });
          const rect = colorBtn.getBoundingClientRect();
          colorPopup.style.left = rect.right + 4 + window.scrollX + 'px';
          colorPopup.style.top = rect.top + window.scrollY + 'px';
          colorPopup.style.display = 'flex';
          colorPopup.classList.add('show');
        });
        row.appendChild(colorBtn);

        // Text input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'search-keyword-input';
        input.placeholder = 'Enter search keyword...';
        input.value = kw.query;
        input.addEventListener('input', () => {
          state.search.keywords[i].query = input.value;
          debouncedSearch();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            navigateKeywordSearch(i, e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            toggleSearchPanel(false);
          }
        });
        row.appendChild(input);

        // Per-keyword match count
        const kwData = state.search.perKeyword.get(i);
        const kwMatchCount = kwData ? kwData.matches.length : 0;
        const kwCurIdx = kwData ? kwData.currentIndex : -1;
        const countSpan = document.createElement('span');
        countSpan.className = 'search-kw-count';
        if (kw.query.trim() && kwMatchCount === 0) {
          countSpan.textContent = '0';
          countSpan.style.color = 'var(--status-5xx)';
        } else if (kwMatchCount > 0) {
          countSpan.textContent = (kwCurIdx + 1) + '/' + kwMatchCount;
          countSpan.style.color = '';
        } else {
          countSpan.textContent = '';
        }
        row.appendChild(countSpan);

        // Per-keyword nav buttons
        const prevBtn = document.createElement('button');
        prevBtn.className = 'search-kw-nav';
        prevBtn.innerHTML = '&#9650;';
        prevBtn.title = 'Previous match (Shift+Enter)';
        prevBtn.disabled = kwMatchCount === 0;
        prevBtn.addEventListener('click', () => navigateKeywordSearch(i, -1));
        row.appendChild(prevBtn);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'search-kw-nav';
        nextBtn.innerHTML = '&#9660;';
        nextBtn.title = 'Next match (Enter)';
        nextBtn.disabled = kwMatchCount === 0;
        nextBtn.addEventListener('click', () => navigateKeywordSearch(i, 1));
        row.appendChild(nextBtn);

        // Remove button (only if more than one row)
        if (state.search.keywords.length > 1) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'search-remove-btn';
          removeBtn.textContent = '×';
          removeBtn.title = 'Remove keyword';
          removeBtn.addEventListener('click', () => {
            state.search.keywords.splice(i, 1);
            renderSearchRows();
            executeSearch();
            updateContentHeight();
          });
          row.appendChild(removeBtn);
        }

        searchRows.appendChild(row);
      }
      // Restore focus to the same keyword input
      if (focusedIdx >= 0) {
        const inputs = searchRows.querySelectorAll('.search-keyword-input');
        if (inputs[focusedIdx]) {
          inputs[focusedIdx].focus();
          inputs[focusedIdx].setSelectionRange(selStart, selEnd);
        }
      }
      // Update panel height after rendering rows
      requestAnimationFrame(() => updateContentHeight());
    }

    searchAddBtn.addEventListener('click', () => {
      addKeywordRow();
      renderSearchRows();
      // Focus the new input
      const inputs = searchRows.querySelectorAll('.search-keyword-input');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    });

    function executeSearch() {
      const srch = state.search;
      const activeKws = srch.keywords.filter((kw) => kw.query.trim());
      if (activeKws.length === 0) {
        srch.currentIndex = -1;
        searchCount.textContent = '';
        renderBody();
        return;
      }
      // refreshSearchMatches() is called inside renderBody()
      srch.currentIndex = -1; // reset navigation to recalculate after render
      renderBody();
      srch.currentIndex = srch.matches.length > 0 ? 0 : -1;
      updateSearchUI();
    }

    const debouncedSearch = debounce(() => executeSearch(), DEEP_SEARCH_DEBOUNCE_MS);

    function updateSearchUI() {
      const srch = state.search;
      const activeKws = srch.keywords.filter((kw) => kw.query.trim());
      if (srch.matches.length === 0 && activeKws.length > 0) {
        searchCount.textContent = 'No matches';
        searchCount.style.color = 'var(--status-5xx)';
      } else if (srch.matches.length > 0) {
        searchCount.textContent = srch.matches.length + ' matches';
        searchCount.style.color = '';
      } else {
        searchCount.textContent = '';
        searchCount.style.color = '';
      }
      // Update per-keyword counts in search rows
      renderSearchRows();
    }

    function scrollToSearchMatch() {
      const srch = state.search;
      if (srch.currentIndex < 0 || srch.currentIndex >= srch.matches.length) return;
      const matchRow = srch.matches[srch.currentIndex];
      const matchTr = $('#tableWrap').querySelector('tr[data-row-id="' + matchRow.id + '"]');
      if (matchTr) {
        matchTr.scrollIntoView({ block: 'nearest' });
        // Update detail panel without stealing focus
        state.selectedRow = matchRow;
        state.selectedRows.clear();
        renderBody();
        selectRow(matchRow);
      }
    }

    function navigateKeywordSearch(kwIndex, direction) {
      const srch = state.search;
      const kwData = srch.perKeyword.get(kwIndex);
      if (!kwData || kwData.matches.length === 0) return;
      kwData.currentIndex += direction;
      if (kwData.currentIndex >= kwData.matches.length) kwData.currentIndex = 0;
      if (kwData.currentIndex < 0) kwData.currentIndex = kwData.matches.length - 1;
      // Also update global currentIndex to point at the same row
      const targetRow = kwData.matches[kwData.currentIndex];
      const globalIdx = srch.matches.indexOf(targetRow);
      if (globalIdx >= 0) srch.currentIndex = globalIdx;
      renderSearchRows();
      renderBody();
      scrollToSearchMatch();
    }

    searchToggleBtn.addEventListener('click', () => toggleSearchPanel());

    // Ctrl+F toggles search panel
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        toggleSearchPanel(true);
      }
    }, true);

    // Import Feature (HAR / SAZ)
    const importBtn = $('#importBtn');
    const importFile = $('#importFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => {
        importFile.click();
      });

      importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setStatus(`Importing ${file.name}...`);

        try {
          // HAR import
          if (file.name.toLowerCase().endsWith('.har')) {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data && data.log && data.log.entries) {
              state.paused = true;
              pauseBtn.textContent = '▶️';
              pauseBtn.title = 'Resume recording';

              state.rows = [];
              state.selectedRows.clear();
              state.highlightedRows.clear();

              let currentId = state.nextId;
              data.log.entries.forEach((entry) => {
                entry.id = currentId++;

                if (!entry.getContent && entry.response && entry.response.content && entry.response.content.text) {
                  entry.getContent = function (cb) {
                    cb(entry.response.content.text, entry.response.content.encoding || 'utf8');
                  };
                }

                const row = buildRowFromRequest(entry);
                if (entry.response && entry.response.content && entry.response.content.text) {
                  row.responseContent = entry.response.content.text;
                }
                state.rows.push(row);
              });
              state.nextId = currentId;

              renderBody();
              setStatus(`Imported ${data.log.entries.length} requests from HAR`);
            } else {
              setStatus('Invalid HAR format');
            }
          }
          // SAZ import
          else if (file.name.toLowerCase().endsWith('.saz')) {
            if (!window.fflate) {
              setStatus('fflate library missing, cannot extract SAZ');
              return;
            }

            const buf = await file.arrayBuffer();
            const unzipped = window.fflate.unzipSync(new Uint8Array(buf));

            const rawKeys = Object.keys(unzipped).filter((k) => k.startsWith('raw/'));
            const reqIds = new Set();
            rawKeys.forEach((k) => {
              const m = k.match(/^raw\/(\d+)_([csm])\.(txt|xml)$/);
              if (m) reqIds.add(m[1]);
            });

            if (reqIds.size === 0) {
              setStatus('No payload found in SAZ');
              return;
            }

            state.paused = true;
            pauseBtn.textContent = '▶️';
            state.rows = [];
            state.selectedRows.clear();
            state.highlightedRows.clear();
            let currentId = state.nextId;

            const parseHttpMessage = (uint8arr) => {
              const txt = new TextDecoder().decode(uint8arr);
              const parts = txt.split('\r\n\r\n');
              const headerPart = parts[0];
              const body = parts.slice(1).join('\r\n\r\n');
              const lines = headerPart.split('\r\n');
              const startLine = lines[0];

              const headers = [];
              let currentHeader = null;
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith(' ') || line.startsWith('\t')) {
                  if (currentHeader) currentHeader.value += ' ' + line.trim();
                } else {
                  const colonIdx = line.indexOf(':');
                  if (colonIdx > 0) {
                    currentHeader = {
                      name: line.substring(0, colonIdx).trim(),
                      value: line.substring(colonIdx + 1).trim(),
                    };
                    headers.push(currentHeader);
                  }
                }
              }
              return { startLine, headers, body };
            };

            const getHeaderVal = (hdrs, name) => {
              const h = hdrs.find((x) => x.name.toLowerCase() === name.toLowerCase());
              return h ? h.value : null;
            };

            Array.from(reqIds)
              .sort((a, b) => parseInt(a) - parseInt(b))
              .forEach((id) => {
                const reqKey = `raw/${id}_c.txt`;
                const resKey = `raw/${id}_s.txt`;

                if (!unzipped[reqKey] || !unzipped[resKey]) return;

                try {
                  const clientRaw = parseHttpMessage(unzipped[reqKey]);
                  const serverRaw = parseHttpMessage(unzipped[resKey]);

                  const reqParts = clientRaw.startLine.split(' ');
                  const method = reqParts[0];
                  const url = reqParts.slice(1, reqParts.length - 1).join(' ');
                  const reqHttpVersion = reqParts[reqParts.length - 1];

                  const resParts = serverRaw.startLine.split(' ');
                  const resHttpVersion = resParts[0];
                  const status = parseInt(resParts[1], 10) || 0;
                  const statusText = resParts.slice(2).join(' ');

                  const resType = getHeaderVal(serverRaw.headers, 'content-type') || '';
                  const bodySize = serverRaw.body ? new TextEncoder().encode(serverRaw.body).length : 0;

                  const entry = {
                    id: currentId++,
                    startedDateTime: new Date().toISOString(),
                    time: 0,
                    request: {
                      method: method,
                      url: url,
                      httpVersion: reqHttpVersion,
                      headers: clientRaw.headers,
                      postData: clientRaw.body ? { text: clientRaw.body } : null,
                    },
                    response: {
                      status: status,
                      statusText: statusText,
                      httpVersion: resHttpVersion,
                      headers: serverRaw.headers,
                      content: {
                        size: bodySize,
                        mimeType: resType.split(';')[0],
                        text: serverRaw.body,
                      },
                      bodySize: bodySize,
                    },
                  };

                  entry.getContent = function (cb) {
                    cb(serverRaw.body, 'utf8');
                  };

                  const row = buildRowFromRequest(entry);
                  if (serverRaw.body) row.responseContent = serverRaw.body;
                  state.rows.push(row);
                } catch (ex) {
                  console.error('Failed to parse SAZ pair', id, ex);
                }
              });

            state.nextId = currentId;
            renderBody();
            setStatus(`Imported ${state.rows.length} requests from SAZ`);
          }
        } catch (err) {
          setStatus('Import Error: ' + err.message);
          console.error(err);
        }

        importFile.value = ''; // allow re-importing the same file
      });
    }

    // Network subscription
    // Throttle renderBody during heavy traffic to keep UI responsive
    let pendingRender = false;
    let pendingScrollToBottom = false;
    const scheduleRender = (scrollToBottom) => {
      if (scrollToBottom) pendingScrollToBottom = true;
      if (pendingRender) return;
      pendingRender = true;
      requestAnimationFrame(() => {
        pendingRender = false;
        renderBody();
        if (pendingScrollToBottom) {
          pendingScrollToBottom = false;
          tableWrap.scrollTop = tableWrap.scrollHeight;
        }
      });
    };

    if (chrome && chrome.devtools && chrome.devtools.network && chrome.devtools.network.onRequestFinished) {
      chrome.devtools.network.onRequestFinished.addListener((request) => {
        if (state.paused) return;
        const row = buildRowFromRequest(request);
        cacheResponseContent(row); // [U1]
        const wasAtBottom =
          state.autoScroll &&
          tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - SCROLL_THRESHOLD;
        state.rows.push(row);

        // Throttled re-render to keep sort order and filter state consistent
        // without blocking the main thread during heavy traffic.
        scheduleRender(wasAtBottom);
      });
      setStatus('Capturing...');
    } else {
      setStatus('DevTools network API unavailable');
    }

    // Error handlers
    window.addEventListener('error', (e) => setStatus('Error: ' + (e.message || e.error || e.filename)));
    window.addEventListener('unhandledrejection', (e) =>
      setStatus('Promise error: ' + ((e.reason && e.reason.message) || e.reason)),
    );
  }

  document.addEventListener('DOMContentLoaded', init);

  // Expose pure functions for testing
  return {
    fmtBytes,
    fmtTime,
    extractUrlParts,
    formatInitiator,
    parseQueryString,
    guessMimeType,
    toHarHeaders,
    debounce,
    highlightText,
    getRowFilterValue,
    evaluateFilterRule,
    deepSearchMatch,
    formatRowSummary,
    DEFAULT_METHOD_FILTERS,
  };
})();

// Support CommonJS for Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _NetworkPlus;
}
