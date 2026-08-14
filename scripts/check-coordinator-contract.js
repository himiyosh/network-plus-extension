/**
 * check-coordinator-contract.js
 *
 * Static validator that detects loss of the required coordinator-topology
 * rules and guards against reintroduction of a restrictive explicit tools
 * list in the primary agent frontmatter.
 *
 * Per https://docs.github.com/en/copilot/reference/custom-agents-configuration#tools:
 * omitting `tools:` causes the host to supply all available tools; an explicit
 * list silently excludes anything not named.
 *
 * Run via: npm run contract:check
 *
 * Checks:
 *  1. docs/coordinator-topology.md exists and contains all required sections
 *     and key concepts.
 *  2. The primary agent frontmatter does NOT contain a `tools:` field.
 *  3. .github/copilot-instructions.md retains all required coordinator
 *     contracts (dated title, size limits, rollover threshold, fallback,
 *     no-repository-manifest, no-sensitive-data).
 *  4. NetworkPlusAgent.agent.md retains its Host-Tool Fallback rules.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOPOLOGY_DOC = path.join('docs', 'coordinator-topology.md');
const AGENT_FILE = path.join('.github', 'agents', 'NetworkPlusAgent.agent.md');
const COPILOT_INSTRUCTIONS_FILE = path.join('.github', 'copilot-instructions.md');

/**
 * Required section headings that must appear in the coordinator topology doc.
 */
const REQUIRED_TOPOLOGY_SECTIONS = [
  '## コーディネーターセッション',
  '## チャイルドセッション',
  '## セッションサイズ制限',
  '## ロールオーバー条件',
  '## クリーンアップゲート',
  '## Pull Request レビュー',
  '## Host-Tool Fallback',
  '## データ安全性',
];

/**
 * Required concepts that the topology doc must address (case-insensitive
 * substring match).  These guard the specific enforceable constraints.
 */
const REQUIRED_TOPOLOGY_CONCEPTS = [
  '最大 3', // max-3 active children cap
  '32 KiB', // kickoff size limit
  '8 KiB', // completion report size limit
  '64 KiB', // handoff size limit
  '70%', // rollover context threshold
  'BLOCKERS', // fallback reporting requirement
  'データ安全性', // data-safety section exists
  '通常の GitHub Pull Request review', // ordinary optional review remains available
  'review comment marker や reviewer session UUID は要求しない', // no custom review gate
];

/**
 * Required concepts that .github/copilot-instructions.md must retain to keep
 * the coordinator contract enforceable at the loaded-instruction surface.
 * Each entry is [substring, description].
 */
const REQUIRED_INSTRUCTIONS_CONCEPTS = [
  ['🌐 YYYY-MM-DD', 'dated coordinator session title format'],
  ['3 つまで', 'max-3 active children cap'],
  ['32 KiB', 'kickoff size limit'],
  ['8 KiB', 'completion report size limit'],
  ['64 KiB', 'handoff size limit'],
  ['70%', 'rollover context threshold'],
  ['Host-Tool Fallback', 'host-tool fallback section'],
  ['BLOCKERS', 'BLOCKERS fallback reporting requirement'],
  ['追跡ファイルのコミットは行わない', 'no-repository-manifest rule'],
  ['PII', 'no-sensitive-data rule'],
  ['通常の GitHub Pull Request review', 'ordinary optional pull-request review'],
  ['review comment marker や reviewer session UUID は要求しない', 'no custom review gate'],
];

/**
 * Text that must appear in the NetworkPlusAgent agent file to confirm the
 * Host-Tool Fallback section has not been removed.
 */
const AGENT_HOST_TOOL_FALLBACK_CONCEPT = 'Host-Tool Fallback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a file relative to the repository root (process.cwd()).
 * @param {string} relPath
 * @returns {string}
 */
const readRepoFile = (relPath) => {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, 'utf8');
};

/**
 * Extract the raw YAML frontmatter string from a Markdown file.
 * Returns null when no frontmatter block is present.
 * @param {string} content
 * @returns {string|null}
 */
const extractFrontmatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
};

/**
 * Detect whether the frontmatter contains a `tools:` field.
 * A `tools:` field creates a restrictive explicit list that may silently
 * exclude host-supplied tools.  Returns true when the field is present.
 * @param {string} frontmatter
 * @returns {boolean}
 */
const hasToolsField = (frontmatter) => /^tools:/m.test(frontmatter);

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate the coordinator topology document.
 * @param {string} content  Full file contents.
 * @returns {string[]}      List of error messages (empty = OK).
 */
const validateTopologyDoc = (content) => {
  const errors = [];

  for (const section of REQUIRED_TOPOLOGY_SECTIONS) {
    if (!content.includes(section)) {
      errors.push(`coordinator-topology.md is missing required section: "${section}"`);
    }
  }

  for (const concept of REQUIRED_TOPOLOGY_CONCEPTS) {
    if (!content.toLowerCase().includes(concept.toLowerCase())) {
      errors.push(`coordinator-topology.md must address concept: "${concept}"`);
    }
  }

  return errors;
};

/**
 * Validate the agent file does not contain a restrictive explicit tools list.
 * @param {string} content  Full file contents.
 * @returns {string[]}      List of error messages (empty = OK).
 */
const validateAgentNoRestrictiveTools = (content) => {
  const errors = [];

  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    errors.push(`${AGENT_FILE} is missing YAML frontmatter`);
    return errors;
  }

  if (hasToolsField(frontmatter)) {
    errors.push(
      `${AGENT_FILE} must not declare an explicit tools: list — omit the field so the host supplies all available tools (ref: https://docs.github.com/en/copilot/reference/custom-agents-configuration#tools)`,
    );
  }

  return errors;
};

/**
 * Validate that .github/copilot-instructions.md retains all required
 * coordinator contract concepts so that the rules remain enforceable at the
 * loaded-instruction surface.
 * @param {string} content  Full file contents.
 * @returns {string[]}      List of error messages (empty = OK).
 */
const validateCopilotInstructions = (content) => {
  const errors = [];

  for (const [concept, description] of REQUIRED_INSTRUCTIONS_CONCEPTS) {
    if (!content.includes(concept)) {
      errors.push(`copilot-instructions.md is missing required coordinator contract: "${concept}" (${description})`);
    }
  }

  return errors;
};

/**
 * Validate that the NetworkPlusAgent agent file retains its Host-Tool Fallback
 * section so agents always have the fallback procedure available.
 * @param {string} content  Full file contents.
 * @returns {string[]}      List of error messages (empty = OK).
 */
const validateAgentHostToolFallback = (content) => {
  const errors = [];

  if (!content.includes(AGENT_HOST_TOOL_FALLBACK_CONCEPT)) {
    errors.push(`${AGENT_FILE} is missing the Host-Tool Fallback section — do not remove the fallback procedure`);
  }

  return errors;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = () => {
  const errors = [];

  // 1. Topology document
  let topologyContent;
  try {
    topologyContent = readRepoFile(TOPOLOGY_DOC);
  } catch {
    errors.push(`Required file not found: ${TOPOLOGY_DOC}`);
    topologyContent = null;
  }

  if (topologyContent !== null) {
    errors.push(...validateTopologyDoc(topologyContent));
  }

  // 2. Agent tool declarations and Host-Tool Fallback reference
  let agentContent;
  try {
    agentContent = readRepoFile(AGENT_FILE);
  } catch {
    errors.push(`Required file not found: ${AGENT_FILE}`);
    agentContent = null;
  }

  if (agentContent !== null) {
    errors.push(...validateAgentNoRestrictiveTools(agentContent));
    errors.push(...validateAgentHostToolFallback(agentContent));
  }

  // 3. Copilot instructions surface
  let instructionsContent;
  try {
    instructionsContent = readRepoFile(COPILOT_INSTRUCTIONS_FILE);
  } catch {
    errors.push(`Required file not found: ${COPILOT_INSTRUCTIONS_FILE}`);
    instructionsContent = null;
  }

  if (instructionsContent !== null) {
    errors.push(...validateCopilotInstructions(instructionsContent));
  }

  // Report
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('OK: coordinator contract is valid');
};

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_TOPOLOGY_SECTIONS,
  REQUIRED_TOPOLOGY_CONCEPTS,
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
};
