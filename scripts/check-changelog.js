'use strict';

const { spawnSync } = require('child_process');
const { EMPTY_TREE_SHA, normalizeBaseSha, requireSha } = require('./check-text-integrity');
const { RUNTIME_FILES } = require('./check-extension-package');

const CHANGELOG_PATH = 'docs/CHANGELOG.md';
const USER_FACING_EXACT_PATHS = new Set([
  ...RUNTIME_FILES,
  '.github/FUNDING.yml',
  'README.md',
  'docs/edge-addons-submission.md',
  'docs/privacy.md',
]);
const USER_FACING_PATH_PREFIXES = Object.freeze(['docs/store-assets/', 'icons/']);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

const runGit = (args, options = {}) => {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }

  return result.stdout;
};

const parseArgs = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--base' || args[index] === '--head') {
      values[args[index].slice(2)] = args[index + 1];
      index += 1;
    }
  }
  return values;
};

const normalizePath = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '');

const isUserFacingPath = (value) => {
  const relativePath = normalizePath(value);
  return (
    USER_FACING_EXACT_PATHS.has(relativePath) ||
    USER_FACING_PATH_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
  );
};

const extractUnreleasedEntries = (source) => {
  if (typeof source !== 'string') return [];

  const lines = source.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === '## Unreleased');
  if (headingIndex < 0) return [];

  const entries = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^##(?:\s|$)/.test(line)) break;
    if (/^-\s+\S/.test(line)) entries.push(line.trim());
  }
  return entries;
};

// Entry format. The changelog opened with one short line per change and drifted
// into paragraphs — by v1.12.0 the average entry ran 688 characters and the
// longest 1238, which is a wall of text nobody scans. These bounds put it back,
// and are checked only against entries a change actually adds, so released
// history is never retroactively invalid.
const ENTRY_CATEGORIES = Object.freeze({
  '\u2728': '追加',
  '\ud83d\udc1b': '修正',
  '\ud83d\udd27': '変更',
  '\u26a1': 'パフォーマンス',
  '\ud83d\udd12': 'プライバシー・セキュリティ',
  '\ud83d\udcdd': 'ドキュメント',
});
const ENTRY_MAX_LENGTH = 200;
const DETAIL_MAX_LENGTH = 200;
// A continuation must be a nested bullet. A bare two-space indent is a lazy
// paragraph continuation in CommonMark, so GitHub folds it onto the entry and
// renders one run-on line — the separation exists only in the raw file.
const DETAIL_LINE_PATTERN = /^ {2}\S/;
const NESTED_DETAIL_PATTERN = /^ {2}- \S/;

// Emoji are surrogate pairs, so length has to be counted in code points or a
// two-character emoji spends four of the budget.
const countCharacters = (value) => Array.from(value).length;

const startsWithCategory = (entry) => {
  const body = entry.replace(/^-\s+/, '');
  return Object.keys(ENTRY_CATEGORIES).some((emoji) => body.startsWith(`${emoji} `));
};

// Returns each Unreleased bullet with the indented continuation lines that
// belong to it, so the format of both can be checked together.
const extractUnreleasedBlocks = (source) => {
  if (typeof source !== 'string') return [];

  const lines = source.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === '## Unreleased');
  if (headingIndex < 0) return [];

  const blocks = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^##(?:\s|$)/.test(line)) break;
    if (/^-\s+\S/.test(line)) blocks.push({ entry: line.trim(), details: [] });
    else if (DETAIL_LINE_PATTERN.test(line) && blocks.length > 0) {
      blocks[blocks.length - 1].details.push(line);
    }
  }
  return blocks;
};

const validateEntryFormat = (blocks) => {
  const errors = [];
  const categories = Object.entries(ENTRY_CATEGORIES)
    .map(([emoji, name]) => `${emoji} ${name}`)
    .join(' / ');

  for (const { entry, details } of blocks) {
    if (!startsWithCategory(entry)) {
      errors.push(`${CHANGELOG_PATH} entry needs a leading category emoji (${categories}): ${entry.slice(0, 60)}`);
    }

    const length = countCharacters(entry);
    if (length > ENTRY_MAX_LENGTH) {
      errors.push(
        `${CHANGELOG_PATH} entry runs ${length} characters, over the ${ENTRY_MAX_LENGTH} limit — move the detail to the commit message: ${entry.slice(0, 60)}`,
      );
    }

    if (details.length > 1) {
      errors.push(
        `${CHANGELOG_PATH} entry carries ${details.length} continuation lines; at most one is allowed: ${entry.slice(0, 60)}`,
      );
    }

    for (const detail of details) {
      if (!NESTED_DETAIL_PATTERN.test(detail)) {
        errors.push(
          `${CHANGELOG_PATH} continuation line must be a nested bullet ("  - Why: …") or GitHub renders it joined onto the entry: ${detail.trim().slice(0, 60)}`,
        );
      }

      const detailLength = countCharacters(detail.trim());
      if (detailLength > DETAIL_MAX_LENGTH) {
        errors.push(
          `${CHANGELOG_PATH} continuation line runs ${detailLength} characters, over the ${DETAIL_MAX_LENGTH} limit: ${detail.trim().slice(0, 60)}`,
        );
      }
    }
  }
  return errors;
};

const validateChangelogPolicy = ({ changedPaths, baseChangelog, headChangelog }) => {
  const triggeringPaths = Array.from(new Set(changedPaths.map(normalizePath)))
    .filter((relativePath) => relativePath !== CHANGELOG_PATH && isUserFacingPath(relativePath))
    .sort();

  const baseEntries = new Set(extractUnreleasedEntries(baseChangelog));
  const headBlocks = extractUnreleasedBlocks(headChangelog);
  const headEntries = headBlocks.map((block) => block.entry);
  const addedBlocks = headBlocks.filter((block) => !baseEntries.has(block.entry));
  const addedEntries = addedBlocks.map((block) => block.entry);

  // Format is enforced on what this change adds, whatever else it touched: a
  // documentation-only edit can drift the style just as easily as a feature.
  const errors = validateEntryFormat(addedBlocks);

  if (triggeringPaths.length === 0) {
    return { addedEntries, errors, triggeringPaths };
  }

  if (headEntries.length === 0) {
    errors.push(`${CHANGELOG_PATH} must contain an "## Unreleased" section with bullet entries`);
  } else if (addedEntries.length === 0) {
    errors.push(
      `${CHANGELOG_PATH} must add an "Unreleased" bullet for user-facing changes: ${triggeringPaths.join(', ')}`,
    );
  }

  return { addedEntries, errors, triggeringPaths };
};

const readFileAtRevision = (revision, relativePath) => {
  if (revision === EMPTY_TREE_SHA) return '';

  const result = spawnSync('git', ['show', `${revision}:${relativePath}`], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status === 0) return result.stdout;
  if (result.status === 128 && /exists on disk, but not in|does not exist in/.test(result.stderr)) return '';

  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`;
  throw new Error(`git show ${revision}:${relativePath} failed: ${detail}`);
};

const checkChangelog = (base, head) => {
  requireSha(base, '--base');
  requireSha(head, '--head');

  const effectiveBase = normalizeBaseSha(base);
  if (!SHA_PATTERN.test(effectiveBase)) throw new Error('effective base must be a full 40-character Git SHA');

  runGit(['cat-file', '-e', `${effectiveBase}^{tree}`]);
  runGit(['cat-file', '-e', `${head}^{commit}`]);

  const changedPaths = runGit([
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=ACDMRTUXB',
    effectiveBase,
    head,
    '--',
  ])
    .split(/\r?\n/)
    .filter(Boolean);

  return validateChangelogPolicy({
    changedPaths,
    baseChangelog: readFileAtRevision(effectiveBase, CHANGELOG_PATH),
    headChangelog: readFileAtRevision(head, CHANGELOG_PATH),
  });
};

const main = () => {
  try {
    const { base, head } = parseArgs(process.argv.slice(2));
    const result = checkChangelog(base, head);

    if (result.errors.length > 0) {
      for (const error of result.errors) console.error(`ERROR: ${error}`);
      process.exitCode = 1;
      return;
    }

    if (result.triggeringPaths.length === 0) {
      console.log('OK: no user-facing changes require a changelog entry');
      return;
    }

    console.log(
      `OK: changelog updated for ${result.triggeringPaths.length} user-facing path(s); ${result.addedEntries.length} new Unreleased entr${result.addedEntries.length === 1 ? 'y' : 'ies'}`,
    );
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
};

if (require.main === module) main();

module.exports = {
  CHANGELOG_PATH,
  USER_FACING_EXACT_PATHS,
  USER_FACING_PATH_PREFIXES,
  checkChangelog,
  ENTRY_CATEGORIES,
  ENTRY_MAX_LENGTH,
  extractUnreleasedBlocks,
  extractUnreleasedEntries,
  validateEntryFormat,
  isUserFacingPath,
  normalizePath,
  parseArgs,
  validateChangelogPolicy,
};
