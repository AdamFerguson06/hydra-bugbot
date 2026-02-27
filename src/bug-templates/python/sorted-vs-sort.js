/**
 * sorted-vs-sort.js — Python sorted() vs .sort() correctness bug template
 *
 * Strategy: Python has two ways to sort a list. `sorted(iterable)` is a built-in
 * that returns a NEW sorted list, leaving the original unchanged. `list.sort()` is
 * an in-place method that mutates the list and returns None. These are not
 * interchangeable on the left-hand side of an assignment.
 *
 * This template targets assignment statements of the form:
 *
 *   result = sorted(data)
 *
 * and transforms them to:
 *
 *   result = data.sort()
 *
 * After this mutation, `result` will be None because .sort() has no return value.
 * Any subsequent use of `result` (e.g., result[0], for x in result, len(result))
 * will raise a TypeError or AttributeError at runtime. The bug is subtle in review
 * because both forms look like "sorting a list into a variable".
 *
 * Pattern groups:
 *   $1 — leading whitespace (indent level preserved)
 *   $2 — left-hand side variable name receiving the sorted result
 *   $3 — iterable passed to sorted() (becomes the object calling .sort())
 *
 * Limitations: Only matches the simple `var = sorted(other_var)` form. Calls with
 * keyword arguments such as sorted(data, key=..., reverse=True) are left alone to
 * avoid breaking the regex substitution — those forms are harder to mechanically
 * convert and would make the injection too obvious.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches: <indent><var> = sorted(<identifier>...)
// Capture groups:
//   1 — leading whitespace
//   2 — assignment target variable name
//   3 — first identifier inside sorted() (the iterable name)
// We anchor to a word boundary after the iterable so we don't match
// sorted(some_func(x)) or sorted(x, key=...) with this simple substitution.
const SORTED_ASSIGN_PATTERN = /^(\s*)(\w+)\s*=\s*sorted\((\w+)\s*\)/;

export default {
  name: 'sorted-vs-sort',
  category: 'correctness',
  description:
    "Replaces 'result = sorted(x)' with 'result = x.sort()' — .sort() returns None, so result is always None",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, SORTED_ASSIGN_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Transform: indent + lhs + ' = ' + 'sorted(rhs)' → indent + lhs + ' = ' + 'rhs.sort()'
    const newLine = line.replace(
      SORTED_ASSIGN_PATTERN,
      '$1$2 = $3.sort()'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(SORTED_ASSIGN_PATTERN);
    const lhs = m ? m[2] : 'result';
    const rhs = m ? m[3] : 'x';
    return `Changed '${lhs} = sorted(${rhs})' to '${lhs} = ${rhs}.sort()' — .sort() is in-place and returns None, so ${lhs} is now None`;
  },
};
