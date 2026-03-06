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

  const DEFAULT_COLUMNS = [
    { id: 'id', label: 'ID', width: 60, visible: true },
    { id: 'time', label: 'Time', width: 160, visible: true },
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

  // ============================================================
  // Section 4: State Management
  // ============================================================
  const state = {
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    rows: [],
    filteredRows: [], // [U5] cache for filtered rows
    selectedRow: null, // [U5] track by row object reference, not index
    columnFilters: {
      method: DEFAULT_METHOD_FILTERS(),
      status: {},
      type: '',
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
    // [U3] Initiator column: use the text property
    if (colId === 'initiator') {
      return row.initiator ? row.initiator.text : '';
    }
    const v = row[colId];
    return v == null ? '' : String(v);
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

      // Per-column filters
      for (const colId in state.columnFilters) {
        if (colId === 'method') {
          if (state.columnFilters.method[r.method] === false) return false;
        } else if (colId === 'status') {
          const statusFilters = state.columnFilters.status;
          if (Object.keys(statusFilters).length > 0 && statusFilters[r.status] === false) return false;
        } else {
          const filterVal = (state.columnFilters[colId] || '').toLowerCase();
          if (!filterVal) continue;
          const rowVal = getRowFilterValue(r, colId).toLowerCase();
          const filterTokens = filterVal
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t);
          if (filterTokens.length > 0) {
            const match = filterTokens.some((token) => rowVal.indexOf(token) > -1);
            if (!match) return false;
          }
        }
      }
      return true;
    });
  }

  // ============================================================
  // Section 8: Data Model
  // ============================================================
  function buildRowFromRequest(req) {
    const r = {
      _reqObj: req,
      method: (req && req.request && req.request.method) || '',
      url: (req && req.request && req.request.url) || '',
      status: (req && req.response && req.response.status) || 0,
      statusText: (req && req.response && req.response.statusText) || '',
      type: (req && req.response && req.response.content && req.response.content.mimeType) || '',
      protocol: req && req.response && req.response.httpVersion ? String(req.response.httpVersion).toUpperCase() : '',
      size:
        (req && req.response && (req.response.bodySize || (req.response.content && req.response.content.size))) || 0,
      timeText: (req && req.startedDateTime) || '',
      duration: (req && req.time) || 0,
      startedDateTime: (req && req.startedDateTime) || '',
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
      valEl.textContent = item.value || '';
      grid.appendChild(keyEl);
      grid.appendChild(valEl);
    }
    return grid;
  }

  function createHeaderSection(title, headers) {
    if (!headers || headers.length === 0) return null;
    const frag = document.createDocumentFragment();
    const strong = document.createElement('strong');
    strong.textContent = title;
    frag.appendChild(strong);
    frag.appendChild(createKvGrid(headers));
    return frag;
  }

  // ============================================================
  // Section 10: Table Row Creation (shared) [Q2]
  // ============================================================
  function createTableRow(row, onClick) {
    const tr = document.createElement('tr');
    tr.addEventListener('click', onClick);
    tr.dataset.rowId = row.id;

    if (state.selectedRow === row) tr.classList.add('selected');
    if (row.method) {
      const method = row.method.toUpperCase();
      if (HTTP_METHODS.indexOf(method) > -1) tr.classList.add('method-' + method);
    }

    const visibleCols = state.columns.filter((c) => c.visible);
    for (const c of visibleCols) {
      const td = document.createElement('td');
      if (c.id === 'method') td.classList.add('method-cell');

      if (c.id === 'initiator') {
        const initiator = row.initiator;
        if (initiator && initiator.url) {
          const link = document.createElement('a');
          link.href = '#';
          link.textContent = initiator.text;
          link.title = initiator.url;
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chrome.devtools.panels.openResource(initiator.url, initiator.lineNumber, () => {});
          });
          td.appendChild(link);
        } else {
          td.textContent = initiator ? initiator.text : '';
        }
      } else {
        let v = row[c.id];
        if (c.id === 'size') v = fmtBytes(row.size);
        else if (c.id === 'time') v = row.timeText || '';
        else if (c.id === 'duration') v = fmtTime(row.duration);
        td.textContent = v == null ? '' : String(v);
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

  function createDropdownFilter(colId, isDynamic) {
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    const content = document.createElement('div');
    content.className = 'filter-dropdown-content dropdown-content';

    function updateBtnText() {
      const currentOpts = state.columnFilters[colId];
      const dynamicKeys = isDynamic
        ? [...new Set(state.rows.map((r) => r[colId]))]
        : Object.keys(state.columnFilters[colId]);
      const hasFalse = dynamicKeys.some((k) => currentOpts[k] === false);
      const enabled = dynamicKeys.filter((k) => currentOpts[k] !== false);
      btn.textContent = hasFalse ? enabled.join(', ') || 'None' : 'All';
    }

    function populateContent() {
      content.textContent = '';
      const currentKeys = isDynamic
        ? [...new Set(state.rows.map((r) => r[colId]))].sort((a, b) => a - b)
        : Object.keys(state.columnFilters[colId]);
      if (currentKeys.length === 0 && isDynamic) {
        const msg = document.createElement('i');
        msg.textContent = 'No options yet';
        content.appendChild(msg);
        return;
      }

      for (const opt of currentKeys) {
        const isChecked = state.columnFilters[colId][opt] !== false;
        const item = createCheckboxItem(String(opt), isChecked, (e) => {
          state.columnFilters[colId][opt] = e.target.checked;
          updateBtnText();
          renderBody();
        });
        content.appendChild(item);
      }
    }

    if (!isDynamic) populateContent();

    btn.addEventListener('click', () => {
      if (isDynamic) populateContent();
      const isShowing = content.classList.contains('show');
      $all('.dropdown-content').forEach((d) => d.classList.remove('show'));
      if (!isShowing) content.classList.add('show');
    });
    updateBtnText();
    dropdown.appendChild(btn);
    dropdown.appendChild(content);
    return dropdown;
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
      th.textContent = c.label;
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

    // Filter row [P3] — debounced column input filters
    const ftr = document.createElement('tr');
    ftr.className = 'filter-row';
    const debouncedRenderBody = debounce(renderBody, FILTER_DEBOUNCE_MS);
    for (const c of state.columns) {
      if (!c.visible) continue;
      const fth = document.createElement('th');
      if (c.id === 'method') {
        fth.appendChild(createDropdownFilter('method', false));
      } else if (c.id === 'status') {
        fth.appendChild(createDropdownFilter('status', true));
      } else {
        const fin = document.createElement('input');
        fin.type = 'text';
        fin.placeholder = 'Filter...';
        fin.dataset.colId = c.id;
        fin.value = state.columnFilters[c.id] || '';
        fin.addEventListener('input', (e) => {
          state.columnFilters[e.target.dataset.colId] = e.target.value;
          debouncedRenderBody();
        });
        fth.appendChild(fin);
      }
      ftr.appendChild(fth);
    }
    thead.appendChild(ftr);
  }

  function renderBody() {
    filterRows();
    const tbody = $('#tbody');
    // [P2] Use DocumentFragment for batch insert
    const frag = document.createDocumentFragment();
    tbody.textContent = '';

    const rows = state.filteredRows;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const tr = createTableRow(row, () => selectRow(row));
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
  // Section 13: Detail Panel [S1][S2][S3] — safe rendering
  // ============================================================
  function createInnerAccordionItem(title, contentEl) {
    const item = document.createElement('div');
    item.className = 'accordion-item active';
    const header = document.createElement('button');
    header.className = 'accordion-header';
    const indicator = document.createElement('span');
    indicator.className = 'indicator';
    header.appendChild(indicator);
    header.appendChild(document.createTextNode(title));
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      item.classList.toggle('active');
    });
    const contentWrap = document.createElement('div');
    contentWrap.className = 'accordion-content';
    contentWrap.appendChild(contentEl);
    item.appendChild(header);
    item.appendChild(contentWrap);
    return item;
  }

  function selectRow(row) {
    state.selectedRow = row;
    renderBody();
    if (!row) return;

    // [U6] Focus the table for keyboard navigation
    const tableWrap = $('#tableWrap');
    if (tableWrap) tableWrap.focus();

    $('#detailsTitle').textContent = (row.method || '') + ' ' + (row.url || '');

    // [S1] Overview — safe DOM creation
    const overviewPane = $('#pane-overview');
    overviewPane.textContent = '';
    overviewPane.appendChild(
      createKvGrid([
        { key: 'ID', value: String(row.id) },
        { key: 'URL', value: row.url || '' },
        { key: 'Method', value: row.method || '' },
        { key: 'Status', value: String(row.status || '') },
        { key: 'Type', value: row.type || '' },
        { key: 'Protocol', value: row.protocol || '' },
        { key: 'Domain', value: row.domain || '' },
        { key: 'Path', value: row.path || '' },
        { key: 'Started', value: row.startedDateTime || '' },
        { key: 'Duration', value: fmtTime(row.duration) },
        { key: 'Size', value: fmtBytes(row.size) },
      ]),
    );

    // [S2] Headers — safe DOM creation
    const headersPane = $('#pane-headers');
    headersPane.textContent = '';
    const reqHeaderSec = createHeaderSection('Request Headers', row.requestHeaders);
    if (reqHeaderSec) headersPane.appendChild(reqHeaderSec);
    const resHeaderSec = createHeaderSection('Response Headers', row.responseHeaders);
    if (resHeaderSec) {
      headersPane.appendChild(document.createElement('br'));
      headersPane.appendChild(resHeaderSec);
    }

    // Request
    const reqPane = $('#pane-request');
    reqPane.textContent = '';
    const reqContent = row.requestPostData
      ? row.requestPostData.text || JSON.stringify(row.requestPostData)
      : '(no body)';
    const copyBtnReq = document.createElement('button');
    copyBtnReq.className = 'copy-btn';
    copyBtnReq.textContent = 'Copy';
    copyBtnReq.addEventListener('click', () => {
      navigator.clipboard.writeText(reqContent).catch((e) => console.error(e));
    });
    const contentNodeReq = document.createElement('div');
    contentNodeReq.textContent = reqContent;
    reqPane.appendChild(copyBtnReq);
    reqPane.appendChild(contentNodeReq);

    // [S3] Timing — safe DOM creation
    const timingPane = $('#pane-timing');
    timingPane.textContent = '';
    const timings = [];
    if (row.timings) {
      for (const key in row.timings) {
        timings.push({ name: key, value: fmtTime(row.timings[key]) });
      }
    }
    if (timings.length > 0) {
      const timingTitle = document.createElement('strong');
      timingTitle.textContent = 'Timing';
      timingPane.appendChild(timingTitle);
      timingPane.appendChild(createKvGrid(timings));
    }

    // Response
    const resPane = $('#pane-response');
    resPane.textContent = '';
    const loadingMsg = document.createElement('span');
    loadingMsg.textContent = '(loading...)';
    resPane.appendChild(loadingMsg);

    if (row._reqObj && typeof row._reqObj.getContent === 'function') {
      row._reqObj.getContent((content, encoding) => {
        resPane.textContent = '';
        let text = content || '(no response body)';
        const nestedAccordion = document.createElement('div');
        nestedAccordion.className = 'nested-accordion';

        if (encoding === 'base64' && row.type && row.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = 'data:' + row.type + ';base64,' + content;
          img.style.maxWidth = '100%';
          nestedAccordion.appendChild(createInnerAccordionItem('Preview', img));

          const rawData = document.createElement('div');
          rawData.textContent = text;
          nestedAccordion.appendChild(createInnerAccordionItem('Raw Data', rawData));
        } else {
          if (encoding === 'base64') {
            try {
              text = atob(content);
            } catch (_e) {
              text = '(could not decode base64 response)';
            }
          }

          const contentNodeRes = document.createElement('div');
          if (text.length > TRUNCATE_LIMIT) {
            const truncatedText = document.createElement('span');
            truncatedText.textContent = text.substring(0, TRUNCATE_LIMIT);
            const showMoreBtn = document.createElement('button');
            showMoreBtn.textContent = '... Show more';
            showMoreBtn.className = 'link-btn';
            showMoreBtn.addEventListener('click', () => {
              contentNodeRes.textContent = text;
            });
            contentNodeRes.appendChild(truncatedText);
            contentNodeRes.appendChild(showMoreBtn);
          } else {
            contentNodeRes.textContent = text;
          }
          nestedAccordion.appendChild(createInnerAccordionItem('Content', contentNodeRes));
        }
        resPane.appendChild(nestedAccordion);

        const copyBtnRes = document.createElement('button');
        copyBtnRes.className = 'copy-btn';
        copyBtnRes.textContent = 'Copy';
        copyBtnRes.addEventListener('click', () => {
          navigator.clipboard.writeText(text).catch((e) => console.error(e));
        });
        resPane.insertBefore(copyBtnRes, resPane.firstChild);
      });
    } else {
      resPane.textContent = '(response body not available)';
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

  function exportCSV() {
    const cols = state.columns.filter((c) => c.visible);
    const esc = (s) => {
      s = String(s == null ? '' : s);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const header = cols.map((c) => esc(c.label)).join(',');
    const lines = [header];
    const rows = getExportRows();
    for (const r of rows) {
      const arr = [];
      for (const c of cols) {
        let v = r[c.id];
        if (c.id === 'size') v = fmtBytes(r.size);
        else if (c.id === 'time') v = r.timeText || '';
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
      state.columnFilters = {
        method: DEFAULT_METHOD_FILTERS(),
        status: {},
        type: '',
      };
      state.nextId = 1;
      state.selectedRow = null;
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
      renderColumnsContextMenu();
      columnsContextMenu.style.left = e.pageX + 'px';
      columnsContextMenu.style.top = e.pageY + 'px';
      columnsContextMenu.style.display = 'block';
    });

    // Accordion
    $all('.accordion-header').forEach((header) => {
      header.addEventListener('click', (e) => {
        e.currentTarget.parentElement.classList.toggle('active');
      });
    });
    $all('.accordion-item').forEach((item) => item.classList.add('active'));

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

        // Incremental append — only if row passes current filters
        filterRows();
        if (state.filteredRows.indexOf(row) > -1) {
          const tr = createTableRow(row, () => selectRow(row));
          $('#tbody').appendChild(tr);
        }
        $('#counter').textContent = state.filteredRows.length + ' requests';

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
  return { fmtBytes, fmtTime, extractUrlParts, formatInitiator, parseQueryString, guessMimeType, toHarHeaders, debounce, getRowFilterValue, DEFAULT_METHOD_FILTERS };
})();

// Support CommonJS for Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _NetworkPlus;
}
