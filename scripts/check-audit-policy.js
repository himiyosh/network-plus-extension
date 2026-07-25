const { spawnSync } = require('child_process');

const HIGH_OR_HIGHER = new Set(['high', 'critical']);
const BRACE_EXPANSION_GHSA = 'GHSA-mh99-v99m-4gvg';
const BRACE_EXPANSION_ADVISORY_URL = `https://github.com/advisories/${BRACE_EXPANSION_GHSA}`;
const TEMP_EXCEPTION_EXPIRES_AT = '2026-08-09T00:00:00.000Z';

const parseAuditReport = (stdout, label) => {
  if (typeof stdout !== 'string' || stdout.trim() === '') {
    throw new Error(`${label} returned empty output`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.auditReportVersion !== 'number') {
    throw new Error(`${label} returned an invalid audit report`);
  }

  if (!parsed.vulnerabilities || typeof parsed.vulnerabilities !== 'object') {
    throw new Error(`${label} report is missing vulnerabilities`);
  }

  return parsed;
};

const isHighSeverity = (entry) => HIGH_OR_HIGHER.has((entry?.severity ?? '').toLowerCase());

const isGhsaFinding = (viaEntry) => {
  if (!viaEntry || typeof viaEntry !== 'object') {
    return false;
  }

  const advisoryUrl = String(viaEntry.url ?? '');
  const advisoryTitle = String(viaEntry.title ?? '');
  return advisoryUrl === BRACE_EXPANSION_ADVISORY_URL || advisoryTitle.includes(BRACE_EXPANSION_GHSA);
};

const isDerivedOnlyFromBraceExpansionGhsa = (name, vulnerabilities, memo = new Map(), stack = new Set()) => {
  if (memo.has(name)) {
    return memo.get(name);
  }

  if (stack.has(name)) {
    return false;
  }

  const vulnerability = vulnerabilities[name];
  if (!vulnerability || !Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
    memo.set(name, false);
    return false;
  }

  stack.add(name);
  for (const viaEntry of vulnerability.via) {
    if (typeof viaEntry === 'string') {
      if (!isDerivedOnlyFromBraceExpansionGhsa(viaEntry, vulnerabilities, memo, stack)) {
        stack.delete(name);
        memo.set(name, false);
        return false;
      }
      continue;
    }

    if (!isGhsaFinding(viaEntry)) {
      stack.delete(name);
      memo.set(name, false);
      return false;
    }
  }

  stack.delete(name);
  memo.set(name, true);
  return true;
};

const summarizeHighVulnerabilities = (report) =>
  Object.entries(report.vulnerabilities)
    .filter(([, entry]) => isHighSeverity(entry))
    .map(([name]) => name)
    .sort();

const evaluateAuditRuns = ({ devAuditResult, runtimeAuditResult, now = new Date() }) => {
  const errors = [];
  const expiryDate = new Date(TEMP_EXCEPTION_EXPIRES_AT);
  if (Number.isNaN(expiryDate.getTime())) {
    errors.push(`Invalid TEMP_EXCEPTION_EXPIRES_AT value: ${TEMP_EXCEPTION_EXPIRES_AT}`);
    return { ok: false, errors };
  }

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    errors.push('Invalid current time for audit policy evaluation');
    return { ok: false, errors };
  }

  if (now >= expiryDate) {
    errors.push(
      `Temporary ${BRACE_EXPANSION_GHSA} audit exception expired at ${TEMP_EXCEPTION_EXPIRES_AT}. Re-run npm audit --audit-level=high and remove this policy once patched dependencies are available.`,
    );
    return { ok: false, errors };
  }

  for (const [label, result] of [
    ['npm audit --audit-level=high', devAuditResult],
    ['npm audit --omit=dev --audit-level=high', runtimeAuditResult],
  ]) {
    if (!result || typeof result !== 'object') {
      errors.push(`${label} did not return a result`);
      return { ok: false, errors };
    }

    if (result.error) {
      const errorMessage = result.error?.message ? result.error.message : String(result.error);
      errors.push(`${label} failed: ${errorMessage}`);
      return { ok: false, errors };
    }

    if (![0, 1].includes(result.status)) {
      const stderr = String(result.stderr ?? '').trim();
      errors.push(`${label} failed with exit code ${result.status}${stderr ? ` (${stderr})` : ''}`);
      return { ok: false, errors };
    }
  }

  let devAuditReport;
  let runtimeAuditReport;
  try {
    devAuditReport = parseAuditReport(devAuditResult.stdout, 'npm audit --audit-level=high');
    runtimeAuditReport = parseAuditReport(runtimeAuditResult.stdout, 'npm audit --omit=dev --audit-level=high');
  } catch (error) {
    errors.push(error.message);
    return { ok: false, errors };
  }

  const runtimeHigh = summarizeHighVulnerabilities(runtimeAuditReport);
  if (runtimeHigh.length > 0) {
    errors.push(`Runtime dependency vulnerabilities detected: ${runtimeHigh.join(', ')}`);
    return { ok: false, errors };
  }

  const devHigh = summarizeHighVulnerabilities(devAuditReport);
  if (devHigh.length === 0) {
    errors.push(
      `Temporary ${BRACE_EXPANSION_GHSA} exception is no longer needed because npm audit --audit-level=high is clean. Replace this policy with the raw audit command.`,
    );
    return { ok: false, errors };
  }

  const disallowed = devHigh.filter(
    (name) => !isDerivedOnlyFromBraceExpansionGhsa(name, devAuditReport.vulnerabilities),
  );

  if (disallowed.length > 0) {
    errors.push(
      `Disallowed high severity advisories detected outside ${BRACE_EXPANSION_GHSA}: ${disallowed.join(', ')}`,
    );
    return { ok: false, errors };
  }

  return { ok: true, errors: [] };
};

const runAudit = (args) => spawnSync('npm', ['audit', ...args, '--json'], { encoding: 'utf8' });

const main = () => {
  const devAuditResult = runAudit(['--audit-level=high']);
  const runtimeAuditResult = runAudit(['--omit=dev', '--audit-level=high']);
  const evaluation = evaluateAuditRuns({ devAuditResult, runtimeAuditResult, now: new Date() });

  if (!evaluation.ok) {
    for (const error of evaluation.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `OK: only temporary high-severity findings derived from ${BRACE_EXPANSION_GHSA} remain and runtime dependencies are clean`,
  );
};

if (require.main === module) {
  main();
}

module.exports = {
  BRACE_EXPANSION_GHSA,
  BRACE_EXPANSION_ADVISORY_URL,
  TEMP_EXCEPTION_EXPIRES_AT,
  evaluateAuditRuns,
  isDerivedOnlyFromBraceExpansionGhsa,
  parseAuditReport,
  summarizeHighVulnerabilities,
};
