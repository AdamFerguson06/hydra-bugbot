/**
 * regex-parser.js — Hydra Bugbot shared utility for regex-based language templates
 *
 * Counterpart to src/utils/ast.js for languages that don't use Babel ASTs (Python, Go).
 * Operates on raw source lines rather than a parsed syntax tree, using regex patterns
 * to locate and manipulate code constructs.
 *
 * Exported API:
 *   parseLines(source)                              — split source into a line-indexed structure
 *   generateFromLines(parsed)                       — rejoin lines back to a source string
 *   findMatchingLines(parsed, pattern, filename, options) — locate lines matching a regex
 *   replaceLine(parsed, lineIndex, newLine)         — immutable line replacement
 *   removeLine(parsed, lineIndex)                   — immutable line removal
 *   getIndent(line)                                 — extract leading whitespace from a line
 *   extractImportsByRegex(source, importPatterns)   — collect module/package names from imports
 */

// ---------------------------------------------------------------------------
// Comment detection helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `line` appears to be a comment line.
 * Recognises Python-style (#) and Go/C-style (//) comments,
 * ignoring leading whitespace.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isCommentLine(line) {
  return /^\s*(#|\/\/)/.test(line);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses source code into a line-indexed structure for regex-based templates.
 * Splits the source on newline characters and retains the original string for
 * reference.
 *
 * @param {string} source - Raw source code string.
 * @returns {{ lines: string[], source: string }}
 */
export function parseLines(source) {
  if (typeof source !== 'string') {
    throw new Error('regex-parser.parseLines: source must be a string');
  }
  return {
    lines: source.split('\n'),
    source,
  };
}

/**
 * Regenerates source code from a (potentially modified) lines array.
 * Joins lines with newline characters, matching the convention used by parseLines.
 *
 * @param {{ lines: string[] }} parsed - The parsed structure with potentially modified lines.
 * @returns {string}
 */
export function generateFromLines(parsed) {
  if (!parsed || !Array.isArray(parsed.lines)) {
    throw new Error('regex-parser.generateFromLines: parsed must have a lines array');
  }
  return parsed.lines.join('\n');
}

/**
 * Finds all lines matching a regex pattern and returns injection point objects
 * suitable for use by bug-template adapters.
 *
 * By default, skips comment lines (lines starting with # for Python, // for Go).
 * Pass `{ skipComments: false }` to disable this behaviour.
 *
 * @param {{ lines: string[], source: string }} parsed - Structure from parseLines().
 * @param {RegExp} pattern - Regex to test each line against.
 * @param {string} filename - File path, used for reporting in returned objects.
 * @param {{ skipComments?: boolean }} [options={}]
 * @returns {Array<{
 *   lineIndex: number,
 *   line: string,
 *   match: RegExpMatchArray,
 *   loc: { start: { line: number } },
 *   filename: string
 * }>}
 */
export function findMatchingLines(parsed, pattern, filename, options = {}) {
  if (!parsed || !Array.isArray(parsed.lines)) {
    throw new Error('regex-parser.findMatchingLines: parsed must have a lines array');
  }
  if (!(pattern instanceof RegExp)) {
    throw new Error('regex-parser.findMatchingLines: pattern must be a RegExp');
  }

  const { skipComments = true } = options;
  const results = [];

  for (let i = 0; i < parsed.lines.length; i++) {
    const line = parsed.lines[i];

    if (skipComments && isCommentLine(line)) {
      continue;
    }

    const match = line.match(pattern);
    if (match) {
      results.push({
        lineIndex: i,
        line,
        match,
        // loc uses 1-based line numbers to mirror the AST convention used by Babel
        loc: { start: { line: i + 1 } },
        filename,
      });
    }
  }

  return results;
}

/**
 * Replaces a specific line in the parsed structure and returns a new object.
 * Does not mutate the original parsed structure (immutable update pattern).
 * The `source` field on the returned object reflects the new line content.
 *
 * @param {{ lines: string[] }} parsed - Structure from parseLines().
 * @param {number} lineIndex - 0-based index of the line to replace.
 * @param {string} newLine - Replacement line content.
 * @returns {{ lines: string[], source: string }}
 */
export function replaceLine(parsed, lineIndex, newLine) {
  if (!parsed || !Array.isArray(parsed.lines)) {
    throw new Error('regex-parser.replaceLine: parsed must have a lines array');
  }
  if (lineIndex < 0 || lineIndex >= parsed.lines.length) {
    throw new Error(
      `regex-parser.replaceLine: lineIndex ${lineIndex} is out of range (0–${parsed.lines.length - 1})`
    );
  }

  const newLines = [...parsed.lines];
  newLines[lineIndex] = newLine;
  const newSource = newLines.join('\n');

  return { lines: newLines, source: newSource };
}

/**
 * Removes a specific line from the parsed structure and returns a new object.
 * Does not mutate the original parsed structure (immutable update pattern).
 * The `source` field on the returned object reflects the removal.
 *
 * @param {{ lines: string[] }} parsed - Structure from parseLines().
 * @param {number} lineIndex - 0-based index of the line to remove.
 * @returns {{ lines: string[], source: string }}
 */
export function removeLine(parsed, lineIndex) {
  if (!parsed || !Array.isArray(parsed.lines)) {
    throw new Error('regex-parser.removeLine: parsed must have a lines array');
  }
  if (lineIndex < 0 || lineIndex >= parsed.lines.length) {
    throw new Error(
      `regex-parser.removeLine: lineIndex ${lineIndex} is out of range (0–${parsed.lines.length - 1})`
    );
  }

  const newLines = [...parsed.lines];
  newLines.splice(lineIndex, 1);
  const newSource = newLines.join('\n');

  return { lines: newLines, source: newSource };
}

/**
 * Extracts import or module names from source code using an array of language-specific
 * regex patterns. Each pattern is applied to every line; the first capture group of
 * any match is collected as the module name.
 *
 * Intended for use with patterns like:
 *   Python: /^import\s+(\S+)/, /^from\s+(\S+)\s+import/
 *   Go:     /^\s*"([^"]+)"/  (used inside import blocks)
 *
 * @param {string} source - Raw source code string.
 * @param {RegExp[]} importPatterns - Array of regexes, each with a capture group for the module name.
 * @returns {string[]} Deduplicated list of module/package names found.
 */
export function extractImportsByRegex(source, importPatterns) {
  if (typeof source !== 'string') {
    throw new Error('regex-parser.extractImportsByRegex: source must be a string');
  }
  if (!Array.isArray(importPatterns)) {
    throw new Error('regex-parser.extractImportsByRegex: importPatterns must be an array');
  }

  const found = new Set();
  const lines = source.split('\n');

  for (const line of lines) {
    for (const pattern of importPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        found.add(match[1]);
      }
    }
  }

  return Array.from(found);
}

/**
 * Returns the leading whitespace (indentation) of a line.
 *
 * @param {string} line - A single source line.
 * @returns {string} The whitespace prefix (spaces, tabs, or empty string).
 */
export function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
}
