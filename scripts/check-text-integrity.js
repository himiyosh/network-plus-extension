const { spawnSync } = require('child_process');

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const ZERO_SHA = '0000000000000000000000000000000000000000';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

const normalizeBaseSha = (baseSha) => (baseSha === ZERO_SHA ? EMPTY_TREE_SHA : baseSha);

const inspectAddedLines = (diff) => {
  const errors = [];
  let addedLineCount = 0;
  let currentFile = null;
  let currentLine = null;
  let inHunk = false;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHunk = false;
      currentLine = null;
      continue;
    }

    if (!inHunk && line.startsWith('+++ ')) {
      const path = line.slice(4);
      currentFile = path.startsWith('b/') ? path.slice(2) : path;
      continue;
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      inHunk = true;
      currentLine = Number(hunk[1]);
      continue;
    }

    if (!inHunk || currentLine === null) {
      continue;
    }

    if (line.startsWith('+')) {
      const content = line.slice(1);
      const contentWithoutCarriageReturn = content.endsWith('\r') ? content.slice(0, -1) : content;
      const location = `${currentFile ?? 'unknown'}:${currentLine}`;

      addedLineCount += 1;

      if (/[ \t]+$/.test(contentWithoutCarriageReturn)) {
        errors.push(`${location}: trailing whitespace`);
      }
      if (content.endsWith('\r')) {
        errors.push(`${location}: CRLF line ending`);
      }
      if (content.includes('\uFFFD')) {
        errors.push(`${location}: replacement character (U+FFFD)`);
      }

      currentLine += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      currentLine += 1;
    }
  }

  return { addedLineCount, errors };
};

const runGit = (args, options = {}) => {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }

  return result.stdout;
};

const requireSha = (value, label) => {
  if (!value || !SHA_PATTERN.test(value)) {
    throw new Error(`${label} must be a full 40-character Git SHA`);
  }
};

const assertGitObject = (sha, isTree = false) => {
  const suffix = isTree ? '^{tree}' : '^{commit}';
  runGit(['cat-file', '-e', `${sha}${suffix}`]);
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

const main = () => {
  try {
    const { base, head } = parseArgs(process.argv.slice(2));
    requireSha(base, '--base');
    requireSha(head, '--head');

    const effectiveBase = normalizeBaseSha(base);
    if (base === ZERO_SHA) {
      const emptyTree = runGit(['hash-object', '-t', 'tree', '-w', '--stdin'], { input: '' }).trim();
      if (emptyTree !== EMPTY_TREE_SHA) {
        throw new Error(`unexpected empty tree SHA: ${emptyTree}`);
      }
    }
    assertGitObject(effectiveBase, effectiveBase === EMPTY_TREE_SHA);
    assertGitObject(head);

    const diff = runGit(['diff', '--no-color', '--no-ext-diff', '--unified=0', effectiveBase, head, '--']);
    const { addedLineCount, errors } = inspectAddedLines(diff);

    if (errors.length > 0) {
      for (const error of errors) {
        console.error(`ERROR: ${error}`);
      }
      process.exitCode = 1;
      return;
    }

    const initialPush = base === ZERO_SHA ? ' (initial push against empty tree)' : '';
    console.log(
      `OK: text integrity clean for ${effectiveBase}..${head}${initialPush}; ${addedLineCount} added lines checked`,
    );
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  EMPTY_TREE_SHA,
  ZERO_SHA,
  inspectAddedLines,
  normalizeBaseSha,
  parseArgs,
  requireSha,
};
