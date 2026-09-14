'use strict';
// Swaps the listing images on both extension stores.
//
// `store:submit` already automates everything that has an API: it uploads the
// released archive and submits it for review. The listing images are the part
// it cannot reach. The Chrome Web Store Items API and the Edge Add-ons Update
// API both take packages and nothing else, so the images were the one manual
// step left in the release runbook — replaced here by driving the two consoles,
// which is what a person was otherwise doing by hand.
//
//   node scripts/publish-store-pages.js login    # once: sign in to the stores
//   node scripts/publish-store-pages.js status   # what the profile is signed in to
//   node scripts/publish-store-pages.js chrome   # swap the Chrome listing images
//   node scripts/publish-store-pages.js edge     # swap the Edge listing images
//
// This runs on the release operator's own machine, never in CI: it needs an
// interactive sign-in and a profile that survives between runs.
//
// It uses a Chrome profile of its own, at ~/.network-plus/store-profile, holding
// nothing but the two store logins. That is deliberate. Chrome 136 and later
// refuse remote debugging on the default profile, and the obvious workaround —
// pointing the debugger at a copy of the real profile — puts every cookie the
// browser holds behind an open debugging port. A separate profile costs one
// sign-in and keeps the blast radius to the two stores.
//
// Nothing here submits anything. Both consoles keep the images as a draft, and
// the package still goes out through `npm run store:submit`, so a mistake here
// cannot reach the public listing on its own.
//
// The log is not the listing. Every change below waits for the console to show
// it before moving on, and every run ends by reloading the console and printing
// what it actually holds, because the v1.12.0 and v1.14.0 runs both printed
// success over a draft they had broken.

const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const stateDir = path.join(homedir(), '.network-plus');
const profileDir = path.join(stateDir, 'store-profile');
// playwright-core is installed beside the profile rather than into the
// repository: Chrome refuses to load an unpacked extension that holds a file
// beginning with "_" anywhere beneath it, and a node_modules tree is full of
// them, so the driver stays outside everything the browser reads.
const toolingDir = path.join(stateDir, 'tooling');
// dual-subtitles' equivalent script uses 9333 and shares these store logins.
// A distinct port keeps a run of one from attaching to the other's browser.
const port = Number(process.env.NETWORK_PLUS_STORE_PAGES_PORT || 9334);
const assetsDir = path.join(root, 'docs', 'store-assets');

// These two are identifiers, not credentials, and the project records them for
// exactly this reason: neither does anything without an API key, and the Chrome
// one appears verbatim in the public listing URL. Carrying them here is what
// lets a fresh checkout run this without first hunting through a portal or a
// sibling repository's .env. An environment variable or a local .env still wins,
// so a second product can be driven without editing the file.
const DEFAULT_STORE_IDS = Object.freeze({
  EDGE_PRODUCT_ID: '4fcf1d3e-d1fe-4d4a-a741-97d8d8fa4241',
  CHROME_ITEM_ID: 'mhidipnhdnonbjkfklcohmnnmfggjlpo',
});

// The most screenshots each listing accepts. A set larger than this cannot be
// uploaded whole, so it is refused before anything is removed.
const CHROME_MAX_SCREENSHOTS = 5;
const EDGE_MAX_SCREENSHOTS = 10;

const POLL_INTERVAL_MS = 500;
const REMOVE_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 60000;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The asset list is read from the inventory rather than hard-coded, so a
// re-capture that changes file names cannot leave this script uploading the
// previous set. The store icon is deliberately not touched: it is the product's
// mark, not part of a listing refresh. Each asset carries its digest, which is
// how the Chrome run tells an image that is already on the listing from one
// that has to be replaced.
function resolveAssets() {
  const inventoryPath = path.join(assetsDir, 'inventory.json');
  if (!existsSync(inventoryPath)) throw new Error(`${inventoryPath} is missing.`);
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const assets = Array.isArray(inventory.assets) ? inventory.assets : [];
  const byKind = (kind) => assets.filter((asset) => asset.kind === kind);

  const screenshots = byKind('screenshot').sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const [promoSmall] = byKind('promotional-tile');
  const [marquee] = byKind('promotional-marquee');
  if (screenshots.length === 0) throw new Error('inventory.json declares no screenshots.');
  if (!promoSmall) throw new Error('inventory.json declares no promotional-tile asset.');
  if (!marquee) throw new Error('inventory.json declares no promotional-marquee asset.');

  const resolve = (asset) => {
    const full = path.join(assetsDir, asset.file);
    if (!existsSync(full)) throw new Error(`${full} is declared in inventory.json but missing.`);
    if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height)) {
      throw new Error(`${asset.file} has no integer width and height in inventory.json.`);
    }
    return {
      file: asset.file,
      path: full,
      width: asset.width,
      height: asset.height,
      sha256: sha256(readFileSync(full)),
    };
  };
  return {
    screenshots: screenshots.map(resolve),
    promoSmall: resolve(promoSmall),
    marquee: resolve(marquee),
  };
}

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z_]+)=['"]?([^'"\n]*)['"]?$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

// Environment first, then a local .env, then this repository's own product.
function resolveStoreId(names, envFile, label) {
  const fromEnv = names.map((name) => process.env[name]).find(Boolean);
  if (fromEnv) return fromEnv;
  const fileValues = readEnvFile(path.join(root, envFile));
  const fromFile = names.map((name) => fileValues[name]).find(Boolean);
  if (fromFile) return fromFile;
  const fallback = names.map((name) => DEFAULT_STORE_IDS[name]).find(Boolean);
  if (fallback) return fallback;
  throw new Error(`${label} was not found. Set ${names.join(' or ')} in the environment or in ${envFile}.`);
}

// Decisions.
//
// Everything from here to the browser-driving half is pure: it takes what was
// read off a console and returns what to do, or what to tell the operator. The
// store consoles cannot be run in a test, so this is where the cases that have
// gone wrong on a live listing are pinned down.

// Which browser a command works in, and whether it may stop that browser
// afterwards. A debugging port that already answers belongs to a browser this
// run did not start — typically the `login` window with a sign-in in progress —
// so the command attaches to it and never stops it. Stopping it was how `status`
// killed a half-finished sign-in. Only a browser this run launched headless is
// stopped, because nobody can see it; a visible one is left open for the
// operator to read the draft in and publish from.
function browserSessionPlan({ command, portAnswered }) {
  if (portAnswered) return { launch: false, headless: false, stopOnFinish: false };
  const headless = command === 'status';
  return { launch: true, headless, stopOnFinish: headless };
}

// Polls until `accept` holds for `confirmations` reads in a row, and always
// returns the last value read, so a timeout can report what the console was
// actually showing rather than what was intended. Requiring a second agreeing
// read matters on these consoles: a freshly mutated page under-reports while it
// re-renders, and a transient dip is not a removal.
async function pollUntil(
  read,
  accept,
  { timeoutMs, intervalMs = POLL_INTERVAL_MS, confirmations = 1, sleep = wait, now = Date.now },
) {
  const deadline = now() + timeoutMs;
  let streak = 0;
  for (;;) {
    const value = await read();
    streak = accept(value) ? streak + 1 : 0;
    if (streak >= confirmations) return { landed: true, value };
    if (now() >= deadline) return { landed: false, value };
    await sleep(intervalMs);
  }
}

// What a run had already done to the draft when it stopped. Both consoles keep
// every removal and upload the moment it happens, so a run that fails halfway
// has changed the listing, and saying otherwise is the v1.14.0 defect: "the
// listing is unchanged" printed over a draft with no screenshots left.
function describeChanges({ removed = [], replaced = [], uploaded = [] }) {
  if (removed.length + replaced.length + uploaded.length === 0) {
    return 'Nothing was removed, replaced or uploaded, so the draft is as it was before this run.';
  }
  const list = (items) => (items.length ? items.join(', ') : 'none');
  return [
    'This run changed the draft, and those changes are on it now:',
    `  removed:  ${list(removed)}`,
    `  replaced: ${list(replaced)}`,
    `  uploaded: ${list(uploaded)}`,
  ].join('\n');
}

// Chrome serves the stored original of a listing image when its size options
// are swapped for the asset's own dimensions — the bytes then match the PNG in
// docs/store-assets exactly, which is what lets a run leave a matching image
// alone. googleusercontent URLs carry those options after the last "=" in the
// path; a URL without them gets them appended.
function resizeListingImageUrl(src, width, height) {
  const url = new URL(src);
  const at = url.pathname.lastIndexOf('=');
  const base = at > url.pathname.lastIndexOf('/') ? url.pathname.slice(0, at) : url.pathname;
  url.pathname = `${base}=w${width}-h${height}`;
  return url.toString();
}

// The two Chrome tiles are required slots. The console answers the delete
// confirmation for them and keeps the image, so they are never cleared: an
// image that already matches is left alone, and one that differs is replaced
// through its own input.
const CHROME_TILES = Object.freeze([
  Object.freeze({ slot: 'promoSmall', name: 'small promo tile' }),
  Object.freeze({ slot: 'marquee', name: 'marquee promo tile' }),
]);

// Decides the whole Chrome run from what the listing shows, before anything is
// touched. `observed` is read off the console:
//   screenshots:     [{ label, sha256, reason }] in page order, sha256 null when unreadable
//   screenshotInput: whether an upload input for screenshots is on the page
//   promoSmall, marquee: { present, sha256, reason, input }
//   saveControl:     whether the "Save draft" control is on the page
// `desired` is resolveAssets()'s result.
//
// Screenshots are an ordered set. The leading run that already matches the
// intended files is kept, and only what follows it is removed and re-uploaded,
// so a listing that is already right is not touched and a draft that lost its
// screenshots gets them back without losing anything else. Anything that would
// stop the run partway — a missing input, a tile that can only be replaced but
// has no way to be — is a problem, and any problem refuses the run before the
// first removal.
function planChromeListing(observed, desired) {
  const problems = [];
  if (desired.screenshots.length > CHROME_MAX_SCREENSHOTS) {
    problems.push(
      `inventory.json declares ${desired.screenshots.length} screenshots; the Chrome listing takes at most ${CHROME_MAX_SCREENSHOTS}.`,
    );
  }

  let keep = 0;
  while (
    keep < observed.screenshots.length &&
    keep < desired.screenshots.length &&
    observed.screenshots[keep].sha256 === desired.screenshots[keep].sha256
  ) {
    keep += 1;
  }
  const remove = observed.screenshots.slice(keep).map((shot) => shot.label);
  const upload = desired.screenshots.slice(keep);
  // A full listing hides its upload input until something is removed, so the
  // input can only be required up front when there is room for it to show.
  if (upload.length > 0 && !observed.screenshotInput && observed.screenshots.length < CHROME_MAX_SCREENSHOTS) {
    problems.push(
      'no screenshot upload input was found on the listing page, so new screenshots would have nowhere to go.',
    );
  }

  const tiles = CHROME_TILES.map(({ slot, name }) => {
    const seen = observed[slot];
    const { file, sha256: wanted } = desired[slot];
    if (seen.present && seen.sha256 === wanted) return { slot, name, file, action: 'keep' };
    if (seen.input) return { slot, name, file, action: seen.present ? 'replace' : 'fill' };
    if (seen.present && !seen.sha256) return { slot, name, file, action: 'unverified', reason: seen.reason };
    problems.push(
      seen.present
        ? `the ${name} differs from ${file} and the page offers no input to replace it. It is a required slot, so it is never deleted to make room: replace it by hand, then run this again.`
        : `the ${name} is empty and the page offers no input to fill it with ${file}.`,
    );
    return { slot, name, file, action: 'blocked' };
  });

  if (!observed.saveControl) {
    problems.push('the "Save draft" control was not found, so this is not the listing editor this script expects.');
  }
  return { keep, remove, upload, tiles, problems };
}

// A listing is settled when planning it again finds nothing to do. An image that
// could not be read is not settled: the run cannot claim what it did not see.
function chromeListingSettled(plan) {
  return plan.remove.length === 0 && plan.upload.length === 0 && plan.tiles.every((tile) => tile.action === 'keep');
}

// The tiles this run will put a file into. `keep` needs nothing, and
// `unverified` and `blocked` are exactly the ones it cannot change.
function chromeTilesToPut(plan) {
  return plan.tiles.filter((tile) => tile.action === 'replace' || tile.action === 'fill');
}

// Chrome's labels do not renumber when one is removed — deleting `スクリーンショット 1`
// leaves `2..8` — so removals take the last image each time, never a label
// worked out in advance. Taking from the end is also what keeps the matching
// images at the front in place.
function nextChromeRemoval(labels, keep) {
  return labels.length > keep ? labels[labels.length - 1] : null;
}

// An upload has landed when the screenshot remove controls outnumber what was
// there before it — a positive signal from the console, not a fixed wait.
function chromeUploadLanded(beforeLabels, afterLabels) {
  return afterLabels.length > beforeLabels.length;
}

// A tile has landed when an empty slot shows an image, or a filled one shows a
// different image than it did.
function chromeTileLanded(before, after) {
  if (after.length === 0) return false;
  if (before.length === 0) return true;
  return Boolean(after[0].src) && after[0].src !== before[0].src;
}

// The listing as observed, slot by slot, against the files it should hold.
function formatChromeObservation(observed, desired) {
  const verdict = (seen, asset) => {
    if (!asset) return 'not part of docs/store-assets';
    if (!seen.sha256) return `could not be compared (${seen.reason || 'no reason recorded'})`;
    return seen.sha256 === asset.sha256 ? `matches ${asset.file}` : `differs from ${asset.file}`;
  };
  const lines = [`screenshots: ${observed.screenshots.length} on the listing`];
  observed.screenshots.forEach((seen, index) => {
    lines.push(`  ${index + 1}. ${seen.label} — ${verdict(seen, desired.screenshots[index])}`);
  });
  for (const asset of desired.screenshots.slice(observed.screenshots.length)) {
    lines.push(`  (missing) ${asset.file}`);
  }
  for (const { slot, name } of CHROME_TILES) {
    const seen = observed[slot];
    lines.push(`${name}: ${seen.present ? verdict(seen, desired[slot]) : 'empty'}`);
  }
  return lines;
}

function formatChromePlan(plan) {
  const lines = [
    `keep ${plan.keep} screenshot(s) already matching`,
    `remove ${plan.remove.length}: ${plan.remove.join(', ') || 'none'}`,
    `upload ${plan.upload.length}: ${plan.upload.map((asset) => asset.file).join(', ') || 'none'}`,
  ];
  for (const tile of plan.tiles) {
    const what = {
      keep: `already matches ${tile.file}, left in place`,
      replace: `replace with ${tile.file}`,
      fill: `fill with ${tile.file}`,
      unverified: `could not be compared and has no input, left in place unverified (${tile.reason || 'no reason recorded'})`,
      blocked: 'cannot be changed by this script',
    }[tile.action];
    lines.push(`${tile.name}: ${what}`);
  }
  return lines;
}

// Partner Center keeps the uploaded file name in each screenshot's `alt`
// (`Screenshot screenshot-1-request-detail-1280x800.png`), which makes the
// listing readable in order without downloading anything.
const EDGE_SCREENSHOT_ALT = /^Screenshot (.+)$/;

function edgeScreenshotFiles(alts) {
  return alts
    .map((alt) => EDGE_SCREENSHOT_ALT.exec(alt || ''))
    .filter(Boolean)
    .map((match) => match[1]);
}

// An Edge upload has landed when more images carry its file name than before
// it. Four uploads fed to one input on a fixed wait printed `uploaded` four
// times and landed two, so each one waits for this before the next.
function edgeUploadLanded(beforeAlts, afterAlts, file) {
  const carries = (alt) => alt === file || (alt || '').endsWith(` ${file}`);
  return afterAlts.filter(carries).length > beforeAlts.filter(carries).length;
}

// `from` minus `subtract`, counting duplicates, in `from`'s order.
function multisetDifference(from, subtract) {
  const remaining = new Map();
  for (const item of subtract) remaining.set(item, (remaining.get(item) || 0) + 1);
  return from.filter((item) => {
    const count = remaining.get(item) || 0;
    if (count === 0) return true;
    remaining.set(item, count - 1);
    return false;
  });
}

// Whether a listing holds exactly the intended files in the intended order, and
// if not, what is missing and what should not be there.
function compareListing(intended, observed) {
  return {
    matches: intended.length === observed.length && intended.every((file, index) => observed[index] === file),
    missing: multisetDifference(intended, observed),
    unexpected: multisetDifference(observed, intended),
  };
}

// Edge clears every screenshot before uploading — Partner Center re-encodes
// images, so a listing file cannot be matched to a local one by content — which
// makes checking the page before the first removal the only way to stop safely.
function edgePreflightProblems({ observed, deleteControls, screenshotInput, saveControl, desired }) {
  const problems = [];
  if (desired.length > EDGE_MAX_SCREENSHOTS) {
    problems.push(
      `inventory.json declares ${desired.length} screenshots; the Edge listing takes at most ${EDGE_MAX_SCREENSHOTS}.`,
    );
  }
  if (observed.length > 0 && deleteControls === 0) {
    problems.push(`${observed.length} screenshot(s) are on the listing but no "Delete screenshot" control was found.`);
  }
  if (!screenshotInput && observed.length < EDGE_MAX_SCREENSHOTS) {
    problems.push('no screenshot upload input was found, so the listing would be cleared with nowhere to upload to.');
  }
  if (!saveControl) {
    problems.push(
      'the "Save draft" control was not found. A cleared listing has to be saved and reloaded before the same file names upload again.',
    );
  }
  return problems;
}

function refuseToStart(problems) {
  return (
    `Refusing to start:\n${problems.map((problem) => `- ${problem}`).join('\n')}\n` +
    describeChanges({ removed: [], replaced: [], uploaded: [] })
  );
}

// The browser-driving half.

function chromeBinary() {
  const programFiles = process.env.PROGRAMFILES;
  const programFilesX86 = process.env['PROGRAMFILES(X86)'];
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.NETWORK_PLUS_CHROME_BIN,
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFiles && path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome/Chromium was not found. Set NETWORK_PLUS_CHROME_BIN.');
  return found;
}

function loadPlaywright() {
  const installed = path.join(toolingDir, 'node_modules', 'playwright-core');
  if (!existsSync(installed)) {
    process.stdout.write(`playwright-core is not installed yet; fetching it into ${toolingDir}…\n`);
    mkdirSync(toolingDir, { recursive: true });
    execFileSync('npm', ['install', '--silent', '--no-fund', '--no-audit', 'playwright-core'], {
      cwd: toolingDir,
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
    });
    if (!existsSync(installed)) throw new Error('playwright-core could not be installed.');
  }
  return require(installed);
}

const wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function debuggingPortAnswers() {
  try {
    const response = await fetch(`http://localhost:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    // Nothing is listening.
    return false;
  }
}

// The browser this process started, if any, and whether it is this process's
// to stop. Cleanup only ever reaches this one process — never a pattern match
// over the profile, which also caught a `login` window someone else had open.
let launchedBrowser = null;

async function launch({ headless, stopOnFinish }) {
  mkdirSync(profileDir, { recursive: true });
  const args = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--restore-last-session=false',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');
  const child = spawn(chromeBinary(), args, { detached: true, stdio: 'ignore' });
  child.unref();
  launchedBrowser = { child, stopOnFinish };

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(500);
    if (await debuggingPortAnswers()) return;
    // Chrome hands its arguments to a browser already running on the same
    // profile and exits, so an early exit means the profile is held by a
    // browser that has no debugging port.
    if (child.exitCode !== null) {
      throw new Error(
        'Chrome exited without opening a debugging port: another browser is already running on ' +
          `${profileDir} without one. Close that window and run this again.`,
      );
    }
  }
  throw new Error(`Chrome did not open a debugging port on ${port}.`);
}

function stopLaunchedBrowser() {
  if (!launchedBrowser || !launchedBrowser.stopOnFinish) return;
  const { child } = launchedBrowser;
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}

async function openBrowser(command) {
  const playwright = loadPlaywright();
  const plan = browserSessionPlan({ command, portAnswered: await debuggingPortAnswers() });
  if (plan.launch) {
    await launch(plan);
  } else {
    process.stdout.write(`A browser is already listening on port ${port}; working in it and leaving it running.\n`);
  }
  // Disconnecting from a browser reached over CDP leaves it running, which is
  // what lets a visible window outlive this process.
  const browser = await playwright.chromium.connectOverCDP(`http://localhost:${port}`);
  const context = browser.contexts()[0];
  return { browser, page: await context.newPage() };
}

async function signedInTo(page, url, marker) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  const text = await page.evaluate(() => document.body.innerText);
  return marker.test(text) && !/accounts\.google\.com|login\.microsoftonline/.test(page.url());
}

async function cmdLogin() {
  const { browser, page } = await openBrowser('login');
  await page.goto('https://chrome.google.com/webstore/devconsole', { waitUntil: 'domcontentloaded' });
  const second = await browser.contexts()[0].newPage();
  await second.goto('https://partner.microsoft.com/dashboard/microsoftedge/overview', {
    waitUntil: 'domcontentloaded',
  });
  process.stdout.write(
    '\nA browser opened on its own profile, with both consoles.\n' +
      'Sign in to each one, then leave it open and run:\n\n' +
      '  node scripts/publish-store-pages.js status\n\n' +
      'status checks in this same window and leaves it open.\n' +
      'Only these logins ever live in this profile.\n',
  );
  await browser.close();
}

async function cmdStatus() {
  const { browser, page } = await openBrowser('status');
  let chrome;
  let edge;
  try {
    chrome = await signedInTo(page, 'https://chrome.google.com/webstore/devconsole', /アイテム|Items|Network\+/);
    edge = await signedInTo(
      page,
      'https://partner.microsoft.com/dashboard/microsoftedge/overview',
      /Network\+|拡張機能|Extensions/,
    );
  } finally {
    // Only the tab this opened is closed. The browser itself is stopped only when
    // this run launched it; a window someone is signing in to is left alone.
    await page.close();
    await browser.close();
    stopLaunchedBrowser();
  }
  process.stdout.write(`Chrome Web Store console: ${chrome ? 'signed in' : 'NOT signed in'}\n`);
  process.stdout.write(`Edge Partner Center:      ${edge ? 'signed in' : 'NOT signed in'}\n`);
  if (!chrome || !edge) process.stdout.write('\nRun `login` and sign in to whichever is missing.\n');
  process.exit(0);
}

const printLines = (heading, lines) => {
  process.stdout.write(`${heading}\n${lines.map((line) => `  ${line}`).join('\n')}\n`);
};

// Finds the file input for a slot by the label text around it. The consoles
// re-render around their inputs, so this is re-run before every upload.
async function findSlotInput(page, labelPattern) {
  return page.evaluate((pattern) => {
    const inputs = [...document.querySelectorAll('input[type=file]')];
    return inputs.findIndex((input) => {
      let node = input;
      let text = '';
      for (let up = 0; up < 6 && node; up += 1) {
        node = node.parentElement;
        const candidate = ((node && node.innerText) || '').replace(/\s+/g, ' ');
        if (candidate.length > text.length) text = candidate;
        if (text.length > 40) break;
      }
      return new RegExp(pattern).test(text);
    });
  }, labelPattern);
}

// Each slot on the Chrome console is its own single-file input, labelled in the
// text around it, and each filled slot carries a remove control labelled with
// the slot's name.

// Every slot name is an alternation of its Japanese and English labels, so it
// has to be parenthesized before it is spliced into a larger pattern. Without
// the group the top-level `|` wins and `画像を削除.*スクリーンショット|Screenshot` degrades to
// the bare word `Screenshot`, which matches any control that merely mentions
// one — including the button that adds an image.
function buildRemovePattern(label) {
  return `(?:画像を削除|remove).*(?:${label})`;
}

// Removing an image raises a confirmation ("この操作は元に戻せません" / "cannot be
// undone"). Answering it is not optional: an unanswered dialog leaves the image
// in place, and clicking the remove control again only reopens it. That is how a
// run reported eight cleared slots and deleted nothing.
const CONFIRM_DELETE = /^(?:削除|Delete)$/i;
const DELETION_DIALOG = /元に戻せません|cannot be undone/i;
const CHROME_SAVE_DRAFT = /下書きとして保存|Save draft/i;

// Both consoles are localized, so every label is matched in Japanese and in
// English rather than assuming the operator's account language.
const CHROME_SLOTS = {
  screenshot: 'スクリーンショット|Screenshot',
  promoSmall: 'プロモーション タイル（小）|Small promo tile',
  marquee: 'マーキー プロモーション タイル|Marquee promo tile',
};

// Every Chrome slot's remove controls, each with the preview image beside it.
// The preview is the nearest ancestor of the control that holds an image, as
// long as that ancestor holds no other slot's remove control — past that point
// the image could belong to anyone, so it is reported as not found instead.
async function readChromeDom(page) {
  const patterns = Object.fromEntries(
    Object.entries(CHROME_SLOTS).map(([name, label]) => [name, buildRemovePattern(label)]),
  );
  return page.evaluate(
    ([slotPatterns, anyRemoveSource, saveSource]) => {
      const labelOf = (element) => (element.getAttribute('aria-label') || element.innerText || '').trim();
      const sourceOf = (image) => image.currentSrc || image.src || '';
      const anyRemove = new RegExp(anyRemoveSource, 'i');
      const controls = [...document.querySelectorAll('button,[role=button]')];
      const previewOf = (control) => {
        let node = control.parentElement;
        for (let up = 0; node && up < 8; up += 1, node = node.parentElement) {
          const removes = new Set(
            [...node.querySelectorAll('button,[role=button]')].map(labelOf).filter((text) => anyRemove.test(text)),
          );
          if (removes.size > 1) return null;
          const image = [...node.querySelectorAll('img')].find((img) => /^https:\/\//.test(sourceOf(img)));
          if (image) return sourceOf(image);
        }
        return null;
      };
      const out = {
        saveControl: controls.some((element) => new RegExp(saveSource, 'i').test(element.innerText || '')),
      };
      for (const [name, source] of Object.entries(slotPatterns)) {
        const match = new RegExp(source, 'i');
        const seen = new Set();
        out[name] = controls
          .filter((element) => match.test(labelOf(element)))
          .filter((element) => !seen.has(labelOf(element)) && seen.add(labelOf(element)))
          .map((element) => ({ label: labelOf(element), src: previewOf(element) }));
      }
      return out;
    },
    [patterns, buildRemovePattern('.+'), CHROME_SAVE_DRAFT.source],
  );
}

async function fingerprintListingImage(page, src, asset) {
  if (!src) return { sha256: null, reason: 'no preview image found beside its remove control' };
  const url = resizeListingImageUrl(src, asset.width, asset.height);
  try {
    const response = await page.context().request.get(url, { timeout: 30000 });
    if (!response.ok()) return { sha256: null, reason: `HTTP ${response.status()} for ${url}` };
    return { sha256: sha256(await response.body()) };
  } catch (error) {
    // Reported beside the slot and treated as not matching, never as a match.
    return { sha256: null, reason: error.message.split('\n')[0] };
  }
}

async function observeChromeListing(page, assets) {
  const dom = await readChromeDom(page);
  const screenshots = [];
  for (const [index, entry] of dom.screenshot.entries()) {
    const asset = assets.screenshots[index];
    const print = asset
      ? await fingerprintListingImage(page, entry.src, asset)
      : { sha256: null, reason: 'beyond the intended set' };
    screenshots.push({ label: entry.label, ...print });
  }
  const tile = async (slot) => {
    const input = (await findSlotInput(page, CHROME_SLOTS[slot])) >= 0;
    const [entry] = dom[slot];
    if (!entry) return { present: false, sha256: null, input };
    return {
      present: true,
      label: entry.label,
      input,
      ...(await fingerprintListingImage(page, entry.src, assets[slot])),
    };
  };
  return {
    screenshots,
    screenshotInput: (await findSlotInput(page, CHROME_SLOTS.screenshot)) >= 0,
    promoSmall: await tile('promoSmall'),
    marquee: await tile('marquee'),
    saveControl: dom.saveControl,
  };
}

async function clickChromeRemove(page, label) {
  return page.evaluate(
    ([target, confirmSource, dialogSource]) => {
      const control = [...document.querySelectorAll('button,[role=button]')].find(
        (element) => (element.getAttribute('aria-label') || element.innerText || '').trim() === target,
      );
      if (!control) return 'control-vanished';
      control.click();
      return new Promise((done) => {
        setTimeout(() => {
          const dialog = [...document.querySelectorAll('[role=dialog],[role=alertdialog],mat-dialog-container')].find(
            (node) => new RegExp(dialogSource, 'i').test(node.innerText || ''),
          );
          if (!dialog) return done('no-dialog');
          const confirm = [...dialog.querySelectorAll('button,[role=button]')].find((node) =>
            new RegExp(confirmSource, 'i').test((node.innerText || '').trim()),
          );
          if (!confirm) return done('no-confirm-control');
          confirm.click();
          done('confirmed');
        }, 1500);
      });
    },
    [label, CONFIRM_DELETE.source, DELETION_DIALOG.source],
  );
}

const readChromeScreenshotLabels = async (page) => (await readChromeDom(page)).screenshot.map((entry) => entry.label);

async function removeChromeScreenshots(page, keep, journal) {
  const rounds = (await readChromeScreenshotLabels(page)).length - keep;
  for (let round = 0; round < rounds; round += 1) {
    const before = await readChromeScreenshotLabels(page);
    const label = nextChromeRemoval(before, keep);
    if (!label) break;
    const outcome = await clickChromeRemove(page, label);
    const result = await pollUntil(
      () => readChromeScreenshotLabels(page),
      (after) => after.length < before.length,
      { timeoutMs: REMOVE_TIMEOUT_MS, confirmations: 2 },
    );
    if (!result.landed) {
      throw new Error(
        `"${label}" would not remove (${outcome}); the listing still shows ${result.value.length} screenshot(s): ` +
          `${result.value.join(', ') || 'none'}.`,
      );
    }
    journal.removed.push(label);
    process.stdout.write(`removed ${label} — ${result.value.length} screenshot(s) left\n`);
  }
  const left = await readChromeScreenshotLabels(page);
  if (left.length !== keep) {
    throw new Error(`expected ${keep} screenshot(s) left after removing, but the listing shows ${left.length}.`);
  }
}

async function uploadChromeScreenshot(page, asset, journal) {
  const before = await readChromeScreenshotLabels(page);
  const index = await findSlotInput(page, CHROME_SLOTS.screenshot);
  if (index < 0) {
    throw new Error(
      `no screenshot input was left for ${asset.file}; the listing shows ${before.length} screenshot(s).`,
    );
  }
  await page.locator('input[type=file]').nth(index).setInputFiles(asset.path);
  const result = await pollUntil(
    () => readChromeScreenshotLabels(page),
    (after) => chromeUploadLanded(before, after),
    { timeoutMs: UPLOAD_TIMEOUT_MS, confirmations: 2 },
  );
  if (!result.landed) {
    throw new Error(
      `${asset.file} was given to the screenshot input but did not appear within ${UPLOAD_TIMEOUT_MS / 1000}s; ` +
        `the listing shows ${result.value.length} screenshot(s): ${result.value.join(', ') || 'none'}.`,
    );
  }
  journal.uploaded.push(asset.file);
  process.stdout.write(`uploaded ${asset.file} — ${result.value.length} screenshot(s) on the listing\n`);
}

async function putChromeTile(page, tile, asset, journal) {
  const before = (await readChromeDom(page))[tile.slot];
  const index = await findSlotInput(page, CHROME_SLOTS[tile.slot]);
  if (index < 0) throw new Error(`the ${tile.name} input disappeared before ${asset.file} could be given to it.`);
  await page.locator('input[type=file]').nth(index).setInputFiles(asset.path);
  const result = await pollUntil(
    async () => (await readChromeDom(page))[tile.slot],
    (after) => chromeTileLanded(before, after),
    { timeoutMs: UPLOAD_TIMEOUT_MS, confirmations: 2 },
  );
  if (!result.landed) {
    throw new Error(
      `${asset.file} was given to the ${tile.name} input but the slot did not change within ${UPLOAD_TIMEOUT_MS / 1000}s ` +
        `(${!result.value.length ? 'it shows no image' : result.value[0].src ? 'it shows the same image as before' : 'its preview could not be read, so the change could not be confirmed'}).`,
    );
  }
  journal.replaced.push(`${tile.name} (now ${asset.file})`);
  process.stdout.write(`${tile.name}: now ${asset.file}\n`);
}

async function openChromeListing(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(9000);
}

async function cmdChrome() {
  const assets = resolveAssets();
  const item = resolveStoreId(['CHROME_ITEM_ID', 'CWS_ITEM_ID'], '.env.cws', 'The Chrome item ID');
  const { browser, page } = await openBrowser('chrome');

  await page.goto('https://chrome.google.com/webstore/devconsole', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  const account = (page.url().match(/devconsole\/([0-9a-f-]{36})/) || [])[1];
  if (!account) throw new Error('Not signed in to the Chrome console — run `login` first.');

  const listingUrl = `https://chrome.google.com/webstore/devconsole/${account}/${item}/edit/listing`;
  await openChromeListing(page, listingUrl);

  // Everything that can refuse the run is read and decided here, before the
  // first change, because the first change is already on the draft.
  const observed = await observeChromeListing(page, assets);
  printLines('The listing holds:', formatChromeObservation(observed, assets));
  const plan = planChromeListing(observed, assets);
  printLines('Plan:', formatChromePlan(plan));
  if (plan.problems.length > 0) throw new Error(refuseToStart(plan.problems));
  if (chromeListingSettled(plan)) {
    process.stdout.write('The listing already matches docs/store-assets; nothing to do.\n');
    await page.close();
    await browser.close();
    return;
  }
  if (plan.remove.length + plan.upload.length + chromeTilesToPut(plan).length === 0) {
    process.exitCode = 1;
    process.stdout.write(
      'Nothing is left that this script can change, but the listing is not confirmed to match:\n' +
        'check the slots marked "could not be compared" in the open window.\n',
    );
    await browser.close();
    return;
  }

  const journal = { removed: [], replaced: [], uploaded: [] };
  let after;
  try {
    // The tiles go first: replacing one removes nothing, so if it fails the
    // screenshots have not been touched yet.
    for (const tile of chromeTilesToPut(plan)) await putChromeTile(page, tile, assets[tile.slot], journal);
    await removeChromeScreenshots(page, plan.keep, journal);
    for (const asset of plan.upload) await uploadChromeScreenshot(page, asset, journal);

    const saved = await page.evaluate((source) => {
      const button = [...document.querySelectorAll('button,[role=button]')].find((element) =>
        new RegExp(source, 'i').test(element.innerText || ''),
      );
      if (!button) return false;
      button.click();
      return true;
    }, CHROME_SAVE_DRAFT.source);
    if (!saved) throw new Error('the "Save draft" control disappeared before the draft could be saved.');
    await page.waitForTimeout(8000);

    // What was intended is not what gets reported: the listing is reloaded and
    // read again, because a freshly mutated console under-reports while it settles.
    await openChromeListing(page, listingUrl);
    after = await observeChromeListing(page, assets);
  } catch (error) {
    error.message = `${error.message}\n\n${describeChanges(journal)}\nThe window is left open on the listing.`;
    throw error;
  }
  printLines('After saving and reloading, the listing holds:', formatChromeObservation(after, assets));
  if (chromeListingSettled(planChromeListing(after, assets))) {
    process.stdout.write(
      'Saved as a draft. Submit from the console, or with `npm run store:submit`, when the listing reads right.\n',
    );
  } else {
    process.exitCode = 1;
    process.stdout.write(
      `\nThe saved draft does not match docs/store-assets — see the list above.\n${describeChanges(journal)}\n` +
        'The window is left open on the listing.\n',
    );
  }
  await browser.close();
}

// Partner Center labels each screenshot's remove control "Delete screenshot…",
// and the logo's with nothing but "Delete" — so clearing by that prefix is what
// keeps this away from the logo, which is required and is not part of a listing
// refresh.
const EDGE_DELETE_SCREENSHOT = '[aria-label^="Delete screenshot"]';
const EDGE_SLOTS = {
  screenshot: 'Screenshot|スクリーンショット',
  promoTile: 'promotional tile|プロモーション',
};
const EDGE_SAVE_DRAFT = /^\s*(?:Save draft|下書きを保存|下書きとして保存)\s*$/i;

const readEdgeAlts = (page) =>
  page.evaluate(() => [...document.querySelectorAll('img[alt]')].map((image) => image.getAttribute('alt')));
const readEdgeScreenshots = async (page) => edgeScreenshotFiles(await readEdgeAlts(page));
const edgeSaveDraftControl = (page) =>
  page.locator('button,[role=button],v6_he-button,he-button', { hasText: EDGE_SAVE_DRAFT }).first();

// The confirmation is a custom element rather than a <button>, and the exact
// tag has moved between console versions, so the known control is tried first
// and any confirm-shaped control inside a dialog second. The search is never
// widened to the whole document: a stray "Delete" elsewhere on a listing page
// is not a confirmation, and clicking one blind is worse than stopping.
async function confirmEdgeDialog(page) {
  const known = page.locator('v6_he-button.he-button', { hasText: /^Confirm$/ }).first();
  if (await known.count()) {
    await known.click({ force: true });
    return 'confirmed';
  }
  return page.evaluate(() => {
    const accepts = /^(?:confirm|ok|yes|delete|確認|はい|削除)$/i;
    const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')];
    if (dialogs.length === 0) return 'no-dialog';
    for (const dialog of dialogs) {
      const control = [
        ...dialog.querySelectorAll('button,[role=button],v6_he-button,he-button,[class*=he-button]'),
      ].find((node) => accepts.test((node.innerText || '').trim()));
      if (control) {
        control.click();
        return 'confirmed';
      }
    }
    return 'no-confirm-control';
  });
}

// Partner Center refuses headless requests outright, which is why this one is
// never run that way; the window it opens is the same window the operator will
// press Publish in.
async function openEdgeEditor(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(12000);
  if (/login\.microsoftonline/.test(page.url())) {
    throw new Error('Not signed in to Partner Center — run `login` first.');
  }
  const opened = await page.evaluate(() => {
    const link = [...document.querySelectorAll('button,a,[role=button]')].find((element) =>
      /詳細を編集|Edit details/i.test(element.innerText || ''),
    );
    if (!link) return false;
    link.click();
    return true;
  });
  await page.waitForTimeout(10000);
  process.stdout.write(opened ? 'listing editor open\n' : 'listing editor was already open\n');
}

async function saveEdgeDraft(page) {
  const control = edgeSaveDraftControl(page);
  if (!(await control.count())) {
    throw new Error('the "Save draft" control disappeared before the draft could be saved.');
  }
  await control.click({ force: true });
  await page.waitForTimeout(8000);
}

async function clearEdgeScreenshots(page, journal) {
  const rounds = (await readEdgeScreenshots(page)).length;
  for (let round = 0; round < rounds; round += 1) {
    const before = await readEdgeScreenshots(page);
    if (before.length === 0) break;
    const buttons = page.locator(EDGE_DELETE_SCREENSHOT);
    const count = await buttons.count();
    if (!count) {
      throw new Error(`${before.length} screenshot(s) are on the listing but no "Delete screenshot" control is.`);
    }
    await buttons.nth(count - 1).click({ force: true });
    await page.waitForTimeout(1800);
    const confirmation = await confirmEdgeDialog(page);
    const result = await pollUntil(
      () => readEdgeScreenshots(page),
      (after) => after.length < before.length,
      { timeoutMs: REMOVE_TIMEOUT_MS, confirmations: 2 },
    );
    if (!result.landed) {
      throw new Error(
        `a screenshot would not delete (the confirmation attempt reported: ${confirmation}); the listing still ` +
          `shows ${result.value.join(', ') || 'none'}.\n\n` +
          'Two different causes look identical from here, so check before assuming either.\n' +
          'Partner Center locks a listing while a submission is in certification — but a product\n' +
          'reading "In the Store" on the overview is not locked, and this message has blamed a\n' +
          'lock that was not there. If the product is not in certification, the confirmation\n' +
          'control has moved and the selector above needs updating.',
      );
    }
    const removed = multisetDifference(before, result.value);
    journal.removed.push(...removed);
    process.stdout.write(`removed ${removed.join(', ')}\n`);
  }
  const left = await readEdgeScreenshots(page);
  if (left.length > 0) throw new Error(`${left.length} screenshot(s) are still on the listing: ${left.join(', ')}.`);
}

// Gives one file to the slot's input and waits for an image carrying its name.
// Returns whether it landed; the caller decides whether a miss stops the run.
async function uploadEdgeImage(page, slotPattern, asset, journal) {
  const before = await readEdgeAlts(page);
  const index = await findSlotInput(page, slotPattern);
  if (index < 0) {
    throw new Error(
      `no upload input was found for ${asset.file}; the listing's screenshots are: ` +
        `${edgeScreenshotFiles(before).join(', ') || 'none'}.`,
    );
  }
  await page.locator('input[type=file]').nth(index).setInputFiles(asset.path);
  const result = await pollUntil(
    () => readEdgeAlts(page),
    (after) => edgeUploadLanded(before, after, asset.file),
    { timeoutMs: UPLOAD_TIMEOUT_MS, confirmations: 2 },
  );
  if (result.landed) {
    journal.uploaded.push(asset.file);
    process.stdout.write(`uploaded ${asset.file}\n`);
  }
  return result;
}

async function cmdEdge() {
  const assets = resolveAssets();
  const product = resolveStoreId(['EDGE_PRODUCT_ID'], '.env.edge', 'The Edge product ID');
  const { browser, page } = await openBrowser('edge');
  const listingsUrl = `https://partner.microsoft.com/dashboard/microsoftedge/${product}/listings`;
  await openEdgeEditor(page, listingsUrl);

  const observed = await readEdgeScreenshots(page);
  printLines(`${observed.length} screenshot(s) on the listing:`, observed.length ? observed : ['none']);
  const problems = edgePreflightProblems({
    observed,
    deleteControls: await page.locator(EDGE_DELETE_SCREENSHOT).count(),
    screenshotInput: (await findSlotInput(page, EDGE_SLOTS.screenshot)) >= 0,
    saveControl: (await edgeSaveDraftControl(page).count()) > 0,
    desired: assets.screenshots,
  });
  if (problems.length > 0) throw new Error(refuseToStart(problems));

  const journal = { removed: [], replaced: [], uploaded: [] };
  let tileUnconfirmed = false;
  let final;
  try {
    await clearEdgeScreenshots(page, journal);
    // A file name deleted in this editor session did not upload again until the
    // draft was saved and the editor reloaded, and every name here is about to
    // be uploaded again.
    if (journal.removed.length > 0) {
      await saveEdgeDraft(page);
      await openEdgeEditor(page, listingsUrl);
      const reloaded = await readEdgeScreenshots(page);
      if (reloaded.length > 0) {
        throw new Error(
          `after saving and reloading, ${reloaded.length} screenshot(s) are back on the draft: ${reloaded.join(', ')}.`,
        );
      }
    }
    // One at a time, each waiting for its own name to appear before the next.
    for (const asset of assets.screenshots) {
      const result = await uploadEdgeImage(page, EDGE_SLOTS.screenshot, asset, journal);
      if (!result.landed) {
        throw new Error(
          `${asset.file} was given to the upload input but no image carrying that name appeared within ` +
            `${UPLOAD_TIMEOUT_MS / 1000}s; the listing's screenshots are: ` +
            `${edgeScreenshotFiles(result.value).join(', ') || 'none'}.`,
        );
      }
    }
    // Edge fills its Large promotional tile slot from the same marquee artwork.
    // Only the screenshot alt has been observed carrying a file name, so a tile
    // that shows no such image is reported unconfirmed rather than stopping the
    // run before the screenshots that did land are saved.
    if ((await findSlotInput(page, EDGE_SLOTS.promoTile)) >= 0) {
      const result = await uploadEdgeImage(page, EDGE_SLOTS.promoTile, assets.marquee, journal);
      if (!result.landed) {
        tileUnconfirmed = true;
        process.stdout.write(
          `promotional tile: ${assets.marquee.file} was given to its input, but no image carrying that name appeared\n`,
        );
      }
    } else {
      process.stdout.write(
        'promotional tile: no empty slot, left as it is — remove the old one by hand to replace it\n',
      );
    }
    await saveEdgeDraft(page);
    await openEdgeEditor(page, listingsUrl);
    final = await readEdgeScreenshots(page);
  } catch (error) {
    error.message = `${error.message}\n\n${describeChanges(journal)}\nThe window is left open on the listing.`;
    throw error;
  }

  printLines(
    `After saving and reloading, ${final.length} screenshot(s) on the listing:`,
    final.length ? final : ['none'],
  );
  const comparison = compareListing(
    assets.screenshots.map((asset) => asset.file),
    final,
  );
  if (comparison.matches && !tileUnconfirmed) {
    process.stdout.write(
      'The draft holds the intended screenshots in order. Check the open window and publish from\n' +
        'Partner Center, or with `npm run store:submit`, when it reads right.\n',
    );
  } else {
    process.exitCode = 1;
    process.stdout.write(
      `\n${comparison.matches ? 'The screenshots are in order, but the promotional tile is unconfirmed.' : 'The saved draft does not hold the intended screenshots in order.'}\n` +
        `  missing:    ${comparison.missing.join(', ') || 'none'}\n` +
        `  unexpected: ${comparison.unexpected.join(', ') || 'none'}\n` +
        `${describeChanges(journal)}\nThe window is left open on the listing.\n`,
    );
  }
  await browser.close();
}

const commands = { login: cmdLogin, status: cmdStatus, chrome: cmdChrome, edge: cmdEdge };

async function main() {
  const command = commands[process.argv[2]];
  if (!command) {
    process.stderr.write('Usage: node scripts/publish-store-pages.js login|status|chrome|edge\n');
    process.exit(1);
  }
  try {
    await command();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    // Only the headless browser `status` launched is stopped. A visible window is
    // left for the operator to inspect the draft in, and a browser this run
    // attached to was never its to stop.
    stopLaunchedBrowser();
    process.exit(1);
  }
}

if (require.main === module) main();

// Exported for tests. The browser-driving halves need a console to run against;
// the decisions and patterns are pure and are exactly where this script has
// gone wrong, so they are testable on their own.
module.exports = {
  CHROME_MAX_SCREENSHOTS,
  CHROME_SLOTS,
  CONFIRM_DELETE,
  DELETION_DIALOG,
  EDGE_MAX_SCREENSHOTS,
  browserSessionPlan,
  buildRemovePattern,
  chromeListingSettled,
  chromeTileLanded,
  chromeTilesToPut,
  chromeUploadLanded,
  compareListing,
  describeChanges,
  edgePreflightProblems,
  edgeScreenshotFiles,
  edgeUploadLanded,
  formatChromeObservation,
  multisetDifference,
  nextChromeRemoval,
  planChromeListing,
  pollUntil,
  refuseToStart,
  resizeListingImageUrl,
  resolveAssets,
  resolveStoreId,
};
