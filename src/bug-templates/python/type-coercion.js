/**
 * type-coercion.js — Python identity-vs-equality bug template
 *
 * Strategy: In Python, `==` checks value equality while `is` checks object
 * identity (same object in memory). Replacing `==` with `is` works coincidentally
 * for small integers (-5 to 256) and interned strings, but silently breaks for
 * large integers, most strings, custom objects, and list/dict literals. The bug
 * is invisible in unit tests that use commonly-interned values but surfaces in
 * production with real data.
 *
 * Targets: Lines containing `==` that are:
 *   - Not `!=` (already "not equal")
 *   - Not `== None` (that's better handled as `is None` anyway — skip to avoid
 *     creating a doubly-confusing `is None` after substitution)
 *   - Not inside a comment
 *
 * We only replace the first `==` occurrence on a matched line to keep the
 * injection minimal and targeted.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines with == that are NOT != and NOT == None
// The negative lookbehind (?<!!) excludes !=
// The negative lookahead (?!\s*None\b) excludes == None comparisons
const EQUALITY_PATTERN = /(?<!!)==(?!\s*None\b)/;

export default {
  name: 'type-coercion',
  category: 'logic',
  description:
    "Replaces '==' with 'is' — changes value equality to identity check, breaks for non-interned objects",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, EQUALITY_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace only the first == (that's not part of !=) with `is`
    // We re-apply the same negative lookbehind pattern for safety
    const newLine = line.replace(/(?<!!)==(?!\s*None\b)/, ' is ');

    // Clean up any double spacing introduced around `is`
    const cleanedLine = newLine.replace(/\s{2,}is\s{2,}/, ' is ');

    return replaceLine(parsed, lineIndex, cleanedLine);
  },

  describe(injectionPoint) {
    return `Changed '==' to 'is' — identity check instead of equality; breaks for non-interned strings, large integers, and custom objects`;
  },
};
