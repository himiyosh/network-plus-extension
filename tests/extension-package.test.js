const fs = require('fs');
const os = require('os');
const path = require('path');
const { unzipSync } = require('../vendor/fflate');
const {
  EXPECTED_PERMISSIONS,
  RUNTIME_FILES,
  checkExtensionPackage,
  createArchive,
  getReleaseArchiveName,
  validateArchiveAllowlist,
  validateArchiveEntries,
  validateExtension,
  writeExtensionPackage,
} = require('../scripts/check-extension-package');
const { getReleaseDownloadUrl, getReleaseTagUrl, validateReleaseVersions } = require('../scripts/check-version-sync');

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

describe('release version integrity', () => {
  const RELEASE_SETUP_HEADING = '### リリース ZIP から試す';
  const createReadmeSource = (version) => {
    const archiveName = getReleaseArchiveName(version);
    const downloadUrl = getReleaseDownloadUrl(version);
    const tagUrl = getReleaseTagUrl(version);
    return [
      `**すぐに試す:** [v${version} リリース ZIP を直接ダウンロード](${downloadUrl}) | **リリース情報:** [v${version}](${tagUrl})`,
      RELEASE_SETUP_HEADING,
      `1. [${archiveName}](${downloadUrl}) を直接ダウンロードする。変更内容は [v${version} リリース情報](${tagUrl}) で確認できる`,
      '### ソースから開発する',
    ].join('\n');
  };
  const createVersionInput = (version = '1.6.0', readmeVersion = version) => ({
    packageJson: { version },
    lockfile: {
      version,
      packages: { '': { version } },
    },
    manifest: { version },
    panelSource: `const TEST_EXTENSION_VERSION_FALLBACK = '${version}';`,
    readmeSource: createReadmeSource(readmeVersion),
  });

  test('accepts synchronized release versions and README download routes', () => {
    expect(validateReleaseVersions(createVersionInput())).toEqual([]);
  });

  test('rejects panel fallback drift', () => {
    const input = createVersionInput();
    input.panelSource = "const TEST_EXTENSION_VERSION_FALLBACK = '1.5.0';";

    expect(validateReleaseVersions(input)).toEqual([
      'Version mismatch: package.json=1.6.0, manifest.json=1.6.0, package-lock.json=1.6.0, package-lock.json root=1.6.0, panel.js fallback=1.5.0',
    ]);
  });

  test('rejects a missing or duplicated panel fallback constant', () => {
    const missing = createVersionInput();
    missing.panelSource = '';
    expect(validateReleaseVersions(missing)).toEqual(
      expect.arrayContaining(['panel.js must define TEST_EXTENSION_VERSION_FALLBACK exactly once']),
    );

    const duplicated = createVersionInput();
    duplicated.panelSource += duplicated.panelSource;
    expect(validateReleaseVersions(duplicated)).toEqual(
      expect.arrayContaining(['panel.js must define TEST_EXTENSION_VERSION_FALLBACK exactly once']),
    );
  });

  test('rejects README routes left stale after a synchronized version change', () => {
    const version = '1.7.0';
    const input = createVersionInput(version, '1.6.0');

    expect(validateReleaseVersions(input)).toEqual(
      expect.arrayContaining([
        `README.md primary release ZIP CTA must link directly to ${getReleaseDownloadUrl(version)}`,
        `README.md quick-start release context must link to ${getReleaseTagUrl(version)}`,
        `README.md release ZIP setup must link directly to ${getReleaseDownloadUrl(version)}`,
        `README.md release ZIP setup must name ${getReleaseArchiveName(version)}`,
        `README.md release ZIP setup context must link to ${getReleaseTagUrl(version)}`,
      ]),
    );
  });
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

  test('rejects manifest identity drift and privileged attack surfaces', () => {
    const root = createFixture();
    const manifest = readManifest(root);
    manifest.manifest_version = 2;
    manifest.name = 'Unexpected extension';
    manifest.version = '1.6.0-beta.1';
    manifest.icons = { 16: 'icons/unreviewed.svg' };
    manifest.minimum_chrome_version = '120';
    manifest.background = {};
    manifest.content_scripts = [];
    manifest.externally_connectable = {};
    manifest.host_permissions = [];
    manifest.optional_host_permissions = [];
    manifest.optional_permissions = [];
    manifest.sandbox = {};
    manifest.web_accessible_resources = [];
    writeManifest(root, manifest);

    expect(validateExtension(root)).toEqual(
      expect.arrayContaining([
        'manifest contains unapproved top-level key: minimum_chrome_version',
        'manifest privileged surface is not allowed: background',
        'manifest privileged surface is not allowed: content_scripts',
        'manifest privileged surface is not allowed: externally_connectable',
        'manifest privileged surface is not allowed: host_permissions',
        'manifest privileged surface is not allowed: optional_host_permissions',
        'manifest privileged surface is not allowed: optional_permissions',
        'manifest privileged surface is not allowed: sandbox',
        'manifest privileged surface is not allowed: web_accessible_resources',
        'manifest_version must be exactly 3',
        'manifest name must be exactly: Network+ for DevTools',
        'manifest version must be a stable MAJOR.MINOR.PATCH value',
        'manifest icons must reference the audited 16, 48, and 128 PNG files',
      ]),
    );
  });

  test('rejects remote, imported, and unallowlisted static resources', () => {
    const root = createFixture();
    fs.appendFileSync(
      path.join(root, 'panel.html'),
      '<img src="README.md"><iframe src="//example.com/frame"></iframe><object data="data:text/plain,unsafe"></object>\n',
    );
    fs.appendFileSync(
      path.join(root, 'panel.css'),
      "\n@import './theme.css';\n.remote{background:url(https://example.com/image.png)}\n.protocol{background:url(//example.com/image.png)}\n",
    );

    expect(validateExtension(root)).toEqual(
      expect.arrayContaining([
        'panel.html iframe src must be local: //example.com/frame',
        'panel.html object data must be local: data:text/plain,unsafe',
        'static resource is not in the archive allowlist: README.md',
        'static resource is missing: README.md',
        'panel.css must not use CSS @import',
        'panel.css url() must be local: https://example.com/image.png',
        'panel.css url() must be local: //example.com/image.png',
      ]),
    );
  });

  test('rejects runtime symlinks and parent-directory root escapes', () => {
    const root = createFixture();
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-outside-'));
    temporaryDirectories.push(outsideRoot);
    const outsideFile = path.join(outsideRoot, 'outside.css');
    fs.writeFileSync(outsideFile, 'external content');
    fs.rmSync(path.join(root, 'panel.css'));

    try {
      fs.symlinkSync(outsideFile, path.join(root, 'panel.css'));
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        console.warn(`Symlink regression skipped because this environment returned ${error.code}`);
        expect(['EPERM', 'EACCES', 'ENOSYS']).toContain(error.code);
        return;
      }
      throw error;
    }

    expect(validateExtension(root)).toContain('runtime file must not be a symbolic link: panel.css');
    expect(() => createArchive(root)).toThrow('runtime file must not be a symbolic link: panel.css');

    const parentLinkRoot = createFixture();
    const outsideVendor = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-vendor-'));
    temporaryDirectories.push(outsideVendor);
    fs.copyFileSync(path.join(repositoryRoot, 'vendor/fflate.js'), path.join(outsideVendor, 'fflate.js'));
    fs.rmSync(path.join(parentLinkRoot, 'vendor'), { recursive: true });
    try {
      fs.symlinkSync(outsideVendor, path.join(parentLinkRoot, 'vendor'), 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) {
        console.warn(`Parent symlink regression skipped because this environment returned ${error.code}`);
        expect(['EPERM', 'EACCES', 'ENOSYS']).toContain(error.code);
        return;
      }
      throw error;
    }

    expect(validateExtension(parentLinkRoot)).toContain(
      'runtime file resolves outside extension root: vendor/fflate.js',
    );
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
        'static resource is missing: panel.css',
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
