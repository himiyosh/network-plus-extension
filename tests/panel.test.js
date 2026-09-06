/**
 * Unit tests for Network+ pure utility functions
 */

const fs = require('fs');
const path = require('path');

const np = require('../panel.js');

const PANEL_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'panel.js'), 'utf8');

// Every uiTextFormat() call site in panel.js whose slot is filled from the
// dictionary, read out of the source rather than remembered. A frame that
// composes a translated noun into a translated sentence is exactly where an
// English space can survive around a Japanese word, and the coverage check in
// the composed-frames test fails the moment a new one is written.
const DICTIONARY_LOOKUPS = [
  'uiText',
  'uiTextFormat',
  'paneSearchLabel',
  'menuHighlightColorLabel',
  'searchColorLabel',
  'menuColumnLabel',
  'localizeBodyReason',
];
const DICTIONARY_CALL = new RegExp('\\b(?:' + DICTIONARY_LOOKUPS.join('|') + ')\\s*\\(');

function splitTopLevel(source, separator) {
  const pieces = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    const char = source[index];
    if (char && '([{'.indexOf(char) !== -1) depth += 1;
    else if (char && ')]}'.indexOf(char) !== -1) depth -= 1;
    if (index === source.length || (char === separator && depth === 0)) {
      pieces.push(source.slice(start, index));
      start = index + 1;
    }
  }
  return pieces;
}

// The literal keys a call site's first argument can take: a string, a ternary
// of strings, or a parameter of a local helper, resolved through that helper's
// own call sites.
function resolveFrameKeys(keyExpression, source) {
  const literals = keyExpression.match(/'([A-Za-z0-9_]+)'/g);
  if (literals) return literals.map((token) => token.slice(1, -1));
  const name = keyExpression.trim();
  if (!/^[A-Za-z0-9_]+$/.test(name)) return [];
  const helper = new RegExp('(?:const|let|var)\\s+([A-Za-z0-9_]+)\\s*=\\s*\\(\\s*' + name + '\\s*[,)]').exec(source);
  if (!helper) return [];
  const calls = source.match(new RegExp('\\b' + helper[1] + "\\('([A-Za-z0-9_]+)'", 'g')) || [];
  return Array.from(new Set(calls.map((call) => call.replace(/^[^']*'/, '').replace(/'$/, ''))));
}

function composedFrameCallSites(source = PANEL_SOURCE) {
  const sites = [];
  const opener = /uiTextFormat\(/g;
  let match;
  while ((match = opener.exec(source))) {
    const argsStart = match.index + match[0].length;
    let depth = 1;
    let end = argsStart;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      else if (source[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const [keyExpression, ...rest] = splitTopLevel(source.slice(argsStart, end), ',');
    const argument = rest.join(',').trim();
    if (!argument.startsWith('{')) continue;
    const line = source.slice(0, match.index).split(String.fromCharCode(10)).length;
    const keys = resolveFrameKeys(keyExpression, source);
    for (const piece of splitTopLevel(argument.replace(/^\{/, '').replace(/\}$/, ''), ',')) {
      const entry = piece.trim();
      if (!entry) continue;
      const colon = entry.indexOf(':');
      const slot = (colon < 0 ? entry : entry.slice(0, colon)).trim();
      const value = (colon < 0 ? entry : entry.slice(colon + 1)).trim();
      const composed =
        DICTIONARY_CALL.test(value) ||
        (/^[A-Za-z0-9_]+$/.test(value) &&
          new RegExp(
            '(?:const|let|var)\\s+' + value + '\\s*=\\s*[^;\n]*?\\b(?:' + DICTIONARY_LOOKUPS.join('|') + ')\\s*\\(',
          ).test(source));
      if (!composed) continue;
      for (const key of keys) sites.push({ key, slot, line });
    }
  }
  return sites;
}

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

  // A blob: URL embeds the origin that created it. Split as if it were
  // hierarchical it reads as a request to that origin, which never happened.
  test('names the scheme instead of blanking the domain for opaque URLs', () => {
    const blob = np.extractUrlParts('blob:https://cdn.example.test/5d76341a-9c1e-4f2b');
    expect(blob.domain).toBe('blob:');
    expect(blob.path).toBe('https://cdn.example.test/5d76341a-9c1e-4f2b');

    const data = np.extractUrlParts('data:text/html;base64,PGh0bWw+');
    expect(data.domain).toBe('data:');
    expect(data.path).toBe('text/html;base64,PGh0bWw+');

    expect(np.extractUrlParts('about:blank').domain).toBe('about:');
    // A real host still wins, including one that only differs by scheme.
    expect(np.extractUrlParts('https://cdn.example.test/a').domain).toBe('cdn.example.test');
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

describe('planTimingTable', () => {
  // Every shape the pane can be handed: phases that account for the reported
  // duration exactly, phases that fall short of it, phases that overrun it,
  // a capture with nothing at all, and one whose only phase is a genuine zero.
  const SHAPES = [
    ['exact', { blocked: 10, dns: 20, connect: 100, ssl: 40, send: 5, wait: 60, receive: 25 }, 220],
    ['short of the reported duration', { blocked: 1, dns: 2, connect: 3, send: 4, wait: 20, receive: 5 }, 40],
    ['past the reported duration', { blocked: 50, wait: 100, receive: 50 }, 120],
    ['nothing reported', {}, 0],
    ['a single genuine zero', { wait: 0 }, 0],
    ['sub-millisecond phases', { dns: 0.4, wait: 0.6 }, 1],
  ];

  test.each(SHAPES)('shares sum to 100%% of the span for %s', (_name, timings, duration) => {
    const plan = np.planTimingTable(timings, duration);
    const sum = plan.rows.reduce((total, row) => total + row.sharePct, 0) + plan.unaccountedSharePct;
    // A span of zero has no whole to take a share of; anything else adds up.
    expect([plan.span > 0, Math.abs(sum - (plan.span > 0 ? 100 : 0)) < 1e-9]).toEqual([
      plan.span > 0,
      true,
    ]);
  });

  test.each(SHAPES)('offsets accumulate and no bar leaves the track for %s', (_name, timings, duration) => {
    const plan = np.planTimingTable(timings, duration);
    let runningTotal = 0;
    for (const row of plan.rows) {
      // Each row starts exactly where the phase before it ended — the previous
      // offset plus the previous share, not merely somewhere at or past it. A
      // monotonic check alone passed bars that crept forward by half a share.
      expect([row.phase, Math.abs(row.offsetPct - runningTotal) < 1e-9]).toEqual([row.phase, true]);
      expect([row.phase, row.offsetPct + row.widthPct <= 100 + 1e-9]).toEqual([row.phase, true]);
      runningTotal += row.sharePct;
    }
    // The remainder row starts where the last phase ended, for the same reason.
    expect(Math.abs(plan.unaccountedOffsetPct - runningTotal) < 1e-9).toBe(true);
    expect(plan.unaccountedOffsetPct + plan.unaccountedSharePct).toBeLessThanOrEqual(100 + 1e-9);
  });

  test('offsets are exactly the running total of the phases before each row', () => {
    const plan = np.planTimingTable(
      { blocked: 10, dns: 20, connect: 100, ssl: 40, send: 5, wait: 60, receive: 25 },
      220,
    );
    // connect is 100 - 40 of TLS, so the span is 220 and each offset is the
    // sum of the shares above it.
    expect(plan.span).toBe(220);
    expect(plan.rows.map((row) => Number(row.offsetPct.toFixed(4)))).toEqual([
      0,
      Number(((10 / 220) * 100).toFixed(4)),
      Number(((30 / 220) * 100).toFixed(4)),
      Number(((90 / 220) * 100).toFixed(4)),
      Number(((130 / 220) * 100).toFixed(4)),
      Number(((135 / 220) * 100).toFixed(4)),
      Number(((195 / 220) * 100).toFixed(4)),
    ]);
    expect(plan.hasUnaccounted).toBe(false);
    expect(plan.totalSharePct).toBe(100);
  });

  test('a phase never reported and a phase reported as zero are both muted but not the same claim', () => {
    const plan = np.planTimingTable({ blocked: 0, dns: -1, wait: 20 }, 20);
    const byPhase = Object.fromEntries(plan.rows.map((row) => [row.phase, row]));
    // Both are muted and neither draws a bar...
    expect([byPhase.blocked.muted, byPhase.dns.muted]).toEqual([true, true]);
    expect([byPhase.blocked.widthPct, byPhase.dns.widthPct]).toEqual([0, 0]);
    // ...but only one of them is a measurement the capture actually made.
    expect([byPhase.blocked.available, byPhase.dns.available]).toEqual([true, false]);
    expect(byPhase.wait.muted).toBe(false);
    expect(byPhase.wait.sharePct).toBe(100);
  });

  test('the duration no phase accounts for becomes a row rather than a gap', () => {
    const plan = np.planTimingTable({ blocked: 1, dns: 2, connect: 3, send: 4, wait: 20, receive: 5 }, 40);
    expect(plan.segmentTotal).toBe(35);
    expect(plan.span).toBe(40);
    expect(plan.hasUnaccounted).toBe(true);
    expect(plan.unaccounted).toBe(5);
    expect(plan.unaccountedSharePct).toBe(12.5);
    expect(plan.unaccountedOffsetPct).toBe(87.5);
    expect(plan.totalSharePct).toBe(100);
  });

  test('float residue under a microsecond is not reported as an unaccounted row', () => {
    const plan = np.planTimingTable({ wait: 19.9999995 }, 20);
    expect(plan.unaccounted).toBeGreaterThan(0);
    expect(plan.hasUnaccounted).toBe(false);
  });

  test('phases that sum past the reported duration show it in the Total share', () => {
    const plan = np.planTimingTable({ blocked: 50, wait: 100, receive: 50 }, 120);
    expect(plan.segmentTotal).toBe(200);
    expect(plan.span).toBe(200);
    expect(plan.hasUnaccounted).toBe(false);
    // The Total row still reports the row's own duration; its share is what
    // marks that the phases claim more time than the request took.
    expect(plan.total).toBe(120);
    expect(plan.totalSharePct).toBe(60);
  });

  test('a capture with no usable timing at all plans a table of muted rows', () => {
    const plan = np.planTimingTable(null, NaN);
    expect(plan.rows).toHaveLength(7);
    expect(plan.rows.every((row) => row.muted && !row.available && row.widthPct === 0)).toBe(true);
    expect([plan.span, plan.hasUnaccounted, plan.totalSharePct]).toEqual([0, false, 0]);
  });

  test('says whether any phase was reported, so the pane can collapse to one line when none was', () => {
    // No phases at all — with or without a reported duration — is one fact,
    // not seven "not reported" rows under a bar that is 100% unaccounted.
    expect(np.planTimingTable(null, NaN).phasesReported).toBe(false);
    expect(np.planTimingTable({}, 0).phasesReported).toBe(false);
    expect(np.planTimingTable({}, 40).phasesReported).toBe(false);
    expect(np.planTimingTable({ dns: -1, connect: -1 }, 40).phasesReported).toBe(false);
    // A single phase, even a genuine zero, is a report.
    expect(np.planTimingTable({ wait: 0 }, 0).phasesReported).toBe(true);
    expect(np.planTimingTable({ blocked: 1, dns: -1 }, 40).phasesReported).toBe(true);
  });
});

describe('timing table formatters', () => {
  // fmtTime rounds, so a phase that took time can render as '0 ms'. Stated
  // over a matrix rather than at one value: the property is that no non-zero
  // duration is ever rendered as a bare zero.
  const SUB_MS = [0.001, 0.04, 0.1, 0.25, 0.4, 0.49, 0.499];
  const ROUNDS_UP = [0.5, 0.51, 0.9, 1, 1.4];

  test.each(SUB_MS)('%p ms is marked as below the formatter resolution, never as 0 ms', (ms) => {
    expect(np.fmtTime(ms)).toBe('0 ms');
    expect(np.formatTimingDuration(ms)).toBe('< 1 ms');
  });

  test.each(ROUNDS_UP)('%p ms keeps the plain formatting', (ms) => {
    expect(np.formatTimingDuration(ms)).toBe(np.fmtTime(ms));
    expect(np.formatTimingDuration(ms)).not.toBe('< 1 ms');
  });

  test('a genuine zero is a zero, and an absent duration formats to nothing', () => {
    expect(np.formatTimingDuration(0)).toBe('0 ms');
    expect(np.formatTimingDuration(-1)).toBe('');
    expect(np.formatTimingDuration(NaN)).toBe('');
    expect(np.formatTimingDuration(null)).toBe('');
    expect(np.formatTimingDuration(1500)).toBe('1.50 s');
  });

  test.each([0.0001, 0.004, 0.01, 0.049])('a %p%% share is marked, never rendered as 0.0%%', (pct) => {
    expect(pct.toFixed(1)).toBe('0.0');
    expect(np.formatTimingShare(pct)).toBe('< 0.1%');
  });

  test.each([
    [0, '0.0%'],
    [0.05, '0.1%'],
    [12.5, '12.5%'],
    [99.62, '99.6%'],
    [100, '100.0%'],
  ])('a %p%% share renders as %p', (pct, expected) => {
    expect(np.formatTimingShare(pct)).toBe(expected);
  });

  test('an absent share formats to nothing', () => {
    expect(np.formatTimingShare(NaN)).toBe('');
    expect(np.formatTimingShare(-1)).toBe('');
    expect(np.formatTimingShare(null)).toBe('');
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

  // The names are the table's key column now, not a collapsed guide's, so
  // they translate. English stays byte-identical to the guidance labels; the
  // acronyms are kept as they are in Japanese; an undocumented key is itself.
  test('the displayed phase names translate through the dictionary, acronyms kept', () => {
    np.applyLanguage('en');
    for (const phase of ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive']) {
      expect([phase, np.timingPhaseLabel(phase)]).toEqual([phase, np.getTimingPhaseGuidance(phase).label]);
    }
    expect(np.timingPhaseLabel('_blocked_queueing')).toBe('_blocked_queueing');
    np.applyLanguage('ja');
    expect(
      ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'].map((phase) => np.timingPhaseLabel(phase)),
    ).toEqual(['ブロック', 'DNS', '接続', 'TLS (SSL)', '送信', '待機 (TTFB)', '受信']);
    // The sub-tenth share marker keeps the digit column's shape in both
    // languages: a numeral, not prose, right-aligned under the other shares.
    expect(np.formatTimingShare(0.04)).toBe('< 0.1%');
    np.applyLanguage('en');
    expect(np.formatTimingShare(0.04)).toBe('< 0.1%');
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

  test('recognises bytes that survived the decoder only as replacement characters', () => {
    // The 1x1 transparent GIF a cookie-sync endpoint returns. Decoded as text
    // it reads `GIF89a` and then falls apart, which is the mojibake users see.
    const gif = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    expect(np.isUndecodableBodyText(np.decodeResponseContent(gif, 'base64'))).toBe(true);

    // Text stays text, including text that is mostly punctuation or CJK.
    expect(np.isUndecodableBodyText('{"ok":true,"items":[1,2,3]}')).toBe(false);
    expect(np.isUndecodableBodyText('<!doctype html>\n<html>\r\n\t<body>hi</body>\n</html>')).toBe(false);
    expect(np.isUndecodableBodyText('こんにちは、世界。')).toBe(false);
    expect(np.isUndecodableBodyText('')).toBe(false);
    expect(np.isUndecodableBodyText(null)).toBe(false);

    // One bad byte in an otherwise readable page must stay readable — that is
    // the difference between this and "contains any replacement character".
    expect(np.isUndecodableBodyText('a'.repeat(4000) + '\uFFFD')).toBe(false);
    // A NUL settles it on its own, wherever it appears.
    expect(np.isUndecodableBodyText('plain text\u0000more')).toBe(true);
  });

  test('lays binary bodies out as an offset/hex/printable dump', () => {
    const bytes = Uint8Array.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
      0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xff, 0x00,
    ]);
    const dump = np.formatHexDump(bytes, 4096);
    const lines = dump.text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('00000000  47 49 46 38 39 61 01 00  01 00 80 00 00 00 00 00  |GIF89a..........|');
    // A short final line keeps the gutter aligned by padding the hex columns.
    expect(lines[1]).toBe('00000010  ff 00                                             |..|');
    expect(dump.shownBytes).toBe(18);
    expect(dump.totalBytes).toBe(18);

    // The cap reports what it left out rather than silently ending early.
    const capped = np.formatHexDump(bytes, 8);
    expect(capped.shownBytes).toBe(8);
    expect(capped.totalBytes).toBe(18);
    expect(capped.text.split('\n')).toHaveLength(1);
  });

  test('base64ByteLength counts the decoded bytes without decoding', () => {
    for (const size of [0, 1, 2, 3, 4, 17, 42, 4096]) {
      const base64 = Buffer.alloc(size, 7).toString('base64');
      expect({ size, bytes: np.base64ByteLength(base64) }).toEqual({ size, bytes: size });
    }
    // Line-wrapped base64, as HAR files sometimes carry it.
    expect(np.base64ByteLength('AAAA\nAAAA')).toBe(6);
    expect(np.base64ByteLength(null)).toBe(0);
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
    expect(invalid.setting).toEqual({ requestLimit: 20000, unlimited: true });
    expect(invalid.warning).toContain('restored');
    // A reader who has never opened Settings keeps every request: the absent
    // setting resolves to unlimited, and silently — nothing was misread.
    expect(np.normalizeRetentionSetting(null)).toEqual({
      setting: { requestLimit: 20000, unlimited: true },
      warning: '',
    });
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

  test('reorder hops over a column the wrap dropped, not to a header that is not there', () => {
    const columns = [
      { id: 'id', visible: true },
      { id: 'match', visible: true },
      { id: 'method', visible: true },
    ];
    // Without the auto-hidden set the middle column is still a neighbour.
    expect(np.getAdjacentVisibleColumnId(columns, 'method', -1)).toBe('match');
    expect(np.getAdjacentVisibleColumnId(columns, 'id', 1)).toBe('match');
    // With it, the reorder lands on the column the reader can actually see.
    const dropped = new Set(['match']);
    expect(np.getAdjacentVisibleColumnId(columns, 'method', -1, dropped)).toBe('id');
    expect(np.getAdjacentVisibleColumnId(columns, 'id', 1, dropped)).toBe('method');
    expect(np.getAdjacentVisibleColumnId(columns, 'id', -1, dropped)).toBeNull();
  });

  // Elastic auto-hide. Every assertion below is a property of the plan over a
  // matrix of wrap widths, not a spot check on one arithmetic constant: the
  // stored widths this reads are free to change, the policy is not.
  describe('auto-hide plans a set that fits the wrap', () => {
    const WRAP_WIDTHS = [320, 375, 456, 500, 622, 738, 800, 900, 992, 1156, 1280, 1920];
    const P1_IDS = ['status', 'method', 'domain', 'path'];
    const defaults = () => np.DEFAULT_COLUMNS.map((column) => ({ ...column }));
    const surviving = (columns, hiddenIds) =>
      columns.filter((column) => column.visible && !hiddenIds.includes(column.id));
    const floorSum = (columns) =>
      columns.reduce((sum, column) => sum + np.minRenderedColumnWidth(column), 0);

    // The shipped default widths, written out. Every fit decision in this
    // file and in the browser suite is arithmetic over these numbers, so this
    // is the one place they are stated rather than read back: a silent change
    // to a default width has to fail a test, not quietly move a boundary.
    // None of them is a font measurement — they are the stored px the panel
    // ships with, identical on every platform.
    test('ships the default column widths it plans against', () => {
      expect(
        np.DEFAULT_COLUMNS.map((column) => [column.id, column.width, column.visible]),
      ).toEqual([
        ['match', 36, true],
        ['id', 60, true],
        ['method', 80, true],
        ['status', 70, true],
        ['domain', 140, true],
        ['path', 260, true],
        ['type', 90, true],
        ['operation', 150, false],
        ['customHeader', 160, false],
        ['duration', 80, true],
        ['size', 72, true],
        ['clientStart', 104, true],
        ['serverDone', 104, false],
        ['initiator', 220, false],
        ['url', 420, false],
        ['waterfall', 200, false],
      ]);
    });

    test('never drops a P1 column, and drops P3 before P2', () => {
      for (const wrapWidth of WRAP_WIDTHS) {
        const columns = defaults();
        const hiddenIds = np.planAutoHiddenColumns(columns, wrapWidth, {});
        const at = 'wrap ' + wrapWidth + ' -> ' + hiddenIds.join(',');
        for (const id of P1_IDS) {
          expect([at, hiddenIds.includes(id)]).toEqual([at, false]);
        }
        // A tier is only entered once the one below it is exhausted.
        const droppedTier2 = hiddenIds.filter((id) => np.columnAutoHidePriority(id) === 2);
        if (droppedTier2.length > 0) {
          const remainingTier3 = surviving(columns, hiddenIds).filter(
            (column) => np.columnAutoHidePriority(column.id) === 3,
          );
          expect([at, remainingTier3.map((column) => column.id)]).toEqual([at, []]);
        }
      }
    });

    // The order BETWEEN the tiers is asserted above; this is the order INSIDE
    // each one. The returned list is the drop order — the plan pushes ids as
    // it gives them up — so a wrap too narrow to hold even the undroppable set
    // reads out the whole queue at once, in the order the spec fixes it:
    // P3 Match, Client start, Server done, Type, then P2 ID, Duration, Size.
    test('drops in the specified order inside each tier, not merely tier by tier', () => {
      // Server done is off by default and is the only P3 entry that would go
      // unwitnessed, taking a swap of the two middle entries with it.
      const columns = np.DEFAULT_COLUMNS.map((column) =>
        column.id === 'serverDone' ? { ...column, visible: true } : { ...column },
      );
      const kept = surviving(columns, np.planAutoHiddenColumns(columns, 150, {}));
      expect(kept.map((column) => column.id)).toEqual(['method', 'status', 'domain', 'path']);
      expect(np.planAutoHiddenColumns(columns, 150, {})).toEqual([
        'match',
        'clientStart',
        'serverDone',
        'type',
        'id',
        'duration',
        'size',
      ]);
      // Not an artefact of the extreme width: the same queue is walked from
      // the front at a wrap that stops part of the way through it.
      const partial = np.planAutoHiddenColumns(columns, 700, {});
      expect(partial).toEqual(['match', 'clientStart', 'serverDone', 'type']);
    });

    // The spec's last clause: an optional column the reader turned on is on no
    // drop list, and the planner ranks it last within P3 — after every listed
    // P3 column — and among those, right to left in the reader's own order.
    test('an optional column the reader enabled drops last in P3, right to left', () => {
      const columns = np.DEFAULT_COLUMNS.map((column) =>
        column.id === 'url' || column.id === 'initiator'
          ? { ...column, visible: true }
          : { ...column },
      );
      // Initiator sits left of URL in the reader's column order.
      expect(columns.filter((column) => column.visible).map((column) => column.id)).toEqual([
        'match',
        'id',
        'method',
        'status',
        'domain',
        'path',
        'type',
        'duration',
        'size',
        'clientStart',
        'initiator',
        'url',
      ]);
      // Every listed P3 column goes while both reader-enabled ones stay: what
      // they asked for outlasts what the defaults chose for them.
      expect(np.planAutoHiddenColumns(columns, 1300, {})).toEqual(['match', 'clientStart', 'type']);
      // Then the rightmost of the two, then the other.
      expect(np.planAutoHiddenColumns(columns, 1100, {})).toEqual([
        'match',
        'clientStart',
        'type',
        'url',
      ]);
      expect(np.planAutoHiddenColumns(columns, 700, {})).toEqual([
        'match',
        'clientStart',
        'type',
        'url',
        'initiator',
      ]);
      // And only once P3 is exhausted does P2 start, in its own order.
      expect(np.planAutoHiddenColumns(columns, 150, {})).toEqual([
        'match',
        'clientStart',
        'type',
        'url',
        'initiator',
        'id',
        'duration',
        'size',
      ]);
    });

    test('the surviving set fits the wrap unless only P1 is left', () => {
      for (const wrapWidth of WRAP_WIDTHS) {
        const columns = defaults();
        const hiddenIds = np.planAutoHiddenColumns(columns, wrapWidth, {});
        const kept = surviving(columns, hiddenIds);
        const at = 'wrap ' + wrapWidth + ' -> ' + kept.map((column) => column.id).join(',');
        // Horizontal scroll is left over for exactly one case: the columns
        // that may not be dropped do not fit, even with Path at its floor.
        const onlyUndroppable = kept.every((column) => np.columnAutoHidePriority(column.id) === 1);
        expect([at, floorSum(kept) <= wrapWidth || onlyUndroppable]).toEqual([at, true]);
      }
    });

    test('a wider wrap never hides more than a narrower one', () => {
      const columns = defaults();
      let previous = null;
      for (const wrapWidth of WRAP_WIDTHS) {
        const hiddenIds = np.planAutoHiddenColumns(columns, wrapWidth, {});
        const at = 'wrap ' + wrapWidth + ' -> ' + hiddenIds.join(',');
        if (previous) {
          expect([at, hiddenIds.every((id) => previous.includes(id))]).toEqual([at, true]);
        }
        previous = hiddenIds;
      }
      // And the widest wrap in the matrix hides nothing at all.
      expect(np.planAutoHiddenColumns(columns, 1920, {})).toEqual([]);
    });

    test('re-planning against the same wrap is stable, and restoring is stickier than hiding', () => {
      for (const wrapWidth of WRAP_WIDTHS) {
        const columns = defaults();
        const first = np.planAutoHiddenColumns(columns, wrapWidth, {});
        const second = np.planAutoHiddenColumns(columns, wrapWidth, { previousHiddenIds: first });
        const at = 'wrap ' + wrapWidth;
        expect([at, second]).toEqual([at, first]);
      }
      // Stability is not hysteresis. At every width in the matrix above a
      // small nudge sits inside a dead zone, so the plan is unchanged with the
      // constant at its shipped value AND with it set to zero — an assertion
      // over those widths says nothing about the constant at all. It only
      // decides where a restore is pending, so the pin goes there: at this
      // wrap Size is dropped, and 20px more is enough to take it back with no
      // hysteresis, which is exactly what the shipped constant refuses.
      const columns = defaults();
      const HYSTERESIS_WRAP = 462;
      const HYSTERESIS_NUDGE = 20;
      const pending = np.planAutoHiddenColumns(columns, HYSTERESIS_WRAP, {});
      expect(pending).toContain('size');
      expect(
        np.planAutoHiddenColumns(columns, HYSTERESIS_WRAP + HYSTERESIS_NUDGE, {
          previousHiddenIds: pending,
        }),
      ).toEqual(pending);
      expect(
        np.planAutoHiddenColumns(columns, HYSTERESIS_WRAP + HYSTERESIS_NUDGE, {
          previousHiddenIds: pending,
          hysteresis: 0,
        }),
      ).not.toContain('size');
      // And the whole of the constant is spent on that refusal: the wrap has
      // to grow by 16px more than a memoryless plan would need before the
      // column comes back, which is the shipped hysteresis, stated here as a
      // number rather than read back out of the module it guards.
      const smallestNudgeRestoringSize = (options) => {
        for (let nudge = 0; nudge <= 64; nudge += 1) {
          const plan = np.planAutoHiddenColumns(columns, HYSTERESIS_WRAP + nudge, {
            previousHiddenIds: pending,
            ...options,
          });
          if (!plan.includes('size')) return nudge;
        }
        return null;
      };
      expect(smallestNudgeRestoringSize({ hysteresis: 0 })).toBe(HYSTERESIS_NUDGE);
      expect(smallestNudgeRestoringSize({}) - smallestNudgeRestoringSize({ hysteresis: 0 })).toBe(16);
    });

    test('the column that explains the row order is undroppable for as long as it is the sort key', () => {
      const columns = defaults();
      // Duration is a P2 column: at a wrap this narrow the unprotected plan
      // drops it, taking the sort indicator and the aria-sort off the screen
      // with it and leaving the order with no explanation anywhere.
      const unsorted = np.planAutoHiddenColumns(columns, 536, {
        keepIds: np.planForcedVisibleColumnIds({ colId: null, direction: null }, []),
      });
      expect(unsorted).toContain('duration');
      const sorted = { colId: 'duration', direction: 'asc' };
      expect(np.planForcedVisibleColumnIds(sorted, [])).toEqual(['duration']);
      const protectedPlan = np.planAutoHiddenColumns(columns, 536, {
        keepIds: np.planForcedVisibleColumnIds(sorted, []),
      });
      expect(protectedPlan).not.toContain('duration');
      // Everything else the wrap could not hold still goes: the exemption is
      // one column wide, not a licence to overflow.
      expect(protectedPlan.length).toBeGreaterThan(0);
      // Sorting by another column releases the previous key in the same
      // breath, and clearing the sort releases it altogether.
      expect(np.planForcedVisibleColumnIds({ colId: 'size', direction: 'desc' }, [])).toEqual(['size']);
      expect(np.planForcedVisibleColumnIds({ colId: 'duration', direction: null }, [])).toEqual([]);
      expect(np.planForcedVisibleColumnIds(null, [])).toEqual([]);
      // Match is the search read-out and the sort key is the order's
      // explanation; both can be owed at once, and neither displaces the other.
      expect(np.planForcedVisibleColumnIds(sorted, [{ query: 'demo' }])).toEqual([
        'match',
        'duration',
      ]);
      // Sorting BY Match asks for one exemption, not two.
      expect(
        np.planForcedVisibleColumnIds({ colId: 'match', direction: 'asc' }, [{ query: 'demo' }]),
      ).toEqual(['match']);
    });

    test('the panel ships sorted by ID, so ID is the column the fit may never drop', () => {
      // The default order is ascending by ID, written out here rather than
      // read back from the constant: changing the shipped default changes
      // which column the auto-hide is forbidden to drop at every width, and
      // this line is what makes that change say so out loud.
      expect(np.DEFAULT_SORT).toEqual({ colId: 'id', direction: 'asc' });
      expect(np.planForcedVisibleColumnIds(np.DEFAULT_SORT, [])).toEqual(['id']);
      const columns = defaults();
      // ID is a P2 column: unprotected, this wrap drops it.
      expect(np.planAutoHiddenColumns(columns, 536, {})).toContain('id');
      // Out of the box it survives the same wrap, and the column that
      // explains the order is on screen with the rows it explains.
      expect(
        np.planAutoHiddenColumns(columns, 536, {
          keepIds: np.planForcedVisibleColumnIds(np.DEFAULT_SORT, []),
        }),
      ).not.toContain('id');
    });

    test('the column under a keyboard resize is undroppable until the gesture ends', () => {
      const columns = defaults();
      // Type is a P3 column and the widest thing the reader can grow with
      // Arrow: at this wrap, widened, the unprotected plan drops the very
      // column the gesture is resizing and the separator goes with it.
      const stretched = columns.map((column) =>
        column.id === 'type' ? { ...column, width: 570 } : column,
      );
      expect(np.planAutoHiddenColumns(stretched, 1000, {})).toContain('type');
      expect(np.planForcedVisibleColumnIds(null, [], 'type')).toEqual(['type']);
      const held = np.planAutoHiddenColumns(stretched, 1000, {
        keepIds: np.planForcedVisibleColumnIds(null, [], 'type'),
      });
      expect(held).not.toContain('type');
      // One column wide, like every other exemption: the wrap still drops
      // whatever else it cannot hold.
      expect(held.length).toBeGreaterThan(0);
      // The sort key and the resized column are owed at once and neither
      // displaces the other; asking twice for the same column asks once.
      expect(np.planForcedVisibleColumnIds({ colId: 'size', direction: 'asc' }, [], 'type')).toEqual([
        'size',
        'type',
      ]);
      expect(np.planForcedVisibleColumnIds({ colId: 'type', direction: 'asc' }, [], 'type')).toEqual([
        'type',
      ]);
      // No gesture in hand, no exemption: the protection is scoped to the
      // separator that holds the focus, not left latched on the column.
      expect(np.planForcedVisibleColumnIds(null, [], null)).toEqual([]);
      expect(np.planForcedVisibleColumnIds(null, [])).toEqual([]);
    });

    test('a header whose column is gone hands its focus to a neighbour, never to nothing', () => {
      const columns = defaults();
      const painted = ['id', 'method', 'status', 'domain', 'path'];
      // Client start sits last in the default order, so the only neighbour
      // still painted is to its left.
      expect(np.planHeaderFocusFallbackId(columns, 'clientStart', painted)).toBe('path');
      // Type sits between Path and Duration. With nothing to its right
      // painted the fallback goes left, and the moment Duration is back the
      // column that took Type's place on screen is the one that takes it.
      expect(np.planHeaderFocusFallbackId(columns, 'type', painted)).toBe('path');
      expect(np.planHeaderFocusFallbackId(columns, 'type', [...painted, 'duration'])).toBe('duration');
      // Match is first in the default order, so its fallback is to the right.
      expect(np.planHeaderFocusFallbackId(columns, 'match', painted)).toBe('id');
      // A Set reads the same as an array, and an unknown column has no place
      // in the row to fall back to.
      expect(np.planHeaderFocusFallbackId(columns, 'match', new Set(painted))).toBe('id');
      expect(np.planHeaderFocusFallbackId(columns, 'nosuch', painted)).toBeNull();
      expect(np.planHeaderFocusFallbackId(columns, 'match', [])).toBeNull();
      expect(np.planHeaderFocusFallbackId(null, 'match', painted)).toBeNull();
    });

    test('P1 plus the sort key overflows into a scrollbar rather than dropping the key', () => {
      const columns = defaults();
      const sorted = { colId: 'duration', direction: 'asc' };
      const keepIds = np.planForcedVisibleColumnIds(sorted, []);
      // A wrap narrower than the undroppable set itself: the plan has nothing
      // left to give and must leave the sort key painted, which is what puts
      // the grid into horizontal scroll instead of hiding the explanation.
      const hiddenIds = np.planAutoHiddenColumns(columns, 200, { keepIds });
      const kept = surviving(columns, hiddenIds);
      expect(kept.map((column) => column.id).sort()).toEqual([...P1_IDS, 'duration'].sort());
      expect(floorSum(kept)).toBeGreaterThan(200);
    });

    test('pinned and search-forced columns are never dropped, and the plan is not mutated into the columns', () => {
      const columns = defaults();
      const wrapWidth = 738;
      const plain = np.planAutoHiddenColumns(columns, wrapWidth, {});
      expect(plain.length).toBeGreaterThan(0);
      // Match comes back while a keyword exists, even from the dropped set.
      const withSearch = np.planAutoHiddenColumns(columns, wrapWidth, { keepIds: ['match'] });
      expect(withSearch).not.toContain('match');
      // "Show anyway" is the same exemption, asked for by hand.
      const pinnedId = plain[0];
      expect(np.planAutoHiddenColumns(columns, wrapWidth, { pinnedIds: [pinnedId] })).not.toContain(pinnedId);
      // Planning is pure: the reader's own visibility is untouched by it.
      expect(columns.map((column) => [column.id, column.visible])).toEqual(
        np.DEFAULT_COLUMNS.map((column) => [column.id, column.visible]),
      );
    });

    test('an unmeasured wrap hides nothing, and Path gives width before a column goes', () => {
      const columns = defaults();
      expect(np.planAutoHiddenColumns(columns, 0, {})).toEqual([]);
      expect(np.planAutoHiddenColumns(columns, NaN, {})).toEqual([]);
      // Path counts at its floor in the fit test, every other column at its
      // stored width — that is what buys the squeeze before the drop.
      const path = columns.find((column) => column.id === 'path');
      const domain = columns.find((column) => column.id === 'domain');
      expect(np.minRenderedColumnWidth(path)).toBe(120);
      expect(np.minRenderedColumnWidth(path)).toBeLessThan(np.clampColumnWidth(path.width));
      expect(np.minRenderedColumnWidth(domain)).toBe(np.clampColumnWidth(domain.width));
      // A Path already narrower than the floor keeps its own width.
      expect(np.minRenderedColumnWidth({ id: 'path', width: 80 })).toBe(80);
      // The squeeze is real: at a wrap between the floor sum and the stored
      // sum of the full default set, nothing has to be dropped at all.
      const visibleDefaults = columns.filter((column) => column.visible);
      const storedSum = visibleDefaults.reduce((sum, column) => sum + column.width, 0);
      const betweenWidth = Math.floor((floorSum(visibleDefaults) + storedSum) / 2);
      expect(np.planAutoHiddenColumns(columns, betweenWidth, {})).toEqual([]);
    });
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

  // One GraphQL request copied through every sanitized sink that prints the
  // operation label, next to the sanitized request body that carries the same
  // name. All four have to tell one story, or a reader comparing a copied
  // body against a copied row sees a name in one and a marker in the other.
  test('the operation label reads the same in every sanitized sink and inside a copied body', () => {
    const operation = 'GetUserProfile';
    const body = JSON.stringify({
      operationName: operation,
      query: 'query ' + operation + ' { viewer { id } }',
      variables: { first: 10, sessionToken: 'session-secret' },
    });
    const row = {
      id: 7,
      method: 'POST',
      url: 'https://api.example.test/graphql?token=SECRET123',
      status: 200,
      statusText: 'OK',
      type: 'application/json',
      operation,
      duration: 12,
      size: 34,
      requestHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      requestPostData: { mimeType: 'application/json', text: body },
    };

    const rowView = np.sanitizeClipboardRow('markdown', row, '', { mode: 'sanitized' }).value;
    const markdownLines = np.formatRowMarkdown(rowView).split('\n');
    const csvLines = np.formatRowsCsv([rowView]).split('\r\n');
    const copiedBody = JSON.parse(np.buildClipboardPayload('requestBody', row, { mode: 'sanitized' }).text);

    // Structure first: each sink really produced an operation slot, so the
    // agreement below cannot be satisfied by four missing fields.
    const markdownOperationRows = markdownLines.filter((line) => line.startsWith('| Operation | '));
    expect(markdownOperationRows).toHaveLength(1);
    expect(csvLines[0].split(',')[6]).toBe('operation');
    expect(csvLines[1].split(',')).toHaveLength(10);
    expect(Object.keys(copiedBody).sort()).toEqual(['operationName', 'query', 'variables']);

    // The one story: the derived label and the body field spell the same name.
    expect({
      rowView: rowView.operation,
      markdown: markdownOperationRows[0],
      csv: csvLines[1].split(',')[6],
      body: copiedBody.operationName,
    }).toEqual({
      rowView: operation,
      markdown: '| Operation | ' + operation + ' |',
      csv: operation,
      body: operation,
    });

    // The evidence behind that contract, and the proof the sanitizer is still
    // switched on in the very same copies: the sibling `query` is not
    // sensitive and repeats the name anyway, while a real secret beside it and
    // the URL's query value are both still redacted.
    expect(copiedBody.query).toContain(operation);
    expect(copiedBody.variables).toEqual({ first: 10, sessionToken: np.REDACTION_MARKER });
    expect(rowView.url).toContain(encodeURIComponent(np.REDACTION_MARKER));
    expect(rowView.url).not.toContain('SECRET123');
  });

  // The carve-out is one protocol key, not a hole in the `…name$` PII rule.
  test('only operationName escapes the name suffix rule', () => {
    expect([np.isSensitiveKey('operationName'), np.isSensitiveKey('operation_name')]).toEqual([false, false]);
    expect(
      ['name', 'firstName', 'lastName', 'fullName', 'displayName', 'userName'].map((key) => np.isSensitiveKey(key)),
    ).toEqual([true, true, true, true, true, true]);
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
    expect(np.getExtensionVersion({ getManifest: () => { throw new Error('runtime-failed'); } })).toBe('1.13.0');
    expect(np.getExtensionVersion(null)).toBe('1.13.0');
  });

  test('uses the current extension version for full and sanitized HAR creators', () => {
    const row = makeSensitiveRow();
    const fullHar = np.buildHarLogFromRows([row], new Map([[row, np.buildHarResponseContent(row)]]));
    expect(fullHar.log.creator.version).toBe('1.13.0');
    expect(np.sanitizeHar(fullHar).log.creator.version).toBe('1.13.0');
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
  // Two tests below swap document.querySelector for a #statusText stub. The
  // jest config sets neither restoreMocks nor resetMocks, and clearAllMocks
  // keeps implementations, so without this the stub answered every later
  // test in the file and turned one regression into several red tests.
  let previousQuerySelector;

  beforeAll(() => {
    previousQuerySelector = document.querySelector.getMockImplementation();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
  });

  afterEach(() => {
    document.querySelector.mockImplementation(previousQuerySelector);
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
      sel === '#statusText'
        ? statusEl
        : { textContent: '', style: {}, appendChild: jest.fn(), setAttribute: jest.fn(), removeAttribute: jest.fn() }
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
      sel === '#statusText'
        ? statusEl
        : { textContent: '', style: {}, appendChild: jest.fn(), setAttribute: jest.fn(), removeAttribute: jest.fn() }
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

describe('uiText and display-time reason localization', () => {
  afterEach(() => {
    np.applyLanguage('en');
  });

  test('uiText follows the active language and falls back safely', () => {
    np.applyLanguage('en');
    expect(np.uiText('emptyCapturePausedTitle')).toBe('Recording is paused.');
    expect(np.uiText('timingEvidenceLimitation')).toBe(np.TIMING_EVIDENCE_LIMITATION);
    np.applyLanguage('ja');
    expect(np.uiText('emptyCapturePausedTitle')).toBe('記録は一時停止中です。');
    // An unknown key degrades to empty text instead of throwing.
    expect(np.uiText('noSuchKey')).toBe('');
  });

  // The details header, URL breakdown, and clamp toggle compose their labels
  // at render time; every one of them must have a Japanese frame.
  test('details header and kv value strings translate', () => {
    np.applyLanguage('en');
    expect(np.uiText('detailsEmptyTitle')).toBe('Select a request...');
    expect(np.uiText('titleDetailsCopyUrl')).toBe('Copy sanitized URL');
    expect(np.uiText('detailsQueryCount')).toBe('{count} query parameters');
    expect(np.uiText('urlBreakdownOpenQuery')).toBe('?{count} params — open Query');
    expect(np.uiText('urlBreakdownShowFull')).toBe('Show full URL');
    expect(np.uiText('kvShowAll')).toBe('Show all ({count} chars)');
    expect(np.uiText('timingNoPhasesReported')).toBe('No timing phases were reported for this request.');
    expect(np.uiText('cookieExpiresLiteral')).toBe('Expires: {value}');
    np.applyLanguage('ja');
    expect(np.uiText('timingNoPhasesReported')).toBe('このリクエストではタイミングフェーズが報告されていません。');
    // A wire token, so it reads the same in both languages, like Max-Age.
    expect(np.uiText('cookieExpiresLiteral')).toBe('Expires: {value}');
    expect(np.uiText('detailsEmptyTitle')).toBe('リクエストを選択してください...');
    expect(np.uiText('titleDetailsCopyUrl')).toBe('サニタイズ済み URL をコピー');
    expect(np.uiText('detailsQueryCount')).toBe('クエリパラメーター {count} 件');
    expect(np.uiText('detailsQueryCountOne')).toBe('クエリパラメーター 1 件');
    expect(np.uiText('urlBreakdownOpenQuery')).toBe('?{count} 件のパラメーター — Query を開く');
    expect(np.uiText('urlBreakdownOpenQueryOne')).toBe('?1 件のパラメーター — Query を開く');
    expect(np.uiText('urlBreakdownShowFull')).toBe('完全な URL を表示');
    expect(np.uiText('urlBreakdownHideFull')).toBe('完全な URL を隠す');
    expect(np.uiText('kvShowAll')).toBe('すべて表示（{count} 文字）');
    expect(np.uiText('kvShowLess')).toBe('折りたたむ');
  });

  test('fixed body reasons translate at display time; stored rows stay English', () => {
    np.applyLanguage('ja');
    const translated = np.localizeBodyReason(np.NAVIGATION_BODY_UNAVAILABLE_REASON);
    expect(translated).toBe('検査中のページが移動したため、このレスポンスボディは取得できませんでした。');
    expect(np.localizeBodyReason(np.BODY_EVICTED_REASON)).toContain('キャッシュ');
    // Free-form reasons (error messages, HAR-composed text) pass through.
    expect(np.localizeBodyReason('custom failure text')).toBe('custom failure text');
    // The stored canonical constant itself never changes.
    expect(np.NAVIGATION_BODY_UNAVAILABLE_REASON).toBe(
      'The inspected page navigated away before this response body was retrieved.',
    );
  });

  test('localizeBodyReason is the identity in English', () => {
    np.applyLanguage('en');
    expect(np.localizeBodyReason(np.BODY_RETRIEVAL_FAILED_REASON)).toBe(
      np.BODY_RETRIEVAL_FAILED_REASON,
    );
    expect(np.localizeBodyReason(np.BODY_UNAVAILABLE_REASON)).toBe(np.BODY_UNAVAILABLE_REASON);
    expect(np.localizeBodyReason(np.IMPORT_BODY_MISSING_REASON)).toBe(
      np.IMPORT_BODY_MISSING_REASON,
    );
  });

  test('the timing evidence limitation localizes only its known constant', () => {
    np.applyLanguage('ja');
    expect(np.localizeTimingLimitation(np.TIMING_EVIDENCE_LIMITATION)).toContain('パケットロス');
    expect(np.localizeTimingLimitation('other note')).toBe('other note');
    np.applyLanguage('en');
    expect(np.localizeTimingLimitation(np.TIMING_EVIDENCE_LIMITATION)).toBe(
      np.TIMING_EVIDENCE_LIMITATION,
    );
  });
});

describe('custom header column', () => {
  afterEach(() => {
    np.saveCustomHeaderColumnName('');
  });

  test('binds to a named header with response precedence, case-insensitively', () => {
    np.saveCustomHeaderColumnName('X-Request-Id');
    const row = {
      requestHeaders: [{ name: 'x-request-id', value: 'from-request' }],
      responseHeaders: [{ name: 'X-REQUEST-ID', value: 'from-response' }],
    };
    expect(np.getRowHeaderColumnValue(row)).toBe('from-response');
    expect(np.getRowHeaderColumnValue({ requestHeaders: [{ name: 'x-request-id', value: 'only-request' }] })).toBe(
      'only-request',
    );
    expect(np.getRowHeaderColumnValue({})).toBe('');
  });

  test('an empty name yields empty values and clears persistence', () => {
    np.saveCustomHeaderColumnName('  ');
    expect(np.getRowHeaderColumnValue({ responseHeaders: [{ name: 'a', value: 'b' }] })).toBe('');
    expect(localStorage.removeItem).toHaveBeenCalledWith('networkPlus.customHeaderColumn.v1');
  });

  test('the name persists and reloads through localStorage', () => {
    np.saveCustomHeaderColumnName('X-Cache');
    expect(localStorage.setItem).toHaveBeenCalledWith('networkPlus.customHeaderColumn.v1', 'X-Cache');
    localStorage.getItem.mockReturnValue(' etag ');
    np.loadCustomHeaderColumnName();
    expect(np.getRowHeaderColumnValue({ responseHeaders: [{ name: 'ETag', value: '"abc"' }] })).toBe('"abc"');
  });
});

describe('computeDomainSummary', () => {
  test('aggregates count, bytes, and 4xx/5xx errors per domain', () => {
    const rows = [
      { domain: 'api.example.test', size: 100, status: 200 },
      { domain: 'api.example.test', size: 50, status: 404 },
      { domain: 'cdn.example.test', size: 2048, status: 304 },
      { domain: 'api.example.test', size: 'not-a-number', status: 503 },
    ];
    expect(np.computeDomainSummary(rows)).toEqual([
      { domain: 'api.example.test', count: 3, totalBytes: 150, errorCount: 2 },
      { domain: 'cdn.example.test', count: 1, totalBytes: 2048, errorCount: 0 },
    ]);
  });

  test('orders by count descending, then domain ascending, keeping a no-host bucket', () => {
    const rows = [
      { domain: 'b.test', size: 1, status: 200 },
      { domain: 'a.test', size: 1, status: 200 },
      { domain: '', size: 1, status: 200 },
      { domain: 'a.test', size: 1, status: 200 },
    ];
    expect(np.computeDomainSummary(rows).map((entry) => entry.domain)).toEqual([
      'a.test',
      '',
      'b.test',
    ]);
  });

  test('tolerates junk input without throwing', () => {
    expect(np.computeDomainSummary(null)).toEqual([]);
    expect(np.computeDomainSummary('rows')).toEqual([]);
    expect(np.computeDomainSummary([null, 42, {}])).toEqual([
      { domain: '', count: 3, totalBytes: 0, errorCount: 0 },
    ]);
  });
});

describe('domain summary preference', () => {
  test('defaults hidden, round-trips the shown flag, and clears on hide', () => {
    localStorage.getItem.mockReturnValueOnce(null);
    expect(np.loadDomainSummaryPref()).toBe(false);
    localStorage.getItem.mockReturnValueOnce('yes');
    expect(np.loadDomainSummaryPref()).toBe(false);
    localStorage.getItem.mockReturnValueOnce('1');
    expect(np.loadDomainSummaryPref()).toBe(true);
    np.saveDomainSummaryPref(true);
    expect(localStorage.setItem).toHaveBeenCalledWith('networkPlus.domainSummary.v1', '1');
    np.saveDomainSummaryPref(false);
    expect(localStorage.removeItem).toHaveBeenCalledWith('networkPlus.domainSummary.v1');
  });

  test('a throwing localStorage degrades to hidden without throwing', () => {
    localStorage.getItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(np.loadDomainSummaryPref()).toBe(false);
    localStorage.setItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(() => np.saveDomainSummaryPref(true)).not.toThrow();
  });
});

describe('details pane width preference', () => {
  test('round-trips a rounded px width and rejects anything below the 400px floor', () => {
    expect(np.DETAILS_WIDTH_KEY).toBe('networkPlus.detailsWidth.v1');
    localStorage.getItem.mockReturnValueOnce(null);
    expect(np.loadDetailsWidthPref()).toBeNull();
    localStorage.getItem.mockReturnValueOnce('wide');
    expect(np.loadDetailsWidthPref()).toBeNull();
    localStorage.getItem.mockReturnValueOnce('399');
    expect(np.loadDetailsWidthPref()).toBeNull();
    localStorage.getItem.mockReturnValueOnce('400');
    expect(np.loadDetailsWidthPref()).toBe(400);
    localStorage.getItem.mockReturnValueOnce('612.4');
    expect(np.loadDetailsWidthPref()).toBe(612);
    np.saveDetailsWidthPref(537.6);
    expect(localStorage.setItem).toHaveBeenCalledWith('networkPlus.detailsWidth.v1', '538');
  });

  test('a throwing localStorage degrades to the stylesheet default without throwing', () => {
    localStorage.getItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(np.loadDetailsWidthPref()).toBeNull();
    localStorage.setItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(() => np.saveDetailsWidthPref(500)).not.toThrow();
  });
});

describe('inspector split preference', () => {
  test('normalizes the percent and the collapsed half from an allow-list', () => {
    expect(np.INSPECTOR_SPLIT_KEY).toBe('networkPlus.inspectorSplit.v1');
    expect(np.normalizeInspectorSplitPref(null)).toEqual({ percent: null, collapsed: null });
    expect(np.normalizeInspectorSplitPref({ percent: 40.4, collapsed: 'request' })).toEqual({
      percent: 40,
      collapsed: 'request',
    });
    expect(np.normalizeInspectorSplitPref({ percent: '65', collapsed: 'response' })).toEqual({
      percent: 65,
      collapsed: 'response',
    });
    // Nothing may leave one pane without room, and only the two halves exist.
    expect(np.normalizeInspectorSplitPref({ percent: 0, collapsed: 'both' })).toEqual({ percent: null, collapsed: null });
    expect(np.normalizeInspectorSplitPref({ percent: 100, collapsed: 1 })).toEqual({ percent: null, collapsed: null });
    expect(np.normalizeInspectorSplitPref({ percent: 'wide' })).toEqual({ percent: null, collapsed: null });
  });

  test('round-trips through localStorage as JSON and degrades to the default', () => {
    localStorage.getItem.mockReturnValueOnce(null);
    expect(np.loadInspectorSplitPref()).toEqual({ percent: null, collapsed: null });
    localStorage.getItem.mockReturnValueOnce('{"percent":35,"collapsed":"response"}');
    expect(np.loadInspectorSplitPref()).toEqual({ percent: 35, collapsed: 'response' });
    localStorage.getItem.mockReturnValueOnce('not json');
    expect(np.loadInspectorSplitPref()).toEqual({ percent: null, collapsed: null });
    np.saveInspectorSplitPref({ percent: 72.6, collapsed: 'request', extra: true });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'networkPlus.inspectorSplit.v1',
      '{"percent":73,"collapsed":"request"}',
    );
    localStorage.getItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(np.loadInspectorSplitPref()).toEqual({ percent: null, collapsed: null });
    localStorage.setItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(() => np.saveInspectorSplitPref({ percent: 50, collapsed: null })).not.toThrow();
  });

  test('collapsing a half re-expands the other and clicking it again expands it', () => {
    expect(np.planInspectorCollapse(null, 'request')).toBe('request');
    expect(np.planInspectorCollapse('request', 'request')).toBeNull();
    // Both collapsed is not allowed: the second click hands the space over.
    expect(np.planInspectorCollapse('request', 'response')).toBe('response');
    expect(np.planInspectorCollapse('response', 'request')).toBe('request');
    expect(np.planInspectorCollapse('response', 'sidebar')).toBe('response');
    expect(np.planInspectorCollapse(undefined, 'sidebar')).toBeNull();
  });

  test('the short-pane column clears the inline heights and the tall pane gets them back', () => {
    const plan = (state) => np.planInspectorSplitApplication(state);
    // In the column the stylesheet owns both heights, so an inline px height
    // must go — it out-ranks the container block's height:auto and paints the
    // request half straight through the response section.
    expect(plan({ columnMode: true, wasColumnMode: false, collapsedHalf: null, hasInlineHeight: true })).toBe('clear');
    expect(plan({ columnMode: true, wasColumnMode: true, collapsedHalf: null, hasInlineHeight: false })).toBe('clear');
    // The column wins over both of the split's own cases.
    expect(plan({ columnMode: true, wasColumnMode: false, collapsedHalf: 'request', hasInlineHeight: true })).toBe('clear');
    // Tall again: the percent the column had to drop goes back on, collapsed
    // half included — restoring is what knows the collapsed case.
    expect(plan({ columnMode: false, wasColumnMode: true, collapsedHalf: null, hasInlineHeight: false })).toBe('restore');
    expect(plan({ columnMode: false, wasColumnMode: true, collapsedHalf: 'response', hasInlineHeight: false })).toBe('restore');
    // Unchanged split behaviour: a collapsed half hands its height to flex, a
    // dragged one is re-fitted, and an untouched 50/50 is left alone.
    expect(plan({ columnMode: false, wasColumnMode: false, collapsedHalf: 'request', hasInlineHeight: true })).toBe('clear');
    expect(plan({ columnMode: false, wasColumnMode: false, collapsedHalf: null, hasInlineHeight: true })).toBe('rescale');
    expect(plan({ columnMode: false, wasColumnMode: false, collapsedHalf: null, hasInlineHeight: false })).toBe('none');
  });
});

describe('row state classes', () => {
  test('each state carries its own look and the current hit adds its ring class', () => {
    expect(np.planRowStateClasses({})).toEqual([]);
    expect(np.planRowStateClasses({ primary: true })).toEqual(['selected']);
    expect(np.planRowStateClasses({ multi: true })).toEqual(['multi-selected']);
    expect(np.planRowStateClasses({ highlightColor: 'hl-green' })).toEqual(['highlighted-row', 'hl-green']);
    expect(np.planRowStateClasses({ searchColorIdx: 2 })).toEqual(['search-match-row', 'search-row-2']);
    expect(np.planRowStateClasses({ searchColorIdx: 0, searchCurrent: true })).toEqual([
      'search-match-row',
      'search-row-0',
      'search-match-current',
    ]);
    // The current hit is normally also the primary selection.
    expect(
      np.planRowStateClasses({ primary: true, multi: true, highlightColor: 'hl-red', searchColorIdx: 4, searchCurrent: true }),
    ).toEqual(['selected', 'multi-selected', 'highlighted-row', 'hl-red', 'search-match-row', 'search-row-4', 'search-match-current']);
    // Without a search colour there is no hit, so there is no current hit either.
    expect(np.planRowStateClasses({ searchColorIdx: null, searchCurrent: true })).toEqual([]);
  });

  const stampedStateClasses = (row, rowState) =>
    np
      .createTableRow(row, jest.fn(), false, rowState)
      .classList.add.mock.calls.flat()
      .filter((className) => /^(selected|multi-selected|highlighted-row|hl-|search-)/.test(className));

  test('createTableRow stamps the planned classes on the row', () => {
    expect(stampedStateClasses({ id: 'plain', method: 'GET' })).toEqual([]);
  });

  test('createTableRow stamps selected, highlighted and search-hit rows with their real classes', () => {
    // The negative case alone would still pass with planRowStateClasses
    // unwired, so seed the row state each look depends on through
    // createTableRow's own seam and read the row back.
    const primary = { id: 'primary', method: 'GET' };
    const highlighted = { id: 'highlighted', method: 'GET' };
    const currentHit = { id: 'current-hit', method: 'GET' };
    const plainHit = { id: 'plain-hit', method: 'GET' };
    const seeded = {
      selectedRow: primary,
      selectedRows: new Set([primary, highlighted]),
      highlightedRows: new Map([[highlighted, 'hl-green']]),
      search: {
        keywords: [{ query: 'a', colorIdx: 2 }],
        rowColors: new Map([
          [currentHit, new Set([2])],
          [plainHit, new Set([2])],
        ]),
        rowKeywords: new Map([
          [currentHit, new Set([0])],
          [plainHit, new Set([0])],
        ]),
        matches: [currentHit, plainHit],
        currentIndex: 0,
      },
    };
    expect(stampedStateClasses(primary, seeded)).toEqual(['selected', 'multi-selected']);
    expect(stampedStateClasses(highlighted, seeded)).toEqual(['multi-selected', 'highlighted-row', 'hl-green']);
    expect(stampedStateClasses(currentHit, seeded)).toEqual([
      'search-match-row',
      'search-row-2',
      'search-match-current',
    ]);
    // Same hit colour, but not the one the navigation is sitting on.
    expect(stampedStateClasses(plainHit, seeded)).toEqual(['search-match-row', 'search-row-2']);
    // Selected and the current hit at once: both looks land together.
    const selectedHit = { ...seeded, selectedRow: currentHit, selectedRows: new Set() };
    expect(stampedStateClasses(currentHit, selectedHit)).toEqual([
      'selected',
      'search-match-row',
      'search-row-2',
      'search-match-current',
    ]);
    // Omitting the seam falls back to the live module state, which stamps nothing.
    expect(stampedStateClasses({ id: 'plain', method: 'GET' })).toEqual([]);
  });
});

describe('method class tokens', () => {
  test('only an allow-listed method becomes a class token', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'WS', 'SSE']) {
      expect([method, np.methodClassToken(method)]).toEqual([method, 'method-' + method]);
      expect([method, np.methodClassToken(method.toLowerCase())]).toEqual([method, 'method-' + method]);
    }
    // A method carrying a space would otherwise split into two class tokens,
    // and one carrying a quote would break out of the attribute it lands in.
    expect(np.methodClassToken('GET selected')).toBe('');
    expect(np.methodClassToken('GET evil-row-class')).toBe('');
    expect(np.methodClassToken('GET"')).toBe('');
    expect(np.methodClassToken('"GET"')).toBe('');
    expect(np.methodClassToken('GET" onload="x')).toBe('');
    expect(np.methodClassToken('PROPFIND')).toBe('');
    expect(np.methodClassToken('')).toBe('');
    expect(np.methodClassToken(null)).toBe('');
    expect(np.methodClassToken(undefined)).toBe('');
  });
});

describe('column layout reset', () => {
  test('restores the default visibility and widths while keeping order and labels', () => {
    const columns = [
      { id: 'path', label: 'Path', width: 300, visible: false },
      { id: 'customHeader', label: 'x-request-id', width: 90, visible: true },
      { id: 'match', label: 'Match', width: 64, visible: true },
      { id: 'legacy', label: 'Legacy', width: 50, visible: true },
    ];
    const result = np.applyDefaultColumnLayout(columns, [
      { id: 'match', label: 'Match', width: 36, visible: true },
      { id: 'path', label: 'Path', width: 260, visible: true },
      { id: 'customHeader', label: 'Header', width: 160, visible: false },
    ]);
    expect(result).toBe(columns);
    expect(columns).toEqual([
      { id: 'path', label: 'Path', width: 260, visible: true },
      { id: 'customHeader', label: 'x-request-id', width: 160, visible: false },
      { id: 'match', label: 'Match', width: 36, visible: true },
      { id: 'legacy', label: 'Legacy', width: 50, visible: true },
    ]);
  });
});

describe('details reopen status', () => {
  const closedTexts = ['Request details closed. Select a request to reopen.', '閉じました'];

  test('replaces only the closed notice, and only with what it displaced', () => {
    expect(np.planDetailsReopenStatus(closedTexts[0], closedTexts, 'Local sample capture: 3 requests.')).toBe(
      'Local sample capture: 3 requests.',
    );
    expect(np.planDetailsReopenStatus(closedTexts[1], closedTexts, '')).toBe('');
    expect(np.planDetailsReopenStatus(closedTexts[0], closedTexts, undefined)).toBe('');
    // Any other message (a copy result, a filter summary) stays untouched.
    expect(np.planDetailsReopenStatus('Copied sanitized URL', closedTexts, 'older')).toBeNull();
    expect(np.planDetailsReopenStatus(closedTexts[0], null, 'older')).toBeNull();
  });

  test('the reopened bar names the newly selected request, not the displaced message', () => {
    expect(
      np.planRowSelectionStatus({
        method: 'GET',
        url: 'https://api.example.test/v1/items/0?page=2',
        status: 200,
        statusText: 'OK',
      }),
    ).toBe('GET · api.example.test · 200 OK');
    // A status without its reason phrase, and a pending row with no status.
    expect(np.planRowSelectionStatus({ method: 'POST', url: 'https://api.example.test/graphql', status: 503 })).toBe(
      'POST · api.example.test · 503',
    );
    expect(np.planRowSelectionStatus({ method: 'POST', url: 'https://api.example.test/graphql', status: 0 })).toBe(
      'POST · api.example.test',
    );
    // An opaque scheme keeps the scheme as its host; an empty row says nothing.
    expect(np.planRowSelectionStatus({ method: 'GET', url: 'data:text/plain,hi' })).toBe('GET · data:');
    expect(np.planRowSelectionStatus({})).toBe('');
    expect(np.planRowSelectionStatus(null)).toBe('');
    np.applyLanguage('en');
    expect(np.uiTextFormat('statusRowSelected', { request: 'GET · api.example.test · 200 OK' })).toBe(
      'Selected GET · api.example.test · 200 OK.',
    );
    np.applyLanguage('ja');
    expect(np.uiTextFormat('statusRowSelected', { request: 'GET · api.example.test · 200 OK' })).toBe(
      'GET · api.example.test · 200 OK を選択しました。',
    );
    np.applyLanguage('en');
  });

  test('the notice, the collapse strings, and the menu labels translate', () => {
    np.applyLanguage('en');
    expect(np.uiText('statusDetailsClosed')).toBe('Request details closed. Select a request to reopen.');
    expect(np.uiText('inspectorEmptyHint')).toBe('Select a request to inspect it — click a row, ↑↓ to move, Enter to open');
    expect([np.uiText('inspectorHalfRequest'), np.uiText('inspectorHalfResponse')]).toEqual(['Request', 'Response']);
    expect(np.uiTextFormat('inspectorCollapseHalfTitle', { half: np.uiText('inspectorHalfRequest') })).toBe(
      'Collapse the Request inspector to its tabs',
    );
    expect(np.uiTextFormat('inspectorHalfCollapsedValue', { half: np.uiText('inspectorHalfResponse') })).toBe(
      'Response inspector collapsed',
    );
    expect(np.uiText('columnsSavedView')).toBe('Saved view');
    expect(np.uiText('menuCopySanitized')).toBe('Copy sanitized');
    np.applyLanguage('ja');
    expect(np.uiText('statusDetailsClosed')).toBe('リクエスト詳細を閉じました。リクエストを選択すると再び開きます。');
    expect(np.uiText('inspectorEmptyHint')).toBe(
      'リクエストを選択すると内容を確認できます — 行をクリック、↑↓ で移動、Enter で開く',
    );
    // The half name translates with the sentence it sits in: an English noun
    // inside a Japanese tooltip was the bug.
    expect([np.uiText('inspectorHalfRequest'), np.uiText('inspectorHalfResponse')]).toEqual([
      'リクエスト',
      'レスポンス',
    ]);
    expect(np.uiTextFormat('inspectorExpandHalfTitle', { half: np.uiText('inspectorHalfRequest') })).toBe(
      'リクエストインスペクターを展開する',
    );
    expect(np.uiTextFormat('inspectorHalfCollapsedStatus', { half: np.uiText('inspectorHalfResponse') })).toBe(
      'レスポンスインスペクターを折りたたみました。仕切りをダブルクリックすると 50/50 に戻ります。',
    );
    expect(np.uiText('inspectorSplitResetStatus')).toBe('リクエストとレスポンスのインスペクターを 50/50 に戻しました。');
    expect([np.uiText('columnsSelectAll'), np.uiText('columnsDeselectAll'), np.uiText('columnsReset')]).toEqual([
      'すべて選択',
      'すべて解除',
      'リセット',
    ]);
    expect([np.uiText('columnsGroupIdentity'), np.uiText('columnsGroupTiming'), np.uiText('columnsGroupPayload')]).toEqual([
      '識別',
      'タイミング',
      'ペイロード',
    ]);
    expect(np.uiText('columnsSavedView')).toBe('保存したビュー');
    expect(np.uiText('menuCopySanitized')).toBe('サニタイズ済みをコピー');
    np.applyLanguage('en');
  });

  test('every row context menu string carries both languages', () => {
    // The mixed-language menu was the bug: one translated toggle among a
    // dozen English siblings. English must stay byte-identical, so the pins
    // below double as the "English users see no change" contract.
    const ENGLISH = {
      menuRequestActions: 'Request actions',
      menuFilter: 'Filter',
      menuSelect: 'Select',
      menuDeselect: 'Deselect',
      menuHighlight: 'Highlight',
      menuHighlightColor: 'Highlight color',
      menuUnhighlight: 'Unhighlight',
      menuClearHighlights: 'Clear All Highlights',
      menuCompare: 'Compare',
      menuCompareTwo: 'Compare 2 selected requests',
      menuCopySanitizedSummary: 'Copy sanitized summary',
      menuCopySanitizedUrl: 'Copy sanitized URL',
      menuCopySanitizedCurl: 'Copy sanitized cURL',
      menuCopySanitizedFetch: 'Copy sanitized fetch',
      menuCopySanitizedPowershell: 'Copy sanitized PowerShell',
      menuCopySanitizedMarkdown: 'Copy sanitized Markdown',
      menuCopyFull: 'Copy full (unsanitized)',
      menuResend: 'Resend',
      menuResendUnchanged: 'Resend unchanged',
      menuResendEdit: 'Edit and resend...',
      menuColorYellow: 'Yellow',
      menuColorRed: 'Red',
      menuColorGreen: 'Green',
      menuColorBlue: 'Blue',
      menuColorPurple: 'Purple',
      menuColorOrange: 'Orange',
    };
    const JAPANESE = {
      menuRequestActions: 'リクエストの操作',
      menuFilter: 'フィルター',
      menuSelect: '選択',
      menuDeselect: '選択解除',
      menuHighlight: 'ハイライト',
      menuHighlightColor: 'ハイライトの色',
      menuUnhighlight: 'ハイライト解除',
      menuClearHighlights: 'すべてのハイライトを解除',
      menuCompare: '比較',
      menuCompareTwo: '選択した 2 件のリクエストを比較',
      menuCopySanitizedSummary: 'サニタイズ済みの概要をコピー',
      menuCopySanitizedUrl: 'サニタイズ済み URL をコピー',
      menuCopySanitizedCurl: 'サニタイズ済み cURL をコピー',
      menuCopySanitizedFetch: 'サニタイズ済み fetch をコピー',
      menuCopySanitizedPowershell: 'サニタイズ済み PowerShell をコピー',
      menuCopySanitizedMarkdown: 'サニタイズ済み Markdown をコピー',
      menuCopyFull: 'フル (未サニタイズ) でコピー',
      menuResend: '再送',
      menuResendUnchanged: 'そのまま再送',
      menuResendEdit: '編集して再送...',
      menuColorYellow: '黄',
      menuColorRed: '赤',
      menuColorGreen: '緑',
      menuColorBlue: '青',
      menuColorPurple: '紫',
      menuColorOrange: 'オレンジ',
    };
    np.applyLanguage('en');
    for (const [key, text] of Object.entries(ENGLISH)) expect([key, np.uiText(key)]).toEqual([key, text]);
    expect(np.uiTextFormat('menuFilterOnly', { column: 'Domain', value: 'api.test' })).toBe('Only Domain api.test');
    expect(np.uiTextFormat('menuFilterExclude', { column: 'Path', value: '/v1' })).toBe('Exclude Path /v1');
    expect(np.uiTextFormat('menuHighlightRows', { count: 3 })).toBe('Highlight (3 rows)');
    expect(np.uiTextFormat('menuUnhighlightRows', { count: 3 })).toBe('Unhighlight (3)');
    expect(np.uiTextFormat('menuKeepSelected', { count: 2 })).toBe('Keep Selected (2)');
    expect(np.uiTextFormat('menuDeleteSelected', { count: 2 })).toBe('Delete Selected (2)');
    expect(np.uiTextFormat('menuCopySanitizedTable', { count: 4 })).toBe('Copy sanitized Markdown table (4 rows)');
    expect(np.uiTextFormat('menuHighlightColorNamed', { color: np.uiText('menuColorGreen') })).toBe('Highlight Green');
    // The copy-full frames wrap the name of the pane the button sits in.
    // English spaces around the slot; these are byte-identical to what the
    // dialog and the toast have always said.
    const COPY_FULL_FRAMES = ['copyFullTitle', 'copyFullDetail', 'copyFullConfirm', 'statusCopiedFullConfirmed'];
    expect(
      COPY_FULL_FRAMES.map((key) => np.uiTextFormat(key, { label: np.uiText('paneNameResponseBody') })),
    ).toEqual([
      'Copy full response body?',
      'The full response body may include captured credentials or body content.',
      'Copy full response body',
      'Copied full response body after confirmation',
    ]);
    // Capture-derived data (URL paths, domains, cell values, header names)
    // goes through these slots verbatim. String.replace would have read $&,
    // $`, $', $$ and $<name> in a value as replacement patterns.
    for (const value of ['$&', '$`', "$'", '$$', '$<column>', 'a$&b$`c', '$&$&']) {
      expect([value, np.uiTextFormat('menuFilterOnly', { column: 'Path', value })]).toEqual([
        value,
        'Only Path ' + value,
      ]);
      expect([value, np.uiTextFormat('menuFilterExclude', { column: value, value: 'v' })]).toEqual([
        value,
        'Exclude ' + value + ' v',
      ]);
    }
    // The eight full-copy labels are byte-identical to what the menu had.
    const fullCopyKeys = [
      'menuCopyFullSummary',
      'menuCopyFullUrl',
      'menuCopyFullCurl',
      'menuCopyFullFetch',
      'menuCopyFullPowershell',
      'menuCopyFullMarkdown',
      'menuCopyFullRawRequest',
      'menuCopyFullRequestBody',
    ];
    expect(fullCopyKeys.map((key) => np.uiText(key))).toEqual([
      'Copy full request summary',
      'Copy full URL',
      'Copy full cURL',
      'Copy full fetch',
      'Copy full PowerShell',
      'Copy full Markdown',
      'Copy full raw request',
      'Copy full request body',
    ]);
    // The column names the filter sentence interpolates must match the grid's
    // own DEFAULT_COLUMNS labels exactly, so English reads as it always did.
    for (const column of np.DEFAULT_COLUMNS) {
      expect([column.id, np.menuColumnLabel(column.id, '')]).toEqual([column.id, column.label]);
    }
    // syncCustomHeaderColumnLabel renames the custom-header column at runtime
    // to the header it shows, so that configured name — not the dictionary's
    // generic "Header" — is what the sentence must quote, in every language.
    // The binding goes through the same call the Columns menu makes, because
    // "is it configured" is now read from that state rather than guessed from
    // the label text.
    np.saveCustomHeaderColumnName('x-request-id');
    expect(np.menuColumnLabel('customHeader', 'x-request-id')).toBe('x-request-id');
    expect(np.uiTextFormat('menuFilterOnly', { column: np.menuColumnLabel('customHeader', 'x-request-id'), value: 'r-42' })).toBe(
      'Only x-request-id r-42',
    );

    np.applyLanguage('ja');
    for (const [key, text] of Object.entries(JAPANESE)) expect([key, np.uiText(key)]).toEqual([key, text]);
    expect(np.uiTextFormat('menuFilterOnly', { column: np.menuColumnLabel('domain', 'Domain'), value: 'api.test' })).toBe(
      'ドメイン: api.test のみ',
    );
    expect(np.uiTextFormat('menuFilterExclude', { column: np.menuColumnLabel('path', 'Path'), value: '/v1' })).toBe(
      'パス: /v1 を除外',
    );
    expect(np.menuColumnLabel('customHeader', 'x-request-id')).toBe('x-request-id');
    expect(np.uiTextFormat('menuFilterOnly', { column: np.menuColumnLabel('customHeader', 'x-request-id'), value: 'r-42' })).toBe(
      'x-request-id: r-42 のみ',
    );
    // Japanese does not space around an inserted noun. These four frames
    // inherited the ASCII spaces that surrounded the English {label} and
    // rendered "完全版 レスポンスボディ をコピーしますか？".
    const japaneseLabel = np.uiText('paneNameResponseBody');
    expect(japaneseLabel).toBe('レスポンスボディ');
    const japaneseFrames = COPY_FULL_FRAMES.map((key) => np.uiTextFormat(key, { label: japaneseLabel }));
    expect(japaneseFrames).toEqual([
      '完全版レスポンスボディをコピーしますか？',
      '完全版レスポンスボディには、キャプチャされた資格情報やボディの内容が含まれることがあります。',
      '完全版レスポンスボディをコピー',
      '確認のうえ完全版レスポンスボディをコピーしました',
    ]);
    // Stated as the rule, not just as four literals: no space survives on
    // either side of the slot the pane name lands in.
    for (const rendered of japaneseFrames) {
      expect([rendered, / レスポンスボディ|レスポンスボディ /.test(rendered)]).toEqual([rendered, false]);
    }
    // And stated over every frame that composes, not just this one. Each row
    // below mirrors a uiTextFormat call site in panel.js whose slot receives
    // a uiText() result: the frame translates, the noun in it translates, and
    // the English spaces that separated them must not come along. A new
    // composed frame belongs in this table.
    const PANE_NAME_KEYS = [
      'paneNameRequestBody',
      'paneNameRawRequest',
      'paneNameQuery',
      'paneNameRequestHeaders',
      'paneNameRequestCookies',
      'paneNameResponseBody',
      'paneNameRawResponse',
      'paneNameResponseHeaders',
      'paneNameFallback',
    ];
    const INSPECTOR_HALF_KEYS = ['inspectorHalfRequest', 'inspectorHalfResponse'];
    const COLOR_NAME_KEYS = [
      'menuColorYellow',
      'menuColorRed',
      'menuColorGreen',
      'menuColorBlue',
      'menuColorPurple',
      'menuColorOrange',
    ];
    const BODY_STATE_KEYS = ['bodyStateOmitted', 'bodyStateEvicted', 'bodyStateUnavailable', 'bodyStateError'];
    const BODY_REASON_KEYS = [
      'reasonNavigationBodyUnavailable',
      'reasonBodyEvicted',
      'reasonImportNoContent',
      'reasonBodyRetrievalFailed',
      'reasonBodyUnavailable',
    ];
    const PANE_SEARCH_FRAMES = [
      'paneSearchPlaceholder',
      'paneSearchInputLabel',
      'paneSearchPrevLabel',
      'paneSearchNextLabel',
      'paneSearchExpandLabel',
      'paneSearchSourceLabel',
    ];
    // The Body pane's renderer picker names the view each button switches to.
    const BODY_VIEW_KEYS = ['bodyViewTree', 'bodyViewText', 'bodyViewRendered', 'bodyViewSource'];
    const INSPECTOR_HALF_FRAMES = [
      'inspectorCollapseHalfTitle',
      'inspectorExpandHalfTitle',
      'inspectorHalfCollapsedStatus',
      'inspectorHalfCollapsedColumnStatus',
      'inspectorHalfExpandedStatus',
      'inspectorHalfCollapsedValue',
    ];
    // Every column name the filter sentence can quote, taken from the panel's
    // own column list through the same call the menu makes.
    const COLUMN_LABELS = np.DEFAULT_COLUMNS.map((column) => np.menuColumnLabel(column.id, column.label));
    const COMPOSED_JAPANESE_FRAMES = [
      ...COPY_FULL_FRAMES.map((key) => ({ key, slot: 'label', values: PANE_NAME_KEYS })),
      // The toast the same control writes once the copy lands: it names the
      // pane the way the confirmation above it did.
      { key: 'statusCopiedFullUnsanitized', slot: 'label', values: PANE_NAME_KEYS },
      { key: 'menuFilterOnly', slot: 'column', texts: COLUMN_LABELS, others: { value: 'r-42' } },
      { key: 'menuFilterExclude', slot: 'column', texts: COLUMN_LABELS, others: { value: 'r-42' } },
      // The auto-hide opt-out names the column it pins back, in both places.
      { key: 'columnsShowAnywayLabel', slot: 'column', texts: COLUMN_LABELS },
      { key: 'columnsShowAnywayStatus', slot: 'column', texts: COLUMN_LABELS },
      // And the undo it becomes once the column is pinned.
      { key: 'columnsShowAnywayUndoLabel', slot: 'column', texts: COLUMN_LABELS },
      { key: 'columnsShowAnywayUndoStatus', slot: 'column', texts: COLUMN_LABELS },
      ...PANE_SEARCH_FRAMES.map((key) => ({ key, slot: 'pane', values: PANE_NAME_KEYS })),
      ...INSPECTOR_HALF_FRAMES.map((key) => ({ key, slot: 'half', values: INSPECTOR_HALF_KEYS })),
      { key: 'inspectorHalfPercentValue', slot: 'half', values: INSPECTOR_HALF_KEYS, others: { percent: 50 } },
      { key: 'menuHighlightColorNamed', slot: 'color', values: COLOR_NAME_KEYS },
      // The search panel's swatches name the same six colours through the
      // same lookup, so its frame is held to the same spacing rule.
      { key: 'searchColorUse', slot: 'color', values: COLOR_NAME_KEYS },
      { key: 'bodyViewButtonTitle', slot: 'view', values: BODY_VIEW_KEYS },
      { key: 'bodyPaneFrame', slot: 'label', values: BODY_STATE_KEYS, others: { reason: np.uiText('reasonBodyEvicted') } },
      { key: 'bodyPaneFrame', slot: 'reason', values: BODY_REASON_KEYS, others: { label: np.uiText('bodyStateEvicted') } },
    ];
    for (const frame of COMPOSED_JAPANESE_FRAMES) {
      // A row names either the dictionary keys whose text can land in the slot
      // or, where the value is composed by the panel itself, the texts.
      const entries = frame.texts
        ? frame.texts.map((text) => [text, text])
        : frame.values.map((valueKey) => [valueKey, np.uiText(valueKey)]);
      for (const [name, value] of entries) {
        const at = frame.key + ' <- ' + name;
        const rendered = np.uiTextFormat(frame.key, { ...(frame.others || {}), [frame.slot]: value });
        // Not vacuous: the entry really does land inside the frame.
        expect([at, value.length > 0 && rendered.includes(value)]).toEqual([at, true]);
        expect([at, rendered.includes(' ' + value)]).toEqual([at, false]);
        expect([at, rendered.includes(value + ' ')]).toEqual([at, false]);
      }
    }
    // The table is no longer maintained by memory: every uiTextFormat call
    // site in panel.js whose slot is filled from the dictionary has to appear
    // above, so a new composed frame fails here until its row is written.
    const callSites = composedFrameCallSites();
    const covered = new Set(COMPOSED_JAPANESE_FRAMES.map((frame) => frame.key + ' <- {' + frame.slot + '}'));
    expect(callSites.length).toBeGreaterThanOrEqual(20);
    for (const site of callSites) {
      const at = 'panel.js:' + site.line + ' ' + site.key + ' <- {' + site.slot + '}';
      expect([at, covered.has(site.key + ' <- {' + site.slot + '}')]).toEqual([at, true]);
    }
    // A header whose name happens to be "Header" is bound like any other. The
    // old string comparison against the default label sent exactly this
    // column back to the dictionary and quoted a translated UI noun where the
    // captured header name belonged.
    np.saveCustomHeaderColumnName('Header');
    expect(np.menuColumnLabel('customHeader', 'Header')).toBe('Header');
    expect(np.uiTextFormat('menuFilterOnly', { column: np.menuColumnLabel('customHeader', 'Header'), value: 'r-42' })).toBe(
      'Header: r-42 のみ',
    );
    // Unconfigured, the column is still called "Header" and still translates.
    np.saveCustomHeaderColumnName('');
    expect(np.menuColumnLabel('customHeader', 'Header')).toBe('ヘッダー');
    expect(np.uiTextFormat('menuKeepSelected', { count: 2 })).toBe('選択した行を残す (2)');
    expect(np.uiTextFormat('menuDeleteSelected', { count: 2 })).toBe('選択した行を削除 (2)');
    expect(fullCopyKeys.map((key) => np.uiText(key))).toEqual([
      'リクエスト概要をフルコピー',
      'URL をフルコピー',
      'cURL をフルコピー',
      'fetch をフルコピー',
      'PowerShell をフルコピー',
      'Markdown をフルコピー',
      '生リクエストをフルコピー',
      'リクエストボディをフルコピー',
    ]);
    expect(np.uiTextFormat('menuHighlightColorNamed', { color: np.uiText('menuColorGreen') })).toBe('緑でハイライト');
    np.applyLanguage('en');
  });
});

describe('WebSocket frame HAR export', () => {
  const wsContext = (row) => ({ createRow: () => {}, getRow: () => row });

  test('live capture retains a structured frame array on WS rows only', () => {
    const wsRow = { method: 'WS', startedDateTime: new Date(1000).toISOString() };
    np.ingestWsEvents(
      [
        { socketId: 1, kind: 'ws-sent', at: 2000, preview: 'hello' },
        { socketId: 1, kind: 'ws-received', at: 3000, preview: '[binary 12 bytes]' },
      ],
      wsContext(wsRow),
    );
    expect(wsRow._wsFrames).toEqual([
      { type: 'send', time: 2000, binary: false, data: 'hello' },
      { type: 'receive', time: 3000, binary: true, data: '' },
    ]);
    const sseRow = { method: 'SSE', startedDateTime: new Date(1000).toISOString() };
    np.ingestWsEvents([{ socketId: 2, kind: 'ws-received', at: 2000, preview: 'data: x' }], wsContext(sseRow));
    expect(sseRow._wsFrames).toBeUndefined();
  });

  test('export writes Chrome-shaped _webSocketMessages with honest fidelity notes', () => {
    const row = {
      id: 1,
      method: 'WS',
      url: 'wss://live.example.test/socket',
      startedDateTime: new Date(1000).toISOString(),
      _wsFrames: [
        { type: 'send', time: 2000, binary: false, data: 'ping' },
        { type: 'receive', time: 2500, binary: true, data: '' },
      ],
      _wsFramesDropped: 3,
    };
    const har = np.buildHarLogFromRows([row], new Map());
    const entry = har.log.entries[0];
    expect(entry._webSocketMessages).toEqual([
      { type: 'send', time: 2, opcode: 1, data: 'ping' },
      { type: 'receive', time: 2.5, opcode: 2 },
    ]);
    expect(entry._networkPlus.webSocketExport).toEqual({
      droppedFrames: 3,
      binaryFramesWithoutPayload: 1,
      textPreviewLimit: np.WS_FRAME_PREVIEW_CHARS,
    });
    // A row without frames never gets the key.
    const plain = np.buildHarLogFromRows([{ id: 2, method: 'GET', url: 'https://a.test/' }], new Map());
    expect(plain.log.entries[0]._webSocketMessages).toBeUndefined();
  });

  test('an imported conversation survives a re-export round-trip', () => {
    const row = { id: 3, method: 'GET', url: 'wss://a.test/ws', startedDateTime: new Date(0).toISOString() };
    np.applyHarWebSocketMessages(row, [
      { type: 'send', time: 1.5, opcode: 1, data: 'one' },
      { type: 'receive', time: 2.5, opcode: 1, data: 'two' },
    ]);
    const har = np.buildHarLogFromRows([row], new Map());
    expect(har.log.entries[0]._webSocketMessages).toEqual([
      { type: 'send', time: 1.5, opcode: 1, data: 'one' },
      { type: 'receive', time: 2.5, opcode: 1, data: 'two' },
    ]);
  });

  test('sanitized export omits the frames and marks the omission per entry', () => {
    const har = {
      log: {
        version: '1.2',
        entries: [
          {
            startedDateTime: new Date(0).toISOString(),
            time: 1,
            request: { method: 'GET', url: 'wss://a.test/ws', headers: [] },
            response: { status: 101, statusText: '', headers: [], content: { mimeType: '', text: '' } },
            timings: {},
            _webSocketMessages: [
              { type: 'send', time: 1, opcode: 1, data: 'token=secret' },
              { type: 'receive', time: 2, opcode: 1, data: 'ok' },
            ],
          },
        ],
      },
    };
    const sanitized = np.sanitizeHar(har, { mode: 'sanitized' });
    expect(sanitized.log._networkPlus.failedClosed).toBe(false);
    const entry = sanitized.log.entries[0];
    expect(entry._webSocketMessages).toBeUndefined();
    expect(entry._networkPlus.webSocketFramesOmitted).toBe(2);
    expect(JSON.stringify(sanitized)).not.toContain('token=secret');
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
        // Real stream rows carry the socket id; it is what keeps a live,
        // growing transcript out of the 32 MiB response cache.
        _wsSocketId: event.socketId,
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
    // A live transcript publishes directly as displayable text: state
    // 'cached' with the decoded text in place, but never entering the
    // response-cache accounting, whose eviction would destroy the frames of
    // a connection that is still open.
    expect(row.responseContentState).toBe('cached');
    expect(row.responseContentText).toBe(row.responseContent);
    expect(row.responseContentBytes).toBeGreaterThan(0);
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

// The suites above reset the shared document mock, so applyLanguage's walk over
// [data-i18n] has nothing to iterate. Hand it an empty node list before every
// language switch these tests make.
function switchTestLanguage(language) {
  document.querySelectorAll.mockImplementation(() => []);
  np.applyLanguage(language);
}

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
      addEventListener: jest.fn(),
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
    expect(note.textContent).toContain('Decoded locally for display; the signature is not verified.');
    const codeBlocks = created.filter((el) => el.className === 'code-block');
    expect(codeBlocks.some((el) => String(el.textContent).includes('"sub": "user-1"'))).toBe(true);
    expect(np.createJwtDetailsSection([{ name: 'Accept', value: 'text/html' }])).toBeNull();
  });

  test('splitJwtRuns names the three segments and rejoins to the value verbatim', () => {
    const token = makeToken({ exp: 1755750000 });
    const value = 'Bearer ' + token;
    const runs = np.splitJwtRuns(value);
    // The tinting must not change what the row holds: the runs are the value.
    expect(runs.map((run) => run.text).join('')).toBe(value);
    expect(runs.map((run) => run.jwt)).toEqual([false, true]);
    expect(runs[1].segments).toHaveLength(3);
    expect(runs[1].segments.join('.')).toBe(token);
    // Two tokens in one value, and the text between them, all survive.
    const pair = 'a=' + token + '; b=' + token.replace('sig-Az_09', 'sig-Bz_19');
    const pairRuns = np.splitJwtRuns(pair);
    expect(pairRuns.map((run) => run.text).join('')).toBe(pair);
    expect(pairRuns.filter((run) => run.jwt)).toHaveLength(2);
    // A value with no decodable token is one plain run, so the delimiter
    // rendering every other value uses is what paints it.
    expect(np.splitJwtRuns('Bearer abc.def.ghi')).toEqual([{ jwt: false, text: 'Bearer abc.def.ghi' }]);
    expect(np.splitJwtRuns('eyJ%%%%broken')).toEqual([{ jwt: false, text: 'eyJ%%%%broken' }]);
    expect(np.splitJwtRuns('')).toEqual([{ jwt: false, text: '' }]);
    expect(np.splitJwtRuns(null)).toEqual([{ jwt: false, text: '' }]);
  });

  test('the chip time reads in two units and writes them per language', () => {
    expect(np.formatJwtChipDelta(2 * 3600000 + 14 * 60000)).toBe('2h 14m');
    expect(np.formatJwtChipDelta(-(3 * 86400000 + 4 * 3600000))).toBe('3d 4h');
    // A trailing zero unit ends the reading rather than padding it out.
    expect(np.formatJwtChipDelta(3 * 86400000)).toBe('3d');
    expect(np.formatJwtChipDelta(90 * 1000)).toBe('1m 30s');
    expect(np.formatJwtChipDelta(0)).toBe('0s');
    switchTestLanguage('ja');
    // Japanese writes the units without a separator between them.
    expect(np.formatJwtChipDelta(2 * 3600000 + 14 * 60000)).toBe('2時間14分');
    expect(np.formatJwtChipDelta(-(3 * 86400000))).toBe('3日');
    switchTestLanguage('en');
  });

  test('the expiry chip appears only for a decodable token that states an exp', () => {
    const now = 1755750000000;
    const future = makeToken({ exp: now / 1000 + 2 * 3600 + 14 * 60 });
    const past = makeToken({ exp: now / 1000 - 3 * 86400 });
    expect(np.planJwtExpiryChip('Bearer ' + future, now)).toEqual({
      expired: false,
      text: 'JWT · expires in 2h 14m',
    });
    expect(np.planJwtExpiryChip('Bearer ' + past, now)).toEqual({ expired: true, text: 'JWT · expired 3d ago' });
    // No exp, no token, and a token-shaped string that does not decode each
    // yield no chip: an empty chip would read as "never expires".
    expect(np.planJwtExpiryChip('Bearer ' + makeToken({ sub: 'user-1' }), now)).toBeNull();
    expect(np.planJwtExpiryChip('Bearer abc.def.ghi', now)).toBeNull();
    expect(np.planJwtExpiryChip('application/json', now)).toBeNull();
    expect(np.planJwtExpiryChip('', now)).toBeNull();
    switchTestLanguage('ja');
    expect(np.planJwtExpiryChip('Bearer ' + future, now).text).toBe('JWT · あと2時間14分で失効');
    expect(np.planJwtExpiryChip('Bearer ' + past, now).text).toBe('JWT · 3日前に失効');
    switchTestLanguage('en');
  });
});

describe('per-row value copy and the cookie header summary', () => {
  // The names the GRIDS really build, never idealised ones. The previous gate
  // was a denylist over the DISPLAY key, and this suite passed while the pane
  // leaked because it only ever asked about 'Authorization' and 'Set-Cookie':
  // the Response > Cookies rows are keyed 'Set-Cookie #1', a Request > Cookies
  // key is whatever parseCookieHeader read out of the header, and a header key
  // is row.requestHeaders' own casing. Every name below reached the clipboard
  // verbatim under that gate.
  const ROW_COOKIE_HEADER =
    'JSESSIONID=ABCDEF0123456789SECRET; remember_me=rm-secret-token-value; _ga=GA1.2.3.4; __proto__=poison';
  const ROW_REQUEST_HEADERS = [
    { name: 'Accept', value: 'application/json' },
    { name: 'Authorization', value: 'Bearer HEADER-SECRET-TOKEN' },
    { name: 'X-Api-Key', value: 'XAPI-SECRET-KEY' },
    { name: 'x-internal-trace', value: 'TRACE-SECRET-42' },
    { name: 'Referer', value: 'https://ref.example.test/page?token=REFERER-SECRET' },
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
  ];

  test('a header row copies exactly what sanitizeHeaders leaves, name by captured name', () => {
    // The contract, stated as an identity rather than as a list of verdicts:
    // the row copy is never less redacted than the pane's Copy sanitized.
    for (const header of ROW_REQUEST_HEADERS) {
      const sanitized = np.sanitizeHeaders([header]).value[0].value;
      expect([header.name, np.planKvCopyValue('header', header.name, header.value)]).toEqual([
        header.name,
        { masked: sanitized !== header.value, text: sanitized },
      ]);
    }
    // Two of those the old denylist gate handed over in full: a private header
    // it had never heard of, and a Referer whose query carries the secret.
    expect(np.planKvCopyValue('header', 'x-internal-trace', 'TRACE-SECRET-42')).toEqual({
      masked: true,
      text: np.REDACTION_MARKER,
    });
    expect(
      np.planKvCopyValue('header', 'Referer', 'https://ref.example.test/page?token=REFERER-SECRET').text,
    ).not.toContain('REFERER-SECRET');
    // The allowlist still lets a safe header through, so the control is still
    // worth pressing on the rows a reader actually wants.
    expect(np.planKvCopyValue('header', 'Content-Type', 'application/json; charset=utf-8')).toEqual({
      masked: false,
      text: 'application/json; charset=utf-8',
    });
    expect(np.planKvCopyValue('header', 'Accept', 'text/html')).toEqual({ masked: false, text: 'text/html' });
  });

  test('a cookie row redacts its value whatever the cookie is called', () => {
    const parsed = np.parseCookieHeader(ROW_COOKIE_HEADER);
    // These are the four keys the Request > Cookies grid builds, and none of
    // them is a name any sensitivity heuristic recognises.
    expect(parsed.map((cookie) => cookie.name)).toEqual(['JSESSIONID', 'remember_me', '_ga', '__proto__']);
    for (const cookie of parsed) {
      expect([cookie.name, np.planKvCopyValue('cookie', cookie.name, cookie.value)]).toEqual([
        cookie.name,
        { masked: true, text: np.REDACTION_MARKER },
      ]);
      // The masked text is never the value that was on screen.
      expect(np.planKvCopyValue('cookie', cookie.name, cookie.value).text).not.toContain(cookie.value);
    }
  });

  test('a counter in the display key cannot loosen the gate', () => {
    // Response > Cookies renders 'Set-Cookie #1'; normalizeSensitiveKey read
    // that as 'setcookie1' and matched nothing, so the whole Set-Cookie header
    // was copied. The gate is handed the captured header name now, and the
    // decorated label redacts either way because the allowlist fails closed.
    const value = 'JSESSIONID=ABCDEF0123456789SECRET; Path=/; HttpOnly';
    for (const name of ['Set-Cookie', 'set-cookie', 'Set-Cookie #1', 'Set-Cookie #12']) {
      expect([name, np.planKvCopyValue('header', name, value)]).toEqual([
        name,
        { masked: true, text: np.REDACTION_MARKER },
      ]);
    }
  });

  test('a query row redacts, a plain row copies its own reading, an unstated kind fails closed', () => {
    expect(np.planKvCopyValue('query', 'access_token', 'QUERY-SECRET-TOKEN')).toEqual({
      masked: true,
      text: np.REDACTION_MARKER,
    });
    // 'plain' is the one kind that copies verbatim, and only panel-computed
    // rows declare it: a formatted duration, a method, a decoded JWT claim.
    expect(np.planKvCopyValue('plain', 'wait', '20 ms')).toEqual({ masked: false, text: '20 ms' });
    expect(np.planKvCopyValue('plain', 'Method', null)).toEqual({ masked: false, text: '' });
    // A kind nobody declared — a typo, or a grid added later that forgot to
    // say what its rows are — is treated as a cookie and redacts.
    for (const kind of [undefined, null, '', 'timing', 'info']) {
      expect([kind, np.planKvCopyValue(kind, 'wait', '20 ms')]).toEqual([
        kind,
        { masked: true, text: np.REDACTION_MARKER },
      ]);
    }
  });

  test('the cookie header summary counts exactly the rows the Cookies tab lists', () => {
    const header = Array.from({ length: 14 }, (_unused, index) => 'c' + index + '=x').join('; ');
    const parsed = np.parseCookieHeader(header);
    expect(parsed).toHaveLength(14);
    expect(np.formatCookieHeaderSummary(parsed.length)).toBe('14 cookies — open Cookies');
    expect(np.formatCookieHeaderSummary(np.parseCookieHeader('only=1').length)).toBe('1 cookie — open Cookies');
    expect(np.formatCookieHeaderSummary(1234)).toBe('1,234 cookies — open Cookies');
    switchTestLanguage('ja');
    expect(np.formatCookieHeaderSummary(14)).toBe('14 件の Cookie — Cookies を開く');
    expect(np.formatCookieHeaderSummary(1)).toBe('1 件の Cookie — Cookies を開く');
    switchTestLanguage('en');
  });
});

describe('set-cookie parsing for the Cookies tables', () => {
  test('a Set-Cookie header splits into its pair and its attributes', () => {
    const parsed = np.parseSetCookieHeader(
      'session=a1b2c3; Domain=.example.test; Path=/checkout; Expires=Wed, 09 Sep 2026 09:00:01 GMT;' +
        ' Secure; HttpOnly; SameSite=Lax; Partitioned',
    );
    expect(parsed.name).toBe('session');
    expect(parsed.value).toBe('a1b2c3');
    expect(parsed.domain).toBe('.example.test');
    expect(parsed.path).toBe('/checkout');
    expect(parsed.expires).toBe('Wed, 09 Sep 2026 09:00:01 GMT');
    expect(parsed.secure).toBe(true);
    expect(parsed.httpOnly).toBe(true);
    expect(parsed.sameSite).toBe('Lax');
    expect(parsed.partitioned).toBe(true);
    expect(np.planSetCookieFlags(parsed)).toEqual(['Secure', 'HttpOnly', 'SameSite=Lax', 'Partitioned']);
  });

  test('attribute names are case-insensitive and the last one wins', () => {
    // Every one of these is a name a server really sends, and a case-sensitive
    // reading would have shown the cookie as having no attributes at all.
    const shouted = np.parseSetCookieHeader('id=1; DOMAIN=a.test; path=/x; SECURE; httponly; samesite=None; PARTITIONED');
    expect(shouted.domain).toBe('a.test');
    expect(shouted.path).toBe('/x');
    expect(shouted.secure).toBe(true);
    expect(shouted.httpOnly).toBe(true);
    expect(shouted.sameSite).toBe('None');
    expect(shouted.partitioned).toBe(true);
    // A repeated attribute takes its last value, the rule a browser applies.
    expect(np.parseSetCookieHeader('id=1; Path=/a; Path=/b').path).toBe('/b');
    // Whitespace and an empty run between semicolons are not attributes.
    expect(np.parseSetCookieHeader('id=1;;  ; Secure ').secure).toBe(true);
  });

  test('only the first = splits the pair, and a name-only cookie keeps its name', () => {
    // A base64 pad and a JWT both carry '=' inside the value; splitting on the
    // last one, or on every one, loses the tail of the value.
    const padded = np.parseSetCookieHeader('sig=YWJjZA==; Path=/');
    expect(padded.name).toBe('sig');
    expect(padded.value).toBe('YWJjZA==');
    expect(padded.path).toBe('/');
    // The same reading parseCookieHeader gives the request side, so the two
    // tables agree about what a malformed cookie is and neither drops a row
    // its tab already counted.
    const bare = np.parseSetCookieHeader('justaname; Secure');
    expect([bare.name, bare.value]).toEqual(['justaname', '']);
    expect(np.parseCookieHeader('justaname')[0]).toEqual({ name: 'justaname', value: '' });
    expect(np.parseSetCookieHeader('')).toMatchObject({ name: '', value: '' });
    expect(np.parseSetCookieHeader(null)).toMatchObject({ name: '', value: '' });
    // An attribute with no value is a flag; one the parser does not know is
    // ignored rather than becoming a row of its own.
    expect(np.parseSetCookieHeader('id=1; Priority=High; Secure')).toMatchObject({ secure: true, value: '1' });
  });

  test('a quoted value keeps its quotes, and the reading sits beside them', () => {
    // RFC 6265 does not allow a ';' inside a quoted value, so the ';' split is
    // safe. The captured bytes stay the value — the cell renders them and the
    // clipboard carries them — and the unquoted reading is never either.
    const quoted = np.parseSetCookieHeader('pref="a=b c"; Path=/');
    expect(quoted.value).toBe('"a=b c"');
    expect(quoted.quoted).toBe(true);
    expect(quoted.unquoted).toBe('a=b c');
    expect(quoted.path).toBe('/');
    const plain = np.parseSetCookieHeader('pref=ab');
    expect([plain.quoted, plain.unquoted]).toEqual([false, 'ab']);
    // One quote is not a quoted value, and neither is a lone '"'.
    expect(np.parseSetCookieHeader('pref="ab')).toMatchObject({ quoted: false, unquoted: '"ab' });
    expect(np.parseSetCookieHeader('pref="')).toMatchObject({ quoted: false, unquoted: '"' });
  });

  test('a Max-Age reads as an instant only when the response dates it', () => {
    const cookie = np.parseSetCookieHeader('id=1; Max-Age=3600');
    expect(np.planCookieExpiry(cookie, 'Wed, 02 Sep 2026 09:00:01 GMT')).toEqual({
      source: 'max-age',
      maxAge: '3600',
      expires: '',
      computed: 'Wed, 02 Sep 2026 10:00:01 GMT',
    });
    // No date header, an unparseable one, or a Max-Age that is not an integer:
    // the literal stands alone rather than the panel guessing an instant.
    for (const anchor of ['', null, undefined, 'not a date']) {
      expect([anchor, np.planCookieExpiry(cookie, anchor).computed]).toEqual([anchor, '']);
      expect([anchor, np.planCookieExpiry(cookie, anchor).maxAge]).toEqual([anchor, '3600']);
    }
    for (const bad of ['soon', '3600.5', '1e3', '']) {
      const plan = np.planCookieExpiry(np.parseSetCookieHeader('id=1; Max-Age=' + bad), 'Wed, 02 Sep 2026 09:00:01 GMT');
      expect([bad, plan.computed]).toEqual([bad, '']);
    }
    // A negative Max-Age is an immediate expiry, and it dates backwards.
    expect(
      np.planCookieExpiry(np.parseSetCookieHeader('id=1; Max-Age=-1'), 'Wed, 02 Sep 2026 09:00:01 GMT').computed,
    ).toBe('Wed, 02 Sep 2026 09:00:00 GMT');
    // A duration past the largest time value JavaScript can hold would render
    // as the string 'Invalid Date'; it states the literal instead.
    expect(
      np.planCookieExpiry(np.parseSetCookieHeader('id=1; Max-Age=99999999999999'), 'Wed, 02 Sep 2026 09:00:01 GMT'),
    ).toMatchObject({ source: 'max-age', computed: '' });
  });

  test('Max-Age wins over Expires for the computed instant, and the sent Expires is kept', () => {
    // Both attributes present: the browser's rule decides what the computed
    // line reads from, but the Expires the response sent is still what the
    // header carried, so the plan keeps it rather than rendering less than
    // the captured header holds.
    const both = np.parseSetCookieHeader('id=1; Expires=Wed, 09 Sep 2026 09:00:01 GMT; Max-Age=60');
    expect(np.planCookieExpiry(both, 'Wed, 02 Sep 2026 09:00:01 GMT')).toEqual({
      source: 'max-age',
      maxAge: '60',
      expires: 'Wed, 09 Sep 2026 09:00:01 GMT',
      computed: 'Wed, 02 Sep 2026 09:01:01 GMT',
    });
    // And without an anchor the sent Expires still rides along with the
    // Max-Age literal.
    expect(np.planCookieExpiry(both, '')).toEqual({
      source: 'max-age',
      maxAge: '60',
      expires: 'Wed, 09 Sep 2026 09:00:01 GMT',
      computed: '',
    });
    // Expires is shown verbatim — it is an absolute instant already, so there
    // is nothing to compute and nothing to mark.
    expect(np.planCookieExpiry(np.parseSetCookieHeader('id=1; Expires=Wed, 09 Sep 2026 09:00:01 GMT'), '')).toEqual({
      source: 'expires',
      maxAge: '',
      expires: 'Wed, 09 Sep 2026 09:00:01 GMT',
      computed: '',
    });
    // A date Date.parse rejects is still what the response sent: the raw
    // string, never the string 'Invalid Date'.
    expect(np.planCookieExpiry(np.parseSetCookieHeader('id=1; Expires=yesterday'), '')).toMatchObject({
      source: 'expires',
      expires: 'yesterday',
      computed: '',
    });
    // A session cookie states neither, and the cell says so rather than
    // rendering as empty.
    expect(np.planCookieExpiry(np.parseSetCookieHeader('id=1; Path=/'), 'Wed, 02 Sep 2026 09:00:01 GMT')).toEqual({
      source: 'none',
      maxAge: '',
      expires: '',
      computed: '',
    });
  });

  test('every row a cookie table lists still redacts through its own gate', () => {
    // The tables replaced two kv grids; the gate did not move with them. The
    // response table hands the sanitizer the CAPTURED header name and the
    // CAPTURED header bytes, never the cookie name or value it parsed out.
    const captured = 'session=a1b2c3SECRET; Path=/; Secure; HttpOnly; SameSite=Lax';
    const cookie = np.parseSetCookieHeader(captured);
    expect(cookie.name).toBe('session');
    expect(np.planKvCopyValue('header', 'Set-Cookie', captured)).toEqual({
      masked: true,
      text: np.REDACTION_MARKER,
    });
    // And the piece the row renders would have been let through by that gate:
    // 'session' is a name no allowlist entry covers, but neither is it the
    // name the row states, so the difference is what this test pins.
    expect(np.planKvCopyValue('header', cookie.name, cookie.value).text).toBe(np.REDACTION_MARKER);
    // The request table's rows go through the cookie gate, which redacts every
    // value unconditionally whatever the cookie is called.
    for (const parsed of np.parseCookieHeader('a=1; __proto__=poison; constructor=x')) {
      expect([parsed.name, np.planKvCopyValue('cookie', parsed.name, parsed.value)]).toEqual([
        parsed.name,
        { masked: true, text: np.REDACTION_MARKER },
      ]);
    }
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

// The mirror protocol's session identity and message bounds. Row ids restart
// at 1 in every DevTools session and a mirror tab keeps its rows across a
// disconnect, so identity is what stops a reattached tab from aliasing an old
// session's rows onto a new session's ids — and what stops a duplicated tab,
// sharing the same port, from settling the other tab's callbacks.
describe('mirror session identity and bounds', () => {
  const captureViewer = () => {
    const seen = { snapshots: [], appended: [], posted: [] };
    const viewer = np.createMirrorViewerSession({
      postMessage: (message) => seen.posted.push(message),
      appendWireRow: (wireRow) => seen.appended.push(wireRow),
      applyWireSnapshot: (rows, options) => seen.snapshots.push({ rows, options }),
      getLocalCount: () => 0,
      getLocalMaxId: () => 0,
      onHostSync: () => {},
    });
    return { viewer, seen };
  };

  test('a snapshot from a new host session is applied as a rebuild, not a reconcile', () => {
    const { viewer, seen } = captureViewer();
    viewer.handleMessage({ type: 'snapshot-start', generation: 1, session: 'session-a', total: 0 });
    viewer.handleMessage({ type: 'snapshot-end', generation: 1 });
    viewer.handleMessage({ type: 'snapshot-start', generation: 2, session: 'session-b', total: 0 });
    viewer.handleMessage({ type: 'snapshot-end', generation: 2 });
    expect(seen.snapshots).toHaveLength(2);
    expect(seen.snapshots[0].options.sessionChanged).toBe(false);
    expect(seen.snapshots[1].options.sessionChanged).toBe(true);
  });

  test('a pushed row from a different session is ignored and the sync heartbeat forces a resync', () => {
    const { viewer, seen } = captureViewer();
    viewer.handleMessage({ type: 'row', session: 'session-a', row: { id: 1 } });
    expect(seen.appended).toHaveLength(1);
    viewer.handleMessage({ type: 'row', session: 'session-b', row: { id: 1 } });
    expect(seen.appended).toHaveLength(1);
    viewer.handleMessage({ type: 'sync', session: 'session-b', count: 0, maxId: 0, paused: false });
    expect(seen.posted.filter((message) => message.type === 'snapshot-request')).toHaveLength(1);
  });

  test('results echoing another viewer nonce never settle this tab, and the echo settles it once', () => {
    const { viewer, seen } = captureViewer();
    const outcomes = [];
    viewer.requestBody(7, (error, payload) => outcomes.push({ error, payload }));
    const request = seen.posted.find((message) => message.type === 'body-request');
    expect(typeof request.viewer).toBe('string');
    viewer.handleMessage({
      type: 'body-result',
      requestId: request.requestId,
      viewer: 'some-other-tab',
      ok: true,
      content: 'wrong',
      encoding: '',
    });
    expect(outcomes).toHaveLength(0);
    viewer.handleMessage({
      type: 'body-result',
      requestId: request.requestId,
      viewer: request.viewer,
      ok: true,
      content: 'right',
      encoding: '',
    });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].payload.content).toBe('right');
  });

  test('snapshot chunks split on the byte bound, not only the 500-row count', () => {
    const rows = Array.from({ length: 3 }, (_unused, index) => ({
      id: index + 1,
      startedDateTime: '2026-08-29T00:00:00.000Z',
      duration: 1,
      method: 'WS',
      url: 'wss://stream.example.test/live',
      requestHeaders: [],
      // Half the per-chunk character budget of frame text per row: three rows
      // would once have shipped as a single 500-row chunk and thrown past the
      // port limit; the byte bound now flushes after each.
      requestPostData: { mimeType: 'text/plain', text: 'x'.repeat(1.5 * 1024 * 1024) },
      status: '',
      statusText: 'Open',
      protocol: 'WS',
      responseHeaders: [],
      size: 0,
      type: 'websocket',
      timings: {},
      initiator: null,
    }));
    const posted = [];
    const host = np.createMirrorHostSession({
      postMessage: (message) => posted.push(message),
      getRows: () => rows,
      isPaused: () => false,
      fetchBodyForRow: () => Promise.reject(new Error('unused')),
    });
    host.sendSnapshot();
    const chunkMessages = posted.filter((message) => message.type === 'snapshot-rows');
    expect(chunkMessages).toHaveLength(3);
    expect(chunkMessages.every((message) => message.rows.length === 1)).toBe(true);
    const startMessage = posted.find((message) => message.type === 'snapshot-start');
    expect(typeof startMessage.session).toBe('string');
    expect(startMessage.session.length).toBeGreaterThan(0);
  });
});


describe('details header identity helpers', () => {
  test('splitUrlForTitle separates host, pathname, the query count and the fragment', () => {
    expect(np.splitUrlForTitle('https://example.com/api/data?q=1&r=2')).toEqual({
      host: 'example.com',
      userinfo: '',
      pathname: '/api/data',
      search: '?q=1&r=2',
      hash: '',
      queryCount: 2,
      scheme: 'https://',
    });
    // The fragment is part of the URL and part of the URL row's selectable
    // value; the breakdown cannot show it if this does not hand it over.
    expect(np.splitUrlForTitle('https://example.com/docs?page=2#section-4')).toEqual({
      host: 'example.com',
      userinfo: '',
      pathname: '/docs',
      search: '?page=2',
      hash: '#section-4',
      queryCount: 1,
      scheme: 'https://',
    });
    expect(np.splitUrlForTitle('http://localhost:3000/test')).toEqual({
      host: 'localhost:3000',
      userinfo: '',
      pathname: '/test',
      search: '',
      hash: '',
      queryCount: 0,
      scheme: 'http://',
    });
    // Credentials live between the scheme and the host, and URL.host drops
    // them: taking the host alone rendered and copied
    // 'https://creds.example.test/vault/item?k=1' for a request the panel
    // actually saw as 'https://alice:s3cret@creds.example.test/vault/item?k=1'.
    expect(np.splitUrlForTitle('https://alice:s3cret@creds.example.test/vault/item?k=1')).toEqual({
      host: 'creds.example.test',
      userinfo: 'alice:s3cret@',
      pathname: '/vault/item',
      search: '?k=1',
      hash: '',
      queryCount: 1,
      scheme: 'https://',
    });
    // A username with no password keeps its single '@' and nothing else.
    expect(np.splitUrlForTitle('https://svc@api.example.test:8443/health#live')).toEqual({
      host: 'api.example.test:8443',
      userinfo: 'svc@',
      pathname: '/health',
      search: '',
      hash: '#live',
      queryCount: 0,
      scheme: 'https://',
    });
    // Opaque schemes follow extractUrlParts: the scheme stands in for the host.
    expect(np.splitUrlForTitle('blob:https://cdn.example.test/5d76341a')).toEqual({
      host: 'blob:',
      userinfo: '',
      pathname: 'https://cdn.example.test/5d76341a',
      search: '',
      hash: '',
      queryCount: 0,
      scheme: '',
    });
    expect(np.splitUrlForTitle('not-a-url')).toEqual({
      host: '',
      userinfo: '',
      pathname: 'not-a-url',
      search: '',
      hash: '',
      queryCount: 0,
      scheme: '',
    });
    expect(np.splitUrlForTitle(null).pathname).toBe('');
    // Every piece of a parsable URL is accounted for, so nothing the row
    // renders from these parts can silently drop part of the address. This is
    // an EQUALITY, not an endsWith: the suffix form could not see the missing
    // 'alice:s3cret@', because what it dropped was a prefix.
    for (const url of [
      'https://example.com/api/data?q=1&r=2',
      'https://example.com/docs?page=2#section-4',
      'https://user@example.com:8443/a/b?c=d#e',
      'https://alice:s3cret@creds.example.test/vault/item?k=1',
      'https://svc@api.example.test:8443/health#live',
      'http://api.example.test:8080/ported/endpoint?a=1&b=2#frag',
      'blob:https://cdn.example.test/5d76341a',
    ]) {
      const parts = np.splitUrlForTitle(url);
      const rebuilt = parts.scheme + parts.userinfo + parts.host + parts.pathname + parts.search + parts.hash;
      expect([url, rebuilt]).toEqual([url, url]);
    }
  });

  test('planTitlePathText keeps the endpoint whole and never drops text unmarked', () => {
    // One character is one unit of budget, so the pixel rule can be reasoned
    // about exactly; the panel passes a canvas measurer of the same shape.
    const measure = (text) => text.length;
    const pathname = '/gampad/ads/deep/nested/segments/final-segment.js';
    expect(np.planTitlePathText(pathname, 200, measure)).toBe(pathname);
    expect(np.planTitlePathText(pathname, pathname.length, measure)).toBe(pathname);
    const shortened = np.planTitlePathText(pathname, 24, measure);
    expect(shortened).toBe('/gampa…/final-segment.js');
    expect(shortened).toHaveLength(24);
    // Down to the ellipsis plus the last segment, the segment is intact.
    expect(np.planTitlePathText(pathname, 18, measure)).toBe('…/final-segment.js');
    for (let budget = 19; budget < pathname.length; budget += 1) {
      const candidate = np.planTitlePathText(pathname, budget, measure);
      expect(candidate).toHaveLength(budget);
      expect(candidate.endsWith('/final-segment.js')).toBe(true);
      expect(candidate.startsWith('/')).toBe(true);
    }
    // Only when the last segment alone is longer than the budget does its
    // own head give way, and the tail (extension) still survives.
    expect(np.planTitlePathText(pathname, 10, measure)).toBe('…egment.js');
    expect(np.planTitlePathText(pathname, 1, measure)).toBe('…');
    expect(np.planTitlePathText('no-slashes-at-all', 8, measure)).toBe('…-at-all');
    expect(np.planTitlePathText('', 5, measure)).toBe('');
    expect(np.planTitlePathText('/a/b/', 4, measure)).toBe('/a…/');
    // The property the header's invariant rests on: every result is either
    // the pathname itself or carries a '…'. A budget of zero or less is not
    // an excuse to emit a bare segment that reads as a complete path.
    for (const candidatePath of [pathname, '/a', '/', 'no-slashes-at-all', '/a/b/']) {
      for (let budget = -3; budget <= candidatePath.length + 2; budget += 1) {
        const rendered = np.planTitlePathText(candidatePath, budget, measure);
        expect([budget, rendered === candidatePath || rendered.indexOf('…') !== -1]).toEqual([budget, true]);
      }
    }
  });

  test('longestFittingLength bisects a monotone candidate without a retry loop', () => {
    const calls = [];
    const measure = (text) => {
      calls.push(text);
      return text.length;
    };
    expect(np.longestFittingLength(10, (n) => 'x'.repeat(n), measure, 4)).toBe(4);
    expect(np.longestFittingLength(10, (n) => 'x'.repeat(n), measure, 0)).toBe(0);
    expect(np.longestFittingLength(10, (n) => 'x'.repeat(n), measure, 100)).toBe(10);
    // A negative maximum cannot make the search run backwards.
    expect(np.longestFittingLength(-4, (n) => 'x'.repeat(n), measure, 100)).toBe(0);
    // Bisection, not a walk: 11 candidates are decided in at most 4 probes.
    calls.length = 0;
    np.longestFittingLength(10, (n) => 'x'.repeat(n), measure, 7);
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  test('isMonoValue marks opaque keys and long whitespace-free values', () => {
    for (const key of [
      'URL',
      'Authorization',
      'Cookie',
      'Set-Cookie',
      'set-cookie',
      'ETag',
      'If-None-Match',
      'x-request-id',
      'X-Request-ID',
      'traceparent',
    ]) {
      expect(np.isMonoValue(key, 'short')).toBe(true);
    }
    expect(np.isMonoValue('Set-Cookie #2', 'sid=1')).toBe(true);
    expect(np.isMonoValue('Accept', 'text/html')).toBe(false);
    expect(np.isMonoValue('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36')).toBe(false);
    expect(np.isMonoValue('X-Trace', 'a'.repeat(41))).toBe(true);
    expect(np.isMonoValue('X-Trace', 'a'.repeat(40))).toBe(false);
    expect(np.isMonoValue('X-Trace', 'a'.repeat(20) + ' ' + 'b'.repeat(30))).toBe(false);
    expect(np.isMonoValue('gdpr_consent', 'CQAbcDEFghIJklMNopQRstUVwxYZ0123456789ABCDEFG')).toBe(true);
    expect(np.isMonoValue(null, null)).toBe(false);
  });
});

describe('kv value planning', () => {
  test('splitAtDelimiters breaks after & ; / only for whitespace-free text', () => {
    expect(np.splitAtDelimiters('a=1&b=2&c=3')).toEqual(['a=1&', 'b=2&', 'c=3']);
    expect(np.splitAtDelimiters('sid=abc;path=/;secure')).toEqual(['sid=abc;', 'path=/', ';', 'secure']);
    expect(np.splitAtDelimiters('/v1/orders/')).toEqual(['/', 'v1/', 'orders/']);
    expect(np.splitAtDelimiters('a=1&b=2 c=3')).toEqual(['a=1&b=2 c=3']);
    expect(np.splitAtDelimiters('plain-token')).toEqual(['plain-token']);
    expect(np.splitAtDelimiters('')).toEqual(['']);
    expect(np.splitAtDelimiters(null)).toEqual(['']);
    // The segments always join back to the original text: <wbr> adds nothing
    // to what copy actions and find-in-page read.
    const cookie = Array.from({ length: 40 }, (_unused, index) => 'k' + index + '=v' + index).join(';');
    expect(np.splitAtDelimiters(cookie).join('')).toBe(cookie);
  });
  test('splitCommaList breaks after each comma of a list of three or more', () => {
    expect(np.splitCommaList('alpha,beta,gamma,delta')).toEqual(['alpha,', 'beta,', 'gamma,', 'delta']);
    // Two items read as one datum — a locale pair, a coordinate — and stay whole.
    expect(np.splitCommaList('alpha,beta')).toEqual(['alpha,beta']);
    expect(np.splitCommaList('alpha')).toEqual(['alpha']);
    // Text with whitespace already has break points of its own.
    expect(np.splitCommaList('alpha, beta, gamma')).toEqual(['alpha, beta, gamma']);
    expect(np.splitCommaList('')).toEqual(['']);
    expect(np.splitCommaList(null)).toEqual(['']);
    // A trailing comma leaves no empty tail behind, and every case joins back
    // to the source: the breaks add nothing to what copy and find-in-page read.
    expect(np.splitCommaList('a,b,c,')).toEqual(['a,', 'b,', 'c,']);
    for (const value of ['alpha,beta,gamma,delta', 'a,b,c,', 'alpha,beta', 'alpha', '']) {
      expect([value, np.splitCommaList(value).join('')]).toEqual([value, value]);
    }
  });

  test('decodeQueryValue decodes a percent-encoded token and keeps an undecodable one', () => {
    expect(np.decodeQueryValue('%2Fdashboard')).toBe('/dashboard');
    expect(np.decodeQueryValue('hello+world')).toBe('hello world');
    expect(np.decodeQueryValue('plain')).toBe('plain');
    // A lone '%' is not an escape: decodeURIComponent throws, and the token as
    // captured is the only honest thing left to show.
    expect(np.decodeQueryValue('100%')).toBe('100%');
    expect(np.decodeQueryValue('%E0%A4%A')).toBe('%E0%A4%A');
    expect(np.decodeQueryValue('')).toBe('');
    expect(np.decodeQueryValue(null)).toBe('');
  });

  test('planSegmentedUrl splits the address into origin, path and query tokens', () => {
    const plan = np.planSegmentedUrl('https://api.example.test:8443/v1/orders?q=beacon&page=2#totals');
    expect(plan.segmented).toBe(true);
    expect(plan.scheme).toBe('https://');
    expect(plan.host).toBe('api.example.test:8443');
    expect(plan.pathname).toBe('/v1/orders');
    expect(plan.hash).toBe('#totals');
    expect(plan.tokens.map((token) => [token.name, token.value])).toEqual([
      ['q', 'beacon'],
      ['page', '2'],
    ]);
    // Nothing decodes here, so the row shows no decoded reading at all.
    expect(plan.decodes).toBe(false);
    // The parts are exhaustive: what the segmented row paints IS the URL, so a
    // selection of that row is still an address a tool will accept.
    for (const url of [
      'https://app.example.test/dashboard',
      'https://alice:s3cret@creds.example.test/vault/item?k=1',
      'http://api.example.test:8080/ported/endpoint?a=1&b=2',
      'https://auth.example.test/login?next=%2Fdashboard&lang=ja',
      'https://api.example.test/search?flag&q=beacon',
    ]) {
      const parts = np.planSegmentedUrl(url);
      expect([url, parts.scheme + parts.userinfo + parts.host + parts.pathname + parts.search + parts.hash]).toEqual([
        url,
        url,
      ]);
      // And the query tokens reassemble the search string they were split from.
      const rebuilt = parts.tokens.length ? '?' + parts.tokens.map((token) => token.raw).join('&') : parts.search;
      expect([url, rebuilt]).toEqual([url, parts.search]);
    }
  });

  test('planSegmentedUrl refuses to segment an address its parts cannot spell back', () => {
    // new URL() NORMALIZES, and the segmented rendering paints the parts. A
    // Query parameter arrives already decoded by searchParams, so a value like
    // 'https://CB.Example.TEST:443/return?a=1' reached the renderer and was
    // painted 'https://cb.example.test/return?a=1' — a host string and a port
    // the request never sent, with nothing on screen saying so. Every shape
    // below is refused, and the caller renders `raw`, which is the token.
    for (const [url, normalized] of [
      ['https://CB.Example.TEST/return', 'https://cb.example.test/return'],
      ['https://cb.example.test:443/return', 'https://cb.example.test/return'],
      ['http://cb.example.test:80/return', 'http://cb.example.test/return'],
      ['https://cb.example.test', 'https://cb.example.test/'],
      ['https://cb.example.test/a/../b', 'https://cb.example.test/b'],
      ['https://cb.example.test/a b', 'https://cb.example.test/a%20b'],
      ['HTTPS://cb.example.test/return', 'https://cb.example.test/return'],
    ]) {
      const plan = np.planSegmentedUrl(url);
      const rebuilt = plan.scheme + plan.userinfo + plan.host + plan.pathname + plan.search + plan.hash;
      expect([url, plan.reconstructs, plan.segmented, rebuilt]).toEqual([url, false, false, normalized]);
      // The plan still carries the source verbatim, so the fallback rendering
      // shows the bytes the parameter held.
      expect([url, plan.raw]).toEqual([url, url]);
    }
    // An address that survives the round trip keeps the segmented rendering.
    for (const url of [
      'https://cb.example.test/return?a=1',
      'https://cb.example.test:8443/return?a=1#top',
      'https://alice:s3cret@cb.example.test/vault',
    ]) {
      expect([url, np.planSegmentedUrl(url).reconstructs, np.planSegmentedUrl(url).segmented]).toEqual([
        url,
        true,
        true,
      ]);
    }
  });

  test('planSegmentedUrl offers a decoded query only where decoding changes it', () => {
    const encoded = np.planSegmentedUrl('https://auth.example.test/login?next=%2Fdashboard%3Ftab%3Dbilling&lang=ja');
    expect(encoded.decodes).toBe(true);
    expect(encoded.decodedSearch).toBe('?next=/dashboard?tab=billing&lang=ja');
    // The raw string is untouched by the decode: it is what every copy path
    // reads, and '?next=/dashboard' is a different URL from '?next=%2Fdashboard'.
    expect(encoded.search).toBe('?next=%2Fdashboard%3Ftab%3Dbilling&lang=ja');
    expect(encoded.raw).toBe('https://auth.example.test/login?next=%2Fdashboard%3Ftab%3Dbilling&lang=ja');
    // A value the decoder refuses keeps its token; the row still decodes the
    // rest rather than falling back to nothing.
    const partial = np.planSegmentedUrl('https://cdn.example.test/asset?discount=100%&size=4%20x');
    expect(partial.decodes).toBe(true);
    expect(partial.decodedSearch).toBe('?discount=100%&size=4 x');
    expect(partial.tokens.map((token) => token.decodes)).toEqual([false, true]);
    // A parameter with no '=' keeps its name and gains no '='.
    const flag = np.planSegmentedUrl('https://api.example.test/search?flag&q=beacon');
    expect(flag.tokens.map((token) => token.hasValue)).toEqual([false, true]);
    expect(flag.decodedSearch).toBe('?flag&q=beacon');
    // A string the URL parser refuses is not segmented and carries no tokens.
    const opaque = np.planSegmentedUrl('not a url at all');
    expect([opaque.segmented, opaque.tokens, opaque.decodes, opaque.decodedSearch]).toEqual([false, [], false, '']);
  });

  test('isNestedQueryValue accepts a value that is itself a query string', () => {
    expect(np.isNestedQueryValue('utm_source=news&utm_id=77&cid=abc')).toBe(true);
    expect(np.isNestedQueryValue('a=1&b=2')).toBe(true);
    expect(np.isNestedQueryValue('a=&b=')).toBe(true);
    // One pair is a value that happens to hold an '=', not a query string.
    expect(np.isNestedQueryValue('a=1')).toBe(false);
    expect(np.isNestedQueryValue('eyJhbGciOiJIUzI1NiJ9')).toBe(false);
    expect(np.isNestedQueryValue('https://auth.example.test/callback?code=9&state=7')).toBe(false);
    expect(np.isNestedQueryValue('a=1&=2')).toBe(false);
    expect(np.isNestedQueryValue('')).toBe(false);
    expect(np.isNestedQueryValue(null)).toBe(false);
  });

  test('parseNestedQueryValue decodes the pairs inside a nested query value', () => {
    // The Query tab's values arrive already decoded by searchParams, so what
    // is nested inside them carries a second layer of encoding.
    expect(np.parseNestedQueryValue('utm_source=news&path=%2Fhome&label=hello+world')).toEqual([
      { name: 'utm_source', value: 'news' },
      { name: 'path', value: '/home' },
      { name: 'label', value: 'hello world' },
    ]);
    expect(np.parseNestedQueryValue('a=1')).toEqual([]);
    expect(np.parseNestedQueryValue('')).toEqual([]);
  });

  test('isAbsoluteHttpUrl accepts only an http(s) address with a host', () => {
    expect(np.isAbsoluteHttpUrl('https://auth.example.test/callback?code=9')).toBe(true);
    expect(np.isAbsoluteHttpUrl('http://api.example.test:8080/x')).toBe(true);
    expect(np.isAbsoluteHttpUrl('/callback?code=9')).toBe(false);
    expect(np.isAbsoluteHttpUrl('mailto:someone@example.test')).toBe(false);
    expect(np.isAbsoluteHttpUrl('javascript:alert(1)')).toBe(false);
    expect(np.isAbsoluteHttpUrl('data:text/plain,hello')).toBe(false);
    expect(np.isAbsoluteHttpUrl('news')).toBe(false);
    expect(np.isAbsoluteHttpUrl('')).toBe(false);
    expect(np.isAbsoluteHttpUrl(null)).toBe(false);
  });

  test('planKvValue clamps only values past 240 characters', () => {
    expect(np.KV_CLAMP_CHARS).toBe(240);
    const short = np.planKvValue('x'.repeat(240));
    expect(short.clamped).toBe(false);
    expect(short.chars).toBe(240);
    const long = np.planKvValue('y'.repeat(241));
    expect(long.clamped).toBe(true);
    expect(long.chars).toBe(241);
    expect(long.text).toBe('y'.repeat(241));
    expect(np.planKvValue(null)).toEqual({ text: '', chars: 0, clamped: false, segments: [''] });
    const url = 'https://ads.example.test/gampad/ads?' + Array.from({ length: 31 }, (_u, i) => 'p' + i + '=' + 'v'.repeat(40)).join('&');
    const plan = np.planKvValue(url);
    expect(plan.clamped).toBe(true);
    expect(plan.chars).toBe(url.length);
    expect(plan.segments.length).toBeGreaterThan(31);
    expect(plan.segments.join('')).toBe(url);
  });
});

describe('planDetailsSummary', () => {
  const baseRow = {
    status: 200,
    statusText: 'OK',
    type: 'application/json',
    protocol: 'HTTP/2',
    size: 1536,
    duration: 184,
    operation: '',
    responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
  };

  test('503 rows surface Retry-After beside the status', () => {
    const plan = np.planDetailsSummary({
      ...baseRow,
      status: 503,
      statusText: 'Service Unavailable',
      duration: 2450,
      responseHeaders: [...baseRow.responseHeaders, { name: 'Retry-After', value: '30' }],
    });
    expect(plan).toEqual({
      status: { code: 503, text: '503 Service Unavailable', statusClass: '5xx' },
      contentType: 'application/json',
      size: '1.5 KB',
      duration: '2.45 s',
      protocol: 'HTTP/2',
      operation: '',
      chip: { name: 'Retry-After', value: '30' },
    });
    // 429 shares the chip; a 500 without the header gets none.
    expect(
      np.planDetailsSummary({ ...baseRow, status: 429, responseHeaders: [{ name: 'retry-after', value: '120' }] }).chip,
    ).toEqual({ name: 'Retry-After', value: '120' });
    expect(np.planDetailsSummary({ ...baseRow, status: 500 }).chip).toBeNull();
  });

  test('3xx rows surface Location and 401 rows the WWW-Authenticate scheme', () => {
    const redirect = np.planDetailsSummary({
      ...baseRow,
      status: 302,
      statusText: 'Found',
      responseHeaders: [{ name: 'Location', value: 'https://auth.example.test/login?next=%2Fdashboard' }],
    });
    expect(redirect.status).toEqual({ code: 302, text: '302 Found', statusClass: '3xx' });
    expect(redirect.chip).toEqual({ name: 'Location', value: 'https://auth.example.test/login?next=%2Fdashboard' });
    // No content-type header: the row's HAR mime type stands in.
    expect(redirect.contentType).toBe('application/json');

    const unauthorized = np.planDetailsSummary({
      ...baseRow,
      status: 401,
      statusText: 'Unauthorized',
      responseHeaders: [
        { name: 'content-type', value: 'application/problem+json' },
        { name: 'www-authenticate', value: 'Bearer realm="api", error="invalid_token"' },
      ],
    });
    expect(unauthorized.status).toEqual({ code: 401, text: '401 Unauthorized', statusClass: '4xx' });
    expect(unauthorized.chip).toEqual({ name: 'WWW-Authenticate', value: 'Bearer' });
    expect(unauthorized.contentType).toBe('application/problem+json');
    // A 403 is not a challenge, so it carries no chip.
    expect(np.planDetailsSummary({ ...baseRow, status: 403 }).chip).toBeNull();
  });

  test('missing facts stay out of the strip so their rows can remain', () => {
    const pending = np.planDetailsSummary({
      status: 0,
      statusText: '',
      type: 'x-unknown',
      protocol: '',
      size: null,
      duration: null,
      operation: 'GetViewer',
      responseHeaders: [],
    });
    expect(pending).toEqual({
      status: null,
      contentType: '',
      size: '',
      duration: '',
      protocol: '',
      operation: 'GetViewer',
      chip: null,
    });
    expect(np.planDetailsSummary(null).status).toBeNull();
    // A status without reason phrase renders the bare code.
    expect(np.planDetailsSummary({ ...baseRow, statusText: '' }).status.text).toBe('200');
  });
});

// Tier 2 tabs-and-panes: the JSON tree's fold defaults and long-string
// folding, the Raw view's request-line split and JSON body, the tab
// fallback plan, and the Japanese frames of the new empty-pane strings.
// These renderers build real DOM structure, so a small tree-keeping element
// factory replaces the flat setup.js mock for this block.
describe('json tree, raw view and tab signal contracts', () => {
  let previousCreateElement;
  let previousCreateTextNode;

  const makeTextNode = (text) => ({ nodeType: 3, textContent: String(text), parentNode: null });

  const makeEl = (tagName) => {
    const el = {
      nodeType: 1,
      tagName: String(tagName).toUpperCase(),
      className: '',
      style: {},
      dataset: {},
      attributes: {},
      listeners: {},
      children: [],
      childNodes: [],
      parentNode: null,
      open: false,
      get textContent() {
        return el.childNodes.map((child) => child.textContent).join('');
      },
      set textContent(value) {
        el.childNodes = [];
        el.children = [];
        if (value !== '') el.childNodes.push(makeTextNode(value));
      },
      get nextElementSibling() {
        if (!el.parentNode) return null;
        const siblings = el.parentNode.children;
        return siblings[siblings.indexOf(el) + 1] || null;
      },
      appendChild(child) {
        child.parentNode = el;
        el.childNodes.push(child);
        if (child.nodeType === 1) el.children.push(child);
        return child;
      },
      insertBefore(child, ref) {
        child.parentNode = el;
        const at = el.childNodes.indexOf(ref);
        el.childNodes.splice(at < 0 ? el.childNodes.length : at, 0, child);
        if (child.nodeType === 1) {
          const elementAt = el.children.indexOf(ref);
          el.children.splice(elementAt < 0 ? el.children.length : elementAt, 0, child);
        }
        return child;
      },
      remove() {
        if (!el.parentNode) return;
        const parent = el.parentNode;
        parent.childNodes = parent.childNodes.filter((node) => node !== el);
        parent.children = parent.children.filter((node) => node !== el);
        el.parentNode = null;
      },
      setAttribute(name, value) {
        el.attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(el.attributes, name) ? el.attributes[name] : null;
      },
      addEventListener(type, handler) {
        (el.listeners[type] = el.listeners[type] || []).push(handler);
      },
      click() {
        (el.listeners.click || []).forEach((handler) => handler({ preventDefault() {} }));
      },
      classList: {
        add(...names) {
          const set = new Set(el.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => set.add(name));
          el.className = Array.from(set).join(' ');
        },
        remove(...names) {
          const set = new Set(el.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => set.delete(name));
          el.className = Array.from(set).join(' ');
        },
        toggle(name, force) {
          const has = el.classList.contains(name);
          const next = force === undefined ? !has : !!force;
          if (next) el.classList.add(name);
          else el.classList.remove(name);
          return next;
        },
        contains(name) {
          return el.className.split(/\s+/).includes(name);
        },
      },
      querySelectorAll(selector) {
        return collect(el, selector);
      },
      querySelector(selector) {
        return collect(el, selector)[0] || null;
      },
    };
    return el;
  };

  // Supports the selectors the code under test uses: "tag.class", ".class", "tag".
  function matches(el, selector) {
    const [tag, ...classes] = selector.split('.');
    if (tag && el.tagName !== tag.toUpperCase()) return false;
    return classes.every((name) => el.classList.contains(name));
  }
  function collect(root, selector) {
    const found = [];
    const walk = (node) => {
      node.children.forEach((child) => {
        if (matches(child, selector.trim())) found.push(child);
        walk(child);
      });
    };
    walk(root);
    return found;
  }
  const byClass = (root, name) => collect(root, '.' + name);
  const detailsIn = (root) => collect(root, 'details');

  // The loadViewPreset suite's jest.resetAllMocks() also emptied the
  // document query mocks applyLanguage walks; give them inert answers here.
  let previousQuerySelector;
  let previousQuerySelectorAll;

  beforeAll(() => {
    previousCreateElement = document.createElement.getMockImplementation();
    previousCreateTextNode = document.createTextNode.getMockImplementation();
    previousQuerySelector = document.querySelector.getMockImplementation();
    previousQuerySelectorAll = document.querySelectorAll.getMockImplementation();
    document.createElement.mockImplementation(makeEl);
    document.createTextNode.mockImplementation(makeTextNode);
    document.querySelector.mockImplementation(() => null);
    document.querySelectorAll.mockImplementation(() => []);
  });

  // Tests in here switch the panel to Japanese to read the Japanese frames.
  // Restoring only in afterAll left every later test in this block running in
  // Japanese; the language goes back after each test, as the uiText suite
  // above already does.
  afterEach(() => {
    np.applyLanguage('en');
  });

  afterAll(() => {
    np.applyLanguage('en');
    document.createElement.mockImplementation(previousCreateElement);
    document.createTextNode.mockImplementation(previousCreateTextNode);
    document.querySelector.mockImplementation(previousQuerySelector);
    document.querySelectorAll.mockImplementation(previousQuerySelectorAll);
  });

  test('nodes deeper than the open depth start folded; the controls expand and collapse them', () => {
    expect(np.JSON_TREE_OPEN_DEPTH).toBe(2);
    const tree = np.renderJsonTree(
      JSON.stringify({ data: { user: { profile: { name: 'ok' }, tags: [1, 2] }, count: 2 } }),
    );
    const nodes = detailsIn(tree);
    expect(nodes.map((node) => [node.dataset.depth, node.open])).toEqual([
      ['0', true], // root
      ['1', true], // data
      ['2', true], // user
      ['3', false], // profile
      ['3', false], // tags
    ]);

    const controls = byClass(tree, 'json-tree-controls');
    expect(controls).toHaveLength(1);
    // The controls come before the tree so they read as its toolbar, and
    // they are not .link-btn, which the pane search would click through.
    expect(tree.children[0]).toBe(controls[0]);
    const [expandAll, collapseAll] = controls[0].children;
    expect(expandAll.textContent).toBe('Expand all');
    expect(collapseAll.textContent).toBe('Collapse all');
    expect(expandAll.classList.contains('link-btn')).toBe(false);
    expandAll.click();
    expect(nodes.map((node) => node.open)).toEqual([true, true, true, true, true]);
    collapseAll.click();
    // Collapse keeps the root open so the outline stays visible.
    expect(nodes.map((node) => node.open)).toEqual([true, false, false, false, false]);
  });

  test('a one-node tree and a primitive root get no controls', () => {
    expect(byClass(np.renderJsonTree('{"ok":true}'), 'json-tree-controls')).toHaveLength(0);
    expect(byClass(np.renderJsonTree('42'), 'json-tree-controls')).toHaveLength(0);
    expect(np.renderJsonTree('not json')).toBeNull();
  });

  test('summary clicks that end with a live selection do not toggle the node', () => {
    const tree = np.renderJsonTree('{"a":{"b":1}}');
    const summary = byClass(tree, 'json-tree-summary')[0];
    const handler = summary.listeners.click[0];
    const event = { preventDefault: jest.fn() };
    global.window.getSelection = () => ({ isCollapsed: true });
    handler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    global.window.getSelection = () => ({ isCollapsed: false });
    handler(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    delete global.window.getSelection;
    handler(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  test('long or multi-line strings fold to one line and keep the whole string in one text node', () => {
    expect(np.JSON_TREE_LONG_STRING_CHARS).toBe(120);
    const long = 'x'.repeat(121);
    const multi = 'first line\nsecond line';
    const short = 'y'.repeat(120);
    const quoted = 'he said "hi" \\ then\nleft';
    const tree = np.renderJsonTree(JSON.stringify({ long, multi, short }));
    const lines = byClass(tree, 'json-tree-line');
    expect(lines.map((line) => line.classList.contains('json-tree-line--long'))).toEqual([true, true, false]);

    const [longLine, multiLine, shortLine] = lines;
    const value = byClass(longLine, 'json-tree-str')[0];
    expect(value.className).toBe('syn-str json-tree-str');
    // Quotes and body in ONE node, carrying the same JSON escaping a short
    // value gets: split across three nodes, a pane search spanning the
    // opening quote had no single text node to match in.
    expect(value.childNodes.map((node) => node.textContent)).toEqual([JSON.stringify(long)]);
    // The comma closes the value and sits next to it; the fold control comes
    // after, so the row does not read `"key": "value…" ▸,`.
    expect(longLine.childNodes.map((node) => node.textContent)).toEqual([
      '"long"',
      ': ',
      JSON.stringify(long),
      ',',
      '▸',
    ]);
    const toggle = value.nextElementSibling;
    expect(toggle.className).toBe('json-tree-str-toggle');
    expect(toggle.textContent).toBe('▸');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show the full string');
    toggle.click();
    expect(value.classList.contains('json-tree-str--expanded')).toBe(true);
    expect(toggle.textContent).toBe('▾');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Show the first line only');
    toggle.click();
    expect(value.classList.contains('json-tree-str--expanded')).toBe(false);

    expect(byClass(multiLine, 'json-tree-str')[0].childNodes[0].textContent).toBe(JSON.stringify(multi));
    // A short string keeps the escaped one-line form and no toggle.
    expect(byClass(shortLine, 'json-tree-str')).toHaveLength(0);
    expect(byClass(shortLine, 'syn-str')[0].textContent).toBe(JSON.stringify(short));
    expect(byClass(shortLine, 'json-tree-str-toggle')).toHaveLength(0);

    // A folded value carrying a quote, a backslash and a newline is escaped
    // the same way the short one is, so the two forms read alike and the
    // folded one still round-trips through JSON.parse.
    const escaped = quoted + 'z'.repeat(120);
    const escapedTree = np.renderJsonTree(JSON.stringify({ v: escaped }));
    const escapedValue = byClass(escapedTree, 'json-tree-str')[0];
    const rendered = escapedValue.childNodes.map((node) => node.textContent).join('');
    expect(rendered).toBe(JSON.stringify(escaped));
    expect(JSON.parse(rendered)).toBe(escaped);
    expect(rendered.indexOf('\\"hi\\"')).toBeGreaterThan(-1);
    expect(rendered.indexOf('\\\\')).toBeGreaterThan(-1);
    expect(rendered.indexOf('\n')).toBe(-1);
  });

  test('the raw request line splits into method, path and protocol; status lines stay whole', () => {
    expect(np.splitRawRequestLine('POST /graphql?op=Viewer HTTP/1.1')).toEqual({
      method: 'POST',
      path: '/graphql?op=Viewer',
      protocol: 'HTTP/1.1',
    });
    // A path with spaces still splits on the first and last space.
    expect(np.splitRawRequestLine('GET /a b/c HTTP/2')).toEqual({ method: 'GET', path: '/a b/c', protocol: 'HTTP/2' });
    expect(np.splitRawRequestLine('HTTP/1.1 200 OK')).toBeNull();
    expect(np.splitRawRequestLine('GET /')).toBeNull();
    expect(np.splitRawRequestLine('')).toBeNull();
    expect(np.splitRawRequestLine(' leading')).toBeNull();
  });

  test('renderRawHighlighted paints the split request line, a divider, and a highlighted JSON body', () => {
    const raw = np.buildRawRequestText({
      method: 'POST',
      url: 'https://api.example.test/graphql?op=Viewer',
      protocol: 'HTTP/1.1',
      requestHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      requestPostData: { text: '{"a":1,"ok":true,"s":"v"}' },
    });
    const pre = np.renderRawHighlighted(raw);
    expect(pre.className).toBe('code-block code-raw');
    const first = pre.childNodes.slice(0, 6).map((node) => [node.className || null, node.textContent]);
    expect(first).toEqual([
      ['syn-status-line', 'POST'],
      [null, ' '],
      ['syn-hdr-val', '/graphql?op=Viewer'],
      [null, ' '],
      ['syn-status-line', 'HTTP/1.1'],
      [null, '\r'],
    ]);
    const dividers = byClass(pre, 'raw-body-divider');
    expect(dividers).toHaveLength(1);
    // Headers before the divider, body tokens after it, and no nested <pre>.
    const nodes = pre.childNodes;
    const dividerAt = nodes.indexOf(dividers[0]);
    expect(nodes.slice(0, dividerAt).some((node) => node.className === 'syn-hdr-name')).toBe(true);
    const bodyNodes = nodes.slice(dividerAt + 1);
    expect(bodyNodes.map((node) => [node.className || null, node.textContent])).toEqual([
      [null, '{'],
      ['syn-key', '"a"'],
      [null, ':'],
      ['syn-num', '1'],
      [null, ','],
      ['syn-key', '"ok"'],
      [null, ':'],
      ['syn-bool', 'true'],
      [null, ','],
      ['syn-key', '"s"'],
      [null, ':'],
      ['syn-str', '"v"'],
      [null, '}'],
    ]);
    expect(collect(pre, 'pre')).toHaveLength(0);
    // The body text is the original, not a pretty-printed copy.
    expect(bodyNodes.map((node) => node.textContent).join('')).toBe('{"a":1,"ok":true,"s":"v"}');
  });

  test('renderRawHighlighted keeps a status line whole and a non-JSON body as plain text', () => {
    const raw = np.buildRawResponseText(
      { protocol: 'HTTP/1.1', status: 200, statusText: 'OK', responseHeaders: [{ name: 'X-A', value: '1' }] },
      'plain text body',
    );
    const pre = np.renderRawHighlighted(raw);
    expect(pre.childNodes[0].className).toBe('syn-status-line');
    expect(pre.childNodes[0].textContent).toBe('HTTP/1.1 200 OK');
    expect(pre.childNodes[1].textContent).toBe('\r');
    const dividers = byClass(pre, 'raw-body-divider');
    expect(dividers).toHaveLength(1);
    const after = pre.childNodes.slice(pre.childNodes.indexOf(dividers[0]) + 1);
    expect(after.map((node) => [node.className || null, node.textContent])).toEqual([[null, 'plain text body']]);
    // No body at all: no hairline and no empty body node, so the view ends
    // on the last header instead of a stray rule.
    const empty = np.renderRawHighlighted('GET / HTTP/1.1\r\nHost: a\r\n\r\n');
    expect(byClass(empty, 'raw-body-divider')).toHaveLength(0);
    // The separator line still carries its own text and newline: the divider
    // decorates the source, it does not consume a line of it.
    expect(empty.childNodes.map((node) => [node.className || null, node.textContent])).toEqual([
      ['syn-status-line', 'GET'],
      [null, ' '],
      ['syn-hdr-val', '/'],
      [null, ' '],
      ['syn-status-line', 'HTTP/1.1'],
      [null, '\r'],
      [null, '\n'],
      ['syn-hdr-name', 'Host'],
      ['syn-hdr-val', ': a\r'],
      [null, '\n'],
      [null, '\r'],
      [null, '\n'],
    ]);
  });

  test('renderRawHighlighted round-trips the source text character for character', () => {
    const bodyless = np.buildRawRequestText({
      method: 'GET',
      url: 'https://api.example.test/users?page=2',
      protocol: 'HTTP/1.1',
      requestHeaders: [{ name: 'Accept', value: 'application/json' }],
    });
    const json = np.buildRawResponseText(
      {
        protocol: 'HTTP/1.1',
        status: 200,
        statusText: 'OK',
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      },
      '{"id": 7, "name" : "a\\nb", "ok": true, "next": null}',
    );
    const crlf = np.buildRawResponseText(
      { protocol: 'HTTP/1.1', status: 200, statusText: 'OK', responseHeaders: [{ name: 'X-A', value: '1' }] },
      'line one\r\nline two\r\n\r\ntrailing\r\n',
    );
    for (const [label, raw] of [['body-less GET', bodyless], ['JSON body', json], ['CRLF body', crlf]]) {
      expect([label, np.renderRawHighlighted(raw).textContent]).toEqual([label, raw]);
    }
    // The JSON body is still highlighted in place, and the CRLF body is not.
    expect(byClass(np.renderRawHighlighted(json), 'syn-key').map((node) => node.textContent)).toEqual([
      '"id"',
      '"name"',
      '"ok"',
      '"next"',
    ]);
    expect(byClass(np.renderRawHighlighted(crlf), 'raw-body-divider')).toHaveLength(1);
  });

  test('renderRawHighlighted ends a body-less GET on its last header, with no hairline', () => {
    // buildRawRequestText always emits the CRLF separator, so the builder's
    // own output for a GET must not paint a divider either.
    const raw = np.buildRawRequestText({
      method: 'GET',
      url: 'https://api.example.test/users?page=2',
      protocol: 'HTTP/1.1',
      requestHeaders: [
        { name: 'Accept', value: 'application/json' },
        { name: 'Host', value: 'api.example.test' },
      ],
    });
    expect(raw).toBe('GET /users?page=2 HTTP/1.1\r\nAccept: application/json\r\nHost: api.example.test\r\n\r\n');
    const pre = np.renderRawHighlighted(raw);
    expect(byClass(pre, 'raw-body-divider')).toHaveLength(0);
    const last = pre.childNodes[pre.childNodes.length - 1];
    expect(last.className || null).toBeNull();
    expect(last.textContent).toBe('\n');
    expect(pre.textContent).toBe(raw);
    // A response with no body is the same: headers only, no trailing rule.
    const resRaw = np.buildRawResponseText(
      { protocol: 'HTTP/1.1', status: 204, statusText: 'No Content', responseHeaders: [{ name: 'X-A', value: '1' }] },
      '',
    );
    const res = np.renderRawHighlighted(resRaw);
    expect(byClass(res, 'raw-body-divider')).toHaveLength(0);
    expect(res.textContent).toBe(resRaw);
  });

  test("renderJsonHighlighted still returns its own <pre> for the Body pane's Text view", () => {
    const pre = np.renderJsonHighlighted(np.formatJsonSafe('{"k":null}'));
    expect(pre.tagName).toBe('PRE');
    expect(pre.className).toBe('code-block code-json');
    expect(byClass(pre, 'syn-null')[0].textContent).toBe('null');
  });

  test('planInspectorTabActivation falls back to Headers only for an empty picked pane', () => {
    expect(np.planInspectorTabActivation('req-cookies', { 'req-cookies': 0 }, 'req-headers')).toBe('req-headers');
    expect(np.planInspectorTabActivation('req-cookies', { 'req-cookies': 3 }, 'req-headers')).toBe('req-cookies');
    // An unknown count (async body) keeps the pick; no pick means Headers.
    expect(np.planInspectorTabActivation('res-body', { 'res-cookies': 0 }, 'res-headers')).toBe('res-body');
    expect(np.planInspectorTabActivation(undefined, { 'res-cookies': 0 }, 'res-headers')).toBe('res-headers');
    expect(np.planInspectorTabActivation('req-query', { 'req-query': 0 }, undefined)).toBe('req-query');
  });

  test('a pick naming the retired Preview tab opens Body instead', () => {
    // Preview was folded into Body. A choice made before that merge — the
    // in-memory sticky pick, or a value restored from one — names a tab that
    // no longer has a button, and the bar would silently stay where it was.
    expect(np.planInspectorTabActivation('res-preview', {}, 'res-headers')).toBe('res-body');
    // The choice is stored as a pane id, but a saved value may name the button.
    expect(np.planInspectorTabActivation('res-tab-preview', {}, 'res-headers')).toBe('res-body');
    // The mapped tab is then judged like any other: an empty Body still falls
    // back to Headers, and a Body with content keeps the pick.
    expect(np.planInspectorTabActivation('res-preview', { 'res-body': 0 }, 'res-headers')).toBe('res-headers');
    expect(np.planInspectorTabActivation('res-preview', { 'res-body': 1 }, 'res-headers')).toBe('res-body');
    // Only the retired tab is rewritten; every live tab is passed through.
    expect(np.planInspectorTabActivation('res-timing', {}, 'res-headers')).toBe('res-timing');
    expect(np.planInspectorTabActivation('req-body', {}, 'req-headers')).toBe('req-body');
    // A saved value that happens to name an Object.prototype member is a tab
    // id like any other: it passes through as the string it is, never as the
    // function a bare lookup into the frozen literal would have returned.
    expect(np.planInspectorTabActivation('toString', {}, 'res-headers')).toBe('toString');
    expect(np.planInspectorTabActivation('hasOwnProperty', {}, 'res-headers')).toBe('hasOwnProperty');
  });

  test('the empty-pane and tree strings have Japanese frames', () => {
    np.applyLanguage('en');
    expect(np.uiText('emptyRequestBody')).toBe('No request body');
    expect(np.uiText('emptyQueryParams')).toBe('No query parameters');
    expect(np.uiTextFormat('emptyQueryParamsBodyHint', { method: 'POST' })).toBe(
      'No query parameters — this POST carries its data in Body',
    );
    expect(np.uiText('emptyQueryParamsBodyHintNoMethod')).toBe(
      'No query parameters — this request carries its data in Body',
    );
    expect(np.uiText('emptyRequestCookies')).toBe('No cookies were sent');
    expect(np.uiText('emptySetCookieHeaders')).toBe('No set-cookie headers');
    np.applyLanguage('ja');
    expect(np.uiText('emptyRequestBody')).toBe('リクエストボディはありません');
    expect(np.uiText('emptyQueryParams')).toBe('クエリパラメーターはありません');
    expect(np.uiTextFormat('emptyQueryParamsBodyHint', { method: 'POST' })).toBe(
      'クエリパラメーターはありません — この POST はデータを Body で送っています',
    );
    // A methodless row takes the method-free frame, never the English noun
    // "request" dropped into the Japanese sentence.
    expect(np.uiText('emptyQueryParamsBodyHintNoMethod')).toBe(
      'クエリパラメーターはありません — このリクエストはデータを Body で送っています',
    );
    expect(np.uiText('emptyQueryParamsBodyHintNoMethod')).not.toContain('request');
    expect(np.uiText('emptyRequestCookies')).toBe('Cookie は送信されていません');
    expect(np.uiText('emptySetCookieHeaders')).toBe('set-cookie ヘッダーはありません');
    expect(np.uiText('jsonTreeExpandAll')).toBe('すべて展開');
    expect(np.uiText('jsonTreeCollapseAll')).toBe('すべて折りたたむ');
    const tree = np.renderJsonTree('{"a":{"b":1}}');
    const [expandAll, collapseAll] = byClass(tree, 'json-tree-controls')[0].children;
    expect([expandAll.textContent, collapseAll.textContent]).toEqual(['すべて展開', 'すべて折りたたむ']);
    const folded = np.renderJsonTree(JSON.stringify({ s: 'a\nb' }));
    expect(byClass(folded, 'json-tree-str-toggle')[0].getAttribute('aria-label')).toBe('文字列全体を表示');
  });
});
