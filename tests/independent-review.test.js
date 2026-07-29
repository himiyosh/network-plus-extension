const fs = require('fs');
const path = require('path');
const fixtures = require('./fixtures/independent-review-cases.json');

const loadChecker = () => require('../scripts/check-independent-review');

const evaluateComments = (comments) => {
  const { evaluateIndependentReview } = loadChecker();
  return evaluateIndependentReview({
    comments,
    commits: fixtures.commits,
    headSha: fixtures.headSha,
  });
};

const createResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const createApiFetch = ({ comments = fixtures.comments.valid, commits = fixtures.commits, failures = {} } = {}) =>
  jest.fn(async (url) => {
    if (url.includes('/comments')) {
      return failures.comments ?? createResponse(comments);
    }
    if (url.includes('/commits')) {
      return failures.commits ?? createResponse(commits);
    }
    throw new Error(`Unexpected API URL: ${url}`);
  });

describe('independent-review marker evaluation', () => {
  test.each([
    ['missing by=', 'missingBy', 'malformedMarkers'],
    ['malformed non-UUID by=', 'malformedBy', 'malformedMarkers'],
    ['stale head', 'staleHead', 'staleHeadMarkers'],
    ['wrong verdict', 'wrongVerdict', 'wrongVerdictMarkers'],
    ['implementation-session self review', 'selfReview', 'selfReviewMarkers'],
  ])('fails closed for %s', (_, fixtureName, diagnosticName) => {
    const result = evaluateComments(fixtures.comments[fixtureName]);

    expect(result).toMatchObject({
      ok: false,
      code: 'NO_VALID_MARKER',
      diagnostics: {
        [diagnosticName]: 1,
      },
    });
  });

  test('passes an exact-head marker with a well-formed independent UUID', () => {
    expect(evaluateComments(fixtures.comments.valid)).toMatchObject({
      ok: true,
      code: 'VALID_MARKER',
      reviewerId: fixtures.reviewerUuid,
    });
  });

  test('passes multiple comments only when one marker is valid for the exact head', () => {
    const result = evaluateComments(fixtures.comments.multiple);

    expect(result).toMatchObject({
      ok: true,
      code: 'VALID_MARKER',
      reviewerId: fixtures.reviewerUuid,
      diagnostics: {
        malformedMarkers: 1,
        staleHeadMarkers: 1,
      },
    });
  });

  test('collects every unique Copilot-Session trailer across PR commits', () => {
    const { extractCopilotSessionIds } = loadChecker();

    expect([...extractCopilotSessionIds(fixtures.commits)].sort()).toEqual(
      [...fixtures.implementationSessionUuids].sort(),
    );
  });
});

describe('GitHub API handling', () => {
  const request = {
    repository: 'himiyosh/network-plus-extension',
    prNumber: 86,
    headSha: fixtures.headSha,
    token: 'test-token-value',
  };

  test('reads issue comments and PR commits without exposing the token', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const fetchImpl = createApiFetch();

    await expect(runIndependentReviewCheck({ ...request, fetchImpl })).resolves.toMatchObject({
      ok: true,
      reviewerId: fixtures.reviewerUuid,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.headers.Authorization).toBe(`Bearer ${request.token}`);
    }
  });

  test.each([
    ['issue comments', 'comments', '/comments'],
    ['PR commits', 'commits', '/commits'],
  ])('fails closed when the %s API request fails', async (label, endpoint, pathFragment) => {
    const { runIndependentReviewCheck } = loadChecker();
    const fetchImpl = createApiFetch({
      failures: {
        [endpoint]: createResponse({ message: 'sensitive response body' }, 503),
      },
    });

    const error = await runIndependentReviewCheck({ ...request, fetchImpl }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(label);
    expect(error.message).toContain('status 503');
    expect(error.message).not.toContain(request.token);
    expect(error.message).not.toContain('sensitive response body');
    expect(fetchImpl.mock.calls.some(([url]) => url.includes(pathFragment))).toBe(true);
  });

  test('fails closed on malformed issue-comment API data', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const fetchImpl = createApiFetch({ comments: { body: 'not-an-array' } });

    await expect(runIndependentReviewCheck({ ...request, fetchImpl })).rejects.toThrow(
      'issue comments response must be an array',
    );
  });

  test('fails closed on malformed PR-commit API data', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const fetchImpl = createApiFetch({ commits: [{ commit: {} }] });

    await expect(runIndependentReviewCheck({ ...request, fetchImpl })).rejects.toThrow(
      'PR commit entry 1 is missing commit.message',
    );
  });
});

describe('review context resolution', () => {
  test('accepts an explicit repository, PR number, and head', () => {
    const { resolveReviewContext } = loadChecker();

    expect(
      resolveReviewContext({
        argv: ['--repository', 'himiyosh/network-plus-extension', '--pr', '86', '--head', fixtures.headSha],
        env: {},
      }),
    ).toEqual({
      shouldGate: true,
      repository: 'himiyosh/network-plus-extension',
      prNumber: 86,
      headSha: fixtures.headSha,
    });
  });

  test('resolves the current PR from the GitHub event payload', () => {
    const { resolveReviewContext } = loadChecker();
    const event = {
      repository: { full_name: 'himiyosh/network-plus-extension' },
      pull_request: {
        number: 86,
        head: { sha: fixtures.headSha },
      },
    };

    expect(
      resolveReviewContext({
        argv: [],
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: '/tmp/event.json',
        },
        readFile: () => JSON.stringify(event),
      }),
    ).toEqual({
      shouldGate: true,
      repository: 'himiyosh/network-plus-extension',
      prNumber: 86,
      headSha: fixtures.headSha,
    });
  });

  test('skips safely when no pull request is being gated', () => {
    const { resolveReviewContext } = loadChecker();

    expect(
      resolveReviewContext({
        argv: [],
        env: {
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REPOSITORY: 'himiyosh/network-plus-extension',
        },
      }),
    ).toEqual({ shouldGate: false });
  });

  test('fails closed when a pull_request event lacks exact-head metadata', () => {
    const { resolveReviewContext } = loadChecker();

    expect(() =>
      resolveReviewContext({
        argv: [],
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: '/tmp/event.json',
        },
        readFile: () => JSON.stringify({ pull_request: { number: 86 } }),
      }),
    ).toThrow('pull request review context is incomplete');
  });
});

describe('required workflow integration', () => {
  test('keeps the marker gate last in the existing Node 22.x and Node 24.x matrix jobs', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'quality-gates.yml'), 'utf8');
    const contractStep = workflow.indexOf('- name: Check coordinator contract');
    const reviewStep = workflow.indexOf('- name: Check independent review marker');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('          - 22.x');
    expect(workflow).toContain('          - 24.x');
    expect(workflow).not.toContain('paths-ignore:');
    expect(contractStep).toBeGreaterThan(-1);
    expect(reviewStep).toBeGreaterThan(contractStep);
    expect(workflow).toContain('issues: read');
    expect(workflow).toContain('pull-requests: read');
    expect(workflow.slice(reviewStep).trim()).toMatch(/run: node scripts\/check-independent-review\.js$/);
  });
});
