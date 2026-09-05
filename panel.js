/* exported for testing */
/* istanbul ignore next */
const _NetworkPlus = (function () {
  'use strict';

  // ============================================================
  // Section 1: Constants
  // ============================================================
  const MIN_COL_WIDTH = 20;
  const MAX_COL_WIDTH = 1200;
  const DEFAULT_COL_WIDTH = 120;
  const KEYBOARD_RESIZE_STEP = 10;
  const KEYBOARD_RESIZE_LARGE_STEP = 40;
  const MIN_DETAILS_WIDTH = 400;
  const MIN_TABLE_WIDTH = 240;
  const MIN_DETAILS_HEIGHT = 160;
  const MIN_TABLE_HEIGHT = 120;
  const MIN_INSPECTOR_PANE_HEIGHT = 80;
  const RESIZER_WIDTH = 4;
  const INSPECTOR_DIVIDER_HEIGHT = 3;
  const NARROW_PANEL_MAX_WIDTH = 800; // Layout breakpoint: must match the @media (max-width:800px) block in panel.css
  const POPUP_VIEWPORT_MARGIN = 8;
  const ROW_CONTEXT_MENU_X_OFFSET = 16;
  const ROW_CONTEXT_MENU_Y_OFFSET = 24;
  const SEARCH_COLOR_POPUP_GAP = 4;
  const TRANSIENT_POPUP_SELECTOR = '.dropdown-content,.search-scope-popup,.search-color-popup';
  const REQUEST_COUNT_ANNOUNCE_MS = 1000;
  const SEARCH_COUNT_ANNOUNCE_MS = 500;
  const RETENTION_ANNOUNCE_MS = 750;
  // The status bar compacts before the workbench stacks: between 801 and
  // 900px the side-by-side layout is too narrow for the full counter row.
  // Must match the @media (max-width:900px) block in panel.css.
  const STATUS_DETAILS_MEDIA_QUERY = '(max-width: 900px)';
  const DATA_SAFETY_ANNOUNCE_MS = 500;
  const CLEAR_UNDO_TIMEOUT_MS = 10000;
  const COPY_FEEDBACK_DURATION_MS = 1800;
  const SCROLL_THRESHOLD = 10;
  const TRUNCATE_LIMIT = 2000;
  const FILTER_DEBOUNCE_MS = 150;
  const DEEP_SEARCH_DEBOUNCE_MS = 250;
  // Cap on in-pane (detail view) search hits so pathological bodies stay responsive.
  const PANE_SEARCH_MAX_HITS = 1500;
  const LIVE_COMMIT_MAX_WAIT_MS = 250;
  const LIVE_PENDING_HIGH_WATER_MARK = 5000;
  const RESPONSE_CONTENT_TIMEOUT_MS = 10000;
  // Foreground details and HAR work bypass these slots, so the total can be 4 plus distinct foreground operations.
  const AUTOMATIC_RESPONSE_PREFETCH_CONCURRENCY = 4;
  // HAR export resolves missing bodies through this many parallel workers:
  // enough to stop a serial walk from multiplying getContent round-trips
  // into minutes, small enough to bound in-flight body memory.
  const HAR_EXPORT_BODY_CONCURRENCY = 4;
  const AUTOMATIC_RESPONSE_PREFETCH_FAILURE_DEBOUNCE_MS = 750;
  const AUTOMATIC_RESPONSE_PREFETCH_FAILURE_MAX_WAIT_MS = 5000;
  const AUTOMATIC_RESPONSE_PREFETCH_QUEUE_COMPACT_THRESHOLD = 512;
  const DATA_SAFETY_POLICY_VERSION = 1;
  const REDACTION_MARKER = '[REDACTED]';
  const OMISSION_MARKER = '[OMITTED BY NETWORK+]';
  const MAX_SANITIZED_BODY_BYTES = 256 * 1024;
  const MAX_SANITIZED_BODY_DEPTH = 12;
  const MAX_SANITIZED_BODY_NODES = 5000;
  // Retention is unlimited out of the box; this is the limit that applies
  // once a reader turns Unlimited off, and the value the number input starts on.
  const DEFAULT_REQUEST_RETENTION_LIMIT = 20000;
  const MIN_REQUEST_RETENTION_LIMIT = 100;
  const MAX_REQUEST_RETENTION_LIMIT = 100000;
  const MAX_RESPONSE_BODY_BYTES = 1024 * 1024;
  const MAX_RESPONSE_CACHE_BYTES = 32 * 1024 * 1024;
  const MAX_IMPORT_SOURCE_BYTES = 32 * 1024 * 1024;
  const MAX_SAZ_ARCHIVE_ENTRIES = 20000;
  const MAX_SAZ_ENTRY_BYTES = 4 * 1024 * 1024;
  const MAX_SAZ_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
  const MAX_SAZ_CONCURRENT_EXTRACTIONS = 4;
  const SAZ_SOURCE_CHUNK_BYTES = 16 * 1024;
  const SAZ_ENTRY_PATH_PATTERN = /^raw\/(\d+)_([csm])\.(txt|xml)$/;
  const SAMPLE_CAPTURE_BASE_TIMESTAMP = Date.parse('2026-01-15T12:00:00.000Z');
  const SAMPLE_CAPTURE_SIGNATURES = Object.freeze([
    Object.freeze({
      method: 'GET',
      domain: 'api.network-plus.test',
      path: '/v1/projects/demo?view=summary',
      status: 200,
    }),
    Object.freeze({
      method: 'POST',
      domain: 'checkout.network-plus.test',
      path: '/v1/orders/preview',
      status: 503,
    }),
    Object.freeze({
      method: 'GET',
      domain: 'static.network-plus.test',
      path: '/assets/network-plus.css',
      status: 304,
    }),
  ]);
  const SAMPLE_EVIDENCE_SIGNATURE = Object.freeze({
    source: 'sample',
    method: 'POST',
    domain: 'checkout.network-plus.test',
    path: '/v1/orders/preview',
    status: 503,
  });
  const SAMPLE_EVIDENCE_DESTINATIONS = Object.freeze({
    timing: Object.freeze({ tabId: 'res-timing', tabLabel: 'Timing' }),
    headers: Object.freeze({ tabId: 'res-headers', tabLabel: 'Headers' }),
  });
  const JSON_TREE_MAX_CHILDREN = 100;
  const JSON_TREE_MAX_DEPTH = 20;
  const JSON_TREE_PREVIEW_KEYS = 3;
  // Root (0), its children (1) and grandchildren (2) open by default; deeper
  // nodes start folded so a big payload reads as an outline first.
  const JSON_TREE_OPEN_DEPTH = 2;
  // A string past this length, or one carrying a newline, folds to its first line.
  const JSON_TREE_LONG_STRING_CHARS = 120;

  const THEME_KEY = 'networkPlus.theme';
  const LANG_KEY = 'networkPlus.lang';
  const SEARCH_PREFS_KEY = 'networkPlus.searchPrefs';
  const RETENTION_KEY = 'networkPlus.retention.v1';
  const THEMES = ['system', 'dark', 'light'];
  const LANGS = ['system', 'en', 'ja'];
  const COL_PREF_KEY = 'networkPlus.cols';
  // Columns the reader pinned back through "Show anyway". Auto-hide itself is
  // never persisted; only this opt-out is, and it lives beside the column
  // preferences rather than inside them so a stored entry keeps its shape.
  const COL_PIN_KEY = 'networkPlus.colPins.v1';
  const CUSTOM_HEADER_COLUMN_KEY = 'networkPlus.customHeaderColumn.v1';
  // What the custom-header column is called before a header is configured.
  // Matches its DEFAULT_COLUMNS label, and is the one value the row menu
  // translates rather than quoting back.
  const CUSTOM_HEADER_DEFAULT_LABEL = 'Header';
  const DOMAIN_SUMMARY_KEY = 'networkPlus.domainSummary.v1'; // '1' = per-domain summary panel shown
  const DETAILS_WIDTH_KEY = 'networkPlus.detailsWidth.v1'; // dragged side-by-side details pane width in px
  const INSPECTOR_SPLIT_KEY = 'networkPlus.inspectorSplit.v1'; // request/response split percent + collapsed half
  const INSPECTOR_HALVES = ['request', 'response'];
  const COL_PREF_VERSION_KEY = 'networkPlus.cols.v';
  const COL_PREF_VERSION = 4; // Bump when default visibility changes
  const VIEW_PRESET_KEY = 'networkPlus.viewPreset.v1';
  const UNDOCK_HINT_KEY = 'networkPlus.undockHint.v1'; // '1' = mirror tab's undock explainer dismissed for good
  const LEGACY_FILTER_PRESET_KEY = 'networkPlus.filterPresets.v1'; // retired multi-preset store
  const MAX_PRESET_TOTAL_BYTES = 64 * 1024; // 64 KiB — column/filter config only, no traffic data

  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  const STATUS_CLASS_KEYS = Object.freeze(['2xx', '3xx', '4xx', '5xx', 'other']);
  const NUMERIC_COLUMNS = ['id', 'status', 'duration', 'size'];
  const DATE_COLUMNS = ['clientStart', 'serverDone'];
  const DATE_SORT_FIELDS = { clientStart: 'clientStartEpoch', serverDone: 'serverDoneEpoch' };
  const INVALID_REQUEST_EPOCH = Number.MAX_SAFE_INTEGER;
  const TIMING_PHASES = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
  const TIMING_PHASE_GUIDANCE = Object.freeze({
   blocked: Object.freeze({
     label: 'Blocked',
     description: 'Time queued by the browser before the request could begin, such as waiting for a usable connection.',
   }),
   dns: Object.freeze({
     label: 'DNS',
     description: 'Time reported for resolving the request host name before connecting.',
   }),
   connect: Object.freeze({
     label: 'Connect',
     description: 'Time reported to establish the connection. When TLS is separately reported, Network+ removes it here so the phases are not counted twice.',
   }),
   ssl: Object.freeze({
     label: 'TLS (SSL)',
     description: 'Time reported for TLS (SSL) negotiation. It is shown separately from Connect.',
   }),
   send: Object.freeze({
     label: 'Send',
     description: 'Time reported to send the HTTP request bytes.',
   }),
   wait: Object.freeze({
     label: 'Wait (TTFB)',
     description: 'Time waiting for the response to start after sending the request (commonly called TTFB).',
   }),
   receive: Object.freeze({
     label: 'Receive',
     description: 'Time reported to receive the response after its first byte.',
   }),
  });
  const TIMING_EVIDENCE_LIMITATION = 'Browser-observed timing phases help locate reported delay. They do not prove packet loss, cabling or RF faults, or a definitive root cause on the server.';
  const TEST_EXTENSION_VERSION_FALLBACK = '1.13.0';
  const SAFE_SUPPORT_UNKNOWN = 'unknown';
  const SAFE_SUPPORT_OTHER_OS = 'Other/unknown';
  const SAFE_SUPPORT_REVIEW_NOTICE = 'This summary intentionally excludes captured traffic. Review it before posting to a public issue.';
  const MAX_SAFE_SUPPORT_VERSION_COMPONENT = 65535;
  const MAX_SAFE_SUPPORT_EDGE_MAJOR = 999;
  const MAX_SAFE_SUPPORT_USER_AGENT_LENGTH = 512;
  const MAX_SAFE_SUPPORT_BRANDS = 16;
  const SAFE_SUPPORT_OS_FAMILIES = Object.freeze(['Windows', 'macOS', 'Linux', SAFE_SUPPORT_OTHER_OS]);
  const SAFE_SUPPORT_RECORDING_STATES = Object.freeze(['recording', 'paused']);
  const SAFE_SUPPORT_SAMPLE_STATES = Object.freeze(['active', 'inactive']);
  const SAFE_SUPPORT_COLOR_SCHEMES = Object.freeze(['light', 'dark']);
  const SAFE_SUPPORT_MOTION_PREFERENCES = Object.freeze(['reduce', 'no-preference']);
  const OBJECT_URL_REVOKE_DELAY_MS = 1000;
  const SENSITIVE_KEY_NAMES = new Set([
    'authorization',
    'proxyauthorization',
    'cookie',
    'setcookie',
    'password',
    'passwd',
    'pwd',
    'passphrase',
    'token',
    'accesstoken',
    'idtoken',
    'refreshtoken',
    'apikey',
    'clientsecret',
    'signature',
    'sig',
    'key',
    'auth',
    'authcode',
    'code',
    'secret',
    'secretkey',
    'session',
    'sessionid',
    'sessiontoken',
    'sid',
    'credential',
    'credentials',
    'csrf',
    'csrftoken',
    'xsrf',
    'xsrftoken',
    'jwt',
    'samlresponse',
    'assertion',
    'ticket',
    'nonce',
    'state',
    'email',
    'emailaddress',
    'phone',
    'phonenumber',
    'mobile',
    'mobilenumber',
    'address',
    'streetaddress',
    'mailingaddress',
    'ssn',
    'socialsecurity',
    'socialsecuritynumber',
    'taxid',
    'taxidentifier',
    'nationalid',
    'nationalidentifier',
    'birth',
    'birthdate',
    'dateofbirth',
    'dob',
    'name',
    'firstname',
    'lastname',
    'middlename',
    'fullname',
    'displayname',
    'givenname',
    'familyname',
  ]);
  const SAFE_OUTBOUND_HEADER_NAMES = new Set([
    'accept',
    'acceptencoding',
    'allow',
    'cachecontrol',
    'connection',
    'contentencoding',
    'contentlength',
    'contenttype',
    'date',
    'expires',
    'pragma',
    'secfetchdest',
    'secfetchmode',
    'secfetchsite',
    'secfetchuser',
    'te',
    'trailer',
    'transferencoding',
    'upgrade',
    'vary',
  ]);
  const URL_VALUE_HEADER_NAMES = new Set([
    'referer',
    'referrer',
    'location',
    'contentlocation',
    'xoriginalurl',
    'xrewriteurl',
  ]);
  const COMPLEX_URL_HEADER_NAMES = new Set(['link', 'refresh']);
  const REQUEST_CLIPBOARD_ACTIONS = new Set(['requestBody', 'rawRequest', 'curl', 'fetch', 'powershell']);
  const RESPONSE_CLIPBOARD_ACTIONS = new Set(['responseBody', 'rawResponse']);

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

  // Visible defaults sum to 992px: Path (the identifying column) is on the
  // first screen at 1280px with the details pane open, and the whole set fits
  // without horizontal scroll once the pane is closed. Match is a 36px state
  // gutter first (a ✓ chip plus one keyword chip fit without clipping).
  const DEFAULT_COLUMNS = [
    { id: 'match', label: 'Match', width: 36, visible: true },
    { id: 'id', label: 'ID', width: 60, visible: true },
    { id: 'method', label: 'Method', width: 80, visible: true },
    { id: 'status', label: 'Status', width: 70, visible: true },
    { id: 'domain', label: 'Domain', width: 140, visible: true },
    { id: 'path', label: 'Path', width: 260, visible: true },
    { id: 'type', label: 'Type', width: 90, visible: true },
    { id: 'operation', label: 'Operation', width: 150, visible: false },
    { id: 'customHeader', label: 'Header', width: 160, visible: false },
    { id: 'duration', label: 'Duration', width: 80, visible: true },
    { id: 'size', label: 'Size', width: 72, visible: true },
    { id: 'clientStart', label: 'Client start', width: 104, visible: true },
    { id: 'serverDone', label: 'Server done', width: 104, visible: false },
    { id: 'initiator', label: 'Initiator', width: 220, visible: false },
    { id: 'url', label: 'URL', width: 420, visible: false },
    { id: 'waterfall', label: 'Waterfall', width: 200, visible: false },
  ];

  // Elastic auto-hide. When the visible stored widths no longer fit the wrap,
  // columns drop out by priority until the rest fits instead of the grid
  // growing a horizontal scrollbar. P1 is the sentence a row makes — status,
  // method, domain, path — and is never auto-hidden. P2 is the reading aid.
  // P3 goes first. Inside a tier the listed order is the drop order; an
  // optional column the reader enabled themselves is on no list and drops
  // last (they asked for it), right to left in their own column order.
  const COLUMN_PRIORITY_1_IDS = ['status', 'method', 'domain', 'path'];
  const COLUMN_PRIORITY_2_DROP_ORDER = ['id', 'duration', 'size'];
  const COLUMN_PRIORITY_3_DROP_ORDER = ['match', 'clientStart', 'serverDone', 'type'];
  // Path is elastic in both directions: it lends its surplus to a wide wrap
  // and absorbs the deficit of a narrow one down to this floor before any
  // column is auto-hidden, so a squeeze costs width before it costs columns.
  const ELASTIC_PATH_MIN_WIDTH = 120;
  // The order the grid starts in. Named rather than inlined into the state
  // because planForcedVisibleColumnIds protects whatever column it points at:
  // out of the box that is ID, undroppable at every width, and changing this
  // changes which column the auto-hide may never drop.
  const DEFAULT_SORT = { colId: 'id', direction: 'asc' };
  // Hiding a column removes the horizontal scrollbar, which can grow a
  // vertical one and take the width back. Restoring a column therefore asks
  // for more room than hiding it gave up, so the two cannot alternate.
  const AUTO_HIDE_HYSTERESIS_PX = 16;

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

  const DEFAULT_SEARCH_SCOPE = () => ({
    url: true,
    reqBody: true,
    resBody: true,
    reqHeaders: true,
    resHeaders: true,
  });

  const DEFAULT_SEARCH_OPTIONS = () => ({
    caseSensitive: false,
    regex: false,
    wholeWord: false,
  });

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
  // Three chips fit the ID column at its default width; beyond that they are
  // summarised as "+N" and the full list stays in the badge's accessible label.
  const MAX_VISIBLE_KEYWORD_BADGES = 3;
  const SEARCH_COLORS = [
    { name: 'Yellow', cssColor: 'var(--search-yellow)' },
    { name: 'Red', cssColor: 'var(--search-red)' },
    { name: 'Green', cssColor: 'var(--search-green)' },
    { name: 'Blue', cssColor: 'var(--search-blue)' },
    { name: 'Purple', cssColor: 'var(--search-purple)' },
    { name: 'Orange', cssColor: 'var(--search-orange)' },
  ];

  // ============================================================
  // Section 2: DOM Helpers
  // ============================================================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $all = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function getMatchMediaApi() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : null;
  }

  let statusGeneration = 0;
  function setStatus(t, forceAnnouncement) {
    statusGeneration += 1;
    const el = $('#statusText');
    if (!el) return;
    const plan = planStatusAnnouncement(el.textContent, t, forceAnnouncement);
    if (!plan.write) return;
    if (plan.clearFirst) {
      const generation = statusGeneration;
      el.textContent = '';
      queueMicrotask(() => {
        if (statusGeneration === generation) el.textContent = plan.text;
      });
      return;
    }
    el.textContent = plan.text;
  }

  let requestCountAnnouncementTimer = null;
  function queueRequestCountAnnouncement(text) {
    if (requestCountAnnouncementTimer) clearTimeout(requestCountAnnouncementTimer);
    requestCountAnnouncementTimer = setTimeout(() => {
      const el = $('#requestCountStatus');
      if (el && el.textContent !== text) el.textContent = text;
    }, REQUEST_COUNT_ANNOUNCE_MS);
  }

  let searchCountAnnouncementTimer = null;
  function queueSearchCountAnnouncement(text) {
    if (searchCountAnnouncementTimer) clearTimeout(searchCountAnnouncementTimer);
    searchCountAnnouncementTimer = setTimeout(() => {
      const el = $('#searchCountStatus');
      if (el && el.textContent !== text) el.textContent = text;
    }, SEARCH_COUNT_ANNOUNCE_MS);
  }

  let retentionAnnouncementTimer = null;
  function queueRetentionAnnouncement(text) {
    if (retentionAnnouncementTimer) clearTimeout(retentionAnnouncementTimer);
    retentionAnnouncementTimer = setTimeout(() => {
      const el = $('#retentionAnnouncement');
      if (el && el.textContent !== text) el.textContent = text;
    }, RETENTION_ANNOUNCE_MS);
  }

  let dataSafetyAnnouncementTimer = null;
  function queueDataSafetyAnnouncement(text) {
    if (dataSafetyAnnouncementTimer) clearTimeout(dataSafetyAnnouncementTimer);
    dataSafetyAnnouncementTimer = setTimeout(() => {
      const el = $('#dataSafetyStatus');
      if (el && el.textContent !== text) el.textContent = text;
    }, DATA_SAFETY_ANNOUNCE_MS);
  }

  let copyFeedbackTimer = null;
  function showCopyFeedback(message) {
    const toast = $('#copyToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, COPY_FEEDBACK_DURATION_MS);
  }

  function writeClipboardPayload(text, message) {
    return Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => {
        showCopyFeedback(message);
        queueDataSafetyAnnouncement(message);
        return true;
      })
      .catch((_error) => {
        // Shared with the row menu's copy formats, whose status lines are
        // deliberately still English; it translates with them, not here.
        setStatus('Clipboard copy failed. No data was copied.');
        return false;
      });
  }

  let pendingFullOutboundAction = null;
  let dataSafetyDialogTrigger = null;

  function setDataSafetyDialogMode(mode, detail, confirmLabel) {
    const choices = $('#dataSafetyExportChoices');
    const warning = $('#dataSafetyWarning');
    const confirm = $('#dataSafetyConfirmBtn');
    const scope = $('#dataSafetyScope');
    // Export mode decides scope visibility itself (it depends on whether a
    // selection exists); every other mode always hides the chooser.
    if (scope && mode !== 'export') scope.hidden = true;
    choices.hidden = mode !== 'export';
    warning.hidden = mode === 'export';
    confirm.hidden = mode === 'export';
    $('#dataSafetyDialogDetail').textContent = detail;
    if (confirmLabel) confirm.textContent = confirmLabel;
  }

  function showDataSafetyDialog(trigger) {
    const dialog = $('#dataSafetyDialog');
    dataSafetyDialogTrigger = trigger || document.activeElement;
    if (!dialog.open) dialog.showModal();
  }

  function openExportSafetyDialog(trigger) {
    pendingFullOutboundAction = null;
    $('#dataSafetyDialogTitle').textContent = uiText('dataSafetyTitle');
    setDataSafetyDialogMode('export', uiText('dataSafetyExportDetail'), '');
    const scope = $('#dataSafetyScope');
    if (scope) {
      const selectedCount = getSelectedExportRows().length;
      const displayedCount = getExportRows().length;
      // Displayed rows stay the default every time the dialog opens so a
      // leftover selection never silently narrows an export.
      $('#dataSafetyScopeDisplayed').checked = true;
      $('#dataSafetyScopeSelected').checked = false;
      $('#dataSafetyScopeDisplayedCount').textContent = String(displayedCount);
      $('#dataSafetyScopeSelectedCount').textContent = String(selectedCount);
      scope.hidden = selectedCount === 0;
    }
    showDataSafetyDialog(trigger);
    setTimeout(() => $('#dataSafetySanitizedBtn').focus(), 0);
  }

  function readExportScopeChoice() {
    const scope = $('#dataSafetyScope');
    const selectedRadio = $('#dataSafetyScopeSelected');
    return scope && !scope.hidden && selectedRadio && selectedRadio.checked ? 'selected' : 'displayed';
  }

  function requestFullOutboundAction(config) {
    const source = config || {};
    pendingFullOutboundAction =
      typeof source.onConfirm === 'function' ? createOneTimeConfirmationAction(source.onConfirm) : null;
    $('#dataSafetyConfirmBtn').disabled = false;
    $('#dataSafetyDialogTitle').textContent = source.title || uiText('dataSafetyFullDefaultTitle');
    setDataSafetyDialogMode(
      'full',
      source.detail || uiText('dataSafetyFullDefaultDetail'),
      source.confirmLabel || uiText('dataSafetyFullDefaultConfirm'),
    );
    showDataSafetyDialog(source.trigger);
    setTimeout(() => $('#dataSafetyConfirmBtn').focus(), 0);
  }

  function initializeDataSafetyDialog() {
    const dialog = $('#dataSafetyDialog');
    $('#dataSafetyCancelBtn').addEventListener('click', () => dialog.close('cancel'));
    dialog.addEventListener('cancel', () => {
      pendingFullOutboundAction = null;
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('backdrop');
    });
    dialog.addEventListener('close', () => {
      pendingFullOutboundAction = null;
      const trigger = dataSafetyDialogTrigger;
      dataSafetyDialogTrigger = null;
      if (trigger && trigger.focus && trigger.isConnected !== false) trigger.focus();
    });
    $('#dataSafetySanitizedBtn').addEventListener('click', () => {
      const scope = readExportScopeChoice();
      dialog.close('sanitized');
      exportHAR({ mode: 'sanitized', scope });
    });
    $('#dataSafetyCsvBtn').addEventListener('click', () => {
      const scope = readExportScopeChoice();
      dialog.close('csv');
      exportCsv(scope);
    });
    $('#dataSafetyFullBtn').addEventListener('click', () => {
      // The full-HAR warning reuses this dialog, which hides the scope
      // chooser, so the choice is captured before the mode switches.
      const scope = readExportScopeChoice();
      requestFullOutboundAction({
        title: uiText('dataSafetyFullHarTitle'),
        detail: uiText('dataSafetyFullHarDetail'),
        confirmLabel: uiText('dataSafetyFullHarConfirm'),
        trigger: dataSafetyDialogTrigger,
        onConfirm: () => exportHAR({ mode: 'full', confirmed: true, scope }),
      });
    });
    $('#dataSafetyConfirmBtn').addEventListener('click', () => {
      const action = pendingFullOutboundAction;
      pendingFullOutboundAction = null;
      $('#dataSafetyConfirmBtn').disabled = true;
      dialog.close('confirmed');
      if (!action) return;
      Promise.resolve()
        .then(() => action())
        .catch((_error) => {
          setStatus('Full output failed. No data was copied or downloaded.');
        });
    });
  }

  function clampPopupToViewport(popup, x, y) {
    // An inline style outranks the sheet, so writing the viewport width here
    // unconditionally would undo a popup's own bound — the context menu's
    // 420px cap among them. Clearing first also makes the measurement below
    // reflect the stylesheet rather than the previous clamp.
    popup.style.maxWidth = '';
    popup.style.maxHeight = '';
    const styleMaxWidth = parseFloat(window.getComputedStyle(popup).maxWidth);
    const rect = popup.getBoundingClientRect();
    const position = clampPopupPosition(
      x,
      y,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight,
      POPUP_VIEWPORT_MARGIN,
    );
    popup.style.left = position.left + 'px';
    popup.style.top = position.top + 'px';
    popup.style.maxWidth =
      Math.min(position.maxWidth, Number.isFinite(styleMaxWidth) ? styleMaxWidth : Infinity) + 'px';
    popup.style.maxHeight = position.maxHeight + 'px';
  }

  function showPopupAt(popup, x, y, displayValue) {
    popup.classList.add('show');
    popup.style.position = 'fixed';
    popup.style.visibility = 'hidden';
    popup.style.maxWidth = '';
    popup.style.maxHeight = '';
    popup.style.display = displayValue || 'block';
    clampPopupToViewport(popup, x, y);
    popup.style.visibility = '';
  }

  function reclampOpenPopups() {
    $all(TRANSIENT_POPUP_SELECTOR).forEach((popup) => {
      if (window.getComputedStyle(popup).display === 'none') return;
      const rect = popup.getBoundingClientRect();
      clampPopupToViewport(popup, rect.left, rect.top);
    });
  }

  function getPopupFocusableItems(popup, menuOnly) {
    const selector = menuOnly
      ? '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]'
      : 'input:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex="0"]';
    // A collapsed submenu's items are still in the DOM; arrowing onto one the
    // reader cannot see is a dead keystroke, so hidden controls are excluded.
    return $all(selector, popup).filter(
      (element) => element.tabIndex !== -1 && !element.closest('[hidden]'),
    );
  }

  function closeAccessiblePopup(popup, restoreFocus) {
    if (!popup || !popup.classList.contains('show')) return;
    popup.classList.remove('show');
    popup.style.display = 'none';
    const trigger = popup._networkPlusTrigger;
    if (trigger && trigger.hasAttribute && trigger.hasAttribute('aria-expanded')) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    if (restoreFocus) {
      if (typeof popup._networkPlusRestoreFocus === 'function') {
        popup._networkPlusRestoreFocus();
      } else if (trigger && trigger.focus && trigger.isConnected !== false) {
        trigger.focus();
      }
    }
  }

  function closeAllAccessiblePopups(exceptPopup, restoreFocus) {
    $all(TRANSIENT_POPUP_SELECTOR).forEach((popup) => {
      if (popup !== exceptPopup) closeAccessiblePopup(popup, restoreFocus);
    });
  }

  function showAccessiblePopupAt(popup, x, y, trigger, displayValue, restoreFocus) {
    closeAllAccessiblePopups(popup, false);
    popup._networkPlusTrigger = trigger || null;
    popup._networkPlusRestoreFocus = restoreFocus || null;
    if (trigger && trigger.hasAttribute && trigger.hasAttribute('aria-expanded')) {
      trigger.setAttribute('aria-expanded', 'true');
    }
    showPopupAt(popup, x, y, displayValue);
    const menuOnly = popup.getAttribute('role') === 'menu';
    const focusableItems = getPopupFocusableItems(popup, menuOnly);
    if (focusableItems.length > 0) focusableItems[0].focus();
  }

  // Focus restoration for views invoked from a grid row: the row if it still
  // exists, else the first row, else the empty-state action or Clear — the
  // same chain the row context menu uses, so no close path strands keyboard
  // focus on <body>.
  function focusRowOrGridFallback(rowId) {
    const row = rowId ? document.querySelector('tbody tr[data-row-id="' + rowId + '"]') : null;
    const target = row || document.querySelector('tbody tr[data-row-id]');
    if (target) {
      target.focus({ preventScroll: false });
      return;
    }
    const fallbackControl = document.querySelector('.empty-state-action') || $('#clearBtn');
    if (fallbackControl) fallbackControl.focus({ preventScroll: true });
  }

  function installPopupKeyboardSupport(popup) {
    popup.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeAccessiblePopup(popup, true);
        return;
      }
      if (event.key === 'Tab') {
        // Close like Escape (focus returns to the trigger) and let the Tab
        // then advance naturally from there. Leaving the popup open over the
        // grid with the trigger stuck at aria-expanded="true" was worse.
        closeAccessiblePopup(popup, true);
        return;
      }
      if (popup.getAttribute('role') !== 'menu') return;
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const items = getPopupFocusableItems(popup, true);
      const nextIndex = getNextMenuItemIndex(items.indexOf(document.activeElement), items.length, event.key);
      if (nextIndex < 0) return;
      event.preventDefault();
      items[nextIndex].focus();
    });
  }

  function getKeyboardPlatform() {
    const userAgentData =
      typeof navigator === 'undefined' ? null : navigator.userAgentData;
    if (
      userAgentData &&
      typeof userAgentData.platform === 'string' &&
      userAgentData.platform
    ) {
      return userAgentData.platform;
    }
    return typeof navigator !== 'undefined' && typeof navigator.platform === 'string'
      ? navigator.platform
      : '';
  }

  function isEditableShortcutTarget(element) {
    const tagName =
      element && typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    if (element && element.isContentEditable) return true;
    return !!(
      element &&
      typeof element.closest === 'function' &&
      element.closest('[contenteditable]:not([contenteditable="false"])')
    );
  }

  function isClearShortcutBlocked() {
    if (isEditableShortcutTarget(document.activeElement)) return true;
    if (document.querySelector('dialog[open]')) return true;
    return $all(TRANSIENT_POPUP_SELECTOR).some((popup) => popup.classList.contains('show'));
  }

  // ============================================================
  // Section 3: Pure Utility Functions (testable)
  // ============================================================
  function calculateExternalOutlineFootprint(outlineWidth, outlineOffset) {
    const width = Number.parseFloat(outlineWidth);
    if (!Number.isFinite(width) || width <= 0) return 0;
    const offset = Number.parseFloat(outlineOffset);
    return Math.max(0, width + (Number.isFinite(offset) ? offset : 0));
  }

  function clampPopupPosition(x, y, popupWidth, popupHeight, viewportWidth, viewportHeight, margin) {
    const edge = Number.isFinite(margin) && margin >= 0 ? margin : POPUP_VIEWPORT_MARGIN;
    const viewportW = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
    const viewportH = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
    const maxWidth = Math.max(0, viewportW - edge * 2);
    const maxHeight = Math.max(0, viewportH - edge * 2);
    const width = Math.min(Number.isFinite(popupWidth) ? Math.max(0, popupWidth) : 0, maxWidth);
    const height = Math.min(Number.isFinite(popupHeight) ? Math.max(0, popupHeight) : 0, maxHeight);
    const desiredLeft = Number.isFinite(x) ? x : edge;
    const desiredTop = Number.isFinite(y) ? y : edge;
    const rightmostLeft = Math.max(edge, viewportW - edge - width);
    const lowestTop = Math.max(edge, viewportH - edge - height);
    return {
      left: Math.min(Math.max(desiredLeft, edge), rightmostLeft),
      top: Math.min(Math.max(desiredTop, edge), lowestTop),
      maxWidth,
      maxHeight,
    };
  }

  function calculateMainSplit(pointerPosition, totalSize, isNarrow) {
    if (!Number.isFinite(pointerPosition) || !Number.isFinite(totalSize) || totalSize <= RESIZER_WIDTH) {
      return null;
    }
    const primarySize = Math.round(pointerPosition);
    const detailsSize = Math.round(totalSize - primarySize - RESIZER_WIDTH);
    const minPrimary = isNarrow ? MIN_TABLE_HEIGHT : MIN_TABLE_WIDTH;
    const minDetails = isNarrow ? MIN_DETAILS_HEIGHT : MIN_DETAILS_WIDTH;
    if (primarySize < minPrimary || detailsSize < minDetails) return null;
    const availableSize = totalSize - RESIZER_WIDTH;
    return {
      axis: isNarrow ? 'height' : 'width',
      primarySize,
      detailsSize,
      primaryPercent: Math.round((primarySize / availableSize) * 100),
    };
  }

  function adjustMainSplitByKeyboard(currentPrimarySize, totalSize, isNarrow, key, largeStep) {
    const negativeKey = isNarrow ? 'ArrowUp' : 'ArrowLeft';
    const positiveKey = isNarrow ? 'ArrowDown' : 'ArrowRight';
    if (key !== negativeKey && key !== positiveKey) return null;
    const step = largeStep ? KEYBOARD_RESIZE_LARGE_STEP : KEYBOARD_RESIZE_STEP;
    const delta = key === negativeKey ? -step : step;
    return calculateMainSplit(currentPrimarySize + delta, totalSize, isNarrow);
  }

  function calculateInspectorSplit(primarySize, totalSize) {
    if (!Number.isFinite(primarySize) || !Number.isFinite(totalSize) || totalSize <= INSPECTOR_DIVIDER_HEIGHT) {
      return null;
    }
    const requestSize = Math.round(primarySize);
    const responseSize = Math.round(totalSize - requestSize - INSPECTOR_DIVIDER_HEIGHT);
    if (requestSize < MIN_INSPECTOR_PANE_HEIGHT || responseSize < MIN_INSPECTOR_PANE_HEIGHT) return null;
    const availableSize = totalSize - INSPECTOR_DIVIDER_HEIGHT;
    return {
      requestSize,
      responseSize,
      requestPercent: Math.round((requestSize / availableSize) * 100),
    };
  }

  function adjustInspectorSplitByKeyboard(currentRequestSize, totalSize, key, largeStep) {
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
    const step = largeStep ? KEYBOARD_RESIZE_LARGE_STEP : KEYBOARD_RESIZE_STEP;
    const delta = key === 'ArrowUp' ? -step : step;
    return calculateInspectorSplit(currentRequestSize + delta, totalSize);
  }

  // Pure: which half is collapsed after its label is clicked. Only one half
  // may be collapsed at a time, so collapsing the second re-expands the first.
  function planInspectorCollapse(collapsedHalf, clickedHalf) {
    if (!INSPECTOR_HALVES.includes(clickedHalf)) return collapsedHalf || null;
    return collapsedHalf === clickedHalf ? null : clickedHalf;
  }

  // Pure: what a layout change should do with the halves' inline heights.
  // 'clear' hands both halves back to the stylesheet, 'rescale' re-applies the
  // dragged percent against the new height, 'restore' puts the remembered
  // percent back, 'none' leaves an untouched 50/50 alone.
  // The short-pane column (the @container (max-height:480px) block in
  // panel.css) is checked first and wins over everything: there the stylesheet
  // owns both heights, and an inline px height would out-rank its height:auto
  // and paint the request half straight through the response section.
  function planInspectorSplitApplication(state) {
    if (state.columnMode) return 'clear';
    if (state.wasColumnMode) return 'restore';
    if (state.collapsedHalf) return 'clear';
    return state.hasInlineHeight ? 'rescale' : 'none';
  }

  // Pure: the persisted split shape. Anything outside the allow-list (a
  // percent that leaves no room for either pane, an unknown half) degrades
  // to the default so a hand-edited or stale entry cannot wedge the pane.
  function normalizeInspectorSplitPref(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const percent = Number(source.percent);
    return {
      percent: Number.isFinite(percent) && percent > 0 && percent < 100 ? Math.round(percent) : null,
      collapsed: INSPECTOR_HALVES.includes(source.collapsed) ? source.collapsed : null,
    };
  }

  // Pure: the row-state classes createTableRow stamps on a <tr>. The primary
  // selection, a multi-selection, a manual highlight, and a search hit each
  // carry their own look; the current hit adds the keyword-coloured ring.
  function planRowStateClasses(rowState) {
    const classes = [];
    if (rowState.primary) classes.push('selected');
    if (rowState.multi) classes.push('multi-selected');
    if (rowState.highlightColor) classes.push('highlighted-row', rowState.highlightColor);
    if (Number.isInteger(rowState.searchColorIdx)) {
      classes.push('search-match-row', 'search-row-' + rowState.searchColorIdx);
      if (rowState.searchCurrent) classes.push('search-match-current');
    }
    return classes;
  }

  // Pure: the status text to write when the details pane reopens. Only the
  // "closed" notice is replaced, and only by what it displaced; any other
  // message (a sample-capture summary, a copy result) stays untouched.
  function planDetailsReopenStatus(currentText, closedTexts, savedText) {
    if (!Array.isArray(closedTexts) || !closedTexts.includes(currentText)) return null;
    return typeof savedText === 'string' ? savedText : '';
  }

  // Pure: the request a status summary names — method · host · status, with
  // the parts a row lacks left out. Reopening the pane by selecting a row
  // answers "select a request to reopen" with that row, so the bar describes
  // the new selection instead of replaying the message the notice displaced.
  function planRowSelectionStatus(row) {
    const source = row || {};
    const summary = planDetailsSummary(source);
    const parts = [];
    const method = String(source.method || '').trim();
    if (method) parts.push(method);
    const host = splitUrlForTitle(source.url).host;
    if (host) parts.push(host);
    if (summary.status) parts.push(summary.status.text);
    return parts.join(' · ');
  }

  function clampColumnWidth(width) {
    const numericWidth = Number.isFinite(width) ? width : DEFAULT_COL_WIDTH;
    return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(numericWidth)));
  }

  function adjustColumnWidth(currentWidth, key, largeStep) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
    const step = largeStep ? KEYBOARD_RESIZE_LARGE_STEP : KEYBOARD_RESIZE_STEP;
    return clampColumnWidth(currentWidth + (key === 'ArrowLeft' ? -step : step));
  }

  // 1 = never auto-hidden, 2 = dropped after 3, 3 = dropped first.
  function columnAutoHidePriority(colId) {
    if (COLUMN_PRIORITY_1_IDS.includes(colId)) return 1;
    if (COLUMN_PRIORITY_2_DROP_ORDER.includes(colId)) return 2;
    return 3;
  }

  // The width a column still needs once Path has given up everything it may.
  // The fit test runs on these, not on the stored widths, so a narrow wrap
  // squeezes Path first and only then starts dropping columns.
  function minRenderedColumnWidth(column) {
    const width = clampColumnWidth(column ? column.width : DEFAULT_COL_WIDTH);
    return column && column.id === 'path' ? Math.min(width, ELASTIC_PATH_MIN_WIDTH) : width;
  }

  // Pure: which of the reader's visible columns have to step aside for the
  // wrap to fit. Never mutates a column and never looks at the DOM, so the
  // whole policy is testable against a width matrix without a browser.
  // options: { pinnedIds, keepIds, previousHiddenIds, hysteresis }.
  function planAutoHiddenColumns(columns, wrapWidth, options) {
    const opts = options || {};
    const toSet = (value) => (value instanceof Set ? value : new Set(Array.isArray(value) ? value : []));
    const pinnedIds = toSet(opts.pinnedIds);
    const keepIds = toSet(opts.keepIds);
    const previousHiddenIds = toSet(opts.previousHiddenIds);
    const hysteresis = Number.isFinite(opts.hysteresis) ? opts.hysteresis : AUTO_HIDE_HYSTERESIS_PX;
    const visibleColumns = (Array.isArray(columns) ? columns : []).filter((column) => column && column.visible);
    if (!Number.isFinite(wrapWidth) || wrapWidth <= 0) return [];
    // The reader's own pick and the two forced-visible sets are off limits;
    // everything else queues up in drop order.
    const dropRank = (column, index) => {
      const tier = columnAutoHidePriority(column.id);
      const listed = tier === 2
        ? COLUMN_PRIORITY_2_DROP_ORDER.indexOf(column.id)
        : COLUMN_PRIORITY_3_DROP_ORDER.indexOf(column.id);
      return (4 - tier) * 10000 + (listed >= 0 ? listed : 1000 - index);
    };
    const candidates = visibleColumns
      .map((column, index) => ({ column, rank: dropRank(column, index) }))
      .filter(
        (entry) =>
          columnAutoHidePriority(entry.column.id) > 1 &&
          !pinnedIds.has(entry.column.id) &&
          !keepIds.has(entry.column.id),
      )
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.column);
    let remaining = visibleColumns.reduce((sum, column) => sum + minRenderedColumnWidth(column), 0);
    const hiddenIds = [];
    for (const column of candidates) {
      const budget = previousHiddenIds.has(column.id) ? wrapWidth - hysteresis : wrapWidth;
      if (remaining <= budget) continue;
      hiddenIds.push(column.id);
      remaining -= minRenderedColumnWidth(column);
    }
    return hiddenIds;
  }

  // Pure: the columns the grid must go on painting whatever the wrap says,
  // over and above the P1 sentence. Match is the search read-out — the chips
  // have to be somewhere. The sort key is, by definition, the column that
  // explains the row order: drop it and the order has no explanation on
  // screen and none in the accessibility tree either, because the indicator
  // and aria-sort live on the header that went. The set is derived fresh on
  // every re-plan, so sorting by another column releases the previous key in
  // the same breath, and clearing the sort releases it altogether.
  // Out of the box the panel sorts by ID ascending, so ID is the column this
  // rule protects at every width until the reader sorts by something else —
  // intended, and the reason DEFAULT_SORT is pinned by a unit case: the
  // column that explains the order is the one that stays.
  // resizingColId is the column under an active keyboard resize. Dropping it
  // ends the gesture and strands the focus that was stepping its width, which
  // is the opposite of what the re-plan after a keyed step is for.
  function planForcedVisibleColumnIds(sort, searchKeywords, resizingColId) {
    const forcedIds = [];
    if (hasActiveSearchKeywords(searchKeywords)) forcedIds.push('match');
    const sortColId = sort && sort.direction ? sort.colId : null;
    if (sortColId && !forcedIds.includes(sortColId)) forcedIds.push(sortColId);
    if (resizingColId && !forcedIds.includes(resizingColId)) forcedIds.push(resizingColId);
    return forcedIds;
  }

  // The column whose separator has the focus, i.e. the one a keyboard resize
  // is stepping. Read from the focus itself rather than remembered across the
  // re-render that follows a step: that render destroys the separator and
  // builds a new one, and a flag cleared by the old element's own blur would
  // depend on whether that blur arrives before or after the new separator
  // takes the focus. Nothing orders those two.
  function findKeyboardResizeColumnId(activeElement) {
    if (!activeElement || !activeElement.classList || !activeElement.classList.contains('col-resizer')) return null;
    const header = activeElement.closest ? activeElement.closest('th[data-col-id]') : null;
    return header && header.dataset ? header.dataset.colId || null : null;
  }

  // Pure: where a header's focus goes when its own column is no longer
  // painted — the wrap dropped it, or the reader unticked it. Something in
  // the header row has to take it: left alone the browser drops it to <body>
  // and the reader loses their place in the grid entirely. The neighbour to
  // the right is the column that took the missing one's place on screen;
  // with nothing painted to the right, the nearest one to the left does.
  function planHeaderFocusFallbackId(columns, colId, paintedIds) {
    if (!Array.isArray(columns)) return null;
    const painted = paintedIds instanceof Set ? paintedIds : new Set(Array.isArray(paintedIds) ? paintedIds : []);
    const index = columns.findIndex((column) => column && column.id === colId);
    if (index < 0) return null;
    for (let after = index + 1; after < columns.length; after += 1) {
      if (painted.has(columns[after].id)) return columns[after].id;
    }
    for (let before = index - 1; before >= 0; before -= 1) {
      if (painted.has(columns[before].id)) return columns[before].id;
    }
    return null;
  }

  function getAdjacentVisibleColumnId(columns, colId, direction, hiddenIds) {
    if (!Array.isArray(columns) || (direction !== -1 && direction !== 1)) return null;
    const skipped = hiddenIds instanceof Set ? hiddenIds : new Set(Array.isArray(hiddenIds) ? hiddenIds : []);
    // Reorder hops to the neighbour the reader can see, not to one the wrap
    // dropped: an auto-hidden column between the two is simply not there.
    const visibleColumns = columns.filter((column) => column.visible && !skipped.has(column.id));
    const currentIndex = visibleColumns.findIndex((column) => column.id === colId);
    const nextIndex = currentIndex + direction;
    return currentIndex >= 0 && nextIndex >= 0 && nextIndex < visibleColumns.length
      ? visibleColumns[nextIndex].id
      : null;
  }

  function getNextMenuItemIndex(currentIndex, itemCount, key) {
    if (itemCount <= 0) return -1;
    const index = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : 0;
    if (key === 'Home') return 0;
    if (key === 'End') return itemCount - 1;
    if (key === 'ArrowDown') return (index + 1) % itemCount;
    if (key === 'ArrowUp') return (index - 1 + itemCount) % itemCount;
    return index;
  }

  function getAriaSortValue(sort, colId) {
    if (!sort || sort.colId !== colId) return 'none';
    if (sort.direction === 'asc') return 'ascending';
    if (sort.direction === 'desc') return 'descending';
    return 'none';
  }

  function isClearNetworkLogShortcut(event, platform) {
    if (!event || typeof event.key !== 'string') return false;
    if (event.repeat === true || event.isComposing === true) return false;
    if (event.altKey === true || event.shiftKey === true) return false;
    const key = event.key.toLowerCase();
    const isMac = typeof platform === 'string' && platform.toLowerCase().includes('mac');
    return isMac
      ? key === 'k' && event.metaKey === true && event.ctrlKey !== true
      : key === 'l' && event.ctrlKey === true && event.metaKey !== true;
  }

  // Panel-scoped: key events inside the DevTools panel iframe never reach
  // the DevTools application document, so the chord cannot collide with
  // DevTools' own bindings.
  function isPopoutShortcut(event, platform) {
    if (!event || typeof event.key !== 'string') return false;
    if (event.repeat === true || event.isComposing === true) return false;
    if (event.altKey === true || event.shiftKey !== true) return false;
    const key = event.key.toLowerCase();
    const isMac = typeof platform === 'string' && platform.toLowerCase().includes('mac');
    return isMac
      ? key === 'm' && event.metaKey === true && event.ctrlKey !== true
      : key === 'm' && event.ctrlKey === true && event.metaKey !== true;
  }

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

  // Opaque schemes — data:, blob:, about: — parse cleanly but carry no host,
  // and their whole payload lands in pathname with the scheme dropped. Split
  // naively, a local blob renders as a request to the origin embedded in it
  // (blob:https://cdn.example/uuid showed a blank domain and a path reading
  // https://cdn.example/uuid), which is the URL the browser never requested.
  // Naming the scheme as the domain keeps the row honest and, unlike a blank,
  // gives the domain summary and the domain filters something to group on.
  function extractUrlParts(url) {
    try {
      const u = new URL(url);
      const path = u.pathname + (u.search || '');
      return u.host ? { domain: u.host, path } : { domain: u.protocol, path };
    } catch (_e) {
      return { domain: '', path: url };
    }
  }

  // Element ids the panel mints for aria-controls pairs. A counter, not a
  // random string, so the same render produces the same document twice.
  let domIdCounter = 0;
  function nextDomId() {
    domIdCounter += 1;
    return String(domIdCounter);
  }

  // The details header and the URL breakdown need the pieces extractUrlParts
  // folds together: host, pathname without the query, and the parameter count.
  // Opaque schemes keep extractUrlParts' rule (the scheme stands in for the
  // host); an unparsable string becomes a bare pathname so it still renders.
  //
  // The parts are exhaustive: scheme + userinfo + host + pathname + search +
  // hash reconstructs the URL. URL.host drops any credentials, so a row built
  // from host alone rendered — and copied — 'https://creds.example.test/vault'
  // for a request made as 'https://alice:s3cret@creds.example.test/vault'.
  function splitUrlForTitle(url) {
    const raw = String(url == null ? '' : url);
    try {
      const u = new URL(raw);
      const queryCount = Array.from(u.searchParams.keys()).length;
      const hash = u.hash || '';
      const credentials = u.username || u.password ? u.username + (u.password ? ':' + u.password : '') + '@' : '';
      if (u.host) {
        return {
          host: u.host,
          userinfo: credentials,
          pathname: u.pathname,
          search: u.search || '',
          hash,
          queryCount,
          scheme: u.protocol + '//',
        };
      }
      return { host: u.protocol, userinfo: '', pathname: u.pathname, search: u.search || '', hash, queryCount, scheme: '' };
    } catch (_e) {
      return { host: '', userinfo: '', pathname: raw, search: '', hash: '', queryCount: 0, scheme: '' };
    }
  }

  // The largest n in [0, max] whose candidate still measures inside `budget`,
  // or 0 when none does. Every caller builds a candidate that only grows with
  // n, so a bisection is exact and needs no retry.
  function longestFittingLength(max, build, measure, budget) {
    let low = 0;
    let high = Math.max(0, max);
    let best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (measure(build(mid)) <= budget) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }

  // Shortens a pathname to `budget` CSS pixels, measured by `measure`, so the
  // last segment — the endpoint name people scan for — stays whole whenever it
  // fits at all and the head gives way instead. The result is total: it is
  // either the pathname itself or a string carrying a '…', so the header can
  // never assert a URL the request did not have.
  function planTitlePathText(pathname, budget, measure) {
    const text = String(pathname == null ? '' : pathname);
    const limit = Number(budget) || 0;
    if (!text) return text;
    if (limit > 0 && measure(text) <= limit) return text;
    const slash = text.lastIndexOf('/');
    const endpoint = slash > 0 ? text.slice(slash) : text;
    if (slash > 0 && limit > 0 && measure('…' + endpoint) <= limit) {
      const head = longestFittingLength(slash, (n) => text.slice(0, n) + '…' + endpoint, measure, limit);
      return text.slice(0, head) + '…' + endpoint;
    }
    // Not even the endpoint fits: its own head gives way and the leading '…'
    // stays, so a shortened name is never read as the name the request had.
    const kept = longestFittingLength(
      endpoint.length - 1,
      (n) => '…' + endpoint.slice(endpoint.length - n),
      measure,
      limit,
    );
    return '…' + endpoint.slice(endpoint.length - kept);
  }

  // Values without whitespace can only wrap where the renderer is told to;
  // splitting after & ; / lets wrapped lines start at the delimiters instead
  // of mid-token. Text with whitespace already has natural break points.
  function splitAtDelimiters(text) {
    const value = String(text == null ? '' : text);
    if (!value || /\s/.test(value) || !/[&;/]/.test(value)) return [value];
    const segments = [];
    let start = 0;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === '&' || ch === ';' || ch === '/') {
        segments.push(value.slice(start, i + 1));
        start = i + 1;
      }
    }
    if (start < value.length) segments.push(value.slice(start));
    return segments;
  }

  // A list may break after its commas, so a long one wraps as a list instead
  // of running past the pane. Two items read as one datum and stay whole, and
  // text that already has whitespace has break points of its own.
  function splitCommaList(text) {
    const value = String(text == null ? '' : text);
    if (!value || /\s/.test(value)) return [value];
    const items = value.split(',');
    if (items.length < 3) return [value];
    const segments = [];
    items.forEach((item, index) => {
      if (index < items.length - 1) segments.push(item + ',');
      else if (item !== '') segments.push(item);
    });
    return segments;
  }

  // Percent-encoding is how a URL carries a value, not how a reader reads one.
  // The decode is guarded: an isolated '%' makes decodeURIComponent throw, and
  // the token as captured is then the only honest thing to show.
  function decodeQueryValue(value) {
    const raw = String(value == null ? '' : value);
    if (raw.indexOf('%') === -1 && raw.indexOf('+') === -1) return raw;
    try {
      return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch (_e) {
      return raw;
    }
  }

  // The address, split into the pieces a renderer paints separately: the
  // origin, the path, and the query as name/value tokens. `raw` is what the
  // pieces spell out — scheme + userinfo + host + pathname + search + hash
  // reconstructs it exactly — so a row built from this plan shows the string
  // the request used and a selection of that row is still a URL.
  //
  // `decodedSearch` is the reader's version of the query and is deliberately
  // NOT part of that reconstruction: a display that quietly swapped
  // '?next=%2Fdashboard' for '?next=/dashboard' would hand a drag-select a
  // plausible URL the request never made. It is rendered beside the address,
  // labelled, and only when `decodes` says the two really differ.
  //
  // `segmented` therefore requires the reconstruction to be BYTE-IDENTICAL to
  // the source. new URL() normalizes — it lowercases a host, drops a default
  // port, resolves a '..' segment — and a Query parameter arrives already
  // decoded by searchParams, so 'https://CB.Example.TEST:443/return' painted
  // itself as 'https://cb.example.test/return': an address the request never
  // used, with nothing on screen saying so. When the parts cannot spell the
  // source back, the caller renders `raw` and the reader sees the token.
  function planSegmentedUrl(url) {
    const parts = splitUrlForTitle(url);
    const raw = String(url == null ? '' : url);
    const reconstruction = parts.scheme + parts.userinfo + parts.host + parts.pathname + parts.search + parts.hash;
    const tokens = [];
    if (parts.host && parts.scheme && parts.search.length > 1) {
      for (const piece of parts.search.slice(1).split('&')) {
        const eq = piece.indexOf('=');
        const name = eq === -1 ? piece : piece.slice(0, eq);
        const value = eq === -1 ? '' : piece.slice(eq + 1);
        const decoded = decodeQueryValue(value);
        tokens.push({ raw: piece, name, value, decoded, hasValue: eq !== -1, decodes: decoded !== value });
      }
    }
    return {
      raw,
      reconstructs: reconstruction === raw,
      segmented: !!(parts.host && parts.scheme) && reconstruction === raw,
      scheme: parts.scheme,
      userinfo: parts.userinfo,
      host: parts.host,
      pathname: parts.pathname,
      search: parts.search,
      hash: parts.hash,
      queryCount: parts.queryCount,
      tokens,
      decodes: tokens.some((token) => token.decodes),
      decodedSearch: tokens.length
        ? '?' + tokens.map((token) => (token.hasValue ? token.name + '=' + token.decoded : token.name)).join('&')
        : '',
    };
  }

  // A parameter whose value is itself a query string ('utm_source=x&utm_id=7').
  // Two named pairs at minimum, so a lone 'a=b' is just a value with an '='.
  const NESTED_QUERY_VALUE_RE = /^[\w.-]+=[^&]*(&[\w.-]+=[^&]*)+$/;

  function isNestedQueryValue(value) {
    return NESTED_QUERY_VALUE_RE.test(String(value == null ? '' : value));
  }

  // The pairs inside such a value, decoded once more: the Query tab's values
  // arrive already decoded by searchParams, so what is nested inside them
  // carries a second layer of encoding.
  function parseNestedQueryValue(value) {
    if (!isNestedQueryValue(value)) return [];
    return String(value)
      .split('&')
      .map((piece) => {
        const eq = piece.indexOf('=');
        return { name: piece.slice(0, eq), value: decodeQueryValue(piece.slice(eq + 1)) };
      });
  }

  // A value that is an absolute http(s) address — a redirect target, a
  // callback, a beacon — earns the segmented rendering the URL row uses.
  function isAbsoluteHttpUrl(value) {
    try {
      const parsed = new URL(String(value == null ? '' : value));
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.host;
    } catch (_e) {
      return false;
    }
  }

  const KV_CLAMP_CHARS = 240;

  function planKvValue(value) {
    const text = value == null ? '' : String(value);
    return {
      text,
      chars: text.length,
      clamped: text.length > KV_CLAMP_CHARS,
      segments: splitAtDelimiters(text),
    };
  }

  // Opaque values (tokens, ids, cookies, URLs) read better in a monospace
  // face where every glyph is a column; prose-like values stay proportional.
  const MONO_VALUE_KEYS = new Set([
    'url',
    'authorization',
    'cookie',
    'setcookie',
    'etag',
    'ifnonematch',
    'xrequestid',
    'traceparent',
  ]);
  const MONO_VALUE_MIN_CHARS = 40;

  function isMonoValue(key, value) {
    const normalizedKey = normalizeSensitiveKey(String(key == null ? '' : key).replace(/\s*#\d+$/, ''));
    if (normalizedKey && MONO_VALUE_KEYS.has(normalizedKey)) return true;
    const text = value == null ? '' : String(value);
    return text.length > MONO_VALUE_MIN_CHARS && !/\s/.test(text);
  }

  // One line of response facts the tabs never hide: status, media type, size,
  // duration, protocol, GraphQL operation, and the one header that explains
  // the status (Retry-After, Location, or the WWW-Authenticate scheme).
  function planDetailsSummary(row) {
    const source = row || {};
    const status = Number(source.status);
    const hasStatus = Number.isInteger(status) && status > 0;
    const statusText = String(source.statusText || '').trim();
    const responseHeaders = Array.isArray(source.responseHeaders) ? source.responseHeaders : [];
    const contentTypeHeader = getHeaderValue(responseHeaders, 'content-type').split(';')[0].trim();
    const rowType = source.type && source.type !== 'x-unknown' ? String(source.type) : '';
    let chip = null;
    if (hasStatus) {
      if (status === 429 || status === 503) {
        const retryAfter = getHeaderValue(responseHeaders, 'retry-after').trim();
        if (retryAfter) chip = { name: 'Retry-After', value: retryAfter };
      } else if (status >= 300 && status < 400) {
        const location = getHeaderValue(responseHeaders, 'location').trim();
        if (location) chip = { name: 'Location', value: location };
      } else if (status === 401) {
        const scheme = getHeaderValue(responseHeaders, 'www-authenticate').trim().split(/[\s,]/)[0];
        if (scheme) chip = { name: 'WWW-Authenticate', value: scheme };
      }
    }
    return {
      status: hasStatus
        ? {
            code: status,
            text: statusText ? status + ' ' + statusText : String(status),
            statusClass: classifyStatusClass(status),
          }
        : null,
      contentType: contentTypeHeader || rowType,
      size: fmtBytes(source.size),
      duration: fmtTime(source.duration),
      protocol: String(source.protocol || ''),
      operation: String(source.operation || ''),
      chip,
    };
  }

  // The initiator column links into the Sources panel via openResource, which
  // exists only inside a DevTools window; the pop-out mirror tab renders the
  // same initiator as plain text. Evaluated per render because tests install
  // the chrome mock after this module loads.
  function canOpenDevtoolsResource() {
    return (
      typeof chrome !== 'undefined' &&
      !!chrome.devtools &&
      !!chrome.devtools.panels &&
      typeof chrome.devtools.panels.openResource === 'function'
    );
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

  function getEmptyStateMode(totalRowCount, visibleRowCount) {
    if (!Number.isFinite(totalRowCount) || totalRowCount <= 0) return 'capture';
    if (!Number.isFinite(visibleRowCount) || visibleRowCount <= 0) return 'filtered';
    return 'hidden';
  }

  function getGridControlTabIndex(totalRowCount, visibleRowCount) {
    return getEmptyStateMode(totalRowCount, visibleRowCount) === 'capture' ? -1 : 0;
  }

  function planSampleCaptureTransition(currentState, action) {
    const current = currentState || {};
    const active = current.active === true;
    const paused = current.paused === true;
    const previousPaused = current.previousPaused === true;
    const rowCount = Number.isInteger(current.rowCount) && current.rowCount > 0 ? current.rowCount : 0;
    if (action === 'enter') {
      if (active || rowCount !== 0) {
        return { active, paused, previousPaused, changed: false };
      }
      return { active: true, paused: true, previousPaused: paused, changed: true };
    }
    if (action === 'exit') {
      if (!active) return { active, paused, previousPaused, changed: false };
      return { active: false, paused: previousPaused, previousPaused: false, changed: true };
    }
    return { active, paused, previousPaused, changed: false };
  }

  function formatSampleCaptureRemainingStatus(rowCount) {
    const count = Number.isInteger(rowCount) && rowCount > 0 ? rowCount : 0;
    return (
      'Local sample capture: ' +
      count +
      ' synthetic ' +
      (count === 1 ? 'request remains.' : 'requests remain.') +
      ' Live recording is paused; Clear exits sample mode.'
    );
  }

  function planSampleCaptureExit(options) {
    const context = options || {};
    const rows = Array.isArray(context.rows) ? context.rows : [];
    const unavailable = (reason) => ({ available: false, reason, rows: [] });
    if (context.sampleCaptureActive !== true) return unavailable('sample-inactive');
    if (rows.length !== SAMPLE_CAPTURE_SIGNATURES.length) return unavailable('sample-incomplete');

    const matchedSignatures = new Set();
    for (const row of rows) {
      if (!row || row._captureSource !== 'sample') {
        return unavailable('sample-provenance-mismatch');
      }
      const url = extractUrlParts(row.url);
      const signatureIndex = SAMPLE_CAPTURE_SIGNATURES.findIndex(
        (signature) =>
          String(row.method || '').toUpperCase() === signature.method &&
          Number(row.status) === signature.status &&
          url.domain === signature.domain &&
          url.path === signature.path,
      );
      if (signatureIndex < 0 || matchedSignatures.has(signatureIndex)) {
        return unavailable('sample-signature-mismatch');
      }
      matchedSignatures.add(signatureIndex);
    }
    return { available: true, reason: '', rows: rows.slice() };
  }

  function createSampleCaptureRequests(baseTimestamp) {
    const requestedBase = Number.isFinite(baseTimestamp) ? baseTimestamp : SAMPLE_CAPTURE_BASE_TIMESTAMP;
    const base = Number.isFinite(new Date(requestedBase).getTime())
      ? requestedBase
      : SAMPLE_CAPTURE_BASE_TIMESTAMP;
    const startedAt = (offsetMs) => new Date(base + offsetMs).toISOString();
    const successBody = JSON.stringify({
      project: { id: 'demo-project', status: 'ready', requests: 12 },
      source: 'local-sample',
    });
    const failureRequestBody = JSON.stringify({ cartItems: 2, mode: 'sample-preview' });
    const failureBody = JSON.stringify({
      error: 'service_unavailable',
      retryAfterSeconds: 30,
      source: 'local-sample',
    });

    return [
      {
        startedDateTime: startedAt(0),
        time: 184,
        request: {
          method: 'GET',
          url: 'https://api.network-plus.test/v1/projects/demo?view=summary',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Accept', value: 'application/json' },
            { name: 'X-NetworkPlus-Sample', value: 'local-only' },
          ],
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Content-Type', value: 'application/json; charset=utf-8' },
            { name: 'Content-Length', value: String(successBody.length) },
            { name: 'Cache-Control', value: 'no-store' },
          ],
          bodySize: successBody.length,
          content: {
            size: successBody.length,
            mimeType: 'application/json',
            text: successBody,
          },
        },
        timings: { blocked: 3, dns: 12, connect: 38, ssl: 20, send: 2, wait: 112, receive: 17 },
        initiator: {
          type: 'script',
          stack: {
            callFrames: [
              {
                functionName: 'loadProjectSummary',
                url: 'https://app.network-plus.test/assets/app.js',
                lineNumber: 18,
              },
            ],
          },
        },
      },
      {
        startedDateTime: startedAt(500),
        time: 2450,
        request: {
          method: 'POST',
          url: 'https://checkout.network-plus.test/v1/orders/preview',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Accept', value: 'application/json' },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'X-NetworkPlus-Sample', value: 'local-only' },
          ],
          postData: {
            mimeType: 'application/json',
            text: failureRequestBody,
          },
        },
        response: {
          status: 503,
          statusText: 'Service Unavailable',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Content-Type', value: 'application/json; charset=utf-8' },
            { name: 'Content-Length', value: String(failureBody.length) },
            { name: 'Cache-Control', value: 'no-store' },
            { name: 'Retry-After', value: '30' },
          ],
          bodySize: failureBody.length,
          content: {
            size: failureBody.length,
            mimeType: 'application/json',
            text: failureBody,
          },
        },
        timings: { blocked: 5, dns: 30, connect: 120, ssl: 50, send: 15, wait: 2200, receive: 80 },
        initiator: {
          type: 'script',
          stack: {
            callFrames: [
              {
                functionName: 'previewOrder',
                url: 'https://app.network-plus.test/assets/app.js',
                lineNumber: 64,
              },
            ],
          },
        },
      },
      {
        startedDateTime: startedAt(3500),
        time: 24,
        request: {
          method: 'GET',
          url: 'https://static.network-plus.test/assets/network-plus.css',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Accept', value: 'text/css,*/*;q=0.1' },
            { name: 'If-None-Match', value: '"network-plus-sample-v1"' },
            { name: 'X-NetworkPlus-Sample', value: 'local-only' },
          ],
        },
        response: {
          status: 304,
          statusText: 'Not Modified',
          httpVersion: 'HTTP/2',
          headers: [
            { name: 'Content-Type', value: 'text/css; charset=utf-8' },
            { name: 'Cache-Control', value: 'public, max-age=3600' },
            { name: 'ETag', value: '"network-plus-sample-v1"' },
            { name: 'Age', value: '840' },
          ],
          bodySize: 0,
          content: {
            size: 0,
            mimeType: 'text/css',
            text: '',
          },
        },
        timings: { blocked: 1, dns: -1, connect: -1, ssl: -1, send: 1, wait: 20, receive: 2 },
        initiator: { type: 'parser' },
      },
    ];
  }

  function deriveSampleGuideEvidence(requests) {
    const source = Array.isArray(requests) ? requests : [];
    const failedRequest = source.find((entry) => {
      const status = entry && entry.response ? Number(entry.response.status) : NaN;
      return Number.isFinite(status) && status >= 400;
    });
    if (!failedRequest) return null;

    const request = failedRequest.request || {};
    const response = failedRequest.response || {};
    const timing = calculateTimingSegments(failedRequest.timings, failedRequest.time);
    const dominant = timing.segments.reduce((largest, segment) => {
      if (!segment.available) return largest;
      return !largest || segment.duration > largest.duration ? segment : largest;
    }, null);
    const retryHeader = (response.headers || []).find(
      (header) => String((header && header.name) || '').toLowerCase() === 'retry-after',
    );
    const phaseGuidance = dominant ? getTimingPhaseGuidance(dominant.label) : null;

    return {
      method: String(request.method || ''),
      path: extractUrlParts(request.url).path,
      status: Number(response.status),
      totalDurationMs: Number.isFinite(failedRequest.time) ? failedRequest.time : timing.total,
      dominantPhase: dominant ? dominant.label : '',
      dominantPhaseLabel: phaseGuidance ? phaseGuidance.label : dominant ? dominant.label : '',
      dominantDurationMs: dominant ? dominant.duration : 0,
      retryHeaderName: retryHeader ? String(retryHeader.name || '') : '',
      retryAfter: retryHeader ? String(retryHeader.value == null ? '' : retryHeader.value) : '',
      limitation: TIMING_EVIDENCE_LIMITATION,
    };
  }

  function isSampleEvidenceTargetRow(row) {
    if (!row || row._captureSource !== SAMPLE_EVIDENCE_SIGNATURE.source) return false;
    const url = extractUrlParts(row.url);
    return (
      String(row.method || '').toUpperCase() === SAMPLE_EVIDENCE_SIGNATURE.method &&
      Number(row.status) === SAMPLE_EVIDENCE_SIGNATURE.status &&
      url.domain === SAMPLE_EVIDENCE_SIGNATURE.domain &&
      url.path === SAMPLE_EVIDENCE_SIGNATURE.path
    );
  }

  function planSampleEvidenceNavigation(options) {
    const context = options || {};
    const destination = SAMPLE_EVIDENCE_DESTINATIONS[context.destination];
    const unavailable = (reason) => ({
      available: false,
      reason,
      targetRow: null,
      tabId: destination ? destination.tabId : null,
      tabLabel: destination ? destination.tabLabel : '',
      blockingFilterIds: [],
    });
    if (!destination) return unavailable('unsupported-destination');
    if (context.sampleCaptureActive !== true) return unavailable('sample-inactive');

    const rows = Array.isArray(context.rows) ? context.rows : [];
    const targetRows = rows.filter(isSampleEvidenceTargetRow);
    if (targetRows.length === 0) return unavailable('target-unavailable');
    if (targetRows.length > 1) return unavailable('target-ambiguous');
    const targetRow = targetRows[0];

    const columns = Array.isArray(context.columns) ? context.columns : [];
    const filterRules =
      context.columnFilterRules && typeof context.columnFilterRules === 'object'
        ? context.columnFilterRules
        : {};
    const blockingFilterIds = [];
    for (const column of columns) {
      const colId = column && column.id;
      if (isVisualOnlyColumn(colId)) continue;
      const rule = colId ? filterRules[colId] : null;
      if (!rule) continue;
      const value = getRowFilterValue(targetRow, colId);
      const isNumeric = NUMERIC_COLUMNS.includes(colId);
      if (!evaluateFilterRule(value, rule, isNumeric)) blockingFilterIds.push(colId);
    }

    return {
      available: true,
      reason: '',
      targetRow,
      tabId: destination.tabId,
      tabLabel: destination.tabLabel,
      blockingFilterIds,
    };
  }

  function serializeFilterState(columnFilterRules) {
    // Deep-clone filter rules to a plain JSON-safe object.
    // Never includes captured network data (URLs, headers, bodies).
    try {
      return JSON.parse(JSON.stringify(columnFilterRules));
    } catch (_e) {
      return {};
    }
  }

  function deserializeFilterState(raw) {
    // Validate and return a safe filter-rules object.
    // Unknown keys are dropped; missing keys are filled from defaults.
    const defaults = DEFAULT_COLUMN_FILTER_RULES();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
    const result = {};
    for (const colId of Object.keys(defaults)) {
      const r = raw[colId];
      if (r && typeof r === 'object' && !Array.isArray(r)) {
        // Shallow-clone, keeping only JSON-scalar children safe for storage.
        try {
          result[colId] = JSON.parse(JSON.stringify(r));
        } catch (_e) {
          result[colId] = defaults[colId];
        }
      } else {
        result[colId] = defaults[colId];
      }
    }
    return result;
  }

  function planSampleCaptureFilterTransition(currentRules, previousRules, action) {
    if (action === 'enter') {
      return {
        columnFilterRules: DEFAULT_COLUMN_FILTER_RULES(),
        previousColumnFilterRules: deserializeFilterState(serializeFilterState(currentRules)),
      };
    }
    if (action === 'exit') {
      return {
        columnFilterRules: deserializeFilterState(serializeFilterState(previousRules)),
        previousColumnFilterRules: null,
      };
    }
    return {
      columnFilterRules: deserializeFilterState(serializeFilterState(currentRules)),
      previousColumnFilterRules: previousRules
        ? deserializeFilterState(serializeFilterState(previousRules))
        : null,
    };
  }

  function normalizeViewPreset(raw) {
    // Validate a stored view preset into { columns: {id: boolean}, filterRules }.
    // Unknown column ids and non-boolean visibility values are dropped; filter
    // rules pass through the known serializer/deserializer to strip foreign keys.
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const columns = {};
    if (raw.columns && typeof raw.columns === 'object' && !Array.isArray(raw.columns)) {
      for (const def of DEFAULT_COLUMNS) {
        if (typeof raw.columns[def.id] === 'boolean') columns[def.id] = raw.columns[def.id];
      }
    }
    return {
      columns,
      filterRules: serializeFilterState(deserializeFilterState(raw.filterRules ?? {})),
    };
  }

  function getExtensionVersion(runtimeApi) {
    const runtime = runtimeApi === undefined
      ? (typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime : null)
      : runtimeApi;
    try {
      const manifest = runtime && typeof runtime.getManifest === 'function' ? runtime.getManifest() : null;
      if (manifest && typeof manifest.version === 'string' && manifest.version.trim()) {
        return manifest.version.trim();
      }
    } catch (_error) {
      // Node tests use the fallback below; extension pages report unknown if the runtime API fails.
    }
    return typeof module !== 'undefined' && module.exports ? TEST_EXTENSION_VERSION_FALLBACK : 'unknown';
  }

  function normalizeSafeSupportVersion(value) {
    if (typeof value !== 'string') return SAFE_SUPPORT_UNKNOWN;
    const match = value.trim().match(/^\d{1,5}(?:\.\d{1,5}){0,3}$/);
    if (!match) return SAFE_SUPPORT_UNKNOWN;
    const components = match[0].split('.').map(Number);
    if (components.some((component) => component > MAX_SAFE_SUPPORT_VERSION_COMPONENT)) {
      return SAFE_SUPPORT_UNKNOWN;
    }
    return components.join('.');
  }

  function normalizeSafeSupportEdgeMajor(value) {
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text !== 'string' || !/^\d{1,3}$/.test(text)) return SAFE_SUPPORT_UNKNOWN;
    const major = Number(text);
    if (!Number.isInteger(major) || major < 1 || major > MAX_SAFE_SUPPORT_EDGE_MAJOR) {
      return SAFE_SUPPORT_UNKNOWN;
    }
    return String(major);
  }

  function parseEdgeMajor(userAgentData, userAgent) {
    let brands = [];
    if (userAgentData && typeof userAgentData === 'object') {
      try {
        if (Array.isArray(userAgentData.brands)) {
          brands = userAgentData.brands.slice(0, MAX_SAFE_SUPPORT_BRANDS);
        }
      } catch (_error) {
        brands = [];
      }
    }
    for (const entry of brands) {
      try {
        if (!entry || entry.brand !== 'Microsoft Edge') continue;
        const version = entry.version;
        const versionMatch =
          typeof version === 'string'
            ? version.match(/^([1-9]\d{0,2})(?:\.\d{1,5}){0,3}$/)
            : null;
        const major = normalizeSafeSupportEdgeMajor(versionMatch ? versionMatch[1] : version);
        if (major !== SAFE_SUPPORT_UNKNOWN) return major;
      } catch (_error) {
        // Ignore malformed brand records and continue to the bounded UA fallback.
      }
    }

    const boundedUserAgent =
      typeof userAgent === 'string' ? userAgent.slice(0, MAX_SAFE_SUPPORT_USER_AGENT_LENGTH) : '';
    const fallback = boundedUserAgent.match(/\bEdg\/([1-9]\d{0,2})(?:\.|\s|$)/);
    return fallback ? normalizeSafeSupportEdgeMajor(fallback[1]) : SAFE_SUPPORT_UNKNOWN;
  }

  function parseOsFamily(userAgentData, userAgent) {
    let platform = '';
    if (userAgentData && typeof userAgentData === 'object') {
      try {
        platform = typeof userAgentData.platform === 'string' ? userAgentData.platform : '';
      } catch (_error) {
        platform = '';
      }
    }
    const normalizedPlatform = platform.trim().toLowerCase();
    if (normalizedPlatform === 'windows') return 'Windows';
    if (normalizedPlatform === 'macos') return 'macOS';
    if (normalizedPlatform === 'linux') return 'Linux';
    if (normalizedPlatform) return SAFE_SUPPORT_OTHER_OS;

    const boundedUserAgent =
      typeof userAgent === 'string' ? userAgent.slice(0, MAX_SAFE_SUPPORT_USER_AGENT_LENGTH) : '';
    if (/(?:Android|CrOS|iPhone|iPad|iPod)/i.test(boundedUserAgent)) return SAFE_SUPPORT_OTHER_OS;
    if (/Windows NT/i.test(boundedUserAgent)) return 'Windows';
    if (/(?:Macintosh|Mac OS X)/i.test(boundedUserAgent)) return 'macOS';
    if (/(?:X11;\s*)?Linux/i.test(boundedUserAgent)) return 'Linux';
    return SAFE_SUPPORT_OTHER_OS;
  }

  function readSupportMediaPreferences(matchMediaApi) {
    const readMatch = (query) => {
      if (typeof matchMediaApi !== 'function') return null;
      try {
        const result = matchMediaApi(query);
        return result && typeof result.matches === 'boolean' ? result.matches : null;
      } catch (_error) {
        return null;
      }
    };
    const prefersDark = readMatch('(prefers-color-scheme: dark)');
    const prefersLight = readMatch('(prefers-color-scheme: light)');
    const reducesMotion = readMatch('(prefers-reduced-motion: reduce)');
    const keepsMotion = readMatch('(prefers-reduced-motion: no-preference)');
    return {
      colorScheme: prefersDark === true ? 'dark' : prefersLight === true ? 'light' : SAFE_SUPPORT_UNKNOWN,
      reducedMotion:
        reducesMotion === true
          ? 'reduce'
          : keepsMotion === true
            ? 'no-preference'
            : SAFE_SUPPORT_UNKNOWN,
    };
  }

  function readSafeSupportPrimitive(source, key) {
    try {
      const value = source[key];
      return ['string', 'number', 'boolean'].includes(typeof value) ? value : undefined;
    } catch (_error) {
      return undefined;
    }
  }

  function buildSafeSupportSummary(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const rawVersion = readSafeSupportPrimitive(source, 'version');
    const rawEdgeMajor = readSafeSupportPrimitive(source, 'edgeMajor');
    const rawOsFamily = readSafeSupportPrimitive(source, 'osFamily');
    const rawTheme = readSafeSupportPrimitive(source, 'theme');
    const rawRetentionPolicy = readSafeSupportPrimitive(source, 'retentionPolicy');
    const rawRetentionLimit = readSafeSupportPrimitive(source, 'retentionLimit');
    const rawRecording = readSafeSupportPrimitive(source, 'recording');
    const rawLocalSample = readSafeSupportPrimitive(source, 'localSample');
    const rawColorScheme = readSafeSupportPrimitive(source, 'colorScheme');
    const rawReducedMotion = readSafeSupportPrimitive(source, 'reducedMotion');
    const version = normalizeSafeSupportVersion(rawVersion);
    const edgeMajor = normalizeSafeSupportEdgeMajor(rawEdgeMajor);
    const osFamily = SAFE_SUPPORT_OS_FAMILIES.includes(rawOsFamily)
      ? rawOsFamily
      : SAFE_SUPPORT_OTHER_OS;
    const theme = THEMES.includes(rawTheme) ? rawTheme : SAFE_SUPPORT_UNKNOWN;
    const recording = SAFE_SUPPORT_RECORDING_STATES.includes(rawRecording)
      ? rawRecording
      : SAFE_SUPPORT_UNKNOWN;
    const localSample = SAFE_SUPPORT_SAMPLE_STATES.includes(rawLocalSample)
      ? rawLocalSample
      : SAFE_SUPPORT_UNKNOWN;
    const colorScheme = SAFE_SUPPORT_COLOR_SCHEMES.includes(rawColorScheme)
      ? rawColorScheme
      : SAFE_SUPPORT_UNKNOWN;
    const reducedMotion = SAFE_SUPPORT_MOTION_PREFERENCES.includes(rawReducedMotion)
      ? rawReducedMotion
      : SAFE_SUPPORT_UNKNOWN;
    let retention = SAFE_SUPPORT_UNKNOWN;
    if (rawRetentionPolicy === 'unlimited') {
      retention = 'unlimited';
    } else if (
      rawRetentionPolicy === 'limited' &&
      Number.isInteger(rawRetentionLimit) &&
      rawRetentionLimit >= MIN_REQUEST_RETENTION_LIMIT &&
      rawRetentionLimit <= MAX_REQUEST_RETENTION_LIMIT
    ) {
      retention = 'limited (' + String(rawRetentionLimit).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' requests)';
    }

    return [
      'Network+ safe support summary',
      'Network+ version: ' + version,
      'Browser: Microsoft Edge ' + edgeMajor,
      'OS family: ' + osFamily,
      'Theme: ' + theme,
      'Retention: ' + retention,
      'Recording: ' + recording,
      'Local sample: ' + localSample,
      'Preferred color scheme: ' + colorScheme,
      'Reduced motion preference: ' + reducedMotion,
      '',
      SAFE_SUPPORT_REVIEW_NOTICE,
    ].join('\n');
  }

  function createObjectUrlRevoker(objectUrl, options) {
    const source = options || {};
    const revoke = typeof source.revoke === 'function'
      ? source.revoke
      : (url) => URL.revokeObjectURL(url);
    const schedule = typeof source.schedule === 'function' ? source.schedule : setTimeout;
    let deferred = false;
    let revoked = false;
    const revokeOnce = () => {
      if (revoked || !objectUrl) return;
      revoked = true;
      revoke(objectUrl);
    };
    return {
      defer() {
        if (deferred || revoked || !objectUrl) return;
        deferred = true;
        try {
          schedule(revokeOnce, OBJECT_URL_REVOKE_DELAY_MS);
        } catch (error) {
          deferred = false;
          revokeOnce();
          throw error;
        }
      },
      revokeOnFailure() {
        if (!deferred) revokeOnce();
      },
    };
  }

  function triggerObjectUrlDownload(objectUrl, filename, options) {
    const source = options || {};
    const createAnchor = typeof source.createAnchor === 'function'
      ? source.createAnchor
      : () => document.createElement('a');
    const revoker = createObjectUrlRevoker(objectUrl, source);
    try {
      const anchor = createAnchor();
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      revoker.defer();
    } finally {
      revoker.revokeOnFailure();
    }
  }

  function createSanitizationSummary() {
    return {
      redactedValues: 0,
      redactedHeaders: 0,
      redactedCookies: 0,
      redactedQueryValues: 0,
      redactedBodyValues: 0,
      redactedMetadataValues: 0,
      sanitizedUrls: 0,
      omittedBodies: 0,
      failures: 0,
      redactedUrlUsernames: 0,
      redactedUrlPasswords: 0,
    };
  }

  function mergeSanitizationSummaries(...summaries) {
    const merged = createSanitizationSummary();
    for (const summary of summaries) {
      if (!summary) continue;
      for (const key of Object.keys(merged)) {
        merged[key] += Number.isFinite(summary[key]) ? summary[key] : 0;
      }
    }
    return merged;
  }

  function normalizeSensitiveKey(name) {
    return String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function isSensitiveKey(name) {
    const key = normalizeSensitiveKey(name);
    if (!key) return false;
    if (SENSITIVE_KEY_NAMES.has(key)) return true;
    return (
      /(?:password|passwd|passphrase)/.test(key) ||
      /(?:token|secret|credential|authorization|authentication|signature|assertion|ticket|nonce|state|session|sid|samlresponse|jwt)$/.test(
        key,
      ) ||
      /(?:birth|birthdate|dateofbirth|dob|ssn|email|phone|mobile|address|socialsecurity|taxid|taxidentifier|nationalid|nationalidentifier|name)$/.test(
        key,
      ) ||
      /^(?:x)?(?:api|client)?(?:auth|authorization|authentication)/.test(key) ||
      /(?:api|secret|private|access|client|encryption|signing)key$/.test(key)
    );
  }

  function sanitizeUrlHeaderValue(rawValue) {
    const source = typeof rawValue === 'string' ? rawValue : '';
    try {
      const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(source);
      if (!absolute && !source.startsWith('/')) throw new Error('unsafe-relative-url');
      const parsed = new URL(source, 'https://network-plus.invalid/');
      const sanitized = sanitizeUrl(parsed.toString());
      if (sanitized.value === OMISSION_MARKER) return sanitized;
      if (absolute) return sanitized;
      const relative = new URL(sanitized.value);
      return {
        value: relative.pathname + relative.search + relative.hash,
        summary: sanitized.summary,
      };
    } catch (_error) {
      return {
        value: REDACTION_MARKER,
        summary: mergeSanitizationSummaries(createSanitizationSummary(), {
          sanitizedUrls: 1,
          failures: 1,
        }),
      };
    }
  }

  function sanitizeHeaders(headers) {
    let summary = createSanitizationSummary();
    const value = Array.isArray(headers)
      ? headers.map((header) => {
        const source = header && typeof header === 'object' ? header : {};
        const name = String(source.name || '');
        const normalizedName = normalizeSensitiveKey(name);
        if (URL_VALUE_HEADER_NAMES.has(normalizedName)) {
          const sanitizedUrl = sanitizeUrlHeaderValue(String(source.value == null ? '' : source.value));
          summary = mergeSanitizationSummaries(summary, sanitizedUrl.summary);
          if (sanitizedUrl.value === REDACTION_MARKER || sanitizedUrl.value === OMISSION_MARKER) {
            summary = mergeSanitizationSummaries(summary, { redactedValues: 1, redactedHeaders: 1 });
            return { name, value: REDACTION_MARKER };
          }
          summary = mergeSanitizationSummaries(summary, {
            redactedHeaders: sanitizedUrl.summary.redactedValues > 0 ? 1 : 0,
          });
          return { name, value: sanitizedUrl.value };
        }
        if (SAFE_OUTBOUND_HEADER_NAMES.has(normalizedName) && !COMPLEX_URL_HEADER_NAMES.has(normalizedName)) {
          return { name, value: String(source.value == null ? '' : source.value) };
        }
        summary = mergeSanitizationSummaries(summary, { redactedValues: 1, redactedHeaders: 1 });
        return { name, value: REDACTION_MARKER };
      })
      : [];
    return { value, summary };
  }

  function sanitizeCookies(cookies) {
    let summary = createSanitizationSummary();
    const knownAttributes = ['path', 'domain', 'expires', 'httpOnly', 'secure', 'sameSite'];
    const value = Array.isArray(cookies)
      ? cookies.map((cookie) => {
        const source = cookie && typeof cookie === 'object' ? cookie : {};
        const sanitized = { name: String(source.name || ''), value: REDACTION_MARKER };
        for (const attribute of knownAttributes) {
          if (Object.prototype.hasOwnProperty.call(source, attribute)) sanitized[attribute] = source[attribute];
        }
        summary = mergeSanitizationSummaries(summary, { redactedValues: 1, redactedCookies: 1 });
        return sanitized;
      })
      : [];
    return { value, summary };
  }

  function sanitizeNamedValues(items) {
    let summary = createSanitizationSummary();
    const value = Array.isArray(items)
      ? items.map((item) => {
        const source = item && typeof item === 'object' ? item : {};
        summary = mergeSanitizationSummaries(summary, { redactedValues: 1, redactedQueryValues: 1 });
        return { name: String(source.name || ''), value: REDACTION_MARKER };
      })
      : [];
    return { value, summary };
  }

  function createUrlSearchParams(value) {
    const holder = new URL('https://network-plus.invalid/');
    holder.search = value ? '?' + value : '';
    return holder.searchParams;
  }

  function sanitizeUrlFragment(fragment) {
    if (/%(?![0-9a-f]{2})/i.test(fragment)) {
      return {
        value: REDACTION_MARKER,
        summary: mergeSanitizationSummaries(createSanitizationSummary(), {
          redactedValues: 1,
          redactedQueryValues: 1,
          failures: 1,
        }),
      };
    }
    const queryIndex = fragment.indexOf('?');
    if (queryIndex >= 0) {
      const route = fragment.slice(0, queryIndex);
      const querySource = fragment.slice(queryIndex + 1);
      const params = createUrlSearchParams(querySource);
      const sanitized = sanitizeNamedValues(Array.from(params.entries(), ([name, value]) => ({ name, value })));
      const next = createUrlSearchParams('');
      for (const item of sanitized.value) next.append(item.name, item.value);
      return { value: route + '?' + next.toString(), summary: sanitized.summary };
    }
    if (fragment.includes('=')) {
      const params = createUrlSearchParams(fragment);
      const sanitized = sanitizeNamedValues(Array.from(params.entries(), ([name, value]) => ({ name, value })));
      const next = createUrlSearchParams('');
      for (const item of sanitized.value) next.append(item.name, item.value);
      return { value: next.toString(), summary: sanitized.summary };
    }
    if (/^\/[a-z0-9._~!$&'()*+,;:@%/-]*$/i.test(fragment)) {
      return { value: fragment, summary: createSanitizationSummary() };
    }
    return {
      value: REDACTION_MARKER,
      summary: mergeSanitizationSummaries(createSanitizationSummary(), {
        redactedValues: 1,
        redactedQueryValues: 1,
      }),
    };
  }

  function sanitizeUrl(rawUrl) {
    const source = typeof rawUrl === 'string' ? rawUrl : '';
    try {
      const parsed = new URL(source);
      let summary = createSanitizationSummary();
      let changed = false;
      if (parsed.username) {
        parsed.username = REDACTION_MARKER;
        summary = mergeSanitizationSummaries(summary, { redactedValues: 1, redactedUrlUsernames: 1 });
        changed = true;
      }
      if (parsed.password) {
        parsed.password = REDACTION_MARKER;
        summary = mergeSanitizationSummaries(summary, { redactedValues: 1, redactedUrlPasswords: 1 });
        changed = true;
      }
      const query = sanitizeNamedValues(
        Array.from(parsed.searchParams.entries(), ([name, value]) => ({ name, value })),
      );
      parsed.search = '';
      for (const item of query.value) parsed.searchParams.append(item.name, item.value);
      if (query.summary.redactedQueryValues > 0) changed = true;
      summary = mergeSanitizationSummaries(summary, query.summary);

      if (parsed.hash) {
        const fragment = sanitizeUrlFragment(parsed.hash.substring(1));
        parsed.hash = fragment.value;
        if (fragment.summary.redactedQueryValues > 0) changed = true;
        summary = mergeSanitizationSummaries(summary, fragment.summary);
      }
      if (changed) summary = mergeSanitizationSummaries(summary, { sanitizedUrls: 1 });
      return { value: parsed.toString(), summary };
    } catch (_error) {
      return {
        value: OMISSION_MARKER,
        summary: mergeSanitizationSummaries(createSanitizationSummary(), {
          sanitizedUrls: 1,
          failures: 1,
        }),
      };
    }
  }

  function normalizeBodyLimits(options) {
    const source = options || {};
    return {
      maxBytes: Number.isInteger(source.maxBytes) && source.maxBytes >= 0
        ? source.maxBytes
        : MAX_SANITIZED_BODY_BYTES,
      maxDepth: Number.isInteger(source.maxDepth) && source.maxDepth >= 0
        ? source.maxDepth
        : MAX_SANITIZED_BODY_DEPTH,
      maxNodes: Number.isInteger(source.maxNodes) && source.maxNodes > 0
        ? source.maxNodes
        : MAX_SANITIZED_BODY_NODES,
    };
  }

  function omittedBody(reason, failures) {
    return {
      text: OMISSION_MARKER,
      encoding: '',
      omitted: true,
      reason,
      summary: mergeSanitizationSummaries(createSanitizationSummary(), {
        omittedBodies: 1,
        failures: failures ? 1 : 0,
      }),
    };
  }

  function sanitizeBody(text, mimeType, encoding, options) {
    const source = typeof text === 'string' ? text : '';
    if (source === '') {
      return { text: '', encoding: '', omitted: false, reason: '', summary: createSanitizationSummary() };
    }
    if (encoding === 'base64') return omittedBody('Base64 content is available only in confirmed full output.', false);
    const limits = normalizeBodyLimits(options);
    if (source.length > limits.maxBytes) {
      return omittedBody('Body exceeded the sanitized output byte limit.', false);
    }
    if (getUtf8ByteLength(source) > limits.maxBytes) {
      return omittedBody('Body exceeded the sanitized output byte limit.', false);
    }
    const normalizedMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
    try {
      if (normalizedMime === 'application/json' || normalizedMime.endsWith('+json')) {
        const parsed = JSON.parse(source);
        let nodeCount = 0;
        let redactedCount = 0;
        const visit = (value, depth) => {
          nodeCount += 1;
          if (nodeCount > limits.maxNodes) throw new Error('node-limit');
          if (depth > limits.maxDepth) throw new Error('depth-limit');
          if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1));
          if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, child]) => {
              if (isSensitiveKey(key)) {
                redactedCount += 1;
                return [key, REDACTION_MARKER];
              }
              return [key, visit(child, depth + 1)];
            }));
          }
          return value;
        };
        const sanitized = visit(parsed, 0);
        return {
          text: JSON.stringify(sanitized),
          encoding: '',
          omitted: false,
          reason: '',
          summary: mergeSanitizationSummaries(createSanitizationSummary(), {
            redactedValues: redactedCount,
            redactedBodyValues: redactedCount,
          }),
        };
      }
      if (normalizedMime === 'application/x-www-form-urlencoded') {
        if (/%(?![0-9a-f]{2})/i.test(source)) return omittedBody('Form body contained invalid percent encoding.', true);
        const params = createUrlSearchParams(source);
        const sanitized = sanitizeNamedValues(
          Array.from(params.entries(), ([name, value]) => ({ name, value })),
        );
        const next = createUrlSearchParams('');
        for (const item of sanitized.value) next.append(item.name, item.value);
        const bodySummary = {
          redactedValues: sanitized.summary.redactedValues,
          redactedBodyValues: sanitized.summary.redactedQueryValues,
        };
        return {
          text: next.toString(),
          encoding: '',
          omitted: false,
          reason: '',
          summary: mergeSanitizationSummaries(createSanitizationSummary(), bodySummary),
        };
      }
      if (normalizedMime.startsWith('multipart/')) {
        return omittedBody('Multipart bodies are omitted from sanitized output.', false);
      }
      return omittedBody('Opaque or unsupported body type was omitted from sanitized output.', false);
    } catch (_error) {
      return omittedBody('Body could not be safely parsed within sanitization limits.', true);
    }
  }

  function getHeaderContentType(headers) {
    const match = (Array.isArray(headers) ? headers : []).find(
      (header) => normalizeSensitiveKey(header && header.name) === 'contenttype',
    );
    return match ? String(match.value || '') : '';
  }

  function sanitizeRequestPostData(postData, requestHeaders, options) {
    if (!postData || typeof postData !== 'object') {
      return { value: null, summary: createSanitizationSummary() };
    }
    const mimeType = postData.mimeType || getHeaderContentType(requestHeaders);
    const body = sanitizeBody(postData.text, mimeType, postData.encoding, options);
    let summary = body.summary;
    const value = { mimeType: String(mimeType || ''), text: body.text };
    if (Array.isArray(postData.params)) {
      const params = sanitizeNamedValues(postData.params);
      value.params = params.value;
      summary = mergeSanitizationSummaries(summary, params.summary);
    }
    if (body.omitted) value._networkPlus = { status: 'omitted', reason: body.reason };
    return { value, summary };
  }

  function sanitizeResponseContent(content, responseHeaders, options) {
    const source = content && typeof content === 'object' ? content : {};
    const mimeType = source.mimeType || getHeaderContentType(responseHeaders);
    const value = {
      size: Number.isFinite(source.size) ? source.size : 0,
      mimeType: String(mimeType || 'application/octet-stream'),
    };
    if (Number.isFinite(source.compression)) value.compression = source.compression;
    if (typeof source.text !== 'string') {
      value._networkPlus = {
        status: 'omitted',
        reason: 'Source content was unavailable; sanitized output is incomplete.',
      };
      return {
        value,
        summary: mergeSanitizationSummaries(createSanitizationSummary(), { omittedBodies: 1 }),
      };
    }
    const body = sanitizeBody(source.text, mimeType, source.encoding, options);
    if (body.omitted) {
      value._networkPlus = { status: 'omitted', reason: body.reason };
    } else {
      value.text = body.text;
    }
    return { value, summary: body.summary };
  }

  function sanitizeNetworkPlusMetadata(metadata, depth = 0) {
    if (depth > MAX_SANITIZED_BODY_DEPTH) {
      return {
        value: OMISSION_MARKER,
        summary: mergeSanitizationSummaries(createSanitizationSummary(), {
          redactedValues: 1,
          redactedMetadataValues: 1,
          failures: 1,
        }),
      };
    }
    if (Array.isArray(metadata)) {
      let summary = createSanitizationSummary();
      const value = metadata.map((item) => {
        const result = sanitizeNetworkPlusMetadata(item, depth + 1);
        summary = mergeSanitizationSummaries(summary, result.summary);
        return result.value;
      });
      return { value, summary };
    }
    if (metadata && typeof metadata === 'object') {
      let summary = createSanitizationSummary();
      const entries = Object.entries(metadata).map(([key, child]) => {
        if (isSensitiveKey(key)) {
          summary = mergeSanitizationSummaries(summary, {
            redactedValues: 1,
            redactedMetadataValues: 1,
          });
          return [key, REDACTION_MARKER];
        }
        if (normalizeSensitiveKey(key).endsWith('url') && typeof child === 'string') {
          const sanitizedUrl = sanitizeUrl(child);
          summary = mergeSanitizationSummaries(summary, sanitizedUrl.summary);
          return [key, sanitizedUrl.value];
        }
        const result = sanitizeNetworkPlusMetadata(child, depth + 1);
        summary = mergeSanitizationSummaries(summary, result.summary);
        return [key, result.value];
      });
      return { value: Object.fromEntries(entries), summary };
    }
    if (typeof metadata === 'string') {
      const safeEnums = new Set(['cached', 'embedded', 'empty', 'evicted', 'omitted', 'unavailable', 'error']);
      if (safeEnums.has(metadata)) return { value: metadata, summary: createSanitizationSummary() };
      return {
        value: REDACTION_MARKER,
        summary: mergeSanitizationSummaries(createSanitizationSummary(), {
          redactedValues: 1,
          redactedMetadataValues: 1,
        }),
      };
    }
    return { value: metadata == null || ['number', 'boolean'].includes(typeof metadata) ? metadata : null, summary: createSanitizationSummary() };
  }

  function createOutboundRowView(source) {
    return {
      id: source.id,
      method: String(source.method || ''),
      url: '',
      status: Number.isFinite(source.status) ? source.status : 0,
      statusText: String(source.statusText || ''),
      type: String(source.type || ''),
      // The operation label is a derived name (GraphQL operationName or
      // JSON-RPC method), never a payload value. Open follow-up, deliberately
      // not settled here: THREE sanitized sinks print it verbatim — this row
      // view (which feeds the sanitized summary and Markdown copies),
      // formatRowMarkdown's Operation field, and formatRowsCsv's operation
      // column — and redacting operationName inside a copied body hides
      // nothing while the query string beside it is copied verbatim and
      // carries the same name.
      operation: String(source.operation || ''),
      protocol: String(source.protocol || ''),
      size: Number.isFinite(source.size) ? source.size : 0,
      duration: Number.isFinite(source.duration) ? source.duration : 0,
      clientStart: String(source.clientStart || ''),
      serverDone: String(source.serverDone || ''),
      domain: '',
      path: '',
      initiator: null,
    };
  }

  function sanitizeClipboardRow(action, row, responseBody, options) {
    const source = row && typeof row === 'object' ? row : {};
    const settings = options || {};
    const dependencies = settings.sanitizers || {};
    const sanitizeUrlValue = dependencies.sanitizeUrl || sanitizeUrl;
    const sanitizeHeaderValues = dependencies.sanitizeHeaders || sanitizeHeaders;
    const sanitizePostData = dependencies.sanitizeRequestPostData || sanitizeRequestPostData;
    const sanitizeBodyValue = dependencies.sanitizeBody || sanitizeBody;
    const value = createOutboundRowView(source);
    let summary = createSanitizationSummary();
    let sanitizedResponseBody = '';

    if (action === 'summary' || action === 'url' || action === 'markdown' || REQUEST_CLIPBOARD_ACTIONS.has(action)) {
      const url = sanitizeUrlValue(source.url || '');
      value.url = url.value;
      const parts = extractUrlParts(url.value);
      value.domain = parts.domain;
      value.path = parts.path;
      summary = mergeSanitizationSummaries(summary, url.summary);
    }
    if (REQUEST_CLIPBOARD_ACTIONS.has(action)) {
      const headers = sanitizeHeaderValues(source.requestHeaders);
      const postData = sanitizePostData(source.requestPostData, source.requestHeaders, settings);
      value.requestHeaders = headers.value;
      value.requestPostData = postData.value;
      summary = mergeSanitizationSummaries(summary, headers.summary, postData.summary);
    }
    if (RESPONSE_CLIPBOARD_ACTIONS.has(action)) {
      const headers = sanitizeHeaderValues(source.responseHeaders);
      const bodySource =
        typeof responseBody === 'string'
          ? responseBody
          : typeof source.responseContent === 'string'
            ? source.responseContent
            : '';
      const body = sanitizeBodyValue(bodySource, guessMimeType(source), source.responseContentEncoding, settings);
      value.responseHeaders = headers.value;
      sanitizedResponseBody = body.text;
      summary = mergeSanitizationSummaries(summary, headers.summary, body.summary);
    }
    return { value, responseBody: sanitizedResponseBody, summary };
  }

  function quoteShell(value) {
    const backslash = String.fromCharCode(92);
    return "'" + String(value == null ? '' : value).replace(/'/g, "'" + backslash + "''") + "'";
  }

  function quotePowerShell(value) {
    return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
  }

  function generateCurl(row) {
    if (!row) return '';
    const parts = ['curl', '--request', quoteShell(row.method || 'GET'), quoteShell(row.url || '')];
    for (const header of row.requestHeaders || []) {
      parts.push('--header', quoteShell(String(header.name || '') + ': ' + String(header.value || '')));
    }
    if (row.requestPostData && typeof row.requestPostData.text === 'string') {
      parts.push('--data-raw', quoteShell(row.requestPostData.text));
    }
    return parts.join(' ');
  }

  function generateFetch(row) {
    if (!row) return '';
    const options = { method: row.method || 'GET' };
    if (Array.isArray(row.requestHeaders) && row.requestHeaders.length > 0) {
      options.headers = row.requestHeaders.map((header) => [String(header.name || ''), String(header.value || '')]);
    }
    if (row.requestPostData && typeof row.requestPostData.text === 'string') {
      options.body = row.requestPostData.text;
    }
    return 'fetch(' + JSON.stringify(row.url || '') + ', ' + JSON.stringify(options, null, 2) + ');';
  }

  function generatePowerShell(row) {
    if (!row) return '';
    const parts = [
      'Invoke-WebRequest',
      '-Uri',
      quotePowerShell(row.url || ''),
      '-Method',
      quotePowerShell(row.method || 'GET'),
    ];
    const uniqueHeaders = new Map();
    for (const header of row.requestHeaders || []) {
      uniqueHeaders.set(String(header.name || ''), String(header.value || ''));
    }
    if (uniqueHeaders.size > 0) {
      const entries = Array.from(uniqueHeaders.entries(), ([name, value]) =>
        quotePowerShell(name) + ' = ' + quotePowerShell(value));
      parts.push('-Headers', '@{ ' + entries.join('; ') + ' }');
    }
    if (row.requestPostData && typeof row.requestPostData.text === 'string') {
      parts.push('-Body', quotePowerShell(row.requestPostData.text));
    }
    return parts.join(' ');
  }

  function isFullOutputAuthorized(policy) {
    return Boolean(policy && policy.mode === 'full' && policy.confirmed === true);
  }

  function createOneTimeConfirmationAction(action) {
    let consumed = false;
    return () => {
      if (consumed || typeof action !== 'function') return undefined;
      consumed = true;
      return action();
    };
  }

  function createOutboundPayload(policy, sanitizedBuilder, fullBuilder) {
    const source = policy || {};
    if (source.mode === 'full') {
      if (!isFullOutputAuthorized(source)) throw new Error('Full output requires per-action confirmation.');
      return fullBuilder();
    }
    return sanitizedBuilder();
  }

  function buildClipboardPayload(action, row, options) {
    const source = options || {};
    const render = (targetRow, responseBody) => {
      if (action === 'summary') return formatRowSummary(targetRow);
      if (action === 'markdown') return formatRowMarkdown(targetRow);
      if (action === 'url') return targetRow.url || '';
      if (action === 'requestBody') return targetRow.requestPostData ? targetRow.requestPostData.text || '' : '';
      if (action === 'responseBody') return responseBody || '';
      if (action === 'rawRequest') return buildRawRequestText(targetRow);
      if (action === 'rawResponse') return buildRawResponseText(targetRow, responseBody);
      if (action === 'curl') return generateCurl(targetRow);
      if (action === 'fetch') return generateFetch(targetRow);
      if (action === 'powershell') return generatePowerShell(targetRow);
      throw new Error('Unsupported clipboard action.');
    };
    return createOutboundPayload(
      source,
      () => {
        const sanitized = sanitizeClipboardRow(action, row, source.responseBody, source);
        return { text: render(sanitized.value, sanitized.responseBody), summary: sanitized.summary, mode: 'sanitized' };
      },
      () => ({
        text: render(row || {}, typeof source.responseBody === 'string' ? source.responseBody : ''),
        summary: createSanitizationSummary(),
        mode: 'full',
      }),
    );
  }

  function buildMultiRowClipboardPayload(rows, action, options, builder) {
    const build = typeof builder === 'function' ? builder : buildClipboardPayload;
    try {
      const text = (Array.isArray(rows) ? rows : [])
        .map((row) => build(action || 'summary', row, options || { mode: 'sanitized' }).text)
        .join('\n\n---\n\n');
      return { ok: true, text };
    } catch (_error) {
      return { ok: false, text: '' };
    }
  }

  function sanitizeHar(har, options) {
    const failClosed = () => {
      const counts = mergeSanitizationSummaries(createSanitizationSummary(), { failures: 1 });
      return {
        log: {
          version: '1.2',
          creator: { name: 'Network+ for DevTools', version: getExtensionVersion() },
          pages: [],
          entries: [],
          _networkPlus: {
            sanitized: true,
            policyVersion: DATA_SAFETY_POLICY_VERSION,
            failedClosed: true,
            redactionMarker: REDACTION_MARKER,
            omissionMarker: OMISSION_MARKER,
            counts,
            bodyCompleteness: 'No entries were exported because sanitization failed closed.',
          },
        },
      };
    };

    try {
      if (!har || !har.log || !Array.isArray(har.log.entries)) return failClosed();
      let summary = createSanitizationSummary();
      const entries = har.log.entries.map((entrySource) => {
        const entry = entrySource && typeof entrySource === 'object' ? entrySource : {};
        const request = entry.request && typeof entry.request === 'object' ? entry.request : {};
        const response = entry.response && typeof entry.response === 'object' ? entry.response : {};
        const url = sanitizeUrl(request.url || '');
        const requestHeaders = sanitizeHeaders(request.headers);
        const responseHeaders = sanitizeHeaders(response.headers);
        const requestCookies = sanitizeCookies(request.cookies);
        const responseCookies = sanitizeCookies(response.cookies);
        const queryString = sanitizeNamedValues(request.queryString);
        const content = sanitizeResponseContent(response.content, response.headers, options);
        summary = mergeSanitizationSummaries(
          summary,
          url.summary,
          requestHeaders.summary,
          responseHeaders.summary,
          requestCookies.summary,
          responseCookies.summary,
          queryString.summary,
          content.summary,
        );

        const sanitizedRequest = {
          method: String(request.method || ''),
          url: url.value,
          httpVersion: String(request.httpVersion || ''),
          cookies: requestCookies.value,
          headers: requestHeaders.value,
          queryString: queryString.value,
          headersSize: Number.isFinite(request.headersSize) ? request.headersSize : -1,
          bodySize: Number.isFinite(request.bodySize) ? request.bodySize : -1,
        };
        if (request.postData && typeof request.postData === 'object') {
          const postData = sanitizeRequestPostData(request.postData, request.headers, options);
          sanitizedRequest.postData = postData.value;
          summary = mergeSanitizationSummaries(summary, postData.summary);
        }

        let redirectURL = '';
        if (response.redirectURL) {
          const redirect = sanitizeUrl(response.redirectURL);
          redirectURL = redirect.value;
          summary = mergeSanitizationSummaries(summary, redirect.summary);
        }
        const sanitizedEntry = {
          pageref: String(entry.pageref || ''),
          startedDateTime: String(entry.startedDateTime || ''),
          time: Number.isFinite(entry.time) ? entry.time : 0,
          request: sanitizedRequest,
          response: {
            status: Number.isFinite(response.status) ? response.status : 0,
            statusText: String(response.statusText || ''),
            httpVersion: String(response.httpVersion || ''),
            cookies: responseCookies.value,
            headers: responseHeaders.value,
            content: content.value,
            redirectURL,
            headersSize: Number.isFinite(response.headersSize) ? response.headersSize : -1,
            bodySize: Number.isFinite(response.bodySize) ? response.bodySize : -1,
          },
          cache: {},
          timings: Object.fromEntries(
            Object.entries(entry.timings || {}).filter(([, value]) => Number.isFinite(value)),
          ),
        };
        if (entry.serverIPAddress) sanitizedEntry.serverIPAddress = REDACTION_MARKER;
        if (entry.connection) sanitizedEntry.connection = String(entry.connection);
        if (entry._networkPlus) {
          const metadata = sanitizeNetworkPlusMetadata(entry._networkPlus);
          sanitizedEntry._networkPlus = metadata.value;
          summary = mergeSanitizationSummaries(summary, metadata.summary);
        }
        // Frame payloads are body-class data: the allowlist above already
        // keeps _webSocketMessages out of sanitized output, and this marker
        // makes the omission visible in the file instead of silent.
        if (Array.isArray(entry._webSocketMessages) && entry._webSocketMessages.length > 0) {
          sanitizedEntry._networkPlus = Object.assign({}, sanitizedEntry._networkPlus, {
            webSocketFramesOmitted: entry._webSocketMessages.length,
          });
        }
        return sanitizedEntry;
      });

      const sourceMetadata = har.log._networkPlus
        ? sanitizeNetworkPlusMetadata(har.log._networkPlus)
        : null;
      if (sourceMetadata) summary = mergeSanitizationSummaries(summary, sourceMetadata.summary);
      const pages = Array.isArray(har.log.pages)
        ? har.log.pages.map((page) => ({
          startedDateTime: String((page && page.startedDateTime) || ''),
          id: String((page && page.id) || ''),
          title: 'Network+',
          pageTimings: Object.fromEntries(
            Object.entries((page && page.pageTimings) || {}).filter(([, value]) => Number.isFinite(value)),
          ),
        }))
        : [];
      const metadata = {
        sanitized: true,
        policyVersion: DATA_SAFETY_POLICY_VERSION,
        failedClosed: false,
        redactionMarker: REDACTION_MARKER,
        omissionMarker: OMISSION_MARKER,
        counts: { ...summary },
        bodyCompleteness: 'Redacted and omitted bodies are explicitly marked and are not complete source content.',
      };
      if (sourceMetadata) metadata.sourceMetadata = sourceMetadata.value;
      return {
        log: {
          version: String(har.log.version || '1.2'),
          creator: { name: 'Network+ for DevTools', version: getExtensionVersion() },
          pages,
          entries,
          _networkPlus: metadata,
        },
      };
    } catch (_error) {
      return failClosed();
    }
  }

  function getRequestEpoch(startedDateTime, fallback) {
    const fallbackEpoch = Number.isFinite(fallback) ? fallback : 0;
    const epoch = typeof startedDateTime === 'number' ? startedDateTime : Date.parse(startedDateTime);
    return Number.isFinite(epoch) ? epoch : fallbackEpoch;
  }

  function compareRequestTimes(a, b, colId) {
    const sortField = DATE_SORT_FIELDS[colId];
    if (!sortField) return 0;
    const aEpoch = getRequestEpoch(a && a[sortField], INVALID_REQUEST_EPOCH);
    const bEpoch = getRequestEpoch(b && b[sortField], INVALID_REQUEST_EPOCH);
    if (aEpoch === bEpoch) return 0;
    return aEpoch < bEpoch ? -1 : 1;
  }

  function calculateTimingSegments(timings, totalDuration) {
    const source = timings || {};
    const segments = TIMING_PHASES.map((label) => {
      const rawDuration = source[label];
      const available = typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration >= 0;
      return { label, duration: available ? rawDuration : 0, available };
    });
    const connect = segments.find((segment) => segment.label === 'connect');
    const ssl = segments.find((segment) => segment.label === 'ssl');
    if (connect.available && ssl.available) {
      connect.duration = Math.max(0, connect.duration - ssl.duration);
    }
    const segmentTotal = segments.reduce((sum, segment) => sum + segment.duration, 0);
    const total = Number.isFinite(totalDuration) && totalDuration >= 0 ? totalDuration : segmentTotal;
    return { total, segments };
  }

  // The Timing pane's table: one row per phase, offset like a waterfall so
  // each row's bar starts where the previous phase ended.
  //
  // Shares are of the SPAN — the greater of the phase sum and the reported
  // duration — never of either alone. calculateTimingSegments can return a
  // total that disagrees with its own segments, because `total` is the row's
  // reported duration and the phases are what the capture recorded: against
  // `total` the shares would not sum to 100, and against the segment sum they
  // would hide the difference. Against the span they always sum to 100, and
  // the part of the reported duration no phase accounts for becomes a row of
  // its own rather than an unexplained gap in the track.
  function planTimingTable(timings, totalDuration) {
    const breakdown = calculateTimingSegments(timings, totalDuration);
    const segmentTotal = breakdown.segments.reduce((sum, segment) => sum + segment.duration, 0);
    const span = Math.max(segmentTotal, breakdown.total, 0);
    const rows = [];
    let offsetPct = 0;
    for (const segment of breakdown.segments) {
      const sharePct = span > 0 ? (segment.duration / span) * 100 : 0;
      rows.push({
        phase: segment.label,
        duration: segment.duration,
        // `available` is the only thing that tells a phase the capture never
        // reported from one it reported as zero, so the row carries it: the
        // two are dimmed alike but they are not the same claim.
        available: segment.available,
        // Muted on the RAW duration, never on the formatted string: fmtTime
        // rounds, so a 0.4 ms phase reads '0 ms' and muting off that text
        // would report a phase that took time as one that took none.
        muted: !segment.available || segment.duration <= 0,
        offsetPct,
        widthPct: sharePct,
        sharePct,
      });
      offsetPct += sharePct;
    }
    const unaccounted = Math.max(0, span - segmentTotal);
    return {
      rows,
      // False when the capture reported no phase at all. Seven rows that each
      // say "not reported" and a bar that is 100% unaccounted state one fact
      // seven times; the table collapses to one line that states it once.
      phasesReported: rows.some((row) => row.available),
      total: breakdown.total,
      segmentTotal,
      span,
      unaccounted,
      // Float residue, not a gap: a remainder under a microsecond is what the
      // subtraction left behind, not time the capture failed to attribute.
      hasUnaccounted: unaccounted > 0.001,
      unaccountedOffsetPct: offsetPct,
      unaccountedSharePct: span > 0 ? (unaccounted / span) * 100 : 0,
      // 100 whenever the phases fit inside the reported duration. Below 100 it
      // is the marker for the other direction — phases that sum past the
      // duration the row reports — which would otherwise be invisible.
      totalSharePct: span > 0 ? (breakdown.total / span) * 100 : 0,
    };
  }

  // Two formatters, one defect class between them: a rendered string that says
  // something its datum does not. fmtTime rounds, so a 0.4 ms phase reads
  // '0 ms'; a 0.04% share reads '0.0%'. Under the resolution each formatter
  // has, the rendering says "below this" rather than a false zero.
  function formatTimingDuration(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
    return ms > 0 && Math.round(ms) === 0 ? uiText('timingDurationSubMs') : fmtTime(ms);
  }

  function formatTimingShare(pct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0) return '';
    return pct > 0 && pct < 0.05 ? uiText('timingShareBelowTenth') : pct.toFixed(1) + '%';
  }

  function getTimingPhaseGuidance(phase) {
   return typeof phase === 'string' ? TIMING_PHASE_GUIDANCE[phase] || null : null;
  }

  function extractCharsetFromContentType(value) {
    if (typeof value !== 'string') return '';
    const match = value.match(/;\s*charset\s*=\s*"?\s*([^";,\s]+)/i);
    return match ? match[1].trim().toLowerCase() : '';
  }

  // Charset declared inside an HTML document head (<meta charset=...> or the
  // http-equiv Content-Type form). Only the ASCII prefix is inspected, so this
  // is safe to run on bytes whose real encoding is still unknown.
  function extractHtmlMetaCharset(prefixText) {
    if (typeof prefixText !== 'string') return '';
    const match = prefixText.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9._-]+)/i);
    return match ? match[1].trim().toLowerCase() : '';
  }

  function isHtmlLikeMime(mime) {
    return typeof mime === 'string' && mime.toLowerCase().indexOf('html') > -1;
  }

  // Returns a TextDecoder for the declared charset, falling back to UTF-8 on
  // unknown labels so decoding never throws for a malformed Content-Type.
  function createBodyTextDecoder(charset) {
    if (charset) {
      try {
        return new TextDecoder(charset);
      } catch (_e) {
        // Unknown encoding label — fall through to UTF-8.
      }
    }
    return new TextDecoder();
  }

  function decodeResponseContent(content, encoding, charset, sniffHtmlMeta) {
    const text = typeof content === 'string' ? content : '';
    if (encoding !== 'base64') return text;
    try {
      const binary = atob(text);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      let resolvedCharset = charset;
      if (!resolvedCharset && sniffHtmlMeta) {
        // Old HTML pages often declare the charset only in <meta>; the binary
        // string is the latin-1 view of the bytes, which is ASCII-transparent.
        resolvedCharset = extractHtmlMetaCharset(binary.slice(0, 1024));
      }
      return createBodyTextDecoder(resolvedCharset).decode(bytes);
    } catch (_e) {
      return '';
    }
  }

  // Whether a decoded body is text at all. TextDecoder substitutes U+FFFD for
  // every byte it cannot interpret, so a GIF pushed through it arrives as
  // `GIF89a` followed by replacement characters and raw control bytes — the
  // mojibake this guard keeps out of the Body and Raw panes.
  //
  // The judgement reads the decoded bytes rather than the declared MIME type on
  // purpose. A network panel meets `x-unknown` and `application/octet-stream`
  // constantly, meets images served under a text type, and meets
  // `image/svg+xml`, which is under `image/` and genuinely is text. Only the
  // bytes settle all three; a MIME allowlist gets at most two of them right.
  const BINARY_BODY_SAMPLE_CHARS = 2048;
  const BINARY_BODY_SUSPICIOUS_RATIO = 0.05;

  function isUndecodableBodyText(text) {
    if (typeof text !== 'string' || text.length === 0) return false;
    const sample =
      text.length > BINARY_BODY_SAMPLE_CHARS ? text.slice(0, BINARY_BODY_SAMPLE_CHARS) : text;
    let suspicious = 0;
    for (let index = 0; index < sample.length; index += 1) {
      const code = sample.charCodeAt(index);
      // NUL carries no meaning in a text payload under any charset.
      if (code === 0) return true;
      const control = code === 0x7f || (code < 0x20 && code !== 9 && code !== 10 && code !== 13);
      if (code === 0xfffd || control) suspicious += 1;
    }
    // A stray bad byte in an otherwise readable page stays readable: the ratio
    // is what separates that from a payload that is bytes all the way down.
    return suspicious / sample.length > BINARY_BODY_SUSPICIOUS_RATIO;
  }

  const HEX_DUMP_BYTES_PER_LINE = 16;
  const HEX_DUMP_MAX_BYTES = 4096;

  // `hexdump -C` layout: offset, two eight-byte hex groups, then the printable
  // gutter. The gutter is what makes a binary body readable at a glance —
  // magic numbers, embedded strings and boundaries all surface there.
  function formatHexDump(bytes, maxBytes) {
    const limit = maxBytes > 0 ? Math.min(bytes.length, maxBytes) : bytes.length;
    const lines = [];
    for (let offset = 0; offset < limit; offset += HEX_DUMP_BYTES_PER_LINE) {
      const end = Math.min(offset + HEX_DUMP_BYTES_PER_LINE, limit);
      const hex = [];
      let ascii = '';
      for (let index = 0; index < HEX_DUMP_BYTES_PER_LINE; index += 1) {
        const position = offset + index;
        if (position >= end) {
          hex.push('  ');
          continue;
        }
        const byte = bytes[position];
        hex.push(byte.toString(16).padStart(2, '0'));
        ascii += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.';
      }
      lines.push(
        offset.toString(16).padStart(8, '0') +
          '  ' +
          hex.slice(0, 8).join(' ') +
          '  ' +
          hex.slice(8).join(' ') +
          '  |' +
          ascii +
          '|',
      );
    }
    return { text: lines.join('\n'), shownBytes: limit, totalBytes: bytes.length };
  }

  // Byte count of a base64 payload without materialising it.
  function base64ByteLength(base64) {
    const clean = typeof base64 === 'string' ? base64.replace(/[\r\n=]+/g, '') : '';
    return Math.floor((clean.length * 3) / 4);
  }

  function buildHarResponseContent(row, responsePayload) {
    const payload = responsePayload || (
      row && typeof row.responseContent === 'string'
        ? {
          content: row.responseContent,
          encoding: row.responseContentEncoding,
        }
        : null
    );
    const content = {
      size: row && row.size ? row.size : 0,
      mimeType: guessMimeType(row || {}),
    };
    if (payload) {
      content.text = payload.content;
      if (payload.encoding === 'base64') content.encoding = 'base64';
    } else {
      content._networkPlus = {
        status: (row && row.responseContentState) || 'unavailable',
        reason: (row && row.responseContentReason) || 'Full response content is unavailable.',
      };
    }
    return content;
  }

  function isValuelessFilterOperator(op) {
    return op === 'empty' || op === 'notempty';
  }

  function isRuleActive(rule) {
    if (!rule) return false;
    if (rule.mode === 'methodSet') {
      return rule.include ? HTTP_METHODS.some((method) => rule.include[method] !== true) : false;
    }
    if (rule.mode === 'statusSet') {
      return rule.include ? Object.values(rule.include).some((value) => value === false) : false;
    }
    if (rule.mode === 'urlAdvanced') {
      return [rule.includeAny, rule.includeAll, rule.excludeAny].some(
        (value) => value != null && String(value).trim() !== '',
      );
    }
    if (rule.mode === 'timeRange') {
      return [rule.start, rule.end].some((value) => value != null && String(value).trim() !== '');
    }
    if (rule.mode === 'multiText') {
      return rule.conditions
        ? rule.conditions.some(
          (condition) =>
            isValuelessFilterOperator(condition && condition.op) ||
            (condition.value != null && String(condition.value).trim() !== ''),
        )
        : false;
    }
    if (isValuelessFilterOperator(rule.op)) return true;
    return rule.value != null && String(rule.value).trim() !== '';
  }

  function countActiveColumnFilters(rules) {
    if (!rules) return 0;
    return Object.entries(rules).filter(
      ([colId, rule]) => !isVisualOnlyColumn(colId) && isRuleActive(rule),
    ).length;
  }

  function isVisualOnlyColumn(colId) {
    return colId === 'waterfall' || colId === 'match';
  }

  function hasActiveSearchKeywords(searchKeywords) {
    return (
      Array.isArray(searchKeywords) &&
      searchKeywords.some((keyword) => keyword && String(keyword.query || '').trim() !== '')
    );
  }

  function preserveMatchingRowIndex(previousMatches, previousIndex, nextMatches) {
    if (!Array.isArray(nextMatches) || nextMatches.length === 0) return -1;
    const previousRow =
      Array.isArray(previousMatches) && previousIndex >= 0 && previousIndex < previousMatches.length
        ? previousMatches[previousIndex]
        : null;
    const preservedIndex = previousRow ? nextMatches.indexOf(previousRow) : -1;
    if (preservedIndex >= 0) return preservedIndex;
    return previousIndex >= 0 ? Math.min(previousIndex, nextMatches.length - 1) : -1;
  }

  function planKeywordSearchNavigation(keywordMatches, currentIndex, direction, globalMatches) {
    if (
      !Array.isArray(keywordMatches) ||
      keywordMatches.length === 0 ||
      !Array.isArray(globalMatches) ||
      globalMatches.length === 0 ||
      (direction !== -1 && direction !== 1)
    ) {
      return null;
    }
    const startIndex =
      Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < keywordMatches.length
        ? currentIndex
        : direction > 0
          ? -1
          : 0;
    const globalIndexes = new Map(globalMatches.map((row, index) => [row, index]));
    for (let offset = 1; offset <= keywordMatches.length; offset++) {
      const keywordIndex =
        (startIndex + direction * offset + keywordMatches.length * offset) % keywordMatches.length;
      const targetRow = keywordMatches[keywordIndex];
      const globalIndex = globalIndexes.get(targetRow);
      if (globalIndex != null) return { targetRow, keywordIndex, globalIndex };
    }
    return null;
  }

  // Persisted search preferences: booleans only (scope flags, match options,
  // matches-only). Keyword texts are never persisted — they can contain
  // sensitive values, and the storage permission is documented as
  // settings-only.
  function normalizeSearchPrefs(raw) {
    const scope = DEFAULT_SEARCH_SCOPE();
    const opt = DEFAULT_SEARCH_OPTIONS();
    const prefs = { scope, options: opt, matchesOnly: false };
    if (!raw || typeof raw !== 'object') return prefs;
    if (raw.scope && typeof raw.scope === 'object') {
      for (const key of Object.keys(scope)) {
        if (typeof raw.scope[key] === 'boolean') scope[key] = raw.scope[key];
      }
    }
    if (raw.options && typeof raw.options === 'object') {
      for (const key of Object.keys(opt)) {
        if (typeof raw.options[key] === 'boolean') opt[key] = raw.options[key];
      }
    }
    if (typeof raw.matchesOnly === 'boolean') prefs.matchesOnly = raw.matchesOnly;
    return prefs;
  }

  // Compile one keyword under the search options into a global RegExp.
  // Literal mode escapes metacharacters; regex mode uses the query verbatim
  // and reports a syntax error instead of throwing. Compiles are memoized —
  // deepSearchMatch runs per row, so per-call compilation would be O(rows).
  const searchQueryCompileCache = new Map();
  function compileSearchQuery(query, options) {
    const opts = options || {};
    const flags = opts.caseSensitive ? 'g' : 'gi';
    const cacheKey =
      (opts.regex ? 'r' : 'l') + (opts.wholeWord ? 'w' : '-') + flags + '\u0000' + query;
    const cached = searchQueryCompileCache.get(cacheKey);
    if (cached) return cached;
    let source = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (opts.wholeWord) source = '\\b(?:' + source + ')\\b';
    let result;
    try {
      result = { regex: new RegExp(source, flags), error: null };
    } catch (error) {
      result = { regex: null, error: error.message };
    }
    if (searchQueryCompileCache.size > 128) searchQueryCompileCache.clear();
    searchQueryCompileCache.set(cacheKey, result);
    return result;
  }

  function planKeywordHighlights(text, keywords, options) {
    const source = text == null ? '' : String(text);
    if (!source || !Array.isArray(keywords) || keywords.length === 0) return [];
    const opts = options || {};

    // One candidate per distinct query (first keyword with a query wins its
    // attribution, matching the previous alternation behavior).
    const candidates = [];
    const seenQueries = new Set();
    for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex++) {
      const keyword = keywords[keywordIndex];
      const query = keyword && keyword.query != null ? String(keyword.query) : '';
      if (!query.trim()) continue;
      const dedupeKey = opts.caseSensitive || opts.regex ? query : query.toLowerCase();
      if (seenQueries.has(dedupeKey)) continue;
      seenQueries.add(dedupeKey);
      candidates.push({ query, colorIdx: keyword.colorIdx, keywordIndex });
    }
    if (candidates.length === 0) return [];

    const collected = [];
    for (const candidate of candidates) {
      const compiled = compileSearchQuery(candidate.query, opts);
      if (compiled.error || !compiled.regex) continue;
      const regex = compiled.regex;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(source)) !== null) {
        if (match[0].length === 0) {
          // Zero-length regex matches (e.g. `a*`) would loop forever and
          // highlight nothing useful — skip and advance.
          regex.lastIndex += 1;
          continue;
        }
        collected.push({
          start: match.index,
          end: match.index + match[0].length,
          colorIdx: candidate.colorIdx,
          keywordIndex: candidate.keywordIndex,
        });
      }
    }
    if (collected.length === 0) return [];

    // Earliest start wins; on a tie the longest match, then the earliest
    // keyword. Overlapping later matches are dropped, like a single
    // longest-first alternation scan would.
    collected.sort(
      (a, b) => a.start - b.start || b.end - a.end || a.keywordIndex - b.keywordIndex,
    );
    const highlights = [];
    let lastEnd = -1;
    for (const entry of collected) {
      if (entry.start < lastEnd) continue;
      highlights.push(entry);
      lastEnd = entry.end;
    }
    return highlights;
  }

  // Rows to render given the matches-only toggle: with an active search and the
  // toggle on, only rows present in matchedRows (a Map or Set keyed by row) stay
  // visible; otherwise the full sorted list is returned unchanged.
  // Describes the request counter so it always reports what the grid is really
  // showing: the denominator is everything captured, the numerator is what
  // survived the column filters and the search, and each narrowing says so.
  function planRequestCountSummary(context) {
    const total = Math.max(0, Number(context && context.totalCount) || 0);
    const shown = Math.max(0, Number(context && context.shownCount) || 0);
    const matched = Math.max(0, Number(context && context.matchedCount) || 0);
    const filters = Math.max(0, Number(context && context.activeFilterCount) || 0);
    const searching = !!(context && context.hasActiveSearch);
    const matchesOnly = !!(context && context.matchesOnly);
    const count = (value) => value.toLocaleString('en-US');

    // Nothing captured yet: narrowing has nothing to describe, so say only that.
    if (total === 0) return { text: '0 requests', accessibleText: '0 requests' };

    const parts = [shown === total ? count(total) + ' requests' : count(shown) + ' / ' + count(total) + ' requests'];
    const spoken = [
      shown === total
        ? count(total) + ' requests'
        : 'showing ' + count(shown) + ' of ' + count(total) + ' requests',
    ];
    if (searching) {
      if (matchesOnly) {
        parts.push('matches only');
        spoken.push('showing search matches only');
      } else {
        parts.push(count(matched) + ' matching');
        spoken.push(count(matched) + ' matching the search');
      }
    }
    if (filters > 0) {
      const label = filters === 1 ? 'column filter' : 'column filters';
      parts.push(count(filters) + ' ' + label);
      spoken.push(count(filters) + ' active ' + label);
    }
    return { text: parts.join(' · '), accessibleText: spoken.join(', ') };
  }

  function planVisibleSearchRows(sortedRows, matchedRows, matchesOnly, hasActiveSearch) {
    const rows = Array.isArray(sortedRows) ? sortedRows : [];
    if (!matchesOnly || !hasActiveSearch) return rows;
    if (!matchedRows || typeof matchedRows.has !== 'function') return rows;
    return rows.filter((row) => matchedRows.has(row));
  }

  // Wrap-around navigation index for a flat match list (detail-pane search).
  function getWrappedMatchIndex(matchCount, currentIndex, direction) {
    if (!Number.isInteger(matchCount) || matchCount <= 0) return -1;
    const step = direction === 'prev' ? -1 : 1;
    const base =
      Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < matchCount
        ? currentIndex
        : direction === 'prev'
          ? 0
          : -1;
    return (base + step + matchCount) % matchCount;
  }

  function shouldRenderSelectedRow(selectedRow, resolvedRow) {
    return !!resolvedRow && selectedRow === resolvedRow;
  }

  function isIncrementalAppendEligible(sort, activeFilterCount, searchKeywords, renderedActiveFilterCount) {
    const hasNaturalOrder =
      !sort || !sort.colId || !sort.direction || (sort.colId === 'id' && sort.direction === 'asc');
    const hasActiveSearch = hasActiveSearchKeywords(searchKeywords);
    const synchronizedFilterCount =
      Number.isFinite(renderedActiveFilterCount) ? renderedActiveFilterCount : activeFilterCount;
    return (
      hasNaturalOrder &&
      activeFilterCount === 0 &&
      activeFilterCount === synchronizedFilterCount &&
      !hasActiveSearch
    );
  }

  function getIncrementalAppendBatch(queuedRows, renderedRowIds) {
    const renderedIds = new Set((renderedRowIds || []).map((id) => String(id)));
    const queuedIds = new Set();
    return (queuedRows || []).filter((row) => {
      if (!row || row.id == null) return false;
      const rowId = String(row.id);
      if (renderedIds.has(rowId) || queuedIds.has(rowId)) return false;
      queuedIds.add(rowId);
      return true;
    });
  }

  function retainRowsByIdentity(candidateRows, currentRows) {
    const currentRowSet = new Set(currentRows || []);
    return (candidateRows || []).filter((row) => currentRowSet.has(row));
  }

  function normalizeRetentionSetting(value) {
    const fallback = { unlimited: true, requestLimit: DEFAULT_REQUEST_RETENTION_LIMIT };
    if (!value || typeof value !== 'object') {
      return { setting: fallback, warning: value == null ? '' : 'Invalid retention setting; restored the default.' };
    }
    if (value.unlimited === true) {
      return { setting: { unlimited: true, requestLimit: DEFAULT_REQUEST_RETENTION_LIMIT }, warning: '' };
    }
    const requestLimit = Number(value.requestLimit);
    if (
      !Number.isInteger(requestLimit) ||
      requestLimit < MIN_REQUEST_RETENTION_LIMIT ||
      requestLimit > MAX_REQUEST_RETENTION_LIMIT
    ) {
      return { setting: fallback, warning: 'Invalid retention setting; restored the unlimited default.' };
    }
    return { setting: { unlimited: false, requestLimit }, warning: '' };
  }

  function getRetentionPresentation(requestLimit, unlimited) {
    const formattedLimit = requestLimit.toLocaleString();
    const buttonLabel = unlimited ? 'Retention: Unlimited' : 'Retention: ' + formattedLimit;
    const policyLabel = unlimited
      ? 'Unlimited requests (warning: memory can grow without bound)'
      : formattedLimit + ' requests';
    return {
      buttonLabel,
      policyLabel,
      accessibleName: unlimited
        ? buttonLabel + '. Open retention settings. Warning: memory can grow without bound'
        : buttonLabel + ' requests. Open retention settings',
    };
  }

  function planClearUndoRetention(heldRows, activeRows, incomingRows, requestLimit, unlimited) {
    const held = Array.isArray(heldRows) ? heldRows : [];
    const active = Array.isArray(activeRows) ? activeRows : [];
    const incoming = Array.isArray(incomingRows) ? incomingRows : [];
    const combined = held.concat(active, incoming);
    const normalizedLimit = Number.isInteger(requestLimit) && requestLimit >= 0 ? requestLimit : 0;
    const evictionCount = unlimited ? 0 : Math.max(0, combined.length - normalizedLimit);
    const evictedRows = combined.slice(0, evictionCount);
    const retainedSet = new Set(combined.slice(evictionCount));
    return {
      retainedHeldRows: held.filter((row) => retainedSet.has(row)),
      retainedActiveRows: active.concat(incoming).filter((row) => retainedSet.has(row)),
      retainedIncomingRows: incoming.filter((row) => retainedSet.has(row)),
      evictedRows,
    };
  }

  function planClearUndoAction(snapshot, action) {
    if (!snapshot) return { disposition: 'none', consume: false };
    if (action === 'undo') return { disposition: 'restore', consume: true };
    if (action === 'live') {
      return snapshot.sampleCaptureActive
        ? { disposition: 'dispose', consume: true }
        : { disposition: 'keep', consume: false };
    }
    if (['clear', 'import', 'sample', 'timeout', 'retention-exhausted'].includes(action)) {
      return { disposition: 'dispose', consume: true };
    }
    return { disposition: 'keep', consume: false };
  }

  function formatRequestCount(count) {
    return count + ' ' + (count === 1 ? 'request' : 'requests');
  }

  function createClearUndoRestorePlan(snapshot, retainedRows) {
    const sourceRows = snapshot && Array.isArray(snapshot.rows) ? snapshot.rows : [];
    const retainedSet = retainedRows instanceof Set ? retainedRows : new Set(retainedRows || []);
    const rows = sourceRows.filter(
      (row) => retainedSet.has(row) && row && row._retentionDisposed !== true,
    );
    const restoredSet = new Set(rows);
    const context = snapshot && snapshot.context ? snapshot.context : {};
    const retainRow = (row) => (restoredSet.has(row) ? row : null);
    const comparedRows =
      Array.isArray(context.comparedRows) &&
      context.comparedRows.length === 2 &&
      context.comparedRows.every((row) => restoredSet.has(row))
        ? context.comparedRows.slice()
        : null;
    const searchScope = DEFAULT_SEARCH_SCOPE();
    for (const key of Object.keys(searchScope)) {
      if (context.searchScope && typeof context.searchScope[key] === 'boolean') {
        searchScope[key] = context.searchScope[key];
      }
    }
    return {
      rows,
      originalCount:
        snapshot && Number.isInteger(snapshot.originalCount) ? snapshot.originalCount : sourceRows.length,
      columnFilterRules: deserializeFilterState(serializeFilterState(context.columnFilterRules)),
      searchKeywords: Array.isArray(context.searchKeywords)
        ? context.searchKeywords.map((keyword) => ({
          query: String((keyword && keyword.query) || ''),
          colorIdx: Number.isInteger(keyword && keyword.colorIdx) ? keyword.colorIdx : 0,
        }))
        : [],
      searchScope,
      searchCurrentRow: retainRow(context.searchCurrentRow),
      searchPerKeywordCurrentRows: Array.isArray(context.searchPerKeywordCurrentRows)
        ? context.searchPerKeywordCurrentRows.filter(
          (entry) => Array.isArray(entry) && entry.length === 2 && restoredSet.has(entry[1]),
        )
        : [],
      selectedRow: retainRow(context.selectedRow),
      focusedRow: retainRow(context.focusedRow),
      selectedRows: retainRowsByIdentity(context.selectedRows || [], rows),
      highlightedRows: Array.isArray(context.highlightedRows)
        ? context.highlightedRows.filter(
          (entry) => Array.isArray(entry) && entry.length === 2 && restoredSet.has(entry[0]),
        )
        : [],
      comparedRows,
      comparisonInvokingRowId: comparedRows ? context.comparisonInvokingRowId || null : null,
      sort: {
        colId: context.sort && context.sort.colId ? context.sort.colId : 'id',
        direction:
          context.sort && ['asc', 'desc', null].includes(context.sort.direction)
            ? context.sort.direction
            : 'asc',
      },
      paused: context.paused === true,
      autoScroll: context.autoScroll !== false,
      sampleCaptureActive: context.sampleCaptureActive === true,
      sampleCapturePreviousPaused: context.sampleCapturePreviousPaused === true,
      sampleCapturePreviousColumnFilterRules: context.sampleCapturePreviousColumnFilterRules
        ? deserializeFilterState(serializeFilterState(context.sampleCapturePreviousColumnFilterRules))
        : null,
      searchPanelVisible: context.searchPanelVisible === true,
      searchMatchesOnly: context.searchMatchesOnly === true,
      searchOptions: (() => {
        const options = DEFAULT_SEARCH_OPTIONS();
        if (context.searchOptions && typeof context.searchOptions === 'object') {
          for (const key of Object.keys(options)) {
            if (typeof context.searchOptions[key] === 'boolean') options[key] = context.searchOptions[key];
          }
        }
        return options;
      })(),
    };
  }

  function createRowEvictionPlan(evictedRows, references) {
    const evictedSet = new Set(evictedRows || []);
    const refs = references || {};
    const retainedRows = (refs.allRows || []).filter((row) => !evictedSet.has(row));
    return {
      selectedRowEvicted: evictedSet.has(refs.selectedRow),
      focusedRowEvicted: evictedSet.has(refs.focusedRow),
      retainedSelectedRows: retainRowsByIdentity(refs.selectedRows || [], retainedRows),
      retainedSearchMatches: (refs.searchMatches || []).filter((row) => !evictedSet.has(row)),
      retainedPendingRows: (refs.pendingRows || []).filter((row) => !evictedSet.has(row)),
    };
  }

  function isRetainedRow(row, retainedRows) {
    return !!row && !!retainedRows && retainedRows.has(row) && row._retentionDisposed !== true;
  }

  function planStatusAnnouncement(currentText, nextText, forceAnnouncement) {
    const text = nextText == null ? '' : String(nextText);
    const unchanged = currentText === text;
    return {
      text,
      clearFirst: unchanged && forceAnnouncement === true,
      write: !unchanged || forceAnnouncement === true,
    };
  }

  function isActiveRetainedRow(row, retainedRows, activeRows) {
    return isRetainedRow(row, retainedRows) && !!activeRows && activeRows.has(row);
  }

  function formatAutomaticResponsePrefetchFailureSummary(failureCount) {
    const count = Number.isInteger(failureCount) && failureCount > 0 ? failureCount : 0;
    return (
      count.toLocaleString() +
      ' body ' +
      (count === 1 ? 'prefetch failed' : 'prefetches failed') +
      '. Selecting a request retries its body.'
    );
  }

  function planImportRetention(totalCount, requestLimit, unlimited) {
    const normalizedTotal = Number.isInteger(totalCount) && totalCount > 0 ? totalCount : 0;
    const retainedCount = unlimited ? normalizedTotal : Math.min(normalizedTotal, requestLimit);
    return {
      startIndex: normalizedTotal - retainedCount,
      retainedCount,
      skippedCount: normalizedTotal - retainedCount,
    };
  }

  function createImportError(message) {
    const error = new Error(message);
    error.name = 'ImportError';
    return error;
  }

  function getImportFormat(fileName) {
    if (typeof fileName !== 'string') return '';
    const normalizedName = fileName.toLowerCase();
    if (normalizedName.endsWith('.har')) return 'har';
    if (normalizedName.endsWith('.saz')) return 'saz';
    return '';
  }

  function validateImportSource(fileName, sourceBytes) {
    const format = getImportFormat(fileName);
    if (!format) return { format: '', error: 'Only HAR and SAZ files are supported.' };
    if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0) {
      return { format, error: 'Import file size is unavailable.' };
    }
    if (sourceBytes > MAX_IMPORT_SOURCE_BYTES) {
      return { format, error: 'Import file exceeds the 32 MiB source limit.' };
    }
    return { format, error: '' };
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeImportString(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  function normalizeImportNumber(value, fallback) {
    return typeof value === 'number' &&
      Number.isFinite(value) &&
      Math.abs(value) <= Number.MAX_SAFE_INTEGER
      ? value
      : fallback;
  }

  function normalizeHarHeaders(headers) {
    if (!Array.isArray(headers)) return [];
    return headers.map((header) => {
      const source = isRecord(header) ? header : {};
      return {
        name: normalizeImportString(source.name),
        value: normalizeImportString(source.value),
      };
    });
  }

  function validateHarDocument(data) {
    if (!isRecord(data) || !isRecord(data.log) || !Array.isArray(data.log.entries)) {
      throw createImportError('HAR must contain a log.entries array.');
    }
    for (const entry of data.log.entries) {
      if (!isRecord(entry) || !isRecord(entry.request) || !isRecord(entry.response)) {
        throw createImportError('HAR entries must contain request and response objects.');
      }
    }
    return data.log.entries;
  }

  function normalizeHarEntry(entry) {
    if (!isRecord(entry) || !isRecord(entry.request) || !isRecord(entry.response)) {
      throw createImportError('HAR entries must contain request and response objects.');
    }
    const request = entry.request;
    const response = entry.response;
    const content = isRecord(response.content) ? response.content : {};
    const postData = isRecord(request.postData)
      ? {
        mimeType: normalizeImportString(request.postData.mimeType),
        text: normalizeImportString(request.postData.text),
        encoding: request.postData.encoding === 'base64' ? 'base64' : '',
      }
      : null;
    const normalizedContent = { mimeType: normalizeImportString(content.mimeType) };
    const contentSize = normalizeImportNumber(content.size, null);
    if (contentSize !== null && contentSize >= 0) normalizedContent.size = contentSize;
    if (typeof content.text === 'string') normalizedContent.text = content.text;
    if (content.encoding === 'base64') normalizedContent.encoding = 'base64';
    if (isRecord(content._networkPlus)) {
      normalizedContent._networkPlus = {
        status: normalizeImportString(content._networkPlus.status),
        reason: normalizeImportString(content._networkPlus.reason),
      };
    }
    const timingsSource = isRecord(entry.timings) ? entry.timings : {};
    const timings = {};
    for (const phase of TIMING_PHASES) {
      timings[phase] = normalizeImportNumber(timingsSource[phase], -1);
    }
    const normalizedResponse = {
      status: normalizeImportNumber(response.status, 0),
      statusText: normalizeImportString(response.statusText),
      httpVersion: normalizeImportString(response.httpVersion),
      headers: normalizeHarHeaders(response.headers),
      content: normalizedContent,
    };
    const bodySize = normalizeImportNumber(response.bodySize, null);
    if (bodySize !== null && bodySize >= 0) normalizedResponse.bodySize = bodySize;
    return {
      startedDateTime: normalizeImportString(entry.startedDateTime),
      time: Math.max(0, normalizeImportNumber(entry.time, 0)),
      request: {
        method: normalizeImportString(request.method),
        url: normalizeImportString(request.url),
        httpVersion: normalizeImportString(request.httpVersion),
        headers: normalizeHarHeaders(request.headers),
        postData,
      },
      response: normalizedResponse,
      timings,
      initiator: null,
    };
  }

  function parseSazEntryPath(path) {
    if (typeof path !== 'string') return null;
    const match = path.match(SAZ_ENTRY_PATH_PATTERN);
    if (!match) return null;
    return {
      requestId: match[1],
      kind: match[2],
      extension: match[3],
    };
  }

  function validateSazArchiveEntryBudget(currentBudget, entryInfo, limits) {
    const current = currentBudget || { entryCount: 0, totalUncompressedBytes: 0 };
    const configuredLimits = limits || {
      maxEntries: MAX_SAZ_ARCHIVE_ENTRIES,
      maxEntryBytes: MAX_SAZ_ENTRY_BYTES,
      maxTotalBytes: MAX_SAZ_TOTAL_UNCOMPRESSED_BYTES,
    };
    const originalSize = entryInfo && entryInfo.originalSize;
    const entryCount = current.entryCount + 1;
    if (entryCount > configuredLimits.maxEntries) {
      return { accepted: false, state: current, error: 'SAZ archive exceeds the 20,000-entry limit.' };
    }
    if (originalSize == null) {
      return {
        accepted: true,
        state: { entryCount, totalUncompressedBytes: current.totalUncompressedBytes },
        error: '',
      };
    }
    if (!Number.isSafeInteger(originalSize) || originalSize < 0) {
      return { accepted: false, state: current, error: 'SAZ entry size metadata is invalid.' };
    }
    if (originalSize > configuredLimits.maxEntryBytes) {
      return { accepted: false, state: current, error: 'SAZ entry exceeds the 4 MiB uncompressed limit.' };
    }
    const totalUncompressedBytes = current.totalUncompressedBytes + originalSize;
    if (
      !Number.isSafeInteger(totalUncompressedBytes) ||
      totalUncompressedBytes > configuredLimits.maxTotalBytes
    ) {
      return {
        accepted: false,
        state: current,
        error: 'SAZ archive exceeds the 64 MiB total uncompressed limit.',
      };
    }
    return {
      accepted: true,
      state: { entryCount, totalUncompressedBytes },
      error: '',
    };
  }

  function compareSazRequestIds(left, right) {
    const normalizedLeft = String(left).replace(/^0+(?=\d)/, '');
    const normalizedRight = String(right).replace(/^0+(?=\d)/, '');
    if (normalizedLeft.length !== normalizedRight.length) {
      return normalizedLeft.length - normalizedRight.length;
    }
    if (normalizedLeft !== normalizedRight) return normalizedLeft < normalizedRight ? -1 : 1;
    return String(left).localeCompare(String(right));
  }

  function extractBoundedSazEntries(fflate, sourceBytes) {
    return new Promise((resolve, reject) => {
      if (!fflate || !fflate.Unzip || !fflate.UnzipInflate) {
        reject(createImportError('SAZ decompression support is unavailable.'));
        return;
      }
      if (!(sourceBytes instanceof Uint8Array)) {
        reject(createImportError('SAZ source data is invalid.'));
        return;
      }

      const extractedEntries = new Map();
      const trackedFiles = new Set();
      const queuedFiles = [];
      let archiveBudget = { entryCount: 0, totalUncompressedBytes: 0 };
      let producedBytes = 0;
      let pendingFiles = 0;
      let activeFileCount = 0;
      let sourceOffset = 0;
      let enumerationComplete = false;
      let pumpScheduled = false;
      let settled = false;
      let unzip = null;

      const terminateFile = (entry) => {
        try {
          entry.terminate();
        } catch (_error) {
          // Termination is best-effort after rejection or for ignored entries.
        }
      };
      const stopTrackedFiles = () => {
        for (const trackedFile of trackedFiles) terminateFile(trackedFile);
        trackedFiles.clear();
        queuedFiles.length = 0;
      };
      const fail = (message) => {
        if (settled) return;
        settled = true;
        stopTrackedFiles();
        reject(createImportError(message));
      };
      const finishIfReady = () => {
        if (settled || !enumerationComplete || pendingFiles !== 0) return false;
        settled = true;
        resolve(extractedEntries);
        return true;
      };

      let schedulePump;
      const startQueuedFiles = () => {
        let startedCount = 0;
        while (
          !settled &&
          activeFileCount < MAX_SAZ_CONCURRENT_EXTRACTIONS &&
          queuedFiles.length > 0 &&
          startedCount < MAX_SAZ_CONCURRENT_EXTRACTIONS
        ) {
          const entry = queuedFiles.shift();
          const chunks = [];
          let entryBytes = 0;
          activeFileCount += 1;
          startedCount += 1;
          entry.ondata = (error, chunk, final) => {
            if (settled) return;
            if (error) {
              fail('SAZ extraction failed.');
              return;
            }
            if (chunk && chunk.length > 0) {
              entryBytes += chunk.length;
              producedBytes += chunk.length;
              if (entryBytes > MAX_SAZ_ENTRY_BYTES) {
                fail('SAZ entry exceeds the 4 MiB uncompressed limit.');
                return;
              }
              if (producedBytes > MAX_SAZ_TOTAL_UNCOMPRESSED_BYTES) {
                fail('SAZ archive exceeds the 64 MiB total uncompressed limit.');
                return;
              }
              chunks.push(chunk);
            }
            if (!final) return;
            const content = new Uint8Array(entryBytes);
            let offset = 0;
            for (const chunkPart of chunks) {
              content.set(chunkPart, offset);
              offset += chunkPart.length;
            }
            extractedEntries.set(entry.name, content);
            trackedFiles.delete(entry);
            activeFileCount -= 1;
            pendingFiles -= 1;
            schedulePump();
          };
          try {
            entry.start();
          } catch (_error) {
            fail('SAZ extraction failed.');
          }
        }
      };
      const pump = () => {
        pumpScheduled = false;
        if (settled) return;
        startQueuedFiles();
        if (finishIfReady()) return;
        if (!enumerationComplete) {
          const nextOffset = Math.min(sourceOffset + SAZ_SOURCE_CHUNK_BYTES, sourceBytes.length);
          const final = nextOffset === sourceBytes.length;
          try {
            unzip.push(sourceBytes.subarray(sourceOffset, nextOffset), final);
          } catch (_error) {
            fail('SAZ archive is malformed.');
            return;
          }
          sourceOffset = nextOffset;
          if (final) enumerationComplete = true;
        }
        if (!finishIfReady()) schedulePump();
      };
      schedulePump = () => {
        if (settled || pumpScheduled) return;
        pumpScheduled = true;
        setTimeout(pump, 0);
      };

      unzip = new fflate.Unzip((entry) => {
        if (settled) {
          terminateFile(entry);
          return;
        }
        const budgetResult = validateSazArchiveEntryBudget(archiveBudget, entry);
        if (!budgetResult.accepted) {
          terminateFile(entry);
          fail(budgetResult.error);
          return;
        }
        archiveBudget = budgetResult.state;

        const parsedPath = parseSazEntryPath(entry.name);
        if (!parsedPath || parsedPath.kind === 'm' || parsedPath.extension !== 'txt') {
          terminateFile(entry);
          return;
        }
        if (entry.compression !== 0 && entry.compression !== 8) {
          terminateFile(entry);
          fail('SAZ payload uses an unsupported compression method.');
          return;
        }

        pendingFiles += 1;
        trackedFiles.add(entry);
        queuedFiles.push(entry);
      });
      unzip.register(fflate.UnzipInflate);
      schedulePump();
    });
  }

  // Byte offset of the CRLFCRLF header/body separator, or -1 when absent.
  // The split must happen on bytes (not decoded text) so multi-byte body
  // charsets do not shift the separator position.
  function findHttpHeaderBodySplit(bytes) {
    for (let index = 0; index + 3 < bytes.length; index++) {
      if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) {
        return index;
      }
    }
    return -1;
  }

  function parseSazHttpMessage(bytes) {
    if (!(bytes instanceof Uint8Array)) throw createImportError('SAZ HTTP payload is invalid.');
    const separatorIndex = findHttpHeaderBodySplit(bytes);
    const headerPart = new TextDecoder().decode(
      separatorIndex >= 0 ? bytes.subarray(0, separatorIndex) : bytes,
    );
    const bodyBytes = separatorIndex >= 0 ? bytes.subarray(separatorIndex + 4) : new Uint8Array(0);
    const lines = headerPart.split('\r\n');
    const startLine = lines.shift() || '';
    if (!startLine) throw createImportError('SAZ HTTP start line is missing.');
    const headers = [];
    let currentHeader = null;
    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        if (currentHeader) currentHeader.value += ' ' + line.trim();
        continue;
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) continue;
      currentHeader = {
        name: line.slice(0, colonIndex).trim(),
        value: line.slice(colonIndex + 1).trim(),
      };
      headers.push(currentHeader);
    }
    const body = decodeSazMessageBody(bodyBytes, headers);
    return { startLine, headers, body };
  }

  // SAZ bodies are stored as raw bytes; decode them with the charset the
  // message's own Content-Type declares (falling back to UTF-8) so imported
  // non-UTF-8 bodies (e.g. Shift_JIS) do not appear garbled.
  function decodeSazMessageBody(bodyBytes, headers) {
    if (!(bodyBytes instanceof Uint8Array) || bodyBytes.length === 0) return '';
    const contentType = getNormalizedHeaderValue(headers, 'content-type');
    let charset = extractCharsetFromContentType(contentType);
    if (!charset && isHtmlLikeMime(contentType)) {
      let asciiPrefix = '';
      for (let index = 0; index < Math.min(bodyBytes.length, 1024); index++) {
        asciiPrefix += String.fromCharCode(bodyBytes[index]);
      }
      charset = extractHtmlMetaCharset(asciiPrefix);
    }
    return createBodyTextDecoder(charset).decode(bodyBytes);
  }

  function getNormalizedHeaderValue(headers, name) {
    const normalizedName = name.toLowerCase();
    const header = headers.find((item) => item.name.toLowerCase() === normalizedName);
    return header ? header.value : '';
  }

  function createSazHarEntry(clientBytes, serverBytes, startedDateTime) {
    const client = parseSazHttpMessage(clientBytes);
    const server = parseSazHttpMessage(serverBytes);
    const requestParts = client.startLine.trim().split(/\s+/);
    const responseParts = server.startLine.trim().split(/\s+/);
    if (requestParts.length < 3) throw createImportError('SAZ request start line is invalid.');
    if (responseParts.length < 2 || !/^\d{3}$/.test(responseParts[1])) {
      throw createImportError('SAZ response start line is invalid.');
    }
    const method = requestParts.shift();
    const httpVersion = requestParts.pop();
    const url = requestParts.join(' ');
    if (!method || !url || !httpVersion) throw createImportError('SAZ request start line is invalid.');
    const responseHttpVersion = responseParts.shift();
    const status = Number(responseParts.shift());
    const statusText = responseParts.join(' ');
    const mimeType = getNormalizedHeaderValue(server.headers, 'content-type').split(';')[0];
    const bodySize = getUtf8ByteLength(server.body);
    return {
      startedDateTime,
      time: 0,
      request: {
        method,
        url,
        httpVersion,
        headers: client.headers,
        postData: client.body ? { mimeType: getNormalizedHeaderValue(client.headers, 'content-type'), text: client.body } : null,
      },
      response: {
        status,
        statusText,
        httpVersion: responseHttpVersion,
        headers: server.headers,
        content: {
          size: bodySize,
          mimeType,
          text: server.body,
        },
        bodySize,
      },
      timings: {},
      initiator: null,
    };
  }

  function classifyImportedResponseContent(entry) {
    const response = entry && entry.response ? entry.response : {};
    const content = response.content && typeof response.content === 'object' ? response.content : {};
    if (typeof content.text === 'string') {
      return { state: 'embedded', reason: '' };
    }
    if (content._networkPlus && typeof content._networkPlus === 'object') {
      const sourceStatus = content._networkPlus.status || 'unavailable';
      const sourceReason = content._networkPlus.reason || 'The source HAR marked the response body unavailable.';
      return {
        state: 'unavailable',
        reason: 'Imported HAR body is ' + sourceStatus + ': ' + sourceReason,
      };
    }
    const declaredSizes = [content.size, response.bodySize].filter(
      (value) => Number.isFinite(value) && value >= 0,
    );
    if (declaredSizes.length > 0 && declaredSizes.every((value) => value === 0)) {
      return { state: 'empty', reason: '' };
    }
    const positiveSize = declaredSizes.find((value) => value > 0);
    if (positiveSize !== undefined) {
      return {
        state: 'unavailable',
        reason: 'Imported HAR declares a ' + positiveSize + '-byte response body but does not include content.text.',
      };
    }
    return {
      state: 'unavailable',
      reason: IMPORT_BODY_MISSING_REASON,
    };
  }

  // The pane frame and the state word translate; display.label itself stays
  // the canonical English token because logic branches on it.
  function formatBodyPaneMessage(display) {
    const labelKey = 'bodyState' + display.label.charAt(0).toUpperCase() + display.label.slice(1);
    return uiTextFormat('bodyPaneFrame', {
      label: uiText(labelKey) || display.label,
      reason: localizeBodyReason(display.reason),
    });
  }

  function describeResponseContentState(row, error) {
    const rawState = row && row.responseContentState ? row.responseContentState : 'unavailable';
    const state = rawState === 'row-evicted' ? 'evicted' : rawState;
    const label = ['omitted', 'evicted', 'unavailable'].includes(state) ? state : 'error';
    const fallback = label === 'error' ? BODY_RETRIEVAL_FAILED_REASON : BODY_UNAVAILABLE_REASON;
    return {
      label,
      reason:
        (row && row.responseContentReason) ||
        (error && error.message) ||
        fallback,
    };
  }

  // A navigation never clears the table; the browser merely stops serving the
  // previous document's response bodies once the new one commits, so a body
  // that was not prefetched in time can never be retrieved again. Rows that
  // lost that race flip to a terminal state carrying this reason instead of
  // timing out on a doomed getContent call later.
  const NAVIGATION_BODY_UNAVAILABLE_REASON =
    'The inspected page navigated away before this response body was retrieved.';

  // Fixed body-unavailability reasons are stored on rows in English — they
  // travel through the mirror protocol and into exports unchanged — and are
  // translated only at display time via localizeBodyReason.
  const BODY_RETRIEVAL_FAILED_REASON = 'Response content retrieval failed.';
  const BODY_UNAVAILABLE_REASON = 'Full response content is unavailable.';
  const BODY_EVICTED_REASON =
    'Evicted from the bounded response-body cache; select or export to retry retrieval.';
  const IMPORT_BODY_MISSING_REASON =
    'Imported HAR does not include response content or an explicit zero body size.';

  function markUnfetchedRowsForNavigation(rows) {
    const markedRows = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== 'object') continue;
      // Only live-captured rows still waiting on getContent lose anything at
      // navigation: embedded (sample/import), cached, in-flight, mirror, and
      // already-terminal bodies all keep their existing behavior.
      if (row.responseContentState !== 'not-loaded') continue;
      if (!row._reqObj || typeof row._reqObj.getContent !== 'function') continue;
      row.responseContentState = 'unavailable';
      row.responseContentReason = NAVIGATION_BODY_UNAVAILABLE_REASON;
      row.responseContentError = null;
      row._reqObj = null;
      markedRows.push(row);
    }
    return markedRows;
  }

  function getUtf8ByteLength(value) {
    return new TextEncoder().encode(typeof value === 'string' ? value : '').length;
  }

  // Charset declared by the response's Content-Type header, if any.
  function resolveRowResponseCharset(row) {
    const headers = row && Array.isArray(row.responseHeaders) ? row.responseHeaders : [];
    return extractCharsetFromContentType(getNormalizedHeaderValue(headers, 'content-type'));
  }

  function measureResponsePayload(content, encoding, charset, sniffHtmlMeta) {
    const rawContent = typeof content === 'string' ? content : '';
    const text = decodeResponseContent(rawContent, encoding, charset, sniffHtmlMeta);
    const rawBytes = getUtf8ByteLength(rawContent);
    const decodedBytes = text === rawContent ? 0 : getUtf8ByteLength(text);
    return {
      content: rawContent,
      encoding: encoding === 'base64' ? 'base64' : '',
      text,
      bytes: rawBytes + decodedBytes,
    };
  }

  /** Debounce wrapper */
  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function getNextTabIndex(currentIndex, itemCount, key) {
    if (itemCount <= 0) return -1;
    const index = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : 0;
    if (key === 'Home') return 0;
    if (key === 'End') return itemCount - 1;
    if (key === 'ArrowRight') return (index + 1) % itemCount;
    if (key === 'ArrowLeft') return (index - 1 + itemCount) % itemCount;
    return index;
  }

  /**
   * Highlight multiple keywords in text, each with its own color class.
   * @param {string} text
   * @param {Array<{query: string, colorIdx: number}>} keywords
   * @returns {DocumentFragment}
   */
  function highlightTextMulti(text, keywords, options) {
    const fragment = document.createDocumentFragment();
    const source = text == null ? '' : String(text);
    const highlights = planKeywordHighlights(source, keywords, options);
    let lastIndex = 0;
    for (const highlight of highlights) {
      if (highlight.start > lastIndex) {
        fragment.appendChild(document.createTextNode(source.substring(lastIndex, highlight.start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'search-hl-' + (highlight.colorIdx != null ? highlight.colorIdx : 0);
      mark.textContent = source.substring(highlight.start, highlight.end);
      fragment.appendChild(mark);
      lastIndex = highlight.end;
    }
    if (lastIndex < source.length || highlights.length === 0) {
      fragment.appendChild(document.createTextNode(source.substring(lastIndex)));
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
  function deepSearchMatch(row, query, scope, options) {
    if (!query) return false;
    const opts = options || {};
    let matchesValue;
    if (opts.regex || opts.wholeWord || opts.caseSensitive) {
      const compiled = compileSearchQuery(query, opts);
      if (compiled.error || !compiled.regex) return false;
      const regex = compiled.regex;
      matchesValue = (value) => {
        regex.lastIndex = 0; // shared global regex from the compile cache
        return regex.test(value);
      };
    } else {
      const lcq = query.toLowerCase();
      matchesValue = (value) => value.toLowerCase().indexOf(lcq) > -1;
    }

    // URL / Domain / Path search
    if (scope.url !== false) {
      const urlFields = [row.url, row.domain, row.path, row.method, String(row.status || ''), row.type];
      for (let i = 0; i < urlFields.length; i++) {
        if (urlFields[i] && matchesValue(urlFields[i])) return true;
      }
    }

    if (scope.reqBody) {
      const postText = row.requestPostData && row.requestPostData.text ? row.requestPostData.text : '';
      if (postText && matchesValue(postText)) return true;
    }

    if (scope.resBody) {
      const resText = row.responseContentText != null ? row.responseContentText : row.responseContent || '';
      if (resText && matchesValue(resText)) return true;
    }

    if (scope.reqHeaders) {
      const reqH = row.requestHeaders || [];
      for (let i = 0; i < reqH.length; i++) {
        const h = reqH[i];
        if ((h.name && matchesValue(h.name)) || (h.value && matchesValue(h.value))) return true;
      }
    }

    if (scope.resHeaders) {
      const resH = row.responseHeaders || [];
      for (let i = 0; i < resH.length; i++) {
        const h = resH[i];
        if ((h.name && matchesValue(h.name)) || (h.value && matchesValue(h.value))) return true;
      }
    }

    return false;
  }

  function countUnsearchedResponseBodies(rows) {
    return (rows || []).filter(
      (row) => row && row.responseContentState !== 'cached',
    ).length;
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

  // Markdown copies exist to paste straight into an issue or a chat thread,
  // which is exactly where an unsanitized query value would leak — so they
  // ride the same sanitizer as the summary copy.
  function escapeMarkdownTableCell(value) {
    return String(value == null ? '' : value)
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, ' ');
  }

  function formatRowMarkdown(row) {
    const fields = [
      ['Status', String(row.status || '') + (row.statusText ? ' ' + row.statusText : '')],
      ...(row.operation ? [['Operation', row.operation]] : []),
      ['Type', row.type || '(none)'],
      ['Duration', fmtTime(row.duration)],
      ['Size', fmtBytes(row.size)],
      ['Time', (row.clientStart || '') + ' – ' + (row.serverDone || '')],
      ...(row.initiator && row.initiator.text ? [['Initiator', row.initiator.text]] : []),
    ];
    return [
      '### ' + (row.method || '') + ' ' + (row.url || ''),
      '',
      '| Field | Value |',
      '| --- | --- |',
      ...fields.map(([key, value]) => '| ' + key + ' | ' + escapeMarkdownTableCell(value) + ' |'),
    ].join('\n');
  }

  function formatRowsMarkdownTable(rows) {
    const lines = [
      '| # | Method | Status | URL | Duration | Size |',
      '| --- | --- | --- | --- | --- | --- |',
    ];
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      lines.push(
        '| ' + (index + 1) +
        ' | ' + escapeMarkdownTableCell(row.method || '') +
        ' | ' + escapeMarkdownTableCell(String(row.status || '') + (row.statusText ? ' ' + row.statusText : '')) +
        ' | ' + escapeMarkdownTableCell(row.url || '') +
        ' | ' + escapeMarkdownTableCell(fmtTime(row.duration)) +
        ' | ' + escapeMarkdownTableCell(fmtBytes(row.size)) + ' |',
      );
    });
    return lines.join('\n');
  }

  function buildMarkdownTablePayload(rows) {
    try {
      const orderedRows = (Array.isArray(rows) ? rows : []).slice().sort((a, b) => a.id - b.id);
      const sanitizedRows = orderedRows.map(
        (row) => sanitizeClipboardRow('markdown', row, '', { mode: 'sanitized' }).value,
      );
      return { ok: true, text: formatRowsMarkdownTable(sanitizedRows) };
    } catch (_error) {
      return { ok: false, text: '' };
    }
  }

  function escapeCsvField(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  // Metadata-only spreadsheet view: numeric duration/size for pivoting,
  // the redacted URL and its derived domain, and never a header or body.
  function formatRowsCsv(rows) {
    const lines = ['id,method,status,statusText,domain,type,operation,durationMs,sizeBytes,url'];
    for (const row of Array.isArray(rows) ? rows : []) {
      lines.push(
        [
          row.id,
          row.method || '',
          row.status || '',
          row.statusText || '',
          row.domain || '',
          row.type || '',
          row.operation || '',
          Number.isFinite(row.duration) ? Math.round(row.duration) : '',
          Number.isFinite(row.size) ? row.size : '',
          row.url || '',
        ]
          .map(escapeCsvField)
          .join(','),
      );
    }
    return lines.join('\r\n') + '\r\n';
  }

  function buildCsvPayload(rows) {
    try {
      const orderedRows = (Array.isArray(rows) ? rows : []).slice().sort((a, b) => a.id - b.id);
      const sanitizedRows = orderedRows.map(
        (row) => sanitizeClipboardRow('markdown', row, '', { mode: 'sanitized' }).value,
      );
      return { ok: true, text: formatRowsCsv(sanitizedRows) };
    } catch (_error) {
      return { ok: false, text: '' };
    }
  }

  // Chrome's HAR export carries WebSocket conversations as _webSocketMessages;
  // importing them threads the frames into the same panes live capture uses.
  const HAR_WS_MESSAGE_IMPORT_LIMIT = 1000;

  // Alongside the bounded display text, WS rows keep a bounded structured
  // copy of the conversation — what HAR export writes back out as
  // _webSocketMessages. SSE rows never get one: the key is a Chrome
  // WebSocket-entry extension, and emitting it for SSE would make any
  // importer mislabel the row as a websocket. Binary frames carry no
  // captured payload (the page wrapper ships a size placeholder), so they
  // export as opcode 2 without data and are counted honestly.
  function recordWsFrame(row, frame) {
    if (!row._wsFrames) row._wsFrames = [];
    if (row._wsFrames.length >= HAR_WS_MESSAGE_IMPORT_LIMIT) {
      row._wsFramesDropped = (row._wsFramesDropped || 0) + 1;
      return;
    }
    row._wsFrames.push(frame);
  }

  const WS_BINARY_PREVIEW_PATTERN = /^\[binary \d+ bytes\]$/;

  function applyHarWebSocketMessages(row, messages) {
    if (!row || !Array.isArray(messages) || messages.length === 0) return 0;
    const usable = messages
      .filter((message) => message && typeof message === 'object' && (message.type === 'send' || message.type === 'receive'))
      .sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
    if (usable.length === 0) return 0;
    const limited = usable.slice(0, HAR_WS_MESSAGE_IMPORT_LIMIT);
    let applied = 0;
    for (const message of limited) {
      const rawTime = Number(message.time);
      // Chrome writes epoch seconds; some tools write milliseconds.
      const at = Number.isFinite(rawTime) ? (rawTime > 1e12 ? rawTime : rawTime * 1000) : NaN;
      const preview =
        message.opcode === 2
          ? '[binary frame' + (typeof message.data === 'string' ? ', ' + message.data.length + ' base64 chars' : '') + ']'
          : String(message.data == null ? '' : message.data).slice(0, WS_FRAME_PREVIEW_CHARS);
      const line = formatWsFrameLine({ kind: message.type === 'send' ? 'ws-sent' : 'ws-received', at, preview });
      recordWsFrame(row, {
        type: message.type,
        time: at,
        binary: message.opcode === 2,
        data: message.opcode === 2 ? '' : String(message.data == null ? '' : message.data).slice(0, WS_FRAME_PREVIEW_CHARS),
      });
      if (message.type === 'send') {
        if (!row.requestPostData || typeof row.requestPostData !== 'object') {
          row.requestPostData = { mimeType: 'text/plain', text: '' };
        }
        row.requestPostData.text = appendBoundedWsText(row.requestPostData.text || '', line, WS_DIRECTION_TEXT_LIMIT_CHARS);
      } else {
        row.responseContent = appendBoundedWsText(
          typeof row.responseContent === 'string' ? row.responseContent : '',
          line,
          WS_DIRECTION_TEXT_LIMIT_CHARS,
        );
        row.responseContentState = 'pending-admission';
        row.responseContentReason = '';
        row.responseContentEncoding = '';
        row.responseContentText = null;
        row.responseContentBytes = 0;
      }
      applied += 1;
    }
    if (usable.length > limited.length) {
      row.responseContent = appendBoundedWsText(
        typeof row.responseContent === 'string' ? row.responseContent : '',
        '— only the first ' + HAR_WS_MESSAGE_IMPORT_LIMIT + ' of ' + usable.length + ' WebSocket messages were imported',
        WS_DIRECTION_TEXT_LIMIT_CHARS,
      );
      row.responseContentState = 'pending-admission';
      row._wsFramesDropped = (row._wsFramesDropped || 0) + (usable.length - limited.length);
    }
    if (applied > 0 && !row.type) row.type = 'websocket';
    return applied;
  }

  /**
   * Compute a symmetric diff of two header arrays.
   * Each entry in headersA / headersB must be { name, value }.
   * Returns an array sorted by name, each entry:
   *   { name, valueA, valueB, state: 'match' | 'changed' | 'only-a' | 'only-b' }
   *
   * Duplicate header names (e.g. Set-Cookie) are preserved by occurrence index;
   * each pair is emitted independently so no occurrence is silently dropped.
   */
  function diffHeaders(headersA, headersB) {
    const safeA = Array.isArray(headersA) ? headersA : [];
    const safeB = Array.isArray(headersB) ? headersB : [];
    // Build multimap: name.toLowerCase() -> [{name, value}]
    // Preserves duplicate headers such as Set-Cookie, aligned by occurrence index.
    const makeMultimap = (arr) => {
      const m = new Map();
      for (const h of arr) {
        const key = (h && typeof h.name === 'string' ? h.name : '').toLowerCase();
        if (!m.has(key)) m.set(key, []);
        m.get(key).push({ name: h.name || '', value: typeof h.value === 'string' ? h.value : '' });
      }
      return m;
    };
    const mapA = makeMultimap(safeA);
    const mapB = makeMultimap(safeB);
    const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
    const result = [];
    for (const key of allKeys) {
      const listA = mapA.get(key) || [];
      const listB = mapB.get(key) || [];
      const len = Math.max(listA.length, listB.length);
      for (let i = 0; i < len; i++) {
        const a = listA[i];
        const b = listB[i];
        const name = (a || b).name;
        if (a && b) {
          result.push({ name, valueA: a.value, valueB: b.value, state: a.value === b.value ? 'match' : 'changed' });
        } else if (a) {
          result.push({ name, valueA: a.value, valueB: null, state: 'only-a' });
        } else {
          result.push({ name, valueA: null, valueB: b.value, state: 'only-b' });
        }
      }
    }
    return result.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
  }

  /**
   * Compute a symmetric diff of two query-parameter arrays.
   * Each entry must be { name, value }.  Duplicate names are kept as separate
   * entries (unlike headers where multimap-paired semantics apply).
   * Returns entries sorted by name then value, each with the same shape as
   * diffHeaders plus an `indexA` / `indexB` original-position hint.
   */
  function diffQueryParams(paramsA, paramsB) {
    const safeA = Array.isArray(paramsA) ? paramsA : [];
    const safeB = Array.isArray(paramsB) ? paramsB : [];
    // Build multimap: name.toLowerCase() -> [{name, value}]
    const makeMultimap = (arr) => {
      const m = new Map();
      for (const p of arr) {
        const key = (p && typeof p.name === 'string' ? p.name : '').toLowerCase();
        if (!m.has(key)) m.set(key, []);
        m.get(key).push({ name: p.name || '', value: typeof p.value === 'string' ? p.value : '' });
      }
      return m;
    };
    const mapA = makeMultimap(safeA);
    const mapB = makeMultimap(safeB);
    const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
    const result = [];
    for (const key of allKeys) {
      const listA = mapA.get(key) || [];
      const listB = mapB.get(key) || [];
      const len = Math.max(listA.length, listB.length);
      for (let i = 0; i < len; i++) {
        const a = listA[i];
        const b = listB[i];
        const name = (a || b).name;
        if (a && b) {
          result.push({ name, valueA: a.value, valueB: b.value, state: a.value === b.value ? 'match' : 'changed' });
        } else if (a) {
          result.push({ name, valueA: a.value, valueB: null, state: 'only-a' });
        } else {
          result.push({ name, valueA: null, valueB: b.value, state: 'only-b' });
        }
      }
    }
    return result.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
  }

  /**
   * Return a description of the response body for comparison purposes.
   * Uses only already-cached data — never triggers a new fetch.
   * Returns { text: string|null, stateLabel: string, totalLength?: number }
   *   stateLabel: 'available' | 'empty' | 'truncated' | 'missing' | 'omitted' | 'evicted' | 'unavailable'
   */
  function describeBodyForComparison(row) {
    if (!row) return { text: null, stateLabel: 'missing' };
    const s = row.responseContentState || 'unavailable';
    if ((s === 'cached' || s === 'embedded') && typeof row.responseContentText === 'string') {
      const full = row.responseContentText;
      if (full.length === 0) return { text: '', stateLabel: 'empty' };
      if (full.length > TRUNCATE_LIMIT) {
        return { text: full.substring(0, TRUNCATE_LIMIT), stateLabel: 'truncated', totalLength: full.length };
      }
      return { text: full, stateLabel: 'available' };
    }
    if (s === 'omitted') return { text: null, stateLabel: 'omitted' };
    if (s === 'evicted' || s === 'row-evicted') return { text: null, stateLabel: 'evicted' };
    return { text: null, stateLabel: 'unavailable' };
  }

  /**
   * Return a description of the request body for comparison purposes.
   * Uses only already-cached data — never triggers a new fetch.
   * Returns { text: string|null, stateLabel: string, totalLength?: number }
   *   stateLabel: 'available' | 'empty' | 'truncated' | 'missing'
   */
  function describeRequestBodyForComparison(row) {
    if (!row) return { text: null, stateLabel: 'missing' };
    const postData = row.requestPostData;
    if (!postData || typeof postData.text !== 'string') return { text: null, stateLabel: 'missing' };
    const full = postData.text;
    if (full.length === 0) return { text: '', stateLabel: 'empty' };
    if (full.length > TRUNCATE_LIMIT) {
      return { text: full.substring(0, TRUNCATE_LIMIT), stateLabel: 'truncated', totalLength: full.length };
    }
    return { text: full, stateLabel: 'available' };
  }

  function classifyStatusClass(status) {
    if (!Number.isInteger(status)) return 'other';
    const statusClass = `${Math.floor(status / 100)}xx`;
    return STATUS_CLASS_KEYS.includes(statusClass) ? statusClass : 'other';
  }

  function getStatusClassIndicators(statusClassCounts) {
    const counts =
      statusClassCounts && typeof statusClassCounts === 'object' ? statusClassCounts : {};
    return STATUS_CLASS_KEYS.map((statusClass) => {
      const sourceCount = counts[statusClass];
      const count = Number.isInteger(sourceCount) && sourceCount >= 0 ? sourceCount : 0;
      return { statusClass, count, text: statusClass + ' ' + count };
    });
  }

  function formatStatusClassSummary(statusClassCounts) {
    return (
      'status ' +
      getStatusClassIndicators(statusClassCounts)
        .map((indicator) => indicator.text)
        .join(' · ')
    );
  }

  function findFirstStatusClassRow(rows, statusClass) {
    if (!Array.isArray(rows) || !STATUS_CLASS_KEYS.includes(statusClass)) return null;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      if (classifyStatusClass(row.status) === statusClass) return row;
    }
    return null;
  }

  /**
   * Compute aggregate statistics for a set of rows.
   * Pure function — no DOM/state dependency.
   * @param {Array} rows - Array of row objects (from buildRowFromRequest)
   * @returns {{ count: number, totalDuration: number, avgDuration: number, minDuration: number, maxDuration: number, totalSize: number, statusClassCounts: Record<string, number> }}
   */
  function computeStats(rows) {
    const validRows = Array.isArray(rows) ? rows : [];
    const count = validRows.length;
    const statusClassCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
    if (count === 0) {
      return {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalSize: 0,
        statusClassCounts,
      };
    }
    let totalDuration = 0;
    let minDuration = Infinity;
    let maxDuration = -Infinity;
    let totalSize = 0;
    for (const row of validRows) {
      const sourceRow = row && typeof row === 'object' ? row : {};
      const dur = Number.isFinite(sourceRow.duration) ? sourceRow.duration : 0;
      totalDuration += dur;
      if (dur < minDuration) minDuration = dur;
      if (dur > maxDuration) maxDuration = dur;
      totalSize += Number.isFinite(sourceRow.size) ? sourceRow.size : 0;
      statusClassCounts[classifyStatusClass(sourceRow.status)] += 1;
    }
    return {
      count,
      totalDuration,
      avgDuration: totalDuration / count,
      minDuration: minDuration === Infinity ? 0 : minDuration,
      maxDuration: maxDuration === -Infinity ? 0 : maxDuration,
      totalSize,
      statusClassCounts,
    };
  }

  /**
   * Aggregate rows into a per-domain summary for the domain panel.
   * Pure function — no DOM/state dependency.
   * @param {Array} rows - Array of row objects (from buildRowFromRequest)
   * @returns {Array<{ domain: string, count: number, totalBytes: number, errorCount: number }>}
   */
  function computeDomainSummary(rows) {
    const buckets = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const sourceRow = row && typeof row === 'object' ? row : {};
      const domain = typeof sourceRow.domain === 'string' ? sourceRow.domain : '';
      let bucket = buckets.get(domain);
      if (!bucket) {
        bucket = { domain, count: 0, totalBytes: 0, errorCount: 0 };
        buckets.set(domain, bucket);
      }
      bucket.count += 1;
      bucket.totalBytes += Number.isFinite(sourceRow.size) ? sourceRow.size : 0;
      const statusClass = classifyStatusClass(sourceRow.status);
      if (statusClass === '4xx' || statusClass === '5xx') bucket.errorCount += 1;
    }
    return Array.from(buckets.values()).sort(
      (a, b) => b.count - a.count || (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0),
    );
  }

  /**
   * Compute waterfall bar layout for a row within a time range.
   * Pure function — no DOM/state dependency.
   * @param {object} row - Row object with clientStartEpoch, serverDoneEpoch, duration, timings
   * @param {{ start: number, end: number }} range - Epoch ms range for the full waterfall
   * @returns {{ offsetPct: number, widthPct: number, segments: Array<{ label: string, pct: number }> }|null}
   */
  function computeWaterfallBar(row, range) {
    if (!row || !range) return null;
    const rangeStart = Number.isFinite(range.start) ? range.start : 0;
    const rangeEnd = Number.isFinite(range.end) ? range.end : 0;
    const rangeTotal = rangeEnd - rangeStart;
    if (rangeTotal <= 0) return null;
    const rowStart = Number.isFinite(row.clientStartEpoch) ? row.clientStartEpoch : 0;
    const dur = Number.isFinite(row.duration) && row.duration > 0 ? row.duration : 0;
    if (rowStart < rangeStart || rowStart > rangeEnd) return null;
    const offsetPct = ((rowStart - rangeStart) / rangeTotal) * 100;
    // Clamp: min bar of 0.5% but never let offsetPct + widthPct exceed 100%
    const availablePct = Math.max(0, 100 - offsetPct);
    const rawWidthPct = (dur / rangeTotal) * 100;
    const minWidth = Math.min(0.5, availablePct);
    const widthPct = Math.min(Math.max(rawWidthPct, minWidth), availablePct);
    const timingBreakdown = calculateTimingSegments(row.timings || {}, dur);
    const segments = [];
    let segTotalPct = 0;
    for (const segment of timingBreakdown.segments) {
      if (segment.duration > 0 && dur > 0) {
        const pct = (segment.duration / dur) * 100;
        segments.push({ label: segment.label, pct });
        segTotalPct += pct;
      }
    }
    // Normalize segments so their total never exceeds 100%
    if (segTotalPct > 100) {
      const scale = 100 / segTotalPct;
      for (const seg of segments) seg.pct = seg.pct * scale;
    }
    return { offsetPct, widthPct, segments };
  }

  /**
   * Compute the epoch-ms start/end range that bounds all rows with valid timing data.
   * Extracted to allow O(1) per-row waterfall rendering: callers compute this once per
   * render pass and pass the result to computeWaterfallBar for every row.
   * Pure function — no DOM/state dependency.
   * @param {Array} rows
   * @returns {{ start: number, end: number }|null}
   */
  function computeWaterfallRange(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    let rangeStart = Infinity;
    let rangeEnd = -Infinity;
    for (const r of rows) {
      if (Number.isFinite(r.clientStartEpoch) && r.clientStartEpoch > 0) {
        if (r.clientStartEpoch < rangeStart) rangeStart = r.clientStartEpoch;
        const end = r.clientStartEpoch + (Number.isFinite(r.duration) ? r.duration : 0);
        if (end > rangeEnd) rangeEnd = end;
      }
    }
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
      return null;
    }
    return { start: rangeStart, end: rangeEnd };
  }

  // ============================================================
  // Section 4: State Management
  // ============================================================
  const state = {
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    // Auto-hide is a fit decision, not a preference: it stays here and never
    // reaches COL_PREF_KEY, so column.visible keeps meaning the reader's own
    // choice everywhere it is saved, presented or restored.
    autoHiddenColumnIds: new Set(),
    pinnedColumnIds: new Set(),
    rows: [],
    retainedRows: new Set(),
    activeRows: new Set(),
    filteredRows: [], // [U5] cache for filtered rows
    pendingLiveRows: [],
    liveRowsAwaitingRender: [],
    retention: {
      requestLimit: DEFAULT_REQUEST_RETENTION_LIMIT,
      unlimited: true,
      settingWarning: '',
      evictedRequests: 0,
      omittedBodies: 0,
      evictedBodies: 0,
      truncatedBodies: 0,
      responseCacheBytes: 0,
      responseCacheRows: new Map(),
    },
    visibleBytes: 0,
    renderedActiveFilterCount: 0,
    selectedRow: null, // [U5] track by row object reference, not index
    focusedRow: null,
    pendingRowFocusId: null,
    pendingHeaderFocusId: null,
    pendingHeaderFocusResizer: false,
    selectedRows: new Set(), // [U7] multi-row selection
    comparedRows: null,     // [U8] two-request diff comparison: [rowA, rowB] or null
    comparisonInvokingRowId: null, // [U8] row id that opened the comparison (for focus restoration)
    highlightedRows: new Map(), // [U7] highlighted rows: row -> color class
    onResponseContentChanged: null,
    syncSearchUI: null,
    syncDomainSummary: null,
    domainSummaryVisible: false,
    automaticResponsePrefetchScheduler: null,
    columnFilterRules: DEFAULT_COLUMN_FILTER_RULES(),
    sort: { ...DEFAULT_SORT },
    nextId: 1,
    paused: false,
    autoScroll: true,
    clearUndoSnapshot: null,
    sampleCaptureActive: false,
    sampleCapturePreviousPaused: false,
    sampleCapturePreviousColumnFilterRules: null,
    // Cached waterfall time range — computed once per render by renderBody(),
    // then consumed O(1) per row by createTableRow(). Null when Waterfall is hidden.
    waterfallRange: null,
    // Unified search state (replaces globalFilter + deepSearch)
    search: {
      keywords: [],       // array of {query: string, colorIdx: number}
      matches: [],        // array of row references that match any keyword
      currentIndex: -1,   // index into matches[] for navigation
      matchesOnly: false, // true = render only rows that match a search keyword
      scope: DEFAULT_SEARCH_SCOPE(),
      options: DEFAULT_SEARCH_OPTIONS(), // caseSensitive / regex / wholeWord

      // Per-row match maps keep color and keyword correspondence lookup linear.
      rowColors: new Map(),
      rowKeywords: new Map(),
      // Per-keyword matches: kwIndex -> { matches: [rows], currentIndex: number }
      perKeyword: new Map(),
    },
  };
  let clearUndoTimer = null;
  let pendingLiveCommitTimer = null;

  function createAutomaticResponsePrefetchScheduler(options) {
    const config = options || {};
    if (typeof config.isEligible !== 'function') {
      throw new TypeError('Automatic response prefetch requires an eligibility check.');
    }
    if (typeof config.loadRow !== 'function') {
      throw new TypeError('Automatic response prefetch requires a row loader.');
    }

    const concurrency = Number.isInteger(config.concurrency) && config.concurrency > 0
      ? config.concurrency
      : AUTOMATIC_RESPONSE_PREFETCH_CONCURRENCY;
    const failureDebounceMs =
      Number.isFinite(config.failureAnnounceMs) && config.failureAnnounceMs >= 0
        ? config.failureAnnounceMs
        : AUTOMATIC_RESPONSE_PREFETCH_FAILURE_DEBOUNCE_MS;
    const failureMaxWaitMs =
      Number.isFinite(config.failureMaxWaitMs) && config.failureMaxWaitMs >= failureDebounceMs
        ? config.failureMaxWaitMs
        : Math.max(AUTOMATIC_RESPONSE_PREFETCH_FAILURE_MAX_WAIT_MS, failureDebounceMs);
    const isCached =
      typeof config.isCached === 'function'
        ? config.isCached
        : (row) => typeof row.responseContent === 'string';
    const getExistingPromise =
      typeof config.getExistingPromise === 'function'
        ? config.getExistingPromise
        : (row) => row._responseContentPromise;
    const shouldReportFailure =
      typeof config.shouldReportFailure === 'function'
        ? config.shouldReportFailure
        : () => true;
    const onSettled = typeof config.onSettled === 'function' ? config.onSettled : () => {};
    const onFailureSummary =
      typeof config.onFailureSummary === 'function' ? config.onFailureSummary : () => {};
    const onInternalError =
      typeof config.onInternalError === 'function' ? config.onInternalError : () => {};
    const getFailureContext =
      typeof config.getFailureContext === 'function' ? config.getFailureContext : () => undefined;

    let queue = [];
    let queueHead = 0;
    let queuedTombstones = 0;
    const queuedRows = new Map();
    const backgroundRows = new Map();
    const observedForegroundRows = new Map();
    const idleWaiters = new Set();
    let draining = false;
    const pendingFailureRows = new Set();
    let failureDebounceTimer = null;
    let failureMaxWaitTimer = null;
    let failureContext;

    const reportInternalError = (error) => {
      try {
        onInternalError(error);
      } catch (_reportingError) {
        console.error('Network+ automatic response prefetch encountered an internal reporting error.');
      }
    };

    const callSafely = (callback, ...args) => {
      try {
        return callback(...args);
      } catch (error) {
        reportInternalError(error);
        return undefined;
      }
    };

    const rowIsEligible = (row) => callSafely(config.isEligible, row) === true;
    const rowIsCached = (row) => callSafely(isCached, row) === true;
    const existingPromiseFor = (row) => callSafely(getExistingPromise, row);

    const isIdle = () =>
      queuedRows.size === 0 &&
      backgroundRows.size === 0 &&
      observedForegroundRows.size === 0;

    const resolveIdleWaiters = () => {
      if (!isIdle()) return;
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    };

    const compactQueue = () => {
      if (queuedRows.size === 0) {
        queue = [];
        queueHead = 0;
        queuedTombstones = 0;
        return;
      }
      const remainingStorage = queue.length - queueHead;
      const shouldCompactConsumedPrefix =
        queueHead >= AUTOMATIC_RESPONSE_PREFETCH_QUEUE_COMPACT_THRESHOLD &&
        queueHead * 2 >= queue.length;
      const shouldCompactTombstones =
        remainingStorage >= AUTOMATIC_RESPONSE_PREFETCH_QUEUE_COMPACT_THRESHOLD &&
        queuedTombstones * 2 >= remainingStorage;
      if (!shouldCompactConsumedPrefix && !shouldCompactTombstones) return;
      const compacted = [];
      for (let index = queueHead; index < queue.length; index++) {
        const entry = queue[index];
        if (entry && entry.row) compacted.push(entry);
      }
      queue = compacted;
      queueHead = 0;
      queuedTombstones = 0;
    };

    const detachQueuedRow = (row) => {
      const entry = queuedRows.get(row);
      if (!entry) return false;
      queuedRows.delete(row);
      if (entry.row) {
        entry.row = null;
        queuedTombstones += 1;
      }
      return true;
    };

    const takeNextQueuedRow = () => {
      while (queueHead < queue.length) {
        const entry = queue[queueHead];
        queue[queueHead] = null;
        queueHead += 1;
        if (!entry || !entry.row) continue;
        const row = entry.row;
        entry.row = null;
        queuedRows.delete(row);
        return row;
      }
      return null;
    };

    const clearFailureTimers = () => {
      if (failureDebounceTimer) clearTimeout(failureDebounceTimer);
      if (failureMaxWaitTimer) clearTimeout(failureMaxWaitTimer);
      failureDebounceTimer = null;
      failureMaxWaitTimer = null;
    };

    const resetFailureSummary = () => {
      pendingFailureRows.clear();
      failureContext = undefined;
      clearFailureTimers();
    };

    const flushFailureSummary = () => {
      clearFailureTimers();
      const context = failureContext;
      const liveFailures = Array.from(pendingFailureRows).filter(
        (row) => rowIsEligible(row) && !rowIsCached(row),
      );
      pendingFailureRows.clear();
      failureContext = undefined;
      if (liveFailures.length > 0) {
        callSafely(onFailureSummary, liveFailures.length, context);
      }
    };

    const queueFailureSummary = (row, error) => {
      if (callSafely(shouldReportFailure, row, error) !== true) return;
      const startsWindow = pendingFailureRows.size === 0;
      pendingFailureRows.add(row);
      if (startsWindow) {
        failureContext = callSafely(getFailureContext);
        failureMaxWaitTimer = setTimeout(flushFailureSummary, failureMaxWaitMs);
      }
      if (failureDebounceTimer) clearTimeout(failureDebounceTimer);
      failureDebounceTimer = setTimeout(flushFailureSummary, failureDebounceMs);
    };

    let drain;

    const settleObservedForeground = (row, record, error, result) => {
      if (observedForegroundRows.get(row) !== record) return;
      observedForegroundRows.delete(row);
      const eligible = rowIsEligible(row);
      if (!record.canceled && eligible) {
        callSafely(onSettled, row, error || null, 'foreground', result);
      }
      drain();
      resolveIdleWaiters();
    };

    const observeForegroundPromise = (row, promise) => {
      const record = { canceled: false };
      observedForegroundRows.set(row, record);
      Promise.resolve(promise)
        .then(
          (result) => settleObservedForeground(row, record, null, result),
          (error) => settleObservedForeground(row, record, error, undefined),
        )
        .catch(reportInternalError);
    };

    const settleBackground = (row, record, error, result) => {
      if (backgroundRows.get(row) !== record) return;
      backgroundRows.delete(row);
      const eligible = rowIsEligible(row);
      if (!record.canceled && eligible) {
        if (error) queueFailureSummary(row, error);
        callSafely(onSettled, row, error || null, 'background', result);
      }
      drain();
      resolveIdleWaiters();
    };

    const startBackground = (row) => {
      const record = { canceled: false };
      backgroundRows.set(row, record);
      let pending;
      try {
        pending = config.loadRow(row);
      } catch (error) {
        settleBackground(row, record, error, undefined);
        return;
      }
      Promise.resolve(pending)
        .then(
          (result) => settleBackground(row, record, null, result),
          (error) => settleBackground(row, record, error, undefined),
        )
        .catch(reportInternalError);
    };

    drain = () => {
      if (draining) return;
      draining = true;
      try {
        while (backgroundRows.size < concurrency) {
          const row = takeNextQueuedRow();
          if (!row) break;
          if (!rowIsEligible(row) || rowIsCached(row)) continue;
          const existingPromise = existingPromiseFor(row);
          if (existingPromise) {
            observeForegroundPromise(row, existingPromise);
            continue;
          }
          startBackground(row);
        }
      } finally {
        draining = false;
        compactQueue();
        resolveIdleWaiters();
      }
    };

    const enqueue = (row) => {
      if (
        !row ||
        !rowIsEligible(row) ||
        rowIsCached(row) ||
        queuedRows.has(row) ||
        backgroundRows.has(row) ||
        observedForegroundRows.has(row)
      ) {
        return false;
      }
      const existingPromise = existingPromiseFor(row);
      if (existingPromise) {
        observeForegroundPromise(row, existingPromise);
        return true;
      }
      const entry = { row };
      queue.push(entry);
      queuedRows.set(row, entry);
      drain();
      return true;
    };

    const observeForeground = (row, promise) => {
      if (!row || !promise || backgroundRows.has(row) || observedForegroundRows.has(row)) {
        return false;
      }
      if (!detachQueuedRow(row)) return false;
      observeForegroundPromise(row, promise);
      compactQueue();
      drain();
      return true;
    };

    const cancelRows = (rows) => {
      for (const row of rows || []) {
        detachQueuedRow(row);
        pendingFailureRows.delete(row);
        const backgroundRecord = backgroundRows.get(row);
        if (backgroundRecord) backgroundRecord.canceled = true;
        const foregroundRecord = observedForegroundRows.get(row);
        if (foregroundRecord) foregroundRecord.canceled = true;
      }
      if (pendingFailureRows.size === 0) resetFailureSummary();
      compactQueue();
      drain();
      resolveIdleWaiters();
    };

    const resumeRows = (rows) => {
      for (const row of rows || []) {
        const backgroundRecord = backgroundRows.get(row);
        if (backgroundRecord) {
          backgroundRecord.canceled = false;
          continue;
        }
        const foregroundRecord = observedForegroundRows.get(row);
        if (foregroundRecord) {
          foregroundRecord.canceled = false;
          continue;
        }
        enqueue(row);
      }
      drain();
    };

    const markRecovered = (row) => {
      if (!pendingFailureRows.delete(row)) return false;
      if (pendingFailureRows.size === 0) resetFailureSummary();
      return true;
    };

    const whenIdle = () => {
      if (isIdle()) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.add(resolve));
    };

    const getSnapshot = () => ({
      queued: queuedRows.size,
      queueStorage: Math.max(0, queue.length - queueHead),
      backgroundInFlight: backgroundRows.size,
      foregroundObserved: observedForegroundRows.size,
      pendingFailureCount: pendingFailureRows.size,
    });

    return {
      enqueue,
      observeForeground,
      cancelRows,
      resumeRows,
      markRecovered,
      resetFailureSummary,
      whenIdle,
      getSnapshot,
    };
  }

  function cancelAutomaticResponsePrefetchRows(rows, resetFailures) {
    const scheduler = state.automaticResponsePrefetchScheduler;
    if (!scheduler) return;
    scheduler.cancelRows(rows);
    if (resetFailures) scheduler.resetFailureSummary();
  }

  function loadRetentionSetting() {
    let parsed = null;
    let parseWarning = '';
    try {
      const saved = localStorage.getItem(RETENTION_KEY);
      if (saved) parsed = JSON.parse(saved);
    } catch (_error) {
      parseWarning = 'Could not read the saved retention setting; restored the unlimited default.';
    }
    const normalized = normalizeRetentionSetting(parsed);
    state.retention.requestLimit = normalized.setting.requestLimit;
    state.retention.unlimited = normalized.setting.unlimited;
    state.retention.settingWarning = parseWarning || normalized.warning;
  }

  function saveRetentionSetting() {
    try {
      localStorage.setItem(
        RETENTION_KEY,
        JSON.stringify({
          requestLimit: state.retention.requestLimit,
          unlimited: state.retention.unlimited,
        }),
      );
      state.retention.settingWarning = '';
      return true;
    } catch (_error) {
      state.retention.settingWarning = 'Could not save the retention setting; it applies only to this panel session.';
      return false;
    }
  }

  function queueRetentionSummary(action) {
    const retention = state.retention;
    queueRetentionAnnouncement(
      action +
        '. Totals: ' + retention.evictedRequests + ' requests evicted, ' +
        retention.omittedBodies + ' bodies omitted, ' +
        retention.evictedBodies + ' cached bodies evicted, and ' +
        retention.truncatedBodies + ' previews truncated.',
    );
  }

  function releaseResponseContent(row, nextState, countEviction) {
    const cachedBytes = state.retention.responseCacheRows.get(row) || 0;
    if (cachedBytes > 0 || state.retention.responseCacheRows.has(row)) {
      state.retention.responseCacheRows.delete(row);
      state.retention.responseCacheBytes = Math.max(0, state.retention.responseCacheBytes - cachedBytes);
      if (countEviction) state.retention.evictedBodies += 1;
      row._responseContentPromise = null;
    }
    row.responseContent = null;
    row.responseContentText = null;
    row.responseContentEncoding = '';
    row.responseContentBytes = 0;
    row.responseContentState = nextState;
  }

  function admitResponsePayload(row, payload) {
    if (!row || row._retentionDisposed) {
      throw new Error('Response content arrived after its request was evicted');
    }
    if (payload.bytes > MAX_RESPONSE_BODY_BYTES) {
      releaseResponseContent(row, 'omitted', false);
      row.responseContentReason =
        'Body is ' + fmtBytes(payload.bytes) + '; the per-body cache limit is ' + fmtBytes(MAX_RESPONSE_BODY_BYTES) + '.';
      if (!row._responseOmissionCounted) {
        row._responseOmissionCounted = true;
        state.retention.omittedBodies += 1;
        queueRetentionSummary('Response body omitted by the 1 MiB retention limit');
      }
      updateRetentionStatus();
      throw new Error('Response body omitted for request ' + row.id + ': ' + row.responseContentReason);
    }

    let evictedBodyCount = 0;
    while (state.retention.responseCacheBytes + payload.bytes > MAX_RESPONSE_CACHE_BYTES) {
      const oldestEntry = state.retention.responseCacheRows.entries().next().value;
      if (!oldestEntry) break;
      const oldestRow = oldestEntry[0];
      releaseResponseContent(oldestRow, 'evicted', true);
      evictedBodyCount += 1;
      oldestRow.responseContentReason = BODY_EVICTED_REASON;
      if (state.onResponseContentChanged) state.onResponseContentChanged(oldestRow);
    }
    if (evictedBodyCount > 0) {
      queueRetentionSummary(evictedBodyCount + ' cached response bodies evicted by the 32 MiB cache limit');
    }
    releaseResponseContent(row, 'loading', false);
    row.responseContent = payload.content;
    row.responseContentEncoding = payload.encoding;
    row.responseContentText = payload.text;
    row.responseContentBytes = payload.bytes;
    row.responseContentState = 'cached';
    row.responseContentReason = '';
    row.responseContentError = null;
    if (state.automaticResponsePrefetchScheduler) {
      state.automaticResponsePrefetchScheduler.markRecovered(row);
    }
    if (payload.bytes > 0) {
      state.retention.responseCacheRows.set(row, payload.bytes);
      state.retention.responseCacheBytes += payload.bytes;
    }
    updateRetentionStatus();
    if (state.onResponseContentChanged) state.onResponseContentChanged(row);
    return row;
  }

  function touchResponseCacheRow(row) {
    if (!state.retention.responseCacheRows.has(row)) return;
    const bytes = state.retention.responseCacheRows.get(row);
    state.retention.responseCacheRows.delete(row);
    state.retention.responseCacheRows.set(row, bytes);
  }

  function cleanupEvictedRowReferences(evictedRows, countRetention) {
    if (!evictedRows || evictedRows.length === 0) return;
    cancelAutomaticResponsePrefetchRows(evictedRows, false);
    const evictedSet = new Set(evictedRows);
    if (typeof state.streamRowEvictionSweep === 'function') state.streamRowEvictionSweep(evictedSet);
    const search = state.search;
    const previousMatches = search.matches;
    const previousIndex = search.currentIndex;
    const plan = createRowEvictionPlan(evictedRows, {
      allRows: state.rows,
      selectedRow: state.selectedRow,
      focusedRow: state.focusedRow,
      selectedRows: Array.from(state.selectedRows),
      searchMatches: search.matches,
      pendingRows: state.pendingLiveRows,
    });

    const evictedVisibleBytes = state.filteredRows.reduce(
      (total, row) => total + (evictedSet.has(row) ? row.size || 0 : 0),
      0,
    );
    state.filteredRows = state.filteredRows.filter((row) => !evictedSet.has(row));
    state.liveRowsAwaitingRender = state.liveRowsAwaitingRender.filter((row) => !evictedSet.has(row));
    state.visibleBytes = Math.max(0, state.visibleBytes - evictedVisibleBytes);
    state.selectedRows = new Set(plan.retainedSelectedRows);
    state.pendingLiveRows.length = 0;
    state.pendingLiveRows.push(...plan.retainedPendingRows);
    search.matches = plan.retainedSearchMatches;
    search.currentIndex = preserveMatchingRowIndex(previousMatches, previousIndex, search.matches);
    for (const [keywordIndex, keywordState] of search.perKeyword) {
      const matches = keywordState.matches.filter((row) => !evictedSet.has(row));
      search.perKeyword.set(keywordIndex, {
        matches,
        currentIndex: preserveMatchingRowIndex(keywordState.matches, keywordState.currentIndex, matches),
      });
    }

    const renderedRows = $('#tbody') ? $all('tr[data-row-id]', $('#tbody')) : [];
    const evictedRowIds = new Set(Array.from(evictedSet, (row) => String(row.id)));
    for (const renderedRow of renderedRows) {
      if (evictedRowIds.has(renderedRow.dataset.rowId)) renderedRow.remove();
    }

    let detailsWereCleared = false;
    for (const row of evictedRows) {
      search.rowColors.delete(row);
      search.rowKeywords.delete(row);
      state.highlightedRows.delete(row);
      releaseResponseContent(row, 'row-evicted', false);
      row._responseContentPromise = null;
      row._responsePayloadPromise = null;
      row._retentionDisposed = true;
      state.retainedRows.delete(row);
      state.activeRows.delete(row);
      row._reqObj = null;
      if (state.pendingRowFocusId === String(row.id)) state.pendingRowFocusId = null;
      if (state.selectedRow === row) {
        state.selectedRow = null;
        detailsWereCleared = true;
      }
      if (state.focusedRow === row) state.focusedRow = null;
      if (state.comparedRows && state.comparedRows.includes(row)) {
        state.comparedRows = null;
        state.comparisonInvokingRowId = null;
        hideComparisonPanel();
        detailsWereCleared = true;
      }
    }
    if (detailsWereCleared) clearDetailsPanel();
    if (countRetention) {
      state.retention.evictedRequests += evictedRows.length;
      queueRetentionSummary(evictedRows.length + ' oldest requests evicted by the retention limit');
    }
    updateRetentionStatus();
  }

  function removeRowsFromState(rows, countRetention) {
    const removedSet = new Set(rows || []);
    if (removedSet.size === 0) return;
    const sampleCaptureWasActive = state.sampleCaptureActive;
    const evictedRows = state.rows.filter((row) => removedSet.has(row));
    state.rows = state.rows.filter((row) => !removedSet.has(row));
    cleanupEvictedRowReferences(evictedRows, countRetention);
    if (state.sampleCaptureActive && state.rows.length === 0 && exitSampleCaptureMode()) {
      setStatus(
        state.paused
          ? 'Local sample capture removed. Recording remains paused.'
          : 'Local sample capture removed. Live capture resumed.',
      );
    } else if (sampleCaptureWasActive && evictedRows.length > 0) {
      setStatus(formatSampleCaptureRemainingStatus(state.rows.length));
    }
  }

  function normalizeIncomingResponseContent(rows, source) {
    for (const row of rows) {
      if (!isRetainedRow(row, state.retainedRows)) continue;
      if (isLiveStreamRow(row)) {
        // A connection's first frames often share the commit batch with its
        // open-attempt; publish them rather than admitting a live transcript
        // into the cache it must never join.
        if (typeof row.responseContent === 'string') publishStreamTranscript(row);
        continue;
      }
      if (typeof row.responseContent === 'string') {
        const payload = measureResponsePayload(row.responseContent, row.responseContentEncoding, resolveRowResponseCharset(row), isHtmlLikeMime(row.type));
        releaseResponseContent(row, 'loading', false);
        try {
          admitResponsePayload(row, payload);
        } catch (error) {
          row.responseContentError = error;
        }
      }
      if (source === 'import' || source === 'sample') row._reqObj = null;
    }
  }

  function addRowsWithRetention(rows, source) {
    const incomingRows = rows || [];
    const captureSource = ['sample', 'import', 'live'].includes(source) ? source : 'live';
    for (const row of incomingRows) {
      row._managedRetention = true;
      row._retentionDisposed = false;
      row._captureSource = captureSource;
      state.retainedRows.add(row);
      state.activeRows.add(row);
    }
    const undoSnapshot = state.clearUndoSnapshot;
    const retentionPlan = planClearUndoRetention(
      undoSnapshot ? undoSnapshot.rows : [],
      state.rows,
      incomingRows,
      state.retention.requestLimit,
      state.retention.unlimited,
    );
    state.rows = retentionPlan.retainedActiveRows;
    if (undoSnapshot) undoSnapshot.rows = retentionPlan.retainedHeldRows;
    cleanupEvictedRowReferences(retentionPlan.evictedRows, true);
    reconcileClearUndoAfterRetentionPressure();
    const retainedIncomingRows = retentionPlan.retainedIncomingRows.filter((row) =>
      isRetainedRow(row, state.retainedRows),
    );
    normalizeIncomingResponseContent(retainedIncomingRows, source);
    return retainedIncomingRows;
  }

  function cancelPendingLiveCommitTimer() {
    if (pendingLiveCommitTimer === null) return;
    clearTimeout(pendingLiveCommitTimer);
    pendingLiveCommitTimer = null;
  }

  function armPendingLiveCommitTimer() {
    if (pendingLiveCommitTimer !== null) return;
    pendingLiveCommitTimer = setTimeout(() => {
      pendingLiveCommitTimer = null;
      commitPendingLiveRows();
    }, LIVE_COMMIT_MAX_WAIT_MS);
  }

  function commitPendingLiveRows() {
    cancelPendingLiveCommitTimer();
    const queuedRows = state.pendingLiveRows.splice(0, state.pendingLiveRows.length);
    if (queuedRows.length === 0) return [];
    const liveRows = addRowsWithRetention(queuedRows, 'live');
    if (state.automaticResponsePrefetchScheduler) {
      for (const row of liveRows) {
        state.automaticResponsePrefetchScheduler.enqueue(row);
      }
    }
    state.liveRowsAwaitingRender.push(...liveRows);
    return liveRows;
  }

  function recordSkippedImportRows(skippedCount) {
    if (!Number.isInteger(skippedCount) || skippedCount <= 0) return;
    state.nextId += skippedCount;
    state.retention.evictedRequests += skippedCount;
    updateRetentionStatus();
    queueRetentionSummary(skippedCount + ' imported requests skipped by the retention limit');
  }

  function clearStoredRows() {
    removeRowsFromState(state.rows.slice(), false);
    state.filteredRows = [];
    state.visibleBytes = 0;
  }

  function createClearUndoSnapshot(searchPanelVisible) {
    const rows = state.rows.slice();
    const currentSearchRow =
      state.search.currentIndex >= 0 && state.search.currentIndex < state.search.matches.length
        ? state.search.matches[state.search.currentIndex]
        : null;
    const searchPerKeywordCurrentRows = Array.from(
      state.search.perKeyword,
      ([keywordIndex, keywordState]) => [
        keywordIndex,
        keywordState.currentIndex >= 0 && keywordState.currentIndex < keywordState.matches.length
          ? keywordState.matches[keywordState.currentIndex]
          : null,
      ],
    ).filter((entry) => entry[1]);
    return {
      rows,
      originalCount: rows.length,
      sampleCaptureActive: state.sampleCaptureActive,
      context: {
        columnFilterRules: deserializeFilterState(serializeFilterState(state.columnFilterRules)),
        searchKeywords: state.search.keywords.map((keyword) => ({
          query: String(keyword.query || ''),
          colorIdx: Number.isInteger(keyword.colorIdx) ? keyword.colorIdx : 0,
        })),
        searchScope: { ...state.search.scope },
        searchCurrentRow: currentSearchRow,
        searchPerKeywordCurrentRows,
        selectedRow: state.selectedRow,
        focusedRow: state.focusedRow,
        selectedRows: Array.from(state.selectedRows),
        highlightedRows: Array.from(state.highlightedRows.entries()),
        comparedRows: state.comparedRows ? state.comparedRows.slice() : null,
        comparisonInvokingRowId: state.comparisonInvokingRowId,
        sort: { ...state.sort },
        paused: state.paused,
        autoScroll: state.autoScroll,
        sampleCaptureActive: state.sampleCaptureActive,
        sampleCapturePreviousPaused: state.sampleCapturePreviousPaused,
        sampleCapturePreviousColumnFilterRules: state.sampleCapturePreviousColumnFilterRules
          ? deserializeFilterState(serializeFilterState(state.sampleCapturePreviousColumnFilterRules))
          : null,
        searchPanelVisible: searchPanelVisible === true,
        searchMatchesOnly: state.search.matchesOnly === true,
        searchOptions: { ...state.search.options },
      },
    };
  }

  function detachStoredRowsForClearUndo() {
    cancelAutomaticResponsePrefetchRows(state.rows, true);
    for (const row of state.rows) state.activeRows.delete(row);
    state.rows = [];
    state.filteredRows = [];
    state.visibleBytes = 0;
    if (state.sampleCaptureActive) exitSampleCaptureMode();
  }

  function updateClearUndoAction() {
    const button = $('#undoClearBtn');
    if (!button) return;
    const snapshot = state.clearUndoSnapshot;
    const remainingCount = snapshot
      ? snapshot.rows.filter((row) => isRetainedRow(row, state.retainedRows)).length
      : 0;
    const available = !!snapshot && remainingCount > 0;
    button.hidden = !available;
    button.disabled = !available;
    button.setAttribute(
      'aria-label',
      available
        ? 'Undo clear, ' + formatRequestCount(remainingCount) + ' available'
        : 'Undo clear',
    );
    button.title = available
      ? 'Restore the retained requests and working context from the last ' + (snapshot.actionLabel || 'Clear')
      : '';
  }

  function consumeClearUndoSnapshot(action) {
    const snapshot = state.clearUndoSnapshot;
    const transition = planClearUndoAction(snapshot, action);
    if (!transition.consume) return null;
    const button = $('#undoClearBtn');
    const undoHadFocus = !!button && document.activeElement === button;
    state.clearUndoSnapshot = null;
    if (clearUndoTimer) {
      clearTimeout(clearUndoTimer);
      clearUndoTimer = null;
    }
    updateClearUndoAction();
    return { snapshot, disposition: transition.disposition, undoHadFocus };
  }

  function focusClearAfterUndoUnavailable(consumed) {
    if (!consumed || !consumed.undoHadFocus) return;
    const clearButton = $('#clearBtn');
    if (clearButton) clearButton.focus({ preventScroll: true });
  }

  function disposeClearUndoSnapshot(action, statusMessage) {
    const consumed = consumeClearUndoSnapshot(action);
    if (!consumed || consumed.disposition !== 'dispose') return false;
    const retainedSnapshotRows = consumed.snapshot.rows.filter((row) =>
      isRetainedRow(row, state.retainedRows),
    );
    cleanupEvictedRowReferences(retainedSnapshotRows, false);
    focusClearAfterUndoUnavailable(consumed);
    if (statusMessage) setStatus(statusMessage);
    return true;
  }

  function armClearUndoSnapshot(snapshot) {
    if (!snapshot || snapshot.rows.length === 0) return false;
    state.clearUndoSnapshot = snapshot;
    updateClearUndoAction();
    clearUndoTimer = setTimeout(() => {
      if (state.clearUndoSnapshot !== snapshot) return;
      const remainingCount = snapshot.rows.filter((row) =>
        isRetainedRow(row, state.retainedRows),
      ).length;
      disposeClearUndoSnapshot(
        'timeout',
        'Undo expired; ' +
          formatRequestCount(remainingCount) +
          ' from the last ' +
          (snapshot.actionLabel || 'Clear') +
          ' released.',
      );
    }, CLEAR_UNDO_TIMEOUT_MS);
    return true;
  }

  function reconcileClearUndoAfterRetentionPressure() {
    const snapshot = state.clearUndoSnapshot;
    if (!snapshot) return;
    snapshot.rows = snapshot.rows.filter((row) => isRetainedRow(row, state.retainedRows));
    if (snapshot.rows.length > 0) {
      updateClearUndoAction();
      return;
    }
    const consumed = consumeClearUndoSnapshot('retention-exhausted');
    focusClearAfterUndoUnavailable(consumed);
    setStatus('Cleared requests were evicted by the retention limit; Undo is no longer available.');
  }

  // ============================================================
  // Section 5: Theme
  // ============================================================
  // One tricky called/fallbackAttempted state machine serves every simple
  // string preference (theme, language): extension storage first, panel
  // localStorage as the fallback, 'system' as the default, and the named
  // wrappers keep the public (and tested) API stable.
  function loadStoredPref(key, label, cb) {
    let called = false;
    let fallbackAttempted = false;
    const done = (v, warn) => {
      if (called) return;
      called = true;
      cb(v, warn);
    };
    try {
      chrome.storage.local.get([key], (obj) => {
        if (called) return;
        const runtimeErr = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError;
        if (runtimeErr) {
          if (fallbackAttempted) return;
          fallbackAttempted = true;
          try {
            done(localStorage.getItem(key) || 'system');
          } catch (_e) {
            done('system', label + ' preference could not be loaded.');
          }
          return;
        }
        try {
          done(obj && obj[key] ? obj[key] : localStorage.getItem(key) || 'system');
        } catch (_e) {
          // Primary storage succeeded; localStorage probe failure is a first-run default, not a total failure
          done('system');
        }
      });
    } catch (_e) {
      if (called || fallbackAttempted) return;
      fallbackAttempted = true;
      try {
        done(localStorage.getItem(key) || 'system');
      } catch (_err) {
        done('system', label + ' preference could not be loaded.');
      }
    }
  }

  function saveStoredPref(key, label, v) {
    let saved = false;
    let fallbackAttempted = false;
    try {
      const data = {};
      data[key] = v;
      chrome.storage.local.set(data, () => {
        if (saved || fallbackAttempted) return;
        const runtimeErr = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError;
        if (!runtimeErr) {
          saved = true;
          return;
        }
        fallbackAttempted = true;
        try {
          localStorage.setItem(key, v);
          saved = true;
        } catch (_e) {
          setStatus(label + ' preference could not be saved.');
        }
      });
    } catch (_e) {
      if (saved || fallbackAttempted) return;
      fallbackAttempted = true;
      try {
        localStorage.setItem(key, v);
        saved = true;
      } catch (_err) {
        setStatus(label + ' preference could not be saved.');
      }
    }
  }

  function loadThemePref(cb) {
    loadStoredPref(THEME_KEY, 'Theme', cb);
  }

  // Search preferences persist like the theme: booleans only, never keyword
  // text (see normalizeSearchPrefs). Failures fall back to defaults silently —
  // preferences are a convenience, not data.
  function loadSearchPrefs(cb) {
    // Deliver asynchronously even if the storage backend calls back
    // synchronously, so init-order assumptions cannot break.
    const deliver = (value) => queueMicrotask(() => cb(normalizeSearchPrefs(value)));
    try {
      chrome.storage.local.get([SEARCH_PREFS_KEY], (obj) => {
        const runtimeErr = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError;
        deliver(runtimeErr ? null : obj && obj[SEARCH_PREFS_KEY]);
      });
    } catch (_e) {
      deliver(null);
    }
  }

  function saveSearchPrefs(prefs) {
    try {
      chrome.storage.local.set({ [SEARCH_PREFS_KEY]: normalizeSearchPrefs(prefs) }, () => {
        void (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError);
      });
    } catch (_e) {
      // Storage may be unavailable outside the extension context; prefs are optional.
    }
  }

  function currentSearchPrefs() {
    return {
      scope: { ...state.search.scope },
      options: { ...state.search.options },
      matchesOnly: state.search.matchesOnly === true,
    };
  }

  function saveThemePref(v) {
    saveStoredPref(THEME_KEY, 'Theme', v);
  }

  function applyTheme(pref) {
    const html = document.documentElement;
    html.removeAttribute('data-theme');
    if (pref === 'light') html.setAttribute('data-theme', 'light');
    if (pref === 'dark') html.setAttribute('data-theme', 'dark');
    const select = $('#themeSelect');
    if (select) select.value = THEMES.includes(pref) ? pref : 'system';
    setStatus('Theme=' + pref);
  }

  // ============================================================
  // Section 5b: Language (explanatory text only)
  // ============================================================
  // The language preference persists exactly like the theme through the
  // shared loadStoredPref/saveStoredPref machinery. Only explanations and
  // guide dialogs translate — control labels stay English by design.
  function loadLangPref(cb) {
    loadStoredPref(LANG_KEY, 'Language', cb);
  }

  function saveLangPref(v) {
    saveStoredPref(LANG_KEY, 'Language', v);
  }

  function resolveLanguage(pref) {
    if (pref === 'en' || pref === 'ja') return pref;
    const nav =
      typeof navigator !== 'undefined' && navigator
        ? navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : '')
        : '';
    return /^ja([-_]|$)/i.test(String(nav || '')) ? 'ja' : 'en';
  }

  // Every entry carries both languages; the English text doubles as the
  // authored fallback in panel.html, so the two must stay in sync.
  const UI_TEXT = {
    undockHintTitle: {
      en: '🪟 Keep DevTools open',
      ja: '🪟 DevTools は閉じないでください',
    },
    undockHintIntro: {
      en: "Capture runs inside the original tab's DevTools — this tab is a live mirror of it.",
      ja: 'キャプチャは元のタブの DevTools 内で動いています。このタブはそのライブミラーです。',
    },
    undockHintWarning: {
      en: '⚠️ Closing DevTools stops capture and freezes this tab.',
      ja: '⚠️ DevTools を閉じるとキャプチャが止まり、このタブの更新も停止します。',
    },
    undockHintStepsTitle: {
      en: 'DevTools is docked, so both stay visible. Tidy it away with a one-time setup:',
      ja: '現在 DevTools はドック表示のため、両方が見えています。次の一度きりの設定で片付きます:',
    },
    undockHintStep1: {
      en: 'Open the ⋮ menu at the top right of DevTools.',
      ja: 'DevTools 右上の ⋮ メニューを開く。',
    },
    undockHintStep2: {
      en: 'Under "Dock side", choose "Undock into separate window".',
      ja: '「固定サイド (Dock side)」で「別ウィンドウに固定解除 (Undock into separate window)」を選ぶ。',
    },
    undockHintPick: {
      en: 'It is the highlighted icon — the first of the four.',
      ja: '4 つ並んだアイコンの先頭、ハイライトされているものです。',
    },
    undockHintOutro: {
      en: '✅ DevTools remembers this choice: every future pop-out then minimizes the DevTools window automatically while capture keeps running.',
      ja: '✅ この選択は DevTools が記憶します。以後はポップアウトのたびに DevTools ウィンドウが自動で最小化され、キャプチャは動き続けます。',
    },
    langHelp: {
      en: 'Applies to explanations and to every dialog, item names included; toolbar buttons and column headers stay in English.',
      ja: '説明文とすべてのダイアログ(項目名を含む)に適用されます。ツールバーのボタンと列見出しは英語のままです。',
    },
    settingsTitle: {
      en: 'Settings',
      ja: '設定',
    },
    settingsLanguageSection: {
      en: '🌐 Language',
      ja: '🌐 言語',
    },
    settingsThemeSection: {
      en: '🌗 Theme',
      ja: '🌗 テーマ',
    },
    settingsRetentionSection: {
      en: '🗃️ Retention',
      ja: '🗃️ 保持',
    },
    settingsOptionSystem: {
      en: 'System',
      ja: 'システム',
    },
    settingsOptionDark: {
      en: 'Dark',
      ja: 'ダーク',
    },
    settingsOptionLight: {
      en: 'Light',
      ja: 'ライト',
    },
    settingsRetentionLimitLabel: {
      en: 'Maximum retained requests',
      ja: '保持するリクエストの最大数',
    },
    settingsRetentionUnlimitedLabel: {
      en: 'Keep unlimited requests',
      ja: 'リクエストを無制限に保持する',
    },
    settingsRetentionSave: {
      en: 'Save retention',
      ja: '保持設定を保存',
    },
    dialogClose: {
      en: 'Close',
      ja: '閉じる',
    },
    dialogCancel: {
      en: 'Cancel',
      ja: 'キャンセル',
    },
    dataSafetyTitle: {
      en: 'Export network data',
      ja: 'ネットワークデータをエクスポート',
    },
    dataSafetyScopeLegend: {
      en: 'Scope',
      ja: '対象範囲',
    },
    dataSafetyScopeDisplayed: {
      en: 'All displayed requests',
      ja: '表示中のリクエストすべて',
    },
    dataSafetyScopeSelected: {
      en: 'Selected requests only',
      ja: '選択したリクエストのみ',
    },
    dataSafetyExportHar: {
      en: 'Export sanitized HAR',
      ja: 'サニタイズ済み HAR をエクスポート',
    },
    dataSafetyExportCsv: {
      en: 'Export sanitized CSV',
      ja: 'サニタイズ済み CSV をエクスポート',
    },
    dataSafetyReviewFull: {
      en: 'Review full HAR warning',
      ja: '完全版 HAR の警告を確認',
    },
    dataSafetyConfirmFull: {
      en: 'Confirm full output',
      ja: '完全版の出力を実行',
    },
    resendTitle: {
      en: 'Edit and resend request',
      ja: 'リクエストを編集して再送',
    },
    resendCurlLabel: {
      en: 'Paste a cURL command (optional)',
      ja: 'cURL コマンドを貼り付け(任意)',
    },
    resendFillFromCurl: {
      en: 'Fill fields from cURL',
      ja: 'cURL から各項目を埋める',
    },
    resendMethodLabel: {
      en: 'Method',
      ja: 'メソッド',
    },
    resendHeadersLabel: {
      en: 'Headers (one per line, Name: value)',
      ja: 'ヘッダ(1 行 1 件、Name: value)',
    },
    resendBodyLabel: {
      en: 'Body (ignored for GET and HEAD)',
      ja: 'ボディ(GET と HEAD では無視されます)',
    },
    resendCredentialsLabel: {
      en: "Send this site's cookies with the request",
      ja: 'このサイトの Cookie を付けて送信する',
    },
    resendSend: {
      en: 'Send request',
      ja: 'リクエストを送信',
    },
    undockHintGotIt: {
      en: 'Got it',
      ja: '了解',
    },
    shortcutTitle: {
      en: 'Keyboard Shortcuts',
      ja: 'キーボードショートカット',
    },
    shortcutColShortcut: {
      en: 'Shortcut',
      ja: 'ショートカット',
    },
    shortcutColAction: {
      en: 'Action',
      ja: '動作',
    },
    shortcutSupportTitle: {
      en: 'Safe support summary',
      ja: '安全なサポート情報',
    },
    shortcutCopySupport: {
      en: 'Copy safe support summary',
      ja: '安全なサポート情報をコピー',
    },
    shortcutActionNavigateRows: {
      en: 'Navigate rows',
      ja: '行を移動',
    },
    shortcutActionSelectRow: {
      en: 'Select row / open details',
      ja: '行を選択 / 詳細を開く',
    },
    shortcutActionToggleSearch: {
      en: 'Toggle search panel',
      ja: '検索パネルを開閉',
    },
    shortcutActionClear: {
      en: 'Clear all requests',
      ja: 'すべてのリクエストを消去',
    },
    shortcutActionPopout: {
      en: 'Open the pop-out mirror tab (DevTools sessions only)',
      ja: 'ミラータブをポップアウト(DevTools セッションのみ)',
    },
    shortcutActionShowShortcuts: {
      en: 'Show keyboard shortcuts',
      ja: 'キーボードショートカットを表示',
    },
    shortcutActionClose: {
      en: 'Close panel, popup, or search',
      ja: 'パネル・ポップアップ・検索を閉じる',
    },
    shortcutActionContextMenu: {
      en: 'Row context menu',
      ja: '行のコンテキストメニュー',
    },
    shortcutActionReorderColumn: {
      en: 'Reorder column left / right',
      ja: '列を左 / 右へ移動',
    },
    shortcutActionResizeColumn10: {
      en: 'Resize column (±10 px)',
      ja: '列幅を変更(±10 px)',
    },
    shortcutActionResizeColumn40: {
      en: 'Resize column (±40 px)',
      ja: '列幅を変更(±40 px)',
    },
    shortcutActionResizeSplit1: {
      en: 'Resize panel split (±1%)',
      ja: 'パネルの分割比を変更(±1%)',
    },
    shortcutActionResizeSplit10: {
      en: 'Resize panel split (±10%)',
      ja: 'パネルの分割比を変更(±10%)',
    },
    shortcutActionResizeHeight1: {
      en: 'Resize panel height (±1%)',
      ja: 'パネルの高さを変更(±1%)',
    },
    shortcutActionResizeHeight10: {
      en: 'Resize panel height (±10%)',
      ja: 'パネルの高さを変更(±10%)',
    },
    shortcutActionSort: {
      en: 'Sort by column',
      ja: '列でソート',
    },
    shortcutActionNavigateMenu: {
      en: 'Navigate menu items',
      ja: 'メニュー項目を移動',
    },
    shortcutWhereColumnResizer: {
      en: 'on column resizer',
      ja: '(列リサイザ上で)',
    },
    shortcutWhereDividerHorizontal: {
      en: 'on panel divider (horizontal)',
      ja: '(パネル分割線上で・横方向)',
    },
    shortcutWhereDividerVertical: {
      en: 'on panel divider (vertical ≤800 px)',
      ja: '(パネル分割線上で・縦方向 800 px 以下)',
    },
    shortcutWhereColumnHeader: {
      en: 'on column header',
      ja: '(列ヘッダ上で)',
    },
    shortcutWhereMenu: {
      en: 'in menu',
      ja: '(メニュー内で)',
    },
    sampleGuideTitle: {
      en: 'Sample evidence guide',
      ja: 'サンプル証拠ガイド',
    },
    sampleGuideReveal: {
      en: 'Reveal evidence',
      ja: '答えを表示',
    },
    sampleGuideExit: {
      en: 'Exit · restore prior recording state',
      ja: '終了 · 元の記録状態に戻す',
    },
    supportTitle: {
      en: 'Buy the developer a coffee',
      ja: '開発者にコーヒーを一杯',
    },
    retentionHelp: {
      en: 'Oldest requests are removed after this limit. Response bodies use a separate 1 MiB per-body and 32 MiB total cache.',
      ja: '上限を超えると古いリクエストから削除されます。レスポンスボディは別枠(1 リクエストあたり 1 MiB・全体 32 MiB)のキャッシュを使います。',
    },
    retentionWarning: {
      en: 'Unlimited request retention can exhaust DevTools memory. Response-body limits remain active.',
      ja: '無制限保持は DevTools のメモリを使い切るおそれがあります。レスポンスボディの上限は引き続き有効です。',
    },
    dataSafetyDetail: {
      en: 'Sanitized output is the safe default.',
      ja: 'サニタイズ済み出力が安全な既定です。',
    },
    dataSafetyExportDetail: {
      en: 'Sanitized HAR redacts every URL query and form-like fragment value, URL userinfo, cookies, and every non-allowlisted header value. Omitted bodies are explicitly marked.',
      ja: 'サニタイズ済み HAR では、URL クエリとフォーム形式のフラグメント値、URL のユーザー情報、Cookie、許可リスト外のすべてのヘッダー値が伏せ字化されます。省略されたボディは明示的に記されます。',
    },
    dataSafetyFullDefaultTitle: {
      en: 'Confirm full output',
      ja: '完全版出力の確認',
    },
    dataSafetyFullDefaultDetail: {
      en: 'Review the sensitive data categories before continuing.',
      ja: '続行する前に、含まれ得る機微データの分類を確認してください。',
    },
    dataSafetyFullDefaultConfirm: {
      en: 'Confirm full output',
      ja: '完全版出力を確認',
    },
    dataSafetyFullHarTitle: {
      en: 'Export full HAR?',
      ja: '完全な HAR をエクスポートしますか？',
    },
    dataSafetyFullHarDetail: {
      en: 'A full HAR can expose Authorization, cookies, every query or fragment value, URL userinfo, non-allowlisted headers, and complete request or response bodies.',
      ja: '完全な HAR には、Authorization、Cookie、すべてのクエリ・フラグメント値、URL のユーザー情報、許可リスト外のヘッダー、そしてリクエストとレスポンスの完全なボディが含まれることがあります。',
    },
    dataSafetyFullHarConfirm: {
      en: 'Export full HAR',
      ja: '完全な HAR をエクスポート',
    },
    copyFullTitle: {
      en: 'Copy full {label}?',
      ja: '完全版{label}をコピーしますか？',
    },
    copyFullDetail: {
      en: 'The full {label} may include captured credentials or body content.',
      ja: '完全版{label}には、キャプチャされた資格情報やボディの内容が含まれることがあります。',
    },
    copyFullConfirm: {
      en: 'Copy full {label}',
      ja: '完全版{label}をコピー',
    },
    sampleEvidenceHeading: {
      en: 'Evidence to verify',
      ja: '確認するエビデンス',
    },
    sampleEvidenceFailedRequest: {
      en: 'Failed request',
      ja: '失敗したリクエスト',
    },
    sampleEvidenceDominantPhase: {
      en: 'Dominant Timing phase',
      ja: '支配的な Timing フェーズ',
    },
    sampleEvidenceRetryHint: {
      en: 'Retry hint',
      ja: '再試行のヒント',
    },
    sampleEvidenceLimit: {
      en: 'Browser evidence limit',
      ja: 'ブラウザ計測の限界',
    },
    sampleEvidenceInspectTiming: {
      en: 'Inspect Timing evidence',
      ja: 'Timing エビデンスを確認',
    },
    sampleEvidenceInspectRetry: {
      en: 'Inspect Retry-After header',
      ja: 'Retry-After ヘッダーを確認',
    },
    emptyFilteredAction: {
      en: 'Clear column filters',
      ja: '列フィルターを解除',
    },
    emptyCaptureAction: {
      en: 'Explore sample capture',
      ja: 'サンプルキャプチャを試す',
    },
    bodyPaneFrame: {
      en: '(response body {label}: {reason})',
      // Both slots take another dictionary entry, so the English frame's
      // spaces around them cannot survive into Japanese; the separator is the
      // full-width colon, which carries its own spacing.
      ja: '（レスポンスボディ{label}：{reason}）',
    },
    bodyStateOmitted: {
      en: 'omitted',
      ja: '省略',
    },
    bodyStateEvicted: {
      en: 'evicted',
      ja: '破棄済み',
    },
    bodyStateUnavailable: {
      en: 'unavailable',
      ja: '取得不可',
    },
    bodyStateError: {
      en: 'error',
      ja: 'エラー',
    },
    resendErrMethod: {
      en: 'The method contains characters that are not allowed in an HTTP method token.',
      ja: 'メソッドに HTTP メソッドトークンとして使えない文字が含まれています。',
    },
    resendErrUrl: {
      en: 'The URL must be absolute and use http or https.',
      ja: 'URL は http または https で始まる絶対 URL である必要があります。',
    },
    resendErrHeaderShape: {
      en: 'Each header line needs a "Name: value" shape. First problem: {line}',
      ja: 'ヘッダー行は「名前: 値」の形式で入力してください。最初の問題行: {line}',
    },
    resendErrCurl: {
      en: 'cURL import failed: {error}.',
      ja: 'cURL の取り込みに失敗しました: {error}。',
    },
    resendErrDispatch: {
      en: 'Re-send failed: {reason}',
      ja: '再送信に失敗しました: {reason}',
    },
    resendErrNotConnected: {
      en: 'the DevTools session is not connected; reopen DevTools and try again',
      ja: 'DevTools セッションに接続していません。DevTools を開き直して再試行してください',
    },
    dataSafetyWarnRedacts: {
      en: 'Sanitized output redacts every URL query and form-like fragment value, both URL userinfo components, Cookie values, and every header value outside a small structural allowlist.',
      ja: 'サニタイズ済み出力では、URL クエリとフォーム形式のフラグメント値、URL のユーザー情報 2 要素、Cookie 値、そして小さな構造的許可リスト外のすべてのヘッダー値が伏せ字化されます。',
    },
    dataSafetyWarnExposeTitle: {
      en: 'Full output bypasses those protections and can expose:',
      ja: '完全出力はこれらの保護を通らず、次を露出させる可能性があります:',
    },
    dataSafetyWarnExposeHeaders: {
      en: 'Authorization, proxy authorization, custom, security, trace, request-ID, and client-certificate headers',
      ja: 'Authorization・プロキシ認証・カスタム・セキュリティ・トレース・リクエスト ID・クライアント証明書の各ヘッダー',
    },
    dataSafetyWarnExposeCookies: {
      en: 'Cookie and Set-Cookie values',
      ja: 'Cookie と Set-Cookie の値',
    },
    dataSafetyWarnExposeUrl: {
      en: 'URL usernames, passwords, query values, and fragment values',
      ja: 'URL のユーザー名・パスワード・クエリ値・フラグメント値',
    },
    dataSafetyWarnExposeBodies: {
      en: 'Request and response bodies, including base64 content',
      ja: 'リクエストとレスポンスのボディ(base64 内容を含む)',
    },
    dataSafetyWarnOneTime: {
      en: 'This confirmation applies only to this action. Network+ does not save a full-output preference.',
      ja: 'この確認は今回の操作だけに適用されます。Network+ は完全出力の設定を保存しません。',
    },
    resendIntro: {
      en: "Send composes a new request from these fields, and the inspected page itself issues it — so cookies, CORS, and the page's security policies apply as usual. The reply arrives as a new captured row.",
      ja: 'Send はこれらのフィールドから新しいリクエストを組み立て、検査中のページ自身が送信します。そのため Cookie・CORS・ページのセキュリティポリシーは通常どおり適用されます。応答は新しいキャプチャ行として届きます。',
    },
    resendManagedHeadersHint: {
      en: 'Browser-managed headers (Host, Cookie, Content-Length, Origin, Referer, and the Sec-* and Proxy-* families) are set by the browser and cannot be overridden here.',
      ja: 'ブラウザ管理のヘッダー(Host、Cookie、Content-Length、Origin、Referer、Sec-* / Proxy-* 系)はブラウザが設定するため、ここでは上書きできません。',
    },
    shortcutSupportSummaryHelp: {
      en: 'Copies only the packaged version, Edge major, coarse OS family, theme, retention, recording and sample state, and display and motion preferences. Captured traffic is excluded. Review the summary before posting.',
      ja: 'コピーされるのはパッケージ版のバージョン、Edge のメジャーバージョン、大まかな OS 種別、テーマ、保持設定、記録とサンプルの状態、表示とモーションの設定だけです。キャプチャしたトラフィックは含まれません。投稿前に内容を確認してください。',
    },
    supportIntro: {
      en: 'A solo, MIT-licensed project. If it saved you a debugging session, a coffee keeps it going.',
      ja: '個人開発の MIT ライセンスプロジェクトです。助かったと感じたら、コーヒー 1 杯が開発を支えます。',
    },
    supportFactFree: {
      en: 'Every feature, free',
      ja: '全機能が無料',
    },
    supportFactPrivate: {
      en: 'No ads, telemetry, or account',
      ja: '広告・追跡・アカウントなし',
    },
    supportFactOptional: {
      en: 'Optional, no perks',
      ja: '支援は任意・特典なし',
    },
    supportNote: {
      en: 'Contributing is optional and never unlocks, limits, or changes any feature. The buttons open the payment page in a browser tab; the payment itself happens on that site, never inside DevTools. Network+ sends them no captured traffic and no usage data, and cannot tell whether you contributed.',
      ja: '支援は任意で、機能の解放・制限・変更は一切ありません。ボタンは支払いページをブラウザのタブで開き、決済はそのサイト上で行われ、DevTools 内では行われません。Network+ はこれらのサイトへキャプチャも利用データも送らず、支援の有無を知ることもできません。',
    },
    supportSponsorsHint: {
      en: 'github.com/sponsors/himiyosh · one-time or monthly · no platform fee',
      ja: 'github.com/sponsors/himiyosh · 単発または月額 · プラットフォーム手数料なし',
    },
    supportKofiHint: {
      en: 'ko-fi.com/studio344 · one-time · no account needed',
      ja: 'ko-fi.com/studio344 · 単発 · アカウント不要',
    },
    sampleGuideIntro: {
      en: 'Inspect the three local requests before revealing the evidence.',
      ja: '証拠を表示する前に、3 件のローカルリクエストを調べてみてください。',
    },
    sampleGuidePrompt1: {
      en: 'Which request failed?',
      ja: 'どのリクエストが失敗しましたか?',
    },
    sampleGuidePrompt2: {
      en: 'Which Timing phase accounts for most of its duration?',
      ja: '所要時間の大半を占める Timing フェーズはどれですか?',
    },
    sampleGuidePrompt3: {
      en: 'Which response header gives a retry hint?',
      ja: '再試行のヒントを与えるレスポンスヘッダーはどれですか?',
    },
    sampleGuidePrompt4: {
      en: 'What limitation applies to what browser timing can prove?',
      ja: 'ブラウザの計測が証明できることには、どんな限界がありますか?',
    },
    sampleGuideExitHelp: {
      en: 'Exiting removes all three local sample requests and restores the recording state and column filters from before the sample.',
      ja: '終了すると 3 件のローカルサンプルリクエストがすべて削除され、サンプル開始前の記録状態と列フィルターが復元されます。',
    },
    titleSupportBtn: {
      en: 'Support Network+ development (optional)',
      ja: 'Network+ の開発を支援する(任意)',
    },
    titleSearchToggle: {
      en: 'Toggle search panel (Ctrl+F)',
      ja: '検索パネルを開閉 (Ctrl+F)',
    },
    titleClearBtn: {
      en: 'Clear all requests',
      ja: 'すべてのリクエストを消去',
    },
    titleImportBtn: {
      en: 'Import (HAR/SAZ)',
      ja: 'インポート (HAR/SAZ)',
    },
    titleExportBtn: {
      en: 'Export network data (sanitized by default)',
      ja: 'ネットワークデータをエクスポート(既定でサニタイズ済み)',
    },
    titlePopoutBtn: {
      en: 'Open Network+ in a browser tab; it mirrors this DevTools session (Ctrl/⌘+Shift+M)',
      ja: 'Network+ をブラウザのタブで開き、この DevTools セッションをミラー表示 (Ctrl/⌘+Shift+M)',
    },
    titleShortcutBtn: {
      en: 'Keyboard shortcuts (?)',
      ja: 'キーボードショートカット (?)',
    },
    titleMatchesOnly: {
      en: 'Show only requests that match search keywords. When off, all requests stay visible with highlights.',
      ja: '検索キーワードに一致するリクエストだけを表示します。オフの間はすべてのリクエストがハイライト付きで表示されたままです。',
    },
    titleMatchCase: {
      en: 'Match case',
      ja: '大文字と小文字を区別',
    },
    titleMatchWord: {
      en: 'Match whole word',
      ja: '単語単位で一致',
    },
    titleMatchRegex: {
      en: 'Use regular expression',
      ja: '正規表現を使用',
    },
    titleSearchScope: {
      en: 'Search scope settings',
      ja: '検索対象の設定',
    },
    titleResizer: {
      en: 'Resize request list and details with arrow keys',
      ja: '矢印キーでリクエスト一覧と詳細の高さを調整',
    },
    titleInspectorDivider: {
      en: 'Resize request and response inspectors with arrow keys; double-click to restore 50/50',
      ja: '矢印キーでリクエスト / レスポンス インスペクターの幅を調整、ダブルクリックで 50/50 に戻す',
    },
    // Accessible names for controls whose aria-label says something other
    // than their tooltip. Every en here is byte-identical to the authored
    // attribute in panel.html, so applyLanguage is a no-op in English.
    ariaSupportBtn: {
      en: 'Network+ for DevTools — support development, optional',
      ja: 'Network+ for DevTools — 開発の支援 (任意)',
    },
    ariaImportBtn: {
      en: 'Import HAR or SAZ',
      ja: 'HAR または SAZ をインポート',
    },
    ariaExportBtn: {
      en: 'Export network data; sanitized by default',
      ja: 'ネットワークデータをエクスポート、既定でサニタイズ済み',
    },
    ariaPopoutBtn: {
      en: 'Open Network+ in a browser tab; it mirrors this DevTools session',
      ja: 'Network+ をブラウザのタブで開く。この DevTools セッションをミラー表示します',
    },
    ariaShortcutBtn: {
      en: 'Keyboard shortcuts',
      ja: 'キーボードショートカット',
    },
    ariaInspectorDivider: {
      en: 'Resize request and response inspectors',
      ja: 'リクエストとレスポンスのインスペクターのサイズを変更',
    },
    ariaRequestTabs: {
      en: 'Request details',
      ja: 'リクエストの詳細',
    },
    ariaResponseTabs: {
      en: 'Response details',
      ja: 'レスポンスの詳細',
    },
    // The collapse toggles keep their English caption as visible chrome, so
    // the localized name has to contain that caption verbatim — a name that
    // dropped it would leave voice control with nothing to match (WCAG 2.5.3).
    // The half is named the way its own tooltip and status line name it, so
    // one control does not carry two nouns for the same thing. The English
    // caption stays visible on the button, so the name has to end on it:
    // WCAG 2.5.3 label-in-name is what voice control matches, and a name
    // without "Request" in it leaves "click Request" with nothing to hit.
    ariaInspectorRequestToggle: {
      en: 'Request',
      ja: 'リクエストインスペクター (Request)',
    },
    ariaInspectorResponseToggle: {
      en: 'Response',
      ja: 'レスポンスインスペクター (Response)',
    },
    titleDetailsClose: {
      en: 'Close request details',
      ja: 'リクエスト詳細を閉じる',
    },
    titleDetailsCopyUrl: {
      en: 'Copy sanitized URL',
      ja: 'サニタイズ済み URL をコピー',
    },
    titleSampleExit: {
      en: 'Remove the complete local sample and restore the prior recording state and column filters',
      ja: 'ローカルサンプル一式を削除し、以前の記録状態と列フィルターを復元',
    },
    titleWsCapture: {
      en: "Capture WebSocket and Server-Sent-Event streams by wrapping this page's WebSocket and EventSource constructors; only connections created while capture is on are seen, and traffic is never altered",
      ja: 'このページの WebSocket / EventSource コンストラクターをラップして WebSocket と Server-Sent-Events のストリームをキャプチャします。キャプチャ有効中に作成された接続だけが対象で、トラフィックは一切変更されません。',
    },
    emptyFilteredTitle: {
      en: 'No requests match the current filters.',
      ja: '現在のフィルターに一致するリクエストはありません。',
    },
    emptyFilteredDesc: {
      en: 'Clear or adjust filters to show captured requests.',
      ja: 'フィルターを解除または調整すると、キャプチャ済みのリクエストが表示されます。',
    },
    emptyCapturePausedTitle: {
      en: 'Recording is paused.',
      ja: '記録は一時停止中です。',
    },
    emptyCaptureRecordingTitle: {
      en: 'Recording network activity...',
      ja: 'ネットワークアクティビティを記録しています...',
    },
    emptyCaptureViewerDesc: {
      en: 'Requests stream in from the DevTools session; the guided local sample stays DevTools-side.',
      ja: 'リクエストは DevTools セッションから流れてきます。ガイド付きローカルサンプルは DevTools 側でのみ使えます。',
    },
    emptyCapturePausedDesc: {
      en: 'Resume recording to capture real requests, or explore three local-only sample requests. No network request is sent.',
      ja: '記録を再開して実際のリクエストをキャプチャするか、ローカル限定のサンプルリクエスト 3 件を試せます。ネットワークリクエストは送信されません。',
    },
    emptyCaptureRecordingDesc: {
      en: 'Perform a request or reload the page, or explore three local-only sample requests. No network request is sent.',
      ja: 'リクエストを発生させるかページを再読み込みするか、ローカル限定のサンプルリクエスト 3 件を試せます。ネットワークリクエストは送信されません。',
    },
    timingGuideSummary: {
      en: 'What do the timing phases mean?',
      ja: 'タイミングフェーズの意味は?',
    },
    timingPhaseBlocked: {
      en: TIMING_PHASE_GUIDANCE.blocked.description,
      ja: '使えるコネクションを待つなど、リクエストを開始できるまでブラウザ内で待機した時間。',
    },
    timingPhaseDns: {
      en: TIMING_PHASE_GUIDANCE.dns.description,
      ja: '接続前にリクエスト先ホスト名を解決するのにかかったと報告された時間。',
    },
    timingPhaseConnect: {
      en: TIMING_PHASE_GUIDANCE.connect.description,
      ja: '接続確立にかかったと報告された時間。TLS が別に報告される場合、二重に数えないよう Network+ はここから TLS 分を除きます。',
    },
    timingPhaseSsl: {
      en: TIMING_PHASE_GUIDANCE.ssl.description,
      ja: 'TLS (SSL) ネゴシエーションにかかったと報告された時間。Connect とは別に表示されます。',
    },
    timingPhaseSend: {
      en: TIMING_PHASE_GUIDANCE.send.description,
      ja: 'HTTP リクエストのバイト列を送信するのにかかったと報告された時間。',
    },
    timingPhaseWait: {
      en: TIMING_PHASE_GUIDANCE.wait.description,
      ja: 'リクエスト送信後、レスポンスが始まるまで待った時間(いわゆる TTFB)。',
    },
    timingPhaseReceive: {
      en: TIMING_PHASE_GUIDANCE.receive.description,
      ja: '最初の 1 バイト以降、レスポンスを受信するのにかかったと報告された時間。',
    },
    timingEvidenceLimitation: {
      en: TIMING_EVIDENCE_LIMITATION,
      ja: 'ブラウザが観測したタイミングフェーズは、報告された遅延の所在を絞り込む助けになります。ただしパケットロス、配線や無線の障害、サーバー側の確定的な根本原因までは証明できません。',
    },
    // The Timing table's own vocabulary. A phase the capture never reported
    // is not a phase that took no time, and a value the formatter rounded to
    // zero is not zero: each gets a word of its own rather than a false '0'.
    timingNotReported: {
      en: 'not reported',
      ja: '未報告',
    },
    timingDurationSubMs: {
      en: '< 1 ms',
      ja: '1 ms 未満',
    },
    // The same shape in both languages on purpose: the share column is a
    // right-aligned run of digits, and '0.1% 未満' put prose where the reader
    // scans for a number and broke the alignment of the column.
    timingShareBelowTenth: {
      en: '< 0.1%',
      ja: '< 0.1%',
    },
    // The seven phase names as the table's key column shows them. They were
    // hardcoded English while a collapsed guide was the only place they
    // appeared; the acronyms stay as they are, the words translate.
    timingPhaseLabelBlocked: {
      en: TIMING_PHASE_GUIDANCE.blocked.label,
      ja: 'ブロック',
    },
    timingPhaseLabelDns: {
      en: TIMING_PHASE_GUIDANCE.dns.label,
      ja: 'DNS',
    },
    timingPhaseLabelConnect: {
      en: TIMING_PHASE_GUIDANCE.connect.label,
      ja: '接続',
    },
    timingPhaseLabelSsl: {
      en: TIMING_PHASE_GUIDANCE.ssl.label,
      ja: 'TLS (SSL)',
    },
    timingPhaseLabelSend: {
      en: TIMING_PHASE_GUIDANCE.send.label,
      ja: '送信',
    },
    timingPhaseLabelWait: {
      en: TIMING_PHASE_GUIDANCE.wait.label,
      ja: '待機 (TTFB)',
    },
    timingPhaseLabelReceive: {
      en: TIMING_PHASE_GUIDANCE.receive.label,
      ja: '受信',
    },
    // The part of the reported duration no phase accounts for. It is a row,
    // not a silent gap in the track: the shares have to sum to the whole.
    timingUnaccounted: {
      en: 'Unaccounted',
      ja: '未計上',
    },
    timingUnaccountedDescription: {
      en: 'Part of the reported duration that the browser did not attribute to any timing phase.',
      ja: '報告された所要時間のうち、ブラウザがどのタイミングフェーズにも割り当てなかった分。',
    },
    // The one line the pane shows when the capture reported no phase at all.
    timingNoPhasesReported: {
      en: 'No timing phases were reported for this request.',
      ja: 'このリクエストではタイミングフェーズが報告されていません。',
    },
    reasonNavigationBodyUnavailable: {
      en: NAVIGATION_BODY_UNAVAILABLE_REASON,
      ja: '検査中のページが移動したため、このレスポンスボディは取得できませんでした。',
    },
    reasonBodyEvicted: {
      en: BODY_EVICTED_REASON,
      ja: '上限付きレスポンスボディキャッシュから追い出されました。行を選択またはエクスポートすると再取得を試みます。',
    },
    reasonImportNoContent: {
      en: IMPORT_BODY_MISSING_REASON,
      ja: 'インポートした HAR にレスポンス内容も明示的なボディサイズ 0 も含まれていません。',
    },
    reasonBodyRetrievalFailed: {
      en: BODY_RETRIEVAL_FAILED_REASON,
      ja: 'レスポンス内容の取得に失敗しました。',
    },
    reasonBodyUnavailable: {
      en: BODY_UNAVAILABLE_REASON,
      ja: '完全なレスポンス内容は利用できません。',
    },
    binaryBodyNotice: {
      en: 'Binary response body — showing a hex dump instead of decoded text.',
      ja: 'バイナリのレスポンスボディです。デコードしたテキストではなく 16 進ダンプを表示しています。',
    },
    binaryDumpShown: {
      en: 'Hex dump shown',
      ja: '16 進ダンプの表示範囲',
    },
    // The Body pane's renderer picker, and the search's way of saying that the
    // matches it counted are in the HTML source rather than in the frame the
    // pane is rendering. All of them are panel controls, not captured data.
    bodyViewLabel: {
      en: 'Body view',
      ja: 'ボディの表示',
    },
    bodyViewTree: {
      en: 'Tree',
      ja: 'ツリー',
    },
    bodyViewText: {
      en: 'Text',
      ja: 'テキスト',
    },
    bodyViewRendered: {
      en: 'Rendered',
      ja: 'レンダリング',
    },
    bodyViewSource: {
      en: 'Source',
      ja: 'ソース',
    },
    bodyViewButtonTitle: {
      en: 'Show the response body as {view}',
      ja: 'レスポンスボディを{view}で表示',
    },
    paneSearchShowInSource: {
      en: 'Show in Source',
      ja: 'ソースで表示',
    },
    paneSearchSourceTitle: {
      en: 'These matches are in the HTML source, which the rendered frame does not show. Open the source to step through them.',
      ja: 'この一致はレンダリング表示では見えない HTML ソース内にあります。ソースを開くと順に移動できます。',
    },
    paneSearchSourceLabel: {
      en: 'Show the {pane} source',
      ja: '{pane}のソースを表示',
    },
    imagePreviewZoom: {
      en: 'enlarged',
      ja: '拡大',
    },
    imagePreviewFailed: {
      en: 'This image could not be decoded.',
      ja: 'この画像はデコードできませんでした。',
    },
    // The Body pane's own "there is nothing here" line, and the control that
    // opens a truncated body. Their siblings in this same pane already
    // translate, so an English line here read as a rendering fault rather
    // than as a state.
    bodyPaneNoResponseBody: {
      en: '(no response body)',
      ja: '（レスポンスボディはありません）',
    },
    bodyPaneShowFullCached: {
      en: 'Show full cached body ({size})',
      ja: 'キャッシュされたボディ全体を表示（{size}）',
    },
    detailsEmptyTitle: {
      en: 'Select a request...',
      ja: 'リクエストを選択してください...',
    },
    detailsQueryCount: {
      en: '{count} query parameters',
      ja: 'クエリパラメーター {count} 件',
    },
    detailsQueryCountOne: {
      en: '1 query parameter',
      ja: 'クエリパラメーター 1 件',
    },
    // The Headers panes' leading grid names request and response facts, and
    // the two group headings sit above lists of captured header names. Both
    // are panel nouns, not captured data, so both translate — an English
    // "Method" between a Japanese toolbar and a Japanese empty state was the
    // last mixed-language seam in the pane.
    detailsInfoMethod: {
      en: 'Method',
      ja: 'メソッド',
    },
    detailsInfoOperation: {
      en: 'Operation',
      ja: 'オペレーション',
    },
    detailsInfoUrl: {
      en: 'URL',
      ja: 'URL',
    },
    detailsInfoProtocol: {
      en: 'Protocol',
      ja: 'プロトコル',
    },
    detailsInfoStatus: {
      en: 'Status',
      ja: 'ステータス',
    },
    detailsInfoSize: {
      en: 'Size',
      ja: 'サイズ',
    },
    detailsInfoDuration: {
      en: 'Duration',
      ja: '所要時間',
    },
    detailsRequestHeadersHeading: {
      en: 'Request Headers',
      ja: 'リクエストヘッダー',
    },
    detailsResponseHeadersHeading: {
      en: 'Response Headers',
      ja: 'レスポンスヘッダー',
    },
    // The Timing pane's own heading. The phase names under it are the fixed
    // set the panel documents in its own guide — not the HAR's raw keys — and
    // they translate through the timingPhaseLabel* entries above.
    detailsTimingBreakdownHeading: {
      en: 'Timing Breakdown',
      ja: 'タイミング内訳',
    },
    // The last row of that table, written by the panel rather than read from
    // the HAR, so it is the row that has to translate with the heading above
    // it.
    detailsTimingTotal: {
      en: 'Total',
      ja: '合計',
    },
    // The sandboxed frame's accessible name — the one string the Body pane
    // composes for assistive tech, so it translates with the picker beside it.
    bodyHtmlFrameTitle: {
      en: 'Response HTML preview',
      ja: 'レスポンス HTML プレビュー',
    },
    // The three response panes say this while the body is still being
    // fetched; the states after it already go through bodyPaneFrame.
    bodyPaneLoading: {
      en: '(loading...)',
      ja: '（読み込み中...）',
    },
    urlBreakdownOpenQuery: {
      en: '?{count} params — open Query',
      ja: '?{count} 件のパラメーター — Query を開く',
    },
    urlBreakdownOpenQueryOne: {
      en: '?1 param — open Query',
      ja: '?1 件のパラメーター — Query を開く',
    },
    urlBreakdownShowFull: {
      en: 'Show full URL',
      ja: '完全な URL を表示',
    },
    urlBreakdownHideFull: {
      en: 'Hide full URL',
      ja: '完全な URL を隠す',
    },
    // Labels the decoded reading of a percent-encoded query. The address above
    // it stays exactly as the request sent it, so the reader is told which of
    // the two strings they are looking at.
    urlBreakdownDecoded: {
      en: 'Decoded:',
      ja: 'デコード後:',
    },
    // The summary of a Query value that is itself a query string.
    queryNestedParams: {
      en: '{count} params',
      ja: '{count} 件のパラメーター',
    },
    kvShowAll: {
      en: 'Show all ({count} chars)',
      ja: 'すべて表示（{count} 文字）',
    },
    kvShowLess: {
      en: 'Show less',
      ja: '折りたたむ',
    },
    // The row-end copy control. "Copy full..." stays in Body and Raw, where the
    // confirmation flow lives; this one writes the single value its row names,
    // through the very sanitizer that row's pane uses for "Copy sanitized", so
    // it can never be the looser of the two.
    kvCopyValue: {
      en: 'Copy',
      ja: 'コピー',
    },
    kvCopyValueAria: {
      en: 'Copy the {name} value',
      ja: '{name} の値をコピー',
    },
    // A request Cookie header is one blob of pairs the Cookies tab already
    // lists one per row, so the header row leads with the count and a way in.
    cookieHeaderOpenCookies: {
      en: '{count} cookies — open Cookies',
      ja: '{count} 件の Cookie — Cookies を開く',
    },
    cookieHeaderOpenCookiesOne: {
      en: '1 cookie — open Cookies',
      ja: '1 件の Cookie — Cookies を開く',
    },
    // The Cookies panes are tables, so the columns need names a screen reader
    // can announce and a Japanese reader can read. The flags themselves stay
    // as the wire spells them — Secure, HttpOnly, SameSite=Lax, Partitioned
    // are protocol tokens, and translating one would name something no
    // response ever sent.
    cookieColumnName: {
      en: 'Name',
      ja: '名前',
    },
    cookieColumnValue: {
      en: 'Value',
      ja: '値',
    },
    cookieColumnDomain: {
      en: 'Domain',
      ja: 'ドメイン',
    },
    cookieColumnPath: {
      en: 'Path',
      ja: 'パス',
    },
    cookieColumnExpires: {
      en: 'Expires',
      ja: '有効期限',
    },
    cookieColumnFlags: {
      en: 'Flags',
      ja: 'フラグ',
    },
    // Max-Age is a duration, and the literal the response sent stays the cell's
    // own words; the attribute name is a wire token in both languages.
    cookieMaxAgeLiteral: {
      en: 'Max-Age: {seconds}',
      ja: 'Max-Age: {seconds}',
    },
    // The Expires a response sent BESIDE a Max-Age. Named, because under a
    // Max-Age literal a bare date would read as the instant it works out to.
    cookieExpiresLiteral: {
      en: 'Expires: {value}',
      ja: 'Expires: {value}',
    },
    // The label on the instant a Max-Age works out to against the response
    // date. It marks the line as the panel's arithmetic, not the header's.
    cookieExpiryComputed: {
      en: 'Computed',
      ja: '計算値',
    },
    // The chip beside a header value that carries a token: the one fact a
    // reader wants from it without opening the decoded section. Two units, so
    // "2h 14m" reads at a glance. humanizeJwtDelta stays the decoded section's
    // own single-unit English wording; this is a separate formatter.
    jwtChipExpiresIn: {
      en: 'JWT · expires in {time}',
      ja: 'JWT · あと{time}で失効',
    },
    jwtChipExpired: {
      en: 'JWT · expired {time} ago',
      ja: 'JWT · {time}前に失効',
    },
    jwtChipUnitDay: {
      en: '{count}d',
      ja: '{count}日',
    },
    jwtChipUnitHour: {
      en: '{count}h',
      ja: '{count}時間',
    },
    jwtChipUnitMinute: {
      en: '{count}m',
      ja: '{count}分',
    },
    jwtChipUnitSecond: {
      en: '{count}s',
      ja: '{count}秒',
    },
    // Japanese writes "2時間14分" with nothing between the units; English
    // writes "2h 14m". The separator is part of the language, so it is here.
    jwtChipUnitJoin: {
      en: ' ',
      ja: '',
    },
    // The decoded disclosure under the row that carries the token. Its summary
    // and its two part headings were the last hard-coded English inside a
    // section whose chip is already translated, so in Japanese a translated
    // chip sat directly above an English summary. en is byte-identical to the
    // literals the section shipped with.
    jwtSectionSummary: {
      en: 'JWT in {name}',
      ja: '{name} の JWT',
    },
    // The span inside that summary and inside each decoded claim row. One
    // unit, unlike the chip's two: the chip is a glance, this is a reading.
    jwtDeltaSeconds: {
      en: '{count} s',
      ja: '{count}秒',
    },
    jwtDeltaMinutes: {
      en: '{count} min',
      ja: '{count}分',
    },
    jwtDeltaHours: {
      en: '{count} h',
      ja: '{count}時間',
    },
    jwtDeltaDays: {
      en: '{count} d',
      ja: '{count}日',
    },
    jwtExpiryExpiresIn: {
      en: 'expires in {time}',
      ja: 'あと{time}で失効',
    },
    jwtExpiryExpired: {
      en: 'expired {time} ago',
      ja: '{time}前に失効',
    },
    jwtClaimIn: {
      en: 'in {time}',
      ja: '{time}後',
    },
    jwtClaimAgo: {
      en: '{time} ago',
      ja: '{time}前',
    },
    jwtPartHeader: {
      en: 'Header',
      ja: 'ヘッダー',
    },
    jwtPartPayload: {
      en: 'Payload',
      ja: 'ペイロード',
    },
    jwtDisplayNote: {
      en: 'Decoded locally for display; the signature is not verified.',
      ja: '表示のためにローカルでデコードしています。署名は検証していません。',
    },
    jwtNoSignature: {
      en: ' This token carries no signature segment.',
      ja: 'このトークンには署名セグメントがありません。',
    },
    emptyRequestBody: {
      en: 'No request body',
      ja: 'リクエストボディはありません',
    },
    emptyQueryParams: {
      en: 'No query parameters',
      ja: 'クエリパラメーターはありません',
    },
    emptyQueryParamsBodyHint: {
      en: 'No query parameters — this {method} carries its data in Body',
      ja: 'クエリパラメーターはありません — この {method} はデータを Body で送っています',
    },
    // A row that reached the panel without a method (an import, a request
    // still in flight) has no verbatim noun to slot in, and the English word
    // "request" inside the Japanese frame was the bug.
    emptyQueryParamsBodyHintNoMethod: {
      en: 'No query parameters — this request carries its data in Body',
      ja: 'クエリパラメーターはありません — このリクエストはデータを Body で送っています',
    },
    emptyRequestCookies: {
      en: 'No cookies were sent',
      ja: 'Cookie は送信されていません',
    },
    emptySetCookieHeaders: {
      en: 'No set-cookie headers',
      ja: 'set-cookie ヘッダーはありません',
    },
    jsonTreeExpandAll: {
      en: 'Expand all',
      ja: 'すべて展開',
    },
    jsonTreeCollapseAll: {
      en: 'Collapse all',
      ja: 'すべて折りたたむ',
    },
    jsonTreeShowFullString: {
      en: 'Show the full string',
      ja: '文字列全体を表示',
    },
    jsonTreeHideFullString: {
      en: 'Show the first line only',
      ja: '先頭行だけを表示',
    },
    inspectorEmptyHint: {
      en: 'Select a request to inspect it — click a row, ↑↓ to move, Enter to open',
      ja: 'リクエストを選択すると内容を確認できます — 行をクリック、↑↓ で移動、Enter で開く',
    },
    statusDetailsClosed: {
      en: 'Request details closed. Select a request to reopen.',
      ja: 'リクエスト詳細を閉じました。リクエストを選択すると再び開きます。',
    },
    statusRowSelected: {
      en: 'Selected {request}.',
      ja: '{request} を選択しました。',
    },
    // The band labels themselves stay English product chrome; these are the
    // half names the composed tooltips, aria values and status lines slot in,
    // so a Japanese sentence does not carry an English noun.
    inspectorHalfRequest: {
      en: 'Request',
      ja: 'リクエスト',
    },
    inspectorHalfResponse: {
      en: 'Response',
      ja: 'レスポンス',
    },
    inspectorCollapseHalfTitle: {
      en: 'Collapse the {half} inspector to its tabs',
      ja: '{half}インスペクターをタブだけに折りたたむ',
    },
    inspectorExpandHalfTitle: {
      en: 'Expand the {half} inspector',
      ja: '{half}インスペクターを展開する',
    },
    inspectorHalfCollapsedStatus: {
      en: '{half} inspector collapsed. Double-click the divider to restore 50/50.',
      ja: '{half}インスペクターを折りたたみました。仕切りをダブルクリックすると 50/50 に戻ります。',
    },
    // The short-pane column has no divider to double-click, so the sentence
    // names the caption the reader just clicked — the control that is still
    // there and still restores the half.
    inspectorHalfCollapsedColumnStatus: {
      en: '{half} inspector collapsed. Click {half} again to restore it.',
      ja: '{half}インスペクターを折りたたみました。{half}をもう一度クリックすると戻ります。',
    },
    inspectorHalfExpandedStatus: {
      en: '{half} inspector expanded.',
      ja: '{half}インスペクターを展開しました。',
    },
    inspectorHalfCollapsedValue: {
      en: '{half} inspector collapsed',
      ja: '{half}インスペクターは折りたたみ中',
    },
    inspectorSplitResetStatus: {
      en: 'Request and response inspectors restored to 50/50.',
      ja: 'リクエストとレスポンスのインスペクターを 50/50 に戻しました。',
    },
    // The non-collapsed counterpart of inspectorHalfCollapsedValue: the
    // divider's aria-valuetext and the keyboard-resize status line are the
    // same sentence, so they read the same entry.
    inspectorHalfPercentValue: {
      en: '{half} inspector {percent} percent',
      ja: '{half}インスペクター {percent} パーセント',
    },
    detailsComparingTwo: {
      en: 'Comparing 2 requests',
      ja: '2 件のリクエストを比較中',
    },
    columnsSelectAll: {
      en: 'Select all',
      ja: 'すべて選択',
    },
    columnsDeselectAll: {
      en: 'Deselect all',
      ja: 'すべて解除',
    },
    columnsReset: {
      en: 'Reset',
      ja: 'リセット',
    },
    columnsResetTitle: {
      en: 'Restore the default column visibility and widths',
      ja: '列の表示と幅を既定に戻す',
    },
    columnsAutoHiddenNote: {
      en: '{count} hidden to fit',
      ja: '{count} 件を幅に合わせて非表示',
    },
    columnsShowAnyway: {
      en: 'Show anyway',
      ja: 'それでも表示',
    },
    columnsShowAnywayLabel: {
      en: 'Show {column} anyway',
      ja: '{column}をそれでも表示',
    },
    columnsShowAnywayStatus: {
      en: '{column} stays visible; it is no longer hidden to fit.',
      ja: '{column}を常に表示に固定しました。幅に合わせた非表示の対象から外れます。',
    },
    // The same row once the opt-out is in force: it names the state it is in
    // and offers the way out, so a pin the reader set is a pin they can see
    // and undo rather than a one-way door with nothing left on screen.
    columnsShowAnywayPinned: {
      en: 'Always shown — undo',
      ja: '常に表示中 — 解除',
    },
    columnsShowAnywayUndoLabel: {
      en: 'Stop always showing {column}',
      ja: '{column}を常に表示するのをやめる',
    },
    columnsShowAnywayUndoStatus: {
      en: '{column} can be hidden to fit again.',
      ja: '{column}を幅に合わせた非表示の対象に戻しました。',
    },
    columnsResetStatus: {
      en: 'Columns reset to the default visibility and widths.',
      ja: '列の表示と幅を既定に戻しました。',
    },
    columnsGroupIdentity: {
      en: 'Identity',
      ja: '識別',
    },
    columnsGroupTiming: {
      en: 'Timing',
      ja: 'タイミング',
    },
    columnsGroupPayload: {
      en: 'Payload',
      ja: 'ペイロード',
    },
    columnsSavedView: {
      en: 'Saved view',
      ja: '保存したビュー',
    },
    columnsHeaderColumn: {
      en: 'Header column',
      ja: 'ヘッダー列',
    },
    columnsHeaderNameLabel: {
      en: 'Header name for the configurable column',
      ja: '設定可能な列に表示するヘッダー名',
    },
    columnsHeaderApply: {
      en: 'Apply',
      ja: '適用',
    },
    columnsDomainSummary: {
      en: 'Domain summary',
      ja: 'ドメイン別サマリー',
    },
    columnsDomainSummaryToggle: {
      en: 'Show domain summary',
      ja: 'ドメイン別サマリーを表示',
    },
    columnsDomainSummaryShownStatus: {
      en: 'Domain summary shown.',
      ja: 'ドメイン別サマリーを表示しました。',
    },
    columnsDomainSummaryHiddenStatus: {
      en: 'Domain summary hidden.',
      ja: 'ドメイン別サマリーを非表示にしました。',
    },
    columnsMenuLabel: {
      en: 'Visible columns',
      ja: '表示する列',
    },
    columnsPresetApply: {
      en: 'Apply',
      ja: '適用',
    },
    columnsPresetApplySavedTitle: {
      en: 'Restore your saved columns and filters',
      ja: '保存した列とフィルターを復元する',
    },
    columnsPresetApplyDefaultTitle: {
      en: 'Restore the default columns and clear filters',
      ja: '既定の列に戻し、フィルターを消去する',
    },
    columnsPresetUpdate: {
      en: 'Update',
      ja: '更新',
    },
    columnsPresetUpdateTitle: {
      en: 'Save the current columns and filters as the preset',
      ja: '現在の列とフィルターをプリセットとして保存する',
    },
    columnsPresetForget: {
      en: 'Forget saved preset',
      ja: '保存したプリセットを破棄',
    },
    columnsPresetForgetTitle: {
      en: 'Delete the saved preset — Apply then restores the default view',
      ja: '保存したプリセットを削除する — 以後 [適用] は既定のビューに戻します',
    },
    columnsPresetAppliedStatus: {
      en: 'Applied preset.',
      ja: 'プリセットを適用しました。',
    },
    columnsPresetAppliedDefaultStatus: {
      en: 'Applied default view.',
      ja: '既定のビューを適用しました。',
    },
    columnsPresetSaveFailedStatus: {
      en: 'Could not save preset. Storage unavailable or data too large.',
      ja: 'プリセットを保存できませんでした。ストレージが使えないか、データが大きすぎます。',
    },
    columnsPresetUpdatedStatus: {
      en: 'Preset updated with the current view.',
      ja: '現在のビューでプリセットを更新しました。',
    },
    columnsPresetResetFailedStatus: {
      en: 'Could not reset preset. Storage unavailable.',
      ja: 'プリセットをリセットできませんでした。ストレージが使えません。',
    },
    columnsPresetResetStatus: {
      en: 'Preset reset. Apply now restores the default view.',
      ja: 'プリセットをリセットしました。以後 [適用] は既定のビューに戻します。',
    },
    // The detail-pane toolbar composes its placeholder, tooltips and
    // accessible names around the name of the pane it sits in, so the pane
    // names are dictionary entries rather than an English lookup table.
    paneNameRequestBody: {
      en: 'request body',
      ja: 'リクエストボディ',
    },
    paneNameRawRequest: {
      en: 'raw request',
      ja: '生リクエスト',
    },
    paneNameResponseBody: {
      en: 'response body',
      ja: 'レスポンスボディ',
    },
    paneNameRawResponse: {
      en: 'raw response',
      ja: '生レスポンス',
    },
    paneNameQuery: {
      en: 'query parameters',
      ja: 'クエリパラメーター',
    },
    paneNameRequestHeaders: {
      en: 'request headers',
      ja: 'リクエストヘッダー',
    },
    paneNameRequestCookies: {
      en: 'request cookies',
      ja: 'リクエストクッキー',
    },
    paneNameResponseHeaders: {
      en: 'response headers',
      ja: 'レスポンスヘッダー',
    },
    paneNameFallback: {
      en: 'this view',
      ja: 'このビュー',
    },
    paneSearchPlaceholder: {
      en: 'Search in {pane}',
      ja: '{pane}内を検索',
    },
    paneSearchInputLabel: {
      en: 'Search within the {pane} view',
      ja: '{pane}ビュー内を検索',
    },
    paneSearchPrevTitle: {
      en: 'Previous match (Shift+Enter)',
      ja: '前の一致 (Shift+Enter)',
    },
    paneSearchPrevLabel: {
      en: 'Previous match in the {pane} view',
      ja: '{pane}ビュー内の前の一致',
    },
    paneSearchNextTitle: {
      en: 'Next match (Enter)',
      ja: '次の一致 (Enter)',
    },
    paneSearchNextLabel: {
      en: 'Next match in the {pane} view',
      ja: '{pane}ビュー内の次の一致',
    },
    paneSearchExpandTitle: {
      en: 'Some matches are inside collapsed or truncated content. Expand everything to include them.',
      ja: '一部の一致は折りたたまれた内容や省略された内容の中にあります。すべて展開すると含まれます。',
    },
    paneSearchExpandLabel: {
      en: 'Expand collapsed content in the {pane} view to reveal all matches',
      ja: '{pane}ビューの折りたたまれた内容を展開してすべての一致を表示',
    },
    paneSearchNoMatches: {
      en: 'No matches',
      ja: '一致なし',
    },
    paneSearchCollapsedSuffix: {
      en: ' (+{count} collapsed)',
      ja: ' (+{count} 件は折りたたみ内)',
    },
    paneSearchInvalidRegex: {
      en: 'Invalid regular expression: {error}',
      ja: '正規表現が不正です: {error}',
    },
    paneCopyFull: {
      en: 'Copy full...',
      ja: 'フルでコピー...',
    },
    // Toasts for the copy controls this toolbar owns. The row menu's own
    // copy formats deliberately keep their canonical English status text.
    statusCopiedSanitizedUrl: {
      en: 'Copied sanitized URL',
      ja: 'サニタイズ済み URL をコピーしました',
    },
    statusCopiedValue: {
      en: 'Copied value',
      ja: '値をコピーしました',
    },
    statusCopiedValueMasked: {
      en: 'Copied masked value',
      ja: 'マスク済みの値をコピーしました',
    },
    statusCopiedSanitizedRequestBody: {
      en: 'Copied sanitized request body',
      ja: 'サニタイズ済みリクエストボディをコピーしました',
    },
    statusCopiedSanitizedRawRequest: {
      en: 'Copied sanitized raw request',
      ja: 'サニタイズ済み生リクエストをコピーしました',
    },
    statusCopiedSanitizedResponseBody: {
      en: 'Copied sanitized response body',
      ja: 'サニタイズ済みレスポンスボディをコピーしました',
    },
    statusCopiedSanitizedRawResponse: {
      en: 'Copied sanitized raw response',
      ja: 'サニタイズ済み生レスポンスをコピーしました',
    },
    statusCopiedFullConfirmed: {
      en: 'Copied full {label} after confirmation',
      ja: '確認のうえ完全版{label}をコピーしました',
    },
    menuCopySanitized: {
      en: 'Copy sanitized',
      ja: 'サニタイズ済みをコピー',
    },
    menuRequestActions: {
      en: 'Request actions',
      ja: 'リクエストの操作',
    },
    menuFilter: {
      en: 'Filter',
      ja: 'フィルター',
    },
    menuFilterOnly: {
      en: 'Only {column} {value}',
      ja: '{column}: {value} のみ',
    },
    menuFilterExclude: {
      en: 'Exclude {column} {value}',
      ja: '{column}: {value} を除外',
    },
    menuSelect: {
      en: 'Select',
      ja: '選択',
    },
    menuDeselect: {
      en: 'Deselect',
      ja: '選択解除',
    },
    menuHighlight: {
      en: 'Highlight',
      ja: 'ハイライト',
    },
    menuHighlightRows: {
      en: 'Highlight ({count} rows)',
      ja: 'ハイライト ({count} 行)',
    },
    menuHighlightColor: {
      en: 'Highlight color',
      ja: 'ハイライトの色',
    },
    menuHighlightColorNamed: {
      en: 'Highlight {color}',
      ja: '{color}でハイライト',
    },
    menuUnhighlight: {
      en: 'Unhighlight',
      ja: 'ハイライト解除',
    },
    menuUnhighlightRows: {
      en: 'Unhighlight ({count})',
      ja: 'ハイライト解除 ({count})',
    },
    menuClearHighlights: {
      en: 'Clear All Highlights',
      ja: 'すべてのハイライトを解除',
    },
    menuCompare: {
      en: 'Compare',
      ja: '比較',
    },
    menuCompareTwo: {
      en: 'Compare 2 selected requests',
      ja: '選択した 2 件のリクエストを比較',
    },
    menuKeepSelected: {
      en: 'Keep Selected ({count})',
      ja: '選択した行を残す ({count})',
    },
    menuDeleteSelected: {
      en: 'Delete Selected ({count})',
      ja: '選択した行を削除 ({count})',
    },
    menuCopySanitizedSummary: {
      en: 'Copy sanitized summary',
      ja: 'サニタイズ済みの概要をコピー',
    },
    menuCopySanitizedUrl: {
      en: 'Copy sanitized URL',
      ja: 'サニタイズ済み URL をコピー',
    },
    menuCopySanitizedCurl: {
      en: 'Copy sanitized cURL',
      ja: 'サニタイズ済み cURL をコピー',
    },
    menuCopySanitizedFetch: {
      en: 'Copy sanitized fetch',
      ja: 'サニタイズ済み fetch をコピー',
    },
    menuCopySanitizedPowershell: {
      en: 'Copy sanitized PowerShell',
      ja: 'サニタイズ済み PowerShell をコピー',
    },
    menuCopySanitizedMarkdown: {
      en: 'Copy sanitized Markdown',
      ja: 'サニタイズ済み Markdown をコピー',
    },
    menuCopySanitizedTable: {
      en: 'Copy sanitized Markdown table ({count} rows)',
      ja: 'サニタイズ済み Markdown テーブルをコピー ({count} 行)',
    },
    menuCopyFull: {
      en: 'Copy full (unsanitized)',
      ja: 'フル (未サニタイズ) でコピー',
    },
    menuCopyFullSummary: {
      en: 'Copy full request summary',
      ja: 'リクエスト概要をフルコピー',
    },
    menuCopyFullUrl: {
      en: 'Copy full URL',
      ja: 'URL をフルコピー',
    },
    menuCopyFullCurl: {
      en: 'Copy full cURL',
      ja: 'cURL をフルコピー',
    },
    menuCopyFullFetch: {
      en: 'Copy full fetch',
      ja: 'fetch をフルコピー',
    },
    menuCopyFullPowershell: {
      en: 'Copy full PowerShell',
      ja: 'PowerShell をフルコピー',
    },
    menuCopyFullMarkdown: {
      en: 'Copy full Markdown',
      ja: 'Markdown をフルコピー',
    },
    menuCopyFullRawRequest: {
      en: 'Copy full raw request',
      ja: '生リクエストをフルコピー',
    },
    menuCopyFullRequestBody: {
      en: 'Copy full request body',
      ja: 'リクエストボディをフルコピー',
    },
    menuResend: {
      en: 'Resend',
      ja: '再送',
    },
    menuResendUnchanged: {
      en: 'Resend unchanged',
      ja: 'そのまま再送',
    },
    menuResendEdit: {
      en: 'Edit and resend...',
      ja: '編集して再送...',
    },
    menuColumnMatch: {
      en: 'Match',
      ja: 'マッチ',
    },
    menuColumnId: {
      en: 'ID',
      ja: 'ID',
    },
    menuColumnMethod: {
      en: 'Method',
      ja: 'メソッド',
    },
    menuColumnStatus: {
      en: 'Status',
      ja: 'ステータス',
    },
    menuColumnDomain: {
      en: 'Domain',
      ja: 'ドメイン',
    },
    menuColumnPath: {
      en: 'Path',
      ja: 'パス',
    },
    menuColumnType: {
      en: 'Type',
      ja: '種別',
    },
    menuColumnOperation: {
      en: 'Operation',
      ja: 'オペレーション',
    },
    menuColumnCustomHeader: {
      en: 'Header',
      ja: 'ヘッダー',
    },
    menuColumnDuration: {
      en: 'Duration',
      ja: '所要時間',
    },
    menuColumnSize: {
      en: 'Size',
      ja: 'サイズ',
    },
    menuColumnClientStart: {
      en: 'Client start',
      ja: 'クライアント開始',
    },
    menuColumnServerDone: {
      en: 'Server done',
      ja: 'サーバー完了',
    },
    menuColumnInitiator: {
      en: 'Initiator',
      ja: '呼び出し元',
    },
    menuColumnUrl: {
      en: 'URL',
      ja: 'URL',
    },
    menuColumnWaterfall: {
      en: 'Waterfall',
      ja: 'ウォーターフォール',
    },
    menuColorYellow: {
      en: 'Yellow',
      ja: '黄',
    },
    menuColorRed: {
      en: 'Red',
      ja: '赤',
    },
    menuColorGreen: {
      en: 'Green',
      ja: '緑',
    },
    menuColorBlue: {
      en: 'Blue',
      ja: '青',
    },
    menuColorPurple: {
      en: 'Purple',
      ja: '紫',
    },
    menuColorOrange: {
      en: 'Orange',
      ja: 'オレンジ',
    },
  };

  let activeLanguage = 'en';

  // Resolves a dictionary key for strings the panel composes in JavaScript
  // (empty states, timing guidance, body-unavailability reasons). Falls back
  // to the English entry so a stale activeLanguage can never blank the UI.
  function uiText(key) {
    const entry = UI_TEXT[key];
    if (!entry) return '';
    return typeof entry[activeLanguage] === 'string' ? entry[activeLanguage] : entry.en || '';
  }

  // Fills {name} slots in a dictionary entry. Values (methods, labels, header
  // names) stay verbatim; only the frame around them translates.
  function uiTextFormat(key, replacements) {
    let text = uiText(key);
    for (const name of Object.keys(replacements || {})) {
      // split/join, not String.replace: capture-derived values (URL paths,
      // domains, cell values, header names) reach here, and $&, $`, $', $$ or
      // $<name> inside one would be read as a replacement pattern.
      text = text.split('{' + name + '}').join(String(replacements[name]));
    }
    return text;
  }

  // Rows keep their canonical English responseContentReason (it crosses the
  // mirror port and lands in exports); only these fixed reasons translate,
  // and only where they are rendered.
  const LOCALIZED_REASON_KEYS = new Map([
    [NAVIGATION_BODY_UNAVAILABLE_REASON, 'reasonNavigationBodyUnavailable'],
    [BODY_EVICTED_REASON, 'reasonBodyEvicted'],
    [IMPORT_BODY_MISSING_REASON, 'reasonImportNoContent'],
    [BODY_RETRIEVAL_FAILED_REASON, 'reasonBodyRetrievalFailed'],
    [BODY_UNAVAILABLE_REASON, 'reasonBodyUnavailable'],
  ]);

  function localizeBodyReason(reason) {
    const key = LOCALIZED_REASON_KEYS.get(reason);
    return key ? uiText(key) : reason;
  }

  function localizeTimingLimitation(limitation) {
    return limitation === TIMING_EVIDENCE_LIMITATION ? uiText('timingEvidenceLimitation') : limitation;
  }

  const TIMING_PHASE_TEXT_KEYS = Object.freeze({
    blocked: 'timingPhaseBlocked',
    dns: 'timingPhaseDns',
    connect: 'timingPhaseConnect',
    ssl: 'timingPhaseSsl',
    send: 'timingPhaseSend',
    wait: 'timingPhaseWait',
    receive: 'timingPhaseReceive',
  });

  const TIMING_PHASE_LABEL_KEYS = Object.freeze({
    blocked: 'timingPhaseLabelBlocked',
    dns: 'timingPhaseLabelDns',
    connect: 'timingPhaseLabelConnect',
    ssl: 'timingPhaseLabelSsl',
    send: 'timingPhaseLabelSend',
    wait: 'timingPhaseLabelWait',
    receive: 'timingPhaseLabelReceive',
  });

  // The phase name the table and the guide show, in the reader's language.
  // A key the guide does not document is rendered as itself, as before.
  function timingPhaseLabel(phase) {
    const guidance = getTimingPhaseGuidance(phase);
    if (!guidance) return typeof phase === 'string' ? phase : '';
    return uiText(TIMING_PHASE_LABEL_KEYS[phase]) || guidance.label;
  }

  function applyLanguage(pref) {
    const normalized = LANGS.includes(pref) ? pref : 'system';
    activeLanguage = resolveLanguage(normalized);
    document.documentElement.lang = activeLanguage;
    const elements = document.querySelectorAll('[data-i18n]');
    for (const el of elements) {
      const entry = UI_TEXT[el.getAttribute('data-i18n')];
      if (entry && typeof entry[activeLanguage] === 'string') el.textContent = entry[activeLanguage];
    }
    // Tooltips are explanations too. Only titles that no JavaScript path
    // rewrites carry data-i18n-title; dynamic titles (pause, undo, retention)
    // keep their composed English text.
    const titled = document.querySelectorAll('[data-i18n-title]');
    for (const el of titled) {
      const entry = UI_TEXT[el.getAttribute('data-i18n-title')];
      if (entry && typeof entry[activeLanguage] === 'string') el.title = entry[activeLanguage];
    }
    // A tooltip that translates while its aria-label does not leaves screen
    // readers on English; icon-only controls carry the hook on both.
    const labelled = document.querySelectorAll('[data-i18n-aria-label]');
    for (const el of labelled) {
      const entry = UI_TEXT[el.getAttribute('data-i18n-aria-label')];
      if (entry && typeof entry[activeLanguage] === 'string') el.setAttribute('aria-label', entry[activeLanguage]);
    }
    const select = $('#langSelect');
    if (select) select.value = normalized;
    refreshEmptyStateLanguage();
    refreshDetailsEmptyTitle();
    refreshSelectedRowDetailsLanguage();
    if (refreshInspectorToggleTitles) refreshInspectorToggleTitles();
    setStatus('Language=' + normalized);
  }

  // The details pane is painted once per selection, so its toolbars, tab
  // labels and kv keys would otherwise stay in the previous language until
  // the reader clicked another row. Repaint the open pane from the same
  // renderer the selection uses: the picked tab survives because the counts
  // are unchanged, and a pane search and the panes' scroll offsets restart.
  // A comparison owns the pane instead and is left standing: renderRowDetails
  // would paint one request over the two-request diff, and re-running
  // renderComparisonPanel here would not be a language switch either, because
  // that panel's own chrome (its close button, its legend labels) is written
  // in English rather than read from UI_TEXT. So the limitation is exact: a
  // language switch made while a comparison is open leaves the comparison's
  // chrome in the language it was painted in, and the next comparison the
  // reader opens is painted afresh. Localizing that panel is its own change.
  // A pane the reader closed also stays closed: closeDetailsPanel hides the
  // pane but leaves state.selectedRow standing (the row keeps its selection,
  // and a click on it reopens the pane), so gating on the selection alone
  // reopened a pane the reader had explicitly dismissed the moment they
  // switched language. The pane's own hidden flag is what says whether it is
  // open.
  function refreshSelectedRowDetailsLanguage() {
    if (!state.selectedRow || state.comparedRows) return;
    const details = $('#details');
    if (!details || details.hidden) return;
    renderRowDetails(state.selectedRow);
  }

  // The details header's empty state is the only header text that translates;
  // a selected request or a comparison keeps its own composed title.
  function refreshDetailsEmptyTitle() {
    if (state.selectedRow || state.comparedRows) return;
    const title = $('#detailsTitle');
    if (title) setDetailsTitleText(uiText('detailsEmptyTitle'));
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

  // "Show anyway" is a user choice, so it persists; the auto-hidden set it
  // opts out of never does. Kept in its own key so a stored column entry
  // keeps the exact { id, visible, width } shape everything else reads.
  function saveColumnPins() {
    try {
      localStorage.setItem(COL_PIN_KEY, JSON.stringify(Array.from(state.pinnedColumnIds)));
    } catch (_e) {
      console.warn('Failed to save pinned columns');
    }
  }

  function loadColumnPins() {
    try {
      const saved = localStorage.getItem(COL_PIN_KEY);
      if (!saved) return;
      const savedIds = JSON.parse(saved);
      if (!Array.isArray(savedIds)) return;
      // Only ids that still name a column. A pin for something that no longer
      // exists — a renamed id, a hand-edited store — can never be seen or
      // undone in the menu, because the menu only ever lists real columns.
      const knownIds = new Set(DEFAULT_COLUMNS.map((column) => column.id));
      state.pinnedColumnIds = new Set(savedIds.filter((id) => typeof id === 'string' && knownIds.has(id)));
      // Written back only when something was actually dropped, so the stored
      // set converges instead of carrying the junk to the next session.
      if (state.pinnedColumnIds.size !== savedIds.length) saveColumnPins();
    } catch (_e) {
      console.warn('Failed to load pinned columns');
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
            // If schema version changed, reset visibility to current defaults (keep width/order).
            // Match alone also takes its default width: it became a chip
            // gutter in v4, and a v3 64px Match would keep a visible label.
            const vis = needsVisReset ? def.visible : sc.visible;
            const width = needsVisReset && def.id === 'match' ? def.width : sc.width;
            ordered.push({ ...def, visible: vis, width });
            used.add(sc.id);
          }
        }
        for (let index = 0; index < DEFAULT_COLUMNS.length; index += 1) {
          const def = DEFAULT_COLUMNS[index];
          if (used.has(def.id)) continue;
          const insertAt = Math.min(index, ordered.length);
          ordered.splice(insertAt, 0, { ...def });
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

  // One user-configurable column bound to a named header — the trace-id /
  // cache-status pattern the Operation column proved. Response headers win,
  // request headers are the fallback, and the name persists beside the
  // other column preferences.
  let customHeaderColumnName = '';

  function syncCustomHeaderColumnLabel() {
    const column = state.columns.find((c) => c.id === 'customHeader');
    if (column) column.label = customHeaderColumnName || CUSTOM_HEADER_DEFAULT_LABEL;
  }

  function loadCustomHeaderColumnName() {
    try {
      customHeaderColumnName = String(localStorage.getItem(CUSTOM_HEADER_COLUMN_KEY) || '').trim();
    } catch (_e) {
      customHeaderColumnName = '';
    }
    syncCustomHeaderColumnLabel();
  }

  function saveCustomHeaderColumnName(name) {
    customHeaderColumnName = String(name || '').trim();
    try {
      if (customHeaderColumnName) localStorage.setItem(CUSTOM_HEADER_COLUMN_KEY, customHeaderColumnName);
      else localStorage.removeItem(CUSTOM_HEADER_COLUMN_KEY);
    } catch (_e) {
      // The column still works for this session without persistence.
    }
    syncCustomHeaderColumnLabel();
  }

  function loadDomainSummaryPref() {
    try {
      return localStorage.getItem(DOMAIN_SUMMARY_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function saveDomainSummaryPref(visible) {
    try {
      if (visible) localStorage.setItem(DOMAIN_SUMMARY_KEY, '1');
      else localStorage.removeItem(DOMAIN_SUMMARY_KEY);
    } catch (_e) {
      // The panel still toggles for this session without persistence.
    }
  }

  // Side-by-side details pane width. Only a dragged/keyed width is stored;
  // the stacked (narrow) split is height-based and never persisted.
  function loadDetailsWidthPref() {
    try {
      const width = Number(localStorage.getItem(DETAILS_WIDTH_KEY));
      return Number.isFinite(width) && width >= MIN_DETAILS_WIDTH ? Math.round(width) : null;
    } catch (_e) {
      return null;
    }
  }

  function saveDetailsWidthPref(width) {
    try {
      localStorage.setItem(DETAILS_WIDTH_KEY, String(Math.round(width)));
    } catch (_e) {
      console.warn('Failed to save details pane width');
    }
  }

  // Request/response split inside the details pane: the dragged or keyed
  // percent and which half (if any) is collapsed to its label + tab bar.
  function loadInspectorSplitPref() {
    try {
      return normalizeInspectorSplitPref(JSON.parse(localStorage.getItem(INSPECTOR_SPLIT_KEY) || 'null'));
    } catch (_e) {
      return normalizeInspectorSplitPref(null);
    }
  }

  function saveInspectorSplitPref(pref) {
    try {
      localStorage.setItem(INSPECTOR_SPLIT_KEY, JSON.stringify(normalizeInspectorSplitPref(pref)));
    } catch (_e) {
      console.warn('Failed to save inspector split');
    }
  }

  // Pure: restores the factory visibility and width of every column while
  // keeping the person's order and the configurable header's bound name.
  function applyDefaultColumnLayout(columns, defaults) {
    for (const column of columns) {
      const def = defaults.find((candidate) => candidate.id === column.id);
      if (!def) continue;
      column.visible = def.visible;
      column.width = def.width;
    }
    return columns;
  }

  function getRowHeaderColumnValue(row) {
    if (!customHeaderColumnName) return '';
    const fromResponse = getNormalizedHeaderValue(
      Array.isArray(row.responseHeaders) ? row.responseHeaders : [],
      customHeaderColumnName,
    );
    if (fromResponse) return fromResponse;
    return getNormalizedHeaderValue(
      Array.isArray(row.requestHeaders) ? row.requestHeaders : [],
      customHeaderColumnName,
    );
  }

  function moveColumn(fromId, toId) {
    const fromIdx = state.columns.findIndex((c) => c.id === fromId);
    const toIdx = state.columns.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [col] = state.columns.splice(fromIdx, 1);
    state.columns.splice(toIdx, 0, col);
    saveColumnPrefs();
  }

  function moveColumnByKeyboard(colId, direction) {
    const adjacentId = getAdjacentVisibleColumnId(
      state.columns,
      colId,
      direction,
      state.autoHiddenColumnIds,
    );
    if (!adjacentId) return false;
    const currentIndex = state.columns.findIndex((column) => column.id === colId);
    const adjacentIndex = state.columns.findIndex((column) => column.id === adjacentId);
    const currentColumn = state.columns[currentIndex];
    state.columns[currentIndex] = state.columns[adjacentIndex];
    state.columns[adjacentIndex] = currentColumn;
    saveColumnPrefs();
    return true;
  }

  // ============================================================
  // Section 7: Filtering [U3][U5][P3]
  // ============================================================
  function getRowFilterValue(row, colId) {
    if (colId === 'customHeader') return getRowHeaderColumnValue(row);
    if (colId === 'initiator') return row.initiator ? row.initiator.text : '';
    if (colId === 'clientStart') return row.clientStartFilter || row.clientStart || '';
    if (colId === 'serverDone') return row.serverDoneFilter || row.serverDone || '';
    const v = row[colId];
    return v == null ? '' : v;
  }

  // The value a one-click row filter should carry. A path or URL arrives with
  // its query string attached, and a query string is per-request state —
  // session ids, cache busters, consent blobs, timestamps — so a rule built
  // from one matches that single request and nothing else, which is the
  // opposite of what "exclude this noise" is asking for. Cutting at the query
  // leaves the unit people actually mean by "this kind of request".
  function getQuickFilterValue(row, colId) {
    const value = String(getRowFilterValue(row, colId) || '').trim();
    if (colId !== 'path' && colId !== 'url') return value;
    const queryStart = value.search(/[?#]/);
    const withoutQuery = queryStart > 0 ? value.slice(0, queryStart) : '';
    return withoutQuery || value;
  }

  // Menu entries name their filter value, and a captured URL has no length
  // bound — an ad-tech path ran past 1,500 characters and wrapped the context
  // menu across the whole viewport. The label is shortened for the menu; the
  // rule and the tooltip still carry the whole value.
  const QUICK_FILTER_LABEL_MAX_CHARS = 48;

  function shortenMenuValue(value) {
    const text = String(value == null ? '' : value);
    return text.length > QUICK_FILTER_LABEL_MAX_CHARS
      ? text.slice(0, QUICK_FILTER_LABEL_MAX_CHARS - 1) + '…'
      : text;
  }

  // The row menu builds sentences around a column name ("Only Domain x"), so
  // the name has to translate with the sentence it sits in. This lookup is
  // for menu text only: the grid header and its stored layout keep the
  // DEFAULT_COLUMNS label, and every entry's en matches that label verbatim.
  const MENU_COLUMN_LABEL_KEYS = {
    match: 'menuColumnMatch',
    id: 'menuColumnId',
    method: 'menuColumnMethod',
    status: 'menuColumnStatus',
    domain: 'menuColumnDomain',
    path: 'menuColumnPath',
    type: 'menuColumnType',
    operation: 'menuColumnOperation',
    customHeader: 'menuColumnCustomHeader',
    duration: 'menuColumnDuration',
    size: 'menuColumnSize',
    clientStart: 'menuColumnClientStart',
    serverDone: 'menuColumnServerDone',
    initiator: 'menuColumnInitiator',
    url: 'menuColumnUrl',
    waterfall: 'menuColumnWaterfall',
  };

  function menuColumnLabel(colId, fallback) {
    const runtimeLabel = String(fallback == null ? '' : fallback);
    // The custom-header column is renamed at runtime to the header it shows
    // ("x-request-id"), so the configured name is what the sentence must
    // quote; the dictionary entry only covers the unconfigured "Header".
    // Whether it is configured is state, not text: comparing the label
    // against "Header" sent a column bound to a header actually named
    // "Header" back to the dictionary, which then quoted a translated UI
    // noun in place of the captured header name.
    if (colId === 'customHeader' && customHeaderColumnName) {
      return customHeaderColumnName;
    }
    const key = MENU_COLUMN_LABEL_KEYS[colId];
    const localized = key ? uiText(key) : '';
    return localized || runtimeLabel;
  }

  // HIGHLIGHT_COLORS.name is the canonical English name the swatch class is
  // built from; only what the reader sees is translated.
  const MENU_COLOR_LABEL_KEYS = {
    'hl-yellow': 'menuColorYellow',
    'hl-red': 'menuColorRed',
    'hl-green': 'menuColorGreen',
    'hl-blue': 'menuColorBlue',
    'hl-purple': 'menuColorPurple',
    'hl-orange': 'menuColorOrange',
  };

  function menuHighlightColorLabel(highlightColor) {
    const key = MENU_COLOR_LABEL_KEYS[highlightColor.cls];
    const localized = key ? uiText(key) : '';
    return localized || highlightColor.name;
  }

  // The one allow-list a method may become a class token through. Every
  // caller that colours by method goes through it, so a hostile method string
  // ("GET evil", 'GET"') can never inject an extra token.
  function methodClassToken(method) {
    const upper = String(method == null ? '' : method).toUpperCase();
    if (HTTP_METHODS.indexOf(upper) > -1 || upper === 'WS' || upper === 'SSE') return 'method-' + upper;
    return '';
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
      return compareRequestTimes(a, b, colId);
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
        const needsValue = !isValuelessFilterOperator(cond && cond.op);
        if (needsValue && (!cond.value || !cond.value.trim())) return true;
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
        if (isVisualOnlyColumn(colId)) continue;
        const rule = state.columnFilterRules[colId];
        if (!rule) continue;
        const rowValue = getRowFilterValue(r, colId);
        const isNumeric = NUMERIC_COLUMNS.indexOf(colId) > -1;
        if (!evaluateFilterRule(rowValue, rule, isNumeric)) return false;
      }
      return true;
    });
  }

  function clearColumnFilters() {
    state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();
    renderBody();
    syncSearchUIAfterRender();
    setStatus('Column filters cleared');
  }

  function saveViewPreset(preset) {
    try {
      const normalized = normalizeViewPreset(preset);
      if (!normalized) return false;
      const serialized = JSON.stringify(normalized);
      // Guard against exceeding the storage limit using actual UTF-8 byte count.
      const byteLength = new TextEncoder().encode(serialized).length;
      if (byteLength > MAX_PRESET_TOTAL_BYTES) return false;
      localStorage.setItem(VIEW_PRESET_KEY, serialized);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function migrateLegacyFilterPresets() {
    // One-time: the retired multi-preset store's first entry seeds the single
    // view preset's filters so a previously saved setup survives the redesign.
    try {
      const saved = localStorage.getItem(LEGACY_FILTER_PRESET_KEY);
      if (!saved) return null;
      localStorage.removeItem(LEGACY_FILTER_PRESET_KEY);
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return null;
      const first = parsed.find((p) => p && p.filterRules != null);
      if (!first) return null;
      const preset = normalizeViewPreset({ filterRules: first.filterRules });
      if (preset) saveViewPreset(preset);
      return preset;
    } catch (_e) {
      return null;
    }
  }

  function loadViewPreset() {
    // Returns { preset: object|null, error: string|null }.
    // error is non-null when stored data is present but unreadable (corruption/oversize).
    // A missing key returns { preset: null, error: null } — applying a null preset
    // restores the factory default view, so Apply is meaningful before any Update.
    try {
      const saved = localStorage.getItem(VIEW_PRESET_KEY);
      if (!saved) return { preset: migrateLegacyFilterPresets(), error: null };
      // Pre-parse size guard: reject oversize blobs before JSON.parse using actual UTF-8 byte count.
      if (new TextEncoder().encode(saved).length > MAX_PRESET_TOTAL_BYTES * 2) {
        return { preset: null, error: 'Preset store is oversized and could not be loaded.' };
      }
      let parsed;
      try {
        parsed = JSON.parse(saved);
      } catch (_e) {
        return { preset: null, error: 'Preset store is corrupted and could not be loaded.' };
      }
      const preset = normalizeViewPreset(parsed);
      if (!preset) return { preset: null, error: 'Preset store is corrupted and could not be loaded.' };
      return { preset, error: null };
    } catch (_e) {
      return { preset: null, error: 'Preset store could not be read.' };
    }
  }

  function clearViewPreset() {
    try {
      localStorage.removeItem(VIEW_PRESET_KEY);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function hasStoredViewPreset() {
    try {
      return localStorage.getItem(VIEW_PRESET_KEY) != null;
    } catch (_e) {
      return false;
    }
  }

  function buildViewPresetFromState() {
    const columns = {};
    for (const column of state.columns) columns[column.id] = !!column.visible;
    return { columns, filterRules: serializeFilterState(state.columnFilterRules) };
  }

  function applyViewPreset(preset) {
    // A null preset (never saved) restores the factory default view.
    for (const column of state.columns) {
      const def = DEFAULT_COLUMNS.find((d) => d.id === column.id);
      const stored =
        preset && Object.prototype.hasOwnProperty.call(preset.columns, column.id)
          ? preset.columns[column.id]
          : def
            ? def.visible
            : column.visible;
      column.visible = stored;
    }
    state.columnFilterRules = deserializeFilterState(preset ? preset.filterRules : {});
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

  // GraphQL and JSON-RPC traffic all reads as "POST /api" in URL columns;
  // the operation label pulls the request's real name out of its body so
  // API calls can be scanned, sorted, and filtered by what they do.
  const OPERATION_BODY_PARSE_LIMIT_CHARS = 262144;

  function matchGraphQlOperation(source) {
    const named = /\b(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(source);
    if (named) return named[1];
    const keyword = /^\s*(query|mutation|subscription)\b/.exec(source);
    if (keyword) return keyword[1];
    return /^\s*\{/.test(source) ? 'query' : '';
  }

  function extractOperationLabel(postData) {
    if (!postData || typeof postData !== 'object') return '';
    const text = typeof postData.text === 'string' ? postData.text : '';
    if (!text) return '';
    const mime = typeof postData.mimeType === 'string' ? postData.mimeType.toLowerCase() : '';
    if (mime.includes('application/graphql')) return matchGraphQlOperation(text);
    if (!mime.includes('json')) return '';
    if (text.length > OPERATION_BODY_PARSE_LIMIT_CHARS) return '';
    // A cheap substring gate keeps large imports from paying JSON.parse for
    // bodies that cannot possibly carry an operation.
    if (!text.includes('"operationName"') && !text.includes('"query"') && !text.includes('"method"')) {
      return '';
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      return '';
    }
    const describeEntry = (entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
      if (typeof entry.operationName === 'string' && entry.operationName) return entry.operationName;
      if (typeof entry.query === 'string' && entry.query.trim()) return matchGraphQlOperation(entry.query);
      if (
        typeof entry.method === 'string' &&
        entry.method &&
        ('jsonrpc' in entry || ('id' in entry && 'params' in entry))
      ) {
        return entry.method;
      }
      return '';
    };
    if (Array.isArray(parsed)) {
      const labels = parsed.map(describeEntry).filter(Boolean);
      if (labels.length === 0) return '';
      return labels.length > 1 ? labels[0] + ' (+' + (labels.length - 1) + ')' : labels[0];
    }
    return describeEntry(parsed);
  }

  function buildRowFromRequest(req, assignedId) {
    const isoStr = (req && req.startedDateTime) || '';
    const durationMs = req && Number.isFinite(req.time) ? req.time : 0;
    const clientStartEpoch = getRequestEpoch(isoStr, INVALID_REQUEST_EPOCH);
    let serverDoneIso = '';
    let serverDoneEpoch = INVALID_REQUEST_EPOCH;
    if (isoStr && durationMs > 0 && clientStartEpoch !== INVALID_REQUEST_EPOCH) {
      serverDoneEpoch = clientStartEpoch + durationMs;
      serverDoneIso = new Date(serverDoneEpoch).toISOString();
    }
    const embeddedContent = req && req.response && req.response.content;
    const embeddedResponseContent =
      embeddedContent && typeof embeddedContent.text === 'string' ? embeddedContent.text : null;
    const embeddedResponseEncoding =
      embeddedResponseContent !== null && embeddedContent.encoding === 'base64' ? 'base64' : '';
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
      clientStartEpoch,
      serverDoneEpoch,
      duration: durationMs,
      startedDateTime: isoStr,
      requestHeaders: (req && req.request && req.request.headers) || [],
      responseHeaders: (req && req.response && req.response.headers) || [],
      requestPostData: (req && req.request && req.request.postData) || null,
      operation: extractOperationLabel((req && req.request && req.request.postData) || null),
      timings: (req && req.timings) || {},
      initiator: formatInitiator(req.initiator),
      responseContent: embeddedResponseContent,
      responseContentEncoding: embeddedResponseEncoding,
      responseContentText: null,
      responseContentBytes: 0,
      responseContentState: embeddedResponseContent === null ? 'not-loaded' : 'pending-admission',
      responseContentReason: '',
      _responseContentPromise: null,
      _responsePayloadPromise: null,
      responseContentError: null,
      _retentionDisposed: false,
    };
    const p = extractUrlParts(r.url);
    r.domain = p.domain;
    r.path = p.path;
    r.id = Number.isInteger(assignedId) ? assignedId : state.nextId++;
    return r;
  }

  // ---- DevTools-session mirror (pop-out browser tab) ----
  // The pop-out tab is this same panel.html opened with ?view=window. The
  // DevTools panel owns capture and initiates a chrome.runtime port to the
  // tab; the tab renders what the port delivers. Response bodies stay on the
  // DevTools side and travel only on demand, so the mirror never widens what
  // the panel already holds. A one-second sync heartbeat carries row count
  // and max id; any mismatch makes the tab request a full snapshot, which is
  // how clears, undos, imports, and retention evictions propagate without
  // hooking each of those code paths.
  const MIRROR_PROTOCOL_VERSION = 2;
  const MIRROR_PORT_PREFIX = 'networkplus-mirror:';
  const MIRROR_SNAPSHOT_CHUNK_SIZE = 500;
  // A snapshot chunk is bounded by characters as well as rows: 500 stream rows
  // can carry ~256 KiB of frame text each, and one oversize postMessage throws,
  // is swallowed by the port wrapper, and leaves the viewer requesting a fresh
  // snapshot every second forever. Chunks flush at whichever bound hits first.
  const MIRROR_SNAPSHOT_CHUNK_LIMIT_CHARS = 2 * 1024 * 1024;
  const MIRROR_SYNC_INTERVAL_MS = 1000;
  const MIRROR_RECONNECT_INTERVAL_MS = 1500;
  // Import files travel the port as base64 chunks; the byte cap keeps one
  // transferred archive from dwarfing what the host itself would accept.
  const MIRROR_IMPORT_MAX_BYTES = 64 * 1024 * 1024;
  const MIRROR_IMPORT_CHUNK_CHARS = 512 * 1024;
  // Commands answer or fail — a host that is gone without a disconnect (or
  // drops a result) must not strand a tab affordance forever. The import
  // budget is generous because a 64 MiB decode + parse on a busy host is
  // legitimate work, not a hang.
  const MIRROR_COMMAND_TIMEOUT_MS = 30 * 1000;
  const MIRROR_IMPORT_RESULT_TIMEOUT_MS = 120 * 1000;
  // How many reconnect ticks the host spends probing for a mirror tab that
  // outlived an earlier DevTools session before giving up.
  const MIRROR_ADOPT_PROBE_ATTEMPTS = 5;

  function getMirrorViewParams(search) {
    const params = new URLSearchParams(typeof search === 'string' ? search : '');
    return {
      viewerMode: params.get('view') === 'window',
      sourceTabId: params.get('src') || '',
    };
  }

  function serializeRowForMirror(row) {
    return {
      id: row.id,
      startedDateTime: row.startedDateTime,
      time: row.duration,
      initiator: row.initiator || null,
      request: {
        method: row.method,
        url: row.url,
        headers: Array.isArray(row.requestHeaders) ? row.requestHeaders : [],
        postData: row.requestPostData || null,
      },
      response: {
        status: row.status,
        statusText: row.statusText,
        httpVersion: row.protocol,
        headers: Array.isArray(row.responseHeaders) ? row.responseHeaders : [],
        bodySize: row.size,
        content: { mimeType: row.type, size: row.size },
      },
      timings: row.timings || {},
    };
  }

  function buildMirrorEntryFromWire(wireRow) {
    const wire = wireRow && typeof wireRow === 'object' ? wireRow : {};
    const request = wire.request && typeof wire.request === 'object' ? wire.request : {};
    return {
      startedDateTime: typeof wire.startedDateTime === 'string' ? wire.startedDateTime : '',
      time: Number.isFinite(wire.time) ? wire.time : 0,
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        postData: request.postData || null,
      },
      response: wire.response && typeof wire.response === 'object' ? wire.response : {},
      timings: wire.timings && typeof wire.timings === 'object' ? wire.timings : {},
    };
  }

  // ---- WebSocket capture (opt-in, no extra permissions) ----
  // chrome.devtools.network never surfaces WebSocket traffic to extensions,
  // and the chrome.debugger alternative cannot even attach while DevTools is
  // open on the tab. Capture therefore wraps the inspected page's WebSocket
  // constructor through inspectedWindow.eval: the wrapper queues connection
  // events and frame previews inside the page, and the panel drains the
  // queue once a second. Honest limits: only sockets created while capture
  // is on are seen, the wrapper lives in the page's JS environment (traffic
  // itself is never altered), and a navigation wipes it until reinjection.
  const WS_QUEUE_CAP = 5000;
  const WS_FRAME_PREVIEW_CHARS = 2048;
  const WS_DIRECTION_TEXT_LIMIT_CHARS = 262144;
  const WS_POLL_INTERVAL_MS = 1000;

  function pageWebSocketWrapper(queueCap, previewChars) {
    if (window.__networkPlusWS__) {
      window.__networkPlusWS__.setEnabled(true);
      return 'already-installed';
    }
    const queue = [];
    let enabled = true;
    let nextSocketId = 1;
    const preview = function (data) {
      try {
        if (typeof data === 'string') return data.slice(0, previewChars);
        if (data && typeof data.byteLength === 'number') return '[binary ' + data.byteLength + ' bytes]';
        if (data && typeof data.size === 'number') return '[binary ' + data.size + ' bytes]';
        return '[unsupported frame]';
      } catch (_error) {
        return '[unreadable frame]';
      }
    };
    let droppedCount = 0;
    const record = function (entry) {
      if (!enabled) return;
      entry.at = Date.now();
      queue.push(entry);
      if (queue.length > queueCap) {
        // Prefer dropping data frames: a lost frame loses one line, a lost
        // open-attempt or close loses the connection's existence or leaves it
        // 'Open' forever. The drain reports how much was lost.
        let dropIndex = -1;
        for (let i = 0; i < queue.length; i += 1) {
          const kind = queue[i].kind;
          if (kind === 'ws-sent' || kind === 'ws-received') {
            dropIndex = i;
            break;
          }
        }
        if (dropIndex >= 0) queue.splice(dropIndex, 1);
        else queue.shift();
        droppedCount += 1;
      }
    };
    const Native = window.WebSocket;
    const Wrapped = function (url, protocols) {
      const socket = protocols === undefined ? new Native(url) : new Native(url, protocols);
      const socketId = nextSocketId;
      nextSocketId += 1;
      record({
        kind: 'ws-open-attempt',
        socketId,
        url: String(url),
        protocols: protocols === undefined ? '' : String(protocols),
      });
      const nativeSend = socket.send.bind(socket);
      socket.send = function (data) {
        record({ kind: 'ws-sent', socketId, preview: preview(data) });
        return nativeSend(data);
      };
      socket.addEventListener('open', function () {
        record({ kind: 'ws-open', socketId });
      });
      socket.addEventListener('message', function (event) {
        record({ kind: 'ws-received', socketId, preview: preview(event.data) });
      });
      socket.addEventListener('error', function () {
        record({ kind: 'ws-error', socketId });
      });
      socket.addEventListener('close', function (event) {
        record({ kind: 'ws-closed', socketId, code: event.code, reason: String(event.reason || '').slice(0, 256) });
      });
      return socket;
    };
    Wrapped.prototype = Native.prototype;
    Wrapped.CONNECTING = 0;
    Wrapped.OPEN = 1;
    Wrapped.CLOSING = 2;
    Wrapped.CLOSED = 3;
    window.WebSocket = Wrapped;
    window.__networkPlusWS__ = {
      drain: function () {
        const events = queue.splice(0, queue.length);
        if (droppedCount > 0) {
          events.push({ kind: 'ws-overflow', socketId: -1, count: droppedCount, at: Date.now() });
          droppedCount = 0;
        }
        return events;
      },
      setEnabled: function (value) {
        enabled = value === true;
      },
    };
    return 'installed';
  }

  function buildWsWrapperSource() {
    return '(' + String(pageWebSocketWrapper) + ')(' + WS_QUEUE_CAP + ',' + WS_FRAME_PREVIEW_CHARS + ')';
  }

  // The SSE wrapper speaks the same ws-* event dialect as the WebSocket
  // wrapper so ingestWsEvents applies unchanged: every server event is a
  // received frame, and open/error/close become the same lifecycle marks.
  // Named events (event: foo) are observable only once the page registers a
  // listener for them, which the wrapped addEventListener surfaces.
  function pageEventSourceWrapper(queueCap, previewChars) {
    if (window.__networkPlusSSE__) {
      window.__networkPlusSSE__.setEnabled(true);
      return 'already-installed';
    }
    if (!window.EventSource) return 'no-eventsource';
    const queue = [];
    let enabled = true;
    let nextSocketId = 1;
    const preview = function (data) {
      try {
        return typeof data === 'string' ? data.slice(0, previewChars) : String(data).slice(0, previewChars);
      } catch (_error) {
        return '[unreadable event]';
      }
    };
    let droppedCount = 0;
    const record = function (entry) {
      if (!enabled) return;
      entry.at = Date.now();
      queue.push(entry);
      if (queue.length > queueCap) {
        let dropIndex = -1;
        for (let i = 0; i < queue.length; i += 1) {
          const kind = queue[i].kind;
          if (kind === 'ws-sent' || kind === 'ws-received') {
            dropIndex = i;
            break;
          }
        }
        if (dropIndex >= 0) queue.splice(dropIndex, 1);
        else queue.shift();
        droppedCount += 1;
      }
    };
    const Native = window.EventSource;
    const Wrapped = function (url, config) {
      const source = config === undefined ? new Native(url) : new Native(url, config);
      const socketId = nextSocketId;
      nextSocketId += 1;
      record({ kind: 'ws-open-attempt', socketId, url: String(url), protocols: '' });
      const nativeAdd = source.addEventListener.bind(source);
      const seenTypes = {};
      let seenTypeCount = 0;
      const observe = function (type) {
        if (seenTypes[type]) return;
        if (seenTypeCount >= 64) return;
        seenTypeCount += 1;
        seenTypes[type] = true;
        nativeAdd(type, function (event) {
          record({
            kind: 'ws-received',
            socketId,
            preview: (type === 'message' ? '' : type + ': ') + preview(event && event.data),
          });
        });
      };
      observe('message');
      nativeAdd('open', function () {
        record({ kind: 'ws-open', socketId });
      });
      nativeAdd('error', function () {
        record({ kind: 'ws-error', socketId });
      });
      source.addEventListener = function (type, listener, options) {
        const name = String(type);
        // Both bounds matter: 64 chars per name, and at most 64 distinct
        // observed types per source, so a hostile page can register neither
        // unbounded names nor unbounded types.
        if (name && name !== 'message' && name !== 'open' && name !== 'error' && name.length <= 64) observe(name);
        return nativeAdd(type, listener, options);
      };
      const nativeClose = source.close.bind(source);
      source.close = function () {
        record({ kind: 'ws-closed', socketId });
        return nativeClose();
      };
      return source;
    };
    Wrapped.prototype = Native.prototype;
    Wrapped.CONNECTING = 0;
    Wrapped.OPEN = 1;
    Wrapped.CLOSED = 2;
    window.EventSource = Wrapped;
    window.__networkPlusSSE__ = {
      drain: function () {
        const events = queue.splice(0, queue.length);
        if (droppedCount > 0) {
          events.push({ kind: 'ws-overflow', socketId: -1, count: droppedCount, at: Date.now() });
          droppedCount = 0;
        }
        return events;
      },
      setEnabled: function (value) {
        enabled = value === true;
      },
    };
    return 'installed';
  }

  function buildSseWrapperSource() {
    return '(' + String(pageEventSourceWrapper) + ')(' + WS_QUEUE_CAP + ',' + WS_FRAME_PREVIEW_CHARS + ')';
  }

  function formatWsFrameLine(event) {
    const stamp = Number.isFinite(event.at) ? new Date(event.at).toISOString().slice(11, 23) : '??:??:??.???';
    if (event.kind === 'ws-sent') return '↑ ' + stamp + ' ' + (event.preview || '');
    if (event.kind === 'ws-received') return '↓ ' + stamp + ' ' + (event.preview || '');
    if (event.kind === 'ws-open') return '— ' + stamp + ' connection open';
    if (event.kind === 'ws-error') return '— ' + stamp + ' connection error';
    if (event.kind === 'ws-closed') {
      // SSE close carries no close code; WebSocket close always does.
      if (event.code == null) return '— ' + stamp + ' closed';
      return '— ' + stamp + ' closed (code ' + event.code + (event.reason ? ', ' + event.reason : '') + ')';
    }
    return '';
  }

  function appendBoundedWsText(existing, line, limitChars) {
    const next = existing ? existing + '\n' + line : line;
    if (next.length <= limitChars) return next;
    const tail = next.slice(next.length - limitChars);
    const firstBreak = tail.indexOf('\n');
    return '… earlier frames trimmed …\n' + (firstBreak >= 0 ? tail.slice(firstBreak + 1) : tail);
  }

  // A live stream transcript grows with every drain and is bounded per
  // direction by appendBoundedWsText, so it must never sit in the 32 MiB
  // response cache: the cache accounts a body once at admission and evicts by
  // age, and both halves are wrong for a transcript — growth after admission
  // went unaccounted, and eviction destroyed the recorded frames of a
  // connection that was still open. Stream rows publish their transcript
  // directly in the shape admission would have produced and stay out of the
  // cache map entirely. Imported WS conversations are static text and keep
  // ordinary admission.
  function isLiveStreamRow(row) {
    return Boolean(row) && typeof row._wsSocketId === 'number';
  }

  function publishStreamTranscript(row) {
    const content = typeof row.responseContent === 'string' ? row.responseContent : '';
    row.responseContent = content;
    row.responseContentEncoding = '';
    row.responseContentText = content;
    row.responseContentBytes = getUtf8ByteLength(content);
    row.responseContentState = 'cached';
    row.responseContentReason = '';
    row.responseContentError = null;
  }

  // Applies drained wrapper events to rows. The context supplies row lookup
  // and creation so the same logic is testable without a DevTools session.
  function ingestWsEvents(events, context) {
    const changedRows = new Set();
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || typeof event !== 'object' || typeof event.socketId !== 'number') continue;
      if (event.kind === 'ws-open-attempt') {
        context.createRow(event);
        continue;
      }
      const row = context.getRow(event.socketId);
      if (!row) continue;
      if (event.kind === 'ws-sent') {
        if (!row.requestPostData || typeof row.requestPostData !== 'object') {
          row.requestPostData = { mimeType: 'text/plain', text: '' };
        }
        row.requestPostData.text = appendBoundedWsText(
          row.requestPostData.text || '',
          formatWsFrameLine(event),
          WS_DIRECTION_TEXT_LIMIT_CHARS,
        );
        row._wsSentCount = (row._wsSentCount || 0) + 1;
        if (row.method !== 'SSE') {
          const preview = event.preview || '';
          const binary = WS_BINARY_PREVIEW_PATTERN.test(preview);
          recordWsFrame(row, { type: 'send', time: event.at, binary, data: binary ? '' : preview });
        }
      } else {
        const line = formatWsFrameLine(event);
        if (line) {
          row.responseContent = appendBoundedWsText(
            typeof row.responseContent === 'string' ? row.responseContent : '',
            line,
            WS_DIRECTION_TEXT_LIMIT_CHARS,
          );
          if (isLiveStreamRow(row)) {
            publishStreamTranscript(row);
          } else {
            row.responseContentState = 'pending-admission';
            row.responseContentEncoding = '';
            row.responseContentText = null;
            row.responseContentBytes = 0;
          }
        }
        if (event.kind === 'ws-open') row.statusText = 'Open';
        if (event.kind === 'ws-received') {
          row._wsReceivedCount = (row._wsReceivedCount || 0) + 1;
          row.size = (row.size || 0) + (event.preview ? event.preview.length : 0);
          if (row.method !== 'SSE') {
            const preview = event.preview || '';
            const binary = WS_BINARY_PREVIEW_PATTERN.test(preview);
            recordWsFrame(row, { type: 'receive', time: event.at, binary, data: binary ? '' : preview });
          }
        }
        if (event.kind === 'ws-closed') {
          row.statusText = 'Closed';
          if (Number.isFinite(event.at)) {
            const startedEpoch = getRequestEpoch(row.startedDateTime, INVALID_REQUEST_EPOCH);
            if (startedEpoch !== INVALID_REQUEST_EPOCH && event.at >= startedEpoch) {
              row.duration = event.at - startedEpoch;
            }
          }
        }
      }
      changedRows.add(row);
    }
    return Array.from(changedRows);
  }

  // Base64 travels the mirror port for import bytes; both directions stay
  // chunk-safe so a large SAZ never builds one giant call-stack string.
  function bytesToBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 8192));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function mirrorSessionToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  // Rough serialized size of a wire row, for chunking. Counting the two
  // transcript directions and headers covers everything that actually grows.
  function estimateWireRowChars(wireRow) {
    let chars = 256 + (wireRow.request.url ? wireRow.request.url.length : 0);
    const postData = wireRow.request.postData;
    if (postData && typeof postData.text === 'string') chars += postData.text.length;
    for (const header of wireRow.request.headers) {
      chars += (header.name ? header.name.length : 0) + (header.value ? header.value.length : 0) + 8;
    }
    for (const header of wireRow.response.headers) {
      chars += (header.name ? header.name.length : 0) + (header.value ? header.value.length : 0) + 8;
    }
    return chars;
  }

  function createMirrorHostSession({
    postMessage,
    getRows,
    isPaused,
    fetchBodyForRow,
    getControlState,
    executeCommand,
    receiveImportFile,
  }) {
    let snapshotGeneration = 0;
    const importTransfers = new Map();
    // Row ids restart at 1 in every DevTools session, and a mirror tab keeps
    // its rows after a disconnect. Without a session identity, a reattached
    // tab would alias the old session's rows onto the new session's ids and
    // present the wrong evidence. The token travels on everything that
    // carries or reconciles rows.
    const sessionToken = mirrorSessionToken();
    const transferKey = (message) => String(message.viewer || '') + ':' + message.commandId;
    const sendSnapshot = () => {
      snapshotGeneration += 1;
      const generation = snapshotGeneration;
      const rows = getRows();
      postMessage({
        type: 'snapshot-start',
        generation,
        session: sessionToken,
        total: rows.length,
        protocolVersion: MIRROR_PROTOCOL_VERSION,
      });
      let chunk = [];
      let chunkChars = 0;
      const flushChunk = () => {
        if (chunk.length === 0) return;
        postMessage({ type: 'snapshot-rows', generation, rows: chunk });
        chunk = [];
        chunkChars = 0;
      };
      for (const row of rows) {
        const wireRow = serializeRowForMirror(row);
        const rowChars = estimateWireRowChars(wireRow);
        if (chunk.length > 0 && (chunk.length >= MIRROR_SNAPSHOT_CHUNK_SIZE || chunkChars + rowChars > MIRROR_SNAPSHOT_CHUNK_LIMIT_CHARS)) {
          flushChunk();
        }
        chunk.push(wireRow);
        chunkChars += rowChars;
      }
      flushChunk();
      postMessage({ type: 'snapshot-end', generation });
    };
    const sendSync = () => {
      const rows = getRows();
      let maxId = 0;
      for (const row of rows) if (row.id > maxId) maxId = row.id;
      postMessage({
        type: 'sync',
        session: sessionToken,
        count: rows.length,
        maxId,
        paused: isPaused() === true,
        control: typeof getControlState === 'function' ? getControlState() : null,
      });
    };
    const sendCommandResult = (commandId, error, viewer) => {
      postMessage({ type: 'command-result', commandId, viewer, ok: !error, error: error || '' });
    };
    const handleMessage = (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'hello' || message.type === 'snapshot-request') {
        sendSnapshot();
        sendSync();
        return;
      }
      if (message.type === 'body-request') {
        const requestId = message.requestId;
        const viewer = message.viewer;
        Promise.resolve()
          .then(() => fetchBodyForRow(message.rowId))
          .then(
            (payload) =>
              postMessage({
                type: 'body-result',
                requestId,
                viewer,
                ok: true,
                content: payload.content,
                encoding: payload.encoding,
              }),
            (error) =>
              postMessage({
                type: 'body-result',
                requestId,
                viewer,
                ok: false,
                error: error && error.message ? error.message : 'Response content is unavailable.',
              }),
          );
        return;
      }
      if (message.type === 'command') {
        const commandId = message.commandId;
        const viewer = message.viewer;
        if (typeof executeCommand !== 'function') {
          sendCommandResult(commandId, 'This DevTools session does not accept mirror commands.', viewer);
          return;
        }
        executeCommand(String(message.name || ''), message.args || {}, (error) => {
          sendCommandResult(commandId, error, viewer);
          sendSync();
        });
        return;
      }
      if (message.type === 'import-begin') {
        if (!Number.isFinite(message.size) || message.size > MIRROR_IMPORT_MAX_BYTES) {
          sendCommandResult(
            message.commandId,
            'The file exceeds the ' + MIRROR_IMPORT_MAX_BYTES / (1024 * 1024) + ' MiB mirror transfer limit.',
            message.viewer,
          );
          return;
        }
        // One transfer per viewer: a tab that restarts an import must not
        // leave its half-accumulated predecessor parked until disconnect,
        // and one tab's UI can only ever run one.
        const viewerPrefix = String(message.viewer || '') + ':';
        for (const [key, existing] of Array.from(importTransfers)) {
          if (key.startsWith(viewerPrefix)) {
            importTransfers.delete(key);
            sendCommandResult(existing.commandId, 'The import transfer was superseded by a newer one.', existing.viewer);
          }
        }
        importTransfers.set(transferKey(message), {
          commandId: message.commandId,
          viewer: message.viewer,
          fileName: String(message.fileName || 'import.har'),
          parts: [],
          receivedChars: 0,
          // base64 of the declared byte size, plus one padding quantum —
          // the declared-size check is a fiction unless accumulation
          // enforces it too.
          maxChars: Math.ceil(message.size / 3) * 4 + 4,
        });
        return;
      }
      if (message.type === 'import-chunk') {
        const transfer = importTransfers.get(transferKey(message));
        if (!transfer) return;
        const data = String(message.data || '');
        transfer.receivedChars += data.length;
        if (transfer.receivedChars > transfer.maxChars) {
          importTransfers.delete(transferKey(message));
          sendCommandResult(message.commandId, 'The transfer exceeded its declared size and was refused.', message.viewer);
          return;
        }
        transfer.parts.push(data);
        return;
      }
      if (message.type === 'import-end') {
        const transfer = importTransfers.get(transferKey(message));
        importTransfers.delete(transferKey(message));
        if (!transfer) {
          sendCommandResult(message.commandId, 'The import transfer was interrupted.', message.viewer);
          return;
        }
        let bytes;
        try {
          bytes = base64ToBytes(transfer.parts.join(''));
        } catch (_error) {
          sendCommandResult(message.commandId, 'The transferred file could not be decoded.', message.viewer);
          return;
        }
        if (typeof receiveImportFile !== 'function') {
          sendCommandResult(message.commandId, 'This DevTools session does not accept mirror imports.', message.viewer);
          return;
        }
        receiveImportFile(transfer.fileName, bytes, (error) => {
          sendCommandResult(message.commandId, error, message.viewer);
          sendSync();
        });
      }
    };
    return {
      sendSnapshot,
      sendSync,
      handleMessage,
      pushRow: (row) => postMessage({ type: 'row', session: sessionToken, row: serializeRowForMirror(row) }),
      // A viewer that disconnects mid-transfer would otherwise leave its
      // accumulated chunks (up to the full cap) parked in this map forever.
      dropImportTransfers: () => importTransfers.clear(),
    };
  }

  function createMirrorViewerSession({
    postMessage,
    appendWireRow,
    applyWireSnapshot,
    getLocalCount,
    getLocalMaxId,
    onHostSync,
  }) {
    let pendingSnapshot = null;
    let nextBodyRequestId = 1;
    let nextCommandId = 1;
    const pendingBodyCallbacks = new Map();
    const pendingCommandCallbacks = new Map();
    // chrome.runtime.connect fires onConnect in every extension context, so a
    // duplicated mirror tab shares the host's port. Every request carries this
    // tab's nonce and the host echoes it, so a result can only ever settle
    // the callbacks of the tab that asked. Results without an echo (an older
    // host) are accepted as before.
    const viewerNonce = mirrorSessionToken();
    const resultIsForAnotherViewer = (message) => message.viewer != null && message.viewer !== viewerNonce;
    // The host session that produced the rows currently on screen. Row ids
    // restart at 1 per DevTools session, so rows may only ever be matched by
    // id within one session; a new token means the table must be rebuilt, not
    // reconciled.
    let hostSessionToken = null;
    const requestBody = (rowId, callback) => {
      const requestId = nextBodyRequestId;
      nextBodyRequestId += 1;
      // Same discipline commands got: a host that drops the result must not
      // park this entry (and its closure) in the map until disconnect.
      const pending = { callback, timer: null };
      pendingBodyCallbacks.set(requestId, pending);
      pending.timer = setTimeout(() => {
        if (pendingBodyCallbacks.get(requestId) !== pending) return;
        pendingBodyCallbacks.delete(requestId);
        pending.callback(new Error('The DevTools session did not answer the body request in time.'), null);
      }, RESPONSE_CONTENT_TIMEOUT_MS);
      if (pending.timer && typeof pending.timer.unref === 'function') pending.timer.unref();
      try {
        postMessage({ type: 'body-request', requestId, rowId, viewer: viewerNonce });
      } catch (error) {
        clearTimeout(pending.timer);
        pendingBodyCallbacks.delete(requestId);
        throw error;
      }
    };
    const settleCommand = (commandId, error) => {
      const pending = pendingCommandCallbacks.get(commandId);
      if (!pending) return;
      pendingCommandCallbacks.delete(commandId);
      if (pending.timer) clearTimeout(pending.timer);
      pending.callback(error);
    };
    const discardCommand = (commandId) => {
      const pending = pendingCommandCallbacks.get(commandId);
      if (!pending) return;
      pendingCommandCallbacks.delete(commandId);
      if (pending.timer) clearTimeout(pending.timer);
    };
    const trackCommand = (callback, timeoutMs) => {
      const commandId = nextCommandId;
      nextCommandId += 1;
      const pending = { callback: typeof callback === 'function' ? callback : () => {}, timer: null };
      pendingCommandCallbacks.set(commandId, pending);
      pending.timer = setTimeout(() => {
        settleCommand(
          commandId,
          new Error('The DevTools session did not answer in time; the command may still have applied.'),
        );
      }, timeoutMs);
      // Node timers would otherwise hold the jest process open.
      if (pending.timer && typeof pending.timer.unref === 'function') pending.timer.unref();
      return commandId;
    };
    const sendCommand = (name, args, callback) => {
      const commandId = trackCommand(callback, MIRROR_COMMAND_TIMEOUT_MS);
      try {
        postMessage({ type: 'command', commandId, viewer: viewerNonce, name, args: args || {} });
      } catch (error) {
        discardCommand(commandId);
        throw error;
      }
    };
    const sendImportFile = (fileName, bytes, callback) => {
      const commandId = trackCommand(callback, MIRROR_IMPORT_RESULT_TIMEOUT_MS);
      try {
        postMessage({ type: 'import-begin', commandId, viewer: viewerNonce, fileName, size: bytes.length });
        const base64 = bytesToBase64(bytes);
        for (let index = 0; index < base64.length; index += MIRROR_IMPORT_CHUNK_CHARS) {
          postMessage({
            type: 'import-chunk',
            commandId,
            viewer: viewerNonce,
            data: base64.slice(index, index + MIRROR_IMPORT_CHUNK_CHARS),
          });
        }
        postMessage({ type: 'import-end', commandId, viewer: viewerNonce });
      } catch (error) {
        discardCommand(commandId);
        throw error;
      }
    };
    const handleMessage = (message) => {
      if (!message || typeof message !== 'object') return;
      switch (message.type) {
        case 'snapshot-start':
          pendingSnapshot = {
            generation: message.generation,
            rows: [],
            sessionChanged: message.session != null && hostSessionToken != null && message.session !== hostSessionToken,
            session: message.session,
          };
          break;
        case 'snapshot-rows':
          if (
            pendingSnapshot &&
            pendingSnapshot.generation === message.generation &&
            Array.isArray(message.rows)
          ) {
            // A spread would blow the argument limit on a hostile or buggy
            // oversized chunk and throw out of the port listener.
            for (const row of message.rows) pendingSnapshot.rows.push(row);
          }
          break;
        case 'snapshot-end':
          if (pendingSnapshot && pendingSnapshot.generation === message.generation) {
            const snapshot = pendingSnapshot;
            pendingSnapshot = null;
            if (snapshot.session != null) hostSessionToken = snapshot.session;
            applyWireSnapshot(snapshot.rows, { sessionChanged: snapshot.sessionChanged });
          }
          break;
        case 'row':
          // A pushed row from a different session than the table cannot be
          // matched by id; the sync heartbeat's mismatch triggers the rebuild.
          if (message.session != null && hostSessionToken != null && message.session !== hostSessionToken) break;
          if (message.session != null && hostSessionToken == null) hostSessionToken = message.session;
          if (message.row && typeof message.row === 'object') appendWireRow(message.row);
          break;
        case 'sync': {
          if (typeof onHostSync === 'function') onHostSync(message);
          const sessionChanged =
            message.session != null && hostSessionToken != null && message.session !== hostSessionToken;
          const mismatch =
            sessionChanged || message.count !== getLocalCount() || message.maxId !== getLocalMaxId();
          if (mismatch && !pendingSnapshot) {
            try {
              postMessage({ type: 'snapshot-request' });
            } catch (_error) {
              // The disconnect handler owns recovery; a dead port must not
              // throw out of the port's onMessage listener.
            }
          }
          break;
        }
        case 'body-result': {
          if (resultIsForAnotherViewer(message)) return;
          const pending = pendingBodyCallbacks.get(message.requestId);
          if (!pending) return;
          pendingBodyCallbacks.delete(message.requestId);
          if (pending.timer) clearTimeout(pending.timer);
          if (message.ok) pending.callback(null, { content: message.content, encoding: message.encoding });
          else pending.callback(new Error(message.error || 'Response content is unavailable.'), null);
          break;
        }
        case 'command-result': {
          if (resultIsForAnotherViewer(message)) return;
          settleCommand(
            message.commandId,
            message.ok ? null : new Error(message.error || 'The DevTools session rejected the command.'),
          );
          break;
        }
      }
    };
    const failPendingBodyRequests = (reason) => {
      const failures = Array.from(pendingBodyCallbacks.values());
      pendingBodyCallbacks.clear();
      for (const pending of failures) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.callback(new Error(reason), null);
      }
      const commandFailures = Array.from(pendingCommandCallbacks.values());
      pendingCommandCallbacks.clear();
      for (const pending of commandFailures) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.callback(new Error(reason));
      }
    };
    return { handleMessage, requestBody, sendCommand, sendImportFile, failPendingBodyRequests };
  }

  function fetchResponsePayload(row, timeoutMs = RESPONSE_CONTENT_TIMEOUT_MS) {
    if (row._responsePayloadPromise) return row._responsePayloadPromise;
    const requestLabel = row.id == null ? 'unknown request' : 'request ' + row.id;
    if (typeof row._mirrorFetchBody === 'function') {
      // Mirror rows hold no getContent; the DevTools session serves the body
      // over the port. The timeout guards a host that stops responding.
      const pending = new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('Timed out retrieving response content for ' + requestLabel));
        }, timeoutMs);
        Promise.resolve()
          .then(() => row._mirrorFetchBody())
          .then(
            (payload) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeoutId);
              try {
                resolve(
                  measureResponsePayload(
                    payload.content,
                    payload.encoding,
                    resolveRowResponseCharset(row),
                    isHtmlLikeMime(row.type),
                  ),
                );
              } catch (error) {
                reject(new Error('Failed to process response content for ' + requestLabel + ': ' + error.message));
              }
            },
            (error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeoutId);
              reject(
                new Error(
                  'Failed to retrieve response content for ' +
                    requestLabel +
                    ': ' +
                    (error && error.message ? error.message : 'unknown error'),
                ),
              );
            },
          );
      });
      row._responsePayloadPromise = pending;
      pending.then(
        () => {
          if (row._responsePayloadPromise === pending) row._responsePayloadPromise = null;
        },
        () => {
          if (row._responsePayloadPromise === pending) row._responsePayloadPromise = null;
        },
      );
      return pending;
    }
    if (!row._reqObj || typeof row._reqObj.getContent !== 'function') {
      return Promise.reject(new Error('Response content is unavailable for ' + requestLabel));
    }
    const pending = new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out retrieving response content for ' + requestLabel));
      }, timeoutMs);

      const fail = (message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error(message));
      };

      try {
        row._reqObj.getContent((content, encoding) => {
          if (settled) return;
          const runtimeError =
            typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError
              ? chrome.runtime.lastError.message
              : '';
          if (runtimeError) {
            fail('Failed to retrieve response content for ' + requestLabel + ': ' + runtimeError);
            return;
          }
          let payload;
          try {
            payload = measureResponsePayload(content, encoding, resolveRowResponseCharset(row), isHtmlLikeMime(row.type));
          } catch (error) {
            fail('Failed to process response content for ' + requestLabel + ': ' + error.message);
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          resolve(payload);
        });
      } catch (error) {
        fail('Failed to retrieve response content for ' + requestLabel + ': ' + error.message);
      }
    });
    row._responsePayloadPromise = pending;
    pending.then(
      () => {
        if (row._responsePayloadPromise === pending) row._responsePayloadPromise = null;
      },
      () => {
        if (row._responsePayloadPromise === pending) row._responsePayloadPromise = null;
      },
    );
    return pending;
  }

  // [U1] Pre-fetch response content into the bounded shared cache.
  function cacheResponseContent(row, timeoutMs = RESPONSE_CONTENT_TIMEOUT_MS) {
    if (row._responseContentPromise) return row._responseContentPromise;
    if (row.responseContentState === 'omitted') {
      return Promise.reject(
        row.responseContentError ||
          new Error(row.responseContentReason || 'Response body exceeds the per-body cache limit.'),
      );
    }
    if (
      ['unavailable', 'evicted'].includes(row.responseContentState) &&
      (!row._reqObj || typeof row._reqObj.getContent !== 'function')
    ) {
      return Promise.reject(new Error(row.responseContentReason || 'Response content is unavailable.'));
    }
    if (typeof row.responseContent === 'string') {
      touchResponseCacheRow(row);
      return Promise.resolve(row);
    }

    row.responseContentState = 'loading';
    const pending = fetchResponsePayload(row, timeoutMs)
      .then((payload) => {
        if (row._managedRetention) {
          if (!isRetainedRow(row, state.retainedRows)) throw new Error('Response content arrived after its request was evicted');
          return admitResponsePayload(row, payload);
        }
        row.responseContent = payload.content;
        row.responseContentEncoding = payload.encoding;
        row.responseContentText = payload.text;
        row.responseContentBytes = payload.bytes;
        row.responseContentState = 'cached';
        row.responseContentReason = '';
        row.responseContentError = null;
        if (state.automaticResponsePrefetchScheduler) {
          state.automaticResponsePrefetchScheduler.markRecovered(row);
        }
        return row;
      })
      .catch((error) => {
        row.responseContentError = error;
        if (
          row.responseContentState !== 'omitted' &&
          row.responseContentState !== 'row-evicted' &&
          row.responseContentState !== 'unavailable'
        ) {
          row.responseContentState = /unavailable/i.test(error.message) ? 'unavailable' : 'error';
          row.responseContentReason = error.message;
        }
        throw error;
      });

    row._responseContentPromise = pending;
    if (state.automaticResponsePrefetchScheduler) {
      state.automaticResponsePrefetchScheduler.observeForeground(row, pending);
    }
    pending.then(undefined, () => {
      if (row._responseContentPromise === pending) row._responseContentPromise = null;
    });
    return pending;
  }

  async function resolveHarResponseContent(row) {
    if (typeof row.responseContent === 'string') return buildHarResponseContent(row);
    try {
      const pending = fetchResponsePayload(row);
      if (state.automaticResponsePrefetchScheduler) {
        state.automaticResponsePrefetchScheduler.observeForeground(row, pending);
      }
      const payload = await pending;
      return buildHarResponseContent(row, payload);
    } catch (error) {
      row.responseContentReason = row.responseContentReason || error.message;
      return buildHarResponseContent(row);
    }
  }

  // ---- Edit-and-resend (DevTools sessions only) ----
  // A captured request is only a template here: Send composes a brand-new
  // request from the dialog fields and executes it as a fetch() inside the
  // inspected page through the DevTools eval API — the same zero-permission
  // channel WebSocket capture uses. Cookies, CORS, and the page's security
  // policies therefore apply exactly as if the page had issued the call,
  // the reply arrives through normal capture as a new row, and the original
  // traffic is never touched.
  const RESEND_BROWSER_MANAGED_HEADERS = Object.freeze([
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'cookie2',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'via',
  ]);
  const RESEND_METHOD_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

  function isBrowserManagedHeaderName(name) {
    const normalized = String(name || '').toLowerCase();
    return (
      RESEND_BROWSER_MANAGED_HEADERS.indexOf(normalized) > -1 ||
      normalized.startsWith('proxy-') ||
      normalized.startsWith('sec-')
    );
  }

  function canResendRow(row) {
    return !!(row && row.method !== 'WS' && /^https?:\/\//i.test(row.url || ''));
  }

  function buildResendSpecFromRow(row) {
    const headers = [];
    for (const header of (row && row.requestHeaders) || []) {
      const name = String((header && header.name) || '');
      if (!name || name.startsWith(':')) continue; // HTTP/2 pseudo-headers are not settable request headers.
      headers.push({ name, value: String((header && header.value) || '') });
    }
    return {
      method: (row && row.method) || 'GET',
      url: (row && row.url) || '',
      headers,
      body:
        row && row.requestPostData && typeof row.requestPostData.text === 'string'
          ? row.requestPostData.text
          : '',
    };
  }

  function formatHeaderLines(headers) {
    return (headers || []).map((header) => header.name + ': ' + header.value).join('\n');
  }

  function parseHeaderLines(text) {
    const headers = [];
    const invalidLines = [];
    for (const rawLine of String(text || '').split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const colonAt = line.indexOf(':');
      if (colonAt < 1) {
        invalidLines.push(line);
        continue;
      }
      headers.push({ name: line.slice(0, colonAt).trim(), value: line.slice(colonAt + 1).trim() });
    }
    return { headers, invalidLines };
  }

  // ---- Paste-a-cURL (fills the resend dialog fields) ----
  // Tokenizes a POSIX-ish command line: whitespace splits, backslash
  // escapes, backslash-newline continuations, literal single quotes,
  // double quotes with \" \\ \$ \` escapes, and $'...' ANSI-C quoting.
  // "Copy as cURL (bash)" output from Chrome, Edge, and Firefox uses
  // exactly this subset. Pure string work — nothing here touches the
  // network or the DOM.
  function tokenizeShellCommand(text) {
    const source = String(text || '');
    const tokens = [];
    let current = '';
    let hasCurrent = false;
    let index = 0;
    const push = (piece) => {
      current += piece;
      hasCurrent = true;
    };
    while (index < source.length) {
      const ch = source[index];
      if (ch === '\\') {
        const next = source[index + 1];
        if (next === '\n') {
          index += 2;
          continue;
        }
        if (next === '\r' && source[index + 2] === '\n') {
          index += 3;
          continue;
        }
        if (next == null) throw new Error('the command ends with a dangling backslash');
        push(next);
        index += 2;
        continue;
      }
      if (ch === "'") {
        const end = source.indexOf("'", index + 1);
        if (end === -1) throw new Error('a single-quoted section is not closed');
        push(source.slice(index + 1, end));
        index = end + 1;
        continue;
      }
      if (ch === '$' && source[index + 1] === "'") {
        let i = index + 2;
        let out = '';
        for (;;) {
          if (i >= source.length) throw new Error("a $'...' section is not closed");
          const c = source[i];
          if (c === "'") {
            i += 1;
            break;
          }
          if (c === '\\') {
            const esc = source[i + 1];
            const simple = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', 0: '\0' };
            if (esc === 'x' && /^[0-9a-fA-F]{2}/.test(source.slice(i + 2))) {
              out += String.fromCharCode(parseInt(source.slice(i + 2, i + 4), 16));
              i += 4;
              continue;
            }
            if (esc in simple) {
              out += simple[esc];
              i += 2;
              continue;
            }
            out += esc == null ? '' : esc;
            i += 2;
            continue;
          }
          out += c;
          i += 1;
        }
        push(out);
        index = i;
        continue;
      }
      if (ch === '"') {
        let i = index + 1;
        let out = '';
        for (;;) {
          if (i >= source.length) throw new Error('a double-quoted section is not closed');
          const c = source[i];
          if (c === '"') {
            i += 1;
            break;
          }
          if (c === '\\') {
            const esc = source[i + 1];
            if (esc === '\n') {
              i += 2;
              continue;
            }
            if (esc === '"' || esc === '\\' || esc === '$' || esc === '`') {
              out += esc;
              i += 2;
              continue;
            }
            out += c;
            i += 1;
            continue;
          }
          out += c;
          i += 1;
        }
        push(out);
        index = i;
        continue;
      }
      if (/\s/.test(ch)) {
        if (hasCurrent) {
          tokens.push(current);
          current = '';
          hasCurrent = false;
        }
        index += 1;
        continue;
      }
      push(ch);
      index += 1;
    }
    if (hasCurrent) tokens.push(current);
    return tokens;
  }

  // Flags the browser or the resend pipeline covers anyway; noting them
  // beats failing a command that would otherwise work.
  const CURL_IGNORED_FLAGS = new Set([
    '--compressed',
    '-s',
    '--silent',
    '-S',
    '--show-error',
    '-k',
    '--insecure',
    '-v',
    '--verbose',
    '-L',
    '--location',
    '-g',
    '--globoff',
    '-i',
    '--include',
    '--no-progress-meter',
    '-#',
    '--progress-bar',
  ]);

  // Parses the supported cURL subset into a resend spec, or fails closed
  // naming the first unsupported flag instead of guessing at semantics.
  function parseCurlCommand(text) {
    let tokens;
    try {
      tokens = tokenizeShellCommand(text);
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (tokens[0] === '$') tokens.shift();
    if (tokens.length === 0 || !/^curl(\.exe)?$/i.test(tokens[0])) {
      return { ok: false, error: 'the command must start with curl' };
    }
    const spec = { method: '', url: '', headers: [], body: '', credentials: true };
    const notes = [];
    const ignored = [];
    const dataParts = [];
    let sendDataAsQuery = false;
    try {
      for (let i = 1; i < tokens.length; i += 1) {
        const token = tokens[i];
        const take = () => {
          i += 1;
          if (i >= tokens.length) throw new Error('the flag ' + token + ' is missing its value');
          return tokens[i];
        };
        if (token === '-X' || token === '--request') {
          spec.method = take().toUpperCase();
          continue;
        }
        if (/^-X./.test(token)) {
          spec.method = token.slice(2).toUpperCase();
          continue;
        }
        if (token === '-H' || token === '--header') {
          const line = take();
          const colonAt = line.indexOf(':');
          if (colonAt > 0) {
            spec.headers.push({ name: line.slice(0, colonAt).trim(), value: line.slice(colonAt + 1).trim() });
          }
          continue;
        }
        if (
          token === '-d' ||
          token === '--data' ||
          token === '--data-raw' ||
          token === '--data-ascii' ||
          token === '--data-binary' ||
          token === '--data-urlencode'
        ) {
          const value = take();
          if (value.startsWith('@') && token !== '--data-raw') {
            return { ok: false, error: 'reading the body from a file (' + value + ') is not supported; paste the body itself' };
          }
          dataParts.push(value);
          continue;
        }
        if (token === '--url') {
          spec.url = take();
          continue;
        }
        if (token === '-u' || token === '--user') {
          spec.headers.push({
            name: 'Authorization',
            value: 'Basic ' + bytesToBase64(new TextEncoder().encode(take())),
          });
          continue;
        }
        if (token === '-A' || token === '--user-agent') {
          spec.headers.push({ name: 'User-Agent', value: take() });
          continue;
        }
        if (token === '-e' || token === '--referer') {
          spec.headers.push({ name: 'Referer', value: take() });
          continue;
        }
        if (token === '-b' || token === '--cookie') {
          spec.headers.push({ name: 'Cookie', value: take() });
          notes.push('the browser manages cookies, so the pasted Cookie header will not be applied');
          continue;
        }
        if (token === '-G' || token === '--get') {
          sendDataAsQuery = true;
          continue;
        }
        if (token === '-I' || token === '--head') {
          spec.method = 'HEAD';
          continue;
        }
        if (CURL_IGNORED_FLAGS.has(token)) {
          ignored.push(token);
          continue;
        }
        if (token.startsWith('-')) {
          return { ok: false, error: 'the cURL flag ' + token + ' is not supported here' };
        }
        if (spec.url) {
          return { ok: false, error: 'the command contains more than one URL' };
        }
        spec.url = token;
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (dataParts.length > 0) {
      if (sendDataAsQuery) {
        if (!spec.url) return { ok: false, error: 'the command has no URL' };
        spec.url += (spec.url.includes('?') ? '&' : '?') + dataParts.join('&');
        if (!spec.method) spec.method = 'GET';
      } else {
        spec.body = dataParts.join('&');
        if (!spec.method) spec.method = 'POST';
      }
    }
    if (!spec.method) spec.method = 'GET';
    if (!RESEND_METHOD_PATTERN.test(spec.method)) {
      return { ok: false, error: 'the method ' + spec.method + ' is not a valid HTTP method token' };
    }
    if (!/^https?:\/\//i.test(spec.url)) {
      return { ok: false, error: 'the command needs one absolute http(s) URL' };
    }
    if (ignored.length > 0) notes.push(ignored.join(', ') + ' handled by the browser and skipped');
    return { ok: true, spec, notes };
  }

  function pageResendRunner(spec) {
    // Runs inside the inspected page; must stay self-contained.
    try {
      var headers = {};
      for (var i = 0; i < spec.headers.length; i++) headers[spec.headers[i][0]] = spec.headers[i][1];
      var init = {
        method: spec.method,
        headers: headers,
        credentials: spec.credentials ? 'include' : 'same-origin',
      };
      if (spec.body && spec.method !== 'GET' && spec.method !== 'HEAD') init.body = spec.body;
      fetch(spec.url, init).catch(function () {});
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) };
    }
  }

  function buildResendEvalSource(spec) {
    const wireSpec = {
      method: String(spec.method || 'GET'),
      url: String(spec.url || ''),
      headers: ((spec && spec.headers) || [])
        .filter((header) => !isBrowserManagedHeaderName(header.name))
        .map((header) => [String(header.name), String(header.value)]),
      body: typeof spec.body === 'string' ? spec.body : '',
      credentials: spec.credentials !== false,
    };
    return '(' + pageResendRunner.toString() + ')(' + JSON.stringify(wireSpec) + ')';
  }

  // ---- JWT decoding (display only; no verification) ----
  // Any header value can carry a JWT: Authorization: Bearer, custom auth
  // headers, or a response header minting a fresh token. Detection is a
  // strict local base64url + JSON parse of the first two segments — the
  // signature is never checked — and the result renders only inside the
  // header panes: decoded claims never join clipboard copies or exports.
  const JWT_TOKEN_PATTERN = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/g;
  const JWT_MAX_TOKEN_CHARS = 8192;
  const JWT_MAX_FINDINGS = 4;
  function decodeBase64UrlJson(segment) {
    if (typeof segment !== 'string' || segment.length === 0) return null;
    try {
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const raw = atob(padded);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function decodeJwt(token) {
    if (typeof token !== 'string' || token.length === 0 || token.length > JWT_MAX_TOKEN_CHARS) return null;
    const segments = token.split('.');
    if (segments.length !== 3) return null;
    const header = decodeBase64UrlJson(segments[0]);
    if (!header || (typeof header.alg !== 'string' && typeof header.typ !== 'string')) return null;
    const payload = decodeBase64UrlJson(segments[1]);
    if (!payload) return null;
    return { header, payload, signaturePresent: segments[2].length > 0 };
  }

  // The decoded section's single-unit reading of a span. Each unit is a
  // dictionary entry whose en renders exactly the literal this function
  // shipped with ('2 h', '45 s'), so English is unchanged and the Japanese
  // disclosure stops mixing a translated heading with an English span.
  function humanizeJwtDelta(deltaMs) {
    const abs = Math.abs(deltaMs);
    if (abs < 60000) return uiTextFormat('jwtDeltaSeconds', { count: String(Math.round(abs / 1000)) });
    if (abs < 3600000) return uiTextFormat('jwtDeltaMinutes', { count: String(Math.round(abs / 60000)) });
    if (abs < 86400000) return uiTextFormat('jwtDeltaHours', { count: String(Math.round(abs / 3600000)) });
    return uiTextFormat('jwtDeltaDays', { count: String(Math.round(abs / 86400000)) });
  }

  function describeJwtEpochClaim(key, seconds, nowEpochMs) {
    if (!Number.isFinite(seconds)) return null;
    const atMs = seconds * 1000;
    const iso = new Date(atMs).toISOString();
    const delta = atMs - nowEpochMs;
    const time = humanizeJwtDelta(delta);
    if (key === 'exp') {
      return iso + ' (' + uiTextFormat(delta < 0 ? 'jwtExpiryExpired' : 'jwtExpiryExpiresIn', { time }) + ')';
    }
    return iso + ' (' + uiTextFormat(delta < 0 ? 'jwtClaimAgo' : 'jwtClaimIn', { time }) + ')';
  }

  function getJwtExpiryState(payload, nowEpochMs) {
    const exp = payload ? payload.exp : undefined;
    if (!Number.isFinite(exp)) return { expired: false, label: '' };
    const delta = exp * 1000 - nowEpochMs;
    const time = humanizeJwtDelta(delta);
    return {
      expired: delta < 0,
      label: uiTextFormat(delta < 0 ? 'jwtExpiryExpired' : 'jwtExpiryExpiresIn', { time }),
    };
  }

  // The chip's time, in the two largest units that still say something —
  // "2h 14m", "3d" — with each unit written the way the active language writes
  // it. Deliberately NOT humanizeJwtDelta: that one is the decoded section's
  // single-unit English wording ("2 h", "5 min") and other text is built on it.
  const JWT_CHIP_UNITS = [
    { key: 'jwtChipUnitDay', ms: 86400000 },
    { key: 'jwtChipUnitHour', ms: 3600000 },
    { key: 'jwtChipUnitMinute', ms: 60000 },
    { key: 'jwtChipUnitSecond', ms: 1000 },
  ];

  function formatJwtChipDelta(deltaMs) {
    let remaining = Math.abs(Math.trunc(Number(deltaMs) || 0));
    const parts = [];
    for (const unit of JWT_CHIP_UNITS) {
      const amount = Math.floor(remaining / unit.ms);
      remaining -= amount * unit.ms;
      // A leading zero unit is not worth saying; a trailing one ends the
      // reading, so "3d 0h" is written "3d" rather than padded out.
      if (amount === 0) {
        if (parts.length === 0) continue;
        break;
      }
      parts.push(uiTextFormat(unit.key, { count: String(amount) }));
      if (parts.length === 2) break;
    }
    if (parts.length === 0) parts.push(uiTextFormat('jwtChipUnitSecond', { count: '0' }));
    return parts.join(uiText('jwtChipUnitJoin'));
  }

  // The chip a header value earns when it carries a decodable token with an
  // exp claim. Null otherwise: a chip on a value that is not a token, or on a
  // token with no expiry, would read as "never expires" when it means
  // "nothing was decoded".
  function planJwtExpiryChip(headerValue, nowEpochMs) {
    const value = String(headerValue == null ? '' : headerValue);
    if (value.indexOf('eyJ') === -1) return null;
    const now = Number.isFinite(nowEpochMs) ? nowEpochMs : Date.now();
    for (const token of value.match(JWT_TOKEN_PATTERN) || []) {
      const decoded = decodeJwt(token);
      if (!decoded) continue;
      const exp = decoded.payload.exp;
      if (!Number.isFinite(exp)) continue;
      const delta = exp * 1000 - now;
      const expired = delta < 0;
      return {
        expired,
        text: expired
          ? uiTextFormat('jwtChipExpired', { time: formatJwtChipDelta(delta) })
          : uiTextFormat('jwtChipExpiresIn', { time: formatJwtChipDelta(delta) }),
      };
    }
    return null;
  }

  function createJwtExpiryChip(headerValue, nowEpochMs) {
    const plan = planJwtExpiryChip(headerValue, nowEpochMs);
    if (!plan) return null;
    const chip = document.createElement('span');
    chip.className = 'jwt-chip' + (plan.expired ? ' jwt-chip--expired' : '');
    chip.textContent = plan.text;
    return chip;
  }

  // Splits a value into plain runs and the decodable tokens inside it, so the
  // three segments of a JWT can be tinted apart. The runs rejoin to the input
  // character for character — the tinting must not change what the row holds —
  // and a value carrying no decodable token yields one plain run.
  function splitJwtRuns(text) {
    const value = String(text == null ? '' : text);
    if (!value || value.indexOf('eyJ') === -1) return [{ jwt: false, text: value }];
    const runs = [];
    let cursor = 0;
    for (const token of value.match(JWT_TOKEN_PATTERN) || []) {
      const at = value.indexOf(token, cursor);
      if (at === -1) continue;
      if (!decodeJwt(token)) continue;
      if (at > cursor) runs.push({ jwt: false, text: value.slice(cursor, at) });
      runs.push({ jwt: true, text: token, segments: token.split('.') });
      cursor = at + token.length;
    }
    if (runs.length === 0) return [{ jwt: false, text: value }];
    if (cursor < value.length) runs.push({ jwt: false, text: value.slice(cursor) });
    return runs;
  }

  // `header` is the object the finding came from, so a caller that files the
  // decoded section under its own row does not have to run the finder again
  // per header — which is what threw the cross-header dedup away and decoded
  // a token echoed in two headers twice.
  function findJwtsInHeaders(headers) {
    const findings = [];
    const seenTokens = new Set();
    for (const header of headers || []) {
      const value = String((header && header.value) || '');
      if (value.indexOf('eyJ') === -1) continue;
      for (const token of value.match(JWT_TOKEN_PATTERN) || []) {
        if (seenTokens.has(token)) continue;
        seenTokens.add(token);
        const decoded = decodeJwt(token);
        if (!decoded) continue;
        findings.push({ header, headerName: String((header && header.name) || ''), decoded });
        if (findings.length >= JWT_MAX_FINDINGS) return findings;
      }
    }
    return findings;
  }

  // The two parts a decoded token is shown in, as dictionary keys. Each en
  // entry is byte-identical to the literal the section shipped with, so the
  // English disclosure is unchanged and the Japanese one stops being half
  // translated — a translated chip sat directly above an English summary.
  const JWT_PART_HEADINGS = [
    ['jwtPartHeader', 'header'],
    ['jwtPartPayload', 'payload'],
  ];

  function createJwtDetailsSectionFromFindings(findings, nowEpochMs) {
    if (findings.length === 0) return null;
    const now = Number.isFinite(nowEpochMs) ? nowEpochMs : Date.now();
    const container = document.createElement('div');
    container.className = 'jwt-section';
    for (const finding of findings) {
      const details = document.createElement('details');
      details.className = 'jwt-details';
      const summary = document.createElement('summary');
      const expiry = getJwtExpiryState(finding.decoded.payload, now);
      summary.textContent =
        uiTextFormat('jwtSectionSummary', { name: finding.headerName }) +
        (expiry.label ? ' · ' + expiry.label : '');
      if (expiry.expired) summary.classList.add('jwt-expired');
      details.appendChild(summary);
      const timeItems = [];
      for (const key of ['exp', 'nbf', 'iat']) {
        const described = describeJwtEpochClaim(key, finding.decoded.payload[key], now);
        if (described) timeItems.push({ key, value: described });
      }
      // 'plain': these three rows are the panel's own reading of the exp / nbf /
      // iat time claims — a formatted timestamp, not the token. Every other
      // claim renders inside the code-block below, which carries no row copy,
      // so nothing here can hand out a captured secret.
      if (timeItems.length > 0) details.appendChild(createKvGrid(timeItems, 'plain'));
      for (const [labelKey, partKey] of JWT_PART_HEADINGS) {
        const heading = document.createElement('strong');
        heading.className = 'jwt-part-heading';
        heading.textContent = uiText(labelKey);
        details.appendChild(heading);
        const pre = document.createElement('pre');
        pre.className = 'code-block';
        pre.textContent = JSON.stringify(finding.decoded[partKey], null, 2);
        details.appendChild(pre);
      }
      const note = document.createElement('p');
      note.className = 'jwt-note';
      // The disclosure moved under the Authorization row, so its own prose sits
      // directly beneath a translated chip; an English paragraph there reads as
      // a different product's text.
      note.textContent =
        uiText('jwtDisplayNote') + (finding.decoded.signaturePresent ? '' : uiText('jwtNoSignature'));
      details.appendChild(note);
      container.appendChild(details);
    }
    return container;
  }

  function createJwtDetailsSection(headers, nowEpochMs) {
    return createJwtDetailsSectionFromFindings(findJwtsInHeaders(headers), nowEpochMs);
  }

  // A decoded token belongs to the header that carries it. Keyed by the header
  // object so the grid can hang each section under its own row instead of
  // filing every one of them below the whole grid, where the summary had to
  // name a header the reader would have to scroll back to find. The budget
  // stays what it was: at most JWT_MAX_FINDINGS decoded tokens per header list.
  function createHeaderJwtSubRows(headers, nowEpochMs) {
    // ONE pass over the whole list. Calling the finder once per header threw
    // its cross-header dedup away, so a token echoed in Authorization and in
    // X-Amz-Security-Token was decoded twice and spent two of the findings
    // budget. The findings arrive in header order and carry the header they
    // came from, so grouping them keeps each section under its own row.
    const grouped = new Map();
    for (const finding of findJwtsInHeaders(headers)) {
      const bucket = grouped.get(finding.header);
      if (bucket) bucket.push(finding);
      else grouped.set(finding.header, [finding]);
    }
    const subRows = new Map();
    for (const [header, findings] of grouped) {
      const section = createJwtDetailsSectionFromFindings(findings, nowEpochMs);
      if (section) subRows.set(header, section);
    }
    return subRows;
  }

  // ============================================================
  // Section 9: Safe DOM Rendering [S1][S2][S3] — NO innerHTML with user data
  // ============================================================
  const statsSummaryStructures = new WeakMap();
  const statusSummaryInspectHandlers = new WeakMap();

  // Appends text with a <wbr> after every & ; / when the value has no
  // whitespace of its own. <wbr> adds nothing to textContent, so what the
  // pane shows and what copy actions read stay the same string.
  function appendBreakableText(container, text) {
    const segments = splitAtDelimiters(text);
    if (segments.length === 1) {
      container.appendChild(document.createTextNode(segments[0]));
      return;
    }
    segments.forEach((segment, index) => {
      container.appendChild(document.createTextNode(segment));
      if (index < segments.length - 1) container.appendChild(document.createElement('wbr'));
    });
  }

  // Header values, where the delimiter rule alone gives nothing: a token has no
  // & ; or / in it, and "Bearer eyJ..." has whitespace, which turns the
  // delimiter splitter off entirely. Each '.' of a decodable token gets a break
  // opportunity and each of the three segments its own tint, so the structure
  // reads even while the value is clamped. <wbr> and <span> contribute nothing
  // to textContent, so the string the row shows is the string the row holds.
  const JWT_SEGMENT_CLASSES = ['jwt-seg jwt-seg--header', 'jwt-seg jwt-seg--payload', 'jwt-seg jwt-seg--signature'];

  function appendJwtAwareText(container, text) {
    const runs = splitJwtRuns(text);
    if (runs.length === 1 && !runs[0].jwt) {
      appendBreakableText(container, runs[0].text);
      return;
    }
    for (const run of runs) {
      if (!run.jwt) {
        appendBreakableText(container, run.text);
        continue;
      }
      run.segments.forEach((segment, index) => {
        if (index > 0) {
          container.appendChild(document.createTextNode('.'));
          container.appendChild(document.createElement('wbr'));
        }
        const el = document.createElement('span');
        el.className = JWT_SEGMENT_CLASSES[Math.min(index, JWT_SEGMENT_CLASSES.length - 1)];
        el.textContent = segment;
        container.appendChild(el);
      });
    }
  }

  // A value past KV_CLAMP_CHARS shows four lines and a per-row toggle; the
  // full text stays in the DOM (clamped by CSS, not truncated) so selection,
  // find-in-page, and copy still see all of it.
  // `appendText` overrides where the breaks go for one caller (a Query value
  // may break after its commas as well); it appends the same characters, so
  // the clamp, the toggle and every copy path are unchanged by it.
  function renderKvValue(valEl, value, appendText) {
    const append = appendText || appendBreakableText;
    const plan = planKvValue(value);
    if (!plan.clamped) {
      append(valEl, plan.text);
      return;
    }
    const textEl = document.createElement('div');
    textEl.className = 'val-text val--clamped';
    append(textEl, plan.text);
    const countLabel = plan.chars.toLocaleString('en-US');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link-btn val-clamp-toggle';
    toggle.textContent = uiTextFormat('kvShowAll', { count: countLabel });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const expand = textEl.classList.contains('val--clamped');
      textEl.classList.toggle('val--clamped', !expand);
      toggle.setAttribute('aria-expanded', String(expand));
      toggle.textContent = expand ? uiText('kvShowLess') : uiTextFormat('kvShowAll', { count: countLabel });
    });
    valEl.appendChild(textEl);
    valEl.appendChild(toggle);
  }

  // The one gate a row-end copy passes, and it is the pane's OWN sanitizer
  // rather than a name heuristic: sanitizeHeaders for a header row (an
  // allowlist — a name it cannot prove safe is redacted), sanitizeCookies for
  // a cookie row and sanitizeNamedValues for a query row (every value
  // redacted, unconditionally). So the row copy is never less redacted than
  // the pane's Copy sanitized, and a reader who wants the raw bytes still
  // goes through the confirmation flow "Copy full..." owns.
  //
  // `kind` is declared by the grid that BUILDS the row and is never inferred
  // from the key the row renders: 'Set-Cookie #1' is a decorated label, and no
  // counter or decoration in a label may decide what leaves the panel. A row
  // may also name itself for the sanitizer through `copyName` when its label
  // is not the captured name. 'plain' — the only kind that copies verbatim —
  // is for rows the panel itself computes (a method, a formatted duration, a
  // decoded JWT claim) and carries no captured header, cookie or parameter.
  // Any other kind, an unstated one included, falls through to the cookie
  // sanitizer, so a grid added later fails closed.
  const KV_COPY_KINDS = new Set(['header', 'cookie', 'query', 'plain']);

  function planKvCopyValue(kind, name, value) {
    const text = value == null ? '' : String(value);
    const item = { name: String(name == null ? '' : name), value: text };
    const gate = KV_COPY_KINDS.has(kind) ? kind : 'cookie';
    if (gate === 'plain') return { masked: false, text };
    let sanitized;
    if (gate === 'header') sanitized = sanitizeHeaders([item]).value[0].value;
    else if (gate === 'query') sanitized = sanitizeNamedValues([item]).value[0].value;
    else sanitized = sanitizeCookies([item]).value[0].value;
    return { masked: sanitized !== text, text: sanitized };
  }

  // The row-end Copy control: one value, revealed on hover or on focus. It is
  // a grid item of its own — a third track the row reserves — because while it
  // was absolutely positioned inside the value cell it painted over the tail of
  // the value's first line: the very characters the reader was about to copy.
  // Reserving the track also means revealing it moves no row.
  // "Copy full..." stays in Body and Raw, where the confirmation flow lives.
  // `label` names the row for assistive tech; `copyName` is the name the
  // sanitizer judges, and only that one.
  function createKvCopyButton(kind, label, copyName, value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-btn kv-copy-btn';
    button.textContent = uiText('kvCopyValue');
    button.setAttribute('aria-label', uiTextFormat('kvCopyValueAria', { name: String(label == null ? '' : label) }));
    button.addEventListener('click', () => {
      const plan = planKvCopyValue(kind, copyName, value);
      writeClipboardPayload(plan.text, uiText(plan.masked ? 'statusCopiedValueMasked' : 'statusCopiedValue'));
    });
    return button;
  }

  // Items carry {key|name, value} plus optional `node` (a prebuilt value
  // node that replaces the text), `mono` (monospace value), `className`,
  // `appendText` (where the break opportunities inside the value go), `chip`
  // (a node painted after the value), `subRow` (a full-width node filed under
  // the pair), `copyValue` (what the row-end Copy control writes, stated
  // separately only for a row whose value cell is a prebuilt node) and
  // `copyName` (the captured name the sanitizer judges, for a row whose label
  // is decorated — 'Set-Cookie #1' names the header 'Set-Cookie').
  //
  // `kind` is the grid's structural declaration of what its rows ARE —
  // 'header', 'cookie', 'query' or 'plain' — and it, not the rendered key,
  // decides which sanitizer a row-end copy passes. See planKvCopyValue: an
  // unstated kind is treated as a cookie, so a new grid fails closed.
  function createKvGrid(items, kind) {
    const grid = document.createElement('div');
    grid.className = 'kv';
    const copyButtons = [];
    for (const item of items) {
      const keyEl = document.createElement('div');
      keyEl.className = 'key';
      const keyName = item.name || item.key || '';
      keyEl.textContent = keyName;
      const valEl = document.createElement('div');
      valEl.className = 'val' + (item.mono ? ' val--mono' : '') + (item.className ? ' ' + item.className : '');
      if (item.node) {
        valEl.appendChild(item.node);
      } else {
        renderKvValue(valEl, item.value == null ? '' : String(item.value), item.appendText);
      }
      if (item.chip) valEl.appendChild(item.chip);
      let copyValue = '';
      if (item.copyValue != null) copyValue = String(item.copyValue);
      else if (!item.node && item.value != null) copyValue = String(item.value);
      const copyName = item.copyName != null ? String(item.copyName) : keyName;
      grid.appendChild(keyEl);
      grid.appendChild(valEl);
      // Beside the value cell, never inside it: the control has a track of its
      // own, so no line of the value can run underneath it and a drag over the
      // value cannot reach it at all.
      if (copyValue) {
        const copyButton = createKvCopyButton(kind, keyName, copyName, copyValue);
        copyButtons.push(copyButton);
        grid.appendChild(copyButton);
      }
      // The sub-row is appended AFTER the pair, never between it: every pane
      // probe and every stylesheet rule reads a value cell as the key's next
      // element sibling.
      if (item.subRow) {
        const subRowEl = document.createElement('div');
        subRowEl.className = 'kv-subrow';
        subRowEl.appendChild(item.subRow);
        grid.appendChild(subRowEl);
      }
    }
    armKvCopyRoving(grid, copyButtons);
    return grid;
  }

  // One tab stop per grid, not one per row. A cookies pane of fifteen rows
  // otherwise cost fifteen Tab presses to walk past, and a headers pane
  // eleven, for controls a reader reaches occasionally. The grid keeps exactly
  // one control in the tab order and the arrow keys move between them — the
  // roving pattern the request table already uses — so the controls stay
  // reachable by keyboard and the pane's tab-stop count is what it was.
  function armKvCopyRoving(grid, buttons) {
    if (buttons.length === 0) return;
    const rove = (target) => {
      for (const button of buttons) button.tabIndex = button === target ? 0 : -1;
    };
    rove(buttons[0]);
    grid.addEventListener('keydown', (event) => {
      const current = buttons.indexOf(event.target);
      if (current === -1) return;
      let next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = current + 1;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = current - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();
      const target = buttons[Math.max(0, Math.min(buttons.length - 1, next))];
      rove(target);
      target.focus();
    });
    // Clicking or shift-tabbing back into a control makes it the tab stop, so
    // leaving the grid and returning lands where the reader left off.
    grid.addEventListener('focusin', (event) => {
      if (buttons.indexOf(event.target) === -1) return;
      rove(event.target);
    });
  }

  // === Cookies as tables ===
  // Both Cookies panes are real <table>s with <th scope="col"> headers: one
  // row per cookie, and the attributes in columns of their own instead of
  // buried inside one blob per Set-Cookie header. A kv grid could only ever
  // label a row "Set-Cookie #1"; a table lets a screen reader say which
  // column a cell belongs to, and lets an eye read down one attribute.
  //
  // Layout is auto and every cell wraps at any character: no track is a fixed
  // px width, so a wide fallback font wraps inside its own cell instead of
  // clipping the label or pushing the pane into a horizontal scroll, and the
  // wrapper takes any residual overflow in a box of its own.

  // An attribute the response did not send is stated as absent rather than
  // left as an empty cell, so "no Domain" reads differently from a cell that
  // failed to render. The dash is the panel's word, not the response's, so it
  // is unselectable: a drag down a column carries the values and not the gaps.
  function appendCookieAbsent(cell) {
    const absent = document.createElement('span');
    absent.className = 'cookie-absent';
    absent.textContent = '—';
    cell.appendChild(absent);
  }

  function renderCookieNameCell(cell, row) {
    // One text node, so a drag across the cell carries the name alone with no
    // newline inside it.
    cell.textContent = row.cookie.name;
  }

  function renderCookieValueCell(cell, row) {
    // A name-only cookie ('consent' with no '=') has no value to show, and the
    // cell says so the way every other absent attribute does: an empty cell
    // would read the same as a value the renderer dropped.
    if (!row.cookie.value) {
      appendCookieAbsent(cell);
      return;
    }
    if (row.mono) cell.classList.add('val--mono');
    // The captured value, verbatim, behind the same 240-character clamp every
    // kv value uses — clipped, not truncated, so selection and find-in-page
    // still reach all of it and the "Show all" toggle marks that it is
    // clipped.
    renderKvValue(cell, row.cookie.value, appendBreakableText);
  }

  // A domain is dot-separated labels, not one word. Without a break
  // opportunity after each '.' the column had only two ways to render
  // '.shop.example.test': claim its whole width and push the table past the
  // pane, or break in the middle of a label. <wbr> adds nothing to
  // textContent, so the cell still reads, selects and copies as the domain
  // the response sent.
  function appendCookieDomainText(container, text) {
    const labels = String(text).split('.');
    labels.forEach((label, index) => {
      if (index > 0) {
        container.appendChild(document.createTextNode('.'));
        container.appendChild(document.createElement('wbr'));
      }
      appendBreakableText(container, label);
    });
  }

  function renderCookieAttributeCell(cell, text, appendText) {
    if (!text) {
      appendCookieAbsent(cell);
      return;
    }
    (appendText || appendBreakableText)(cell, text);
  }

  function renderCookieExpiresCell(cell, row) {
    const plan = row.expiry;
    if (plan.source === 'none') {
      appendCookieAbsent(cell);
      return;
    }
    const literal = document.createElement('span');
    literal.className = 'cookie-expiry-literal';
    if (plan.source === 'max-age') {
      literal.textContent = uiTextFormat('cookieMaxAgeLiteral', { seconds: plan.maxAge });
    } else {
      literal.textContent = plan.expires;
    }
    cell.appendChild(literal);
    // An Expires sent beside the Max-Age. Browsers ignore it, so the computed
    // line below reads from the Max-Age alone — but it is what the response
    // sent, and dropping it would render less than the header carries.
    if (plan.source === 'max-age' && plan.expires) {
      const sent = document.createElement('div');
      sent.className = 'cookie-expiry-literal cookie-expiry-literal--sent';
      sent.textContent = uiTextFormat('cookieExpiresLiteral', { value: plan.expires });
      cell.appendChild(sent);
    }
    if (!plan.computed) return;
    // The panel's arithmetic, marked as such and filed under the words it was
    // derived from. Unselectable and never copied: the row's Copy control
    // carries the captured header, and this line is a reading of it.
    const computed = document.createElement('div');
    computed.className = 'cookie-expiry-computed';
    const label = document.createElement('span');
    label.className = 'cookie-expiry-computed-label';
    label.textContent = uiText('cookieExpiryComputed');
    computed.appendChild(label);
    // A break opportunity between the label and the date. Without it the two
    // were one unbreakable word to the table's layout, and "ComputedWed," set
    // the Expires column's floor 40px wider than any word in it.
    computed.appendChild(document.createElement('wbr'));
    computed.appendChild(document.createTextNode(plan.computed));
    cell.appendChild(computed);
  }

  function renderCookieFlagsCell(cell, row) {
    if (row.flags.length === 0) {
      appendCookieAbsent(cell);
      return;
    }
    row.flags.forEach((flag, index) => {
      // A space between the chips, so a drag across the cell yields the flags
      // spaced the way they read rather than run into one word.
      if (index > 0) cell.appendChild(document.createTextNode(' '));
      const chip = document.createElement('span');
      chip.className = 'cookie-flag';
      chip.textContent = flag;
      cell.appendChild(chip);
    });
  }

  const REQUEST_COOKIE_COLUMNS = [
    { id: 'name', labelKey: 'cookieColumnName', render: renderCookieNameCell },
    { id: 'value', labelKey: 'cookieColumnValue', render: renderCookieValueCell },
  ];

  const RESPONSE_COOKIE_COLUMNS = [
    { id: 'name', labelKey: 'cookieColumnName', render: renderCookieNameCell },
    { id: 'value', labelKey: 'cookieColumnValue', render: renderCookieValueCell },
    {
      id: 'domain',
      labelKey: 'cookieColumnDomain',
      render: (cell, row) => renderCookieAttributeCell(cell, row.cookie.domain, appendCookieDomainText),
    },
    {
      id: 'path',
      labelKey: 'cookieColumnPath',
      render: (cell, row) => renderCookieAttributeCell(cell, row.cookie.path),
    },
    { id: 'expires', labelKey: 'cookieColumnExpires', render: renderCookieExpiresCell },
    { id: 'flags', labelKey: 'cookieColumnFlags', render: renderCookieFlagsCell },
  ];

  // `kind` is the same structural declaration a kv grid makes — 'cookie' for
  // the request table, 'header' for the response table whose rows ARE
  // Set-Cookie headers — and it, not the name the row renders, decides which
  // sanitizer the row-end copy passes. A row also states the captured name the
  // sanitizer judges and the captured bytes it copies, so no piece this table
  // parsed out of a header can ever become what leaves the panel.
  function createCookieTable(columns, rows, kind) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cookie-table-scroll';
    const table = document.createElement('table');
    table.className = 'cookie-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const column of columns) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.className = 'cookie-col cookie-col--' + column.id;
      th.textContent = uiText(column.labelKey);
      headRow.appendChild(th);
    }
    // The control column carries no visible heading — the controls name
    // themselves — but it still needs one a screen reader can announce.
    const copyHead = document.createElement('th');
    copyHead.scope = 'col';
    copyHead.className = 'cookie-col cookie-col--copy';
    const copyHeadLabel = document.createElement('span');
    copyHeadLabel.className = 'sr-only';
    copyHeadLabel.textContent = uiText('kvCopyValue');
    copyHead.appendChild(copyHeadLabel);
    headRow.appendChild(copyHead);
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const copyButtons = [];
    for (const row of rows) {
      const tr = document.createElement('tr');
      columns.forEach((column, index) => {
        // The name is the row's own header, so a screen reader can announce
        // which cookie a cell belongs to without the reader counting columns.
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.scope = 'row';
        cell.className = 'cookie-cell cookie-cell--' + column.id;
        column.render(cell, row);
        tr.appendChild(cell);
      });
      const copyCell = document.createElement('td');
      copyCell.className = 'cookie-cell cookie-cell--copy';
      if (row.copyValue) {
        const copyButton = createKvCopyButton(kind, row.copyLabel, row.copyName, row.copyValue);
        copyButtons.push(copyButton);
        copyCell.appendChild(copyButton);
      }
      tr.appendChild(copyCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    // One tab stop for the table, not one per row — the same roving every kv
    // grid and the timing table use.
    armKvCopyRoving(table, copyButtons);
    wrapper.appendChild(table);
    return wrapper;
  }

  function formatCookieHeaderSummary(count) {
    return count === 1
      ? uiText('cookieHeaderOpenCookiesOne')
      : uiTextFormat('cookieHeaderOpenCookies', { count: count.toLocaleString('en-US') });
  }

  // A request Cookie header is one blob whose pairs the Cookies tab already
  // lists one per row. The row leads with the count and a way into that tab;
  // the raw header follows under the shared clamp, so the value itself is
  // still present, selectable and searchable in the row that names it —
  // hiding it outright would take it out of find-in-page as well as out of
  // sight, which is the reachability Tier 2 spent three rounds protecting.
  function createRequestCookieValueNode(value, count) {
    const holder = document.createDocumentFragment();
    const summaryLine = document.createElement('div');
    summaryLine.className = 'kv-cookie-summary';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-btn kv-cookie-open-btn';
    button.textContent = formatCookieHeaderSummary(count);
    button.addEventListener('click', () => {
      activateInspectorTab('req-tab-bar', 'req-cookies', true);
    });
    summaryLine.appendChild(button);
    holder.appendChild(summaryLine);
    renderKvValue(holder, value, appendJwtAwareText);
    return holder;
  }

  // Only the Cookie header the Cookies tab itself reads gets the count line,
  // so the number in the row and the number of rows in that tab cannot
  // disagree — a second Cookie header keeps the plain value rendering.
  function createRequestCookieRowNode(header, cookieHeaderValue, cookieCount) {
    if (cookieCount <= 0) return null;
    if (String((header && header.name) || '').toLowerCase() !== 'cookie') return null;
    if (String((header && header.value) || '') !== cookieHeaderValue) return null;
    return createRequestCookieValueNode(cookieHeaderValue, cookieCount);
  }

  // The address as ONE block of inline spans, so the parts are told apart by
  // eye — muted scheme, weighted host, path breaking at its slashes, and the
  // query as name/value tokens with the name in the header-name colour — while
  // a drag across it still carries the URL with no newline inside it.
  //
  // textContent is the URL verbatim. Nothing here is ever read back for a copy
  // action: every copy path reads the captured row.url and runs it through the
  // sanitizer, so what is on screen and what leaves the panel stay separate.
  function createUrlElement(url) {
    const plan = planSegmentedUrl(url);
    const address = document.createElement('div');
    address.className = 'url-breakdown-address';
    if (!plan.segmented) {
      appendBreakableText(address, plan.raw);
      return address;
    }
    const span = (className, text) => {
      const el = document.createElement('span');
      el.className = className;
      if (text != null) el.textContent = text;
      address.appendChild(el);
      return el;
    };
    span('url-breakdown-scheme', plan.scheme);
    // Credentials sit between the scheme and the host and are part of the
    // address the request used. Without this span the row read, and copied,
    // an origin the request never contacted under that identity.
    if (plan.userinfo) span('url-breakdown-userinfo', plan.userinfo);
    span('url-breakdown-host', plan.host);
    address.appendChild(document.createElement('wbr'));
    appendBreakableText(span('url-breakdown-path'), plan.pathname);
    // The query and the fragment are part of the URL, so they belong in the
    // selectable value. While the query lived only inside a button label and
    // the hidden full text, selecting the row and copying yielded
    // scheme+host+path with the query silently dropped — a plausible URL that
    // was not the one the request made.
    if (plan.search) {
      address.appendChild(document.createElement('wbr'));
      const queryText = span('url-breakdown-query-text');
      if (plan.tokens.length === 0) {
        appendBreakableText(queryText, plan.search);
      } else {
        queryText.appendChild(document.createTextNode('?'));
        plan.tokens.forEach((token, index) => {
          if (index > 0) {
            // The break opportunity goes BEFORE the '&', so a wrapped line
            // opens on the separator and each parameter reads as one run.
            queryText.appendChild(document.createElement('wbr'));
            queryText.appendChild(document.createTextNode('&'));
          }
          const nameEl = document.createElement('span');
          nameEl.className = 'url-breakdown-query-name';
          nameEl.textContent = token.name;
          queryText.appendChild(nameEl);
          if (token.hasValue) {
            queryText.appendChild(document.createTextNode('='));
            const valueEl = document.createElement('span');
            valueEl.className = 'url-breakdown-query-value';
            appendBreakableText(valueEl, token.value);
            queryText.appendChild(valueEl);
          }
        });
      }
    }
    if (plan.hash) appendBreakableText(span('url-breakdown-fragment'), plan.hash);
    return address;
  }

  // The URL row of Request > Headers: the segmented address, the decoded
  // reading of an encoded query, a link into the Query tab, and the raw string
  // behind a toggle — instead of one 1,200-character value that pushed every
  // request header below the fold.
  function createUrlBreakdown(row) {
    const url = String((row && row.url) || '');
    const parts = splitUrlForTitle(url);
    const wrap = document.createElement('div');
    wrap.className = 'url-breakdown';
    if (!parts.host || !parts.scheme) {
      appendBreakableText(wrap, url);
      return wrap;
    }
    const line = (className) => {
      const el = document.createElement('div');
      el.className = 'url-breakdown-line ' + className;
      wrap.appendChild(el);
      return el;
    };
    // Every part of the ADDRESS lives in one block as inline spans. While the
    // origin, path, query and fragment were sibling blocks, a drag across the
    // row put a newline inside the URL itself, so the copied text was not an
    // address any tool would accept. Only the chrome that is not part of the
    // URL — the decoded reading, the Query control and the reveal toggle —
    // keeps its own line.
    wrap.appendChild(createUrlElement(url));
    // Percent-encoding hides what a parameter says, and decoding it in place
    // would make the row assert a URL the request did not send. The decoded
    // query therefore gets a line of its own, labelled, present only when it
    // really differs from the address above — and unselectable, so what a drag
    // across the row carries is still the address verbatim.
    const segments = planSegmentedUrl(url);
    if (segments.decodes) {
      const decodedLine = line('url-breakdown-decoded');
      const decodedLabel = document.createElement('span');
      decodedLabel.className = 'url-breakdown-decoded-label';
      decodedLabel.textContent = uiText('urlBreakdownDecoded');
      decodedLine.appendChild(decodedLabel);
      const decodedText = document.createElement('span');
      decodedText.className = 'url-breakdown-decoded-text';
      appendBreakableText(decodedText, segments.decodedSearch);
      decodedLine.appendChild(decodedText);
    }
    if (parts.search && parts.queryCount > 0) {
      const queryLine = line('url-breakdown-query-action');
      const queryButton = document.createElement('button');
      queryButton.type = 'button';
      queryButton.className = 'link-btn url-breakdown-query-btn';
      queryButton.textContent =
        parts.queryCount === 1
          ? uiText('urlBreakdownOpenQueryOne')
          : uiTextFormat('urlBreakdownOpenQuery', { count: parts.queryCount.toLocaleString('en-US') });
      queryButton.addEventListener('click', () => {
        activateInspectorTab('req-tab-bar', 'req-query', true);
      });
      queryLine.appendChild(queryButton);
    }
    // The lines above already spell out scheme, credentials, host, path,
    // query and fragment, so the reveal earns its place only when the full
    // string still carries something more. On a URL the lines account for
    // entirely it revealed the text already on screen.
    if (url !== parts.scheme + parts.userinfo + parts.host + parts.pathname) {
      const toggleLine = line('url-breakdown-toggle');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'link-btn url-breakdown-toggle-btn';
      toggle.textContent = uiText('urlBreakdownShowFull');
      toggle.setAttribute('aria-expanded', 'false');
      toggleLine.appendChild(toggle);
      const full = document.createElement('div');
      full.className = 'url-breakdown-full';
      // Named ownership, so a pane-search hit inside the hidden text presses
      // THIS toggle rather than whichever collapsed control the row holds
      // first — and so assistive tech can follow the pair.
      full.id = 'urlBreakdownFull-' + nextDomId();
      toggle.setAttribute('aria-controls', full.id);
      full.hidden = true;
      appendBreakableText(full, url);
      wrap.appendChild(full);
      toggle.addEventListener('click', () => {
        const reveal = full.hidden;
        full.hidden = !reveal;
        toggle.setAttribute('aria-expanded', String(reveal));
        toggle.textContent = reveal ? uiText('urlBreakdownHideFull') : uiText('urlBreakdownShowFull');
      });
    }
    return wrap;
  }

  // Appends a Query value's text with a break opportunity after each comma of
  // a list, on top of the breaks every value already gets. <wbr> adds nothing
  // to textContent, so the value the pane shows is the value it holds.
  function appendQueryValueText(container, text) {
    const segments = splitCommaList(text);
    if (segments.length === 1) {
      appendBreakableText(container, segments[0]);
      return;
    }
    segments.forEach((segment, index) => {
      // Through the shared helper, not as a bare text node: a comma segment
      // is still a value, and appending it raw dropped the & ; / breaks every
      // other value gets — 'a=1,b=2/c/d' had break points only at its commas.
      appendBreakableText(container, segment);
      if (index < segments.length - 1) container.appendChild(document.createElement('wbr'));
    });
  }

  // The value cell of one Query parameter. A value that is an absolute address
  // renders as the segmented URL the row above shows; a value that is itself a
  // query string keeps its own text and gains a collapsed sub-grid of the
  // parameters inside it, so a redirect's payload is readable without leaving
  // the pane. Everything else is the shared value rendering, clamp included.
  //
  // A fragment rather than a wrapper element: the children land directly in
  // the `.val` cell, so the clamped text and its toggle stay adjacent siblings
  // and the pane search's reveal still finds the toggle beside the clamp.
  //
  // The segmented rendering is offered only when it spells the parameter back
  // byte for byte. searchParams hands this function a DECODED token, so
  // 'next=https%3A%2F%2FCB.Example.TEST%3A443%2Freturn' arrived here as an
  // address whose parts rebuild to 'https://cb.example.test/return' — a
  // different host string and a dropped port. A value that does not survive
  // the round trip keeps the shared rendering, which shows the token itself.
  function createQueryValueNode(value) {
    const text = value == null ? '' : String(value);
    const holder = document.createDocumentFragment();
    if (isAbsoluteHttpUrl(text) && planSegmentedUrl(text).reconstructs) {
      holder.appendChild(createUrlElement(text));
      return holder;
    }
    renderKvValue(holder, text, appendQueryValueText);
    const nested = parseNestedQueryValue(text);
    if (nested.length > 0) {
      const details = document.createElement('details');
      details.className = 'kv-nested-details';
      const summary = document.createElement('summary');
      summary.className = 'kv-nested-summary';
      summary.textContent = uiTextFormat('queryNestedParams', { count: nested.length.toLocaleString('en-US') });
      details.appendChild(summary);
      const grid = createKvGrid(
        // No row-end Copy inside a value cell: this sub-grid is one parameter's
        // contents, and the control belongs to the rows a pane lists, not to a
        // disclosure nested inside one of them.
        nested.map((param) => ({
          name: param.name,
          value: param.value,
          mono: isMonoValue(param.name, param.value),
          // The same break opportunities the pane's own Query values get: a
          // nested 'kw=kw0,kw1,...,kw11' wrapped mid-token without this.
          appendText: appendQueryValueText,
          copyValue: '',
        })),
        'query',
      );
      grid.classList.add('kv-nested');
      details.appendChild(grid);
      holder.appendChild(details);
    }
    return holder;
  }

  function createStatsSummaryStructure(statsElement) {
    statsElement.textContent = '';

    const accessibleSummary = document.createElement('span');
    accessibleSummary.className = 'sr-only status-summary-accessible';
    statsElement.appendChild(accessibleSummary);

    const visualSummary = document.createElement('span');
    visualSummary.className = 'status-summary-visual';

    const statusLabel = document.createElement('span');
    statusLabel.className = 'status-summary-label';
    statusLabel.textContent = 'Status';
    statusLabel.setAttribute('aria-hidden', 'true');
    visualSummary.appendChild(statusLabel);

    const chips = document.createElement('span');
    chips.className = 'status-summary-chips';
    visualSummary.appendChild(chips);

    const duration = document.createElement('span');
    duration.className = 'status-summary-duration';
    duration.setAttribute('aria-hidden', 'true');
    visualSummary.appendChild(duration);
    statsElement.appendChild(visualSummary);

    const structure = {
      accessibleSummary,
      chips,
      duration,
      chipElements: new Map(),
    };
    statsSummaryStructures.set(statsElement, structure);
    return structure;
  }

  function getOrCreateStatsSummaryStructure(statsElement) {
    return statsSummaryStructures.get(statsElement) || createStatsSummaryStructure(statsElement);
  }

  function clearStatsSummary(statsElement) {
    statsElement.textContent = '';
    statsSummaryStructures.delete(statsElement);
  }

  function createStatusSummaryChip(statusClass, canInspect) {
    const chip = document.createElement(canInspect ? 'button' : 'span');
    chip.dataset.statusClass = statusClass;
    if (canInspect) {
      chip.type = 'button';
      chip.addEventListener('click', () => {
        const handler = statusSummaryInspectHandlers.get(chip);
        if (typeof handler === 'function') handler(statusClass);
      });
    }
    return chip;
  }

  function updateStatusSummaryChip(structure, indicator, onInspectStatusClass) {
    const canInspect = indicator.count > 0 && typeof onInspectStatusClass === 'function';
    const expectedTagName = canInspect ? 'BUTTON' : 'SPAN';
    let chip = structure.chipElements.get(indicator.statusClass);
    if (!chip || chip.tagName !== expectedTagName) {
      const replacement = createStatusSummaryChip(indicator.statusClass, canInspect);
      if (chip) {
        chip.replaceWith(replacement);
      } else {
        structure.chips.appendChild(replacement);
      }
      structure.chipElements.set(indicator.statusClass, replacement);
      chip = replacement;
    }

    chip.className =
      'status-summary-chip status-summary-chip--' +
      indicator.statusClass +
      (canInspect ? ' status-summary-chip--action' : ' status-summary-chip--empty');
    chip.textContent = indicator.text;
    if (canInspect) {
      const statusClassLabel =
        indicator.statusClass === 'other' ? 'other-status' : indicator.statusClass;
      const inspectLabel =
        'Inspect first visible ' +
        statusClassLabel +
        ' request (' +
        indicator.count +
        ' matching)';
      chip.setAttribute('aria-label', inspectLabel);
      chip.removeAttribute('aria-hidden');
      chip.title = inspectLabel;
      statusSummaryInspectHandlers.set(chip, onInspectStatusClass);
    } else {
      chip.setAttribute('aria-hidden', 'true');
      chip.removeAttribute('aria-label');
      chip.removeAttribute('title');
      statusSummaryInspectHandlers.delete(chip);
    }
  }

  function renderStatsSummary(statsElement, stats, onInspectStatusClass) {
    const indicators = getStatusClassIndicators(stats.statusClassCounts);
    const statusText = formatStatusClassSummary(stats.statusClassCounts);
    const durationText =
      'avg ' +
      fmtTime(stats.avgDuration) +
      ' · min ' +
      fmtTime(stats.minDuration) +
      ' · max ' +
      fmtTime(stats.maxDuration);
    const structure = getOrCreateStatsSummaryStructure(statsElement);
    structure.accessibleSummary.textContent = statusText + ' | ' + durationText;
    for (const indicator of indicators) {
      updateStatusSummaryChip(structure, indicator, onInspectStatusClass);
    }
    structure.duration.textContent = '| avg ' + fmtTime(stats.avgDuration);
    structure.duration.title = durationText;
  }

  function createTimingPhaseGuide() {
   const guide = document.createElement('details');
   guide.className = 'timing-guidance';
   const summary = document.createElement('summary');
   summary.className = 'timing-guidance-summary';
   summary.textContent = uiText('timingGuideSummary');
   guide.appendChild(summary);

   // The caveat leads the guide instead of standing between the table and it:
   // what the phases measured is the pane's answer, and what browser timing
   // cannot prove belongs with the explanation of the phases, not in front of
   // the numbers.
   const evidenceNote = document.createElement('p');
   evidenceNote.className = 'timing-evidence-note';
   evidenceNote.textContent = uiText('timingEvidenceLimitation');
   guide.appendChild(evidenceNote);

   const list = document.createElement('dl');
   list.className = 'timing-guidance-list';
   for (const phase of TIMING_PHASES) {
     const guidance = getTimingPhaseGuidance(phase);
     if (!guidance) continue;
     const term = document.createElement('dt');
     term.textContent = timingPhaseLabel(phase);
     const description = document.createElement('dd');
     description.textContent = uiText(TIMING_PHASE_TEXT_KEYS[phase]) || guidance.description;
     list.appendChild(term);
     list.appendChild(description);
   }
   guide.appendChild(list);
   return guide;
  }

  // One row of the Timing table: swatch, name, the phase's bar in the shared
  // track, duration, share, and the row-end copy the other panes carry.
  //
  // Every cell is a grid item of its own that states its column, the way a kv
  // row does — a row with nothing to copy has five items, and auto-placement
  // would otherwise slide the next row's swatch into the track it left empty.
  // Each datum stays inside one cell and the decoration carries no text, so a
  // drag across a row yields the phase, its duration and its share and not the
  // word "Copy" or a stray newline inside one of them.
  function appendTimingRow(table, copyButtons, spec) {
    const rowClass = (spec.total ? ' timing-row--total' : '') + (spec.muted ? ' timing-row--muted' : '');
    const swatch = document.createElement('div');
    swatch.className = 'timing-swatch' + rowClass;
    swatch.setAttribute('aria-hidden', 'true');
    // Every row that draws a bar keys it with a swatch, the Unaccounted row
    // included: it has no phase, so its dot takes the bar's own "rest" paint.
    if (!spec.total && !spec.muted) {
      const dot = document.createElement('span');
      dot.className = 'timing-dot ' + (spec.phase ? 'timing-phase-' + spec.phase : 'timing-dot--rest');
      swatch.appendChild(dot);
    }
    const name = document.createElement('div');
    name.className = 'timing-name' + rowClass;
    name.textContent = spec.name;
    const track = document.createElement('div');
    track.className = 'timing-track' + rowClass;
    track.setAttribute('aria-hidden', 'true');
    if (!spec.total) {
      const rail = document.createElement('div');
      rail.className = 'timing-rail';
      if (spec.widthPct > 0) {
        const bar = document.createElement('div');
        bar.className = 'timing-bar-seg' + (spec.phase ? ' timing-phase-' + spec.phase : ' timing-bar-seg--rest');
        bar.style.marginLeft = Math.min(100, Math.max(0, spec.offsetPct)).toFixed(2) + '%';
        bar.style.width = Math.min(100, Math.max(0, spec.widthPct)).toFixed(2) + '%';
        rail.appendChild(bar);
      }
      track.appendChild(rail);
    }
    const duration = document.createElement('div');
    duration.className = 'timing-duration' + rowClass;
    const durationText = spec.duration == null ? '' : formatTimingDuration(spec.duration);
    duration.textContent = durationText || uiText('timingNotReported');
    const share = document.createElement('div');
    share.className = 'timing-share' + rowClass;
    share.textContent = spec.sharePct == null ? '' : formatTimingShare(spec.sharePct);
    // Hovering anywhere on the row states what the phase measures, in the same
    // words the guide below the table uses and through the same key, so the
    // tooltip is never the one English string left in a Japanese pane.
    if (spec.title) {
      swatch.title = spec.title;
      name.title = spec.title;
      track.title = spec.title;
      duration.title = spec.title;
      share.title = spec.title;
    }
    table.appendChild(swatch);
    table.appendChild(name);
    table.appendChild(track);
    table.appendChild(duration);
    table.appendChild(share);
    if (durationText) {
      // 'plain': every value here is a duration this panel formatted from the
      // browser's own timing record, so none of it is captured payload.
      const copyButton = createKvCopyButton('plain', spec.name, spec.name, durationText);
      // The Total row's rule runs across all six cells, this one included.
      if (spec.total) copyButton.classList.add('timing-row--total');
      copyButtons.push(copyButton);
      table.appendChild(copyButton);
    }
  }

  // Response > Timing. One row per phase in a single table, with the bars
  // offset down a shared track so the phases read as a waterfall — instead of
  // a key/value grid, a separate bar, and a 10px legend the reader had to
  // match to the bar by colour before either meant anything.
  //
  // Two behaviour changes come with it, and both are deliberate. The rows are
  // TIMING_PHASES, not the keys the capture happens to carry: a phase the HAR
  // reported as -1 now has a row that says so, and a non-standard key such as
  // _blocked_queueing no longer appears as a phase Network+ does not document.
  function renderTimingTable(resTimingPane, row) {
    resTimingPane.textContent = '';
    const timingTitle = document.createElement('strong');
    timingTitle.textContent = uiText('detailsTimingBreakdownHeading');
    timingTitle.className = 'kv-group-heading';
    resTimingPane.appendChild(timingTitle);

    const plan = planTimingTable(row.timings, row.duration);
    // Nothing reported: one line says so, instead of seven rows that each say
    // "not reported" under a bar that is 100% unaccounted. The guide stays,
    // since it is what explains the phases the capture would have listed.
    if (!plan.phasesReported) {
      renderPaneEmptyMessage(resTimingPane, uiText('timingNoPhasesReported'));
      resTimingPane.appendChild(createTimingPhaseGuide());
      return;
    }
    const table = document.createElement('div');
    table.className = 'timing-table';
    const copyButtons = [];
    for (const entry of plan.rows) {
      const guidance = getTimingPhaseGuidance(entry.phase);
      appendTimingRow(table, copyButtons, {
        phase: entry.phase,
        name: timingPhaseLabel(entry.phase),
        title: guidance ? uiText(TIMING_PHASE_TEXT_KEYS[entry.phase]) || guidance.description : '',
        // A phase the capture never reported has no duration and no share to
        // state; its cells say so rather than reading as a measured zero.
        duration: entry.available ? entry.duration : null,
        sharePct: entry.available ? entry.sharePct : null,
        offsetPct: entry.offsetPct,
        widthPct: entry.widthPct,
        muted: entry.muted,
      });
    }
    if (plan.hasUnaccounted) {
      appendTimingRow(table, copyButtons, {
        phase: '',
        name: uiText('timingUnaccounted'),
        title: uiText('timingUnaccountedDescription'),
        duration: plan.unaccounted,
        sharePct: plan.unaccountedSharePct,
        offsetPct: plan.unaccountedOffsetPct,
        widthPct: plan.unaccountedSharePct,
        muted: false,
      });
    }
    appendTimingRow(table, copyButtons, {
      phase: '',
      name: uiText('detailsTimingTotal'),
      title: '',
      duration: plan.total,
      sharePct: plan.totalSharePct,
      offsetPct: 0,
      widthPct: 0,
      muted: false,
      total: true,
    });
    // One tab stop for the table, not one per row — the same roving the kv
    // grids use, so the pane costs what it did before the redesign.
    armKvCopyRoving(table, copyButtons);
    resTimingPane.appendChild(table);
    resTimingPane.appendChild(createTimingPhaseGuide());
  }

  // createHeaderSection removed — replaced by tabbed inspector layout

  // ============================================================
  // Section 10: Table Row Creation (shared) [Q2]
  // ============================================================
  // The grid keeps exactly one row in the tab order (roving tabindex). The
  // focus handler used to enforce that with a full-table sweep — O(rows) per
  // focus, O(rows²) per arrow-key traversal, the same quadratic trap
  // replaceRenderedRowStates already replaced with a two-element flip.
  // Tracking the current stop makes focus O(1); the render paths seed it.
  let currentRowTabStop = null;

  // rowState is the seam a test seeds to prove the row-state classes are
  // wired in: the selection, highlight and search state createTableRow reads
  // for this row, defaulting to the live module state.
  function createTableRow(row, onClick, isTabStop, rowState) {
    const rowStateSource = rowState || state;
    const tr = document.createElement('tr');
    tr.addEventListener('click', onClick);
    tr.addEventListener('focus', () => {
      state.focusedRow = row;
      const previous = currentRowTabStop;
      if (previous && previous !== tr && previous.isConnected) previous.tabIndex = -1;
      tr.tabIndex = 0;
      currentRowTabStop = tr;
    });
    tr.dataset.rowId = row.id;
    tr.id = 'request-row-' + row.id;
    tr.tabIndex = isTabStop ? 0 : -1;
    if (isTabStop) currentRowTabStop = tr;
    tr.setAttribute('role', 'row');
    // aria-keyshortcuts carries the context-menu hint; no tr.title so the
    // hover tooltip is free for each cell's full (possibly truncated) value.
    tr.setAttribute('aria-keyshortcuts', 'ContextMenu Shift+F10');

    const isSelected = rowStateSource.selectedRow === row || rowStateSource.selectedRows.has(row);
    tr.setAttribute('aria-selected', String(isSelected));
    const visibleStateBadges = [];
    if (isSelected) {
      visibleStateBadges.push({ text: '✓', label: 'Selected request' });
    }
    // Manual highlight (context menu)
    const hlColor = rowStateSource.highlightedRows.get(row);
    if (hlColor) {
      visibleStateBadges.push({ text: '★', label: 'Highlighted request' });
    }
    // Unified search match highlight — apply first matching keyword color
    const srch = rowStateSource.search;
    const rowColorSet = srch.rowColors.get(row);
    const firstColor = rowColorSet && rowColorSet.size > 0 ? rowColorSet.values().next().value : null;
    const rowStateClasses = planRowStateClasses({
      primary: rowStateSource.selectedRow === row,
      multi: rowStateSource.selectedRows.has(row),
      highlightColor: hlColor || null,
      searchColorIdx: firstColor,
      searchCurrent: srch.currentIndex >= 0 && srch.matches[srch.currentIndex] === row,
    });
    if (rowStateClasses.length > 0) tr.classList.add(...rowStateClasses);
    if (rowColorSet && rowColorSet.size > 0) {
      const rowKeywordSet = srch.rowKeywords.get(row) || new Set();
      const matchedKeywords = Array.from(rowKeywordSet).sort((a, b) => a - b);
      const keywordNumbers = matchedKeywords.map((keywordIndex) => keywordIndex + 1);
      const searchMatchLabel = 'Matches search ' +
        (keywordNumbers.length === 1 ? 'keyword ' : 'keywords ') + keywordNumbers.join(', ');
      const shownKeywords = matchedKeywords.slice(0, MAX_VISIBLE_KEYWORD_BADGES);
      for (const keywordIndex of shownKeywords) {
        const keyword = srch.keywords[keywordIndex];
        const colorIdx = keyword && Number.isInteger(keyword.colorIdx) ? keyword.colorIdx : 0;
        visibleStateBadges.push({
          text: String(keywordIndex + 1),
          label: searchMatchLabel,
          keywordColorIdx: colorIdx,
        });
      }
      if (matchedKeywords.length > shownKeywords.length) {
        visibleStateBadges.push({
          text: '+' + (matchedKeywords.length - shownKeywords.length),
          label: searchMatchLabel,
        });
      }
    }
    const methodClass = methodClassToken(row.method);
    if (methodClass) tr.classList.add(methodClass);
    // Status code row class
    const statusClass = classifyStatusClass(row.status);
    if (statusClass !== 'other') tr.classList.add('status-' + statusClass);

    const visibleCols = getEffectiveVisibleColumns();
    for (const c of visibleCols) {
      const td = document.createElement('td');
      td.setAttribute('role', 'gridcell');
      td.dataset.colId = c.id;
      if (c.id === 'method') td.classList.add('method-cell');
      if (c.id === 'status') td.classList.add('status-cell');

      if (c.id === 'initiator') {
        const initiator = row.initiator;
        if (initiator && initiator.url && canOpenDevtoolsResource()) {
          const link = document.createElement('a');
          link.href = '#';
          link.title = initiator.url;
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chrome.devtools.panels.openResource(initiator.url, initiator.lineNumber, () => {});
          });
          if (srch.keywords.length > 0) {
            link.appendChild(highlightTextMulti(initiator.text, srch.keywords, srch.options));
          } else {
            link.textContent = initiator.text;
          }
          td.appendChild(link);
        } else {
          const txt = initiator ? initiator.text : '';
          if (srch.keywords.length > 0) {
            td.appendChild(highlightTextMulti(txt, srch.keywords, srch.options));
          } else {
            td.textContent = txt;
          }
          if (txt) td.title = txt;
        }
      } else if (c.id === 'waterfall') {
        td.classList.add('waterfall-cell');
        // Use the range cached once per render by renderBody() — O(1) per row.
        const range = state.waterfallRange;
        const wfBar = range ? computeWaterfallBar(row, range) : null;
        // Provide accessible name describing relative start and duration; decorative bar is hidden.
        const relStartMs = wfBar ? (wfBar.offsetPct / 100) * (range.end - range.start) : 0;
        td.setAttribute(
          'aria-label',
          wfBar
            ? 'Waterfall: starts at ' + fmtTime(relStartMs) + ', duration ' + fmtTime(row.duration)
            : 'Waterfall: no timing data',
        );
        if (wfBar) {
          const track = document.createElement('div');
          track.className = 'wf-track';
          track.setAttribute('aria-hidden', 'true');
          const fill = document.createElement('div');
          fill.className = 'wf-fill';
          fill.style.marginLeft = wfBar.offsetPct.toFixed(2) + '%';
          fill.style.width = wfBar.widthPct.toFixed(2) + '%';
          if (wfBar.segments.length > 0) {
            for (const seg of wfBar.segments) {
              const segEl = document.createElement('div');
              segEl.className = 'wf-seg timing-phase-' + seg.label;
              segEl.style.width = seg.pct.toFixed(2) + '%';
              fill.appendChild(segEl);
            }
          }
          track.appendChild(fill);
          td.appendChild(track);
        }
      } else {
        let v = row[c.id];
        if (c.id === 'customHeader') v = getRowHeaderColumnValue(row);
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
        // Known methods render as a colored badge; the pill keys off the
        // row's method-* class, so unknown methods stay plain bold text.
        let contentHost = td;
        if (c.id === 'method' && text) {
          contentHost = document.createElement('span');
          contentHost.className = 'method-badge';
          td.appendChild(contentHost);
        }
        if (srch.keywords.length > 0 && text) {
          contentHost.appendChild(highlightTextMulti(text, srch.keywords, srch.options));
        } else {
          contentHost.textContent = text;
        }
        // Every text cell carries its full value as the tooltip so a
        // truncated Domain/Type/Path can be read on hover; the method pill
        // never truncates.
        if (c.id !== 'method' && text) td.title = text;
      }

      tr.appendChild(td);
    }
    if (visibleStateBadges.length > 0) {
      const badgeCell = tr.querySelector('td[data-col-id="match"]');
      if (badgeCell) {
        const badgeGroup = document.createElement('span');
        badgeGroup.className = 'row-state-badges';
        for (let i = 0; i < visibleStateBadges.length; i++) {
          const stateBadge = visibleStateBadges[i];
          const badge = document.createElement('span');
          // Keyword badges are visible: the row tint can only carry the first
          // matched keyword, so it cannot answer which of several a row hit.
          badge.className = 'row-state-badge';
          if (Number.isInteger(stateBadge.keywordColorIdx)) {
            badge.classList.add('row-state-badge--kw' + stateBadge.keywordColorIdx);
          }
          badge.textContent = stateBadge.text;
          badge.title = stateBadge.label;
          badge.setAttribute('aria-label', stateBadge.label);
          badgeGroup.appendChild(badge);
        }
        badgeCell.appendChild(badgeGroup);
      }
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
    const column = state.columns.find((candidate) => candidate.id === colId);
    const columnLabel = column ? column.label : colId;

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

      // Dedicated width class: the generic .filter-value 52% width would force
      // the From/To pair onto separate lines inside the popup.
      const startLabel = document.createElement('span');
      startLabel.textContent = 'From ';
      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.step = '1';
      startInput.className = 'filter-time-input';
      startInput.value = startVal;
      startInput.setAttribute('aria-label', columnLabel + ' filter start time');

      const endLabel = document.createElement('span');
      endLabel.textContent = ' To ';
      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.step = '1';
      endInput.className = 'filter-time-input';
      endInput.value = endVal;
      endInput.setAttribute('aria-label', columnLabel + ' filter end time');

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Reset';
      clearBtn.className = 'filter-clear-btn';
      clearBtn.setAttribute('aria-label', 'Reset ' + columnLabel + ' time filter');
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

      // All / None sit inline with the checkboxes so the whole rule is one row.
      const allBtn = document.createElement('button');
      allBtn.textContent = 'All';
      allBtn.className = 'filter-clear-btn filter-inline-action';
      allBtn.setAttribute('aria-label', 'Select all Method filter values');
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
      noneBtn.className = 'filter-clear-btn filter-inline-action';
      noneBtn.setAttribute('aria-label', 'Deselect all Method filter values');
      noneBtn.addEventListener('click', () => {
        HTTP_METHODS.forEach((m) => { include[m] = false; });
        state.columnFilterRules[colId] = { mode: 'methodSet', include: Object.assign({}, include) };
        onChange();
        grid.textContent = '';
        renderMethodCheckboxes();
      });

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

      const row = document.createElement('div');
      row.className = 'filter-inline-row';
      row.appendChild(allBtn);
      row.appendChild(noneBtn);
      row.appendChild(grid);
      wrap.appendChild(row);
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
        // Category label and its codes share one row so the rule stays compact.
        const row = document.createElement('div');
        row.className = 'filter-inline-row';

        const catLabel = document.createElement('div');
        catLabel.className = 'filter-status-category';
        catLabel.textContent = cat.label;
        row.appendChild(catLabel);

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
        row.appendChild(grid);
        wrap.appendChild(row);
      }
      return wrap;
    }

    // --- URL column: advanced include/exclude ---
    if (colId === 'url') {
      const rule = state.columnFilterRules[colId];
      const isAdv = rule && rule.mode === 'urlAdvanced';

      // Each field is one "label: input" row; the comma-separated hint lives in
      // the placeholder so the labels stay short enough to never wrap.
      const makeUrlField = (labelText, placeholder, value, ariaLabel) => {
        const field = document.createElement('div');
        field.className = 'filter-inline-field';
        const label = document.createElement('label');
        label.className = 'filter-inline-label';
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'filter-value';
        input.placeholder = placeholder;
        input.value = value;
        input.setAttribute('aria-label', ariaLabel);
        field.appendChild(label);
        field.appendChild(input);
        return { field, input };
      };

      const inclAny = makeUrlField(
        'Include any', 'keyword1, keyword2', isAdv ? rule.includeAny || '' : '', 'URL filter Include any',
      );
      const inclAnyInput = inclAny.input;
      const inclAll = makeUrlField(
        'Include all', 'must1, must2', isAdv ? rule.includeAll || '' : '', 'URL filter Include all',
      );
      const inclAllInput = inclAll.input;
      const excl = makeUrlField(
        'Exclude any', 'exclude1, exclude2', isAdv ? rule.excludeAny || '' : '', 'URL filter Exclude any',
      );
      const exclInput = excl.input;

      const csLabel = document.createElement('label');
      csLabel.className = 'filter-checkbox-inline';
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

      wrap.appendChild(inclAny.field);
      wrap.appendChild(inclAll.field);
      wrap.appendChild(excl.field);
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
          opSelect.setAttribute('aria-label', columnLabel + ' filter condition ' + (idx + 1) + ' operator');

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'filter-value';
          input.placeholder = 'value';
          input.value = cond.value || '';
          input.setAttribute('aria-label', columnLabel + ' filter condition ' + (idx + 1) + ' value');

          const updateInputState = () => {
            const noValueRequired = isValuelessFilterOperator(opSelect.value);
            input.disabled = noValueRequired;
            if (noValueRequired) input.value = '';
          };
          updateInputState();

          const removeBtn = document.createElement('button');
          removeBtn.textContent = 'x';
          removeBtn.className = 'filter-remove-btn';
          removeBtn.setAttribute('aria-label', 'Remove ' + columnLabel + ' filter condition ' + (idx + 1));
          removeBtn.addEventListener('click', () => {
            conditions.splice(idx, 1);
            if (conditions.length === 0) conditions.push({ op: 'contains', value: '' });
            state.columnFilterRules[colId] = { mode: 'multiText', conditions: conditions.slice() };
            onChange();
            renderConditions();
          });

          opSelect.addEventListener('change', () => {
            conditions[idx].op = opSelect.value;
            updateInputState();
            conditions[idx].value = input.value;
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
        addBtn.setAttribute('aria-label', 'Add ' + columnLabel + ' filter condition');
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
    opSelect.setAttribute('aria-label', columnLabel + ' filter operator');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'filter-value';
    input.placeholder = 'value';
    input.value = rule.value || '';
    input.setAttribute('aria-label', columnLabel + ' filter value');

    const updateInputState = () => {
      const noValueRequired = isValuelessFilterOperator(opSelect.value);
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

  function getActiveFilterCount() {
    return countActiveColumnFilters(state.columnFilterRules);
  }

  function createFilterPopupContent(onChange) {
    const root = document.createElement('div');
    root.className = 'filter-popup-body';

    const header = document.createElement('div');
    header.className = 'filter-popup-header';
    header.textContent = `Column Filters (${getActiveFilterCount()} active)`;
    root.appendChild(header);

    const list = document.createElement('div');
    list.className = 'filter-popup-list';

    const refreshHeader = () => {
      header.textContent = `Column Filters (${getActiveFilterCount()} active)`;
    };
    const debouncedOnChange = debounce(onChange, FILTER_DEBOUNCE_MS);
    for (const col of state.columns) {
      if (isVisualOnlyColumn(col.id)) continue;
      const section = document.createElement('div');
      section.className = 'filter-section';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'filter-section-toggle';
      const caret = document.createElement('span');
      caret.className = 'filter-section-caret';
      caret.textContent = '▸';
      caret.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'filter-section-name';
      name.textContent = col.label;
      const activeBadge = document.createElement('span');
      activeBadge.className = 'filter-section-state';
      toggle.appendChild(caret);
      toggle.appendChild(name);
      toggle.appendChild(activeBadge);

      const body = document.createElement('div');
      body.className = 'filter-section-body';

      const refreshBadge = () => {
        activeBadge.textContent = isRuleActive(state.columnFilterRules[col.id]) ? 'Active' : '';
      };
      refreshBadge();

      const control = createColumnFilterControl(col.id, () => {
        refreshBadge();
        refreshHeader();
        debouncedOnChange();
      });
      body.appendChild(control);

      const setExpanded = (expanded) => {
        section.classList.toggle('open', expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        body.hidden = !expanded;
      };
      // Every rule starts expanded and editable — collapsing is an opt-in way
      // to shorten the list, never a hurdle in front of the controls.
      setExpanded(true);
      toggle.addEventListener('click', () => {
        setExpanded(body.hidden);
      });

      section.appendChild(toggle);
      section.appendChild(body);
      list.appendChild(section);
    }

    root.appendChild(list);
    return root;
  }

  function createSingleColumnFilterContent(colId, onChange) {
    const root = document.createElement('div');
    root.className = 'filter-popup-body';

    const col = state.columns.find((c) => c.id === colId);
    if (!col || isVisualOnlyColumn(colId)) return root;

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

  function getInspectorTabButton(barId, tabId) {
    const bar = $('#' + barId);
    if (!bar) return null;
    return $all('.tab-btn', bar).find((button) => button.dataset.tab === tabId) || null;
  }

  // The tab a person last picked in each bar. Every row selection re-applies
  // it; when that pane has nothing for the new row, Headers shows instead
  // without overwriting the choice, so the next row that does have cookies
  // (or query parameters) brings the picked tab back.
  const inspectorTabChoice = {};
  const INSPECTOR_FALLBACK_TAB = Object.freeze({
    'req-tab-bar': 'req-headers',
    'res-tab-bar': 'res-headers',
  });
  // Tabs whose label carries a count. Body and Raw are either never empty or
  // only known after the async body fetch, so they stay uncounted.
  const INSPECTOR_COUNTED_TABS = new Set(['req-query', 'req-cookies', 'res-cookies']);

  // A retired tab, mapped to the tab that took its work over. Response >
  // Preview was folded into Body, so a pick made before that merge — the
  // sticky choice a session already holds, or one restored from a saved
  // value — opens Body. Without this the button lookup below simply fails and
  // the pane silently stays wherever it was. Both spellings are accepted: the
  // choice is stored as a pane id, while a saved value may name the button.
  const INSPECTOR_RETIRED_TABS = Object.freeze({
    'res-preview': 'res-body',
    'res-tab-preview': 'res-body',
  });

  // An own-property check, never a bare lookup: the map is an object literal
  // with Object.prototype behind it, so a saved value of 'toString' would
  // otherwise resolve to a function instead of passing through as a tab id.
  function resolveInspectorTabId(tabId) {
    return typeof tabId === 'string' && Object.prototype.hasOwnProperty.call(INSPECTOR_RETIRED_TABS, tabId)
      ? INSPECTOR_RETIRED_TABS[tabId]
      : tabId;
  }

  // Pure: which tab a bar shows for a row, given the person's choice and the
  // known item counts (0 = empty). An empty choice falls back to Headers, and
  // a choice naming a retired tab reads as the tab that replaced it.
  function planInspectorTabActivation(choice, counts, fallbackTab) {
    const picked = resolveInspectorTabId(choice);
    if (!picked) return fallbackTab || null;
    if (counts && counts[picked] === 0) return fallbackTab || picked;
    return picked;
  }

  function activateInspectorTab(barId, tabId, moveFocus, options) {
    const bar = $('#' + barId);
    const targetTab = resolveInspectorTabId(tabId);
    const activeButton = getInspectorTabButton(barId, targetTab);
    if (!bar || !activeButton) return null;
    if (!(options && options.transient)) inspectorTabChoice[barId] = targetTab;
    const buttons = $all('.tab-btn', bar);
    const contentArea = bar.nextElementSibling;
    buttons.forEach((candidate) => {
      const isActive = candidate === activeButton;
      candidate.classList.toggle('active', isActive);
      candidate.setAttribute('aria-selected', String(isActive));
      candidate.tabIndex = isActive ? 0 : -1;
    });
    if (contentArea) {
      contentArea.querySelectorAll('.tab-pane').forEach((pane) => {
        const isActive = pane.id === targetTab;
        pane.classList.toggle('active', isActive);
        pane.hidden = !isActive;
      });
    }
    syncScrollportBarInset(contentArea);
    if (moveFocus) {
      activeButton.focus();
      activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    return activeButton;
  }

  function initializeInspectorTabBar(barId) {
    const bar = $('#' + barId);
    if (!bar) return;
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('.tab-btn');
      if (button) activateInspectorTab(barId, button.dataset.tab, false);
    });
    bar.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = $all('.tab-btn', bar);
      const current = event.target.closest('.tab-btn');
      const nextIndex = getNextTabIndex(buttons.indexOf(current), buttons.length, event.key);
      if (nextIndex < 0) return;
      event.preventDefault();
      activateInspectorTab(barId, buttons[nextIndex].dataset.tab, true);
    });

    const activeButton =
      $all('.tab-btn', bar).find((button) => button.classList.contains('active')) ||
      $('.tab-btn', bar);
    if (activeButton) activateInspectorTab(barId, activeButton.dataset.tab, false);
  }

  // Stamps every tab of a bar with what its pane holds for the current row:
  // data-count (Query / Cookies, rendered by CSS after the label) and
  // is-empty (muted label, still clickable and painted at full opacity).
  // counts maps tab id -> item count; tabs without an entry are unknown and
  // keep their plain look. The number is only for the tabs that count items:
  // Body and Raw hold one document, so a "0" beside them announced a count
  // they never had — CSS gives those an en dash instead. Then the picked tab
  // is re-applied, or Headers when the picked pane is empty.
  function applyInspectorTabSignals(barId, counts) {
    const bar = $('#' + barId);
    if (!bar) return null;
    $all('.tab-btn', bar).forEach((button) => {
      const tabId = button.dataset.tab;
      const count = Object.prototype.hasOwnProperty.call(counts, tabId) ? counts[tabId] : null;
      if (count !== null && INSPECTOR_COUNTED_TABS.has(tabId)) {
        button.dataset.count = count.toLocaleString('en-US');
      } else {
        delete button.dataset.count;
      }
      button.classList.toggle('is-empty', count === 0);
    });
    const target = planInspectorTabActivation(
      inspectorTabChoice[barId],
      counts,
      INSPECTOR_FALLBACK_TAB[barId],
    );
    return target ? activateInspectorTab(barId, target, false, { transient: true }) : null;
  }

  // The response bar is stamped twice for one row: the cookies are counted
  // while the row renders, Body and Raw only once the cached body lands (or
  // fails to). Keeping the counts here lets the second pass add its own
  // without clearing the first pass' — applyInspectorTabSignals reads the
  // whole bar from the object it is given.
  const responseTabCounts = Object.create(null);

  function applyResponseTabSignals(counts, options) {
    if (options && options.reset) {
      for (const tabId of Object.keys(responseTabCounts)) delete responseTabCounts[tabId];
    }
    Object.assign(responseTabCounts, counts);
    return applyInspectorTabSignals('res-tab-bar', responseTabCounts);
  }

  function resetInspectorTabSignals() {
    for (const tabId of Object.keys(responseTabCounts)) delete responseTabCounts[tabId];
    $all('.tab-btn', $('#details')).forEach((button) => {
      delete button.dataset.count;
      button.classList.remove('is-empty');
    });
  }

  // The muted one-liner an empty pane shows instead of a bare parenthesis.
  function renderPaneEmptyMessage(pane, text) {
    const message = document.createElement('p');
    message.className = 'pane-empty';
    message.textContent = text;
    pane.appendChild(message);
    return message;
  }

  let sampleGuideDialogTrigger = null;

  function resetSampleGuideDialog() {
    const evidence = $('#sampleGuideEvidence');
    const revealButton = $('#sampleGuideRevealBtn');
    if (evidence) {
      evidence.textContent = '';
      evidence.hidden = true;
    }
    if (revealButton) {
      revealButton.hidden = false;
      revealButton.disabled = false;
    }
  }

  function appendSampleGuideEvidenceItem(list, label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    list.appendChild(term);
    list.appendChild(detail);
  }

  function announceSampleEvidenceNavigation(statusElement, message) {
    if (statusElement) statusElement.textContent = message;
    setStatus(message, true);
  }

  function syncSearchUIAfterRender() {
    if (typeof state.syncSearchUI === 'function') state.syncSearchUI();
  }

  function navigateToSampleEvidence(destination, evidence, statusElement) {
    const retainedActiveRows = state.rows.filter((row) =>
      isActiveRetainedRow(row, state.retainedRows, state.activeRows),
    );
    const plan = planSampleEvidenceNavigation({
      sampleCaptureActive: state.sampleCaptureActive,
      rows: retainedActiveRows,
      destination,
      columns: state.columns,
      columnFilterRules: state.columnFilterRules,
    });
    const unavailableMessage =
      'Sample evidence is unavailable. Reload the local sample capture and reveal the evidence again.';
    if (!plan.available || !getInspectorTabButton('res-tab-bar', plan.tabId)) {
      announceSampleEvidenceNavigation(statusElement, unavailableMessage);
      return false;
    }

    if (plan.blockingFilterIds.length > 0) {
      const previousFilterRules = serializeFilterState(state.columnFilterRules);
      const defaults = DEFAULT_COLUMN_FILTER_RULES();
      for (const colId of plan.blockingFilterIds) {
        state.columnFilterRules[colId] = defaults[colId];
      }
      renderBody();
      if (
        !state.filteredRows.includes(plan.targetRow) ||
        !isActiveRetainedRow(plan.targetRow, state.retainedRows, state.activeRows)
      ) {
        state.columnFilterRules = deserializeFilterState(previousFilterRules);
        renderBody();
        syncSearchUIAfterRender();
        announceSampleEvidenceNavigation(statusElement, unavailableMessage);
        return false;
      }
      syncSearchUIAfterRender();
    }

    closeSampleGuideDialog(false);
    selectRow(plan.targetRow, null, true);
    scrollToSelectedRow();
    activateInspectorTab('res-tab-bar', plan.tabId, true);

    const evidenceMessage =
      destination === 'timing'
        ? 'Dominant phase: ' +
          evidence.dominantPhaseLabel +
          ', ' +
          evidence.dominantDurationMs.toLocaleString('en-US') +
          ' ms.'
        : evidence.retryHeaderName + ' is ' + evidence.retryAfter + ' seconds.';
    const filterMessage =
      plan.blockingFilterIds.length > 0
        ? ' Cleared ' +
          plan.blockingFilterIds.length +
          ' sample-only column ' +
          (plan.blockingFilterIds.length === 1 ? 'filter' : 'filters') +
          ' that hid the request; pre-sample filters return when sample mode exits.'
        : '';
    setStatus(
      'Opened Response ' +
        plan.tabLabel +
        ' for the failed local sample request. ' +
        evidenceMessage +
        filterMessage,
      true,
    );
    return true;
  }

  function createSampleGuideEvidenceAction(label, destination, evidence, statusElement) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () =>
      navigateToSampleEvidence(destination, evidence, statusElement),
    );
    return button;
  }

  function renderSampleGuideEvidence() {
    const container = $('#sampleGuideEvidence');
    if (!container) return null;
    const evidence = deriveSampleGuideEvidence(
      createSampleCaptureRequests(SAMPLE_CAPTURE_BASE_TIMESTAMP),
    );
    if (!evidence) {
      setStatus('Sample guide evidence is unavailable because the failed sample request is missing.');
      return null;
    }

    container.textContent = '';
    const heading = document.createElement('h3');
    heading.tabIndex = -1;
    heading.textContent = uiText('sampleEvidenceHeading');
    container.appendChild(heading);

    const list = document.createElement('dl');
    list.className = 'sample-guide-evidence-list';
    appendSampleGuideEvidenceItem(
      list,
      uiText('sampleEvidenceFailedRequest'),
      evidence.method +
        ' ' +
        evidence.path +
        ' · HTTP ' +
        evidence.status +
        ' · ' +
        evidence.totalDurationMs.toLocaleString('en-US') +
        ' ms total',
    );
    appendSampleGuideEvidenceItem(
      list,
      uiText('sampleEvidenceDominantPhase'),
      evidence.dominantPhaseLabel +
        ' · ' +
        evidence.dominantDurationMs.toLocaleString('en-US') +
        ' ms',
    );
    appendSampleGuideEvidenceItem(
      list,
      uiText('sampleEvidenceRetryHint'),
      evidence.retryHeaderName + ': ' + evidence.retryAfter + ' seconds',
    );
    appendSampleGuideEvidenceItem(list, uiText('sampleEvidenceLimit'), localizeTimingLimitation(evidence.limitation));
    container.appendChild(list);

    const navigationActions = document.createElement('div');
    navigationActions.className = 'sample-guide-evidence-actions';
    const navigationStatus = document.createElement('p');
    navigationStatus.className = 'sample-guide-navigation-status';
    navigationStatus.setAttribute('role', 'status');
    navigationStatus.setAttribute('aria-live', 'polite');
    navigationStatus.setAttribute('aria-atomic', 'true');
    navigationActions.appendChild(
      createSampleGuideEvidenceAction(
        uiText('sampleEvidenceInspectTiming'),
        'timing',
        evidence,
        navigationStatus,
      ),
    );
    navigationActions.appendChild(
      createSampleGuideEvidenceAction(
        uiText('sampleEvidenceInspectRetry'),
        'headers',
        evidence,
        navigationStatus,
      ),
    );
    container.appendChild(navigationActions);
    container.appendChild(navigationStatus);
    container.hidden = false;
    return heading;
  }

  function openSampleGuideDialog(trigger) {
    const dialog = $('#sampleGuideDialog');
    const button = $('#sampleGuideBtn');
    if (!state.sampleCaptureActive || !dialog || !button || button.hidden) {
      setStatus('Sample guide is available only while the local sample capture is active.');
      return false;
    }
    if (dialog.open) return true;
    const otherModal = Array.from(document.querySelectorAll('dialog[open]')).some(
      (candidate) => candidate !== dialog,
    );
    if (otherModal) return false;

    resetSampleGuideDialog();
    sampleGuideDialogTrigger = trigger || document.activeElement;
    button.setAttribute('aria-expanded', 'true');
    dialog.showModal();
    setTimeout(() => {
      const revealButton = $('#sampleGuideRevealBtn');
      if (dialog.open && revealButton) revealButton.focus();
    }, 0);
    return true;
  }

  function closeSampleGuideDialog(restoreFocus) {
    const dialog = $('#sampleGuideDialog');
    if (restoreFocus === false) sampleGuideDialogTrigger = null;
    if (dialog && dialog.open) {
      dialog.close();
      return;
    }
    resetSampleGuideDialog();
    const button = $('#sampleGuideBtn');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function initializeSampleGuideDialog() {
    const dialog = $('#sampleGuideDialog');
    const button = $('#sampleGuideBtn');
    const closeButton = $('#sampleGuideCloseBtn');
    const revealButton = $('#sampleGuideRevealBtn');
    if (!dialog || !button || !closeButton || !revealButton) return;

    button.addEventListener('click', (event) => openSampleGuideDialog(event.currentTarget));
    closeButton.addEventListener('click', () => closeSampleGuideDialog(true));
    revealButton.addEventListener('click', () => {
      const heading = renderSampleGuideEvidence();
      if (!heading) return;
      revealButton.hidden = true;
      heading.focus({ preventScroll: true });
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSampleGuideDialog(true);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeSampleGuideDialog(true);
    });
    dialog.addEventListener('close', () => {
      const trigger = sampleGuideDialogTrigger;
      sampleGuideDialogTrigger = null;
      resetSampleGuideDialog();
      button.setAttribute('aria-expanded', 'false');
      if (trigger && trigger.focus && trigger.isConnected !== false && !trigger.hidden) {
        trigger.focus({ preventScroll: true });
      }
    });
  }

  function initializeStatusDetailsDisclosure() {
    const toggle = $('#statusDetailsToggle');
    const details = $('#statusDetails');
    if (!toggle || !details) return;

    const matchMediaApi = getMatchMediaApi();
    if (!matchMediaApi) return;
    let mediaQuery;
    try {
      mediaQuery = matchMediaApi(STATUS_DETAILS_MEDIA_QUERY);
    } catch (_error) {
      return;
    }
    if (!mediaQuery || typeof mediaQuery.matches !== 'boolean') return;

    let expanded = false;
    let detailsHadFocus = false;
    details.addEventListener('focusin', () => {
      detailsHadFocus = true;
    });
    details.addEventListener('focusout', (event) => {
      if (event.relatedTarget && !details.contains(event.relatedTarget)) {
        detailsHadFocus = false;
      }
    });
    const sync = () => {
      const available = mediaQuery.matches;
      const visible = available && expanded;
      if (!available && document.activeElement === toggle) {
        const fallback = ['sampleExitBtn', 'sampleGuideBtn', 'undoClearBtn', 'clearBtn']
          .map((id) => $('#' + id))
          .find((candidate) => candidate && !candidate.hidden && !candidate.disabled);
        if (fallback) fallback.focus({ preventScroll: true });
      }
      toggle.hidden = !available;
      if (
        available &&
        !expanded &&
        (detailsHadFocus || details.contains(document.activeElement))
      ) {
        toggle.focus({ preventScroll: true });
        detailsHadFocus = false;
      }
      toggle.textContent = visible ? 'Less status' : 'More status';
      toggle.setAttribute('aria-expanded', String(visible));
      details.hidden = available && !expanded;
    };

    toggle.addEventListener('click', () => {
      expanded = !expanded;
      sync();
    });
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', sync);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(sync);
    }
    sync();
  }

  function getSampleCaptureExitPlan() {
    const retainedActiveRows = state.rows.filter((row) =>
      isActiveRetainedRow(row, state.retainedRows, state.activeRows),
    );
    if (retainedActiveRows.length !== state.rows.length) {
      return { available: false, reason: 'sample-retention-mismatch', rows: [] };
    }
    return planSampleCaptureExit({
      sampleCaptureActive: state.sampleCaptureActive,
      rows: retainedActiveRows,
    });
  }

  function updateSampleCaptureExitAvailability() {
    const available = getSampleCaptureExitPlan().available;
    for (const id of ['sampleExitBtn', 'sampleGuideExitBtn']) {
      const button = $('#' + id);
      if (!button) continue;
      button.hidden = !available;
      button.disabled = !available;
    }
    const help = $('#sampleGuideExitHelp');
    if (help) help.hidden = !available;
  }

  function exitLocalSampleCapture() {
    const plan = getSampleCaptureExitPlan();
    if (!plan.available) {
      setStatus(
        'Sample exit is unavailable because the complete local sample is no longer present. Use Clear to reset the current requests.',
        true,
      );
      return false;
    }

    removeRowsFromState(plan.rows, false);
    render();
    syncSearchUIAfterRender();
    clearDetailsPanel();
    const focusTarget = document.querySelector('.empty-state-action') || $('#clearBtn');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    setStatus(
      'Local sample exited. Previous recording state and column filters restored. ' +
        (state.paused ? 'Recording remains paused.' : 'Live recording is active.'),
      true,
    );
    return true;
  }

  function initializeSampleCaptureExitActions() {
    const statusButton = $('#sampleExitBtn');
    const guideButton = $('#sampleGuideExitBtn');
    if (!statusButton || !guideButton) return;
    statusButton.addEventListener('click', exitLocalSampleCapture);
    guideButton.addEventListener('click', exitLocalSampleCapture);
    updateSampleCaptureExitAvailability();
  }

  function toggleSort(colId) {
    if (isVisualOnlyColumn(colId)) return;
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
  // What the grid actually paints: the reader's own visible set minus the
  // columns the wrap could not hold. The header row, every row's cells and
  // the elastic width all read this one derivation, so they cannot disagree.
  function isColumnEffectivelyVisible(column) {
    return !!column && column.visible === true && !state.autoHiddenColumnIds.has(column.id);
  }

  function getEffectiveVisibleColumns() {
    return state.columns.filter(isColumnEffectivelyVisible);
  }

  // True while a column drag is in flight: a re-render mid-gesture would
  // destroy the <th> and the .col-resizer the mousedown closed over and the
  // drag would die under the reader's cursor. The mouseup recomputes once.
  let columnResizeInFlight = false;
  // Ends whatever gesture is in hand, from outside that gesture's own mouseup.
  // A pointer released outside the frame never delivers that mouseup, and the
  // flag above would then suppress auto-hide for the rest of the session — so
  // the window losing focus, the tab being hidden and the next mousedown all
  // reach the same release. Reset to a no-op by the release it runs.
  let releaseColumnResizeGesture = () => {};

  // Re-plans the auto-hidden set against the current wrap. Returns true when
  // the painted set changed, i.e. when the caller owes the grid a header and
  // a body rendered together.
  function recomputeAutoHiddenColumns() {
    if (columnResizeInFlight) return false;
    const tableWrap = $('#tableWrap');
    if (!tableWrap) return false;
    const wrapWidth = Number.isFinite(tableWrap.clientWidth) ? tableWrap.clientWidth : 0;
    const previousHiddenIds = state.autoHiddenColumnIds;
    const hiddenIds = planAutoHiddenColumns(state.columns, wrapWidth, {
      pinnedIds: state.pinnedColumnIds,
      // The search read-out, the column the rows are ordered by and the one
      // whose width is being stepped: none may be dropped while it is doing
      // that job. See planForcedVisibleColumnIds.
      keepIds: planForcedVisibleColumnIds(
        state.sort,
        state.search.keywords,
        findKeyboardResizeColumnId(typeof document === 'undefined' ? null : document.activeElement),
      ),
      previousHiddenIds,
    });
    const unchanged =
      hiddenIds.length === previousHiddenIds.size && hiddenIds.every((id) => previousHiddenIds.has(id));
    if (unchanged) return false;
    state.autoHiddenColumnIds = new Set(hiddenIds);
    return true;
  }

  function syncGridControlTabStops(totalRowCount, visibleRowCount) {
    const tabIndex = getGridControlTabIndex(totalRowCount, visibleRowCount);
    const thead = $('#thead');
    if (!thead) return;
    for (const control of $all('th[data-col-id], .col-resizer', thead)) {
      control.tabIndex = tabIndex;
    }
  }

  function renderHeader() {
    const thead = $('#thead');
    const activeElement = document.activeElement;
    const activeHeader = activeElement && activeElement.closest
      ? activeElement.closest('th[data-col-id]')
      : null;
    const focusColId = state.pendingHeaderFocusId || (activeHeader ? activeHeader.dataset.colId : null);
    // A width change can auto-hide a column and rebuild the row while the
    // reader is still holding Arrow on a separator: focus belongs back on
    // that separator, not on the header around it.
    const focusResizer =
      state.pendingHeaderFocusResizer === true ||
      !!(activeElement && activeElement.classList && activeElement.classList.contains('col-resizer'));
    state.pendingHeaderFocusId = null;
    state.pendingHeaderFocusResizer = false;
    thead.textContent = '';
    const gridControlTabIndex = getGridControlTabIndex(
      state.rows.length,
      state.filteredRows.length,
    );

    const visibleCols = getEffectiveVisibleColumns();

    const tr = document.createElement('tr');
    tr.className = 'title-row';
    tr.setAttribute('role', 'row');
    let dragSrcColId = null;
    for (const c of visibleCols) {
      c.width = clampColumnWidth(c.width);
      const th = document.createElement('th');
      th.style.width = c.width + 'px';
      th.dataset.colId = c.id;
      th.draggable = true;
      th.scope = 'col';
      th.tabIndex = gridControlTabIndex;
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-label', c.label);
      const isVisualOnly = isVisualOnlyColumn(c.id);
      if (isVisualOnly) {
        th.className = 'waterfall-header';
        th.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');
        th.title = c.id === 'match'
          ? c.label + ': search and selection state; Alt+Left/Right Arrow to reorder'
          : c.label + ': visual timing column; Alt+Left/Right Arrow to reorder';
      } else {
        th.className = 'sortable-header';
        th.setAttribute('aria-haspopup', 'dialog');
        th.setAttribute('aria-controls', 'columnFilterPopup');
        th.setAttribute('aria-expanded', 'false');
        th.setAttribute('aria-keyshortcuts', 'Enter Space Alt+ArrowLeft Alt+ArrowRight Shift+F10');
        const sortState = getAriaSortValue(state.sort, c.id);
        th.setAttribute('aria-sort', sortState);
        th.title = c.label + ': Enter or Space to sort; Alt+Left/Right Arrow to reorder; context menu to filter';
      }
      // Only a gutter-narrow Match hides its label; a v3 64px Match keeps it.
      th.classList.toggle('gutter-header', c.id === 'match' && c.width < 44);

      const label = document.createElement('span');
      label.className = 'column-header-label';
      label.textContent = c.label;
      th.appendChild(label);
      if (!isVisualOnly) {
        const sortState = getAriaSortValue(state.sort, c.id);
        if (sortState !== 'none') {
          const indicator = document.createElement('span');
          indicator.className = 'sort-indicator';
          indicator.setAttribute('aria-hidden', 'true');
          indicator.textContent = sortState === 'ascending' ? ' ▲' : ' ▼';
          th.appendChild(indicator);
          // The stylesheet parks the arrow at the right edge and gives the
          // label a gutter to shrink into. Inline, the arrow was simply the
          // last thing in the line box and the ellipsis ate it: a column no
          // wider than its own label announced its sort to a screen reader
          // and showed nothing at all on screen.
          th.classList.add('is-sorted');
        }
      }

      const sortColumn = () => {
        toggleSort(c.id);
        state.pendingHeaderFocusId = c.id;
        const nextState = state.sort.colId === c.id
          ? (state.sort.direction === 'asc' ? 'ascending' : 'descending')
          : 'none';
        setStatus(c.label + ' sort ' + nextState);
        render();
      };
      if (!isVisualOnly) {
        th.addEventListener('click', (event) => {
          if (event.target && event.target.classList && event.target.classList.contains('col-resizer')) return;
          sortColumn();
        });
      }
      th.addEventListener('keydown', (event) => {
        if (event.target && event.target.classList && event.target.classList.contains('col-resizer')) return;
        if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          event.stopPropagation();
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          if (moveColumnByKeyboard(c.id, direction)) {
            state.pendingHeaderFocusId = c.id;
            setStatus(c.label + ' column moved ' + (direction < 0 ? 'left' : 'right'));
            render();
          }
          return;
        }
        if (!isVisualOnly && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          sortColumn();
        }
      });

      th.addEventListener('dragstart', (event) => {
        dragSrcColId = c.id;
        th.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', c.id);
      });
      th.addEventListener('dragend', () => {
        th.classList.remove('dragging');
        tr.querySelectorAll('th').forEach((element) => {
          element.classList.remove('drag-over-left', 'drag-over-right');
        });
      });
      th.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (!dragSrcColId || dragSrcColId === c.id) return;
        const rect = th.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        th.classList.toggle('drag-over-left', event.clientX < midX);
        th.classList.toggle('drag-over-right', event.clientX >= midX);
      });
      th.addEventListener('dragleave', () => {
        th.classList.remove('drag-over-left', 'drag-over-right');
      });
      th.addEventListener('drop', (event) => {
        event.preventDefault();
        th.classList.remove('drag-over-left', 'drag-over-right');
        const fromId = event.dataTransfer.getData('text/plain');
        if (fromId && fromId !== c.id) {
          moveColumn(fromId, c.id);
          render();
        }
      });

      const columnResizer = document.createElement('div');
      columnResizer.className = 'col-resizer';
      columnResizer.tabIndex = gridControlTabIndex;
      columnResizer.draggable = false;
      columnResizer.setAttribute('role', 'separator');
      columnResizer.setAttribute('aria-orientation', 'vertical');
      columnResizer.setAttribute('aria-label', 'Resize ' + c.label + ' column');
      columnResizer.setAttribute('aria-controls', 'grid');
      columnResizer.setAttribute('aria-valuemin', String(MIN_COL_WIDTH));
      columnResizer.setAttribute('aria-valuemax', String(MAX_COL_WIDTH));
      columnResizer.setAttribute('aria-valuenow', String(c.width));
      columnResizer.setAttribute('aria-valuetext', c.label + ' column width ' + c.width + ' pixels');
      columnResizer.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight');
      columnResizer.title = 'Resize ' + c.label + ' column with Left/Right Arrow; hold Shift for a larger step';

      const applyColumnWidth = (newWidth) => {
        c.width = clampColumnWidth(newWidth);
        th.style.width = c.width + 'px';
        if (c.id === 'match') th.classList.toggle('gutter-header', c.width < 44);
        columnResizer.setAttribute('aria-valuenow', String(c.width));
        columnResizer.setAttribute('aria-valuetext', c.label + ' column width ' + c.width + ' pixels');
        applyElasticColumnWidth();
      };
      columnResizer.addEventListener('keydown', (event) => {
        const newWidth = adjustColumnWidth(c.width, event.key, event.shiftKey);
        if (newWidth == null) return;
        event.preventDefault();
        event.stopPropagation();
        applyColumnWidth(newWidth);
        saveColumnPrefs();
        setStatus(c.label + ' column width ' + c.width + ' pixels');
        // A keyboard step can push the stored sum past the wrap: re-plan and,
        // when the painted set changed, rebuild both rows and hand focus back
        // to this separator so the next Arrow keeps resizing the same column.
        if (recomputeAutoHiddenColumns()) {
          state.pendingHeaderFocusId = c.id;
          state.pendingHeaderFocusResizer = true;
          render();
        }
      });
      columnResizer.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      columnResizer.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        // The elastic column renders wider than its stored width (see
        // applyElasticColumnWidth). Widening starts from what the user sees;
        // narrowing inside that surplus must not inflate the stored width.
        const startStored = clampColumnWidth(c.width);
        const startRendered = th.offsetWidth;
        // A previous gesture whose mouseup landed outside the frame is still
        // holding the flag; it ends here rather than latching past this one.
        releaseColumnResizeGesture();
        columnResizeInFlight = true;
        const handleMouseMove = (moveEvent) => {
          const delta = moveEvent.clientX - startX;
          applyColumnWidth(delta >= 0 ? startRendered + delta : Math.min(startStored, startRendered + delta));
        };
        const handleMouseUp = () => {
          releaseColumnResizeGesture = () => {};
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          window.removeEventListener('blur', handleMouseUp);
          document.removeEventListener('visibilitychange', handleMouseUp);
          columnResizeInFlight = false;
          saveColumnPrefs();
          // Suppressed for the whole gesture, the fit is re-planned once here.
          if (recomputeAutoHiddenColumns()) render();
        };
        releaseColumnResizeGesture = handleMouseUp;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        // The releases the gesture cannot deliver itself: the pointer went up
        // somewhere this document never hears about.
        window.addEventListener('blur', handleMouseUp);
        document.addEventListener('visibilitychange', handleMouseUp);
      });
      th.appendChild(columnResizer);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    applyElasticColumnWidth();

    if (focusColId) {
      const headerToFocus = thead.querySelector('th[data-col-id="' + focusColId + '"]');
      const resizerToFocus = headerToFocus && focusResizer ? headerToFocus.querySelector('.col-resizer') : null;
      // The column that held the focus is gone — the auto-hide dropped it, or
      // the reader unticked it. A neighbouring header takes the focus so the
      // reader keeps their place in the row; the neighbour's separator does
      // not, because it would resize a column they never asked about.
      const fallbackId = headerToFocus
        ? null
        : planHeaderFocusFallbackId(state.columns, focusColId, visibleCols.map((column) => column.id));
      const fallbackHeader = fallbackId
        ? thead.querySelector('th[data-col-id="' + fallbackId + '"]')
        : null;
      const controlToFocus = resizerToFocus || headerToFocus || fallbackHeader;
      if (controlToFocus) controlToFocus.focus({ preventScroll: true });
    }
  }

  // The stored column widths (COL_PREF_KEY / DEFAULT_COLUMNS) are the source
  // of truth for resizing and always sum to the grid's minimum width. When
  // .tableWrap is wider than that sum the surplus is lent to Path's rendered
  // width (or the last visible column's when Path is hidden) so the header
  // band, zebra and row rules reach the right edge instead of stopping at
  // the column sum. Narrower than the sum, Path gives width back down to
  // ELASTIC_PATH_MIN_WIDTH before the grid scrolls — the same elasticity in
  // the other direction, and the reason auto-hide drops so few columns.
  // Only style widths change and only when the value differs, so the
  // ResizeObserver that re-runs this never triggers itself.
  function applyElasticColumnWidth() {
    const grid = $('#grid');
    const thead = $('#thead');
    const tableWrap = $('#tableWrap');
    if (!grid || !thead || !tableWrap) return;
    const visibleCols = getEffectiveVisibleColumns();
    const totalWidth = visibleCols.reduce((sum, c) => sum + clampColumnWidth(c.width), 0);
    const wrapWidth = Number.isFinite(tableWrap.clientWidth) ? tableWrap.clientWidth : 0;
    const surplus = Math.max(0, wrapWidth - totalWidth);
    const elasticCol = visibleCols.find((c) => c.id === 'path') || visibleCols[visibleCols.length - 1];
    // Only Path has a floor to give from; when it is hidden the grid scrolls
    // exactly as it did before, rather than squeezing whatever sits last.
    const pathCol = visibleCols.find((c) => c.id === 'path');
    const deficit = pathCol && wrapWidth > 0 ? Math.max(0, totalWidth - wrapWidth) : 0;
    const shrink = pathCol
      ? Math.min(deficit, clampColumnWidth(pathCol.width) - minRenderedColumnWidth(pathCol))
      : 0;
    const gridWidth = (totalWidth + surplus - shrink) + 'px';
    if (grid.style.width !== gridWidth) grid.style.width = gridWidth;
    for (const c of visibleCols) {
      const th = thead.querySelector('th[data-col-id="' + c.id + '"]');
      if (!th) continue;
      const elasticDelta = c === elasticCol ? surplus : 0;
      const shrinkDelta = c === pathCol ? shrink : 0;
      const renderedWidth = (clampColumnWidth(c.width) + elasticDelta - shrinkDelta) + 'px';
      if (th.style.width !== renderedWidth) th.style.width = renderedWidth;
    }
  }

  // Update search match state without triggering re-render.
  // Called from renderBody() so new rows are included in search.
  function refreshSearchMatches() {
    const srch = state.search;
    const activeKws = srch.keywords.filter((kw) => kw.query && kw.query.trim());
    const previousMatches = srch.matches;
    const previousIndex = srch.currentIndex;
    if (activeKws.length === 0) {
      srch.rowColors.clear();
      srch.rowKeywords.clear();
      srch.matches = [];
      srch.currentIndex = -1;
      srch.perKeyword.clear();
      return;
    }
    srch.rowColors.clear();
    srch.rowKeywords.clear();
    const sorted = getSortedRows(state.filteredRows);
    const matchSet = new Set();
    // Build per-keyword match lists while retaining each navigated row when it still matches.
    for (let ki = 0; ki < srch.keywords.length; ki++) {
      const kw = srch.keywords[ki];
      if (!kw.query || !kw.query.trim()) {
        srch.perKeyword.set(ki, { matches: [], currentIndex: -1 });
        continue;
      }
      if (srch.options.regex && compileSearchQuery(kw.query, srch.options).error) {
        srch.perKeyword.set(ki, { matches: [], currentIndex: -1 });
        continue;
      }
      const kwMatches = [];
      for (const row of sorted) {
        if (deepSearchMatch(row, kw.query, srch.scope, srch.options)) {
          matchSet.add(row);
          if (!srch.rowColors.has(row)) srch.rowColors.set(row, new Set());
          if (!srch.rowKeywords.has(row)) srch.rowKeywords.set(row, new Set());
          srch.rowColors.get(row).add(kw.colorIdx);
          srch.rowKeywords.get(row).add(ki);
          kwMatches.push(row);
        }
      }
      const previousKeyword = srch.perKeyword.get(ki);
      const currentIndex = preserveMatchingRowIndex(
        previousKeyword ? previousKeyword.matches : [],
        previousKeyword ? previousKeyword.currentIndex : -1,
        kwMatches,
      );
      srch.perKeyword.set(ki, { matches: kwMatches, currentIndex });
    }
    // Remove stale per-keyword entries
    for (const key of srch.perKeyword.keys()) {
      if (key >= srch.keywords.length) srch.perKeyword.delete(key);
    }
    srch.matches = sorted.filter((row) => matchSet.has(row));
    srch.currentIndex = preserveMatchingRowIndex(previousMatches, previousIndex, srch.matches);
  }

  function updateSampleGuideAvailability(visibleRowCount) {
    const guideButton = $('#sampleGuideBtn');
    if (!guideButton) return;
    const available =
      state.sampleCaptureActive && Number.isFinite(visibleRowCount) && visibleRowCount > 0;
    guideButton.hidden = !available;
    guideButton.disabled = !available;
    if (!available) {
      guideButton.setAttribute('aria-expanded', 'false');
      const dialog = $('#sampleGuideDialog');
      if (dialog && dialog.open) closeSampleGuideDialog(false);
    }
    updateSampleCaptureExitAvailability();
  }

  function updateSampleCaptureStatus() {
    const status = $('#sampleCaptureStatus');
    const active = state.sampleCaptureActive;
    if (status) {
      status.hidden = !active;
      status.textContent = active ? 'Local sample · live paused' : '';
      status.title = active
        ? 'Local synthetic requests are loaded. No network traffic was sent. Exiting restores the previous recording state and column filters.'
        : '';
    }
    updateSampleGuideAvailability(state.filteredRows.length);
  }

  function updateRecordState(announceStatus) {
    const pauseBtn = $('#pauseBtn');
    const topbar = $('.topbar');
    if (!pauseBtn || !topbar) return;
    pauseBtn.innerHTML = state.paused ? PLAY_ICON_SVG : PAUSE_ICON_SVG;
    pauseBtn.disabled = state.sampleCaptureActive;
    const actionLabel = state.sampleCaptureActive
      ? 'Live recording is paused while local sample capture is active'
      : state.paused
        ? 'Resume recording'
        : 'Pause recording';
    pauseBtn.title = actionLabel;
    pauseBtn.setAttribute('aria-label', actionLabel);
    if (state.paused) {
      topbar.classList.add('paused');
      topbar.classList.remove('recording');
    } else {
      topbar.classList.add('recording');
      topbar.classList.remove('paused');
    }
    updateSampleCaptureStatus();
    if (announceStatus !== false) setStatus(state.paused ? 'Paused' : 'Recording...');
  }

  function enterSampleCaptureMode() {
    const transition = planSampleCaptureTransition({
      active: state.sampleCaptureActive,
      paused: state.paused,
      previousPaused: state.sampleCapturePreviousPaused,
      rowCount: state.rows.length,
    }, 'enter');
    if (!transition.changed) return false;
    const filterTransition = planSampleCaptureFilterTransition(
      state.columnFilterRules,
      state.sampleCapturePreviousColumnFilterRules,
      'enter',
    );
    state.sampleCaptureActive = transition.active;
    state.paused = transition.paused;
    state.sampleCapturePreviousPaused = transition.previousPaused;
    state.columnFilterRules = filterTransition.columnFilterRules;
    state.sampleCapturePreviousColumnFilterRules = filterTransition.previousColumnFilterRules;
    updateRecordState(false);
    return true;
  }

  function exitSampleCaptureMode() {
    const transition = planSampleCaptureTransition({
      active: state.sampleCaptureActive,
      paused: state.paused,
      previousPaused: state.sampleCapturePreviousPaused,
      rowCount: state.rows.length,
    }, 'exit');
    if (!transition.changed) return false;
    closeSampleGuideDialog(false);
    const filterTransition = planSampleCaptureFilterTransition(
      state.columnFilterRules,
      state.sampleCapturePreviousColumnFilterRules,
      'exit',
    );
    state.sampleCaptureActive = transition.active;
    state.paused = transition.paused;
    state.sampleCapturePreviousPaused = transition.previousPaused;
    state.columnFilterRules = filterTransition.columnFilterRules;
    state.sampleCapturePreviousColumnFilterRules = filterTransition.previousColumnFilterRules;
    updateRecordState(false);
    return true;
  }

  function isFocusInsideEmptyState() {
    const emptyState = document.getElementById('empty-state-msg');
    return !!emptyState && !!document.activeElement && emptyState.contains(document.activeElement);
  }

  function restoreFocusAfterEmptyStateChange(shouldRestore) {
    if (!shouldRestore) return;
    const tbody = $('#tbody');
    const target = (tbody && tbody.querySelector('tr[tabindex="0"]')) || $('#filterBtn');
    if (target && target.focus) target.focus({ preventScroll: true });
  }

  function activateSampleCapture() {
    commitPendingLiveRows();
    if (state.automaticResponsePrefetchScheduler) {
      state.automaticResponsePrefetchScheduler.resetFailureSummary();
    }
    disposeClearUndoSnapshot('sample');
    if (!enterSampleCaptureMode()) {
      renderBody();
      const tbody = $('#tbody');
      const firstVisibleRow = tbody ? tbody.querySelector('tr[tabindex="0"]') : null;
      const fallbackControl = $('#filterBtn');
      if (firstVisibleRow) firstVisibleRow.focus({ preventScroll: true });
      else if (fallbackControl) fallbackControl.focus();
      setStatus('Local sample capture was not added because captured requests are already present.');
      return false;
    }

    const rows = createSampleCaptureRequests(SAMPLE_CAPTURE_BASE_TIMESTAMP).map((request) =>
      buildRowFromRequest(request),
    );
    const retainedRows = addRowsWithRetention(rows, 'sample');
    renderBody();
    if (retainedRows[0]) selectRow(retainedRows[0], null, true);
    setStatus(
      'Local sample capture: 3 synthetic requests loaded. No network traffic was sent. ' +
        (state.sampleCapturePreviousPaused
          ? 'Recording remains paused; Clear removes the sample.'
          : 'Live recording is paused; Clear removes the sample and resumes capture.'),
    );
    return true;
  }

  let lastEmptyStateRowCount = 0;

  function updateEmptyState(visibleRowCount) {
    const tableWrap = $('#tableWrap');
    if (!tableWrap) return;
    lastEmptyStateRowCount = visibleRowCount;
    const mode = getEmptyStateMode(state.rows.length, visibleRowCount);
    syncGridControlTabStops(state.rows.length, visibleRowCount);
    const content = $('#content');
    if (content) content.classList.toggle('capture-empty', mode === 'capture');
    updateSampleGuideAvailability(visibleRowCount);
    let emptyState = document.getElementById('empty-state-msg');
    if (mode === 'hidden') {
      if (emptyState) emptyState.style.display = 'none';
      return;
    }
    if (!emptyState) {
      emptyState = document.createElement('div');
      emptyState.id = 'empty-state-msg';
      emptyState.className = 'empty-state';
      tableWrap.appendChild(emptyState);
    }
    const renderKey = mode + ':' + (state.paused ? 'paused' : 'recording') + ':' + activeLanguage;
    if (emptyState.dataset.renderKey !== renderKey) {
      emptyState.textContent = '';
      emptyState.dataset.renderKey = renderKey;
      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      const title = document.createElement('h2');
      title.className = 'empty-state-title';
      const description = document.createElement('div');
      description.id = 'empty-state-description';
      description.className = 'empty-state-description';
      if (mode === 'filtered') {
        icon.textContent = '🔎';
        title.textContent = uiText('emptyFilteredTitle');
        description.textContent = uiText('emptyFilteredDesc');
      } else {
        icon.textContent = '📡';
        title.textContent = state.paused
          ? uiText('emptyCapturePausedTitle')
          : uiText('emptyCaptureRecordingTitle');
        // The mirror tab captures nothing itself, and its local sample rows
        // would collide with the DevTools session's row ids over the port.
        description.textContent = getMirrorViewParams(window.location ? window.location.search : '')
          .viewerMode
          ? uiText('emptyCaptureViewerDesc')
          : state.paused
            ? uiText('emptyCapturePausedDesc')
            : uiText('emptyCaptureRecordingDesc');
      }
      emptyState.appendChild(icon);
      emptyState.appendChild(title);
      emptyState.appendChild(description);
      if (mode === 'filtered') {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'empty-state-action';
        action.textContent = uiText('emptyFilteredAction');
        action.setAttribute('aria-describedby', description.id);
        action.addEventListener('click', clearColumnFilters);
        emptyState.appendChild(action);
      }
      if (mode === 'capture' && !getMirrorViewParams(window.location ? window.location.search : '').viewerMode) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'empty-state-action';
        action.textContent = uiText('emptyCaptureAction');
        action.setAttribute('aria-describedby', description.id);
        action.addEventListener('click', activateSampleCapture);
        emptyState.appendChild(action);
      }
    }
    emptyState.style.display = 'flex';
  }

  // A rendered empty state caches its strings behind renderKey; a language
  // change must re-render it in place because nothing else may repaint while
  // the grid stays empty.
  function refreshEmptyStateLanguage() {
    if (typeof document.getElementById !== 'function') return;
    if (!document.getElementById('empty-state-msg')) return;
    updateEmptyState(lastEmptyStateRowCount);
  }

  function updateRetentionStatus() {
    const retention = state.retention;
    const presentation = getRetentionPresentation(retention.requestLimit, retention.unlimited);
    const detailParts = [
      'Retention: ' + presentation.policyLabel,
      'body cache ' + fmtBytes(retention.responseCacheBytes) + ' / ' + fmtBytes(MAX_RESPONSE_CACHE_BYTES),
      'evicted requests ' + retention.evictedRequests,
      'bodies omitted ' + retention.omittedBodies,
      'bodies evicted ' + retention.evictedBodies,
      'preview-truncated ' + retention.truncatedBodies,
    ];
    if (retention.settingWarning) detailParts.push(retention.settingWarning);
    // Visible text stays short; the full bookkeeping lives in the tooltip.
    // Retention events themselves are announced via queueRetentionSummary.
    // The current limit lives in the Settings dialog and this tooltip, so
    // the status bar shows only what changes on its own: the body cache
    // and any warning.
    const visibleParts = [
      'cache ' + fmtBytes(retention.responseCacheBytes) + ' / ' + fmtBytes(MAX_RESPONSE_CACHE_BYTES),
    ];
    if (retention.settingWarning) visibleParts.push(retention.settingWarning);
    const status = $('#retentionStatus');
    if (status) {
      status.textContent = visibleParts.join(' · ');
      status.title = detailParts.join('. ');
    }
  }

  // Rows actually on screen: column filters first, then the search when it is
  // narrowing the grid. Sorting cannot change the count, so it is skipped.
  function countVisibleRows() {
    return planVisibleSearchRows(
      state.filteredRows,
      state.search.rowColors,
      state.search.matchesOnly,
      hasActiveSearchKeywords(state.search.keywords),
    ).length;
  }

  function updateTableSummary(visibleRowCount, visibleBytes) {
    if (Number.isFinite(visibleBytes)) state.visibleBytes = visibleBytes;
    const activeFilterCount = countActiveColumnFilters(state.columnFilterRules);
    const summary = planRequestCountSummary({
      shownCount: Number.isFinite(visibleRowCount) ? visibleRowCount : countVisibleRows(),
      totalCount: state.rows.length,
      matchedCount: state.search.rowColors.size,
      hasActiveSearch: hasActiveSearchKeywords(state.search.keywords),
      matchesOnly: state.search.matchesOnly,
      activeFilterCount,
    });
    const requestCountText = summary.text;
    const counter = $('#counter');
    if (counter) counter.textContent = requestCountText;
    queueRequestCountAnnouncement(summary.accessibleText);
    const filterButton = $('#filterBtn');
    if (filterButton) {
      filterButton.textContent =
        activeFilterCount > 0 ? '⚙️ Filters (' + activeFilterCount + ')' : '⚙️ Filters';
      filterButton.setAttribute(
        'aria-label',
        activeFilterCount > 0
          ? 'Column Filters, ' + activeFilterCount + ' active'
          : 'Column Filters, no active filters',
      );
    }
    const totalSizeEl = $('#totalSize');
    if (totalSizeEl) {
      totalSizeEl.textContent = state.visibleBytes > 0 ? fmtBytes(state.visibleBytes) : '';
      totalSizeEl.title =
        state.visibleBytes > 0 ? fmtBytes(state.visibleBytes) + ' transferred across visible requests' : '';
    }
    const selectedSizeEl = $('#selectedSize');
    if (selectedSizeEl) {
      if (state.selectedRows.size > 0) {
        let selectedBytes = 0;
        for (const row of state.selectedRows) selectedBytes += row.size || 0;
        selectedSizeEl.textContent = state.selectedRows.size + ' selected / ' + fmtBytes(selectedBytes);
      } else {
        selectedSizeEl.textContent = '';
      }
    }
    const srch = state.search;
    const activeKeywords = srch.keywords.filter((keyword) => keyword.query && keyword.query.trim());
    const countEl = $('#searchCount');
    if (countEl) {
      if (srch.matches.length === 0 && activeKeywords.length > 0) {
        countEl.textContent = 'No matches';
        countEl.style.color = 'var(--status-5xx-text)';
      } else if (srch.matches.length > 0 && activeKeywords.length > 0) {
        countEl.textContent = srch.matches.length + ' matches';
        countEl.style.color = '';
      } else {
        countEl.textContent = '';
        countEl.style.color = '';
      }
      const unsearchedBodies = srch.scope.resBody && activeKeywords.length > 0
        ? countUnsearchedResponseBodies(state.filteredRows)
        : 0;
      if (unsearchedBodies > 0) {
        countEl.textContent += ' · ' + unsearchedBodies + ' bodies not searched';
      }
      queueSearchCountAnnouncement(countEl.textContent);
    }
    const statsEl = $('#statsSummary');
    if (statsEl) {
      if (state.filteredRows.length > 0) {
        const stats = computeStats(state.filteredRows);
        renderStatsSummary(statsEl, stats, inspectFirstStatusClassRequest);
      } else {
        clearStatsSummary(statsEl);
      }
    }
    // Every render and streaming path funnels through here, so the domain
    // summary panel refreshes without touching the incremental fast path.
    if (state.syncDomainSummary) state.syncDomainSummary();
  }

  function appendIncrementalRows(liveRows) {
    const tbody = $('#tbody');
    if (!tbody) return false;
    const restoreEmptyStateFocus = isFocusInsideEmptyState();
    // When Waterfall is painted every new row changes the shared time range, so
    // pre-existing bars would show stale geometry. Fall through to a full renderBody().
    // Effective visibility, not the stored flag: a Waterfall the reader enabled
    // and the wrap then dropped paints no bars at all, and must not cost the
    // incremental path.
    const waterfallCol = state.columns.find((c) => c.id === 'waterfall');
    if (isColumnEffectivelyVisible(waterfallCol)) return false;
    const activeFilterCount = countActiveColumnFilters(state.columnFilterRules);
    if (
      !isIncrementalAppendEligible(
        state.sort,
        activeFilterCount,
        state.search.keywords,
        state.renderedActiveFilterCount,
      )
    ) {
      return false;
    }
    // This runs once per animation frame while traffic streams; a direct
    // sibling walk skips the selector engine and the intermediate array
    // that a 20k-row query would otherwise pay every frame. The full walk
    // itself stays: it is the duplicate guard for a competing render that
    // committed first.
    const renderedRowIds = [];
    for (let element = tbody.firstElementChild; element; element = element.nextElementSibling) {
      if (element.dataset && element.dataset.rowId != null) renderedRowIds.push(element.dataset.rowId);
    }
    const rowsToAppend = getIncrementalAppendBatch(liveRows, renderedRowIds);
    refreshSearchMatches();
    if (rowsToAppend.length === 0) {
      updateEmptyState(state.filteredRows.length);
      updateTableSummary(countVisibleRows());
      restoreFocusAfterEmptyStateChange(restoreEmptyStateFocus);
      return true;
    }
    const filteredSet = new Set(state.filteredRows);
    for (const row of rowsToAppend) {
      if (!filteredSet.has(row)) {
        state.filteredRows.push(row);
        filteredSet.add(row);
      }
    }
    const fragment = document.createDocumentFragment();
    const currentTabStop = tbody.querySelector(`tr[tabindex="0"]`);
    const tabStopRow = currentTabStop
      ? null
      : rowsToAppend.includes(state.focusedRow)
        ? state.focusedRow
        : rowsToAppend.includes(state.selectedRow)
          ? state.selectedRow
          : rowsToAppend[0];
    for (const row of rowsToAppend) {
      fragment.appendChild(createTableRow(row, (event) => selectRow(row, event), row === tabStopRow));
    }
    tbody.appendChild(fragment);
    state.visibleBytes += rowsToAppend.reduce((total, row) => total + (row.size || 0), 0);
    updateEmptyState(state.filteredRows.length);
    updateTableSummary(countVisibleRows());
    restoreFocusAfterEmptyStateChange(restoreEmptyStateFocus);
    return true;
  }

  function replaceRenderedRowStates(rows) {
    const tbody = $('#tbody');
    if (!tbody) return false;
    const previousTabStop = tbody.querySelector('tr[tabindex="0"]');
    const activeRow =
      document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('tr[data-row-id]')
        : null;
    const focusRowId = state.pendingRowFocusId || (activeRow ? activeRow.dataset.rowId : null);
    state.pendingRowFocusId = null;
    const affectedRows = Array.from(new Set(rows.filter(Boolean)));
    // Clicking away from a large multi-selection routes every previously
    // selected row through here; per-row tbody.querySelector plus
    // filteredRows.includes made that quadratic. One DOM pass builds an
    // id→element map (kept current as rows are replaced) and one Set
    // answers membership.
    const rowElementById = new Map();
    for (const element of $all('tr[data-row-id]', tbody)) {
      rowElementById.set(element.dataset.rowId, element);
    }
    const filteredRowSet = new Set(state.filteredRows);
    const tabStopRow = filteredRowSet.has(state.focusedRow)
      ? state.focusedRow
      : filteredRowSet.has(state.selectedRow)
        ? state.selectedRow
        : state.filteredRows[0];
    for (const row of affectedRows) {
      const renderedRow = rowElementById.get(String(row.id));
      if (!renderedRow) {
        if (filteredRowSet.has(row)) return false;
        continue;
      }
      const replacement = createTableRow(row, (event) => selectRow(row, event), row === tabStopRow);
      renderedRow.replaceWith(replacement);
      rowElementById.set(String(row.id), replacement);
    }
    const nextTabStop = (tabStopRow && rowElementById.get(String(tabStopRow.id))) || null;
    if (previousTabStop && previousTabStop !== nextTabStop && previousTabStop.isConnected !== false) {
      previousTabStop.tabIndex = -1;
    }
    if (nextTabStop) {
      nextTabStop.tabIndex = 0;
      currentRowTabStop = nextTabStop;
    }
    if (focusRowId) {
      const rowToFocus = rowElementById.get(String(focusRowId));
      if (rowToFocus) rowToFocus.focus({ preventScroll: true });
    }
    updateTableSummary(countVisibleRows());
    return true;
  }

  function renderBody() {
    const restoreEmptyStateFocus = isFocusInsideEmptyState();
    filterRows();
    state.renderedActiveFilterCount = countActiveColumnFilters(state.columnFilterRules);
    refreshSearchMatches();
    const rows = planVisibleSearchRows(
      getSortedRows(state.filteredRows),
      state.search.rowColors,
      state.search.matchesOnly,
      hasActiveSearchKeywords(state.search.keywords),
    );
    const visibleBytes = rows.reduce((total, row) => total + (row.size || 0), 0);
    updateEmptyState(rows.length);
    // Cache waterfall range once per render — createTableRow reads state.waterfallRange
    // in O(1) instead of scanning all rows on every call (prevents O(n²) render).
    const waterfallCol = state.columns.find((c) => c.id === 'waterfall');
    state.waterfallRange = isColumnEffectivelyVisible(waterfallCol) ? computeWaterfallRange(rows) : null;
    const tbody = $('#tbody');
    const activeRow =
      document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('tr[data-row-id]')
        : null;
    const focusRowId = state.pendingRowFocusId || (activeRow ? activeRow.dataset.rowId : null);
    state.pendingRowFocusId = null;
    if (!tbody) {
      updateTableSummary(rows.length, visibleBytes);
      restoreFocusAfterEmptyStateChange(restoreEmptyStateFocus);
      return;
    }
    const fragment = document.createDocumentFragment();
    tbody.textContent = '';
    const tabStopRow = rows.includes(state.focusedRow)
      ? state.focusedRow
      : rows.includes(state.selectedRow)
        ? state.selectedRow
        : rows[0];
    for (const row of rows) {
      fragment.appendChild(createTableRow(row, (event) => selectRow(row, event), row === tabStopRow));
    }
    tbody.appendChild(fragment);
    if (focusRowId) {
      const requestedRow = tbody.querySelector(`tr[data-row-id="${focusRowId}"]`);
      const fallbackRow = tabStopRow ? tbody.querySelector(`tr[data-row-id="${tabStopRow.id}"]`) : null;
      const rowToFocus = requestedRow || fallbackRow;
      if (rowToFocus) rowToFocus.focus({ preventScroll: true });
    }
    updateTableSummary(rows.length, visibleBytes);
    restoreFocusAfterEmptyStateChange(restoreEmptyStateFocus);
  }

  function scrollToSelectedRow() {
    if (!state.selectedRow) return;
    const tableWrap = $('#tableWrap');
    if (!tableWrap) return;
    const selectedTr = tableWrap.querySelector(
      'tr[data-row-id="' + state.selectedRow.id + '"]',
    );
    if (selectedTr) selectedTr.scrollIntoView({ block: 'nearest' });
  }

  function inspectFirstStatusClassRequest(statusClass) {
    const targetRow = findFirstStatusClassRow(getSortedRows(state.filteredRows), statusClass);
    if (!targetRow) return;
    selectRow(targetRow, null, true);
    scrollToSelectedRow();
  }

  function render() {
    recomputeAutoHiddenColumns();
    renderHeader();
    renderBody();
  }

  // Match auto-shows while a keyword exists and steps aside again when the
  // last one is cleared, so a search that moves the painted set has to
  // rebuild the header with the body. A body-only render would paint cells
  // against a header that no longer names the same columns.
  function renderGridAfterSearchChange() {
    if (recomputeAutoHiddenColumns()) renderHeader();
    renderBody();
  }

  // ============================================================
  // Section 13: Detail Panel — Fiddler-style tabbed inspector
  // ============================================================

  // Assigned in init once the main-split sync exists. Showing the pane again
  // must re-clamp its remembered basis against the current window: the sync
  // skips a hidden pane, so close → shrink window → reopen would otherwise
  // leave a stale px basis wider than the window allows.
  let resyncMainSplit = null;
  // Same deferral for the request/response split: its remembered percent can
  // only be applied once the pane has a height.
  let resyncInspectorSplit = null;
  // The collapse toggles' tooltips are composed in JavaScript, so the
  // language switch re-runs their sync instead of a data-i18n-title.
  let refreshInspectorToggleTitles = null;
  // The status text the "closed" notice displaced, restored on reopen.
  let statusBeforeDetailsClose = null;
  // The selection line the reopen wrote, so a later selection can replace it
  // instead of leaving the bar naming a request that is no longer selected.
  let selectionStatusText = null;

  function setDetailsPanelCollapsed(collapsed) {
    const resizer = $('#resizer');
    const details = $('#details');
    if (resizer) resizer.hidden = collapsed;
    if (details) details.hidden = collapsed;
    if (!collapsed && resyncMainSplit) resyncMainSplit();
    if (!collapsed && resyncInspectorSplit) resyncInspectorSplit();
  }

  function showDetailsPanel(selectedRow) {
    setDetailsPanelCollapsed(false);
    // Reopening by selection is the answer to "select a request to reopen",
    // so the notice must not outlive the pane it describes. What replaces it
    // is this row's own summary — replaying the message the notice displaced
    // put a stale line (a split reset, a copy result) back on the bar.
    const statusText = $('#statusText');
    const selectionSummary = selectedRow ? planRowSelectionStatus(selectedRow) : '';
    const summaryLine = selectionSummary
      ? uiTextFormat('statusRowSelected', { request: selectionSummary })
      : '';
    if (statusText && statusBeforeDetailsClose != null) {
      const replacement = summaryLine || statusBeforeDetailsClose;
      const restored = planDetailsReopenStatus(
        statusText.textContent,
        [UI_TEXT.statusDetailsClosed.en, UI_TEXT.statusDetailsClosed.ja],
        replacement,
      );
      if (restored != null) setStatus(restored);
      selectionStatusText = restored === summaryLine && summaryLine ? summaryLine : null;
    } else if (statusText && selectionStatusText && statusText.textContent === selectionStatusText) {
      // That line names one request. The selection has moved, so it follows
      // the selection rather than going stale on the row it still names.
      setStatus(summaryLine);
      selectionStatusText = summaryLine || null;
    }
    statusBeforeDetailsClose = null;
  }

  function closeDetailsPanel() {
    setDetailsPanelCollapsed(true);
    const tbody = $('#tbody');
    const selectedRow = state.selectedRow
      ? tbody && tbody.querySelector('tr[data-row-id="' + state.selectedRow.id + '"]')
      : null;
    const rowFocusTarget = selectedRow || (tbody && tbody.querySelector('tr[tabindex="0"]'));
    const focusTarget = rowFocusTarget || $('#filterBtn');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    if (rowFocusTarget) rowFocusTarget.scrollIntoView({ block: 'nearest' });
    const statusText = $('#statusText');
    statusBeforeDetailsClose = statusText ? statusText.textContent : '';
    setStatus(uiText('statusDetailsClosed'));
  }

  // Before any selection the pane shows one line of guidance instead of two
  // empty tab strips; the inspector halves return with the next selection.
  function setInspectorEmptyState(empty) {
    const inspectorPanels = $('.inspector-panels');
    const emptyState = $('#inspectorEmptyState');
    if (inspectorPanels) {
      inspectorPanels.hidden = empty;
      if (empty) inspectorPanels.setAttribute('aria-hidden', 'true');
      else inspectorPanels.removeAttribute('aria-hidden');
    }
    if (emptyState) emptyState.hidden = !empty;
  }

  function clearDetailsPanel() {
    setDetailsTitleText(uiText('detailsEmptyTitle'));
    resetDetailsHeader();
    resetInspectorTabSignals();
    $all('.tab-pane', $('#details')).forEach((pane) => {
      pane.textContent = '';
    });
    setInspectorEmptyState(true);
  }

  let detailsTitlePath = '';
  let detailsTitleMeasureContext = null;
  const DETAILS_TITLE_HOST_MIN_PX = 80;
  const DETAILS_TITLE_TOOLTIP_MAX_CHARS = 300;

  // #detailsTitle is a flex row, so a bare text node in it is an anonymous
  // flex item that cannot be given overflow or text-overflow: the empty state
  // and the comparison heading overflowed the pane instead of ellipsising.
  // Every plain title goes through an element that can.
  function setDetailsTitleText(text) {
    const title = $('#detailsTitle');
    if (!title) return;
    title.textContent = '';
    const label = document.createElement('span');
    label.className = 'details-title-text';
    label.textContent = text;
    title.appendChild(label);
  }

  // Everything selectRow adds around the title text: the tooltip, the copy
  // button, the summary strip. The comparison writers set their own title
  // text and call this so no stale request identity survives next to it.
  function resetDetailsHeader() {
    detailsTitlePath = '';
    const title = $('#detailsTitle');
    if (title && typeof title.removeAttribute === 'function') title.removeAttribute('title');
    const copyButton = $('#detailsCopyUrlBtn');
    if (copyButton) copyButton.hidden = true;
    const summary = $('#detailsSummary');
    if (summary) {
      summary.hidden = true;
      summary.textContent = '';
    }
  }

  function getDetailsTitleMeasureContext() {
    if (detailsTitleMeasureContext === null) {
      const canvas = document.createElement('canvas');
      const context = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      detailsTitleMeasureContext = context && typeof context.measureText === 'function' ? context : false;
    }
    return detailsTitleMeasureContext || null;
  }

  // Text width in an element's own font. The canvas is shared and re-fonted
  // per call site; without a 2d context the fit stays approximate, never absent.
  function createTitleTextMeasurer(element) {
    const style = getComputedStyle(element);
    const context = getDetailsTitleMeasureContext();
    if (context) {
      context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
      return (text) => context.measureText(text).width;
    }
    const approximateGlyph = (parseFloat(style.fontSize) || 13) * 0.55;
    return (text) => text.length * approximateGlyph;
  }

  // Lays the header out in ONE pass over the container's own width. Three
  // rounds of a measure-and-retry loop each repaired one branch and broke
  // another, because every branch re-read a box the previous branch had just
  // mutated: the host cap was decided from a stale width, and the path's
  // leading ellipsis was inherited from a test taken before the cap existed.
  //
  // The rule the row is spent by, in order:
  //   1. The last path segment is the endpoint name and the most valuable
  //      token, so it is kept whole whenever it fits at all.
  //   2. The host takes every pixel the endpoint leaves; when that is not
  //      enough it is capped and CSS-ellipsises, and its own trailing '…' is
  //      then the row's visible truncation marker.
  //   3. Anything dropped from the path is replaced by a '…' in the path.
  //   4. The operation yields first — the summary strip below already names
  //      it — and the query chip is a count, so it never claims a query.
  //
  // The invariant this holds, asserted as a property across every fixture row
  // and pane width: what the header renders either IS the request's method,
  // host and pathname, or it carries a visible truncation marker. There is no
  // third case, and no width at which the header names a URL that never was.
  function fitDetailsTitle() {
    const title = $('#detailsTitle');
    const pathEl = title && typeof title.querySelector === 'function' ? title.querySelector('.details-title-path') : null;
    if (!pathEl || !detailsTitlePath) return;
    const full = detailsTitlePath;
    const hostEl = title.querySelector('.details-title-host');
    const operationEl = title.querySelector('.details-title-operation');
    // Widest form first, and before any early exit: the host's 60% CSS cap is
    // a guess that ignores what the row has left, so the fit owns the host's
    // width outright. Returning early while the cap still stood left it in
    // place for every row whose pathname happened to fit unshortened.
    if (hostEl) hostEl.style.maxWidth = 'none';
    if (operationEl) operationEl.hidden = false;
    pathEl.textContent = full;
    if (!title.clientWidth) return;

    // The one measurement pass. Everything after it is a write.
    const titleWidth = title.clientWidth;
    let fixedWidth = 0;
    let operationWidth = 0;
    for (let part = title.firstElementChild; part; part = part.nextElementSibling) {
      if (part === pathEl || part === hostEl) continue;
      const rect = part.getBoundingClientRect();
      if (!rect.width) continue;
      const partStyle = getComputedStyle(part);
      const outer = rect.width + (parseFloat(partStyle.marginLeft) || 0) + (parseFloat(partStyle.marginRight) || 0);
      if (part === operationEl) operationWidth = outer;
      else fixedWidth += outer;
    }
    // flex:0 0 auto and max-width:none, so this box IS the host's own text.
    const hostWidth = hostEl ? hostEl.getBoundingClientRect().width : 0;
    const measure = createTitleTextMeasurer(pathEl);
    const slash = full.lastIndexOf('/');
    const endpoint = slash > 0 ? full.slice(slash) : full;
    // What the path must be left if the endpoint is to stay whole: the whole
    // pathname when it is short, and '…' plus the endpoint when it is not.
    // Reserving the bare endpoint instead was one ellipsis-width short, and
    // the path fell through to giving away the endpoint's own head.
    const pathReserve = Math.min(measure(full), measure('…' + endpoint));
    // One pixel of slack absorbs the difference between what the canvas
    // measures and what the layout engine rounds to.
    let pool = Math.max(0, titleWidth - fixedWidth - 1);

    const keepOperation = operationWidth > 0 && hostWidth + pathReserve + operationWidth <= pool;
    if (operationEl) operationEl.hidden = !keepOperation;
    if (keepOperation) pool = Math.max(0, pool - operationWidth);

    let hostUsed = hostWidth;
    if (hostEl) {
      if (hostWidth + pathReserve > pool) {
        hostUsed = Math.min(hostWidth, Math.max(DETAILS_TITLE_HOST_MIN_PX, Math.floor(pool - pathReserve)));
        hostEl.style.maxWidth = hostUsed + 'px';
      } else {
        hostEl.style.maxWidth = 'none';
      }
    }
    const pathText = planTitlePathText(full, pool - hostUsed, measure);
    pathEl.textContent = pathText;
    // A path that has lost content keeps its own '…' whatever the host is
    // doing, and nothing is read back after this write. An earlier round
    // dropped that mark whenever the host happened to CSS-ellipsise, to avoid
    // "…example.te……/edge"; across the whole 400-450px band it instead painted
    // "securepubads.example.test/final-segment.js" — a complete-looking path
    // the request never had. A false URL is not a trade this header can make,
    // and the two marks do not in fact collide: the capped host stops short of
    // its own box, so a gap already separates its bold mark from the path's
    // muted one.
  }

  // The structured header: [METHOD] host/pathname [?N] [· Operation]. The
  // space text node after the badge is invisible in the flex row but keeps
  // the title's textContent reading "METHOD host/path" rather than
  // "METHODhost/path". textContent is not what assistive tech announces: a
  // part the fit hides (the operation at a narrow pane) leaves the
  // accessibility tree while staying in textContent, which is why the
  // summary strip below carries the operation at those widths.
  function renderDetailsTitle(row, titleParts) {
    const title = $('#detailsTitle');
    if (!title) return;
    const url = String(row.url || '');
    const parts = splitUrlForTitle(url);
    title.textContent = '';
    if (row.method) {
      const badge = document.createElement('span');
      badge.className = ('details-title-method ' + methodClassToken(row.method)).trim();
      badge.textContent = row.method;
      title.appendChild(badge);
      title.appendChild(document.createTextNode(' '));
    }
    const host = document.createElement('span');
    host.className = 'details-title-host';
    host.textContent = parts.host;
    title.appendChild(host);
    const pathEl = document.createElement('span');
    pathEl.className = 'details-title-path';
    pathEl.textContent = parts.pathname;
    title.appendChild(pathEl);
    if (parts.queryCount > 0) {
      const query = document.createElement('span');
      query.className = 'details-title-query';
      query.textContent = '?' + parts.queryCount.toLocaleString('en-US');
      query.title =
        parts.queryCount === 1
          ? uiText('detailsQueryCountOne')
          : uiTextFormat('detailsQueryCount', { count: parts.queryCount.toLocaleString('en-US') });
      title.appendChild(query);
    }
    if (row.operation) {
      const operation = document.createElement('span');
      operation.className = 'details-title-operation';
      operation.textContent = '· ' + row.operation;
      title.appendChild(operation);
    }
    // Truncate the tail, never the head: dropping the method and the whole
    // query left the longest URLs — the ones that need the tooltip — with a
    // tooltip that said less than the header above it.
    const fullTitle = titleParts.join(' ');
    title.title =
      fullTitle.length <= DETAILS_TITLE_TOOLTIP_MAX_CHARS
        ? fullTitle
        : fullTitle.slice(0, DETAILS_TITLE_TOOLTIP_MAX_CHARS) + '…';
    detailsTitlePath = parts.pathname;
    const copyButton = $('#detailsCopyUrlBtn');
    if (copyButton) copyButton.hidden = false;
    fitDetailsTitle();
  }

  function renderDetailsSummary(row) {
    const plan = planDetailsSummary(row);
    const strip = $('#detailsSummary');
    if (!strip) return plan;
    strip.textContent = '';
    const addItem = (text, className, titleText) => {
      const item = document.createElement('span');
      item.className = 'details-summary-item ' + className;
      item.textContent = text;
      if (titleText) item.title = titleText;
      strip.appendChild(item);
    };
    if (plan.status) {
      addItem(plan.status.text, 'details-summary-status details-summary-status--' + plan.status.statusClass);
    }
    if (plan.contentType) addItem(plan.contentType, 'details-summary-type');
    if (plan.size) addItem(plan.size, 'details-summary-size');
    if (plan.duration) addItem(plan.duration, 'details-summary-duration');
    if (plan.protocol) addItem(plan.protocol, 'details-summary-protocol');
    if (plan.operation) addItem(plan.operation, 'details-summary-operation');
    if (plan.chip) {
      const chipText = plan.chip.name + ': ' + plan.chip.value;
      addItem(chipText, 'details-summary-chip', chipText);
    }
    strip.hidden = !strip.firstChild;
    return plan;
  }

  function parseCookieHeader(headerValue) {
    if (!headerValue) return [];
    return headerValue.split(';').map((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return { name: part.trim(), value: '' };
      return { name: part.substring(0, idx).trim(), value: part.substring(idx + 1).trim() };
    });
  }

  // One Set-Cookie header is a 'name=value' pair followed by ';'-separated
  // attributes. RFC 6265 forbids a bare ';' inside a cookie value, so the ';'
  // split is safe, and only the FIRST '=' separates the name from the value,
  // so a value carrying '=' of its own (a base64 pad, a JWT) survives whole.
  // Attribute names are case-insensitive and last-wins — the rule a browser
  // applies when one header repeats an attribute.
  //
  // A pair with no '=' at all is a name with an empty value, exactly the
  // reading parseCookieHeader gives the request side, so the two tables agree
  // about what a malformed cookie is rather than one dropping the row and
  // disagreeing with its own tab count.
  //
  // `value` keeps the captured bytes, quotes included, and `unquoted` is the
  // reading beside it: nothing renders or copies the reading, so the cell and
  // the clipboard both hold what the response actually sent.
  function parseSetCookieHeader(headerValue) {
    const parts = String(headerValue == null ? '' : headerValue).split(';');
    const pair = parts[0];
    const eq = pair.indexOf('=');
    const value = eq === -1 ? '' : pair.substring(eq + 1).trim();
    const quoted = value.length >= 2 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"';
    const cookie = {
      name: (eq === -1 ? pair : pair.substring(0, eq)).trim(),
      value,
      quoted,
      unquoted: quoted ? value.substring(1, value.length - 1) : value,
      domain: '',
      path: '',
      expires: '',
      maxAge: '',
      sameSite: '',
      secure: false,
      httpOnly: false,
      partitioned: false,
    };
    for (let i = 1; i < parts.length; i += 1) {
      const attribute = parts[i].trim();
      if (!attribute) continue;
      const split = attribute.indexOf('=');
      const attributeName = (split === -1 ? attribute : attribute.substring(0, split)).trim().toLowerCase();
      const attributeValue = split === -1 ? '' : attribute.substring(split + 1).trim();
      if (attributeName === 'domain') cookie.domain = attributeValue;
      else if (attributeName === 'path') cookie.path = attributeValue;
      else if (attributeName === 'expires') cookie.expires = attributeValue;
      else if (attributeName === 'max-age') cookie.maxAge = attributeValue;
      else if (attributeName === 'samesite') cookie.sameSite = attributeValue;
      else if (attributeName === 'secure') cookie.secure = true;
      else if (attributeName === 'httponly') cookie.httpOnly = true;
      else if (attributeName === 'partitioned') cookie.partitioned = true;
    }
    return cookie;
  }

  // The flags as the wire spells them, in the order a Set-Cookie header
  // conventionally carries them. Protocol tokens, so they read the same in
  // both languages: translating "HttpOnly" would name an attribute no
  // response ever sent.
  function planSetCookieFlags(cookie) {
    const flags = [];
    if (cookie.secure) flags.push('Secure');
    if (cookie.httpOnly) flags.push('HttpOnly');
    if (cookie.sameSite) flags.push('SameSite=' + cookie.sameSite);
    if (cookie.partitioned) flags.push('Partitioned');
    return flags;
  }

  // What the Expires column states, and how much of it is the panel's
  // arithmetic rather than the response's own words.
  //
  // Max-Age wins over Expires, the rule a browser applies — for the COMPUTED
  // expiry. It is a duration, so an absolute instant needs the response `date`
  // header to anchor it. With that anchor the cell files the computed instant
  // UNDER the literal attribute, marked and unselectable, the way the URL row
  // files its decoded reading under the address it decoded — so the panel's
  // reading can never be mistaken for the header's words. Without an anchor,
  // or with a Max-Age that is not an integer, the literal stands alone: a
  // guess is worse than the number the response sent. An Expires sent beside
  // the Max-Age is kept, not dropped: it is part of what the header carried.
  const COOKIE_MAX_TIME_VALUE = 8.64e15;

  function planCookieExpiry(cookie, responseDate) {
    const maxAge = String((cookie && cookie.maxAge) || '').trim();
    // A date Date.parse rejects is still what the response sent, so the raw
    // string is what the cell states — never an 'Invalid Date' no header
    // carried.
    const expires = String((cookie && cookie.expires) || '').trim();
    if (maxAge) {
      const seconds = /^[+-]?\d+$/.test(maxAge) ? Number(maxAge) : NaN;
      const anchor = Date.parse(String(responseDate == null ? '' : responseDate));
      const instant = anchor + seconds * 1000;
      const computable = Number.isFinite(instant) && Math.abs(instant) <= COOKIE_MAX_TIME_VALUE;
      return { source: 'max-age', maxAge, expires, computed: computable ? new Date(instant).toUTCString() : '' };
    }
    if (expires) return { source: 'expires', maxAge: '', expires, computed: '' };
    return { source: 'none', maxAge: '', expires: '', computed: '' };
  }

  function getHeaderValue(headers, name) {
    if (!headers) return '';
    const lower = name.toLowerCase();
    for (const h of headers) {
      if ((h.name || '').toLowerCase() === lower) return h.value || '';
    }
    return '';
  }

  function copySanitizedAction(action, row, responseBody, message) {
    try {
      const payload = buildClipboardPayload(action, row, { mode: 'sanitized', responseBody });
      return writeClipboardPayload(payload.text, message || 'Copied sanitized data');
    } catch (_error) {
      // Same shared failure path as the row menu's copies: still English.
      setStatus('Sanitized copy failed closed. No data was copied.');
      return Promise.resolve();
    }
  }

  // labelKey names the pane the button sits in; the confirmation sentences
  // and the toast slot the localized pane name in, so a Japanese frame no
  // longer carries an English noun.
  function requestFullClipboardAction(action, row, responseBody, trigger, labelKey) {
    const label = uiText(labelKey);
    requestFullOutboundAction({
      title: uiTextFormat('copyFullTitle', { label }),
      detail: uiTextFormat('copyFullDetail', { label }),
      confirmLabel: uiTextFormat('copyFullConfirm', { label }),
      trigger,
      onConfirm: () => {
        const payload = buildClipboardPayload(action, row, {
          mode: 'full',
          confirmed: true,
          responseBody,
        });
        return writeClipboardPayload(payload.text, uiTextFormat('statusCopiedFullConfirmed', { label }));
      },
    });
  }

  // Every format the retired "Copy full request..." dialog offered in its
  // picker, now reachable straight from the row menu.
  // The third entry is the menu label's dictionary key; the second stays the
  // canonical English name the status line reports after the copy.
  const FULL_COPY_FORMATS = [
    ['summary', 'request summary', 'menuCopyFullSummary'],
    ['url', 'URL', 'menuCopyFullUrl'],
    ['curl', 'cURL', 'menuCopyFullCurl'],
    ['fetch', 'fetch', 'menuCopyFullFetch'],
    ['powershell', 'PowerShell', 'menuCopyFullPowershell'],
    ['markdown', 'Markdown', 'menuCopyFullMarkdown'],
    ['rawRequest', 'raw request', 'menuCopyFullRawRequest'],
    ['requestBody', 'request body', 'menuCopyFullRequestBody'],
  ];

  function copyFullAction(action, row, label) {
    try {
      const payload = buildClipboardPayload(action, row, { mode: 'full', confirmed: true });
      // Row-menu format: its status line stays the canonical English one.
      return writeClipboardPayload(payload.text, 'Copied unsanitized full ' + label);
    } catch (_error) {
      setStatus('Full copy failed. No data was copied.');
      return Promise.resolve();
    }
  }

  // ---- In-pane keyword search (Request/Response Body & Raw views) ----
  // Query text per pane id, so the query survives re-renders and row switches.
  const paneSearchQueries = new Map();

  // The pane name is a noun the toolbar's placeholder, tooltips, accessible
  // names and copy confirmations all compose sentences around, so it is a
  // dictionary key rather than an English literal; every en matches the name
  // the toolbar has always shown.
  const PANE_SEARCH_LABEL_KEYS = {
    'req-body': 'paneNameRequestBody',
    'req-raw': 'paneNameRawRequest',
    'req-query': 'paneNameQuery',
    'req-headers': 'paneNameRequestHeaders',
    'req-cookies': 'paneNameRequestCookies',
    'res-body': 'paneNameResponseBody',
    'res-raw': 'paneNameRawResponse',
    'res-headers': 'paneNameResponseHeaders',
  };

  function paneSearchLabel(paneId) {
    return uiText(PANE_SEARCH_LABEL_KEYS[paneId] || 'paneNameFallback');
  }

  function clearPaneSearchHits(pane) {
    const marks = Array.from(pane.querySelectorAll('mark.pane-search-hit'));
    const parents = new Set();
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parents.add(parent);
    }
    for (const parent of parents) parent.normalize();
  }

  function applyPaneSearchHits(pane, query, options) {
    const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        // Three kinds of node the pane must not search, all for one reason:
        // they are the panel's own text, or a second copy of text already on
        // screen, so counting them makes a hit a pair and steps the reader
        // through something they cannot see.
        //   .url-breakdown-full — the same URL the address above it shows,
        //     character for character.
        //   .kv-nested — a sub-grid generated from the raw parameter value in
        //     the same cell, which the pane always shows; 'utm_id' counted
        //     '1 / 2' with the second hit inside a collapsed disclosure.
        //   .jwt-chip — derived text ('JWT · expires in 2h 14m'), not response
        //     data, and searchable as if it were.
        //   .jwt-details — the decoded claims, the part headings and the
        //     display note: the panel's own prose about a token, not the
        //     bytes the request carried.
        //   .url-breakdown-decoded — the decoded reading of the query the row
        //     already shows verbatim, so a term counted twice in one cell.
        //   .image-preview-caption — the panel's reading of an image body
        //     ('image/gif · 1 × 1 px · 42 B'), not a byte the server sent;
        //     a search for 'gif' counted it beside the hex dump's own bytes.
        if (
          parent &&
          parent.closest(
            '.pane-search-bar,button,.json-tree-preview,.url-breakdown-full,.url-breakdown-decoded,.kv-nested,.jwt-chip,.jwt-details,.image-preview-caption',
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    const marks = [];
    let truncated = false;
    const keywords = [{ query, colorIdx: 0 }];
    for (const textNode of textNodes) {
      if (marks.length >= PANE_SEARCH_MAX_HITS) {
        truncated = true;
        break;
      }
      const ranges = planKeywordHighlights(textNode.nodeValue, keywords, options);
      if (ranges.length === 0) continue;
      const source = textNode.nodeValue;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const range of ranges) {
        if (marks.length >= PANE_SEARCH_MAX_HITS) {
          truncated = true;
          break;
        }
        if (range.start > cursor) {
          fragment.appendChild(document.createTextNode(source.slice(cursor, range.start)));
        }
        const mark = document.createElement('mark');
        mark.className = 'pane-search-hit';
        mark.textContent = source.slice(range.start, range.end);
        fragment.appendChild(mark);
        marks.push(mark);
        cursor = range.end;
      }
      if (cursor < source.length) {
        fragment.appendChild(document.createTextNode(source.slice(cursor)));
      }
      textNode.parentNode.replaceChild(fragment, textNode);
    }
    return { marks, truncated };
  }

  // The folds that keep a hit in layout while hiding it: a folded long string
  // clipped by -webkit-line-clamp, and a clamped value cell. Both have a box,
  // so offsetParent is NOT null inside them — the reveal's first version
  // missed the very case its brief named.
  const PANE_SEARCH_FOLD_SELECTOR = '.json-tree-str:not(.json-tree-str--expanded), .val-text.val--clamped';

  // The pane the mark belongs to, and whether the reader is looking at it.
  // attachPaneSearch runs on all four Body/Raw panes and a stored query
  // re-highlights every one of them, so a mark in an inactive .tab-pane also
  // has offsetParent === null: revealing on that test alone opened nodes and
  // pressed controls in a pane nobody had on screen.
  function isPaneSearchHitDisplayed(mark) {
    const pane = mark && typeof mark.closest === 'function' ? mark.closest('.tab-pane') : null;
    if (!pane) return false;
    return typeof pane.getClientRects === 'function' ? pane.getClientRects().length > 0 : !pane.hidden;
  }

  // The nearest ancestor fold that actually clips this mark, or null. Only
  // the vertical edges matter: both folds cut the text off after N lines.
  function paneSearchClippingFold(mark) {
    const markRect = mark.getBoundingClientRect();
    for (let node = mark.parentElement; node; node = node.parentElement) {
      if (node.classList && node.classList.contains('tab-pane')) break;
      if (typeof node.matches !== 'function' || !node.matches(PANE_SEARCH_FOLD_SELECTOR)) continue;
      const rect = node.getBoundingClientRect();
      if (markRect.bottom > rect.bottom + 0.5 || markRect.top < rect.top - 0.5) return node;
    }
    return null;
  }

  // Out of sight: either no layout box at all (a collapsed <details>, a node
  // behind the hidden attribute) or a box a fold clips away.
  function isPaneSearchHitObscured(mark) {
    if (typeof mark.getClientRects !== 'function') return false;
    if (mark.getClientRects().length === 0) return true;
    return paneSearchClippingFold(mark) !== null;
  }

  // The toggle that owns `hidden`: the one whose aria-controls names it. The
  // first collapsed link button under the same parent is not the same thing —
  // a value cell can hold several, and pressing the wrong one revealed a
  // different node while leaving the hit where it was.
  function paneSearchRevealerFor(hidden) {
    const parent = hidden.parentElement;
    if (!parent) return null;
    const candidates = Array.from(parent.querySelectorAll('button[aria-controls]'));
    const owner = candidates.find(
      (button) => hidden.id && button.getAttribute('aria-controls') === hidden.id,
    );
    if (owner) return owner.getAttribute('aria-expanded') === 'false' ? owner : null;
    // No declared ownership: fall back to a collapsed toggle that is a direct
    // sibling of the hidden node, never one nested somewhere else beneath it.
    for (let sibling = parent.firstElementChild; sibling; sibling = sibling.nextElementSibling) {
      if (sibling === hidden) continue;
      if (
        sibling.classList &&
        sibling.classList.contains('link-btn') &&
        sibling.getAttribute('aria-expanded') === 'false'
      ) {
        return sibling;
      }
    }
    return null;
  }

  // Open every collapsed <details> ancestor, unfold a long string the hit
  // sits in, expand a clamped value around it, and press open whatever a
  // reveal toggle still hides, so the current hit is visible. Only ever
  // called for a hit in the pane the reader is actually looking at.
  function revealPaneSearchHit(mark, pane) {
    const longString = mark.parentElement ? mark.parentElement.closest('.json-tree-str') : null;
    if (longString) setJsonTreeStringExpanded(longString, true);
    let node = mark.parentElement ? mark.parentElement.closest('details') : null;
    while (node) {
      if (!node.open) node.open = true;
      node = node.parentElement ? node.parentElement.closest('details') : null;
    }
    const clamped = mark.parentElement ? mark.parentElement.closest('.val--clamped') : null;
    const clampToggle = clamped ? clamped.nextElementSibling : null;
    if (clampToggle && clampToggle.classList && clampToggle.classList.contains('val-clamp-toggle')) {
      clampToggle.click();
    }
    // "Show full URL" and its kind keep their content in the DOM behind the
    // hidden attribute: a hit in there matches and highlights while the
    // reader sees an unchanged pane. The toggle beside it is the way in.
    // The walk stops AT the pane rather than at <html>: above the pane are the
    // inactive tab panes' shared ancestors, the collapsed inspector half and
    // the details pane itself, none of which is a reveal this search owns.
    for (let hidden = mark.parentElement; hidden && hidden !== pane; hidden = hidden.parentElement) {
      if (!hidden.hidden) continue;
      const revealer = paneSearchRevealerFor(hidden);
      if (revealer) revealer.click();
    }
    mark.scrollIntoView({ block: 'nearest' });
  }

  // Click every unexpanded truncation control ("Show all ...", "Show full
  // cached body ...") inside the pane, breadth-first, so collapsed search hits
  // become part of the DOM. Buttons are marked so ones that stay in the DOM
  // after their click (the show-full button) are not clicked twice.
  function expandPaneTruncations(pane, bar) {
    for (let round = 0; round < 60; round++) {
      const expanders = Array.from(pane.querySelectorAll('button.link-btn')).filter(
        (button) => !bar.contains(button) && !button.dataset.paneSearchExpanded,
      );
      if (expanders.length === 0) return;
      for (const button of expanders) {
        button.dataset.paneSearchExpanded = 'true';
        button.click();
      }
    }
  }

  // The sticky toolbar covers the top of the scrollport, so scroll targets
  // inside that pane must be inset past it. Its height is not a constant: the
  // copy actions wrap onto a second row in a narrow pane, so measure the real
  // bar. One scrollport is shared by all five panes of a half, so the inset
  // belongs to whichever pane is showing — a wrapped 58px Body bar used to
  // leave Headers scrolling under a 58px gap it does not have.
  function syncScrollportBarInset(scrollport) {
    if (!scrollport || !scrollport.classList || !scrollport.classList.contains('tab-content-area')) return;
    const activePane = scrollport.querySelector('.tab-pane.active');
    const bar = activePane ? activePane._paneSearchBar : null;
    const barHeight = bar && bar.isConnected ? Math.round(bar.getBoundingClientRect().height) : 0;
    scrollport.style.setProperty('--pane-bar-height', Math.max(0, barHeight) + 'px');
  }

  function hasCollapsedPaneContent(pane, bar) {
    return Array.from(pane.querySelectorAll('button.link-btn')).some(
      (button) => !bar.contains(button) && !button.dataset.paneSearchExpanded,
    );
  }

  // (Re)build the search bar of a detail pane. Renderers wipe pane children on
  // every row selection, so this runs after each content render. fullText is
  // the pane's complete source text; when provided, hits inside collapsed or
  // truncated content are counted and an "Expand all" action surfaces them.
  // options.viewToggle is a renderer picker the pane hands to its one toolbar;
  // options.hiddenSource says the pane is showing its body in a form the
  // search cannot walk (the sandboxed HTML frame), so every hit in fullText is
  // a hidden one and options.onExpandHidden is what reveals them.
  function attachPaneSearch(pane, fullText, options) {
    if (!pane) return;
    const paneId = pane.id;
    const paneLabel = paneSearchLabel(paneId);
    const hiddenSource = !!(options && options.hiddenSource);
    // One "expand everything" affordance per pane. Where the JSON tree renders
    // its own Expand / Collapse controls they own the job — the tree's Expand
    // all clicks through the truncation buttons too, so hits inside collapsed
    // content are still revealed — and the toolbar does not add a second
    // button beside them. The "(+N collapsed)" count still points at them.
    const treeOwnsExpansion = !!pane.querySelector('.json-tree-controls');

    const bar = document.createElement('div');
    bar.className = 'pane-search-bar';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pane-search-input';
    input.placeholder = uiTextFormat('paneSearchPlaceholder', { pane: paneLabel });
    input.setAttribute('aria-label', uiTextFormat('paneSearchInputLabel', { pane: paneLabel }));
    const count = document.createElement('span');
    count.className = 'pane-search-count';
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pane-search-nav';
    prevBtn.textContent = '↑';
    prevBtn.title = uiText('paneSearchPrevTitle');
    prevBtn.setAttribute('aria-label', uiTextFormat('paneSearchPrevLabel', { pane: paneLabel }));
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pane-search-nav';
    nextBtn.textContent = '↓';
    nextBtn.title = uiText('paneSearchNextTitle');
    nextBtn.setAttribute('aria-label', uiTextFormat('paneSearchNextLabel', { pane: paneLabel }));
    const expandBtn = document.createElement('button');
    expandBtn.className = 'pane-search-nav pane-search-expand';
    // Named for what pressing it does to the matches, not just for where they
    // are: beside the pane's own Rendered / Source picker, a second button
    // reading "Source" was two identical labels in one bar.
    expandBtn.textContent = hiddenSource ? uiText('paneSearchShowInSource') : uiText('jsonTreeExpandAll');
    expandBtn.title = hiddenSource ? uiText('paneSearchSourceTitle') : uiText('paneSearchExpandTitle');
    expandBtn.setAttribute(
      'aria-label',
      hiddenSource
        ? uiTextFormat('paneSearchSourceLabel', { pane: paneLabel })
        : uiTextFormat('paneSearchExpandLabel', { pane: paneLabel }),
    );
    expandBtn.hidden = true;
    // The count and the buttons that act on it are one cluster, so a wrap
    // moves all of them: as flat children of a wrapping bar the ↑ and the ↓
    // of the same control landed on different rows, a pane apart.
    const navGroup = document.createElement('div');
    navGroup.className = 'pane-search-nav-group';
    navGroup.appendChild(count);
    navGroup.appendChild(expandBtn);
    navGroup.appendChild(prevBtn);
    navGroup.appendChild(nextBtn);
    bar.appendChild(input);
    bar.appendChild(navGroup);
    // The renderer picker belongs to the same band as the search and the copy
    // actions: one toolbar, and nothing between the bar and the content. The
    // class is what the stylesheet keys the picker-bearing bar's own copy-label
    // threshold on: with a fourth child the bar wraps far wider than the
    // three-child bar the shared threshold was measured for.
    if (options && options.viewToggle) {
      bar.appendChild(options.viewToggle);
      bar.classList.add('pane-search-bar--with-view');
    }

    let marks = [];
    let currentIndex = -1;
    let truncated = false;

    let collapsedHits = 0;

    const updateCount = () => {
      const query = input.value.trim();
      const total = marks.length + (truncated ? '+' : '');
      count.textContent =
        marks.length > 0
          ? (currentIndex >= 0 ? currentIndex + 1 + ' / ' : '') + total
          : query
            ? uiText('paneSearchNoMatches')
            : '';
      if (collapsedHits > 0) {
        count.textContent += uiTextFormat('paneSearchCollapsedSuffix', { count: collapsedHits });
      }
      expandBtn.hidden = collapsedHits === 0 || treeOwnsExpansion;
      const disabled = marks.length === 0;
      prevBtn.disabled = disabled;
      nextBtn.disabled = disabled;
    };

    const setCurrent = (index, scroll) => {
      if (currentIndex >= 0 && marks[currentIndex]) {
        marks[currentIndex].classList.remove('pane-search-hit-current');
      }
      currentIndex = index;
      const mark = currentIndex >= 0 ? marks[currentIndex] : null;
      if (mark) {
        mark.classList.add('pane-search-hit-current');
        // A hit inside a collapsed <details> — or one a fold clips while
        // keeping its box — is an ordinary match the reader cannot see: the
        // count said "1 / 1" while the pane showed nothing, and the collapsed
        // suffix cannot point at it because the text is already in the DOM.
        // Reveal it even when no scroll was asked for, but only in the pane
        // that is on screen: this runs for all four Body/Raw panes at once.
        if (isPaneSearchHitDisplayed(mark) && (scroll || isPaneSearchHitObscured(mark))) {
          revealPaneSearchHit(mark, pane);
        }
      }
      updateCount();
    };

    const runHighlight = () => {
      paneSearchQueries.set(paneId, input.value);
      clearPaneSearchHits(pane);
      marks = [];
      currentIndex = -1;
      truncated = false;
      collapsedHits = 0;
      const query = input.value;
      const searchOptions = state.search.options;
      const compiledError = query.trim() && searchOptions.regex
        ? compileSearchQuery(query, searchOptions).error
        : null;
      input.classList.toggle('pane-search-input-error', !!compiledError);
      input.title = compiledError ? uiTextFormat('paneSearchInvalidRegex', { error: compiledError }) : '';
      if (query.trim() && !compiledError) {
        const result = applyPaneSearchHits(pane, query, searchOptions);
        marks = result.marks;
        truncated = result.truncated;
        // Hits hiding inside not-yet-rendered content: compare against the
        // full source text, but only while unexpanded truncation controls
        // remain (formatting differences make the raw count approximate).
        if (
          typeof fullText === 'string' &&
          fullText &&
          !truncated &&
          (hiddenSource || hasCollapsedPaneContent(pane, bar))
        ) {
          const totalHits = planKeywordHighlights(fullText, [{ query, colorIdx: 0 }], searchOptions).length;
          collapsedHits = Math.max(0, totalHits - marks.length);
        }
      }
      if (marks.length > 0) {
        setCurrent(0, false);
      } else {
        updateCount();
      }
    };
    pane._paneSearchRefresh = runHighlight;

    const navigate = (direction) => {
      const nextIndex = getWrappedMatchIndex(marks.length, currentIndex, direction);
      if (nextIndex < 0) return;
      setCurrent(nextIndex, true);
    };

    const debouncedHighlight = debounce(runHighlight, FILTER_DEBOUNCE_MS);
    input.addEventListener('input', debouncedHighlight);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        navigate(event.shiftKey ? 'prev' : 'next');
      } else if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        input.value = '';
        runHighlight();
      }
    });
    prevBtn.addEventListener('click', () => navigate('prev'));
    nextBtn.addEventListener('click', () => navigate('next'));
    expandBtn.addEventListener('click', () => {
      if (hiddenSource) {
        if (options && typeof options.onExpandHidden === 'function') options.onExpandHidden();
        return;
      }
      expandPaneTruncations(pane, bar);
      runHighlight();
    });

    // Expansion buttons ("Show all ...", "Show full cached body ...") replace
    // pane content after render; re-apply the highlights once they finish.
    // Bound once per pane element — the handler always calls the latest refresh.
    if (!pane._paneSearchExpandBound) {
      pane._paneSearchExpandBound = true;
      pane.addEventListener('click', (event) => {
        const target = event.target;
        if (target && target.closest && target.closest('.link-btn')) {
          setTimeout(() => {
            if (typeof pane._paneSearchRefresh === 'function') pane._paneSearchRefresh();
          }, 0);
        }
      });
    }

    // One toolbar per pane: the bar sits at the top and sticks there while
    // long content scrolls, and the pane's copy actions (rendered first by
    // addCopyActions) move into it, right-aligned, so content starts directly
    // under a single band instead of between a copy band and a footer.
    const copyActions = pane.querySelector(':scope > .copy-actions');
    if (copyActions) bar.appendChild(copyActions);
    pane.classList.add('pane-search-host');
    pane.insertBefore(bar, pane.firstChild);
    // The bar this pane owns; syncScrollportBarInset reads it back when the
    // pane is the one showing.
    pane._paneSearchBar = bar;
    if (typeof ResizeObserver === 'function') {
      // One observer per pane for the life of the session, re-pointed at the
      // new bar: attachPaneSearch runs two to four times per selection, and
      // an observer per bar accumulated one leak per render.
      if (!pane._paneBarObserver) {
        pane._paneBarObserver = new ResizeObserver(() => syncScrollportBarInset(pane.parentElement));
      } else {
        pane._paneBarObserver.disconnect();
      }
      pane._paneBarObserver.observe(bar);
    }
    syncScrollportBarInset(pane.parentElement);
    const storedQuery = paneSearchQueries.get(paneId) || '';
    if (storedQuery) {
      input.value = storedQuery;
      runHighlight();
    } else {
      updateCount();
    }
  }

  // The label sits in its own span so the narrowest pane can hide it and keep
  // the CSS icon: at the 440px pane minimum the Japanese pair alone pushed
  // every toolbar onto a second 63px row before a query was even typed. The
  // accessible name and the tooltip carry the full label at every width.
  function addCopyActions(container, actions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'copy-actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.className = 'copy-btn';
      button.title = action.label;
      button.setAttribute('aria-label', action.label);
      const label = document.createElement('span');
      label.className = 'copy-btn-label';
      label.textContent = action.label;
      button.appendChild(label);
      button.addEventListener('click', () => action.onClick(button));
      wrapper.appendChild(button);
    }
    container.insertBefore(wrapper, container.firstChild);
  }

  function buildRawRequestText(row) {
    const method = row.method || 'GET';
    const url = row.url || '/';
    let path;
    try {
      const u = new URL(url);
      // A host-less URL has no request line to reconstruct; its pathname is the
      // payload, so echo the URL whole rather than a scheme-stripped fragment.
      path = u.host ? u.pathname + u.search : url;
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
    appendJsonHighlight(pre, jsonText);
    return pre;
  }

  // Appends the highlighted tokens of jsonText to target as bare spans, so
  // the Raw view can colour a body inside its own <pre> without nesting one.
  function appendJsonHighlight(target, jsonText) {
    // Tokenize JSON string with a regex that captures keys, strings, numbers, booleans, null
    const TOKEN_RE = /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;
    let lastIndex = 0;
    let match;
    while ((match = TOKEN_RE.exec(jsonText)) !== null) {
      // Append plain text before this match
      if (match.index > lastIndex) {
        target.appendChild(document.createTextNode(jsonText.substring(lastIndex, match.index)));
      }
      const span = document.createElement('span');
      if (match[1]) {
        // JSON key (property name). The whitespace the token swallowed
        // between the key and its colon is re-emitted verbatim so the
        // rendered text still equals the source.
        span.className = 'syn-key';
        span.textContent = match[1];
        target.appendChild(span);
        const gap = match[0].slice(match[1].length, -1);
        if (gap) target.appendChild(document.createTextNode(gap));
        target.appendChild(document.createTextNode(':'));
      } else if (match[2]) {
        // String value
        span.className = 'syn-str';
        span.textContent = match[2];
        target.appendChild(span);
      } else if (match[3]) {
        // Number
        span.className = 'syn-num';
        span.textContent = match[3];
        target.appendChild(span);
      } else if (match[4]) {
        // Boolean
        span.className = 'syn-bool';
        span.textContent = match[4];
        target.appendChild(span);
      } else if (match[5]) {
        // null
        span.className = 'syn-null';
        span.textContent = match[5];
        target.appendChild(span);
      }
      lastIndex = TOKEN_RE.lastIndex;
    }
    // Remaining text
    if (lastIndex < jsonText.length) {
      target.appendChild(document.createTextNode(jsonText.substring(lastIndex)));
    }
    return target;
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
    let nodeCount = 0;

    // The separator after a key. A folded row is a flex container, and a bare
    // ": " text node there is an anonymous flex item whose trailing space is
    // dropped: the row read `"trace":"…"` beside siblings reading
    // `"host": "edge-07"`. An element of its own keeps the space, and the
    // row's textContent is unchanged either way.
    function appendJsonKeySeparator(parent) {
      const separator = document.createElement('span');
      separator.className = 'json-tree-sep';
      separator.textContent = ': ';
      parent.appendChild(separator);
    }

    // Long or multi-line strings fold to their first line with a toggle. The
    // whole string stays one text node (pane search walks text nodes and a
    // drag-select copies it whole); only CSS hides the rest until expanded.
    function createLongStringValue(val, line, comma) {
      line.classList.add('json-tree-line--long');
      const value = document.createElement('span');
      value.className = 'syn-str json-tree-str';
      // Escaped exactly like a short value (createValueSpan's JSON.stringify):
      // a raw string between two literal quotes rendered a value containing a
      // quote or a backslash ambiguously and did not round-trip. Quotes and
      // body are ONE text node — split across three, a pane search spanning
      // the opening quote had no single node to match in.
      value.textContent = JSON.stringify(val);
      line.appendChild(value);
      // The comma closes the value, so it goes next to it: appended after the
      // fold control the row read `"key": "value…" ▸,`.
      if (comma) line.appendChild(document.createTextNode(comma));
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'json-tree-str-toggle';
      toggle.addEventListener('click', () => {
        setJsonTreeStringExpanded(value, !value.classList.contains('json-tree-str--expanded'));
      });
      line.appendChild(toggle);
      setJsonTreeStringExpanded(value, false);
    }

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
          appendJsonKeySeparator(line);
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
          appendJsonKeySeparator(line);
        }
        if (isLongJsonString(value)) {
          createLongStringValue(value, line, comma);
        } else {
          line.appendChild(createValueSpan(value));
          if (comma) line.appendChild(document.createTextNode(comma));
        }
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
          appendJsonKeySeparator(line);
        }
        line.appendChild(document.createTextNode(openBrace + closeBrace + comma));
        return line;
      }

      const details = document.createElement('details');
      details.className = 'json-tree-node';
      details.open = depth <= JSON_TREE_OPEN_DEPTH;
      details.dataset.depth = String(depth);
      nodeCount += 1;

      const summary = document.createElement('summary');
      summary.className = 'json-tree-summary';
      // Dragging across a summary to select its text must not fold the node:
      // a click that ends with a live selection is a selection, not a toggle.
      summary.addEventListener('click', (event) => {
        const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
        if (selection && !selection.isCollapsed) event.preventDefault();
      });
      if (keyName !== undefined) {
        const keySpan = document.createElement('span');
        keySpan.className = 'syn-key';
        keySpan.textContent = JSON.stringify(keyName);
        summary.appendChild(keySpan);
        appendJsonKeySeparator(summary);
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

    const root = buildNode(parsed, undefined, true, 0);
    // Expand / Collapse all above a tree with more than one node. Collapse
    // keeps the root open so the outline stays visible. These are not
    // .link-btn on purpose: the pane search treats every .link-btn as a
    // truncation control it must click through.
    if (nodeCount > 1) {
      const controls = document.createElement('div');
      controls.className = 'json-tree-controls';
      const setAllOpen = (open) => {
        container.querySelectorAll('details.json-tree-node').forEach((node) => {
          node.open = open || node.dataset.depth === '0';
        });
      };
      // This is the pane's only "expand everything" control (the toolbar
      // suppresses its own next to it), so it also clicks through the
      // truncation buttons and unfolds the long strings — otherwise a pane
      // search hit inside "... Show all 300 items" would stay unreachable.
      const expandEverything = () => {
        setAllOpen(true);
        for (let round = 0; round < 60; round++) {
          const expanders = Array.from(container.querySelectorAll('button.link-btn')).filter(
            (button) => !button.dataset.paneSearchExpanded,
          );
          if (expanders.length === 0) break;
          for (const button of expanders) {
            button.dataset.paneSearchExpanded = 'true';
            button.click();
          }
        }
        container.querySelectorAll('.json-tree-str').forEach((span) => {
          setJsonTreeStringExpanded(span, true);
        });
      };
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'json-tree-ctl';
      expandBtn.textContent = uiText('jsonTreeExpandAll');
      expandBtn.addEventListener('click', expandEverything);
      const collapseBtn = document.createElement('button');
      collapseBtn.type = 'button';
      collapseBtn.className = 'json-tree-ctl';
      collapseBtn.textContent = uiText('jsonTreeCollapseAll');
      collapseBtn.addEventListener('click', () => setAllOpen(false));
      controls.appendChild(expandBtn);
      controls.appendChild(collapseBtn);
      container.appendChild(controls);
    }
    container.appendChild(root);
    return container;
  }

  function isLongJsonString(value) {
    return (
      typeof value === 'string' &&
      (value.length > JSON_TREE_LONG_STRING_CHARS || value.indexOf('\n') !== -1)
    );
  }

  // Folds or unfolds a long-string value; the toggle button follows the span.
  function setJsonTreeStringExpanded(valueSpan, expanded) {
    valueSpan.classList.toggle('json-tree-str--expanded', expanded);
    const toggle = valueSpan.nextElementSibling;
    if (toggle && toggle.classList && toggle.classList.contains('json-tree-str-toggle')) {
      toggle.textContent = expanded ? '▾' : '▸';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute(
        'aria-label',
        expanded ? uiText('jsonTreeHideFullString') : uiText('jsonTreeShowFullString'),
      );
      toggle.title = expanded ? uiText('jsonTreeHideFullString') : uiText('jsonTreeShowFullString');
    }
  }

  // Splits a request line into its three parts on the first and last space.
  // A status line ("HTTP/1.1 200 OK") or a line with fewer than two spaces
  // returns null so the caller keeps it whole.
  function splitRawRequestLine(line) {
    const first = line.indexOf(' ');
    const last = line.lastIndexOf(' ');
    if (first < 1 || last <= first) return null;
    if (/^HTTP\//i.test(line)) return null;
    return {
      method: line.slice(0, first),
      path: line.slice(first + 1, last),
      protocol: line.slice(last + 1),
    };
  }

  /**
   * Render raw HTTP text with syntax highlighting.
   * First line = status/request line (bold; a request line splits into
   * method, path and protocol), header names colored, a hairline divider
   * before the body, and a JSON body highlighted in place.
   */
  function renderRawHighlighted(rawText) {
    const pre = document.createElement('pre');
    pre.className = 'code-block code-raw';
    const lines = rawText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) {
        // Request/Status line
        const cr = line.endsWith('\r') ? '\r' : '';
        const core = cr ? line.slice(0, -1) : line;
        const parts = splitRawRequestLine(core);
        if (parts) {
          const method = document.createElement('span');
          method.className = 'syn-status-line';
          method.textContent = parts.method;
          pre.appendChild(method);
          pre.appendChild(document.createTextNode(' '));
          const path = document.createElement('span');
          path.className = 'syn-hdr-val';
          path.textContent = parts.path;
          pre.appendChild(path);
          pre.appendChild(document.createTextNode(' '));
          const protocol = document.createElement('span');
          protocol.className = 'syn-status-line';
          protocol.textContent = parts.protocol;
          pre.appendChild(protocol);
        } else {
          const span = document.createElement('span');
          span.className = 'syn-status-line';
          span.textContent = core;
          pre.appendChild(span);
        }
        if (cr) pre.appendChild(document.createTextNode(cr));
      } else if (line.trim() === '') {
        // Empty line = separator between headers and body. Its own text and
        // the newline after it are emitted first: the pane's textContent has
        // to stay the source text character for character. Then a hairline
        // divider and the body — highlighted when it parses as JSON. The
        // builders always emit that separator, so a body-less message (every
        // GET) would otherwise end on a stray hairline: divide only when
        // there is a body to divide from.
        pre.appendChild(document.createTextNode(line));
        if (i < lines.length - 1) pre.appendChild(document.createTextNode('\n'));
        const body = lines.slice(i + 1).join('\n');
        if (body !== '') {
          const divider = document.createElement('span');
          divider.className = 'raw-body-divider';
          pre.appendChild(divider);
          if (formatJsonSafe(body) !== null) {
            appendJsonHighlight(pre, body);
          } else {
            pre.appendChild(document.createTextNode(body));
          }
        }
        break;
      } else {
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
      }
      if (i < lines.length - 1) pre.appendChild(document.createTextNode('\n'));
    }
    return pre;
  }

  function setResponsePaneMessage(message) {
    $('#res-body').textContent = message;
    $('#res-raw').textContent = message;
  }

  // Decodes a base64 body to bytes and lays them out as a hex dump. Returns
  // null when the payload will not decode, so the caller keeps its text path.
  function describeBinaryResponseBody(base64Content) {
    let bytes;
    try {
      bytes = base64ToBytes(base64Content);
    } catch (_e) {
      return null;
    }
    const dump = formatHexDump(bytes, HEX_DUMP_MAX_BYTES);
    return {
      text: dump.text,
      shownBytes: dump.shownBytes,
      totalBytes: dump.totalBytes,
      truncated: dump.shownBytes < dump.totalBytes,
    };
  }

  // States why the pane holds a hex dump, and how much of the body it covers.
  // A dump with no size line reads as the whole body even when it is the first
  // 4 KB of a 2 MB video.
  function buildBinaryBodyNotice(row, dump) {
    const notice = document.createElement('div');
    notice.className = 'body-notice';
    const headline = document.createElement('div');
    headline.textContent = uiText('binaryBodyNotice');
    notice.appendChild(headline);
    const facts = [guessMimeType(row), fmtBytes(dump.totalBytes)];
    if (dump.truncated) {
      facts.push(uiText('binaryDumpShown') + ': ' + fmtBytes(dump.shownBytes) + ' / ' + fmtBytes(dump.totalBytes));
    }
    const detail = document.createElement('div');
    detail.textContent = facts.filter(Boolean).join(' · ');
    notice.appendChild(detail);
    return notice;
  }

  const IMAGE_PREVIEW_MIN_EDGE = 48;
  const IMAGE_PREVIEW_MAX_EDGE = 256;

  // Tracking pixels are the most common image a network panel meets, and a 1×1
  // transparent GIF drawn at its intrinsic size is invisible — the pane simply
  // reads as empty, which is what this replaces. The checkerboard gives
  // transparency something to sit on, and an image too small to see is zoomed
  // with the factor named in the caption so the enlargement can never be
  // mistaken for the image's real size.
  function renderImagePreview(mime, base64Content) {
    const byteLength = base64ByteLength(base64Content);
    const frame = document.createElement('div');
    frame.className = 'image-preview';
    const stage = document.createElement('div');
    stage.className = 'image-preview-stage';
    const caption = document.createElement('div');
    caption.className = 'image-preview-caption';
    caption.textContent = [mime, fmtBytes(byteLength)].filter(Boolean).join(' · ');
    const img = document.createElement('img');
    img.alt = 'Response image preview';
    img.addEventListener('load', () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const facts = [mime, width + ' × ' + height + ' px', fmtBytes(byteLength)];
      const smallestEdge = Math.min(width, height);
      const largestEdge = Math.max(width, height);
      if (smallestEdge > 0 && smallestEdge < IMAGE_PREVIEW_MIN_EDGE) {
        // Reach for a visible short edge, but never past the box — a 400×1
        // spacer would otherwise be asked to render 19200px wide. Only the
        // width is set so that clamping the image keeps its aspect ratio.
        const zoom = Math.max(
          1,
          Math.min(
            Math.ceil(IMAGE_PREVIEW_MIN_EDGE / smallestEdge),
            Math.floor(IMAGE_PREVIEW_MAX_EDGE / largestEdge),
          ),
        );
        if (zoom > 1) {
          img.style.width = width * zoom + 'px';
          facts.push(uiText('imagePreviewZoom') + ' ' + zoom + '×');
        }
      }
      caption.textContent = facts.filter(Boolean).join(' · ');
    });
    img.addEventListener('error', () => {
      caption.textContent = uiText('imagePreviewFailed');
    });
    img.src = 'data:' + mime + ';base64,' + base64Content;
    stage.appendChild(img);
    frame.appendChild(stage);
    frame.appendChild(caption);
    return frame;
  }

  // Which renderer the Body pane is showing for the bodies that offer a
  // choice. Kept across rows: a person who switched JSON to the flat text once
  // is not switched back by the next selection.
  const responseBodyViews = { json: 'tree', html: 'rendered' };

  // Body's renderer picker: a segmented pair that lives in the pane's one
  // toolbar, beside the search. Deliberately not a .link-btn — the pane search
  // treats every link button outside the bar as a truncation control it may
  // click through, so a link-shaped toggle would be pressed by "Expand all".
  function buildBodyViewToggle(kind, views, onPick) {
    const group = document.createElement('div');
    group.className = 'body-view-toggle';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', uiText('bodyViewLabel'));
    for (const view of views) {
      const label = uiText(view.labelKey);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'body-view-btn';
      button.dataset.view = view.id;
      button.textContent = label;
      button.setAttribute('aria-pressed', String(responseBodyViews[kind] === view.id));
      button.title = uiTextFormat('bodyViewButtonTitle', { view: label });
      button.addEventListener('click', () => {
        if (responseBodyViews[kind] === view.id) return;
        responseBodyViews[kind] = view.id;
        onPick();
      });
      group.appendChild(button);
    }
    return group;
  }

  // A view switch re-renders the whole response body through the one path that
  // built it, so the toolbar, the copy actions and the stored query are rebuilt
  // together instead of patched. The rebuilt toggle takes the focus back.
  function pickResponseBodyView(row) {
    renderCachedResponseContent(row);
    const pressed = $('#res-body .body-view-btn[aria-pressed="true"]');
    if (pressed) pressed.focus();
  }

  // The Body pane's plain text block: a hex dump when the bytes are not text,
  // otherwise the decoded body, cut at TRUNCATE_LIMIT behind a control that
  // opens the rest. Shared by the text renderer and by HTML's Source view.
  function appendBodyTextBlock(pane, row, displayText, binaryDump) {
    const bodyPre = document.createElement('pre');
    bodyPre.className = binaryDump ? 'code-block hex-dump' : 'code-block';
    if (binaryDump) {
      bodyPre.textContent = displayText;
      pane.appendChild(bodyPre);
    } else if (displayText.length > TRUNCATE_LIMIT) {
      bodyPre.textContent = displayText.substring(0, TRUNCATE_LIMIT);
      const showMore = document.createElement('button');
      showMore.textContent = uiTextFormat('bodyPaneShowFullCached', { size: fmtBytes(row.responseContentBytes) });
      if (!row._previewTruncationCounted) {
        row._previewTruncationCounted = true;
        state.retention.truncatedBodies += 1;
        updateRetentionStatus();
        queueRetentionSummary('Response preview truncated until explicitly expanded');
      }
      showMore.className = 'link-btn';
      showMore.addEventListener('click', () => {
        bodyPre.textContent = displayText;
      });
      pane.appendChild(bodyPre);
      pane.appendChild(showMore);
    } else {
      bodyPre.textContent = displayText || uiText('bodyPaneNoResponseBody');
      pane.appendChild(bodyPre);
    }
    return bodyPre;
  }

  // Captured HTML is untrusted content, so it renders in a frame with an empty
  // sandbox: no scripts, no same-origin access, no navigation.
  function buildHtmlBodyFrame(text) {
    const iframe = document.createElement('iframe');
    iframe.sandbox = '';
    iframe.title = uiText('bodyHtmlFrameTitle');
    // The class carries the frame's own light ground: the captured document
    // paints its default black text on a transparent canvas, and on the dark
    // theme that landed on --content-bg at about 1.2:1.
    iframe.className = 'body-html-frame';
    iframe.style.width = '100%';
    iframe.style.height = '300px';
    iframe.style.border = '1px solid var(--border)';
    iframe.srcdoc = text;
    return iframe;
  }

  function renderCachedResponseContent(row) {
    if (row.responseContentState !== 'cached') {
      const display = describeResponseContentState(row);
      setResponsePaneMessage(formatBodyPaneMessage(display));
      // A pane holding only the reason a body is missing is an empty pane,
      // and its tab says so the same way the request half's Body tab does.
      applyResponseTabSignals({ 'res-body': 0, 'res-raw': 0 });
      return;
    }
    const resBodyPane = $('#res-body');
    const resRawPane = $('#res-raw');
    const rawContent = typeof row.responseContent === 'string' ? row.responseContent : '';
    const encoding = row.responseContentEncoding === 'base64' ? 'base64' : '';
    let text = row.responseContentText != null
      ? row.responseContentText
      : decodeResponseContent(rawContent, encoding, resolveRowResponseCharset(row), isHtmlLikeMime(row.type));
    if (encoding === 'base64' && rawContent && !text) text = '(could not decode base64 response)';

    // Only a base64 body carries the real bytes, so only there can an honest
    // hex dump replace the mojibake a lossy decode produced.
    const binaryDump =
      encoding === 'base64' && rawContent && isUndecodableBodyText(text)
        ? describeBinaryResponseBody(rawContent)
        : null;
    const displayText = binaryDump ? binaryDump.text : text;

    // Body tab — one pane, and the renderer follows the content: the image on
    // its checkerboard stage, HTML in a sandboxed frame, JSON as a collapsible
    // tree, bytes that are not text as a hex dump, everything else as text.
    // Preview held the first three until they moved here; two tabs showing the
    // same body two ways made the reader pick a tab before reading anything.
    resBodyPane.textContent = '';
    if (binaryDump) resBodyPane.appendChild(buildBinaryBodyNotice(row, binaryDump));
    // The Content-Type header outranks the HAR mime for the renderer decision:
    // it is what the server actually declared, and it is present on rows whose
    // recorded type came back as `x-unknown`.
    const bodyMime = guessMimeType(row);
    if (encoding === 'base64' && rawContent && /^image\//i.test(bodyMime)) {
      resBodyPane.appendChild(renderImagePreview(bodyMime, rawContent));
    }
    const isHtmlBody = !binaryDump && isHtmlLikeMime(bodyMime);
    const jsonFormatted = binaryDump || isHtmlBody ? null : formatJsonSafe(displayText);
    let bodyViewToggle = null;
    let htmlFrameShowing = false;
    if (isHtmlBody) {
      bodyViewToggle = buildBodyViewToggle(
        'html',
        [
          { id: 'rendered', labelKey: 'bodyViewRendered' },
          { id: 'source', labelKey: 'bodyViewSource' },
        ],
        () => pickResponseBodyView(row),
      );
      if (responseBodyViews.html === 'source') {
        appendBodyTextBlock(resBodyPane, row, displayText, binaryDump);
      } else {
        htmlFrameShowing = true;
        resBodyPane.appendChild(buildHtmlBodyFrame(text));
      }
    } else if (jsonFormatted != null) {
      bodyViewToggle = buildBodyViewToggle(
        'json',
        [
          { id: 'tree', labelKey: 'bodyViewTree' },
          { id: 'text', labelKey: 'bodyViewText' },
        ],
        () => pickResponseBodyView(row),
      );
      const treeEl = responseBodyViews.json === 'tree' ? renderJsonTree(displayText) : null;
      resBodyPane.appendChild(treeEl || renderJsonHighlighted(jsonFormatted));
    } else {
      appendBodyTextBlock(resBodyPane, row, displayText, binaryDump);
    }
    addCopyActions(resBodyPane, [
      {
        label: uiText('menuCopySanitized'),
        onClick: () => copySanitizedAction('responseBody', row, rawContent, uiText('statusCopiedSanitizedResponseBody')),
      },
      {
        label: uiText('paneCopyFull'),
        onClick: (button) => requestFullClipboardAction('responseBody', row, rawContent, button, 'paneNameResponseBody'),
      },
    ]);

    // Raw tab
    resRawPane.textContent = '';
    const rawResPre = renderRawHighlighted(buildRawResponseText(row, displayText));
    addCopyActions(resRawPane, [
      {
        label: uiText('menuCopySanitized'),
        onClick: () => copySanitizedAction('rawResponse', row, rawContent, uiText('statusCopiedSanitizedRawResponse')),
      },
      {
        label: uiText('paneCopyFull'),
        onClick: (button) => requestFullClipboardAction('rawResponse', row, rawContent, button, 'paneNameRawResponse'),
      },
    ]);
    resRawPane.appendChild(rawResPre);
    // The rendered HTML frame is a separate document the pane search cannot
    // walk, so a term plainly visible in it would count as "No matches". Say
    // so instead: the hits are counted from the source text and the toolbar
    // offers the Source view that can step through them.
    attachPaneSearch(resBodyPane, text, {
      viewToggle: bodyViewToggle,
      hiddenSource: htmlFrameShowing,
      onExpandHidden: () => {
        responseBodyViews.html = 'source';
        pickResponseBodyView(row);
      },
    });
    attachPaneSearch(resRawPane);
    // Body holds one document, so an empty one takes the en-dash marker, not
    // a "0" that would read as a count of zero items. Raw carries the status
    // line and the headers whatever the body was, so it is empty only when
    // there is nothing to build it from.
    applyResponseTabSignals({
      'res-body': displayText ? 1 : 0,
      'res-raw': rawResPre.textContent ? 1 : 0,
    });
  }

  function selectRow(row, event, moveFocus, extraAffectedRows) {
    const previousFocusedRow = state.focusedRow;
    const previousSelectedRow = state.selectedRow;
    if (row) state.focusedRow = row;
    if (moveFocus && row) state.pendingRowFocusId = String(row.id);
    // Multi-row selection support
    if (event && (event.ctrlKey || event.metaKey)) {
      if (state.selectedRows.has(row)) {
        state.selectedRows.delete(row);
      } else {
        state.selectedRows.add(row);
      }
      if (!replaceRenderedRowStates([previousFocusedRow, row])) renderBody();
      return; // Do not update the detail panel for a toggle.
    }
    if (event && event.shiftKey && state.selectedRow) {
      // Shift+Click may update many rows, so use the safe full render.
      const filtered = getSortedRows(state.filteredRows);
      const lastIdx = filtered.indexOf(state.selectedRow);
      const currentIdx = filtered.indexOf(row);
      if (lastIdx !== -1 && currentIdx !== -1) {
        const [start, end] = lastIdx < currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx];
        for (let i = start; i <= end; i++) state.selectedRows.add(filtered[i]);
        renderBody();
        return; // Do not update the detail panel for a range selection.
      }
    }
    // Normal click: update only rows whose primary or multi-selection state changed.
    const affectedRows = [
      previousFocusedRow,
      previousSelectedRow,
      row,
      ...state.selectedRows,
      ...(Array.isArray(extraAffectedRows) ? extraAffectedRows : []),
    ];
    state.selectedRows.clear();
    state.selectedRow = row;
    // A normal single-row click dismisses any active two-request comparison.
    if (state.comparedRows) {
      state.comparedRows = null;
      hideComparisonPanel();
    }
    if (!replaceRenderedRowStates(affectedRows)) renderBody();
    if (!row) return;
    renderRowDetails(row);
  }

  // Paints the details pane for one row. Split out of selectRow so a language
  // change can repaint the open pane in place (see applyLanguage) without
  // going back through selection, which would clear a multi-row selection and
  // re-announce the row.
  function renderRowDetails(row) {
    // The halves must be visible before the pane opens so the remembered
    // request/response split can measure them.
    setInspectorEmptyState(false);
    showDetailsPanel(row);

    const titleParts = [];
    if (row.method) titleParts.push(row.method);
    titleParts.push(row.url || '');
    renderDetailsTitle(row, titleParts);
    const summaryPlan = renderDetailsSummary(row);

    // === REQUEST TABS ===

    // Request > Headers
    const reqHeadersPane = $('#req-headers');
    reqHeadersPane.textContent = '';
    // Parsed here, above the headers grid, so the Cookie header row's count
    // and the Cookies tab's own row count come from one reading of one string.
    const cookieHeader = getHeaderValue(row.requestHeaders, 'cookie');
    const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : [];
    // Protocol follows the Response rows' rule: the summary strip above
    // already states it, so the row stays only when the strip could not.
    // 'plain': every value here is panel-derived request metadata — a method,
    // a protocol, a GraphQL operation name — and the URL row is a prebuilt
    // node, so it carries no row-end Copy at all.
    const reqInfo = createKvGrid(
      [
        { key: uiText('detailsInfoMethod'), value: row.method || '' },
        ...(row.operation ? [{ key: uiText('detailsInfoOperation'), value: row.operation }] : []),
        { key: uiText('detailsInfoUrl'), node: createUrlBreakdown(row), mono: true },
        ...(summaryPlan.protocol ? [] : [{ key: uiText('detailsInfoProtocol'), value: row.protocol || '' }]),
      ],
      'plain',
    );
    reqHeadersPane.appendChild(reqInfo);
    if (row.requestHeaders && row.requestHeaders.length > 0) {
      const title = document.createElement('strong');
      title.textContent = uiText('detailsRequestHeadersHeading');
      title.className = 'kv-group-heading';
      reqHeadersPane.appendChild(title);
      const requestJwtSubRows = createHeaderJwtSubRows(row.requestHeaders);
      reqHeadersPane.appendChild(
        createKvGrid(
          row.requestHeaders.map((h) => ({
            key: h.name,
            value: h.value,
            mono: isMonoValue(h.name, h.value),
            appendText: appendJwtAwareText,
            node: createRequestCookieRowNode(h, cookieHeader, cookies.length),
            copyValue: h.value,
            copyName: h.name,
            chip: createJwtExpiryChip(h.value),
            subRow: requestJwtSubRows.get(h),
          })),
          'header',
        ),
      );
    }
    // The kv panes get the toolbar the Body and Raw panes have had: a header
    // list is as long as a body and was the one place a reader could not
    // search. No `fullText` second argument — nothing here is truncated away,
    // and arming "Expand all" would press every link button in the pane,
    // including "open Query", which switches the tab out from under the search.
    attachPaneSearch(reqHeadersPane);

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

      addCopyActions(reqBodyPane, [
        {
          label: uiText('menuCopySanitized'),
          onClick: () => copySanitizedAction('requestBody', row, '', uiText('statusCopiedSanitizedRequestBody')),
        },
        {
          label: uiText('paneCopyFull'),
          onClick: (button) => requestFullClipboardAction('requestBody', row, '', button, 'paneNameRequestBody'),
        },
      ]);
      attachPaneSearch(reqBodyPane, text);
    } else {
      renderPaneEmptyMessage(reqBodyPane, uiText('emptyRequestBody'));
    }
    const hasRequestBody = !!(row.requestPostData && row.requestPostData.text);

    // Request > Query
    const reqQueryPane = $('#req-query');
    reqQueryPane.textContent = '';
    const queryParams = parseQueryString(row.url || '');
    if (queryParams.length > 0) {
      reqQueryPane.appendChild(
        createKvGrid(
          queryParams.map((p) => ({
            name: p.name,
            node: createQueryValueNode(p.value),
            mono: isMonoValue(p.name, p.value),
            // The value cell is a prebuilt node, so the copy has to be stated:
            // the raw parameter as captured, not the decoded reading on screen.
            // 'query' sends it through sanitizeNamedValues, which redacts every
            // value unconditionally — the same gate this pane's Copy sanitized
            // passes, so the row copy is never the looser of the two.
            copyValue: p.value,
          })),
          'query',
        ),
      );
      // The copy pair Body and Raw carry, over the one payload this pane
      // describes: the URL. Both go through the shared clipboard builder, so
      // the sanitized copy redacts every query value and the full copy still
      // needs its confirmation — neither reads the decoded text on screen.
      addCopyActions(reqQueryPane, [
        {
          label: uiText('menuCopySanitized'),
          onClick: () => copySanitizedAction('url', row, '', uiText('statusCopiedSanitizedUrl')),
        },
        {
          label: uiText('paneCopyFull'),
          onClick: (button) => requestFullClipboardAction('url', row, '', button, 'paneNameQuery'),
        },
      ]);
      attachPaneSearch(reqQueryPane);
    } else if (hasRequestBody) {
      // A POST with no query string is not missing anything: point at Body.
      const hintMethod = String(row.method || '').trim();
      renderPaneEmptyMessage(
        reqQueryPane,
        hintMethod
          ? uiTextFormat('emptyQueryParamsBodyHint', { method: hintMethod })
          : uiText('emptyQueryParamsBodyHintNoMethod'),
      );
    } else {
      renderPaneEmptyMessage(reqQueryPane, uiText('emptyQueryParams'));
    }

    // Request > Cookies
    const reqCookiesPane = $('#req-cookies');
    reqCookiesPane.textContent = '';
    if (cookies.length > 0) {
      // The same parsed array the Cookie header row counted, so the tab's
      // count and the rows this table lists stay one reading of one string.
      const requestCookieRows = cookies.map((c) => ({
        cookie: c,
        mono: isMonoValue(c.name, c.value),
        copyLabel: c.name,
        copyName: c.name,
        copyValue: c.value,
      }));
      reqCookiesPane.appendChild(createCookieTable(REQUEST_COOKIE_COLUMNS, requestCookieRows, 'cookie'));
      attachPaneSearch(reqCookiesPane);
    } else {
      // The rule for all four new toolbars: a pane rendered as a one-line
      // empty message keeps none. A search box over "No cookies were sent" has
      // nothing to search, and it would still cost a resize observer and a
      // scrollport inset the pane does not need.
      renderPaneEmptyMessage(reqCookiesPane, uiText('emptyRequestCookies'));
    }

    // Tab signals: counts on Query / Cookies, an empty marker on a pane that
    // holds nothing (the label keeps full contrast), and Headers in place of
    // a picked tab that has nothing for this row.
    applyInspectorTabSignals('req-tab-bar', {
      'req-body': hasRequestBody ? 1 : 0,
      'req-query': queryParams.length,
      'req-cookies': cookies.length,
    });

    // Request > Raw
    const reqRawPane = $('#req-raw');
    reqRawPane.textContent = '';
    const rawReqPre = renderRawHighlighted(buildRawRequestText(row));
    addCopyActions(reqRawPane, [
      {
        label: uiText('menuCopySanitized'),
        onClick: () => copySanitizedAction('rawRequest', row, '', uiText('statusCopiedSanitizedRawRequest')),
      },
      {
        label: uiText('paneCopyFull'),
        onClick: (button) => requestFullClipboardAction('rawRequest', row, '', button, 'paneNameRawRequest'),
      },
    ]);
    reqRawPane.appendChild(rawReqPre);
    attachPaneSearch(reqRawPane);

    // === RESPONSE TABS ===

    // Response > Headers
    const resHeadersPane = $('#res-headers');
    resHeadersPane.textContent = '';
    // The summary strip under the title already states status, protocol,
    // size, and duration; only a value the strip could not show keeps a row.
    const resInfoItems = [];
    if (!summaryPlan.status) resInfoItems.push({ key: uiText('detailsInfoStatus'), value: row.status + ' ' + (row.statusText || '') });
    if (!summaryPlan.protocol) resInfoItems.push({ key: uiText('detailsInfoProtocol'), value: row.protocol || '' });
    if (!summaryPlan.size) resInfoItems.push({ key: uiText('detailsInfoSize'), value: fmtBytes(row.size) });
    if (!summaryPlan.duration) resInfoItems.push({ key: uiText('detailsInfoDuration'), value: fmtTime(row.duration) });
    // 'plain': status, protocol, a formatted byte count and a formatted
    // duration are the panel's own readings, not captured header values.
    if (resInfoItems.length > 0) resHeadersPane.appendChild(createKvGrid(resInfoItems, 'plain'));
    if (row.responseHeaders && row.responseHeaders.length > 0) {
      const title = document.createElement('strong');
      title.textContent = uiText('detailsResponseHeadersHeading');
      title.className = 'kv-group-heading';
      resHeadersPane.appendChild(title);
      const responseJwtSubRows = createHeaderJwtSubRows(row.responseHeaders);
      resHeadersPane.appendChild(
        createKvGrid(
          row.responseHeaders.map((h) => ({
            key: h.name,
            value: h.value,
            mono: isMonoValue(h.name, h.value),
            appendText: appendJwtAwareText,
            copyName: h.name,
            chip: createJwtExpiryChip(h.value),
            subRow: responseJwtSubRows.get(h),
          })),
          'header',
        ),
      );
    }
    if (resHeadersPane.querySelector('.kv')) attachPaneSearch(resHeadersPane);

    // Response > Body and Raw — populated from the shared response cache
    setResponsePaneMessage(uiText('bodyPaneLoading'));
    cacheResponseContent(row)
      .then((cachedRow) => {
        if (!shouldRenderSelectedRow(state.selectedRow, cachedRow)) return;
        renderCachedResponseContent(cachedRow);
      })
      .catch((error) => {
        if (!shouldRenderSelectedRow(state.selectedRow, row)) return;
        const display = describeResponseContentState(row, error);
        setResponsePaneMessage(formatBodyPaneMessage(display));
        applyResponseTabSignals({ 'res-body': 0, 'res-raw': 0 });
        if (display.label === 'error') {
          setStatus(
            'Response-body retry failed for request ' +
              row.id +
              '. Open Response > Body for details.',
            true,
          );
        }
      });

    // Response > Cookies
    const resCookiesPane = $('#res-cookies');
    resCookiesPane.textContent = '';
    const setCookieHeaders = (row.responseHeaders || []).filter(
      (h) => (h.name || '').toLowerCase() === 'set-cookie',
    );
    if (setCookieHeaders.length > 0) {
      // The response date is the only anchor a Max-Age has: a duration cannot
      // name an instant on its own, and this table refuses to guess one.
      const responseDate = getHeaderValue(row.responseHeaders, 'date');
      // These rows ARE Set-Cookie response headers, so the table says 'header'
      // and every row hands the sanitizer the captured header name. The
      // cookie name the row renders is a piece this table parsed out; it never
      // reaches the gate, so it cannot make a row copy less redacted than this
      // same header's row in Response > Headers.
      const setCookieRows = setCookieHeaders.map((h) => {
        const cookie = parseSetCookieHeader(h.value);
        return {
          cookie,
          mono: isMonoValue('Set-Cookie', cookie.value),
          expiry: planCookieExpiry(cookie, responseDate),
          flags: planSetCookieFlags(cookie),
          copyLabel: cookie.name,
          copyName: h.name,
          copyValue: h.value,
        };
      });
      resCookiesPane.appendChild(createCookieTable(RESPONSE_COOKIE_COLUMNS, setCookieRows, 'header'));
    } else {
      renderPaneEmptyMessage(resCookiesPane, uiText('emptySetCookieHeaders'));
    }
    // Body and Raw are not known yet — the body is still in flight — so they
    // are left unstamped until renderCachedResponseContent reports them.
    applyResponseTabSignals({ 'res-cookies': setCookieHeaders.length }, { reset: true });

    // Response > Timing
    renderTimingTable($('#res-timing'), row);
  }

  // ============================================================
  // Section 13b: Two-Request Diff Comparison [U8]
  // ============================================================

  /**
   * Build a single diff-table row (XSS-safe).
   * state: 'match' | 'changed' | 'only-a' | 'only-b'
   */
  function createDiffRow(name, valueA, valueB, diffState) {
    const tr = document.createElement('tr');
    tr.className = 'diff-row diff-row--' + diffState;

    const nameTd = document.createElement('td');
    nameTd.className = 'diff-cell diff-cell--name';
    nameTd.textContent = name;
    tr.appendChild(nameTd);

    const aTd = document.createElement('td');
    aTd.className = 'diff-cell diff-cell--a' + (diffState === 'only-b' ? ' diff-cell--absent' : diffState === 'only-a' ? ' diff-cell--present' : diffState === 'changed' ? ' diff-cell--changed' : '');
    aTd.textContent = valueA == null ? '—' : String(valueA);
    tr.appendChild(aTd);

    const bTd = document.createElement('td');
    bTd.className = 'diff-cell diff-cell--b' + (diffState === 'only-a' ? ' diff-cell--absent' : diffState === 'only-b' ? ' diff-cell--present' : diffState === 'changed' ? ' diff-cell--changed' : '');
    bTd.textContent = valueB == null ? '—' : String(valueB);
    tr.appendChild(bTd);

    return tr;
  }

  /**
   * Build a diff table from a list of diff entries.
   * Each entry: { name, valueA, valueB, state }
   * colLabelA / colLabelB: truncated URL labels for column headers
   */
  function createDiffTable(entries, colLabelA, colLabelB) {
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'diff-empty';
      empty.textContent = '(no items)';
      return empty;
    }

    const table = document.createElement('table');
    table.className = 'diff-table';
    table.setAttribute('role', 'table');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['Name', colLabelA || 'Request A', colLabelB || 'Request B']) {
      const th = document.createElement('th');
      th.className = 'diff-cell diff-cell--header';
      th.scope = 'col';
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const entry of entries) {
      tbody.appendChild(createDiffRow(entry.name, entry.valueA, entry.valueB, entry.state));
    }
    table.appendChild(tbody);

    return table;
  }

  /**
   * Build a body comparison block (XSS-safe).
   * Shows available text or an explanatory label for missing/omitted/evicted bodies.
   */
  function createBodyComparisonBlock(bodyDesc, label) {
    const wrap = document.createElement('div');
    wrap.className = 'diff-body-block';

    const header = document.createElement('div');
    header.className = 'diff-body-header';
    header.textContent = label;
    wrap.appendChild(header);

    const content = document.createElement('div');
    content.className = 'diff-body-content';

    if (bodyDesc.stateLabel === 'available' || bodyDesc.stateLabel === 'truncated') {
      const pre = document.createElement('pre');
      pre.className = 'code-block diff-body-pre';
      pre.textContent = bodyDesc.text;
      content.appendChild(pre);
      if (bodyDesc.stateLabel === 'truncated') {
        const truncNotice = document.createElement('p');
        truncNotice.className = 'diff-body-notice diff-body-notice--truncated';
        truncNotice.textContent = '(showing ' + bodyDesc.text.length.toLocaleString() + ' of ' + bodyDesc.totalLength.toLocaleString() + ' chars — view full body in the detail panel)';
        content.appendChild(truncNotice);
      }
    } else {
      const notice = document.createElement('p');
      notice.className = 'diff-body-notice diff-body-notice--' + bodyDesc.stateLabel;
      const labels = {
        empty: '(empty body)',
        missing: '(no body)',
        omitted: '(body omitted — exceeded the 1 MiB per-body retention limit)',
        evicted: '(body evicted from the 32 MiB cache — re-select the request to retry)',
        unavailable: '(body not available)',
      };
      notice.textContent = labels[bodyDesc.stateLabel] || '(body not available)';
      content.appendChild(notice);
    }

    wrap.appendChild(content);
    return wrap;
  }

  /** Truncate a URL to fit in a narrow column header. */
  function truncateUrlLabel(url) {
    if (!url) return '(no URL)';
    try {
      const u = new URL(url);
      if (!u.host) return url.slice(0, 40);
      return (u.pathname + (u.search || '')).slice(0, 40) || u.host;
    } catch (_e) {
      return url.slice(0, 40);
    }
  }

  /**
   * Render the full two-request comparison view into the #comparePanel element.
   * Uses only data already in the row objects — never triggers a new body fetch.
   */
  function renderComparisonPanel(rowA, rowB) {
    const panel = $('#comparePanel');
    if (!panel) return;
    panel.textContent = '';

    // Labelled region relationship: the h2 heading labels the panel element.
    panel.setAttribute('role', 'region');
    const panelTitleId = 'compare-panel-title';
    panel.setAttribute('aria-labelledby', panelTitleId);

    const labelA = truncateUrlLabel(rowA.url);
    const labelB = truncateUrlLabel(rowB.url);

    // Close button + heading
    const headerRow = document.createElement('div');
    headerRow.className = 'compare-header';
    const heading = document.createElement('h2');
    heading.id = panelTitleId;
    heading.className = 'compare-title';
    heading.textContent = uiText('detailsComparingTwo');
    headerRow.appendChild(heading);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'compare-close-btn';
    closeBtn.textContent = '✕ Close';
    closeBtn.title = 'Close comparison view';
    closeBtn.setAttribute('aria-label', 'Close comparison view');
    closeBtn.addEventListener('click', () => {
      const invokingRowId = state.comparisonInvokingRowId;
      state.comparedRows = null;
      state.comparisonInvokingRowId = null;
      hideComparisonPanel();
      focusRowOrGridFallback(invokingRowId);
    });
    headerRow.appendChild(closeBtn);
    panel.appendChild(headerRow);

    // --- Column labels legend ---
    const legend = document.createElement('div');
    legend.className = 'compare-legend';
    legend.setAttribute('aria-label', 'Compared requests');
    const makeLabel = (letter, row) => {
      const item = document.createElement('div');
      item.className = 'compare-legend-item';
      const badge = document.createElement('span');
      badge.className = 'compare-legend-badge compare-legend-badge--' + letter.toLowerCase();
      badge.textContent = letter;
      badge.setAttribute('aria-hidden', 'true');
      item.appendChild(badge);
      const text = document.createElement('span');
      text.className = 'compare-legend-text';
      text.textContent = (row.method || '') + ' ' + (row.url || '');
      item.appendChild(text);
      return item;
    };
    legend.appendChild(makeLabel('A', rowA));
    legend.appendChild(makeLabel('B', rowB));
    panel.appendChild(legend);

    // --- Overview section ---
    const overviewSection = document.createElement('section');
    overviewSection.className = 'compare-section';
    const overviewHeading = document.createElement('h3');
    overviewHeading.className = 'compare-section-title';
    overviewHeading.textContent = 'Overview';
    overviewSection.appendChild(overviewHeading);
    const overviewEntries = [
      { name: 'Method',   valueA: rowA.method || '', valueB: rowB.method || '',
        state: rowA.method === rowB.method ? 'match' : 'changed' },
      { name: 'Status',   valueA: rowA.status ? String(rowA.status) + (rowA.statusText ? ' ' + rowA.statusText : '') : '',
        valueB: rowB.status ? String(rowB.status) + (rowB.statusText ? ' ' + rowB.statusText : '') : '',
        state: rowA.status === rowB.status ? 'match' : 'changed' },
      { name: 'Protocol', valueA: rowA.protocol || '', valueB: rowB.protocol || '',
        state: rowA.protocol === rowB.protocol ? 'match' : 'changed' },
      { name: 'Type',     valueA: rowA.type || '', valueB: rowB.type || '',
        state: rowA.type === rowB.type ? 'match' : 'changed' },
      { name: 'Duration', valueA: fmtTime(rowA.duration), valueB: fmtTime(rowB.duration),
        state: rowA.duration === rowB.duration ? 'match' : 'changed' },
      { name: 'Size',     valueA: fmtBytes(rowA.size), valueB: fmtBytes(rowB.size),
        state: rowA.size === rowB.size ? 'match' : 'changed' },
    ];
    overviewSection.appendChild(createDiffTable(overviewEntries, labelA, labelB));
    panel.appendChild(overviewSection);

    // --- URL / Query section ---
    const urlSection = document.createElement('section');
    urlSection.className = 'compare-section';
    const urlHeading = document.createElement('h3');
    urlHeading.className = 'compare-section-title';
    urlHeading.textContent = 'URL';
    urlSection.appendChild(urlHeading);

    const urlRowA = rowA.url || '';
    const urlRowB = rowB.url || '';
    const urlBaseEntries = [{
      name: 'Full URL',
      valueA: urlRowA,
      valueB: urlRowB,
      state: urlRowA === urlRowB ? 'match' : 'changed',
    }];
    urlSection.appendChild(createDiffTable(urlBaseEntries, labelA, labelB));

    const qHeading = document.createElement('h4');
    qHeading.className = 'compare-subsection-title';
    qHeading.textContent = 'Query Parameters';
    urlSection.appendChild(qHeading);

    let queryParamsA;
    let queryParamsB;
    try { queryParamsA = parseQueryString(urlRowA); } catch (_e) { queryParamsA = []; }
    try { queryParamsB = parseQueryString(urlRowB); } catch (_e) { queryParamsB = []; }
    const queryDiff = diffQueryParams(queryParamsA, queryParamsB);
    urlSection.appendChild(createDiffTable(queryDiff, labelA, labelB));
    panel.appendChild(urlSection);

    // --- Request Headers section ---
    const reqHdrSection = document.createElement('section');
    reqHdrSection.className = 'compare-section';
    const reqHdrHeading = document.createElement('h3');
    reqHdrHeading.className = 'compare-section-title';
    reqHdrHeading.textContent = 'Request Headers';
    reqHdrSection.appendChild(reqHdrHeading);
    reqHdrSection.appendChild(createDiffTable(diffHeaders(rowA.requestHeaders, rowB.requestHeaders), labelA, labelB));
    panel.appendChild(reqHdrSection);

    // --- Response Headers section ---
    const resHdrSection = document.createElement('section');
    resHdrSection.className = 'compare-section';
    const resHdrHeading = document.createElement('h3');
    resHdrHeading.className = 'compare-section-title';
    resHdrHeading.textContent = 'Response Headers';
    resHdrSection.appendChild(resHdrHeading);
    resHdrSection.appendChild(createDiffTable(diffHeaders(rowA.responseHeaders, rowB.responseHeaders), labelA, labelB));
    panel.appendChild(resHdrSection);

    // --- Request Bodies section ---
    const reqBodySection = document.createElement('section');
    reqBodySection.className = 'compare-section';
    const reqBodyHeading = document.createElement('h3');
    reqBodyHeading.className = 'compare-section-title';
    reqBodyHeading.textContent = 'Request Bodies';
    reqBodySection.appendChild(reqBodyHeading);
    const reqBodyWrap = document.createElement('div');
    reqBodyWrap.className = 'compare-bodies';
    reqBodyWrap.appendChild(createBodyComparisonBlock(describeRequestBodyForComparison(rowA), 'A — ' + labelA));
    reqBodyWrap.appendChild(createBodyComparisonBlock(describeRequestBodyForComparison(rowB), 'B — ' + labelB));
    reqBodySection.appendChild(reqBodyWrap);
    panel.appendChild(reqBodySection);

    // --- Response Bodies section ---
    const bodySection = document.createElement('section');
    bodySection.className = 'compare-section';
    const bodyHeading = document.createElement('h3');
    bodyHeading.className = 'compare-section-title';
    bodyHeading.textContent = 'Response Bodies';
    bodySection.appendChild(bodyHeading);
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'compare-bodies';
    bodyWrap.appendChild(createBodyComparisonBlock(describeBodyForComparison(rowA), 'A — ' + labelA));
    bodyWrap.appendChild(createBodyComparisonBlock(describeBodyForComparison(rowB), 'B — ' + labelB));
    bodySection.appendChild(bodyWrap);
    panel.appendChild(bodySection);
  }

  function showComparisonPanel() {
    showDetailsPanel();
    // The comparison keeps its own header; no single request's tooltip, copy
    // button, or summary strip may stay behind next to it.
    resetDetailsHeader();
    const panel = $('#comparePanel');
    const inspectorPanels = $('.inspector-panels');
    const emptyState = $('#inspectorEmptyState');
    if (panel) { panel.hidden = false; panel.removeAttribute('aria-hidden'); }
    if (inspectorPanels) { inspectorPanels.hidden = true; inspectorPanels.setAttribute('aria-hidden', 'true'); }
    if (emptyState) emptyState.hidden = true;
    // Move focus into the comparison panel after the context menu has finished closing
    setTimeout(() => {
      const closeBtn = panel && panel.querySelector('.compare-close-btn');
      if (closeBtn) closeBtn.focus();
    }, 0);
  }

  function hideComparisonPanel() {
    const panel = $('#comparePanel');
    const inspectorPanels = $('.inspector-panels');
    if (panel) { panel.hidden = true; panel.setAttribute('aria-hidden', 'true'); }
    if (inspectorPanels) { inspectorPanels.hidden = false; inspectorPanels.removeAttribute('aria-hidden'); }
    clearDetailsPanel();
  }

  // ============================================================
  // Section 14: Export [U1][U2]
  // ============================================================
  function getExportRows() {
    // [U2] Export only filtered (displayed) rows — including the search
    // matches-only toggle, so the exported set is exactly what the list shows.
    filterRows();
    refreshSearchMatches();
    return planVisibleSearchRows(
      state.filteredRows,
      state.search.rowColors,
      state.search.matchesOnly,
      hasActiveSearchKeywords(state.search.keywords),
    );
  }

  // The selected-rows export scope keeps capture order and means exactly the
  // rows the user picked — a later filter change never silently narrows it.
  function planSelectedExportRows(allRows, selectedRowsSet, selectedRow) {
    const rows = Array.isArray(allRows) ? allRows : [];
    if (selectedRowsSet && selectedRowsSet.size > 0) {
      return rows.filter((row) => selectedRowsSet.has(row));
    }
    return selectedRow && rows.includes(selectedRow) ? [selectedRow] : [];
  }

  function getSelectedExportRows() {
    return planSelectedExportRows(state.rows, state.selectedRows, state.selectedRow);
  }

  function buildHarLogFromRows(rows, responseContents) {
    const pageref = 'page_1';
    const entries = [];
    for (const r of rows) {
      const started = r.startedDateTime || new Date().toISOString();
      const url = r.url || '';
      const httpVersion = r.protocol || 'HTTP/2';
      const reqHeaders = toHarHeaders(r.requestHeaders);
      const resHeaders = toHarHeaders(r.responseHeaders);
      const postData = r.requestPostData
        ? { mimeType: r.requestPostData.mimeType || '', text: r.requestPostData.text || '' }
        : null;
      // [U1] Preserve response body text and its transfer encoding in HAR.
      const content = responseContents && responseContents.has(r)
        ? responseContents.get(r)
        : buildHarResponseContent(r);
      const timings = { blocked: -1, dns: -1, connect: -1, ssl: -1, send: -1, wait: -1, receive: -1 };
      const t = r.timings || {};
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
      if (Array.isArray(r._wsFrames) && r._wsFrames.length > 0) {
        // Chrome's WebSocket-entry extension key, written the way Chrome
        // writes it (epoch seconds, opcode 1 text) so DevTools and other
        // HAR tools read the conversation back. Binary frames were only
        // captured as size placeholders, so they export as opcode 2
        // without data, and every fidelity loss is declared on the entry.
        entry._webSocketMessages = r._wsFrames.map((frame) => {
          const message = {
            type: frame.type,
            time: Number.isFinite(frame.time) ? frame.time / 1000 : 0,
            opcode: frame.binary ? 2 : 1,
          };
          if (!frame.binary) message.data = frame.data;
          return message;
        });
        const droppedFrames = r._wsFramesDropped || 0;
        const binaryFrames = r._wsFrames.filter((frame) => frame.binary).length;
        if (droppedFrames > 0 || binaryFrames > 0) {
          entry._networkPlus = {
            webSocketExport: {
              droppedFrames,
              binaryFramesWithoutPayload: binaryFrames,
              textPreviewLimit: WS_FRAME_PREVIEW_CHARS,
            },
          };
        }
      }
      entries.push(entry);
    }
    const now = new Date().toISOString();
    return {
      log: {
        version: '1.2',
        creator: { name: 'Network+ for DevTools', version: getExtensionVersion() },
        pages: [{ startedDateTime: now, id: pageref, title: 'Network+', pageTimings: {} }],
        entries,
      },
    };
  }

  // CSV is a sanitized-only, metadata-only view for spreadsheet triage
  // (pivot by domain, histogram durations). Headers and bodies never join
  // it; the full HAR stays the only complete-output path.
  function exportCsv(scope) {
    const exportScope = scope === 'selected' ? 'selected' : 'displayed';
    const rows = (exportScope === 'selected' ? getSelectedExportRows() : getExportRows()).slice();
    if (exportScope === 'selected' && rows.length === 0) {
      setStatus('No selected requests to export.');
      return;
    }
    const payload = buildCsvPayload(rows);
    if (!payload.ok) {
      setStatus('CSV export failed during sanitization. No file was downloaded.');
      return;
    }
    const blob = new Blob([payload.text], { type: 'text/csv' });
    triggerObjectUrlDownload(
      URL.createObjectURL(blob),
      'network-plus-sanitized' + (exportScope === 'selected' ? '-selected' : '') + '.csv',
    );
    setStatus(
      'Exported sanitized CSV for ' +
        rows.length +
        (exportScope === 'selected' ? ' selected requests.' : ' requests.'),
    );
  }

  async function exportHAR(policy) {
    const outboundPolicy = policy || { mode: 'sanitized' };
    if (outboundPolicy.mode === 'full' && !isFullOutputAuthorized(outboundPolicy)) {
      setStatus('Full HAR export requires one-time confirmation. No file was downloaded.');
      return;
    }
    const exportScope = outboundPolicy.scope === 'selected' ? 'selected' : 'displayed';
    const rows = (exportScope === 'selected' ? getSelectedExportRows() : getExportRows()).slice();
    if (exportScope === 'selected' && rows.length === 0) {
      setStatus('No selected requests to export.');
      return;
    }
    const exportButton = $('#exportHarBtn');
    let objectUrl = null;
    exportButton.disabled = true;
    setStatus('Preparing ' + (outboundPolicy.mode === 'full' ? 'full' : 'sanitized') + ' HAR export...');
    try {
      const responseContents = new Map();
      let unavailableCount = 0;
      // Bodies resolve with small bounded concurrency: a serial walk turns
      // thousands of uncached DevTools round-trips (10 s timeout each)
      // into minutes, while an unbounded fan-out would spike memory with
      // in-flight bodies. Four matches the prefetch background budget.
      const pendingRows = rows.slice();
      await Promise.all(
        Array.from({ length: Math.min(HAR_EXPORT_BODY_CONCURRENCY, pendingRows.length) }, async () => {
          while (pendingRows.length > 0) {
            const row = pendingRows.shift();
            const content = await resolveHarResponseContent(row);
            responseContents.set(row, content);
            if (content._networkPlus) unavailableCount += 1;
          }
        }),
      );
      const fullHar = buildHarLogFromRows(rows, responseContents);
      const har = createOutboundPayload(
        outboundPolicy,
        () => sanitizeHar(fullHar),
        () => fullHar,
      );
      if (outboundPolicy.mode !== 'full' && har.log._networkPlus.failedClosed) {
        throw new Error('sanitization-failed-closed');
      }
      const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
      objectUrl = URL.createObjectURL(blob);
      const downloadUrl = objectUrl;
      objectUrl = null;
      const scopeSuffix = exportScope === 'selected' ? '-selected' : '';
      const scopeLabel = exportScope === 'selected' ? ' selected requests' : ' requests';
      triggerObjectUrlDownload(
        downloadUrl,
        outboundPolicy.mode === 'full'
          ? 'network-plus-full' + scopeSuffix + '.har'
          : 'network-plus-sanitized' + scopeSuffix + '.har',
      );
      if (outboundPolicy.mode === 'full') {
        setStatus('Exported full HAR for ' + rows.length + scopeLabel + ' after one-time confirmation.');
      } else {
        const counts = har.log._networkPlus.counts;
        setStatus(
          'Exported sanitized HAR for ' +
            rows.length +
            scopeLabel +
            '; ' +
            counts.redactedValues +
            ' values redacted, ' +
            counts.omittedBodies +
            ' bodies omitted' +
            (unavailableCount > 0 ? ', ' + unavailableCount + ' source bodies unavailable' : '') +
            '.',
        );
      }
    } catch (error) {
      // Two materially different next steps hide behind one generic line:
      // a sanitizer fail-closed must be reported (retrying cannot help),
      // while a build failure is worth retrying or narrowing the scope.
      // Static text only — never the raw error message.
      setStatus(
        error && error.message === 'sanitization-failed-closed'
          ? 'HAR export failed: sanitization failed closed, so nothing left the sanitizer. No file was downloaded.'
          : 'HAR export failed while building the file; retry or narrow the scope. No file was downloaded.',
      );
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      exportButton.disabled = false;
    }
  }

  // ============================================================
  // Section 15: Initialization [U4][U5][U6][U7]
  // ============================================================
  function init() {
    loadColumnPrefs();
    loadColumnPins();
    loadCustomHeaderColumnName();
    state.domainSummaryVisible = loadDomainSummaryPref();
    loadRetentionSetting();
    initializeDataSafetyDialog();
    initializeSampleGuideDialog();
    initializeSampleCaptureExitActions();
    initializeStatusDetailsDisclosure();
    setStatus('panel.js loaded');

    const toolbar = $('.topbar');
    toolbar.addEventListener('focusin', (event) => {
      const action = event.target.closest('button');
      if (!action || !toolbar.contains(action)) return;
      if (document.activeElement !== action) return;
      if (!action.matches(':focus-visible')) return;
      action.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    const pendingLiveRows = state.pendingLiveRows;
    let pendingLiveFrame = false;
    let pendingScrollToBottom = false;
    let pendingResponseSearchFrame = false;
    const resetPendingLiveRows = () => {
      pendingLiveRows.length = 0;
      state.liveRowsAwaitingRender.length = 0;
      pendingScrollToBottom = false;
    };

    // Theme and language init; both selects live in the Settings dialog
    // and apply immediately on change (retention keeps its explicit Save).
    loadThemePref((pref, warn) => {
      applyTheme(pref);
      if (warn) setStatus(warn);
    });
    const themeSelect = $('#themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', () => {
        const chosen = THEMES.includes(themeSelect.value) ? themeSelect.value : 'system';
        saveThemePref(chosen);
        applyTheme(chosen);
      });
    }
    loadLangPref((pref, warn) => {
      applyLanguage(pref);
      if (warn) setStatus(warn);
    });
    const langSelect = $('#langSelect');
    if (langSelect) {
      langSelect.addEventListener('change', () => {
        const chosen = LANGS.includes(langSelect.value) ? langSelect.value : 'system';
        saveLangPref(chosen);
        applyLanguage(chosen);
      });
    }
    // The DevTools panel and the mirror tab share chrome.storage.local, but
    // a DevTools panel only reloads by closing DevTools — so preference
    // changes made in one page apply to the other live instead of never.
    try {
      if (chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local' || !changes) return;
          if (changes[THEME_KEY] && typeof changes[THEME_KEY].newValue === 'string') {
            applyTheme(changes[THEME_KEY].newValue);
          }
          if (changes[LANG_KEY] && typeof changes[LANG_KEY].newValue === 'string') {
            applyLanguage(changes[LANG_KEY].newValue);
          }
        });
      }
    } catch (_error) {
      // Without observable storage each page simply keeps its own copy.
    }

    // Settings dialog (language, theme, and request retention)
    const settingsButton = $('#settingsBtn');
    // Assigned below once the retention form exists; the mirror-host
    // command executor calls it for the tab's remote retention changes.
    let applyRetentionSetting = null;
    let scrollGridToNewest = null;
    // Assigned by the import wiring; shared by the file picker and the
    // mirror tab's transferred imports.
    let importCapturedFile = null;
    const settingsDialog = $('#settingsDialog');
    const retentionLimitInput = $('#retentionLimit');
    const retentionUnlimitedInput = $('#retentionUnlimited');
    const retentionWarning = $('#retentionWarning');
    const retentionError = $('#retentionError');
    const syncRetentionForm = () => {
      retentionLimitInput.value = String(state.retention.requestLimit);
      retentionUnlimitedInput.checked = state.retention.unlimited;
      retentionLimitInput.disabled = state.retention.unlimited;
      retentionWarning.hidden = !state.retention.unlimited;
      retentionLimitInput.removeAttribute('aria-invalid');
      retentionError.textContent = '';
      retentionError.hidden = true;
    };
    settingsButton.addEventListener('click', () => {
      syncRetentionForm();
      settingsButton.setAttribute('aria-expanded', 'true');
      settingsDialog.showModal();
      const langControl = $('#langSelect');
      if (langControl) langControl.focus();
    });
    retentionUnlimitedInput.addEventListener('change', () => {
      retentionLimitInput.disabled = retentionUnlimitedInput.checked;
      retentionWarning.hidden = !retentionUnlimitedInput.checked;
    });
    settingsDialog.addEventListener('close', () => {
      settingsButton.setAttribute('aria-expanded', 'false');
      settingsButton.focus();
    });
    $('#settingsCloseBtn').addEventListener('click', () => settingsDialog.close());
    // Shared by the dialog Save button and the mirror tab's remote
    // retention command; returns an error string instead of applying when
    // the requested limit is out of range.
    applyRetentionSetting = (requestedSetting) => {
      commitPendingLiveRows();
      const normalized = normalizeRetentionSetting({
        unlimited: requestedSetting.unlimited === true,
        requestLimit: Number(requestedSetting.requestLimit),
      });
      if (normalized.warning && requestedSetting.unlimited !== true) {
        return (
          'Retention limit must be a whole number from ' +
          MIN_REQUEST_RETENTION_LIMIT.toLocaleString() +
          ' to ' +
          MAX_REQUEST_RETENTION_LIMIT.toLocaleString() +
          '.'
        );
      }
      state.retention.requestLimit = normalized.setting.requestLimit;
      state.retention.unlimited = normalized.setting.unlimited;
      const settingSaved = saveRetentionSetting();
      addRowsWithRetention([], 'settings');
      renderBody();
      updateRetentionStatus();
      queueRetentionSummary(
        state.retention.unlimited
          ? 'Unlimited request retention enabled'
          : 'Request retention changed to ' + state.retention.requestLimit.toLocaleString() + ' requests',
      );
      setStatus(
        settingSaved
          ? state.retention.unlimited
            ? 'Unlimited request retention enabled with warning'
            : 'Retention setting saved'
          : state.retention.settingWarning,
      );
      return '';
    };
    $('#retentionSaveBtn').addEventListener('click', () => {
      const applyError = applyRetentionSetting({
        unlimited: retentionUnlimitedInput.checked,
        requestLimit: Number(retentionLimitInput.value),
      });
      if (applyError) {
        retentionLimitInput.setAttribute('aria-invalid', 'true');
        retentionError.textContent =
          'The request limit must be a whole number from 100 to 100,000. Enter a value in that range.';
        retentionError.hidden = false;
        setStatus(applyError);
        return;
      }
      settingsDialog.close();
    });
    updateRetentionStatus();
    if (state.retention.settingWarning) queueRetentionSummary(state.retention.settingWarning);

    const clearButton = $('#clearBtn');
    const undoClearButton = $('#undoClearBtn');
    const detailsCloseButton = $('#detailsCloseBtn');
    if (detailsCloseButton) detailsCloseButton.addEventListener('click', closeDetailsPanel);
    // The same sanitized-URL payload as the row context menu; the toast is
    // localized because this button sits in the pane the language switch owns.
    const detailsCopyUrlButton = $('#detailsCopyUrlBtn');
    if (detailsCopyUrlButton) {
      detailsCopyUrlButton.addEventListener('click', () => {
        if (!state.selectedRow || state.comparedRows) return;
        copySanitizedAction('url', state.selectedRow, '', uiText('statusCopiedSanitizedUrl'));
      });
    }

    const restoreSearchNavigation = (restorePlan) => {
      state.search.currentIndex = restorePlan.searchCurrentRow
        ? state.search.matches.indexOf(restorePlan.searchCurrentRow)
        : -1;
      for (const [keywordIndex, currentRow] of restorePlan.searchPerKeywordCurrentRows) {
        const keywordState = state.search.perKeyword.get(keywordIndex);
        if (!keywordState) continue;
        keywordState.currentIndex = keywordState.matches.indexOf(currentRow);
      }
    };

    const restoreClearUndoSnapshot = (snapshot) => {
      const restorePlan = createClearUndoRestorePlan(snapshot, state.retainedRows);
      if (restorePlan.rows.length === 0) {
        clearButton.focus({ preventScroll: true });
        setStatus('Nothing from the last Clear remains available to restore.');
        return;
      }
      const activeRows = state.rows.slice();
      if (restorePlan.sampleCaptureActive && activeRows.length > 0) {
        cleanupEvictedRowReferences(restorePlan.rows, false);
        clearButton.focus({ preventScroll: true });
        setStatus('The cleared local sample could not be restored after live traffic arrived.');
        return;
      }
      const activeRowSet = new Set(activeRows);
      const activeHighlights = Array.from(state.highlightedRows.entries()).filter(([row]) =>
        activeRowSet.has(row),
      );
      state.rows = restorePlan.rows.concat(activeRows).sort((a, b) => a.id - b.id);
      for (const row of restorePlan.rows) state.activeRows.add(row);
      if (state.automaticResponsePrefetchScheduler) {
        state.automaticResponsePrefetchScheduler.resumeRows(restorePlan.rows);
      }
      state.columnFilterRules = restorePlan.columnFilterRules;
      state.sort = restorePlan.sort;
      state.paused = restorePlan.paused;
      state.autoScroll = restorePlan.autoScroll;
      state.sampleCaptureActive = restorePlan.sampleCaptureActive;
      state.sampleCapturePreviousPaused = restorePlan.sampleCapturePreviousPaused;
      state.sampleCapturePreviousColumnFilterRules =
        restorePlan.sampleCapturePreviousColumnFilterRules;
      state.search.keywords = restorePlan.searchKeywords;
      state.search.scope = restorePlan.searchScope;
      state.search.matchesOnly = restorePlan.searchMatchesOnly;
      state.search.options = restorePlan.searchOptions;
      state.search.matches = [];
      state.search.currentIndex = -1;
      state.search.rowColors.clear();
      state.search.rowKeywords.clear();
      state.search.perKeyword.clear();
      state.selectedRow = null;
      state.focusedRow = null;
      state.selectedRows.clear();
      state.highlightedRows = new Map(activeHighlights);
      state.comparedRows = null;
      state.comparisonInvokingRowId = null;
      hideComparisonPanel();
      clearDetailsPanel();
      if (restorePlan.selectedRow) selectRow(restorePlan.selectedRow, null, false);
      state.selectedRow = restorePlan.selectedRow;
      state.focusedRow = restorePlan.focusedRow;
      state.selectedRows = new Set(restorePlan.selectedRows);
      for (const [row, colorClass] of restorePlan.highlightedRows) {
        state.highlightedRows.set(row, colorClass);
      }
      state.comparedRows = restorePlan.comparedRows;
      state.comparisonInvokingRowId = restorePlan.comparisonInvokingRowId;
      const focusRow = restorePlan.focusedRow || restorePlan.selectedRow || restorePlan.rows[0];
      state.pendingRowFocusId = focusRow ? String(focusRow.id) : null;
      updateRecordState(false);
      syncSearchScopeControls();
      toggleSearchPanel(restorePlan.searchPanelVisible, false);
      render();
      restoreSearchNavigation(restorePlan);
      updateSearchUI();
      if (restorePlan.comparedRows) {
        setDetailsTitleText(uiText('detailsComparingTwo'));
        renderComparisonPanel(restorePlan.comparedRows[0], restorePlan.comparedRows[1]);
        showComparisonPanel();
      }
      const activeRow =
        document.activeElement && document.activeElement.closest
          ? document.activeElement.closest('tr[data-row-id]')
          : null;
      if (!activeRow) {
        const fallbackRow = $('#tbody') ? $('#tbody').querySelector('tr[tabindex="0"]') : null;
        if (fallbackRow) fallbackRow.focus({ preventScroll: true });
        else clearButton.focus({ preventScroll: true });
      }
      updateRetentionStatus();
      const missingCount = Math.max(0, restorePlan.originalCount - restorePlan.rows.length);
      setStatus(
        'Restored ' +
          formatRequestCount(restorePlan.rows.length) +
          ' from the last Clear' +
          (missingCount > 0
            ? '; ' + formatRequestCount(missingCount) + ' had already been evicted by retention.'
            : '.'),
      );
    };

    // [U4] Clear — reset visible working state and retain one bounded Undo snapshot.
    clearButton.addEventListener('click', () => {
      commitPendingLiveRows();
      disposeClearUndoSnapshot('clear');
      const snapshot = createClearUndoSnapshot(searchPanelVisible);
      const clearedSampleCapture = snapshot.sampleCaptureActive;
      resetPendingLiveRows();
      detachStoredRowsForClearUndo();
      state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();
      state.selectedRow = null;
      state.focusedRow = null;
      state.pendingRowFocusId = null;
      state.selectedRows.clear();
      state.highlightedRows.clear();
      state.comparedRows = null;
      state.comparisonInvokingRowId = null;
      hideComparisonPanel();
      // Reset search
      state.search.keywords = [];
      state.search.scope = DEFAULT_SEARCH_SCOPE();
      state.search.matches = [];
      state.search.currentIndex = -1;
      state.search.rowColors.clear();
      state.search.rowKeywords.clear();
      state.search.perKeyword.clear();
      updateRecordState(false);
      render();
      syncSearchScopeControls();
      toggleSearchPanel(searchPanelVisible, false);
      updateSearchUI();
      updateRetentionStatus();
      clearDetailsPanel();
      const undoAvailable = armClearUndoSnapshot(snapshot);
      clearButton.focus({ preventScroll: true });
      const undoMessage = undoAvailable
        ? ' Undo available for ' + CLEAR_UNDO_TIMEOUT_MS / 1000 + ' seconds.'
        : '';
      setStatus(
        clearedSampleCapture
          ? state.paused
            ? 'Local sample capture cleared. Recording remains paused.' + undoMessage
            : 'Local sample capture cleared. Live capture resumed.' + undoMessage
          : snapshot.originalCount > 0
            ? 'Cleared ' + formatRequestCount(snapshot.originalCount) + '.' + undoMessage
            : 'Cleared',
      );
    });
    const keyboardPlatform = getKeyboardPlatform();
    document.addEventListener(
      'keydown',
      (event) => {
        if (!isClearNetworkLogShortcut(event, keyboardPlatform) || isClearShortcutBlocked()) return;
        event.preventDefault();
        event.stopPropagation();
        clearButton.click();
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (!isPopoutShortcut(event, keyboardPlatform)) return;
        const popoutControl = $('#popoutBtn');
        // Hidden means no DevTools session here (mirror tab or plain page).
        if (!popoutControl || popoutControl.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        popoutControl.click();
      },
      true,
    );
    undoClearButton.addEventListener('click', () => {
      commitPendingLiveRows();
      const consumed = consumeClearUndoSnapshot('undo');
      if (!consumed || consumed.disposition !== 'restore') {
        clearButton.focus({ preventScroll: true });
        setStatus('Nothing is available to undo.');
        return;
      }
      resetPendingLiveRows();
      restoreClearUndoSnapshot(consumed.snapshot);
    });

    // Pause/Resume
    const pauseBtn = $('#pauseBtn');
    pauseBtn.addEventListener('click', () => {
      if (state.sampleCaptureActive) {
        setStatus('Clear the local sample capture before resuming live recording.');
        return;
      }
      state.paused = !state.paused;
      updateRecordState();
      updateEmptyState(state.filteredRows.length);
    });
    updateRecordState();

    // Export
    $('#exportHarBtn').addEventListener('click', (event) => {
      commitPendingLiveRows();
      openExportSafetyDialog(event.currentTarget);
    });

    // Column settings menu and filter dialog
    const columnsContextMenu = document.createElement('div');
    columnsContextMenu.id = 'columnsMenu';
    columnsContextMenu.className = 'filter-dropdown-content dropdown-content';
    columnsContextMenu.style.position = 'fixed';
    columnsContextMenu.style.display = 'none';
    columnsContextMenu.setAttribute('role', 'menu');
    installPopupKeyboardSupport(columnsContextMenu);
    document.body.appendChild(columnsContextMenu);

    const filterPopup = document.createElement('div');
    filterPopup.id = 'columnFilterPopup';
    filterPopup.className = 'filter-popup dropdown-content';
    filterPopup.style.position = 'fixed';
    filterPopup.style.display = 'none';
    filterPopup.setAttribute('role', 'dialog');
    filterPopup.setAttribute('aria-label', 'Column filters');
    installPopupKeyboardSupport(filterPopup);
    document.body.appendChild(filterPopup);

    const openFilterPopup = (x, y, focusColId, trigger) => {
      filterPopup.textContent = '';
      if (focusColId) {
        filterPopup.appendChild(createSingleColumnFilterContent(focusColId, renderBody));
      } else {
        filterPopup.appendChild(createFilterPopupContent(renderBody));
      }
      showAccessiblePopupAt(filterPopup, x, y, trigger);
    };

    // The checkboxes read as three questions — which request, when, what —
    // instead of one 16-item list. Match leads Identity as the state gutter.
    const COLUMN_MENU_GROUPS = [
      {
        key: 'columnsGroupIdentity',
        ids: ['match', 'id', 'method', 'status', 'domain', 'path', 'url', 'operation', 'customHeader'],
      },
      { key: 'columnsGroupTiming', ids: ['clientStart', 'serverDone', 'duration', 'waterfall'] },
      { key: 'columnsGroupPayload', ids: ['type', 'size', 'initiator'] },
    ];

    const renderColumnsContextMenu = () => {
      columnsContextMenu.textContent = '';
      // Rebuilt on every open, so the name follows a language switch made
      // while the menu was closed.
      columnsContextMenu.setAttribute('aria-label', uiText('columnsMenuLabel'));

      // Every header action rebuilds the menu, so focus is handed back to
      // its first item rather than left on a detached button.
      const refocusColumnsMenu = () => {
        const firstItem = getPopupFocusableItems(columnsContextMenu, true)[0];
        if (firstItem) firstItem.focus();
      };
      const createColumnsHeaderButton = (label, onActivate) => {
        const button = document.createElement('button');
        button.textContent = label;
        button.className = 'context-menu-item columns-header-action';
        button.setAttribute('role', 'menuitem');
        button.addEventListener('click', () => {
          onActivate();
          saveColumnPrefs();
          render();
          renderColumnsContextMenu();
          refocusColumnsMenu();
        });
        return button;
      };
      const btnRow = document.createElement('div');
      btnRow.className = 'columns-header-actions';
      btnRow.appendChild(
        createColumnsHeaderButton(uiText('columnsSelectAll'), () => {
          state.columns.forEach((column) => { column.visible = true; });
        }),
      );
      btnRow.appendChild(
        createColumnsHeaderButton(uiText('columnsDeselectAll'), () => {
          state.columns.forEach((column) => { column.visible = false; });
          // Same reasoning as the per-column untick and Reset: hiding a
          // column drops its opt-out rather than leaving a pin the reader can
          // neither see nor undo. Doing it in bulk is still doing it.
          if (state.pinnedColumnIds.size > 0) {
            state.pinnedColumnIds.clear();
            saveColumnPins();
          }
        }),
      );
      // Reset restores the factory visibility and widths only: the column
      // order, the filters, and the bound header name are the person's.
      const resetBtn = createColumnsHeaderButton(uiText('columnsReset'), () => {
        applyDefaultColumnLayout(state.columns, DEFAULT_COLUMNS);
        // Pinning a column back is a choice like visibility, so the factory
        // restore clears it too rather than leaving an invisible opt-out.
        state.pinnedColumnIds.clear();
        saveColumnPins();
        setStatus(uiText('columnsResetStatus'));
      });
      resetBtn.title = uiText('columnsResetTitle');
      btnRow.appendChild(resetBtn);
      columnsContextMenu.appendChild(btnRow);

      // The grid differs from the configuration this menu names whenever the
      // wrap dropped a column, so the difference is stated here rather than
      // left for the reader to notice a column missing.
      const autoHiddenColumns = state.columns.filter(
        (column) => column.visible && state.autoHiddenColumnIds.has(column.id),
      );
      if (autoHiddenColumns.length > 0) {
        const autoHiddenNote = document.createElement('div');
        autoHiddenNote.className = 'columns-autohide-note';
        autoHiddenNote.textContent = uiTextFormat('columnsAutoHiddenNote', {
          // Every other counted frame in the panel formats through the same
          // locale, so this one does too rather than being the odd number out.
          count: autoHiddenColumns.length.toLocaleString('en-US'),
        });
        columnsContextMenu.appendChild(autoHiddenNote);
      }

      const appendColumnItem = (current) => {
        const item = document.createElement('button');
        item.className = 'context-menu-item';
        item.dataset.columnId = current.id;
        item.setAttribute('role', 'menuitemcheckbox');
        item.setAttribute('aria-checked', String(current.visible));
        // Auto-hidden is not unchecked: the box keeps saying what the reader
        // chose and only dims, so the state stays legible as "you asked for
        // this, the wrap could not hold it".
        const autoHidden = current.visible && state.autoHiddenColumnIds.has(current.id);
        item.classList.toggle('column-auto-hidden', autoHidden);
        const updateItem = () => {
          // The grid header keeps current.label; the menu reads the same
          // menu-only lookup the row menu's sentences use, so the runtime
          // name of the custom-header column still wins there.
          item.textContent = (current.visible ? '☑ ' : '☐ ') + menuColumnLabel(current.id, current.label);
          item.setAttribute('aria-checked', String(current.visible));
        };
        updateItem();
        item.addEventListener('click', () => {
          current.visible = !current.visible;
          // Hiding a column by hand also drops its opt-out. Left behind, the
          // pin would come back invisibly with the column and make it exempt
          // from the fit for good, with nothing on screen saying why.
          if (!current.visible && state.pinnedColumnIds.delete(current.id)) saveColumnPins();
          saveColumnPrefs();
          render();
          // Freeing a column's width can bring others back, so the dimming
          // and the count are rebuilt rather than left describing the old
          // fit; focus stays on the same column's checkbox.
          renderColumnsContextMenu();
          const restored = columnsContextMenu.querySelector('[data-column-id="' + current.id + '"]');
          if (restored) restored.focus();
        });
        columnsContextMenu.appendChild(item);
        // The opt-out row is offered while the wrap is dropping the column and
        // stays afterwards as the state it produced: a pin with nothing left
        // on screen is a pin the reader can neither see nor undo.
        const pinned = state.pinnedColumnIds.has(current.id);
        if (!current.visible || (!autoHidden && !pinned)) return;
        const columnName = menuColumnLabel(current.id, current.label);
        const pinAction = pinned
          ? uiTextFormat('columnsShowAnywayUndoLabel', { column: columnName })
          : uiTextFormat('columnsShowAnywayLabel', { column: columnName });
        const showAnyway = document.createElement('button');
        showAnyway.className = 'context-menu-item columns-show-anyway';
        showAnyway.classList.toggle('column-pinned', pinned);
        showAnyway.dataset.pinColumnId = current.id;
        // Still a plain menuitem, so the menu's checkbox count keeps counting
        // the visibility boxes; the state it is in is in the label and in the
        // aria-label that names the column, not in a second checked role.
        showAnyway.setAttribute('role', 'menuitem');
        showAnyway.textContent = uiText(pinned ? 'columnsShowAnywayPinned' : 'columnsShowAnyway');
        showAnyway.setAttribute('aria-label', pinAction);
        showAnyway.title = pinAction;
        showAnyway.addEventListener('click', () => {
          if (pinned) state.pinnedColumnIds.delete(current.id);
          else state.pinnedColumnIds.add(current.id);
          saveColumnPins();
          setStatus(
            pinned
              ? uiTextFormat('columnsShowAnywayUndoStatus', { column: columnName })
              : uiTextFormat('columnsShowAnywayStatus', { column: columnName }),
          );
          render();
          renderColumnsContextMenu();
          // Back to the row that was clicked when it is still there — undoing
          // a pin can auto-hide the column again and keep it — otherwise to
          // the checkbox it belongs to.
          const restored =
            columnsContextMenu.querySelector('[data-pin-column-id="' + current.id + '"]') ||
            columnsContextMenu.querySelector('[data-column-id="' + current.id + '"]');
          if (restored) restored.focus();
          else refocusColumnsMenu();
        });
        columnsContextMenu.appendChild(showAnyway);
      };
      const groupedIds = new Set();
      for (const group of COLUMN_MENU_GROUPS) {
        const members = group.ids
          .map((id) => state.columns.find((column) => column.id === id))
          .filter(Boolean);
        if (members.length === 0) continue;
        const groupHint = document.createElement('div');
        groupHint.className = 'columns-preset-hint columns-group-hint';
        groupHint.textContent = uiText(group.key);
        columnsContextMenu.appendChild(groupHint);
        members.forEach((column) => {
          groupedIds.add(column.id);
          appendColumnItem(column);
        });
      }
      // A column outside every group still has to be reachable.
      state.columns.filter((column) => !groupedIds.has(column.id)).forEach(appendColumnItem);

      // The configurable header column: type a header name, Apply binds
      // the column to it (and shows it if it was hidden).
      const headerSection = document.createElement('div');
      headerSection.className = 'columns-header-section';
      const headerHint = document.createElement('div');
      headerHint.className = 'columns-preset-hint';
      headerHint.textContent = uiText('columnsHeaderColumn');
      headerSection.appendChild(headerHint);
      const headerRow = document.createElement('div');
      headerRow.className = 'columns-header-row';
      const headerInput = document.createElement('input');
      headerInput.type = 'text';
      headerInput.id = 'customHeaderNameInput';
      headerInput.placeholder = 'x-request-id';
      headerInput.spellcheck = false;
      headerInput.value = customHeaderColumnName;
      headerInput.setAttribute('aria-label', uiText('columnsHeaderNameLabel'));
      const headerApply = document.createElement('button');
      headerApply.id = 'customHeaderApplyBtn';
      headerApply.className = 'context-menu-item columns-preset-apply';
      headerApply.setAttribute('role', 'menuitem');
      headerApply.textContent = uiText('columnsHeaderApply');
      headerApply.addEventListener('click', () => {
        saveCustomHeaderColumnName(headerInput.value);
        const column = state.columns.find((c) => c.id === 'customHeader');
        if (column && customHeaderColumnName && !column.visible) {
          column.visible = true;
          saveColumnPrefs();
        }
        render();
        renderColumnsContextMenu();
      });
      headerRow.appendChild(headerInput);
      headerRow.appendChild(headerApply);
      headerSection.appendChild(headerRow);
      columnsContextMenu.appendChild(headerSection);

      // The per-domain summary is a view mode, but the toolbar's button set
      // is pinned by the responsive-fit journeys, so its toggle lives here
      // with the other view configuration.
      const domainSection = document.createElement('div');
      domainSection.className = 'columns-header-section';
      const domainHint = document.createElement('div');
      domainHint.className = 'columns-preset-hint';
      domainHint.textContent = uiText('columnsDomainSummary');
      domainSection.appendChild(domainHint);
      const domainToggle = document.createElement('button');
      domainToggle.id = 'domainSummaryToggle';
      domainToggle.className = 'context-menu-item';
      domainToggle.setAttribute('role', 'menuitemcheckbox');
      const updateDomainToggle = () => {
        domainToggle.textContent =
          (state.domainSummaryVisible ? '☑ ' : '☐ ') + uiText('columnsDomainSummaryToggle');
        domainToggle.setAttribute('aria-checked', String(state.domainSummaryVisible));
      };
      updateDomainToggle();
      domainToggle.addEventListener('click', () => {
        state.domainSummaryVisible = !state.domainSummaryVisible;
        saveDomainSummaryPref(state.domainSummaryVisible);
        updateDomainToggle();
        if (state.syncDomainSummary) state.syncDomainSummary();
        setStatus(
          uiText(state.domainSummaryVisible ? 'columnsDomainSummaryShownStatus' : 'columnsDomainSummaryHiddenStatus'),
        );
      });
      domainSection.appendChild(domainToggle);
      columnsContextMenu.appendChild(domainSection);

      // Single view preset (columns + filters). Apply restores the saved view —
      // or the factory default before anything was saved — and Update overwrites
      // the preset with whatever is on screen right now.
      const presetSection = document.createElement('div');
      presetSection.className = 'columns-preset-section';

      const presetHint = document.createElement('div');
      presetHint.className = 'columns-preset-hint';
      presetHint.textContent = uiText('columnsSavedView');
      presetSection.appendChild(presetHint);

      const hasCustomPreset = hasStoredViewPreset();
      const actionRow = document.createElement('div');
      actionRow.className = 'columns-preset-actions';

      const refreshAfterPresetChange = (focusSelector) => {
        renderColumnsContextMenu();
        const focusTarget = columnsContextMenu.querySelector(focusSelector);
        if (focusTarget) focusTarget.focus();
      };

      const applyPresetBtn = document.createElement('button');
      applyPresetBtn.className = 'context-menu-item columns-preset-apply';
      applyPresetBtn.setAttribute('role', 'menuitem');
      applyPresetBtn.textContent = uiText('columnsPresetApply');
      applyPresetBtn.title = uiText(
        hasCustomPreset ? 'columnsPresetApplySavedTitle' : 'columnsPresetApplyDefaultTitle',
      );
      applyPresetBtn.addEventListener('click', () => {
        const { preset, error: presetError } = loadViewPreset();
        if (presetError) {
          setStatus(presetError);
          return;
        }
        applyViewPreset(preset);
        saveColumnPrefs();
        filterRows();
        render();
        syncSearchUIAfterRender();
        updateTableSummary(countVisibleRows());
        refreshAfterPresetChange('.columns-preset-apply');
        setStatus(uiText(preset ? 'columnsPresetAppliedStatus' : 'columnsPresetAppliedDefaultStatus'));
      });
      actionRow.appendChild(applyPresetBtn);

      const updatePresetBtn = document.createElement('button');
      updatePresetBtn.className = 'context-menu-item columns-preset-update';
      updatePresetBtn.setAttribute('role', 'menuitem');
      updatePresetBtn.textContent = uiText('columnsPresetUpdate');
      updatePresetBtn.title = uiText('columnsPresetUpdateTitle');
      updatePresetBtn.addEventListener('click', () => {
        const ok = saveViewPreset(buildViewPresetFromState());
        if (!ok) {
          setStatus(uiText('columnsPresetSaveFailedStatus'));
          return;
        }
        refreshAfterPresetChange('.columns-preset-update');
        setStatus(uiText('columnsPresetUpdatedStatus'));
      });
      actionRow.appendChild(updatePresetBtn);
      presetSection.appendChild(actionRow);

      if (hasCustomPreset) {
        const resetPresetBtn = document.createElement('button');
        resetPresetBtn.className = 'context-menu-item columns-preset-reset';
        resetPresetBtn.setAttribute('role', 'menuitem');
        resetPresetBtn.textContent = uiText('columnsPresetForget');
        resetPresetBtn.title = uiText('columnsPresetForgetTitle');
        resetPresetBtn.addEventListener('click', () => {
          if (!clearViewPreset()) {
            setStatus(uiText('columnsPresetResetFailedStatus'));
            return;
          }
          refreshAfterPresetChange('.columns-preset-apply');
          setStatus(uiText('columnsPresetResetStatus'));
        });
        presetSection.appendChild(resetPresetBtn);
      }

      columnsContextMenu.appendChild(presetSection);
    };

    $('#thead').addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const th = event.target.closest('th');
      const focusColId = th ? th.dataset.colId : null;
      if (isVisualOnlyColumn(focusColId)) {
        setStatus('Waterfall is a visual timing column and cannot be filtered.');
        return;
      }
      openFilterPopup(event.clientX, event.clientY, focusColId, th);
    });

    const columnsBtn = $('#columnsBtn');
    const filterBtn = $('#filterBtn');
    columnsBtn.addEventListener('click', (event) => {
      if (columnsContextMenu.classList.contains('show')) {
        closeAccessiblePopup(columnsContextMenu, true);
        return;
      }
      renderColumnsContextMenu();
      // Reset before positioning: this handler writes top and maxHeight only
      // when there is space below the button, so without clearing them first
      // it depends on clampPopupToViewport happening to clear them for it —
      // a cap from the previous open (or the pre-resize viewport) would
      // otherwise survive into this one and clip a menu that now fits.
      columnsContextMenu.style.top = '';
      columnsContextMenu.style.maxHeight = '';
      const rect = event.currentTarget.getBoundingClientRect();
      showAccessiblePopupAt(columnsContextMenu, rect.left, rect.bottom, columnsBtn);
      // Anchored under its button and capped to the space below it, so a
      // menu taller than the viewport scrolls instead of climbing over the
      // toolbar (the generic clamp would push it up to fit).
      const spaceBelow = Math.round(window.innerHeight - rect.bottom - POPUP_VIEWPORT_MARGIN);
      if (spaceBelow > 0) {
        columnsContextMenu.style.top = Math.round(rect.bottom) + 'px';
        columnsContextMenu.style.maxHeight = spaceBelow + 'px';
      }
    });

    filterBtn.addEventListener('click', (event) => {
      if (filterPopup.classList.contains('show')) {
        closeAccessiblePopup(filterPopup, true);
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      openFilterPopup(rect.left, rect.bottom, null, filterBtn);
    });

    // Keyboard shortcut help dialog
    const shortcutDialog = $('#shortcutDialog');
    const shortcutBtn = $('#shortcutBtn');
    const openShortcutDialog = (trigger) => {
      if (!shortcutDialog) return;
      if (shortcutDialog.open) return; // already open — preserve the original trigger
      // Don't open if another modal <dialog> is active (e.g. retention, data-safety)
      const otherModal = Array.from(document.querySelectorAll('dialog[open]')).some((d) => d !== shortcutDialog);
      if (otherModal) return;
      const supportStatus = $('#shortcutSupportSummaryStatus');
      if (supportStatus) supportStatus.textContent = '';
      shortcutDialog._networkPlusTrigger = trigger || null;
      shortcutDialog.showModal();
      setTimeout(() => {
        const closeButton = $('#shortcutCloseBtn');
        if (shortcutDialog.open && closeButton) closeButton.focus();
      }, 0);
    };
    if (shortcutDialog) {
      shortcutDialog.addEventListener('cancel', (e) => { e.preventDefault(); shortcutDialog.close(); });
      shortcutDialog.addEventListener('close', () => {
        const trigger = shortcutDialog._networkPlusTrigger;
        if (trigger && trigger.focus && trigger.isConnected !== false) trigger.focus();
      });
      shortcutDialog.addEventListener('click', (event) => {
        if (event.target === shortcutDialog) shortcutDialog.close();
      });
      const safeSupportSummaryBtn = $('#copySafeSupportSummaryBtn');
      if (safeSupportSummaryBtn) {
        safeSupportSummaryBtn.addEventListener('click', () => {
          const supportStatus = $('#shortcutSupportSummaryStatus');
          if (supportStatus) supportStatus.textContent = '';
          let userAgentData = null;
          let userAgent = '';
          try {
            if (typeof navigator !== 'undefined') {
              userAgentData = navigator.userAgentData || null;
              const rawUserAgent = navigator.userAgent;
              userAgent = typeof rawUserAgent === 'string' ? rawUserAgent : '';
            }
          } catch (_error) {
            userAgentData = null;
            userAgent = '';
          }
          const mediaPreferences = readSupportMediaPreferences(
            getMatchMediaApi(),
          );
          const forcedTheme = document.documentElement.getAttribute('data-theme');
          const summary = buildSafeSupportSummary({
            version: normalizeSafeSupportVersion(getExtensionVersion()),
            edgeMajor: parseEdgeMajor(userAgentData, userAgent),
            osFamily: parseOsFamily(userAgentData, userAgent),
            theme: forcedTheme === 'dark' || forcedTheme === 'light' ? forcedTheme : 'system',
            retentionPolicy: state.retention.unlimited === true ? 'unlimited' : 'limited',
            retentionLimit: state.retention.requestLimit,
            recording: state.paused === true ? 'paused' : 'recording',
            localSample: state.sampleCaptureActive === true ? 'active' : 'inactive',
            colorScheme: mediaPreferences.colorScheme,
            reducedMotion: mediaPreferences.reducedMotion,
          });
          writeClipboardPayload(summary, 'Copied safe support summary').then((copied) => {
            if (supportStatus) {
              supportStatus.textContent = copied
                ? 'Copied safe support summary. Review it before posting.'
                : 'Clipboard copy failed. No data was copied.';
            }
          });
        });
      }
      $('#shortcutCloseBtn').addEventListener('click', () => shortcutDialog.close());
    }
    if (shortcutBtn) {
      shortcutBtn.addEventListener('click', (event) => openShortcutDialog(event.currentTarget));
    }
    // '?' key opens shortcut help (when focus is not in an input/textarea/select)
    document.addEventListener('keydown', (e) => {
      if (e.key !== '?') return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement && document.activeElement.isContentEditable) return;
      e.preventDefault();
      openShortcutDialog(document.activeElement);
    });

    // Optional support dialog. Outbound links only; no request, telemetry, or
    // stored state. DevTools panels cannot reach chrome.tabs, so the anchor is
    // the primary path and "Copy link" is the guaranteed fallback.
    const supportDialog = $('#supportDialog');
    const supportBtn = $('#supportBtn');
    const openSupportDialog = (trigger) => {
      if (!supportDialog) return;
      if (supportDialog.open) return; // already open — preserve the original trigger
      const otherModal = Array.from(document.querySelectorAll('dialog[open]')).some((d) => d !== supportDialog);
      if (otherModal) return;
      supportDialog._networkPlusTrigger = trigger || null;
      supportDialog.showModal();
      setTimeout(() => {
        const closeButton = $('#supportCloseBtn');
        if (supportDialog.open && closeButton) closeButton.focus();
      }, 0);
    };
    if (supportDialog) {
      supportDialog.addEventListener('cancel', (e) => { e.preventDefault(); supportDialog.close(); });
      supportDialog.addEventListener('close', () => {
        const trigger = supportDialog._networkPlusTrigger;
        if (trigger && trigger.focus && trigger.isConnected !== false) trigger.focus();
      });
      supportDialog.addEventListener('click', (event) => {
        if (event.target === supportDialog) supportDialog.close();
      });
      $('#supportCloseBtn').addEventListener('click', () => supportDialog.close());
    }
    if (supportBtn) {
      supportBtn.addEventListener('click', (event) => openSupportDialog(event.currentTarget));
    }

    // Tab switching for inspector panels
    initializeInspectorTabBar('req-tab-bar');
    initializeInspectorTabBar('res-tab-bar');
    // Nothing is selected at start: guidance line instead of empty tab strips.
    setInspectorEmptyState(!state.selectedRow);

    render();

    // Outside pointer actions dismiss transient surfaces without trapping focus.
    window.addEventListener('click', (event) => {
      // A click handler may have re-rendered the control away (Select All,
      // preset Update, add/remove filter condition). A detached target can't
      // prove the click was outside a popup, so it must never dismiss one.
      if (!event.target.isConnected) return;
      if (
        event.target.closest('#filterBtn') ||
        event.target.closest('#columnsBtn') ||
        event.target.closest('#searchScopeBtn') ||
        event.target.closest('.search-color-btn') ||
        event.target.closest('.filter-btn') ||
        event.target.closest('.dropdown-content')
      ) return;
      const clickedControl = event.target.closest('button,input,select,a,[tabindex]');
      closeAllAccessiblePopups(null, !clickedControl);
    });

    // Auto-scroll button
    const autoScrollBtn = document.createElement('button');
    autoScrollBtn.id = 'autoScrollBtn';
    autoScrollBtn.textContent = 'Auto-scroll';
    const updateAutoScrollButton = () => {
      autoScrollBtn.classList.toggle('active', state.autoScroll);
      autoScrollBtn.setAttribute('aria-pressed', String(state.autoScroll));
      autoScrollBtn.title = state.autoScroll ? 'Disable automatic scrolling' : 'Enable automatic scrolling';
    };
    autoScrollBtn.addEventListener('click', () => {
      state.autoScroll = !state.autoScroll;
      updateAutoScrollButton();
      if (state.autoScroll && scrollGridToNewest) scrollGridToNewest();
    });
    updateAutoScrollButton();
    $('#exportHarBtn').insertAdjacentElement('afterend', autoScrollBtn);

    // Per-domain summary: a collapsible triage strip above the whole
    // workbench. It lives outside #content on purpose — inside it the panel
    // would join the tableWrap/resizer/details flex row and corrupt the
    // divider's split math — and outside #tbody so every flat-grid invariant
    // (zebra striping, roving tabindex, sibling walks) stays untouched.
    const domainSummaryPanel = document.createElement('div');
    domainSummaryPanel.id = 'domainSummary';
    domainSummaryPanel.setAttribute('role', 'region');
    domainSummaryPanel.setAttribute('aria-label', 'Domains');
    domainSummaryPanel.hidden = true;
    const contentElement = $('#content');
    contentElement.insertAdjacentElement('beforebegin', domainSummaryPanel);

    // Shared with the row context menu: both feed the same multiText rules
    // the Filters popup edits, so applied filters show, count, and clear
    // there. "Only" replaces any previous inclusion so two quick picks never
    // intersect down to zero rows; exclusions accumulate.
    const applyColumnQuickFilterTo = (colId, value, op) => {
      const rule = state.columnFilterRules[colId];
      let conditions =
        rule && rule.mode === 'multiText' && Array.isArray(rule.conditions)
          ? rule.conditions.filter((cond) => cond && String(cond.value || '').trim() !== '')
          : [];
      // Two "only" rules on one column can never both hold, so an isolate
      // replaces the previous isolate; excludes accumulate.
      if (op === 'contains') conditions = conditions.filter((cond) => cond.op !== 'contains');
      if (!conditions.some((cond) => cond.op === op && cond.value === value)) {
        conditions.push({ op, value });
      }
      state.columnFilterRules[colId] = { mode: 'multiText', conditions };
      renderBody();
      syncSearchUIAfterRender();
      const column = state.columns.find((candidate) => candidate.id === colId);
      setStatus(
        (op === 'contains' ? 'Showing only ' : 'Excluding ') +
          (column ? column.label + ' ' : '') +
          value +
          '; manage it from the Filters popup.',
      );
    };

    const applyDomainQuickFilterTo = (domain, op) => applyColumnQuickFilterTo('domain', domain, op);

    const clearDomainQuickFilter = (domain) => {
      const rule = state.columnFilterRules.domain;
      const conditions =
        rule && rule.mode === 'multiText' && Array.isArray(rule.conditions)
          ? rule.conditions.filter(
              (cond) => cond && !(cond.op === 'contains' && cond.value === domain),
            )
          : [];
      state.columnFilterRules.domain = { mode: 'multiText', conditions };
      renderBody();
      syncSearchUIAfterRender();
      setStatus('Cleared the ' + domain + ' domain filter.');
    };

    const getActiveDomainOnlyValues = () => {
      const rule = state.columnFilterRules.domain;
      const values = new Set();
      if (rule && rule.mode === 'multiText' && Array.isArray(rule.conditions)) {
        for (const cond of rule.conditions) {
          if (cond && cond.op === 'contains' && String(cond.value || '').trim() !== '') {
            values.add(cond.value);
          }
        }
      }
      return values;
    };

    let domainSummarySignature = '';
    const renderDomainSummary = () => {
      domainSummaryPanel.hidden = !state.domainSummaryVisible;
      if (!state.domainSummaryVisible) {
        domainSummarySignature = '';
        return;
      }
      const summary = computeDomainSummary(state.filteredRows);
      const activeDomains = getActiveDomainOnlyValues();
      // The signature includes the pressed state: clicking a domain that
      // already spans every filtered row changes no aggregate but must still
      // repaint its active marker. When nothing changed, the rebuild is
      // skipped so streaming appends never churn focus or scroll here.
      const signature = summary
        .map((entry) =>
          [
            entry.domain,
            entry.count,
            entry.totalBytes,
            entry.errorCount,
            activeDomains.has(entry.domain) ? 1 : 0,
          ].join(':'),
        )
        .join('|');
      if (signature === domainSummarySignature) return;
      domainSummarySignature = signature;
      const previousScrollTop = domainSummaryPanel.scrollTop;
      const focusedDomain =
        document.activeElement && domainSummaryPanel.contains(document.activeElement)
          ? document.activeElement.getAttribute('data-domain')
          : null;
      domainSummaryPanel.textContent = '';
      if (summary.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'domain-summary-empty';
        empty.textContent = 'No captured domains yet';
        domainSummaryPanel.appendChild(empty);
        return;
      }
      for (const entry of summary) {
        const meta =
          entry.count +
          (entry.count === 1 ? ' request' : ' requests') +
          ' · ' +
          (fmtBytes(entry.totalBytes) || '0 B');
        const appendEntryContent = (target) => {
          const nameSpan = document.createElement('span');
          nameSpan.className = 'domain-summary-name';
          nameSpan.textContent = entry.domain === '' ? '(no host)' : entry.domain;
          target.appendChild(nameSpan);
          const metaSpan = document.createElement('span');
          metaSpan.className = 'domain-summary-meta';
          metaSpan.textContent = meta;
          target.appendChild(metaSpan);
          if (entry.errorCount > 0) {
            const errorChip = document.createElement('span');
            errorChip.className = 'domain-summary-errors';
            errorChip.textContent =
              entry.errorCount + (entry.errorCount === 1 ? ' error' : ' errors');
            target.appendChild(errorChip);
          }
        };
        if (entry.domain === '') {
          // A multiText condition with an empty value is skipped by the
          // filter engine, so the no-host bucket is informational only.
          const info = document.createElement('span');
          info.className = 'domain-summary-row domain-summary-row--static';
          appendEntryContent(info);
          domainSummaryPanel.appendChild(info);
          continue;
        }
        const active = activeDomains.has(entry.domain);
        const entryButton = document.createElement('button');
        entryButton.type = 'button';
        entryButton.className = 'domain-summary-row' + (active ? ' active' : '');
        entryButton.setAttribute('data-domain', entry.domain);
        entryButton.setAttribute('aria-pressed', String(active));
        entryButton.title = active
          ? 'Clear the ' + entry.domain + ' filter'
          : 'Show only requests from ' + entry.domain;
        appendEntryContent(entryButton);
        entryButton.addEventListener('click', () => {
          if (getActiveDomainOnlyValues().has(entry.domain)) clearDomainQuickFilter(entry.domain);
          else applyDomainQuickFilterTo(entry.domain, 'contains');
        });
        domainSummaryPanel.appendChild(entryButton);
      }
      domainSummaryPanel.scrollTop = previousScrollTop;
      if (focusedDomain) {
        for (const candidate of domainSummaryPanel.querySelectorAll('button[data-domain]')) {
          if (candidate.getAttribute('data-domain') === focusedDomain) {
            candidate.focus();
            break;
          }
        }
      }
    };
    state.syncDomainSummary = renderDomainSummary;
    renderDomainSummary();

    // [U6] Roving row focus, selection, copy, and context actions
    const tableWrap = $('#tableWrap');
    tableWrap.addEventListener('focusin', (event) => {
      const control = event.target.closest('th[data-col-id], .col-resizer');
      if (!control || !tableWrap.contains(control)) return;
      window.requestAnimationFrame(() => {
        if (document.activeElement !== control) return;
        if (!control.matches(':focus-visible')) return;
        const tableRect = tableWrap.getBoundingClientRect();
        const controlRect = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        const outlineAllowance = calculateExternalOutlineFootprint(
          style.outlineWidth,
          style.outlineOffset,
        );
        const visibleLeft = tableRect.left + tableWrap.clientLeft;
        const visibleRight = visibleLeft + tableWrap.clientWidth;
        let scrollDelta = 0;
        if (controlRect.left - outlineAllowance < visibleLeft) {
          scrollDelta = controlRect.left - outlineAllowance - visibleLeft;
        } else if (controlRect.right + outlineAllowance > visibleRight) {
          scrollDelta = controlRect.right + outlineAllowance - visibleRight;
        }
        if (scrollDelta !== 0) {
          const maxScrollLeft = Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth);
          tableWrap.scrollLeft = Math.min(
            maxScrollLeft,
            Math.max(0, tableWrap.scrollLeft + scrollDelta),
          );
        }
      });
    });
    let previousTableScrollTop = tableWrap.scrollTop;
    // Assigned here because the scroll position tracker lives in this scope;
    // the toolbar button is built earlier and calls through the handle.
    scrollGridToNewest = () => {
      tableWrap.scrollTop = tableWrap.scrollHeight;
      previousTableScrollTop = tableWrap.scrollTop;
    };
    tableWrap.addEventListener('scroll', () => {
      const currentScrollTop = tableWrap.scrollTop;
      if (state.autoScroll && currentScrollTop < previousTableScrollTop) {
        state.autoScroll = false;
        updateAutoScrollButton();
      }
      previousTableScrollTop = currentScrollTop;
    });

    const contextMenu = document.createElement('div');
    contextMenu.id = 'rowContextMenu';
    contextMenu.className = 'filter-dropdown-content dropdown-content context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.display = 'none';
    contextMenu.style.zIndex = '1000';
    contextMenu.setAttribute('role', 'menu');
    installPopupKeyboardSupport(contextMenu);
    document.body.appendChild(contextMenu);

    let contextMenuRow = null;
    let contextMenuInvokerRowId = null;
    let suppressNextNativeContextMenuRowId = null;
    // Assigned by the resend wiring at the end of init when a DevTools
    // session is present; stays null in the mirror viewer and in tests.
    let resendActions = null;
    const restoreContextMenuFocus = () => {
      const invokingRow = contextMenuInvokerRowId
        ? tableWrap.querySelector('tr[data-row-id="' + contextMenuInvokerRowId + '"]')
        : null;
      const fallbackRow = invokingRow || tableWrap.querySelector('tbody tr[data-row-id]');
      if (!fallbackRow) {
        const fallbackControl = document.querySelector('.empty-state-action') || $('#clearBtn');
        if (fallbackControl) fallbackControl.focus({ preventScroll: true });
        return;
      }
      $all('tbody tr[data-row-id]', tableWrap).forEach((rowElement) => {
        rowElement.tabIndex = rowElement === fallbackRow ? 0 : -1;
      });
      fallbackRow.focus();
    };

    const closeRowContextMenu = (restoreFocus) => {
      closeAccessiblePopup(contextMenu, restoreFocus);
    };

    const createRowMenuButton = (text, onActivate, title) => {
      const button = document.createElement('button');
      button.textContent = text;
      button.className = 'context-menu-item';
      button.setAttribute('role', 'menuitem');
      // A shortened label still has to be inspectable before it is clicked.
      if (title && title !== text) button.title = title;
      button.addEventListener('click', () => {
        onActivate();
        closeRowContextMenu(true);
      });
      return button;
    };

    const openRowContextMenu = (row, x, y, invokingRow, invokingColId) => {
      if (!row || !invokingRow) return;
      contextMenuRow = row;
      contextMenuInvokerRowId = String(row.id);
      state.focusedRow = row;
      // Set on open, not on creation: the language can change after init.
      contextMenu.setAttribute('aria-label', uiText('menuRequestActions'));
      contextMenu.textContent = '';
      const isMultiSelected = state.selectedRows.has(contextMenuRow);
      const targetRows = isMultiSelected && state.selectedRows.size > 0 ? [...state.selectedRows] : [contextMenuRow];
      const allHighlighted = targetRows.every((targetRow) => state.highlightedRows.has(targetRow));

      // Order follows how often each block is reached from a row: filter the
      // capture, mark or compare rows, then the copy formats behind two
      // disclosures (sanitized first, full last).

      // The fastest triage move on a noisy capture: isolate or exclude a
      // domain straight from the row, feeding the same multiText rules the
      // Filters popup edits (so it shows, counts, and clears them there).
      const quickFilterColumn = (() => {
        if (!invokingColId || isVisualOnlyColumn(invokingColId)) return null;
        const column = state.columns.find((candidate) => candidate.id === invokingColId);
        if (!column) return null;
        const value = getQuickFilterValue(contextMenuRow, invokingColId);
        return value ? { id: column.id, label: column.label, value } : null;
      })();
      const quickFilterDomain = String(contextMenuRow.domain || '').trim();
      const quickFilterTarget =
        quickFilterColumn || (quickFilterDomain ? { id: 'domain', label: 'Domain', value: quickFilterDomain } : null);
      // The pointer's column decides the first pair; the domain pair stays
      // one click away whichever cell was right-clicked.
      const quickFilterDomainTarget =
        quickFilterColumn && quickFilterColumn.id !== 'domain' && quickFilterDomain
          ? { id: 'domain', label: 'Domain', value: quickFilterDomain }
          : null;
      // The column name is part of the sentence, so it translates with the
      // frame around it; the value stays verbatim capture data.
      const quickFilterText = (key, target, value) =>
        uiTextFormat(key, { column: menuColumnLabel(target.id, target.label), value });
      if (quickFilterTarget) {
        const filterMenuLabel = document.createElement('div');
        filterMenuLabel.className = 'context-menu-label';
        filterMenuLabel.setAttribute('role', 'presentation');
        filterMenuLabel.textContent = uiText('menuFilter');
        contextMenu.appendChild(filterMenuLabel);
        const shortValue = shortenMenuValue(quickFilterTarget.value);
        const applyQuickFilter = (op) =>
          applyColumnQuickFilterTo(quickFilterTarget.id, quickFilterTarget.value, op);
        contextMenu.appendChild(
          createRowMenuButton(
            quickFilterText('menuFilterOnly', quickFilterTarget, shortValue),
            () => applyQuickFilter('contains'),
            quickFilterText('menuFilterOnly', quickFilterTarget, quickFilterTarget.value),
          ),
        );
        contextMenu.appendChild(
          createRowMenuButton(
            quickFilterText('menuFilterExclude', quickFilterTarget, shortValue),
            () => applyQuickFilter('notcontains'),
            quickFilterText('menuFilterExclude', quickFilterTarget, quickFilterTarget.value),
          ),
        );
        if (quickFilterDomainTarget) {
          const shortDomain = shortenMenuValue(quickFilterDomainTarget.value);
          contextMenu.appendChild(
            createRowMenuButton(
              quickFilterText('menuFilterOnly', quickFilterDomainTarget, shortDomain),
              () => applyDomainQuickFilterTo(quickFilterDomainTarget.value, 'contains'),
              quickFilterText('menuFilterOnly', quickFilterDomainTarget, quickFilterDomainTarget.value),
            ),
          );
          contextMenu.appendChild(
            createRowMenuButton(
              quickFilterText('menuFilterExclude', quickFilterDomainTarget, shortDomain),
              () => applyDomainQuickFilterTo(quickFilterDomainTarget.value, 'notcontains'),
              quickFilterText('menuFilterExclude', quickFilterDomainTarget, quickFilterDomainTarget.value),
            ),
          );
        }
      }

      contextMenu.appendChild(createRowMenuButton(uiText(isMultiSelected ? 'menuDeselect' : 'menuSelect'), () => {
        if (isMultiSelected) state.selectedRows.delete(contextMenuRow);
        else state.selectedRows.add(contextMenuRow);
        renderBody();
      }));

      const hlLabel = document.createElement('div');
      hlLabel.className = 'context-menu-label';
      hlLabel.setAttribute('role', 'presentation');
      hlLabel.textContent =
        targetRows.length > 1
          ? uiTextFormat('menuHighlightRows', { count: targetRows.length })
          : uiText('menuHighlight');
      contextMenu.appendChild(hlLabel);

      const colorRow = document.createElement('div');
      colorRow.className = 'context-menu-colors';
      colorRow.setAttribute('role', 'group');
      colorRow.setAttribute('aria-label', uiText('menuHighlightColor'));
      for (const highlightColor of HIGHLIGHT_COLORS) {
        const colorName = menuHighlightColorLabel(highlightColor);
        const swatch = document.createElement('button');
        swatch.className = 'hl-swatch ' + highlightColor.cls;
        swatch.title = colorName;
        swatch.setAttribute('role', 'menuitem');
        swatch.setAttribute('aria-label', uiTextFormat('menuHighlightColorNamed', { color: colorName }));
        swatch.addEventListener('click', () => {
          targetRows.forEach((targetRow) => { state.highlightedRows.set(targetRow, highlightColor.cls); });
          renderBody();
          closeRowContextMenu(true);
        });
        colorRow.appendChild(swatch);
      }
      contextMenu.appendChild(colorRow);

      if (allHighlighted) {
        contextMenu.appendChild(createRowMenuButton(
          targetRows.length > 1
            ? uiTextFormat('menuUnhighlightRows', { count: targetRows.length })
            : uiText('menuUnhighlight'),
          () => {
            targetRows.forEach((targetRow) => { state.highlightedRows.delete(targetRow); });
            renderBody();
          },
        ));
      }

      if (state.highlightedRows.size > 0) {
        contextMenu.appendChild(createRowMenuButton(uiText('menuClearHighlights'), () => {
          state.highlightedRows.clear();
          renderBody();
        }));
      }

      if (state.selectedRows.size > 0) {
        const selectedCount = state.selectedRows.size;
        if (selectedCount === 2) {
          const compareLabel = document.createElement('div');
          compareLabel.className = 'context-menu-label';
          compareLabel.setAttribute('role', 'presentation');
          compareLabel.textContent = uiText('menuCompare');
          contextMenu.appendChild(compareLabel);
          const [rowX, rowY] = [...state.selectedRows];
          contextMenu.appendChild(createRowMenuButton(uiText('menuCompareTwo'), () => {
            state.comparedRows = [rowX, rowY];
            state.comparisonInvokingRowId = contextMenuInvokerRowId;
            setDetailsTitleText(uiText('detailsComparingTwo'));
            renderComparisonPanel(rowX, rowY);
            showComparisonPanel();
          }));
        }
        // Both destroy rows, so both arm the same bounded Undo the toolbar
        // Clear has — silently and irreversibly dropping rows was the one
        // destructive action in the panel without a way back. Sample mode is
        // excluded: its restore path refuses to merge into live traffic.
        const removeRowsWithUndo = (rowsToRemove, actionLabel, describe) => {
          if (rowsToRemove.length === 0) {
            state.selectedRows.clear();
            renderBody();
            return;
          }
          disposeClearUndoSnapshot('clear');
          const snapshot = createClearUndoSnapshot(searchPanelVisible);
          snapshot.rows = rowsToRemove.slice();
          snapshot.originalCount = rowsToRemove.length;
          snapshot.actionLabel = actionLabel;
          removeRowsFromState(rowsToRemove, false);
          state.selectedRows.clear();
          renderBody();
          const undoAvailable = state.sampleCaptureActive ? false : armClearUndoSnapshot(snapshot);
          setStatus(
            describe +
              (undoAvailable ? ' Undo available for ' + CLEAR_UNDO_TIMEOUT_MS / 1000 + ' seconds.' : ''),
          );
        };
        contextMenu.appendChild(createRowMenuButton(uiTextFormat('menuKeepSelected', { count: selectedCount }), () => {
          commitPendingLiveRows();
          const rowsToRemove = state.rows.filter((targetRow) => !state.selectedRows.has(targetRow));
          removeRowsWithUndo(
            rowsToRemove,
            'Keep Selected',
            'Kept ' + formatRequestCount(selectedCount) + '; removed ' + formatRequestCount(rowsToRemove.length) + '.',
          );
        }));
        contextMenu.appendChild(createRowMenuButton(uiTextFormat('menuDeleteSelected', { count: selectedCount }), () => {
          commitPendingLiveRows();
          const rowsToRemove = Array.from(state.selectedRows);
          removeRowsWithUndo(
            rowsToRemove,
            'Delete Selected',
            'Deleted ' + formatRequestCount(rowsToRemove.length) + '.',
          );
        }));
      }

      // The six sanitized formats sit behind one disclosure, mirroring the
      // full-copy group below it: the menu opens at the height of its actions
      // and a format is one click away.
      const sanitizedCopyLabel = uiText('menuCopySanitized');
      const sanitizedCopyGroup = document.createElement('div');
      sanitizedCopyGroup.className = 'context-menu-submenu';
      sanitizedCopyGroup.setAttribute('role', 'group');
      sanitizedCopyGroup.setAttribute('aria-label', sanitizedCopyLabel);
      sanitizedCopyGroup.hidden = true;
      const sanitizedCopyToggle = document.createElement('button');
      sanitizedCopyToggle.className = 'context-menu-item context-menu-disclosure';
      sanitizedCopyToggle.setAttribute('role', 'menuitem');
      sanitizedCopyToggle.setAttribute('aria-expanded', 'false');
      sanitizedCopyToggle.textContent = '▸ ' + sanitizedCopyLabel;
      sanitizedCopyToggle.addEventListener('click', () => {
        const expanding = sanitizedCopyGroup.hidden;
        sanitizedCopyGroup.hidden = !expanding;
        sanitizedCopyToggle.setAttribute('aria-expanded', String(expanding));
        sanitizedCopyToggle.textContent = (expanding ? '▾' : '▸') + ' ' + sanitizedCopyLabel;
        reclampOpenPopups();
      });
      contextMenu.appendChild(sanitizedCopyToggle);
      // The label translates; the status message stays the canonical English
      // one every other sanitized copy sink already reports.
      for (const [action, labelKey, copiedMessage] of [
        ['summary', 'menuCopySanitizedSummary', 'Copied sanitized summary'],
        ['url', 'menuCopySanitizedUrl', 'Copied sanitized URL'],
        ['curl', 'menuCopySanitizedCurl', 'Copied sanitized cURL'],
        ['fetch', 'menuCopySanitizedFetch', 'Copied sanitized fetch'],
        ['powershell', 'menuCopySanitizedPowershell', 'Copied sanitized PowerShell'],
        ['markdown', 'menuCopySanitizedMarkdown', 'Copied sanitized Markdown'],
      ]) {
        sanitizedCopyGroup.appendChild(createRowMenuButton(uiText(labelKey), () => {
          copySanitizedAction(action, contextMenuRow, '', copiedMessage);
        }));
      }
      if (targetRows.length > 1) {
        sanitizedCopyGroup.appendChild(
          createRowMenuButton(uiTextFormat('menuCopySanitizedTable', { count: targetRows.length }), () => {
            const payload = buildMarkdownTablePayload(targetRows);
            if (!payload.ok) {
              setStatus('Clipboard copy failed during sanitization. No data was copied.');
              return;
            }
            writeClipboardPayload(payload.text, 'Copied a sanitized Markdown table of ' + targetRows.length + ' requests');
          }),
        );
      }
      contextMenu.appendChild(sanitizedCopyGroup);

      // Full output used to open a modal that both picked the format and took
      // the confirmation. The picker is the part people actually came for, so
      // it lives in the menu now, collapsed behind one entry that names what
      // it hands out — the menu keeps the height it had, and reaching a format
      // costs one click instead of a dialog round trip.
      const fullCopyRow = contextMenuRow;
      const fullCopyLabel = uiText('menuCopyFull');
      const fullCopyGroup = document.createElement('div');
      fullCopyGroup.className = 'context-menu-submenu';
      fullCopyGroup.setAttribute('role', 'group');
      fullCopyGroup.setAttribute('aria-label', fullCopyLabel);
      fullCopyGroup.hidden = true;
      const fullCopyToggle = document.createElement('button');
      fullCopyToggle.className = 'context-menu-item context-menu-disclosure';
      fullCopyToggle.setAttribute('role', 'menuitem');
      fullCopyToggle.setAttribute('aria-expanded', 'false');
      fullCopyToggle.textContent = '▸ ' + fullCopyLabel;
      fullCopyToggle.addEventListener('click', () => {
        const expanding = fullCopyGroup.hidden;
        fullCopyGroup.hidden = !expanding;
        fullCopyToggle.setAttribute('aria-expanded', String(expanding));
        fullCopyToggle.textContent = (expanding ? '▾' : '▸') + ' ' + fullCopyLabel;
        // The menu just changed height; keep it inside the viewport.
        reclampOpenPopups();
      });
      contextMenu.appendChild(fullCopyToggle);
      for (const [action, label, labelKey] of FULL_COPY_FORMATS) {
        fullCopyGroup.appendChild(
          createRowMenuButton(uiText(labelKey), () => copyFullAction(action, fullCopyRow, label)),
        );
      }
      contextMenu.appendChild(fullCopyGroup);

      if (resendActions && canResendRow(contextMenuRow)) {
        const resendLabel = document.createElement('div');
        resendLabel.className = 'context-menu-label';
        resendLabel.setAttribute('role', 'presentation');
        resendLabel.textContent = uiText('menuResend');
        contextMenu.appendChild(resendLabel);
        const resendRow = contextMenuRow;
        contextMenu.appendChild(createRowMenuButton(uiText('menuResendUnchanged'), () => {
          resendActions.sendNow(resendRow);
        }));
        contextMenu.appendChild(createRowMenuButton(uiText('menuResendEdit'), () => {
          setTimeout(() => resendActions.openDialog(resendRow, resendRow.id), 0);
        }));
      }

      showAccessiblePopupAt(contextMenu, x, y, invokingRow, null, restoreContextMenuFocus);
    };

    tableWrap.addEventListener('contextmenu', (event) => {
      const tr = event.target.closest('tbody tr[data-row-id]');
      if (!tr) return;
      event.preventDefault();
      const rowId = parseInt(tr.dataset.rowId, 10);
      if (suppressNextNativeContextMenuRowId === String(rowId)) {
        suppressNextNativeContextMenuRowId = null;
        return;
      }
      const row = state.rows.find((candidate) => candidate.id === rowId);
      const cell = event.target.closest('td[data-col-id]');
      openRowContextMenu(row, event.clientX, event.clientY, tr, cell ? cell.dataset.colId : null);
    });

    tableWrap.addEventListener('keydown', (event) => {
      const focusedTr = event.target.closest('tbody tr[data-row-id]');
      if (!focusedTr) return;
      const focusedRowId = parseInt(focusedTr.dataset.rowId, 10);
      const focusedRow = state.rows.find((candidate) => candidate.id === focusedRowId);
      if (!focusedRow) return;
      const displayedRows = getSortedRows(state.filteredRows);
      const currentRow = state.focusedRow || state.selectedRow;
      const currentIndex = currentRow ? displayedRows.indexOf(currentRow) : -1;

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow(focusedRow, event, true);
        scrollToSelectedRow();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (displayedRows.length === 0) return;
        event.preventDefault();
        const nextIndex = event.key === 'ArrowDown'
          ? Math.min(currentIndex + 1, displayedRows.length - 1)
          : Math.max(currentIndex - 1, 0);
        selectRow(displayedRows[nextIndex], null, true);
        scrollToSelectedRow();
      } else if (['Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) {
        // Single-step navigation does not scale to a grid that retains tens
        // of thousands of rows; these mirror the menus' existing Home/End.
        if (displayedRows.length === 0) return;
        event.preventDefault();
        const rowHeight = focusedTr.getBoundingClientRect().height || 24;
        const pageStep = Math.max(1, Math.floor(tableWrap.clientHeight / rowHeight) - 1);
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? displayedRows.length - 1
              : event.key === 'PageDown'
                ? Math.min(currentIndex + pageStep, displayedRows.length - 1)
                : Math.max(currentIndex - pageStep, 0);
        selectRow(displayedRows[nextIndex], null, true);
        scrollToSelectedRow();
      } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        const rect = focusedTr.getBoundingClientRect();
        suppressNextNativeContextMenuRowId = String(focusedRowId);
        setTimeout(() => {
          if (suppressNextNativeContextMenuRowId === String(focusedRowId)) {
            suppressNextNativeContextMenuRowId = null;
          }
        }, 0);
        openRowContextMenu(focusedRow, rect.left + ROW_CONTEXT_MENU_X_OFFSET, rect.top + Math.min(rect.height, ROW_CONTEXT_MENU_Y_OFFSET), focusedTr);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        const rows = state.selectedRows.size > 0
          ? [...state.selectedRows]
          : (state.selectedRow ? [state.selectedRow] : []);
        if (rows.length === 0) return;
        event.preventDefault();
        const payload = buildMultiRowClipboardPayload(rows, 'summary', { mode: 'sanitized' });
        if (!payload.ok) {
          setStatus('Clipboard copy failed during sanitization. No data was copied.');
          return;
        }
        writeClipboardPayload(
          payload.text,
          rows.length === 1 ? 'Copied 1 sanitized request' : 'Copied ' + rows.length + ' sanitized requests',
        );
      }
    });

    // Main workbench divider: width in wide mode, height in narrow mode.
    const resizer = $('#resizer');
    const details = $('#details');
    const content = $('#content');
    let mainSplitIsNarrow = null;

    const applyMainSplit = (split) => {
      if (!split) return;
      tableWrap.style.flexBasis = split.primarySize + 'px';
      details.style.flexBasis = split.detailsSize + 'px';
      resizer.setAttribute('aria-valuenow', String(split.primaryPercent));
      resizer.setAttribute('aria-valuetext', 'Request list ' + split.primaryPercent + ' percent');
    };

    // A dragged or keyed side-by-side width outlives the session; the
    // stacked height split does not. The pane holds the px basis and the
    // grid absorbs the remainder (flex-shrink:0 on .details, 1 on .tableWrap).
    const rememberMainSplit = (split) => {
      if (split && split.axis === 'width') saveDetailsWidthPref(split.detailsSize);
    };

    // Restore the remembered width as the pane's inline basis; the sync below
    // re-clamps it (or clears it) when the window cannot fit the minimums.
    const restoreDetailsWidth = () => {
      const savedWidth = loadDetailsWidthPref();
      if (savedWidth != null) details.style.flexBasis = savedWidth + 'px';
    };

    const syncMainDividerOrientation = () => {
      const isNarrow = window.innerWidth <= NARROW_PANEL_MAX_WIDTH;
      if (mainSplitIsNarrow != null && mainSplitIsNarrow !== isNarrow) {
        details.style.flexBasis = '';
        tableWrap.style.flexBasis = '';
        resizer.setAttribute('aria-valuenow', '50');
        resizer.setAttribute('aria-valuetext', 'Request list 50 percent');
        if (!isNarrow) restoreDetailsWidth();
      }
      mainSplitIsNarrow = isNarrow;
      resizer.setAttribute('aria-orientation', isNarrow ? 'horizontal' : 'vertical');
      // A collapsed pane has no split to measure; re-clamping against the
      // full-width grid would overwrite the remembered basis with the minimum.
      if (details.hidden) return;
      const contentRect = content.getBoundingClientRect();
      const tableRect = tableWrap.getBoundingClientRect();
      const totalSize = isNarrow ? contentRect.height : contentRect.width;
      const primarySize = isNarrow ? tableRect.height : tableRect.width;
      let currentSplit = calculateMainSplit(primarySize, totalSize, isNarrow);
      // A dragged split leaves details at a fixed px basis with flex-shrink:0,
      // so shrinking the window crushes the grid toward zero. Re-clamp the
      // persisted split into the feasible range, or clear it when the window
      // is too small for the minimums and let the stylesheet's clamp() take over.
      if (details.style.flexBasis && !currentSplit) {
        const minPrimary = isNarrow ? MIN_TABLE_HEIGHT : MIN_TABLE_WIDTH;
        const minDetails = isNarrow ? MIN_DETAILS_HEIGHT : MIN_DETAILS_WIDTH;
        const clampedPrimary = Math.min(
          Math.max(primarySize, minPrimary),
          totalSize - RESIZER_WIDTH - minDetails,
        );
        const clampedSplit = calculateMainSplit(clampedPrimary, totalSize, isNarrow);
        if (clampedSplit) {
          applyMainSplit(clampedSplit);
          currentSplit = clampedSplit;
        } else {
          details.style.flexBasis = '';
          tableWrap.style.flexBasis = '';
        }
      }
      if (currentSplit) {
        resizer.setAttribute('aria-valuenow', String(currentSplit.primaryPercent));
        resizer.setAttribute('aria-valuetext', 'Request list ' + currentSplit.primaryPercent + ' percent');
      }
    };

    if (window.innerWidth > NARROW_PANEL_MAX_WIDTH) restoreDetailsWidth();
    syncMainDividerOrientation();
    resyncMainSplit = syncMainDividerOrientation;
    window.addEventListener('resize', () => {
      syncMainDividerOrientation();
      reclampOpenPopups();
    });
    // The grid's elastic last column follows every wrap resize: window
    // resizes, the pane opening/closing, and split drags. Feature-detected
    // so the jsdom-free unit environment keeps working without it. The
    // write is deferred one frame: resizing the grid can toggle the wrap's
    // horizontal scrollbar, which changes the observed content box, and a
    // synchronous write inside the callback is the "ResizeObserver loop
    // completed with undelivered notifications" error the status bar shows.
    if (typeof ResizeObserver === 'function') {
      let elasticFrame = 0;
      new ResizeObserver(() => {
        if (elasticFrame) return;
        elasticFrame = requestAnimationFrame(() => {
          elasticFrame = 0;
          // The re-plan reads the same wrap width the write below would, and
          // is idempotent for it, so the observer cannot ping-pong between a
          // hidden and a restored column across frames.
          if (recomputeAutoHiddenColumns()) render();
          else applyElasticColumnWidth();
        });
      }).observe(tableWrap);
      // The header pathname is ellipsised by measurement, so it follows the
      // pane's own width: split drags and keyboard resizes change it without
      // any window resize. Same one-frame deferral as the grid observer.
      const detailsPane = $('#details');
      if (detailsPane) {
        let titleFrame = 0;
        new ResizeObserver(() => {
          if (titleFrame) return;
          titleFrame = requestAnimationFrame(() => {
            titleFrame = 0;
            fitDetailsTitle();
          });
        }).observe(detailsPane);
      }
    }
    resizer.addEventListener('keydown', (event) => {
      const isNarrow = window.innerWidth <= NARROW_PANEL_MAX_WIDTH;
      const expectedKeys = isNarrow ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
      if (!expectedKeys.includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const contentRect = content.getBoundingClientRect();
      const tableRect = tableWrap.getBoundingClientRect();
      const totalSize = isNarrow ? contentRect.height : contentRect.width;
      const currentPrimarySize = isNarrow ? tableRect.height : tableRect.width;
      const split = adjustMainSplitByKeyboard(currentPrimarySize, totalSize, isNarrow, event.key, event.shiftKey);
      applyMainSplit(split);
      rememberMainSplit(split);
      if (split) setStatus('Request list ' + split.primaryPercent + ' percent');
    });
    resizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const isNarrow = window.innerWidth <= NARROW_PANEL_MAX_WIDTH;
      let draggedSplit = null;
      const handleMouseMove = (moveEvent) => {
        const contentRect = content.getBoundingClientRect();
        const totalSize = isNarrow ? contentRect.height : contentRect.width;
        const pointerPosition = isNarrow
          ? moveEvent.clientY - contentRect.top
          : moveEvent.clientX - contentRect.left;
        const split = calculateMainSplit(pointerPosition, totalSize, isNarrow);
        applyMainSplit(split);
        if (split) draggedSplit = split;
      };
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        rememberMainSplit(draggedSplit);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });

    // Inspector divider (Request/Response pane resize)
    const inspectorDivider = $('#inspector-divider');
    const inspectorPanels = inspectorDivider ? inspectorDivider.parentElement : null;
    if (inspectorDivider && inspectorPanels) {
      const requestPane = $('#inspector-request');
      const responsePane = $('#inspector-response');
      const inspectorHalves = {
        request: { pane: requestPane, toggle: $('#inspector-request-toggle'), bar: $('#req-tab-bar'), labelKey: 'inspectorHalfRequest' },
        response: { pane: responsePane, toggle: $('#inspector-response-toggle'), bar: $('#res-tab-bar'), labelKey: 'inspectorHalfResponse' },
      };
      // The divider's value text and the keyboard-resize status line are the
      // same sentence about the request half, so both compose it here rather
      // than each pasting an English one together.
      const inspectorPercentValue = (percent) =>
        uiTextFormat('inspectorHalfPercentValue', {
          half: uiText(inspectorHalves.request.labelKey),
          percent,
        });
      // The remembered split: a dragged or keyed percent (null = the
      // stylesheet's 50/50) and the half collapsed to its label + tab bar.
      // Both outlive the session next to the details width preference.
      const inspectorPref = loadInspectorSplitPref();
      let inspectorSplitPercent = inspectorPref.percent === 50 ? null : inspectorPref.percent;
      let collapsedInspectorHalf = null;
      // Short pane: the stylesheet turns the panels into one scrolling column
      // (@container (max-height:480px) in panel.css) and the divider is gone.
      // The mode is read back from the computed display instead of repeating
      // the threshold here, so there is one source of truth and it cannot
      // drift: 'block' is the column, 'flex' the split, 'none' a hidden pane.
      const isInspectorColumn = () => getComputedStyle(inspectorPanels).display === 'block';
      let wasInspectorColumn = false;
      // Who held the focus, recorded as focus moves rather than reconstructed
      // at the crossing. The column mode takes the divider's box away and the
      // browser drops its focus to <body>; nothing orders that drop against
      // the resize that runs rescaleInspectorSplit, so activeElement inside
      // the crossing reads as the divider in one frame and as <body> in the
      // next. This variable reads the same either way, because <body> is
      // never written into it — the crossing consults it, not the order.
      let lastFocusedControl = null;
      // True only while the response caption holds the focus the crossing put
      // there. A reader who moved on keeps the focus they chose, so any other
      // control taking focus cancels the debt.
      let inspectorDividerFocusHandedOver = false;
      document.addEventListener('focusin', (event) => {
        const target = event.target;
        if (!target || target === document.body) return;
        lastFocusedControl = target;
        if (target !== inspectorHalves.response.toggle) inspectorDividerFocusHandedOver = false;
      });
      // The response caption is where the divider's focus goes: in the column
      // it is the control that still does the divider's job, opening and
      // closing the half the divider used to size. Handed back on the way out
      // only while that caption still holds it.
      const handInspectorDividerFocusOver = (columnMode) => {
        const responseToggle = inspectorHalves.response.toggle;
        if (!responseToggle) return;
        // <body> is not an answer here: it is the hole the mode change left.
        const held =
          document.activeElement && document.activeElement !== document.body
            ? document.activeElement
            : lastFocusedControl;
        if (columnMode) {
          if (held !== inspectorDivider) return;
          responseToggle.focus({ preventScroll: true });
          // After the focus call, not before: the focusin it fires runs first
          // and is the one listener that would otherwise clear this.
          inspectorDividerFocusHandedOver = true;
          return;
        }
        if (!inspectorDividerFocusHandedOver || held !== responseToggle) return;
        inspectorDividerFocusHandedOver = false;
        inspectorDivider.focus({ preventScroll: true });
      };
      const rememberInspectorSplit = () => {
        saveInspectorSplitPref({
          percent: inspectorSplitPercent == null ? 50 : inspectorSplitPercent,
          collapsed: collapsedInspectorHalf,
        });
      };
      const clearInspectorSplitStyles = () => {
        requestPane.style.flex = '';
        responsePane.style.flex = '';
        requestPane.style.height = '';
        responsePane.style.height = '';
      };
      const applyInspectorSplit = (split) => {
        if (!split) return;
        requestPane.style.flex = 'none';
        responsePane.style.flex = 'none';
        requestPane.style.height = split.requestSize + 'px';
        responsePane.style.height = split.responseSize + 'px';
        inspectorSplitPercent = split.requestPercent;
        inspectorDivider.setAttribute('aria-valuenow', String(split.requestPercent));
        inspectorDivider.setAttribute('aria-valuetext', inspectorPercentValue(split.requestPercent));
      };
      const syncInspectorDividerValue = () => {
        if (collapsedInspectorHalf) {
          inspectorDivider.setAttribute('aria-valuenow', collapsedInspectorHalf === 'request' ? '0' : '100');
          inspectorDivider.setAttribute(
            'aria-valuetext',
            uiTextFormat('inspectorHalfCollapsedValue', { half: uiText(inspectorHalves[collapsedInspectorHalf].labelKey) }),
          );
          return;
        }
        const split = calculateInspectorSplit(
          requestPane.getBoundingClientRect().height,
          inspectorPanels.getBoundingClientRect().height,
        );
        // Before the first selection the panes have no height and there is
        // nothing to measure. The remembered percent is still the truth, and
        // writing it is what replaces the authored English attribute, so the
        // divider never announces one language while the pane speaks another.
        const percent = split ? split.requestPercent : inspectorSplitPercent == null ? 50 : inspectorSplitPercent;
        inspectorDivider.setAttribute('aria-valuenow', String(percent));
        inspectorDivider.setAttribute('aria-valuetext', inspectorPercentValue(percent));
      };
      // The labels are the collapse toggles; their tooltip and aria-expanded
      // follow the state, and the language switch re-runs this for the tooltip.
      const syncInspectorToggles = () => {
        for (const half of INSPECTOR_HALVES) {
          const { toggle, labelKey } = inspectorHalves[half];
          if (!toggle) continue;
          const collapsed = collapsedInspectorHalf === half;
          toggle.setAttribute('aria-expanded', String(!collapsed));
          toggle.title = uiTextFormat(collapsed ? 'inspectorExpandHalfTitle' : 'inspectorCollapseHalfTitle', {
            half: uiText(labelKey),
          });
        }
        inspectorPanels.classList.toggle('has-collapsed', collapsedInspectorHalf !== null);
        inspectorDivider.setAttribute('aria-disabled', String(collapsedInspectorHalf !== null));
        // The divider's value text names the same half, so the language
        // switch that re-runs this must re-compose it too.
        syncInspectorDividerValue();
      };
      // Percents are of the space the panes share (the divider excluded), so
      // a re-applied or restored split lands on the percent it was saved as.
      const splitForPercent = (percent) => {
        const totalHeight = inspectorPanels.getBoundingClientRect().height;
        if (!Number.isFinite(percent) || totalHeight <= 0) return null;
        return calculateInspectorSplit((percent / 100) * (totalHeight - INSPECTOR_DIVIDER_HEIGHT), totalHeight);
      };
      // A drag freezes both panes at flex:none + px heights; without this, a
      // later window resize clips the response pane behind overflow:hidden.
      // With a half collapsed both heights go back to flex (auto + 1), and a
      // pane too short for the dragged split also hands control to flex.
      const rescaleInspectorSplit = () => {
        // A hidden pane has no height to share out; leave the split alone.
        if (inspectorPanels.getBoundingClientRect().height <= 0) return;
        const columnMode = isInspectorColumn();
        const action = planInspectorSplitApplication({
          columnMode,
          wasColumnMode: wasInspectorColumn,
          collapsedHalf: collapsedInspectorHalf,
          hasInlineHeight: Boolean(requestPane.style.height),
        });
        const crossedThreshold = columnMode !== wasInspectorColumn;
        wasInspectorColumn = columnMode;
        // Focus first: the mode has already changed in the stylesheet, so a
        // divider that held it has already lost it, and the restore below is
        // free to rebuild heights around wherever the focus now lives.
        if (crossedThreshold) handInspectorDividerFocusOver(columnMode);
        // Tall again: the percent the column mode had to drop goes back on.
        if (action === 'restore') {
          restoreInspectorSplit();
          return;
        }
        if (action === 'clear') {
          clearInspectorSplitStyles();
        } else if (action === 'rescale') {
          const split = splitForPercent(parseFloat(inspectorDivider.getAttribute('aria-valuenow')));
          if (split) applyInspectorSplit(split);
          else clearInspectorSplitStyles();
        }
        // The column has no divider to describe, and measuring the halves
        // against the pane's own box there would announce a share of nothing.
        if (columnMode) return;
        syncInspectorDividerValue();
      };
      window.addEventListener('resize', rescaleInspectorSplit);
      // The panes' shared height also moves without a window resize: the
      // summary strip renders after the pane opens, the stacked main split
      // is dragged. Same one-frame deferral as the grid observer; the panes
      // are children, so re-applying their heights cannot resize the panels.
      if (typeof ResizeObserver === 'function') {
        let inspectorFrame = 0;
        new ResizeObserver(() => {
          if (inspectorFrame) return;
          inspectorFrame = requestAnimationFrame(() => {
            inspectorFrame = 0;
            rescaleInspectorSplit();
          });
        }).observe(inspectorPanels);
      }
      // The remembered percent is applied once the pane has a height (it is
      // hidden until the first selection) and only while nothing has been
      // dragged since: a live drag already owns the inline heights.
      const restoreInspectorSplit = () => {
        // In the short-pane column the remembered percent stays remembered and
        // unapplied: see planInspectorSplitApplication.
        if (isInspectorColumn()) {
          wasInspectorColumn = true;
          clearInspectorSplitStyles();
          return;
        }
        if (collapsedInspectorHalf) {
          clearInspectorSplitStyles();
        } else if (!requestPane.style.height && inspectorSplitPercent != null) {
          applyInspectorSplit(splitForPercent(inspectorSplitPercent));
        }
        syncInspectorDividerValue();
      };
      resyncInspectorSplit = restoreInspectorSplit;
      refreshInspectorToggleTitles = syncInspectorToggles;

      const setCollapsedInspectorHalf = (next, announce) => {
        const previous = collapsedInspectorHalf;
        collapsedInspectorHalf = next;
        for (const half of INSPECTOR_HALVES) {
          inspectorHalves[half].pane.classList.toggle('is-collapsed', next === half);
        }
        syncInspectorToggles();
        restoreInspectorSplit();
        const changedHalf = next || previous;
        if (announce && changedHalf) {
          const half = uiText(inspectorHalves[changedHalf].labelKey);
          // The split's sentence sends the reader to the divider. In the
          // short-pane column that divider is display:none, so announcing it
          // there would name a control the reader cannot reach; the caption
          // they just clicked is what puts the half back.
          setStatus(
            next
              ? isInspectorColumn()
                ? uiTextFormat('inspectorHalfCollapsedColumnStatus', { half })
                : uiTextFormat('inspectorHalfCollapsedStatus', { half })
              : uiTextFormat('inspectorHalfExpandedStatus', { half }),
          );
        }
      };
      const toggleInspectorHalf = (half) => {
        setCollapsedInspectorHalf(planInspectorCollapse(collapsedInspectorHalf, half), true);
        rememberInspectorSplit();
      };
      for (const half of INSPECTOR_HALVES) {
        const { toggle, bar } = inspectorHalves[half];
        if (toggle) toggle.addEventListener('click', () => toggleInspectorHalf(half));
        // Picking a tab in a collapsed half is a request to read it.
        if (bar) {
          bar.addEventListener('click', (event) => {
            if (collapsedInspectorHalf === half && event.target.closest('.tab-btn')) toggleInspectorHalf(half);
          });
        }
      }
      // Double-clicking the divider is the one-step way back to 50/50 with
      // both halves open, whatever was dragged or collapsed.
      const resetInspectorSplit = () => {
        inspectorSplitPercent = null;
        clearInspectorSplitStyles();
        setCollapsedInspectorHalf(null, false);
        inspectorDivider.setAttribute('aria-valuenow', '50');
        inspectorDivider.setAttribute('aria-valuetext', inspectorPercentValue(50));
        syncInspectorDividerValue();
        rememberInspectorSplit();
        setStatus(uiText('inspectorSplitResetStatus'));
      };
      // The divider has no box in the short-pane column, so these three are
      // unreachable by pointer or focus there — but a stale focus and a
      // dispatched event still arrive, and either would write inline heights
      // the column cannot survive. Separate statements, not folded conditions.
      inspectorDivider.addEventListener('dblclick', (event) => {
        event.preventDefault();
        if (isInspectorColumn()) return;
        resetInspectorSplit();
      });
      // The collapsed half is restored at once (a class, no measurement); the
      // percent waits for the pane to have a height (resyncInspectorSplit).
      if (inspectorPref.collapsed) setCollapsedInspectorHalf(inspectorPref.collapsed, false);
      else syncInspectorToggles();

      inspectorDivider.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        event.stopPropagation();
        if (isInspectorColumn()) return;
        if (collapsedInspectorHalf) return;
        const totalSize = inspectorPanels.getBoundingClientRect().height;
        const split = adjustInspectorSplitByKeyboard(
          requestPane.getBoundingClientRect().height,
          totalSize,
          event.key,
          event.shiftKey,
        );
        applyInspectorSplit(split);
        if (split) {
          rememberInspectorSplit();
          setStatus(inspectorPercentValue(split.requestPercent));
        }
      });
      inspectorDivider.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (isInspectorColumn()) return;
        if (collapsedInspectorHalf) return;
        let dragged = false;
        const handleMove = (moveEvent) => {
          const panelsRect = inspectorPanels.getBoundingClientRect();
          const pointerPosition = moveEvent.clientY - panelsRect.top;
          const split = calculateInspectorSplit(pointerPosition, panelsRect.height);
          applyInspectorSplit(split);
          if (split) dragged = true;
        };
        const handleUp = () => {
          document.removeEventListener('mousemove', handleMove);
          document.removeEventListener('mouseup', handleUp);
          if (dragged) rememberInspectorSplit();
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
    const searchMatchesOnlyToggle = $('#searchMatchesOnlyToggle');
    const searchOptionButtons = [
      { id: '#searchOptCaseBtn', key: 'caseSensitive', label: 'Match case' },
      { id: '#searchOptWordBtn', key: 'wholeWord', label: 'Match whole word' },
      { id: '#searchOptRegexBtn', key: 'regex', label: 'Regular expression' },
    ].map((entry) => ({ ...entry, el: $(entry.id) }));
    // Track search panel visibility
    let searchPanelVisible = false;

    function toggleSearchPanel(forceOpen, focusInput) {
      const shouldShow = forceOpen != null ? forceOpen : !searchPanelVisible;
      searchPanelVisible = shouldShow;
      searchPanel.style.display = shouldShow ? 'block' : 'none';
      searchToggleBtn.classList.toggle('active', shouldShow);
      searchToggleBtn.setAttribute('aria-expanded', String(shouldShow));
      if (shouldShow) {
        // Ensure at least one keyword row exists
        if (state.search.keywords.length === 0) {
          addKeywordRow();
        }
        renderSearchRows();
        // Focus the first input
        const firstInput = searchRows.querySelector('.search-keyword-input');
        if (focusInput !== false && firstInput) firstInput.focus();
      }
    }


    // Scope popup (dynamically created)
    const scopePopup = document.createElement('div');
    scopePopup.id = 'searchScopePopup';
    scopePopup.className = 'search-scope-popup dropdown-content';
    scopePopup.style.position = 'fixed';
    scopePopup.style.display = 'none';
    scopePopup.setAttribute('role', 'dialog');
    scopePopup.setAttribute('aria-label', 'Search scope');
    installPopupKeyboardSupport(scopePopup);
    document.body.appendChild(scopePopup);

    const scopeLabels = [
      { key: 'url', text: 'URL / Method / Status / Type' },
      { key: 'reqBody', text: 'Request Body' },
      { key: 'resBody', text: 'Response Body' },
      { key: 'reqHeaders', text: 'Request Headers' },
      { key: 'resHeaders', text: 'Response Headers' },
    ];

    for (const sl of scopeLabels) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.search.scope[sl.key];
      cb.dataset.searchScope = sl.key;
      const span = document.createElement('span');
      span.textContent = sl.text;
      label.appendChild(cb);
      label.appendChild(span);
      scopePopup.appendChild(label);
      cb.addEventListener('change', () => {
        state.search.scope[sl.key] = cb.checked;
        executeSearch();
        saveSearchPrefs(currentSearchPrefs());
      });
    }

    function syncSearchScopeControls() {
      for (const input of $all('input[data-search-scope]', scopePopup)) {
        input.checked = state.search.scope[input.dataset.searchScope] === true;
      }
    }

    searchMatchesOnlyToggle.addEventListener('change', () => {
      state.search.matchesOnly = searchMatchesOnlyToggle.checked;
      renderBody();
      updateSearchUI();
      saveSearchPrefs(currentSearchPrefs());
      setStatus(
        state.search.matchesOnly
          ? 'Showing only requests that match search keywords'
          : 'Showing all requests with search highlights',
      );
    });

    for (const optionButton of searchOptionButtons) {
      optionButton.el.addEventListener('click', () => {
        state.search.options[optionButton.key] = !state.search.options[optionButton.key];
        executeSearch();
        updateSearchUI();
        saveSearchPrefs(currentSearchPrefs());
        setStatus(
          optionButton.label + (state.search.options[optionButton.key] ? ' on' : ' off'),
        );
      });
    }

    searchScopeBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (scopePopup.classList.contains('show')) {
        closeAccessiblePopup(scopePopup, true);
        return;
      }
      const rect = searchScopeBtn.getBoundingClientRect();
      showAccessiblePopupAt(scopePopup, rect.left, rect.bottom, searchScopeBtn);
    });

    // Color picker popup (shared, repositioned on open)
    const colorPopup = document.createElement('div');
    colorPopup.id = 'searchColorMenu';
    colorPopup.className = 'search-color-popup dropdown-content';
    colorPopup.style.position = 'fixed';
    colorPopup.style.display = 'none';
    colorPopup.setAttribute('role', 'menu');
    colorPopup.setAttribute('aria-label', 'Search highlight color');
    installPopupKeyboardSupport(colorPopup);
    document.body.appendChild(colorPopup);

    let colorPopupTargetIdx = -1;
    for (let ci = 0; ci < SEARCH_COLORS.length; ci++) {
      const swatch = document.createElement('button');
      swatch.className = 'search-color-swatch';
      swatch.style.background = SEARCH_COLORS[ci].cssColor;
      swatch.title = SEARCH_COLORS[ci].name;
      swatch.setAttribute('role', 'menuitemradio');
      swatch.setAttribute('aria-checked', 'false');
      swatch.setAttribute('aria-label', 'Use ' + SEARCH_COLORS[ci].name + ' search color');
      swatch.addEventListener('click', () => {
        const targetIndex = colorPopupTargetIdx;
        closeAccessiblePopup(colorPopup, false);
        if (targetIndex >= 0 && targetIndex < state.search.keywords.length) {
          state.search.keywords[targetIndex].colorIdx = ci;
          renderSearchRows();
          executeSearch();
          const nextTrigger = searchRows.querySelector(
            '.search-color-btn[data-keyword-index="' + targetIndex + '"]',
          );
          if (nextTrigger) nextTrigger.focus();
        }
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
      let focusedNavSelector = '';
      if (activeEl && activeEl.classList.contains('search-keyword-input')) {
        const inputs = searchRows.querySelectorAll('.search-keyword-input');
        focusedIdx = Array.from(inputs).indexOf(activeEl);
        selStart = activeEl.selectionStart || 0;
        selEnd = activeEl.selectionEnd || 0;
      } else if (activeEl && activeEl.classList.contains('search-kw-nav')) {
        focusedNavSelector =
          '.search-kw-nav[data-keyword-index="' + activeEl.dataset.keywordIndex +
          '"][data-search-direction="' + activeEl.dataset.searchDirection + '"]';
      }

      searchRows.textContent = '';
      for (let i = 0; i < state.search.keywords.length; i++) {
        const kw = state.search.keywords[i];
        const row = document.createElement('div');
        row.className = 'search-keyword-row';

        // Color button
        const colorBtn = document.createElement('button');
        colorBtn.className = 'search-color-btn';
        colorBtn.style.background = SEARCH_COLORS[kw.colorIdx].cssColor;
        colorBtn.title = 'Change color';
        colorBtn.dataset.keywordIndex = String(i);
        colorBtn.setAttribute('aria-label', 'Change color for search keyword ' + (i + 1));
        colorBtn.setAttribute('aria-haspopup', 'menu');
        colorBtn.setAttribute('aria-controls', 'searchColorMenu');
        colorBtn.setAttribute('aria-expanded', 'false');
        colorBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (colorPopup.classList.contains('show') && colorPopupTargetIdx === i) {
            closeAccessiblePopup(colorPopup, true);
            return;
          }
          colorPopupTargetIdx = i;
          colorPopup.querySelectorAll('.search-color-swatch').forEach((swatch, swatchIndex) => {
            const isActive = swatchIndex === kw.colorIdx;
            swatch.classList.toggle('active', isActive);
            swatch.setAttribute('aria-checked', String(isActive));
          });
          const rect = colorBtn.getBoundingClientRect();
          showAccessiblePopupAt(colorPopup, rect.right + SEARCH_COLOR_POPUP_GAP, rect.top, colorBtn, 'flex');
        });
        row.appendChild(colorBtn);

        // Text input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'search-keyword-input';
        input.placeholder = 'Enter search keyword...';
        input.value = kw.query;
        input.setAttribute('aria-label', 'Search keyword ' + (i + 1));
        const keywordRegexError =
          state.search.options.regex && kw.query.trim()
            ? compileSearchQuery(kw.query, state.search.options).error
            : null;
        if (keywordRegexError) {
          input.classList.add('search-keyword-input-error');
          input.title = 'Invalid regular expression: ' + keywordRegexError;
        }
        input.addEventListener('input', () => {
          state.search.keywords[i].query = input.value;
          debouncedSearch();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            navigateKeywordSearch(i, e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            // Closing display:none's the focused input, which silently resets
            // focus to <body>; hand it back to the control that opens the panel.
            toggleSearchPanel(false);
            searchToggleBtn.focus();
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
          countSpan.style.color = 'var(--status-5xx-text)';
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
        prevBtn.textContent = '▲';
        prevBtn.title = 'Previous match (Shift+Enter)';
        prevBtn.dataset.keywordIndex = String(i);
        prevBtn.dataset.searchDirection = '-1';
        prevBtn.setAttribute('aria-label', 'Previous match for search keyword ' + (i + 1));
        prevBtn.disabled = kwMatchCount === 0;
        prevBtn.addEventListener('click', () => navigateKeywordSearch(i, -1));
        row.appendChild(prevBtn);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'search-kw-nav';
        nextBtn.textContent = '▼';
        nextBtn.title = 'Next match (Enter)';
        nextBtn.dataset.keywordIndex = String(i);
        nextBtn.dataset.searchDirection = '1';
        nextBtn.setAttribute('aria-label', 'Next match for search keyword ' + (i + 1));
        nextBtn.disabled = kwMatchCount === 0;
        nextBtn.addEventListener('click', () => navigateKeywordSearch(i, 1));
        row.appendChild(nextBtn);

        // Remove button (only if more than one row)
        if (state.search.keywords.length > 1) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'search-remove-btn';
          removeBtn.textContent = '×';
          removeBtn.title = 'Remove keyword';
          removeBtn.setAttribute('aria-label', 'Remove search keyword ' + (i + 1));
          removeBtn.addEventListener('click', () => {
            state.search.keywords.splice(i, 1);
            renderSearchRows();
            executeSearch();
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
      } else if (focusedNavSelector) {
        const navButton = searchRows.querySelector(focusedNavSelector);
        if (navButton) navButton.focus();
      }
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
        renderGridAfterSearchChange();
        return;
      }
      // refreshSearchMatches() is called inside renderBody()
      srch.currentIndex = -1; // reset navigation to recalculate after render
      renderGridAfterSearchChange();
      srch.currentIndex = srch.matches.length > 0 ? 0 : -1;
      updateSearchUI();
    }

    const debouncedSearch = debounce(() => executeSearch(), DEEP_SEARCH_DEBOUNCE_MS);

    function updateSearchUI() {
      const srch = state.search;
      const activeKws = srch.keywords.filter((kw) => kw.query.trim());
      if (srch.matches.length === 0 && activeKws.length > 0) {
        searchCount.textContent = 'No matches';
        searchCount.style.color = 'var(--status-5xx-text)';
      } else if (srch.matches.length > 0) {
        searchCount.textContent = srch.matches.length + ' matches';
        searchCount.style.color = '';
      } else {
        searchCount.textContent = '';
        searchCount.style.color = '';
      }
      searchMatchesOnlyToggle.checked = srch.matchesOnly === true;
      for (const optionButton of searchOptionButtons) {
        optionButton.el.setAttribute('aria-pressed', String(srch.options[optionButton.key] === true));
      }
      // Body-search progress and mode notes live inside the search panel where
      // they have reserved space; putting them in the top bar resized the count
      // span continuously during capture and made the buttons jitter.
      const unsearchedBodies = srch.scope.resBody && activeKws.length > 0
        ? countUnsearchedResponseBodies(state.filteredRows)
        : 0;
      const noticeParts = [];
      if (srch.matchesOnly && activeKws.length > 0) noticeParts.push('Showing matches only');
      if (unsearchedBodies > 0) noticeParts.push(unsearchedBodies + ' bodies not searched');
      const notice = $('#searchPanelNotice');
      if (notice) notice.textContent = noticeParts.join(' · ');
      const announcement = [searchCount.textContent, ...noticeParts].filter(Boolean).join(' · ');
      queueSearchCountAnnouncement(announcement);
      // Update per-keyword counts in search rows
      renderSearchRows();
    }
    state.syncSearchUI = updateSearchUI;

    loadSearchPrefs((prefs) => {
      state.search.scope = prefs.scope;
      state.search.options = prefs.options;
      state.search.matchesOnly = prefs.matchesOnly;
      syncSearchScopeControls();
      updateSearchUI();
      renderBody();
    });

    function scrollToSearchMatch(matchRow) {
      if (!matchRow) return;
      const matchTr = $('#tableWrap').querySelector('tr[data-row-id="' + matchRow.id + '"]');
      if (matchTr) matchTr.scrollIntoView({ block: 'nearest' });
    }

    function navigateKeywordSearch(kwIndex, direction) {
      const srch = state.search;
      const kwData = srch.perKeyword.get(kwIndex);
      if (!kwData) return;
      const previousCurrentRow =
        srch.currentIndex >= 0 && srch.currentIndex < srch.matches.length
          ? srch.matches[srch.currentIndex]
          : null;
      const navigation = planKeywordSearchNavigation(
        kwData.matches,
        kwData.currentIndex,
        direction,
        srch.matches,
      );
      if (!navigation) return;
      kwData.currentIndex = navigation.keywordIndex;
      srch.currentIndex = navigation.globalIndex;
      renderSearchRows();
      selectRow(navigation.targetRow, null, false, [previousCurrentRow]);
      scrollToSearchMatch(navigation.targetRow);
    }

    searchToggleBtn.addEventListener('click', () => toggleSearchPanel());

    // Ctrl+F toggles the search panel — unless focus is inside a detail pane
    // that carries its own search bar, which then takes the shortcut.
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const activePane =
          document.activeElement && document.activeElement.closest
            ? document.activeElement.closest('.tab-pane')
            : null;
        const paneSearchInput = activePane ? activePane.querySelector('.pane-search-input') : null;
        e.preventDefault();
        e.stopPropagation();
        if (paneSearchInput) {
          paneSearchInput.focus();
          paneSearchInput.select();
          return;
        }
        toggleSearchPanel(true);
      }
    }, true);

    // Import Feature (HAR / SAZ)
    const importBtn = $('#importBtn');
    const importFile = $('#importFile');
    if (importBtn && importFile) {
      let importInProgress = false;

      const setImportBusy = (busy) => {
        importInProgress = busy;
        importBtn.disabled = busy;
        importFile.disabled = busy;
        importBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
      };

      const stageHarImport = async (file) => {
        const text = await file.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (_error) {
          throw createImportError('HAR is not valid JSON.');
        }
        const entries = validateHarDocument(data);
        const importPlan = planImportRetention(
          entries.length,
          state.retention.requestLimit,
          state.retention.unlimited,
        );
        const rows = [];
        for (let index = importPlan.startIndex; index < entries.length; index++) {
          const entry = normalizeHarEntry(entries[index]);
          const row = buildRowFromRequest(entry, 0);
          const availability = classifyImportedResponseContent(entry);
          if (availability.state === 'empty') {
            row.responseContent = '';
            row.responseContentState = 'pending-admission';
          } else if (availability.state === 'unavailable') {
            row.responseContentState = 'unavailable';
            row.responseContentReason = availability.reason;
          }
          applyHarWebSocketMessages(row, entries[index] ? entries[index]._webSocketMessages : null);
          rows.push(row);
        }
        return {
          format: 'HAR',
          totalCount: entries.length,
          skippedCount: importPlan.skippedCount,
          rows,
        };
      };

      const stageSazImport = async (file) => {
        if (!window.fflate || !window.fflate.Unzip) {
          throw createImportError('SAZ decompression support is unavailable.');
        }
        const sourceBytes = new Uint8Array(await file.arrayBuffer());
        const extractedEntries = await extractBoundedSazEntries(window.fflate, sourceBytes);
        const requestIds = new Set();
        for (const key of extractedEntries.keys()) {
          const parsedPath = parseSazEntryPath(key);
          if (parsedPath) requestIds.add(parsedPath.requestId);
        }
        const completeIds = Array.from(requestIds)
          .filter((id) =>
            extractedEntries.has(`raw/${id}_c.txt`) &&
            extractedEntries.has(`raw/${id}_s.txt`))
          .sort(compareSazRequestIds);
        if (completeIds.length === 0) throw createImportError('SAZ contains no complete HTTP sessions.');

        const importPlan = planImportRetention(
          completeIds.length,
          state.retention.requestLimit,
          state.retention.unlimited,
        );
        const rows = [];
        const startedDateTime = new Date().toISOString();
        for (let index = importPlan.startIndex; index < completeIds.length; index++) {
          const id = completeIds[index];
          const entry = createSazHarEntry(
            extractedEntries.get(`raw/${id}_c.txt`),
            extractedEntries.get(`raw/${id}_s.txt`),
            startedDateTime,
          );
          rows.push(buildRowFromRequest(entry, 0));
        }
        return {
          format: 'SAZ',
          totalCount: completeIds.length,
          skippedCount: importPlan.skippedCount,
          rows,
        };
      };

      const commitStagedImport = (stagedImport) => {
        commitPendingLiveRows();
        if (state.automaticResponsePrefetchScheduler) {
          state.automaticResponsePrefetchScheduler.resetFailureSummary();
        }
        disposeClearUndoSnapshot('import');
        exitSampleCaptureMode();
        state.paused = true;
        updateRecordState();
        resetPendingLiveRows();
        clearStoredRows();
        state.selectedRow = null;
        state.focusedRow = null;
        state.selectedRows.clear();
        state.highlightedRows.clear();
        recordSkippedImportRows(stagedImport.skippedCount);
        for (const row of stagedImport.rows) row.id = state.nextId++;
        const retainedRows = addRowsWithRetention(stagedImport.rows, 'import');
        renderBody();
        return retainedRows.length;
      };

      importBtn.addEventListener('click', () => {
        if (importInProgress) return;
        importFile.click();
      });

      // Shared by the local file picker and the mirror tab's transferred
      // imports; resolves with '' on success or the user-facing reason.
      importCapturedFile = async (file) => {
        if (importInProgress) return 'Another import is already in progress.';
        const sourceValidation = validateImportSource(file.name, file.size);
        setImportBusy(true);
        try {
          if (sourceValidation.error) throw createImportError(sourceValidation.error);
          setStatus(`Importing ${sourceValidation.format.toUpperCase()}...`);
          const stagedImport =
            sourceValidation.format === 'har'
              ? await stageHarImport(file)
              : await stageSazImport(file);
          const retainedCount = commitStagedImport(stagedImport);
          setStatus(
            `Imported ${stagedImport.totalCount} requests from ${stagedImport.format}; retained ${retainedCount}`,
          );
          return '';
        } catch (error) {
          const message =
            error && error.name === 'ImportError' ? error.message : 'The selected file could not be imported.';
          setStatus('Import failed: ' + message);
          console.error('Network+ import failed: ' + message);
          return message;
        } finally {
          setImportBusy(false);
        }
      };

      importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || importInProgress) {
          importFile.value = '';
          return;
        }
        await importCapturedFile(file);
        importFile.value = '';
      });
    }

    // Network subscription
    // Batch live rows into one frame. Eligibility is deliberately checked again at flush time.
    const scheduleResponseSearchRefresh = (row) => {
      if (
        !isActiveRetainedRow(row, state.retainedRows, state.activeRows) ||
        !hasActiveSearchKeywords(state.search.keywords)
      ) {
        return;
      }
      if (pendingResponseSearchFrame) return;
      pendingResponseSearchFrame = true;
      window.requestAnimationFrame(() => {
        pendingResponseSearchFrame = false;
        if (!hasActiveSearchKeywords(state.search.keywords)) return;
        renderGridAfterSearchChange();
        updateSearchUI();
      });
    };

    state.onResponseContentChanged = (row) => {
      if (!isActiveRetainedRow(row, state.retainedRows, state.activeRows)) return;
      scheduleResponseSearchRefresh(row);
      if (!shouldRenderSelectedRow(state.selectedRow, row)) return;
      renderCachedResponseContent(row);
    };
    state.automaticResponsePrefetchScheduler = createAutomaticResponsePrefetchScheduler({
      concurrency: AUTOMATIC_RESPONSE_PREFETCH_CONCURRENCY,
      isEligible: (row) => isActiveRetainedRow(row, state.retainedRows, state.activeRows),
      isCached: (row) => typeof row.responseContent === 'string',
      getExistingPromise: (row) => row._responseContentPromise,
      loadRow: (row) => cacheResponseContent(row),
      onSettled: (row, error, source, result) => {
        if (
          !error &&
          source === 'foreground' &&
          result &&
          typeof result.content === 'string' &&
          typeof result.text === 'string' &&
          Number.isFinite(result.bytes)
        ) {
          queueMicrotask(() => {
            if (
              !isActiveRetainedRow(row, state.retainedRows, state.activeRows) ||
              typeof row.responseContent === 'string'
            ) {
              return;
            }
            try {
              admitResponsePayload(row, result);
            } catch (admissionError) {
              row.responseContentError = admissionError;
            }
            scheduleResponseSearchRefresh(row);
          });
          return;
        }
        scheduleResponseSearchRefresh(row);
      },
      shouldReportFailure: (row, error) =>
        describeResponseContentState(row, error).label === 'error',
      getFailureContext: () => statusGeneration,
      onFailureSummary: (failureCount, failureStatusGeneration) => {
        console.error(
          'Network+ automatic response prefetch failed for ' +
            failureCount.toLocaleString() +
            ' requests.',
        );
        if (failureStatusGeneration === statusGeneration) {
          setStatus(formatAutomaticResponsePrefetchFailureSummary(failureCount));
        }
      },
      onInternalError: () =>
        console.error('Network+ automatic response prefetch scheduler failed internally.'),
    });
    // The pop-out mirror tab renders what the port delivers and pulls a body
    // only when a row asks for it. Automatic prefetch there would mass-copy
    // bodies over the port against that design and, once the DevTools
    // session closes, turn every queued fetch into a logged failure that
    // piles up on the browser's extension-errors page.
    if (getMirrorViewParams(window.location ? window.location.search : '').viewerMode) {
      state.automaticResponsePrefetchScheduler = null;
    }
    // Reassigned by the mirror-host wiring below; the capture listener calls
    // it for every finished request so a connected pop-out tab stays live.
    let notifyMirrorRowCaptured = () => {};
    // Late-bound bridges between the mirror wiring and the stream/resend
    // wiring that runs later in init: the host command executor reads them
    // at command time, and the viewer wiring fills its own resend channel.
    let mirrorStreamCaptureState = () => ({ supported: false, enabled: false });
    let mirrorViewerResendDispatch = null;
    let mirrorHostResendDispatch = null;

    const scheduleLiveRows = (scrollToBottom) => {
      if (scrollToBottom) pendingScrollToBottom = true;
      if (pendingLiveRows.length >= LIVE_PENDING_HIGH_WATER_MARK) {
        commitPendingLiveRows();
      }
      if (pendingLiveRows.length > 0) {
        armPendingLiveCommitTimer();
      }
      if (pendingLiveFrame) return;
      pendingLiveFrame = true;
      window.requestAnimationFrame(() => {
        pendingLiveFrame = false;
        const shouldScrollToBottom = pendingScrollToBottom && state.autoScroll;
        pendingScrollToBottom = false;
        commitPendingLiveRows();
        const liveRows = state.liveRowsAwaitingRender
          .splice(0, state.liveRowsAwaitingRender.length)
          .filter((row) => isActiveRetainedRow(row, state.retainedRows, state.activeRows));
        if (liveRows.length === 0) return;
        const fastPathEligible = isIncrementalAppendEligible(
          state.sort,
          countActiveColumnFilters(state.columnFilterRules),
          state.search.keywords,
          state.renderedActiveFilterCount,
        );
        if (!fastPathEligible || !appendIncrementalRows(liveRows)) renderBody();
        if (shouldScrollToBottom && state.autoScroll) {
          tableWrap.scrollTop = tableWrap.scrollHeight;
          previousTableScrollTop = tableWrap.scrollTop;
        }
      });
    };

    if (chrome && chrome.devtools && chrome.devtools.network && chrome.devtools.network.onRequestFinished) {
      chrome.devtools.network.onRequestFinished.addListener((request) => {
        if (state.paused || state.sampleCaptureActive) return;
        disposeClearUndoSnapshot(
          'live',
          'Undo for the cleared local sample was closed before live capture to keep sample and live traffic separate.',
        );
        const row = buildRowFromRequest(request);
        notifyMirrorRowCaptured(row);
        const wasAtBottom =
          state.autoScroll &&
          tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - SCROLL_THRESHOLD;
        pendingLiveRows.push(row);

        scheduleLiveRows(wasAtBottom);
      });
      if (
        chrome.devtools.network.onNavigated &&
        typeof chrome.devtools.network.onNavigated.addListener === 'function'
      ) {
        chrome.devtools.network.onNavigated.addListener(() => {
          // Navigation never clears the table. It only ends the browser's
          // willingness to serve the previous document's response bodies, so
          // rows that lost that race flip to an honest terminal state now
          // instead of failing a doomed retrieval later. Rows held by a
          // pending clear-undo snapshot are just as doomed — Undo would
          // otherwise restore them into the prefetch queue, where each grinds
          // through a 10-second timeout before landing on 'error' instead of
          // the honest navigation state.
          const heldSnapshotRows = state.clearUndoSnapshot ? state.clearUndoSnapshot.rows : [];
          const navigatedBodyRows = markUnfetchedRowsForNavigation(
            pendingLiveRows.concat(state.rows, heldSnapshotRows),
          );
          const retainedCount = state.rows.length + pendingLiveRows.length;
          if (retainedCount === 0) return;
          setStatus(
            'Page navigated; kept ' +
              formatRequestCount(retainedCount) +
              (navigatedBodyRows.length > 0
                ? '; ' + navigatedBodyRows.length + ' response bodies were not retrieved in time.'
                : '.'),
          );
        });
      }
      setStatus('Capturing...');
    } else {
      setStatus('DevTools network API unavailable');
    }

    // Error handlers
    window.addEventListener('error', (e) => setStatus('Error: ' + (e.message || e.error || e.filename)));
    window.addEventListener('unhandledrejection', (e) =>
      setStatus('Promise error: ' + ((e.reason && e.reason.message) || e.reason)),
    );

    // Comparison panel: dismiss on Escape and restore focus to invoking row
    const comparePanel = $('#comparePanel');
    if (comparePanel) {
      comparePanel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !comparePanel.hidden) {
          e.preventDefault();
          e.stopPropagation();
          const invokingRowId = state.comparisonInvokingRowId;
          state.comparedRows = null;
          state.comparisonInvokingRowId = null;
          hideComparisonPanel();
          if (invokingRowId) {
            const tr = tableWrap.querySelector('tbody tr[data-row-id="' + invokingRowId + '"]');
            if (tr) tr.focus({ preventScroll: false });
          }
        }
      });
    }
    // --- DevTools-session mirror wiring (pop-out browser tab) ---
    // Placed after the capture registration so the contract-tested live
    // scheduling block stays contiguous; a viewer overwrites the offline
    // status set above as soon as its wiring runs.
    const popoutBtn = $('#popoutBtn');
    const mirrorRuntime = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime : null;
    const mirrorParams = getMirrorViewParams(window.location ? window.location.search : '');
    const mirrorViewerActive =
      mirrorParams.viewerMode &&
      !!(mirrorRuntime && mirrorRuntime.onConnect && typeof mirrorRuntime.onConnect.addListener === 'function');

    if (mirrorViewerActive) {
      document.documentElement.setAttribute('data-view', 'window');
      // Capture still lives in the DevTools session, but the tab's own
      // toolbar drives it remotely over the port: pause, clear, undo,
      // retention, import, stream capture, and resend all execute in the
      // host. Only the pop-out button itself has no meaning here.
      const popoutControl = $('#popoutBtn');
      if (popoutControl) popoutControl.hidden = true;
      let activeMirrorPort = null;
      let mirrorHostPaused = false;
      let mirrorEverConnected = false;
      const updateMirrorStatus = () => {
        if (activeMirrorPort) {
          setStatus(
            mirrorHostPaused
              ? 'Mirroring the DevTools session (recording paused)'
              : 'Mirroring the DevTools session',
          );
        } else if (mirrorEverConnected) {
          setStatus(
            'The DevTools session disconnected; captured requests remain available. ' +
              'To capture without interruption, keep DevTools open — undocked into its own window and minimized is fine.',
          );
        } else {
          setStatus('Waiting for the DevTools session...');
        }
      };
      const bumpNextId = (rowId) => {
        if (Number.isInteger(rowId) && rowId >= state.nextId) state.nextId = rowId + 1;
      };
      const buildViewerRowFromWire = (wireRow) => {
        const row = buildRowFromRequest(buildMirrorEntryFromWire(wireRow), wireRow.id);
        if (wireRow.initiator && typeof wireRow.initiator === 'object') row.initiator = wireRow.initiator;
        // WebSocket rows claim no HTTP status; keep the blank instead of a 0.
        if (wireRow.response && wireRow.response.status === '') row.status = '';
        row._reqObj = null;
        row._mirrorFetchBody = () =>
          new Promise((resolve, reject) => {
            viewerSession.requestBody(row.id, (error, payload) => (error ? reject(error) : resolve(payload)));
          });
        return row;
      };
      // Dedupe by id in O(1): every id ever admitted this session. Stale
      // entries after eviction are harmless — the host never reuses an id
      // within a session, and a session change rebuilds the set below.
      const knownRowIds = new Set();
      const appendWireRow = (wireRow) => {
        if (!Number.isInteger(wireRow.id)) return;
        if (knownRowIds.has(wireRow.id)) return;
        const row = buildViewerRowFromWire(wireRow);
        knownRowIds.add(row.id);
        bumpNextId(row.id);
        const wasAtBottom =
          state.autoScroll &&
          tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - SCROLL_THRESHOLD;
        pendingLiveRows.push(row);
        scheduleLiveRows(wasAtBottom);
      };
      const applyWireSnapshot = (wireRows, options) => {
        commitPendingLiveRows();
        state.liveRowsAwaitingRender.splice(0, state.liveRowsAwaitingRender.length);
        if (options && options.sessionChanged && state.rows.length > 0) {
          // A new DevTools session restarts row ids at 1. Matching its rows
          // by id against the old session's would alias stale evidence onto
          // new requests, so the old table goes and the snapshot starts clean.
          removeRowsFromState(state.rows.slice(), false);
          setStatus('A new DevTools session connected; the table now mirrors it from the start.');
        }
        const existingById = new Map(state.rows.map((row) => [row.id, row]));
        const orderedRows = [];
        const freshRows = [];
        const seenIds = new Set();
        for (const wireRow of Array.isArray(wireRows) ? wireRows : []) {
          if (!wireRow || !Number.isInteger(wireRow.id) || seenIds.has(wireRow.id)) continue;
          seenIds.add(wireRow.id);
          const existing = existingById.get(wireRow.id);
          if (existing) {
            orderedRows.push(existing);
            continue;
          }
          const row = buildViewerRowFromWire(wireRow);
          freshRows.push(row);
          orderedRows.push(row);
        }
        const removedRows = state.rows.filter((row) => !seenIds.has(row.id));
        if (removedRows.length > 0) removeRowsFromState(removedRows, false);
        if (freshRows.length > 0) addRowsWithRetention(freshRows, 'live');
        const orderIndex = new Map(orderedRows.map((row, index) => [row.id, index]));
        state.rows.sort(
          (a, b) =>
            (orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER) -
            (orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER),
        );
        for (const row of state.rows) bumpNextId(row.id);
        knownRowIds.clear();
        for (const row of state.rows) knownRowIds.add(row.id);
        for (const row of pendingLiveRows) knownRowIds.add(row.id);
        render();
        updateRetentionStatus();
      };
      const viewerSession = createMirrorViewerSession({
        postMessage: (message) => {
          if (!activeMirrorPort) {
            throw new Error('The DevTools session is disconnected, so response content cannot be retrieved.');
          }
          activeMirrorPort.postMessage(message);
        },
        appendWireRow,
        applyWireSnapshot,
        getLocalCount: () => state.rows.length + pendingLiveRows.length,
        getLocalMaxId: () => {
          let maxId = 0;
          for (const row of state.rows) if (row.id > maxId) maxId = row.id;
          for (const row of pendingLiveRows) if (row.id > maxId) maxId = row.id;
          return maxId;
        },
        onHostSync: (message) => {
          const paused = message.paused === true;
          if (paused !== mirrorHostPaused) {
            mirrorHostPaused = paused;
            updateMirrorStatus();
          }
          applyHostControlState(message.control);
        },
      });
      const wsCaptureBtnViewer = $('#wsCaptureBtn');
      // The host reports devtoolsMinimized:false when its DevTools is docked
      // and therefore stayed visible next to this tab. That duplication is
      // the one moment the undock explainer earns its interruption — once
      // per page load, and never again after "Don't show this again".
      let undockHintHandled = false;
      const maybeShowUndockHint = () => {
        if (undockHintHandled) return;
        undockHintHandled = true;
        try {
          if (localStorage.getItem(UNDOCK_HINT_KEY) === '1') return;
        } catch (_error) {
          // Unreadable storage just means the hint shows once per page load.
        }
        const hintDialog = $('#undockHintDialog');
        if (hintDialog && typeof hintDialog.showModal === 'function' && !hintDialog.open) {
          hintDialog.showModal();
        }
      };
      const undockHintCloseBtn = $('#undockHintCloseBtn');
      if (undockHintCloseBtn) {
        undockHintCloseBtn.addEventListener('click', () => {
          const dontShowAgain = $('#undockHintDontShowAgain');
          if (dontShowAgain && dontShowAgain.checked) {
            try {
              localStorage.setItem(UNDOCK_HINT_KEY, '1');
            } catch (_error) {
              // An unwritable store just means the hint returns next session.
            }
          }
          const hintDialog = $('#undockHintDialog');
          if (hintDialog && typeof hintDialog.close === 'function') hintDialog.close();
        });
      }
      const applyHostControlState = (control) => {
        if (!control || typeof control !== 'object') return;
        state.paused = control.paused === true;
        // Announce nothing: the mirror status line owns the viewer's story.
        updateRecordState(false);
        if (control.retention && typeof control.retention === 'object') {
          const requestLimit = Number(control.retention.requestLimit);
          if (Number.isFinite(requestLimit)) state.retention.requestLimit = requestLimit;
          state.retention.unlimited = control.retention.unlimited === true;
          updateRetentionStatus();
        }
        const undoButton = $('#undoClearBtn');
        if (undoButton) {
          undoButton.hidden = control.undoAvailable !== true;
          undoButton.disabled = control.undoAvailable !== true;
        }
        if (wsCaptureBtnViewer && control.streamCapture && typeof control.streamCapture === 'object') {
          wsCaptureBtnViewer.hidden = control.streamCapture.supported !== true;
          const streamEnabled = control.streamCapture.enabled === true;
          wsCaptureBtnViewer.textContent = streamEnabled ? 'Stream capture: On' : 'Stream capture: Off';
          wsCaptureBtnViewer.setAttribute('aria-pressed', streamEnabled ? 'true' : 'false');
        }
        if (control.devtoolsMinimized === false) maybeShowUndockHint();
      };
      const sendViewerCommand = (name, args, description, onDone) => {
        try {
          viewerSession.sendCommand(name, args, (error) => {
            if (error) setStatus(description + ' failed: ' + error.message);
            if (typeof onDone === 'function') onDone(error || null);
          });
        } catch (error) {
          setStatus(description + ' failed: ' + (error && error.message ? error.message : 'not connected'));
          if (typeof onDone === 'function') onDone(error);
        }
      };
      const viewerImportInput = document.createElement('input');
      viewerImportInput.type = 'file';
      viewerImportInput.accept = '.har,.saz';
      viewerImportInput.id = 'viewerImportFile';
      viewerImportInput.hidden = true;
      document.body.appendChild(viewerImportInput);
      const viewerControlCommands = {
        pauseBtn: () => sendViewerCommand('pause-toggle', {}, 'Pause/resume'),
        clearBtn: () => sendViewerCommand('clear', {}, 'Clear'),
        undoClearBtn: () => sendViewerCommand('undo-clear', {}, 'Undo clear'),
        wsCaptureBtn: () => sendViewerCommand('stream-toggle', {}, 'Stream capture'),
        importBtn: () => viewerImportInput.click(),
        retentionSaveBtn: () =>
          sendViewerCommand(
            'retention-set',
            {
              unlimited: $('#retentionUnlimited').checked,
              requestLimit: Number($('#retentionLimit').value),
            },
            'Retention change',
            (error) => {
              const retentionErrorEl = $('#retentionError');
              if (error) {
                if (retentionErrorEl) {
                  retentionErrorEl.textContent = error.message;
                  retentionErrorEl.hidden = false;
                }
                return;
              }
              const dialog = $('#settingsDialog');
              if (dialog && typeof dialog.close === 'function') dialog.close();
            },
          ),
      };
      // Same-element listeners fire in registration order regardless of the
      // capture flag, so a per-button interceptor cannot beat the shared
      // local handlers. A document-level capture listener runs before any
      // target listener and stops the event there, which is what turns the
      // tab's controls into pure remote controls.
      document.addEventListener(
        'click',
        (event) => {
          const target = event.target;
          const control = target && typeof target.closest === 'function' ? target.closest('button, input') : null;
          if (!control || !viewerControlCommands[control.id]) return;
          event.preventDefault();
          event.stopPropagation();
          viewerControlCommands[control.id]();
        },
        true,
      );
      viewerImportInput.addEventListener('change', async () => {
        const file = viewerImportInput.files && viewerImportInput.files[0];
        viewerImportInput.value = '';
        if (!file) return;
        if (file.size > MIRROR_IMPORT_MAX_BYTES) {
          setStatus('Import failed: the file exceeds the 64 MiB mirror transfer limit.');
          return;
        }
        setStatus('Sending ' + file.name + ' to the DevTools session...');
        let importBytes;
        try {
          importBytes = new Uint8Array(await file.arrayBuffer());
        } catch (_error) {
          setStatus('Import failed: the selected file could not be read.');
          return;
        }
        try {
          viewerSession.sendImportFile(file.name, importBytes, (error) => {
            setStatus(
              error
                ? 'Import failed: ' + error.message
                : 'Import finished in the DevTools session; the table resyncs momentarily.',
            );
          });
        } catch (error) {
          setStatus('Import failed: ' + (error && error.message ? error.message : 'not connected'));
        }
      });
      mirrorViewerResendDispatch = (spec, done) => viewerSession.sendCommand('resend', { spec }, done);
      mirrorRuntime.onConnect.addListener((port) => {
        if (!port || typeof port.name !== 'string' || !port.name.startsWith(MIRROR_PORT_PREFIX)) return;
        if (mirrorParams.sourceTabId && port.name !== MIRROR_PORT_PREFIX + mirrorParams.sourceTabId) return;
        if (activeMirrorPort) {
          // One DevTools session per mirror tab; a second host is refused.
          try {
            port.disconnect();
          } catch (_error) {
            // A port that is already gone needs no refusal.
          }
          return;
        }
        activeMirrorPort = port;
        mirrorEverConnected = true;
        updateMirrorStatus();
        port.onMessage.addListener((message) => viewerSession.handleMessage(message));
        port.onDisconnect.addListener(() => {
          if (activeMirrorPort !== port) return;
          activeMirrorPort = null;
          viewerSession.failPendingBodyRequests(
            'The DevTools session disconnected before the response content arrived.',
          );
          updateMirrorStatus();
        });
        try {
          port.postMessage({ type: 'hello', protocolVersion: MIRROR_PROTOCOL_VERSION });
        } catch (_error) {
          // The disconnect listener recovers from a port that died mid-handshake.
        }
      });
      updateMirrorStatus();
    }

    const canHostMirror =
      !mirrorViewerActive &&
      !!(
        popoutBtn &&
        mirrorRuntime &&
        typeof mirrorRuntime.connect === 'function' &&
        typeof chrome !== 'undefined' &&
        chrome.devtools &&
        chrome.devtools.network &&
        chrome.devtools.network.onRequestFinished
      );
    if (canHostMirror) {
      popoutBtn.hidden = false;
      const inspectedTabId =
        chrome.devtools.inspectedWindow && Number.isInteger(chrome.devtools.inspectedWindow.tabId)
          ? chrome.devtools.inspectedWindow.tabId
          : 0;
      const mirrorPortName = MIRROR_PORT_PREFIX + inspectedTabId;
      let popoutWindow = null;
      // null until the background worker answers; the viewer uses an explicit
      // false (docked DevTools stayed visible) to offer its undock explainer.
      let popoutDevtoolsMinimized = null;
      let mirrorPort = null;
      // A port counts as confirmed once the peer said anything; probing for
      // a surviving mirror tab otherwise looks identical to a dead port.
      let mirrorPortConfirmed = false;
      // A mirror tab can outlive its DevTools session. On startup (and when
      // an adopted tab reloads) the host probes the scoped port briefly so
      // the surviving tab reattaches instead of stranding behind a duplicate.
      let mirrorProbeAttemptsLeft = MIRROR_ADOPT_PROBE_ATTEMPTS;
      let mirrorReconnectTimer = null;
      let mirrorSyncTimer = null;
      const hostSession = createMirrorHostSession({
        postMessage: (message) => {
          if (!mirrorPort) return;
          try {
            mirrorPort.postMessage(message);
          } catch (_error) {
            // The onDisconnect listener clears the dead port.
          }
        },
        getRows: () => {
          commitPendingLiveRows();
          return state.rows;
        },
        isPaused: () => state.paused === true,
        fetchBodyForRow: (rowId) => {
          const row = state.rows.find((candidate) => candidate.id === rowId);
          if (!row) {
            return Promise.reject(new Error('The request is no longer available in the DevTools session.'));
          }
          if (typeof row.responseContent === 'string') {
            return Promise.resolve({ content: row.responseContent, encoding: row.responseContentEncoding });
          }
          if (
            (!row._reqObj || typeof row._reqObj.getContent !== 'function') &&
            typeof row.responseContentReason === 'string' &&
            row.responseContentReason
          ) {
            // A terminal body state (navigated away, evicted, omitted)
            // travels to the mirror tab with its real reason.
            return Promise.reject(new Error(row.responseContentReason));
          }
          return fetchResponsePayload(row).then((payload) => {
            // The local panel refuses bodies over the per-body limit at cache
            // admission; the mirror path must not serve what the host itself
            // would refuse — and one oversize port message throws, is
            // swallowed, and leaves the viewer with a bare 10-second timeout.
            const payloadChars = typeof payload.content === 'string' ? payload.content.length : 0;
            if (payloadChars > MAX_RESPONSE_BODY_BYTES) {
              throw new Error(
                'Body is ' + fmtBytes(payloadChars) + '; the per-body cache limit is ' + fmtBytes(MAX_RESPONSE_BODY_BYTES) + '.',
              );
            }
            return { content: payload.content, encoding: payload.encoding };
          });
        },
        getControlState: () => ({
          paused: state.paused === true,
          retention: {
            requestLimit: state.retention.requestLimit,
            unlimited: state.retention.unlimited === true,
          },
          undoAvailable: !!state.clearUndoSnapshot,
          streamCapture: mirrorStreamCaptureState(),
          devtoolsMinimized: popoutDevtoolsMinimized,
        }),
        // Remote commands reuse the host's own controls so undo snapshots,
        // announcements, and guards behave exactly like a local click.
        executeCommand: (name, args, done) => {
          try {
            if (name === 'pause-toggle') {
              if (state.sampleCaptureActive) {
                done('Clear the local sample capture in DevTools before resuming live recording.');
                return;
              }
              $('#pauseBtn').click();
              done('');
              return;
            }
            if (name === 'clear') {
              $('#clearBtn').click();
              done('');
              return;
            }
            if (name === 'undo-clear') {
              const undoButton = $('#undoClearBtn');
              if (!undoButton || undoButton.hidden || undoButton.disabled) {
                done('There is no clear to undo in the DevTools session.');
                return;
              }
              undoButton.click();
              done('');
              return;
            }
            if (name === 'retention-set') {
              done(
                typeof applyRetentionSetting === 'function'
                  ? applyRetentionSetting(args || {})
                  : 'Retention is not available in this DevTools session.',
              );
              return;
            }
            if (name === 'stream-toggle') {
              if (mirrorStreamCaptureState().supported !== true) {
                done('Stream capture is not available in this DevTools session.');
                return;
              }
              $('#wsCaptureBtn').click();
              done('');
              return;
            }
            if (name === 'resend') {
              const spec = args && args.spec && typeof args.spec === 'object' ? args.spec : null;
              if (
                !spec ||
                !RESEND_METHOD_PATTERN.test(String(spec.method || '')) ||
                !/^https?:\/\//i.test(String(spec.url || ''))
              ) {
                done('The re-send request was not valid.');
                return;
              }
              if (typeof mirrorHostResendDispatch !== 'function') {
                done('Re-send is not available in this DevTools session.');
                return;
              }
              mirrorHostResendDispatch(spec);
              done('');
              return;
            }
            done('Unknown mirror command: ' + name);
          } catch (error) {
            done(error && error.message ? error.message : 'The command failed in the DevTools session.');
          }
        },
        receiveImportFile: (fileName, bytes, done) => {
          if (typeof importCapturedFile !== 'function') {
            done('Import is not available in this DevTools session.');
            return;
          }
          Promise.resolve()
            .then(() => importCapturedFile(new File([bytes], fileName)))
            .then(
              (importError) => done(importError || ''),
              (error) => done(error && error.message ? error.message : 'The transferred file could not be imported.'),
            );
        },
      });
      const stopMirrorSync = () => {
        if (!mirrorSyncTimer) return;
        clearInterval(mirrorSyncTimer);
        mirrorSyncTimer = null;
      };
      const startMirrorSync = () => {
        if (mirrorSyncTimer) return;
        mirrorSyncTimer = setInterval(() => hostSession.sendSync(), MIRROR_SYNC_INTERVAL_MS);
      };
      const stopMirrorReconnect = () => {
        if (!mirrorReconnectTimer) return;
        clearInterval(mirrorReconnectTimer);
        mirrorReconnectTimer = null;
      };
      const tryMirrorConnect = () => {
        if (mirrorPort) return;
        if (!popoutWindow || popoutWindow.closed) {
          if (mirrorProbeAttemptsLeft <= 0) {
            stopMirrorReconnect();
            return;
          }
          mirrorProbeAttemptsLeft -= 1;
        }
        let port = null;
        try {
          port = mirrorRuntime.connect({ name: mirrorPortName });
        } catch (_error) {
          return;
        }
        mirrorPort = port;
        mirrorPortConfirmed = false;
        port.onMessage.addListener((message) => {
          if (mirrorPort === port && !mirrorPortConfirmed) {
            mirrorPortConfirmed = true;
            if (!popoutWindow || popoutWindow.closed) {
              setStatus('An existing Network+ tab reattached and mirrors this DevTools session again.');
            }
          }
          if (message && message.type === 'hello') startMirrorSync();
          hostSession.handleMessage(message);
        });
        port.onDisconnect.addListener(() => {
          // Reading lastError acknowledges the expected "receiving end does
          // not exist" while the tab is still loading.
          void (mirrorRuntime.lastError && mirrorRuntime.lastError.message);
          if (mirrorPort !== port) return;
          const wasConfirmed = mirrorPortConfirmed;
          mirrorPort = null;
          mirrorPortConfirmed = false;
          stopMirrorSync();
          hostSession.dropImportTransfers();
          if (wasConfirmed && (!popoutWindow || popoutWindow.closed)) {
            // An adopted tab dropped — usually a reload. Probe again briefly
            // so it reattaches without needing a duplicate pop-out.
            mirrorProbeAttemptsLeft = MIRROR_ADOPT_PROBE_ATTEMPTS;
            startMirrorReconnect();
          }
        });
      };
      const startMirrorReconnect = () => {
        if (!mirrorReconnectTimer) {
          mirrorReconnectTimer = setInterval(tryMirrorConnect, MIRROR_RECONNECT_INTERVAL_MS);
        }
        tryMirrorConnect();
      };
      notifyMirrorRowCaptured = (row) => {
        if (mirrorPort) hostSession.pushRow(row);
      };
      popoutBtn.addEventListener('click', () => {
        if (mirrorPort && mirrorPortConfirmed && (!popoutWindow || popoutWindow.closed)) {
          // An adopted tab (opened by an earlier DevTools session) already
          // mirrors this one; a duplicate would fight it over the port, and
          // without the tabs permission it cannot be focused from here.
          setStatus('A Network+ tab is already mirroring this session; switch to it in the tab strip.');
          return;
        }
        if (mirrorPort && !mirrorPortConfirmed) {
          // A dangling probe port must not block a fresh pop-out.
          try {
            mirrorPort.disconnect();
          } catch (_error) {
            // A dead port needs no cleanup beyond the local reference.
          }
          mirrorPort = null;
          stopMirrorSync();
        }
        if (popoutWindow && !popoutWindow.closed) {
          try {
            popoutWindow.focus();
          } catch (_error) {
            // A window that is closing loses focus rights; the next click reopens.
          }
          return;
        }
        let opened = null;
        try {
          opened = window.open('panel.html?view=window&src=' + encodeURIComponent(String(inspectedTabId)));
        } catch (_error) {
          // A blocked opener is reported below exactly like a null return.
        }
        if (!opened) {
          setStatus('The browser blocked opening the Network+ tab; allow pop-ups for DevTools and retry.');
          return;
        }
        popoutWindow = opened;
        setStatus('Network+ opened in a browser tab; it mirrors this DevTools session.');
        // Ask the background worker to tuck an undocked DevTools window
        // away; a docked session has no window of its own and stays put.
        // The answer refines the status either way, so a silent no-op
        // never leaves the user guessing.
        if (typeof mirrorRuntime.sendMessage === 'function') {
          try {
            mirrorRuntime.sendMessage({ type: 'networkplus-minimize-devtools' }, (response) => {
              void (mirrorRuntime.lastError && mirrorRuntime.lastError.message);
              popoutDevtoolsMinimized = !!(response && response.minimized === true);
              setStatus(
                response && response.minimized === true
                  ? 'Network+ opened in a browser tab; the DevTools window is minimized and keeps capturing (restore it from the taskbar).'
                  : 'Network+ opened in a browser tab; DevTools stayed put — undock it into its own window to have it minimized automatically.',
              );
            });
          } catch (_error) {
            // A session running an older package without the worker just skips the tidy-up.
          }
        }
        startMirrorReconnect();
      });
      // Probe for a mirror tab that outlived an earlier DevTools session;
      // with none listening the bounded attempts fizzle out silently.
      startMirrorReconnect();
    }

    // --- Stream capture wiring (WebSocket + SSE; opt-in; DevTools sessions only) ---
    const wsCaptureBtn = $('#wsCaptureBtn');
    const inspectedEval =
      typeof chrome !== 'undefined' &&
      chrome.devtools &&
      chrome.devtools.inspectedWindow &&
      typeof chrome.devtools.inspectedWindow.eval === 'function'
        ? chrome.devtools.inspectedWindow.eval.bind(chrome.devtools.inspectedWindow)
        : null;
    if (wsCaptureBtn && inspectedEval && !mirrorViewerActive) {
      wsCaptureBtn.hidden = false;
      const streamCapture = { enabled: false, timer: null, socketRows: new Map(), sseRows: new Map() };
      // Retention eviction disposes rows the socket maps may still hold; the
      // lazy per-event cleanup only ran when that socket spoke again.
      state.streamRowEvictionSweep = (evictedSet) => {
        for (const rows of [streamCapture.socketRows, streamCapture.sseRows]) {
          for (const [socketId, row] of rows) {
            if (evictedSet.has(row)) rows.delete(socketId);
          }
        }
      };
      const updateStreamCaptureButton = () => {
        wsCaptureBtn.textContent = streamCapture.enabled ? 'Stream capture: On' : 'Stream capture: Off';
        wsCaptureBtn.setAttribute('aria-pressed', streamCapture.enabled ? 'true' : 'false');
      };
      const injectStreamWrappers = () => {
        inspectedEval(buildWsWrapperSource(), () => {});
        inspectedEval(buildSseWrapperSource(), () => {});
      };
      const createStreamRow = (event, variant) => {
        const isSse = variant === 'sse';
        const row = buildRowFromRequest({
          startedDateTime: Number.isFinite(event.at) ? new Date(event.at).toISOString() : '',
          time: 0,
          request: {
            method: isSse ? 'SSE' : 'WS',
            url: event.url,
            headers:
              !isSse && event.protocols ? [{ name: 'Sec-WebSocket-Protocol', value: event.protocols }] : [],
            postData: { mimeType: 'text/plain', text: '' },
          },
          response: {
            status: 0,
            statusText: 'Connecting',
            httpVersion: isSse ? 'SSE' : 'WS',
            headers: [],
            bodySize: 0,
            content: { mimeType: isSse ? 'text/event-stream' : 'websocket', size: 0, text: '' },
          },
          timings: {},
        });
        // The wrapper sees no HTTP handshake, so no status is claimed.
        row.status = '';
        row.initiator = isSse ? { text: 'EventSource', typeLabel: 'SSE' } : { text: 'WebSocket', typeLabel: 'WS' };
        row._wsSocketId = event.socketId;
        (isSse ? streamCapture.sseRows : streamCapture.socketRows).set(event.socketId, row);
        pendingLiveRows.push(row);
        return row;
      };
      const ingestDrainedStream = (result, variant) => {
        if (!Array.isArray(result) || result.length === 0) return;
        const rowsByVariant = variant === 'sse' ? streamCapture.sseRows : streamCapture.socketRows;
        // The page-side queue reports its own overflow so a gap in the frame
        // history is named instead of silent.
        let overflowCount = 0;
        result = result.filter((event) => {
          if (event && event.kind === 'ws-overflow') {
            overflowCount += Number(event.count) || 0;
            return false;
          }
          return true;
        });
        if (overflowCount > 0) {
          setStatus(
            'Stream capture dropped ' + overflowCount + ' events in the page queue; frame history may have gaps.',
          );
        }
        // Membership tests run per drained event; a Set keeps them O(1).
        const pendingSet = new Set(pendingLiveRows);
        // Recording discipline matches live capture: while paused or in a
        // sample session, drained frames and new connections are dropped, not
        // queued. Lifecycle marks of rows already in the table are different —
        // they are bookkeeping, not recording. The drain destroys the page
        // queue either way, so a close consumed here and discarded left its
        // row 'Open' forever, with no duration anywhere the row travels
        // (grid, HAR, mirror), and its map entry alive until navigation.
        if (state.paused || state.sampleCaptureActive) {
          const closedRows = [];
          for (const event of result) {
            if (!event || typeof event !== 'object' || typeof event.socketId !== 'number') continue;
            if (event.kind !== 'ws-closed') continue;
            const row = rowsByVariant.get(event.socketId);
            rowsByVariant.delete(event.socketId);
            if (!row || row._retentionDisposed) continue;
            row.statusText = 'Closed';
            if (Number.isFinite(event.at)) {
              const startedEpoch = getRequestEpoch(row.startedDateTime, INVALID_REQUEST_EPOCH);
              if (startedEpoch !== INVALID_REQUEST_EPOCH && event.at >= startedEpoch) {
                row.duration = event.at - startedEpoch;
              }
            }
            closedRows.push(row);
          }
          const renderedClosed = closedRows.filter((row) => state.activeRows.has(row));
          if (renderedClosed.length > 0 && !replaceRenderedRowStates(renderedClosed)) renderBody();
          return;
        }
        let createdCount = 0;
        const changedRows = ingestWsEvents(result, {
          createRow: (event) => {
            if (createdCount === 0) {
              disposeClearUndoSnapshot(
                'live',
                'Undo for the cleared local sample was closed before live capture to keep sample and live traffic separate.',
              );
            }
            createdCount += 1;
            const created = createStreamRow(event, variant);
            pendingSet.add(created);
            return created;
          },
          getRow: (socketId) => {
            const row = rowsByVariant.get(socketId);
            if (!row) return null;
            // A connection's first frames often share a drain batch with its
            // open-attempt, while the row still sits in the live-flush queue
            // rather than in activeRows. Only rows actually gone from the
            // table are dead; treating queued rows as dead dropped those
            // frames and deleted the map entry, silencing the connection.
            if (row._retentionDisposed || (!state.activeRows.has(row) && !pendingSet.has(row))) {
              rowsByVariant.delete(socketId);
              return null;
            }
            return row;
          },
        });
        if (createdCount > 0) scheduleLiveRows(false);
        const renderedRows = changedRows.filter((row) => state.activeRows.has(row));
        if (renderedRows.length > 0 && !replaceRenderedRowStates(renderedRows)) renderBody();
      };
      // Swallowing every eval failure left the toggle claiming capture was on
      // while nothing could reach the page; a short streak surfaces it once.
      let streamEvalFailureTicks = 0;
      const drainStreamQueues = () => {
        inspectedEval('window.__networkPlusWS__ ? window.__networkPlusWS__.drain() : []', (result, errorInfo) => {
          if (errorInfo) {
            streamEvalFailureTicks += 1;
            if (streamEvalFailureTicks === 3) {
              setStatus(
                'Stream capture cannot reach the inspected page; connections may be missed until the next navigation or toggle.',
              );
            }
            return;
          }
          streamEvalFailureTicks = 0;
          ingestDrainedStream(result, 'ws');
        });
        inspectedEval('window.__networkPlusSSE__ ? window.__networkPlusSSE__.drain() : []', (result, errorInfo) => {
          if (!errorInfo) ingestDrainedStream(result, 'sse');
        });
      };
      wsCaptureBtn.addEventListener('click', () => {
        streamCapture.enabled = !streamCapture.enabled;
        if (streamCapture.enabled) {
          injectStreamWrappers();
          if (!streamCapture.timer) streamCapture.timer = setInterval(drainStreamQueues, WS_POLL_INTERVAL_MS);
          setStatus('Stream capture on; WebSocket and SSE connections created from now on are recorded.');
        } else {
          if (streamCapture.timer) {
            clearInterval(streamCapture.timer);
            streamCapture.timer = null;
          }
          inspectedEval('window.__networkPlusWS__ && window.__networkPlusWS__.setEnabled(false)', () => {});
          inspectedEval('window.__networkPlusSSE__ && window.__networkPlusSSE__.setEnabled(false)', () => {});
          setStatus('Stream capture off; recorded connections stay in the table.');
        }
        updateStreamCaptureButton();
      });
      updateStreamCaptureButton();
      mirrorStreamCaptureState = () => ({ supported: true, enabled: streamCapture.enabled === true });
      if (
        chrome.devtools.network &&
        chrome.devtools.network.onNavigated &&
        typeof chrome.devtools.network.onNavigated.addListener === 'function'
      ) {
        chrome.devtools.network.onNavigated.addListener(() => {
          // The old document took the wrappers and their connections with it.
          for (const rowsByVariant of [streamCapture.socketRows, streamCapture.sseRows]) {
            for (const row of rowsByVariant.values()) {
              if (row.statusText !== 'Closed') row.statusText = 'Navigated';
            }
            rowsByVariant.clear();
          }
          if (streamCapture.enabled) injectStreamWrappers();
        });
      }
    }

    // --- Edit-and-resend wiring (DevTools sessions, and the mirror tab
    // through its command channel) ---
    const resendDialog = $('#resendDialog');
    if (resendDialog && (mirrorViewerResendDispatch || (inspectedEval && !mirrorViewerActive))) {
      const resendMethodInput = $('#resendMethod');
      const resendUrlInput = $('#resendUrl');
      const resendHeadersInput = $('#resendHeaders');
      const resendBodyInput = $('#resendBody');
      const resendCredentialsInput = $('#resendCredentials');
      const resendErrorEl = $('#resendError');
      let resendInvokerRowId = null;
      const showResendError = (message) => {
        resendErrorEl.textContent = message;
        resendErrorEl.hidden = !message;
      };
      const describeResendTarget = (url) => {
        try {
          const parsed = new URL(url);
          // origin is the inner origin for blob: and the string 'null' for data:,
          // so concatenating it onto pathname doubles the URL or prefixes it
          // with 'null'. Host-less URLs describe themselves.
          if (!parsed.host) return url;
          return parsed.origin + parsed.pathname;
        } catch (_error) {
          return url;
        }
      };
      // Returns null on dispatch, or the Error when the mirror port is
      // already gone — the disconnected postMessage throws synchronously,
      // and an uncaught throw would strand the resend dialog open.
      const dispatchResendSpec = (spec) => {
        if (mirrorViewerResendDispatch) {
          try {
            mirrorViewerResendDispatch(spec, (error) => {
              // The status line stays English by policy; the paused clause
              // matches what the DevTools session itself would say, because
              // applyHostControlState mirrors the host's paused state here.
              setStatus(
                error
                  ? 'Re-send failed: ' + error.message
                  : 'Re-sent ' +
                      spec.method +
                      ' to ' +
                      describeResendTarget(spec.url) +
                      ' from the DevTools session' +
                      (state.paused
                        ? '; recording is paused, so resume it to see the result row.'
                        : '; the result appears once it is captured.'),
              );
            });
          } catch (error) {
            const raw = error && error.message ? error.message : '';
            const reason = !raw || /disconnect|not connected/i.test(raw)
              ? 'the DevTools session is not connected; reopen DevTools and try again'
              : raw;
            setStatus('Re-send failed: ' + reason);
            return error instanceof Error ? error : new Error(reason);
          }
          return null;
        }
        inspectedEval(buildResendEvalSource(spec), (result, errorInfo) => {
          if (errorInfo || (result && result.ok === false)) {
            const reason =
              (result && result.error) ||
              (errorInfo && (errorInfo.description || errorInfo.value || errorInfo.code)) ||
              'evaluation failed';
            setStatus('Re-send failed: ' + reason);
            return;
          }
          setStatus(
            'Re-sent ' +
              spec.method +
              ' to ' +
              describeResendTarget(spec.url) +
              (state.paused
                ? '; recording is paused, so resume it to see the result row.'
                : '; the result will appear as a new captured row.'),
          );
        });
        return null;
      };
      if (!mirrorViewerResendDispatch) mirrorHostResendDispatch = dispatchResendSpec;
      resendActions = {
        sendNow: (row) => {
          const spec = buildResendSpecFromRow(row);
          spec.credentials = true;
          dispatchResendSpec(spec);
        },
        openDialog: (row, invokerRowId) => {
          const spec = buildResendSpecFromRow(row);
          resendMethodInput.value = spec.method;
          resendUrlInput.value = spec.url;
          resendHeadersInput.value = formatHeaderLines(spec.headers);
          resendBodyInput.value = spec.body;
          resendCredentialsInput.checked = true;
          showResendError('');
          resendInvokerRowId = invokerRowId == null ? null : String(invokerRowId);
          resendDialog.showModal();
        },
      };
      const resendCurlInput = $('#resendCurlInput');
      const resendCurlFillBtn = $('#resendCurlFillBtn');
      if (resendCurlInput && resendCurlFillBtn) {
        resendCurlFillBtn.addEventListener('click', () => {
          const parsed = parseCurlCommand(resendCurlInput.value);
          if (!parsed.ok) {
            showResendError(uiTextFormat('resendErrCurl', { error: parsed.error }));
            return;
          }
          resendMethodInput.value = parsed.spec.method;
          resendUrlInput.value = parsed.spec.url;
          resendHeadersInput.value = formatHeaderLines(parsed.spec.headers);
          resendBodyInput.value = parsed.spec.body;
          showResendError('');
          setStatus(
            'Filled the resend fields from the cURL command' +
              (parsed.notes.length > 0 ? ' (' + parsed.notes.join('; ') + ')' : '') +
              '.',
          );
        });
      }
      $('#resendSendBtn').addEventListener('click', () => {
        const method = resendMethodInput.value.trim() || 'GET';
        if (!RESEND_METHOD_PATTERN.test(method)) {
          showResendError(uiText('resendErrMethod'));
          return;
        }
        const url = resendUrlInput.value.trim();
        if (!/^https?:\/\//i.test(url)) {
          showResendError(uiText('resendErrUrl'));
          return;
        }
        const parsedHeaders = parseHeaderLines(resendHeadersInput.value);
        if (parsedHeaders.invalidLines.length > 0) {
          showResendError(uiTextFormat('resendErrHeaderShape', { line: parsedHeaders.invalidLines[0] }));
          return;
        }
        const dispatchError = dispatchResendSpec({
          method,
          url,
          headers: parsedHeaders.headers,
          body: resendBodyInput.value,
          credentials: resendCredentialsInput.checked,
        });
        if (dispatchError) {
          // Keep the dialog open so the edited request is not lost. Chrome's
          // raw 'Attempting to use a disconnected port object' names an
          // internal; the user's situation is that the session is gone.
          const reason = /disconnect|not connected/i.test(dispatchError.message || '')
            ? uiText('resendErrNotConnected')
            : dispatchError.message;
          showResendError(uiTextFormat('resendErrDispatch', { reason }));
          return;
        }
        resendDialog.close();
      });
      resendDialog.addEventListener('close', () => {
        const invokerRowId = resendInvokerRowId;
        resendInvokerRowId = null;
        focusRowOrGridFallback(invokerRowId);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  // Expose testable functions for Jest
  return {
    fmtBytes,
    fmtTime,
    calculateExternalOutlineFootprint,
    clampPopupPosition,
    calculateMainSplit,
    adjustMainSplitByKeyboard,
    calculateInspectorSplit,
    adjustInspectorSplitByKeyboard,
    clampColumnWidth,
    adjustColumnWidth,
    columnAutoHidePriority,
    minRenderedColumnWidth,
    planAutoHiddenColumns,
    planForcedVisibleColumnIds,
    planHeaderFocusFallbackId,
    getAdjacentVisibleColumnId,
    getNextMenuItemIndex,
    getAriaSortValue,
    isClearNetworkLogShortcut,
    isPopoutShortcut,
    extractUrlParts,
    splitUrlForTitle,
    planTitlePathText,
    longestFittingLength,
    splitAtDelimiters,
    splitCommaList,
    decodeQueryValue,
    planSegmentedUrl,
    isNestedQueryValue,
    parseNestedQueryValue,
    isAbsoluteHttpUrl,
    planKvValue,
    KV_CLAMP_CHARS,
    isMonoValue,
    planDetailsSummary,
    formatInitiator,
    parseQueryString,
    guessMimeType,
    toHarHeaders,
    getEmptyStateMode,
    getGridControlTabIndex,
    planSampleCaptureTransition,
    planSampleCaptureExit,
    planSampleCaptureFilterTransition,
    formatSampleCaptureRemainingStatus,
    createSampleCaptureRequests,
    deriveSampleGuideEvidence,
    planSampleEvidenceNavigation,
    debounce,
    getRowFilterValue,
    evaluateFilterRule,
    deepSearchMatch,
    formatRowSummary,
    DEFAULT_METHOD_FILTERS,
    getNextTabIndex,
    getRequestEpoch,
    compareRequestTimes,
    calculateTimingSegments,
    planTimingTable,
    formatTimingDuration,
    formatTimingShare,
    getTimingPhaseGuidance,
    timingPhaseLabel,
    TIMING_EVIDENCE_LIMITATION,
    decodeResponseContent,
    isUndecodableBodyText,
    formatHexDump,
    base64ByteLength,
    buildHarResponseContent,
    cacheResponseContent,
    isValuelessFilterOperator,
    isRuleActive,
    countActiveColumnFilters,
    isVisualOnlyColumn,
    hasActiveSearchKeywords,
    compileSearchQuery,
    normalizeSearchPrefs,
    DEFAULT_SEARCH_OPTIONS,
    extractCharsetFromContentType,
    extractHtmlMetaCharset,
    isHtmlLikeMime,
    planVisibleSearchRows,
    getWrappedMatchIndex,
    findHttpHeaderBodySplit,
    preserveMatchingRowIndex,
    planKeywordSearchNavigation,
    planKeywordHighlights,
    shouldRenderSelectedRow,
    isIncrementalAppendEligible,
    getIncrementalAppendBatch,
    planClearUndoRetention,
    planClearUndoAction,
    formatRequestCount,
    createClearUndoRestorePlan,
    normalizeRetentionSetting,
    getRetentionPresentation,
    createRowEvictionPlan,
    isRetainedRow,
    planStatusAnnouncement,
    isActiveRetainedRow,
    formatAutomaticResponsePrefetchFailureSummary,
    createAutomaticResponsePrefetchScheduler,
    planImportRetention,
    createImportError,
    getImportFormat,
    validateImportSource,
    isRecord,
    normalizeImportString,
    normalizeImportNumber,
    normalizeHarHeaders,
    validateHarDocument,
    normalizeHarEntry,
    parseSazEntryPath,
    validateSazArchiveEntryBudget,
    compareSazRequestIds,
    extractBoundedSazEntries,
    parseSazHttpMessage,
    getNormalizedHeaderValue,
    getRowHeaderColumnValue,
    saveCustomHeaderColumnName,
    loadCustomHeaderColumnName,
    createSazHarEntry,
    classifyImportedResponseContent,
    describeResponseContentState,
    getUtf8ByteLength,
    measureResponsePayload,
    countUnsearchedResponseBodies,
    buildRowFromRequest,
    fetchResponsePayload,
    resolveHarResponseContent,
    DEFAULT_REQUEST_RETENTION_LIMIT,
    CLEAR_UNDO_TIMEOUT_MS,
    AUTOMATIC_RESPONSE_PREFETCH_CONCURRENCY,
    AUTOMATIC_RESPONSE_PREFETCH_QUEUE_COMPACT_THRESHOLD,
    MAX_RESPONSE_BODY_BYTES,
    MAX_RESPONSE_CACHE_BYTES,
    MAX_IMPORT_SOURCE_BYTES,
    MAX_SAZ_ARCHIVE_ENTRIES,
    MAX_SAZ_ENTRY_BYTES,
    MAX_SAZ_TOTAL_UNCOMPRESSED_BYTES,
    MAX_SAZ_CONCURRENT_EXTRACTIONS,
    REDACTION_MARKER,
    OMISSION_MARKER,
    MAX_SANITIZED_BODY_BYTES,
    MAX_SANITIZED_BODY_DEPTH,
    MAX_SANITIZED_BODY_NODES,
    getExtensionVersion,
    normalizeSafeSupportVersion,
    parseEdgeMajor,
    parseOsFamily,
    readSupportMediaPreferences,
    buildSafeSupportSummary,
    createObjectUrlRevoker,
    triggerObjectUrlDownload,
    createSanitizationSummary,
    mergeSanitizationSummaries,
    normalizeSensitiveKey,
    isSensitiveKey,
    sanitizeHeaders,
    sanitizeUrlHeaderValue,
    sanitizeCookies,
    sanitizeNamedValues,
    sanitizeUrlFragment,
    sanitizeUrl,
    sanitizeBody,
    sanitizeRequestPostData,
    sanitizeResponseContent,
    sanitizeNetworkPlusMetadata,
    createOutboundRowView,
    sanitizeClipboardRow,
    generateCurl,
    generateFetch,
    generatePowerShell,
    isFullOutputAuthorized,
    createOneTimeConfirmationAction,
    createOutboundPayload,
    buildClipboardPayload,
    buildMultiRowClipboardPayload,
    sanitizeHar,
    buildHarLogFromRows,
    retainRowsByIdentity,
    createTableRow,
    classifyStatusClass,
    getStatusClassIndicators,
    formatStatusClassSummary,
    findFirstStatusClassRow,
    renderStatsSummary,
    updateTableSummary,
    planRequestCountSummary,
    computeStats,
    computeDomainSummary,
    DOMAIN_SUMMARY_KEY,
    loadDomainSummaryPref,
    saveDomainSummaryPref,
    DETAILS_WIDTH_KEY,
    loadDetailsWidthPref,
    saveDetailsWidthPref,
    INSPECTOR_SPLIT_KEY,
    normalizeInspectorSplitPref,
    loadInspectorSplitPref,
    saveInspectorSplitPref,
    planInspectorCollapse,
    planInspectorSplitApplication,
    planRowStateClasses,
    planDetailsReopenStatus,
    planRowSelectionStatus,
    applyDefaultColumnLayout,
    computeWaterfallBar,
    computeWaterfallRange,
    loadThemePref,
    saveThemePref,
    loadLangPref,
    saveLangPref,
    resolveLanguage,
    LANG_KEY,
    loadSearchPrefs,
    saveSearchPrefs,
    serializeFilterState,
    deserializeFilterState,
    normalizeViewPreset,
    loadViewPreset,
    saveViewPreset,
    clearViewPreset,
    VIEW_PRESET_KEY,
    LEGACY_FILTER_PRESET_KEY,
    MAX_PRESET_TOTAL_BYTES,
    diffHeaders,
    diffQueryParams,
    describeBodyForComparison,
    describeRequestBodyForComparison,
    truncateUrlLabel,
    NAVIGATION_BODY_UNAVAILABLE_REASON,
    BODY_EVICTED_REASON,
    IMPORT_BODY_MISSING_REASON,
    BODY_RETRIEVAL_FAILED_REASON,
    BODY_UNAVAILABLE_REASON,
    applyLanguage,
    uiText,
    uiTextFormat,
    menuColumnLabel,
    methodClassToken,
    DEFAULT_COLUMNS,
    DEFAULT_SORT,
    JSON_TREE_OPEN_DEPTH,
    JSON_TREE_LONG_STRING_CHARS,
    renderJsonTree,
    renderJsonHighlighted,
    renderRawHighlighted,
    splitRawRequestLine,
    formatJsonSafe,
    buildRawRequestText,
    buildRawResponseText,
    planInspectorTabActivation,
    localizeBodyReason,
    localizeTimingLimitation,
    markUnfetchedRowsForNavigation,
    planSelectedExportRows,
    extractOperationLabel,
    matchGraphQlOperation,
    WS_QUEUE_CAP,
    WS_FRAME_PREVIEW_CHARS,
    WS_DIRECTION_TEXT_LIMIT_CHARS,
    WS_POLL_INTERVAL_MS,
    buildWsWrapperSource,
    buildSseWrapperSource,
    formatWsFrameLine,
    appendBoundedWsText,
    ingestWsEvents,
    escapeMarkdownTableCell,
    formatRowMarkdown,
    formatRowsMarkdownTable,
    escapeCsvField,
    formatRowsCsv,
    buildCsvPayload,
    HAR_WS_MESSAGE_IMPORT_LIMIT,
    applyHarWebSocketMessages,
    MIRROR_PROTOCOL_VERSION,
    MIRROR_PORT_PREFIX,
    MIRROR_SNAPSHOT_CHUNK_SIZE,
    MIRROR_IMPORT_MAX_BYTES,
    MIRROR_IMPORT_CHUNK_CHARS,
    MIRROR_COMMAND_TIMEOUT_MS,
    MIRROR_IMPORT_RESULT_TIMEOUT_MS,
    bytesToBase64,
    base64ToBytes,
    getMirrorViewParams,
    serializeRowForMirror,
    buildMirrorEntryFromWire,
    createMirrorHostSession,
    createMirrorViewerSession,
    RESEND_BROWSER_MANAGED_HEADERS,
    isBrowserManagedHeaderName,
    canResendRow,
    buildResendSpecFromRow,
    formatHeaderLines,
    parseHeaderLines,
    tokenizeShellCommand,
    parseCurlCommand,
    buildResendEvalSource,
    JWT_MAX_TOKEN_CHARS,
    decodeBase64UrlJson,
    decodeJwt,
    humanizeJwtDelta,
    describeJwtEpochClaim,
    getJwtExpiryState,
    findJwtsInHeaders,
    createJwtDetailsSection,
    formatJwtChipDelta,
    planJwtExpiryChip,
    splitJwtRuns,
    planKvCopyValue,
    formatCookieHeaderSummary,
    parseCookieHeader,
    parseSetCookieHeader,
    planSetCookieFlags,
    planCookieExpiry,
  };
})();

// Support CommonJS for Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _NetworkPlus;
}
