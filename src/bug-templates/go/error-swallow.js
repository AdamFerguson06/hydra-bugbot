/**
 * error-swallow.js — Go error-swallow bug template
 *
 * Strategy: Go's multiple-return convention makes it trivially easy to silence
 * errors by using the blank identifier (_) instead of `err`.  When `err` is
 * replaced with `_`, the subsequent `if err != nil` check becomes unreachable
 * dead code and any actual error is silently discarded — the function continues
 * as if the call succeeded, producing corruption, panics, or silent data loss.
 *
 * This template only targets assignment lines where:
 *   1. The variable `err` is explicitly captured (not already `_`).
 *   2. A subsequent `if err != nil` check exists within 3 lines — confirming
 *      the developer intended to handle the error.
 *
 * Targets:
 *   result, err := someFunc()   →  result, _ := someFunc()
 *   n, err := io.Read(buf)      →  n, _ := io.Read(buf)
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines where a multi-return assignment captures `err` explicitly.
// Group 1: leading indentation
// Group 2: leading identifier (e.g. result, n, ok)
// Group 3: assignment operator :=
const ERR_ASSIGN_PATTERN = /^(\s*)(\w+),\s*err\s*(:=)\s*/;

// Look-ahead pattern — confirms there's a real error check following the assignment.
const ERR_CHECK_PATTERN = /if\s+err\s*!=\s*nil/;

export default {
  name: 'error-swallow',
  category: 'error-handling',
  description:
    "Replaces 'err' with '_' in Go multi-return assignments, silently discarding errors and defeating the subsequent nil check",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, ERR_ASSIGN_PATTERN, filename);
    const points = [];

    for (const candidate of candidates) {
      const { lineIndex } = candidate;

      // Look ahead up to 3 lines for an if err != nil check.
      const lookAheadEnd = Math.min(lineIndex + 4, parsed.lines.length);
      let hasErrCheck = false;
      for (let i = lineIndex + 1; i < lookAheadEnd; i++) {
        if (ERR_CHECK_PATTERN.test(parsed.lines[i])) {
          hasErrCheck = true;
          break;
        }
      }

      if (hasErrCheck) {
        points.push(candidate);
      }
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace `, err :=` with `, _ :=` — only the first occurrence on the line.
    // The regex is anchored to match the specific pattern captured by ERR_ASSIGN_PATTERN.
    const newLine = line.replace(
      /^(\s*\w+),\s*err\s*(:=)/,
      (_, indent_and_ident, op) => `${indent_and_ident}, _ ${op}`
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Pull out the left-hand side identifier for context.
    const lhsMatch = line.match(/^\s*(\w+),\s*err\s*:=/);
    const lhsIdent = lhsMatch ? lhsMatch[1] : 'result';
    return `Replaced 'err' with '_' in '${lhsIdent}, err :=' at line ${loc.start.line} — error is silently discarded, defeating the subsequent nil check`;
  },
};
