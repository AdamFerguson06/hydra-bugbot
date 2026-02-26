/**
 * indentation.js — Python indentation scope escape bug template
 *
 * Strategy: Python's most unique vulnerability — indentation IS the syntax.
 * Removing one level of indentation from the LAST line of a block silently moves
 * that statement outside the block. In an `if` block it runs unconditionally; in
 * a `for` loop it runs only once (after the loop); in a `def` it may fall outside
 * the function entirely. The diff shows a single leading-space change, which is
 * easy to miss during review and is completely invisible in editors that don't
 * show whitespace characters.
 *
 * Algorithm:
 *   1. Scan for block-opening lines ending with `:` under if/for/while/def/with/
 *      try/except/elif/else/finally.
 *   2. Collect consecutive following lines that are MORE indented than the opener.
 *   3. If the block has 2 or more lines, dedent the LAST line by one level
 *      (4 spaces or 1 tab, matching whatever the file uses).
 *
 * Why 2+ lines? A single-line block dedented would be an obvious empty block
 * (SyntaxError in many cases). Two lines ensure the block still looks populated
 * while the last statement silently escapes.
 */

import { replaceLine } from '../../utils/regex-parser.js';

// Block-opening keywords — lines ending with `:` under these starters are targets
const BLOCK_OPENER_PATTERN = /^\s*(?:if|elif|else|for|while|def|class|with|try|except|finally)\b.*:\s*$/;

/**
 * Detects the indentation unit used in the file.
 * Returns '\t' if tabs are prevalent, otherwise '    ' (4 spaces).
 *
 * @param {string[]} lines
 * @returns {string}
 */
function detectIndentUnit(lines) {
  for (const line of lines) {
    if (line.startsWith('\t')) return '\t';
  }
  return '    '; // default: 4 spaces
}

/**
 * Returns the leading whitespace of a line.
 * @param {string} line
 * @returns {string}
 */
function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
}

/**
 * Returns true if `childIndent` is strictly deeper than `parentIndent`.
 * Works for both space-based and tab-based indentation.
 *
 * @param {string} childIndent
 * @param {string} parentIndent
 * @returns {boolean}
 */
function isDeeper(childIndent, parentIndent) {
  return childIndent.length > parentIndent.length;
}

export default {
  name: 'indentation',
  category: 'indentation',
  description:
    'Dedents the last line of an indented block, silently moving it outside the block scope',

  findInjectionPoints(parsed, filename) {
    const { lines } = parsed;
    const points = [];
    const indentUnit = detectIndentUnit(lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip blank lines and comment lines
      if (!line.trim() || line.trim().startsWith('#')) continue;

      // Check for a block opener
      if (!BLOCK_OPENER_PATTERN.test(line)) continue;

      const openerIndent = getIndent(line);

      // Collect block body lines
      const blockLines = [];
      for (let j = i + 1; j < lines.length; j++) {
        const bodyLine = lines[j];

        // Blank lines inside the block are fine to skip
        if (!bodyLine.trim()) continue;

        const bodyIndent = getIndent(bodyLine);

        // Stop when we return to opener indentation level or shallower
        if (!isDeeper(bodyIndent, openerIndent)) break;

        blockLines.push({ lineIndex: j, line: bodyLine, indent: bodyIndent });
      }

      // Only target blocks with 2+ lines — single-line blocks risk SyntaxErrors
      if (blockLines.length < 2) continue;

      const lastBlockLine = blockLines[blockLines.length - 1];

      // Ensure the last line has enough indentation to dedent
      if (lastBlockLine.indent.length < indentUnit.length) continue;

      points.push({
        lineIndex: lastBlockLine.lineIndex,
        line: lastBlockLine.line,
        match: null,
        loc: { start: { line: lastBlockLine.lineIndex + 1 } },
        filename,
        indentUnit,
        openerLine: line,
        openerLineIndex: i,
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, indentUnit } = injectionPoint;

    // Strip exactly one indentation level from the front of the line
    let newLine;
    if (line.startsWith('\t')) {
      newLine = line.slice(1);
    } else {
      // Remove up to `indentUnit.length` leading spaces
      newLine = line.slice(indentUnit.length);
    }

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { openerLine, indentUnit } = injectionPoint;
    const opener = openerLine.trim().replace(/:$/, '');
    const unitLabel = indentUnit === '\t' ? 'tab' : `${indentUnit.length} spaces`;
    return `Dedented last line of '${opener}' block by ${unitLabel} — statement silently moved outside the block scope`;
  },
};
