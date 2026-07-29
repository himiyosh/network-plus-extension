'use strict';

const fs = require('fs');

const MARKER_PREFIX = 'independent-review';
const MARKER_PATTERN = /^independent-review head=(\S+) verdict=(\S+) by=(\S+)$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const UUID_SOURCE = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, 'i');
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TRAILER_PREFIX_SOURCE = '(?:^|\\r?\\n|\\\\n)';
const TRAILER_SUFFIX_SOURCE = '(?=$|\\r?\\n|\\\\n)';
const COPILOT_SESSION_PATTERN = new RegExp(
  `${TRAILER_PREFIX_SOURCE}Copilot-Session:[ \\t]*(${UUID_SOURCE})[ \\t]*${TRAILER_SUFFIX_SOURCE}`,
  'gi',
);
const COPILOT_COAUTHOR_PATTERN = new RegExp(
  `${TRAILER_PREFIX_SOURCE}Co-authored-by:[ \\t]*Copilot App <223556219\\+Copilot@users\\.noreply\\.github\\.com>[ \\t]*${TRAILER_SUFFIX_SOURCE}`,
  'i',
);
const FENCE_OPEN_PATTERN = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_PATTERN = /^\s*(`{3,}|~{3,})\s*$/;
const DEFAULT_API_URL = 'https://api.github.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const PULL_REQUEST_EVENTS = new Set(['pull_request', 'pull_request_target']);

const parseCliArgs = (argv) => {
  const supported = new Set(['--repository', '--pr', '--head']);
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!supported.has(flag)) {
      throw new Error(`unsupported argument: ${flag}`);
    }
    if (Object.hasOwn(values, flag)) {
      throw new Error(`duplicate argument: ${flag}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }

    values[flag] = value;
    index += 1;
  }

  return {
    repository: values['--repository'],
    prNumber: values['--pr'],
    headSha: values['--head'],
  };
};

const readEventPayload = (eventPath, readFile) => {
  if (!eventPath) {
    return null;
  }

  let raw;
  try {
    raw = readFile(eventPath, 'utf8');
  } catch {
    throw new Error('GitHub event payload could not be read');
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new Error('GitHub event payload is malformed');
  }
};

const normalizeReviewContext = ({ repository, prNumber, headSha }) => {
  if (repository === undefined || prNumber === undefined || headSha === undefined) {
    throw new Error('pull request review context is incomplete');
  }
  if (typeof repository !== 'string' || !REPOSITORY_PATTERN.test(repository)) {
    throw new Error('repository must use the owner/repository form');
  }

  const parsedPrNumber = Number(prNumber);
  if (!Number.isSafeInteger(parsedPrNumber) || parsedPrNumber <= 0) {
    throw new Error('PR number must be a positive integer');
  }
  if (typeof headSha !== 'string' || !SHA_PATTERN.test(headSha)) {
    throw new Error('head must be a full 40-character Git SHA');
  }

  return {
    shouldGate: true,
    repository,
    prNumber: parsedPrNumber,
    headSha: headSha.toLowerCase(),
  };
};

const resolveReviewContext = ({ argv = [], env = process.env, readFile = fs.readFileSync } = {}) => {
  const explicit = parseCliArgs(argv);
  const explicitValues = Object.values(explicit).filter((value) => value !== undefined);

  if (explicitValues.length === 3) {
    return normalizeReviewContext(explicit);
  }

  const eventName = env.GITHUB_EVENT_NAME ?? '';
  if (explicitValues.length === 0 && eventName && !PULL_REQUEST_EVENTS.has(eventName)) {
    return { shouldGate: false };
  }

  const event = readEventPayload(env.GITHUB_EVENT_PATH, readFile);
  const eventPullRequest = event?.pull_request;
  const shouldGate = explicitValues.length > 0 || PULL_REQUEST_EVENTS.has(eventName) || Boolean(eventPullRequest);
  if (!shouldGate) {
    return { shouldGate: false };
  }

  return normalizeReviewContext({
    repository: explicit.repository ?? event?.repository?.full_name ?? env.GITHUB_REPOSITORY,
    prNumber: explicit.prNumber ?? eventPullRequest?.number,
    headSha: explicit.headSha ?? eventPullRequest?.head?.sha,
  });
};

const parseMarkerLine = (line) => {
  if (typeof line !== 'string' || !line.startsWith(MARKER_PREFIX)) {
    return { kind: 'not-marker' };
  }

  const match = line.match(MARKER_PATTERN);
  if (!match || !SHA_PATTERN.test(match[1]) || !UUID_PATTERN.test(match[3])) {
    return { kind: 'malformed' };
  }

  return {
    kind: 'marker',
    headSha: match[1].toLowerCase(),
    verdict: match[2],
    reviewerId: match[3].toLowerCase(),
  };
};

const validateComments = (comments) => {
  if (!Array.isArray(comments)) {
    throw new Error('issue comments response must be an array');
  }

  for (const [index, comment] of comments.entries()) {
    if (!comment || typeof comment !== 'object' || typeof comment.body !== 'string') {
      throw new Error(`issue comment entry ${index + 1} is missing body`);
    }
  }
};

const extractCopilotSessionIds = (commits) => {
  if (!Array.isArray(commits)) {
    throw new Error('PR commits response must be an array');
  }

  const sessionIds = new Set();
  for (const [index, entry] of commits.entries()) {
    const message = entry?.commit?.message;
    if (typeof message !== 'string') {
      throw new Error(`PR commit entry ${index + 1} is missing commit.message`);
    }

    const commitSessionIds = new Set();
    for (const match of message.matchAll(new RegExp(COPILOT_SESSION_PATTERN))) {
      commitSessionIds.add(match[1].toLowerCase());
    }

    if (COPILOT_COAUTHOR_PATTERN.test(message) && commitSessionIds.size === 0) {
      throw new Error(
        `PR commit entry ${index + 1} is Copilot-coauthored but has no parseable Copilot-Session UUID (implementationSessionIds=0)`,
      );
    }

    for (const sessionId of commitSessionIds) {
      sessionIds.add(sessionId);
    }
  }

  return sessionIds;
};

const createDiagnostics = (implementationSessionIds) => ({
  implementationSessionIds,
  markerLines: 0,
  malformedMarkers: 0,
  staleHeadMarkers: 0,
  wrongVerdictMarkers: 0,
  selfReviewMarkers: 0,
  misplacedMarkers: 0,
});

const inspectCommentMarker = (body) => {
  let fence = null;
  let firstUnfencedLine = null;
  let misplacedMarkers = 0;

  for (const line of body.split(/\r?\n/)) {
    if (fence) {
      if (parseMarkerLine(line).kind !== 'not-marker') {
        misplacedMarkers += 1;
      }

      const close = line.match(FENCE_CLOSE_PATTERN);
      if (close && close[1][0] === fence.character && close[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    const open = line.match(FENCE_OPEN_PATTERN);
    if (open) {
      fence = {
        character: open[1][0],
        length: open[1].length,
      };
      continue;
    }

    if (firstUnfencedLine === null && line.trim() !== '') {
      firstUnfencedLine = line;
      continue;
    }

    if (parseMarkerLine(line).kind !== 'not-marker') {
      misplacedMarkers += 1;
    }
  }

  return {
    marker: parseMarkerLine(firstUnfencedLine),
    misplacedMarkers,
  };
};

const evaluateIndependentReview = ({ comments, commits, headSha }) => {
  if (typeof headSha !== 'string' || !SHA_PATTERN.test(headSha)) {
    throw new Error('head must be a full 40-character Git SHA');
  }

  validateComments(comments);
  const implementationSessionIds = extractCopilotSessionIds(commits);
  const expectedHead = headSha.toLowerCase();
  const diagnostics = createDiagnostics(implementationSessionIds.size);
  let validMarker = null;

  for (const [commentIndex, comment] of comments.entries()) {
    const inspection = inspectCommentMarker(comment.body);
    const marker = inspection.marker;
    diagnostics.misplacedMarkers += inspection.misplacedMarkers;
    if (marker.kind === 'not-marker') {
      continue;
    }

    diagnostics.markerLines += 1;
    if (marker.kind === 'malformed') {
      diagnostics.malformedMarkers += 1;
    } else if (marker.headSha !== expectedHead) {
      diagnostics.staleHeadMarkers += 1;
    } else if (marker.verdict !== 'pass') {
      diagnostics.wrongVerdictMarkers += 1;
    } else if (implementationSessionIds.has(marker.reviewerId)) {
      diagnostics.selfReviewMarkers += 1;
    } else if (validMarker === null) {
      validMarker = {
        reviewerId: marker.reviewerId,
        commentIndex: commentIndex + 1,
      };
    }
  }

  if (validMarker) {
    return {
      ok: true,
      code: 'VALID_MARKER',
      reviewerId: validMarker.reviewerId,
      commentIndex: validMarker.commentIndex,
      diagnostics,
    };
  }

  return {
    ok: false,
    code: 'NO_VALID_MARKER',
    diagnostics,
  };
};

const fetchGitHubCollection = async ({ apiUrl, repository, endpoint, label, token, fetchImpl }) => {
  const items = [];
  const [owner, repo] = repository.split('/').map(encodeURIComponent);
  const baseUrl = apiUrl.replace(/\/+$/, '');

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${baseUrl}/repos/${owner}/${repo}/${endpoint}?per_page=${PAGE_SIZE}&page=${page}`;

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch {
      throw new Error(`${label} API request failed`);
    }

    if (!response || typeof response.ok !== 'boolean' || typeof response.status !== 'number') {
      throw new Error(`${label} API returned malformed response metadata`);
    }
    if (!response.ok) {
      throw new Error(`${label} API request failed with status ${response.status}`);
    }

    let pageItems;
    try {
      pageItems = await response.json();
    } catch {
      throw new Error(`${label} API returned malformed JSON`);
    }
    if (!Array.isArray(pageItems)) {
      throw new Error(`${label} response must be an array`);
    }

    items.push(...pageItems);
    if (pageItems.length < PAGE_SIZE) {
      return items;
    }
  }

  throw new Error(`${label} API exceeded the pagination limit`);
};

const runIndependentReviewCheck = async ({
  repository,
  prNumber,
  headSha,
  token,
  apiUrl = DEFAULT_API_URL,
  fetchImpl = globalThis.fetch,
}) => {
  const context = normalizeReviewContext({ repository, prNumber, headSha });
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('GITHUB_TOKEN is required for pull request review checks');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API is unavailable');
  }

  const comments = await fetchGitHubCollection({
    apiUrl,
    repository: context.repository,
    endpoint: `issues/${context.prNumber}/comments`,
    label: 'issue comments',
    token,
    fetchImpl,
  });
  const commits = await fetchGitHubCollection({
    apiUrl,
    repository: context.repository,
    endpoint: `pulls/${context.prNumber}/commits`,
    label: 'PR commits',
    token,
    fetchImpl,
  });

  return evaluateIndependentReview({
    comments,
    commits,
    headSha: context.headSha,
  });
};

const formatDiagnostics = (diagnostics) =>
  [
    `implementationSessionIds=${diagnostics.implementationSessionIds}`,
    `markerLines=${diagnostics.markerLines}`,
    `malformed=${diagnostics.malformedMarkers}`,
    `staleHead=${diagnostics.staleHeadMarkers}`,
    `wrongVerdict=${diagnostics.wrongVerdictMarkers}`,
    `selfReview=${diagnostics.selfReviewMarkers}`,
    `misplaced=${diagnostics.misplacedMarkers}`,
  ].join(', ');

const main = async () => {
  try {
    const context = resolveReviewContext({ argv: process.argv.slice(2), env: process.env });
    if (!context.shouldGate) {
      console.log('SKIP: no pull request is being gated');
      return;
    }

    const result = await runIndependentReviewCheck({
      ...context,
      token: process.env.GITHUB_TOKEN,
      apiUrl: process.env.GITHUB_API_URL ?? DEFAULT_API_URL,
    });

    if (!result.ok) {
      console.error(
        `ERROR: no valid independent-review marker for head ${context.headSha} (${formatDiagnostics(
          result.diagnostics,
        )})`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(`OK: independent-review marker verified for head ${context.headSha} by ${result.reviewerId}`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  COPILOT_SESSION_PATTERN,
  COPILOT_COAUTHOR_PATTERN,
  MARKER_PATTERN,
  SHA_PATTERN,
  UUID_PATTERN,
  evaluateIndependentReview,
  extractCopilotSessionIds,
  fetchGitHubCollection,
  formatDiagnostics,
  inspectCommentMarker,
  parseCliArgs,
  parseMarkerLine,
  resolveReviewContext,
  runIndependentReviewCheck,
};
