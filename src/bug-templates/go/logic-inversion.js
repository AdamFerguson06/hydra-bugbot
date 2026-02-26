/**
 * logic-inversion.js — Go logic-inversion bug template
 *
 * Strategy: Boolean operator inversion is one of the hardest bugs to spot in
 * code review — the code looks nearly identical but the condition evaluates to
 * the exact opposite set of inputs.  Swapping && to || (or vice versa) in an
 * `if` guard changes which branch executes, typically allowing execution to
 * fall through to code that should have been gated.
 *
 * Targets:
 *   if x > 0 && y > 0 { ... }   →  if x > 0 || y > 0 { ... }
 *   if err == nil || done { ... } →  if err == nil && done { ... }
 *
 * Only the first boolean operator on the line is swapped to keep the diff
 * minimal and preserve plausible deniability.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches if / } else if lines that contain at least one && or || operator.
const IF_BOOL_PATTERN = /^\s*(?:if|}\s*else\s+if)\s+.*(\&\&|\|\|)/;

export default {
  name: 'logic-inversion',
  category: 'logic',
  description:
    'Swaps && to || (or vice versa) in Go if conditions, inverting the combined boolean predicate',

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, IF_BOOL_PATTERN, filename);
    const points = [];

    for (const match of matches) {
      // Determine which operator appears first on the line.
      const line = match.line;
      const andIdx = line.indexOf('&&');
      const orIdx = line.indexOf('||');

      let operator;
      if (andIdx === -1) {
        operator = '||';
      } else if (orIdx === -1) {
        operator = '&&';
      } else {
        // Whichever comes first
        operator = andIdx < orIdx ? '&&' : '||';
      }

      points.push({
        ...match,
        operator,
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, operator } = injectionPoint;

    // Swap only the first occurrence of the captured operator.
    const replacement = operator === '&&' ? '||' : '&&';
    const newLine = line.replace(operator, replacement);

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { operator, loc } = injectionPoint;
    const replacement = operator === '&&' ? '||' : '&&';
    return `Swapped '${operator}' to '${replacement}' in if-condition at line ${loc.start.line} — logic predicate now evaluates the inverted operator`;
  },
};
