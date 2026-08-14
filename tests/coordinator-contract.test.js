const path = require('path');
const fs = require('fs');
const {
  REQUIRED_TOPOLOGY_SECTIONS,
  REQUIRED_INSTRUCTIONS_CONCEPTS,
  AGENT_HOST_TOOL_FALLBACK_CONCEPT,
  TOPOLOGY_DOC,
  AGENT_FILE,
  COPILOT_INSTRUCTIONS_FILE,
  extractFrontmatter,
  hasToolsField,
  validateTopologyDoc,
  validateAgentNoRestrictiveTools,
  validateCopilotInstructions,
  validateAgentHostToolFallback,
} = require('../scripts/check-coordinator-contract');

// ---------------------------------------------------------------------------
// Unit tests for pure helpers
// ---------------------------------------------------------------------------

describe('extractFrontmatter', () => {
  test('extracts frontmatter from a well-formed YAML block', () => {
    const content = '---\ndescription: "test"\n---\n\n# Body';
    expect(extractFrontmatter(content)).toBe('description: "test"');
  });

  test('returns null when no frontmatter is present', () => {
    expect(extractFrontmatter('# No frontmatter here')).toBeNull();
  });

  test('handles Windows line endings inside the frontmatter block', () => {
    const content = '---\r\ndescription: "test"\r\n---\r\n# Body';
    expect(extractFrontmatter(content)).toBe('description: "test"');
  });
});

describe('hasToolsField', () => {
  test('detects a tools: field in frontmatter', () => {
    expect(hasToolsField('description: "x"\ntools: [a, b, c]')).toBe(true);
  });

  test('returns false when no tools: field is present', () => {
    expect(hasToolsField('description: "x"\nmodel: gpt-4')).toBe(false);
  });

  test('does not match tools: in non-frontmatter text positions', () => {
    // mid-line occurrence should not trigger
    expect(hasToolsField('description: "no tools: listed"')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTopologyDoc
// ---------------------------------------------------------------------------

describe('validateTopologyDoc', () => {
  const buildDoc = (overrides = {}) => {
    const defaults = {
      coordinator: '## コーディネーターセッション\n\n説明。\n',
      child: '## チャイルドセッション\n\n最大 3 つ。\n',
      size: '## セッションサイズ制限\n\nキックオフ 32 KiB、完了 8 KiB、ハンドオフ 64 KiB。\n',
      rollover: '## ロールオーバー条件\n\n約 70% に達した場合。100 ターン。\n',
      cleanup: '## クリーンアップゲート\n\nゲート一覧。\n',
      review:
        '## Pull Request レビュー\n\n通常の GitHub Pull Request review として任意に実施する。review comment marker や reviewer session UUID は要求しない。\n',
      fallback: '## Host-Tool Fallback\n\nBLOCKERS: 報告方法。\n',
      datasafety: '## データ安全性\n\nデータ安全性ルール。\n',
    };
    return Object.values({ ...defaults, ...overrides }).join('\n');
  };

  test('accepts a fully compliant document', () => {
    expect(validateTopologyDoc(buildDoc())).toEqual([]);
  });

  test('reports each missing required section heading', () => {
    for (const section of REQUIRED_TOPOLOGY_SECTIONS) {
      const doc = buildDoc().replace(section, '');
      const errors = validateTopologyDoc(doc);
      expect(errors.some((e) => e.includes(section))).toBe(true);
    }
  });

  test('reports missing 32 KiB kickoff size concept', () => {
    const doc = buildDoc({ size: '## セッションサイズ制限\n\nキックオフ、完了 8 KiB、ハンドオフ 64 KiB。\n' });
    const errors = validateTopologyDoc(doc);
    expect(errors.some((e) => e.includes('32 KiB'))).toBe(true);
  });

  test('reports missing 8 KiB completion size concept', () => {
    const doc = buildDoc({ size: '## セッションサイズ制限\n\n32 KiB、ハンドオフ 64 KiB。\n' });
    const errors = validateTopologyDoc(doc);
    expect(errors.some((e) => e.includes('8 KiB'))).toBe(true);
  });

  test('reports missing 64 KiB handoff size concept', () => {
    const doc = buildDoc({ size: '## セッションサイズ制限\n\n32 KiB、完了 8 KiB。\n' });
    const errors = validateTopologyDoc(doc);
    expect(errors.some((e) => e.includes('64 KiB'))).toBe(true);
  });

  test('reports missing 70% rollover threshold concept', () => {
    const doc = buildDoc({ rollover: '## ロールオーバー条件\n\n100 ターン。\n' });
    const errors = validateTopologyDoc(doc);
    expect(errors.some((e) => e.includes('70%'))).toBe(true);
  });

  test('reports missing BLOCKERS fallback concept', () => {
    const doc = buildDoc({ fallback: '## Host-Tool Fallback\n\nフォールバック説明。\n' });
    const errors = validateTopologyDoc(doc);
    expect(errors.some((e) => e.includes('BLOCKERS'))).toBe(true);
  });

  test('reports missing max-3 children concept', () => {
    const doc = buildDoc({ child: '## チャイルドセッション\n\nチャイルドの説明。\n' });
    const errors = validateTopologyDoc(doc);
    expect(errors.some((e) => e.includes('最大 3'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAgentNoRestrictiveTools
// ---------------------------------------------------------------------------

describe('validateAgentNoRestrictiveTools', () => {
  const buildAgentContent = (frontmatter) => `---\n${frontmatter}\n---\n\n# Body`;

  test('accepts an agent file with no tools: field', () => {
    const content = buildAgentContent('description: "test agent"');
    expect(validateAgentNoRestrictiveTools(content)).toEqual([]);
  });

  test('reports an error when a tools: field is present', () => {
    const content = buildAgentContent('description: "test"\ntools: [foo, bar]');
    const errors = validateAgentNoRestrictiveTools(content);
    expect(errors.some((e) => e.includes('must not declare an explicit tools: list'))).toBe(true);
  });

  test('reports missing frontmatter', () => {
    const errors = validateAgentNoRestrictiveTools('# No frontmatter');
    expect(errors.some((e) => e.includes('missing YAML frontmatter'))).toBe(true);
  });

  test('accepts a description-only frontmatter (typical correct form)', () => {
    const content = buildAgentContent('description: "My agent description"');
    expect(validateAgentNoRestrictiveTools(content)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateCopilotInstructions
// ---------------------------------------------------------------------------

describe('validateCopilotInstructions', () => {
  const buildInstructions = (overrides = {}) => {
    const defaults = {
      title: '`🌐 YYYY-MM-DD Network+ 統括`',
      max3: '同時に 3 つまで',
      sizes: '32 KiB キックオフ、8 KiB 完了報告、64 KiB ハンドオフ',
      rollover: '約 70% に達した場合',
      review:
        '通常の GitHub Pull Request review として任意に実施する。review comment marker や reviewer session UUID は要求しない。',
      fallback: '### 7.5 Host-Tool Fallback\n\nBLOCKERS: 報告方法。',
      noManifest: '追跡ファイルのコミットは行わない',
      sensitive: 'PII・顧客データ',
    };
    return Object.values({ ...defaults, ...overrides }).join('\n');
  };

  test('accepts a fully compliant instructions file', () => {
    expect(validateCopilotInstructions(buildInstructions())).toEqual([]);
  });

  test('reports missing dated-title format', () => {
    const content = buildInstructions({ title: '`Network+ 統括`' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('🌐 YYYY-MM-DD'))).toBe(true);
  });

  test('reports missing max-3 active children rule', () => {
    const content = buildInstructions({ max3: '複数チャイルドを許可する' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('3 つまで'))).toBe(true);
  });

  test('reports missing 32 KiB kickoff size limit', () => {
    const content = buildInstructions({ sizes: '8 KiB 完了報告、64 KiB ハンドオフ' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('32 KiB'))).toBe(true);
  });

  test('reports missing 8 KiB completion size limit', () => {
    const content = buildInstructions({ sizes: '32 KiB キックオフ、64 KiB ハンドオフ' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('8 KiB'))).toBe(true);
  });

  test('reports missing 64 KiB handoff size limit', () => {
    const content = buildInstructions({ sizes: '32 KiB キックオフ、8 KiB 完了報告' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('64 KiB'))).toBe(true);
  });

  test('reports missing 70% rollover threshold', () => {
    const content = buildInstructions({ rollover: '100 ターンを超えた場合' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('70%'))).toBe(true);
  });

  test('reports missing Host-Tool Fallback section reference', () => {
    const content = buildInstructions({ fallback: 'BLOCKERS: 報告方法。' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('Host-Tool Fallback'))).toBe(true);
  });

  test('reports missing BLOCKERS fallback reporting requirement', () => {
    const content = buildInstructions({ fallback: '### 7.5 Host-Tool Fallback\n\nフォールバック手順。' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('BLOCKERS'))).toBe(true);
  });

  test('reports missing no-repository-manifest rule', () => {
    const content = buildInstructions({ noManifest: 'ロールオーバー時の状態を記録する' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('追跡ファイルのコミットは行わない'))).toBe(true);
  });

  test('reports missing no-sensitive-data rule', () => {
    const content = buildInstructions({ sensitive: 'データを含めない' });
    const errors = validateCopilotInstructions(content);
    expect(errors.some((e) => e.includes('PII'))).toBe(true);
  });

  test('REQUIRED_INSTRUCTIONS_CONCEPTS covers all checked concepts', () => {
    // Each concept must be detected when missing
    for (const [concept] of REQUIRED_INSTRUCTIONS_CONCEPTS) {
      const content = buildInstructions().split(concept).join('');
      const errors = validateCopilotInstructions(content);
      expect(errors.some((e) => e.includes(concept))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateAgentHostToolFallback
// ---------------------------------------------------------------------------

describe('validateAgentHostToolFallback', () => {
  test('accepts an agent file that contains Host-Tool Fallback', () => {
    const content = '# Agent\n\n## 🛡️ Host-Tool Fallback\n\nFallback procedure.';
    expect(validateAgentHostToolFallback(content)).toEqual([]);
  });

  test('reports an error when Host-Tool Fallback section is missing', () => {
    const content = '# Agent\n\n## 📋 References\n\nSome references.';
    const errors = validateAgentHostToolFallback(content);
    expect(errors.some((e) => e.includes('Host-Tool Fallback'))).toBe(true);
  });

  test('uses the exported AGENT_HOST_TOOL_FALLBACK_CONCEPT constant', () => {
    expect(typeof AGENT_HOST_TOOL_FALLBACK_CONCEPT).toBe('string');
    expect(AGENT_HOST_TOOL_FALLBACK_CONCEPT.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: validate the real repository files
// ---------------------------------------------------------------------------

describe('real repository files', () => {
  const root = path.join(__dirname, '..');

  test('coordinator-topology.md exists and passes all checks', () => {
    const absPath = path.join(root, TOPOLOGY_DOC);
    expect(fs.existsSync(absPath)).toBe(true);

    const content = fs.readFileSync(absPath, 'utf8');
    expect(validateTopologyDoc(content)).toEqual([]);
  });

  test('NetworkPlusAgent.agent.md exists and has no restrictive tools: list', () => {
    const absPath = path.join(root, AGENT_FILE);
    expect(fs.existsSync(absPath)).toBe(true);

    const content = fs.readFileSync(absPath, 'utf8');
    expect(validateAgentNoRestrictiveTools(content)).toEqual([]);
  });

  test('NetworkPlusAgent.agent.md retains its Host-Tool Fallback section', () => {
    const absPath = path.join(root, AGENT_FILE);
    expect(fs.existsSync(absPath)).toBe(true);

    const content = fs.readFileSync(absPath, 'utf8');
    expect(validateAgentHostToolFallback(content)).toEqual([]);
  });

  test('copilot-instructions.md exists and retains all coordinator contracts', () => {
    const absPath = path.join(root, COPILOT_INSTRUCTIONS_FILE);
    expect(fs.existsSync(absPath)).toBe(true);

    const content = fs.readFileSync(absPath, 'utf8');
    expect(validateCopilotInstructions(content)).toEqual([]);
  });
});
