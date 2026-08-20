'use strict';

// Walks an operator through collecting the store credentials and writes them
// straight into the GitHub environment that the submission workflow reads.
//
//   node scripts/setup-store-secrets.js            # both stores
//   node scripts/setup-store-secrets.js --store edge
//
// Run it on an operator machine. It opens each portal page at the point it is
// needed, stops for the parts only a signed-in human can do, checks the shape
// of every value before accepting it, and pipes each one into `gh secret set`
// over stdin. Nothing is written to disk, no value is echoed back, and no value
// is passed as a command-line argument where another process could read it.

const { spawn } = require('child_process');
const readline = require('readline');

const REPO = 'himiyosh/network-plus-extension';
const ENVIRONMENT = 'store-submission';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A Chrome extension id is 32 characters drawn from a-p.
const CHROME_ITEM = /^[a-p]{32}$/;

// Each step names the page the operator has to visit, what to do there, and how
// to recognize a correct value. `secret` is the name the workflow reads.
const STEPS = Object.freeze({
  edge: [
    {
      secret: 'EDGE_PRODUCT_ID',
      url: 'https://partner.microsoft.com/dashboard/microsoftedge/overview',
      instructions: [
        'Sign in as the account that published the extension.',
        'Open the extension, then find Extension identity on the Extension overview page.',
        'The same value is the GUID in the address bar between microsoftedge/ and /packages.',
      ],
      prompt: 'Product ID',
      hidden: false,
      check: (value) => (GUID.test(value) ? null : 'that does not look like a GUID (8-4-4-4-12 hex)'),
    },
    {
      secret: 'EDGE_CLIENT_ID',
      url: 'https://partner.microsoft.com/dashboard/microsoftedge/publishapi',
      instructions: [
        'If the page offers to "enable the new experience", click Enable first: this automation uses v1.1.',
        'Click Create API credentials and wait; it can take a few minutes.',
        'Copy the Client ID.',
      ],
      prompt: 'Client ID',
      hidden: false,
      check: () => null,
    },
    {
      secret: 'EDGE_API_KEY',
      instructions: [
        'Copy the API key from the same page.',
        'It is shown only once, at creation. If this run fails after this point, create a new key.',
      ],
      prompt: 'API key',
      hidden: true,
      check: () => null,
    },
  ],
  chrome: [
    {
      secret: 'CHROME_ITEM_ID',
      url: 'https://chrome.google.com/webstore/devconsole',
      instructions: ['Open the existing item and copy its item ID (32 letters).'],
      prompt: 'Item ID',
      hidden: false,
      check: (value) => (CHROME_ITEM.test(value) ? null : 'a Chrome item id is 32 letters in the range a-p'),
    },
    {
      secret: 'CHROME_CLIENT_ID',
      url: 'https://console.cloud.google.com/apis/credentials',
      instructions: [
        'Enable the Chrome Web Store API for this project first, and configure the OAuth consent screen',
        'as External with your own address under Test users.',
        'Then: Create Credentials, OAuth client ID, application type Desktop app.',
      ],
      prompt: 'OAuth client ID',
      hidden: false,
      check: (value) =>
        value.endsWith('.apps.googleusercontent.com')
          ? null
          : 'a Google client ID ends with .apps.googleusercontent.com',
    },
    {
      secret: 'CHROME_CLIENT_SECRET',
      instructions: ['Copy the client secret shown next to the client ID you just created.'],
      prompt: 'OAuth client secret',
      hidden: true,
      check: () => null,
    },
    {
      secret: 'CHROME_REFRESH_TOKEN',
      instructions: [
        'Run this in another terminal, in this repository, and paste what it prints:',
        '',
        '  CHROME_CLIENT_ID=<the id above> CHROME_CLIENT_SECRET=<the secret above> \\',
        '    node scripts/chrome-refresh-token.js',
        '',
        'It opens a consent URL. Sign in as the account that OWNS the store item, which may differ',
        'from the account that owns the Cloud project, and accept.',
      ],
      prompt: 'Refresh token',
      hidden: true,
      check: () => null,
    },
  ],
});

const run = (command, args, input) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });

// Opening a URL is a convenience, never a requirement: the address is printed
// either way so a headless or locked-down machine can still follow along.
const browserOpenCommand = (platform) => {
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'start';
  return 'xdg-open';
};

const openInBrowser = async (url, platform) => {
  const command = browserOpenCommand(platform);
  const result = await run(command, [url], '');
  return result.code === 0;
};

// The value is piped over stdin rather than passed as an argument, so it never
// appears in the process table or a shell history file.
const secretSetArguments = (name) => ['secret', 'set', name, '--repo', REPO, '--env', ENVIRONMENT];

const ask = (rl, question) => new Promise((resolve) => rl.question(question, (answer) => resolve(answer)));

// Reads without echoing, so a secret never lands in the terminal scrollback.
const askHidden = (rl, question) =>
  new Promise((resolve) => {
    process.stdout.write(question);
    const onData = (char) => {
      if (char === '\r' || char === '\n' || char === '') {
        process.stdin.removeListener('data', onData);
      }
    };
    process.stdin.on('data', onData);
    const wasMuted = rl.output.muted;
    rl.output.muted = true;
    rl.question('', (answer) => {
      rl.output.muted = wasMuted;
      process.stdout.write('\n');
      resolve(answer);
    });
  });

// A pasted value routinely carries a trailing newline or a stray space, and a
// store rejects it hours later with an unhelpful error. Trimming here, and
// saying so, is worth more than any other check in this script.
//
// Matched surrounding quotes go too. Credentials are commonly kept in .env
// files, where quoting a value is ordinary and a shell strips the quotes on
// `source`; copying the line's text instead keeps them, and the store then
// refuses a value that looks correct in every log that shows its length.
const cleanValue = (raw) => {
  const trimmed = String(raw).trim();
  const first = trimmed[0];
  if ((first === '"' || first === "'") && trimmed.length >= 2 && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

// Two of these prompts arrive back to back and both want a GUID, so a clipboard
// that was not refreshed silently answers the second one with the first one's
// value. The store then rejects the pair with a bare 401 that names neither
// field. Comparing against what was already collected catches it here instead.
const duplicateOf = (value, collected) => {
  for (const [name, previous] of collected) {
    if (previous === value) return name;
  }
  return null;
};

const collect = async (rl, step, platform, collected = []) => {
  process.stdout.write(`\n--- ${step.secret} ---\n`);
  if (step.url) {
    const opened = await openInBrowser(step.url, platform);
    process.stdout.write(`${opened ? 'Opened' : 'Open'} ${step.url}\n`);
  }
  for (const line of step.instructions) {
    process.stdout.write(line ? `  ${line}\n` : '\n');
  }

  for (;;) {
    const raw = step.hidden ? await askHidden(rl, `${step.prompt}: `) : await ask(rl, `${step.prompt}: `);
    const value = cleanValue(raw);
    if (!value) {
      process.stdout.write('  empty; try again\n');
      continue;
    }
    const raw_ = String(raw).replace(/\n$/, '');
    if (value !== raw_) {
      process.stdout.write(
        `  (removed ${raw_.length - value.length} surrounding character(s): whitespace or quotes)\n`,
      );
    }
    const duplicate = duplicateOf(value, collected);
    if (duplicate) {
      const answer = await ask(rl, `  identical to ${duplicate}; is the clipboard stale? Use it anyway? [y/N] `);
      if (!/^y(es)?$/i.test(answer.trim())) continue;
    }
    const complaint = step.check(value);
    if (complaint) {
      // A rejected-but-actually-valid value would be worse than no check, so
      // the operator can override; the portal is the authority, not this regex.
      const answer = await ask(rl, `  ${complaint}. Use it anyway? [y/N] `);
      if (!/^y(es)?$/i.test(answer.trim())) continue;
    }
    return value;
  }
};

const main = async () => {
  const argv = process.argv.slice(2);
  const storeIndex = argv.indexOf('--store');
  const store = storeIndex >= 0 ? argv[storeIndex + 1] : 'both';
  if (!['edge', 'chrome', 'both'].includes(store)) {
    throw new Error(`--store must be edge, chrome, or both (received ${store})`);
  }

  const version = await run('gh', ['--version'], '');
  if (version.code !== 0) {
    throw new Error('the GitHub CLI (gh) is required: https://cli.github.com, then run `gh auth login`');
  }

  process.stdout.write(`Writing secrets into the "${ENVIRONMENT}" environment of ${REPO}.\n`);
  const created = await run('gh', ['api', '-X', 'PUT', `repos/${REPO}/environments/${ENVIRONMENT}`], '');
  if (created.code !== 0) {
    throw new Error(`could not create or read the ${ENVIRONMENT} environment: ${created.stderr.trim()}`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // readline writes the echo itself, so muting has to happen on the output.
  const write = rl.output.write.bind(rl.output);
  rl.output.write = (chunk, ...rest) => (rl.output.muted ? true : write(chunk, ...rest));

  const steps = store === 'both' ? [...STEPS.edge, ...STEPS.chrome] : STEPS[store];
  const stored = [];
  // Kept only for the duplicate check, and only for this process's lifetime.
  const collectedValues = [];
  try {
    for (const step of steps) {
      const value = await collect(rl, step, process.platform, collectedValues);
      const result = await run('gh', secretSetArguments(step.secret), value);
      if (result.code !== 0) {
        throw new Error(`gh secret set ${step.secret} failed: ${result.stderr.trim()}`);
      }
      process.stdout.write(`  stored ${step.secret}\n`);
      stored.push(step.secret);
      collectedValues.push([step.secret, value]);
    }
  } finally {
    rl.close();
  }

  // Read the names back rather than trusting the writes. Values are never
  // readable through the API, which is the point; the names are enough to prove
  // the workflow will find what it looks for.
  const listed = await run('gh', ['secret', 'list', '--repo', REPO, '--env', ENVIRONMENT], '');
  const present = new Set(listed.stdout.split('\n').map((line) => line.split(/\s/)[0]));
  const missing = stored.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new Error(`stored but not listed back: ${missing.join(', ')}`);
  }

  process.stdout.write(
    [
      '',
      `OK: ${stored.length} secret(s) verified in ${ENVIRONMENT}.`,
      '',
      'Next, from the Actions tab: run "Submit to Stores" with upload_only checked,',
      'confirm the draft in the portal, then run it again with upload_only cleared.',
      '',
    ].join('\n'),
  );
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { browserOpenCommand, cleanValue, duplicateOf, secretSetArguments, ENVIRONMENT, REPO, STEPS };
