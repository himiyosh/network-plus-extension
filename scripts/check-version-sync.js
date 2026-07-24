const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const root = process.cwd();
const packagePath = path.join(root, 'package.json');
const lockfilePath = path.join(root, 'package-lock.json');
const manifestPath = path.join(root, 'manifest.json');

const pkg = readJson(packagePath);
const lockfile = readJson(lockfilePath);
const manifest = readJson(manifestPath);
const versions = {
  'package.json': pkg.version,
  'manifest.json': manifest.version,
  'package-lock.json': lockfile.version,
  'package-lock.json root': lockfile.packages?.['']?.version,
};

if (Object.values(versions).some((version) => version !== pkg.version)) {
  console.error(
    `Version mismatch: ${Object.entries(versions)
      .map(([name, version]) => `${name}=${version}`)
      .join(', ')}`,
  );
  process.exit(1);
}

console.log(`OK: release versions synced (${pkg.version})`);
