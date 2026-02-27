/**
 * http-timeout-strip.js — Go HTTP client timeout removal bug template
 *
 * Strategy: The `net/http` package's `http.Client` struct has a `Timeout` field
 * that caps the total time for a request, including connection, redirects, and
 * reading the response body.  When this field is omitted or zero, the client has
 * NO deadline — a hanging server or a slow network will cause the goroutine
 * performing the request to block indefinitely.
 *
 * By commenting out the `Timeout:` field in the struct literal, we revert the
 * client to the zero-value behaviour (no timeout).  The Go compiler does not
 * warn about this; `http.Client{}` with no Timeout is valid — and dangerous.
 *
 * Consequences of removing the timeout:
 *   - HTTP requests to slow or unresponsive endpoints hang forever.
 *   - The goroutine servicing each request is leaked.
 *   - Under load, leaked goroutines exhaust memory.
 *   - In a server context, all worker goroutines can become tied up waiting on
 *     downstream calls, causing the entire service to stop responding.
 *
 * The comment-out approach (rather than line removal) keeps the struct literal
 * syntactically valid even when the Timeout line was the only field.  It also
 * makes the diff look like an innocent code comment rather than a deletion.
 *
 * Targets:
 *   Timeout: 30 * time.Second,                     →  // Timeout: 30 * time.Second,
 *   Timeout: time.Duration(10) * time.Second,       →  // Timeout: time.Duration(10) * time.Second,
 *   Timeout: 5 * time.Minute,                       →  // Timeout: 5 * time.Minute,
 *   Timeout: 500 * time.Millisecond,                →  // Timeout: 500 * time.Millisecond,
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches a struct field assignment whose name is `Timeout` and whose value
// references any time-duration constant from the `time` package.
//
// Breakdown:
//   ^\s*           — optional leading whitespace (indented inside a struct literal)
//   Timeout\s*:    — field name and colon
//   \s*.+          — any RHS value
//   (?:time\.\w+|Second|Minute|Millisecond)
//                  — must mention a time unit to avoid false-positives on
//                    unrelated `Timeout:` fields in other struct types
const TIMEOUT_PATTERN = /^\s*Timeout\s*:\s*.+(?:time\.\w+|Second|Minute|Millisecond)/;

export default {
  name: 'http-timeout-strip',
  category: 'database',
  description:
    "Comments out the 'Timeout:' field in http.Client struct literals — HTTP requests have no deadline and will hang forever, leaking goroutines and exhausting resources",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, TIMEOUT_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Preserve leading indentation, then prepend `// ` to the rest of the line.
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const trimmed = line.trimStart();
    const newLine = `${indent}// ${trimmed}`;

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the timeout value for a human-readable description.
    const valueMatch = line.match(/Timeout\s*:\s*(.+?)(?:,\s*)?$/);
    const value = valueMatch ? valueMatch[1].trim() : 'timeout value';
    return `Commented out 'Timeout: ${value}' at line ${loc.start.line} — http.Client now has no deadline; requests to slow or unresponsive endpoints will block forever, leaking goroutines`;
  },
};
