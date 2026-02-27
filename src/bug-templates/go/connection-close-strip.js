/**
 * connection-close-strip.js — Go deferred Close() call removal bug template
 *
 * Strategy: In Go, resources that implement `io.Closer` (database connections,
 * SQL rows, HTTP response bodies, TCP connections, files) must be explicitly
 * closed after use.  The idiomatic pattern is to defer the Close() call
 * immediately after the resource is opened:
 *
 *   db, err := sql.Open(...)
 *   defer db.Close()                // ← this template removes these lines
 *
 *   resp, err := http.Get(url)
 *   defer resp.Body.Close()         // ← and these
 *
 *   rows, err := db.Query(...)
 *   defer rows.Close()              // ← and these
 *
 * Removing the deferred Close() call means the underlying resource is never
 * released back to its pool or to the OS:
 *
 *   - SQL connections accumulate in the pool until it is exhausted; new queries
 *     block waiting for a free connection.
 *   - HTTP response bodies are never drained or closed, so the underlying TCP
 *     connection is not returned to the keep-alive pool and a new TCP handshake
 *     is required for every request.
 *   - SQL rows that are not closed prevent the associated connection from being
 *     reused, and on some drivers hold open a server-side cursor.
 *   - File descriptors accumulate until the process hits the OS limit (EMFILE).
 *
 * Using `removeLine` rather than commenting out keeps the mutation minimal and
 * harder to spot in a diff — the deferred call simply vanishes.
 *
 * Targets (removed entirely):
 *   defer db.Close()           →  (line removed)
 *   defer rows.Close()         →  (line removed)
 *   defer resp.Body.Close()    →  (line removed)
 *   defer conn.Close()         →  (line removed)
 *   defer f.Close()            →  (line removed)
 *   defer tx.Rollback()        NOT targeted — different method
 */

import { findMatchingLines, removeLine } from '../../utils/regex-parser.js';

// Matches lines whose entire content is a deferred `.Close()` call on any
// receiver, including chained receivers (e.g. `resp.Body`).
//
// Breakdown:
//   ^\s*               — optional leading whitespace
//   defer\s+           — the defer keyword followed by whitespace
//   \w+                — the primary receiver variable name (db, rows, conn, f, …)
//   (?:\.\w+)*         — zero or more chained field accesses (e.g. .Body in resp.Body)
//   \.Close\s*\(\s*\)  — the .Close() call with optional internal whitespace
//   \s*$               — optional trailing whitespace / nothing else on the line
const CLOSE_PATTERN = /^\s*defer\s+\w+(?:\.\w+)*\.Close\s*\(\s*\)\s*$/;

export default {
  name: 'connection-close-strip',
  category: 'database',
  description:
    "Removes deferred Close() calls on database connections, HTTP response bodies, and other io.Closer resources — handles are never released, causing connection pool exhaustion and file descriptor leaks",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, CLOSE_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex } = injectionPoint;
    // Remove the entire line — the Close() call is simply gone.
    return removeLine(parsed, lineIndex);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the full receiver.Close() expression for the description.
    const callMatch = line.match(/defer\s+(\w+(?:\.\w+)*\.Close\s*\(\s*\))/);
    const call = callMatch ? callMatch[1] : 'Close()';
    return `Removed 'defer ${call}' at line ${loc.start.line} — resource is never closed; repeated calls will exhaust the connection pool or OS file descriptor limit`;
  },
};
