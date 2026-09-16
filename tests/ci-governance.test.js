'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const QUALITY_WORKFLOW = path.join('.github', 'workflows', 'quality-gates.yml');
const RETIRED_FILES = [
  path.join('.github', 'workflows', 'trusted-independent-review.yml'),
  path.join('scripts', 'check-independent-review.js'),
  path.join('tests', 'fixtures', 'independent-review-cases.json'),
  path.join('tests', 'independent-review.test.js'),
  path.join('tests', 'trusted-review-boundary.test.js'),
];
const REQUIRED_QUALITY_COMMANDS = [
  'npm run text:check',
  'npm run changelog:check',
  'npm ci',
  'npx jest tests/browser-availability-policy.test.js',
  'npm test -- --runInBand',
  'npm run lint',
  'npm run version:check',
  'npm run format:check',
  'npm run extension:check',
  'npm run extension:package',
  'npm run store:check',
  'npm run integrity:check',
  'npm run audit:strict',
  'npm run contract:check',
];
const RETIRED_PROCEDURE_PATTERNS = [
  { name: 'retired status context', pattern: /\bindependent-review\b/i },
  { name: 'retired marker procedure', pattern: /independent review marker/i },
  { name: 'retired repository variable', pattern: /INDEPENDENT_REVIEW_[A-Z_]+/ },
];

const readRepoFile = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

// A parallel session works in a git worktree under `.claude/worktrees/<name>`,
// which is a whole checkout of this repository at some other commit. Its files
// are another branch's guidance, not this checkout's, so walking into one made
// this suite judge the current tree by a sibling session's history — and fail
// on it. The same goes for a dependency tree that happens to sit under a
// scanned directory.
const SKIPPED_DIRECTORIES = new Set(['worktrees', 'node_modules', '.git']);

const listMarkdownFiles = (relativeDirectory) => {
  const directory = path.join(ROOT, relativeDirectory);
  if (!fs.existsSync(directory)) {
    return [];
  }

  const pending = [directory];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) pending.push(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(path.relative(ROOT, absolutePath));
      }
    }
  }

  return files;
};

const currentGuidanceFiles = () => {
  const fixedFiles = [
    'README.md',
    'README.ja.md',
    path.join('docs', 'coordinator-topology.md'),
    path.join('.github', 'copilot-instructions.md'),
    'CLAUDE.md',
  ];
  const discoveredFiles = [
    ...listMarkdownFiles(path.join('.github', 'agents')),
    ...listMarkdownFiles(path.join('.github', 'instructions')),
    ...listMarkdownFiles('.claude'),
  ];

  return Array.from(new Set([...fixedFiles, ...discoveredFiles])).filter((relativePath) =>
    fs.existsSync(path.join(ROOT, relativePath)),
  );
};

const expectNoRetiredProcedure = (relativePath) => {
  const content = readRepoFile(relativePath);
  for (const { name, pattern } of RETIRED_PROCEDURE_PATTERNS) {
    expect({ file: relativePath, name, match: content.match(pattern)?.[0] }).toEqual({
      file: relativePath,
      name,
      match: undefined,
    });
  }
};

describe('CI governance', () => {
  test('retains the Node 22/24 matrix and normal quality gates', () => {
    const workflow = readRepoFile(QUALITY_WORKFLOW);
    const packageJson = JSON.parse(readRepoFile('package.json'));

    expect(packageJson.engines.node).toBe('^22.0.0 || ^24.0.0');
    expect(workflow).toMatch(/node-version:\s*\n\s*- 22\.x\s*\n\s*- 24\.x/);
    for (const command of REQUIRED_QUALITY_COMMANDS) {
      expect(workflow).toContain(command);
    }
  });

  test.each(RETIRED_FILES)('%s remains absent', (relativePath) => {
    expect(fs.existsSync(path.join(ROOT, relativePath))).toBe(false);
  });

  test('does not publish the retired status from any workflow', () => {
    const workflowsDirectory = path.join(ROOT, '.github', 'workflows');
    const workflows = fs
      .readdirSync(workflowsDirectory)
      .filter((fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
      .map((fileName) => path.join('.github', 'workflows', fileName));

    for (const workflow of workflows) {
      expectNoRetiredProcedure(workflow);
    }
  });

  test('does not restore the retired marker procedure in current guidance', () => {
    for (const guidanceFile of currentGuidanceFiles()) {
      expectNoRetiredProcedure(guidanceFile);
    }
  });

  test('reads only this checkout: a parallel session worktree is not guidance, and jest skips its tests', () => {
    const worktree = path.join(ROOT, '.claude', 'worktrees', 'ci-governance-fixture');
    const planted = path.join(worktree, 'docs', 'CHANGELOG.md');
    fs.mkdirSync(path.dirname(planted), { recursive: true });
    try {
      // The text a sibling session's history legitimately carries, and which
      // this suite refuses to find in the current tree.
      fs.writeFileSync(planted, '- Independent-review gate retired under repository-owner authorization.\n');
      expect(RETIRED_PROCEDURE_PATTERNS.some(({ pattern }) => pattern.test(fs.readFileSync(planted, 'utf8')))).toBe(
        true,
      );
      expect(
        currentGuidanceFiles().filter((file) => file.includes(path.join('worktrees', 'ci-governance-fixture'))),
      ).toEqual([]);
    } finally {
      fs.rmSync(path.join(ROOT, '.claude', 'worktrees', 'ci-governance-fixture'), { recursive: true, force: true });
    }

    // Those worktrees hold a copy of this suite too, so jest has to skip them
    // by path or a run picks up every parallel session's tests as well.
    const jestConfig = JSON.parse(readRepoFile('package.json')).jest;
    expect(jestConfig.testPathIgnorePatterns).toContain('/\\.claude/worktrees/');
  });
});
