/**
 * wrong-constant.js — Go off-by-one constant mutation in length/count guards
 *
 * Strategy: The idiomatic emptiness check in Go is `len(x) > 0` or a bare
 * `count > 0`. Changing the boundary from `0` to `1` makes the guard skip a
 * single-element collection: a slice with exactly one item is treated as empty,
 * a counter that reaches 1 is not reported, etc. The mutation is a one-character
 * change and compiles cleanly, making it difficult to spot during review.
 *
 * This template targets the `> 0` form specifically (not `>= 1`, `!= 0`, etc.)
 * because `> 0` is by far the most common idiom in idiomatic Go code.
 *
 * Targets:
 *   if len(items) > 0 {         →  if len(items) > 1 {
 *   if count > 0 {              →  if count > 1 {
 *   if n > 0 {                  →  if n > 1 {
 *   return len(buf) > 0         →  return len(buf) > 1
 *
 * Guard: The regex uses a negative lookahead `(?!\.\d)(?!\d)` to avoid matching
 * floating-point literals like `> 0.5` or octal/multi-digit numbers like `> 01`.
 * It also avoids matching `>= 0` because `=` would appear before `0`, not after
 * `>`, so the pattern naturally misses it.
 *
 * The pattern is intentionally broad — it matches `> 0` anywhere on a line
 * (inside an `if`, in a `return`, as a boolean expression, etc.) because any
 * such check represents the same conceptual boundary.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches `> 0` where 0 is not followed by a digit or decimal point.
// This prevents matching `> 0.5`, `> 01`, `> 000`, etc.
const GT_ZERO_PATTERN = />\s*0(?!\d)(?!\.)/;

export default {
  name: 'wrong-constant',
  category: 'correctness',
  description:
    "Changes '> 0' to '> 1' in length and count guards, causing single-element collections to be treated as empty",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, GT_ZERO_PATTERN, filename);
    const points = [];

    for (const candidate of candidates) {
      const { line } = candidate;

      // Only target lines that look like conditional or return expressions to
      // avoid mutating loop initialisers like `for i := 0; i > 0` (unusual but
      // possible) or assignments.  Accept: if, return, for condition, bare expr.
      // Reject: lines whose only `> 0` is inside a string literal.
      if (/`[^`]*>\s*0[^`]*`/.test(line)) continue; // inside backtick string
      if (/"[^"]*>\s*0[^"]*"/.test(line)) continue;  // inside double-quote string

      points.push(candidate);
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;
    // Replace the first `> 0` (not inside a string) with `> 1`.
    // Using a function replace to be precise about what we matched.
    const newLine = line.replace(/>\s*0(?!\d)(?!\.)/, (m) => m.replace('0', '1'));
    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Provide context about what expression is being compared.
    const lenMatch = line.match(/len\((\w+)\)/);
    const subject = lenMatch ? `len(${lenMatch[1]})` : 'count expression';
    return `Changed '> 0' to '> 1' in ${subject} check at line ${loc.start.line} — single-element result treated as empty`;
  },
};
