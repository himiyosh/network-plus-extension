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

// Chrome's slot labels do not renumber when one is removed — deleting
// `スクリーンショット 1` leaves `2..8` — so each pass re-reads the labels and targets an
// exact one rather than assuming the list closed up.
async function clearSlotImages(page, label) {
  const pattern = buildRemovePattern(label);
  let removed = 0;

  for (let round = 0; round < 12; round += 1) {
    const labels = await page.evaluate((source) => {
      const match = new RegExp(source, 'i');
      return [...document.querySelectorAll('button,[role=button]')]
        .map((element) => (element.getAttribute('aria-label') || element.innerText || '').trim())
        .filter((text) => match.test(text));
    }, pattern);
    if (labels.length === 0) return removed;

    const outcome = await page.evaluate(
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
      [labels[0], CONFIRM_DELETE.source, DELETION_DIALOG.source],
    );
    await page.waitForTimeout(3500);

    const remaining = await page.evaluate((source) => {
      const match = new RegExp(source, 'i');
      return [...document.querySelectorAll('button,[role=button]')].filter((element) =>
        match.test((element.getAttribute('aria-label') || element.innerText || '').trim()),
      ).length;
    }, pattern);

    if (remaining >= labels.length) {
      throw new Error(
        `"${labels[0]}" would not clear (${outcome}); ${remaining} still on the listing. ` +
          'Nothing was uploaded, so the listing is unchanged. Uploading onto slots that did not ' +
          'clear is how a listing ends up with duplicates, so this stops here.',
      );
    }
    removed += 1;
  }

  throw new Error(`clearing "${label}" did not finish within 12 rounds; nothing was uploaded.`);
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

  // A slot that will not clear throws, which reaches main() and stops the run
  // before a single upload — the same guard the Edge path has always had.
  for (const [name, label] of Object.entries(CHROME_SLOTS)) {
    process.stdout.write(`cleared ${name}: ${await clearSlotImages(page, label)}\n`);
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
  // The confirmation is a custom element rather than a <button>, and the exact
  // tag has moved between console versions, so the known control is tried first
  // and any confirm-shaped control inside a dialog second. The search is never
  // widened to the whole document: a stray "Delete" elsewhere on a listing page
  // is not a confirmation, and clicking one blind is worse than stopping.
  const confirmDialog = async () => {
    const known = page.locator('v6_he-button.he-button', { hasText: /^Confirm$/ }).first();
    if (await known.count()) {
      await known.click({ force: true });
      await page.waitForTimeout(3500);
      return 'confirmed';
    }
    const outcome = await page.evaluate(() => {
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
    await page.waitForTimeout(3500);
    return outcome;
  };

  process.stdout.write(`${await screenshotCount()} screenshots on the listing\n`);
  let lastConfirm = 'not attempted';
  for (let round = 0; round < 8 && (await screenshotCount()) > 0; round += 1) {
    const buttons = page.locator('[aria-label^="Delete screenshot"]');
    const count = await buttons.count();
    if (!count) break;
    await buttons.nth(count - 1).click({ force: true });
    await page.waitForTimeout(1800);
    lastConfirm = await confirmDialog();
  }

  // Uploading on top of slots that did not clear is how a listing ends up with
  // duplicates, and Partner Center keeps what is uploaded whether or not
  // anything is saved afterwards. So the upload only happens once the slots are
  // actually empty.
  const remaining = await screenshotCount();
  if (remaining > 0) {
    process.stdout.write(
      `\n${remaining} screenshots would not delete — nothing was uploaded, so the listing is unchanged.\n` +
        `The last confirmation attempt reported: ${lastConfirm}.\n\n` +
        'Two different causes look identical from here, so check before assuming either.\n' +
        'Partner Center locks a listing while a submission is in certification — but a product\n' +
        'reading "In the Store" on the overview is not locked, and this message has blamed a\n' +
        'lock that was not there. If the product is not in certification, the confirmation\n' +
        'control has moved and the selector above needs updating. The window is open.\n',
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

if (require.main === module) main();

// Exported for tests. The browser-driving halves need a console to run against,
// but the label and confirmation patterns are pure and are exactly where this
// script has gone wrong, so they are testable on their own.
module.exports = {
  CHROME_SLOTS,
  CONFIRM_DELETE,
  DELETION_DIALOG,
  buildRemovePattern,
  resolveStoreId,
};
