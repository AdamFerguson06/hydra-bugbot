/**
 * boolean-trap.js — Python equality-vs-identity boolean check bug template
 *
 * Strategy: In Python there are two ways to compare a value against True or False:
 *
 *   value == True    — equality check: True for any truthy value (1, "yes", [1], ...)
 *   value is True    — identity check: True ONLY if value is literally the True singleton
 *
 * These are NOT equivalent. `1 == True` evaluates to True (because int 1 equals
 * the boolean True numerically), but `1 is True` evaluates to False (because 1
 * is an int object, not the True singleton). The same asymmetry applies for False:
 * `0 == False` is True, but `0 is False` is False.
 *
 * This template replaces `== True` / `== False` with `is True` / `is False`.
 * Code that relied on truthy/falsy values matching (e.g., API responses returning
 * 1/0, non-empty strings, non-zero counts) will silently start evaluating to the
 * wrong branch. The mutation looks like a style fix ("PEP 8 prefers 'is'"), making
 * it plausible and hard to flag in review.
 *
 * Pattern: any line containing `== True` or `== False` (with optional whitespace).
 * Comment lines are automatically skipped by findMatchingLines.
 *
 * Transform: replace `==` with `is` for the matched True/False comparison only.
 * We use a targeted replacement rather than a global one to touch only the first
 * occurrence per line, keeping the injection minimal.
 *
 * Pattern groups (on the replacement regex):
 *   $1 — the boolean literal (True or False), preserved exactly
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines containing == True or == False (with optional surrounding spaces).
// We match both values in a single pattern using an alternation.
const BOOL_EQUALITY_PATTERN = /==\s*(True|False)\b/;

export default {
  name: 'boolean-trap',
  category: 'logic',
  description:
    "Replaces '== True'/'== False' with 'is True'/'is False' — identity check fails for truthy non-singleton values like 1, non-empty strings",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, BOOL_EQUALITY_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace `== True` / `== False` with `is True` / `is False`.
    // We replace only the first match on the line to keep the change surgical.
    // The spacing around `is` mirrors the original spacing around `==`.
    const newLine = line.replace(
      /==(\s*(?:True|False)\b)/,
      'is$1'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(BOOL_EQUALITY_PATTERN);
    const literal = m ? m[1] : 'True';
    return `Changed '== ${literal}' to 'is ${literal}' — identity check instead of equality; truthy values like 1 or non-empty strings no longer match`;
  },
};
