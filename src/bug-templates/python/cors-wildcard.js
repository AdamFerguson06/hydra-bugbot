/**
 * cors-wildcard.js — Python CORS origin list replacement bug template
 *
 * Strategy: Web frameworks (FastAPI, Flask-CORS, Django-CORS-headers, Starlette)
 * accept an `origins` or `CORS_ORIGINS` setting that restricts which client
 * origins may make cross-origin requests. Setting this to `'*'` disables all
 * origin validation — any website can make authenticated cross-origin requests
 * to the API, enabling CSRF and data-exfiltration attacks.
 *
 * The normal form lists one or more explicit origins:
 *   origins=['https://app.example.com', 'https://admin.example.com']
 *   CORS_ORIGINS = ['https://prod.example.com']
 *   allow_origins=['https://trusted.com']
 *
 * After injection, the list is collapsed to the wildcard string:
 *   origins='*'
 *   CORS_ORIGINS = '*'
 *   allow_origins='*'
 *
 * The bug is subtle in testing environments where CORS is often disabled or
 * bypassed — the API continues to function normally, and the security regression
 * is only visible in a browser making a cross-origin request.
 *
 * Regex covers: origins, origin, CORS_ORIGINS, CORS_ORIGIN, allowed_origins,
 * allowed_origin, ALLOWED_ORIGINS, ALLOWED_ORIGIN (both upper and lower case,
 * singular and plural forms).
 *
 * Pattern groups (CORS_ASSIGN_PATTERN, used for both find and inject):
 *   $1 — the setting name (origins | CORS_ORIGINS | allowed_origins | …)
 *   The `= [...]` portion (including the list contents) is consumed by the
 *   pattern and replaced with `= '*'`.
 *
 * Edge case: lists that span multiple lines are not targeted (the `.*?` only
 * matches within a single line). That is intentional — multi-line lists are
 * rare and attempting to match them with a line-at-a-time tool is fragile.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches a CORS origins assignment where the value is a list literal on one line.
// Captures the setting name so it can be preserved in the replacement.
// The `.*?` inside the brackets is non-greedy and stays within a single line
// (regex-parser operates line by line so `.` never spans a newline).
const CORS_ASSIGN_PATTERN =
  /(origins?|CORS_ORIGINS?|allowed_origins?|ALLOWED_ORIGINS?)\s*=\s*\[.*?\]/;

// Detection pattern — same as above but just used for the initial find.
// We reuse CORS_ASSIGN_PATTERN for both steps; defined separately here for
// clarity in findInjectionPoints.
const CORS_FIND_PATTERN =
  /\b(origins?|CORS_ORIGINS?|allowed_origins?|ALLOWED_ORIGINS?)\s*=\s*\[/;

export default {
  name: 'cors-wildcard',
  category: 'security',
  description:
    "Replaces specific CORS origin lists with '*', disabling all origin validation and enabling cross-origin attacks",

  findInjectionPoints(parsed, filename) {
    // Use the full list-matching pattern so we only target lines where the
    // entire list is on one line (safe to replace inline).
    return findMatchingLines(parsed, CORS_ASSIGN_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace `<name> = [...]` with `<name> = '*'`.
    // Preserves leading whitespace and anything after the closing bracket
    // (e.g. a trailing comma inside a function call).
    const newLine = line.replace(CORS_ASSIGN_PATTERN, "$1 = '*'");

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(CORS_ASSIGN_PATTERN);
    const name = m ? m[1] : 'origins';
    return `Replaced '${name} = [...]' origin allowlist with '${name} = \'*\'' — all cross-origin requests are now permitted, CORS protection is disabled`;
  },
};
