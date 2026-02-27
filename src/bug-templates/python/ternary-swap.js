/**
 * ternary-swap.js — Python ternary expression branch swap bug template
 *
 * Strategy: Python's inline conditional expression `value_if_true if condition else
 * value_if_false` is functionally equivalent to a ternary operator. Swapping the
 * two value positions silently inverts the result without touching the condition:
 * code that previously returned `a` when `cond` was true now returns `b`, and vice
 * versa. This is particularly dangerous in assignments, return statements, and
 * default-value expressions where the wrong branch produces a plausible-looking
 * value that only fails under specific runtime conditions.
 *
 * Targets:
 *   result = x if cond else y       → result = y if cond else x
 *   return a if flag else b         → return b if flag else a
 *   val = foo() if pred else bar()  → val = bar() if pred else foo()
 *
 * Regex capture strategy:
 *   Group 1 ($1): value-if-true  — non-whitespace token(s) before `if`
 *   Group 2 ($2): condition      — lazy match between `if` and `else`
 *   Group 3 ($3): value-if-false — non-whitespace token(s) after `else`
 *
 * We deliberately use `\S+` for the value groups rather than a greedy `.+` to
 * target simple ternaries (identifiers, literals, short calls) and avoid
 * matching deeply nested or multi-ternary expressions unpredictably. Complex
 * expressions with spaces inside the value position (e.g. `foo(a, b)`) are
 * intentionally left unmatched to keep injections clean.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines that contain a Python ternary: <value> if <cond> else <value>
// Values are non-whitespace sequences; condition is a lazy inner match.
const TERNARY_PATTERN = /\S+\s+if\s+.+?\s+else\s+\S+/;

export default {
  name: 'ternary-swap',
  category: 'correctness',
  description:
    'Swaps the true/false branches of a Python ternary expression, inverting the returned value without changing the condition',

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, TERNARY_PATTERN, filename);
    const points = [];

    for (const match of matches) {
      const { line } = match;

      // Capture value-if-true ($1), condition ($2), value-if-false ($3)
      const capture = line.match(/(\S+)\s+if\s+(.+?)\s+else\s+(\S+)/);
      if (!capture) continue;

      points.push({
        ...match,
        trueValue: capture[1],
        condition: capture[2],
        falseValue: capture[3],
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, trueValue, condition, falseValue } = injectionPoint;

    // Swap $1 and $3, keeping the condition unchanged
    const newLine = line.replace(
      /(\S+)(\s+if\s+)(.+?)(\s+else\s+)(\S+)/,
      `${falseValue}$2$3$4${trueValue}`
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { trueValue, condition, falseValue } = injectionPoint;
    return `Swapped ternary branches: '${trueValue} if ${condition} else ${falseValue}' → '${falseValue} if ${condition} else ${trueValue}'`;
  },
};
