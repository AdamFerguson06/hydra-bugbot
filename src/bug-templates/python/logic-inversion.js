/**
 * logic-inversion.js — Python logic gate inversion bug template
 *
 * Strategy: Python's `and`/`or` operators in `if`/`elif` conditions behave like
 * && and || in other languages. Swapping them inverts the logical gate — a guard
 * that requires ALL conditions becomes one requiring ANY (or vice versa). In
 * access-control, validation, and feature-flag conditions this creates security
 * or correctness holes that are invisible at a glance because the keyword change
 * is just three to four characters.
 *
 * Targets: `if` and `elif` lines containing ` and ` or ` or ` as logical connectors.
 *
 * Heuristic for avoiding string literals: only match `and`/`or` when they are NOT
 * inside a quoted region. We use a simple scan — if the keyword position is inside
 * an odd number of quote characters before it on the line, we skip the match.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches `if` or `elif` lines that contain `and` or `or` as word tokens.
const CONDITION_PATTERN = /^\s*(?:if|elif)\b.+\b(?:and|or)\b/;

/**
 * Returns true if the character at `index` in `str` is inside a string literal.
 * Handles single and double quote regions (no multi-line string awareness needed
 * since we only look at individual source lines).
 *
 * @param {string} str
 * @param {number} index
 * @returns {boolean}
 */
function isInsideQuotes(str, index) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < index; i++) {
    const ch = str[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
  }
  return inSingle || inDouble;
}

/**
 * Finds the first occurrence of `and` or `or` (as whole words) outside of
 * quote regions, starting after the if/elif keyword.
 *
 * @param {string} line
 * @returns {{ keyword: string, index: number }|null}
 */
function findLogicalKeyword(line) {
  const ifMatch = line.match(/^\s*(?:if|elif)\s+/);
  if (!ifMatch) return null;
  const searchFrom = ifMatch[0].length;

  const pattern = /\b(and|or)\b/g;
  pattern.lastIndex = searchFrom;
  let m;
  while ((m = pattern.exec(line)) !== null) {
    if (!isInsideQuotes(line, m.index)) {
      return { keyword: m[1], index: m.index };
    }
  }
  return null;
}

export default {
  name: 'logic-inversion',
  category: 'logic',
  description:
    "Swaps 'and' to 'or' (or vice versa) in compound if/elif conditions, inverting the logical gate",

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, CONDITION_PATTERN, filename);
    const points = [];

    for (const match of matches) {
      const found = findLogicalKeyword(match.line);
      if (!found) continue;

      points.push({
        ...match,
        keyword: found.keyword,
        keywordIndex: found.index,
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, keyword, keywordIndex } = injectionPoint;
    const flipped = keyword === 'and' ? 'or' : 'and';

    // Replace only the first matching keyword occurrence at the captured index
    const newLine =
      line.slice(0, keywordIndex) +
      flipped +
      line.slice(keywordIndex + keyword.length);

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { keyword } = injectionPoint;
    const flipped = keyword === 'and' ? 'or' : 'and';
    return `Swapped logical '${keyword}' to '${flipped}' in conditional — compound condition now evaluates opposite gate`;
  },
};
