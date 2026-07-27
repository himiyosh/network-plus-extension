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
  const DATA_SAFETY_ANNOUNCE_MS = 500;
  const COPY_FEEDBACK_DURATION_MS = 1800;
  const SCROLL_THRESHOLD = 10;
  const TRUNCATE_LIMIT = 2000;
  const FILTER_DEBOUNCE_MS = 150;
  const DEEP_SEARCH_DEBOUNCE_MS = 250;
  const RESPONSE_CONTENT_TIMEOUT_MS = 10000;
  const DATA_SAFETY_POLICY_VERSION = 1;
  const REDACTION_MARKER = '[REDACTED]';
  const OMISSION_MARKER = '[OMITTED BY NETWORK+]';
  const MAX_SANITIZED_BODY_BYTES = 256 * 1024;
  const MAX_SANITIZED_BODY_DEPTH = 12;
  const MAX_SANITIZED_BODY_NODES = 5000;
  const DEFAULT_REQUEST_RETENTION_LIMIT = 5000;
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
  const JSON_TREE_MAX_CHILDREN = 100;
  const JSON_TREE_MAX_DEPTH = 20;
  const JSON_TREE_PREVIEW_KEYS = 3;

  const THEME_KEY = 'networkPlus.theme';
  const RETENTION_KEY = 'networkPlus.retention.v1';
  const THEMES = ['system', 'dark', 'light'];
  const COL_PREF_KEY = 'networkPlus.cols';
  const COL_PREF_VERSION_KEY = 'networkPlus.cols.v';
  const COL_PREF_VERSION = 2; // Bump when default visibility changes
  const FILTER_PRESET_KEY = 'networkPlus.filterPresets.v1';
  const MAX_FILTER_PRESETS = 20;
  const MAX_PRESET_NAME_LENGTH = 40;
  const MAX_PRESET_TOTAL_BYTES = 64 * 1024; // 64 KiB — filter-config only, no traffic data

  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  const NUMERIC_COLUMNS = ['id', 'status', 'duration', 'size'];
  const DATE_COLUMNS = ['clientStart', 'serverDone'];
  const DATE_SORT_FIELDS = { clientStart: 'clientStartEpoch', serverDone: 'serverDoneEpoch' };
  const INVALID_REQUEST_EPOCH = Number.MAX_SAFE_INTEGER;
  const TIMING_PHASES = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
  const TEST_EXTENSION_VERSION_FALLBACK = '1.6.0';
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

  function setStatus(t) {
    const el = $('#statusText');
    if (el) el.textContent = t;
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
      })
      .catch((_error) => {
        setStatus('Clipboard copy failed. No data was copied.');
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

  // ============================================================
  // Section 3: Pure Utility Functions (testable)
  // ============================================================
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

  function normalizePresetName(name) {
    return String(name || '').trim().slice(0, MAX_PRESET_NAME_LENGTH);
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

  function decodeResponseContent(content, encoding) {
    const text = typeof content === 'string' ? content : '';
    if (encoding !== 'base64') return text;
    try {
      const binary = atob(text);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
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
          (condition) => condition.value != null && String(condition.value).trim() !== '',
        )
        : false;
    }
    if (rule.op === 'empty' || rule.op === 'notempty') return true;
    return rule.value != null && String(rule.value).trim() !== '';
  }

  function countActiveColumnFilters(rules) {
    if (!rules) return 0;
    return Object.values(rules).filter((rule) => isRuleActive(rule)).length;
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

  function planKeywordHighlights(text, keywords) {
    const source = text == null ? '' : String(text);
    if (!source || !Array.isArray(keywords) || keywords.length === 0) return [];

    const candidates = [];
    const earliestByLiteral = new Map();
    for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex++) {
      const keyword = keywords[keywordIndex];
      const query = keyword && keyword.query != null ? String(keyword.query) : '';
      if (!query.trim()) continue;
      const literal = query.toLowerCase();
      if (earliestByLiteral.has(literal)) continue;
      const candidate = {
        query,
        literal,
        colorIdx: keyword.colorIdx,
        keywordIndex,
      };
      earliestByLiteral.set(literal, candidate);
      candidates.push(candidate);
    }
    if (candidates.length === 0) return [];

    candidates.sort((a, b) => b.query.length - a.query.length || a.keywordIndex - b.keywordIndex);
    const escapedParts = candidates.map((candidate) =>
      candidate.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    const regex = new RegExp(escapedParts.join('|'), 'gi');
    const highlights = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
      const winner = earliestByLiteral.get(match[0].toLowerCase());
      highlights.push({
        start: match.index,
        end: regex.lastIndex,
        colorIdx: winner ? winner.colorIdx : 0,
        keywordIndex: winner ? winner.keywordIndex : -1,
      });
    }
    return highlights;
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
      return { setting: fallback, warning: 'Invalid retention setting; restored the 5,000-request default.' };
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

  function parseSazHttpMessage(bytes) {
    if (!(bytes instanceof Uint8Array)) throw createImportError('SAZ HTTP payload is invalid.');
    const text = new TextDecoder().decode(bytes);
    const separatorIndex = text.indexOf('\r\n\r\n');
    const headerPart = separatorIndex >= 0 ? text.slice(0, separatorIndex) : text;
    const body = separatorIndex >= 0 ? text.slice(separatorIndex + 4) : '';
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
    return { startLine, headers, body };
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

  function measureResponsePayload(content, encoding) {
    const rawContent = typeof content === 'string' ? content : '';
    const text = decodeResponseContent(rawContent, encoding);
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
  function highlightTextMulti(text, keywords) {
    const fragment = document.createDocumentFragment();
    const source = text == null ? '' : String(text);
    const highlights = planKeywordHighlights(source, keywords);
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
      const resText = row.responseContentText != null ? row.responseContentText : row.responseContent || '';
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

  /**
   * Compute aggregate statistics for a set of rows.
   * Pure function — no DOM/state dependency.
   * @param {Array} rows - Array of row objects (from buildRowFromRequest)
   * @returns {{ count: number, totalDuration: number, avgDuration: number, minDuration: number, maxDuration: number, totalSize: number }}
   */
  function computeStats(rows) {
    const validRows = Array.isArray(rows) ? rows : [];
    const count = validRows.length;
    if (count === 0) {
      return { count: 0, totalDuration: 0, avgDuration: 0, minDuration: 0, maxDuration: 0, totalSize: 0 };
    }
    let totalDuration = 0;
    let minDuration = Infinity;
    let maxDuration = -Infinity;
    let totalSize = 0;
    for (const row of validRows) {
      const dur = Number.isFinite(row.duration) ? row.duration : 0;
      totalDuration += dur;
      if (dur < minDuration) minDuration = dur;
      if (dur > maxDuration) maxDuration = dur;
      totalSize += Number.isFinite(row.size) ? row.size : 0;
    }
    return {
      count,
      totalDuration,
      avgDuration: totalDuration / count,
      minDuration: minDuration === Infinity ? 0 : minDuration,
      maxDuration: maxDuration === -Infinity ? 0 : maxDuration,
      totalSize,
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
    filteredRows: [], // [U5] cache for filtered rows
    pendingLiveRows: [],
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
    columnFilterRules: DEFAULT_COLUMN_FILTER_RULES(),
    sort: {
      colId: 'id',
      direction: 'asc',
    },
    nextId: 1,
    paused: false,
    autoScroll: true,
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
      scope: { url: true, reqBody: true, resBody: true, reqHeaders: true, resHeaders: true },
      // Per-row match maps keep color and keyword correspondence lookup linear.
      rowColors: new Map(),
      rowKeywords: new Map(),
      // Per-keyword matches: kwIndex -> { matches: [rows], currentIndex: number }
      perKeyword: new Map(),
    },
  };

  function loadRetentionSetting() {
    let parsed = null;
    let parseWarning = '';
    try {
      const saved = localStorage.getItem(RETENTION_KEY);
      if (saved) parsed = JSON.parse(saved);
    } catch (_error) {
      parseWarning = 'Could not read the saved retention setting; restored the 5,000-request default.';
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
      row._retentionDisposed = true;
      state.retainedRows.delete(row);
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
        const payload = measureResponsePayload(row.responseContent, row.responseContentEncoding);
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
    for (const row of incomingRows) {
      row._managedRetention = true;
      row._retentionDisposed = false;
      state.rows.push(row);
      state.retainedRows.add(row);
    }
    const overflowCount = state.retention.unlimited
      ? 0
      : Math.max(0, state.rows.length - state.retention.requestLimit);
    const evictedRows = overflowCount > 0 ? state.rows.splice(0, overflowCount) : [];
    cleanupEvictedRowReferences(evictedRows, true);
    const retainedIncomingRows = incomingRows.filter((row) => isRetainedRow(row, state.retainedRows));
    normalizeIncomingResponseContent(retainedIncomingRows, source);
    return retainedIncomingRows;
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

  function loadFilterPresets() {
    // Returns { presets: Array, error: string|null }.
    // error is non-null when stored data is present but unreadable (corruption/oversize).
    // A missing key (first use) returns { presets: [], error: null }.
    try {
      const saved = localStorage.getItem(FILTER_PRESET_KEY);
      if (!saved) return { presets: [], error: null };
      // Pre-parse size guard: reject oversize blobs before JSON.parse using actual UTF-8 byte count.
      if (new TextEncoder().encode(saved).length > MAX_PRESET_TOTAL_BYTES * 2) {
        return { presets: [], error: 'Preset store is oversized and could not be loaded.' };
      }
      let parsed;
      try {
        parsed = JSON.parse(saved);
      } catch (_e) {
        return { presets: [], error: 'Preset store is corrupted and could not be loaded.' };
      }
      if (!Array.isArray(parsed)) {
        return { presets: [], error: 'Preset store is corrupted and could not be loaded.' };
      }
      // Normalize names and filter rules through the same known-state path as saveFilterPresets.
      const presets = parsed
        .filter((p) => p && typeof p.name === 'string' && p.name.trim() && p.filterRules != null)
        .slice(0, MAX_FILTER_PRESETS)
        .map((p) => ({
          name: normalizePresetName(p.name),
          filterRules: serializeFilterState(deserializeFilterState(p.filterRules ?? {})),
        }));
      return { presets, error: null };
    } catch (_e) {
      return { presets: [], error: 'Preset store could not be read.' };
    }
  }

  function saveFilterPresets(presets) {
    try {
      // Normalize names, run rules through the known serializer/deserializer to strip
      // unknown fields, and cap to MAX_FILTER_PRESETS before writing.
      const normalized = presets
        .filter((p) => p && typeof p.name === 'string' && p.name.trim())
        .slice(0, MAX_FILTER_PRESETS)
        .map((p) => ({
          name: normalizePresetName(p.name),
          filterRules: serializeFilterState(deserializeFilterState(p.filterRules ?? {})),
        }));
      const serialized = JSON.stringify(normalized);
      // Guard against exceeding the storage limit using actual UTF-8 byte count.
      const byteLength = new TextEncoder().encode(serialized).length;
      if (byteLength > MAX_PRESET_TOTAL_BYTES) return false;
      localStorage.setItem(FILTER_PRESET_KEY, serialized);
      return true;
    } catch (_e) {
      return false;
    }
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
    const requestLabel = row.id == null ? 'unknown request' : 'request ' + row.id;
    if (!row._reqObj || typeof row._reqObj.getContent !== 'function') {
      return Promise.reject(new Error('Response content is unavailable for ' + requestLabel));
    }
    return new Promise((resolve, reject) => {
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
          settled = true;
          clearTimeout(timeoutId);
          resolve(measureResponsePayload(content, encoding));
        });
      } catch (error) {
        fail('Failed to retrieve response content for ' + requestLabel + ': ' + error.message);
      }
    });
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
    pending.then(undefined, () => {
      if (row._responseContentPromise === pending) row._responseContentPromise = null;
    });
    return pending;
  }

  async function resolveHarResponseContent(row) {
    if (typeof row.responseContent === 'string') return buildHarResponseContent(row);
    try {
      const payload = await fetchResponsePayload(row);
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
      visibleStateBadges.push({ text: searchMatchBadge, label: searchMatchLabel });
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
          td.appendChild(highlightTextMulti(text, srch.keywords));
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
        for (let i = 0; i < visibleStateBadges.length; i++) {
          const stateBadge = visibleStateBadges[i];
          const badge = document.createElement('span');
          badge.className = 'row-state-badge';
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

      const startLabel = document.createElement('span');
      startLabel.textContent = 'From ';
      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.step = '1';
      startInput.className = 'filter-value';
      startInput.value = startVal;
      startInput.setAttribute('aria-label', columnLabel + ' filter start time');

      const endLabel = document.createElement('span');
      endLabel.textContent = ' To ';
      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.step = '1';
      endInput.className = 'filter-value';
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

      // Select All / Deselect All
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:4px;margin-bottom:4px';
      const allBtn = document.createElement('button');
      allBtn.textContent = 'All';
      allBtn.className = 'filter-clear-btn';
      allBtn.setAttribute('aria-label', 'Select all Method filter values');
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
      noneBtn.setAttribute('aria-label', 'Deselect all Method filter values');
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
      inclAnyInput.setAttribute('aria-label', 'URL filter Include any');

      const inclAllLabel = document.createElement('label');
      inclAllLabel.textContent = 'Include ALL (comma-separated):';
      const inclAllInput = document.createElement('input');
      inclAllInput.type = 'text';
      inclAllInput.className = 'filter-value';
      inclAllInput.placeholder = 'must1, must2';
      inclAllInput.value = isAdv ? rule.includeAll || '' : '';
      inclAllInput.setAttribute('aria-label', 'URL filter Include all');

      const exclLabel = document.createElement('label');
      exclLabel.textContent = 'Exclude ANY (comma-separated):';
      const exclInput = document.createElement('input');
      exclInput.type = 'text';
      exclInput.className = 'filter-value';
      exclInput.placeholder = 'exclude1, exclude2';
      exclInput.value = isAdv ? rule.excludeAny || '' : '';
      exclInput.setAttribute('aria-label', 'URL filter Exclude any');

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
          opSelect.setAttribute('aria-label', columnLabel + ' filter condition ' + (idx + 1) + ' operator');

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'filter-value';
          input.placeholder = 'value';
          input.value = cond.value || '';
          input.setAttribute('aria-label', columnLabel + ' filter condition ' + (idx + 1) + ' value');

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

  function getActiveFilterCount() {
    return countActiveColumnFilters(state.columnFilterRules);
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

  function createPresetDropdownContent(presets, onApply, onDelete, onSave, onClearAll) {
    const container = document.createElement('div');
    container.style.cssText = 'min-width:min(240px,calc(100vw - 16px))';

    if (presets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'preset-empty';
      empty.textContent = 'No saved presets';
      container.appendChild(empty);
    } else {
      presets.forEach((preset, idx) => {
        const row = document.createElement('div');
        row.className = 'preset-row';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'context-menu-item preset-apply';
        applyBtn.textContent = preset.name;
        applyBtn.title = 'Apply preset: ' + preset.name;
        applyBtn.addEventListener('click', () => onApply(preset, idx));
        row.appendChild(applyBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'context-menu-item preset-delete';
        deleteBtn.setAttribute('aria-label', 'Delete preset ' + preset.name);
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', () => onDelete(idx));
        row.appendChild(deleteBtn);

        container.appendChild(row);
      });
    }

    const divider = document.createElement('div');
    divider.className = 'preset-divider';
    container.appendChild(divider);

    const saveSection = document.createElement('div');
    saveSection.className = 'preset-save-section';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'preset-name-label';
    nameLabel.textContent = 'New preset name';
    const nameInputId = 'presetNameInput_' + Date.now();
    nameLabel.htmlFor = nameInputId;
    saveSection.appendChild(nameLabel);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = nameInputId;
    nameInput.className = 'preset-name-input';
    nameInput.placeholder = 'Preset name…';
    nameInput.maxLength = MAX_PRESET_NAME_LENGTH;
    const doSave = () => { onSave(nameInput.value); };
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSave(); }
    });
    saveSection.appendChild(nameInput);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'context-menu-item preset-save-btn';
    saveBtn.textContent = 'Save current filters';
    saveBtn.addEventListener('click', doSave);
    saveSection.appendChild(saveBtn);

    if (presets.length > 0) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'context-menu-item preset-clear-btn';
      clearBtn.textContent = 'Clear active filters';
      clearBtn.title = 'Reset all column filters to defaults';
      clearBtn.addEventListener('click', () => onClearAll());
      saveSection.appendChild(clearBtn);
    }

    container.appendChild(saveSection);
    return container;
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
    const activeHeader = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest('th[data-col-id]')
      : null;
    const focusColId = state.pendingHeaderFocusId || (activeHeader ? activeHeader.dataset.colId : null);
    state.pendingHeaderFocusId = null;
    thead.textContent = '';

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
      th.className = 'sortable-header';
      th.dataset.colId = c.id;
      th.draggable = true;
      th.scope = 'col';
      th.tabIndex = 0;
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-label', c.label);
      th.setAttribute('aria-haspopup', 'dialog');
      th.setAttribute('aria-controls', 'columnFilterPopup');
      th.setAttribute('aria-expanded', 'false');
      th.setAttribute('aria-keyshortcuts', 'Enter Space Alt+ArrowLeft Alt+ArrowRight Shift+F10');
      const sortState = getAriaSortValue(state.sort, c.id);
      th.setAttribute('aria-sort', sortState);
      th.title = c.label + ': Enter or Space to sort; Alt+Left/Right Arrow to reorder; context menu to filter';

      const label = document.createElement('span');
      label.className = 'column-header-label';
      label.textContent = c.label;
      th.appendChild(label);
      if (sortState !== 'none') {
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.textContent = sortState === 'ascending' ? ' ▲' : ' ▼';
        th.appendChild(indicator);
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
      th.addEventListener('click', (event) => {
        if (event.target && event.target.classList && event.target.classList.contains('col-resizer')) return;
        sortColumn();
      });
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
        if (event.key === 'Enter' || event.key === ' ') {
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
      columnResizer.tabIndex = 0;
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
      const kwMatches = [];
      for (const row of sorted) {
        if (deepSearchMatch(row, kw.query, srch.scope)) {
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

  function updateSampleCaptureStatus() {
    const status = $('#sampleCaptureStatus');
    if (!status) return;
    status.hidden = !state.sampleCaptureActive;
    status.textContent = state.sampleCaptureActive ? 'Local sample · live paused · Clear to exit' : '';
    status.title = state.sampleCaptureActive
      ? 'Local synthetic requests are loaded. No network traffic was sent. Clear removes them and restores the previous recording state.'
      : '';
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
      const title = document.createElement('div');
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
    if (mode !== 'capture') {
      const action = emptyState.querySelector('.empty-state-action');
      if (action) action.remove();
    }
  }

  function updateRetentionStatus() {
    const retention = state.retention;
    const presentation = getRetentionPresentation(retention.requestLimit, retention.unlimited);
    const statusParts = [
      'Retention: ' + presentation.policyLabel,
      'body cache ' + fmtBytes(retention.responseCacheBytes) + ' / ' + fmtBytes(MAX_RESPONSE_CACHE_BYTES),
      'evicted requests ' + retention.evictedRequests,
      'bodies omitted ' + retention.omittedBodies,
      'bodies evicted ' + retention.evictedBodies,
      'preview-truncated ' + retention.truncatedBodies,
    ];
    if (retention.settingWarning) statusParts.push(retention.settingWarning);
    const status = $('#retentionStatus');
    if (status) {
      status.textContent = statusParts.join(' · ');
      status.title = statusParts.join('. ');
    }
    const button = $('#retentionBtn');
    if (button) {
      button.textContent = presentation.buttonLabel;
      button.setAttribute('aria-label', presentation.accessibleName);
    }
  }

  function updateTableSummary(visibleRowCount, visibleBytes) {
    if (Number.isFinite(visibleBytes)) state.visibleBytes = visibleBytes;
    const activeFilterCount = countActiveColumnFilters(state.columnFilterRules);
    const requestCountText =
      visibleRowCount +
      ' / ' +
      state.rows.length +
      ' requests · ' +
      activeFilterCount +
      ' active column ' +
      (activeFilterCount === 1 ? 'filter' : 'filters');
    const counter = $('#counter');
    if (counter) counter.textContent = requestCountText;
    queueRequestCountAnnouncement(requestCountText);
    const filterButton = $('#filterBtn');
    if (filterButton) {
      filterButton.textContent =
        activeFilterCount > 0 ? '⚙️ Column Filters (' + activeFilterCount + ')' : '⚙️ Column Filters';
      filterButton.setAttribute(
        'aria-label',
        activeFilterCount > 0
          ? 'Column Filters, ' + activeFilterCount + ' active'
          : 'Column Filters, no active filters',
      );
    }
    const totalSizeEl = $('#totalSize');
    if (totalSizeEl) {
      totalSizeEl.textContent = state.visibleBytes > 0 ? fmtBytes(state.visibleBytes) + ' transferred' : '';
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
        statsEl.textContent =
          'avg ' + fmtTime(stats.avgDuration) +
          ' · min ' + fmtTime(stats.minDuration) +
          ' · max ' + fmtTime(stats.maxDuration);
      } else {
        statsEl.textContent = '';
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
      updateTableSummary(state.filteredRows.length);
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
    updateTableSummary(state.filteredRows.length);
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
    updateTableSummary(state.filteredRows.length);
    return true;
  }

  function renderBody() {
    const restoreEmptyStateFocus = isFocusInsideEmptyState();
    filterRows();
    state.renderedActiveFilterCount = countActiveColumnFilters(state.columnFilterRules);
    refreshSearchMatches();
    const rows = getSortedRows(state.filteredRows);
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

  function render() {
    renderHeader();
    renderBody();
  }

  // ============================================================
  // Section 13: Detail Panel — Fiddler-style tabbed inspector
  // ============================================================

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
      : decodeResponseContent(rawContent, encoding);
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
    // [U2] Export only filtered (displayed) rows
    filterRows();
    return state.filteredRows;
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
    setStatus('panel.js loaded');

    const pendingLiveRows = state.pendingLiveRows;
    let pendingLiveFrame = false;
    let pendingScrollToBottom = false;
    let pendingResponseSearchFrame = false;
    const resetPendingLiveRows = () => {
      pendingLiveRows.length = 0;
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

    // [U4] Clear — reset filters properly, keeping method defaults
    $('#clearBtn').addEventListener('click', () => {
      const clearedSampleCapture = state.sampleCaptureActive;
      resetPendingLiveRows();
      clearStoredRows();
      state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();
      state.selectedRow = null;
      state.focusedRow = null;
      state.selectedRows.clear();
      state.highlightedRows.clear();
      // Reset search
      state.search.keywords = [];
      state.search.matches = [];
      state.search.currentIndex = -1;
      state.search.rowColors.clear();
      state.search.rowKeywords.clear();
      state.search.perKeyword.clear();
      updateRecordState(false);
      render();
      updateRetentionStatus();
      clearDetailsPanel();
      $('#clearBtn').focus({ preventScroll: true });
      setStatus(
        clearedSampleCapture
          ? state.paused
            ? 'Local sample capture cleared. Recording remains paused.'
            : 'Local sample capture cleared. Live capture resumed.'
          : 'Cleared',
      );
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
    $('#exportHarBtn').addEventListener('click', (event) => openExportSafetyDialog(event.currentTarget));

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
        filterPopup.appendChild(createFilterPopupContent(renderBody, null));
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
    };

    $('#thead').addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const th = event.target.closest('th');
      const focusColId = th ? th.dataset.colId : null;
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

    // Filter preset dropdown
    const presetsBtn = $('#presetsBtn');
    const presetsMenu = document.createElement('div');
    presetsMenu.id = 'presetsMenu';
    presetsMenu.className = 'filter-dropdown-content dropdown-content preset-menu';
    presetsMenu.style.position = 'fixed';
    presetsMenu.style.display = 'none';
    presetsMenu.setAttribute('role', 'dialog');
    presetsMenu.setAttribute('aria-label', 'Filter presets');
    installPopupKeyboardSupport(presetsMenu);
    document.body.appendChild(presetsMenu);

    const renderPresetsMenu = () => {
      const { presets, error: loadError } = loadFilterPresets();
      if (loadError) setStatus(loadError);
      presetsMenu.textContent = '';
      const header = document.createElement('div');
      header.className = 'preset-header';
      header.textContent = 'Filter Presets';
      presetsMenu.appendChild(header);
      presetsMenu.appendChild(
        createPresetDropdownContent(
          presets,
          (preset) => {
            state.columnFilterRules = deserializeFilterState(preset.filterRules);
            filterRows();
            renderBody();
            updateTableSummary(state.filteredRows.length);
            closeAccessiblePopup(presetsMenu, true);
            setStatus('Applied preset: ' + preset.name);
          },
          (idx) => {
            const { presets: updated, error: delLoadError } = loadFilterPresets();
            if (delLoadError) { setStatus(delLoadError); return; }
            const name = updated[idx] ? updated[idx].name : '';
            updated.splice(idx, 1);
            const ok = saveFilterPresets(updated);
            if (!ok) { setStatus('Could not delete preset. Storage unavailable.'); return; }
            renderPresetsMenu();
            const firstItem = getPopupFocusableItems(presetsMenu, false)[0];
            if (firstItem) firstItem.focus();
            setStatus('Deleted preset: ' + name);
          },
          (name) => {
            const safeName = normalizePresetName(name);
            if (!safeName) { setStatus('Enter a preset name before saving.'); return; }
            const { presets: presetList, error: saveLoadError } = loadFilterPresets();
            if (saveLoadError) { setStatus(saveLoadError); return; }
            if (presetList.length >= MAX_FILTER_PRESETS) {
              setStatus('Preset limit reached (' + MAX_FILTER_PRESETS + '). Delete one before saving.');
              return;
            }
            presetList.push({ name: safeName, filterRules: serializeFilterState(state.columnFilterRules) });
            const ok = saveFilterPresets(presetList);
            if (!ok) { setStatus('Could not save preset. Storage unavailable or data too large.'); return; }
            renderPresetsMenu();
            const firstItem = getPopupFocusableItems(presetsMenu, false)[0];
            if (firstItem) firstItem.focus();
            setStatus('Saved preset: ' + safeName);
          },
          () => {
            state.columnFilterRules = DEFAULT_COLUMN_FILTER_RULES();
            filterRows();
            renderBody();
            updateTableSummary(state.filteredRows.length);
            closeAccessiblePopup(presetsMenu, true);
            setStatus('Column filters cleared');
          },
        ),
      );
    };

    if (presetsBtn) {
      presetsBtn.addEventListener('click', (event) => {
        if (presetsMenu.classList.contains('show')) {
          closeAccessiblePopup(presetsMenu, true);
          return;
        }
        renderPresetsMenu();
        const rect = event.currentTarget.getBoundingClientRect();
        showAccessiblePopupAt(presetsMenu, rect.left, rect.bottom, presetsBtn);
      });
    }

    // Keyboard shortcut help dialog
    const shortcutDialog = $('#shortcutDialog');
    const shortcutBtn = $('#shortcutBtn');
    const openShortcutDialog = (trigger) => {
      if (!shortcutDialog) return;
      if (shortcutDialog.open) return; // already open — preserve the original trigger
      // Don't open if another modal <dialog> is active (e.g. retention, data-safety)
      const otherModal = Array.from(document.querySelectorAll('dialog[open]')).some((d) => d !== shortcutDialog);
      if (otherModal) return;
      shortcutDialog._networkPlusTrigger = trigger || null;
      shortcutDialog.showModal();
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

    // Tab switching for inspector panels
    const initTabBar = (barId) => {
      const bar = $('#' + barId);
      if (!bar) return;
      const buttons = $all('.tab-btn', bar);
      const contentArea = bar.nextElementSibling;

      const activateTab = (btn, moveFocus) => {
        const tabId = btn.dataset.tab;
        buttons.forEach((candidate) => {
          const isActive = candidate === btn;
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
        if (moveFocus) btn.focus();
      };

      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) activateTab(btn, false);
      });
      bar.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const current = e.target.closest('.tab-btn');
        const nextIndex = getNextTabIndex(buttons.indexOf(current), buttons.length, e.key);
        if (nextIndex < 0) return;
        e.preventDefault();
        activateTab(buttons[nextIndex], true);
      });

      const activeButton = buttons.find((btn) => btn.classList.contains('active')) || buttons[0];
      if (activeButton) activateTab(activeButton, false);
    };
    initTabBar('req-tab-bar');
    initTabBar('res-tab-bar');

    render();

    // Outside pointer actions dismiss transient surfaces without trapping focus.
    window.addEventListener('click', (event) => {
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
    let previousTableScrollTop = tableWrap.scrollTop;
    tableWrap.addEventListener('scroll', () => {
      const currentScrollTop = tableWrap.scrollTop;
      if (state.autoScroll && currentScrollTop < previousTableScrollTop) {
        state.autoScroll = false;
        updateAutoScrollButton();
      }
      previousTableScrollTop = currentScrollTop;
    });

    function scrollToSelectedRow() {
      if (!state.selectedRow) return;
      const selectedTr = tableWrap.querySelector('tr[data-row-id="' + state.selectedRow.id + '"]');
      if (selectedTr) selectedTr.scrollIntoView({ block: 'nearest' });
    }

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
          const rowsToRemove = state.rows.filter((targetRow) => !state.selectedRows.has(targetRow));
          removeRowsFromState(rowsToRemove, false);
          state.selectedRows.clear();
          renderBody();
        }));
        contextMenu.appendChild(createRowMenuButton('Delete Selected (' + selectedCount + ')', () => {
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
    // Track search panel visibility
    let searchPanelVisible = false;

    function toggleSearchPanel(forceOpen) {
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
        if (firstInput) firstInput.focus();
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
      const unsearchedBodies = srch.scope.resBody && activeKws.length > 0
        ? countUnsearchedResponseBodies(state.filteredRows)
        : 0;
      if (unsearchedBodies > 0) {
        searchCount.textContent += ' · ' + unsearchedBodies + ' bodies not searched';
      }
      queueSearchCountAnnouncement(searchCount.textContent);
      // Update per-keyword counts in search rows
      renderSearchRows();
    }

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
      if (!isRetainedRow(row, state.retainedRows) || !hasActiveSearchKeywords(state.search.keywords)) return;
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
      scheduleResponseSearchRefresh(row);
      if (!shouldRenderSelectedRow(state.selectedRow, row)) return;
      renderCachedResponseContent(row);
    };
    const scheduleLiveRows = (scrollToBottom) => {
      if (scrollToBottom) pendingScrollToBottom = true;
      if (pendingLiveFrame) return;
      pendingLiveFrame = true;
      window.requestAnimationFrame(() => {
        pendingLiveFrame = false;
        const queuedRows = pendingLiveRows.splice(0, pendingLiveRows.length);
        const shouldScrollToBottom = pendingScrollToBottom && state.autoScroll;
        pendingScrollToBottom = false;
        const fastPathEligible = isIncrementalAppendEligible(
          state.sort,
          countActiveColumnFilters(state.columnFilterRules),
          state.search.keywords,
          state.renderedActiveFilterCount,
        );
        const liveRows = queuedRows.filter((row) => isRetainedRow(row, state.retainedRows));
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
        const row = buildRowFromRequest(request);
        addRowsWithRetention([row], 'live');
        if (!isRetainedRow(row, state.retainedRows)) return;
        cacheResponseContent(row)
          .then(() => scheduleResponseSearchRefresh(row))
          .catch((error) => {
            scheduleResponseSearchRefresh(row);
            const display = describeResponseContentState(row, error);
            if (display.label === 'error') {
              setStatus('Response content error: ' + display.reason);
              console.error(error);
            }
          }); // [U1]
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
    extractUrlParts,
    formatInitiator,
    parseQueryString,
    guessMimeType,
    toHarHeaders,
    getEmptyStateMode,
    planSampleCaptureTransition,
    planSampleCaptureFilterTransition,
    formatSampleCaptureRemainingStatus,
    createSampleCaptureRequests,
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
    decodeResponseContent,
    buildHarResponseContent,
    cacheResponseContent,
    settleResponseContentForHar,
    isRuleActive,
    countActiveColumnFilters,
    hasActiveSearchKeywords,
    preserveMatchingRowIndex,
    planKeywordSearchNavigation,
    planKeywordHighlights,
    shouldRenderSelectedRow,
    isIncrementalAppendEligible,
    getIncrementalAppendBatch,
    normalizeRetentionSetting,
    getRetentionPresentation,
    appendRowsWithRetention,
    createRowEvictionPlan,
    isRetainedRow,
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
    computeStats,
    computeWaterfallBar,
    computeWaterfallRange,
    loadThemePref,
    saveThemePref,
    serializeFilterState,
    deserializeFilterState,
    normalizePresetName,
    loadFilterPresets,
    saveFilterPresets,
    FILTER_PRESET_KEY,
    MAX_FILTER_PRESETS,
    MAX_PRESET_NAME_LENGTH,
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
