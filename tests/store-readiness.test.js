const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  EXPECTED_ASSETS,
  EXPECTED_SEARCH_TERMS,
  extractPublicUrls,
  parsePngDimensions,
  validateStoreReadiness,
} = require('../scripts/check-store-readiness');

const repositoryRoot = path.join(__dirname, '..');
const temporaryDirectories = [];
const fixtureFiles = [
  'manifest.json',
  'package.json',
  'docs/edge-addons-submission.md',
  'docs/privacy.md',
  'docs/store-assets/inventory.json',
  ...Object.keys(EXPECTED_ASSETS).map((file) => `docs/store-assets/${file}`),
];

const createFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-store-'));
  temporaryDirectories.push(root);
  for (const file of fixtureFiles) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, file), destination);
  }
  return root;
};

const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (root, file, value) => fs.writeFileSync(path.join(root, file), value);
const validate = (root) => validateStoreReadiness(root).errors;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Edge Add-ons submission kit', () => {
  test('accepts the checked-in dossier, privacy notice, and synthetic assets', () => {
    const result = validateStoreReadiness(repositoryRoot);

    expect(result.errors).toEqual([]);
    expect(result.summary.descriptionCharacters).toBeGreaterThanOrEqual(250);
    expect(result.summary.descriptionCharacters).toBeLessThanOrEqual(10000);
    expect(result.summary.searchTerms).toBe(EXPECTED_SEARCH_TERMS.length);
    expect(result.summary.searchWordCount).toBeLessThanOrEqual(21);
    expect(result.summary.assets).toBe(Object.keys(EXPECTED_ASSETS).length);
  });

  test('rejects empty or drifting checked-in discovery metadata', () => {
    const root = createFixture();
    const packagePath = 'package.json';
    const packageJson = JSON.parse(read(root, packagePath));
    packageJson.description = '';
    packageJson.homepage = '';
    packageJson.bugs.url = 'https://github.com/himiyosh/network-plus-extension/issues';
    packageJson.repository = {
      type: 'https',
      url: 'https://github.com/himiyosh/network-plus-extension',
    };
    packageJson.keywords = [];
    write(root, packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

    expect(validate(root)).toEqual(
      expect.arrayContaining([
        'package description must match manifest description',
        'package homepage must be https://github.com/himiyosh/network-plus-extension',
        'package support URL must be https://github.com/himiyosh/network-plus-extension/issues/new/choose',
        'package repository type must be git',
        'package repository URL must be git+https://github.com/himiyosh/network-plus-extension.git',
        'package keywords must match the reviewed truthful set: network debugging, developer tools, HTTP inspector, HAR export, request filtering, response timing, Edge DevTools',
      ]),
    );
  });

  test('rejects manifest drift, a short description, and excessive search terms', () => {
    const root = createFixture();
    const dossierPath = 'docs/edge-addons-submission.md';
    const dossier = read(root, dossierPath)
      .replace('**Extension name:** `Network+ for DevTools`', '**Extension name:** `Different extension`')
      .replace(
        '**Short description:** `Network analysis with sanitized HAR, retention limits, integrated search, accessible UI, and keyboard controls.`',
        '**Short description:** `Different description`',
      )
      .replace(
        /<!-- store-description:start -->[\s\S]*?<!-- store-description:end -->/,
        '<!-- store-description:start -->\nShort.\n<!-- store-description:end -->',
      )
      .replace('<!-- search-terms:end -->', '- extra search term\n<!-- search-terms:end -->');
    write(root, dossierPath, dossier);

    expect(validate(root)).toEqual(
      expect.arrayContaining([
        'dossier extension name must match manifest name',
        'dossier short description must match manifest description',
        'detailed description must contain 250 to 10000 characters; found 6',
        'search terms must contain at most 7 entries; found 8',
      ]),
    );
  });

  test('rejects unsafe URLs, unfinished markers, and publication claims', () => {
    const root = createFixture();
    const privacyPath = 'docs/privacy.md';
    write(
      root,
      privacyPath,
      `${read(root, privacyPath)}\nTODO: replace text here.\nhttp://example.com\nhttps://localhost/private\nNow available on Microsoft Edge Add-ons.\n`,
    );

    expect(validate(root)).toEqual(
      expect.arrayContaining([
        'privacy notice contains a placeholder or unfinished marker',
        'privacy notice contains prohibited publication claim: now available on Microsoft Edge Add-ons',
        'privacy notice public URL must use https: http://example.com',
        'privacy notice public URL host is not allowlisted: localhost',
      ]),
    );
  });

  test('rejects missing disclosure sections and permission-justification drift', () => {
    const root = createFixture();
    const dossierPath = 'docs/edge-addons-submission.md';
    const dossier = read(root, dossierPath)
      .replace('## Certification testing notes', '### Certification testing notes')
      .replace(/(\*\*Permission justification \(`storage`\):\*\*).+/, '$1 Stores unspecified settings.');
    write(root, dossierPath, dossier);

    expect(validate(root)).toEqual(
      expect.arrayContaining([
        'submission dossier is missing required section: Certification testing notes',
        'dossier storage permission justification must match the reviewed least-privilege statement',
      ]),
    );
  });

  test('rejects PNG dimension drift and non-synthetic inventory domains', () => {
    const root = createFixture();
    const screenshot = 'docs/store-assets/screenshot-request-detail-1280x800.png';
    const bytes = fs.readFileSync(path.join(root, screenshot));
    expect(parsePngDimensions(bytes)).toEqual({ width: 1280, height: 800 });
    bytes.writeUInt32BE(1279, 16);
    fs.writeFileSync(path.join(root, screenshot), bytes);

    const inventoryPath = 'docs/store-assets/inventory.json';
    const inventory = JSON.parse(read(root, inventoryPath));
    inventory.assets.find((asset) => asset.file === path.basename(screenshot)).domains[0] = 'customer.example.com';
    write(root, inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);

    expect(validate(root)).toEqual(
      expect.arrayContaining([
        'screenshot-request-detail-1280x800.png PNG dimensions must be 1280x800; found 1279x800',
        'screenshot-request-detail-1280x800.png domains must match the reviewed synthetic inventory',
        'screenshot-request-detail-1280x800.png domain must use the reserved .test suffix: customer.example.com',
      ]),
    );
  });

  test('rejects unlisted files and extracts only public URL tokens outside code spans', () => {
    const root = createFixture();
    fs.copyFileSync(
      path.join(root, 'docs/store-assets/logo-300.png'),
      path.join(root, 'docs/store-assets/unlisted.png'),
    );

    expect(validate(root)).toContain('unexpected store asset path: docs/store-assets/unlisted.png');
    expect(
      extractPublicUrls(
        'Website https://github.com/himiyosh/network-plus-extension. Ignore `edge://extensions/` and `data:text/html,test`.',
      ),
    ).toEqual(['https://github.com/himiyosh/network-plus-extension']);
  });
});
