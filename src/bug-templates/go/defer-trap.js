/**
 * defer-trap.js — Go defer-removal bug template
 *
 * Strategy: `defer` in Go schedules a function call to run when the enclosing
 * function returns.  It is the idiomatic way to guarantee that resources (files,
 * network connections, mutexes, database rows) are released regardless of which
 * return path the function takes.
 *
 * Removing the `defer` keyword causes the cleanup to run immediately — before
 * any subsequent reads, writes, or operations on the resource.  The resource is
 * then closed or unlocked while code still depends on it, producing:
 *   - "read/write on closed file" errors
 *   - double-close panics if the caller also closes
 *   - use-after-unlock data races on sync.Mutex
 *
 * The one-character-removed diff is easy to miss during review.
 *
 * Targets:
 *   defer f.Close()          →  f.Close()
 *   defer rows.Close()       →  rows.Close()
 *   defer mu.Unlock()        →  mu.Unlock()
 *   defer func() { ... }()  →  func() { ... }()
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches any line that starts (after optional indentation) with `defer `.
const DEFER_PATTERN = /^(\s*)defer\s+/;

export default {
  name: 'defer-trap',
  category: 'resource',
  description:
    "Removes the 'defer' keyword from cleanup calls — the resource closes immediately instead of at function exit, breaking subsequent operations",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, DEFER_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Remove 'defer ' while preserving indentation.
    // DEFER_PATTERN guarantees the structure: <indent>defer <rest>
    const newLine = line.replace(/^(\s*)defer\s+/, '$1');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the deferred call for a human-readable description.
    const callMatch = line.match(/defer\s+(.+)/);
    const call = callMatch ? callMatch[1].trim() : 'cleanup call';
    return `Removed 'defer' from '${call}' at line ${loc.start.line} — resource is released immediately, breaking any subsequent operations that depend on it`;
  },
};
