'use strict';

// Uploads a released extension archive to Microsoft Edge Add-ons and the Chrome
// Web Store and submits it for review.
//
// Credentials are read from the environment and never printed. The archive is
// checked against the digest the submission dossiers pin before a single byte
// is uploaded, so this script cannot ship an archive nobody reviewed.
//
// API contracts (accessed 2026-08-19):
// - Edge Add-ons Update API v1.1
//   https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
//   https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference
// - Chrome Web Store API
//   https://developer.chrome.com/docs/webstore/using_webstore_api
//   https://developer.chrome.com/docs/webstore/api_index

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EDGE_API_ROOT = 'https://api.addons.microsoftedge.microsoft.com';
const CHROME_TOKEN_URL = 'https://accounts.google.com/o/oauth2/token';
const CHROME_UPLOAD_ROOT = 'https://www.googleapis.com/upload/chromewebstore/v1.1/items';
const CHROME_ITEM_ROOT = 'https://www.googleapis.com/chromewebstore/v1.1/items';

// Both stores answer "accepted, come back later", so every submission ends in a
// poll. The ceiling is generous because upload processing is not instant, and
// bounded because a run that never terminates is worse than one that reports a
// timeout an operator can retry.
const POLL_INTERVAL_MS = 10000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

const EDGE_TERMINAL_STATUS = Object.freeze({ Succeeded: 'succeeded', Failed: 'failed' });
const CHROME_TERMINAL_UPLOAD_STATE = Object.freeze({
  SUCCESS: 'succeeded',
  FAILURE: 'failed',
  NOT_FOUND: 'failed',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A secret that reached a log is a secret that has to be rotated, so anything
// that might carry one goes through here before it is written anywhere.
const redact = (text, secrets) => {
  let output = String(text);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) {
      output = output.split(secret).join('***');
    }
  }
  return output;
};

// Identifies a credential without disclosing it, so a value stored in CI can be
// compared against the one that works on an operator machine. A length plus 8
// hex characters of a digest distinguishes two high-entropy secrets while
// revealing nothing usable about either.
const fingerprint = (value) => {
  const text = String(value == null ? '' : value);
  if (text.length === 0) return 'absent';
  return `len=${text.length} sha=${crypto.createHash('sha256').update(text).digest('hex').slice(0, 8)}`;
};

const describeArchive = (archivePath) => {
  const bytes = fs.readFileSync(archivePath);
  return {
    name: path.basename(archivePath),
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes,
  };
};

// The reviewed digest is the gate. An archive that does not match it may be
// newer, older, or tampered with; none of those are things to upload.
const assertArchiveMatchesReviewedDigest = (archive, expectedSha256) => {
  if (archive.sha256 !== expectedSha256) {
    throw new Error(
      `archive ${archive.name} has SHA-256 ${archive.sha256}, which does not match the digest recorded in the submission dossiers (${expectedSha256})`,
    );
  }
};

// Reports which stores can actually be submitted to. A store with no
// credentials is skipped rather than failed, so configuring one store does not
// block the other; asking for a store explicitly turns that skip into an error.
const planStoreSubmissions = (env, requested) => {
  const wanted = requested === 'both' ? ['edge', 'chrome'] : [requested];
  const required = {
    edge: ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'],
    chrome: ['CHROME_ITEM_ID', 'CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN'],
  };

  return wanted.map((store) => {
    const missing = required[store].filter((name) => !env[name]);
    return {
      store,
      ready: missing.length === 0,
      missing,
      // Only an explicit single-store request treats missing credentials as a
      // failure; "both" is a convenience, not a claim that both are configured.
      required: requested === store,
    };
  });
};

const extractOperationId = (response) => {
  const location = response.headers.get('location');
  if (!location) {
    throw new Error('store accepted the request but returned no Location header, so the operation cannot be tracked');
  }
  // The header is documented as carrying the operationID; some responses send a
  // full URL instead, in which case the id is its last path segment.
  return location.split('/').filter(Boolean).pop();
};

const readBody = async (response) => {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
};

// Polls one operation until it reaches a terminal state, and turns "still
// running when the clock ran out" into a distinct, retryable failure rather
// than a silent success.
const pollUntilTerminal = async (describe, readStatus, options) => {
  const { intervalMs, timeoutMs, now, wait } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    const result = await readStatus();
    if (result.state === 'succeeded') return result;
    if (result.state === 'failed') {
      throw new Error(`${describe} failed: ${result.detail}`);
    }
    if (now() >= deadline) {
      throw new Error(
        `${describe} was still ${result.detail || 'in progress'} after ${Math.round(timeoutMs / 1000)}s; check the portal before retrying`,
      );
    }
    await wait(intervalMs);
  }
};

// --- Microsoft Edge Add-ons -------------------------------------------------

const edgeHeaders = (credentials) => ({
  Authorization: `ApiKey ${credentials.apiKey}`,
  'X-ClientID': credentials.clientId,
});

const interpretEdgeOperation = (payload) => {
  const status = payload && payload.status;
  const state = EDGE_TERMINAL_STATUS[status] || 'pending';
  const detail = [status, payload && payload.message, payload && JSON.stringify(payload.errors || [])]
    .filter((part) => part && part !== '[]')
    .join(' - ');
  return { state, detail: detail || 'InProgress' };
};

const submitToEdge = async (context) => {
  const { archive, notes, credentials, fetchImpl, log, secrets, uploadOnly, poll } = context;
  const product = `${EDGE_API_ROOT}/v1/products/${credentials.productId}`;

  log('edge: uploading the package');
  const upload = await fetchImpl(`${product}/submissions/draft/package`, {
    method: 'POST',
    headers: { ...edgeHeaders(credentials), 'Content-Type': 'application/zip' },
    body: archive.bytes,
  });
  if (upload.status !== 202) {
    const body = await readBody(upload);
    throw new Error(`edge package upload returned ${upload.status}: ${redact(body.text, secrets)}`);
  }
  const uploadOperation = extractOperationId(upload);

  await poll('edge package upload', async () => {
    const response = await fetchImpl(`${product}/submissions/draft/package/operations/${uploadOperation}`, {
      headers: edgeHeaders(credentials),
    });
    const body = await readBody(response);
    if (!response.ok) {
      return { state: 'failed', detail: `HTTP ${response.status}: ${redact(body.text, secrets)}` };
    }
    return interpretEdgeOperation(body.json);
  });
  log('edge: package accepted into the draft submission');

  if (uploadOnly) {
    log('edge: stopping before publish because --upload-only was given');
    return { store: 'edge', published: false, operationId: uploadOperation };
  }

  log('edge: publishing the draft submission');
  const publish = await fetchImpl(`${product}/submissions`, {
    method: 'POST',
    headers: { ...edgeHeaders(credentials), 'Content-Type': 'application/json' },
    // The published sample writes `{ "notes"="text value" }`, which is not JSON.
    // The endpoint documents a JSON body, so this sends actual JSON.
    body: JSON.stringify({ notes }),
  });
  if (publish.status !== 202) {
    const body = await readBody(publish);
    throw new Error(`edge publish returned ${publish.status}: ${redact(body.text, secrets)}`);
  }
  const publishOperation = extractOperationId(publish);

  await poll('edge publish', async () => {
    const response = await fetchImpl(`${product}/submissions/operations/${publishOperation}`, {
      headers: edgeHeaders(credentials),
    });
    const body = await readBody(response);
    if (!response.ok) {
      return { state: 'failed', detail: `HTTP ${response.status}: ${redact(body.text, secrets)}` };
    }
    return interpretEdgeOperation(body.json);
  });

  return { store: 'edge', published: true, operationId: publishOperation };
};

// --- Chrome Web Store -------------------------------------------------------

const requestChromeAccessToken = async (credentials, fetchImpl, secrets) => {
  const response = await fetchImpl(CHROME_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const body = await readBody(response);
  if (!response.ok || !body.json || !body.json.access_token) {
    throw new Error(`chrome token exchange returned ${response.status}: ${redact(body.text, secrets)}`);
  }
  return body.json.access_token;
};

const interpretChromeUpload = (payload) => {
  const state = CHROME_TERMINAL_UPLOAD_STATE[payload && payload.uploadState] || 'pending';
  const errors = (payload && payload.itemError) || [];
  const detail = [
    payload && payload.uploadState,
    errors.map((entry) => entry.error_detail || entry.error_code).join('; '),
  ]
    .filter(Boolean)
    .join(' - ');
  return { state, detail: detail || 'IN_PROGRESS' };
};

// ITEM_PENDING_REVIEW means the upload landed but a previous version still
// occupies the review queue. That is not this run's failure and must not be
// reported as one, but it does mean nothing was submitted.
const interpretChromePublish = (payload) => {
  const statuses = (payload && payload.status) || [];
  const detail = ((payload && payload.statusDetail) || []).join('; ') || statuses.join('; ');
  if (statuses.includes('OK')) return { state: 'succeeded', detail };
  if (statuses.includes('ITEM_PENDING_REVIEW')) return { state: 'pending-review', detail };
  return { state: 'failed', detail: detail || 'no status returned' };
};

const submitToChrome = async (context) => {
  const { archive, credentials, fetchImpl, log, secrets, uploadOnly, poll, publishTarget } = context;

  log('chrome: exchanging the refresh token for an access token');
  const token = await requestChromeAccessToken(credentials, fetchImpl, secrets);
  const authHeaders = { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' };
  const allSecrets = [...secrets, token];

  log('chrome: uploading the package');
  const upload = await fetchImpl(`${CHROME_UPLOAD_ROOT}/${credentials.itemId}`, {
    method: 'PUT',
    headers: authHeaders,
    body: archive.bytes,
  });
  const uploadBody = await readBody(upload);
  if (!upload.ok) {
    throw new Error(`chrome package upload returned ${upload.status}: ${redact(uploadBody.text, allSecrets)}`);
  }

  let uploadResult = interpretChromeUpload(uploadBody.json);
  if (uploadResult.state === 'pending') {
    await poll('chrome package upload', async () => {
      const response = await fetchImpl(`${CHROME_ITEM_ROOT}/${credentials.itemId}?projection=DRAFT`, {
        headers: authHeaders,
      });
      const body = await readBody(response);
      if (!response.ok) {
        return { state: 'failed', detail: `HTTP ${response.status}: ${redact(body.text, allSecrets)}` };
      }
      return interpretChromeUpload(body.json);
    });
  } else if (uploadResult.state === 'failed') {
    throw new Error(`chrome package upload failed: ${redact(uploadResult.detail, allSecrets)}`);
  }
  log('chrome: package accepted as the item draft');

  if (uploadOnly) {
    log('chrome: stopping before publish because --upload-only was given');
    return { store: 'chrome', published: false };
  }

  log('chrome: submitting the draft for review');
  const publish = await fetchImpl(
    `${CHROME_ITEM_ROOT}/${credentials.itemId}/publish?publishTarget=${encodeURIComponent(publishTarget)}`,
    { method: 'POST', headers: { ...authHeaders, 'Content-Length': '0' } },
  );
  const publishBody = await readBody(publish);
  if (!publish.ok) {
    throw new Error(`chrome publish returned ${publish.status}: ${redact(publishBody.text, allSecrets)}`);
  }
  const result = interpretChromePublish(publishBody.json);
  if (result.state === 'failed') {
    throw new Error(`chrome publish failed: ${redact(result.detail, allSecrets)}`);
  }
  if (result.state === 'pending-review') {
    log(`chrome: item is still in review from an earlier submission (${result.detail})`);
    return { store: 'chrome', published: false, pendingReview: true };
  }

  return { store: 'chrome', published: true };
};

// --- Entry point ------------------------------------------------------------

const parseArguments = (argv) => {
  const options = {
    store: 'both',
    archive: '',
    notesFile: '',
    uploadOnly: false,
    publishTarget: 'default',
    diagnose: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--upload-only') options.uploadOnly = true;
    else if (argument === '--diagnose') options.diagnose = true;
    else if (argument === '--store') options.store = argv[(index += 1)];
    else if (argument === '--archive') options.archive = argv[(index += 1)];
    else if (argument === '--notes-file') options.notesFile = argv[(index += 1)];
    else if (argument === '--publish-target') options.publishTarget = argv[(index += 1)];
    else throw new Error(`unknown argument ${argument}`);
  }
  if (!['edge', 'chrome', 'both'].includes(options.store)) {
    throw new Error(`--store must be edge, chrome, or both (received ${options.store})`);
  }
  if (!['default', 'trustedTesters'].includes(options.publishTarget)) {
    throw new Error(`--publish-target must be default or trustedTesters (received ${options.publishTarget})`);
  }
  return options;
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.diagnose) {
    // Reaching a store and being refused by it looks the same whether the value
    // is wrong or the account is not entitled. This separates the two without
    // printing anything an operator would have to rotate afterwards.
    for (const name of [
      'EDGE_PRODUCT_ID',
      'EDGE_CLIENT_ID',
      'EDGE_API_KEY',
      'CHROME_ITEM_ID',
      'CHROME_CLIENT_ID',
      'CHROME_CLIENT_SECRET',
      'CHROME_REFRESH_TOKEN',
    ]) {
      process.stdout.write(`${name.padEnd(22)} ${fingerprint(process.env[name])}\n`);
    }
    return;
  }
  const root = process.cwd();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const archivePath = options.archive || path.join(root, 'dist', `network-plus-extension-${version}.zip`);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`${archivePath} is missing; run npm run extension:package first`);
  }

  const { EXPECTED_RELEASE_SHA256 } = require('./check-store-readiness.js');
  const archive = describeArchive(archivePath);
  assertArchiveMatchesReviewedDigest(archive, EXPECTED_RELEASE_SHA256);
  process.stdout.write(`archive ${archive.name} verified: ${archive.size} bytes, SHA-256 ${archive.sha256}\n`);

  const notes = options.notesFile
    ? fs.readFileSync(options.notesFile, 'utf8').trim()
    : `Network+ for DevTools v${version}. Release notes: https://github.com/himiyosh/network-plus-extension/releases/tag/v${version}`;

  const plans = planStoreSubmissions(process.env, options.store);
  const secrets = [process.env.EDGE_API_KEY, process.env.CHROME_CLIENT_SECRET, process.env.CHROME_REFRESH_TOKEN].filter(
    Boolean,
  );
  const log = (message) => process.stdout.write(`${redact(message, secrets)}\n`);
  const poll = (describe, readStatus) =>
    pollUntilTerminal(describe, readStatus, {
      intervalMs: POLL_INTERVAL_MS,
      timeoutMs: POLL_TIMEOUT_MS,
      now: () => Date.now(),
      wait: sleep,
    });

  const results = [];
  for (const plan of plans) {
    if (!plan.ready) {
      const message = `${plan.store}: skipped, missing ${plan.missing.join(', ')}`;
      if (plan.required) throw new Error(message.replace('skipped, missing', 'was requested but is missing'));
      log(message);
      results.push({ store: plan.store, skipped: true, missing: plan.missing });
      continue;
    }

    const shared = {
      archive,
      notes,
      fetchImpl: fetch,
      log,
      secrets,
      uploadOnly: options.uploadOnly,
      poll,
      publishTarget: options.publishTarget,
    };
    if (plan.store === 'edge') {
      results.push(
        await submitToEdge({
          ...shared,
          credentials: {
            productId: process.env.EDGE_PRODUCT_ID,
            clientId: process.env.EDGE_CLIENT_ID,
            apiKey: process.env.EDGE_API_KEY,
          },
        }),
      );
    } else {
      results.push(
        await submitToChrome({
          ...shared,
          credentials: {
            itemId: process.env.CHROME_ITEM_ID,
            clientId: process.env.CHROME_CLIENT_ID,
            clientSecret: process.env.CHROME_CLIENT_SECRET,
            refreshToken: process.env.CHROME_REFRESH_TOKEN,
          },
        }),
      );
    }
  }

  const submitted = results.filter((result) => result.published).map((result) => result.store);
  process.stdout.write(
    submitted.length > 0
      ? `OK: v${version} submitted to ${submitted.join(' and ')}\n`
      : 'OK: no store submission was published; see the per-store lines above\n',
  );
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertArchiveMatchesReviewedDigest,
  fingerprint,
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
};
