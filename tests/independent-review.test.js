const fs = require('fs');
const path = require('path');
const fixtures = require('./fixtures/independent-review-cases.json');

const loadChecker = () => require('../scripts/check-independent-review');

const reviewConfiguration = {
  reviewerSessionId: fixtures.reviewerUuid,
  mergerSessionId: fixtures.mergerUuid,
};

const evaluateComments = (comments, commits = fixtures.commits, configuration = reviewConfiguration) => {
  const { evaluateIndependentReview } = loadChecker();
  return evaluateIndependentReview({
    comments,
    commits,
    headSha: fixtures.headSha,
    ...configuration,
  });
};

const createResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const createCommitCollection = (count) => {
  if (count < fixtures.commits.length) {
    throw new Error('commit collection fixture must retain the implementation commits');
  }

  return [
    ...fixtures.commits,
    ...Array.from({ length: count - fixtures.commits.length }, () => fixtures.humanOnlyCommit),
  ];
};

const paginate = (url, items) => {
  if (!Array.isArray(items)) {
    return items;
  }

  const parsedUrl = new URL(url);
  const perPage = Number(parsedUrl.searchParams.get('per_page'));
  const page = Number(parsedUrl.searchParams.get('page'));
  return items.slice((page - 1) * perPage, page * perPage);
};

const createApiFetch = ({
  comments = fixtures.comments.valid,
  commits = fixtures.commits,
  metadata = { commits: commits.length },
  metadataSequence,
  failures = {},
} = {}) => {
  let metadataRequestIndex = 0;

  return jest.fn(async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/comments')) {
      return failures.comments ?? createResponse(paginate(url, comments));
    }
    if (pathname.endsWith('/commits')) {
      return failures.commits ?? createResponse(paginate(url, commits));
    }
    if (/\/pulls\/\d+$/.test(pathname)) {
      const currentMetadata =
        metadataSequence && metadataRequestIndex < metadataSequence.length
          ? metadataSequence[metadataRequestIndex]
          : metadata;
      metadataRequestIndex += 1;
      return failures.metadata ?? createResponse(currentMetadata);
    }
    throw new Error(`Unexpected API URL: ${url}`);
  });
};

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

  test('passes an exact-head OWNER marker with a well-formed independent UUID', () => {
    expect(evaluateComments(fixtures.comments.valid)).toMatchObject({
      ok: true,
      code: 'VALID_MARKER',
      reviewerId: fixtures.reviewerUuid,
      commentIndex: 1,
      diagnostics: {
        implementationSessionIds: 2,
        unauthorizedMarkers: 0,
      },
    });
  });

  test('rejects an exact-head OWNER marker from a reviewer other than the configured reviewer', () => {
    expect(evaluateComments(fixtures.comments.wrongReviewer)).toMatchObject({
      ok: false,
      code: 'NO_VALID_MARKER',
      diagnostics: {
        implementationSessionIds: 2,
        wrongReviewerMarkers: 1,
      },
    });
  });

  test.each([
    ['missing reviewer', { reviewerSessionId: undefined, mergerSessionId: fixtures.mergerUuid }],
    ['missing merger', { reviewerSessionId: fixtures.reviewerUuid, mergerSessionId: undefined }],
    ['malformed reviewer', { reviewerSessionId: 'not-a-uuid', mergerSessionId: fixtures.mergerUuid }],
    [
      'non-lowercase reviewer',
      { reviewerSessionId: 'A3db7911-b380-48b0-a8c3-214d848815e2', mergerSessionId: fixtures.mergerUuid },
    ],
    ['malformed merger', { reviewerSessionId: fixtures.reviewerUuid, mergerSessionId: 'not-a-uuid' }],
    ['equal reviewer and merger', { reviewerSessionId: fixtures.reviewerUuid, mergerSessionId: fixtures.reviewerUuid }],
  ])('fails closed for %s configuration', (_, configuration) => {
    expect(() => evaluateComments(fixtures.comments.valid, fixtures.commits, configuration)).toThrow(
      /independent-review (reviewer|merger) session configuration/,
    );
  });

  test('passes multiple comments only when one marker is valid for the exact head', () => {
    const result = evaluateComments(fixtures.comments.multiple);

    expect(result).toMatchObject({
      ok: true,
      code: 'VALID_MARKER',
      reviewerId: fixtures.reviewerUuid,
      diagnostics: {
        implementationSessionIds: 2,
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

  test('extracts an exact escaped-newline Copilot-Session trailer', () => {
    const { extractCopilotSessionIds } = loadChecker();

    expect([...extractCopilotSessionIds([fixtures.escapedCommit])]).toEqual([fixtures.escapedSessionUuid]);
  });

  test('preserves actual-newline trailers and human-only commits in a mixed PR', () => {
    const { extractCopilotSessionIds } = loadChecker();
    const commits = [fixtures.commits[0], fixtures.humanOnlyCommit, fixtures.escapedCommit];

    expect([...extractCopilotSessionIds(commits)].sort()).toEqual(
      [fixtures.implementationSessionUuids[0], fixtures.escapedSessionUuid].sort(),
    );
  });

  test.each([
    ['missing', 'copilotWithoutSessionCommit'],
    ['malformed', 'copilotMalformedSessionCommit'],
  ])('fails a Copilot-coauthored commit with a %s session trailer', (_, fixtureName) => {
    const { extractCopilotSessionIds } = loadChecker();

    expect(() => extractCopilotSessionIds([fixtures[fixtureName]])).toThrow(
      /PR commit entry 1.*implementationSessionIds=0/,
    );
  });

  test('fails a Copilot-authored PR when zero session IDs can be extracted', () => {
    expect(() => evaluateComments(fixtures.comments.valid, [fixtures.copilotWithoutSessionCommit])).toThrow(
      /implementationSessionIds=0/,
    );
  });

  test('fails closed when no implementation session attribution can be established', () => {
    expect(() => evaluateComments(fixtures.comments.valid, [fixtures.humanOnlyCommit])).toThrow(
      /implementationSessionIds=0/,
    );
  });

  test.each([
    ['fenced code block', 'fencedMarker'],
    ['instructional text', 'instructionalMarker'],
  ])('rejects a conforming marker embedded in %s', (_, fixtureName) => {
    expect(evaluateComments(fixtures.comments[fixtureName])).toMatchObject({
      ok: false,
      code: 'NO_VALID_MARKER',
      diagnostics: {
        implementationSessionIds: 2,
        misplacedMarkers: 1,
      },
    });
  });

  test.each([
    ['CONTRIBUTOR', 'contributorMarker'],
    ['NONE', 'noneMarker'],
  ])('rejects an exact marker from a %s comment', (_, fixtureName) => {
    expect(evaluateComments(fixtures.comments[fixtureName])).toMatchObject({
      ok: false,
      code: 'NO_VALID_MARKER',
      diagnostics: {
        implementationSessionIds: 2,
        unauthorizedMarkers: 1,
      },
    });
  });

  test('fails closed when a comment is missing author_association', () => {
    expect(() => evaluateComments(fixtures.comments.missingAssociation)).toThrow(
      'issue comment entry 1 is missing author_association',
    );
  });

  test('passes mixed comments only through the exact OWNER marker', () => {
    expect(evaluateComments(fixtures.comments.mixedAuthority)).toMatchObject({
      ok: true,
      code: 'VALID_MARKER',
      reviewerId: fixtures.reviewerUuid,
      commentIndex: 2,
      diagnostics: {
        implementationSessionIds: 2,
        unauthorizedMarkers: 1,
      },
    });
  });

  test('rejects injected commit content instead of formatting it as diagnostics', () => {
    const { formatDiagnostics } = loadChecker();
    const result = evaluateComments(fixtures.comments.valid);
    const unsafeCommitMessage = fixtures.copilotWithoutSessionCommit.commit.message;

    expect(() =>
      formatDiagnostics({
        ...result.diagnostics,
        implementationSessionIds: unsafeCommitMessage,
      }),
    ).toThrow(/diagnostics.*implementationSessionIds/);
  });
});

describe('GitHub API handling', () => {
  const request = {
    repository: 'himiyosh/network-plus-extension',
    prNumber: 86,
    headSha: fixtures.headSha,
    token: 'test-token-value',
    ...reviewConfiguration,
  };

  test('reads PR metadata, issue comments, and PR commits without exposing the token', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const fetchImpl = createApiFetch();

    await expect(runIndependentReviewCheck({ ...request, fetchImpl })).resolves.toMatchObject({
      ok: true,
      reviewerId: fixtures.reviewerUuid,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.some(([url]) => /\/pulls\/86$/.test(new URL(url).pathname))).toBe(true);
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.headers.Authorization).toBe(`Bearer ${request.token}`);
    }
  });

  test.each([
    ['pull request metadata', 'metadata', '/pulls/86'],
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

  test.each([
    ['below the ceiling', fixtures.commitCollectionLimits.below],
    ['at the ceiling', fixtures.commitCollectionLimits.supported],
  ])('accepts a complete commit collection %s', async (_, commitCount) => {
    const { runIndependentReviewCheck } = loadChecker();
    const commits = createCommitCollection(commitCount);
    const fetchImpl = createApiFetch({
      commits,
      metadata: { commits: commitCount },
    });

    await expect(runIndependentReviewCheck({ ...request, fetchImpl })).resolves.toMatchObject({
      ok: true,
      code: 'VALID_MARKER',
      reviewerId: fixtures.reviewerUuid,
      diagnostics: {
        implementationSessionIds: 2,
      },
    });

    const requestedPaths = fetchImpl.mock.calls.map(([url]) => new URL(url).pathname);
    expect(requestedPaths.filter((pathname) => pathname.endsWith('/commits'))).toHaveLength(3);
    expect(requestedPaths.filter((pathname) => /\/pulls\/86$/.test(pathname))).toHaveLength(2);
  });

  test('fails closed when exactly-250 metadata changes during commit collection', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const initialCount = fixtures.commitCollectionLimits.supported;
    const changedCount = fixtures.commitCollectionLimits.above;
    const fetchImpl = createApiFetch({
      comments: [{ body: null, author_association: 'OWNER' }],
      commits: createCommitCollection(initialCount),
      metadataSequence: [{ commits: initialCount }, { commits: changedCount }],
    });

    const error = await runIndependentReviewCheck({ ...request, fetchImpl }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(`initialTotalCommits=${initialCount}`);
    expect(error.message).toContain(`finalTotalCommits=${changedCount}`);
    expect(error.message).not.toContain('issue comment entry');
    expect(error.message).not.toContain(request.token);
    const requestedPaths = fetchImpl.mock.calls.map(([url]) => new URL(url).pathname);
    expect(requestedPaths.filter((pathname) => /\/pulls\/86$/.test(pathname))).toHaveLength(2);
  });

  test('fails before collection or marker evaluation above GitHub’s 250-commit ceiling', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const fetchImpl = createApiFetch({
      commits: createCommitCollection(fixtures.commitCollectionLimits.supported),
      metadata: { commits: fixtures.commitCollectionLimits.above },
    });

    const error = await runIndependentReviewCheck({ ...request, fetchImpl }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('totalCommits=251');
    expect(error.message).toContain('supportedLimit=250');
    expect(error.message).toContain('split the pull request');
    expect(error.message).not.toContain(request.token);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('fails on a metadata/API count mismatch before marker evaluation', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const metadataCount = fixtures.commitCollectionLimits.below;
    const collectedCount = metadataCount - 1;
    const fetchImpl = createApiFetch({
      comments: [{ body: null, author_association: 'OWNER' }],
      commits: createCommitCollection(collectedCount),
      metadata: { commits: metadataCount },
    });

    const error = await runIndependentReviewCheck({ ...request, fetchImpl }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(`totalCommits=${metadataCount}`);
    expect(error.message).toContain(`collectedCommits=${collectedCount}`);
    expect(error.message).not.toContain('issue comment entry');
    expect(error.message).not.toContain(request.token);
  });

  test.each([
    ['missing', {}],
    ['null', null],
    ['array', []],
    ['string', { commits: '2' }],
    ['fractional', { commits: 2.5 }],
    ['negative', { commits: -1 }],
  ])('fails closed on %s pull request commit-count metadata', async (_, metadata) => {
    const { runIndependentReviewCheck } = loadChecker();
    const fetchImpl = createApiFetch({ metadata });

    const error = await runIndependentReviewCheck({ ...request, fetchImpl }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('pull request metadata has an invalid commits count');
    expect(error.message).not.toContain(request.token);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('fails closed on malformed issue-comment API data', async () => {
    const { runIndependentReviewCheck } = loadChecker();
    const unsafeCommentBody = 'Copilot App unsafe comment body';
    const fetchImpl = createApiFetch({
      comments: [{ body: { unsafeCommentBody }, author_association: 'OWNER' }],
    });

    const error = await runIndependentReviewCheck({ ...request, fetchImpl }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('issue comment entry 1 is missing body');
    expect(error.message).not.toContain(unsafeCommentBody);
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
  test('keeps the marker gate out of the required Node 22.x and Node 24.x matrix jobs', () => {
    // The marker gate is owned solely by the trusted workflow, which publishes
    // the advisory `independent-review` commit status. Required CI must not run
    // the checker, because that would reimpose as a blocking step exactly what
    // branch protection deliberately stopped requiring.
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'quality-gates.yml'), 'utf8');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('          - 22.x');
    expect(workflow).toContain('          - 24.x');
    expect(workflow).not.toContain('paths-ignore:');
    expect(workflow.indexOf('- name: Check coordinator contract')).toBeGreaterThan(-1);
    expect(workflow).not.toContain('- name: Check independent review marker');
    expect(workflow).not.toContain('scripts/check-independent-review.js');
    expect(workflow).not.toContain('INDEPENDENT_REVIEW_REVIEWER_SESSION_ID');
    expect(workflow).not.toContain('INDEPENDENT_REVIEW_MERGER_SESSION_ID');

    // The permissions the removed step needed must go with it.
    expect(workflow).not.toContain('issues: read');
    expect(workflow).not.toContain('pull-requests: read');

    const trustedWorkflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'trusted-independent-review.yml'),
      'utf8',
    );
    expect(trustedWorkflow).toContain('scripts/check-independent-review.js');
  });

  test('documents split-PR recovery for the 250-commit API ceiling', () => {
    const readRepositoryFile = (filePath) => fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    const topology = readRepositoryFile('docs/coordinator-topology.md');
    const readme = readRepositoryFile('README.md');

    expect(topology).toMatch(/250[\s\S]*分割/);
    expect(readme).toMatch(/250[\s\S]*split/i);
  });
});
