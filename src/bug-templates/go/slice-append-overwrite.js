/**
 * slice-append-overwrite.js — Go append return value discard bug template
 *
 * Strategy: Go's built-in `append` may allocate a new backing array when the
 * slice needs to grow.  The caller MUST reassign the return value:
 *
 *   items = append(items, x)   // correct
 *
 * If the reassignment is removed, the function silently discards whatever
 * `append` returned.  When the slice was already at capacity, the new element
 * was written into a freshly allocated buffer that is immediately garbage-
 * collected; the original `items` variable is unchanged.  The code compiles
 * without warnings and runs without panics, but elements silently disappear.
 *
 * This is particularly dangerous because:
 *   - Small slices often have excess capacity in tests, so the bug may only
 *     surface with larger real-world inputs.
 *   - The call site still *looks* like it is appending — `append(items, x)` is
 *     right there — making code review harder.
 *
 * Transform:
 *   items = append(items, x)   →  append(items, x)
 *   result = append(result, v) →  append(result, v)
 *
 * The regex anchors on the assignment target matching the first argument to
 * `append` (e.g. `items = append(items, ...)`) to avoid false-positives on
 * patterns like `a = append(b, ...)` where the variables differ (which might
 * be an intentional reassignment to a different slice).
 *
 * Guard: only match when the assigned variable is the same as the first
 * argument passed to append, i.e. `x = append(x, ...)`.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches: indent, variable name (group 2), `= append(`, same variable (back-
// reference \2 not available in JS RegExp literals with findMatchingLines, so
// we use group 3 for the append-target and validate equality in findInjectionPoints).
//
// Group 1 — leading whitespace
// Group 2 — LHS variable name
// Group 3 — first argument to append (the slice being extended)
const APPEND_ASSIGN_PATTERN = /^(\s*)(\w+)\s*=\s*append\(\s*(\w+)\s*,/;

export default {
  name: 'slice-append-overwrite',
  category: 'correctness',
  description:
    "Removes the 'variable = ' prefix from append calls, discarding the return value and silently dropping appended elements when the slice grows",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, APPEND_ASSIGN_PATTERN, filename);
    const points = [];

    for (const candidate of candidates) {
      const { match, line } = candidate;
      const lhsVar = match[2];         // variable being assigned to
      const appendTarget = match[3];   // first arg of append()

      // Only target self-appends: `x = append(x, ...)`.
      // Assignments like `b = append(a, ...)` are intentional slice reassignments
      // and are outside this template's scope.
      if (lhsVar !== appendTarget) continue;

      // Skip augmented forms that already lack the reassignment — shouldn't exist
      // given the pattern requires `=`, but guard defensively.
      if (/:=/.test(line)) continue;

      points.push({ ...candidate, lhsVar });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;
    // Strip `variable = ` from the front of the line, preserving indentation.
    // The replace targets: indent + word + optional whitespace + `=` + optional
    // whitespace, leaving just the `append(...)` call.
    const newLine = line.replace(
      /^(\s*)\w+\s*=\s*(append\()/,
      '$1$2'
    );
    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { lhsVar, loc } = injectionPoint;
    return `Removed '${lhsVar} = ' from append call at line ${loc.start.line} — return value discarded; appended elements silently lost when slice grows beyond capacity`;
  },
};
