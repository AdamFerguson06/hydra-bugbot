/**
 * negation-strip.js — Go boolean negation removal bug template
 *
 * Strategy: Go `if` statements frequently guard on negated booleans, such as
 * `if !ok {` or `} else if !found {`. These are among the easiest mutations to
 * overlook because the statement still compiles and looks structurally correct —
 * only the logic is inverted.
 *
 * This template strips the leading `!` from the boolean expression, flipping the
 * branch condition. Code that previously ran only when the check FAILED will now
 * run when it SUCCEEDS, and vice-versa.
 *
 * Targets:
 *   if !ok {                  →  if ok {
 *   if !found {               →  if found {
 *   } else if !valid {        →  } else if valid {
 *   if !authenticated {       →  if authenticated {
 *
 * The regex anchors to the start of a line (accounting for indentation) and
 * requires the structure:  (if | } else if) + whitespace + ! + identifier + {
 * This avoids matching negations inside complex expressions like
 * `if !strings.HasPrefix(...)` — those have a dot or paren after the identifier
 * and are outside this template's scope.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches: optional indent, then `if` or `} else if`, whitespace, `!`, then a
// bare identifier (word chars only), optional whitespace, then `{`.
// Capture groups:
//   1 — everything up to and including the `!` (prefix to strip)
//   2 — the identifier being negated
const NEGATION_PATTERN = /^(\s*(?:}\s*else\s+if|if)\s+)!(\w+)\s*\{/;

export default {
  name: 'negation-strip',
  category: 'logic',
  description:
    "Removes '!' from boolean negation in Go if-statements, inverting the branch condition",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, NEGATION_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;
    // Remove the `!` that sits between the `if`/`else if` keyword and the identifier.
    // The replace targets the exact capture layout: prefix (group 1) + `!` + rest.
    const newLine = line.replace(
      /^(\s*(?:}\s*else\s+if|if)\s+)!/,
      '$1'
    );
    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    const identMatch = line.match(/!(\w+)/);
    const ident = identMatch ? identMatch[1] : 'condition';
    return `Removed '!' from '!${ident}' at line ${loc.start.line} — branch now executes when ${ident} is true instead of false`;
  },
};
