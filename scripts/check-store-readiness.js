const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const EDGE_DOSSIER_PATH = 'docs/edge-addons-submission.md';
const CHROME_DOSSIER_PATH = 'docs/chrome-web-store-submission.md';
const PACKAGE_PATH = 'package.json';
const PRIVACY_PATH = 'docs/privacy.md';
const INVENTORY_PATH = 'docs/store-assets/inventory.json';
const ASSET_DIRECTORY = 'docs/store-assets';
// The synthetic store assets and the privacy notice are reviewed independently.
// Keep the dates separate so a privacy-text change does not imply the PNG
// inventory was re-reviewed on the same day.
const ASSET_REVIEW_DATE = '2026-08-20';
const PRIVACY_REVIEW_DATE = '2026-08-18';
const MIN_DESCRIPTION_CHARACTERS = 250;
const MAX_DESCRIPTION_CHARACTERS = 10000;
const MAX_SEARCH_TERMS = 7;
const MAX_SEARCH_WORDS = 21;
const MAX_SEARCH_TERM_CHARACTERS = 30;
const EXPECTED_WEBSITE_URL = 'https://github.com/himiyosh/network-plus-extension';
const EXPECTED_SUPPORT_URL = 'https://github.com/himiyosh/network-plus-extension/issues/new/choose';
const EXPECTED_PRIVACY_URL = 'https://github.com/himiyosh/network-plus-extension/blob/main/docs/privacy.md';
const EXPECTED_REPOSITORY_URL = 'git+https://github.com/himiyosh/network-plus-extension.git';
const EXPECTED_CSP = "script-src 'self'; object-src 'self'";
const EXPECTED_RELEASE_SHA256 = 'c0f3018ff0cf30b868a41c9937452f776d6f1c99daa523a7998a58991e75175f';
const EXPECTED_PERMISSION_JUSTIFICATION =
  'Stores the user-selected System, Dark, or Light theme and boolean search preferences (scope checkboxes, case / whole-word / regular-expression options, and the Matches only state) in `chrome.storage.local` so these settings persist between DevTools sessions. This permission is not used to store search keyword text, captured URLs, headers, request bodies, response bodies, cookies, or request records.';
const EXPECTED_SEARCH_TERMS = Object.freeze([
  'network debugging',
  'developer tools',
  'HTTP inspector',
  'HAR export',
  'request filtering',
  'response timing',
  'Edge DevTools',
]);
const REQUIRED_EDGE_DOSSIER_SECTIONS = Object.freeze([
  'Submission status and evidence boundary',
  'Developer account prerequisites',
  'Store properties',
  'Store listing (en-US)',
  'Privacy declarations',
  'Certification testing notes',
  'Asset inventory',
  'Source record',
]);
const REQUIRED_CHROME_DOSSIER_SECTIONS = Object.freeze([
  'Submission status and evidence boundary',
  'Developer account prerequisites',
  'Store listing (en-US)',
  'Graphic assets',
  'Privacy practices',
  'Distribution recommendation',
  'Test instructions',
  'Final operator checklist',
  'Source record',
]);
const REQUIRED_PRIVACY_SECTIONS = Object.freeze([
  'Scope',
  'Data Network+ can access',
  'Collection and transmission',
  'Chrome Web Store limited use',
  'Local preferences',
  'Retention and user controls',
  'Clipboard and HAR output',
  'Support',
  'Policy changes',
]);
const REQUIRED_EDGE_DOSSIER_TEXT = Object.freeze([
  'This dossier is a repository-local recommendation for a future Partner Center submission.',
  'No verifiable Microsoft Edge Add-ons listing URL was found in repository evidence.',
  '**Single-purpose statement:**',
  '**Remote code answer:** `No, I am not using remote code.`',
  'Network traffic can contain personal or sensitive information',
  'Captured traffic is not sent to or stored in developer-controlled systems.',
  'Clipboard payloads and HAR files are created only after a user action.',
  'No account, credentials, subscription, remote service, or live customer traffic is required.',
  'No network traffic was sent',
  'Undo clear',
  'Export sanitized HAR',
  EXPECTED_RELEASE_SHA256,
]);
const REQUIRED_CHROME_DOSSIER_TEXT = Object.freeze([
  'This dossier is a repository-local recommendation for a future Chrome Web Store submission.',
  'The digest is safe to publish and is useful for integrity checking, but it is not a publisher signature',
  '**Single-purpose description:**',
  '**Remote code answer:** `No, I am not using remote code.`',
  'Do not select a no-data answer merely because processing remains on the device.',
  'Captured traffic is not sent to or stored in developer-controlled systems.',
  'Clipboard payloads and HAR files are created only after a user action.',
  'No account, credentials, subscription, remote service, or live customer traffic is required.',
  'chrome-small-promo-440x280.png',
  'No network traffic was sent.',
  'Undo clear',
  'Export sanitized HAR',
  EXPECTED_RELEASE_SHA256,
]);
const REQUIRED_PRIVACY_TEXT = Object.freeze([
  `Last updated: ${PRIVACY_REVIEW_DATE}`,
  'Microsoft Edge and Google Chrome DevTools extension',
  'URLs, query values, request and response headers, cookies, request bodies, response bodies',
  'Network+ does not send captured traffic, usage data, or diagnostics to the developer or to third parties.',
  'It does not use this data for advertising, profiling, creditworthiness, or any unrelated purpose.',
  'Network+ does not sell or transfer inspected traffic to the developer or to third parties',
  'Network+ stores only UI preferences locally:',
  'Search results, selected rows, captured request records, headers, and bodies are not written to persistent storage by Network+.',
  'one bounded Undo snapshot for up to 10 seconds',
  'Sanitized output is the default.',
  'one-time confirmation for that action',
  EXPECTED_SUPPORT_URL,
]);
// ko-fi.com is reachable only through the optional Support dialog and the README
// support section. Network+ sends it no data; widening this set is a deliberate,
// reviewed decision rather than an incidental link.
const ALLOWED_URL_HOSTS = new Set(['developer.chrome.com', 'github.com', 'learn.microsoft.com', 'ko-fi.com']);
const PLACEHOLDER_PATTERN =
  /\b(?:TODO|TBD|FIXME|CHANGEME|PLACEHOLDER)\b|(?:insert|replace)\s+(?:text|url|value)\s+here/i;
const PROHIBITED_CLAIMS = Object.freeze([
  'now available on Microsoft Edge Add-ons',
  'published in Microsoft Edge Add-ons',
  'certified by Microsoft',
  'approved by Microsoft',
  'Partner Center approved',
  'publication complete',
  'now available on the Chrome Web Store',
  'published in the Chrome Web Store',
  'certified by Google',
  'approved by Google',
]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EXPECTED_ASSETS = Object.freeze({
  'logo-300.png': Object.freeze({
    kind: 'logo',
    width: 300,
    height: 300,
    source: 'icons/icon128.png',
    domains: Object.freeze([]),
  }),
  'chrome-small-promo-440x280.png': Object.freeze({
    kind: 'promotional-tile',
    width: 440,
    height: 280,
    source: 'Image generation using the Network+ logo and synthetic request-detail screenshot as references',
    domains: Object.freeze([]),
  }),
  'chrome-marquee-1400x560.png': Object.freeze({
    kind: 'promotional-marquee',
    width: 1400,
    height: 560,
    source:
      'Playwright composition of the checked-in extension icon, the otter-investigator illustration cut out of the promotional tile, and the wordmark; no captured traffic',
    domains: Object.freeze([]),
  }),
  'screenshot-1-request-detail-1280x800.png': Object.freeze({
    kind: 'screenshot',
    width: 1280,
    height: 800,
    source: 'panel.js:createSampleCaptureRequests',
    domains: Object.freeze(['api.network-plus.test', 'checkout.network-plus.test', 'static.network-plus.test']),
  }),
  'screenshot-2-timing-guidance-1280x800.png': Object.freeze({
    kind: 'screenshot',
    width: 1280,
    height: 800,
    source: 'panel.js:createSampleCaptureRequests',
    domains: Object.freeze(['api.network-plus.test', 'checkout.network-plus.test', 'static.network-plus.test']),
  }),
  'screenshot-3-sample-guide-1280x800.png': Object.freeze({
    kind: 'screenshot',
    width: 1280,
    height: 800,
    source: 'panel.js:createSampleCaptureRequests',
    domains: Object.freeze(['api.network-plus.test', 'checkout.network-plus.test', 'static.network-plus.test']),
  }),
  'screenshot-4-sanitized-export-1280x800.png': Object.freeze({
    kind: 'screenshot',
    width: 1280,
    height: 800,
    source: 'panel.js:createSampleCaptureRequests',
    domains: Object.freeze(['api.network-plus.test', 'checkout.network-plus.test', 'static.network-plus.test']),
  }),
});

const readUtf8 = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const countOccurrences = (text, token) => text.split(token).length - 1;

const extractMarkedBlock = (text, startMarker, endMarker, label, errors) => {
  const startCount = countOccurrences(text, startMarker);
  const endCount = countOccurrences(text, endMarker);
  if (startCount !== 1 || endCount !== 1) {
    errors.push(`${label} must contain exactly one ${startMarker} and ${endMarker} marker`);
    return '';
  }

  const start = text.indexOf(startMarker) + startMarker.length;
  const end = text.indexOf(endMarker, start);
  if (end < start) {
    errors.push(`${label} markers are out of order`);
    return '';
  }
  return text.slice(start, end).trim();
};

const normalizeProse = (text) =>
  text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getBoldField = (markdown, label) => {
  const prefix = `**${label}:**`;
  const line = markdown.split('\n').find((candidate) => candidate.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
};

const hasSection = (markdown, section) => markdown.split('\n').some((line) => line.trim() === `## ${section}`);

const validateRequiredSections = (markdown, sections, label, errors) => {
  for (const section of sections) {
    if (!hasSection(markdown, section)) errors.push(`${label} is missing required section: ${section}`);
  }
};

const validateRequiredText = (text, requiredValues, label, errors) => {
  for (const value of requiredValues) {
    if (!text.includes(value)) errors.push(`${label} is missing required disclosure: ${value}`);
  }
};

const validateNoPlaceholdersOrClaims = (text, label, errors) => {
  if (PLACEHOLDER_PATTERN.test(text)) errors.push(`${label} contains a placeholder or unfinished marker`);
  const lower = text.toLowerCase();
  for (const claim of PROHIBITED_CLAIMS) {
    if (lower.includes(claim.toLowerCase())) errors.push(`${label} contains prohibited publication claim: ${claim}`);
  }
};

const extractPublicUrls = (markdown) => {
  const withoutCode = markdown.replace(/`[^`\n]*`/g, '');
  const urls = withoutCode.match(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"`]+/gi) ?? [];
  return urls.map((value) => value.replace(/[),.;:]+$/g, ''));
};

const validatePublicUrls = (markdown, label, errors) => {
  for (const value of extractPublicUrls(markdown)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      errors.push(`${label} contains an invalid public URL: ${value}`);
      continue;
    }
    if (url.protocol !== 'https:') {
      errors.push(`${label} public URL must use https: ${value}`);
      continue;
    }
    if (url.username || url.password) errors.push(`${label} public URL must not contain credentials: ${value}`);
    if (!ALLOWED_URL_HOSTS.has(url.hostname)) {
      errors.push(`${label} public URL host is not allowlisted: ${url.hostname}`);
    }
  }
};

const parseSearchTerms = (block) =>
  block
    .split('\n')
    .map((line) => line.match(/^\s*-\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((match) => match[1]);

const validateSearchTerms = (terms, errors) => {
  if (terms.length > MAX_SEARCH_TERMS) {
    errors.push(`search terms must contain at most ${MAX_SEARCH_TERMS} entries; found ${terms.length}`);
  }
  const wordCount = terms.reduce((total, term) => total + (term.match(/\S+/g) ?? []).length, 0);
  if (wordCount > MAX_SEARCH_WORDS) {
    errors.push(`search terms must contain at most ${MAX_SEARCH_WORDS} words; found ${wordCount}`);
  }
  const normalized = terms.map((term) => term.toLowerCase());
  if (new Set(normalized).size !== terms.length) errors.push('search terms must be unique');
  for (const term of terms) {
    if (term.length > MAX_SEARCH_TERM_CHARACTERS) {
      errors.push(`search term exceeds ${MAX_SEARCH_TERM_CHARACTERS} characters: ${term}`);
    }
  }
  if (JSON.stringify(terms) !== JSON.stringify(EXPECTED_SEARCH_TERMS)) {
    errors.push(`search terms must match the reviewed truthful set: ${EXPECTED_SEARCH_TERMS.join(', ')}`);
  }
  return wordCount;
};

const parsePngDimensions = (bytes) => {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24) throw new Error('PNG is too short');
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('PNG signature is invalid');
  }
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG IHDR chunk is missing');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) throw new Error('PNG dimensions must be positive');
  return { width, height };
};

const isPathInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const inspectAssetPath = (assetDirectory, file) => {
  const errors = [];
  if (path.basename(file) !== file || file.includes('/') || file.includes('\\')) {
    return {
      errors: [`asset inventory path must be a direct child of ${ASSET_DIRECTORY}: ${file}`],
      filePath: null,
    };
  }
  const directory = path.resolve(assetDirectory);
  const filePath = path.resolve(directory, file);
  if (!isPathInside(directory, filePath)) {
    return { errors: [`asset path escapes ${ASSET_DIRECTORY}: ${file}`], filePath };
  }

  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    return { errors: [`store asset is missing: ${file}`], filePath };
  }
  if (stat.isSymbolicLink()) errors.push(`store asset must not be a symbolic link: ${file}`);
  else if (!stat.isFile()) errors.push(`store asset must be a regular file: ${file}`);
  return { errors, filePath };
};

const validateInventory = (root, inventory, errors) => {
  const assetDirectory = path.join(root, ASSET_DIRECTORY);
  if (inventory.schemaVersion !== 1) errors.push('asset inventory schemaVersion must be 1');
  if (inventory.reviewedOn !== ASSET_REVIEW_DATE) {
    errors.push(`asset inventory reviewedOn must be ${ASSET_REVIEW_DATE}`);
  }
  if (!Array.isArray(inventory.assets)) {
    errors.push('asset inventory must contain an assets array');
    return;
  }

  const actualFiles = inventory.assets.map((asset) => asset && asset.file);
  const expectedFiles = Object.keys(EXPECTED_ASSETS);
  if (JSON.stringify([...actualFiles].sort()) !== JSON.stringify([...expectedFiles].sort())) {
    errors.push(`asset inventory must list exactly: ${expectedFiles.join(', ')}`);
  }

  let directoryEntries;
  try {
    directoryEntries = fs.readdirSync(assetDirectory, { withFileTypes: true });
  } catch {
    errors.push(`store asset directory is missing: ${ASSET_DIRECTORY}`);
    return;
  }
  const allowedEntries = new Set(['inventory.json', ...expectedFiles]);
  for (const entry of directoryEntries) {
    if (!allowedEntries.has(entry.name)) {
      errors.push(`unexpected store asset path: ${ASSET_DIRECTORY}/${entry.name}`);
    }
    if (!entry.isFile()) errors.push(`store asset directory must contain only regular files: ${entry.name}`);
  }
  for (const entry of allowedEntries) {
    if (!directoryEntries.some((candidate) => candidate.name === entry)) {
      errors.push(`required store asset path is missing: ${ASSET_DIRECTORY}/${entry}`);
    }
  }

  for (const asset of inventory.assets) {
    if (!asset || typeof asset.file !== 'string') {
      errors.push('asset inventory entries must contain a file name');
      continue;
    }
    const expected = EXPECTED_ASSETS[asset.file];
    if (!expected) continue;
    if (asset.kind !== expected.kind) errors.push(`${asset.file} kind must be ${expected.kind}`);
    if (asset.width !== expected.width || asset.height !== expected.height) {
      errors.push(`${asset.file} inventory dimensions must be ${expected.width}x${expected.height}`);
    }
    if (asset.source !== expected.source) errors.push(`${asset.file} source must be ${expected.source}`);
    if (asset.syntheticOnly !== true) errors.push(`${asset.file} must be marked syntheticOnly`);
    if (asset.containsSensitiveData !== false) {
      errors.push(`${asset.file} must be marked containsSensitiveData=false`);
    }
    if (typeof asset.state !== 'string' || asset.state.trim().length < 12) {
      errors.push(`${asset.file} must describe the depicted state`);
    }
    const domains = Array.isArray(asset.domains) ? asset.domains : [];
    if (JSON.stringify(domains) !== JSON.stringify(expected.domains)) {
      errors.push(`${asset.file} domains must match the reviewed synthetic inventory`);
    }
    for (const domain of domains) {
      if (!/^[a-z0-9.-]+\.test$/i.test(domain)) {
        errors.push(`${asset.file} domain must use the reserved .test suffix: ${domain}`);
      }
    }

    const inspected = inspectAssetPath(assetDirectory, asset.file);
    errors.push(...inspected.errors);
    if (inspected.errors.length > 0 || !inspected.filePath) continue;
    try {
      const dimensions = parsePngDimensions(fs.readFileSync(inspected.filePath));
      if (dimensions.width !== expected.width || dimensions.height !== expected.height) {
        errors.push(
          `${asset.file} PNG dimensions must be ${expected.width}x${expected.height}; found ${dimensions.width}x${dimensions.height}`,
        );
      }
    } catch (error) {
      errors.push(`${asset.file} is not a valid PNG header: ${error.message}`);
    }
  }
};

const validateEdgeDossier = (dossier, manifest, errors) => {
  validateRequiredSections(dossier, REQUIRED_EDGE_DOSSIER_SECTIONS, 'submission dossier', errors);
  validateRequiredText(dossier, REQUIRED_EDGE_DOSSIER_TEXT, 'submission dossier', errors);
  validateNoPlaceholdersOrClaims(dossier, 'submission dossier', errors);
  validatePublicUrls(dossier, 'submission dossier', errors);

  const name = getBoldField(dossier, 'Extension name');
  const description = getBoldField(dossier, 'Short description');
  if (name !== `\`${manifest.name}\``) errors.push('dossier extension name must match manifest name');
  if (description !== `\`${manifest.description}\``) {
    errors.push('dossier short description must match manifest description');
  }
  if (getBoldField(dossier, 'Website URL') !== EXPECTED_WEBSITE_URL) {
    errors.push(`dossier Website URL must be ${EXPECTED_WEBSITE_URL}`);
  }
  if (getBoldField(dossier, 'Support URL') !== EXPECTED_SUPPORT_URL) {
    errors.push(`dossier Support URL must be ${EXPECTED_SUPPORT_URL}`);
  }
  if (getBoldField(dossier, 'Privacy policy URL') !== EXPECTED_PRIVACY_URL) {
    errors.push(`dossier Privacy policy URL must be ${EXPECTED_PRIVACY_URL}`);
  }
  if (getBoldField(dossier, 'Mature content') !== '`No`') {
    errors.push('dossier Mature content answer must be `No`');
  }
  const availability = getBoldField(dossier, 'Availability');
  if (!availability || !availability.startsWith('Unknown and not claimed.')) {
    errors.push('dossier Availability must remain unknown and not claimed');
  }
  const permission = getBoldField(dossier, 'Permission justification (`storage`)');
  if (permission !== EXPECTED_PERMISSION_JUSTIFICATION) {
    errors.push('dossier storage permission justification must match the reviewed least-privilege statement');
  }

  const detailedBlock = extractMarkedBlock(
    dossier,
    '<!-- store-description:start -->',
    '<!-- store-description:end -->',
    'submission dossier',
    errors,
  );
  const detailedDescription = normalizeProse(detailedBlock);
  if (
    detailedDescription.length < MIN_DESCRIPTION_CHARACTERS ||
    detailedDescription.length > MAX_DESCRIPTION_CHARACTERS
  ) {
    errors.push(
      `detailed description must contain ${MIN_DESCRIPTION_CHARACTERS} to ${MAX_DESCRIPTION_CHARACTERS} characters; found ${detailedDescription.length}`,
    );
  }

  const searchBlock = extractMarkedBlock(
    dossier,
    '<!-- search-terms:start -->',
    '<!-- search-terms:end -->',
    'submission dossier',
    errors,
  );
  const searchTerms = parseSearchTerms(searchBlock);
  const searchWordCount = validateSearchTerms(searchTerms, errors);
  return { descriptionCharacters: detailedDescription.length, searchTerms: searchTerms.length, searchWordCount };
};

const validateChromeDossier = (dossier, manifest, errors) => {
  const label = 'Chrome submission dossier';
  validateRequiredSections(dossier, REQUIRED_CHROME_DOSSIER_SECTIONS, label, errors);
  validateRequiredText(dossier, REQUIRED_CHROME_DOSSIER_TEXT, label, errors);
  validateNoPlaceholdersOrClaims(dossier, label, errors);
  validatePublicUrls(dossier, label, errors);

  const name = getBoldField(dossier, 'Extension name');
  const summary = getBoldField(dossier, 'Summary');
  if (name !== `\`${manifest.name}\``) errors.push('Chrome dossier extension name must match manifest name');
  if (summary !== `\`${manifest.description}\``) {
    errors.push('Chrome dossier summary must match manifest description');
  }
  if (getBoldField(dossier, 'Homepage URL') !== EXPECTED_WEBSITE_URL) {
    errors.push(`Chrome dossier Homepage URL must be ${EXPECTED_WEBSITE_URL}`);
  }
  if (getBoldField(dossier, 'Support URL') !== EXPECTED_SUPPORT_URL) {
    errors.push(`Chrome dossier Support URL must be ${EXPECTED_SUPPORT_URL}`);
  }
  if (getBoldField(dossier, 'Privacy policy URL') !== EXPECTED_PRIVACY_URL) {
    errors.push(`Chrome dossier Privacy policy URL must be ${EXPECTED_PRIVACY_URL}`);
  }
  if (getBoldField(dossier, 'Category recommendation') !== '`Developer Tools`') {
    errors.push('Chrome dossier category recommendation must be `Developer Tools`');
  }
  const permission = getBoldField(dossier, 'Permission justification (`storage`)');
  if (permission !== EXPECTED_PERMISSION_JUSTIFICATION) {
    errors.push('Chrome dossier storage permission justification must match the reviewed least-privilege statement');
  }

  const detailedBlock = extractMarkedBlock(
    dossier,
    '<!-- chrome-store-description:start -->',
    '<!-- chrome-store-description:end -->',
    label,
    errors,
  );
  const detailedDescription = normalizeProse(detailedBlock);
  if (
    detailedDescription.length < MIN_DESCRIPTION_CHARACTERS ||
    detailedDescription.length > MAX_DESCRIPTION_CHARACTERS
  ) {
    errors.push(
      `Chrome detailed description must contain ${MIN_DESCRIPTION_CHARACTERS} to ${MAX_DESCRIPTION_CHARACTERS} characters; found ${detailedDescription.length}`,
    );
  }
  return { chromeDescriptionCharacters: detailedDescription.length };
};

const validatePrivacy = (privacy, errors) => {
  validateRequiredSections(privacy, REQUIRED_PRIVACY_SECTIONS, 'privacy notice', errors);
  validateRequiredText(privacy, REQUIRED_PRIVACY_TEXT, 'privacy notice', errors);
  validateNoPlaceholdersOrClaims(privacy, 'privacy notice', errors);
  validatePublicUrls(privacy, 'privacy notice', errors);
};

const validateManifest = (manifest, errors) => {
  if (typeof manifest.name !== 'string' || !manifest.name) errors.push('manifest name must be present');
  if (typeof manifest.description !== 'string' || !manifest.description) {
    errors.push('manifest description must be present');
  }
  if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage'])) {
    errors.push('manifest permissions must remain exactly: storage');
  }
  if (manifest.content_security_policy?.extension_pages !== EXPECTED_CSP) {
    errors.push(`manifest CSP must remain exactly: ${EXPECTED_CSP}`);
  }
};

const validateDiscoveryMetadata = (packageJson, manifest, errors) => {
  if (packageJson.description !== manifest.description) {
    errors.push('package description must match manifest description');
  }
  if (packageJson.homepage !== EXPECTED_WEBSITE_URL) {
    errors.push(`package homepage must be ${EXPECTED_WEBSITE_URL}`);
  }
  if (packageJson.bugs?.url !== EXPECTED_SUPPORT_URL) {
    errors.push(`package support URL must be ${EXPECTED_SUPPORT_URL}`);
  }
  if (packageJson.repository?.type !== 'git') {
    errors.push('package repository type must be git');
  }
  if (packageJson.repository?.url !== EXPECTED_REPOSITORY_URL) {
    errors.push(`package repository URL must be ${EXPECTED_REPOSITORY_URL}`);
  }
  if (JSON.stringify(packageJson.keywords) !== JSON.stringify(EXPECTED_SEARCH_TERMS)) {
    errors.push(`package keywords must match the reviewed truthful set: ${EXPECTED_SEARCH_TERMS.join(', ')}`);
  }
};

const readJson = (filePath, label, errors) => {
  try {
    return JSON.parse(readUtf8(filePath));
  } catch (error) {
    errors.push(`${label} must contain valid UTF-8 JSON: ${error.message}`);
    return {};
  }
};

const readMarkdown = (filePath, label, errors) => {
  try {
    return readUtf8(filePath);
  } catch (error) {
    errors.push(`${label} must be readable UTF-8: ${error.message}`);
    return '';
  }
};

const validateStoreReadiness = (root) => {
  const errors = [];
  const manifest = readJson(path.join(root, 'manifest.json'), 'manifest.json', errors);
  const packageJson = readJson(path.join(root, PACKAGE_PATH), PACKAGE_PATH, errors);
  const edgeDossier = readMarkdown(path.join(root, EDGE_DOSSIER_PATH), EDGE_DOSSIER_PATH, errors);
  const chromeDossier = readMarkdown(path.join(root, CHROME_DOSSIER_PATH), CHROME_DOSSIER_PATH, errors);
  const privacy = readMarkdown(path.join(root, PRIVACY_PATH), PRIVACY_PATH, errors);
  const inventory = readJson(path.join(root, INVENTORY_PATH), INVENTORY_PATH, errors);

  validateManifest(manifest, errors);
  validateDiscoveryMetadata(packageJson, manifest, errors);
  const summary = validateEdgeDossier(edgeDossier, manifest, errors);
  const chromeSummary = validateChromeDossier(chromeDossier, manifest, errors);
  validatePrivacy(privacy, errors);
  validateInventory(root, inventory, errors);

  return {
    errors,
    summary: {
      ...summary,
      ...chromeSummary,
      assets: Array.isArray(inventory.assets) ? inventory.assets.length : 0,
    },
  };
};

const main = () => {
  const result = validateStoreReadiness(process.cwd());
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `OK: browser store kits valid (${result.summary.descriptionCharacters} Edge description characters, ${result.summary.chromeDescriptionCharacters} Chrome description characters, ${result.summary.searchTerms} Edge search terms / ${result.summary.searchWordCount} words, ${result.summary.assets} assets)`,
  );
};

if (require.main === module) main();

module.exports = {
  EXPECTED_ASSETS,
  EXPECTED_RELEASE_SHA256,
  EXPECTED_SEARCH_TERMS,
  extractMarkedBlock,
  extractPublicUrls,
  parsePngDimensions,
  parseSearchTerms,
  validateStoreReadiness,
};
