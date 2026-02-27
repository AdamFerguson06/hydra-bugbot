/**
 * type-assertion-unchecked.js — Go unsafe type assertion bug template
 *
 * Strategy: Go provides two forms of interface type assertions:
 *
 *   Safe (comma-ok):    val, ok := x.(ConcreteType)
 *                       if !ok { // handle mismatch }
 *
 *   Unsafe (single):    val := x.(ConcreteType)
 *
 * The single-value form panics at runtime if the dynamic type of `x` does not
 * match `ConcreteType`.  The two-value form returns a zero value and `false`,
 * allowing the caller to handle mismatches gracefully.
 *
 * This template removes the `, ok` (or whatever the second variable is named)
 * from a comma-ok assertion, converting it to the panic-inducing single-value
 * form.  The `ok` check that follows the assertion may then reference an
 * undeclared variable (if `ok` was declared only here) or silently test a stale
 * value from an enclosing scope — both are harmful.
 *
 * Targets:
 *   val, ok := x.(SomeType)     →  val := x.(SomeType)
 *   result, ok = iface.(Error)  →  result = iface.(Error)
 *   v, err := raw.(io.Reader)   →  v := raw.(io.Reader)
 *
 * The regex captures:
 *   1 — leading whitespace
 *   2 — primary variable (val / result / v)
 *   3 — assignment operator (:= or =)
 *   4 — interface variable (x / iface / raw)
 *   5 — asserted type (SomeType / Error / io.Reader)
 *
 * The second variable (ok / err / etc.) is captured by the pattern but not
 * needed for the replacement — we simply omit `, <secondVar>` from the output.
 *
 * Guard: We require the second variable to be a plain identifier (word chars),
 * not a blank identifier `_`.  A `, _ := x.(T)` already discards the boolean
 * and is already unsafe — no mutation needed.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches the two-value comma-ok type assertion form.
// Specifically matches type assertion syntax `iface.(Type)` using a narrower
// regex that requires the `.(` before the type name.
//
// Group 1 — leading whitespace
// Group 2 — first (primary) variable name
// Group 3 — second variable name (ok / err / etc.) — must NOT be `_`
// Group 4 — assignment operator (:= or =)
// Group 5 — interface expression (word chars, dots, brackets allowed)
// Group 6 — asserted type (may include package qualifier: io.Reader)
const TYPE_ASSERT_PATTERN =
  /^(\s*)(\w+),\s*([a-zA-Z]\w*)\s*(:?=)\s*([\w.[\]]+)\.\(([^)]+)\)/;

export default {
  name: 'type-assertion-unchecked',
  category: 'correctness',
  description:
    "Removes the comma-ok variable from type assertions, converting safe two-value assertions to panic-on-failure single-value form",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, TYPE_ASSERT_PATTERN, filename);
    const points = [];

    for (const candidate of candidates) {
      const { match, line } = candidate;
      const secondVar = match[3]; // ok / err / exists / etc.

      // Skip if the second variable is the blank identifier — already discarded.
      if (secondVar === '_') continue;

      // Skip if the line contains a map lookup pattern `m[key]` which uses the
      // same comma-ok syntax: `val, ok := m[key]`.  Map lookups use `[` before
      // the comma, whereas type assertions use `.(`.
      // Detect type assertion specifically: must contain `.(`
      if (!line.includes('.(')) continue;

      points.push({ ...candidate, secondVar });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;
    // Remove `, secondVar` from between the first variable and the assignment
    // operator.  The replacement preserves the first variable, the operator,
    // and everything after it.
    const newLine = line.replace(
      /^(\s*\w+),\s*\w+(\s*:?=\s*[\w.[\]]+\.\([^)]+\))/,
      '$1$2'
    );
    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, secondVar, loc } = injectionPoint;
    const typeMatch = line.match(/\.\(([^)]+)\)/);
    const assertedType = typeMatch ? typeMatch[1] : 'interface type';
    return `Removed ', ${secondVar}' from type assertion to '${assertedType}' at line ${loc.start.line} — assertion now panics at runtime if the dynamic type does not match`;
  },
};
