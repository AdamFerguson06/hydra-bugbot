/**
 * connection-pool-close.js — Python database connection close removal bug template
 *
 * Strategy: Database drivers and connection pools rely on explicit `.close()`
 * calls to return a connection to the pool (or close the underlying socket).
 * When `.close()` is omitted, the connection object remains allocated but
 * unreachable after the function returns. In long-running services this
 * silently exhausts the pool — new requests block waiting for a connection
 * that is never returned, eventually timing out with `OperationalError: too
 * many connections` or equivalent.
 *
 * The pattern is hard to detect in tests because:
 *   - Unit tests rarely exercise hundreds of concurrent requests.
 *   - The first N requests succeed; only the (N+1)th blocks.
 *   - Memory/GC-based close (CPython's reference counting) may close the
 *     connection incidentally, masking the bug until a refactor introduces
 *     a long-lived reference.
 *
 * Targets — standalone `.close()` calls on recognised connection-like names:
 *   conn.close()
 *   connection.close()
 *   db.close()
 *   cursor.close()
 *   pool.close()
 *   client.close()
 *   session.close()
 *   conn_primary.close()   (word-char suffix variants)
 *   my_connection.close()  (not matched — prefix must be a known stem)
 *
 * The regex requires the line contains ONLY the close call (plus optional
 * whitespace) so we don't accidentally remove a `.close()` that is chained or
 * embedded inside a larger expression.
 *
 * Transform: the entire line is removed with `removeLine`. The surrounding
 * code continues to compile and run; the only change is that the connection is
 * never returned to the pool.
 */

import { findMatchingLines, removeLine } from '../../utils/regex-parser.js';

// Matches a standalone .close() call on a connection-like object.
// Anchored at start (^\s*) and end (\s*$) so partial matches are excluded.
// Stem must be one of the recognised names; optional word-char suffix (\w*)
// allows conn_ro, cursor2, session_admin, etc.
const CLOSE_CALL_PATTERN =
  /^\s*(conn|connection|db|cursor|pool|client|session)\w*\.close\s*\(\s*\)\s*$/;

export default {
  name: 'connection-pool-close',
  category: 'database',
  description:
    "Removes .close() calls on database connections, causing connection leaks that eventually exhaust the pool",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, CLOSE_CALL_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    // Delete the entire line — the cleanup call disappears silently.
    return removeLine(parsed, injectionPoint.lineIndex);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(CLOSE_CALL_PATTERN);
    // Reconstruct the full variable name (stem + any suffix) from the raw line
    const varMatch = injectionPoint.line.match(
      /\b((?:conn|connection|db|cursor|pool|client|session)\w*)\s*\.close/
    );
    const varname = varMatch ? varMatch[1] : 'connection';
    return `Removed '${varname}.close()' — database connection is never returned to the pool, causing a connection leak`;
  },
};
