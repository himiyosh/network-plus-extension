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
  const MIN_DETAILS_WIDTH = 300;
  const MIN_TABLE_WIDTH = 240;
  const MIN_DETAILS_HEIGHT = 160;
  const MIN_TABLE_HEIGHT = 120;
  const MIN_INSPECTOR_PANE_HEIGHT = 80;
  const RESIZER_WIDTH = 4;
  const INSPECTOR_DIVIDER_HEIGHT = 3;
  const NARROW_PANEL_MAX_WIDTH = 700;
  const POPUP_VIEWPORT_MARGIN = 8;
  const ROW_CONTEXT_MENU_X_OFFSET = 16;
  const ROW_CONTEXT_MENU_Y_OFFSET = 24;
  const SEARCH_COLOR_POPUP_GAP = 4;
  const TRANSIENT_POPUP_SELECTOR = '.dropdown-content,.search-scope-popup,.search-color-popup';
  const REQUEST_COUNT_ANNOUNCE_MS = 1000;
  const SEARCH_COUNT_ANNOUNCE_MS = 500;
  const RETENTION_ANNOUNCE_MS = 750;
  const STATUS_DETAILS_MEDIA_QUERY = '(max-width: 800px)';
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
  const AUTOMATIC_RESPONSE_PREFETCH_FAILURE_DEBOUNCE_MS = 750;
  const AUTOMATIC_RESPONSE_PREFETCH_FAILURE_MAX_WAIT_MS = 5000;
  const AUTOMATIC_RESPONSE_PREFETCH_QUEUE_COMPACT_THRESHOLD = 512;
  const DATA_SAFETY_POLICY_VERSION = 1;
  const REDACTION_MARKER = '[REDACTED]';
  const OMISSION_MARKER = '[OMITTED BY NETWORK+]';
  const MAX_SANITIZED_BODY_BYTES = 256 * 1024;
  const MAX_SANITIZED_BODY_DEPTH = 12;
  const MAX_SANITIZED_BODY_NODES = 5000;
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

  const THEME_KEY = 'networkPlus.theme';
  const SEARCH_PREFS_KEY = 'networkPlus.searchPrefs';
  const RETENTION_KEY = 'networkPlus.retention.v1';
  const THEMES = ['system', 'dark', 'light'];
  const COL_PREF_KEY = 'networkPlus.cols';
  const COL_PREF_VERSION_KEY = 'networkPlus.cols.v';
  const COL_PREF_VERSION = 2; // Bump when default visibility changes
  const VIEW_PRESET_KEY = 'networkPlus.viewPreset.v1';
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
  const TEST_EXTENSION_VERSION_FALLBACK = '1.8.0';
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
    { id: 'waterfall', label: 'Waterfall', width: 200, visible: false },
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
        setStatus('Clipboard copy failed. No data was copied.');
        return false;
      });
  }

  let pendingFullOutboundAction = null;
  let dataSafetyDialogTrigger = null;

  function setDataSafetyDialogMode(mode, detail, confirmLabel, showCopyFormat) {
    const choices = $('#dataSafetyExportChoices');
    const warning = $('#dataSafetyWarning');
    const confirm = $('#dataSafetyConfirmBtn');
    const format = $('#dataSafetyCopyFormat');
    const formatLabel = $('#dataSafetyCopyFormatLabel');
    choices.hidden = mode !== 'export';
    warning.hidden = mode === 'export';
    confirm.hidden = mode === 'export';
    format.hidden = !showCopyFormat;
    formatLabel.hidden = !showCopyFormat;
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
    $('#dataSafetyDialogTitle').textContent = 'Export network data';
    setDataSafetyDialogMode(
      'export',
      'Sanitized HAR redacts every URL query and form-like fragment value, URL userinfo, cookies, and every non-allowlisted header value. Omitted bodies are explicitly marked.',
      '',
      false,
    );
    showDataSafetyDialog(trigger);
    setTimeout(() => $('#dataSafetySanitizedBtn').focus(), 0);
  }

  function requestFullOutboundAction(config) {
    const source = config || {};
    pendingFullOutboundAction =
      typeof source.onConfirm === 'function' ? createOneTimeConfirmationAction(source.onConfirm) : null;
    $('#dataSafetyConfirmBtn').disabled = false;
    $('#dataSafetyDialogTitle').textContent = source.title || 'Confirm full output';
    setDataSafetyDialogMode(
      'full',
      source.detail || 'Review the sensitive data categories before continuing.',
      source.confirmLabel || 'Confirm full output',
      source.showCopyFormat === true,
    );
    showDataSafetyDialog(source.trigger);
    setTimeout(() => {
      const firstControl = source.showCopyFormat === true ? $('#dataSafetyCopyFormat') : $('#dataSafetyConfirmBtn');
      firstControl.focus();
    }, 0);
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
      dialog.close('sanitized');
      exportHAR({ mode: 'sanitized' });
    });
    $('#dataSafetyFullBtn').addEventListener('click', () => {
      requestFullOutboundAction({
        title: 'Export full HAR?',
        detail:
          'A full HAR can expose Authorization, cookies, every query or fragment value, URL userinfo, non-allowlisted headers, and complete request or response bodies.',
        confirmLabel: 'Export full HAR',
        trigger: dataSafetyDialogTrigger,
        onConfirm: () => exportHAR({ mode: 'full', confirmed: true }),
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
    popup.style.maxWidth = position.maxWidth + 'px';
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
    return $all(selector, popup).filter((element) => element.tabIndex !== -1);
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

  function installPopupKeyboardSupport(popup) {
    popup.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
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

  function clampColumnWidth(width) {
    const numericWidth = Number.isFinite(width) ? width : DEFAULT_COL_WIDTH;
    return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(numericWidth)));
  }

  function adjustColumnWidth(currentWidth, key, largeStep) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
    const step = largeStep ? KEYBOARD_RESIZE_LARGE_STEP : KEYBOARD_RESIZE_STEP;
    return clampColumnWidth(currentWidth + (key === 'ArrowLeft' ? -step : step));
  }

  function getAdjacentVisibleColumnId(columns, colId, direction) {
    if (!Array.isArray(columns) || (direction !== -1 && direction !== 1)) return null;
    const visibleColumns = columns.filter((column) => column.visible);
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

    if (action === 'summary' || action === 'url' || REQUEST_CLIPBOARD_ACTIONS.has(action)) {
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

  function sanitizeRowForOutbound(row, responseBody, options) {
    const request = sanitizeClipboardRow('rawRequest', row, responseBody, options);
    const response = sanitizeClipboardRow('rawResponse', row, responseBody, options);
    return {
      value: {
        ...request.value,
        responseHeaders: response.value.responseHeaders,
        responseContent: response.responseBody,
        responseContentText: response.responseBody,
        responseContentEncoding: '',
      },
      responseBody: response.responseBody,
      summary: mergeSanitizationSummaries(request.summary, response.summary),
    };
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
    return colId === 'waterfall';
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
    const fallback = { unlimited: false, requestLimit: DEFAULT_REQUEST_RETENTION_LIMIT };
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
      return { setting: fallback, warning: 'Invalid retention setting; restored the 20,000-request default.' };
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

  function appendRowsWithRetention(currentRows, incomingRows, requestLimit, unlimited) {
    const combinedRows = (currentRows || []).concat(incomingRows || []);
    if (unlimited || combinedRows.length <= requestLimit) {
      return { retainedRows: combinedRows, evictedRows: [] };
    }
    const evictionCount = combinedRows.length - requestLimit;
    return {
      retainedRows: combinedRows.slice(evictionCount),
      evictedRows: combinedRows.slice(0, evictionCount),
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

  function getAutomaticResponsePrefetchCapacity(
    backgroundInFlight,
    foregroundInFlight,
    concurrency = AUTOMATIC_RESPONSE_PREFETCH_CONCURRENCY,
  ) {
    const budget = Number.isInteger(concurrency) && concurrency > 0
      ? concurrency
      : AUTOMATIC_RESPONSE_PREFETCH_CONCURRENCY;
    const background = Number.isInteger(backgroundInFlight) && backgroundInFlight > 0
      ? Math.min(backgroundInFlight, budget)
      : 0;
    const foreground = Number.isInteger(foregroundInFlight) && foregroundInFlight > 0
      ? foregroundInFlight
      : 0;
    return {
      availableBackgroundSlots: budget - background,
      maximumTotalInFlight: budget + foreground,
    };
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
      reason: 'Imported HAR does not include response content or an explicit zero body size.',
    };
  }

  function describeResponseContentState(row, error) {
    const rawState = row && row.responseContentState ? row.responseContentState : 'unavailable';
    const state = rawState === 'row-evicted' ? 'evicted' : rawState;
    const label = ['omitted', 'evicted', 'unavailable'].includes(state) ? state : 'error';
    const fallback = label === 'error' ? 'Response content retrieval failed.' : 'Full response content is unavailable.';
    return {
      label,
      reason:
        (row && row.responseContentReason) ||
        (error && error.message) ||
        fallback,
    };
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

  function planResponseCacheAdmission(entries, incomingBytes, budgetBytes) {
    const normalizedEntries = (entries || []).filter((entry) => entry && Number.isFinite(entry.bytes));
    const currentBytes = normalizedEntries.reduce((total, entry) => total + Math.max(0, entry.bytes), 0);
    if (!Number.isFinite(incomingBytes) || incomingBytes < 0 || incomingBytes > budgetBytes) {
      return { accepted: false, evictedEntries: [], resultingBytes: currentBytes };
    }
    const evictedEntries = [];
    let resultingBytes = currentBytes + incomingBytes;
    for (const entry of normalizedEntries) {
      if (resultingBytes <= budgetBytes) break;
      evictedEntries.push(entry);
      resultingBytes -= Math.max(0, entry.bytes);
    }
    return { accepted: resultingBytes <= budgetBytes, evictedEntries, resultingBytes };
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
    rows: [],
    retainedRows: new Set(),
    activeRows: new Set(),
    filteredRows: [], // [U5] cache for filtered rows
    pendingLiveRows: [],
    liveRowsAwaitingRender: [],
    retention: {
      requestLimit: DEFAULT_REQUEST_RETENTION_LIMIT,
      unlimited: false,
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
    selectedRows: new Set(), // [U7] multi-row selection
    comparedRows: null,     // [U8] two-request diff comparison: [rowA, rowB] or null
    comparisonInvokingRowId: null, // [U8] row id that opened the comparison (for focus restoration)
    highlightedRows: new Map(), // [U7] highlighted rows: row -> color class
    onResponseContentChanged: null,
    syncSearchUI: null,
    automaticResponsePrefetchScheduler: null,
    columnFilterRules: DEFAULT_COLUMN_FILTER_RULES(),
    sort: {
      colId: 'id',
      direction: 'asc',
    },
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
      parseWarning = 'Could not read the saved retention setting; restored the 20,000-request default.';
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
      oldestRow.responseContentReason = 'Evicted from the bounded response-body cache; select or export to retry retrieval.';
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
    for (const row of liveRows) {
      state.automaticResponsePrefetchScheduler.enqueue(row);
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
    button.title = available ? 'Restore the retained requests and working context from the last Clear' : '';
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
        'Undo expired; ' + formatRequestCount(remainingCount) + ' from the last Clear released.',
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
  function loadThemePref(cb) {
    let called = false;
    let fallbackAttempted = false;
    const done = (v, warn) => {
      if (called) return;
      called = true;
      cb(v, warn);
    };
    try {
      chrome.storage.local.get([THEME_KEY], (obj) => {
        if (called) return;
        const runtimeErr = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError;
        if (runtimeErr) {
          if (fallbackAttempted) return;
          fallbackAttempted = true;
          try {
            done(localStorage.getItem(THEME_KEY) || 'system');
          } catch (_e) {
            done('system', 'Theme preference could not be loaded.');
          }
          return;
        }
        try {
          done(obj && obj[THEME_KEY] ? obj[THEME_KEY] : localStorage.getItem(THEME_KEY) || 'system');
        } catch (_e) {
          // Primary storage succeeded; localStorage probe failure is a first-run default, not a total failure
          done('system');
        }
      });
    } catch (_e) {
      if (called || fallbackAttempted) return;
      fallbackAttempted = true;
      try {
        done(localStorage.getItem(THEME_KEY) || 'system');
      } catch (_err) {
        done('system', 'Theme preference could not be loaded.');
      }
    }
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
    let saved = false;
    let fallbackAttempted = false;
    try {
      const data = {};
      data[THEME_KEY] = v;
      chrome.storage.local.set(data, () => {
        if (saved || fallbackAttempted) return;
        const runtimeErr = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError;
        if (!runtimeErr) {
          saved = true;
          return;
        }
        fallbackAttempted = true;
        try {
          localStorage.setItem(THEME_KEY, v);
          saved = true;
        } catch (_e) {
          setStatus('Theme preference could not be saved.');
        }
      });
    } catch (_e) {
      if (saved || fallbackAttempted) return;
      fallbackAttempted = true;
      try {
        localStorage.setItem(THEME_KEY, v);
        saved = true;
      } catch (_err) {
        setStatus('Theme preference could not be saved.');
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

  function moveColumnByKeyboard(colId, direction) {
    const adjacentId = getAdjacentVisibleColumnId(state.columns, colId, direction);
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

  function fetchResponsePayload(row, timeoutMs = RESPONSE_CONTENT_TIMEOUT_MS) {
    if (row._responsePayloadPromise) return row._responsePayloadPromise;
    const requestLabel = row.id == null ? 'unknown request' : 'request ' + row.id;
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

  async function settleResponseContentForHar(rows, loadResponseContent = cacheResponseContent) {
    const settlements = await Promise.allSettled(
      rows.map((row) => Promise.resolve().then(() => loadResponseContent(row))),
    );
    return {
      settlements,
      unavailableCount: settlements.filter((result) => result.status === 'rejected').length,
    };
  }

  // ============================================================
  // Section 9: Safe DOM Rendering [S1][S2][S3] — NO innerHTML with user data
  // ============================================================
  const statsSummaryStructures = new WeakMap();
  const statusSummaryInspectHandlers = new WeakMap();

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
   summary.textContent = 'What do the timing phases mean?';
   guide.appendChild(summary);

   const list = document.createElement('dl');
   list.className = 'timing-guidance-list';
   for (const phase of TIMING_PHASES) {
     const guidance = getTimingPhaseGuidance(phase);
     if (!guidance) continue;
     const term = document.createElement('dt');
     term.textContent = guidance.label;
     const description = document.createElement('dd');
     description.textContent = guidance.description;
     list.appendChild(term);
     list.appendChild(description);
   }
   guide.appendChild(list);
   return guide;
  }

  // createHeaderSection removed — replaced by tabbed inspector layout

  // ============================================================
  // Section 10: Table Row Creation (shared) [Q2]
  // ============================================================
  function createTableRow(row, onClick, isTabStop) {
    const tr = document.createElement('tr');
    tr.addEventListener('click', onClick);
    tr.addEventListener('focus', () => {
      state.focusedRow = row;
      const tbody = $('#tbody');
      if (tbody) {
        $all('tr[data-row-id]', tbody).forEach((candidate) => {
          candidate.tabIndex = candidate === tr ? 0 : -1;
        });
      }
    });
    tr.dataset.rowId = row.id;
    tr.id = 'request-row-' + row.id;
    tr.tabIndex = isTabStop ? 0 : -1;
    tr.setAttribute('role', 'row');
    tr.setAttribute('aria-keyshortcuts', 'ContextMenu Shift+F10');
    tr.title = 'Press Shift+F10 or the Context Menu key for request actions';

    const isSelected = state.selectedRow === row || state.selectedRows.has(row);
    if (state.selectedRow === row) tr.classList.add('selected');
    if (state.selectedRows.has(row)) tr.classList.add('multi-selected');
    tr.setAttribute('aria-selected', String(isSelected));
    const visibleStateBadges = [];
    if (isSelected) {
      visibleStateBadges.push({ text: '✓', label: 'Selected request' });
    }
    // Manual highlight (context menu)
    const hlColor = state.highlightedRows.get(row);
    if (hlColor) {
      tr.classList.add('highlighted-row', hlColor);
      visibleStateBadges.push({ text: '★', label: 'Highlighted request' });
    }
    // Unified search match highlight — apply first matching keyword color
    const srch = state.search;
    const rowColorSet = srch.rowColors.get(row);
    if (rowColorSet && rowColorSet.size > 0) {
      const firstColor = rowColorSet.values().next().value;
      tr.classList.add('search-match-row', 'search-row-' + firstColor);
      const rowKeywordSet = srch.rowKeywords.get(row) || new Set();
      const keywordNumbers = Array.from(rowKeywordSet, (keywordIndex) => keywordIndex + 1);
      const searchMatchBadge =
        keywordNumbers.length > 1 ? 'K' + keywordNumbers[0] + '+' + (keywordNumbers.length - 1) : 'K' + keywordNumbers[0];
      const searchMatchLabel = 'Matches search ' +
        (keywordNumbers.length === 1 ? 'keyword ' : 'keywords ') + keywordNumbers.join(', ');
      visibleStateBadges.push({ text: searchMatchBadge, label: searchMatchLabel, srOnly: true });
      if (srch.currentIndex >= 0 && srch.matches[srch.currentIndex] === row) {
        tr.classList.add('search-match-current');
      }
    }
    if (row.method) {
      const method = row.method.toUpperCase();
      if (HTTP_METHODS.indexOf(method) > -1) tr.classList.add('method-' + method);
    }
    // Status code row class
    const statusClass = classifyStatusClass(row.status);
    if (statusClass !== 'other') tr.classList.add('status-' + statusClass);

    const visibleCols = state.columns.filter((c) => c.visible);
    for (const c of visibleCols) {
      const td = document.createElement('td');
      td.setAttribute('role', 'gridcell');
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
          td.appendChild(highlightTextMulti(text, srch.keywords, srch.options));
        } else {
          td.textContent = text;
        }
      }

      if (c.id === 'url' || c.id === 'path') td.title = row[c.id] || '';
      tr.appendChild(td);
    }
    if (visibleStateBadges.length > 0) {
      const firstCell = tr.querySelector('td');
      if (firstCell) {
        const badgeGroup = document.createElement('span');
        badgeGroup.className = 'row-state-badges';
        // A group holding only screen-reader badges must not reserve visual space.
        if (visibleStateBadges.every((stateBadge) => stateBadge.srOnly)) {
          badgeGroup.classList.add('sr-only');
        }
        for (let i = 0; i < visibleStateBadges.length; i++) {
          const stateBadge = visibleStateBadges[i];
          const badge = document.createElement('span');
          // Search-match badges stay in the accessibility tree but are visually
          // hidden: the row tint, edge ring, and mark colors already show the
          // match, and inline badges crowded the ID column.
          badge.className = stateBadge.srOnly ? 'row-state-badge sr-only' : 'row-state-badge';
          badge.textContent = stateBadge.text;
          badge.title = stateBadge.label;
          badge.setAttribute('aria-label', stateBadge.label);
          badgeGroup.appendChild(badge);
        }
        firstCell.insertBefore(badgeGroup, firstCell.firstChild);
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

  function activateInspectorTab(barId, tabId, moveFocus) {
    const bar = $('#' + barId);
    const activeButton = getInspectorTabButton(barId, tabId);
    if (!bar || !activeButton) return null;
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
        const isActive = pane.id === tabId;
        pane.classList.toggle('active', isActive);
        pane.hidden = !isActive;
      });
    }
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
    heading.textContent = 'Evidence to verify';
    container.appendChild(heading);

    const list = document.createElement('dl');
    list.className = 'sample-guide-evidence-list';
    appendSampleGuideEvidenceItem(
      list,
      'Failed request',
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
      'Dominant Timing phase',
      evidence.dominantPhaseLabel +
        ' · ' +
        evidence.dominantDurationMs.toLocaleString('en-US') +
        ' ms',
    );
    appendSampleGuideEvidenceItem(
      list,
      'Retry hint',
      evidence.retryHeaderName + ': ' + evidence.retryAfter + ' seconds',
    );
    appendSampleGuideEvidenceItem(list, 'Browser evidence limit', evidence.limitation);
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
        'Inspect Timing evidence',
        'timing',
        evidence,
        navigationStatus,
      ),
    );
    navigationActions.appendChild(
      createSampleGuideEvidenceAction(
        'Inspect Retry-After header',
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
    const activeHeader = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest('th[data-col-id]')
      : null;
    const focusColId = state.pendingHeaderFocusId || (activeHeader ? activeHeader.dataset.colId : null);
    state.pendingHeaderFocusId = null;
    thead.textContent = '';
    const gridControlTabIndex = getGridControlTabIndex(
      state.rows.length,
      state.filteredRows.length,
    );

    const visibleCols = state.columns.filter((c) => c.visible);
    const updateGridWidth = () => {
      const totalWidth = state.columns
        .filter((column) => column.visible)
        .reduce((sum, column) => sum + clampColumnWidth(column.width), 0);
      $('#grid').style.width = totalWidth + 'px';
    };
    updateGridWidth();

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
        th.title = c.label + ': visual timing column; Alt+Left/Right Arrow to reorder';
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
        columnResizer.setAttribute('aria-valuenow', String(c.width));
        columnResizer.setAttribute('aria-valuetext', c.label + ' column width ' + c.width + ' pixels');
        updateGridWidth();
      };
      columnResizer.addEventListener('keydown', (event) => {
        const newWidth = adjustColumnWidth(c.width, event.key, event.shiftKey);
        if (newWidth == null) return;
        event.preventDefault();
        event.stopPropagation();
        applyColumnWidth(newWidth);
        saveColumnPrefs();
        setStatus(c.label + ' column width ' + c.width + ' pixels');
      });
      columnResizer.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      columnResizer.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = th.offsetWidth;
        const handleMouseMove = (moveEvent) => {
          applyColumnWidth(startWidth + (moveEvent.clientX - startX));
        };
        const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          saveColumnPrefs();
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      });
      th.appendChild(columnResizer);
      tr.appendChild(th);
    }
    thead.appendChild(tr);

    if (focusColId) {
      const headerToFocus = thead.querySelector('th[data-col-id="' + focusColId + '"]');
      if (headerToFocus) headerToFocus.focus({ preventScroll: true });
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

  function updateEmptyState(visibleRowCount) {
    const tableWrap = $('#tableWrap');
    if (!tableWrap) return;
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
    const renderKey = mode + ':' + (state.paused ? 'paused' : 'recording');
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
        title.textContent = 'No requests match the current filters.';
        description.textContent = 'Clear or adjust filters to show captured requests.';
      } else {
        icon.textContent = '📡';
        title.textContent = state.paused ? 'Recording is paused.' : 'Recording network activity...';
        description.textContent = state.paused
          ? 'Resume recording to capture real requests, or explore three local-only sample requests. No network request is sent.'
          : 'Perform a request or reload the page, or explore three local-only sample requests. No network request is sent.';
      }
      emptyState.appendChild(icon);
      emptyState.appendChild(title);
      emptyState.appendChild(description);
      if (mode === 'filtered') {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'empty-state-action';
        action.textContent = 'Clear column filters';
        action.setAttribute('aria-describedby', description.id);
        action.addEventListener('click', clearColumnFilters);
        emptyState.appendChild(action);
      }
      if (mode === 'capture') {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'empty-state-action';
        action.textContent = 'Explore sample capture';
        action.setAttribute('aria-describedby', description.id);
        action.addEventListener('click', activateSampleCapture);
        emptyState.appendChild(action);
      }
    }
    emptyState.style.display = 'flex';
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
    // The retention limit already sits on its own toolbar button, so the status
    // bar shows only what changes on its own: the body cache and any warning.
    const visibleParts = [
      'cache ' + fmtBytes(retention.responseCacheBytes) + ' / ' + fmtBytes(MAX_RESPONSE_CACHE_BYTES),
    ];
    if (retention.settingWarning) visibleParts.push(retention.settingWarning);
    const status = $('#retentionStatus');
    if (status) {
      status.textContent = visibleParts.join(' · ');
      status.title = detailParts.join('. ');
    }
    const button = $('#retentionBtn');
    if (button) {
      button.textContent = presentation.buttonLabel;
      button.setAttribute('aria-label', presentation.accessibleName);
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
  }

  function appendIncrementalRows(liveRows) {
    const tbody = $('#tbody');
    if (!tbody) return false;
    const restoreEmptyStateFocus = isFocusInsideEmptyState();
    // When Waterfall is visible every new row changes the shared time range, so
    // pre-existing bars would show stale geometry. Fall through to a full renderBody().
    const waterfallCol = state.columns.find((c) => c.id === 'waterfall');
    if (waterfallCol && waterfallCol.visible) return false;
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
    const renderedRowIds = $all('tr[data-row-id]', tbody).map((rowElement) => rowElement.dataset.rowId);
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
    const tabStopRow = state.filteredRows.includes(state.focusedRow)
      ? state.focusedRow
      : state.filteredRows.includes(state.selectedRow)
        ? state.selectedRow
        : state.filteredRows[0];
    for (const row of affectedRows) {
      const renderedRow = tbody.querySelector(`tr[data-row-id="${row.id}"]`);
      if (!renderedRow) {
        if (state.filteredRows.includes(row)) return false;
        continue;
      }
      const replacement = createTableRow(row, (event) => selectRow(row, event), row === tabStopRow);
      renderedRow.replaceWith(replacement);
    }
    const nextTabStop = tabStopRow
      ? tbody.querySelector(`tr[data-row-id="${tabStopRow.id}"]`)
      : null;
    if (previousTabStop && previousTabStop !== nextTabStop && previousTabStop.isConnected !== false) {
      previousTabStop.tabIndex = -1;
    }
    if (nextTabStop) nextTabStop.tabIndex = 0;
    if (focusRowId) {
      const rowToFocus = tbody.querySelector(`tr[data-row-id="${focusRowId}"]`);
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
    state.waterfallRange = (waterfallCol && waterfallCol.visible) ? computeWaterfallRange(rows) : null;
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
    renderHeader();
    renderBody();
  }

  // ============================================================
  // Section 13: Detail Panel — Fiddler-style tabbed inspector
  // ============================================================

  function setDetailsPanelCollapsed(collapsed) {
    const resizer = $('#resizer');
    const details = $('#details');
    if (resizer) resizer.hidden = collapsed;
    if (details) details.hidden = collapsed;
  }

  function showDetailsPanel() {
    setDetailsPanelCollapsed(false);
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
    setStatus('Request details closed. Select a request to reopen.');
  }

  function clearDetailsPanel() {
    $('#detailsTitle').textContent = 'Select a request...';
    $all('.tab-pane', $('#details')).forEach((pane) => {
      pane.textContent = '';
    });
  }

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

  function copySanitizedAction(action, row, responseBody, message) {
    try {
      const payload = buildClipboardPayload(action, row, { mode: 'sanitized', responseBody });
      return writeClipboardPayload(payload.text, message || 'Copied sanitized data');
    } catch (_error) {
      setStatus('Sanitized copy failed closed. No data was copied.');
      return Promise.resolve();
    }
  }

  function requestFullClipboardAction(action, row, responseBody, trigger, label) {
    requestFullOutboundAction({
      title: 'Copy full ' + label + '?',
      detail: 'The full ' + label + ' may include captured credentials or body content.',
      confirmLabel: 'Copy full ' + label,
      trigger,
      onConfirm: () => {
        const payload = buildClipboardPayload(action, row, {
          mode: 'full',
          confirmed: true,
          responseBody,
        });
        return writeClipboardPayload(payload.text, 'Copied full ' + label + ' after confirmation');
      },
    });
  }

  function requestFullRequestCopy(row, trigger) {
    requestFullOutboundAction({
      title: 'Copy full request data?',
      detail: 'Choose a format, then confirm this one full-data clipboard action.',
      confirmLabel: 'Copy full request data',
      trigger,
      showCopyFormat: true,
      onConfirm: () => {
        const action = $('#dataSafetyCopyFormat').value;
        const payload = buildClipboardPayload(action, row, { mode: 'full', confirmed: true });
        return writeClipboardPayload(payload.text, 'Copied confirmed full request data');
      },
    });
  }

  // ---- In-pane keyword search (Request/Response Body & Raw views) ----
  // Query text per pane id, so the query survives re-renders and row switches.
  const paneSearchQueries = new Map();

  const PANE_SEARCH_LABELS = {
    'req-body': 'request body',
    'req-raw': 'raw request',
    'res-body': 'response body',
    'res-raw': 'raw response',
  };

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
        if (parent && parent.closest('.pane-search-bar,button,.json-tree-preview')) {
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

  // Open every collapsed <details> ancestor so the current hit is visible.
  function revealPaneSearchHit(mark) {
    let node = mark.parentElement ? mark.parentElement.closest('details') : null;
    while (node) {
      if (!node.open) node.open = true;
      node = node.parentElement ? node.parentElement.closest('details') : null;
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

  function hasCollapsedPaneContent(pane, bar) {
    return Array.from(pane.querySelectorAll('button.link-btn')).some(
      (button) => !bar.contains(button) && !button.dataset.paneSearchExpanded,
    );
  }

  // (Re)build the search bar of a detail pane. Renderers wipe pane children on
  // every row selection, so this runs after each content render. fullText is
  // the pane's complete source text; when provided, hits inside collapsed or
  // truncated content are counted and an "Expand all" action surfaces them.
  function attachPaneSearch(pane, fullText) {
    if (!pane) return;
    const paneId = pane.id;
    const paneLabel = PANE_SEARCH_LABELS[paneId] || 'this view';

    const bar = document.createElement('div');
    bar.className = 'pane-search-bar';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pane-search-input';
    input.placeholder = 'Search in ' + paneLabel;
    input.setAttribute('aria-label', 'Search within the ' + paneLabel + ' view');
    const count = document.createElement('span');
    count.className = 'pane-search-count';
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pane-search-nav';
    prevBtn.textContent = '↑';
    prevBtn.title = 'Previous match (Shift+Enter)';
    prevBtn.setAttribute('aria-label', 'Previous match in the ' + paneLabel + ' view');
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pane-search-nav';
    nextBtn.textContent = '↓';
    nextBtn.title = 'Next match (Enter)';
    nextBtn.setAttribute('aria-label', 'Next match in the ' + paneLabel + ' view');
    const expandBtn = document.createElement('button');
    expandBtn.className = 'pane-search-nav pane-search-expand';
    expandBtn.textContent = 'Expand all';
    expandBtn.title = 'Some matches are inside collapsed or truncated content. Expand everything to include them.';
    expandBtn.setAttribute('aria-label', 'Expand collapsed content in the ' + paneLabel + ' view to reveal all matches');
    expandBtn.hidden = true;
    bar.appendChild(input);
    bar.appendChild(count);
    bar.appendChild(expandBtn);
    bar.appendChild(prevBtn);
    bar.appendChild(nextBtn);

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
            ? 'No matches'
            : '';
      if (collapsedHits > 0) {
        count.textContent += ' (+' + collapsedHits + ' collapsed)';
      }
      expandBtn.hidden = collapsedHits === 0;
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
        if (scroll) revealPaneSearchHit(mark);
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
      input.title = compiledError ? 'Invalid regular expression: ' + compiledError : '';
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
          hasCollapsedPaneContent(pane, bar)
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

    // The bar is a bottom-pinned footer: it sticks to the pane's lower edge
    // while long content scrolls, and margin-top:auto keeps it at the bottom
    // for short content (the pane becomes a min-height flex column).
    pane.classList.add('pane-search-host');
    pane.appendChild(bar);
    const storedQuery = paneSearchQueries.get(paneId) || '';
    if (storedQuery) {
      input.value = storedQuery;
      runHighlight();
    } else {
      updateCount();
    }
  }

  function addCopyActions(container, actions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'copy-actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.className = 'copy-btn';
      button.textContent = action.label;
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

  function setResponsePaneMessage(message) {
    $('#res-body').textContent = message;
    $('#res-preview').textContent = message;
    $('#res-raw').textContent = message;
  }

  function renderCachedResponseContent(row) {
    if (row.responseContentState !== 'cached') {
      const display = describeResponseContentState(row);
      setResponsePaneMessage('(response body ' + display.label + ': ' + display.reason + ')');
      return;
    }
    const resBodyPane = $('#res-body');
    const resPreviewPane = $('#res-preview');
    const resRawPane = $('#res-raw');
    const rawContent = typeof row.responseContent === 'string' ? row.responseContent : '';
    const encoding = row.responseContentEncoding === 'base64' ? 'base64' : '';
    let text = row.responseContentText != null
      ? row.responseContentText
      : decodeResponseContent(rawContent, encoding, resolveRowResponseCharset(row), isHtmlLikeMime(row.type));
    if (encoding === 'base64' && rawContent && !text) text = '(could not decode base64 response)';

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
        showMore.textContent = 'Show full cached body (' + fmtBytes(row.responseContentBytes) + ')';
        if (!row._previewTruncationCounted) {
          row._previewTruncationCounted = true;
          state.retention.truncatedBodies += 1;
          updateRetentionStatus();
          queueRetentionSummary('Response preview truncated until explicitly expanded');
        }
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
    addCopyActions(resBodyPane, [
      {
        label: 'Copy sanitized',
        onClick: () => copySanitizedAction('responseBody', row, rawContent, 'Copied sanitized response body'),
      },
      {
        label: 'Copy full...',
        onClick: (button) => requestFullClipboardAction('responseBody', row, rawContent, button, 'response body'),
      },
    ]);

    // Preview tab — image, sandboxed HTML, or formatted JSON
    resPreviewPane.textContent = '';
    if (encoding === 'base64' && row.type && row.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = 'data:' + row.type + ';base64,' + rawContent;
      img.alt = 'Response image preview';
      img.style.maxWidth = '100%';
      resPreviewPane.appendChild(img);
    } else if (row.type && row.type.indexOf('html') > -1) {
      const iframe = document.createElement('iframe');
      iframe.sandbox = '';
      iframe.title = 'Response HTML preview';
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
    addCopyActions(resRawPane, [
      {
        label: 'Copy sanitized',
        onClick: () => copySanitizedAction('rawResponse', row, rawContent, 'Copied sanitized raw response'),
      },
      {
        label: 'Copy full...',
        onClick: (button) => requestFullClipboardAction('rawResponse', row, rawContent, button, 'raw response'),
      },
    ]);
    resRawPane.appendChild(rawResPre);
    attachPaneSearch(resBodyPane, text);
    attachPaneSearch(resRawPane);
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
    showDetailsPanel();

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

      addCopyActions(reqBodyPane, [
        {
          label: 'Copy sanitized',
          onClick: () => copySanitizedAction('requestBody', row, '', 'Copied sanitized request body'),
        },
        {
          label: 'Copy full...',
          onClick: (button) => requestFullClipboardAction('requestBody', row, '', button, 'request body'),
        },
      ]);
      attachPaneSearch(reqBodyPane, text);
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
    addCopyActions(reqRawPane, [
      {
        label: 'Copy sanitized',
        onClick: () => copySanitizedAction('rawRequest', row, '', 'Copied sanitized raw request'),
      },
      {
        label: 'Copy full...',
        onClick: (button) => requestFullClipboardAction('rawRequest', row, '', button, 'raw request'),
      },
    ]);
    reqRawPane.appendChild(rawReqPre);
    attachPaneSearch(reqRawPane);

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

    // Response > Body, Preview, Raw — populated from the shared response cache
    setResponsePaneMessage('(loading...)');
    cacheResponseContent(row)
      .then((cachedRow) => {
        if (!shouldRenderSelectedRow(state.selectedRow, cachedRow)) return;
        renderCachedResponseContent(cachedRow);
      })
      .catch((error) => {
        if (!shouldRenderSelectedRow(state.selectedRow, row)) return;
        const display = describeResponseContentState(row, error);
        setResponsePaneMessage('(response body ' + display.label + ': ' + display.reason + ')');
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
    const timingBreakdown = calculateTimingSegments(row.timings, row.duration);
    const timingSegmentMap = new Map(
      timingBreakdown.segments.map((segment) => [segment.label, segment]),
    );
    if (row.timings) {
      for (const key in row.timings) {
        if (typeof row.timings[key] === 'number' && row.timings[key] >= 0) {
          const segment = timingSegmentMap.get(key);
          timingItems.push({ name: key, value: fmtTime(segment ? segment.duration : row.timings[key]) });
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
      const segmentTotal = timingBreakdown.segments.reduce((sum, segment) => sum + segment.duration, 0);
      const visualTotal = Math.max(timingBreakdown.total, segmentTotal, 1);
      for (let i = 0; i < timingBreakdown.segments.length; i++) {
        const segment = timingBreakdown.segments[i];
        if (segment.duration > 0) {
          const seg = document.createElement('div');
          seg.className = 'timing-bar-seg timing-phase-' + segment.label;
          seg.style.width = (segment.duration / visualTotal) * 100 + '%';
          seg.title = segment.label + ': ' + fmtTime(segment.duration);
          barWrap.appendChild(seg);
        }
      }
      resTimingPane.appendChild(barWrap);

      // Legend
      const legend = document.createElement('div');
      legend.className = 'timing-legend';
      for (let i = 0; i < timingBreakdown.segments.length; i++) {
        const item = document.createElement('span');
        item.className = 'timing-legend-item';
        const dot = document.createElement('span');
        dot.className = 'timing-legend-dot timing-phase-' + timingBreakdown.segments[i].label;
        item.appendChild(dot);
        item.appendChild(document.createTextNode(timingBreakdown.segments[i].label));
        legend.appendChild(item);
      }
      resTimingPane.appendChild(legend);
    }
   const evidenceNote = document.createElement('p');
   evidenceNote.className = 'timing-evidence-note';
   evidenceNote.textContent = TIMING_EVIDENCE_LIMITATION;
   resTimingPane.appendChild(evidenceNote);
   resTimingPane.appendChild(createTimingPhaseGuide());
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
    heading.textContent = 'Comparing 2 requests';
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
      // Restore focus to the row that opened the comparison
      if (invokingRowId) {
        const tr = document.querySelector('tbody tr[data-row-id="' + invokingRowId + '"]');
        if (tr) tr.focus({ preventScroll: false });
      }
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
    const panel = $('#comparePanel');
    const inspectorPanels = $('.inspector-panels');
    if (panel) { panel.hidden = false; panel.removeAttribute('aria-hidden'); }
    if (inspectorPanels) { inspectorPanels.hidden = true; inspectorPanels.setAttribute('aria-hidden', 'true'); }
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

  async function exportHAR(policy) {
    const outboundPolicy = policy || { mode: 'sanitized' };
    if (outboundPolicy.mode === 'full' && !isFullOutputAuthorized(outboundPolicy)) {
      setStatus('Full HAR export requires one-time confirmation. No file was downloaded.');
      return;
    }
    const rows = getExportRows().slice();
    const exportButton = $('#exportHarBtn');
    let objectUrl = null;
    exportButton.disabled = true;
    setStatus('Preparing ' + (outboundPolicy.mode === 'full' ? 'full' : 'sanitized') + ' HAR export...');
    try {
      const responseContents = new Map();
      let unavailableCount = 0;
      for (const row of rows) {
        const content = await resolveHarResponseContent(row);
        responseContents.set(row, content);
        if (content._networkPlus) unavailableCount += 1;
      }
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
      triggerObjectUrlDownload(
        downloadUrl,
        outboundPolicy.mode === 'full' ? 'network-plus-full.har' : 'network-plus-sanitized.har',
      );
      if (outboundPolicy.mode === 'full') {
        setStatus('Exported full HAR for ' + rows.length + ' requests after one-time confirmation.');
      } else {
        const counts = har.log._networkPlus.counts;
        setStatus(
          'Exported sanitized HAR for ' +
            rows.length +
            ' requests; ' +
            counts.redactedValues +
            ' values redacted, ' +
            counts.omittedBodies +
            ' bodies omitted' +
            (unavailableCount > 0 ? ', ' + unavailableCount + ' source bodies unavailable' : '') +
            '.',
        );
      }
    } catch (_error) {
      setStatus('HAR export failed. No file was downloaded.');
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

    // Theme init
    loadThemePref((pref, warn) => {
      applyTheme(pref);
      if (warn) setStatus(warn);
    });
    $('#themeBtn').addEventListener('click', () => {
      loadThemePref((cur, _warn) => {
        const nxt = nextTheme(cur);
        saveThemePref(nxt);
        applyTheme(nxt);
      });
    });

    // Request-retention settings
    const retentionButton = $('#retentionBtn');
    const retentionDialog = $('#retentionDialog');
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
    retentionButton.addEventListener('click', () => {
      syncRetentionForm();
      retentionButton.setAttribute('aria-expanded', 'true');
      retentionDialog.showModal();
      if (state.retention.unlimited) retentionUnlimitedInput.focus();
      else retentionLimitInput.focus();
    });
    retentionUnlimitedInput.addEventListener('change', () => {
      retentionLimitInput.disabled = retentionUnlimitedInput.checked;
      retentionWarning.hidden = !retentionUnlimitedInput.checked;
    });
    retentionDialog.addEventListener('close', () => {
      retentionButton.setAttribute('aria-expanded', 'false');
      retentionButton.focus();
    });
    $('#retentionCancelBtn').addEventListener('click', () => retentionDialog.close());
    $('#retentionSaveBtn').addEventListener('click', () => {
      commitPendingLiveRows();
      const normalized = normalizeRetentionSetting({
        unlimited: retentionUnlimitedInput.checked,
        requestLimit: Number(retentionLimitInput.value),
      });
      if (normalized.warning && !retentionUnlimitedInput.checked) {
        retentionLimitInput.setAttribute('aria-invalid', 'true');
        retentionError.textContent =
          'The request limit must be a whole number from 100 to 100,000. Enter a value in that range.';
        retentionError.hidden = false;
        setStatus(
          'Retention limit must be a whole number from ' +
            MIN_REQUEST_RETENTION_LIMIT.toLocaleString() +
            ' to ' +
            MAX_REQUEST_RETENTION_LIMIT.toLocaleString() +
            '.',
        );
        return;
      }
      state.retention.requestLimit = normalized.setting.requestLimit;
      state.retention.unlimited = normalized.setting.unlimited;
      const settingSaved = saveRetentionSetting();
      addRowsWithRetention([], 'settings');
      retentionDialog.close();
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
    });
    updateRetentionStatus();
    if (state.retention.settingWarning) queueRetentionSummary(state.retention.settingWarning);

    const clearButton = $('#clearBtn');
    const undoClearButton = $('#undoClearBtn');
    const detailsCloseButton = $('#detailsCloseBtn');
    if (detailsCloseButton) detailsCloseButton.addEventListener('click', closeDetailsPanel);

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
      state.rows = restorePlan.rows.concat(activeRows);
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
        $('#detailsTitle').textContent = 'Comparing 2 requests';
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
    columnsContextMenu.setAttribute('aria-label', 'Visible columns');
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

    const renderColumnsContextMenu = () => {
      columnsContextMenu.textContent = '';

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;padding:4px 4px 8px;border-bottom:1px solid var(--border);margin-bottom:4px';
      const selectAllBtn = document.createElement('button');
      selectAllBtn.textContent = 'Select All';
      selectAllBtn.className = 'context-menu-item';
      selectAllBtn.setAttribute('role', 'menuitem');
      selectAllBtn.style.cssText = 'flex:1;text-align:center;font-size:11px;padding:4px';
      selectAllBtn.addEventListener('click', () => {
        state.columns.forEach((column) => { column.visible = true; });
        saveColumnPrefs();
        render();
        renderColumnsContextMenu();
        const firstItem = getPopupFocusableItems(columnsContextMenu, true)[0];
        if (firstItem) firstItem.focus();
      });
      const deselectAllBtn = document.createElement('button');
      deselectAllBtn.textContent = 'Deselect All';
      deselectAllBtn.className = 'context-menu-item';
      deselectAllBtn.setAttribute('role', 'menuitem');
      deselectAllBtn.style.cssText = 'flex:1;text-align:center;font-size:11px;padding:4px';
      deselectAllBtn.addEventListener('click', () => {
        state.columns.forEach((column) => { column.visible = false; });
        saveColumnPrefs();
        render();
        renderColumnsContextMenu();
        const firstItem = getPopupFocusableItems(columnsContextMenu, true)[0];
        if (firstItem) firstItem.focus();
      });
      btnRow.appendChild(selectAllBtn);
      btnRow.appendChild(deselectAllBtn);
      columnsContextMenu.appendChild(btnRow);

      state.columns.forEach((current) => {
        const item = document.createElement('button');
        item.className = 'context-menu-item';
        item.setAttribute('role', 'menuitemcheckbox');
        item.setAttribute('aria-checked', String(current.visible));
        const updateItem = () => {
          item.textContent = (current.visible ? '☑ ' : '☐ ') + current.label;
          item.setAttribute('aria-checked', String(current.visible));
        };
        updateItem();
        item.addEventListener('click', () => {
          current.visible = !current.visible;
          updateItem();
          saveColumnPrefs();
          render();
        });
        columnsContextMenu.appendChild(item);
      });

      // Single view preset (columns + filters). Apply restores the saved view —
      // or the factory default before anything was saved — and Update overwrites
      // the preset with whatever is on screen right now.
      const presetSection = document.createElement('div');
      presetSection.className = 'columns-preset-section';

      const presetHint = document.createElement('div');
      presetHint.className = 'columns-preset-hint';
      presetHint.textContent = 'Preset · columns + filters';
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
      applyPresetBtn.textContent = 'Apply';
      applyPresetBtn.title = hasCustomPreset
        ? 'Restore your saved columns and filters'
        : 'Restore the default columns and clear filters';
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
        setStatus(preset ? 'Applied preset.' : 'Applied default view.');
      });
      actionRow.appendChild(applyPresetBtn);

      const updatePresetBtn = document.createElement('button');
      updatePresetBtn.className = 'context-menu-item columns-preset-update';
      updatePresetBtn.setAttribute('role', 'menuitem');
      updatePresetBtn.textContent = 'Update';
      updatePresetBtn.title = 'Save the current columns and filters as the preset';
      updatePresetBtn.addEventListener('click', () => {
        const ok = saveViewPreset(buildViewPresetFromState());
        if (!ok) {
          setStatus('Could not save preset. Storage unavailable or data too large.');
          return;
        }
        refreshAfterPresetChange('.columns-preset-update');
        setStatus('Preset updated with the current view.');
      });
      actionRow.appendChild(updatePresetBtn);
      presetSection.appendChild(actionRow);

      if (hasCustomPreset) {
        const resetPresetBtn = document.createElement('button');
        resetPresetBtn.className = 'context-menu-item columns-preset-reset';
        resetPresetBtn.setAttribute('role', 'menuitem');
        resetPresetBtn.textContent = 'Forget saved preset';
        resetPresetBtn.title = 'Delete the saved preset — Apply then restores the default view';
        resetPresetBtn.addEventListener('click', () => {
          if (!clearViewPreset()) {
            setStatus('Could not reset preset. Storage unavailable.');
            return;
          }
          refreshAfterPresetChange('.columns-preset-apply');
          setStatus('Preset reset. Apply now restores the default view.');
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
      const rect = event.currentTarget.getBoundingClientRect();
      showAccessiblePopupAt(columnsContextMenu, rect.left, rect.bottom, columnsBtn);
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
    });
    updateAutoScrollButton();
    $('#exportHarBtn').insertAdjacentElement('afterend', autoScrollBtn);

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
    contextMenu.setAttribute('aria-label', 'Request actions');
    installPopupKeyboardSupport(contextMenu);
    document.body.appendChild(contextMenu);

    let contextMenuRow = null;
    let contextMenuInvokerRowId = null;
    let suppressNextNativeContextMenuRowId = null;
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

    const createRowMenuButton = (text, onActivate) => {
      const button = document.createElement('button');
      button.textContent = text;
      button.className = 'context-menu-item';
      button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => {
        onActivate();
        closeRowContextMenu(true);
      });
      return button;
    };

    const openRowContextMenu = (row, x, y, invokingRow) => {
      if (!row || !invokingRow) return;
      contextMenuRow = row;
      contextMenuInvokerRowId = String(row.id);
      state.focusedRow = row;
      contextMenu.textContent = '';
      const isMultiSelected = state.selectedRows.has(contextMenuRow);
      const targetRows = isMultiSelected && state.selectedRows.size > 0 ? [...state.selectedRows] : [contextMenuRow];
      const allHighlighted = targetRows.every((targetRow) => state.highlightedRows.has(targetRow));

      const copyLabel = document.createElement('div');
      copyLabel.className = 'context-menu-label';
      copyLabel.setAttribute('role', 'presentation');
      copyLabel.textContent = 'Copy (sanitized)';
      contextMenu.appendChild(copyLabel);
      for (const [action, label] of [
        ['summary', 'Copy sanitized summary'],
        ['url', 'Copy sanitized URL'],
        ['curl', 'Copy sanitized cURL'],
        ['fetch', 'Copy sanitized fetch'],
        ['powershell', 'Copy sanitized PowerShell'],
      ]) {
        contextMenu.appendChild(createRowMenuButton(label, () => {
          copySanitizedAction(action, contextMenuRow, '', label.replace('Copy', 'Copied'));
        }));
      }
      const fullCopyRow = contextMenuRow;
      contextMenu.appendChild(createRowMenuButton('Copy full request...', () => {
        setTimeout(() => requestFullRequestCopy(fullCopyRow, invokingRow), 0);
      }));

      const hlLabel = document.createElement('div');
      hlLabel.className = 'context-menu-label';
      hlLabel.setAttribute('role', 'presentation');
      hlLabel.textContent = targetRows.length > 1 ? 'Highlight (' + targetRows.length + ' rows)' : 'Highlight';
      contextMenu.appendChild(hlLabel);

      const colorRow = document.createElement('div');
      colorRow.className = 'context-menu-colors';
      colorRow.setAttribute('role', 'group');
      colorRow.setAttribute('aria-label', 'Highlight color');
      for (const highlightColor of HIGHLIGHT_COLORS) {
        const swatch = document.createElement('button');
        swatch.className = 'hl-swatch ' + highlightColor.cls;
        swatch.title = highlightColor.name;
        swatch.setAttribute('role', 'menuitem');
        swatch.setAttribute('aria-label', 'Highlight ' + highlightColor.name);
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
          targetRows.length > 1 ? 'Unhighlight (' + targetRows.length + ')' : 'Unhighlight',
          () => {
            targetRows.forEach((targetRow) => { state.highlightedRows.delete(targetRow); });
            renderBody();
          },
        ));
      }

      contextMenu.appendChild(createRowMenuButton(isMultiSelected ? 'Deselect' : 'Select', () => {
        if (isMultiSelected) state.selectedRows.delete(contextMenuRow);
        else state.selectedRows.add(contextMenuRow);
        renderBody();
      }));

      if (state.highlightedRows.size > 0) {
        contextMenu.appendChild(createRowMenuButton('Clear All Highlights', () => {
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
          compareLabel.textContent = 'Compare';
          contextMenu.appendChild(compareLabel);
          const [rowX, rowY] = [...state.selectedRows];
          contextMenu.appendChild(createRowMenuButton('Compare 2 selected requests', () => {
            state.comparedRows = [rowX, rowY];
            state.comparisonInvokingRowId = contextMenuInvokerRowId;
            $('#detailsTitle').textContent = 'Comparing 2 requests';
            renderComparisonPanel(rowX, rowY);
            showComparisonPanel();
          }));
        }
        contextMenu.appendChild(createRowMenuButton('Keep Selected (' + selectedCount + ')', () => {
          commitPendingLiveRows();
          const rowsToRemove = state.rows.filter((targetRow) => !state.selectedRows.has(targetRow));
          removeRowsFromState(rowsToRemove, false);
          state.selectedRows.clear();
          renderBody();
        }));
        contextMenu.appendChild(createRowMenuButton('Delete Selected (' + selectedCount + ')', () => {
          commitPendingLiveRows();
          removeRowsFromState(Array.from(state.selectedRows), false);
          state.selectedRows.clear();
          renderBody();
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
      openRowContextMenu(row, event.clientX, event.clientY, tr);
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

    const syncMainDividerOrientation = () => {
      const isNarrow = window.innerWidth <= NARROW_PANEL_MAX_WIDTH;
      if (mainSplitIsNarrow != null && mainSplitIsNarrow !== isNarrow) {
        details.style.flexBasis = '';
        tableWrap.style.flexBasis = '';
        resizer.setAttribute('aria-valuenow', '50');
        resizer.setAttribute('aria-valuetext', 'Request list 50 percent');
      }
      mainSplitIsNarrow = isNarrow;
      resizer.setAttribute('aria-orientation', isNarrow ? 'horizontal' : 'vertical');
      const contentRect = content.getBoundingClientRect();
      const tableRect = tableWrap.getBoundingClientRect();
      const totalSize = isNarrow ? contentRect.height : contentRect.width;
      const primarySize = isNarrow ? tableRect.height : tableRect.width;
      const currentSplit = calculateMainSplit(primarySize, totalSize, isNarrow);
      if (currentSplit) {
        resizer.setAttribute('aria-valuenow', String(currentSplit.primaryPercent));
        resizer.setAttribute('aria-valuetext', 'Request list ' + currentSplit.primaryPercent + ' percent');
      }
    };

    syncMainDividerOrientation();
    window.addEventListener('resize', () => {
      syncMainDividerOrientation();
      reclampOpenPopups();
    });
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
      if (split) setStatus('Request list ' + split.primaryPercent + ' percent');
    });
    resizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const isNarrow = window.innerWidth <= NARROW_PANEL_MAX_WIDTH;
      const handleMouseMove = (moveEvent) => {
        const contentRect = content.getBoundingClientRect();
        const totalSize = isNarrow ? contentRect.height : contentRect.width;
        const pointerPosition = isNarrow
          ? moveEvent.clientY - contentRect.top
          : moveEvent.clientX - contentRect.left;
        applyMainSplit(calculateMainSplit(pointerPosition, totalSize, isNarrow));
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
      const requestPane = $('#inspector-request');
      const responsePane = $('#inspector-response');
      const applyInspectorSplit = (split) => {
        if (!split) return;
        requestPane.style.flex = 'none';
        responsePane.style.flex = 'none';
        requestPane.style.height = split.requestSize + 'px';
        responsePane.style.height = split.responseSize + 'px';
        inspectorDivider.setAttribute('aria-valuenow', String(split.requestPercent));
        inspectorDivider.setAttribute('aria-valuetext', 'Request inspector ' + split.requestPercent + ' percent');
      };
      const syncInspectorDividerValue = () => {
        const split = calculateInspectorSplit(
          requestPane.getBoundingClientRect().height,
          inspectorPanels.getBoundingClientRect().height,
        );
        if (split) {
          inspectorDivider.setAttribute('aria-valuenow', String(split.requestPercent));
          inspectorDivider.setAttribute('aria-valuetext', 'Request inspector ' + split.requestPercent + ' percent');
        }
      };
      window.addEventListener('resize', syncInspectorDividerValue);

      inspectorDivider.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        event.stopPropagation();
        const totalSize = inspectorPanels.getBoundingClientRect().height;
        const split = adjustInspectorSplitByKeyboard(
          requestPane.getBoundingClientRect().height,
          totalSize,
          event.key,
          event.shiftKey,
        );
        applyInspectorSplit(split);
        if (split) setStatus('Request inspector ' + split.requestPercent + ' percent');
      });
      inspectorDivider.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const handleMove = (moveEvent) => {
          const panelsRect = inspectorPanels.getBoundingClientRect();
          const pointerPosition = moveEvent.clientY - panelsRect.top;
          applyInspectorSplit(calculateInspectorSplit(pointerPosition, panelsRect.height));
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

      importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || importInProgress) {
          importFile.value = '';
          return;
        }
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
        } catch (error) {
          const message =
            error && error.name === 'ImportError' ? error.message : 'The selected file could not be imported.';
          setStatus('Import failed: ' + message);
          console.error('Network+ import failed: ' + message);
        } finally {
          importFile.value = '';
          setImportBusy(false);
        }
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
        renderBody();
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
        const wasAtBottom =
          state.autoScroll &&
          tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - SCROLL_THRESHOLD;
        pendingLiveRows.push(row);

        scheduleLiveRows(wasAtBottom);
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
    getAdjacentVisibleColumnId,
    getNextMenuItemIndex,
    getAriaSortValue,
    isClearNetworkLogShortcut,
    extractUrlParts,
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
    highlightText,
    getRowFilterValue,
    evaluateFilterRule,
    deepSearchMatch,
    formatRowSummary,
    DEFAULT_METHOD_FILTERS,
    getNextTabIndex,
    getRequestEpoch,
    compareRequestTimes,
    calculateTimingSegments,
    getTimingPhaseGuidance,
    TIMING_EVIDENCE_LIMITATION,
    decodeResponseContent,
    buildHarResponseContent,
    cacheResponseContent,
    settleResponseContentForHar,
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
    appendRowsWithRetention,
    createRowEvictionPlan,
    isRetainedRow,
    planStatusAnnouncement,
    isActiveRetainedRow,
    getAutomaticResponsePrefetchCapacity,
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
    createSazHarEntry,
    classifyImportedResponseContent,
    describeResponseContentState,
    getUtf8ByteLength,
    measureResponsePayload,
    planResponseCacheAdmission,
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
    sanitizeRowForOutbound,
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
    computeWaterfallBar,
    computeWaterfallRange,
    loadThemePref,
    saveThemePref,
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
  };
})();

// Support CommonJS for Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _NetworkPlus;
}
