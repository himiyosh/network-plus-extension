'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertArchiveMatchesReviewedDigest,
  describeArchive,
  extractOperationId,
  interpretChromePublish,
  interpretChromeUpload,
  interpretEdgeOperation,
  parseArguments,
  planStoreSubmissions,
  pollUntilTerminal,
  redact,
  submitToChrome,
  submitToEdge,
  CHROME_ITEM_ROOT,
  CHROME_TOKEN_URL,
  CHROME_UPLOAD_ROOT,
  EDGE_API_ROOT,
} = require('../scripts/submit-to-stores');

const ROOT = path.join(__dirname, '..');
const SUBMIT_WORKFLOW = path.join('.github', 'workflows', 'store-submit.yml');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const headers = (entries) => ({ get: (name) => entries[name.toLowerCase()] ?? null });
const response = (status, body, headerEntries = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: headers(headerEntries),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

// Every submission ends in a poll, so tests drive one with an injected clock
// instead of waiting on a real one.
const instantPoll = (describe, readStatus) =>
  pollUntilTerminal(describe, readStatus, {
    intervalMs: 0,
    timeoutMs: 1000,
    now: (() => {
      let clock = 0;
      return () => (clock += 100);
    })(),
    wait: async () => {},
  });

const baseContext = (fetchImpl, overrides = {}) => ({
  archive: { name: 'network-plus-extension-9.9.9.zip', size: 4, sha256: 'a'.repeat(64), bytes: Buffer.from('zip!') },
  notes: 'release notes',
  fetchImpl,
  log: () => {},
  secrets: [],
  uploadOnly: false,
  poll: instantPoll,
  publishTarget: 'default',
  ...overrides,
});

describe('archive gate', () => {
  test('describes an archive by name, byte length, and digest', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-submit-'));
    const archivePath = path.join(directory, 'network-plus-extension-9.9.9.zip');
    fs.writeFileSync(archivePath, Buffer.from('network-plus', 'utf8'));
    try {
      const archive = describeArchive(archivePath);
      expect(archive.name).toBe('network-plus-extension-9.9.9.zip');
      expect(archive.size).toBe(12);
      expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  // The whole point of the gate: an archive nobody reviewed never reaches a store.
  test('refuses an archive whose digest is not the reviewed one', () => {
    const archive = { name: 'tampered.zip', sha256: 'b'.repeat(64) };
    expect(() => assertArchiveMatchesReviewedDigest(archive, 'a'.repeat(64))).toThrow(
      /does not match the digest recorded in the submission dossiers/,
    );
  });

  test('accepts the archive that matches the reviewed digest', () => {
    expect(() => assertArchiveMatchesReviewedDigest({ sha256: 'a'.repeat(64) }, 'a'.repeat(64))).not.toThrow();
  });
});

describe('credential planning', () => {
  const full = {
    EDGE_PRODUCT_ID: 'p',
    EDGE_CLIENT_ID: 'c',
    EDGE_API_KEY: 'k',
    CHROME_ITEM_ID: 'i',
    CHROME_CLIENT_ID: 'ci',
    CHROME_CLIENT_SECRET: 'cs',
    CHROME_REFRESH_TOKEN: 'rt',
  };

  test('plans both stores when both are configured', () => {
    expect(planStoreSubmissions(full, 'both')).toEqual([
      { store: 'edge', ready: true, missing: [], required: false },
      { store: 'chrome', ready: true, missing: [], required: false },
    ]);
  });

  // Configuring one store must not block the other.
  test('skips an unconfigured store when both were requested', () => {
    const plans = planStoreSubmissions({ ...full, CHROME_REFRESH_TOKEN: '' }, 'both');
    expect(plans[0]).toMatchObject({ store: 'edge', ready: true });
    expect(plans[1]).toMatchObject({ store: 'chrome', ready: false, missing: ['CHROME_REFRESH_TOKEN'], required: false });
  });

  // Asking for one store by name is a claim that it is configured.
  test('marks an explicitly requested store as required', () => {
    expect(planStoreSubmissions({}, 'edge')).toEqual([
      { store: 'edge', ready: false, missing: ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'], required: true },
    ]);
  });
});

describe('secret redaction', () => {
  test('masks every configured secret in text that gets logged', () => {
    const text = 'failed for key sk-abcdefgh1234 with token rt-zyxwvutsrq';
    expect(redact(text, ['sk-abcdefgh1234', 'rt-zyxwvutsrq'])).toBe('failed for key *** with token ***');
  });

  // A short value is more likely to be a common substring than a credential;
  // masking it would corrupt messages without protecting anything.
  test('leaves values too short to be a credential alone', () => {
    expect(redact('status 404 for item ab', ['ab'])).toBe('status 404 for item ab');
  });
});

describe('operation tracking', () => {
  test('reads the operation id from a bare Location header', () => {
    expect(extractOperationId(response(202, '', { location: 'abc-123' }))).toBe('abc-123');
  });

  test('reads the operation id from a Location header carrying a full URL', () => {
    expect(extractOperationId(response(202, '', { location: 'https://example.test/v1/operations/abc-123' }))).toBe(
      'abc-123',
    );
  });

  // Without an id there is nothing to poll, so an untrackable submission must
  // fail loudly instead of being reported as accepted.
  test('rejects an accepted response that carries no Location header', () => {
    expect(() => extractOperationId(response(202, ''))).toThrow(/returned no Location header/);
  });
});

describe('status interpretation', () => {
  test('maps the documented Edge operation states', () => {
    expect(interpretEdgeOperation({ status: 'Succeeded' }).state).toBe('succeeded');
    expect(interpretEdgeOperation({ status: 'InProgress' }).state).toBe('pending');
    expect(interpretEdgeOperation({ status: 'Failed', message: 'bad manifest' })).toEqual({
      state: 'failed',
      detail: 'Failed - bad manifest',
    });
  });

  // An unrecognized status is not success. Treating it as pending lets the poll
  // time out and report, rather than declaring a submission that never happened.
  test('treats an unknown Edge status as still pending', () => {
    expect(interpretEdgeOperation({ status: 'Whatever' }).state).toBe('pending');
    expect(interpretEdgeOperation(null).state).toBe('pending');
  });

  test('maps the documented Chrome upload states', () => {
    expect(interpretChromeUpload({ uploadState: 'SUCCESS' }).state).toBe('succeeded');
    expect(interpretChromeUpload({ uploadState: 'IN_PROGRESS' }).state).toBe('pending');
    expect(interpretChromeUpload({ uploadState: 'FAILURE', itemError: [{ error_detail: 'bad zip' }] })).toEqual({
      state: 'failed',
      detail: 'FAILURE - bad zip',
    });
    // NOT_FOUND means the item id is wrong; retrying cannot fix it.
    expect(interpretChromeUpload({ uploadState: 'NOT_FOUND' }).state).toBe('failed');
  });

  test('maps a Chrome publish success', () => {
    expect(interpretChromePublish({ status: ['OK'], statusDetail: ['fine'] })).toEqual({
      state: 'succeeded',
      detail: 'fine',
    });
  });

  // A queue still holding the previous version is not this run's failure, but
  // nothing was submitted either, so it gets its own state.
  test('separates "already in review" from a real publish failure', () => {
    expect(interpretChromePublish({ status: ['ITEM_PENDING_REVIEW'] }).state).toBe('pending-review');
    expect(interpretChromePublish({ status: ['NOT_AUTHORIZED'] }).state).toBe('failed');
    expect(interpretChromePublish({}).state).toBe('failed');
  });
});

describe('polling', () => {
  test('returns as soon as the operation succeeds', async () => {
    const states = ['pending', 'pending', 'succeeded'];
    let calls = 0;
    const result = await instantPoll('test op', async () => ({ state: states[calls++], detail: '' }));
    expect(result.state).toBe('succeeded');
    expect(calls).toBe(3);
  });

  test('throws with the store detail when the operation fails', async () => {
    await expect(instantPoll('test op', async () => ({ state: 'failed', detail: 'rejected' }))).rejects.toThrow(
      'test op failed: rejected',
    );
  });

  // A run that never terminates is worse than one that reports a timeout.
  test('gives up with a retryable message instead of hanging', async () => {
    await expect(instantPoll('test op', async () => ({ state: 'pending', detail: 'InProgress' }))).rejects.toThrow(
      /still InProgress after 1s; check the portal before retrying/,
    );
  });
});

describe('Edge submission', () => {
  const credentials = { productId: 'PRODUCT', clientId: 'CLIENT', apiKey: 'KEY-12345678' };

  test('uploads, waits for the package, then publishes with JSON notes', async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', headers: init.headers, body: init.body });
      if (url.endsWith('/submissions/draft/package')) return response(202, '', { location: 'op-upload' });
      if (url.includes('/draft/package/operations/')) return response(200, { status: 'Succeeded' });
      if (url.endsWith('/submissions')) return response(202, '', { location: 'op-publish' });
      return response(200, { status: 'Succeeded' });
    };

    const result = await submitToEdge(baseContext(fetchImpl, { credentials }));

    expect(result).toEqual({ store: 'edge', published: true, operationId: 'op-publish' });
    expect(calls[0].url).toBe(`${EDGE_API_ROOT}/v1/products/PRODUCT/submissions/draft/package`);
    expect(calls[0].headers).toMatchObject({
      Authorization: 'ApiKey KEY-12345678',
      'X-ClientID': 'CLIENT',
      'Content-Type': 'application/zip',
    });
    const publishCall = calls.find((call) => call.method === 'POST' && call.url.endsWith('/submissions'));
    // The published sample body is not valid JSON; this must send real JSON.
    expect(JSON.parse(publishCall.body)).toEqual({ notes: 'release notes' });
  });

  test('stops after the upload when only an upload was asked for', async () => {
    const fetchImpl = async (url) => {
      if (url.endsWith('/submissions/draft/package')) return response(202, '', { location: 'op-upload' });
      if (url.includes('/operations/')) return response(200, { status: 'Succeeded' });
      throw new Error(`unexpected call to ${url}`);
    };
    await expect(submitToEdge(baseContext(fetchImpl, { credentials, uploadOnly: true }))).resolves.toEqual({
      store: 'edge',
      published: false,
      operationId: 'op-upload',
    });
  });

  test('reports a rejected upload with the store response', async () => {
    const fetchImpl = async () => response(400, 'manifest version must increase');
    await expect(submitToEdge(baseContext(fetchImpl, { credentials }))).rejects.toThrow(
      /edge package upload returned 400: manifest version must increase/,
    );
  });

  // A failure message travels to CI logs, so it must not carry the API key.
  test('keeps the API key out of failure messages', async () => {
    const fetchImpl = async () => response(401, 'rejected ApiKey KEY-12345678');
    await expect(
      submitToEdge(baseContext(fetchImpl, { credentials, secrets: ['KEY-12345678'] })),
    ).rejects.toThrow(/rejected ApiKey \*\*\*/);
  });
});

describe('Chrome submission', () => {
  const credentials = {
    itemId: 'ITEM',
    clientId: 'client',
    clientSecret: 'secret-12345678',
    refreshToken: 'refresh-12345678',
  };

  const tokenThenUpload = (uploadBody, publishBody) => async (url, init = {}) => {
    if (url === CHROME_TOKEN_URL) return response(200, { access_token: 'token-abcdefgh' });
    if (url.startsWith(CHROME_UPLOAD_ROOT)) return response(200, uploadBody);
    if (url.includes('/publish')) return response(200, publishBody);
    if (init.method === undefined) return response(200, uploadBody);
    throw new Error(`unexpected call to ${url}`);
  };

  test('exchanges the refresh token, uploads, then publishes', async () => {
    const calls = [];
    const inner = tokenThenUpload({ uploadState: 'SUCCESS' }, { status: ['OK'], statusDetail: ['published'] });
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', headers: init.headers, body: init.body });
      return inner(url, init);
    };

    await expect(submitToChrome(baseContext(fetchImpl, { credentials }))).resolves.toEqual({
      store: 'chrome',
      published: true,
    });

    expect(new URLSearchParams(calls[0].body).get('grant_type')).toBe('refresh_token');
    expect(calls[1]).toMatchObject({ url: `${CHROME_UPLOAD_ROOT}/ITEM`, method: 'PUT' });
    expect(calls[1].headers).toMatchObject({ Authorization: 'Bearer token-abcdefgh', 'x-goog-api-version': '2' });
    expect(calls[2].url).toBe(`${CHROME_ITEM_ROOT}/ITEM/publish?publishTarget=default`);
    expect(calls[2].headers).toMatchObject({ 'Content-Length': '0' });
  });

  test('polls the item when the upload has not finished processing', async () => {
    let itemReads = 0;
    const fetchImpl = async (url) => {
      if (url === CHROME_TOKEN_URL) return response(200, { access_token: 'token-abcdefgh' });
      if (url.startsWith(CHROME_UPLOAD_ROOT)) return response(200, { uploadState: 'IN_PROGRESS' });
      if (url.startsWith(CHROME_ITEM_ROOT) && url.includes('projection=DRAFT')) {
        itemReads += 1;
        return response(200, { uploadState: itemReads > 1 ? 'SUCCESS' : 'IN_PROGRESS' });
      }
      return response(200, { status: ['OK'] });
    };
    await expect(submitToChrome(baseContext(fetchImpl, { credentials }))).resolves.toMatchObject({ published: true });
    expect(itemReads).toBe(2);
  });

  test('reports an item still in review without calling it a failure', async () => {
    const fetchImpl = tokenThenUpload({ uploadState: 'SUCCESS' }, { status: ['ITEM_PENDING_REVIEW'] });
    await expect(submitToChrome(baseContext(fetchImpl, { credentials }))).resolves.toEqual({
      store: 'chrome',
      published: false,
      pendingReview: true,
    });
  });

  test('fails on a rejected publish', async () => {
    const fetchImpl = tokenThenUpload({ uploadState: 'SUCCESS' }, { status: ['NOT_AUTHORIZED'], statusDetail: ['nope'] });
    await expect(submitToChrome(baseContext(fetchImpl, { credentials }))).rejects.toThrow(/chrome publish failed: nope/);
  });

  // The access token is minted inside the run, so it is not in the caller's
  // secret list and has to be redacted on its own.
  test('keeps the minted access token out of failure messages', async () => {
    const fetchImpl = async (url) => {
      if (url === CHROME_TOKEN_URL) return response(200, { access_token: 'token-abcdefgh' });
      return response(500, 'upstream rejected Bearer token-abcdefgh');
    };
    await expect(submitToChrome(baseContext(fetchImpl, { credentials }))).rejects.toThrow(/Bearer \*\*\*/);
  });

  test('fails when the refresh token cannot be exchanged', async () => {
    const fetchImpl = async () => response(400, '{"error":"invalid_grant"}');
    await expect(submitToChrome(baseContext(fetchImpl, { credentials }))).rejects.toThrow(
      /chrome token exchange returned 400/,
    );
  });
});

describe('command line', () => {
  test('defaults to submitting the packaged release to both stores', () => {
    expect(parseArguments([])).toEqual({
      store: 'both',
      archive: '',
      notesFile: '',
      uploadOnly: false,
      publishTarget: 'default',
      diagnose: false,
    });
  });

  test('accepts the documented flags', () => {
    expect(parseArguments(['--store', 'chrome', '--archive', 'a.zip', '--notes-file', 'n.md', '--upload-only'])).toEqual(
      { store: 'chrome', archive: 'a.zip', notesFile: 'n.md', uploadOnly: true, publishTarget: 'default', diagnose: false },
    );
  });

  test('rejects an unknown store or publish target rather than guessing', () => {
    expect(() => parseArguments(['--store', 'firefox'])).toThrow(/--store must be edge, chrome, or both/);
    expect(() => parseArguments(['--publish-target', 'everyone'])).toThrow(/--publish-target must be/);
    expect(() => parseArguments(['--yolo'])).toThrow(/unknown argument --yolo/);
  });
});

describe('store submission workflow', () => {
  const workflow = readRepoFile(SUBMIT_WORKFLOW);

  test('runs when a release is published and on demand', () => {
    expect(workflow).toMatch(/on:\s*\n\s*release:\s*\n\s*types:\s*\n\s*- published/);
    expect(workflow).toContain('workflow_dispatch:');
  });

  test('keeps the token read-only, since it publishes to stores and not to the repository', () => {
    expect(workflow).toMatch(/^permissions:\s*\n\s*contents: read/m);
    expect(workflow).not.toContain('contents: write');
    expect(workflow).toContain('persist-credentials: false');
  });

  test('pins every action to the same commit as the quality workflow', () => {
    const quality = readRepoFile(path.join('.github', 'workflows', 'quality-gates.yml'));
    for (const pinned of workflow.match(/uses: [^\s]+/g) || []) {
      expect(pinned).toMatch(/@[0-9a-f]{40}$/);
      expect(quality).toContain(pinned);
    }
  });

  // Store credentials must arrive as secrets, never as literals in the file.
  test('reads every credential from secrets and nothing from the workflow text', () => {
    for (const name of [
      'EDGE_PRODUCT_ID',
      'EDGE_CLIENT_ID',
      'EDGE_API_KEY',
      'CHROME_ITEM_ID',
      'CHROME_CLIENT_ID',
      'CHROME_CLIENT_SECRET',
      'CHROME_REFRESH_TOKEN',
    ]) {
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });

  test('rebuilds and verifies the package before it can be uploaded', () => {
    expect(workflow).toContain('npm run extension:package');
    expect(workflow).toContain('npm run store:check');
    expect(workflow.indexOf('npm run extension:package')).toBeLessThan(workflow.indexOf('npm run store:submit'));
  });

  test('is wired to the npm script the repository documents', () => {
    const scripts = JSON.parse(readRepoFile('package.json')).scripts;
    expect(scripts['store:submit']).toBe('node scripts/submit-to-stores.js');
  });
});

describe('chrome refresh token helper', () => {
  const {
    awaitAuthorizationCode,
    buildConsentUrl,
    extractAuthorizationCode,
    readRefreshToken,
    SCOPE,
  } = require('../scripts/chrome-refresh-token');

  test('asks for offline access, or the flow returns no refresh token at all', () => {
    const url = new URL(buildConsentUrl('client-123', 'http://127.0.0.1:5000'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toBe(SCOPE);
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5000');
  });

  // The retired out-of-band redirect is exactly what the published guide still
  // shows; a client created today is refused by it.
  test('uses a loopback redirect rather than the retired out-of-band one', () => {
    expect(buildConsentUrl('client-123', 'http://127.0.0.1:5000')).not.toContain('oauth:2.0:oob');
  });

  test('reads the code out of the callback', () => {
    expect(extractAuthorizationCode('/?code=abc123&scope=x', 'http://127.0.0.1')).toBe('abc123');
  });

  // A declined consent must end the run, not leave it waiting forever.
  test('surfaces a declined consent instead of waiting', () => {
    expect(() => extractAuthorizationCode('/?error=access_denied', 'http://127.0.0.1')).toThrow(
      /Google returned "access_denied"/,
    );
    expect(() => extractAuthorizationCode('/', 'http://127.0.0.1')).toThrow(/neither a code nor an error/);
  });

  test('explains the fix when Google withholds the refresh token', () => {
    expect(() => readRefreshToken({ access_token: 'ya29' })).toThrow(/revoke this app under/);
    expect(readRefreshToken({ refresh_token: '1/rwn' })).toBe('1/rwn');
  });

  test('serves one callback on a loopback port and then stops', async () => {
    const pending = awaitAuthorizationCode(async (redirectUri) => {
      expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const response = await fetch(`${redirectUri}/?code=from-browser`);
      expect(response.status).toBe(200);
    });
    await expect(pending).resolves.toBe('from-browser');
  });
});

describe('guided secret setup', () => {
  const { browserOpenCommand, cleanValue, secretSetArguments, ENVIRONMENT, REPO, STEPS } = require('../scripts/setup-store-secrets');
  const { planStoreSubmissions: plan } = require('../scripts/submit-to-stores');

  // The wizard and the workflow must agree on every name, or setup completes
  // and the submission still reports missing credentials.
  test('collects exactly the secrets the submission script requires', () => {
    const collected = [...STEPS.edge, ...STEPS.chrome].map((step) => step.secret);
    const required = plan({}, 'both').flatMap((entry) => entry.missing);
    expect(collected.sort()).toEqual(required.sort());
  });

  test('targets the environment and repository the workflow reads', () => {
    expect(ENVIRONMENT).toBe('store-submission');
    const workflow = readRepoFile(path.join('.github', 'workflows', 'store-submit.yml'));
    expect(workflow).toContain(`environment: ${ENVIRONMENT}`);
    expect(REPO).toBe('himiyosh/network-plus-extension');
  });

  // The value goes over stdin; putting it in argv would expose it to any
  // process that can read the process table.
  test('never passes a secret value as a command-line argument', () => {
    const args = secretSetArguments('EDGE_API_KEY');
    expect(args).toEqual(['secret', 'set', 'EDGE_API_KEY', '--repo', REPO, '--env', ENVIRONMENT]);
    expect(args).not.toContain('--body');
  });

  // A pasted credential routinely carries a trailing newline, and the store
  // rejects it much later with an unhelpful error.
  test('trims whitespace that pasting adds', () => {
    expect(cleanValue('  abc123\n')).toBe('abc123');
    expect(cleanValue('\tdef\r\n')).toBe('def');
  });

  test('opens pages with the right command per platform', () => {
    expect(browserOpenCommand('darwin')).toBe('open');
    expect(browserOpenCommand('win32')).toBe('start');
    expect(browserOpenCommand('linux')).toBe('xdg-open');
  });

  test('hides the values that are credentials and not identifiers', () => {
    const hidden = [...STEPS.edge, ...STEPS.chrome].filter((step) => step.hidden).map((step) => step.secret);
    expect(hidden.sort()).toEqual(['CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN', 'EDGE_API_KEY']);
  });

  test('checks the two identifiers whose shape is documented', () => {
    const find = (secret) => [...STEPS.edge, ...STEPS.chrome].find((step) => step.secret === secret);
    expect(find('EDGE_PRODUCT_ID').check('d34f98f5-f9b7-42b1-bebb-98707202b21d')).toBeNull();
    expect(find('EDGE_PRODUCT_ID').check('not-a-guid')).toMatch(/GUID/);
    expect(find('CHROME_ITEM_ID').check('a'.repeat(32))).toBeNull();
    expect(find('CHROME_ITEM_ID').check('z'.repeat(32))).toMatch(/a-p/);
    expect(find('CHROME_CLIENT_ID').check('123.apps.googleusercontent.com')).toBeNull();
    expect(find('CHROME_CLIENT_ID').check('123')).toMatch(/googleusercontent/);
  });
});

describe('credential fingerprint', () => {
  const { fingerprint } = require('../scripts/submit-to-stores');

  // The point is to compare a value stored in CI against one on an operator
  // machine without either being printed, so the value must not be recoverable.
  test('identifies a value without disclosing it', () => {
    const secret = 'super-secret-api-key-value';
    const print = fingerprint(secret);
    expect(print).toMatch(/^len=26 sha=[0-9a-f]{8}$/);
    expect(print).not.toContain(secret);
    expect(print).not.toContain(secret.slice(0, 6));
  });

  test('distinguishes two values of the same length', () => {
    expect(fingerprint('aaaaaaaaaaaa')).not.toBe(fingerprint('aaaaaaaaaaab'));
  });

  test('is stable, so the two sides can be compared at all', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
  });

  // "Not configured" and "configured wrongly" are different diagnoses.
  test('reports an unset value as absent rather than hashing the empty string', () => {
    expect(fingerprint(undefined)).toBe('absent');
    expect(fingerprint('')).toBe('absent');
  });

  test('is reachable from the command line and the workflow', () => {
    expect(parseArguments(['--diagnose']).diagnose).toBe(true);
    expect(parseArguments([]).diagnose).toBe(false);
    const workflow = readRepoFile(path.join('.github', 'workflows', 'store-submit.yml'));
    expect(workflow).toContain("DIAGNOSE: ${{ inputs.diagnose && '--diagnose' || '' }}");
  });
});
