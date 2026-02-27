/**
 * wrong-constant.js — Python off-by-one constant substitution bug template
 *
 * Strategy: A common defensive pattern in Python is `> 0` to check that a count,
 * length, or index is positive — e.g. `if len(items) > 0:` before iterating, or
 * `while count > 0:` in a drain loop. Replacing `0` with `1` shifts the boundary
 * by one: the check now passes only when the value is at least 2, so a list with
 * exactly one element, a count of exactly 1, or a non-empty-but-single-element
 * structure will silently fall through the guard as if it were empty.
 *
 * This is distinct from a range() off-by-one (covered by off-by-one.js) — here we
 * target direct comparisons against the literal zero in any context: if statements,
 * while loops, assert statements, or standalone expressions.
 *
 * Targets:
 *   if len(items) > 0:   → if len(items) > 1:
 *   while count > 0:     → while count > 1:
 *   assert x > 0        → assert x > 1
 *   if self.size > 0:    → if self.size > 1:
 *
 * Regex safety: The lookahead `(?!\.\d)(?!\d)` ensures we do NOT match:
 *   > 0.5   (floating point literal — different semantic entirely)
 *   > 01    (octal-style or multi-digit number starting with 0)
 * Comment lines are already skipped by findMatchingLines.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches > 0 but not > 0.N (floats) or > 0N (multi-digit numbers starting with 0)
const GT_ZERO_PATTERN = />\s*0(?!\.\d)(?!\d)/;

export default {
  name: 'wrong-constant',
  category: 'correctness',
  description:
    "Changes '> 0' to '> 1' in comparisons, causing length/count checks to miss single-element collections",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, GT_ZERO_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace the first occurrence of > 0 (not followed by digit or decimal point)
    const newLine = line.replace(/>\s*0(?!\.\d)(?!\d)/, '> 1');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    return `Changed '> 0' to '> 1' — boundary shifted by one, single-element collections now fail the guard`;
  },
};
