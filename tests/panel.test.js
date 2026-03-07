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
  test('returns "other" for null/undefined', () => {
    expect(np.formatInitiator(null)).toEqual({ text: 'other' });
    expect(np.formatInitiator(undefined)).toEqual({ text: 'other' });
  });

  test('returns "parser" for parser type', () => {
    expect(np.formatInitiator({ type: 'parser' })).toEqual({ text: 'parser' });
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
    expect(result.text).toBe('app.js:42');
    expect(result.url).toBe('https://example.com/app.js');
    expect(result.lineNumber).toBe(42);
  });

  test('returns "script" when no call frames', () => {
    expect(np.formatInitiator({ type: 'script' })).toEqual({ text: 'script' });
    expect(np.formatInitiator({ type: 'script', stack: { callFrames: [] } })).toEqual({
      text: 'script',
    });
  });

  test('returns type text for unknown types', () => {
    expect(np.formatInitiator({ type: 'preflight' })).toEqual({ text: 'preflight' });
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
