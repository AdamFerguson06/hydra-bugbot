/**
 * shadow-variable.js — Go variable shadowing via `:=` injection
 *
 * Strategy: In Go, using `:=` inside an inner block (an `if` body, `for` body,
 * or any `{...}` scope) declares a NEW local variable that shadows the outer
 * one.  If the surrounding code later reads the outer variable, it sees the
 * stale pre-assignment value.  This is a notoriously subtle bug: the code
 * compiles, the inner block behaves correctly, but mutations made inside the
 * block are invisible outside it.
 *
 * The template finds indented plain assignment lines (`variable = value`) and
 * changes them to short variable declarations (`variable := value`), introducing
 * a shadow.  The key guards are:
 *
 *   1. Require 2+ spaces or 1+ tabs of indentation — strongly suggests the line
 *      is inside a nested block rather than at package or function-top level.
 *   2. Reject lines that already use `:=` (would be a no-op or double-declare).
 *   3. Reject lines that use `==` anywhere (they are comparisons, not assignments).
 *   4. Reject lines that begin with a type keyword, struct literal field syntax
 *      (`FieldName:`) or function calls that happen to contain `=` in their args.
 *   5. Reject lines containing `+=`, `-=`, `*=`, `/=`, `|=`, `&=` (augmented
 *      assignment operators — converting those to `:=` would be a syntax error).
 *
 * Targets:
 *   		err = someFunc()         →     err := someFunc()
 *   		result = transform(x)   →     result := transform(x)
 *   		val = db.Query(...)      →     val := db.Query(...)
 *
 * Non-targets (skipped by guards):
 *   err := original()             (already :=)
 *   if x == y {                   (comparison ==)
 *   total += count                (augmented assign +=)
 *   items[i] = v                  (index expression LHS)
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches an indented simple assignment: indent(2+ spaces or 1+ tabs),
// a bare identifier on the LHS, a single `=` (not preceded or followed by
// another `=`, `:`, `+`, `-`, `*`, `/`, `|`, `&`, `!`), then any RHS.
//
// Negative lookbehind `(?<![:+\-*\/|&!=])` — the `=` must not be part of
// `:=`, `+=`, `-=`, `*=`, `/=`, `|=`, `&=`, `!=`, or `==`.
// Negative lookahead  `(?!=)` — the `=` must not be followed by `=`.
const SHADOW_PATTERN = /^(\t+| {2,})(\w+)\s*(?<![:+\-*\/|&!=])=(?!=)\s*\S/;

export default {
  name: 'shadow-variable',
  category: 'correctness',
  description:
    "Changes '=' to ':=' in indented assignments, creating a shadowed variable that hides the outer declaration",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, SHADOW_PATTERN, filename);
    const points = [];

    for (const candidate of candidates) {
      const { line } = candidate;

      // Guard 1: already uses :=
      if (/:=/.test(line)) continue;

      // Guard 2: contains == anywhere (comparison expression)
      if (/==/.test(line)) continue;

      // Guard 3: augmented assignment operators
      if (/[+\-*\/|&]={1}/.test(line)) continue;

      // Guard 4: LHS is an index expression like items[i] = v
      // Detected by a `[` appearing between the indent and the `=`.
      if (/^\s+\w+\s*\[/.test(line)) continue;

      // Guard 5: LHS is a selector expression like obj.Field = v
      if (/^\s+\w+\.\w+\s*=/.test(line)) continue;

      // Guard 6: skip lines that look like struct/map literals (trailing comma or
      // colon-based fields) — `Key: value,`
      if (/^\s+\w+\s*:/.test(line)) continue;

      points.push(candidate);
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;
    // Replace the first bare `=` (not part of any compound operator) with `:=`.
    // The negative lookbehind/lookahead in the regex ensures we only touch the
    // assignment operator, not `==`, `!=`, `>=`, `<=`, etc.
    const newLine = line.replace(
      /(?<![:+\-*\/|&!=])=(?!=)/,
      ':='
    );
    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    const identMatch = line.match(/^\s*(\w+)\s*=/);
    const ident = identMatch ? identMatch[1] : 'variable';
    return `Changed '=' to ':=' for '${ident}' at line ${loc.start.line} — creates a new inner-scope variable that shadows the outer declaration; outer value remains unchanged`;
  },
};
