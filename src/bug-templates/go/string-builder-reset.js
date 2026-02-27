/**
 * string-builder-reset.js — Go strings.Builder / bytes.Buffer reset removal bug template
 *
 * Strategy: `strings.Builder` and `bytes.Buffer` are the standard Go types for
 * efficiently accumulating string or byte data.  When used inside a loop, the
 * idiomatic pattern is to call `.Reset()` at the start (or end) of each
 * iteration to discard the data written in the previous pass before building
 * the next value:
 *
 *   var sb strings.Builder
 *   for _, item := range items {
 *       sb.Reset()           // ← this template comments this out
 *       sb.WriteString(item.prefix)
 *       sb.WriteString(item.body)
 *       process(sb.String())
 *   }
 *
 * By commenting out the `.Reset()` call, the buffer is never cleared between
 * iterations.  Each iteration appends its new data on top of everything written
 * in all previous iterations.  The resulting strings grow without bound and
 * contain stale data from earlier loop passes.  This is a silent logic error —
 * the program compiles cleanly, panics do not occur, but the output is wrong
 * and memory usage grows linearly (or worse) with the number of iterations.
 *
 * The comment-out approach is chosen over line removal because the Reset() call
 * is sometimes the only statement on a line and removing it could make the
 * surrounding loop body syntactically odd; commenting is always safe.
 *
 * Targets:
 *   builder.Reset()    →  // builder.Reset()
 *   buf.Reset()        →  // buf.Reset()
 *   buffer.Reset()     →  // buffer.Reset()
 *   sb.Reset()         →  // sb.Reset()
 *   b.Reset()          →  // b.Reset()
 *
 * Non-targets (too broad — avoided by requiring .Reset() as the full call):
 *   r.Reset(newReader)      (Reset with arguments — different semantics)
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches a line whose meaningful content is a no-argument .Reset() call on
// any receiver variable.
//
// Breakdown:
//   ^\s*           — optional leading whitespace
//   \w+            — variable name (builder, buf, buffer, sb, b, …)
//   \.Reset\s*     — the .Reset method
//   \(\s*\)        — empty argument list (no-arg Reset only — avoids
//                    bufio.Reader.Reset(r) and similar typed variants)
//   \s*$           — nothing else on the line
const RESET_PATTERN = /^\s*\w+\.Reset\s*\(\s*\)\s*$/;

export default {
  name: 'string-builder-reset',
  category: 'correctness',
  description:
    "Comments out .Reset() calls on strings.Builder and bytes.Buffer — the buffer accumulates data from every loop iteration, producing ever-growing, stale output",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, RESET_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Preserve leading indentation, then prepend `// ` before the statement.
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const trimmed = line.trimStart();
    const newLine = `${indent}// ${trimmed}`;

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the receiver name for the human-readable description.
    const receiverMatch = line.match(/^\s*(\w+)\.Reset/);
    const receiver = receiverMatch ? receiverMatch[1] : 'buffer';
    return `Commented out '${receiver}.Reset()' at line ${loc.start.line} — buffer is never cleared between iterations; output grows across loop passes, incorporating stale data from every previous iteration`;
  },
};
