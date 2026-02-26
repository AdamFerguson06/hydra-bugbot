/**
 * off-by-one.js — Python off-by-one bug template
 *
 * Strategy: Python's range() is the canonical loop boundary function. Adding 1
 * to the upper bound of range(n) causes an extra iteration that may read past
 * the end of a list (IndexError), process a sentinel value, or silently corrupt
 * output. Because the change is a single character (n → n+1), it survives most
 * code reviews.
 *
 * Targets:
 *   range(n)       → range(n + 1)
 *   range(0, n)    → range(0, n + 1)
 *   range(len(x))  → range(len(x) + 1)
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches any line containing range( — detailed capture happens per-case below.
// Skips comment lines automatically via findMatchingLines default behaviour.
const RANGE_PATTERN = /range\(/;

export default {
  name: 'off-by-one',
  category: 'logic',
  description:
    'Adds 1 to the upper bound of range() calls, causing an extra loop iteration (off-by-one)',

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, RANGE_PATTERN, filename);
    const points = [];

    for (const match of matches) {
      const line = match.line;

      // Case 1: range(0, expr) — two-arg form; we'll bump the second arg
      const twoArg = line.match(/range\(\s*0\s*,\s*(.+?)\s*\)/);
      if (twoArg) {
        points.push({
          ...match,
          form: 'two-arg',
          upperBound: twoArg[1].trim(),
        });
        continue;
      }

      // Case 2: range(expr) — single-arg form (most common)
      const oneArg = line.match(/range\(\s*(.+?)\s*\)/);
      if (oneArg) {
        points.push({
          ...match,
          form: 'one-arg',
          upperBound: oneArg[1].trim(),
        });
      }
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, form, upperBound } = injectionPoint;

    let newLine;
    if (form === 'two-arg') {
      // range(0, n) → range(0, n + 1)
      // Replace the first occurrence of the two-arg pattern on this line
      newLine = line.replace(
        /range\(\s*0\s*,\s*(.+?)\s*\)/,
        `range(0, ${upperBound} + 1)`
      );
    } else {
      // range(n) → range(n + 1)
      newLine = line.replace(
        /range\(\s*(.+?)\s*\)/,
        `range(${upperBound} + 1)`
      );
    }

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { form, upperBound } = injectionPoint;
    if (form === 'two-arg') {
      return `Changed range(0, ${upperBound}) to range(0, ${upperBound} + 1) — loop runs one extra iteration (off-by-one)`;
    }
    return `Changed range(${upperBound}) to range(${upperBound} + 1) — loop runs one extra iteration (off-by-one)`;
  },
};
