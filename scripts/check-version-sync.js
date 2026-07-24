const fs = require('fs');
const path = require('path');

const FALLBACK_PATTERN = /\bconst\s+TEST_EXTENSION_VERSION_FALLBACK\s*=\s*['"]([^'"]+)['"]\s*;/g;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const extractPanelFallbackVersion = (panelSource) => {
  const matches = Array.from(panelSource.matchAll(FALLBACK_PATTERN));
  if (matches.length !== 1) {
    throw new Error('panel.js must define TEST_EXTENSION_VERSION_FALLBACK exactly once');
  }
  return matches[0][1];
};

const validateReleaseVersions = ({ packageJson, lockfile, manifest, panelSource }) => {
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
  });

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`OK: release versions synced (${packageJson.version}, 5 locations)`);
};

if (require.main === module) main();

module.exports = {
  extractPanelFallbackVersion,
  validateReleaseVersions,
};
