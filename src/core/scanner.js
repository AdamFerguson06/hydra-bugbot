import fs from 'node:fs';
import path from 'node:path';
import { getLLMClient, chatCompletion } from '../utils/llm.js';

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

/**
 * Recursively collects all file paths under a directory, filtering to supported extensions.
 * @param {string} dir - Absolute path to the directory to walk.
 * @returns {string[]} Sorted list of matching absolute file paths.
 */
function walkDirectory(dir) {
  const results = [];

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip common non-source directories to avoid scanning node_modules, etc.
      if (
        entry.isDirectory() &&
        (entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.next' ||
          entry.name === 'coverage')
      ) {
        continue;
      }

      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results.sort();
}

/**
 * Builds the prompt sent to Claude for bug scanning.
 * @param {string} filePath - Relative or absolute path of the file (used in context).
 * @param {string} content - Full source code content of the file.
 * @param {{ severity?: string, language?: string }} options
 * @returns {string}
 */
function buildScanPrompt(filePath, content, options) {
  const severityFilter = options.severity
    ? `Only report bugs of severity "${options.severity}" or higher (low < medium < high < critical).`
    : 'Report bugs of any severity.';

  return `You are a senior software engineer performing a thorough code review for real bugs.

Analyze the following file and identify genuine bugs — NOT style issues, missing docs, or subjective improvements.

Focus specifically on:
- Logic errors and wrong conditions (inverted booleans, incorrect comparisons)
- Off-by-one errors
- Memory leaks and resource leaks (uncleaned timers, event listeners, unclosed handles)
- Race conditions and missing awaits on async operations
- Null/undefined dereferences and missing guard clauses
- Security issues (injection, path traversal, unvalidated input)
- Incorrect error handling (swallowed errors, wrong catch scope)

${severityFilter}

File: ${filePath}

\`\`\`
${content}
\`\`\`

Respond ONLY with a valid JSON array. Each element must have exactly these fields:
{
  "file": "${filePath}",
  "line": <integer line number where the bug is located>,
  "description": "<one concise sentence describing the bug and its impact>",
  "severity": "<one of: low | medium | high | critical>",
  "suggestedFix": "<one concise sentence describing what should be changed>"
}

If you find no bugs, respond with an empty array: []

Do not include any text outside the JSON array.`;
}

/**
 * Sends file content to the LLM and parses the returned bug list.
 * @param {string} filePath - Path of the file being scanned.
 * @param {string} content - Source code content.
 * @param {object} llm - LLM client from getLLMClient().
 * @param {{ severity?: string, language?: string }} options
 * @returns {Promise<object[]>} Array of bug objects.
 */
async function scanSingleFile(filePath, content, llm, options) {
  const prompt = buildScanPrompt(filePath, content, options);

  let raw;
  try {
    raw = await chatCompletion(llm, prompt, 4096);
  } catch (err) {
    if (err.status === 429) {
      throw new Error(`Rate limit hit while scanning ${filePath}. Wait a moment and retry.`);
    }
    throw new Error(`API error while scanning ${filePath}: ${err.message}`);
  }

  // Strip markdown code fences if Claude wrapped the JSON
  const jsonText = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let bugs;
  try {
    bugs = JSON.parse(jsonText);
  } catch {
    // If parsing fails, return empty rather than crashing the whole scan
    return [];
  }

  if (!Array.isArray(bugs)) {
    return [];
  }

  // Normalise: ensure each bug has the expected shape
  return bugs
    .filter((b) => b && typeof b === 'object')
    .map((b) => ({
      file: String(b.file ?? filePath),
      line: Number(b.line) || 0,
      description: String(b.description ?? ''),
      severity: String(b.severity ?? 'medium'),
      suggestedFix: String(b.suggestedFix ?? ''),
    }));
}

/**
 * Scans an array of source files for real bugs using the Claude API.
 *
 * @param {string[]} files - Array of absolute file paths to scan.
 * @param {{ severity?: string, language?: string }} [options={}]
 *   - severity: minimum severity to report ('low' | 'medium' | 'high' | 'critical')
 *   - language: hint for the language being scanned (informational, not used to filter files)
 * @returns {Promise<Array<{
 *   file: string,
 *   line: number,
 *   description: string,
 *   severity: string,
 *   suggestedFix: string
 * }>>} Flat array of all bugs found across all files.
 */
export async function scanFiles(files, options = {}) {
  const llm = getLLMClient();
  const allBugs = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      // Skip unreadable files silently; caller can log if needed
      continue;
    }

    if (!content.trim()) {
      continue;
    }

    const bugs = await scanSingleFile(filePath, content, llm, options);
    allBugs.push(...bugs);
  }

  return allBugs;
}

/**
 * Recursively scans all JS/TS files in a directory for real bugs.
 *
 * Skips node_modules, .git, dist, build, .next, and coverage directories.
 *
 * @param {string} scope - Absolute (or relative) path to the directory to scan.
 * @param {{ severity?: string, language?: string }} [options={}]
 *   - severity: minimum severity to report ('low' | 'medium' | 'high' | 'critical')
 *   - language: hint for the language being scanned
 * @returns {Promise<Array<{
 *   file: string,
 *   line: number,
 *   description: string,
 *   severity: string,
 *   suggestedFix: string
 * }>>} Flat array of all bugs found across all discovered files.
 */
export async function scanDirectory(scope, options = {}) {
  const resolved = path.resolve(scope);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }

  const files = walkDirectory(resolved);
  return scanFiles(files, options);
}
