/**
 * generator-exhaust.js — Python generator eager-materialisation bug template
 *
 * Strategy: Generator expressions assigned to a variable are lazy — they yield
 * values one at a time and never materialise the full sequence in memory. This
 * is idiomatic Python for large datasets or infinite streams:
 *
 *   evens = (x for x in range(1_000_000) if x % 2 == 0)
 *
 * Wrapping the generator in `list()` forces immediate materialisation:
 *
 *   evens = list(x for x in range(1_000_000) if x % 2 == 0)
 *
 * The behaviour of subsequent code that consumes `evens` is unchanged for
 * finite inputs — iteration still works. The damage is:
 *
 *   1. Memory: The entire sequence is allocated at once. A generator over a
 *      million items consuming kilobytes per element silently allocates
 *      gigabytes where the original code used constant memory.
 *
 *   2. Generators are single-use. After `list()` materialises it the variable
 *      holds a plain list, not a generator — so code paths that relied on the
 *      one-shot exhaustion semantics (e.g., feeding the same generator to two
 *      consumers) now behave differently.
 *
 *   3. Short-circuit semantics are destroyed. A generator inside `any()` or
 *      `all()` stops at the first True/False result. `list()` forces all
 *      elements to be evaluated first, defeating short-circuiting and
 *      potentially running expensive or side-effectful code unnecessarily.
 *
 * This template targets the simple assignment form:
 *
 *   <var> = (expr for var in iterable ...)
 *
 * The opening parenthesis of the generator expression is replaced with `list(`
 * and a matching `)` is appended to the closing paren — turning:
 *
 *   result = (x * 2 for x in items if x > 0)
 *
 * into:
 *
 *   result = list(x * 2 for x in items if x > 0)
 *
 * The closing paren of the generator expression becomes the closing paren of
 * the list() call; the generator's own parens are kept (they become the argument
 * list of list()) so the inner expression is untouched.
 *
 * Pattern groups for GENERATOR_ASSIGN_PATTERN:
 *   $1 — leading whitespace (indent level preserved)
 *   $2 — left-hand side variable name
 *   $3 — first word/expression inside the generator (before `for`)
 *
 * Limitations: Only targets the `var = (expr for ...)` form on a single line.
 * Multi-line generator expressions and dict/set comprehensions are excluded.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches assignment of a generator expression (opening paren followed by an
// expression, then `for`, then a loop variable, then `in`).
// Group 1: leading whitespace
// Group 2: assignment target variable name
// The rest of the pattern confirms a generator expression is on the RHS.
const GENERATOR_ASSIGN_PATTERN = /^(\s*)(\w+)\s*=\s*\((\w[^)]*\s+for\s+\w+\s+in\s+)/;

export default {
  name: 'generator-exhaust',
  category: 'correctness',
  description:
    "Wraps generator expression assignments in list(), forcing eager materialisation and breaking lazy evaluation",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, GENERATOR_ASSIGN_PATTERN, filename);

    // Additional guard: exclude lines that are already wrapped in list() to
    // avoid double-wrapping on repeated injection.
    return candidates.filter((pt) => !/=\s*list\s*\(/.test(pt.line));
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Strategy: find the `= (` that opens the generator expression and replace
    // the `(` with `list(`. The closing `)` of the original generator becomes
    // the closing `)` of the list() call — so we do NOT need to add an extra
    // paren. We replace only the FIRST occurrence of `= (` followed by a
    // generator head to avoid touching unrelated parentheses on the same line.
    const newLine = line.replace(
      /=\s*\((\w[^)]*\s+for\s+\w+\s+in\s+)/,
      (_, generatorHead) => `= list(${generatorHead}`
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(GENERATOR_ASSIGN_PATTERN);
    const varname = m ? m[2] : 'result';
    return `Wrapped generator expression for '${varname}' in list() — entire sequence eagerly materialised in memory, lazy evaluation and short-circuit semantics destroyed`;
  },
};
