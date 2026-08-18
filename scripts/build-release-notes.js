'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CHANGELOG_PATH = path.join('docs', 'CHANGELOG.md');
const RELEASE_HEADING_PATTERN = /^##\s+v(\d+\.\d+\.\d+)\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/;

const readPackageVersion = (root) => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

// Returns the bullet block recorded for one released version. A missing or
// empty section is an error: release notes must never be silently empty.
const extractReleaseSection = (changelog, version) => {
  const lines = changelog.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => {
    const match = line.match(RELEASE_HEADING_PATTERN);
    return match !== null && match[1] === version;
  });
  if (headingIndex < 0) {
    throw new Error(`${CHANGELOG_PATH} has no "## v${version} - <date>" section`);
  }

  const body = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^##(?:\s|$)/.test(line)) break;
    body.push(line);
  }

  const entries = body.filter((line) => /^-\s+\S/.test(line));
  if (entries.length === 0) {
    throw new Error(`${CHANGELOG_PATH} section for v${version} contains no bullet entries`);
  }

  return {
    date: lines[headingIndex].match(RELEASE_HEADING_PATTERN)[2],
    body: body.join('\n').trim(),
  };
};

const describeArchive = (archivePath) => {
  const bytes = fs.readFileSync(archivePath);
  return {
    name: path.basename(archivePath),
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
};

const buildReleaseNotes = ({ version, date, body, archive }) =>
  [
    `Released ${date}.`,
    '',
    body,
    '',
    '## Upload artifact',
    '',
    '| Item | Value |',
    '| --- | --- |',
    `| File | \`${archive.name}\` |`,
    `| Size | ${archive.size} bytes |`,
    `| SHA-256 | \`${archive.sha256}\` |`,
    '',
    'The archive is written with fixed entry timestamps, so `npm run extension:package` at this tag',
    'reproduces the file byte for byte. Verify the digest before loading or uploading it.',
    '',
    '## Install',
    '',
    `1. Download \`${archive.name}\` and extract it into a new folder. The browser loads the folder that contains \`manifest.json\`, not the ZIP itself.`,
    '2. Open `edge://extensions/` in Microsoft Edge, or `chrome://extensions/` in Google Chrome, and turn on Developer mode.',
    '3. Choose **Load unpacked** and select the extracted folder.',
    '',
    `Full changelog: [docs/CHANGELOG.md](https://github.com/himiyosh/network-plus-extension/blob/v${version}/docs/CHANGELOG.md)`,
    '',
  ].join('\n');

const main = () => {
  const root = process.cwd();
  const version = readPackageVersion(root);
  const changelog = fs.readFileSync(path.join(root, CHANGELOG_PATH), 'utf8');
  const { date, body } = extractReleaseSection(changelog, version);
  const archivePath = path.join(root, 'dist', `network-plus-extension-${version}.zip`);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`${archivePath} is missing; run npm run extension:package first`);
  }

  process.stdout.write(buildReleaseNotes({ version, date, body, archive: describeArchive(archivePath) }));
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { buildReleaseNotes, describeArchive, extractReleaseSection };
