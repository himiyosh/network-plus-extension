const fs = require('fs');
const os = require('os');
const path = require('path');
const { unzipSync } = require('../vendor/fflate');
const {
  EXPECTED_PERMISSIONS,
  RUNTIME_FILES,
  checkExtensionPackage,
  createArchive,
  validateArchiveAllowlist,
  validateArchiveEntries,
  validateExtension,
  writeExtensionPackage,
} = require('../scripts/check-extension-package');

const repositoryRoot = path.join(__dirname, '..');
const temporaryDirectories = [];

const createFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-package-'));
  temporaryDirectories.push(root);

  for (const file of RUNTIME_FILES) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, file), destination);
  }

  return root;
};

const readManifest = (root) => JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const writeManifest = (root, manifest) => {
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('extension source integrity', () => {
  test('accepts the checked-in runtime and proves every permission is used', () => {
    expect(validateExtension(repositoryRoot)).toEqual([]);
    expect(readManifest(repositoryRoot).permissions).toEqual(EXPECTED_PERMISSIONS);
    expect(fs.readFileSync(path.join(repositoryRoot, 'panel.js'), 'utf8')).toContain('chrome.storage.local');
    expect(fs.readFileSync(path.join(repositoryRoot, 'panel.js'), 'utf8')).not.toContain('chrome.downloads');
  });

  test('rejects missing, extra, and unused permissions', () => {
    const root = createFixture();
    const manifest = readManifest(root);
    manifest.permissions.push('downloads');
    writeManifest(root, manifest);

    expect(validateExtension(root)).toEqual(
      expect.arrayContaining([
        'manifest permissions must be exactly: storage',
        'manifest permission has no audited usage rule: downloads',
      ]),
    );

    manifest.permissions = [];
    writeManifest(root, manifest);
    expect(validateExtension(root)).toContain('manifest permissions must be exactly: storage');
  });

  test('rejects unsafe or unlisted HTML references and inline script', () => {
    const root = createFixture();
    fs.writeFileSync(
      path.join(root, 'devtools.html'),
      "<!doctype html><script src='https://example.com/remote.js'>alert('unsafe')</script>\n",
    );
    fs.appendFileSync(path.join(root, 'panel.html'), '<button onclick="alert(1)">Unsafe</button>\n');

    expect(validateExtension(root)).toEqual(
      expect.arrayContaining([
        'devtools.html script must be local: https://example.com/remote.js',
        'devtools.html contains inline script content',
        'panel.html contains an inline event handler',
      ]),
    );
  });

  test('rejects missing runtime files and unsafe manifest mutations', () => {
    const root = createFixture();
    const manifest = readManifest(root);
    manifest.content_security_policy.extension_pages = "script-src 'unsafe-inline'";
    manifest.devtools_page = 'https://example.com/devtools.html';
    writeManifest(root, manifest);
    fs.rmSync(path.join(root, 'panel.css'));

    expect(validateExtension(root)).toEqual(
      expect.arrayContaining([
        'runtime file is missing: panel.css',
        "manifest CSP must be exactly: script-src 'self'; object-src 'self'",
        'manifest devtools_page must be a local file',
        'HTML reference is missing: panel.css',
      ]),
    );
  });
});

describe('extension archive integrity', () => {
  test('contains exactly the allowlisted runtime files with byte-identical content', () => {
    const { archive, errors } = checkExtensionPackage(repositoryRoot);
    expect(errors).toEqual([]);

    const entries = unzipSync(new Uint8Array(archive));
    expect(Object.keys(entries).sort()).toEqual([...RUNTIME_FILES].sort());
    expect(Object.keys(entries)).not.toEqual(
      expect.arrayContaining(['README.md', 'package.json', 'tests/panel.test.js']),
    );

    for (const file of RUNTIME_FILES) {
      expect(Buffer.from(entries[file])).toEqual(fs.readFileSync(path.join(repositoryRoot, file)));
    }
  });

  test('rejects missing or extra archive allowlist entries', () => {
    expect(validateArchiveAllowlist(RUNTIME_FILES.slice(1))).toContain(
      `archive allowlist is missing ${RUNTIME_FILES[0]}`,
    );
    expect(validateArchiveAllowlist([...RUNTIME_FILES, 'README.md'])).toContain(
      'archive allowlist contains unexpected file README.md',
    );

    const entries = unzipSync(new Uint8Array(createArchive(repositoryRoot)));
    delete entries['panel.js'];
    entries['package.json'] = new Uint8Array();
    expect(validateArchiveEntries(entries, repositoryRoot)).toEqual(
      expect.arrayContaining([
        'archive allowlist is missing panel.js',
        'archive allowlist contains unexpected file package.json',
      ]),
    );
  });

  test('writes a versioned package and leaves no output after fixture cleanup', () => {
    const root = createFixture();
    const { outputPath, size } = writeExtensionPackage(root);

    expect(path.basename(outputPath)).toBe('network-plus-extension-1.6.0.zip');
    expect(size).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(validateArchiveEntries(unzipSync(fs.readFileSync(outputPath)), root)).toEqual([]);
  });
});

describe('archive determinism', () => {
  test('produces identical bytes for identical runtime content', () => {
    expect(createArchive(repositoryRoot)).toEqual(createArchive(repositoryRoot));
  });
});
