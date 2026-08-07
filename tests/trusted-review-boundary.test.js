const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const trustedWorkflowPath = path.join(root, '.github', 'workflows', 'trusted-independent-review.yml');
const trustedWorkflowSource = fs.readFileSync(trustedWorkflowPath, 'utf8');
const qualityGatesSource = fs.readFileSync(path.join(root, '.github', 'workflows', 'quality-gates.yml'), 'utf8');

const TRUSTED_REVIEW_CONTRACT = 'trusted independent-review boundary';
const TRUSTED_REVIEW_STATUS_CONTEXT = 'independent-review';
const CHECKOUT_ACTION = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_ACTION = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
const PAYLOAD_HEAD_LINE = '          PAYLOAD_HEAD_SHA: ${{ github.event.pull_request.head.sha }}';

const createDiagnostic = (message) => `${TRUSTED_REVIEW_CONTRACT}: ${message}`;

// The workflow is resolved from the default branch, so these assertions are the
// merge-time tripwire: they must describe the whole step list rather than block
// individual bad patterns, because anything they do not enumerate is allowed.
// `digest` pins the whole step body, so any edit to its shell, env, or action
// inputs fails here even when no named rule below describes it. The named rules
// run first and give the actionable message; this is the catch-all that keeps
// an unenumerated weakening from passing silently. Updating a digest is the
// deliberate, reviewable act of changing what the trusted run executes.
const EXPECTED_STEPS = [
  { name: 'Resolve pull request head', uses: null, digest: 'effc7cf49955214c' },
  { name: 'Seed fail-closed review status', uses: null, digest: 'c807dae70271afe7' },
  { name: 'Check out trusted default-branch code', uses: CHECKOUT_ACTION, digest: '7d3ce1d9c9df2693' },
  { name: 'Set up Node.js', uses: SETUP_NODE_ACTION, digest: 'a877a81ca4a694b6' },
  { name: 'Verify independent review marker', uses: null, digest: 'd9372b9001273821' },
  { name: 'Publish trusted review status', uses: null, digest: '00006699674c69e2' },
];

const digestOf = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

// The step pins above only see text after `steps:`. Everything above it decides
// where and how those steps run: `container:` or `runs-on:` moves them onto an
// image or machine that supplies its own `gh` and shell, `defaults.run.shell`
// swaps the interpreter, and a job-level `env:` shadows the workflow-level
// status context. None of that touches a step body, so the job header is
// enumerated and digested on its own.
const EXPECTED_TOP_LEVEL_KEYS = ['name', 'on', 'permissions', 'concurrency', 'env', 'jobs'];
const EXPECTED_JOB_IDS = ['trusted-review'];
const EXPECTED_JOB_KEYS = ['name', 'if', 'runs-on', 'timeout-minutes', 'permissions', 'steps'];
const EXPECTED_JOB_PREAMBLE_DIGEST = '25cbdbf2f59b43d6';
// The final catch-all covers the file byte for byte, with no region left to a
// regex that YAML quoting can slip past. An earlier version digested only from
// `on:` onward and enumerated top-level keys with a line regex; a red-team pass
// then inserted `'defaults':` with a replacement `run.shell` ABOVE `on:` --
// Prettier's own canonical quoting, so every gate stayed green while an
// attacker-chosen interpreter ran every step that holds the write-capable
// token. Region digests below still run first because they say which part
// moved; this one guarantees nothing moves unnoticed.
const EXPECTED_WORKFLOW_FILE_DIGEST = 'f5fcb6e9de8ad26c';

// Shell constructs that would fetch, execute, or install anything the pull
// request controls. `pull_request_target` runs with a write-capable token, so a
// run block must never reach outside the checked-out default branch.
const FORBIDDEN_RUN_CONSTRUCTS = [
  { name: 'a repository fetch or checkout', pattern: /\bgit\s+(?:fetch|checkout|clone|pull|merge|switch)\b/ },
  { name: 'a network download', pattern: /\b(?:curl|wget)\b/ },
  { name: 'an indirect shell invocation', pattern: /\b(?:bash|sh|zsh|eval|source)\s|(?:^|\s)\.\s+\// },
  { name: 'a dependency installation', pattern: /\b(?:npm|npx|yarn|pnpm|pip|pipx)\b/ },
];

const parseSteps = (source) => {
  const stepsBlock = source.match(/\n {4}steps:\n([\s\S]*)$/);
  if (!stepsBlock) {
    throw new Error(createDiagnostic('the trusted job declares no steps.'));
  }

  return stepsBlock[1]
    .split(/\n(?= {6}- )/)
    .filter((chunk) => /^ {6}- /.test(chunk))
    .map((body) => ({
      body,
      name: (body.match(/^ {6}- name: (.+)$/m) ?? [])[1] ?? null,
      uses: (body.match(/^ {6}(?:- )?(?: {2})?uses: (\S+)/m) ?? [])[1] ?? null,
    }));
};

// Collect every `run: |` block body so shell content is inspected on its own,
// separately from the `env:` blocks that legitimately carry expressions.
const parseRunBodies = (source) => {
  const bodies = [];
  let current = null;

  for (const line of source.split('\n')) {
    if (current) {
      if (line.trim() === '' || line.startsWith(current.indent)) {
        current.lines.push(line);
        continue;
      }
      bodies.push(current.lines.join('\n'));
      current = null;
    }

    const opener = line.match(/^( +)run: \|\s*$/);
    if (opener) {
      current = { indent: `${opener[1]}  `, lines: [] };
    }
  }

  if (current) {
    bodies.push(current.lines.join('\n'));
  }
  return bodies;
};

const countOccurrences = (source, needle) => source.split(needle).length - 1;

const assertTrustedReviewBoundary = (source) => {
  // --- Triggers, privilege, and the status identity -------------------------
  if (!/\n {2}pull_request_target:\n/.test(source)) {
    throw new Error(createDiagnostic('missing the base-resolved pull_request_target trigger.'));
  }
  if (!/\n {2}issue_comment:\n/.test(source)) {
    throw new Error(createDiagnostic('missing the issue_comment re-verification trigger.'));
  }
  if (!/\npermissions: \{\}\n/.test(source)) {
    throw new Error(createDiagnostic('missing empty default permissions.'));
  }
  if (!new RegExp(`\\n {2}TRUSTED_REVIEW_STATUS_CONTEXT: ${TRUSTED_REVIEW_STATUS_CONTEXT}\\n`).test(source)) {
    throw new Error(createDiagnostic('missing the stable status context.'));
  }

  // --- The file and job headers are enumerated, not just the step list ------
  const topLevelKeys = Array.from(source.matchAll(/^([a-z-]+):/gm), (match) => match[1]);
  if (topLevelKeys.join(',') !== EXPECTED_TOP_LEVEL_KEYS.join(',')) {
    throw new Error(
      createDiagnostic(`declares top-level keys [${topLevelKeys.join(', ')}] instead of the allowed list.`),
    );
  }

  const jobsBlock = (source.match(/\njobs:\n([\s\S]*)$/) ?? [])[1];
  if (jobsBlock === undefined) {
    throw new Error(createDiagnostic('declares no jobs block.'));
  }
  const jobIds = Array.from(jobsBlock.matchAll(/^ {2}([a-z-]+):/gm), (match) => match[1]);
  if (jobIds.join(',') !== EXPECTED_JOB_IDS.join(',')) {
    throw new Error(createDiagnostic(`declares jobs [${jobIds.join(', ')}] instead of the trusted job alone.`));
  }

  const jobKeys = Array.from(jobsBlock.matchAll(/^ {4}([a-z-]+):/gm), (match) => match[1]);
  if (jobKeys.join(',') !== EXPECTED_JOB_KEYS.join(',')) {
    throw new Error(createDiagnostic(`declares job keys [${jobKeys.join(', ')}] instead of the allowed list.`));
  }

  const jobPreamble = (jobsBlock.match(/^([\s\S]*?\n) {4}steps:\n/) ?? [])[1];
  if (jobPreamble === undefined) {
    throw new Error(createDiagnostic('the trusted job header is not in the expected shape.'));
  }

  const jobPermissions = source.match(/\n {4}permissions:\n((?: {6}[a-z-]+: [a-z]+\n)+)/);
  const grantedPermissions = jobPermissions
    ? jobPermissions[1]
        .trim()
        .split('\n')
        .map((line) => line.trim())
    : [];
  const expectedPermissions = ['contents: read', 'issues: read', 'pull-requests: read', 'statuses: write'];
  if (grantedPermissions.join(',') !== expectedPermissions.join(',')) {
    throw new Error(
      createDiagnostic(`grants [${grantedPermissions.join(', ')}] instead of [${expectedPermissions.join(', ')}].`),
    );
  }

  // --- The step list is an allowlist, not a pattern filter ------------------
  const steps = parseSteps(source);
  const actualNames = steps.map((step) => step.name);
  const expectedNames = EXPECTED_STEPS.map((step) => step.name);
  if (actualNames.join(' | ') !== expectedNames.join(' | ')) {
    throw new Error(createDiagnostic(`declares steps [${actualNames.join(', ')}] instead of the allowed list.`));
  }

  for (const [index, expected] of EXPECTED_STEPS.entries()) {
    const actual = steps[index];
    if (expected.uses === null && actual.uses !== null) {
      throw new Error(createDiagnostic(`step "${expected.name}" must not run an action.`));
    }
    if (expected.uses !== null && actual.uses !== expected.uses) {
      throw new Error(createDiagnostic(`step "${expected.name}" must pin ${expected.uses}.`));
    }
  }

  // --- Nothing the pull request controls may be fetched, run, or installed --
  for (const body of parseRunBodies(source)) {
    if (body.includes('${{')) {
      throw new Error(createDiagnostic('interpolates an expression directly inside a run block.'));
    }
    const forbidden = FORBIDDEN_RUN_CONSTRUCTS.find(({ pattern }) => pattern.test(body));
    if (forbidden) {
      throw new Error(createDiagnostic(`a run block performs ${forbidden.name}.`));
    }
  }

  if (/continue-on-error/.test(source)) {
    throw new Error(createDiagnostic('uses continue-on-error, which can mask a failed verification.'));
  }
  if (/steps\.verify\.conclusion/.test(source) || !/steps\.verify\.outcome/.test(source)) {
    throw new Error(createDiagnostic('must publish from steps.verify.outcome, never from its conclusion.'));
  }

  // --- The checkout target and the only permitted head reference ------------
  const checkoutRefs = Array.from(source.matchAll(/^ +ref: (.*)$/gm), (match) => match[1]);
  if (checkoutRefs.join(',') !== '${{ github.event.repository.default_branch }}') {
    throw new Error(createDiagnostic(`checks out [${checkoutRefs.join(', ')}] instead of the default branch alone.`));
  }
  if (!source.includes('persist-credentials: false')) {
    throw new Error(createDiagnostic('keeps checkout credentials persisted.'));
  }
  const headReferences = countOccurrences(source, 'github.event.pull_request.head');
  if (headReferences !== 1 || !source.includes(PAYLOAD_HEAD_LINE)) {
    throw new Error(
      createDiagnostic('may reference the pull request head only as the status target env value.'),
    );
  }

  // --- Status publication discipline ---------------------------------------
  const statusPosts = countOccurrences(source, 'statuses/${HEAD_SHA}');
  if (statusPosts !== 2) {
    throw new Error(createDiagnostic(`posts ${statusPosts} commit statuses instead of the seed and the verdict.`));
  }
  if (countOccurrences(source, '--field context="${TRUSTED_REVIEW_STATUS_CONTEXT}"') !== 2) {
    throw new Error(createDiagnostic('both status posts must use the shared status context.'));
  }
  if (countOccurrences(source, '--field state=failure') !== 1) {
    throw new Error(createDiagnostic('must seed exactly one fail-closed status before verification.'));
  }
  if (source.includes('--field state=success')) {
    throw new Error(createDiagnostic('publishes a literal success state outside the verified verdict.'));
  }
  if (!/\n {6}- name: Publish trusted review status\n {8}if: always\(\) &&/.test(source)) {
    throw new Error(createDiagnostic('must publish the verdict unconditionally.'));
  }

  // The seed must land before any step that can fail, so an interrupted run
  // leaves a blocking status rather than a required check pending forever.
  const seedIndex = actualNames.indexOf('Seed fail-closed review status');
  const checkoutIndex = actualNames.indexOf('Check out trusted default-branch code');
  const verifyIndex = actualNames.indexOf('Verify independent review marker');
  if (!(seedIndex < checkoutIndex && checkoutIndex < verifyIndex)) {
    throw new Error(createDiagnostic('publishes the fail-closed seed after code checkout or verification.'));
  }

  // --- Catch-all: nothing in the job header or a step body changes silently -
  const actualPreambleDigest = digestOf(jobPreamble);
  if (actualPreambleDigest !== EXPECTED_JOB_PREAMBLE_DIGEST) {
    throw new Error(
      createDiagnostic(
        `the trusted job header changed (digest ${actualPreambleDigest}, pinned ${EXPECTED_JOB_PREAMBLE_DIGEST}); ` +
          'update the pin in the change that reviews the new behavior.',
      ),
    );
  }

  for (const [index, expected] of EXPECTED_STEPS.entries()) {
    const actualDigest = digestOf(steps[index].body);
    if (actualDigest !== expected.digest) {
      throw new Error(
        createDiagnostic(
          `step "${expected.name}" changed (digest ${actualDigest}, pinned ${expected.digest}); ` +
            'update the pin in the change that reviews the new behavior.',
        ),
      );
    }
  }

  // Byte-for-byte, so no region depends on a regex that YAML quoting can evade.
  const actualFileDigest = digestOf(source);
  if (actualFileDigest !== EXPECTED_WORKFLOW_FILE_DIGEST) {
    throw new Error(
      createDiagnostic(
        `the workflow file changed (digest ${actualFileDigest}, pinned ${EXPECTED_WORKFLOW_FILE_DIGEST}); ` +
          'update the pin in the change that reviews the new behavior.',
      ),
    );
  }
};

const replaceSourceOrThrow = (source, searchValue, replacement, mutationName) => {
  const mutatedSource = source.replace(searchValue, replacement);
  if (mutatedSource === source) {
    throw new Error(`Mutation fixture "${mutationName}" did not alter its source.`);
  }
  return mutatedSource;
};

const appendStep = (source, step) => `${source.replace(/\n+$/, '')}\n${step}\n`;

test('the trusted review workflow satisfies every boundary property', () => {
  expect(() => assertTrustedReviewBoundary(trustedWorkflowSource)).not.toThrow();
});

test('every step is an allowlisted action pin or an inspected run block', () => {
  const steps = parseSteps(trustedWorkflowSource);
  expect(steps.map((step) => step.name)).toEqual(EXPECTED_STEPS.map((step) => step.name));
  for (const action of steps.map((step) => step.uses).filter(Boolean)) {
    expect(action).toMatch(/^actions\/[a-z-]+@[0-9a-f]{40}$/);
  }
  expect(parseRunBodies(trustedWorkflowSource)).toHaveLength(4);
});

test('the trusted job runs only for pull requests', () => {
  expect(trustedWorkflowSource).toContain(
    "if: github.event_name == 'pull_request_target' || github.event.issue.pull_request != null",
  );
});

test('the pull_request_target trigger reaches the seed without an API call', () => {
  // A resolve failure would skip both the seed and the verdict, leaving a
  // required check pending. The payload already carries the head for the
  // trigger that opens and updates pull requests, so that path cannot fail.
  const resolveStep = parseSteps(trustedWorkflowSource)[0];
  expect(resolveStep.name).toBe('Resolve pull request head');
  expect(resolveStep.body).toContain(PAYLOAD_HEAD_LINE);
  expect(resolveStep.body).toMatch(/head_sha="\$\{PAYLOAD_HEAD_SHA\}"/);
  expect(resolveStep.body).toMatch(/if \[ -z "\$\{head_sha\}" \]; then/);
  expect(resolveStep.body).toMatch(/grep -Eq '\^\[0-9a-f\]\{40\}\$'/);
});

test('the transitional in-PR gate stays required until the trusted context is', () => {
  // Remove this pin only together with the branch-protection change that makes
  // the `independent-review` commit status required.
  expect(qualityGatesSource).toContain('run: node scripts/check-independent-review.js');
});

test.each([
  {
    mutationName: 'pull_request_target trigger removal',
    expectedDiagnostic: 'missing the base-resolved pull_request_target trigger.',
    mutate: (source) => replaceSourceOrThrow(source, '\n  pull_request_target:\n', '\n  pull_request:\n', 'trigger'),
  },
  {
    mutationName: 'issue_comment trigger removal',
    expectedDiagnostic: 'missing the issue_comment re-verification trigger.',
    mutate: (source) => replaceSourceOrThrow(source, '\n  issue_comment:\n', '\n  workflow_dispatch:\n', 'comment'),
  },
  {
    mutationName: 'default permission widening',
    expectedDiagnostic: 'missing empty default permissions.',
    mutate: (source) => replaceSourceOrThrow(source, '\npermissions: {}\n', '\npermissions: write-all\n', 'default'),
  },
  {
    mutationName: 'status context rename',
    expectedDiagnostic: 'missing the stable status context.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        `TRUSTED_REVIEW_STATUS_CONTEXT: ${TRUSTED_REVIEW_STATUS_CONTEXT}\n`,
        'TRUSTED_REVIEW_STATUS_CONTEXT: renamed-context\n',
        'context rename',
      ),
  },
  {
    mutationName: 'job permission escalation',
    expectedDiagnostic:
      'grants [contents: write, issues: read, pull-requests: read, statuses: write] instead of ' +
      '[contents: read, issues: read, pull-requests: read, statuses: write].',
    mutate: (source) => replaceSourceOrThrow(source, '      contents: read\n', '      contents: write\n', 'escalate'),
  },
  {
    mutationName: 'appended unconditional success post',
    expectedDiagnostic:
      'declares steps [Resolve pull request head, Seed fail-closed review status, ' +
      'Check out trusted default-branch code, Set up Node.js, Verify independent review marker, ' +
      'Publish trusted review status, Force success] instead of the allowed list.',
    mutate: (source) =>
      appendStep(
        source,
        [
          '      - name: Force success',
          '        env:',
          '          GH_TOKEN: ${{ github.token }}',
          '          HEAD_SHA: ${{ steps.context.outputs.head_sha }}',
          '        run: |',
          '          gh api --method POST "repos/${GITHUB_REPOSITORY}/statuses/${HEAD_SHA}" \\',
          '            --field state=success \\',
          '            --field context="${TRUSTED_REVIEW_STATUS_CONTEXT}"',
        ].join('\n'),
      ),
  },
  {
    mutationName: 'unnamed attacker step',
    expectedDiagnostic:
      'declares steps [Resolve pull request head, Seed fail-closed review status, ' +
      'Check out trusted default-branch code, Set up Node.js, Verify independent review marker, ' +
      'Publish trusted review status, ] instead of the allowed list.',
    mutate: (source) => appendStep(source, '      - run: bash ./attacker.sh'),
  },
  {
    mutationName: 'pull request head fetch inside a run block',
    expectedDiagnostic: 'a run block performs a repository fetch or checkout.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '          node scripts/check-independent-review.js \\',
        '          git fetch origin "pull/${PR_NUMBER}/head" && git checkout FETCH_HEAD\n' +
          '          node scripts/check-independent-review.js \\',
        'head fetch',
      ),
  },
  {
    mutationName: 'dependency installation inside a run block',
    expectedDiagnostic: 'a run block performs a dependency installation.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '          node scripts/check-independent-review.js \\',
        '          npm ci\n          node scripts/check-independent-review.js \\',
        'dependency install',
      ),
  },
  {
    mutationName: 'expression interpolation inside a run block',
    expectedDiagnostic: 'interpolates an expression directly inside a run block.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '          set -uo pipefail\n',
        '          echo "${{ github.event.pull_request.title }}"\n          set -uo pipefail\n',
        'interpolation',
      ),
  },
  {
    mutationName: 'continue-on-error masking a failed verification',
    expectedDiagnostic: 'uses continue-on-error, which can mask a failed verification.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '      - name: Verify independent review marker\n        id: verify\n',
        '      - name: Verify independent review marker\n        id: verify\n        continue-on-error: true\n',
        'continue-on-error',
      ),
  },
  {
    mutationName: 'publishing from conclusion instead of outcome',
    expectedDiagnostic: 'must publish from steps.verify.outcome, never from its conclusion.',
    mutate: (source) =>
      replaceSourceOrThrow(source, 'steps.verify.outcome', 'steps.verify.conclusion', 'conclusion swap'),
  },
  {
    mutationName: 'pull request head checkout',
    expectedDiagnostic:
      'checks out [${{ github.event.pull_request.head.sha }}] instead of the default branch alone.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        'ref: ${{ github.event.repository.default_branch }}',
        'ref: ${{ github.event.pull_request.head.sha }}',
        'head checkout',
      ),
  },
  {
    mutationName: 'persisted checkout credentials',
    expectedDiagnostic: 'keeps checkout credentials persisted.',
    mutate: (source) =>
      replaceSourceOrThrow(source, 'persist-credentials: false', 'persist-credentials: true', 'credentials'),
  },
  {
    mutationName: 'status context changed in only the seed post',
    expectedDiagnostic: 'both status posts must use the shared status context.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '--field context="${TRUSTED_REVIEW_STATUS_CONTEXT}" \\\n            --field description="Trusted verification started',
        '--field context="unwatched-context" \\\n            --field description="Trusted verification started',
        'seed context',
      ),
  },
  {
    mutationName: 'status context changed in only the verdict post',
    expectedDiagnostic: 'both status posts must use the shared status context.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '--field context="${TRUSTED_REVIEW_STATUS_CONTEXT}" \\\n            --field description="${description}"',
        '--field context="unwatched-context" \\\n            --field description="${description}"',
        'verdict context',
      ),
  },
  {
    mutationName: 'fail-closed seed weakened to pending',
    expectedDiagnostic: 'must seed exactly one fail-closed status before verification.',
    mutate: (source) => replaceSourceOrThrow(source, '--field state=failure', '--field state=pending', 'seed state'),
  },
  {
    mutationName: 'conditional verdict publication',
    expectedDiagnostic: 'must publish the verdict unconditionally.',
    mutate: (source) => replaceSourceOrThrow(source, 'if: always() &&', 'if: success() &&', 'conditional publish'),
  },
])('$mutationName fails with the exact boundary diagnostic', ({ expectedDiagnostic, mutate }) => {
  expect(() => assertTrustedReviewBoundary(mutate(trustedWorkflowSource))).toThrow(
    new Error(createDiagnostic(expectedDiagnostic)),
  );
});

test('seeding the fail-closed status after checkout fails with a named diagnostic', () => {
  const steps = parseSteps(trustedWorkflowSource);
  const seedStep = steps.find((step) => step.name === 'Seed fail-closed review status');
  const checkoutStep = steps.find((step) => step.name === 'Check out trusted default-branch code');
  const reorderedSource = trustedWorkflowSource.replace(
    `${seedStep.body}\n${checkoutStep.body}`,
    `${checkoutStep.body}\n${seedStep.body}`,
  );
  expect(reorderedSource).not.toBe(trustedWorkflowSource);

  expect(() => assertTrustedReviewBoundary(reorderedSource)).toThrow(
    new Error(
      createDiagnostic(
        'declares steps [Resolve pull request head, Check out trusted default-branch code, ' +
          'Seed fail-closed review status, Set up Node.js, Verify independent review marker, ' +
          'Publish trusted review status] instead of the allowed list.',
      ),
    ),
  );
});

// Every case here was produced by a red-team pass that beat the previous
// step-only pins: none of them changes a single byte inside `steps:`.
test.each([
  {
    mutationName: 'attacker-controlled job container',
    expectedDiagnostic:
      'declares job keys [name, if, runs-on, timeout-minutes, permissions, container, steps] ' +
      'instead of the allowed list.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '      statuses: write\n\n    steps:',
        '      statuses: write\n\n    container:\n      image: ghcr.io/attacker/ci-base:latest\n\n    steps:',
        'job container',
      ),
  },
  {
    mutationName: 'job-level shell replacement',
    expectedDiagnostic:
      'declares job keys [name, if, runs-on, timeout-minutes, permissions, defaults, steps] ' +
      'instead of the allowed list.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '      statuses: write\n\n    steps:',
        '      statuses: write\n\n    defaults:\n      run:\n        shell: /tmp/attacker-shell {0}\n\n    steps:',
        'shell replacement',
      ),
  },
  {
    mutationName: 'job-level env shadowing the status context',
    expectedDiagnostic:
      'declares job keys [name, if, runs-on, timeout-minutes, permissions, env, steps] ' +
      'instead of the allowed list.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '      statuses: write\n\n    steps:',
        '      statuses: write\n\n    env:\n      TRUSTED_REVIEW_STATUS_CONTEXT: unwatched-context\n\n    steps:',
        'env shadow',
      ),
  },
  {
    mutationName: 'a second job that posts its own status',
    expectedDiagnostic: 'declares jobs [trusted-review, helper] instead of the trusted job alone.',
    mutate: (source) =>
      `${source.replace(/\n+$/, '')}\n\n  helper:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo helper\n`,
  },
  {
    mutationName: 'workflow-level defaults above the job',
    expectedDiagnostic:
      'declares top-level keys [name, on, permissions, concurrency, env, defaults, jobs] ' +
      'instead of the allowed list.',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '\njobs:\n',
        '\ndefaults:\n  run:\n    shell: /tmp/attacker-shell {0}\n\njobs:\n',
        'workflow defaults',
      ),
  },
])('$mutationName fails with the exact boundary diagnostic', ({ expectedDiagnostic, mutate }) => {
  expect(() => assertTrustedReviewBoundary(mutate(trustedWorkflowSource))).toThrow(
    new Error(createDiagnostic(expectedDiagnostic)),
  );
});

test.each([
  {
    mutationName: 'moving the trusted job onto a self-hosted runner',
    mutate: (source) =>
      replaceSourceOrThrow(source, '    runs-on: ubuntu-latest\n', '    runs-on: self-hosted\n', 'runner swap'),
  },
  {
    mutationName: 'widening the job condition to every event',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        "    if: github.event_name == 'pull_request_target' || github.event.issue.pull_request != null\n",
        '    if: always()\n',
        'condition widening',
      ),
  },
  {
    // Quoting hides the key from the enumeration regex; the digest does not care.
    mutationName: 'quoted container key evading the job key enumeration',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '      statuses: write\n\n    steps:',
        "      statuses: write\n\n    'container':\n      image: ghcr.io/attacker/ci-base:latest\n\n    steps:",
        'quoted container',
      ),
  },
])('$mutationName is caught by the job header digest', ({ mutate }) => {
  expect(() => assertTrustedReviewBoundary(mutate(trustedWorkflowSource))).toThrow(
    /the trusted job header changed \(digest [0-9a-f]{16}/,
  );
});

test.each([
  {
    mutationName: 'silencing the run for the gated pull request with a paths filter',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '  pull_request_target:\n    types:\n',
        "  pull_request_target:\n    paths-ignore:\n      - '**'\n    types:\n",
        'paths filter',
      ),
  },
  {
    mutationName: 'redirecting the API through a workflow-level env entry',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '\n  TRUSTED_REVIEW_STATUS_CONTEXT: independent-review\n',
        '\n  TRUSTED_REVIEW_STATUS_CONTEXT: independent-review\n  GH_HOST: attacker.example\n',
        'env redirect',
      ),
  },
  {
    mutationName: 'injecting NODE_OPTIONS to preload code into the checker',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '\n  TRUSTED_REVIEW_STATUS_CONTEXT: independent-review\n',
        '\n  TRUSTED_REVIEW_STATUS_CONTEXT: independent-review\n  NODE_OPTIONS: --require /tmp/preload.js\n',
        'node options',
      ),
  },
  {
    mutationName: 'disabling concurrency cancellation semantics',
    mutate: (source) =>
      replaceSourceOrThrow(source, '  cancel-in-progress: true\n', '  cancel-in-progress: false\n', 'concurrency'),
  },
  {
    // The vector that defeated the previous pins: Prettier's canonical quoting
    // hides the key from a line regex, and the region above `on:` was digested
    // by nothing. Both halves are now closed by the whole-file digest.
    mutationName: 'quoted defaults key above the on: block replacing the shell',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '\non:\n',
        "\n'defaults':\n  run:\n    shell: /tmp/attacker-shell {0}\n\non:\n",
        'quoted defaults above on',
      ),
  },
  {
    mutationName: 'quoted defaults key silencing every run step',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '\non:\n',
        "\n'defaults':\n  run:\n    shell: cat {0}\n\non:\n",
        'quoted defaults no-op shell',
      ),
  },
  {
    mutationName: 'rewriting the header comment that records what the gate does not cover',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '# What this does NOT cover, measured in PR #120: the commit-status namespace is',
        '# This gate is complete and needs no further work: the commit-status namespace is',
        'comment rewrite',
      ),
  },
  {
    mutationName: 'an inert probe key above the on: block',
    mutate: (source) => replaceSourceOrThrow(source, '\non:\n', "\n'run-name': probe\n\non:\n", 'inert probe'),
  },
])('$mutationName is caught by the whole-file digest', ({ mutate }) => {
  expect(() => assertTrustedReviewBoundary(mutate(trustedWorkflowSource))).toThrow(
    /the workflow file changed \(digest [0-9a-f]{16}/,
  );
});

test.each([
  {
    mutationName: 'overwriting the checker before running it',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '          node scripts/check-independent-review.js \\',
        "          printf 'process.exitCode = 0;' >scripts/check-independent-review.js\n" +
          '          node scripts/check-independent-review.js \\',
        'checker overwrite',
      ),
  },
  {
    mutationName: 'verifying a different head than the one the status targets',
    mutate: (source) =>
      replaceSourceOrThrow(source, '--head "${HEAD_SHA}"', '--head "${GITHUB_SHA}"', 'head swap'),
  },
  {
    mutationName: 'checking out the trusted code into a discarded path',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '          persist-credentials: false',
        '          persist-credentials: false\n          path: discarded',
        'checkout path',
      ),
  },
  {
    mutationName: 'reading the reviewer identity from a pull request controlled source',
    mutate: (source) =>
      replaceSourceOrThrow(
        source,
        '          INDEPENDENT_REVIEW_REVIEWER_SESSION_ID: ${{ vars.INDEPENDENT_REVIEW_REVIEWER_SESSION_ID }}',
        '          INDEPENDENT_REVIEW_REVIEWER_SESSION_ID: ${{ github.event.pull_request.body }}',
        'reviewer source',
      ),
  },
])('$mutationName is caught by the step digest even though no named rule describes it', ({ mutate }) => {
  expect(() => assertTrustedReviewBoundary(mutate(trustedWorkflowSource))).toThrow(/changed \(digest [0-9a-f]{16}/);
});

test('mutation fixtures fail closed when their source target drifts', () => {
  expect(() =>
    replaceSourceOrThrow(trustedWorkflowSource, 'text that is deliberately absent', 'x', 'missing sentinel'),
  ).toThrow('Mutation fixture "missing sentinel" did not alter its source.');
});
