/**
 * cors-wildcard.js — Go CORS origin widening bug template
 *
 * Strategy: CORS (Cross-Origin Resource Sharing) headers control which browser
 * origins may read responses from a server.  When a handler sets:
 *
 *   w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
 *
 * only that exact origin is permitted.  Replacing the specific origin with "*"
 * allows any origin to read the response — including attacker-controlled pages
 * that trick authenticated users into making cross-origin requests.
 *
 * The replacement is a single-character diff ("*" vs the full domain string)
 * and is easy to justify as "simplifying development config", making it an
 * ideal subtle sabotage.  In combination with credentials (cookies, auth
 * headers), a wildcard CORS policy enables cross-site request forgery and
 * data exfiltration.
 *
 * Note: browsers refuse to send credentials alongside Access-Control-Allow-Origin: *,
 * but many real-world APIs still leak sensitive non-credentialed data this way.
 *
 * Targets (net/http handler style):
 *   w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
 *     → w.Header().Set("Access-Control-Allow-Origin", "*")
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines that call .Set("Access-Control-Allow-Origin", "<specific-origin>")
// where the origin is neither already a wildcard nor empty.
//
// Capture groups:
//   1 — the opening portion up to and including the opening quote of the origin value
//   2 — the specific origin string (non-empty, non-wildcard)
//   3 — the closing quote and remainder of the call
const CORS_SET_PATTERN =
  /\.Set\(\s*"Access-Control-Allow-Origin"\s*,\s*"([^"*][^"]*)"\s*\)/;

export default {
  name: 'cors-wildcard',
  category: 'security',
  description:
    'Replaces specific CORS allowed origins with "*", permitting any browser origin to read the response',

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, CORS_SET_PATTERN, filename);
    // Filter out lines that already use the wildcard (belt-and-suspenders on top
    // of the regex, since the pattern already excludes "*" in the origin group).
    return matches.filter((m) => !/"Access-Control-Allow-Origin"\s*,\s*"\*"/.test(m.line));
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace the specific origin string with "*" while preserving the full
    // .Set(...) call structure so the line remains valid Go.
    const newLine = line.replace(
      /("Access-Control-Allow-Origin"\s*,\s*")[^"]+(")/,
      '$1*$2'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    const originMatch = line.match(
      /"Access-Control-Allow-Origin"\s*,\s*"([^"*][^"]*)"/
    );
    const origin = originMatch ? originMatch[1] : 'specific origin';
    return `Replaced CORS origin '${origin}' with '*' at line ${loc.start.line} — any browser origin can now read responses from this endpoint`;
  },
};
