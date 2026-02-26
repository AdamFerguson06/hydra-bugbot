/**
 * none-deref.js — Python None guard inversion bug template
 *
 * Strategy: `if x is not None:` is Python's idiomatic defensive guard before
 * accessing attributes or calling methods on a value that may be None. Inverting
 * it to `if x is None:` flips the guard — the "safe" body now runs when the
 * value IS None, and the None-handling branch (often an early return or error)
 * runs on valid values. This causes AttributeError or silent data corruption
 * depending on what the body does, and is extremely subtle because the diff is
 * just the word "not".
 *
 * Targets: Lines matching `if <identifier> is not None:`
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches: if <word> is not None: (with optional leading whitespace)
const IS_NOT_NONE_PATTERN = /if\s+\w+\s+is\s+not\s+None\s*:/;

export default {
  name: 'none-deref',
  category: 'null-safety',
  description:
    "Inverts 'is not None' guards to 'is None', causing the None-path to execute normal code",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, IS_NOT_NONE_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace `is not None` with `is None` — first occurrence on the line
    const newLine = line.replace(/\bis\s+not\s+None\b/, 'is None');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    return `Inverted 'is not None' to 'is None' — None-guard is flipped, normal code now runs when value is None`;
  },
};
