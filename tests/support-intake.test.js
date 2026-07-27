const fs = require('fs');
const path = require('path');

const repositoryRoot = path.join(__dirname, '..');
const rawIssuesUrl = 'https://github.com/himiyosh/network-plus-extension/issues';
const chooserUrl = `${rawIssuesUrl}/new/choose`;
const privacyUrl = 'https://github.com/himiyosh/network-plus-extension/blob/main/docs/privacy.md';
const safetyWarning = '**Public issue - sanitized text only.**';
const compactSafetyDirection = 'Do not paste or attach real traffic or files.';
const unfinishedPattern = /\b(?:TODO|TBD|FIXME|CHANGEME|PLACEHOLDER)\b/i;
const rawIssuesRoutePattern = /https:\/\/github\.com\/himiyosh\/network-plus-extension\/issues(?=["'`)\s.,]|$)/g;

const read = (file) => fs.readFileSync(path.join(repositoryRoot, file), 'utf8');

const parseBodyElements = (yaml) => {
  const matches = [...yaml.matchAll(/^ {2}- type: ([a-z]+)$/gm)];
  return matches.map((match, index) => ({
    type: match[1],
    block: yaml.slice(match.index, matches[index + 1]?.index ?? yaml.length),
  }));
};

const extractTopLevelKeys = (yaml) => [...yaml.matchAll(/^([a-z_]+):/gm)].map((match) => match[1]);

const extractLabels = (yaml) => {
  const match = yaml.match(/^labels:\n((?: {2}- .+\n)+)body:/m);
  return match ? [...match[1].matchAll(/^ {2}- (.+)$/gm)].map((label) => label[1]) : [];
};

const extractIds = (yaml) => [...yaml.matchAll(/^ {4}id: ([a-z0-9_-]+)$/gm)].map((match) => match[1]);

const expectValidFormStructure = (yaml, expectedLabel) => {
  expect(extractTopLevelKeys(yaml)).toEqual(['name', 'description', 'title', 'labels', 'body']);
  expect(extractLabels(yaml)).toEqual([expectedLabel]);
  expect(yaml).not.toMatch(/^(?:assignees|projects|type):/m);

  const elements = parseBodyElements(yaml);
  expect(elements.length).toBeGreaterThan(0);
  for (const element of elements) {
    expect(['checkboxes', 'dropdown', 'input', 'markdown', 'textarea']).toContain(element.type);
    expect(element.block).toContain('    attributes:');
    if (element.type !== 'markdown') {
      expect(element.block).toMatch(/^ {4}id: [a-z0-9_-]+$/m);
      expect(element.block).toMatch(/^ {6}label: .+$/m);
    }
  }

  elements.forEach((element, index) => {
    if (element.type === 'input' || element.type === 'textarea') {
      expect(elements[index - 1]?.type).toBe('markdown');
      expect(elements[index - 1]?.block).toContain(safetyWarning);
      expect(elements[index - 1]?.block).toContain(compactSafetyDirection);
    }
  });

  expect(yaml).not.toMatch(/^ {2}- type: upload$/m);
  expect(yaml).not.toMatch(/^\s+placeholder:/m);
  expect(yaml).not.toMatch(/^\s+render:/m);
  expect(yaml).not.toMatch(unfinishedPattern);
};

describe('safe public support intake', () => {
  const bugForm = read('.github/ISSUE_TEMPLATE/bug.yml');
  const featureForm = read('.github/ISSUE_TEMPLATE/feature-request.yml');
  const config = read('.github/ISSUE_TEMPLATE/config.yml');

  test('uses valid top-level form keys and only existing issue labels', () => {
    expectValidFormStructure(bugForm, 'bug');
    expectValidFormStructure(featureForm, 'enhancement');
  });

  test('collects only the intended reproducibility and feature-design fields', () => {
    expect(extractIds(bugForm)).toEqual([
      'network-plus-version',
      'edge-version',
      'os-family',
      'safe-support-summary',
      'product-area',
      'reproduction',
      'expected-behavior',
      'actual-behavior',
      'frequency',
      'regression',
      'assistive-technology',
      'assistive-technology-context',
      'sanitized-evidence',
      'public-safety-acknowledgement',
    ]);
    expect(extractIds(featureForm)).toEqual([
      'user-outcome',
      'affected-workflow',
      'current-workaround',
      'smallest-behavior',
      'success-signal',
      'mission-fit',
      'implications',
      'public-safety-acknowledgement',
    ]);

    const requestedFieldLabels = [
      ...bugForm.matchAll(/^ {6}label: (.+)$/gm),
      ...featureForm.matchAll(/^ {6}label: (.+)$/gm),
    ]
      .map((match) => match[1])
      .join('\n');
    expect(requestedFieldLabels).not.toMatch(
      /\b(?:email|contact details?|customer identifiers?|tenant|account id|real domains?|real urls?|raw logs?|file uploads?)\b/i,
    );
  });

  test('keeps the safe support summary optional, warning-adjacent, and synchronized with guidance', () => {
    const elements = parseBodyElements(bugForm);
    const summaryIndex = elements.findIndex((element) => element.block.includes('id: safe-support-summary'));
    const summary = elements[summaryIndex];
    const precedingWarning = elements[summaryIndex - 1];
    const readme = read('README.md');
    const privacy = read('docs/privacy.md');

    expect(summary?.type).toBe('textarea');
    expect(summary?.block).toContain('label: Safe support summary (optional)');
    expect(summary?.block).toContain('Paste only the reviewed output from Copy safe support summary.');
    expect(summary?.block).not.toContain('required: true');
    expect(precedingWarning?.type).toBe('markdown');
    expect(precedingWarning?.block).toContain(safetyWarning);
    expect(precedingWarning?.block).toContain('Copy safe support summary');
    expect(precedingWarning?.block).toContain('Leave this field blank if the extension cannot be opened.');
    for (const source of [bugForm, readme, privacy]) {
      expect(source).toContain('Copy safe support summary');
      expect(source).toMatch(/review/i);
    }
  });

  test('keeps manual version and Edge fields required when the extension cannot be opened', () => {
    const elements = parseBodyElements(bugForm);
    for (const id of ['network-plus-version', 'edge-version']) {
      const field = elements.find((element) => element.block.includes(`id: ${id}`));
      expect(field?.block).toContain('required: true');
    }
  });

  test.each([
    ['bug', bugForm],
    ['feature', featureForm],
  ])('%s form requires complete public-data acknowledgement', (_name, form) => {
    const acknowledgement = parseBodyElements(form).find((element) =>
      element.block.includes('id: public-safety-acknowledgement'),
    );
    expect(acknowledgement?.type).toBe('checkboxes');
    for (const requiredText of [
      'passwords',
      'tokens',
      'cookies',
      'authorization values',
      'customer data',
      'raw or full HAR or SAZ files',
      'real URLs',
      'headers',
      'bodies',
      'logs containing sensitive traffic',
      'other confidential material',
      'issue is public and remains editable',
      'responsible for reviewing the final public issue',
    ]) {
      expect(acknowledgement?.block).toContain(requiredText);
    }
    expect(acknowledgement?.block.match(/required: true/g)).toHaveLength(4 + (form === featureForm ? 1 : 0));
  });

  test('rejects unsupported feature claims without authorizing telemetry or monetization pressure', () => {
    for (const term of [
      'mastery',
      'readiness',
      'certification',
      'telemetry',
      'monetization pressure',
      'unrelated product claims',
      'separately evidenced and authorized',
    ]) {
      expect(featureForm).toContain(term);
    }
    expect(featureForm).toContain('This form does not authorize those claims.');
  });

  test('disables blank issues and links only to verified public guidance', () => {
    expect(config).toContain('blank_issues_enabled: false');
    expect(config).toContain(privacyUrl);
    expect(config).toContain('https://github.com/himiyosh/network-plus-extension#readme');
    expect(config).not.toMatch(/security|vulnerabilit|private report/i);
    expect(config).not.toMatch(unfinishedPattern);
  });

  test('synchronizes every current support route with the issue chooser', () => {
    expect(`const support = '${rawIssuesUrl}';`.match(rawIssuesRoutePattern)).toEqual([rawIssuesUrl]);
    expect(`{"support":"${rawIssuesUrl}"}`.match(rawIssuesRoutePattern)).toEqual([rawIssuesUrl]);
    expect(chooserUrl.match(rawIssuesRoutePattern)).toBeNull();

    const supportSources = [
      read('README.md'),
      read('docs/privacy.md'),
      read('docs/edge-addons-submission.md'),
      read('scripts/check-store-readiness.js'),
    ];
    for (const source of supportSources) {
      expect(source).toContain(chooserUrl);
      expect(source.match(rawIssuesRoutePattern) ?? []).toEqual([]);
    }
  });
});
