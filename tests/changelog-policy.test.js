const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  USER_FACING_EXACT_PATHS,
  USER_FACING_PATH_PREFIXES,
  extractUnreleasedEntries,
  isUserFacingPath,
  normalizePath,
  parseArgs,
  validateChangelogPolicy,
} = require('../scripts/check-changelog');

const checkerPath = path.join(__dirname, '..', 'scripts', 'check-changelog.js');
const temporaryDirectories = [];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
};

const runGit = (root, args) => {
  const result = run('git', args, { cwd: root });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const changelog = (...entries) =>
  ['# Changelog', '', '## Unreleased', '', ...entries.map((entry) => `- ${entry}`), '', '## v1.6.0'].join('\n');

describe('changelog policy path classification', () => {
  test.each(Array.from(USER_FACING_EXACT_PATHS))('%s is user-facing', (relativePath) => {
    expect(isUserFacingPath(relativePath)).toBe(true);
  });

  test.each(USER_FACING_PATH_PREFIXES)('%s descendants are user-facing', (prefix) => {
    expect(isUserFacingPath(`${prefix}example.png`)).toBe(true);
  });

  test.each([
    'package-lock.json',
    'package.json',
    'scripts/check-changelog.js',
    'tests/changelog-policy.test.js',
    '.github/workflows/quality-gates.yml',
    'docs/architecture.md',
  ])('%s does not require a release note by itself', (relativePath) => {
    expect(isUserFacingPath(relativePath)).toBe(false);
  });

  test('normalizes platform separators and leading dot paths', () => {
    expect(normalizePath('.\\icons\\icon16.png')).toBe('icons/icon16.png');
  });
});

describe('Unreleased entry extraction', () => {
  test('returns only bullets in the Unreleased section', () => {
    expect(extractUnreleasedEntries(changelog('Added one.', 'Fixed two.'))).toEqual(['- Added one.', '- Fixed two.']);
  });

  test('fails closed when the heading is absent', () => {
    expect(extractUnreleasedEntries('# Changelog\n\n## v1.6.0\n\n- Historical.')).toEqual([]);
  });
});

describe('changelog enforcement', () => {
  const baseChangelog = changelog('Existing entry.');

  test('rejects a runtime change without a new Unreleased bullet', () => {
    expect(
      validateChangelogPolicy({
        changedPaths: ['panel.js'],
        baseChangelog,
        headChangelog: baseChangelog,
      }),
    ).toEqual({
      addedEntries: [],
      errors: ['docs/CHANGELOG.md must add an "Unreleased" bullet for user-facing changes: panel.js'],
      triggeringPaths: ['panel.js'],
    });
  });

  test('accepts a runtime change with a new Unreleased bullet', () => {
    expect(
      validateChangelogPolicy({
        changedPaths: ['panel.js', 'docs/CHANGELOG.md'],
        baseChangelog,
        headChangelog: changelog('New behavior.', 'Existing entry.'),
      }),
    ).toEqual({
      addedEntries: ['- New behavior.'],
      errors: [],
      triggeringPaths: ['panel.js'],
    });
  });

  test('rejects a changelog edit outside Unreleased', () => {
    expect(
      validateChangelogPolicy({
        changedPaths: ['icons/icon128.png', 'docs/CHANGELOG.md'],
        baseChangelog,
        headChangelog: `${baseChangelog}\n- Edited historical release.`,
      }).errors,
    ).toHaveLength(1);
  });

  test('does not require release notes for tests and build tooling only', () => {
    expect(
      validateChangelogPolicy({
        changedPaths: ['tests/panel.test.js', 'scripts/check-version-sync.js'],
        baseChangelog,
        headChangelog: baseChangelog,
      }),
    ).toEqual({ addedEntries: [], errors: [], triggeringPaths: [] });
  });

  test('deduplicates and sorts triggering paths in diagnostics', () => {
    expect(
      validateChangelogPolicy({
        changedPaths: ['panel.js', 'README.md', 'panel.js'],
        baseChangelog,
        headChangelog: baseChangelog,
      }).triggeringPaths,
    ).toEqual(['README.md', 'panel.js']);
  });
});

test('parses explicit base and head arguments', () => {
  expect(parseArgs(['--base', 'a'.repeat(40), '--head', 'b'.repeat(40)])).toEqual({
    base: 'a'.repeat(40),
    head: 'b'.repeat(40),
  });
});

test('CLI rejects an omitted release note and accepts the follow-up entry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'network-plus-changelog-'));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'panel.js'), 'const state = "before";\n');
  fs.writeFileSync(path.join(root, 'docs', 'CHANGELOG.md'), `${changelog('Existing entry.')}\n`);

  runGit(root, ['init', '--quiet']);
  runGit(root, ['config', 'user.name', 'Changelog Policy Test']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '--quiet', '-m', 'baseline']);
  const base = runGit(root, ['rev-parse', 'HEAD']);

  fs.writeFileSync(path.join(root, 'panel.js'), 'const state = "after";\n');
  runGit(root, ['add', 'panel.js']);
  runGit(root, ['commit', '--quiet', '-m', 'change runtime']);
  const missingNoteHead = runGit(root, ['rev-parse', 'HEAD']);
  const rejected = run(process.execPath, [checkerPath, '--base', base, '--head', missingNoteHead], {
    cwd: root,
  });

  expect(rejected.status).toBe(1);
  expect(rejected.stderr).toContain('must add an "Unreleased" bullet');
  expect(rejected.stderr).toContain('panel.js');

  fs.writeFileSync(
    path.join(root, 'docs', 'CHANGELOG.md'),
    `${changelog('New runtime behavior.', 'Existing entry.')}\n`,
  );
  runGit(root, ['add', 'docs/CHANGELOG.md']);
  runGit(root, ['commit', '--quiet', '-m', 'add release note']);
  const documentedHead = runGit(root, ['rev-parse', 'HEAD']);
  const accepted = run(process.execPath, [checkerPath, '--base', base, '--head', documentedHead], {
    cwd: root,
  });

  expect(accepted.status).toBe(0);
  expect(accepted.stdout).toContain('1 new Unreleased entry');
});
