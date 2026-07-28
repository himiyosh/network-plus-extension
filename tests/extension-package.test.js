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
const {
  getGitHubReleaseBaseUrl,
  getReleaseDownloadUrl,
  getReleaseTagUrl,
  validateReleaseVersions,
} = require('../scripts/check-version-sync');

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

const mockFsResultForPath = (method, targetPath, replacement) => {
  const original = fs[method];
  const resolvedTarget = path.resolve(targetPath);
  return jest.spyOn(fs, method).mockImplementation((candidate, ...args) => {
    if (path.resolve(candidate) === resolvedTarget) return replacement(candidate, ...args);
    return Reflect.apply(original, fs, [candidate, ...args]);
  });
};

afterEach(() => {
  jest.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('release version integrity', () => {
  const QUICK_TRY_PREFIX = '**すぐに試す:**';
  const RELEASE_SETUP_HEADING = '### リリース ZIP から試す';
  const DEFAULT_REPOSITORY = {
    type: 'git',
    url: 'git+https://github.com/himiyosh/network-plus-extension.git',
  };
  const createReadmeSource = (
    version,
    {
      repository = DEFAULT_REPOSITORY,
      setupPrelude = [],
      boundaryHeading = '### ソースから開発する',
      trailingLines = [],
    } = {},
  ) => {
    const archiveName = getReleaseArchiveName(version);
    const downloadUrl = getReleaseDownloadUrl(repository, version);
    const tagUrl = getReleaseTagUrl(repository, version);
    return [
      `**すぐに試す:** [v${version} リリース ZIP を直接ダウンロード](${downloadUrl}) | **リリース情報:** [v${version}](${tagUrl})`,
      RELEASE_SETUP_HEADING,
      ...setupPrelude,
      `1. [${archiveName}](${downloadUrl}) を直接ダウンロードする。変更内容は [v${version} リリース情報](${tagUrl}) で確認できる`,
      boundaryHeading,
      ...trailingLines,
    ].join('\n');
  };
  const createVersionInput = (version = '1.6.0', readmeVersion = version, readmeOptions = {}) => {
    const repository = readmeOptions.repository ?? DEFAULT_REPOSITORY;
    const readmeRepository = readmeOptions.readmeRepository ?? repository;
    return {
      packageJson: { version, repository },
      lockfile: {
        version,
        packages: { '': { version } },
      },
      manifest: { version },
      panelSource: `const TEST_EXTENSION_VERSION_FALLBACK = '${version}';`,
      readmeSource: createReadmeSource(readmeVersion, { ...readmeOptions, repository: readmeRepository }),
    };
  };

  test('normalizes GitHub repository metadata into a canonical release base URL', () => {
    expect(getGitHubReleaseBaseUrl(DEFAULT_REPOSITORY)).toBe(
      'https://github.com/himiyosh/network-plus-extension/releases',
    );
    expect(getGitHubReleaseBaseUrl('https://github.com/example/network-plus-extension.git')).toBe(
      'https://github.com/example/network-plus-extension/releases',
    );
  });

  test.each([
    ['missing metadata', undefined, 'package.json repository must be a URL string or a git repository object'],
    [
      'non-git object metadata',
      { type: 'svn', url: 'https://github.com/example/network-plus-extension.git' },
      'package.json repository.type must be "git"',
    ],
    [
      'non-GitHub host',
      'https://gitlab.com/example/network-plus-extension.git',
      'package.json repository URL must use github.com',
    ],
    [
      'missing owner or repository',
      'https://github.com/network-plus-extension.git',
      'package.json repository URL must identify exactly one GitHub owner and repository',
    ],
    [
      'query parameters',
      'https://github.com/example/network-plus-extension.git?ref=main',
      'package.json repository URL must not include query parameters or fragments',
    ],
    [
      'fragments',
      'https://github.com/example/network-plus-extension.git#readme',
      'package.json repository URL must not include query parameters or fragments',
    ],
    [
      'credentials',
      'https://user:token@github.com/example/network-plus-extension.git',
      'package.json repository URL must not include credentials',
    ],
    [
      'ambiguous extra path segments',
      'https://github.com/example/network-plus-extension/tree/main',
      'package.json repository URL must identify exactly one GitHub owner and repository',
    ],
  ])('rejects %s', (_, repository, expectedError) => {
    expect(() => getGitHubReleaseBaseUrl(repository)).toThrow(expectedError);
  });

  test('accepts synchronized release versions and README download routes', () => {
    expect(validateReleaseVersions(createVersionInput())).toEqual([]);
  });

  test('derives release routes from fork repository metadata and rejects stale original routes', () => {
    const repository = {
      type: 'git',
      url: 'git+https://github.com/example/network-plus-extension.git',
    };
    expect(validateReleaseVersions(createVersionInput('1.6.0', '1.6.0', { repository }))).toEqual([]);

    const staleInput = createVersionInput('1.6.0', '1.6.0', {
      repository,
      readmeRepository: DEFAULT_REPOSITORY,
    });
    expect(validateReleaseVersions(staleInput)).toEqual(
      expect.arrayContaining([
        `README.md primary release ZIP CTA must link directly to ${getReleaseDownloadUrl(repository, '1.6.0')}`,
        `README.md quick-start release context must link to ${getReleaseTagUrl(repository, '1.6.0')}`,
        `README.md release ZIP setup must link directly to ${getReleaseDownloadUrl(repository, '1.6.0')}`,
        `README.md release ZIP setup context must link to ${getReleaseTagUrl(repository, '1.6.0')}`,
      ]),
    );
  });

  test('fails closed when package repository metadata is missing or unsupported', () => {
    const missing = createVersionInput();
    delete missing.packageJson.repository;
    expect(validateReleaseVersions(missing)).toEqual([
      'package.json repository must be a URL string or a git repository object',
    ]);

    const unsupported = createVersionInput();
    unsupported.packageJson.repository = {
      type: 'git',
      url: 'https://gitlab.com/example/network-plus-extension.git',
    };
    expect(validateReleaseVersions(unsupported)).toEqual(['package.json repository URL must use github.com']);
  });

  test('bounds the release ZIP setup at the next h2 while allowing deeper headings', () => {
    const input = createVersionInput('1.6.0', '1.6.0', {
      setupPrelude: ['#### ダウンロードの補足'],
      boundaryHeading: '## 開発者向け',
      trailingLines: ['1. この手順はリリース ZIP セクションの外側にある。'],
    });

    expect(validateReleaseVersions(input)).toEqual([]);
  });

  test('bounds the release ZIP setup at the next h3 before trailing numbered steps', () => {
    const input = createVersionInput('1.6.0', '1.6.0', {
      boundaryHeading: '### ソースから開発する',
      trailingLines: ['1. npm ci を実行する。'],
    });

    expect(validateReleaseVersions(input)).toEqual([]);
  });

  test('rejects missing or duplicated README release route landmarks', () => {
    const missing = createVersionInput();
    missing.readmeSource = missing.readmeSource
      .split('\n')
      .filter((line) => !line.startsWith(QUICK_TRY_PREFIX))
      .join('\n');
    expect(validateReleaseVersions(missing)).toEqual(
      expect.arrayContaining([`README.md must contain exactly one ${QUICK_TRY_PREFIX} line`]),
    );

    const duplicated = createVersionInput();
    duplicated.readmeSource = `${duplicated.readmeSource}\n${RELEASE_SETUP_HEADING}`;
    expect(validateReleaseVersions(duplicated)).toEqual(
      expect.arrayContaining([`README.md must contain exactly one ${RELEASE_SETUP_HEADING} section`]),
    );
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
    const repository = input.packageJson.repository;

    expect(validateReleaseVersions(input)).toEqual(
      expect.arrayContaining([
        `README.md primary release ZIP CTA must link directly to ${getReleaseDownloadUrl(repository, version)}`,
        `README.md quick-start release context must link to ${getReleaseTagUrl(repository, version)}`,
        `README.md release ZIP setup must link directly to ${getReleaseDownloadUrl(repository, version)}`,
        `README.md release ZIP setup must name ${getReleaseArchiveName(version)}`,
        `README.md release ZIP setup context must link to ${getReleaseTagUrl(repository, version)}`,
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
    const panelCssPath = path.join(root, 'panel.css');
    const symbolicLinkStat = Object.create(fs.lstatSync(panelCssPath));
    symbolicLinkStat.isSymbolicLink = () => true;
    const lstatMock = mockFsResultForPath('lstatSync', panelCssPath, () => symbolicLinkStat);

    expect(validateExtension(root)).toContain('runtime file must not be a symbolic link: panel.css');
    expect(() => createArchive(root)).toThrow('runtime file must not be a symbolic link: panel.css');
    lstatMock.mockRestore();

    const parentLinkRoot = createFixture();
    const outsideVendor = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-vendor-'));
    temporaryDirectories.push(outsideVendor);
    const outsideVendorFile = path.join(outsideVendor, 'fflate.js');
    fs.copyFileSync(path.join(repositoryRoot, 'vendor/fflate.js'), outsideVendorFile);
    const vendorFile = path.join(parentLinkRoot, 'vendor/fflate.js');
    mockFsResultForPath('realpathSync', vendorFile, () => outsideVendorFile);

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
