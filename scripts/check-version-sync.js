const fs = require('fs');
const path = require('path');
const { getReleaseArchiveName } = require('./check-extension-package');

const FALLBACK_PATTERN = /\bconst\s+TEST_EXTENSION_VERSION_FALLBACK\s*=\s*['"]([^'"]+)['"]\s*;/g;
const README_PATH = 'README.md';
const RELEASE_BASE_URL = 'https://github.com/himiyosh/network-plus-extension/releases';
const QUICK_TRY_PREFIX = '**すぐに試す:**';
const RELEASE_SETUP_HEADING = '### リリース ZIP から試す';
const RELEASE_SETUP_BOUNDARY_PATTERN = /^#{2,3}(?:[ \t]+|$)/;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const getReleaseDownloadUrl = (version) => `${RELEASE_BASE_URL}/download/v${version}/${getReleaseArchiveName(version)}`;

const getReleaseTagUrl = (version) => `${RELEASE_BASE_URL}/tag/v${version}`;

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

const findReadmeReleaseLines = (readmeSource, errors) => {
  if (typeof readmeSource !== 'string') {
    errors.push(`${README_PATH} source must be provided`);
    return { quickTryLine: '', setupStep: '' };
  }

  const lines = readmeSource.split(/\r?\n/);
  const quickTryLines = lines.filter((line) => line.startsWith(QUICK_TRY_PREFIX));
  if (quickTryLines.length !== 1) {
    errors.push(`${README_PATH} must contain exactly one ${QUICK_TRY_PREFIX} line`);
  }

  const setupHeadingIndexes = lines
    .map((line, index) => (line === RELEASE_SETUP_HEADING ? index : -1))
    .filter((index) => index >= 0);
  if (setupHeadingIndexes.length !== 1) {
    errors.push(`${README_PATH} must contain exactly one ${RELEASE_SETUP_HEADING} section`);
    return { quickTryLine: quickTryLines[0] ?? '', setupStep: '' };
  }

  const setupStart = setupHeadingIndexes[0] + 1;
  const nextHeadingOffset = lines.slice(setupStart).findIndex((line) => RELEASE_SETUP_BOUNDARY_PATTERN.test(line));
  const setupEnd = nextHeadingOffset < 0 ? lines.length : setupStart + nextHeadingOffset;
  const setupSteps = lines.slice(setupStart, setupEnd).filter((line) => line.startsWith('1. '));
  if (setupSteps.length !== 1) {
    errors.push(`${README_PATH} ${RELEASE_SETUP_HEADING} section must contain exactly one first step`);
  }

  return {
    quickTryLine: quickTryLines[0] ?? '',
    setupStep: setupSteps[0] ?? '',
  };
};

const validateReadmeReleaseReferences = (readmeSource, version) => {
  const errors = [];
  const archiveName = getReleaseArchiveName(version);
  const downloadUrl = getReleaseDownloadUrl(version);
  const tagUrl = getReleaseTagUrl(version);
  const { quickTryLine, setupStep } = findReadmeReleaseLines(readmeSource, errors);

  if (quickTryLine) {
    const quickTryLinks = extractMarkdownLinks(quickTryLine);
    if (quickTryLinks[0]?.target !== downloadUrl) {
      errors.push(`${README_PATH} primary release ZIP CTA must link directly to ${downloadUrl}`);
    }
    if (!quickTryLinks[0]?.label.includes(`v${version}`)) {
      errors.push(`${README_PATH} primary release ZIP CTA label must include v${version}`);
    }
    const releaseContext = quickTryLinks.find((link) => link.target === tagUrl);
    if (!releaseContext) {
      errors.push(`${README_PATH} quick-start release context must link to ${tagUrl}`);
    } else if (!releaseContext.label.includes(`v${version}`)) {
      errors.push(`${README_PATH} quick-start release context label must include v${version}`);
    }
  }

  if (setupStep) {
    const setupLinks = extractMarkdownLinks(setupStep);
    if (setupLinks[0]?.target !== downloadUrl) {
      errors.push(`${README_PATH} release ZIP setup must link directly to ${downloadUrl}`);
    }
    if (setupLinks[0]?.label !== archiveName) {
      errors.push(`${README_PATH} release ZIP setup must name ${archiveName}`);
    }
    const releaseContext = setupLinks.find((link) => link.target === tagUrl);
    if (!releaseContext) {
      errors.push(`${README_PATH} release ZIP setup context must link to ${tagUrl}`);
    } else if (!releaseContext.label.includes(`v${version}`)) {
      errors.push(`${README_PATH} release ZIP setup context label must include v${version}`);
    }
  }

  return errors;
};

const validateReleaseVersions = ({ packageJson, lockfile, manifest, panelSource, readmeSource }) => {
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

  errors.push(...validateReadmeReleaseReferences(readmeSource, packageJson.version));

  return errors;
};

const main = () => {
  const root = process.cwd();
  const packageJson = readJson(path.join(root, 'package.json'));
  const errors = validateReleaseVersions({
    packageJson,
    lockfile: readJson(path.join(root, 'package-lock.json')),
    manifest: readJson(path.join(root, 'manifest.json')),
    panelSource: fs.readFileSync(path.join(root, 'panel.js'), 'utf8'),
    readmeSource: fs.readFileSync(path.join(root, README_PATH), 'utf8'),
  });

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`OK: release versions and README download routes synced (${packageJson.version}, 5 version locations)`);
};

if (require.main === module) main();

module.exports = {
  extractPanelFallbackVersion,
  getReleaseDownloadUrl,
  getReleaseTagUrl,
  validateReadmeReleaseReferences,
  validateReleaseVersions,
};
