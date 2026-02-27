/**
 * error-wrap-strip.js — Go error-wrap-strip bug template
 *
 * Strategy: Go 1.13 introduced structured error wrapping via fmt.Errorf with
 * the `%w` verb:
 *
 *   fmt.Errorf("operation failed: %w", err)
 *
 * The `%w` verb embeds the original error in the returned error value,
 * preserving the error chain.  Callers can then unwrap it with:
 *
 *   errors.Is(err, io.EOF)         — check for a specific sentinel error
 *   errors.As(err, &target)        — extract a typed error from the chain
 *
 * Changing `%w` to `%v` silently destroys the error chain:
 *
 *   fmt.Errorf("operation failed: %v", err)
 *
 * The returned error is now a plain *errors.errorString; the original error
 * is stringified and embedded in the message, but the structured link is gone.
 * Any errors.Is / errors.As checks downstream silently fail (return false /
 * nil) even when the underlying cause is exactly the error being tested for.
 *
 * The mutation is particularly hard to spot in review because:
 *   - The code compiles cleanly.
 *   - The error message text is identical.
 *   - Only the behaviour of errors.Is / errors.As changes.
 *
 * Targets:
 *   fmt.Errorf("read failed: %w", err)   →  fmt.Errorf("read failed: %v", err)
 *   fmt.Errorf("%w", dbErr)              →  fmt.Errorf("%v", dbErr)
 *
 * This breaks: errors.Is() and errors.As() no longer traverse the chain,
 * causing silent mismatches in error-handling code that depends on unwrapping.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches any line that calls fmt.Errorf and includes the %w wrapping verb.
// The .* after fmt.Errorf( is non-greedy to avoid over-matching across lines,
// but since we operate line-by-line this is safe as a simple match anchor.
const ERRORF_WRAP_PATTERN = /fmt\.Errorf\(.*%w/;

export default {
  name: 'error-wrap-strip',
  category: 'error-handling',
  description:
    "Changes '%w' to '%v' in fmt.Errorf calls, breaking the error chain and defeating errors.Is / errors.As checks",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, ERRORF_WRAP_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace the first %w with %v.
    // We use a targeted replacement rather than a global one: a line with
    // multiple %w verbs is unusual, and replacing only the first is the
    // minimal, most surgical mutation.
    const newLine = line.replace(/%w/, '%v');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the format string for context in the description.
    const fmtMatch = line.match(/fmt\.Errorf\(\s*"([^"]+)"/);
    const fmtStr = fmtMatch ? `"${fmtMatch[1]}"` : 'the format string';
    return `Changed '%w' to '%v' in fmt.Errorf(${fmtStr}) at line ${loc.start.line} — error chain is broken, errors.Is/errors.As will silently return false for the wrapped error`;
  },
};
