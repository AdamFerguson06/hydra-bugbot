/**
 * resource-leak.js — Python context manager removal bug template
 *
 * Strategy: `with open(...) as f:` is Python's idiomatic resource management
 * pattern. The context manager guarantees the file is closed when the block
 * exits — even on exceptions. Replacing it with a bare assignment `f = open(...)`
 * removes that guarantee. The file handle now leaks unless the caller explicitly
 * calls f.close(), which rarely happens. In long-running processes or loops this
 * exhausts file descriptors. The body code continues to work normally, making
 * the leak invisible in tests that don't monitor file descriptors.
 *
 * Pattern groups (applied to the matched line):
 *   $1 — leading whitespace (indent level preserved)
 *   $2 — arguments passed to open() (preserved exactly)
 *   $3 — variable name after `as` (becomes the assignment target)
 *
 * Result: `{indent}{varname} = open({args})`
 * The body block is left untouched — its indentation still works; Python will
 * run it normally but the file handle is no longer managed.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches: <indent>with open(<args>) as <varname>:
const WITH_OPEN_PATTERN = /^(\s*)with\s+open\((.+)\)\s+as\s+(\w+)\s*:/;

export default {
  name: 'resource-leak',
  category: 'resource',
  description:
    "Converts 'with open(...) as f:' to 'f = open(...)' — file handle is never automatically closed",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, WITH_OPEN_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Reconstruct the line: swap context manager for bare assignment
    const newLine = line.replace(
      WITH_OPEN_PATTERN,
      '$1$3 = open($2)'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    // Extract variable name from the match for a descriptive message
    const m = injectionPoint.line.match(WITH_OPEN_PATTERN);
    const varname = m ? m[3] : 'f';
    return `Converted 'with open(...) as ${varname}:' to '${varname} = open(...)' — file handle leaks, never auto-closed`;
  },
};
