/**
 * off-by-one.js — Go off-by-one bug template
 *
 * Strategy: Go's canonical C-style for loop uses a strict less-than (<) or
 * greater-than (>) boundary operator. Changing < to <= (or > to >=) causes one
 * extra iteration, which may read past the end of a slice (panic: index out of
 * range), process a sentinel value, or silently produce incorrect output.
 * Because the change is a single character, it survives superficial code
 * review while reliably breaking slice-indexed loops.
 *
 * Targets:
 *   for i := 0; i < n; i++   →  for i := 0; i <= n; i++
 *   for i := n; i > 0; i--   →  for i := n; i >= 0; i--
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Captures the comparison operator (< or >) in a standard Go for-loop condition.
// Requires: init with :=, a numeric or identifier bound, and a loop variable.
const FOR_LOOP_PATTERN = /for\s+\w+\s*:=\s*\d+;\s*\w+\s*([<>])\s*/;

export default {
  name: 'off-by-one',
  category: 'logic',
  description:
    'Changes < to <= (or > to >=) in Go for-loop conditions, causing one extra iteration (off-by-one)',

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, FOR_LOOP_PATTERN, filename);
    const points = [];

    for (const match of matches) {
      const op = match.match[1]; // captured operator: '<' or '>'
      // Skip if already >= or <= (the operator appears right before the bound with no =)
      // Verify there's no = immediately following the operator in the raw line
      const opIndex = match.line.indexOf(op, match.line.search(/for\s/));
      const charAfter = match.line[opIndex + 1];
      if (charAfter === '=') continue; // already >=/<= — skip

      points.push({
        ...match,
        operator: op,
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, operator } = injectionPoint;

    // Replace only the first occurrence of the bare operator (not already <=/>= )
    // to avoid corrupting unrelated parts of the line (e.g. map literals).
    const newLine = line.replace(
      new RegExp(`${operator}(?!=)`),
      `${operator}=`
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { operator, loc } = injectionPoint;
    const replacement = `${operator}=`;
    return `Changed '${operator}' to '${replacement}' in for-loop condition at line ${loc.start.line} — loop executes one extra iteration (off-by-one)`;
  },
};
