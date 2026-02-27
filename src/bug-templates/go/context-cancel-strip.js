/**
 * context-cancel-strip.js — Go context-cancel-strip bug template
 *
 * Strategy: Go's context package provides cancellation, timeouts, and
 * deadlines.  The canonical pattern for creating a cancellable context is:
 *
 *   ctx, cancel := context.WithCancel(parentCtx)
 *   defer cancel()   ← MUST be called to release resources
 *
 * The same pattern applies to context.WithTimeout and context.WithDeadline.
 * Failing to call cancel() causes a context leak: the internal timer goroutine
 * or cancellation bookkeeping is never cleaned up, and any child contexts or
 * goroutines watching ctx.Done() will never receive the cancellation signal.
 *
 * This template finds lines where a cancellable context is created and then
 * looks ahead up to 5 lines for the corresponding cancel() call.  It removes
 * that cancel() line, silently leaking the context for the lifetime of the
 * program.
 *
 * The bug is insidious under load: each call to the affected function leaks
 * a small amount of memory and a goroutine.  The leak compounds over time and
 * is hard to detect without a memory profiler.
 *
 * Approach (lookahead):
 *   1. Find lines matching context.WithCancel, context.WithTimeout, or
 *      context.WithDeadline.
 *   2. Scan up to 5 lines forward for `defer cancel()` or plain `cancel()`.
 *   3. Return the cancel() line as the injection point.
 *   4. Remove that cancel() line.
 *
 * Targets (the cancel line is removed):
 *   defer cancel()   →  (line removed)
 *   cancel()         →  (line removed)
 *
 * This breaks: the context is never cancelled; goroutines and resources
 * watching ctx.Done() leak until the process exits.
 */

import { findMatchingLines, removeLine } from '../../utils/regex-parser.js';

// Matches the context creation line — the anchor for the lookahead.
// Covers: context.WithCancel(, context.WithTimeout(, context.WithDeadline(
const CONTEXT_WITH_PATTERN = /context\.With(?:Cancel|Timeout|Deadline)\(/;

// Matches a cancel() call — bare or preceded by `defer`.
// Capture groups: none needed, we only care about the line index.
const CANCEL_CALL_PATTERN = /^\s*(?:defer\s+)?cancel\s*\(\s*\)/;

export default {
  name: 'context-cancel-strip',
  category: 'concurrency',
  description:
    'Removes cancel() calls after context.WithCancel/WithTimeout/WithDeadline, leaking goroutines and context resources',

  findInjectionPoints(parsed, filename) {
    // Find every line that creates a cancellable context.
    const anchors = findMatchingLines(parsed, CONTEXT_WITH_PATTERN, filename);
    const points = [];

    for (const anchor of anchors) {
      const { lineIndex } = anchor;

      // Look ahead up to 5 lines for the cancel() call.
      const lookAheadEnd = Math.min(lineIndex + 6, parsed.lines.length);
      for (let i = lineIndex + 1; i < lookAheadEnd; i++) {
        const candidateLine = parsed.lines[i];
        if (CANCEL_CALL_PATTERN.test(candidateLine)) {
          // Build an injection point that points at the cancel() line.
          points.push({
            lineIndex: i,
            line: candidateLine,
            match: candidateLine.match(CANCEL_CALL_PATTERN),
            loc: { start: { line: i + 1 } },
            filename,
            // Carry the anchor context for a richer describe() message.
            contextLine: anchor.line,
            contextLineNumber: anchor.loc.start.line,
          });
          // One cancel() per context creation is enough.
          break;
        }
      }
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex } = injectionPoint;
    // Remove the cancel() line entirely.
    return removeLine(parsed, lineIndex);
  },

  describe(injectionPoint) {
    const { line, loc, contextLineNumber } = injectionPoint;
    const isDeferred = /defer/.test(line);
    const callForm = isDeferred ? 'defer cancel()' : 'cancel()';
    return `Removed '${callForm}' at line ${loc.start.line} (context created at line ${contextLineNumber ?? '?'}) — context is never cancelled, goroutines and resources leak for the process lifetime`;
  },
};
