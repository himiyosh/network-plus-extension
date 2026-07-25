const {
  BRACE_EXPANSION_ADVISORY_URL,
  BRACE_EXPANSION_GHSA,
  TEMP_EXCEPTION_EXPIRES_AT,
  evaluateAuditRuns,
} = require('../scripts/check-audit-policy');

const createAuditResult = (report, status = 0) => ({
  status,
  stdout: JSON.stringify(report),
  stderr: '',
});

const createCleanRuntimeReport = () => ({
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: 0,
    },
  },
});

const createAllowedDevReport = () => ({
  auditReportVersion: 2,
  vulnerabilities: {
    'brace-expansion': {
      severity: 'high',
      via: [
        {
          source: 1124334,
          name: 'brace-expansion',
          title: `${BRACE_EXPANSION_GHSA} advisory`,
          url: BRACE_EXPANSION_ADVISORY_URL,
        },
      ],
    },
    minimatch: {
      severity: 'high',
      via: ['brace-expansion'],
    },
    glob: {
      severity: 'high',
      via: ['minimatch'],
    },
  },
});

describe('evaluateAuditRuns', () => {
  test('allows only GHSA-mh99-v99m-4gvg root and derived high findings while runtime audit is clean', () => {
    const result = evaluateAuditRuns({
      devAuditResult: createAuditResult(createAllowedDevReport(), 1),
      runtimeAuditResult: createAuditResult(createCleanRuntimeReport(), 0),
      now: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(result).toEqual({ ok: true, errors: [] });
  });

  test('rejects unrelated high findings even when GHSA-derived findings exist', () => {
    const devReport = createAllowedDevReport();
    devReport.vulnerabilities.lodash = {
      severity: 'high',
      via: [
        {
          source: 123,
          name: 'lodash',
          title: 'lodash prototype pollution',
          url: 'https://github.com/advisories/GHSA-jf85-cpcp-j695',
        },
      ],
    };

    const result = evaluateAuditRuns({
      devAuditResult: createAuditResult(devReport, 1),
      runtimeAuditResult: createAuditResult(createCleanRuntimeReport(), 0),
      now: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(`outside ${BRACE_EXPANSION_GHSA}`);
    expect(result.errors[0]).toContain('lodash');
  });

  test('fails closed on malformed audit output', () => {
    const result = evaluateAuditRuns({
      devAuditResult: { status: 1, stdout: '{not-json', stderr: '' },
      runtimeAuditResult: createAuditResult(createCleanRuntimeReport(), 0),
      now: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('malformed JSON');
  });

  test('fails once the temporary exception has expired', () => {
    const result = evaluateAuditRuns({
      devAuditResult: createAuditResult(createAllowedDevReport(), 1),
      runtimeAuditResult: createAuditResult(createCleanRuntimeReport(), 0),
      now: new Date(new Date(TEMP_EXCEPTION_EXPIRES_AT).getTime() + 1),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('expired');
  });

  test('fails when dev audit is clean so the temporary policy can be removed', () => {
    const result = evaluateAuditRuns({
      devAuditResult: createAuditResult(createCleanRuntimeReport(), 0),
      runtimeAuditResult: createAuditResult(createCleanRuntimeReport(), 0),
      now: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('no longer needed');
    expect(result.errors[0]).toContain('Replace this policy with the raw audit command');
  });

  test('fails closed when runtime audit command errors out', () => {
    const result = evaluateAuditRuns({
      devAuditResult: createAuditResult(createAllowedDevReport(), 1),
      runtimeAuditResult: {
        status: 2,
        stdout: '',
        stderr: 'network timeout',
      },
      now: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('exit code 2');
  });

  test('fails closed when npm audit spawn/tool execution returns an error object', () => {
    const result = evaluateAuditRuns({
      devAuditResult: createAuditResult(createAllowedDevReport(), 1),
      runtimeAuditResult: {
        status: null,
        stdout: '',
        stderr: '',
        error: new Error('spawn ENOENT'),
      },
      now: new Date('2026-07-26T00:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('spawn ENOENT');
  });
});
