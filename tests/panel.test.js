/**
 * Unit tests for Network+ pure utility functions
 */

const np = require('../panel.js');

describe('fmtBytes', () => {
  test('returns empty string for null/undefined/NaN', () => {
    expect(np.fmtBytes(null)).toBe('');
    expect(np.fmtBytes(undefined)).toBe('');
    expect(np.fmtBytes(NaN)).toBe('');
  });

  test('formats bytes correctly', () => {
    expect(np.fmtBytes(0)).toBe('0 B');
    expect(np.fmtBytes(500)).toBe('500 B');
    expect(np.fmtBytes(1024)).toBe('1.0 KB');
    expect(np.fmtBytes(1536)).toBe('1.5 KB');
    expect(np.fmtBytes(10240)).toBe('10 KB');
    expect(np.fmtBytes(1048576)).toBe('1.0 MB');
    expect(np.fmtBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('fmtTime', () => {
  test('returns empty string for null/undefined/NaN', () => {
    expect(np.fmtTime(null)).toBe('');
    expect(np.fmtTime(undefined)).toBe('');
    expect(np.fmtTime(NaN)).toBe('');
  });

  test('formats milliseconds correctly', () => {
    expect(np.fmtTime(0)).toBe('0 ms');
    expect(np.fmtTime(50)).toBe('50 ms');
    expect(np.fmtTime(999)).toBe('999 ms');
    expect(np.fmtTime(1000)).toBe('1.00 s');
    expect(np.fmtTime(1500)).toBe('1.50 s');
    expect(np.fmtTime(12345)).toBe('12.35 s');
  });
});

describe('extractUrlParts', () => {
  test('extracts domain and path from valid URL', () => {
    const result = np.extractUrlParts('https://example.com/api/data?q=1');
    expect(result.domain).toBe('example.com');
    expect(result.path).toBe('/api/data?q=1');
  });

  test('handles URL with port', () => {
    const result = np.extractUrlParts('http://localhost:3000/test');
    expect(result.domain).toBe('localhost:3000');
    expect(result.path).toBe('/test');
  });

  test('returns fallback for invalid URL', () => {
    const result = np.extractUrlParts('not-a-url');
    expect(result.domain).toBe('');
    expect(result.path).toBe('not-a-url');
  });
});

describe('formatInitiator', () => {
  test('returns "(unknown)" for null/undefined', () => {
    expect(np.formatInitiator(null)).toEqual({ text: '(unknown)', typeLabel: '' });
    expect(np.formatInitiator(undefined)).toEqual({ text: '(unknown)', typeLabel: '' });
  });

  test('returns "HTML Parser" for parser type', () => {
    expect(np.formatInitiator({ type: 'parser' })).toEqual({ text: 'HTML Parser', typeLabel: 'HTML' });
  });

  test('returns script info with call frames', () => {
    const result = np.formatInitiator({
      type: 'script',
      stack: {
        callFrames: [
          { functionName: 'fetchData', url: 'https://example.com/app.js', lineNumber: 42 },
        ],
      },
    });
    expect(result.text).toBe('JS: app.js:42');
    expect(result.url).toBe('https://example.com/app.js');
    expect(result.lineNumber).toBe(42);
    expect(result.typeLabel).toBe('JS');
  });

  test('returns "JavaScript" when no call frames', () => {
    expect(np.formatInitiator({ type: 'script' })).toEqual({ text: 'JavaScript', typeLabel: 'JS' });
    expect(np.formatInitiator({ type: 'script', stack: { callFrames: [] } })).toEqual({
      text: 'JavaScript',
      typeLabel: 'JS',
    });
  });

  test('returns descriptive text for known types', () => {
    expect(np.formatInitiator({ type: 'preflight' })).toEqual({ text: 'CORS Preflight', typeLabel: 'CORS' });
    expect(np.formatInitiator({ type: 'preload' })).toEqual({ text: 'Preload', typeLabel: 'Preload' });
  });
});

describe('parseQueryString', () => {
  test('parses query parameters from URL', () => {
    const result = np.parseQueryString('https://example.com/?foo=bar&baz=qux');
    expect(result).toEqual([
      { name: 'foo', value: 'bar' },
      { name: 'baz', value: 'qux' },
    ]);
  });

  test('returns empty array for URL without query', () => {
    expect(np.parseQueryString('https://example.com/')).toEqual([]);
  });

  test('returns empty array for invalid URL', () => {
    expect(np.parseQueryString('not-a-url')).toEqual([]);
  });
});

describe('guessMimeType', () => {
  test('extracts content-type from response headers', () => {
    const row = {
      responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
      type: 'text/html',
    };
    expect(np.guessMimeType(row)).toBe('application/json');
  });

  test('falls back to row.type when no content-type header', () => {
    const row = { responseHeaders: [], type: 'text/html' };
    expect(np.guessMimeType(row)).toBe('text/html');
  });

  test('falls back to application/octet-stream when no type', () => {
    const row = { responseHeaders: [] };
    expect(np.guessMimeType(row)).toBe('application/octet-stream');
  });
});

describe('toHarHeaders', () => {
  test('converts header array to HAR format', () => {
    const headers = [
      { name: 'Content-Type', value: 'text/html' },
      { name: 'X-Custom', value: null },
    ];
    expect(np.toHarHeaders(headers)).toEqual([
      { name: 'Content-Type', value: 'text/html' },
      { name: 'X-Custom', value: '' },
    ]);
  });

  test('returns empty array for null/undefined', () => {
    expect(np.toHarHeaders(null)).toEqual([]);
    expect(np.toHarHeaders(undefined)).toEqual([]);
  });
});

describe('getRequestEpoch and compareRequestTimes', () => {
  test('uses captured ISO timestamps for chronological values', () => {
    const earlier = np.getRequestEpoch('2026-07-19T01:00:00.000Z');
    const later = np.getRequestEpoch('2026-07-19T12:00:00.000+09:00');
    expect(earlier).toBe(Date.parse('2026-07-19T01:00:00.000Z'));
    expect(later).toBe(Date.parse('2026-07-19T03:00:00.000Z'));
    expect(earlier).toBeLessThan(later);
  });

  test('supports stable numeric fallbacks for invalid timestamps', () => {
    expect(np.getRequestEpoch('not-a-date', 42)).toBe(42);
    expect(np.getRequestEpoch(null, 17)).toBe(17);
    expect(np.getRequestEpoch(undefined, NaN)).toBe(0);
  });

  test('compares client and server epochs for ascending and descending sorts', () => {
    const earlier = { clientStartEpoch: 1000, serverDoneEpoch: 1200 };
    const later = { clientStartEpoch: 2000, serverDoneEpoch: 2600 };
    expect(np.compareRequestTimes(earlier, later, 'clientStart')).toBeLessThan(0);
    expect(np.compareRequestTimes(earlier, later, 'serverDone')).toBeLessThan(0);
    expect(np.compareRequestTimes(earlier, later, 'clientStart') * -1).toBeGreaterThan(0);
    expect(np.compareRequestTimes({}, later, 'clientStart')).toBeGreaterThan(0);
    expect(np.compareRequestTimes(earlier, later, 'method')).toBe(0);
  });
});

describe('calculateTimingSegments', () => {
  test('subtracts SSL from connect without changing the captured total', () => {
    const result = np.calculateTimingSegments(
      { blocked: 10, dns: 20, connect: 100, ssl: 40, send: 5, wait: 60, receive: 25 },
      220,
    );
    const durations = Object.fromEntries(result.segments.map((segment) => [segment.label, segment.duration]));
    expect(durations.connect).toBe(60);
    expect(durations.ssl).toBe(40);
    expect(result.segments.reduce((sum, segment) => sum + segment.duration, 0)).toBe(220);
    expect(result.total).toBe(220);
    expect(result.segments.map((segment) => segment.label)).toEqual([
      'blocked',
      'dns',
      'connect',
      'ssl',
      'send',
      'wait',
      'receive',
    ]);
  });

  test('keeps connect intact without SSL and handles invalid values', () => {
    const result = np.calculateTimingSegments({ connect: 25, ssl: -1, wait: NaN }, NaN);
    const connect = result.segments.find((segment) => segment.label === 'connect');
    const ssl = result.segments.find((segment) => segment.label === 'ssl');
    expect(connect).toEqual({ label: 'connect', duration: 25, available: true });
    expect(ssl).toEqual({ label: 'ssl', duration: 0, available: false });
    expect(result.total).toBe(25);
  });

  test('never produces a negative exclusive connect duration', () => {
    const result = np.calculateTimingSegments({ connect: 10, ssl: 20 }, 20);
    expect(result.segments.find((segment) => segment.label === 'connect').duration).toBe(0);
  });
});

describe('response content helpers', () => {
  test('decodes base64 only for display/search use', () => {
    expect(np.decodeResponseContent('eyJvayI6dHJ1ZX0=', 'base64')).toBe('{"ok":true}');
    expect(np.decodeResponseContent('plain text', '')).toBe('plain text');
    const unicodeText = 'caf\u00e9';
    const unicodeBase64 = Buffer.from(unicodeText, 'utf8').toString('base64');
    expect(np.decodeResponseContent(unicodeBase64, 'base64')).toBe(unicodeText);
    expect(np.decodeResponseContent(null, 'base64')).toBe('');
  });

  test('handles base64 decode failures without exposing binary garbage', () => {
    const atobSpy = jest.spyOn(global, 'atob').mockImplementationOnce(() => {
      throw new Error('invalid base64');
    });
    expect(np.decodeResponseContent('invalid', 'base64')).toBe('');
    atobSpy.mockRestore();
  });

  test('preserves base64 text and encoding in HAR content', () => {
    const content = np.buildHarResponseContent({
      size: 12,
      type: 'application/octet-stream',
      responseHeaders: [],
      responseContent: 'AAEC/w==',
      responseContentEncoding: 'base64',
    });
    expect(content).toEqual({
      size: 12,
      mimeType: 'application/octet-stream',
      text: 'AAEC/w==',
      encoding: 'base64',
    });
  });

  test('keeps plain text plain and supplies safe empty fallbacks', () => {
    const plain = np.buildHarResponseContent({
      size: 4,
      type: 'text/plain',
      responseHeaders: [],
      responseContent: 'test',
      responseContentEncoding: '',
    });
    expect(plain).toEqual({ size: 4, mimeType: 'text/plain', text: 'test' });
    expect(np.buildHarResponseContent(null)).toEqual({
      size: 0,
      mimeType: 'application/octet-stream',
      _networkPlus: {
        status: 'unavailable',
        reason: 'Full response content is unavailable.',
      },
    });
  });

  test('settles successful and failed response content preparation independently', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const loadResponseContent = jest.fn((row) =>
      row.id === 1 ? Promise.resolve(row) : Promise.reject(new Error('body unavailable')),
    );

    const result = await np.settleResponseContentForHar(rows, loadResponseContent);

    expect(result.unavailableCount).toBe(1);
    expect(result.settlements.map((settlement) => settlement.status)).toEqual(['fulfilled', 'rejected']);
    expect(loadResponseContent).toHaveBeenCalledTimes(2);
  });

  test('clears a timed-out content promise so a later attempt can succeed', async () => {
    jest.useFakeTimers();
    try {
      const getContent = jest
        .fn()
        .mockImplementationOnce(() => {})
        .mockImplementationOnce((callback) => callback('retry succeeded', ''));
      const row = {
        id: 7,
        responseContent: null,
        responseContentEncoding: '',
        responseContentError: null,
        _responseContentPromise: null,
        _reqObj: { getContent },
      };

      const firstResult = np.cacheResponseContent(row, 25).then(
        () => null,
        (error) => error,
      );
      await jest.advanceTimersByTimeAsync(25);

      const timeoutError = await firstResult;
      expect(timeoutError.message).toContain('Timed out retrieving response content');
      expect(row._responseContentPromise).toBeNull();

      await expect(np.cacheResponseContent(row, 25)).resolves.toBe(row);
      expect(getContent).toHaveBeenCalledTimes(2);
      expect(row.responseContent).toBe('retry succeeded');
      expect(row.responseContentError).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('keeps successful base64 content cached without fetching it twice', async () => {
    const getContent = jest.fn((callback) => callback('AAEC/w==', 'base64'));
    const row = {
      id: 8,
      responseContent: null,
      responseContentEncoding: '',
      responseContentError: null,
      _responseContentPromise: null,
      _reqObj: { getContent },
    };

    const first = np.cacheResponseContent(row);
    await expect(first).resolves.toBe(row);
    const second = np.cacheResponseContent(row);
    await expect(second).resolves.toBe(row);

    expect(second).toBe(first);
    expect(getContent).toHaveBeenCalledTimes(1);
    expect(row.responseContent).toBe('AAEC/w==');
    expect(row.responseContentEncoding).toBe('base64');
  });
});

describe('capture retention helpers', () => {
  const rows = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

  test('publishes the safe default and exact response budgets', () => {
    expect(np.DEFAULT_REQUEST_RETENTION_LIMIT).toBe(5000);
    expect(np.MAX_RESPONSE_BODY_BYTES).toBe(1024 * 1024);
    expect(np.MAX_RESPONSE_CACHE_BYTES).toBe(32 * 1024 * 1024);
  });

  test('normalizes bounded and explicit unlimited settings without silent invalid fallback', () => {
    expect(np.normalizeRetentionSetting({ requestLimit: 2500, unlimited: false })).toEqual({
      setting: { requestLimit: 2500, unlimited: false },
      warning: '',
    });
    expect(np.normalizeRetentionSetting({ requestLimit: 0, unlimited: true })).toEqual({
      setting: { requestLimit: 5000, unlimited: true },
      warning: '',
    });
    const invalid = np.normalizeRetentionSetting({ requestLimit: 99, unlimited: false });
    expect(invalid.setting).toEqual({ requestLimit: 5000, unlimited: false });
    expect(invalid.warning).toContain('restored');
  });

  test('evicts only the oldest overflow and honors the exact boundary', () => {
    const current = rows(3);
    const incoming = [{ id: 4 }, { id: 5 }];
    expect(np.appendRowsWithRetention(current, incoming, 5, false)).toEqual({
      retainedRows: current.concat(incoming),
      evictedRows: [],
    });
    const overflow = np.appendRowsWithRetention(current, incoming, 4, false);
    expect(overflow.retainedRows.map((row) => row.id)).toEqual([2, 3, 4, 5]);
    expect(overflow.evictedRows.map((row) => row.id)).toEqual([1]);
  });

  test('keeps imported batches and iterative live appends policy-equivalent', () => {
    const incoming = rows(8);
    const imported = np.appendRowsWithRetention([], incoming, 3, false);
    let liveRows = [];
    const liveEvictions = [];
    for (const row of incoming) {
      const result = np.appendRowsWithRetention(liveRows, [row], 3, false);
      liveRows = result.retainedRows;
      liveEvictions.push(...result.evictedRows);
    }
    expect(liveRows.map((row) => row.id)).toEqual(imported.retainedRows.map((row) => row.id));
    expect(liveEvictions.map((row) => row.id)).toEqual(imported.evictedRows.map((row) => row.id));
    expect(np.appendRowsWithRetention([], incoming, 3, true).evictedRows).toEqual([]);
  });

  test('plans cleanup for selection, focus, search, and pending batches by identity', () => {
    const [first, second, third] = rows(3);
    const plan = np.createRowEvictionPlan([first, second], {
      allRows: [first, second, third],
      selectedRow: first,
      focusedRow: third,
      selectedRows: [first, third],
      searchMatches: [second, third],
      pendingRows: [first, third],
    });
    expect(plan).toEqual({
      selectedRowEvicted: true,
      focusedRowEvicted: false,
      retainedSelectedRows: [third],
      retainedSearchMatches: [third],
      retainedPendingRows: [third],
    });
  });

  test('accounts for encoded and decoded response payload memory', () => {
    expect(np.measureResponsePayload('test', '')).toEqual({
      content: 'test',
      encoding: '',
      text: 'test',
      bytes: 4,
    });
    const base64 = Buffer.from('hello', 'utf8').toString('base64');
    const measured = np.measureResponsePayload(base64, 'base64');
    expect(measured.text).toBe('hello');
    expect(measured.bytes).toBe(Buffer.byteLength(base64) + Buffer.byteLength('hello'));
  });

  test('admits exact-budget bodies and evicts oldest cache entries for overflow', () => {
    const first = { row: { id: 1 }, bytes: 10 };
    const second = { row: { id: 2 }, bytes: 15 };
    expect(np.planResponseCacheAdmission([first, second], 5, 30)).toEqual({
      accepted: true,
      evictedEntries: [],
      resultingBytes: 30,
    });
    expect(np.planResponseCacheAdmission([first, second], 6, 30)).toEqual({
      accepted: true,
      evictedEntries: [first],
      resultingBytes: 21,
    });
    expect(np.planResponseCacheAdmission([], 31, 30).accepted).toBe(false);
  });

  test('counts response bodies that deep search cannot inspect', () => {
    expect(np.countUnsearchedResponseBodies([
      { responseContentState: 'cached' },
      { responseContentState: 'omitted' },
      { responseContentState: 'evicted' },
    ])).toBe(2);
  });

  test('does not restore a managed row after it was removed before getContent resolves', async () => {
    const row = {
      id: 99,
      responseContent: null,
      responseContentState: 'not-loaded',
      responseContentReason: '',
      responseContentError: null,
      _responseContentPromise: null,
      _managedRetention: true,
      _reqObj: { getContent: (callback) => callback('late body', '') },
    };
    await expect(np.cacheResponseContent(row)).rejects.toThrow('after its request was evicted');
    expect(row.responseContent).toBeNull();
  });

  test('checks managed row liveness through constant-time Set membership', () => {
    const row = { id: 1, _retentionDisposed: false };
    const retainedRows = { has: jest.fn(() => true) };
    expect(np.isRetainedRow(row, retainedRows)).toBe(true);
    expect(retainedRows.has).toHaveBeenCalledTimes(1);
    row._retentionDisposed = true;
    expect(np.isRetainedRow(row, retainedRows)).toBe(false);
    expect(np.isRetainedRow(null, retainedRows)).toBe(false);
  });

  test('plans a 100k import window without constructing discarded rows', () => {
    expect(np.planImportRetention(100000, 5000, false)).toEqual({
      startIndex: 95000,
      retainedCount: 5000,
      skippedCount: 95000,
    });
    expect(np.planImportRetention(100000, 5000, true)).toEqual({
      startIndex: 0,
      retainedCount: 100000,
      skippedCount: 0,
    });
    expect(np.planImportRetention(-1, 5000, false)).toEqual({
      startIndex: 0,
      retainedCount: 0,
      skippedCount: 0,
    });
  });

  test('distinguishes embedded, empty, and unavailable imported HAR bodies', () => {
    expect(np.classifyImportedResponseContent({ response: { content: { text: '' } } })).toEqual({
      state: 'embedded',
      reason: '',
    });
    expect(np.classifyImportedResponseContent({ response: { content: { size: 0 }, bodySize: 0 } })).toEqual({
      state: 'empty',
      reason: '',
    });
    const missing = np.classifyImportedResponseContent({
      response: { content: { size: 512 }, bodySize: 512 },
    });
    expect(missing.state).toBe('unavailable');
    expect(missing.reason).toContain('512-byte');
    const reexported = np.buildHarResponseContent({
      size: 512,
      type: 'application/json',
      responseHeaders: [],
      responseContent: null,
      responseContentState: missing.state,
      responseContentReason: missing.reason,
    });
    expect(reexported.text).toBeUndefined();
    expect(reexported._networkPlus).toEqual({
      status: 'unavailable',
      reason: missing.reason,
    });
    const marked = np.classifyImportedResponseContent({
      response: { content: { _networkPlus: { status: 'omitted', reason: 'source limit' } } },
    });
    expect(marked).toEqual({
      state: 'unavailable',
      reason: 'Imported HAR body is omitted: source limit',
    });
    expect(np.classifyImportedResponseContent({ response: {} }).reason).toContain('explicit zero');
  });

  test('labels expected response retention states without treating them as errors', () => {
    expect(np.describeResponseContentState({
      responseContentState: 'omitted',
      responseContentReason: 'over the limit',
    })).toEqual({ label: 'omitted', reason: 'over the limit' });
    expect(np.describeResponseContentState({ responseContentState: 'row-evicted' })).toEqual({
      label: 'evicted',
      reason: 'Full response content is unavailable.',
    });
    expect(np.describeResponseContentState({ responseContentState: 'loading' }, new Error('fetch failed'))).toEqual({
      label: 'error',
      reason: 'fetch failed',
    });
  });

  test('preserves an imported unavailable reason without attempting retrieval', async () => {
    const row = {
      responseContent: null,
      responseContentState: 'unavailable',
      responseContentReason: 'The imported HAR omitted a declared body.',
      responseContentError: null,
      _responseContentPromise: null,
      _reqObj: null,
    };
    await expect(np.cacheResponseContent(row)).rejects.toThrow('The imported HAR omitted a declared body.');
    expect(row.responseContentState).toBe('unavailable');
    expect(row.responseContentReason).toBe('The imported HAR omitted a declared body.');

    row.responseContentState = 'evicted';
    row.responseContentReason = 'Evicted from the bounded cache.';
    await expect(np.cacheResponseContent(row)).rejects.toThrow('Evicted from the bounded cache.');
    expect(np.describeResponseContentState(row).label).toBe('evicted');
  });
});

describe('active column filter helpers', () => {
  test('does not count inactive and default rules', () => {
    const allMethods = np.DEFAULT_METHOD_FILTERS();
    expect(np.isRuleActive({ op: 'contains', value: '   ' })).toBe(false);
    expect(np.isRuleActive({ op: 'equals', value: 0 })).toBe(true);
    expect(np.isRuleActive({ mode: 'methodSet', include: allMethods })).toBe(false);
    expect(np.isRuleActive({ mode: 'methodSet', include: { GET: true } })).toBe(true);
    expect(np.isRuleActive({ mode: 'statusSet', include: { '200': true } })).toBe(false);
    expect(np.isRuleActive({ mode: 'urlAdvanced', caseSensitive: true })).toBe(false);
    expect(np.isRuleActive({ mode: 'timeRange', start: '', end: '' })).toBe(false);
    expect(np.isRuleActive({ mode: 'multiText', conditions: [{ op: 'contains', value: '' }] })).toBe(false);
  });

  test('counts active columns once regardless of condition count', () => {
    const rules = {
      method: { mode: 'methodSet', include: { GET: true, POST: false } },
      status: { mode: 'statusSet', include: { '200': true, '404': false } },
      domain: {
        mode: 'multiText',
        conditions: [
          { op: 'contains', value: 'api' },
          { op: 'notcontains', value: 'internal' },
        ],
      },
      url: { mode: 'urlAdvanced', includeAny: '', includeAll: '', excludeAny: '' },
      size: { op: 'empty', value: '' },
      path: { op: 'contains', value: '' },
    };
    expect(np.countActiveColumnFilters(rules)).toBe(4);
    expect(np.countActiveColumnFilters(null)).toBe(0);
  });
});

describe('release trust helpers', () => {
  test('detects only non-blank active search keywords', () => {
    expect(np.hasActiveSearchKeywords(null)).toBe(false);
    expect(np.hasActiveSearchKeywords([])).toBe(false);
    expect(np.hasActiveSearchKeywords([{ query: '   ' }, null])).toBe(false);
    expect(np.hasActiveSearchKeywords([{ query: 'needle' }])).toBe(true);
  });

  test('preserves the navigated row when new matches arrive before it', () => {
    const first = { id: 1 };
    const current = { id: 2 };
    const late = { id: 3 };
    expect(np.preserveMatchingRowIndex([first, current], 1, [late, first, current])).toBe(2);
  });

  test('clamps a missing navigated row without forcing first-match navigation', () => {
    expect(np.preserveMatchingRowIndex([{ id: 1 }], 4, [{ id: 2 }, { id: 3 }])).toBe(1);
    expect(np.preserveMatchingRowIndex([], -1, [{ id: 2 }])).toBe(-1);
    expect(np.preserveMatchingRowIndex([{ id: 1 }], 0, [])).toBe(-1);
  });

  test('guards deferred detail rendering by selected row identity', () => {
    const rowA = { id: 1 };
    const rowB = { id: 2 };
    expect(np.shouldRenderSelectedRow(rowA, rowA)).toBe(true);
    expect(np.shouldRenderSelectedRow(rowB, rowA)).toBe(false);
    expect(np.shouldRenderSelectedRow(null, rowA)).toBe(false);
  });

  test('settles a deferred response callback into the shared row cache', async () => {
    let contentCallback;
    const row = {
      id: 9,
      responseContent: null,
      responseContentEncoding: '',
      responseContentText: null,
      responseContentError: null,
      _responseContentPromise: null,
      _reqObj: { getContent: jest.fn((callback) => { contentCallback = callback; }) },
    };

    const pending = np.cacheResponseContent(row);
    expect(row.responseContent).toBeNull();
    contentCallback('eyJsYXRlIjp0cnVlfQ==', 'base64');
    await expect(pending).resolves.toBe(row);
    expect(row.responseContent).toBe('eyJsYXRlIjp0cnVlfQ==');
    expect(row.responseContentEncoding).toBe('base64');
    expect(row.responseContentText).toBe('{"late":true}');
  });
});

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('delays function execution', () => {
    const fn = jest.fn();
    const debounced = np.debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('resets timer on subsequent calls', () => {
    const fn = jest.fn();
    const debounced = np.debounce(fn, 100);
    debounced();
    jest.advanceTimersByTime(50);
    debounced();
    jest.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
describe('getNextTabIndex', () => {
  test('moves and wraps between tabs', () => {
    expect(np.getNextTabIndex(0, 5, 'ArrowRight')).toBe(1);
    expect(np.getNextTabIndex(4, 5, 'ArrowRight')).toBe(0);
    expect(np.getNextTabIndex(0, 5, 'ArrowLeft')).toBe(4);
  });

  test('supports Home and End keys', () => {
    expect(np.getNextTabIndex(3, 5, 'Home')).toBe(0);
    expect(np.getNextTabIndex(1, 5, 'End')).toBe(4);
  });

  test('handles empty and unsupported navigation', () => {
    expect(np.getNextTabIndex(0, 0, 'ArrowRight')).toBe(-1);
    expect(np.getNextTabIndex(2, 5, 'Enter')).toBe(2);
  });
});


describe('getRowFilterValue [U3]', () => {
  test('returns initiator text for initiator column', () => {
    const row = { initiator: { text: 'app.js:42', url: 'https://example.com/app.js' } };
    expect(np.getRowFilterValue(row, 'initiator')).toBe('app.js:42');
  });

  test('returns empty string for null initiator', () => {
    const row = { initiator: null };
    expect(np.getRowFilterValue(row, 'initiator')).toBe('');
  });

  test('returns raw value for non-initiator columns', () => {
    const row = { method: 'GET', status: 200 };
    expect(np.getRowFilterValue(row, 'method')).toBe('GET');
    expect(np.getRowFilterValue(row, 'status')).toBe(200);
  });

  test('uses clientStartFilter for clientStart column', () => {
    const row = {
      clientStart: '18:00:00.000',
      clientStartFilter: '18:00',
    };
    expect(np.getRowFilterValue(row, 'clientStart')).toBe('18:00');
  });

  test('uses serverDoneFilter for serverDone column', () => {
    const row = {
      serverDone: '18:00:05.123',
      serverDoneFilter: '18:00',
    };
    expect(np.getRowFilterValue(row, 'serverDone')).toBe('18:00');
  });

  test('returns empty string for null values', () => {
    const row = { domain: null };
    expect(np.getRowFilterValue(row, 'domain')).toBe('');
  });
});

describe('evaluateFilterRule', () => {
  test('supports contains and notcontains', () => {
    expect(np.evaluateFilterRule('hello world', { op: 'contains', value: 'world' }, false)).toBe(true);
    expect(np.evaluateFilterRule('hello world', { op: 'notcontains', value: 'world' }, false)).toBe(false);
  });

  test('supports equals and notequals', () => {
    expect(np.evaluateFilterRule('GET', { op: 'equals', value: 'get' }, false)).toBe(true);
    expect(np.evaluateFilterRule('GET', { op: 'notequals', value: 'POST' }, false)).toBe(true);
  });

  test('supports startsWith / endsWith', () => {
    expect(np.evaluateFilterRule('https://example.com/api', { op: 'startswith', value: 'https://' }, false)).toBe(true);
    expect(np.evaluateFilterRule('https://example.com/api', { op: 'endswith', value: '/api' }, false)).toBe(true);
  });

  test('supports regex and invalid regex handling', () => {
    expect(np.evaluateFilterRule('microsoft.7389c30.js:188', { op: 'regex', value: 'microsoft\\..*js' }, false)).toBe(true);
    expect(np.evaluateFilterRule('abc', { op: 'regex', value: '[abc' }, false)).toBe(false);
  });

  test('supports numeric operators', () => {
    expect(np.evaluateFilterRule(204, { op: 'equals', value: '204' }, true)).toBe(true);
    expect(np.evaluateFilterRule(204, { op: 'gt', value: '200' }, true)).toBe(true);
    expect(np.evaluateFilterRule(204, { op: 'lt', value: '300' }, true)).toBe(true);
    expect(np.evaluateFilterRule(204, { op: 'lte', value: '203' }, true)).toBe(false);
  });

  test('supports empty / notempty', () => {
    expect(np.evaluateFilterRule('', { op: 'empty', value: '' }, false)).toBe(true);
    expect(np.evaluateFilterRule('x', { op: 'notempty', value: '' }, false)).toBe(true);
  });

  test('supports methodSet mode for multiple allowed methods', () => {
    const rule = {
      mode: 'methodSet',
      include: {
        GET: true,
        POST: true,
        PUT: false,
        DELETE: false,
        PATCH: false,
        HEAD: false,
        OPTIONS: false,
      },
    };
    expect(np.evaluateFilterRule('GET', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('post', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('PUT', rule, false)).toBe(false);
  });

  test('supports statusSet mode for status code filtering', () => {
    const rule = {
      mode: 'statusSet',
      include: { '200': true, '201': true, '404': false, '500': false },
    };
    expect(np.evaluateFilterRule('200', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('404', rule, false)).toBe(false);
    expect(np.evaluateFilterRule('302', rule, false)).toBe(true); // not in include = show
  });

  test('supports urlAdvanced include and exclude conditions', () => {
    const rule = {
      mode: 'urlAdvanced',
      includeAny: 'ZZZZZZZZ',
      includeAll: '',
      excludeAny: 'XXXXXXXX,YYYYYYYYYYYY',
      caseSensitive: false,
    };
    expect(np.evaluateFilterRule('https://contoso/api/ZZZZZZZZ/orders', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('https://contoso/api/orders', rule, false)).toBe(false);
    expect(np.evaluateFilterRule('https://contoso/api/ZZZZZZZZ/XXXXXXXX', rule, false)).toBe(false);
  });

  test('supports urlAdvanced includeAll with case-sensitive option', () => {
    const rule = {
      mode: 'urlAdvanced',
      includeAny: '',
      includeAll: 'TenantA,Orders',
      excludeAny: '',
      caseSensitive: true,
    };
    expect(np.evaluateFilterRule('https://contoso/TenantA/Orders', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('https://contoso/tenanta/orders', rule, false)).toBe(false);
  });

  test('supports timeRange mode with visual time input values', () => {
    const rule = {
      mode: 'timeRange',
      start: '09:00',
      end: '17:30',
    };
    expect(np.evaluateFilterRule('09:15', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('18:00', rule, false)).toBe(false);
  });

  test('supports timeRange mode across midnight', () => {
    const rule = {
      mode: 'timeRange',
      start: '22:00',
      end: '02:00',
    };
    expect(np.evaluateFilterRule('23:45', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('01:30', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('12:00', rule, false)).toBe(false);
  });

  test('supports multiText mode with multiple AND conditions', () => {
    const rule = {
      mode: 'multiText',
      conditions: [
        { op: 'contains', value: 'contoso' },
        { op: 'contains', value: 'api' },
      ],
    };
    expect(np.evaluateFilterRule('api.contoso.com', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('www.contoso.com', rule, false)).toBe(false);
  });

  test('supports multiText mode with notcontains conditions', () => {
    const rule = {
      mode: 'multiText',
      conditions: [
        { op: 'contains', value: '/orders' },
        { op: 'notcontains', value: '/internal' },
      ],
    };
    expect(np.evaluateFilterRule('/api/orders/123', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('/api/internal/orders/123', rule, false)).toBe(false);
  });
});

describe('DEFAULT_METHOD_FILTERS', () => {
  test('returns a fresh object with all methods true', () => {
    const filters = np.DEFAULT_METHOD_FILTERS();
    expect(filters).toEqual({
      GET: true,
      POST: true,
      PUT: true,
      DELETE: true,
      PATCH: true,
      HEAD: true,
      OPTIONS: true,
    });
    // Ensure it returns a new object each time
    const filters2 = np.DEFAULT_METHOD_FILTERS();
    expect(filters).not.toBe(filters2);
  });
});

describe('deepSearchMatch', () => {
  const allScope = { reqBody: true, resBody: true, reqHeaders: true, resHeaders: true };
  const noScope = { reqBody: false, resBody: false, reqHeaders: false, resHeaders: false };

  const makeRow = (overrides) => ({
    requestPostData: null,
    responseContent: null,
    requestHeaders: [],
    responseHeaders: [],
    ...overrides,
  });

  test('returns false for empty query', () => {
    const row = makeRow({ responseContent: 'hello world' });
    expect(np.deepSearchMatch(row, '', allScope)).toBe(false);
  });

  test('matches request body (postData.text)', () => {
    const row = makeRow({ requestPostData: { text: '{"username":"admin"}' } });
    expect(np.deepSearchMatch(row, 'admin', allScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'password', allScope)).toBe(false);
  });

  test('matches response body', () => {
    const row = makeRow({ responseContent: '{"result":"success","token":"abc123"}' });
    expect(np.deepSearchMatch(row, 'abc123', allScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'failure', allScope)).toBe(false);
  });

  test('matches request headers', () => {
    const row = makeRow({
      requestHeaders: [
        { name: 'Authorization', value: 'Bearer tok_xyz' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    });
    expect(np.deepSearchMatch(row, 'Bearer', allScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'authorization', allScope)).toBe(true); // case-insensitive
    expect(np.deepSearchMatch(row, 'text/html', allScope)).toBe(false);
  });

  test('matches response headers', () => {
    const row = makeRow({
      responseHeaders: [
        { name: 'Set-Cookie', value: 'session=abc; Path=/' },
      ],
    });
    expect(np.deepSearchMatch(row, 'session=abc', allScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'Set-Cookie', allScope)).toBe(true);
  });

  test('respects scope toggles', () => {
    const row = makeRow({
      requestPostData: { text: 'findme' },
      responseContent: 'findme',
      requestHeaders: [{ name: 'X-Find', value: 'findme' }],
      responseHeaders: [{ name: 'X-Find', value: 'findme' }],
    });
    // Only reqBody
    expect(np.deepSearchMatch(row, 'findme', { reqBody: true, resBody: false, reqHeaders: false, resHeaders: false })).toBe(true);
    // Only resBody
    expect(np.deepSearchMatch(row, 'findme', { reqBody: false, resBody: true, reqHeaders: false, resHeaders: false })).toBe(true);
    // Only reqHeaders
    expect(np.deepSearchMatch(row, 'findme', { reqBody: false, resBody: false, reqHeaders: true, resHeaders: false })).toBe(true);
    // Only resHeaders
    expect(np.deepSearchMatch(row, 'findme', { reqBody: false, resBody: false, reqHeaders: false, resHeaders: true })).toBe(true);
    // None
    expect(np.deepSearchMatch(row, 'findme', noScope)).toBe(false);
  });

  test('handles null/empty fields gracefully', () => {
    const row = makeRow({});
    expect(np.deepSearchMatch(row, 'anything', allScope)).toBe(false);
  });

  test('case-insensitive matching', () => {
    const row = makeRow({ responseContent: 'Hello World' });
    expect(np.deepSearchMatch(row, 'HELLO', allScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'hello', allScope)).toBe(true);
  });

  test('matches URL, domain, path, method, status, type fields when url scope enabled', () => {
    const row = makeRow({ url: 'https://api.example.com/users?id=1', domain: 'api.example.com', path: '/users', method: 'POST', status: 201, type: 'xhr' });
    const urlScope = { url: true, reqBody: false, resBody: false, reqHeaders: false, resHeaders: false };
    expect(np.deepSearchMatch(row, 'example.com', urlScope)).toBe(true);
    expect(np.deepSearchMatch(row, '/users', urlScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'POST', urlScope)).toBe(true);
    expect(np.deepSearchMatch(row, '201', urlScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'xhr', urlScope)).toBe(true);
    expect(np.deepSearchMatch(row, 'notfound', urlScope)).toBe(false);
  });

  test('url scope disabled skips URL fields', () => {
    const row = makeRow({ url: 'https://api.example.com/test', domain: 'api.example.com', path: '/test', method: 'GET', status: 200 });
    const noUrlScope = { url: false, reqBody: false, resBody: false, reqHeaders: false, resHeaders: false };
    expect(np.deepSearchMatch(row, 'example.com', noUrlScope)).toBe(false);
  });
});

describe('formatRowSummary', () => {
  test('formats basic row summary', () => {
    const row = {
      id: 42,
      method: 'POST',
      url: 'https://api.example.com/users',
      status: 201,
      statusText: 'Created',
      type: 'application/json',
      duration: 150,
      size: 2048,
      clientStart: '14:30:05.123',
      serverDone: '14:30:05.273',
      domain: 'api.example.com',
      initiator: { text: 'JS: app.js:42' },
    };
    const text = np.formatRowSummary(row);
    expect(text).toContain('[42] POST https://api.example.com/users');
    expect(text).toContain('Status: 201 Created');
    expect(text).toContain('Type: application/json');
    expect(text).toContain('Duration: 150 ms');
    expect(text).toContain('Size: 2.0 KB');
    expect(text).toContain('Time: 14:30:05.123 - 14:30:05.273');
    expect(text).toContain('Domain: api.example.com');
    expect(text).toContain('Initiator: JS: app.js:42');
  });

  test('handles missing optional fields', () => {
    const row = {
      id: 1,
      method: 'GET',
      url: 'https://example.com/',
      status: 200,
      statusText: '',
      type: '',
      duration: 0,
      size: 0,
      clientStart: '',
      serverDone: '',
      domain: '',
      initiator: null,
    };
    const text = np.formatRowSummary(row);
    expect(text).toContain('[1] GET https://example.com/');
    expect(text).toContain('Status: 200');
    expect(text).toContain('Type: (none)');
    expect(text).not.toContain('Domain:');
    expect(text).not.toContain('Initiator:');
  });
});


describe('scale trust helpers', () => {
  const eligible = (sort, activeFilterCount = 0, keywords = [], renderedActiveFilterCount = activeFilterCount) =>
    np.isIncrementalAppendEligible(sort, activeFilterCount, keywords, renderedActiveFilterCount);

  test('allows natural order with no sort or ID ascending', () => {
    expect(eligible(null)).toBe(true);
    expect(eligible({ colId: null, direction: null })).toBe(true);
    expect(eligible({ colId: 'id', direction: 'asc' })).toBe(true);
  });

  test('rejects ID descending and other active sorts', () => {
    expect(eligible({ colId: 'id', direction: 'desc' })).toBe(false);
    expect(eligible({ colId: 'status', direction: 'asc' })).toBe(false);
  });

  test('rejects active column filters', () => {
    expect(eligible({ colId: 'id', direction: 'asc' }, 1)).toBe(false);
  });

  test('rejects a relaxed filter until a full render synchronizes filtered rows', () => {
    expect(eligible({ colId: 'id', direction: 'asc' }, 0, [], 1)).toBe(false);
    expect(eligible({ colId: 'id', direction: 'asc' }, 0, [], 0)).toBe(true);
  });

  test('rejects active search keywords but ignores blank rows', () => {
    expect(eligible(null, 0, [{ query: 'needle' }])).toBe(false);
    expect(eligible(null, 0, [{ query: '   ' }])).toBe(true);
  });

  test('re-evaluates changed state instead of trusting an earlier decision', () => {
    const schedulingState = { sort: null, filters: 0, keywords: [] };
    expect(eligible(schedulingState.sort, schedulingState.filters, schedulingState.keywords)).toBe(true);
    schedulingState.keywords.push({ query: 'changed before flush' });
    expect(eligible(schedulingState.sort, schedulingState.filters, schedulingState.keywords)).toBe(false);
  });

  test('returns only missing rows for one append batch', () => {
    const existingIds = Array.from({ length: 1000 }, (_, index) => index + 1);
    const queuedRows = [{ id: 1000 }, { id: 1001 }, { id: 1002 }, { id: 1002 }];
    const batch = np.getIncrementalAppendBatch(queuedRows, existingIds);
    expect(batch.map((row) => row.id)).toEqual([1001, 1002]);
    expect(batch).toHaveLength(2);
  });

  test('retains only current row identities without accepting stale clones', () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const staleClone = { id: 2 };

    expect(np.retainRowsByIdentity([second, staleClone, first, second], [first, second]))
      .toEqual([second, first, second]);
  });
});

describe('clampPopupPosition', () => {
  test('clamps left and top overflow to the eight-pixel edge', () => {
    expect(np.clampPopupPosition(-20, -30, 120, 80, 500, 400)).toEqual({
      left: 8,
      top: 8,
      maxWidth: 484,
      maxHeight: 384,
    });
  });

  test('clamps right overflow after popup measurement', () => {
    const result = np.clampPopupPosition(470, 40, 120, 80, 500, 400);
    expect(result.left).toBe(372);
    expect(result.top).toBe(40);
  });

  test('clamps bottom overflow after popup measurement', () => {
    const result = np.clampPopupPosition(40, 370, 120, 80, 500, 400);
    expect(result.left).toBe(40);
    expect(result.top).toBe(312);
  });

  test('constrains oversized popups in small viewports', () => {
    expect(np.clampPopupPosition(90, 60, 400, 300, 100, 70)).toEqual({
      left: 8,
      top: 8,
      maxWidth: 84,
      maxHeight: 54,
    });
  });
});

describe('calculateMainSplit', () => {
  test('calculates a valid wide width split', () => {
    expect(np.calculateMainSplit(400, 1000, false)).toEqual({
      axis: 'width',
      primarySize: 400,
      detailsSize: 596,
      primaryPercent: 40,
    });
  });

  test('calculates a valid narrow height split', () => {
    expect(np.calculateMainSplit(200, 500, true)).toEqual({
      axis: 'height',
      primarySize: 200,
      detailsSize: 296,
      primaryPercent: 40,
    });
  });

  test('rejects splits that violate either pane minimum', () => {
    expect(np.calculateMainSplit(100, 1000, false)).toBeNull();
    expect(np.calculateMainSplit(350, 500, true)).toBeNull();
    expect(np.calculateMainSplit(NaN, 500, true)).toBeNull();
  });
});


describe('keyboard trust helpers', () => {
  test('exposes valid aria-sort values', () => {
    expect(np.getAriaSortValue({ colId: 'status', direction: 'asc' }, 'status')).toBe('ascending');
    expect(np.getAriaSortValue({ colId: 'status', direction: 'desc' }, 'status')).toBe('descending');
    expect(np.getAriaSortValue({ colId: 'status', direction: 'asc' }, 'method')).toBe('none');
    expect(np.getAriaSortValue(null, 'status')).toBe('none');
  });

  test('adjusts main split on the orientation-specific arrow keys', () => {
    expect(np.adjustMainSplitByKeyboard(400, 1000, false, 'ArrowRight', false)).toEqual({
      axis: 'width',
      primarySize: 410,
      detailsSize: 586,
      primaryPercent: 41,
    });
    expect(np.adjustMainSplitByKeyboard(200, 500, true, 'ArrowUp', true)).toEqual({
      axis: 'height',
      primarySize: 160,
      detailsSize: 336,
      primaryPercent: 32,
    });
    expect(np.adjustMainSplitByKeyboard(400, 1000, false, 'ArrowDown', false)).toBeNull();
  });

  test('keeps inspector panes above minimum height', () => {
    expect(np.calculateInspectorSplit(200, 500)).toEqual({
      requestSize: 200,
      responseSize: 297,
      requestPercent: 40,
    });
    expect(np.calculateInspectorSplit(70, 500)).toBeNull();
    expect(np.adjustInspectorSplitByKeyboard(200, 500, 'ArrowDown', true)).toEqual({
      requestSize: 240,
      responseSize: 257,
      requestPercent: 48,
    });
    expect(np.adjustInspectorSplitByKeyboard(200, 500, 'ArrowLeft', false)).toBeNull();
  });

  test('clamps and steps column widths', () => {
    expect(np.clampColumnWidth(5)).toBe(20);
    expect(np.clampColumnWidth(5000)).toBe(1200);
    expect(np.clampColumnWidth(NaN)).toBe(120);
    expect(np.adjustColumnWidth(100, 'ArrowLeft', false)).toBe(90);
    expect(np.adjustColumnWidth(100, 'ArrowRight', true)).toBe(140);
    expect(np.adjustColumnWidth(100, 'ArrowUp', false)).toBeNull();
  });

  test('finds adjacent visible columns without selecting hidden columns', () => {
    const columns = [
      { id: 'id', visible: true },
      { id: 'hidden', visible: false },
      { id: 'method', visible: true },
      { id: 'status', visible: true },
    ];
    expect(np.getAdjacentVisibleColumnId(columns, 'method', -1)).toBe('id');
    expect(np.getAdjacentVisibleColumnId(columns, 'method', 1)).toBe('status');
    expect(np.getAdjacentVisibleColumnId(columns, 'id', -1)).toBeNull();
  });

  test('cycles menu focus and supports Home and End', () => {
    expect(np.getNextMenuItemIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(np.getNextMenuItemIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(np.getNextMenuItemIndex(2, 3, 'Home')).toBe(0);
    expect(np.getNextMenuItemIndex(0, 3, 'End')).toBe(2);
    expect(np.getNextMenuItemIndex(0, 0, 'ArrowDown')).toBe(-1);
  });
});

describe('outbound sensitive-data policy', () => {
  const makeSensitiveRow = () => ({
    id: 7,
    method: 'POST',
    url: 'https://alice:login-secret@example.com/api?keep=1&TOKEN=first&token=second#access_token=fragment-secret',
    status: 200,
    statusText: 'OK',
    type: 'application/json',
    protocol: 'HTTP/2',
    size: 32,
    duration: 12,
    clientStart: '10:00:00.000',
    serverDone: '10:00:00.012',
    domain: 'example.com',
    initiator: { text: 'JS: app.js:1' },
    requestHeaders: [
      { name: 'Authorization', value: 'Bearer request-secret' },
      { name: 'proxy-authorization', value: 'Basic proxy-secret' },
      { name: 'X-API-KEY', value: 'api-secret' },
      { name: 'x-CsRf-ToKeN', value: 'csrf-secret' },
      { name: 'Cookie', value: 'sid=cookie-secret' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    responseHeaders: [
      { name: 'Set-Cookie', value: 'sid=response-cookie-secret' },
      { name: 'Content-Type', value: 'application/json' },
    ],
    requestPostData: {
      mimeType: 'application/json',
      text: JSON.stringify({
        username: 'visible',
        password: 'body-secret',
        nested: [{ access_token: 'array-secret' }, { ok: true }],
      }),
    },
    responseContent: JSON.stringify({ result: 'visible', refresh_token: 'response-secret' }),
    responseContentEncoding: '',
    timings: { wait: 10, receive: 2 },
    startedDateTime: '2026-07-25T00:00:00.000Z',
  });

  test('matches case-insensitive secret key variants without matching ordinary names', () => {
    for (const key of [
      'password',
      'PASSWD',
      'access_token',
      'id-token',
      'refreshToken',
      'api key',
      'X-Api-Key',
      'client_secret',
      'signature',
      'auth',
      'authorization',
      'code',
      'X-CSRF-Token',
    ]) {
      expect(np.isSensitiveKey(key)).toBe(true);
    }
    expect(np.isSensitiveKey('content-type')).toBe(false);
    expect(np.isSensitiveKey('status-code')).toBe(false);
  });

  test('redacts sensitive headers and every HAR cookie without mutating inputs', () => {
    const headers = [
      { name: 'AUTHORIZATION', value: 'secret', extra: 'kept' },
      { name: 'Set-Cookie', value: 'sid=secret' },
      { name: 'Accept', value: 'application/json' },
    ];
    const cookies = [{ name: 'ordinaryName', value: 'cookie-secret', path: '/' }];
    const headerSnapshot = JSON.parse(JSON.stringify(headers));
    const cookieSnapshot = JSON.parse(JSON.stringify(cookies));
    const sanitizedHeaders = np.sanitizeHeaders(headers);
    const sanitizedCookies = np.sanitizeCookies(cookies);

    expect(sanitizedHeaders.value).toEqual([
      { name: 'AUTHORIZATION', value: np.REDACTION_MARKER },
      { name: 'Set-Cookie', value: np.REDACTION_MARKER },
      { name: 'Accept', value: 'application/json' },
    ]);
    expect(sanitizedCookies.value[0]).toEqual({
      name: 'ordinaryName',
      value: np.REDACTION_MARKER,
      path: '/',
    });
    expect(sanitizedHeaders.summary.redactedHeaders).toBe(2);
    expect(sanitizedCookies.summary.redactedCookies).toBe(1);
    expect(headers).toEqual(headerSnapshot);
    expect(cookies).toEqual(cookieSnapshot);
  });

  test('sanitizes URL userinfo, duplicate queries, and fragments while preserving shape', () => {
    const result = np.sanitizeUrl(
      'https://alice:password@example.com/path?keep=one&TOKEN=first&token=second#access_token=fragment',
    );
    const url = new URL(result.value);
    expect(result.value).not.toContain('alice');
    expect(result.value).not.toContain('password');
    expect(url.searchParams.get('keep')).toBe(np.REDACTION_MARKER);
    expect(url.searchParams.getAll('TOKEN').concat(url.searchParams.getAll('token'))).toEqual([
      np.REDACTION_MARKER,
      np.REDACTION_MARKER,
    ]);
    expect(new URLSearchParams(url.hash.substring(1)).get('access_token')).toBe(np.REDACTION_MARKER);
    expect(result.summary.redactedQueryValues).toBe(4);
    expect(result.summary.redactedUrlUsernames).toBe(1);
    expect(result.summary.redactedUrlPasswords).toBe(1);
    expect(result.summary.sanitizedUrls).toBe(1);

    const opaqueFragment = np.sanitizeUrl('https://example.com/#opaque-secret');
    expect(opaqueFragment.value).not.toContain('opaque-secret');
    expect(np.sanitizeUrl('not a URL').value).toBe(np.OMISSION_MARKER);
  });

  test('recursively redacts bounded JSON objects and arrays without mutating parsed values', () => {
    const source = {
      account: { password: 'secret', profile: { displayName: 'kept' } },
      values: [{ access_token: 'token' }, { ordinary: 2 }],
    };
    const snapshot = JSON.parse(JSON.stringify(source));
    const result = np.sanitizeBody(JSON.stringify(source), 'application/json', '');
    const parsed = JSON.parse(result.text);

    expect(parsed.account.password).toBe(np.REDACTION_MARKER);
    expect(parsed.account.profile.displayName).toBe(np.REDACTION_MARKER);
    expect(parsed.values[0].access_token).toBe(np.REDACTION_MARKER);
    expect(parsed.values[1].ordinary).toBe(2);
    expect(result.summary.redactedBodyValues).toBe(3);
    expect(result.omitted).toBe(false);
    expect(source).toEqual(snapshot);
  });

  test('redacts duplicate form fields and omits invalid form input', () => {
    const result = np.sanitizeBody(
      'keep=one&TOKEN=first&token=second&password=third',
      'application/x-www-form-urlencoded; charset=UTF-8',
      '',
    );
    const params = new URLSearchParams(result.text);
    expect(params.get('keep')).toBe(np.REDACTION_MARKER);
    expect(params.getAll('TOKEN').concat(params.getAll('token'))).toEqual([
      np.REDACTION_MARKER,
      np.REDACTION_MARKER,
    ]);
    expect(params.get('password')).toBe(np.REDACTION_MARKER);
    expect(result.summary.redactedBodyValues).toBe(4);

    const invalid = np.sanitizeBody('token=%GG', 'application/x-www-form-urlencoded', '');
    expect(invalid).toEqual(expect.objectContaining({
      text: np.OMISSION_MARKER,
      omitted: true,
      reason: expect.stringContaining('invalid percent'),
    }));
    expect(invalid.summary.failures).toBe(1);
  });

  test('omits invalid, opaque, multipart, base64, deep, large, and high-node bodies', () => {
    const cases = [
      np.sanitizeBody('{invalid', 'application/json', ''),
      np.sanitizeBody('plain secret', 'text/plain', ''),
      np.sanitizeBody('--boundary', 'multipart/form-data; boundary=x', ''),
      np.sanitizeBody('AAEC', 'application/octet-stream', 'base64'),
      np.sanitizeBody('{"a":{"b":{"c":1}}}', 'application/json', '', { maxDepth: 1 }),
      np.sanitizeBody('12345', 'application/json', '', { maxBytes: 4 }),
      np.sanitizeBody('[1,2,3]', 'application/json', '', { maxNodes: 2 }),
    ];
    for (const result of cases) {
      expect(result.text).toBe(np.OMISSION_MARKER);
      expect(result.omitted).toBe(true);
      expect(result.summary.omittedBodies).toBe(1);
    }
    expect(cases[3].reason).toContain('Base64');
    expect(cases[5].reason).toContain('byte limit');
  });

  test('omits huge ASCII before UTF-8 allocation and keeps exact multibyte limits', () => {
    const encodeSpy = jest.spyOn(TextEncoder.prototype, 'encode');
    try {
      encodeSpy.mockClear();
      const huge = np.sanitizeBody('a'.repeat(1024), 'application/json', '', { maxBytes: 32 });
      expect(huge.omitted).toBe(true);
      expect(huge.reason).toContain('byte limit');
      expect(encodeSpy).not.toHaveBeenCalled();

      const multibyte = np.sanitizeBody('"éé"', 'application/json', '', { maxBytes: 5 });
      expect(multibyte.omitted).toBe(true);
      expect(multibyte.reason).toContain('byte limit');
      expect(encodeSpy).toHaveBeenCalledTimes(1);
    } finally {
      encodeSpy.mockRestore();
    }
  });

  test('sanitizes post data and response content immutably with explicit omission metadata', () => {
    const postData = { mimeType: 'application/json', text: '{"client_secret":"secret"}' };
    const content = { size: 4, mimeType: 'application/octet-stream', text: 'AAEC', encoding: 'base64' };
    const postSnapshot = JSON.parse(JSON.stringify(postData));
    const contentSnapshot = JSON.parse(JSON.stringify(content));

    const postResult = np.sanitizeRequestPostData(postData, []);
    const contentResult = np.sanitizeResponseContent(content, []);
    expect(JSON.parse(postResult.value.text).client_secret).toBe(np.REDACTION_MARKER);
    expect(contentResult.value.text).toBeUndefined();
    expect(contentResult.value.encoding).toBeUndefined();
    expect(contentResult.value._networkPlus).toEqual(expect.objectContaining({ status: 'omitted' }));
    expect(postData).toEqual(postSnapshot);
    expect(content).toEqual(contentSnapshot);
  });

  test('returns an outbound row with no captured request object or unknown raw properties', () => {
    const row = makeSensitiveRow();
    row._reqObj = { request: { headers: [{ name: 'Authorization', value: 'nested-secret' }] } };
    row.unknownMetadata = { password: 'metadata-secret' };
    const result = np.sanitizeRowForOutbound(row, row.responseContent);
    const serialized = JSON.stringify(result.value);
    expect(result.value._reqObj).toBeUndefined();
    expect(result.value.unknownMetadata).toBeUndefined();
    expect(serialized).not.toContain('nested-secret');
    expect(serialized).not.toContain('metadata-secret');
    expect(row._reqObj.request.headers[0].value).toBe('nested-secret');
  });

  test('keeps cURL, fetch, and PowerShell syntax valid after default sanitization', () => {
    const row = makeSensitiveRow();
    const curl = np.buildClipboardPayload('curl', row).text;
    const fetch = np.buildClipboardPayload('fetch', row).text;
    const powershell = np.buildClipboardPayload('powershell', row).text;
    const combined = curl + fetch + powershell;

    expect(curl).toMatch(/^curl --request 'POST' 'https:\/\//);
    expect(curl).toContain("--header 'Authorization: [REDACTED]'");
    expect(() => new Function(fetch)).not.toThrow();
    expect(fetch).toMatch(/^fetch\("https:\/\//);
    expect(powershell).toMatch(/^Invoke-WebRequest -Uri 'https:\/\//);
    expect(powershell).toContain("'Authorization' = '[REDACTED]'");
    for (const secret of [
      'login-secret',
      'request-secret',
      'proxy-secret',
      'api-secret',
      'csrf-secret',
      'cookie-secret',
      'body-secret',
      'array-secret',
      'fragment-secret',
    ]) {
      expect(combined).not.toContain(secret);
    }
  });

  test('blocks full clipboard builders until explicit per-action confirmation', () => {
    const safeBuilder = jest.fn(() => 'safe');
    const fullBuilder = jest.fn(() => 'full');
    expect(np.createOutboundPayload({}, safeBuilder, fullBuilder)).toBe('safe');
    expect(fullBuilder).not.toHaveBeenCalled();
    expect(() => np.createOutboundPayload({ mode: 'full' }, safeBuilder, fullBuilder)).toThrow(
      'per-action confirmation',
    );
    expect(fullBuilder).not.toHaveBeenCalled();
    expect(np.createOutboundPayload({ mode: 'full', confirmed: true }, safeBuilder, fullBuilder)).toBe('full');
    expect(fullBuilder).toHaveBeenCalledTimes(1);
  });

  test('defaults clipboard payloads to sanitized and exposes full values only after confirmation', () => {
    const row = makeSensitiveRow();
    const sanitized = np.buildClipboardPayload('rawRequest', row);
    expect(sanitized.mode).toBe('sanitized');
    expect(sanitized.text).toContain(np.REDACTION_MARKER);
    expect(sanitized.text).not.toContain('request-secret');
    expect(() => np.buildClipboardPayload('rawRequest', row, { mode: 'full' })).toThrow();
    const full = np.buildClipboardPayload('rawRequest', row, { mode: 'full', confirmed: true });
    expect(full.mode).toBe('full');
    expect(full.text).toContain('request-secret');
  });

  test('sanitizes complete HAR structures with counts and incomplete-body metadata', () => {
    const row = makeSensitiveRow();
    const fullHar = np.buildHarLogFromRows(
      [row],
      new Map([[row, np.buildHarResponseContent(row)]]),
    );
    fullHar.log.entries[0].request.cookies = [{ name: 'sid', value: 'har-cookie-secret' }];
    fullHar.log.entries[0].response.cookies = [{ name: 'sid', value: 'har-response-secret' }];
    fullHar.log.entries[0]._networkPlus = {
      sourceUrl: 'https://example.com/?access_token=metadata-secret',
      client_secret: 'metadata-client-secret',
      note: 'arbitrary metadata secret',
    };
    const snapshot = JSON.parse(JSON.stringify(fullHar));
    const sanitized = np.sanitizeHar(fullHar);
    const serialized = JSON.stringify(sanitized);
    const metadata = sanitized.log._networkPlus;

    expect(serialized).not.toContain('request-secret');
    expect(serialized).not.toContain('har-cookie-secret');
    expect(serialized).not.toContain('metadata-secret');
    expect(serialized).not.toContain('metadata-client-secret');
    expect(serialized).not.toContain('arbitrary metadata secret');
    expect(sanitized.log.entries[0].request.cookies[0].value).toBe(np.REDACTION_MARKER);
    expect(sanitized.log.entries[0].response.cookies[0].value).toBe(np.REDACTION_MARKER);
    expect(metadata).toEqual(expect.objectContaining({
      sanitized: true,
      policyVersion: 1,
      failedClosed: false,
      redactionMarker: np.REDACTION_MARKER,
      omissionMarker: np.OMISSION_MARKER,
      counts: expect.objectContaining({
        redactedValues: expect.any(Number),
        redactedHeaders: expect.any(Number),
        redactedCookies: 2,
        redactedBodyValues: expect.any(Number),
        redactedMetadataValues: expect.any(Number),
      }),
      bodyCompleteness: expect.stringContaining('not complete'),
    }));
    expect(metadata.counts.redactedValues).toBeGreaterThan(10);
    expect(fullHar).toEqual(snapshot);
  });

  test('omits base64 and invalid HAR bodies but leaves full HAR behavior unchanged', () => {
    const row = makeSensitiveRow();
    const fullHar = np.buildHarLogFromRows([row], new Map([
      [row, { size: 3, mimeType: 'application/octet-stream', text: 'AAEC', encoding: 'base64' }],
    ]));
    const sanitized = np.sanitizeHar(fullHar);
    const content = sanitized.log.entries[0].response.content;
    expect(fullHar.log.entries[0].response.content).toEqual({
      size: 3,
      mimeType: 'application/octet-stream',
      text: 'AAEC',
      encoding: 'base64',
    });
    expect(content.text).toBeUndefined();
    expect(content.encoding).toBeUndefined();
    expect(content._networkPlus).toEqual(expect.objectContaining({ status: 'omitted' }));
    expect(sanitized.log._networkPlus.counts.omittedBodies).toBeGreaterThan(0);

    const invalidHar = JSON.parse(JSON.stringify(fullHar));
    invalidHar.log.entries[0].response.content = {
      size: 8,
      mimeType: 'application/json',
      text: '{invalid',
    };
    expect(np.sanitizeHar(invalidHar).log.entries[0].response.content._networkPlus.status).toBe('omitted');
  });

  test('fails closed to an empty explicit HAR instead of returning source data', () => {
    for (const invalid of [null, {}, { log: { entries: null } }]) {
      const result = np.sanitizeHar(invalid);
      expect(result.log.entries).toEqual([]);
      expect(result.log._networkPlus).toEqual(expect.objectContaining({
        sanitized: true,
        failedClosed: true,
        counts: expect.objectContaining({ failures: 1 }),
      }));
    }
  });

  test('covers conservative secret, credential, assertion, session, and PII key variants', () => {
    for (const key of [
      'x-amz-security-token',
      'x-amz-credential',
      'private-token',
      'x-secret',
      'x-forwarded-authorization',
      'sig',
      'key',
      'jwt',
      'saml-response',
      'assertion',
      'password-confirmation',
      'service-token',
      'database-secret',
      'cloud-credential',
      'forwarded-authorization',
      'ticket',
      'nonce',
      'state',
      'session',
      'sid',
      'email-address',
      'phone_number',
      'mobile',
      'street-address',
      'social-security-number',
      'tax-id',
      'national_id',
      'date-of-birth',
      'full-name',
      'user-name',
      'place-of-birth',
      'employee-ssn',
      'oauth-state',
      'user-sid',
    ]) {
      expect(np.isSensitiveKey(key)).toBe(true);
    }
  });

  test('redacts non-allowlisted headers and sanitizes simple URL-bearing headers', () => {
    const headers = [
      { name: 'Referer', value: 'https://example.com/source?access_token=secret&unknown=pii' },
      { name: 'Location', value: '/callback?code=secret&sig=unknown' },
      { name: 'Content-Location', value: 'https://example.com/item?sv=1&sp=read&se=tomorrow' },
      { name: 'X-Original-URL', value: '/private?account=person' },
      { name: 'X-Rewrite-URL', value: 'not a valid URL' },
      { name: 'X-Amz-Security-Token', value: 'aws-secret' },
      { name: 'X-Amz-Credential', value: 'aws-credential-secret' },
      { name: 'X-Forwarded-Authorization', value: 'forwarded-secret' },
      { name: 'private-token', value: 'private-secret' },
      { name: 'x-secret', value: 'custom-secret' },
      { name: 'traceparent', value: 'trace-secret' },
      { name: 'x-request-id', value: 'request-secret' },
      { name: 'x-client-cert', value: 'certificate-secret' },
      { name: 'Link', value: '<https://example.com/?token=secret>; rel=next' },
      { name: 'Refresh', value: '0; url=https://example.com/?code=secret' },
      { name: 'Content-Type', value: 'application/json' },
    ];
    const snapshot = JSON.parse(JSON.stringify(headers));
    const result = np.sanitizeHeaders(headers);
    const byName = Object.fromEntries(result.value.map((header) => [header.name, header.value]));

    expect(new URL(byName.Referer).searchParams.get('unknown')).toBe(np.REDACTION_MARKER);
    expect(new URL(byName.Referer).searchParams.get('access_token')).toBe(np.REDACTION_MARKER);
    expect(new URL(byName.Location, 'https://example.com').searchParams.get('code')).toBe(np.REDACTION_MARKER);
    expect(new URL(byName['Content-Location']).searchParams.get('sv')).toBe(np.REDACTION_MARKER);
    expect(new URL(byName['X-Original-URL'], 'https://example.com').searchParams.get('account')).toBe(
      np.REDACTION_MARKER,
    );
    for (const name of [
      'X-Rewrite-URL',
      'X-Amz-Security-Token',
      'X-Amz-Credential',
      'X-Forwarded-Authorization',
      'private-token',
      'x-secret',
      'traceparent',
      'x-request-id',
      'x-client-cert',
      'Link',
      'Refresh',
    ]) {
      expect(byName[name]).toBe(np.REDACTION_MARKER);
    }
    expect(byName['Content-Type']).toBe('application/json');
    const serialized = JSON.stringify(result.value);
    for (const secret of [
      'aws-secret',
      'aws-credential-secret',
      'forwarded-secret',
      'private-secret',
      'custom-secret',
      'trace-secret',
      'request-secret',
      'certificate-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(headers).toEqual(snapshot);
  });

  test('redacts every URL query and form-like fragment value while preserving route shape', () => {
    const result = np.sanitizeUrl(
      'https://example.com/callback?sv=1&sp=read&se=tomorrow&unknown=person&unknown=duplicate#/oauth/callback?code=value&state=state-value',
    );
    const parsed = new URL(result.value);
    expect(parsed.pathname).toBe('/callback');
    expect(Array.from(parsed.searchParams.keys())).toEqual(['sv', 'sp', 'se', 'unknown', 'unknown']);
    expect(Array.from(parsed.searchParams.values())).toEqual(Array(5).fill(np.REDACTION_MARKER));
    expect(parsed.hash.startsWith('#/oauth/callback?')).toBe(true);
    expect(Array.from(new URLSearchParams(parsed.hash.split('?')[1]).values())).toEqual(
      Array(2).fill(np.REDACTION_MARKER),
    );
    expect(result.summary.redactedQueryValues).toBe(7);
    expect(new URL(np.sanitizeUrl('https://example.com/#/safe/route').value).hash).toBe('#/safe/route');
    expect(new URL(np.sanitizeUrl('https://example.com/#value%GG').value).hash).toContain(np.REDACTION_MARKER);
  });

  test('redacts nested secret and PII body fields defensively', () => {
    const body = {
      profile: {
        email: 'person@example.com',
        phone_number: '555-0100',
        address: 'private address',
        fullName: 'Private Person',
        passwordConfirmation: 'password-copy',
      },
      items: [
        { jwt: 'jwt-secret' },
        { saml_response: 'saml-secret' },
        { assertion: 'assertion-secret' },
        { sig: 'signature-secret' },
        { key: 'key-secret' },
      ],
      flow: { nonce: 'nonce-secret', state: 'state-secret', session: 'session-secret', sid: 'sid-secret' },
      visible: 'kept',
    };
    const snapshot = JSON.parse(JSON.stringify(body));
    const sanitized = JSON.parse(np.sanitizeBody(JSON.stringify(body), 'application/json', '').text);
    expect(sanitized.profile).toEqual({
      email: np.REDACTION_MARKER,
      phone_number: np.REDACTION_MARKER,
      address: np.REDACTION_MARKER,
      fullName: np.REDACTION_MARKER,
      passwordConfirmation: np.REDACTION_MARKER,
    });
    expect(sanitized.items.every((item) => Object.values(item)[0] === np.REDACTION_MARKER)).toBe(true);
    expect(Object.values(sanitized.flow).every((value) => value === np.REDACTION_MARKER)).toBe(true);
    expect(sanitized.visible).toBe('kept');
    expect(body).toEqual(snapshot);
  });

  test('sanitizes only the surfaces required by each clipboard action', () => {
    const row = makeSensitiveRow();
    const summarySanitizers = {
      sanitizeUrl: jest.fn(np.sanitizeUrl),
      sanitizeHeaders: jest.fn(() => {
        throw new Error('headers-must-not-run');
      }),
      sanitizeRequestPostData: jest.fn(() => {
        throw new Error('request-body-must-not-run');
      }),
      sanitizeBody: jest.fn(() => {
        throw new Error('response-body-must-not-run');
      }),
    };
    expect(() => np.buildClipboardPayload('summary', row, { sanitizers: summarySanitizers })).not.toThrow();
    expect(() => np.buildClipboardPayload('url', row, { sanitizers: summarySanitizers })).not.toThrow();
    expect(summarySanitizers.sanitizeUrl).toHaveBeenCalledTimes(2);
    expect(summarySanitizers.sanitizeHeaders).not.toHaveBeenCalled();
    expect(summarySanitizers.sanitizeRequestPostData).not.toHaveBeenCalled();
    expect(summarySanitizers.sanitizeBody).not.toHaveBeenCalled();

    const requestSanitizers = {
      sanitizeUrl: jest.fn(np.sanitizeUrl),
      sanitizeHeaders: jest.fn(np.sanitizeHeaders),
      sanitizeRequestPostData: jest.fn(np.sanitizeRequestPostData),
      sanitizeBody: jest.fn(() => {
        throw new Error('response-body-must-not-run');
      }),
    };
    expect(() => np.buildClipboardPayload('rawRequest', row, { sanitizers: requestSanitizers })).not.toThrow();
    expect(requestSanitizers.sanitizeRequestPostData).toHaveBeenCalledTimes(1);
    expect(requestSanitizers.sanitizeBody).not.toHaveBeenCalled();

    const responseSanitizers = {
      sanitizeUrl: jest.fn(() => {
        throw new Error('url-must-not-run');
      }),
      sanitizeHeaders: jest.fn(np.sanitizeHeaders),
      sanitizeRequestPostData: jest.fn(() => {
        throw new Error('request-body-must-not-run');
      }),
      sanitizeBody: jest.fn(np.sanitizeBody),
    };
    expect(() =>
      np.buildClipboardPayload('rawResponse', row, {
        responseBody: row.responseContent,
        sanitizers: responseSanitizers,
      }),
    ).not.toThrow();
    expect(responseSanitizers.sanitizeUrl).not.toHaveBeenCalled();
    expect(responseSanitizers.sanitizeRequestPostData).not.toHaveBeenCalled();
    expect(responseSanitizers.sanitizeBody).toHaveBeenCalledTimes(1);
  });

  test('fails a multi-row clipboard build closed before any partial payload can escape', () => {
    const builder = jest.fn((action, row) => {
      if (row.id === 2) throw new Error('secret-bearing sanitizer detail');
      return { text: 'safe-' + action + '-' + row.id };
    });
    expect(np.buildMultiRowClipboardPayload([{ id: 1 }, { id: 2 }, { id: 3 }], 'summary', {}, builder)).toEqual({
      ok: false,
      text: '',
    });
    expect(builder).toHaveBeenCalledTimes(2);
    expect(np.buildMultiRowClipboardPayload([{ id: 1 }, { id: 3 }], 'summary', {}, builder)).toEqual({
      ok: true,
      text: 'safe-summary-1\n\n---\n\nsafe-summary-3',
    });
  });

  test('consumes each full-output confirmation action at most once', () => {
    const callback = jest.fn(() => 'completed');
    const action = np.createOneTimeConfirmationAction(callback);
    expect(action()).toBe('completed');
    expect(action()).toBeUndefined();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(np.isFullOutputAuthorized({ mode: 'full', confirmed: true })).toBe(true);
    expect(np.isFullOutputAuthorized({ mode: 'full' })).toBe(false);
  });

  test('defers successful download cleanup and revokes the object URL exactly once', () => {
    const anchor = { href: '', download: '', click: jest.fn() };
    const revoke = jest.fn();
    const scheduled = [];
    np.triggerObjectUrlDownload('blob:success', 'network-plus-sanitized.har', {
      createAnchor: () => anchor,
      revoke,
      schedule: (callback, delay) => scheduled.push({ callback, delay }),
    });

    expect(anchor).toEqual(expect.objectContaining({
      href: 'blob:success',
      download: 'network-plus-sanitized.har',
    }));
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(1000);
    scheduled[0].callback();
    scheduled[0].callback();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:success');
  });

  test('revokes immediately and only once when the download click fails', () => {
    const revoke = jest.fn();
    const schedule = jest.fn();
    expect(() => np.triggerObjectUrlDownload('blob:failure', 'network-plus-sanitized.har', {
      createAnchor: () => ({
        click: () => { throw new Error('click-failed'); },
      }),
      revoke,
      schedule,
    })).toThrow('click-failed');
    expect(schedule).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:failure');
  });

  test('reads HAR creator versions from the extension runtime with a Node-test fallback', () => {
    expect(np.getExtensionVersion({ getManifest: () => ({ version: '9.8.7' }) })).toBe('9.8.7');
    expect(np.getExtensionVersion({ getManifest: () => { throw new Error('runtime-failed'); } })).toBe('1.5.0');
    expect(np.getExtensionVersion(null)).toBe('1.5.0');
  });

  test('uses the current extension version for full and sanitized HAR creators', () => {
    const row = makeSensitiveRow();
    const fullHar = np.buildHarLogFromRows([row], new Map([[row, np.buildHarResponseContent(row)]]));
    expect(fullHar.log.creator.version).toBe('1.5.0');
    expect(np.sanitizeHar(fullHar).log.creator.version).toBe('1.5.0');
  });
});
