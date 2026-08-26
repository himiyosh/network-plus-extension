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

const { spawn, execFileSync } = require('node:child_process');
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

const CREDENTIAL_LOCATION_HINT =
  'Store identifiers live in CLAUDE.md (「ストア申請の資格情報」) and in the gitignored ' +
  '.env.edge / .env.cws of the sibling dual-subtitles checkout.';

// The asset list is read from the inventory rather than hard-coded, so a
// re-capture that changes file names cannot leave this script uploading the
// previous set. The store icon is deliberately not touched: it is the product's
// mark, not part of a listing refresh.
function resolveAssets() {
  const inventoryPath = path.join(assetsDir, 'inventory.json');
  if (!existsSync(inventoryPath)) throw new Error(`${inventoryPath} is missing.`);
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  const assets = Array.isArray(inventory.assets) ? inventory.assets : [];
  const byKind = (kind) => assets.filter((asset) => asset.kind === kind).map((asset) => asset.file);

  const screenshots = byKind('screenshot').sort();
  const [promoSmall] = byKind('promotional-tile');
  const [marquee] = byKind('promotional-marquee');
  if (screenshots.length === 0) throw new Error('inventory.json declares no screenshots.');
  if (!promoSmall) throw new Error('inventory.json declares no promotional-tile asset.');
  if (!marquee) throw new Error('inventory.json declares no promotional-marquee asset.');

  const resolve = (file) => {
    const full = path.join(assetsDir, file);
    if (!existsSync(full)) throw new Error(`${full} is declared in inventory.json but missing.`);
    return full;
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

// Environment first, then a local .env, and never a value baked into this file:
// the identifiers have exactly one home per environment and duplicating them
// here is how the two drift apart.
function resolveStoreId(names, envFile, label) {
  const fromEnv = names.map((name) => process.env[name]).find(Boolean);
  if (fromEnv) return fromEnv;
  const fileValues = readEnvFile(path.join(root, envFile));
  const fromFile = names.map((name) => fileValues[name]).find(Boolean);
  if (fromFile) return fromFile;
  throw new Error(
    `${label} was not found. Set ${names.join(' or ')} in the environment or in ${envFile}. ` +
      CREDENTIAL_LOCATION_HINT,
  );
}

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

async function launch({ headless }) {
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

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(500);
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) return child;
    } catch {
      // Not up yet.
    }
  }
  throw new Error(`Chrome did not open a debugging port on ${port}.`);
}

async function connect(playwright) {
  const browser = await playwright.chromium.connectOverCDP(`http://localhost:${port}`);
  const context = browser.contexts()[0];
  return { browser, page: await context.newPage() };
}

// Only ever the browser running on our own profile: the pattern carries the
// profile path, so the operator's own Chrome — a different profile, a different
// port — is never a candidate.
function closeBrowser() {
  for (const pattern of [`--user-data-dir=${profileDir}`, profileDir]) {
    try {
      execFileSync('pkill', ['-f', pattern], { stdio: 'ignore' });
    } catch {
      // None left.
    }
  }
}

async function signedInTo(page, url, marker) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(7000);
  const text = await page.evaluate(() => document.body.innerText);
  return marker.test(text) && !/accounts\.google\.com|login\.microsoftonline/.test(page.url());
}

async function cmdLogin() {
  const playwright = loadPlaywright();
  await launch({ headless: false });
  const { browser, page } = await connect(playwright);
  await page.goto('https://chrome.google.com/webstore/devconsole', { waitUntil: 'domcontentloaded' });
  const second = await browser.contexts()[0].newPage();
  await second.goto('https://partner.microsoft.com/dashboard/microsoftedge/overview', {
    waitUntil: 'domcontentloaded',
  });
  process.stdout.write(
    '\nA browser opened on its own profile, with both consoles.\n' +
      'Sign in to each one, then leave it open and run:\n\n' +
      '  node scripts/publish-store-pages.js status\n\n' +
      'Only these logins ever live in this profile.\n',
  );
  await browser.close();
}

async function cmdStatus() {
  const playwright = loadPlaywright();
  await launch({ headless: true });
  const { browser, page } = await connect(playwright);
  const chrome = await signedInTo(page, 'https://chrome.google.com/webstore/devconsole', /アイテム|Items|Network\+/);
  const edge = await signedInTo(
    page,
    'https://partner.microsoft.com/dashboard/microsoftedge/overview',
    /Network\+|拡張機能|Extensions/,
  );
  process.stdout.write(`Chrome Web Store console: ${chrome ? 'signed in' : 'NOT signed in'}\n`);
  process.stdout.write(`Edge Partner Center:      ${edge ? 'signed in' : 'NOT signed in'}\n`);
  if (!chrome || !edge) process.stdout.write('\nRun `login` and sign in to whichever is missing.\n');
  // status asked a question and has its answer, so it leaves nothing running behind it.
  await browser.close();
  closeBrowser();
  process.exit(0);
}

// Each slot on the Chrome console is its own single-file input, labelled in the
// text around it, and each filled slot carries a remove control labelled with
// the slot's name. So a swap is: clear the slots being replaced, then feed one
// file to one slot at a time, re-finding the input after every upload because
// the page re-renders around it.
async function clearSlot(page, label) {
  for (let round = 0; round < 8; round += 1) {
    const clicked = await page.evaluate((name) => {
      const pattern = new RegExp(`画像を削除.*${name}|remove.*${name}`, 'i');
      const button = [...document.querySelectorAll('button,[role=button]')].find((element) =>
        pattern.test(element.getAttribute('aria-label') || element.innerText || ''),
      );
      if (!button) return false;
      button.click();
      return true;
    }, label);
    if (!clicked) return round;
    await page.waitForTimeout(1200);
  }
  return 8;
}

async function fillSlot(page, labelPattern, file) {
  const index = await page.evaluate((pattern) => {
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
  if (index < 0) return false;
  await page.locator('input[type=file]').nth(index).setInputFiles(file);
  await page.waitForTimeout(4000);
  return true;
}

// Both consoles are localized, so every label is matched in Japanese and in
// English rather than assuming the operator's account language.
const CHROME_SLOTS = {
  screenshot: 'スクリーンショット|Screenshot',
  promoSmall: 'プロモーション タイル（小）|Small promo tile',
  marquee: 'マーキー プロモーション タイル|Marquee promo tile',
};

async function cmdChrome() {
  const assets = resolveAssets();
  const item = resolveStoreId(['CHROME_ITEM_ID', 'CWS_ITEM_ID'], '.env.cws', 'The Chrome item ID');
  const playwright = loadPlaywright();
  await launch({ headless: false });
  const { browser, page } = await connect(playwright);

  await page.goto('https://chrome.google.com/webstore/devconsole', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(7000);
  const account = (page.url().match(/devconsole\/([0-9a-f-]{36})/) || [])[1];
  if (!account) throw new Error('Not signed in to the Chrome console — run `login` first.');

  await page.goto(`https://chrome.google.com/webstore/devconsole/${account}/${item}/edit/listing`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForTimeout(9000);
  const slots = await page.evaluate(() => document.querySelectorAll('input[type=file]').length);
  process.stdout.write(`listing page open, ${slots} slots\n`);

  for (const [name, label] of Object.entries(CHROME_SLOTS)) {
    process.stdout.write(`cleared ${name}: ${await clearSlot(page, label)}\n`);
  }

  for (const [order, file] of assets.screenshots.entries()) {
    const uploaded = await fillSlot(page, CHROME_SLOTS.screenshot, file);
    process.stdout.write(`screenshot ${order + 1}: ${uploaded ? 'uploaded' : 'NO SLOT'}\n`);
    if (!uploaded) break;
  }
  const promo = await fillSlot(page, CHROME_SLOTS.promoSmall, assets.promoSmall);
  process.stdout.write(`promo tile: ${promo ? 'uploaded' : 'NO SLOT'}\n`);
  const marquee = await fillSlot(page, CHROME_SLOTS.marquee, assets.marquee);
  process.stdout.write(`marquee: ${marquee ? 'uploaded' : 'NO SLOT'}\n`);
  await page.waitForTimeout(4000);

  const saved = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button,[role=button]')].find((element) =>
      /下書きとして保存|Save draft/i.test(element.innerText || ''),
    );
    if (!button) return false;
    button.click();
    return true;
  });
  await page.waitForTimeout(8000);
  process.stdout.write(
    saved
      ? 'Saved as a draft. Submit from the console, or with `npm run store:submit`, when the listing reads right.\n'
      : 'Images uploaded but the save control was not found — save it in the window that is open.\n',
  );
  await browser.close();
}

async function cmdEdge() {
  const assets = resolveAssets();
  const product = resolveStoreId(['EDGE_PRODUCT_ID'], '.env.edge', 'The Edge product ID');
  const playwright = loadPlaywright();
  await launch({ headless: false });
  const { browser, page } = await connect(playwright);

  // Partner Center refuses headless requests outright, which is why this one is
  // never run that way; the window it opens is the same window the operator
  // will press Publish in.
  await page.goto(`https://partner.microsoft.com/dashboard/microsoftedge/${product}/listings`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
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

  // Partner Center labels each screenshot's remove control with the file it
  // holds, and the logo's with nothing but "Delete" — so clearing by that exact
  // label is what keeps this away from the logo, which is required and is not
  // part of a listing refresh. Each removal raises a confirmation whose buttons
  // are a custom element, not a <button>.
  const screenshotCount = () => page.locator('img[alt^="Screenshot "]').count();
  const confirmDialog = async () => {
    const button = page.locator('v6_he-button.he-button', { hasText: /^Confirm$/ }).first();
    if (!(await button.count())) return false;
    await button.click({ force: true });
    await page.waitForTimeout(3500);
    return true;
  };

  process.stdout.write(`${await screenshotCount()} screenshots on the listing\n`);
  for (let round = 0; round < 8 && (await screenshotCount()) > 0; round += 1) {
    const buttons = page.locator('[aria-label^="Delete screenshot"]');
    const count = await buttons.count();
    if (!count) break;
    await buttons.nth(count - 1).click({ force: true });
    await page.waitForTimeout(1800);
    await confirmDialog();
  }

  // Uploading on top of slots that did not clear is how a listing ends up with
  // duplicates, and Partner Center keeps what is uploaded whether or not
  // anything is saved afterwards. So the upload only happens once the slots are
  // actually empty.
  const remaining = await screenshotCount();
  if (remaining > 0) {
    process.stdout.write(
      `\n${remaining} screenshots would not delete — nothing was uploaded.\n` +
        'Partner Center locks a listing while a submission is in certification; if one is in\n' +
        'flight, wait for it to finish. The window is open if you want to look.\n',
    );
    await browser.close();
    return;
  }
  process.stdout.write('slots cleared\n');

  for (const [order, file] of assets.screenshots.entries()) {
    const uploaded = await fillSlot(page, 'Screenshot|スクリーンショット', file);
    process.stdout.write(`screenshot ${order + 1}: ${uploaded ? 'uploaded' : 'NO SLOT'}\n`);
    if (!uploaded) break;
  }
  // Edge fills its Large promotional tile slot from the same marquee artwork.
  const promo = await fillSlot(page, 'promotional tile|プロモーション', assets.marquee);
  process.stdout.write(`promotional tile: ${promo ? 'uploaded' : 'no empty slot — remove the old one first'}\n`);

  await page.waitForTimeout(4000);
  process.stdout.write(
    `\n${await screenshotCount()} screenshots now on the listing.\n` +
      'Partner Center keeps image changes as you make them, so check the open window and\n' +
      'publish from Partner Center, or with `npm run store:submit`, when it reads right.\n',
  );
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
    closeBrowser();
    process.exit(1);
  }
}

main();
