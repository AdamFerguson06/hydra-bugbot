/**
 * async-race.js — Python async/await race condition bug template
 *
 * Strategy: Removing `await` from a coroutine call in an async function leaves
 * a bare coroutine object. The coroutine is never scheduled or executed — Python
 * will emit a "coroutine was never awaited" RuntimeWarning at best, and produce
 * completely wrong values at worst (the variable receives a coroutine object
 * rather than the resolved result). The bug is hard to spot because the call
 * still looks syntactically valid.
 *
 * Targets: Lines with `await ` (inside what are expected to be async functions).
 * The regex preserves leading indentation and any assignment left-hand side.
 *
 * Pattern groups:
 *   $1 — leading whitespace + optional assignment (e.g. `    result = `)
 *   The `await ` token is dropped and the rest of the line is kept.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Captures: optional indent + optional assignment, then `await `.
// Group 1: everything before `await` (indent + assignment prefix, if any).
const AWAIT_PATTERN = /^(\s*(?:\w+\s*=\s*)?)await\s+/;

export default {
  name: 'async-race',
  category: 'async',
  description:
    "Removes 'await' keyword from coroutine calls, leaving a bare unawaited coroutine object",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, AWAIT_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Strip `await ` — keep everything before it and everything after it
    // The regex match gives us group 1 (prefix) so we reconstruct the line.
    const newLine = line.replace(AWAIT_PATTERN, '$1');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    return `Removed 'await' keyword — coroutine is never executed, variable receives a coroutine object instead of the resolved value`;
  },
};
