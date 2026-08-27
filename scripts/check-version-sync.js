const fs = require('fs');
const path = require('path');
const { getReleaseArchiveName } = require('./check-extension-package');

const FALLBACK_PATTERN = /\bconst\s+TEST_EXTENSION_VERSION_FALLBACK\s*=\s*['"]([^'"]+)['"]\s*;/g;
// Both READMEs must stay version-free: every release link points at the
// stable /releases/latest route, so cutting a release never edits them. The
// validator therefore enforces the absence of versioned routes rather than
// their synchronization.
const README_CONFIGS = [
  {
    path: 'README.md',
    quickTryPrefix: '**Try it now:**',
    setupHeading: '### Install from the release ZIP',
  },
  {
    path: 'README.ja.md',
    quickTryPrefix: '**今すぐ試す:**',
    setupHeading: '### リリース ZIP からインストール',
  },
];
const RELEASE_SETUP_BOUNDARY_PATTERN = /^#{2,3}(?:[ \t]+|$)/;
const VERSIONED_ROUTE_PATTERNS = [
  { name: 'a versioned release download route', pattern: /\/releases\/download\// },
  { name: 'a versioned release tag route', pattern: /\/releases\/tag\/v/ },
  { name: 'a release version literal', pattern: /\bv\d+\.\d+\.\d+\b/ },
  { name: 'a versioned archive name', pattern: /network-plus-extension-\d[\w.-]*\.zip/ },
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const getGitHubReleaseBaseUrl = (repository) => {
  let repositoryUrl;

  if (typeof repository === 'string') {
    repositoryUrl = repository;
  } else if (repository && typeof repository === 'object' && !Array.isArray(repository)) {
    if (repository.type !== 'git') {
      throw new Error('package.json repository.type must be "git"');
    }
    repositoryUrl = repository.url;
  } else {
    throw new Error('package.json repository must be a URL string or a git repository object');
  }

  if (typeof repositoryUrl !== 'string' || repositoryUrl.length === 0) {
    throw new Error('package.json repository URL must be a non-empty string');
  }
  if (repositoryUrl !== repositoryUrl.trim() || /[\s\\]/.test(repositoryUrl)) {
    throw new Error('package.json repository URL must not contain whitespace or backslashes');
  }

  const httpsUrl = repositoryUrl.replace(/^git\+(?=https:\/\/)/i, '');
  if (!/^https:\/\//i.test(httpsUrl)) {
    throw new Error('package.json repository URL must use HTTPS or git+HTTPS');
  }
  if (/[?#]/.test(httpsUrl)) {
    throw new Error('package.json repository URL must not include query parameters or fragments');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(httpsUrl);
  } catch {
    throw new Error('package.json repository URL must be a valid URL');
  }

  const authorityStart = httpsUrl.indexOf('//') + 2;
  const pathStart = httpsUrl.indexOf('/', authorityStart);
  const authority = pathStart < 0 ? httpsUrl.slice(authorityStart) : httpsUrl.slice(authorityStart, pathStart);
  if (authority.includes('@') || parsedUrl.username || parsedUrl.password) {
    throw new Error('package.json repository URL must not include credentials');
  }
  if (parsedUrl.protocol !== 'https:' || authority.toLowerCase() !== 'github.com') {
    throw new Error('package.json repository URL must use github.com');
  }

  const pathParts = parsedUrl.pathname.split('/');
  if (pathParts.length !== 3 || pathParts[0] !== '') {
    throw new Error('package.json repository URL must identify exactly one GitHub owner and repository');
  }

  const owner = pathParts[1];
  const repositoryPath = pathParts[2];
  const repositoryName = repositoryPath.endsWith('.git') ? repositoryPath.slice(0, -4) : repositoryPath;
  const validOwner = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner);
  const validRepository = /^[A-Za-z0-9._-]+$/.test(repositoryName) && !['.', '..'].includes(repositoryName);
  if (!validOwner || !validRepository) {
    throw new Error('package.json repository URL must contain valid GitHub owner and repository names');
  }

  return `https://github.com/${owner}/${repositoryName}/releases`;
};

const getReleaseDownloadUrl = (repository, version) =>
  `${getGitHubReleaseBaseUrl(repository)}/download/v${version}/${getReleaseArchiveName(version)}`;

const getReleaseTagUrl = (repository, version) => `${getGitHubReleaseBaseUrl(repository)}/tag/v${version}`;

const getLatestReleaseUrl = (repository) => `${getGitHubReleaseBaseUrl(repository)}/latest`;

const extractPanelFallbackVersion = (panelSource) => {
  const matches = Array.from(panelSource.matchAll(FALLBACK_PATTERN));
  if (matches.length !== 1) {
    throw new Error('panel.js must define TEST_EXTENSION_VERSION_FALLBACK exactly once');
  }
  return matches[0][1];
};

const extractMarkdownLinks = (line) =>
  Array.from(line.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g), (match) => ({
    label: match[1],
    target: match[2],
  }));

const findReadmeReleaseLines = (readmeSource, errors, { path: readmePath, quickTryPrefix, setupHeading }) => {
  if (typeof readmeSource !== 'string') {
    errors.push(`${readmePath} source must be provided`);
    return { quickTryLine: '', setupStep: '' };
  }

  const lines = readmeSource.split(/\r?\n/);
  const quickTryLines = lines.filter((line) => line.startsWith(quickTryPrefix));
  if (quickTryLines.length !== 1) {
    errors.push(`${readmePath} must contain exactly one ${quickTryPrefix} line`);
  }

  const setupHeadingIndexes = lines
    .map((line, index) => (line === setupHeading ? index : -1))
    .filter((index) => index >= 0);
  if (setupHeadingIndexes.length !== 1) {
    errors.push(`${readmePath} must contain exactly one ${setupHeading} section`);
    return { quickTryLine: quickTryLines[0] ?? '', setupStep: '' };
  }

  const setupStart = setupHeadingIndexes[0] + 1;
  const nextHeadingOffset = lines.slice(setupStart).findIndex((line) => RELEASE_SETUP_BOUNDARY_PATTERN.test(line));
  const setupEnd = nextHeadingOffset < 0 ? lines.length : setupStart + nextHeadingOffset;
  const setupSteps = lines.slice(setupStart, setupEnd).filter((line) => line.startsWith('1. '));
  if (setupSteps.length !== 1) {
    errors.push(`${readmePath} ${setupHeading} section must contain exactly one first step`);
  }

  return {
    quickTryLine: quickTryLines[0] ?? '',
    setupStep: setupSteps[0] ?? '',
  };
};

const validateReadmeReleaseReferences = (readmeSource, repository, config) => {
  const errors = [];
  const { quickTryLine, setupStep } = findReadmeReleaseLines(readmeSource, errors, config);
  let latestUrl;

  try {
    latestUrl = getLatestReleaseUrl(repository);
  } catch (error) {
    errors.push(error.message);
    return errors;
  }

  if (quickTryLine) {
    const quickTryLinks = extractMarkdownLinks(quickTryLine);
    if (quickTryLinks[0]?.target !== latestUrl) {
      errors.push(`${config.path} primary release CTA must link to ${latestUrl}`);
    }
  }

  if (setupStep) {
    const setupLinks = extractMarkdownLinks(setupStep);
    if (setupLinks[0]?.target !== latestUrl) {
      errors.push(`${config.path} release ZIP setup must link to ${latestUrl}`);
    }
  }

  if (typeof readmeSource === 'string') {
    for (const { name, pattern } of VERSIONED_ROUTE_PATTERNS) {
      const match = readmeSource.match(pattern);
      if (match) {
        errors.push(`${config.path} must stay version-free but contains ${name}: ${match[0]}`);
      }
    }
  }

  return errors;
};

// The public storefront listing for each browser. Both are reachable by anyone
// reading the README, and neither is covered by any other check, so a broken one
// stays broken silently: the Edge link pointed at the Partner Center product
// GUID and returned 404 from v1.8.0 until 2026-08-27.
//
// The two stores identify a listing differently, which is the whole trap. Chrome
// puts the same item id in the public URL that the Items API takes. Edge does
// not: `EDGE_PRODUCT_ID` is the Partner Center GUID the Update API takes, and the
// storefront uses a separate id entirely. They are not interchangeable, and the
// GUID is the one that looks plausible in a URL.
const EDGE_PARTNER_CENTER_GUID = '4fcf1d3e-d1fe-4d4a-a741-97d8d8fa4241';
const STORE_LISTING_URLS = Object.freeze([
  {
    store: 'Chrome Web Store',
    url: 'https://chromewebstore.google.com/detail/mhidipnhdnonbjkfklcohmnnmfggjlpo',
  },
  {
    store: 'Edge Add-ons',
    url: 'https://microsoftedge.microsoft.com/addons/detail/network-for-devtools/dhmafmhaagefmichhmmkknapalhmlmal',
  },
]);

const validateReadmeStoreListings = (readmeSource, config) => {
  const errors = [];
  if (typeof readmeSource !== 'string') return errors;

  for (const { store, url } of STORE_LISTING_URLS) {
    if (!readmeSource.includes(url)) {
      errors.push(`${config.path} must link to the ${store} listing at ${url}`);
    }
  }

  if (readmeSource.includes(`addons/detail/${EDGE_PARTNER_CENTER_GUID}`)) {
    errors.push(
      `${config.path} links to the Edge storefront by Partner Center product GUID (${EDGE_PARTNER_CENTER_GUID}), which is not a storefront id and returns 404`,
    );
  }

  return errors;
};

const validateReleaseVersions = ({ packageJson, lockfile, manifest, panelSource, readmeSources = [] }) => {
  const errors = [];
  let panelFallback;

  try {
    panelFallback = extractPanelFallbackVersion(panelSource);
  } catch (error) {
    errors.push(error.message);
  }

  const versions = {
    'package.json': packageJson.version,
    'manifest.json': manifest.version,
    'package-lock.json': lockfile.version,
    'package-lock.json root': lockfile.packages?.['']?.version,
    'panel.js fallback': panelFallback,
  };

  if (Object.values(versions).some((version) => version !== packageJson.version)) {
    errors.push(
      `Version mismatch: ${Object.entries(versions)
        .map(([name, version]) => `${name}=${version}`)
        .join(', ')}`,
    );
  }

  for (const { config, source } of readmeSources) {
    errors.push(...validateReadmeReleaseReferences(source, packageJson.repository, config));
  }

  return errors;
};

const main = () => {
  const root = process.cwd();
  const packageJson = readJson(path.join(root, 'package.json'));
  const readmeSources = README_CONFIGS.map((config) => ({
    config,
    source: fs.readFileSync(path.join(root, config.path), 'utf8'),
  }));
  const errors = validateReleaseVersions({
    packageJson,
    lockfile: readJson(path.join(root, 'package-lock.json')),
    manifest: readJson(path.join(root, 'manifest.json')),
    panelSource: fs.readFileSync(path.join(root, 'panel.js'), 'utf8'),
    readmeSources,
  });

  // Checked against the real READMEs rather than through validateReleaseVersions:
  // where a listing lives is a property of the shipped documents, not of the
  // version-sync contract, and the synthetic READMEs that exercise that contract
  // have no reason to carry storefront links.
  for (const { config, source } of readmeSources) {
    errors.push(...validateReadmeStoreListings(source, config));
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `OK: release versions synced (${packageJson.version}, 5 locations); READMEs carry version-free latest-release routes and both storefront listings`,
  );
};

if (require.main === module) main();

module.exports = {
  README_CONFIGS,
  extractPanelFallbackVersion,
  getGitHubReleaseBaseUrl,
  getLatestReleaseUrl,
  getReleaseDownloadUrl,
  getReleaseTagUrl,
  STORE_LISTING_URLS,
  validateReadmeReleaseReferences,
  validateReadmeStoreListings,
  validateReleaseVersions,
};
