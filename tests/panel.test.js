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

describe('guided local sample capture', () => {
  const baseTimestamp = Date.parse('2026-01-15T12:00:00.000Z');

  test('generates exactly three deterministic HAR-shaped requests from an injected timestamp', () => {
    const first = np.createSampleCaptureRequests(baseTimestamp);
    const second = np.createSampleCaptureRequests(baseTimestamp);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.map((request) => request.startedDateTime)).toEqual([
      '2026-01-15T12:00:00.000Z',
      '2026-01-15T12:00:00.500Z',
      '2026-01-15T12:00:03.500Z',
    ]);
    expect(np.createSampleCaptureRequests()).toEqual(first);
    expect(np.createSampleCaptureRequests(Infinity)).toEqual(first);
  });

  test('covers successful API, slow failure, and cached not-modified scenarios on reserved domains', () => {
    const requests = np.createSampleCaptureRequests(baseTimestamp);
    const [success, failure, cached] = requests;

    expect(requests.map((request) => [request.request.method, request.response.status, request.time])).toEqual([
      ['GET', 200, 184],
      ['POST', 503, 2450],
      ['GET', 304, 24],
    ]);
    for (const request of requests) {
      expect(new URL(request.request.url).hostname.endsWith('.test')).toBe(true);
      const timing = np.calculateTimingSegments(request.timings, request.time);
      expect(timing.segments.reduce((total, segment) => total + segment.duration, 0)).toBe(request.time);
    }
    expect(success.response.content.text).toContain('"source":"local-sample"');
    expect(failure.request.postData.text).toContain('"mode":"sample-preview"');
    expect(failure.response.content.text).toContain('"error":"service_unavailable"');
    expect(failure.timings.wait).toBe(2200);
    expect(cached.response.statusText).toBe('Not Modified');
    expect(cached.response.content.text).toBe('');
    expect(cached.request.headers).toContainEqual({
      name: 'If-None-Match',
      value: '"network-plus-sample-v1"',
    });
  });

  test('contains no secret-like or customer-like sample values', () => {
    const serialized = JSON.stringify(np.createSampleCaptureRequests(baseTimestamp));

    expect(serialized).not.toMatch(
      /authorization|bearer|password|passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token|api[_-]?key|cookie|set-cookie|@/i,
    );
    expect(serialized).not.toMatch(/\b(?:Jane|John|Acme)\b/i);
  });

  test('builds rows that exercise search, timing, statistics, and sanitized HAR export', () => {
    const rows = np.createSampleCaptureRequests(baseTimestamp).map((request, index) =>
      np.buildRowFromRequest(request, index + 1),
    );

    expect(rows.map((row) => row.domain)).toEqual([
      'api.network-plus.test',
      'checkout.network-plus.test',
      'static.network-plus.test',
    ]);
    expect(np.deepSearchMatch(rows[0], 'local-sample', {
      url: true,
      reqBody: true,
      resBody: true,
      reqHeaders: true,
      resHeaders: true,
    })).toBe(true);
    expect(np.deepSearchMatch(rows[1], 'service_unavailable', {
      url: false,
      reqBody: false,
      resBody: true,
      reqHeaders: false,
      resHeaders: false,
    })).toBe(true);
    expect(np.computeStats(rows)).toEqual(expect.objectContaining({
      count: 3,
      avgDuration: 886,
      minDuration: 24,
      maxDuration: 2450,
    }));

    const sanitizedHar = np.sanitizeHar(np.buildHarLogFromRows(rows));
    expect(sanitizedHar.log.entries).toHaveLength(3);
    expect(sanitizedHar.log.entries.map((entry) => entry.response.status)).toEqual([200, 503, 304]);
    expect(JSON.stringify(sanitizedHar)).toContain(np.REDACTION_MARKER);
    expect(JSON.stringify(sanitizedHar)).not.toContain('local-only');
  });

  test('uses total rows rather than filtered rows to decide whether the sample action is available', () => {
    expect(np.getEmptyStateMode(0, 0)).toBe('capture');
    expect(np.getEmptyStateMode(0, 3)).toBe('capture');
    expect(np.getEmptyStateMode(3, 0)).toBe('filtered');
    expect(np.getEmptyStateMode(3, 2)).toBe('hidden');
  });

  test('plans guarded entry and restores either prior recording state on exit', () => {
    expect(np.planSampleCaptureTransition({
      active: false,
      paused: false,
      previousPaused: false,
      rowCount: 0,
    }, 'enter')).toEqual({
      active: true,
      paused: true,
      previousPaused: false,
      changed: true,
    });
    expect(np.planSampleCaptureTransition({
      active: false,
      paused: true,
      previousPaused: false,
      rowCount: 0,
    }, 'enter')).toEqual({
      active: true,
      paused: true,
      previousPaused: true,
      changed: true,
    });
    expect(np.planSampleCaptureTransition({
      active: true,
      paused: true,
      previousPaused: false,
      rowCount: 0,
    }, 'enter').changed).toBe(false);
    expect(np.planSampleCaptureTransition({
      active: false,
      paused: false,
      previousPaused: false,
      rowCount: 1,
    }, 'enter').changed).toBe(false);
    expect(np.planSampleCaptureTransition({
      active: true,
      paused: true,
      previousPaused: false,
      rowCount: 0,
    }, 'exit')).toEqual({
      active: false,
      paused: false,
      previousPaused: false,
      changed: true,
    });
    expect(np.planSampleCaptureTransition({
      active: true,
      paused: true,
      previousPaused: true,
      rowCount: 0,
    }, 'exit')).toEqual({
      active: false,
      paused: true,
      previousPaused: false,
      changed: true,
    });
  });

  test('temporarily defaults non-default filters and restores an isolated exact snapshot', () => {
    const currentRules = np.deserializeFilterState({
      url: { mode: 'urlAdvanced', includeAny: 'api', includeAll: '', excludeAny: 'health' },
      method: { mode: 'methodSet', include: { GET: true, POST: false } },
      status: { op: 'gte', value: '400' },
    });
    const entered = np.planSampleCaptureFilterTransition(currentRules, null, 'enter');

    expect(np.countActiveColumnFilters(currentRules)).toBe(3);
    expect(np.countActiveColumnFilters(entered.columnFilterRules)).toBe(0);
    expect(entered.previousColumnFilterRules).toEqual(currentRules);
    expect(entered.previousColumnFilterRules).not.toBe(currentRules);
    expect(entered.previousColumnFilterRules.url).not.toBe(currentRules.url);

    entered.columnFilterRules.url.value = 'temporary sample mutation';
    expect(entered.previousColumnFilterRules.url).toEqual(currentRules.url);

    const exited = np.planSampleCaptureFilterTransition(
      entered.columnFilterRules,
      entered.previousColumnFilterRules,
      'exit',
    );
    expect(exited.columnFilterRules).toEqual(currentRules);
    expect(exited.previousColumnFilterRules).toBeNull();
    expect(np.countActiveColumnFilters(exited.columnFilterRules)).toBe(3);
  });

  test('takes a fresh filter snapshot on every sample entry', () => {
    const firstRules = np.deserializeFilterState({
      domain: { mode: 'multiText', conditions: [{ op: 'contains', value: 'first.test' }] },
    });
    const firstEntry = np.planSampleCaptureFilterTransition(firstRules, null, 'enter');
    const firstExit = np.planSampleCaptureFilterTransition(
      firstEntry.columnFilterRules,
      firstEntry.previousColumnFilterRules,
      'exit',
    );
    const secondRules = np.deserializeFilterState(firstExit.columnFilterRules);
    secondRules.domain.conditions[0].value = 'second.test';
    const secondEntry = np.planSampleCaptureFilterTransition(
      secondRules,
      firstEntry.previousColumnFilterRules,
      'enter',
    );

    expect(secondEntry.previousColumnFilterRules.domain.conditions[0].value).toBe('second.test');
    expect(secondEntry.previousColumnFilterRules).not.toEqual(firstEntry.previousColumnFilterRules);
    expect(np.countActiveColumnFilters(secondEntry.columnFilterRules)).toBe(0);
  });

  test('formats accurate remaining counts after partial sample removal', () => {
    expect(np.formatSampleCaptureRemainingStatus(2)).toBe(
      'Local sample capture: 2 synthetic requests remain. Live recording is paused; Clear exits sample mode.',
    );
    expect(np.formatSampleCaptureRemainingStatus(1)).toBe(
      'Local sample capture: 1 synthetic request remains. Live recording is paused; Clear exits sample mode.',
    );
  });

  test('does not touch network or storage APIs while generating sample data', () => {
    const previousFetch = global.fetch;
    const previousXhr = global.XMLHttpRequest;
    global.fetch = jest.fn();
    global.XMLHttpRequest = jest.fn();
    jest.clearAllMocks();

    try {
      np.createSampleCaptureRequests(baseTimestamp);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(global.XMLHttpRequest).not.toHaveBeenCalled();
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(localStorage.getItem).not.toHaveBeenCalled();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    } finally {
      global.fetch = previousFetch;
      global.XMLHttpRequest = previousXhr;
    }
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

  test.each([
    {
      mode: 'bounded',
      requestLimit: 5000,
      unlimited: false,
      expectedLabel: 'Retention: 5,000',
      expectedAccessibleName: 'Retention: 5,000 requests. Open retention settings',
    },
    {
      mode: 'unlimited',
      requestLimit: 5000,
      unlimited: true,
      expectedLabel: 'Retention: Unlimited',
      expectedAccessibleName:
        'Retention: Unlimited. Open retention settings. Warning: memory can grow without bound',
    },
  ])(
    'keeps the $mode button label in its accessible name',
    ({ requestLimit, unlimited, expectedLabel, expectedAccessibleName }) => {
      const presentation = np.getRetentionPresentation(requestLimit, unlimited);
      expect(presentation.buttonLabel).toBe(expectedLabel);
      expect(presentation.accessibleName).toBe(expectedAccessibleName);
      expect(presentation.accessibleName.startsWith(presentation.buttonLabel)).toBe(true);
    },
  );

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

  test('validates import format and source size before reading', () => {
    expect(np.createImportError('safe message')).toEqual(
      expect.objectContaining({ name: 'ImportError', message: 'safe message' }),
    );
    expect(np.getImportFormat('capture.HAR')).toBe('har');
    expect(np.getImportFormat('capture.saz')).toBe('saz');
    expect(np.getImportFormat('capture.zip')).toBe('');
    expect(np.validateImportSource('capture.har', np.MAX_IMPORT_SOURCE_BYTES)).toEqual({
      format: 'har',
      error: '',
    });
    expect(np.validateImportSource('capture.har', np.MAX_IMPORT_SOURCE_BYTES + 1).error).toContain('32 MiB');
    expect(np.validateImportSource('capture.har', Number.MAX_SAFE_INTEGER).error).toContain('32 MiB');
    expect(np.validateImportSource('capture.har', NaN).error).toContain('unavailable');
    expect(np.validateImportSource('capture.txt', 1).error).toContain('HAR and SAZ');
  });

  test('requires HAR structure and normalizes unsafe scalar and header values', () => {
    expect(np.isRecord({})).toBe(true);
    expect(np.isRecord([])).toBe(false);
    expect(np.isRecord(null)).toBe(false);
    expect(np.normalizeImportNumber(42, -1)).toBe(42);
    expect(np.normalizeImportNumber(Number.MAX_VALUE, -1)).toBe(-1);
    expect(() => np.validateHarDocument(null)).toThrow('log.entries array');
    expect(() => np.validateHarDocument({ log: { entries: {} } })).toThrow('log.entries array');
    expect(() => np.validateHarDocument({ log: { entries: [null] } })).toThrow('request and response');
    const hostileHeader = {
      name: { toString: () => { throw new Error('must not run'); } },
      value: Symbol('secret'),
    };
    expect(np.normalizeHarHeaders([hostileHeader, null, { name: true, value: 42 }])).toEqual([
      { name: '', value: '' },
      { name: '', value: '' },
      { name: 'true', value: '42' },
    ]);
    expect(np.normalizeImportString(1e308)).toBe('1e+308');
    expect(np.normalizeImportString(Infinity)).toBe('');
    expect(np.normalizeImportString({})).toBe('');
  });

  test('normalizes retained HAR entries for every downstream string consumer', () => {
    const source = {
      startedDateTime: 123,
      time: 'slow',
      request: {
        method: 7,
        url: false,
        httpVersion: {},
        headers: 'not-an-array',
        postData: { mimeType: 9, text: false, encoding: 'base64' },
      },
      response: {
        status: '200',
        statusText: true,
        httpVersion: 2,
        headers: [{ name: 'Content-Type', value: 99 }],
        bodySize: Number.MAX_VALUE,
        content: {
          size: -12,
          mimeType: ['json'],
          text: { hostile: true },
          _networkPlus: { status: false, reason: 404 },
        },
      },
      timings: { wait: 'forever', receive: 1e308 },
    };
    expect(np.validateHarDocument({ log: { entries: [source] } })).toEqual([source]);
    const normalized = np.normalizeHarEntry(source);
    expect(normalized).toEqual(
      expect.objectContaining({
        startedDateTime: '123',
        time: 0,
        request: {
          method: '7',
          url: 'false',
          httpVersion: '',
          headers: [],
          postData: { mimeType: '9', text: 'false', encoding: 'base64' },
        },
        response: expect.objectContaining({
          status: 0,
          statusText: 'true',
          httpVersion: '2',
          headers: [{ name: 'Content-Type', value: '99' }],
          content: {
            mimeType: '',
            _networkPlus: { status: 'false', reason: '404' },
          },
        }),
      }),
    );
    expect(normalized.timings.wait).toBe(-1);
    expect(normalized.timings.receive).toBe(-1);
  });

  test('restricts SAZ paths and enforces archive entry budgets', () => {
    expect(np.parseSazEntryPath('raw/123_c.txt')).toEqual({
      requestId: '123',
      kind: 'c',
      extension: 'txt',
    });
    expect(np.parseSazEntryPath('raw/123_m.xml')).toEqual({
      requestId: '123',
      kind: 'm',
      extension: 'xml',
    });
    for (const path of ['../raw/1_c.txt', 'raw/a_c.txt', 'raw/1_x.txt', 'raw/1_c.bin', 'other/1_c.txt']) {
      expect(np.parseSazEntryPath(path)).toBeNull();
    }
    const limits = { maxEntries: 2, maxEntryBytes: 5, maxTotalBytes: 8 };
    const first = np.validateSazArchiveEntryBudget(null, { originalSize: 4 }, limits);
    expect(first).toEqual({
      accepted: true,
      state: { entryCount: 1, totalUncompressedBytes: 4 },
      error: '',
    });
    expect(np.validateSazArchiveEntryBudget(null, {}, limits)).toEqual({
      accepted: true,
      state: { entryCount: 1, totalUncompressedBytes: 0 },
      error: '',
    });
    expect(np.validateSazArchiveEntryBudget(first.state, { originalSize: 6 }, limits).error).toContain('4 MiB');
    const second = np.validateSazArchiveEntryBudget(first.state, { originalSize: 4 }, limits);
    expect(second.accepted).toBe(true);
    expect(np.validateSazArchiveEntryBudget(second.state, { originalSize: 0 }, limits).error).toContain('20,000');
    expect(np.validateSazArchiveEntryBudget(first.state, { originalSize: 5 }, limits).error).toContain('64 MiB');
    expect(np.validateSazArchiveEntryBudget(first.state, { originalSize: Number.MAX_SAFE_INTEGER }, limits).accepted).toBe(false);
    expect(np.validateSazArchiveEntryBudget(first.state, { originalSize: -1 }, limits).error).toContain('metadata');
    expect(np.compareSazRequestIds('9007199254740992', '9007199254740993')).toBeLessThan(0);
    expect(np.compareSazRequestIds('10', '2')).toBeGreaterThan(0);
    expect(np.compareSazRequestIds('001', '1')).not.toBe(0);
  });

  test('streams only expected SAZ payloads without worker or recursion requirements', async () => {
    const fflate = require('../vendor/fflate');
    const encoder = new TextEncoder();
    const archiveEntries = {
      'raw/9007199254740993_c.txt': encoder.encode('GET /later HTTP/1.1\r\n\r\n'),
      'raw/9007199254740993_s.txt': encoder.encode('HTTP/1.1 200 OK\r\n\r\nlater'),
      'raw/9007199254740992_c.txt': encoder.encode('GET /first HTTP/1.1\r\n\r\n'),
      'raw/9007199254740992_s.txt': encoder.encode('HTTP/1.1 200 OK\r\n\r\nfirst'),
      'raw/1_m.xml': encoder.encode('<Session/>'),
      '../raw/1_c.txt': encoder.encode('ignored'),
      'other/payload.bin': encoder.encode('ignored'),
    };
    for (let index = 0; index < 3000; index++) {
      archiveEntries[`other/${index}.txt`] = encoder.encode('x');
    }
    const archive = fflate.zipSync(archiveEntries);
    const extracted = await np.extractBoundedSazEntries(fflate, archive);
    expect(Array.from(extracted.keys()).sort()).toEqual([
      'raw/9007199254740992_c.txt',
      'raw/9007199254740992_s.txt',
      'raw/9007199254740993_c.txt',
      'raw/9007199254740993_s.txt',
    ]);
    expect(new TextDecoder().decode(extracted.get('raw/9007199254740992_s.txt'))).toContain('first');
  });

  test('accepts streaming SAZ entries whose sizes arrive through data descriptors', async () => {
    const fflate = require('../vendor/fflate');
    const encoder = new TextEncoder();
    const chunks = [];
    const archive = await new Promise((resolve, reject) => {
      const zip = new fflate.Zip((error, chunk, final) => {
        if (error) {
          reject(error);
          return;
        }
        chunks.push(chunk);
        if (!final) return;
        const size = chunks.reduce((total, part) => total + part.length, 0);
        const result = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          result.set(part, offset);
          offset += part.length;
        }
        resolve(result);
      });
      const request = new fflate.ZipDeflate('raw/1_c.txt');
      const response = new fflate.ZipDeflate('raw/1_s.txt');
      zip.add(request);
      zip.add(response);
      request.push(encoder.encode('GET / HTTP/1.1\r\n\r\n'), true);
      response.push(encoder.encode('HTTP/1.1 200 OK\r\n\r\nok'), true);
      zip.end();
    });
    const extracted = await np.extractBoundedSazEntries(fflate, archive);
    expect(Array.from(extracted.keys()).sort()).toEqual(['raw/1_c.txt', 'raw/1_s.txt']);
  });

  test('parses complete SAZ HTTP pairs without exposing malformed payloads in errors', () => {
    const encoder = new TextEncoder();
    const entry = np.createSazHarEntry(
      encoder.encode('POST https://example.test/api HTTP/1.1\r\nContent-Type: application/json\r\nX-Test: one\r\n two\r\n\r\n{"ok":true}'),
      encoder.encode('HTTP/1.1 201 Created\r\nContent-Type: application/json; charset=utf-8\r\n\r\n{"id":1}'),
      '2026-01-01T00:00:00.000Z',
    );
    expect(entry.request).toEqual(
      expect.objectContaining({
        method: 'POST',
        url: 'https://example.test/api',
        httpVersion: 'HTTP/1.1',
        headers: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Test', value: 'one two' },
        ],
        postData: { mimeType: 'application/json', text: '{"ok":true}' },
      }),
    );
    expect(entry.response).toEqual(
      expect.objectContaining({
        status: 201,
        statusText: 'Created',
        content: expect.objectContaining({ mimeType: 'application/json', text: '{"id":1}' }),
      }),
    );
    expect(np.getNormalizedHeaderValue(entry.response.headers, 'CONTENT-TYPE')).toBe(
      'application/json; charset=utf-8',
    );
    expect(np.getNormalizedHeaderValue([], 'content-type')).toBe('');
    expect(() =>
      np.createSazHarEntry(
        encoder.encode('hostile-payload-that-must-not-appear'),
        encoder.encode('HTTP/1.1 nope\r\n\r\n'),
        '',
      )).toThrow('SAZ request start line is invalid');
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
    const normalizedMissing = np.normalizeHarEntry({ request: {}, response: {} });
    expect(np.classifyImportedResponseContent(normalizedMissing).state).toBe('unavailable');
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

  test('plans forward and backward keyword navigation with wraparound', () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const matches = [first, second];

    expect(np.planKeywordSearchNavigation(matches, 1, 1, matches)).toEqual({
      targetRow: first,
      keywordIndex: 0,
      globalIndex: 0,
    });
    expect(np.planKeywordSearchNavigation(matches, 0, -1, matches)).toEqual({
      targetRow: second,
      keywordIndex: 1,
      globalIndex: 1,
    });
    expect(np.planKeywordSearchNavigation(matches, -1, -1, matches).targetRow).toBe(second);
  });

  test('skips stale keyword matches and rejects missing navigation targets', () => {
    const stale = { id: 1 };
    const retained = { id: 2 };

    expect(np.planKeywordSearchNavigation([stale, retained], -1, 1, [retained])).toEqual({
      targetRow: retained,
      keywordIndex: 1,
      globalIndex: 0,
    });
    expect(np.planKeywordSearchNavigation([stale], 0, 1, [retained])).toBeNull();
    expect(np.planKeywordSearchNavigation([], -1, 1, [retained])).toBeNull();
    expect(np.planKeywordSearchNavigation([retained], -1, 0, [retained])).toBeNull();
  });

  test('plans navigation deterministically for the default retained-request scale', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({ id: index + 1 }));
    const plan = np.planKeywordSearchNavigation(rows, rows.length - 1, 1, rows);

    expect(plan).toEqual({ targetRow: rows[0], keywordIndex: 0, globalIndex: 0 });
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

describe('multi-keyword highlight planning', () => {
  test('prefers the longest overlapping literal at the same position', () => {
    expect(
      np.planKeywordHighlights('/api/v2/api', [
        { query: 'api', colorIdx: 1 },
        { query: 'api/v2', colorIdx: 4 },
      ]),
    ).toEqual([
      { start: 1, end: 7, colorIdx: 4, keywordIndex: 1 },
      { start: 8, end: 11, colorIdx: 1, keywordIndex: 0 },
    ]);
  });

  test('uses the earliest visible keyword for duplicate case-insensitive literals', () => {
    expect(
      np.planKeywordHighlights('API api', [
        { query: 'Api', colorIdx: 2 },
        { query: 'aPI', colorIdx: 5 },
      ]),
    ).toEqual([
      { start: 0, end: 3, colorIdx: 2, keywordIndex: 0 },
      { start: 4, end: 7, colorIdx: 2, keywordIndex: 0 },
    ]);
  });

  test('ignores empty keywords and escapes regex-special literals', () => {
    expect(np.planKeywordHighlights('a+b? then [x]', [{ query: '' }, { query: '   ' }])).toEqual([]);
    expect(
      np.planKeywordHighlights('a+b? then [x]', [
        { query: 'a+b?', colorIdx: 3 },
        { query: '[x]', colorIdx: 4 },
      ]),
    ).toEqual([
      { start: 0, end: 4, colorIdx: 3, keywordIndex: 0 },
      { start: 10, end: 13, colorIdx: 4, keywordIndex: 1 },
    ]);
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
    expect(np.getExtensionVersion({ getManifest: () => { throw new Error('runtime-failed'); } })).toBe('1.6.0');
    expect(np.getExtensionVersion(null)).toBe('1.6.0');
  });

  test('uses the current extension version for full and sanitized HAR creators', () => {
    const row = makeSensitiveRow();
    const fullHar = np.buildHarLogFromRows([row], new Map([[row, np.buildHarResponseContent(row)]]));
    expect(fullHar.log.creator.version).toBe('1.6.0');
    expect(np.sanitizeHar(fullHar).log.creator.version).toBe('1.6.0');
  });
});

describe('computeStats', () => {
  test('returns zero stats for empty array', () => {
    const stats = np.computeStats([]);
    expect(stats).toEqual({ count: 0, totalDuration: 0, avgDuration: 0, minDuration: 0, maxDuration: 0, totalSize: 0 });
  });

  test('returns zero stats for null/undefined input', () => {
    expect(np.computeStats(null)).toEqual({ count: 0, totalDuration: 0, avgDuration: 0, minDuration: 0, maxDuration: 0, totalSize: 0 });
    expect(np.computeStats(undefined)).toEqual({ count: 0, totalDuration: 0, avgDuration: 0, minDuration: 0, maxDuration: 0, totalSize: 0 });
  });

  test('computes correct stats for a single row', () => {
    const rows = [{ duration: 200, size: 1024 }];
    const stats = np.computeStats(rows);
    expect(stats.count).toBe(1);
    expect(stats.totalDuration).toBe(200);
    expect(stats.avgDuration).toBe(200);
    expect(stats.minDuration).toBe(200);
    expect(stats.maxDuration).toBe(200);
    expect(stats.totalSize).toBe(1024);
  });

  test('computes correct stats for multiple rows', () => {
    const rows = [
      { duration: 100, size: 500 },
      { duration: 300, size: 1500 },
      { duration: 200, size: 1000 },
    ];
    const stats = np.computeStats(rows);
    expect(stats.count).toBe(3);
    expect(stats.totalDuration).toBe(600);
    expect(stats.avgDuration).toBeCloseTo(200);
    expect(stats.minDuration).toBe(100);
    expect(stats.maxDuration).toBe(300);
    expect(stats.totalSize).toBe(3000);
  });

  test('treats missing/non-finite duration and size as 0', () => {
    const rows = [
      { duration: undefined, size: NaN },
      { duration: null, size: undefined },
      { duration: 500, size: 2000 },
    ];
    const stats = np.computeStats(rows);
    expect(stats.count).toBe(3);
    expect(stats.totalDuration).toBe(500);
    expect(stats.minDuration).toBe(0);
    expect(stats.maxDuration).toBe(500);
    expect(stats.totalSize).toBe(2000);
  });
});

describe('computeWaterfallBar', () => {
  test('returns null for null/undefined inputs', () => {
    expect(np.computeWaterfallBar(null, { start: 0, end: 1000 })).toBeNull();
    expect(np.computeWaterfallBar({ clientStartEpoch: 100, duration: 50, timings: {} }, null)).toBeNull();
  });

  test('returns null when range is zero or negative', () => {
    const row = { clientStartEpoch: 100, duration: 50, timings: {} };
    expect(np.computeWaterfallBar(row, { start: 1000, end: 1000 })).toBeNull();
    expect(np.computeWaterfallBar(row, { start: 1000, end: 500 })).toBeNull();
  });

  test('returns null when row starts outside range', () => {
    const row = { clientStartEpoch: 2000, duration: 50, timings: {} };
    expect(np.computeWaterfallBar(row, { start: 0, end: 1000 })).toBeNull();
  });

  test('computes correct offsetPct and widthPct', () => {
    // Row starts at 200ms into a 1000ms range, takes 100ms
    const row = { clientStartEpoch: 200, duration: 100, timings: {} };
    const bar = np.computeWaterfallBar(row, { start: 0, end: 1000 });
    expect(bar).not.toBeNull();
    expect(bar.offsetPct).toBeCloseTo(20); // 200/1000 * 100
    expect(bar.widthPct).toBeCloseTo(10);  // 100/1000 * 100
  });

  test('enforces minimum widthPct of 0.5', () => {
    // Row with 0 duration should get minimum width
    const row = { clientStartEpoch: 0, duration: 0, timings: {} };
    const bar = np.computeWaterfallBar(row, { start: 0, end: 10000 });
    expect(bar).not.toBeNull();
    expect(bar.widthPct).toBeGreaterThanOrEqual(0.5);
  });

  test('returns segments from timings', () => {
    const row = {
      clientStartEpoch: 0,
      duration: 400,
      timings: { wait: 200, receive: 200, blocked: -1, dns: -1, connect: -1, ssl: -1, send: -1 },
    };
    const bar = np.computeWaterfallBar(row, { start: 0, end: 1000 });
    expect(bar).not.toBeNull();
    const labels = bar.segments.map((s) => s.label);
    expect(labels).toContain('wait');
    expect(labels).toContain('receive');
    // blocked, dns, connect, ssl, send are -1 so should not appear
    expect(labels).not.toContain('blocked');
  });

  test('returns empty segments array when no timing data', () => {
    const row = { clientStartEpoch: 0, duration: 200, timings: {} };
    const bar = np.computeWaterfallBar(row, { start: 0, end: 1000 });
    expect(bar).not.toBeNull();
    expect(bar.segments).toEqual([]);
  });

  test('offsetPct + widthPct never exceeds 100 for row near end of range', () => {
    // Row starts at 99.8% of a 1000ms range with 0 duration → minimum bar must not overflow
    const row = { clientStartEpoch: 998, duration: 0, timings: {} };
    const bar = np.computeWaterfallBar(row, { start: 0, end: 1000 });
    expect(bar).not.toBeNull();
    expect(bar.offsetPct + bar.widthPct).toBeLessThanOrEqual(100);
  });

  test('offsetPct + widthPct never exceeds 100 for a wide bar near end of range', () => {
    // Row starts at 50% and is very long — should be clamped to remaining 50%
    const row = { clientStartEpoch: 500, duration: 2000, timings: {} };
    const bar = np.computeWaterfallBar(row, { start: 0, end: 1000 });
    expect(bar).not.toBeNull();
    expect(bar.offsetPct + bar.widthPct).toBeLessThanOrEqual(100);
  });

  test('timing segment percentages never exceed 100% in total', () => {
    // Segments where each is 60% of dur — total 120%, must be normalized to 100%
    const row = {
      clientStartEpoch: 0,
      duration: 100,
      timings: { wait: 60, receive: 60, blocked: -1, dns: -1, connect: -1, ssl: -1, send: -1 },
    };
    const bar = np.computeWaterfallBar(row, { start: 0, end: 1000 });
    expect(bar).not.toBeNull();
    const totalPct = bar.segments.reduce((sum, seg) => sum + seg.pct, 0);
    expect(totalPct).toBeLessThanOrEqual(100 + 1e-9); // floating-point tolerance
  });
});

describe('computeWaterfallRange', () => {
  test('returns null for empty or null input', () => {
    expect(np.computeWaterfallRange([])).toBeNull();
    expect(np.computeWaterfallRange(null)).toBeNull();
    expect(np.computeWaterfallRange(undefined)).toBeNull();
  });

  test('returns null when no row has valid clientStartEpoch', () => {
    const rows = [
      { clientStartEpoch: -1, duration: 100 },
      { clientStartEpoch: 0, duration: 100 },
      { clientStartEpoch: null, duration: 100 },
    ];
    expect(np.computeWaterfallRange(rows)).toBeNull();
  });

  test('returns null when all start epochs are equal (range = 0)', () => {
    const rows = [
      { clientStartEpoch: 1000, duration: 0 },
      { clientStartEpoch: 1000, duration: 0 },
    ];
    expect(np.computeWaterfallRange(rows)).toBeNull();
  });

  test('computes correct range from a small set of rows', () => {
    const rows = [
      { clientStartEpoch: 1000, duration: 200 },
      { clientStartEpoch: 1050, duration: 300 },
      { clientStartEpoch: 1100, duration: 100 },
    ];
    const range = np.computeWaterfallRange(rows);
    expect(range).not.toBeNull();
    expect(range.start).toBe(1000);
    // latest end = 1050 + 300 = 1350
    expect(range.end).toBe(1350);
  });

  test('deterministic 1,000-row range computation', () => {
    // Build 1,000 rows with known start/duration values and verify range is correct
    const BASE = 1000000;
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      clientStartEpoch: BASE + i * 10,   // 1000000, 1000010, … 1009990
      duration: 5,                        // each lasts 5 ms
    }));
    const range = np.computeWaterfallRange(rows);
    expect(range).not.toBeNull();
    expect(range.start).toBe(BASE);                 // first row starts at BASE
    expect(range.end).toBe(BASE + 999 * 10 + 5);   // last row ends at BASE + 9995
  });

  test('1,000-row computeStats correctness', () => {
    // All durations are known integers: 1, 2, …, 1000
    const rows = Array.from({ length: 1000 }, (_, i) => ({ duration: i + 1, size: 0 }));
    const stats = np.computeStats(rows);
    expect(stats.count).toBe(1000);
    expect(stats.minDuration).toBe(1);
    expect(stats.maxDuration).toBe(1000);
    // Sum of 1..1000 = 500500
    expect(stats.totalDuration).toBe(500500);
    expect(stats.avgDuration).toBeCloseTo(500.5);
  });
});

describe('loadThemePref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  test('async read failure falls back to localStorage value', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb({});
      chrome.runtime.lastError = null;
    });
    localStorage.getItem.mockReturnValue('dark');
    np.loadThemePref((theme) => {
      expect(theme).toBe('dark');
      done();
    });
  });

  test('async read failure falls back to system when localStorage also empty (no warning)', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb({});
      chrome.runtime.lastError = null;
    });
    localStorage.getItem.mockReturnValue(null);
    np.loadThemePref((theme, warn) => {
      expect(theme).toBe('system');
      expect(warn).toBeUndefined();
      done();
    });
  });

  test('double-callback prevention: cb is called at most once when both paths fire', (done) => {
    // Simulate both the async callback AND a sync throw to verify the at-most-once guard
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      cb({ 'networkPlus.theme': 'light' });
      throw new Error('also throws after callback');
    });
    const calls = [];
    np.loadThemePref((theme) => {
      calls.push(theme);
    });
    setTimeout(() => {
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe('light');
      done();
    }, 0);
  });

  test('reads value from extension storage when no error', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      cb({ 'networkPlus.theme': 'dark' });
    });
    np.loadThemePref((theme) => {
      expect(theme).toBe('dark');
      done();
    });
  });

  test('first-run: no saved value in extension storage returns system without warning', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      cb({});
    });
    localStorage.getItem.mockReturnValue(null);
    np.loadThemePref((theme, warn) => {
      expect(theme).toBe('system');
      expect(warn).toBeUndefined();
      done();
    });
  });

  test('total read failure (storage error + localStorage throws) returns system with load warning', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb({});
      chrome.runtime.lastError = null;
    });
    localStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    np.loadThemePref((theme, warn) => {
      expect(theme).toBe('system');
      expect(warn).toBe('Theme preference could not be loaded.');
      done();
    });
  });

  test('load warning does not expose raw error message', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Internal extension error with sensitive details' };
      cb({});
      chrome.runtime.lastError = null;
    });
    localStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    np.loadThemePref((theme, warn) => {
      expect(warn).not.toContain('Internal extension error');
      expect(warn).not.toContain('sensitive details');
      expect(warn).toBe('Theme preference could not be loaded.');
      done();
    });
  });

  test('primary read succeeds with no saved key but localStorage probe throws: returns system with no warning', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      cb({});
    });
    localStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    np.loadThemePref((theme, warn) => {
      expect(theme).toBe('system');
      expect(warn).toBeUndefined();
      done();
    });
  });

  test('duplicate failing storage callbacks attempt localStorage fallback only once and emit one warning', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb({});
      cb({});
      chrome.runtime.lastError = null;
    });
    localStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    const warnings = [];
    np.loadThemePref((_theme, warn) => {
      if (warn !== undefined) warnings.push(warn);
    });
    setTimeout(() => {
      expect(localStorage.getItem).toHaveBeenCalledTimes(1);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toBe('Theme preference could not be loaded.');
      done();
    }, 0);
  });
});

describe('saveThemePref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  test('async write failure falls back to localStorage', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      chrome.runtime.lastError = { message: 'Storage quota exceeded' };
      cb();
      chrome.runtime.lastError = null;
    });
    np.saveThemePref('dark');
    setTimeout(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('networkPlus.theme', 'dark');
      done();
    }, 0);
  });

  test('fallback success: localStorage receives value when extension storage fails async', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb();
      chrome.runtime.lastError = null;
    });
    np.saveThemePref('light');
    setTimeout(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('networkPlus.theme', 'light');
      done();
    }, 0);
  });

  test('total persistence failure surfaces status warning, does not throw', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb();
      chrome.runtime.lastError = null;
    });
    localStorage.setItem.mockImplementation(() => {
      throw new Error('localStorage full');
    });
    const statusEl = { textContent: '' };
    document.querySelector.mockImplementation((sel) =>
      sel === '#statusText' ? statusEl : { textContent: '', style: {}, setAttribute: jest.fn(), removeAttribute: jest.fn() }
    );
    np.saveThemePref('dark');
    setTimeout(() => {
      expect(statusEl.textContent).toBe('Theme preference could not be saved.');
      done();
    }, 0);
  });

  test('does not call localStorage when extension storage succeeds', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      cb();
    });
    np.saveThemePref('dark');
    setTimeout(() => {
      expect(localStorage.setItem).not.toHaveBeenCalled();
      done();
    }, 0);
  });

  test('at-most-once guard: sync throw after successful callback does not write to localStorage', (done) => {
    // Simulate both the async success callback AND a sync throw; localStorage must not be written
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      cb();
      throw new Error('also throws after callback');
    });
    np.saveThemePref('dark');
    setTimeout(() => {
      expect(localStorage.setItem).not.toHaveBeenCalled();
      done();
    }, 0);
  });

  test('does not expose raw error message in status warning', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      chrome.runtime.lastError = { message: 'Internal extension error with sensitive details' };
      cb();
      chrome.runtime.lastError = null;
    });
    localStorage.setItem.mockImplementation(() => {
      throw new Error('localStorage full');
    });
    const statusEl = { textContent: '' };
    document.querySelector.mockImplementation((sel) =>
      sel === '#statusText' ? statusEl : { textContent: '', style: {}, setAttribute: jest.fn(), removeAttribute: jest.fn() }
    );
    np.saveThemePref('dark');
    setTimeout(() => {
      expect(statusEl.textContent).not.toContain('Internal extension error');
      expect(statusEl.textContent).not.toContain('sensitive details');
      expect(statusEl.textContent).toBe('Theme preference could not be saved.');
      done();
    }, 0);
  });

  test('duplicate failing storage callbacks attempt localStorage fallback only once', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb();
      cb();
      chrome.runtime.lastError = null;
    });
    np.saveThemePref('dark');
    setTimeout(() => {
      expect(localStorage.setItem).toHaveBeenCalledTimes(1);
      done();
    }, 0);
  });
});

describe('serializeFilterState', () => {
  test('returns empty object for empty input', () => {
    expect(np.serializeFilterState({})).toEqual({});
  });

  test('deep-clones a simple filter rule', () => {
    const rules = { url: { op: 'contains', value: 'api' } };
    const serialized = np.serializeFilterState(rules);
    expect(serialized).toEqual(rules);
    // Mutation of original must not affect serialized copy
    rules.url.value = 'changed';
    expect(serialized.url.value).toBe('api');
  });

  test('round-trips a complex methodSet rule', () => {
    const rules = { method: { mode: 'methodSet', include: { GET: true, POST: false } } };
    const serialized = np.serializeFilterState(rules);
    expect(serialized).toEqual(rules);
  });

  test('returns empty object when JSON.stringify throws (circular reference guard)', () => {
    const circular = {};
    circular.self = circular;
    expect(np.serializeFilterState(circular)).toEqual({});
  });
});

describe('deserializeFilterState', () => {
  test('returns defaults for null/undefined/non-object input', () => {
    // Every column defined in DEFAULT_COLUMNS should have a key
    const result = np.deserializeFilterState(null);
    expect(typeof result).toBe('object');
    expect(Array.isArray(result)).toBe(false);
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('status');
  });

  test('returns defaults for array input', () => {
    const result = np.deserializeFilterState([{ op: 'contains', value: 'test' }]);
    expect(typeof result).toBe('object');
    expect(Array.isArray(result)).toBe(false);
  });

  test('fills missing columns with defaults', () => {
    // Only provide 'url' key; all other columns should get their defaults
    const result = np.deserializeFilterState({ url: { op: 'contains', value: 'test' } });
    expect(result.url).toEqual({ op: 'contains', value: 'test' });
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('status');
  });

  test('round-trips through serializeFilterState', () => {
    const original = {
      url: { op: 'contains', value: 'api' },
      method: { mode: 'methodSet', include: { GET: true, POST: true } },
      status: { op: 'equals', value: '200' },
    };
    const serialized = np.serializeFilterState(original);
    const deserialized = np.deserializeFilterState(serialized);
    expect(deserialized.url).toEqual(original.url);
    expect(deserialized.method).toEqual(original.method);
    expect(deserialized.status).toEqual(original.status);
  });
});

describe('normalizePresetName', () => {
  test('trims whitespace', () => {
    expect(np.normalizePresetName('  API only  ')).toBe('API only');
  });

  test('truncates to MAX_PRESET_NAME_LENGTH', () => {
    const long = 'a'.repeat(100);
    expect(np.normalizePresetName(long).length).toBe(np.MAX_PRESET_NAME_LENGTH);
  });

  test('returns empty string for null/undefined', () => {
    expect(np.normalizePresetName(null)).toBe('');
    expect(np.normalizePresetName(undefined)).toBe('');
    expect(np.normalizePresetName('')).toBe('');
  });
});

describe('loadFilterPresets / saveFilterPresets', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    localStorage.getItem.mockReturnValue(null);
  });

  // --- loadFilterPresets ---

  test('returns { presets: [], error: null } when nothing is stored', () => {
    const result = np.loadFilterPresets();
    expect(result).toEqual({ presets: [], error: null });
  });

  test('returns error string for malformed JSON', () => {
    localStorage.getItem.mockReturnValue('not-json{{{');
    const { presets, error } = np.loadFilterPresets();
    expect(presets).toEqual([]);
    expect(typeof error).toBe('string');
    expect(error.length).toBeGreaterThan(0);
  });

  test('returns error string when stored value is not an array', () => {
    localStorage.getItem.mockReturnValue(JSON.stringify({ name: 'x', filterRules: {} }));
    const { presets, error } = np.loadFilterPresets();
    expect(presets).toEqual([]);
    expect(typeof error).toBe('string');
  });

  test('returns error string when stored blob is oversized (ASCII)', () => {
    // Simulate a stored blob larger than 2 * MAX_PRESET_TOTAL_BYTES (ASCII chars, 1 byte each)
    localStorage.getItem.mockReturnValue('x'.repeat(np.MAX_PRESET_TOTAL_BYTES * 2 + 1));
    const { presets, error } = np.loadFilterPresets();
    expect(presets).toEqual([]);
    expect(typeof error).toBe('string');
    expect(error.length).toBeGreaterThan(0);
  });

  test('returns error string when stored blob exceeds 2×MAX_PRESET_TOTAL_BYTES in UTF-8 bytes (multibyte regression)', () => {
    // Each '日' encodes to 3 UTF-8 bytes but 1 JS char.
    // (MAX_PRESET_TOTAL_BYTES * 2 / 3) + 1 chars × 3 bytes/char > MAX_PRESET_TOTAL_BYTES * 2 bytes.
    const multibyteCount = Math.floor((np.MAX_PRESET_TOTAL_BYTES * 2) / 3) + 1;
    localStorage.getItem.mockReturnValue('日'.repeat(multibyteCount));
    const { presets, error } = np.loadFilterPresets();
    expect(presets).toEqual([]);
    expect(typeof error).toBe('string');
    expect(error.length).toBeGreaterThan(0);
  });

  test('returns error: null and no-sensitive message on localStorage read failure', () => {
    localStorage.getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const { presets, error } = np.loadFilterPresets();
    expect(presets).toEqual([]);
    expect(typeof error).toBe('string');
    // Error message must not echo the internal exception message
    expect(error).not.toContain('SecurityError');
  });

  test('filters out entries missing name or filterRules', () => {
    const data = [
      { name: 'Valid', filterRules: { url: { op: 'contains', value: '' } } },
      { name: '', filterRules: {} },
      { filterRules: {} },
      null,
    ];
    localStorage.getItem.mockReturnValue(JSON.stringify(data));
    const { presets, error } = np.loadFilterPresets();
    expect(error).toBeNull();
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Valid');
  });

  test('enforces MAX_FILTER_PRESETS limit on load', () => {
    const data = Array.from({ length: np.MAX_FILTER_PRESETS + 5 }, (_, i) => ({
      name: 'Preset ' + i,
      filterRules: {},
    }));
    localStorage.getItem.mockReturnValue(JSON.stringify(data));
    const { presets, error } = np.loadFilterPresets();
    expect(error).toBeNull();
    expect(presets).toHaveLength(np.MAX_FILTER_PRESETS);
  });

  test('loadFilterPresets normalizes names and strips unknown filterRules fields on load', () => {
    const data = [
      { name: '  padded  ', filterRules: { url: { op: 'contains', value: 'api', __unknown: true }, _extra: 'drop' } },
    ];
    localStorage.getItem.mockReturnValue(JSON.stringify(data));
    const { presets, error } = np.loadFilterPresets();
    expect(error).toBeNull();
    expect(presets[0].name).toBe('padded');
    expect(presets[0].filterRules).not.toHaveProperty('_extra');
  });

  // --- saveFilterPresets ---

  test('saveFilterPresets writes to localStorage', () => {
    const presets = [{ name: 'Errors only', filterRules: { status: { op: 'gte', value: '400' } } }];
    np.saveFilterPresets(presets);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      np.FILTER_PRESET_KEY,
      expect.stringContaining('"Errors only"'),
    );
  });

  test('saveFilterPresets returns true on success', () => {
    expect(np.saveFilterPresets([])).toBe(true);
  });

  test('saveFilterPresets returns false and does not throw when localStorage throws', () => {
    localStorage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(np.saveFilterPresets([])).toBe(false);
  });

  test('saveFilterPresets silently caps to MAX_FILTER_PRESETS when given more', () => {
    const tooMany = Array.from({ length: np.MAX_FILTER_PRESETS + 5 }, (_, i) => ({
      name: 'P' + i,
      filterRules: {},
    }));
    const ok = np.saveFilterPresets(tooMany);
    expect(ok).toBe(true);
    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    expect(stored).toHaveLength(np.MAX_FILTER_PRESETS);
  });

  test('saveFilterPresets returns false when serialized data exceeds MAX_PRESET_TOTAL_BYTES', () => {
    // Build a preset with a filterRules payload large enough to exceed 64 KiB in UTF-8 bytes
    const bigValue = 'x'.repeat(70 * 1024);
    const oversized = [{ name: 'Big', filterRules: { url: { op: 'contains', value: bigValue } } }];
    expect(np.saveFilterPresets(oversized)).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  test('saveFilterPresets normalizes names before writing', () => {
    const presets = [{ name: '  trailing  ', filterRules: {} }];
    np.saveFilterPresets(presets);
    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    expect(stored[0].name).toBe('trailing');
  });

  test('saveFilterPresets drops entries without a name', () => {
    const presets = [
      { name: 'OK', filterRules: {} },
      { name: '', filterRules: {} },
      { name: '   ', filterRules: {} },
    ];
    np.saveFilterPresets(presets);
    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('OK');
  });

  test('saveFilterPresets normalizes filterRules through serializer/deserializer stripping unknown fields', () => {
    const presets = [{
      name: 'Clean',
      filterRules: { url: { op: 'contains', value: 'api', __unknown: true }, _extra: 'drop' },
    }];
    np.saveFilterPresets(presets);
    const stored = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    // The top-level _extra key should not be in the stored filterRules (only known column keys survive)
    expect(stored[0].filterRules).not.toHaveProperty('_extra');
  });
});

// ============================================================
// Two-request diff comparison — pure utility functions [U8]
// ============================================================

describe('diffHeaders', () => {
  test('returns empty array for two empty header lists', () => {
    expect(np.diffHeaders([], [])).toEqual([]);
  });

  test('returns empty array for null/undefined inputs', () => {
    expect(np.diffHeaders(null, null)).toEqual([]);
    expect(np.diffHeaders(undefined, undefined)).toEqual([]);
    expect(np.diffHeaders(null, [{ name: 'x', value: 'v' }])).toHaveLength(1);
  });

  test('marks headers present in only A as only-a', () => {
    const result = np.diffHeaders([{ name: 'X-Token', value: 'abc' }], []);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('only-a');
    expect(result[0].name).toBe('X-Token');
    expect(result[0].valueA).toBe('abc');
    expect(result[0].valueB).toBeNull();
  });

  test('marks headers present in only B as only-b', () => {
    const result = np.diffHeaders([], [{ name: 'Content-Type', value: 'application/json' }]);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('only-b');
    expect(result[0].valueA).toBeNull();
    expect(result[0].valueB).toBe('application/json');
  });

  test('marks headers with the same value as match', () => {
    const h = { name: 'Content-Type', value: 'text/plain' };
    const result = np.diffHeaders([h], [h]);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('match');
  });

  test('marks headers with different values as changed', () => {
    const result = np.diffHeaders(
      [{ name: 'Accept', value: 'text/html' }],
      [{ name: 'Accept', value: 'application/json' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('changed');
    expect(result[0].valueA).toBe('text/html');
    expect(result[0].valueB).toBe('application/json');
  });

  test('header name comparison is case-insensitive', () => {
    const result = np.diffHeaders(
      [{ name: 'content-type', value: 'text/plain' }],
      [{ name: 'Content-Type', value: 'text/plain' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('match');
  });

  test('preserves duplicate headers such as Set-Cookie, aligned by occurrence', () => {
    const result = np.diffHeaders(
      [{ name: 'Set-Cookie', value: 'a=1' }, { name: 'Set-Cookie', value: 'b=2' }],
      [{ name: 'Set-Cookie', value: 'a=1' }],
    );
    // Two occurrences in A, one in B — expect 2 diff rows
    expect(result).toHaveLength(2);
    // First occurrence: a=1 vs a=1 → match
    const match = result.find((r) => r.state === 'match');
    expect(match).toBeDefined();
    expect(match.valueA).toBe('a=1');
    expect(match.valueB).toBe('a=1');
    // Second occurrence: b=2 only in A
    const onlyA = result.find((r) => r.state === 'only-a');
    expect(onlyA).toBeDefined();
    expect(onlyA.valueA).toBe('b=2');
    expect(onlyA.valueB).toBeNull();
  });

  test('all duplicates match when both sides share identical occurrences', () => {
    const result = np.diffHeaders(
      [{ name: 'Set-Cookie', value: 'a=1' }, { name: 'Set-Cookie', value: 'b=2' }],
      [{ name: 'Set-Cookie', value: 'a=1' }, { name: 'Set-Cookie', value: 'b=2' }],
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.state === 'match')).toBe(true);
  });

  test('result is sorted alphabetically by name', () => {
    const result = np.diffHeaders(
      [{ name: 'Zebra', value: 'z' }, { name: 'Alpha', value: 'a' }],
      [{ name: 'Zebra', value: 'z' }, { name: 'Alpha', value: 'a' }],
    );
    expect(result.map((r) => r.name)).toEqual(['Alpha', 'Zebra']);
  });

  test('XSS: names and values are returned as plain strings (not HTML-escaped)', () => {
    // The function is pure and does no escaping — the caller must use textContent.
    const result = np.diffHeaders(
      [{ name: '<script>', value: 'alert(1)' }],
      [{ name: '<script>', value: 'safe' }],
    );
    expect(result[0].name).toBe('<script>');
    expect(result[0].valueA).toBe('alert(1)');
    expect(result[0].state).toBe('changed');
  });
});

describe('diffQueryParams', () => {
  test('returns empty array for two empty param lists', () => {
    expect(np.diffQueryParams([], [])).toEqual([]);
  });

  test('returns empty array for null/undefined inputs', () => {
    expect(np.diffQueryParams(null, null)).toEqual([]);
  });

  test('marks params present in only A as only-a', () => {
    const result = np.diffQueryParams([{ name: 'q', value: 'foo' }], []);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('only-a');
    expect(result[0].valueB).toBeNull();
  });

  test('marks params present in only B as only-b', () => {
    const result = np.diffQueryParams([], [{ name: 'page', value: '2' }]);
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('only-b');
    expect(result[0].valueA).toBeNull();
  });

  test('marks params with the same value as match', () => {
    const result = np.diffQueryParams(
      [{ name: 'lang', value: 'en' }],
      [{ name: 'lang', value: 'en' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('match');
  });

  test('marks params with different values as changed', () => {
    const result = np.diffQueryParams(
      [{ name: 'sort', value: 'asc' }],
      [{ name: 'sort', value: 'desc' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('changed');
  });

  test('handles duplicate param names as separate entries', () => {
    const result = np.diffQueryParams(
      [{ name: 'tag', value: 'a' }, { name: 'tag', value: 'b' }],
      [{ name: 'tag', value: 'a' }, { name: 'tag', value: 'c' }],
    );
    expect(result).toHaveLength(2);
    const byValue = result.map((r) => ({ va: r.valueA, vb: r.valueB, s: r.state }));
    expect(byValue).toContainEqual({ va: 'a', vb: 'a', s: 'match' });
    expect(byValue).toContainEqual({ va: 'b', vb: 'c', s: 'changed' });
  });

  test('XSS: values with HTML metacharacters are returned as-is', () => {
    const result = np.diffQueryParams(
      [{ name: 'q', value: '<img src=x onerror=alert(1)>' }],
      [{ name: 'q', value: 'safe' }],
    );
    expect(result[0].valueA).toBe('<img src=x onerror=alert(1)>');
    expect(result[0].state).toBe('changed');
  });
});

describe('describeBodyForComparison', () => {
  test('returns missing for null row', () => {
    expect(np.describeBodyForComparison(null)).toEqual({ text: null, stateLabel: 'missing' });
  });

  test('returns available with text when responseContentState is cached', () => {
    const row = { responseContentState: 'cached', responseContentText: 'hello world' };
    const result = np.describeBodyForComparison(row);
    expect(result.stateLabel).toBe('available');
    expect(result.text).toBe('hello world');
  });

  test('returns available with text when responseContentState is embedded', () => {
    const row = { responseContentState: 'embedded', responseContentText: '{"ok":true}' };
    const result = np.describeBodyForComparison(row);
    expect(result.stateLabel).toBe('available');
    expect(result.text).toBe('{"ok":true}');
  });

  test('returns empty when body is cached but text is empty string', () => {
    const row = { responseContentState: 'cached', responseContentText: '' };
    const result = np.describeBodyForComparison(row);
    expect(result.stateLabel).toBe('empty');
    expect(result.text).toBe('');
  });

  test('returns omitted for omitted bodies', () => {
    const row = { responseContentState: 'omitted' };
    expect(np.describeBodyForComparison(row)).toEqual({ text: null, stateLabel: 'omitted' });
  });

  test('returns evicted for evicted bodies', () => {
    expect(np.describeBodyForComparison({ responseContentState: 'evicted' }))
      .toEqual({ text: null, stateLabel: 'evicted' });
    expect(np.describeBodyForComparison({ responseContentState: 'row-evicted' }))
      .toEqual({ text: null, stateLabel: 'evicted' });
  });

  test('returns unavailable for unknown state', () => {
    const row = { responseContentState: 'loading' };
    expect(np.describeBodyForComparison(row)).toEqual({ text: null, stateLabel: 'unavailable' });
  });

  test('returns truncated state when response body exceeds TRUNCATE_LIMIT', () => {
    const longText = 'x'.repeat(2001);
    const row = { responseContentState: 'cached', responseContentText: longText };
    const result = np.describeBodyForComparison(row);
    expect(result.stateLabel).toBe('truncated');
    expect(result.text.length).toBe(2000);
    expect(result.totalLength).toBe(2001);
  });

  test('returns available when response body is exactly at TRUNCATE_LIMIT', () => {
    const exactText = 'x'.repeat(2000);
    const row = { responseContentState: 'cached', responseContentText: exactText };
    const result = np.describeBodyForComparison(row);
    expect(result.stateLabel).toBe('available');
    expect(result.text).toBe(exactText);
    expect(result.totalLength).toBeUndefined();
  });
});

describe('describeRequestBodyForComparison', () => {
  test('returns missing for null row', () => {
    expect(np.describeRequestBodyForComparison(null)).toEqual({ text: null, stateLabel: 'missing' });
  });

  test('returns missing when row has no requestPostData', () => {
    expect(np.describeRequestBodyForComparison({})).toEqual({ text: null, stateLabel: 'missing' });
    expect(np.describeRequestBodyForComparison({ requestPostData: null }))
      .toEqual({ text: null, stateLabel: 'missing' });
  });

  test('returns missing when requestPostData.text is not a string', () => {
    expect(np.describeRequestBodyForComparison({ requestPostData: {} }))
      .toEqual({ text: null, stateLabel: 'missing' });
    expect(np.describeRequestBodyForComparison({ requestPostData: { text: null } }))
      .toEqual({ text: null, stateLabel: 'missing' });
  });

  test('returns empty when request body text is empty string', () => {
    const row = { requestPostData: { text: '' } };
    expect(np.describeRequestBodyForComparison(row)).toEqual({ text: '', stateLabel: 'empty' });
  });

  test('returns available with text for a normal request body', () => {
    const row = { requestPostData: { text: '{"key":"value"}' } };
    const result = np.describeRequestBodyForComparison(row);
    expect(result.stateLabel).toBe('available');
    expect(result.text).toBe('{"key":"value"}');
  });

  test('returns truncated state when request body exceeds TRUNCATE_LIMIT', () => {
    const longText = 'A'.repeat(2001);
    const row = { requestPostData: { text: longText } };
    const result = np.describeRequestBodyForComparison(row);
    expect(result.stateLabel).toBe('truncated');
    expect(result.text.length).toBe(2000);
    expect(result.totalLength).toBe(2001);
  });

  test('returns available when request body is exactly at TRUNCATE_LIMIT', () => {
    const exactText = 'B'.repeat(2000);
    const row = { requestPostData: { text: exactText } };
    const result = np.describeRequestBodyForComparison(row);
    expect(result.stateLabel).toBe('available');
    expect(result.totalLength).toBeUndefined();
  });

  test('XSS: request body text is returned as-is (caller must use textContent)', () => {
    const row = { requestPostData: { text: '<img src=x onerror=alert(1)>' } };
    const result = np.describeRequestBodyForComparison(row);
    expect(result.text).toBe('<img src=x onerror=alert(1)>');
    expect(result.stateLabel).toBe('available');
  });
});

describe('truncateUrlLabel', () => {
  test('returns path+search for a valid URL', () => {
    const label = np.truncateUrlLabel('https://example.com/api/data?q=1');
    expect(label).toBe('/api/data?q=1');
  });

  test('truncates long paths to 40 characters', () => {
    const long = 'https://example.com/' + 'a'.repeat(50);
    const label = np.truncateUrlLabel(long);
    expect(label.length).toBe(40);
  });

  test('returns slash when path is root only', () => {
    const label = np.truncateUrlLabel('https://example.com');
    expect(label).toBe('/');
  });

  test('returns host for very short labels', () => {
    const label = np.truncateUrlLabel('https://api.example.com/v2/data');
    expect(label).toBe('/v2/data');
  });

  test('returns fallback for null/undefined', () => {
    expect(np.truncateUrlLabel(null)).toBe('(no URL)');
    expect(np.truncateUrlLabel(undefined)).toBe('(no URL)');
    expect(np.truncateUrlLabel('')).toBe('(no URL)');
  });

  test('returns truncated string for invalid URL', () => {
    const label = np.truncateUrlLabel('not-a-valid-url');
    expect(label).toBe('not-a-valid-url');
  });
});
