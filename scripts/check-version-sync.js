const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const root = process.cwd();
const packagePath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'manifest.json');

const pkg = readJson(packagePath);
const manifest = readJson(manifestPath);

if (pkg.version !== manifest.version) {
  console.error(`Version mismatch: package.json=${pkg.version}, manifest.json=${manifest.version}`);
  process.exit(1);
}

console.log(`OK: version synced (${pkg.version})`);
