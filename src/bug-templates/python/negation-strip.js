/**
 * negation-strip.js — Python `not` guard removal bug template
 *
 * Strategy: Python idiomatically uses `if not x:` to guard against falsy values —
 * empty lists, zero, None, empty strings, etc. Stripping the `not` keyword inverts
 * the branch: the "guarded" body now runs when `x` IS falsy and the else branch
 * (or lack thereof) handles the truthy case. For defensive checks like
 * `if not items: return` this means the early-return no longer fires on an empty
 * list and the function blunders forward processing zero elements. The bug is a
 * single word removed — it passes casual review easily.
 *
 * Targets:
 *   if not x:                → if x:
 *   elif not self.is_valid:  → elif self.is_valid:
 *   if not items:            → if items:
 *
 * The transform strips only the first `not` immediately following `if`/`elif` to
 * keep the injection surgical. Indentation is fully preserved.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches `if not` or `elif not` at the start of a line (after optional whitespace)
const NOT_GUARD_PATTERN = /^\s*(?:if|elif)\s+not\s+/;

export default {
  name: 'negation-strip',
  category: 'logic',
  description:
    "Removes 'not' from Python if/elif guards, inverting the condition so the guarded body runs on falsy values",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, NOT_GUARD_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Remove the first `not ` that appears immediately after if/elif + whitespace.
    // The replacement preserves leading whitespace and the if/elif keyword exactly.
    const newLine = line.replace(/^(\s*(?:if|elif)\s+)not\s+/, '$1');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    return `Removed 'not' from if/elif guard — condition is now inverted, guarded body runs when value is falsy`;
  },
};
