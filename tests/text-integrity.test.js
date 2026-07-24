const {
  EMPTY_TREE_SHA,
  ZERO_SHA,
  inspectAddedLines,
  normalizeBaseSha,
  parseArgs,
  requireSha,
} = require('../scripts/check-text-integrity');

describe('inspectAddedLines', () => {
  test('accepts a clean diff and counts added lines', () => {
    const diff = [
      'diff --git a/example.txt b/example.txt',
      '--- a/example.txt',
      '+++ b/example.txt',
      '@@ -1 +1,2 @@',
      ' unchanged',
      '+clean line',
    ].join('\n');

    expect(inspectAddedLines(diff)).toEqual({ addedLineCount: 1, errors: [] });
  });

  test('detects trailing whitespace, CRLF, and U+FFFD in added lines', () => {
    const diff = [
      'diff --git a/example.txt b/example.txt',
      '--- a/example.txt',
      '+++ b/example.txt',
      '@@ -0,0 +1,3 @@',
      '+trailing ',
      '+windows\r',
      '+broken \uFFFD text',
    ].join('\n');

    expect(inspectAddedLines(diff)).toEqual({
      addedLineCount: 3,
      errors: [
        'example.txt:1: trailing whitespace',
        'example.txt:2: CRLF line ending',
        'example.txt:3: replacement character (U+FFFD)',
      ],
    });
  });

  test('ignores removed lines and reports an empty diff explicitly', () => {
    expect(inspectAddedLines('')).toEqual({ addedLineCount: 0, errors: [] });

    const removedOnly = [
      'diff --git a/example.txt b/example.txt',
      '--- a/example.txt',
      '+++ b/example.txt',
      '@@ -1 +0,0 @@',
      '-removed ',
    ].join('\n');

    expect(inspectAddedLines(removedOnly)).toEqual({ addedLineCount: 0, errors: [] });
  });
});

describe('Git revision inputs', () => {
  test('maps an initial push zero SHA to the empty tree', () => {
    expect(normalizeBaseSha(ZERO_SHA)).toBe(EMPTY_TREE_SHA);
    expect(normalizeBaseSha('a'.repeat(40))).toBe('a'.repeat(40));
  });

  test('parses explicit base and head arguments', () => {
    expect(parseArgs(['--base', 'a'.repeat(40), '--head', 'b'.repeat(40)])).toEqual({
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
    });
  });

  test('rejects missing or abbreviated SHAs', () => {
    expect(() => requireSha(undefined, '--base')).toThrow('--base must be a full 40-character Git SHA');
    expect(() => requireSha('abc123', '--head')).toThrow('--head must be a full 40-character Git SHA');
  });
});
