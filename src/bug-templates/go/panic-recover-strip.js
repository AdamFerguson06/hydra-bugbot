/**
 * panic-recover-strip.js — Go panic-recover-strip bug template
 *
 * Strategy: Go uses panic/recover for exceptional error handling.  The
 * canonical pattern for catching a panic is:
 *
 *   defer func() {
 *       if r := recover(); r != nil {
 *           // handle panic
 *       }
 *   }()
 *
 * The recover() built-in is only meaningful inside a deferred function.  When
 * called during normal execution (or when no panic is in flight) it simply
 * returns nil.  Its sole purpose is to stop the propagation of a panic and
 * return the panic value so the program can continue.
 *
 * This template comments out the recover() call.  The deferred function still
 * runs when the enclosing function returns, but recover() is never invoked, so
 * any panic propagates up the call stack unchecked and crashes the goroutine
 * (and typically the whole program, if it reaches main).
 *
 * The mutation is deliberately minimal: one line is commented out.  The
 * deferred function wrapper, the nil check, and any recovery logic remain
 * intact — only the recover() call itself is neutralised.  To a reviewer
 * skimming the diff, the `// recover()` looks like a temporary debugging
 * comment rather than a deliberate sabotage.
 *
 * Pattern selection:
 *   - Target lines whose sole meaningful content is a recover() call,
 *     optionally assigned: `r := recover()` or bare `recover()`.
 *   - Avoid matching lines that merely reference the `recover` identifier
 *     as part of a longer expression unrelated to the built-in.
 *
 * Targets:
 *   r := recover()                 →  // r := recover()
 *   if r := recover(); r != nil {  →  // if r := recover(); r != nil {
 *   recover()                      →  // recover()
 *
 * This breaks: panics are no longer caught; they propagate up the call stack
 * and crash the goroutine / program instead of being handled gracefully.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines where recover() is actually called (not just named).
// Covers:
//   recover()                       — bare call, return value discarded
//   r := recover()                  — result assigned with :=
//   r = recover()                   — result assigned with =
//   if r := recover(); r != nil {   — inline assignment in if initialiser
//
// Capture groups:
//   1 — leading indentation (preserved in the commented-out replacement)
//   2 — everything after the indent (the code to be commented out)
const RECOVER_CALL_PATTERN = /^(\s*)(.*\brecover\s*\(\s*\).*)/;

export default {
  name: 'panic-recover-strip',
  category: 'error-handling',
  description:
    'Comments out recover() calls, preventing panic recovery and allowing panics to crash the goroutine or program',

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, RECOVER_CALL_PATTERN, filename);

    // Filter out any line that already looks like a comment (findMatchingLines
    // skips leading // lines, but RECOVER_CALL_PATTERN is broad — guard here
    // too for lines where `recover` appears after an inline `//`).
    return candidates.filter(({ line }) => !/^\s*\/\//.test(line));
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Preserve the leading indentation and prepend `// ` to the rest.
    // This is the minimal, most reviewable mutation.
    const newLine = line.replace(/^(\s*)(.+)$/, '$1// $2');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Describe whether it's an assignment form or a bare call.
    const isAssigned = /:=\s*recover|=\s*recover/.test(line);
    const form = isAssigned ? 'assigned recover()' : 'recover()';
    return `Commented out ${form} at line ${loc.start.line} — panic recovery is disabled, any panic will propagate unchecked and crash the program`;
  },
};
