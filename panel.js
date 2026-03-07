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

  const THEME_KEY = 'networkPlus.theme';
  const THEMES = ['system', 'dark', 'light'];
  const COL_PREF_KEY = 'networkPlus.cols';

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
    { id: 'initiator', label: 'Initiator', width: 220, visible: true },
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
    if (!initiator) return { text: 'other' };
    switch (initiator.type) {
      case 'parser':
        return { text: 'parser' };
      case 'script':
        if (initiator.stack && initiator.stack.callFrames && initiator.stack.callFrames.length > 0) {
          const frame = initiator.stack.callFrames[0];
          const fileName = frame.url.substring(frame.url.lastIndexOf('/') + 1) || '(internal)';
          const text = fileName + ':' + frame.lineNumber;
          return { text, url: frame.url, lineNumber: frame.lineNumber };
        }
        return { text: 'script' };
      default:
        return { text: initiator.type || 'other' };
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

  // ============================================================
  // Section 4: State Management
  // ============================================================
  const state = {
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    rows: [],
    filteredRows: [], // [U5] cache for filtered rows
    selectedRow: null, // [U5] track by row object reference, not index
    selectedRows: new Set(), // [U7] multi-row selection
    highlightedRows: new Set(), // [U7] highlighted rows
    columnFilterRules: DEFAULT_COLUMN_FILTER_RULES(),
    sort: {
      colId: 'id',
      direction: 'asc',
    },
    nextId: 1,
    paused: false,
    globalFilter: '',
    autoScroll: true,
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
    } catch (_e) {
      console.warn('Failed to save column preferences');
    }
  }

  function loadColumnPrefs() {
    try {
      const saved = localStorage.getItem(COL_PREF_KEY);
      if (saved) {
        const savedCols = JSON.parse(saved);
        const savedMap = {};
        savedCols.forEach((c) => {
          savedMap[c.id] = c;
        });
        state.columns = DEFAULT_COLUMNS.map((c) => {
          const savedPref = savedMap[c.id];
          return savedPref ? { ...c, visible: savedPref.visible, width: savedPref.width } : { ...c };
        });
      }
    } catch (_e) {
      console.warn('Failed to load column preferences');
    }
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
      // Global filter
      if (state.globalFilter) {
        const lcf = state.globalFilter.toLowerCase();
        const searchFields = [r.url, r.method, String(r.status), r.type];
        const found = searchFields.some((field) => field && field.toLowerCase().indexOf(lcf) > -1);
        if (!found) return false;
      }

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
    if (state.highlightedRows.has(row)) tr.classList.add('highlighted-row');
    if (state.selectedRows.has(row)) tr.classList.add('multi-selected');
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
          // Highlight initiator text if search active
          if (state.globalFilter) {
            link.appendChild(highlightText(initiator.text, state.globalFilter));
          } else {
            link.textContent = initiator.text;
          }
          td.appendChild(link);
        } else {
          const txt = initiator ? initiator.text : '';
          if (state.globalFilter) {
            td.appendChild(highlightText(txt, state.globalFilter));
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
        // Highlight text if global filter active
        if (state.globalFilter && text) {
          td.appendChild(highlightText(text, state.globalFilter));
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

      const grid = document.createElement('div');
      grid.className = 'filter-checkbox-grid';
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

    // Title row
    const tr = document.createElement('tr');
    tr.className = 'title-row';
    for (const c of state.columns) {
      if (!c.visible) continue;
      const th = document.createElement('th');
      th.style.width = (c.width || 120) + 'px';
      th.className = 'sortable-header';
      th.dataset.colId = c.id;
      const sortIndicator =
        state.sort.colId === c.id ? (state.sort.direction === 'asc' ? ' ▲' : state.sort.direction === 'desc' ? ' ▼' : '') : '';
      th.textContent = c.label + sortIndicator;
      th.title = 'Click to sort';
      th.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('col-resizer')) return;
        toggleSort(c.id);
        render();
      });
      const resizer = document.createElement('div');
      resizer.className = 'col-resizer';
      ((col, headerEl) => {
        resizer.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = headerEl.offsetWidth;
          const handleMouseMove = (e) => {
            const newWidth = startWidth + (e.clientX - startX);
            if (newWidth > MIN_COL_WIDTH) {
              col.width = newWidth;
              headerEl.style.width = newWidth + 'px';
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

  function renderBody() {
    filterRows();
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
      const formatted = formatJsonSafe(text);
      const pre = formatted ? renderJsonHighlighted(formatted) : document.createElement('pre');
      if (!formatted) {
        pre.className = 'code-block';
        pre.textContent = text;
      }
      reqBodyPane.appendChild(pre);

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
        const formatted = formatJsonSafe(text);
        if (formatted) {
          const bodyPre = renderJsonHighlighted(formatted);
          resBodyPane.appendChild(bodyPre);
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
        } else if (formatted) {
          resPreviewPane.appendChild(renderJsonHighlighted(formatted));
        } else {
          resPreviewPane.textContent = '(no preview available)';
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

  function exportCSV(customRows) {
    const cols = state.columns.filter((c) => c.visible);
    const esc = (s) => {
      s = String(s == null ? '' : s);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const header = cols.map((c) => esc(c.label)).join(',');
    const lines = [header];
    const rows = customRows || getExportRows();
    for (const r of rows) {
      const arr = [];
      for (const c of cols) {
        let v = r[c.id];
        if (c.id === 'size') v = fmtBytes(r.size);
        else if (c.id === 'duration') v = fmtTime(r.duration);
        else if (c.id === 'initiator') v = r.initiator ? r.initiator.text : '';
        arr.push(esc(v));
      }
      lines.push(arr.join(','));
    }
    const csv = '\ufeff' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'network-plus.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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

    // Global Search Ctrl+F
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        $('#filterInput').focus();
      }
    });

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
    $('#exportCsvBtn').addEventListener('click', exportCSV);
    $('#exportHarBtn').addEventListener('click', exportHAR);

    // [P3] Global Filter — debounced
    const debouncedGlobalFilter = debounce(() => renderBody(), FILTER_DEBOUNCE_MS);
    $('#filterInput').addEventListener('input', (e) => {
      state.globalFilter = e.target.value;
      debouncedGlobalFilter();
    });

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
    };

    const renderColumnsContextMenu = () => {
      columnsContextMenu.textContent = '';
      const currentColCfgs = {};
      state.columns.forEach((c) => {
        currentColCfgs[c.id] = c;
      });

      DEFAULT_COLUMNS.forEach((defaultCol) => {
        const current = currentColCfgs[defaultCol.id] || defaultCol;
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
      if (e.target.closest('.filter-btn') || e.target.closest('.dropdown-content')) return;
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
    pauseBtn.insertAdjacentElement('afterend', autoScrollBtn);

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
      }
    });

    function scrollToSelectedRow() {
      if (!state.selectedRow) return;
      const selectedTr = tableWrap.querySelector(`tr[data-row-id="${state.selectedRow.id}"]`);
      if (selectedTr) selectedTr.scrollIntoView({ block: 'nearest' });
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

      // Highlight/Unhighlight (single row or selected rows)
      const highlightBtn = document.createElement('button');
      highlightBtn.textContent = allHighlighted
        ? targetRows.length > 1
          ? `Unhighlight Selected (${targetRows.length})`
          : 'Unhighlight'
        : targetRows.length > 1
          ? `Highlight Selected (${targetRows.length})`
          : 'Highlight';
      highlightBtn.className = 'context-menu-item';
      highlightBtn.addEventListener('click', () => {
        targetRows.forEach((r) => {
          if (allHighlighted) state.highlightedRows.delete(r);
          else state.highlightedRows.add(r);
        });
        renderBody();
        contextMenu.style.display = 'none';
      });
      contextMenu.appendChild(highlightBtn);

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
          state.highlightedRows = new Set([...state.highlightedRows].filter((r) => state.rows.includes(r)));
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
          state.highlightedRows = new Set([...state.highlightedRows].filter((r) => state.rows.includes(r)));
          state.selectedRows.clear();
          renderBody();
          contextMenu.style.display = 'none';
        });
        contextMenu.appendChild(deleteBtn);

        const exportSelectedBtn = document.createElement('button');
        exportSelectedBtn.textContent = `Export Selected CSV (${selCount})`;
        exportSelectedBtn.className = 'context-menu-item';
        exportSelectedBtn.addEventListener('click', () => {
          exportCSV([...state.selectedRows]);
          contextMenu.style.display = 'none';
        });
        contextMenu.appendChild(exportSelectedBtn);
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

    // Resizer logic
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

    // Network subscription
    if (chrome && chrome.devtools && chrome.devtools.network && chrome.devtools.network.onRequestFinished) {
      chrome.devtools.network.onRequestFinished.addListener((request) => {
        if (state.paused) return;
        const row = buildRowFromRequest(request);
        cacheResponseContent(row); // [U1]
        const wasAtBottom =
          state.autoScroll &&
          tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - SCROLL_THRESHOLD;
        state.rows.push(row);

        // Re-render to keep sort order and advanced filter state consistent.
        renderBody();

        if (wasAtBottom) {
          tableWrap.scrollTop = tableWrap.scrollHeight;
        }
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
    DEFAULT_METHOD_FILTERS,
  };
})();

// Support CommonJS for Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _NetworkPlus;
}
