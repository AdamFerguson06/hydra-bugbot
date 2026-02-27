/**
 * dict-merge-order.js — Python dictionary unpacking order bug template
 *
 * Strategy: In Python 3.5+, the `{**a, **b}` syntax merges two dictionaries into
 * a new one. When the same key exists in both, the LAST one wins. This precedence
 * rule is intentional and load-bearing in patterns like:
 *
 *   config = {**defaults, **user_overrides}
 *
 * Here `user_overrides` is spread last, so its values overwrite the defaults — the
 * expected behaviour for an override/settings merge pattern.
 *
 * This template swaps the two dict names so the spread order is reversed:
 *
 *   {**defaults, **user_overrides}  →  {**user_overrides, **defaults}
 *
 * After the swap, `defaults` is spread last and stomps any key that also appeared
 * in `user_overrides`. The bug is invisible in tests that don't include overlapping
 * keys across the two dicts, but surfaces as "user preferences are silently
 * ignored" or "config always resets to defaults" in production.
 *
 * Pattern groups:
 *   $1 — first dict variable name  (moved to second position)
 *   $2 — second dict variable name (moved to first position)
 *
 * Limitations: Matches only the two-dict form `{**a, **b}`. Three-or-more dict
 * unpacking (e.g., `{**a, **b, **c}`) is left alone — swapping the first two
 * there could interact ambiguously with the third and would complicate the regex
 * beyond a single-replacement injection.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches: { **identifier1 , **identifier2 }
// The pattern is deliberately loose about surrounding content so it matches
// whether this is an assignment, a function call argument, or a return value.
// Capture groups:
//   1 — first dict name
//   2 — second dict name
const DICT_UNPACK_PATTERN = /\{\s*\*\*(\w+)\s*,\s*\*\*(\w+)\s*\}/;

export default {
  name: 'dict-merge-order',
  category: 'correctness',
  description:
    "Swaps dict unpacking order in '{**a, **b}' to '{**b, **a}' — later keys win, so overrides are now stomped by defaults",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, DICT_UNPACK_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Swap the two names: {**first, **second} → {**second, **first}
    // We reconstruct via replace, swapping capture groups 1 and 2.
    const newLine = line.replace(
      DICT_UNPACK_PATTERN,
      '{**$2, **$1}'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(DICT_UNPACK_PATTERN);
    const first = m ? m[1] : 'a';
    const second = m ? m[2] : 'b';
    return `Swapped dict merge order from '{**${first}, **${second}}' to '{**${second}, **${first}}' — ${first} now takes precedence, overriding values from ${second}`;
  },
};
