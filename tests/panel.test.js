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

describe('painted outline footprint', () => {
  test.each([
    ['2px', '-2px', 0],
    ['2px', '-1px', 1],
    ['2px', '0px', 2],
    ['2px', '1px', 3],
    ['none', '-2px', 0],
  ])('derives the external footprint from width %s and offset %s', (outlineWidth, outlineOffset, expected) => {
    expect(np.calculateExternalOutlineFootprint(outlineWidth, outlineOffset)).toBe(expected);
  });
});

describe('status announcement planning', () => {
  test('deduplicates automatic summaries but forces repeated user retry feedback', () => {
    const message = 'Response-body retry failed for request 42.';
    expect(np.planStatusAnnouncement(message, message, false)).toEqual({
      text: message,
      clearFirst: false,
      write: false,
    });
    expect(np.planStatusAnnouncement(message, message, true)).toEqual({
      text: message,
      clearFirst: true,
      write: true,
    });
    expect(np.planStatusAnnouncement('Capturing...', message, false)).toEqual({
      text: message,
      clearFirst: false,
      write: true,
    });
  });
});

describe('safe support summary', () => {
  const validInput = {
    version: '1.6.0',
    edgeMajor: '131',
    osFamily: 'macOS',
    theme: 'system',
    retentionPolicy: 'limited',
    retentionLimit: 5000,
    recording: 'recording',
    localSample: 'inactive',
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  };

  test('emits the exact allowlisted values in a stable order', () => {
    expect(np.buildSafeSupportSummary(validInput)).toBe(
      [
        'Network+ safe support summary',
        'Network+ version: 1.6.0',
        'Browser: Microsoft Edge 131',
        'OS family: macOS',
        'Theme: system',
        'Retention: limited (5,000 requests)',
        'Recording: recording',
        'Local sample: inactive',
        'Preferred color scheme: dark',
        'Reduced motion preference: no-preference',
        '',
        'This summary intentionally excludes captured traffic. Review it before posting to a public issue.',
      ].join('\n'),
    );
  });

  test('prefers reduced user-agent data and falls back to only Edg major and coarse OS', () => {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Edg/131.0.2903.86';
    expect(
      np.parseEdgeMajor(
        { brands: [{ brand: 'Microsoft Edge', version: '132.0.1.4' }], platform: 'macOS' },
        userAgent,
      ),
    ).toBe('132');
    expect(np.parseOsFamily({ platform: 'macOS' }, userAgent)).toBe('macOS');
    expect(np.parseEdgeMajor(null, userAgent)).toBe('131');
    expect(np.parseOsFamily(null, userAgent)).toBe('Windows');
    expect(np.parseOsFamily(null, 'Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux');
    expect(np.parseOsFamily(null, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('Other/unknown');
  });

  test('normalizes unavailable media preferences without inspecting global browser state', () => {
    const preferences = np.readSupportMediaPreferences((query) => ({
      matches:
        query === '(prefers-color-scheme: light)' ||
        query === '(prefers-reduced-motion: reduce)',
    }));
    expect(preferences).toEqual({ colorScheme: 'light', reducedMotion: 'reduce' });
    expect(np.readSupportMediaPreferences(null)).toEqual({
      colorScheme: 'unknown',
      reducedMotion: 'unknown',
    });
  });

  test('bounds malformed values and never echoes representative sensitive input', () => {
    const sensitiveValues = [
      'https://customer.example/private?token=secret-value',
      'Authorization: Bearer support-secret',
      '{"password":"body-secret"}',
      'search=customer-name',
      'networkPlus.filterPresets.v1=/tenant/private',
      'Mozilla/5.0 device-42 Edg/131.0.2903.86',
      '/Users/customer/private.har',
    ];
    const summary = np.buildSafeSupportSummary({
      version: sensitiveValues[0],
      edgeMajor: sensitiveValues[5],
      osFamily: sensitiveValues[1],
      theme: sensitiveValues[2],
      retentionPolicy: sensitiveValues[3],
      retentionLimit: sensitiveValues[4],
      recording: sensitiveValues[6],
      localSample: sensitiveValues[0],
      colorScheme: sensitiveValues[1],
      reducedMotion: sensitiveValues[2],
      state: { rows: sensitiveValues },
      rows: sensitiveValues,
      userAgent: sensitiveValues[5],
      storage: sensitiveValues[4],
    });

    for (const sensitiveValue of sensitiveValues) {
      expect(summary).not.toContain(sensitiveValue);
    }
    expect(summary).toContain('Network+ version: unknown');
    expect(summary).toContain('Browser: Microsoft Edge unknown');
    expect(summary).toContain('OS family: Other/unknown');
    expect(summary).toContain('Theme: unknown');
    expect(summary).toContain('Retention: unknown');
    expect(summary).toContain('Recording: unknown');
    expect(summary).toContain('Local sample: unknown');
    expect(summary).toContain('Preferred color scheme: unknown');
    expect(summary).toContain('Reduced motion preference: unknown');
    expect(summary).not.toMatch(
      /(?:URL|Domain|Path|Query|Header|Cookie|Body|Status|Method|Timing|Size|Search|Filter|Preset|Selection|Storage|Error|Log|User-Agent|Platform|Account|Customer|Tenant|Device|Credential|File path):/i,
    );
  });

  test('never returns full browser versions or raw environment strings from parsers', () => {
    const injectedUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) customer=contoso.example Edg/131.0.2903.86 Authorization=secret';
    const edgeMajor = np.parseEdgeMajor(null, injectedUa);
    const osFamily = np.parseOsFamily(null, injectedUa);
    const summary = np.buildSafeSupportSummary({ ...validInput, edgeMajor, osFamily });

    expect(edgeMajor).toBe('131');
    expect(osFamily).toBe('macOS');
    expect(summary).not.toContain('131.0.2903.86');
    expect(summary).not.toContain('contoso.example');
    expect(summary).not.toContain('Authorization=secret');
  });

  test('fails malformed environment getters closed without echoing or throwing', () => {
    const hostileInput = {};
    for (const key of Object.keys(validInput)) {
      Object.defineProperty(hostileInput, key, {
        get() {
          throw new Error(`do-not-echo-${key}`);
        },
      });
    }
    const hostileBrand = {};
    Object.defineProperty(hostileBrand, 'brand', {
      get() {
        throw new Error('do-not-echo-brand');
      },
    });

    expect(np.parseEdgeMajor({ brands: [hostileBrand] }, '')).toBe('unknown');
    expect(np.buildSafeSupportSummary(hostileInput)).toBe(
      [
        'Network+ safe support summary',
        'Network+ version: unknown',
        'Browser: Microsoft Edge unknown',
        'OS family: Other/unknown',
        'Theme: unknown',
        'Retention: unknown',
        'Recording: unknown',
        'Local sample: unknown',
        'Preferred color scheme: unknown',
        'Reduced motion preference: unknown',
        '',
        'This summary intentionally excludes captured traffic. Review it before posting to a public issue.',
      ].join('\n'),
    );
  });
});

describe('guided local sample capture', () => {
  const baseTimestamp = Date.parse('2026-01-15T12:00:00.000Z');
  const createNavigationRows = () =>
    np.createSampleCaptureRequests(baseTimestamp).map((request, index) => {
      const row = np.buildRowFromRequest(request, [91, 7, 42][index]);
      row._captureSource = 'sample';
      return row;
    });

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

  test('derives the guide reveal from the deterministic sample request evidence', () => {
    const evidence = np.deriveSampleGuideEvidence(np.createSampleCaptureRequests(baseTimestamp));

    expect(evidence).toEqual({
      method: 'POST',
      path: '/v1/orders/preview',
      status: 503,
      totalDurationMs: 2450,
      dominantPhase: 'wait',
      dominantPhaseLabel: 'Wait (TTFB)',
      dominantDurationMs: 2200,
      retryHeaderName: 'Retry-After',
      retryAfter: '30',
      limitation: np.TIMING_EVIDENCE_LIMITATION,
    });
    expect(evidence.limitation).toMatch(/definitive root cause on the server/i);
    expect(np.deriveSampleGuideEvidence([])).toBeNull();
    expect(np.deriveSampleGuideEvidence(null)).toBeNull();
  });

  test('plans Timing and Headers destinations from the bounded sample signature rather than row order or ID', () => {
    const rows = createNavigationRows().reverse();
    const timingPlan = np.planSampleEvidenceNavigation({
      sampleCaptureActive: true,
      rows,
      destination: 'timing',
    });
    const headersPlan = np.planSampleEvidenceNavigation({
      sampleCaptureActive: true,
      rows,
      destination: 'headers',
    });

    expect(timingPlan).toEqual({
      available: true,
      reason: '',
      targetRow: expect.objectContaining({
        id: 7,
        method: 'POST',
        domain: 'checkout.network-plus.test',
        path: '/v1/orders/preview',
        status: 503,
      }),
      tabId: 'res-timing',
      tabLabel: 'Timing',
      blockingFilterIds: [],
    });
    expect(headersPlan.targetRow).toBe(timingPlan.targetRow);
    expect(headersPlan.tabId).toBe('res-headers');
    expect(headersPlan.tabLabel).toBe('Headers');
  });

  test('reports only the sample-local column filters that hide the retained target', () => {
    const rows = createNavigationRows();
    const rules = np.deserializeFilterState({
      domain: { mode: 'multiText', conditions: [{ op: 'contains', value: 'api.network-plus.test' }] },
      method: { mode: 'methodSet', include: { GET: true, POST: false } },
      status: { op: 'lt', value: '500' },
      url: { mode: 'urlAdvanced', includeAny: 'network-plus.test', includeAll: '', excludeAny: '' },
    });
    const snapshot = JSON.stringify(rules);
    const plan = np.planSampleEvidenceNavigation({
      sampleCaptureActive: true,
      rows,
      destination: 'timing',
      columns: [{ id: 'domain' }, { id: 'method' }, { id: 'status' }, { id: 'url' }],
      columnFilterRules: rules,
    });

    expect(plan.available).toBe(true);
    expect(plan.blockingFilterIds).toEqual(['domain', 'method', 'status']);
    expect(JSON.stringify(rules)).toBe(snapshot);
  });

  test('fails closed for missing, ambiguous, inactive, real, imported, or non-reserved targets', () => {
    const rows = createNavigationRows();
    const failedRow = rows.find((row) => row.status === 503);
    const withoutFailure = rows.filter((row) => row !== failedRow);

    expect(np.planSampleEvidenceNavigation({
      sampleCaptureActive: false,
      rows,
      destination: 'timing',
    })).toEqual(expect.objectContaining({
      available: false,
      reason: 'sample-inactive',
      targetRow: null,
    }));
    expect(np.planSampleEvidenceNavigation({
      sampleCaptureActive: true,
      rows: withoutFailure,
      destination: 'headers',
    })).toEqual(expect.objectContaining({
      available: false,
      reason: 'target-unavailable',
      tabId: 'res-headers',
    }));

    for (const captureSource of ['live', 'import']) {
      const isolatedRows = createNavigationRows();
      isolatedRows.find((row) => row.status === 503)._captureSource = captureSource;
      expect(np.planSampleEvidenceNavigation({
        sampleCaptureActive: true,
        rows: isolatedRows,
        destination: 'timing',
      }).reason).toBe('target-unavailable');
    }

    const nonReservedRows = createNavigationRows();
    nonReservedRows.find((row) => row.status === 503).url =
      'https://checkout.example.com/v1/orders/preview';
    expect(np.planSampleEvidenceNavigation({
      sampleCaptureActive: true,
      rows: nonReservedRows,
      destination: 'timing',
    }).reason).toBe('target-unavailable');

    const duplicate = { ...failedRow, id: 999 };
    expect(np.planSampleEvidenceNavigation({
      sampleCaptureActive: true,
      rows: rows.concat(duplicate),
      destination: 'timing',
    }).reason).toBe('target-ambiguous');
    expect(np.planSampleEvidenceNavigation({
      sampleCaptureActive: true,
      rows,
      destination: 'preview',
    })).toEqual(expect.objectContaining({
      available: false,
      reason: 'unsupported-destination',
      tabId: null,
    }));
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

  test('removes grid controls from the tab order only for capture-empty state', () => {
    expect(np.getGridControlTabIndex(0, 0)).toBe(-1);
    expect(np.getGridControlTabIndex(0, 3)).toBe(-1);
    expect(np.getGridControlTabIndex(3, 0)).toBe(0);
    expect(np.getGridControlTabIndex(3, 2)).toBe(0);
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

  test('plans an explicit exit only for the complete retained local sample signature', () => {
    const rows = createNavigationRows();

    expect(np.planSampleCaptureExit({
      sampleCaptureActive: true,
      rows,
    })).toEqual({
      available: true,
      reason: '',
      rows,
    });
    expect(np.planSampleCaptureExit({
      sampleCaptureActive: false,
      rows,
    })).toEqual({
      available: false,
      reason: 'sample-inactive',
      rows: [],
    });
    expect(np.planSampleCaptureExit({
      sampleCaptureActive: true,
      rows: rows.slice(0, 2),
    })).toEqual({
      available: false,
      reason: 'sample-incomplete',
      rows: [],
    });

    const importedRows = createNavigationRows();
    importedRows[0]._captureSource = 'import';
    expect(np.planSampleCaptureExit({
      sampleCaptureActive: true,
      rows: importedRows,
    }).reason).toBe('sample-provenance-mismatch');

    const alteredRows = createNavigationRows();
    alteredRows[0].url = 'https://api.example.com/v1/projects/demo?view=summary';
    expect(np.planSampleCaptureExit({
      sampleCaptureActive: true,
      rows: alteredRows,
    }).reason).toBe('sample-signature-mismatch');

    expect(np.planSampleCaptureExit({
      sampleCaptureActive: true,
      rows: [rows[0], rows[0], rows[2]],
    }).reason).toBe('sample-signature-mismatch');
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

describe('timing phase guidance', () => {
  test('defines each displayed phase without changing the timing calculation contract', () => {
    const expectedLabels = {
      blocked: 'Blocked',
      dns: 'DNS',
      connect: 'Connect',
      ssl: 'TLS (SSL)',
      send: 'Send',
      wait: 'Wait (TTFB)',
      receive: 'Receive',
    };
    for (const [phase, label] of Object.entries(expectedLabels)) {
      expect(np.getTimingPhaseGuidance(phase)).toEqual(
        expect.objectContaining({ label, description: expect.any(String) }),
      );
    }
    expect(np.getTimingPhaseGuidance('connect').description).toContain('not counted twice');
    expect(np.getTimingPhaseGuidance('wait').description).toContain('TTFB');
  });

  test('handles unknown phases and states the browser-evidence limitation', () => {
    expect(np.getTimingPhaseGuidance('unknown')).toBeNull();
    expect(np.getTimingPhaseGuidance(null)).toBeNull();
    expect(np.TIMING_EVIDENCE_LIMITATION).toMatch(/packet loss.*cabling or RF faults.*definitive root cause/i);
  });
});

describe('response content helpers', () => {
  const responseRowForPayloadTest = (id, getContent) => ({
    id,
    responseContent: null,
    responseContentEncoding: '',
    responseContentText: null,
    responseContentState: 'not-loaded',
    responseContentReason: '',
    responseContentError: null,
    _responseContentPromise: null,
    _responsePayloadPromise: null,
    _reqObj: { getContent },
  });

  test('decodes base64 only for display/search use', () => {
    expect(np.decodeResponseContent('eyJvayI6dHJ1ZX0=', 'base64')).toBe('{"ok":true}');
    expect(np.decodeResponseContent('plain text', '')).toBe('plain text');
    const unicodeText = 'caf\u00e9';
    const unicodeBase64 = Buffer.from(unicodeText, 'utf8').toString('base64');
    expect(np.decodeResponseContent(unicodeBase64, 'base64')).toBe(unicodeText);
    expect(np.decodeResponseContent(null, 'base64')).toBe('');
  });

  test('decodes base64 bodies with the declared charset instead of assuming UTF-8', () => {
    // "こんにちは" encoded as Shift_JIS bytes, then base64.
    const shiftJisBase64 = 'grGC8YLJgr+CzQ==';
    expect(np.decodeResponseContent(shiftJisBase64, 'base64', 'shift_jis')).toBe('こんにちは');
    // Without a charset the bytes are not valid UTF-8 and must not round-trip.
    expect(np.decodeResponseContent(shiftJisBase64, 'base64')).not.toBe('こんにちは');
    // Unknown labels fall back to UTF-8 without throwing.
    const utf8Base64 = Buffer.from('café', 'utf8').toString('base64');
    expect(np.decodeResponseContent(utf8Base64, 'base64', 'not-a-real-charset')).toBe('café');
    expect(np.decodeResponseContent(utf8Base64, 'base64', '')).toBe('café');
  });

  test('extractCharsetFromContentType parses charset parameters defensively', () => {
    expect(np.extractCharsetFromContentType('text/html; charset=Shift_JIS')).toBe('shift_jis');
    expect(np.extractCharsetFromContentType('application/json;charset=UTF-8')).toBe('utf-8');
    expect(np.extractCharsetFromContentType('text/html; charset="EUC-JP"')).toBe('euc-jp');
    expect(np.extractCharsetFromContentType('text/plain')).toBe('');
    expect(np.extractCharsetFromContentType('')).toBe('');
    expect(np.extractCharsetFromContentType(null)).toBe('');
    expect(np.extractCharsetFromContentType('text/html; charset = iso-2022-jp')).toBe('iso-2022-jp');
  });

  test('measureResponsePayload threads the charset into the decoded text', () => {
    const payload = np.measureResponsePayload('grGC8YLJgr+CzQ==', 'base64', 'shift_jis');
    expect(payload.text).toBe('こんにちは');
    expect(payload.encoding).toBe('base64');
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

  test('normalizes thrown callback registration and runtime failures as rejected payloads', async () => {
    const thrownRow = responseRowForPayloadTest(21, () => {
      throw new Error('registration unavailable');
    });
    await expect(np.fetchResponsePayload(thrownRow, 25)).rejects.toThrow(
      'Failed to retrieve response content for request 21: registration unavailable',
    );
    expect(thrownRow._responsePayloadPromise).toBeNull();

    const runtimeRow = responseRowForPayloadTest(22, (callback) => {
      chrome.runtime.lastError = { message: 'request content unavailable' };
      callback('', '');
      chrome.runtime.lastError = null;
    });
    await expect(np.fetchResponsePayload(runtimeRow, 25)).rejects.toThrow(
      'Failed to retrieve response content for request 22: request content unavailable',
    );
    expect(runtimeRow._responsePayloadPromise).toBeNull();
  });

  test('rejects payload measurement failures without stranding the request timeout or promise', async () => {
    const OriginalTextEncoder = global.TextEncoder;
    let contentCallback;
    global.TextEncoder = class BrokenTextEncoder {
      encode() {
        throw new Error('encoding unavailable');
      }
    };
    try {
      const row = responseRowForPayloadTest(23, (callback) => {
        contentCallback = callback;
      });
      const pending = np.fetchResponsePayload(row, 25);
      contentCallback('body', '');
      await expect(pending).rejects.toThrow(
        'Failed to process response content for request 23: encoding unavailable',
      );
      expect(row._responsePayloadPromise).toBeNull();
    } finally {
      global.TextEncoder = OriginalTextEncoder;
    }
  });
});

describe('automatic live response prefetch', () => {
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };
  const flushScheduler = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  const responseRow = (id, getContent) => ({
    id,
    responseContent: null,
    responseContentEncoding: '',
    responseContentText: null,
    responseContentState: 'not-loaded',
    responseContentReason: '',
    responseContentError: null,
    _responseContentPromise: null,
    _responsePayloadPromise: null,
    _reqObj: { getContent },
  });

  test('drains a 5,000-row burst FIFO with exactly four background operations and bounded storage', async () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({ id: index + 1 }));
    const activeRows = new Set(rows);
    const started = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const scheduler = np.createAutomaticResponsePrefetchScheduler({
      isEligible: (row) => activeRows.has(row),
      loadRow: (row) => {
        started.push(row.id);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return Promise.resolve(row).finally(() => {
          inFlight -= 1;
        });
      },
    });

    expect(scheduler.enqueue(rows[0])).toBe(true);
    expect(scheduler.enqueue(rows[0])).toBe(false);
    for (let index = 1; index < rows.length; index++) scheduler.enqueue(rows[index]);

    expect(started).toEqual([1, 2, 3, 4]);
    expect(scheduler.getSnapshot()).toEqual(
      expect.objectContaining({
        queued: 4996,
        queueStorage: 4996,
        backgroundInFlight: 4,
      }),
    );
    await scheduler.whenIdle();

    expect(maxInFlight).toBe(4);
    expect(started).toEqual(rows.map((row) => row.id));
    expect(scheduler.getSnapshot()).toEqual(
      expect.objectContaining({
        queued: 0,
        queueStorage: 0,
        backgroundInFlight: 0,
      }),
    );
  });

  test('skips queued rows that become inactive and suppresses stale settlement callbacks', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ id: index + 1 }));
    const activeRows = new Set(rows);
    const pending = new Map();
    const started = [];
    const settled = [];
    const scheduler = np.createAutomaticResponsePrefetchScheduler({
      isEligible: (row) => activeRows.has(row),
      loadRow: (row) => {
        const operation = deferred();
        pending.set(row, operation);
        started.push(row.id);
        return operation.promise;
      },
      onSettled: (row) => settled.push(row.id),
    });
    for (const row of rows) scheduler.enqueue(row);

    activeRows.delete(rows[0]);
    activeRows.delete(rows[4]);
    pending.get(rows[0]).resolve(rows[0]);
    await flushScheduler();

    expect(started).toEqual([1, 2, 3, 4, 6]);
    expect(settled).not.toContain(1);
    expect(started).not.toContain(5);

    scheduler.cancelRows(rows);
    for (const operation of pending.values()) operation.resolve();
    await scheduler.whenIdle();
    expect(settled).not.toContain(5);
  });

  test('releases queued references across Clear, import, and sample replacement transitions', async () => {
    const oldRows = Array.from({ length: 5000 }, (_, index) => ({ id: index + 1 }));
    const replacementRows = [{ id: 5001 }, { id: 5002 }];
    const activeRows = new Set(oldRows);
    const pending = new Map();
    const settled = [];
    const scheduler = np.createAutomaticResponsePrefetchScheduler({
      isEligible: (row) => activeRows.has(row),
      loadRow: (row) => {
        const operation = deferred();
        pending.set(row, operation);
        return operation.promise;
      },
      onSettled: (row) => settled.push(row.id),
    });
    for (const row of oldRows) scheduler.enqueue(row);

    activeRows.clear();
    scheduler.cancelRows(oldRows);
    expect(scheduler.getSnapshot()).toEqual(
      expect.objectContaining({
        queued: 0,
        queueStorage: 0,
        backgroundInFlight: 4,
      }),
    );

    for (const row of replacementRows) {
      activeRows.add(row);
      scheduler.enqueue(row);
    }
    for (const row of oldRows.slice(0, 4)) pending.get(row).resolve(row);
    await flushScheduler();
    expect(settled).toEqual([]);
    expect(Array.from(pending.keys()).filter((row) => replacementRows.includes(row))).toHaveLength(2);

    for (const row of replacementRows) pending.get(row).resolve(row);
    await scheduler.whenIdle();
    expect(settled).toEqual([5001, 5002]);
  });

  test('resumes canceled in-flight and queued work in original order after Undo', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ id: index + 1 }));
    const activeRows = new Set(rows);
    const pending = new Map();
    const started = [];
    const settled = [];
    const scheduler = np.createAutomaticResponsePrefetchScheduler({
      isEligible: (row) => activeRows.has(row),
      loadRow: (row) => {
        const operation = deferred();
        pending.set(row, operation);
        started.push(row.id);
        return operation.promise;
      },
      onSettled: (row) => settled.push(row.id),
    });
    for (const row of rows) scheduler.enqueue(row);
    expect(started).toEqual([1, 2, 3, 4]);

    activeRows.clear();
    scheduler.cancelRows(rows);
    for (const row of rows) activeRows.add(row);
    scheduler.resumeRows(rows);
    expect(scheduler.getSnapshot()).toEqual(
      expect.objectContaining({
        queued: 2,
        backgroundInFlight: 4,
      }),
    );

    for (const row of rows.slice(0, 4)) pending.get(row).resolve(row);
    await flushScheduler();
    expect(started).toEqual([1, 2, 3, 4, 5, 6]);
    pending.get(rows[4]).resolve(rows[4]);
    pending.get(rows[5]).resolve(rows[5]);
    await scheduler.whenIdle();
    expect(settled).toEqual(rows.map((row) => row.id));
  });

  test('handles retention pressure without starting any of the 100 evicted rows', async () => {
    const rows = Array.from({ length: 5100 }, (_, index) => ({ id: index + 1 }));
    const activeRows = new Set(rows.slice(0, 5000));
    const pending = new Map();
    const started = [];
    const scheduler = np.createAutomaticResponsePrefetchScheduler({
      isEligible: (row) => activeRows.has(row),
      loadRow: (row) => {
        const operation = deferred();
        pending.set(row, operation);
        started.push(row.id);
        return operation.promise;
      },
    });
    for (const row of rows.slice(0, 5000)) scheduler.enqueue(row);

    const evictedRows = rows.slice(0, 100);
    for (const row of evictedRows) activeRows.delete(row);
    scheduler.cancelRows(evictedRows);
    for (const row of rows.slice(5000)) {
      activeRows.add(row);
      scheduler.enqueue(row);
    }
    expect(scheduler.getSnapshot()).toEqual(
      expect.objectContaining({
        queued: 5000,
        backgroundInFlight: 4,
      }),
    );

    for (const row of rows.slice(0, 4)) pending.get(row).resolve(row);
    await flushScheduler();
    expect(started.slice(4)).toEqual([101, 102, 103, 104]);
    expect(started.filter((id) => id <= 100)).toEqual([1, 2, 3, 4]);
    expect(scheduler.getSnapshot().backgroundInFlight).toBe(4);

    activeRows.clear();
    scheduler.cancelRows(rows);
    for (const operation of pending.values()) operation.resolve();
    await scheduler.whenIdle();
    expect(scheduler.getSnapshot().queueStorage).toBe(0);
  });

  test('recovers every slot after timeout and permits an explicit retry', async () => {
    jest.useFakeTimers();
    try {
      const rows = Array.from({ length: 5 }, (_, index) =>
        responseRow(index + 1, jest.fn()),
      );
      const activeRows = new Set(rows);
      const scheduler = np.createAutomaticResponsePrefetchScheduler({
        isEligible: (row) => activeRows.has(row),
        loadRow: (row) => np.cacheResponseContent(row, 25),
        shouldReportFailure: () => false,
      });
      for (const row of rows) scheduler.enqueue(row);

      expect(rows.reduce((total, row) => total + row._reqObj.getContent.mock.calls.length, 0)).toBe(4);
      await jest.advanceTimersByTimeAsync(25);
      expect(rows.reduce((total, row) => total + row._reqObj.getContent.mock.calls.length, 0)).toBe(5);
      expect(scheduler.getSnapshot().backgroundInFlight).toBe(1);
      await jest.advanceTimersByTimeAsync(25);
      await scheduler.whenIdle();
      for (const row of rows) {
        expect(row._responseContentPromise).toBeNull();
        expect(row._responsePayloadPromise).toBeNull();
      }

      rows[0]._reqObj.getContent.mockImplementation((callback) => callback('retry succeeded', ''));
      expect(scheduler.enqueue(rows[0])).toBe(true);
      await scheduler.whenIdle();
      expect(rows[0]._reqObj.getContent).toHaveBeenCalledTimes(2);
      expect(rows[0].responseContent).toBe('retry succeeded');
    } finally {
      jest.useRealTimers();
    }
  });

  test('drains after synchronous throws and rejected loads without unhandled rejection', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: index + 1 }));
    const started = [];
    const settled = [];
    const scheduler = np.createAutomaticResponsePrefetchScheduler({
      isEligible: () => true,
      loadRow: (row) => {
        started.push(row.id);
        if (row.id === 1) throw new Error('registration failed');
        if (row.id === 2) return Promise.reject(new Error('runtime failed'));
        return Promise.resolve(row);
      },
      shouldReportFailure: () => false,
      onSettled: (row, error) => settled.push([row.id, error ? error.message : 'ok']),
    });
    for (const row of rows) scheduler.enqueue(row);

    await scheduler.whenIdle();
    expect(started).toEqual(rows.map((row) => row.id));
    expect(settled).toEqual([
      [1, 'registration failed'],
      [2, 'runtime failed'],
      [3, 'ok'],
      [4, 'ok'],
      [5, 'ok'],
      [6, 'ok'],
      [7, 'ok'],
      [8, 'ok'],
    ]);
    expect(scheduler.getSnapshot().backgroundInFlight).toBe(0);
  });

  test('lets foreground work overlap four background slots and reuses each queued row promise', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => {
      let row;
      const getContent = jest.fn((callback) => {
        row.active = true;
        row.callback = callback;
      });
      row = responseRow(index + 1, getContent);
      return row;
    });
    const activeRows = new Set(rows);
    let currentTotal = 0;
    let maxTotal = 0;
    for (const row of rows) {
      const original = row._reqObj.getContent;
      row._reqObj.getContent = jest.fn((callback) => {
        currentTotal += 1;
        maxTotal = Math.max(maxTotal, currentTotal);
        original((content, encoding) => {
          currentTotal -= 1;
          callback(content, encoding);
        });
      });
    }
    const scheduler = np.createAutomaticResponsePrefetchScheduler({
      isEligible: (row) => activeRows.has(row),
      loadRow: (row) => np.cacheResponseContent(row),
    });
    for (const row of rows) scheduler.enqueue(row);

    const foreground = rows.slice(4).map((row) => {
      const promise = np.cacheResponseContent(row);
      expect(scheduler.observeForeground(row, promise)).toBe(true);
      expect(scheduler.enqueue(row)).toBe(false);
      return promise;
    });
    expect(scheduler.getSnapshot()).toEqual(
      expect.objectContaining({
        queued: 0,
        backgroundInFlight: 4,
        foregroundObserved: 2,
      }),
    );
    expect(maxTotal).toBe(6);

    for (const row of rows) row.callback('body-' + row.id, '');
    await Promise.all(foreground);
    await scheduler.whenIdle();
    expect(maxTotal).toBe(6);
    for (const row of rows) expect(row._reqObj.getContent).toHaveBeenCalledTimes(1);
  });

  test('observes a queued foreground timeout without automatically calling getContent again', async () => {
    jest.useFakeTimers();
    try {
      const callbacks = [];
      const backgroundRows = Array.from({ length: 4 }, (_, index) =>
        responseRow(index + 1, jest.fn((callback) => callbacks.push(callback))),
      );
      const foregroundGetContent = jest
        .fn()
        .mockImplementationOnce(() => {})
        .mockImplementationOnce((callback) => callback('foreground retry', ''));
      const foregroundRow = responseRow(5, foregroundGetContent);
      const rows = backgroundRows.concat(foregroundRow);
      const summary = jest.fn();
      const scheduler = np.createAutomaticResponsePrefetchScheduler({
        isEligible: () => true,
        loadRow: (row) => np.cacheResponseContent(row, 100),
        onFailureSummary: summary,
      });
      for (const row of rows) scheduler.enqueue(row);

      const foreground = np.cacheResponseContent(foregroundRow, 25);
      expect(scheduler.observeForeground(foregroundRow, foreground)).toBe(true);
      await jest.advanceTimersByTimeAsync(25);
      await expect(foreground).rejects.toThrow('Timed out retrieving response content');
      expect(foregroundGetContent).toHaveBeenCalledTimes(1);
      expect(scheduler.getSnapshot().queued).toBe(0);
      expect(summary).not.toHaveBeenCalled();

      await expect(np.cacheResponseContent(foregroundRow, 25)).resolves.toBe(foregroundRow);
      expect(foregroundGetContent).toHaveBeenCalledTimes(2);

      for (const callback of callbacks) callback('background response', '');
      await scheduler.whenIdle();
    } finally {
      jest.useRealTimers();
    }
  });

  test('shares one underlying getContent call between HAR preparation and detail caching', async () => {
    let callback;
    const getContent = jest.fn((contentCallback) => {
      callback = contentCallback;
    });
    const row = responseRow(12, getContent);

    const harContent = np.resolveHarResponseContent(row);
    const detailContent = np.cacheResponseContent(row);
    expect(getContent).toHaveBeenCalledTimes(1);
    callback('shared response', '');

    await expect(harContent).resolves.toEqual(
      expect.objectContaining({ text: 'shared response' }),
    );
    await expect(detailContent).resolves.toBe(row);
    expect(getContent).toHaveBeenCalledTimes(1);
    expect(row.responseContent).toBe('shared response');
  });

  test('coalesces burst failures into one sanitized count summary', async () => {
    jest.useFakeTimers();
    try {
      const rows = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));
      const summaries = [];
      const scheduler = np.createAutomaticResponsePrefetchScheduler({
        isEligible: () => true,
        loadRow: (row) =>
          Promise.reject(new Error('secret response detail for request ' + row.id)),
        failureAnnounceMs: 25,
        onFailureSummary: (count) =>
          summaries.push(np.formatAutomaticResponsePrefetchFailureSummary(count)),
      });
      for (const row of rows) scheduler.enqueue(row);
      await scheduler.whenIdle();

      expect(summaries).toEqual([]);
      expect(scheduler.getSnapshot().pendingFailureCount).toBe(7);
      await jest.advanceTimersByTimeAsync(25);
      expect(summaries).toEqual([
        '7 body prefetches failed. Selecting a request retries its body.',
      ]);
      expect(summaries[0]).not.toContain('secret response detail');
    } finally {
      jest.useRealTimers();
    }
  });

  test('drops removed and recovered rows from a pending failure summary', async () => {
    jest.useFakeTimers();
    try {
      const rows = Array.from({ length: 3 }, (_, index) => ({ id: index + 1 }));
      const activeRows = new Set(rows);
      const summaries = [];
      const scheduler = np.createAutomaticResponsePrefetchScheduler({
        isEligible: (row) => activeRows.has(row),
        loadRow: () => Promise.reject(new Error('background failure')),
        failureAnnounceMs: 25,
        onFailureSummary: (count) => summaries.push(count),
      });
      for (const row of rows) scheduler.enqueue(row);
      await scheduler.whenIdle();
      activeRows.delete(rows[0]);
      scheduler.cancelRows([rows[0]]);
      expect(scheduler.markRecovered(rows[1])).toBe(true);

      await jest.advanceTimersByTimeAsync(25);
      expect(summaries).toEqual([1]);
      expect(scheduler.getSnapshot().pendingFailureCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('uses trailing debounce with a max wait for continuous failures', async () => {
    jest.useFakeTimers();
    try {
      const summaries = [];
      const scheduler = np.createAutomaticResponsePrefetchScheduler({
        isEligible: () => true,
        loadRow: () => Promise.reject(new Error('background failure')),
        failureAnnounceMs: 20,
        failureMaxWaitMs: 50,
        getFailureContext: () => 'status-generation-4',
        onFailureSummary: (count, context) => summaries.push([count, context]),
      });

      scheduler.enqueue({ id: 1 });
      await flushScheduler();
      await jest.advanceTimersByTimeAsync(15);
      scheduler.enqueue({ id: 2 });
      await flushScheduler();
      await jest.advanceTimersByTimeAsync(15);
      scheduler.enqueue({ id: 3 });
      await flushScheduler();
      await jest.advanceTimersByTimeAsync(15);
      expect(summaries).toEqual([]);
      await jest.advanceTimersByTimeAsync(5);
      expect(summaries).toEqual([[3, 'status-generation-4']]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('capture retention helpers', () => {
  const rows = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

  test('publishes the safe default and exact response budgets', () => {
    expect(np.DEFAULT_REQUEST_RETENTION_LIMIT).toBe(20000);
    expect(np.AUTOMATIC_RESPONSE_PREFETCH_QUEUE_COMPACT_THRESHOLD).toBe(512);
    expect(np.MAX_RESPONSE_BODY_BYTES).toBe(1024 * 1024);
    expect(np.MAX_RESPONSE_CACHE_BYTES).toBe(32 * 1024 * 1024);
  });

  test('normalizes bounded and explicit unlimited settings without silent invalid fallback', () => {
    expect(np.normalizeRetentionSetting({ requestLimit: 2500, unlimited: false })).toEqual({
      setting: { requestLimit: 2500, unlimited: false },
      warning: '',
    });
    expect(np.normalizeRetentionSetting({ requestLimit: 0, unlimited: true })).toEqual({
      setting: { requestLimit: 20000, unlimited: true },
      warning: '',
    });
    const invalid = np.normalizeRetentionSetting({ requestLimit: 99, unlimited: false });
    expect(invalid.setting).toEqual({ requestLimit: 20000, unlimited: false });
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

  test('keeps one 5,000-row live frame batch identity-equivalent to iterative retention', () => {
    const retained = rows(5000);
    const incoming = Array.from({ length: 100 }, (_, index) => ({ id: 5001 + index }));
    let iterativeRows = retained;
    const iterativeEvictions = [];
    for (const row of incoming) {
      const plan = np.planClearUndoRetention([], iterativeRows, [row], 5000, false);
      iterativeRows = plan.retainedActiveRows;
      iterativeEvictions.push(...plan.evictedRows);
    }

    const batched = np.planClearUndoRetention([], retained, incoming, 5000, false);

    expect(batched.retainedActiveRows).toHaveLength(5000);
    expect(batched.evictedRows).toHaveLength(100);
    expect(batched.retainedActiveRows.every((row, index) => row === iterativeRows[index])).toBe(true);
    expect(batched.evictedRows.every((row, index) => row === iterativeEvictions[index])).toBe(true);
    expect(batched.evictedRows[0]).toBe(retained[0]);
    expect(batched.evictedRows.at(-1)).toBe(retained[99]);
    expect(batched.retainedIncomingRows.every((row, index) => row === incoming[index])).toBe(true);
  });

  test('counts held Clear rows inside retention and evicts them before newer active traffic', () => {
    const held = rows(3);
    const active = [{ id: 4 }];
    const incoming = [{ id: 5 }, { id: 6 }];
    const plan = np.planClearUndoRetention(held, active, incoming, 4, false);

    expect(plan.evictedRows).toEqual([held[0], held[1]]);
    expect(plan.retainedHeldRows).toEqual([held[2]]);
    expect(plan.retainedActiveRows).toEqual(active.concat(incoming));
    expect(plan.retainedIncomingRows).toEqual(incoming);
    expect(plan.retainedHeldRows[0]).toBe(held[2]);
    expect(np.planClearUndoRetention(held, active, incoming, 1, true)).toEqual({
      retainedHeldRows: held,
      retainedActiveRows: active.concat(incoming),
      retainedIncomingRows: incoming,
      evictedRows: [],
    });
  });

  test('makes Undo one-shot and isolates a cleared sample from the first live row', () => {
    const normalSnapshot = { sampleCaptureActive: false };
    const sampleSnapshot = { sampleCaptureActive: true };

    expect(np.CLEAR_UNDO_TIMEOUT_MS).toBe(10000);
    expect(np.planClearUndoAction(normalSnapshot, 'undo')).toEqual({
      disposition: 'restore',
      consume: true,
    });
    expect(np.planClearUndoAction(normalSnapshot, 'live')).toEqual({
      disposition: 'keep',
      consume: false,
    });
    expect(np.planClearUndoAction(sampleSnapshot, 'live')).toEqual({
      disposition: 'dispose',
      consume: true,
    });
    for (const action of ['clear', 'import', 'sample', 'timeout', 'retention-exhausted']) {
      expect(np.planClearUndoAction(normalSnapshot, action)).toEqual({
        disposition: 'dispose',
        consume: true,
      });
    }
    expect(np.planClearUndoAction(null, 'undo')).toEqual({
      disposition: 'none',
      consume: false,
    });
  });

  test('formats restored and released request counts truthfully', () => {
    expect(np.formatRequestCount(0)).toBe('0 requests');
    expect(np.formatRequestCount(1)).toBe('1 request');
    expect(np.formatRequestCount(5)).toBe('5 requests');
  });

  test('restores only retained row identities while rebuilding the prior working context', () => {
    const [evicted, retained, disposed] = rows(3);
    disposed._retentionDisposed = true;
    const filterRules = np.deserializeFilterState({
      status: { op: 'gte', value: '400' },
    });
    const previousSampleFilters = np.deserializeFilterState({
      domain: { mode: 'multiText', conditions: [{ op: 'contains', value: '.test' }] },
    });
    const snapshot = {
      rows: [evicted, retained, disposed],
      originalCount: 3,
      context: {
        columnFilterRules: filterRules,
        searchKeywords: [{ query: 'failure', colorIdx: 2 }],
        searchScope: {
          url: false,
          reqBody: true,
          resBody: true,
          reqHeaders: false,
          resHeaders: true,
        },
        searchCurrentRow: retained,
        searchPerKeywordCurrentRows: [[0, retained], [1, disposed]],
        selectedRow: evicted,
        focusedRow: retained,
        selectedRows: [evicted, retained],
        highlightedRows: [[evicted, 'hl-red'], [retained, 'hl-green']],
        comparedRows: [evicted, retained],
        comparisonInvokingRowId: String(retained.id),
        sort: { colId: 'duration', direction: 'desc' },
        paused: true,
        autoScroll: false,
        sampleCaptureActive: true,
        sampleCapturePreviousPaused: false,
        sampleCapturePreviousColumnFilterRules: previousSampleFilters,
        searchPanelVisible: true,
      },
    };

    const plan = np.createClearUndoRestorePlan(snapshot, new Set([retained, disposed]));

    expect(plan.rows).toEqual([retained]);
    expect(plan.rows[0]).toBe(retained);
    expect(plan.originalCount).toBe(3);
    expect(plan.selectedRow).toBeNull();
    expect(plan.focusedRow).toBe(retained);
    expect(plan.selectedRows).toEqual([retained]);
    expect(plan.highlightedRows).toEqual([[retained, 'hl-green']]);
    expect(plan.comparedRows).toBeNull();
    expect(plan.searchCurrentRow).toBe(retained);
    expect(plan.searchPerKeywordCurrentRows).toEqual([[0, retained]]);
    expect(plan.columnFilterRules).toEqual(filterRules);
    expect(plan.columnFilterRules).not.toBe(filterRules);
    expect(plan.searchKeywords).toEqual([{ query: 'failure', colorIdx: 2 }]);
    expect(plan.searchKeywords[0]).not.toBe(snapshot.context.searchKeywords[0]);
    expect(plan.searchScope.url).toBe(false);
    expect(plan.sort).toEqual({ colId: 'duration', direction: 'desc' });
    expect(plan).toEqual(expect.objectContaining({
      paused: true,
      autoScroll: false,
      sampleCaptureActive: true,
      sampleCapturePreviousPaused: false,
      searchPanelVisible: true,
    }));
    expect(plan.sampleCapturePreviousColumnFilterRules).toEqual(previousSampleFilters);
    expect(plan.sampleCapturePreviousColumnFilterRules).not.toBe(previousSampleFilters);
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
  test('identifies Waterfall as a visual-only column', () => {
    expect(np.isVisualOnlyColumn('waterfall')).toBe(true);
    expect(np.isVisualOnlyColumn('duration')).toBe(false);
    expect(np.isVisualOnlyColumn(null)).toBe(false);
  });

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

  test('counts value-less multiText conditions as active', () => {
    expect(np.isRuleActive({ mode: 'multiText', conditions: [{ op: 'empty', value: '' }] })).toBe(true);
    expect(np.isRuleActive({ mode: 'multiText', conditions: [{ op: 'notempty', value: '' }] })).toBe(true);
  });

  test('identifies value-less filter operators', () => {
    expect(np.isValuelessFilterOperator('empty')).toBe(true);
    expect(np.isValuelessFilterOperator('notempty')).toBe(true);
    expect(np.isValuelessFilterOperator('contains')).toBe(false);
    expect(np.isValuelessFilterOperator('')).toBe(false);
    expect(np.isValuelessFilterOperator(undefined)).toBe(false);
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
      waterfall: { op: 'notempty', value: '' },
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

  test('supports empty / notempty inside multiText conditions', () => {
    const emptyRule = { mode: 'multiText', conditions: [{ op: 'empty', value: '' }] };
    expect(np.evaluateFilterRule('', emptyRule, false)).toBe(true);
    expect(np.evaluateFilterRule('contoso.com', emptyRule, false)).toBe(false);

    const notEmptyRule = { mode: 'multiText', conditions: [{ op: 'notempty', value: '' }] };
    expect(np.evaluateFilterRule('contoso.com', notEmptyRule, false)).toBe(true);
    expect(np.evaluateFilterRule('', notEmptyRule, false)).toBe(false);
  });

  test('combines value-less and text multiText conditions with AND semantics', () => {
    const rule = {
      mode: 'multiText',
      conditions: [
        { op: 'notempty', value: '' },
        { op: 'contains', value: 'api' },
      ],
    };
    expect(np.evaluateFilterRule('api.contoso.com', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('www.contoso.com', rule, false)).toBe(false);
    expect(np.evaluateFilterRule('', rule, false)).toBe(false);
  });

  test('still treats blank-value text multiText conditions as match-all', () => {
    const rule = { mode: 'multiText', conditions: [{ op: 'contains', value: '   ' }] };
    expect(np.evaluateFilterRule('anything', rule, false)).toBe(true);
    expect(np.evaluateFilterRule('', rule, false)).toBe(true);
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
  test.each([
    ['Windows Ctrl+L', { key: 'l', ctrlKey: true }, 'Win32'],
    ['Linux Ctrl+L', { key: 'L', ctrlKey: true }, 'Linux x86_64'],
    ['macOS Cmd+K', { key: 'k', metaKey: true }, 'macOS'],
    ['legacy macOS Cmd+K', { key: 'K', metaKey: true }, 'MacIntel'],
  ])('recognizes the platform clear shortcut on %s', (_label, event, platform) => {
    expect(np.isClearNetworkLogShortcut(event, platform)).toBe(true);
  });

  test.each([
    ['Ctrl+L on macOS', { key: 'l', ctrlKey: true }, 'MacIntel'],
    ['Cmd+K on Windows', { key: 'k', metaKey: true }, 'Win32'],
    ['Ctrl+F', { key: 'f', ctrlKey: true }, 'Win32'],
    ['Cmd+F', { key: 'f', metaKey: true }, 'MacIntel'],
    ['extra Shift modifier', { key: 'l', ctrlKey: true, shiftKey: true }, 'Win32'],
    ['extra Alt modifier', { key: 'k', metaKey: true, altKey: true }, 'MacIntel'],
    ['both primary modifiers', { key: 'l', ctrlKey: true, metaKey: true }, 'Win32'],
    ['repeated keydown', { key: 'l', ctrlKey: true, repeat: true }, 'Win32'],
    ['composing keydown', { key: 'k', metaKey: true, isComposing: true }, 'MacIntel'],
  ])('rejects %s as a clear shortcut', (_label, event, platform) => {
    expect(np.isClearNetworkLogShortcut(event, platform)).toBe(false);
  });

  test('accepts Ctrl+Shift+M / ⌘+Shift+M as the pop-out shortcut', () => {
    expect(np.isPopoutShortcut({ key: 'M', ctrlKey: true, shiftKey: true }, 'Win32')).toBe(true);
    expect(np.isPopoutShortcut({ key: 'm', metaKey: true, shiftKey: true }, 'MacIntel')).toBe(true);
  });

  test.each([
    ['a missing shift', { key: 'm', ctrlKey: true }, 'Win32'],
    ['the wrong primary modifier', { key: 'm', metaKey: true, shiftKey: true }, 'Win32'],
    ['both primary modifiers', { key: 'm', ctrlKey: true, metaKey: true, shiftKey: true }, 'MacIntel'],
    ['an alt chord', { key: 'm', ctrlKey: true, shiftKey: true, altKey: true }, 'Win32'],
    ['a repeated keydown', { key: 'm', ctrlKey: true, shiftKey: true, repeat: true }, 'Win32'],
    ['a composing keydown', { key: 'm', metaKey: true, shiftKey: true, isComposing: true }, 'MacIntel'],
  ])('rejects %s as the pop-out shortcut', (_label, event, platform) => {
    expect(np.isPopoutShortcut(event, platform)).toBe(false);
  });

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
    expect(sanitized.items).toHaveLength(5);
    expect(Object.keys(sanitized.flow).sort()).toEqual(['nonce', 'session', 'sid', 'state']);
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
    expect(np.getExtensionVersion({ getManifest: () => { throw new Error('runtime-failed'); } })).toBe('1.11.0');
    expect(np.getExtensionVersion(null)).toBe('1.11.0');
  });

  test('uses the current extension version for full and sanitized HAR creators', () => {
    const row = makeSensitiveRow();
    const fullHar = np.buildHarLogFromRows([row], new Map([[row, np.buildHarResponseContent(row)]]));
    expect(fullHar.log.creator.version).toBe('1.11.0');
    expect(np.sanitizeHar(fullHar).log.creator.version).toBe('1.11.0');
  });
});

describe('method row classes', () => {
  test.each([
    ['GET', ['method-GET']],
    ['get', ['method-GET']],
    ['BREW', []],
  ])('renders method %s with row method classes %p', (method, expectedClasses) => {
    const renderedRow = np.createTableRow({ id: method, method }, jest.fn(), false);
    const methodClasses = renderedRow.classList.add.mock.calls
      .flat()
      .filter((className) => className.startsWith('method-'));

    expect(methodClasses).toEqual(expectedClasses);
  });
});

describe('status class statistics', () => {
  test.each([
    [200, '2xx'],
    [299, '2xx'],
    [300, '3xx'],
    [399, '3xx'],
    [400, '4xx'],
    [499, '4xx'],
    [500, '5xx'],
    [599, '5xx'],
  ])('classifies %p as %s', (status, expected) => {
    expect(np.classifyStatusClass(status)).toBe(expected);
  });

  test.each([undefined, null, '200', 200.5, 199, 600, NaN, Infinity, {}, []])(
    'classifies malformed or unsupported status %p as other',
    (status) => {
      expect(np.classifyStatusClass(status)).toBe('other');
    },
  );

  test('builds ordered semantic indicator descriptors without trusting malformed counts', () => {
    expect(np.getStatusClassIndicators({ '2xx': 4, '3xx': -1, '4xx': 2.5, '5xx': 1, other: 3 })).toEqual([
      { statusClass: '2xx', count: 4, text: '2xx 4' },
      { statusClass: '3xx', count: 0, text: '3xx 0' },
      { statusClass: '4xx', count: 0, text: '4xx 0' },
      { statusClass: '5xx', count: 1, text: '5xx 1' },
      { statusClass: 'other', count: 3, text: 'other 3' },
    ]);
  });

  test.each([
    [599, ['status-5xx']],
    [600, []],
  ])('renders status %p with row status classes %p', (status, expectedClasses) => {
    const renderedRow = np.createTableRow({ id: status, status }, jest.fn(), false);
    const statusClasses = renderedRow.classList.add.mock.calls
      .flat()
      .filter((className) => /^status-\dxx$/.test(className));

    expect(statusClasses).toEqual(expectedClasses);
  });

  test('formats a compact textual summary in status-class order', () => {
    expect(
      np.formatStatusClassSummary({ '2xx': 4, '3xx': 3, '4xx': 2, '5xx': 1, other: 5 }),
    ).toBe('status 2xx 4 · 3xx 3 · 4xx 2 · 5xx 1 · other 5');
  });

  test('finds the first matching status-class row in the supplied visible order', () => {
    const visibleSortedRows = [
      { id: 'latest-2xx', status: 204 },
      { id: 'first-5xx', status: 503 },
      { id: 'second-5xx', status: 500 },
      { id: 'other-status' },
    ];

    expect(np.findFirstStatusClassRow(visibleSortedRows, '5xx')).toBe(visibleSortedRows[1]);
    expect(np.findFirstStatusClassRow(visibleSortedRows, 'other')).toBe(visibleSortedRows[3]);
    expect(np.findFirstStatusClassRow(visibleSortedRows, '1xx')).toBeNull();
    expect(np.findFirstStatusClassRow([null, undefined], 'other')).toBeNull();
    expect(visibleSortedRows.map((row) => row.id)).toEqual([
      'latest-2xx',
      'first-5xx',
      'second-5xx',
      'other-status',
    ]);
  });

  test('renders non-empty status classes as accessible inspection buttons', () => {
    const statsElement = { textContent: '', appendChild: jest.fn() };
    const onInspect = jest.fn();
    document.createElement.mockClear();

    np.renderStatsSummary(
      statsElement,
      {
        statusClassCounts: { '2xx': 2, '3xx': 0, '4xx': 0, '5xx': 1, other: 0 },
        avgDuration: 25,
        minDuration: 10,
        maxDuration: 40,
      },
      onInspect,
    );

    const createdElements = document.createElement.mock.calls.map((call, index) => ({
      tagName: call[0],
      element: document.createElement.mock.results[index].value,
    }));
    const fiveHundreds = createdElements.find(({ element }) =>
      element.className.includes('status-summary-chip--5xx'),
    );
    const redirects = createdElements.find(({ element }) =>
      element.className.includes('status-summary-chip--3xx'),
    );
    const accessibleSummary = createdElements.find(
      ({ element }) => element.className === 'sr-only status-summary-accessible',
    ).element;

    expect(fiveHundreds.tagName).toBe('button');
    expect(fiveHundreds.element.type).toBe('button');
    expect(fiveHundreds.element.title).toBe(
      'Inspect first visible 5xx request (1 matching)',
    );
    expect(fiveHundreds.element.setAttribute).toHaveBeenCalledWith(
      'aria-label',
      'Inspect first visible 5xx request (1 matching)',
    );
    const clickHandler = fiveHundreds.element.addEventListener.mock.calls.find(
      ([eventName]) => eventName === 'click',
    )[1];
    clickHandler();
    expect(onInspect).toHaveBeenCalledWith('5xx');

    expect(redirects.tagName).toBe('span');
    expect(redirects.element.className).toContain('status-summary-chip--empty');
    expect(redirects.element.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
    expect(accessibleSummary.textContent).toBe(
      'status 2xx 2 · 3xx 0 · 4xx 0 · 5xx 1 · other 0 | avg 25 ms · min 10 ms · max 40 ms',
    );
  });

  test('counts every row exactly once, including malformed and missing statuses', () => {
    const rows = [
      { status: 200 },
      { status: 299 },
      { status: 300 },
      { status: 399 },
      { status: 400 },
      { status: 499 },
      { status: 500 },
      { status: 599 },
      { status: 199 },
      { status: 600 },
      { status: '200' },
      { status: 200.5 },
      {},
      null,
    ];
    const stats = np.computeStats(rows);
    expect(stats.statusClassCounts).toEqual({
      '2xx': 2,
      '3xx': 2,
      '4xx': 2,
      '5xx': 2,
      other: 6,
    });
    expect(Object.values(stats.statusClassCounts).reduce((sum, count) => sum + count, 0)).toBe(
      stats.count,
    );
  });
});

describe('computeStats', () => {
  const zeroStats = {
    count: 0,
    totalDuration: 0,
    avgDuration: 0,
    minDuration: 0,
    maxDuration: 0,
    totalSize: 0,
    statusClassCounts: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 },
  };

  test('returns zero stats for empty array', () => {
    const stats = np.computeStats([]);
    expect(stats).toEqual(zeroStats);
  });

  test('returns zero stats for null/undefined input', () => {
    expect(np.computeStats(null)).toEqual(zeroStats);
    expect(np.computeStats(undefined)).toEqual(zeroStats);
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

describe('loadLangPref / saveLangPref', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  test('reads value from extension storage when no error', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      cb({ 'networkPlus.lang': 'ja' });
    });
    np.loadLangPref((lang) => {
      expect(lang).toBe('ja');
      done();
    });
  });

  test('first-run default is system without warning', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      cb({});
    });
    localStorage.getItem.mockReturnValue(null);
    np.loadLangPref((lang, warn) => {
      expect(lang).toBe('system');
      expect(warn).toBeUndefined();
      done();
    });
  });

  test('async read failure falls back to localStorage value', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb({});
      chrome.runtime.lastError = null;
    });
    localStorage.getItem.mockReturnValue('ja');
    np.loadLangPref((lang) => {
      expect(lang).toBe('ja');
      done();
    });
  });

  test('total read failure returns system with a load warning', (done) => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb({});
      chrome.runtime.lastError = null;
    });
    localStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    np.loadLangPref((lang, warn) => {
      expect(lang).toBe('system');
      expect(warn).toBe('Language preference could not be loaded.');
      done();
    });
  });

  test('save prefers extension storage and skips localStorage on success', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => cb());
    np.saveLangPref('ja');
    setTimeout(() => {
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ 'networkPlus.lang': 'ja' }, expect.any(Function));
      expect(localStorage.setItem).not.toHaveBeenCalled();
      done();
    }, 0);
  });

  test('async write failure falls back to localStorage', (done) => {
    chrome.storage.local.set.mockImplementation((_data, cb) => {
      chrome.runtime.lastError = { message: 'Storage unavailable' };
      cb();
      chrome.runtime.lastError = null;
    });
    np.saveLangPref('en');
    setTimeout(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('networkPlus.lang', 'en');
      done();
    }, 0);
  });
});

describe('resolveLanguage', () => {
  const originalNavigator = global.navigator;
  afterEach(() => {
    global.navigator = originalNavigator;
  });

  test('explicit choices pass through untouched', () => {
    expect(np.resolveLanguage('ja')).toBe('ja');
    expect(np.resolveLanguage('en')).toBe('en');
  });

  test('system resolves to ja for Japanese browser locales', () => {
    global.navigator = { language: 'ja' };
    expect(np.resolveLanguage('system')).toBe('ja');
    global.navigator = { language: 'ja-JP' };
    expect(np.resolveLanguage('system')).toBe('ja');
  });

  test('system resolves to en for every other locale, including lookalikes', () => {
    global.navigator = { language: 'en-US' };
    expect(np.resolveLanguage('system')).toBe('en');
    // "jam" must not match the ja prefix test.
    global.navigator = { language: 'jam' };
    expect(np.resolveLanguage('system')).toBe('en');
  });

  test('system falls back to the languages list, then to en without a navigator', () => {
    global.navigator = { language: '', languages: ['ja-JP', 'en-US'] };
    expect(np.resolveLanguage('system')).toBe('ja');
    global.navigator = undefined;
    expect(np.resolveLanguage('system')).toBe('en');
  });

  test('junk preferences behave like system', () => {
    global.navigator = { language: 'en-US' };
    expect(np.resolveLanguage('klingon')).toBe('en');
  });
});

describe('cURL command import', () => {
  test('tokenizes quoting styles, escapes, and line continuations', () => {
    expect(np.tokenizeShellCommand("curl 'https://a.test/x y' -H \"Accept: a/b\"")).toEqual([
      'curl',
      'https://a.test/x y',
      '-H',
      'Accept: a/b',
    ]);
    expect(np.tokenizeShellCommand('curl \\\n  https://a.test/')).toEqual(['curl', 'https://a.test/']);
    expect(np.tokenizeShellCommand("curl $'a\\nb'")).toEqual(['curl', 'a\nb']);
    expect(np.tokenizeShellCommand('curl "say \\"hi\\""')).toEqual(['curl', 'say "hi"']);
    expect(() => np.tokenizeShellCommand("curl 'unterminated")).toThrow('single-quoted');
  });

  test("parses Chrome's Copy-as-cURL shape into a resend spec", () => {
    const parsed = np.parseCurlCommand(
      "curl 'https://api.example.test/v1/users' \\\n" +
        "  -H 'accept: application/json' \\\n" +
        "  -H 'content-type: application/json' \\\n" +
        "  --data-raw '{\"name\":\"a\"}' \\\n" +
        '  --compressed',
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.spec.method).toBe('POST');
    expect(parsed.spec.url).toBe('https://api.example.test/v1/users');
    expect(parsed.spec.headers).toEqual([
      { name: 'accept', value: 'application/json' },
      { name: 'content-type', value: 'application/json' },
    ]);
    expect(parsed.spec.body).toBe('{"name":"a"}');
    expect(parsed.notes.join(' ')).toContain('--compressed');
  });

  test('supports method flags, joined data, -G queries, and basic auth', () => {
    expect(np.parseCurlCommand('curl -XDELETE https://a.test/x').spec.method).toBe('DELETE');
    const joined = np.parseCurlCommand('curl -d a=1 -d b=2 https://a.test/x');
    expect(joined.spec.body).toBe('a=1&b=2');
    expect(joined.spec.method).toBe('POST');
    const asQuery = np.parseCurlCommand('curl -G -d a=1 -d b=2 https://a.test/x');
    expect(asQuery.spec.url).toBe('https://a.test/x?a=1&b=2');
    expect(asQuery.spec.method).toBe('GET');
    const auth = np.parseCurlCommand('curl -u user:pass https://a.test/x');
    expect(auth.spec.headers).toEqual([{ name: 'Authorization', value: 'Basic dXNlcjpwYXNz' }]);
    expect(np.parseCurlCommand('curl --head https://a.test/x').spec.method).toBe('HEAD');
  });

  test('fails closed on unsupported flags, file bodies, and bad shapes', () => {
    expect(np.parseCurlCommand('curl -F field=@file https://a.test/').error).toContain('-F is not supported');
    expect(np.parseCurlCommand('curl -d @body.json https://a.test/').error).toContain('paste the body itself');
    expect(np.parseCurlCommand('curl https://a.test/ https://b.test/').error).toContain('more than one URL');
    expect(np.parseCurlCommand('wget https://a.test/').error).toContain('must start with curl');
    expect(np.parseCurlCommand('curl ftp://a.test/').error).toContain('absolute http(s) URL');
    expect(np.parseCurlCommand('curl -H').error).toContain('missing its value');
  });

  test('notes browser-managed cookies and strips a leading prompt', () => {
    const parsed = np.parseCurlCommand("$ curl -b 'sid=abc' https://a.test/x");
    expect(parsed.ok).toBe(true);
    expect(parsed.spec.headers).toEqual([{ name: 'Cookie', value: 'sid=abc' }]);
    expect(parsed.notes.join(' ')).toContain('browser manages cookies');
  });
});

describe('CSV export payload', () => {
  test('escapes commas, quotes, and newlines per RFC 4180', () => {
    expect(np.escapeCsvField('plain')).toBe('plain');
    expect(np.escapeCsvField('a,b')).toBe('"a,b"');
    expect(np.escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(np.escapeCsvField('line\nbreak')).toBe('"line\nbreak"');
    expect(np.escapeCsvField(null)).toBe('');
  });

  test('builds a sanitized metadata table with numeric duration and size', () => {
    const rows = [
      {
        id: 2,
        method: 'POST',
        url: 'https://api.example.test/v1/users?token=secret-value',
        status: 201,
        statusText: 'Created',
        type: 'xhr',
        operation: 'CreateUser',
        duration: 12.6,
        size: 345,
        requestHeaders: [],
        responseHeaders: [],
      },
      {
        id: 1,
        method: 'GET',
        url: 'https://cdn.example.test/app.js',
        status: 200,
        statusText: 'OK',
        type: 'script',
        duration: 3,
        size: 1024,
        requestHeaders: [],
        responseHeaders: [],
      },
    ];
    const payload = np.buildCsvPayload(rows);
    expect(payload.ok).toBe(true);
    const lines = payload.text.trim().split('\r\n');
    expect(lines[0]).toBe('id,method,status,statusText,domain,type,operation,durationMs,sizeBytes,url');
    // Rows sort by id like the Markdown table, and the query value is
    // redacted before any CSV text exists.
    expect(lines[1].startsWith('1,GET,200,OK,cdn.example.test,script,')).toBe(true);
    expect(lines[2]).toContain('2,POST,201,Created,api.example.test,xhr,CreateUser,13,345,');
    expect(payload.text).not.toContain('secret-value');
    // The sanitizer's redaction marker survives URL re-encoding.
    expect(lines[2]).toContain('%5BREDACTED%5D');
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

describe('planRequestCountSummary', () => {
  const summary = (overrides) =>
    np.planRequestCountSummary({
      shownCount: 1967,
      totalCount: 1967,
      matchedCount: 0,
      hasActiveSearch: false,
      matchesOnly: false,
      activeFilterCount: 0,
      ...overrides,
    });

  test('states a single total when nothing narrows the grid', () => {
    expect(summary().text).toBe('1,967 requests');
  });

  test('shows the narrowed count against the captured total', () => {
    expect(summary({ shownCount: 120, activeFilterCount: 2 }).text).toBe(
      '120 / 1,967 requests · 2 column filters',
    );
  });

  test('reports search matches even while every row stays visible', () => {
    // The complaint this guards: a search was typed and the counter still read
    // "1967 / 1967", saying nothing about what the search selected.
    expect(summary({ hasActiveSearch: true, matchedCount: 12 }).text).toBe('1,967 requests · 12 matching');
  });

  test('says matches only when the search is doing the narrowing', () => {
    expect(summary({ shownCount: 12, hasActiveSearch: true, matchesOnly: true, matchedCount: 12 }).text).toBe(
      '12 / 1,967 requests · matches only',
    );
  });

  test('uses singular wording for one column filter', () => {
    expect(summary({ shownCount: 4, activeFilterCount: 1 }).text).toBe('4 / 1,967 requests · 1 column filter');
  });

  test('spoken text spells the relationship out for screen readers', () => {
    const spoken = summary({ shownCount: 120, hasActiveSearch: true, matchedCount: 12, activeFilterCount: 2 })
      .accessibleText;
    expect(spoken).toBe('showing 120 of 1,967 requests, 12 matching the search, 2 active column filters');
  });

  test('treats missing or negative counts as zero', () => {
    expect(np.planRequestCountSummary({}).text).toBe('0 requests');
    expect(summary({ shownCount: -5, totalCount: -2 }).text).toBe('0 requests');
  });

  test('says nothing about narrowing before anything is captured', () => {
    const empty = summary({ shownCount: 0, totalCount: 0, hasActiveSearch: true, activeFilterCount: 2 });
    expect(empty.text).toBe('0 requests');
    expect(empty.accessibleText).toBe('0 requests');
  });
});

describe('normalizeViewPreset', () => {
  test('returns null for non-object input', () => {
    expect(np.normalizeViewPreset(null)).toBeNull();
    expect(np.normalizeViewPreset(undefined)).toBeNull();
    expect(np.normalizeViewPreset('text')).toBeNull();
    expect(np.normalizeViewPreset([1, 2])).toBeNull();
  });

  test('keeps only known column ids with boolean visibility', () => {
    const preset = np.normalizeViewPreset({
      columns: { url: true, method: false, bogusColumn: true, id: 'yes' },
      filterRules: {},
    });
    expect(preset.columns).toEqual({ url: true, method: false });
  });

  test('missing columns/filterRules become an empty map and default rules', () => {
    const preset = np.normalizeViewPreset({});
    expect(preset.columns).toEqual({});
    expect(preset.filterRules).toHaveProperty('url');
    expect(preset.filterRules).not.toHaveProperty('_extra');
  });

  test('strips unknown filterRules keys through the known serializer path', () => {
    const preset = np.normalizeViewPreset({
      filterRules: { url: { op: 'contains', value: 'api', __unknown: true }, _extra: 'drop' },
    });
    expect(preset.filterRules).not.toHaveProperty('_extra');
    expect(preset.filterRules.url).toEqual({ op: 'contains', value: 'api', __unknown: true });
  });
});

describe('loadViewPreset / saveViewPreset / clearViewPreset', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    localStorage.getItem.mockReturnValue(null);
  });

  // --- loadViewPreset ---

  test('returns { preset: null, error: null } when nothing is stored', () => {
    expect(np.loadViewPreset()).toEqual({ preset: null, error: null });
  });

  test('returns error string for malformed JSON', () => {
    localStorage.getItem.mockReturnValue('not-json{{{');
    const { preset, error } = np.loadViewPreset();
    expect(preset).toBeNull();
    expect(typeof error).toBe('string');
    expect(error.length).toBeGreaterThan(0);
  });

  test('returns error string when stored value is not an object', () => {
    localStorage.getItem.mockReturnValue(JSON.stringify([{ columns: {} }]));
    const { preset, error } = np.loadViewPreset();
    expect(preset).toBeNull();
    expect(typeof error).toBe('string');
  });

  test('returns error string when stored blob is oversized (ASCII)', () => {
    localStorage.getItem.mockReturnValue('x'.repeat(np.MAX_PRESET_TOTAL_BYTES * 2 + 1));
    const { preset, error } = np.loadViewPreset();
    expect(preset).toBeNull();
    expect(typeof error).toBe('string');
  });

  test('returns error string when stored blob exceeds 2×MAX_PRESET_TOTAL_BYTES in UTF-8 bytes (multibyte regression)', () => {
    // Each '日' encodes to 3 UTF-8 bytes but 1 JS char.
    const multibyteCount = Math.floor((np.MAX_PRESET_TOTAL_BYTES * 2) / 3) + 1;
    localStorage.getItem.mockReturnValue('日'.repeat(multibyteCount));
    const { preset, error } = np.loadViewPreset();
    expect(preset).toBeNull();
    expect(typeof error).toBe('string');
  });

  test('returns generic error on localStorage read failure without echoing the exception', () => {
    localStorage.getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const { preset, error } = np.loadViewPreset();
    expect(preset).toBeNull();
    expect(typeof error).toBe('string');
    expect(error).not.toContain('SecurityError');
  });

  test('round-trips a stored preset, dropping unknown fields', () => {
    localStorage.getItem.mockImplementation((key) =>
      key === np.VIEW_PRESET_KEY
        ? JSON.stringify({
            columns: { url: true, ghost: false },
            filterRules: { status: { op: 'gte', value: '400' }, _extra: 'drop' },
            _junk: 1,
          })
        : null,
    );
    const { preset, error } = np.loadViewPreset();
    expect(error).toBeNull();
    expect(preset.columns).toEqual({ url: true });
    expect(preset.filterRules.status).toEqual({ op: 'gte', value: '400' });
    expect(preset.filterRules).not.toHaveProperty('_extra');
    expect(preset).not.toHaveProperty('_junk');
  });

  // --- legacy multi-preset migration ---

  test('adopts the first legacy filter preset when no view preset is stored', () => {
    const legacy = [
      { name: 'Errors only', filterRules: { status: { op: 'gte', value: '400' } } },
      { name: 'Second', filterRules: { url: { op: 'contains', value: 'api' } } },
    ];
    localStorage.getItem.mockImplementation((key) =>
      key === np.LEGACY_FILTER_PRESET_KEY ? JSON.stringify(legacy) : null,
    );
    const { preset, error } = np.loadViewPreset();
    expect(error).toBeNull();
    expect(preset.filterRules.status).toEqual({ op: 'gte', value: '400' });
    expect(preset.columns).toEqual({});
    // Legacy store is removed and the migrated preset is written to the new key.
    expect(localStorage.removeItem).toHaveBeenCalledWith(np.LEGACY_FILTER_PRESET_KEY);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      np.VIEW_PRESET_KEY,
      expect.stringContaining('"gte"'),
    );
  });

  test('invalid legacy store yields null preset without an error', () => {
    localStorage.getItem.mockImplementation((key) =>
      key === np.LEGACY_FILTER_PRESET_KEY ? 'broken{{{' : null,
    );
    expect(np.loadViewPreset()).toEqual({ preset: null, error: null });
    expect(localStorage.removeItem).toHaveBeenCalledWith(np.LEGACY_FILTER_PRESET_KEY);
  });

  // --- saveViewPreset ---

  test('writes the normalized preset to the view-preset key', () => {
    const ok = np.saveViewPreset({
      columns: { url: true, bogus: true },
      filterRules: { status: { op: 'gte', value: '400' } },
    });
    expect(ok).toBe(true);
    const [key, value] = localStorage.setItem.mock.calls[0];
    expect(key).toBe(np.VIEW_PRESET_KEY);
    const stored = JSON.parse(value);
    expect(stored.columns).toEqual({ url: true });
    expect(stored.filterRules.status).toEqual({ op: 'gte', value: '400' });
  });

  test('returns false for invalid preset input without writing', () => {
    expect(np.saveViewPreset(null)).toBe(false);
    expect(np.saveViewPreset('nope')).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  test('returns false and does not throw when localStorage throws', () => {
    localStorage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(np.saveViewPreset({ columns: {}, filterRules: {} })).toBe(false);
  });

  test('returns false when serialized data exceeds MAX_PRESET_TOTAL_BYTES', () => {
    const bigValue = 'x'.repeat(70 * 1024);
    const oversized = { columns: {}, filterRules: { url: { op: 'contains', value: bigValue } } };
    expect(np.saveViewPreset(oversized)).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  // --- clearViewPreset ---

  test('clearViewPreset removes the stored preset and reports success', () => {
    expect(np.clearViewPreset()).toBe(true);
    expect(localStorage.removeItem).toHaveBeenCalledWith(np.VIEW_PRESET_KEY);
  });

  test('clearViewPreset returns false when localStorage throws', () => {
    localStorage.removeItem.mockImplementation(() => { throw new Error('SecurityError'); });
    expect(np.clearViewPreset()).toBe(false);
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

describe('extractHtmlMetaCharset / meta-charset sniffing', () => {
  test('parses both meta forms and normalizes the label', () => {
    expect(np.extractHtmlMetaCharset('<html><head><meta charset="Shift_JIS"></head>')).toBe('shift_jis');
    expect(np.extractHtmlMetaCharset("<meta charset='EUC-JP'>")).toBe('euc-jp');
    expect(
      np.extractHtmlMetaCharset('<meta http-equiv="Content-Type" content="text/html; charset=windows-31j">'),
    ).toBe('windows-31j');
    expect(np.extractHtmlMetaCharset('<html><head><title>x</title></head>')).toBe('');
    expect(np.extractHtmlMetaCharset(null)).toBe('');
  });

  test('isHtmlLikeMime gates on html-like mime types only', () => {
    expect(np.isHtmlLikeMime('text/html')).toBe(true);
    expect(np.isHtmlLikeMime('application/xhtml+xml')).toBe(true);
    expect(np.isHtmlLikeMime('text/html; charset=utf-8')).toBe(true);
    expect(np.isHtmlLikeMime('application/json')).toBe(false);
    expect(np.isHtmlLikeMime(undefined)).toBe(false);
  });

  test('decodes html bodies via the meta charset when headers declare none', () => {
    // <meta charset=shift_jis> page whose body text is Shift_JIS "こんにちは".
    const head = Buffer.from('<html><head><meta charset=shift_jis></head><body>', 'latin1');
    const sjis = Buffer.from([0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd]);
    const tail = Buffer.from('</body></html>', 'latin1');
    const base64 = Buffer.concat([head, sjis, tail]).toString('base64');
    const sniffed = np.decodeResponseContent(base64, 'base64', '', true);
    expect(sniffed).toContain('こんにちは');
    // Without the html gate the same bytes stay UTF-8-decoded (mojibake).
    expect(np.decodeResponseContent(base64, 'base64', '', false)).not.toContain('こんにちは');
    // An explicit header charset always wins over the sniff path.
    expect(np.decodeResponseContent(base64, 'base64', 'shift_jis', false)).toContain('こんにちは');
  });

  test('SAZ html messages without a header charset use the meta declaration', () => {
    const headerText = 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n';
    const htmlHead = '<html><head><meta charset=shift_jis></head><body>';
    const bytes = new Uint8Array([
      ...Buffer.from(headerText, 'latin1'),
      ...Buffer.from(htmlHead, 'latin1'),
      0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd,
      ...Buffer.from('</body></html>', 'latin1'),
    ]);
    expect(np.parseSazHttpMessage(bytes).body).toContain('こんにちは');
  });
});

describe('planVisibleSearchRows', () => {
  const rowA = { id: 1 };
  const rowB = { id: 2 };
  const rowC = { id: 3 };
  const sorted = [rowA, rowB, rowC];
  const matched = new Map([[rowB, new Set([0])]]);

  test('returns all rows while the toggle is off or no search is active', () => {
    expect(np.planVisibleSearchRows(sorted, matched, false, true)).toEqual(sorted);
    expect(np.planVisibleSearchRows(sorted, matched, true, false)).toEqual(sorted);
  });

  test('returns only matching rows when the toggle is on with an active search', () => {
    expect(np.planVisibleSearchRows(sorted, matched, true, true)).toEqual([rowB]);
    expect(np.planVisibleSearchRows(sorted, new Map(), true, true)).toEqual([]);
  });

  test('is defensive about malformed inputs', () => {
    expect(np.planVisibleSearchRows(null, matched, true, true)).toEqual([]);
    expect(np.planVisibleSearchRows(sorted, null, true, true)).toEqual(sorted);
  });
});

describe('getWrappedMatchIndex', () => {
  test('returns -1 when there are no matches', () => {
    expect(np.getWrappedMatchIndex(0, -1, 'next')).toBe(-1);
    expect(np.getWrappedMatchIndex(-5, 2, 'prev')).toBe(-1);
  });

  test('starts from the first or last match when nothing is current', () => {
    expect(np.getWrappedMatchIndex(3, -1, 'next')).toBe(0);
    expect(np.getWrappedMatchIndex(3, -1, 'prev')).toBe(2);
  });

  test('steps and wraps in both directions', () => {
    expect(np.getWrappedMatchIndex(3, 0, 'next')).toBe(1);
    expect(np.getWrappedMatchIndex(3, 2, 'next')).toBe(0);
    expect(np.getWrappedMatchIndex(3, 0, 'prev')).toBe(2);
    expect(np.getWrappedMatchIndex(3, 1, 'prev')).toBe(0);
  });
});

describe('SAZ body charset decoding', () => {
  const buildMessageBytes = (headerText, bodyBytes) =>
    new Uint8Array([...Buffer.from(headerText, 'latin1'), ...bodyBytes]);

  test('findHttpHeaderBodySplit locates the CRLFCRLF boundary at byte level', () => {
    const bytes = buildMessageBytes('HTTP/1.1 200 OK\r\nA: b\r\n\r\n', [0x82, 0xb1]);
    expect(np.findHttpHeaderBodySplit(bytes)).toBe(21);
    expect(np.findHttpHeaderBodySplit(new Uint8Array([1, 2, 3]))).toBe(-1);
  });

  test('decodes a Shift_JIS SAZ body with the charset its headers declare', () => {
    const shiftJisBody = [0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd];
    const bytes = buildMessageBytes(
      'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=Shift_JIS\r\n\r\n',
      shiftJisBody,
    );
    const message = np.parseSazHttpMessage(bytes);
    expect(message.startLine).toBe('HTTP/1.1 200 OK');
    expect(message.body).toBe('こんにちは');
  });

  test('still decodes UTF-8 SAZ bodies without a charset declaration', () => {
    const utf8Body = Array.from(Buffer.from('日本語ボディ', 'utf8'));
    const bytes = buildMessageBytes('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n', utf8Body);
    expect(np.parseSazHttpMessage(bytes).body).toBe('日本語ボディ');
  });
});

describe('search options (case / regex / whole word)', () => {
  const OPTS = (overrides) => ({ caseSensitive: false, regex: false, wholeWord: false, ...overrides });

  test('compileSearchQuery escapes literals and honors flags', () => {
    const literal = np.compileSearchQuery('a.b(', OPTS());
    expect(literal.error).toBeNull();
    expect(literal.regex.test('xa.b(y')).toBe(true);
    literal.regex.lastIndex = 0;
    expect(literal.regex.test('aXb(')).toBe(false);

    const cased = np.compileSearchQuery('Token', OPTS({ caseSensitive: true }));
    cased.regex.lastIndex = 0;
    expect(cased.regex.test('token')).toBe(false);
    cased.regex.lastIndex = 0;
    expect(cased.regex.test('Token')).toBe(true);

    const invalid = np.compileSearchQuery('a(', OPTS({ regex: true }));
    expect(invalid.regex).toBeNull();
    expect(typeof invalid.error).toBe('string');
  });

  test('planKeywordHighlights applies options and guards zero-length regex matches', () => {
    const kws = [{ query: 'ab+', colorIdx: 2 }];
    const literalPlan = np.planKeywordHighlights('ab+ abb', kws, OPTS());
    expect(literalPlan).toHaveLength(1); // literal "ab+"
    const regexPlan = np.planKeywordHighlights('ab+ abb', kws, OPTS({ regex: true }));
    expect(regexPlan.map((h) => [h.start, h.end])).toEqual([[0, 2], [4, 7]]);

    // Zero-length-capable pattern must not hang and must skip empty matches.
    const zeroPlan = np.planKeywordHighlights('axb', [{ query: 'x*', colorIdx: 0 }], OPTS({ regex: true }));
    expect(zeroPlan).toEqual([{ start: 1, end: 2, colorIdx: 0, keywordIndex: 0 }]);

    const wordPlan = np.planKeywordHighlights('id ids hid id', [{ query: 'id', colorIdx: 1 }], OPTS({ wholeWord: true }));
    expect(wordPlan.map((h) => h.start)).toEqual([0, 11]);

    const casedPlan = np.planKeywordHighlights('Ab ab', [{ query: 'Ab', colorIdx: 0 }], OPTS({ caseSensitive: true }));
    expect(casedPlan).toHaveLength(1);

    // Invalid regex keyword contributes nothing instead of throwing.
    expect(np.planKeywordHighlights('abc', [{ query: '(', colorIdx: 0 }], OPTS({ regex: true }))).toEqual([]);
  });

  test('deepSearchMatch honors the options across scopes', () => {
    const row = {
      url: 'https://api.example/v1/Items?id=42',
      domain: 'api.example',
      path: '/v1/Items',
      method: 'GET',
      status: 200,
      type: 'application/json',
      requestHeaders: [{ name: 'X-Trace', value: 'abc-123' }],
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      requestPostData: null,
      responseContentText: '{"total": 7}',
    };
    const scope = { url: true, reqBody: true, resBody: true, reqHeaders: true, resHeaders: true };
    expect(np.deepSearchMatch(row, 'items', scope, OPTS({ caseSensitive: true }))).toBe(false);
    expect(np.deepSearchMatch(row, 'Items', scope, OPTS({ caseSensitive: true }))).toBe(true);
    expect(np.deepSearchMatch(row, 'abc-\\d+', scope, OPTS({ regex: true }))).toBe(true);
    expect(np.deepSearchMatch(row, 'total', scope, OPTS({ wholeWord: true }))).toBe(true);
    expect(np.deepSearchMatch(row, 'tota', scope, OPTS({ wholeWord: true }))).toBe(false);
    // Invalid regex matches nothing rather than throwing.
    expect(np.deepSearchMatch(row, '(', scope, OPTS({ regex: true }))).toBe(false);
    // Legacy call without options keeps the literal behavior.
    expect(np.deepSearchMatch(row, 'ITEMS', scope)).toBe(true);
  });
});

describe('normalizeSearchPrefs', () => {
  test('returns defaults for missing or malformed input', () => {
    const defaults = np.normalizeSearchPrefs(null);
    expect(defaults.scope).toEqual({ url: true, reqBody: true, resBody: true, reqHeaders: true, resHeaders: true });
    expect(defaults.options).toEqual(np.DEFAULT_SEARCH_OPTIONS());
    expect(defaults.matchesOnly).toBe(false);
    expect(np.normalizeSearchPrefs('junk')).toEqual(defaults);
    expect(np.normalizeSearchPrefs({ scope: 5, options: [], matchesOnly: 'yes' })).toEqual(defaults);
  });

  test('keeps only known boolean fields', () => {
    const prefs = np.normalizeSearchPrefs({
      scope: { url: false, bogus: true, resBody: false },
      options: { regex: true, bogus: true },
      matchesOnly: true,
      keywords: ['secret'],
    });
    expect(prefs.scope.url).toBe(false);
    expect(prefs.scope.resBody).toBe(false);
    expect(prefs.scope.reqBody).toBe(true);
    expect(prefs.scope.bogus).toBeUndefined();
    expect(prefs.options).toEqual({ caseSensitive: false, regex: true, wholeWord: false });
    expect(prefs.matchesOnly).toBe(true);
    expect(prefs.keywords).toBeUndefined();
  });
});

describe('devtools-session mirror', () => {
  const SAMPLE_ENTRY = {
    startedDateTime: '2026-08-21T04:05:06.789Z',
    time: 123.4,
    request: {
      method: 'POST',
      url: 'https://api.example.test/v1/items?q=1',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      postData: { mimeType: 'application/json', text: '{"q":1}' },
    },
    response: {
      status: 503,
      statusText: 'Service Unavailable',
      httpVersion: 'http/2.0',
      headers: [{ name: 'Retry-After', value: '30' }],
      bodySize: 42,
      content: { mimeType: 'application/json', size: 42 },
    },
    timings: { wait: 100.2, receive: 3.1 },
    initiator: { type: 'parser' },
  };

  const buildHostRow = (id) => np.buildRowFromRequest({ ...SAMPLE_ENTRY, getContent: () => {} }, id);

  test('getMirrorViewParams detects the pop-out view and its source tab', () => {
    expect(np.getMirrorViewParams('')).toEqual({ viewerMode: false, sourceTabId: '' });
    expect(np.getMirrorViewParams(undefined)).toEqual({ viewerMode: false, sourceTabId: '' });
    expect(np.getMirrorViewParams('?view=window')).toEqual({ viewerMode: true, sourceTabId: '' });
    expect(np.getMirrorViewParams('?view=window&src=42')).toEqual({ viewerMode: true, sourceTabId: '42' });
    expect(np.getMirrorViewParams('?view=other&src=42').viewerMode).toBe(false);
  });

  test('serialized rows survive JSON transport and rebuild into equivalent rows', () => {
    const hostRow = buildHostRow(7);
    const wire = JSON.parse(JSON.stringify(np.serializeRowForMirror(hostRow)));
    const viewerRow = np.buildRowFromRequest(np.buildMirrorEntryFromWire(wire), wire.id);
    viewerRow.initiator = wire.initiator;

    expect(viewerRow.id).toBe(7);
    expect(viewerRow.method).toBe(hostRow.method);
    expect(viewerRow.url).toBe(hostRow.url);
    expect(viewerRow.status).toBe(hostRow.status);
    expect(viewerRow.statusText).toBe(hostRow.statusText);
    expect(viewerRow.protocol).toBe(hostRow.protocol);
    expect(viewerRow.type).toBe(hostRow.type);
    expect(viewerRow.size).toBe(hostRow.size);
    expect(viewerRow.duration).toBe(hostRow.duration);
    expect(viewerRow.startedDateTime).toBe(hostRow.startedDateTime);
    expect(viewerRow.requestHeaders).toEqual(hostRow.requestHeaders);
    expect(viewerRow.responseHeaders).toEqual(hostRow.responseHeaders);
    expect(viewerRow.requestPostData).toEqual(hostRow.requestPostData);
    expect(viewerRow.timings).toEqual(hostRow.timings);
    expect(viewerRow.initiator).toEqual(hostRow.initiator);
    expect(viewerRow.domain).toBe(hostRow.domain);
    expect(viewerRow.responseContentState).toBe('not-loaded');
  });

  const createLinkedSessions = ({
    rows,
    fetchBodyForRow,
    paused = () => false,
    getControlState,
    executeCommand,
    receiveImportFile,
  }) => {
    // The fake viewer state mirrors the production ingestion contract: rows
    // are unique by id, whether they arrive appended or via snapshot.
    const viewerRowsById = new Map();
    const viewerReceived = { snapshots: [], appended: [], pausedChanges: [], syncs: [] };
    let host;
    const viewer = np.createMirrorViewerSession({
      postMessage: (message) => host.handleMessage(message),
      appendWireRow: (wireRow) => {
        viewerReceived.appended.push(wireRow);
        viewerRowsById.set(wireRow.id, wireRow);
      },
      applyWireSnapshot: (wireRows) => {
        viewerReceived.snapshots.push(wireRows);
        viewerRowsById.clear();
        for (const wireRow of wireRows) viewerRowsById.set(wireRow.id, wireRow);
      },
      getLocalCount: () => viewerRowsById.size,
      getLocalMaxId: () => {
        let maxId = 0;
        for (const id of viewerRowsById.keys()) if (id > maxId) maxId = id;
        return maxId;
      },
      onHostSync: (message) => {
        viewerReceived.pausedChanges.push(message.paused === true);
        viewerReceived.syncs.push(message);
      },
    });
    host = np.createMirrorHostSession({
      postMessage: (message) => viewer.handleMessage(message),
      getRows: () => rows,
      isPaused: paused,
      fetchBodyForRow: fetchBodyForRow || (() => Promise.reject(new Error('no body fetcher'))),
      getControlState,
      executeCommand,
      receiveImportFile,
    });
    return { host, viewer, viewerReceived };
  };

  const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

  test('hello delivers a chunked snapshot that reassembles in order', () => {
    const rows = Array.from({ length: 1201 }, (_unused, index) => buildHostRow(index + 1));
    const pair = createLinkedSessions({ rows });
    pair.viewer.handleMessage({ type: 'noise' });
    pair.host.handleMessage({ type: 'hello', protocolVersion: np.MIRROR_PROTOCOL_VERSION });
    expect(pair.viewerReceived.snapshots).toHaveLength(1);
    const snapshotRows = pair.viewerReceived.snapshots[0];
    expect(snapshotRows).toHaveLength(1201);
    expect(snapshotRows[0].id).toBe(1);
    expect(snapshotRows.at(-1).id).toBe(1201);
    expect(pair.viewerReceived.appended).toHaveLength(0);
  });

  test('a stale snapshot generation is discarded instead of applied', () => {
    const applied = [];
    const viewer = np.createMirrorViewerSession({
      postMessage: () => {},
      appendWireRow: () => {},
      applyWireSnapshot: (wireRows) => applied.push(wireRows),
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
    });
    viewer.handleMessage({ type: 'snapshot-start', generation: 1, total: 1 });
    viewer.handleMessage({ type: 'snapshot-start', generation: 2, total: 1 });
    viewer.handleMessage({ type: 'snapshot-rows', generation: 1, rows: [{ id: 1 }] });
    viewer.handleMessage({ type: 'snapshot-rows', generation: 2, rows: [{ id: 2 }] });
    viewer.handleMessage({ type: 'snapshot-end', generation: 1 });
    viewer.handleMessage({ type: 'snapshot-end', generation: 2 });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual([{ id: 2 }]);
  });

  test('pushed rows stream to the viewer and sync mismatch triggers a resync', () => {
    const rows = [buildHostRow(1)];
    const { host, viewerReceived } = createLinkedSessions({ rows });
    host.pushRow(rows[0]);
    expect(viewerReceived.appended).toHaveLength(1);
    expect(viewerReceived.appended[0].id).toBe(1);

    // Viewer count (1 appended) matches the host: sync stays quiet.
    host.sendSync();
    expect(viewerReceived.snapshots).toHaveLength(0);

    // A second host row the viewer never saw: sync detects and resyncs.
    rows.push(buildHostRow(2));
    host.sendSync();
    expect(viewerReceived.snapshots).toHaveLength(1);
    expect(viewerReceived.snapshots[0].map((wireRow) => wireRow.id)).toEqual([1, 2]);
  });

  test('paused state changes reach the viewer through sync', () => {
    const rows = [];
    let paused = false;
    const { host, viewerReceived } = createLinkedSessions({ rows, paused: () => paused });
    host.sendSync();
    paused = true;
    host.sendSync();
    expect(viewerReceived.pausedChanges).toEqual([false, true]);
  });

  test('body requests round-trip: cached success and host-side failure', async () => {
    const rows = [buildHostRow(1), buildHostRow(2)];
    const fetchBodyForRow = (rowId) =>
      rowId === 1
        ? Promise.resolve({ content: 'aGVsbG8=', encoding: 'base64' })
        : Promise.reject(new Error('evicted by retention'));
    const { viewer } = createLinkedSessions({ rows, fetchBodyForRow });

    const success = await new Promise((resolve) => {
      viewer.requestBody(1, (error, payload) => resolve({ error, payload }));
    });
    expect(success.error).toBeNull();
    expect(success.payload).toEqual({ content: 'aGVsbG8=', encoding: 'base64' });

    const failure = await new Promise((resolve) => {
      viewer.requestBody(2, (error, payload) => resolve({ error, payload }));
    });
    expect(failure.payload).toBeNull();
    expect(failure.error.message).toBe('evicted by retention');
    await flushAsync();
  });

  test('disconnect fails pending body requests immediately', () => {
    const viewer = np.createMirrorViewerSession({
      postMessage: () => {},
      appendWireRow: () => {},
      applyWireSnapshot: () => {},
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
    });
    const outcomes = [];
    viewer.requestBody(5, (error) => outcomes.push(error.message));
    viewer.failPendingBodyRequests('The DevTools session disconnected before the response content arrived.');
    expect(outcomes).toEqual(['The DevTools session disconnected before the response content arrived.']);
  });

  test('a throwing transport surfaces to the requestBody caller and leaves no pending entry', () => {
    const viewer = np.createMirrorViewerSession({
      postMessage: () => {
        throw new Error('The DevTools session is disconnected, so response content cannot be retrieved.');
      },
      appendWireRow: () => {},
      applyWireSnapshot: () => {},
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
    });
    expect(() => viewer.requestBody(1, () => {})).toThrow('session is disconnected');
    const outcomes = [];
    viewer.failPendingBodyRequests('should reach nobody');
    expect(outcomes).toEqual([]);
  });

  test('fetchResponsePayload serves mirror rows through _mirrorFetchBody', async () => {
    const row = np.buildRowFromRequest(np.buildMirrorEntryFromWire(np.serializeRowForMirror(buildHostRow(9))), 9);
    row._reqObj = null;
    row._mirrorFetchBody = () => Promise.resolve({ content: 'hello body', encoding: '' });
    const payload = await np.fetchResponsePayload(row);
    expect(payload.content).toBe('hello body');
    expect(payload.text).toBe('hello body');

    const failingRow = np.buildRowFromRequest(np.buildMirrorEntryFromWire(np.serializeRowForMirror(buildHostRow(10))), 10);
    failingRow._reqObj = null;
    failingRow._mirrorFetchBody = () => Promise.reject(new Error('host gone'));
    await expect(np.fetchResponsePayload(failingRow)).rejects.toThrow(
      'Failed to retrieve response content for request 10: host gone',
    );

    const stalledRow = np.buildRowFromRequest(np.buildMirrorEntryFromWire(np.serializeRowForMirror(buildHostRow(11))), 11);
    stalledRow._reqObj = null;
    stalledRow._mirrorFetchBody = () => new Promise(() => {});
    await expect(np.fetchResponsePayload(stalledRow, 20)).rejects.toThrow(
      'Timed out retrieving response content for request 11',
    );
  });
});

describe('navigation body persistence', () => {
  const liveWaitingRow = () => ({
    responseContentState: 'not-loaded',
    responseContentReason: '',
    responseContentError: null,
    _reqObj: { getContent: () => {} },
  });

  test('marks only live rows still waiting on getContent, and nothing else', () => {
    const waiting = liveWaitingRow();
    const loading = { ...liveWaitingRow(), responseContentState: 'loading' };
    const cached = { ...liveWaitingRow(), responseContentState: 'cached', responseContent: 'body' };
    const embedded = { ...liveWaitingRow(), responseContentState: 'pending-admission' };
    const imported = { responseContentState: 'not-loaded', responseContentReason: '', _reqObj: {} };
    const mirror = {
      responseContentState: 'not-loaded',
      responseContentReason: '',
      _reqObj: null,
      _mirrorFetchBody: () => {},
    };
    const marked = np.markUnfetchedRowsForNavigation([waiting, loading, cached, embedded, imported, mirror, null]);
    expect(marked).toEqual([waiting]);
    expect(waiting.responseContentState).toBe('unavailable');
    expect(waiting.responseContentReason).toBe(np.NAVIGATION_BODY_UNAVAILABLE_REASON);
    expect(waiting._reqObj).toBeNull();
    expect(loading.responseContentState).toBe('loading');
    expect(cached.responseContentState).toBe('cached');
    expect(embedded.responseContentState).toBe('pending-admission');
    expect(imported.responseContentState).toBe('not-loaded');
    expect(mirror.responseContentState).toBe('not-loaded');
    expect(np.markUnfetchedRowsForNavigation(undefined)).toEqual([]);
  });

  test('a marked row rejects retrieval with the navigation reason instead of timing out', async () => {
    const row = np.buildRowFromRequest(
      {
        startedDateTime: '2026-08-21T04:05:06.789Z',
        time: 10,
        request: { method: 'GET', url: 'https://example.test/late', headers: [] },
        response: { status: 200, statusText: 'OK', headers: [], bodySize: 5, content: { mimeType: 'text/plain', size: 5 } },
        timings: {},
        getContent: () => {},
      },
      31,
    );
    expect(row.responseContentState).toBe('not-loaded');
    const marked = np.markUnfetchedRowsForNavigation([row]);
    expect(marked).toEqual([row]);
    await expect(np.cacheResponseContent(row)).rejects.toThrow(
      'The inspected page navigated away before this response body was retrieved.',
    );
  });
});

describe('selected-rows export scope', () => {
  test('planSelectedExportRows keeps capture order and exact membership', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const selection = new Set([rows[3], rows[1]]);
    expect(np.planSelectedExportRows(rows, selection, null)).toEqual([rows[1], rows[3]]);
  });

  test('a single focused row exports when no multi-selection exists', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(np.planSelectedExportRows(rows, new Set(), rows[1])).toEqual([rows[1]]);
    // A stale single selection no longer present in the capture is not exported.
    expect(np.planSelectedExportRows(rows, new Set(), { id: 99 })).toEqual([]);
  });

  test('empty selection plans an empty export', () => {
    expect(np.planSelectedExportRows([{ id: 1 }], new Set(), null)).toEqual([]);
    expect(np.planSelectedExportRows(undefined, new Set(), null)).toEqual([]);
  });

  test('selection that was evicted from the capture is not resurrected', () => {
    const rows = [{ id: 1 }];
    const evicted = { id: 2 };
    expect(np.planSelectedExportRows(rows, new Set([evicted]), null)).toEqual([]);
  });
});

describe('operation label extraction', () => {
  const json = (obj) => ({ mimeType: 'application/json', text: JSON.stringify(obj) });

  test('GraphQL operationName wins over query parsing', () => {
    expect(np.extractOperationLabel(json({ operationName: 'GetOrders', query: 'query Other { x }' }))).toBe('GetOrders');
  });

  test('named and anonymous GraphQL queries parse from the document', () => {
    expect(np.extractOperationLabel(json({ query: 'mutation CreateOrder($in: In!) { createOrder }' }))).toBe('CreateOrder');
    expect(np.extractOperationLabel(json({ query: 'query { viewer { id } }' }))).toBe('query');
    expect(np.extractOperationLabel(json({ query: '{ viewer { id } }' }))).toBe('query');
    expect(np.extractOperationLabel(json({ query: 'subscription OnPing { ping }' }))).toBe('OnPing');
  });

  test('application/graphql bodies parse directly', () => {
    expect(np.extractOperationLabel({ mimeType: 'application/graphql', text: 'query Dashboard { widgets }' })).toBe('Dashboard');
  });

  test('batched GraphQL and JSON-RPC report the first label with a count', () => {
    expect(
      np.extractOperationLabel(json([{ operationName: 'A', query: 'query A{x}' }, { operationName: 'B', query: 'query B{y}' }])),
    ).toBe('A (+1)');
    expect(
      np.extractOperationLabel(json([
        { jsonrpc: '2.0', method: 'eth_blockNumber', id: 1 },
        { jsonrpc: '2.0', method: 'eth_getBalance', id: 2 },
        { jsonrpc: '2.0', method: 'eth_call', id: 3 },
      ])),
    ).toBe('eth_blockNumber (+2)');
  });

  test('JSON-RPC requires the protocol shape, not just a method field', () => {
    expect(np.extractOperationLabel(json({ jsonrpc: '2.0', method: 'user.get', id: 7 }))).toBe('user.get');
    expect(np.extractOperationLabel(json({ method: 'POST', body: 'x' }))).toBe('');
  });

  test('non-candidates and malformed bodies stay blank', () => {
    expect(np.extractOperationLabel(null)).toBe('');
    expect(np.extractOperationLabel({ mimeType: 'application/json', text: '' })).toBe('');
    expect(np.extractOperationLabel({ mimeType: 'text/plain', text: 'query X { a }' })).toBe('');
    expect(np.extractOperationLabel({ mimeType: 'application/json', text: '{"query":broken' })).toBe('');
    expect(np.extractOperationLabel({ mimeType: 'application/json', text: '{"unrelated":1}' })).toBe('');
    expect(np.extractOperationLabel({ mimeType: 'application/json', text: '{"query":"' + 'a'.repeat(262200) + '"}' })).toBe('');
  });

  test('rows built from requests carry the operation label end to end', () => {
    const row = np.buildRowFromRequest(
      {
        startedDateTime: '2026-08-22T01:00:00.000Z',
        time: 12,
        request: {
          method: 'POST',
          url: 'https://api.example.test/graphql',
          headers: [],
          postData: { mimeType: 'application/json', text: '{"operationName":"GetCart","query":"query GetCart{cart}"}' },
        },
        response: { status: 200, statusText: 'OK', headers: [], bodySize: 10, content: { mimeType: 'application/json', size: 10 } },
        timings: {},
        getContent: () => {},
      },
      41,
    );
    expect(row.operation).toBe('GetCart');
    const wire = JSON.parse(JSON.stringify(np.serializeRowForMirror(row)));
    const viewerRow = np.buildRowFromRequest(np.buildMirrorEntryFromWire(wire), wire.id);
    expect(viewerRow.operation).toBe('GetCart');
  });
});

describe('websocket capture pieces', () => {
  test('the wrapper source is self-contained and carries its bounds', () => {
    const source = np.buildWsWrapperSource();
    expect(source.startsWith('(function pageWebSocketWrapper(')).toBe(true);
    expect(source.endsWith(')(' + np.WS_QUEUE_CAP + ',' + np.WS_FRAME_PREVIEW_CHARS + ')')).toBe(true);
    expect(source).toContain('window.__networkPlusWS__');
    expect(source).toContain("kind: 'ws-open-attempt'");
    // Self-contained: nothing from panel scope may leak into the page code.
    expect(source).not.toContain('state.');
    expect(source).not.toContain('chrome.');
  });

  test('frame lines carry direction arrows and bounded text trims from the front', () => {
    const at = Date.parse('2026-08-22T01:02:03.456Z');
    expect(np.formatWsFrameLine({ kind: 'ws-sent', at, preview: 'hello' })).toBe('↑ 01:02:03.456 hello');
    expect(np.formatWsFrameLine({ kind: 'ws-received', at, preview: 'world' })).toBe('↓ 01:02:03.456 world');
    expect(np.formatWsFrameLine({ kind: 'ws-closed', at, code: 1006, reason: 'gone' })).toBe(
      '— 01:02:03.456 closed (code 1006, gone)',
    );
    let text = '';
    for (let i = 0; i < 10; i++) text = np.appendBoundedWsText(text, 'line-' + i, 40);
    expect(text.startsWith('… earlier frames trimmed …')).toBe(true);
    expect(text.endsWith('line-9')).toBe(true);
    expect(text).not.toContain('line-0');
  });

  test('ingest creates rows on open attempts and threads frames into both directions', () => {
    const at = Date.parse('2026-08-22T02:00:00.000Z');
    const rows = new Map();
    const makeRow = (event) => {
      const row = {
        startedDateTime: new Date(event.at).toISOString(),
        requestPostData: { mimeType: 'text/plain', text: '' },
        responseContent: '',
        responseContentState: 'pending-admission',
        size: 0,
        duration: 0,
        statusText: 'Connecting',
      };
      rows.set(event.socketId, row);
      return row;
    };
    const context = { createRow: makeRow, getRow: (id) => rows.get(id) || null };
    const changed = np.ingestWsEvents(
      [
        { kind: 'ws-open-attempt', socketId: 1, url: 'wss://x.test/live', at },
        { kind: 'ws-open', socketId: 1, at: at + 20 },
        { kind: 'ws-sent', socketId: 1, preview: '{"subscribe":true}', at: at + 40 },
        { kind: 'ws-received', socketId: 1, preview: '{"data":1}', at: at + 60 },
        { kind: 'ws-received', socketId: 99, preview: 'orphan', at: at + 70 },
        { kind: 'ws-closed', socketId: 1, code: 1000, reason: '', at: at + 5000 },
        null,
        { kind: 'ws-open', socketId: 'bad' },
      ],
      context,
    );
    const row = rows.get(1);
    expect(changed).toEqual([row]);
    expect(row.requestPostData.text).toContain('↑');
    expect(row.requestPostData.text).toContain('{"subscribe":true}');
    expect(row.responseContent).toContain('connection open');
    expect(row.responseContent).toContain('↓');
    expect(row.responseContent).toContain('closed (code 1000)');
    expect(row.responseContentState).toBe('pending-admission');
    expect(row._wsSentCount).toBe(1);
    expect(row._wsReceivedCount).toBe(1);
    expect(row.size).toBe('{"data":1}'.length);
    expect(row.statusText).toBe('Closed');
    expect(row.duration).toBe(5000);
  });
});

describe('markdown copy and HAR websocket import', () => {
  const buildRow = (url, extra) =>
    np.buildRowFromRequest(
      {
        startedDateTime: '2026-08-22T03:00:00.000Z',
        time: 120,
        request: { method: 'GET', url, headers: [], postData: (extra && extra.postData) || null },
        response: {
          status: 503,
          statusText: 'Service Unavailable',
          headers: [],
          bodySize: 42,
          content: { mimeType: 'application/json', size: 42 },
        },
        timings: {},
        getContent: () => {},
      },
      (extra && extra.id) || 61,
    );

  test('single-row markdown renders a titled field table with escaped cells', () => {
    const row = buildRow('https://api.example.test/v1/items');
    row.statusText = 'Service|Unavailable';
    const text = np.formatRowMarkdown(row);
    expect(text.startsWith('### GET https://api.example.test/v1/items')).toBe(true);
    expect(text).toContain('| Field | Value |');
    expect(text).toContain('| Status | 503 Service\\|Unavailable |');
    expect(text).toContain('| Duration |');
    expect(np.escapeMarkdownTableCell('a|b\nc')).toBe('a\\|b c');
  });

  test('markdown copies ride the sanitizer, so query values never reach the clipboard', () => {
    const row = buildRow('https://api.example.test/v1/items?token=SECRET123&x=1');
    const payload = np.buildClipboardPayload('markdown', row, { mode: 'sanitized' });
    expect(payload.mode).toBe('sanitized');
    expect(payload.text).not.toContain('SECRET123');
    expect(payload.text).toContain('token=');
    expect(payload.text).toContain('### GET https://api.example.test/v1/items?');
  });

  test('the operation label appears in markdown when present', () => {
    const row = buildRow('https://api.example.test/graphql', {
      postData: { mimeType: 'application/json', text: '{"operationName":"GetCart","query":"query GetCart{cart}"}' },
    });
    expect(np.formatRowMarkdown(row)).toContain('| Operation | GetCart |');
  });

  test('the multi-row table keeps one line per request', () => {
    const rows = [buildRow('https://a.test/x', { id: 1 }), buildRow('https://b.test/y', { id: 2 })];
    const table = np.formatRowsMarkdownTable(rows);
    const lines = table.split('\n');
    expect(lines[0]).toBe('| # | Method | Status | URL | Duration | Size |');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain('| 1 | GET | 503 Service Unavailable | https://a.test/x |');
    expect(lines[3]).toContain('| 2 |');
  });

  test('_webSocketMessages thread into both panes sorted by time, with the limit noted', () => {
    const row = buildRow('wss://api.example.test/live');
    row.responseContent = '';
    row.responseContentState = 'pending-admission';
    const applied = np.applyHarWebSocketMessages(row, [
      { type: 'receive', time: 1755750000.2, opcode: 1, data: '{"pong":1}' },
      { type: 'send', time: 1755750000.1, opcode: 1, data: '{"ping":1}' },
      { type: 'receive', time: 1755750000300, opcode: 2, data: 'AAAA' },
      { type: 'ignored', time: 1, data: 'x' },
      null,
    ]);
    expect(applied).toBe(3);
    expect(row.requestPostData.text).toContain('↑');
    expect(row.requestPostData.text).toContain('{"ping":1}');
    expect(row.responseContent).toContain('{"pong":1}');
    expect(row.responseContent).toContain('[binary frame, 4 base64 chars]');
    expect(row.responseContent.indexOf('{"pong":1}')).toBeLessThan(row.responseContent.indexOf('[binary frame'));
    expect(row.responseContentState).toBe('pending-admission');

    const overflowRow = buildRow('wss://api.example.test/busy');
    overflowRow.responseContent = '';
    const many = Array.from({ length: np.HAR_WS_MESSAGE_IMPORT_LIMIT + 5 }, (_unused, index) => ({
      type: 'receive',
      time: 1755750000 + index,
      opcode: 1,
      data: 'm' + index,
    }));
    expect(np.applyHarWebSocketMessages(overflowRow, many)).toBe(np.HAR_WS_MESSAGE_IMPORT_LIMIT);
    expect(overflowRow.responseContent).toContain(
      'only the first ' + np.HAR_WS_MESSAGE_IMPORT_LIMIT + ' of ' + (np.HAR_WS_MESSAGE_IMPORT_LIMIT + 5) + ' WebSocket messages were imported',
    );
    expect(np.applyHarWebSocketMessages(buildRow('wss://x.test'), [])).toBe(0);
    expect(np.applyHarWebSocketMessages(null, [{ type: 'send', time: 1, data: 'x' }])).toBe(0);
  });
});

describe('edit-and-resend helpers', () => {
  const httpRow = {
    method: 'POST',
    url: 'https://api.example.test/v1/orders?id=1',
    requestHeaders: [
      { name: ':authority', value: 'api.example.test' },
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Authorization', value: 'Bearer abc' },
    ],
    requestPostData: { mimeType: 'application/json', text: '{"q":1}' },
  };

  test('canResendRow gates on protocol and WS rows', () => {
    expect(np.canResendRow(httpRow)).toBe(true);
    expect(np.canResendRow({ method: 'WS', url: 'https://x.test/socket' })).toBe(false);
    expect(np.canResendRow({ method: 'GET', url: 'file:///etc/hosts' })).toBe(false);
    expect(np.canResendRow({ method: 'GET', url: '' })).toBe(false);
    expect(np.canResendRow(null)).toBe(false);
  });

  test('buildResendSpecFromRow copies the request and drops HTTP/2 pseudo-headers', () => {
    const spec = np.buildResendSpecFromRow(httpRow);
    expect(spec.method).toBe('POST');
    expect(spec.url).toBe('https://api.example.test/v1/orders?id=1');
    expect(spec.headers.map((h) => h.name)).toEqual(['Content-Type', 'Authorization']);
    expect(spec.body).toBe('{"q":1}');
    expect(np.buildResendSpecFromRow({ method: 'GET', url: 'https://x.test/' }).body).toBe('');
  });

  test('header lines round-trip and invalid lines are reported', () => {
    const text = np.formatHeaderLines([{ name: 'A', value: 'b' }, { name: 'C', value: 'd: e' }]);
    expect(text).toBe('A: b\nC: d: e');
    const parsed = np.parseHeaderLines('A: b\n\n  C:d: e  \nbroken-line\n');
    expect(parsed.headers).toEqual([{ name: 'A', value: 'b' }, { name: 'C', value: 'd: e' }]);
    expect(parsed.invalidLines).toEqual(['broken-line']);
    expect(np.parseHeaderLines('').headers).toEqual([]);
  });

  test('isBrowserManagedHeaderName covers the fetch-forbidden families', () => {
    for (const name of ['Host', 'cookie', 'Origin', 'Content-Length', 'Sec-Fetch-Mode', 'Proxy-Authorization']) {
      expect(np.isBrowserManagedHeaderName(name)).toBe(true);
    }
    for (const name of ['Content-Type', 'Authorization', 'X-Request-Id']) {
      expect(np.isBrowserManagedHeaderName(name)).toBe(false);
    }
  });

  test('buildResendEvalSource produces a self-contained page IIFE with managed headers filtered', () => {
    const source = np.buildResendEvalSource({
      method: 'POST',
      url: 'https://api.example.test/echo?q="quote"',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Host', value: 'unsettable.test' },
        { name: 'Sec-Fetch-Site', value: 'none' },
      ],
      body: '{"a":"b"}',
      credentials: true,
    });
    expect(source.startsWith('(function pageResendRunner(')).toBe(true);
    expect(source.endsWith(')')).toBe(true);
    expect(source).toContain('fetch(spec.url');
    expect(source).toContain('"credentials":true');
    expect(source).toContain('Content-Type');
    expect(source).not.toContain('unsettable.test');
    expect(source).not.toContain('Sec-Fetch-Site');
    expect(source).toContain('\\"quote\\"');
    expect(source).toContain('\\"a\\"');
  });

  test('the page runner skips the body for GET and HEAD', () => {
    const source = np.buildResendEvalSource({ method: 'GET', url: 'https://x.test/', headers: [], body: 'ignored' });
    expect(source).toContain("spec.method !== 'GET' && spec.method !== 'HEAD'");
    expect(source).toContain('"credentials":true');
    const sameOrigin = np.buildResendEvalSource({ method: 'GET', url: 'https://x.test/', headers: [], credentials: false });
    expect(sameOrigin).toContain('"credentials":false');
  });
});

describe('jwt decoding and display', () => {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const makeToken = (payload, header = { alg: 'HS256', typ: 'JWT' }, signature = 'sig-Az_09') =>
    b64url(header) + '.' + b64url(payload) + '.' + signature;

  test('decodeJwt decodes header and payload without verifying', () => {
    const token = makeToken({ sub: 'user-1', exp: 1755750000, name: '試験ユーザー' });
    const decoded = np.decodeJwt(token);
    expect(decoded.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decoded.payload.sub).toBe('user-1');
    expect(decoded.payload.name).toBe('試験ユーザー');
    expect(decoded.signaturePresent).toBe(true);
  });

  test('decodeJwt rejects non-JWT shapes', () => {
    expect(np.decodeJwt('')).toBeNull();
    expect(np.decodeJwt('a.b')).toBeNull();
    expect(np.decodeJwt('eyJ.x.y')).toBeNull();
    expect(np.decodeJwt(b64url({ notalg: 1 }) + '.' + b64url({ a: 1 }) + '.s')).toBeNull();
    expect(np.decodeJwt(makeToken({ a: 1 }).slice(0, 20))).toBeNull();
    expect(np.decodeJwt('x'.repeat(np.JWT_MAX_TOKEN_CHARS + 1))).toBeNull();
    const unsigned = b64url({ alg: 'none' }) + '.' + b64url({ a: 1 }) + '.';
    expect(np.decodeJwt(unsigned).signaturePresent).toBe(false);
  });

  test('findJwtsInHeaders extracts tokens from header values and dedupes', () => {
    const token = makeToken({ exp: 1755750000 });
    const findings = np.findJwtsInHeaders([
      { name: 'Authorization', value: 'Bearer ' + token },
      { name: 'X-Duplicate', value: token },
      { name: 'Accept', value: 'application/json' },
      { name: 'X-Not-Jwt', value: 'eyJ%%%%broken' },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].headerName).toBe('Authorization');
    expect(findings[0].decoded.payload.exp).toBe(1755750000);
    expect(np.findJwtsInHeaders([])).toEqual([]);
    expect(np.findJwtsInHeaders(null)).toEqual([]);
  });

  test('expiry state and claim times humanize around now', () => {
    const now = 1755750000000;
    expect(np.getJwtExpiryState({ exp: now / 1000 - 300 }, now)).toEqual({ expired: true, label: 'expired 5 min ago' });
    expect(np.getJwtExpiryState({ exp: now / 1000 + 7200 }, now)).toEqual({ expired: false, label: 'expires in 2 h' });
    expect(np.getJwtExpiryState({}, now)).toEqual({ expired: false, label: '' });
    expect(np.describeJwtEpochClaim('exp', now / 1000 + 90, now)).toContain('(expires in 2 min)');
    expect(np.describeJwtEpochClaim('iat', now / 1000 - 45, now)).toContain('(45 s ago)');
    expect(np.describeJwtEpochClaim('exp', undefined, now)).toBeNull();
  });

  test('createJwtDetailsSection renders decoded sections with the non-verification note', () => {
    // The loadViewPreset suite earlier in this file runs jest.resetAllMocks(),
    // which strips the setup.js createElement implementation for everything
    // after it; reinstall a local element factory before touching the DOM.
    const makeEl = () => ({
      className: '',
      textContent: '',
      style: {},
      appendChild: jest.fn(),
      setAttribute: jest.fn(),
      classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(() => false) },
    });
    document.createElement.mockImplementation(makeEl);
    document.createElement.mockClear();
    const expired = makeToken({ exp: Math.floor(Date.now() / 1000) - 600, sub: 'user-1' });
    const section = np.createJwtDetailsSection([{ name: 'Authorization', value: 'Bearer ' + expired }]);
    expect(section).not.toBeNull();
    const created = document.createElement.mock.results.map((result) => result.value);
    const summary = created.find((el) => String(el.textContent).startsWith('JWT in Authorization'));
    expect(summary).toBeDefined();
    expect(summary.textContent).toContain('expired');
    expect(summary.classList.add).toHaveBeenCalledWith('jwt-expired');
    const note = created.find((el) => el.className === 'jwt-note');
    expect(note.textContent).toContain(np.JWT_DISPLAY_NOTE);
    const codeBlocks = created.filter((el) => el.className === 'code-block');
    expect(codeBlocks.some((el) => String(el.textContent).includes('"sub": "user-1"'))).toBe(true);
    expect(np.createJwtDetailsSection([{ name: 'Accept', value: 'text/html' }])).toBeNull();
  });
});

describe('sse capture pieces', () => {
  test('buildSseWrapperSource is a self-contained page IIFE with the shared caps', () => {
    const source = np.buildSseWrapperSource();
    expect(source.startsWith('(function pageEventSourceWrapper(')).toBe(true);
    expect(source.endsWith(')(' + np.WS_QUEUE_CAP + ',' + np.WS_FRAME_PREVIEW_CHARS + ')')).toBe(true);
    expect(source).toContain('window.__networkPlusSSE__');
    expect(source).toContain("kind: 'ws-open-attempt'");
    expect(source).toContain("kind: 'ws-received'");
    expect(source).toContain('Wrapped.prototype = Native.prototype;');
    // Observation only: the wrapped addEventListener always forwards to the native one.
    expect(source).toContain('return nativeAdd(type, listener, options);');
    expect(source).toContain('source.close = function () {');
  });

  test('formatWsFrameLine renders an SSE close without a close code', () => {
    const at = Date.parse('2026-08-22T10:00:00.123Z');
    expect(np.formatWsFrameLine({ kind: 'ws-closed', at })).toBe('— 10:00:00.123 closed');
    expect(np.formatWsFrameLine({ kind: 'ws-closed', at, code: 1000 })).toBe('— 10:00:00.123 closed (code 1000)');
  });

  test('ingestWsEvents threads SSE-dialect events into a receive-only row', () => {
    const row = {
      startedDateTime: '2026-08-22T10:00:00.000Z',
      statusText: 'Connecting',
      responseContent: '',
      size: 0,
    };
    const created = [];
    const changed = np.ingestWsEvents(
      [
        { kind: 'ws-open-attempt', socketId: 1, url: 'https://api.example.test/stream', protocols: '', at: 1 },
        { kind: 'ws-open', socketId: 1, at: Date.parse('2026-08-22T10:00:00.200Z') },
        { kind: 'ws-received', socketId: 1, preview: 'hello', at: Date.parse('2026-08-22T10:00:00.300Z') },
        { kind: 'ws-received', socketId: 1, preview: 'update: {"n":1}', at: Date.parse('2026-08-22T10:00:00.400Z') },
        { kind: 'ws-closed', socketId: 1, at: Date.parse('2026-08-22T10:00:01.000Z') },
      ],
      {
        createRow: (event) => {
          created.push(event.url);
          return row;
        },
        getRow: () => row,
      },
    );
    expect(created).toEqual(['https://api.example.test/stream']);
    expect(changed).toEqual([row]);
    expect(row.statusText).toBe('Closed');
    expect(row.responseContent).toContain('connection open');
    expect(row.responseContent).toContain('↓ 10:00:00.300 hello');
    expect(row.responseContent).toContain('↓ 10:00:00.400 update: {"n":1}');
    expect(row.responseContent).toContain('10:00:01.000 closed');
    expect(row.responseContent).not.toContain('code undefined');
    expect(row.duration).toBe(1000);
    expect(row.size).toBe('hello'.length + 'update: {"n":1}'.length);
  });
});

describe('mirror remote control (command channel + import transfer)', () => {
  const link = (options) => {
    const executed = [];
    const imports = [];
    let host;
    const viewer = np.createMirrorViewerSession({
      postMessage: (message) => host.handleMessage(message),
      appendWireRow: () => {},
      applyWireSnapshot: () => {},
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
      onHostSync: () => {},
    });
    host = np.createMirrorHostSession({
      postMessage: (message) => viewer.handleMessage(message),
      getRows: () => [],
      isPaused: () => false,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
      getControlState:
        (options && options.getControlState) ||
        (() => ({
          paused: false,
          retention: { requestLimit: 20000, unlimited: false },
          undoAvailable: true,
          streamCapture: { supported: true, enabled: false },
        })),
      executeCommand:
        (options && options.executeCommand) ||
        ((name, args, done) => {
          executed.push({ name, args });
          done(name === 'clear' ? 'nothing to clear' : '');
        }),
      receiveImportFile:
        (options && options.receiveImportFile) ||
        ((fileName, bytes, done) => {
          imports.push({ fileName, bytes: Array.from(bytes) });
          done('');
        }),
    });
    return { host, viewer, executed, imports };
  };

  test('sync carries the host control state to the viewer', () => {
    const syncs = [];
    let host;
    const viewer = np.createMirrorViewerSession({
      postMessage: (message) => host.handleMessage(message),
      appendWireRow: () => {},
      applyWireSnapshot: () => {},
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
      onHostSync: (message) => syncs.push(message),
    });
    host = np.createMirrorHostSession({
      postMessage: (message) => viewer.handleMessage(message),
      getRows: () => [],
      isPaused: () => true,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
      getControlState: () => ({
        paused: true,
        retention: { requestLimit: 500, unlimited: false },
        undoAvailable: false,
        streamCapture: { supported: true, enabled: true },
      }),
    });
    host.sendSync();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].paused).toBe(true);
    expect(syncs[0].control).toEqual({
      paused: true,
      retention: { requestLimit: 500, unlimited: false },
      undoAvailable: false,
      streamCapture: { supported: true, enabled: true },
    });
  });

  test('commands round-trip with per-command success and failure results', () => {
    const { viewer, executed } = link();
    const results = [];
    viewer.sendCommand('pause-toggle', {}, (error) => results.push(error));
    viewer.sendCommand('clear', {}, (error) => results.push(error && error.message));
    expect(executed.map((entry) => entry.name)).toEqual(['pause-toggle', 'clear']);
    expect(results[0]).toBeNull();
    expect(results[1]).toBe('nothing to clear');
  });

  test('a host without an executor refuses commands instead of dropping them', () => {
    let host;
    const viewer = np.createMirrorViewerSession({
      postMessage: (message) => host.handleMessage(message),
      appendWireRow: () => {},
      applyWireSnapshot: () => {},
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
    });
    host = np.createMirrorHostSession({
      postMessage: (message) => viewer.handleMessage(message),
      getRows: () => [],
      isPaused: () => false,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
    });
    let refusal = null;
    viewer.sendCommand('pause-toggle', {}, (error) => {
      refusal = error;
    });
    expect(refusal.message).toBe('This DevTools session does not accept mirror commands.');
  });

  test('import files chunk over the port and reassemble byte-for-byte', () => {
    const { viewer, imports } = link();
    const bytes = new Uint8Array(np.MIRROR_IMPORT_CHUNK_CHARS + 1024);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
    let result = 'pending';
    viewer.sendImportFile('capture.saz', bytes, (error) => {
      result = error;
    });
    expect(result).toBeNull();
    expect(imports).toHaveLength(1);
    expect(imports[0].fileName).toBe('capture.saz');
    expect(imports[0].bytes).toEqual(Array.from(bytes));
  });

  test('base64 helpers round-trip arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 66, 10, 13]);
    expect(Array.from(np.base64ToBytes(np.bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  test('oversized transfers and interrupted transfers fail with reasons', () => {
    // The oversize begin and the orphan end both produce command-result
    // errors on the wire instead of being dropped.
    const wire = [];
    const host = np.createMirrorHostSession({
      postMessage: (message) => wire.push(message),
      getRows: () => [],
      isPaused: () => false,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
      receiveImportFile: (fileName, bytes, done) => done(''),
    });
    host.handleMessage({ type: 'import-begin', commandId: 1, fileName: 'big.har', size: np.MIRROR_IMPORT_MAX_BYTES + 1 });
    host.handleMessage({ type: 'import-end', commandId: 2 });
    const results = wire.filter((message) => message.type === 'command-result');
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toContain('64 MiB');
    expect(results[1].ok).toBe(false);
    expect(results[1].error).toBe('The import transfer was interrupted.');
  });

  test('a disconnect fails pending commands as well as pending bodies', () => {
    const viewer = np.createMirrorViewerSession({
      postMessage: () => {},
      appendWireRow: () => {},
      applyWireSnapshot: () => {},
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
    });
    let commandError = null;
    viewer.sendCommand('pause-toggle', {}, (error) => {
      commandError = error;
    });
    viewer.failPendingBodyRequests('The DevTools session disconnected.');
    expect(commandError.message).toBe('The DevTools session disconnected.');
  });

  test('a command with no answer times out instead of hanging its affordance', () => {
    jest.useFakeTimers();
    try {
      const viewer = np.createMirrorViewerSession({
        postMessage: () => {},
        appendWireRow: () => {},
        applyWireSnapshot: () => {},
        getLocalCount: () => 0,
        getLocalMaxId: () => 0,
      });
      const results = [];
      viewer.sendCommand('pause-toggle', {}, (error) => results.push(error));
      expect(results).toHaveLength(0);
      jest.advanceTimersByTime(np.MIRROR_COMMAND_TIMEOUT_MS + 1);
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('did not answer in time');
      // A late result must not double-fire the callback.
      viewer.handleMessage({ type: 'command-result', commandId: 1, ok: true, error: '' });
      expect(results).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('an import result gets the generous budget, not the command timeout', () => {
    jest.useFakeTimers();
    try {
      const wire = [];
      const viewer = np.createMirrorViewerSession({
        postMessage: (message) => wire.push(message),
        appendWireRow: () => {},
        applyWireSnapshot: () => {},
        getLocalCount: () => 0,
        getLocalMaxId: () => 0,
      });
      const results = [];
      viewer.sendImportFile('capture.har', new Uint8Array([1, 2, 3]), (error) => results.push(error));
      jest.advanceTimersByTime(np.MIRROR_COMMAND_TIMEOUT_MS + 1);
      expect(results).toHaveLength(0);
      jest.advanceTimersByTime(np.MIRROR_IMPORT_RESULT_TIMEOUT_MS);
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('did not answer in time');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a transfer that exceeds its declared size is refused mid-flight', () => {
    const wire = [];
    const host = np.createMirrorHostSession({
      postMessage: (message) => wire.push(message),
      getRows: () => [],
      isPaused: () => false,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
      receiveImportFile: (fileName, bytes, done) => done(''),
    });
    host.handleMessage({ type: 'import-begin', commandId: 7, fileName: 'lie.har', size: 30 });
    host.handleMessage({ type: 'import-chunk', commandId: 7, data: 'A'.repeat(100) });
    host.handleMessage({ type: 'import-end', commandId: 7 });
    const results = wire.filter((message) => message.type === 'command-result');
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toBe('The transfer exceeded its declared size and was refused.');
    // The follow-up end for the refused transfer reports the interruption
    // and the viewer ignores it as an already-settled command.
    expect(results[1].error).toBe('The import transfer was interrupted.');
  });

  test('dropImportTransfers abandons an in-flight transfer on disconnect', () => {
    const wire = [];
    const imports = [];
    const host = np.createMirrorHostSession({
      postMessage: (message) => wire.push(message),
      getRows: () => [],
      isPaused: () => false,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
      receiveImportFile: (fileName, bytes, done) => {
        imports.push(fileName);
        done('');
      },
    });
    host.handleMessage({ type: 'import-begin', commandId: 9, fileName: 'orphan.har', size: 10 });
    host.handleMessage({ type: 'import-chunk', commandId: 9, data: np.bytesToBase64(new Uint8Array([1, 2])) });
    host.dropImportTransfers();
    host.handleMessage({ type: 'import-end', commandId: 9 });
    expect(imports).toHaveLength(0);
    const results = wire.filter((message) => message.type === 'command-result');
    expect(results[0].error).toBe('The import transfer was interrupted.');
  });
});
