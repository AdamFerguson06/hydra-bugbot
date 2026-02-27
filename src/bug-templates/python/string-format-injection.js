/**
 * string-format-injection.js — Python sanitisation-strip security bug template
 *
 * Strategy: Defensive code wraps untrusted user input in sanitisation or
 * escaping calls before embedding it in HTML, shell commands, SQL, or URLs:
 *
 *   html.escape(user_input)     — prevents XSS in HTML contexts
 *   bleach.clean(user_input)    — strips disallowed HTML tags
 *   shlex.quote(user_input)     — escapes for safe shell interpolation
 *   re.escape(user_input)       — escapes regex metacharacters
 *   escape(user_input)          — generic Jinja2 / Markupsafe HTML escape
 *   sanitize(user_input)        — application-level sanitisation helper
 *   quote(user_input)           — urllib.parse.quote URL-encoding
 *
 * Stripping the wrapper leaves the raw variable in its place:
 *
 *   html.escape(user_input)  →  user_input
 *
 * The resulting code compiles and runs normally. The difference is only visible
 * when an attacker supplies malicious input:
 *   - XSS payloads reach the browser unescaped in HTML templates.
 *   - Shell metacharacters execute arbitrary commands.
 *   - Regex metacharacters cause ReDoS or matching logic corruption.
 *   - URL-encoded attacks bypass parameter parsing.
 *
 * The bug is difficult to catch in review because the surrounding string
 * interpolation still looks correct — the variable name is unchanged, only the
 * wrapper call disappears.
 *
 * Pattern: SANITIZE_PATTERN matches any of the known sanitisation wrappers
 * called with a single identifier argument. Multi-argument calls are excluded
 * (e.g. bleach.clean(text, tags=ALLOWED)) to avoid producing syntactically
 * broken output from the simple substitution.
 *
 * Transform:
 *   <sanitizer>(<varname>)  →  <varname>
 *
 * Pattern groups for SANITIZE_PATTERN:
 *   $1 — the full sanitisation call (consumed, not kept)
 *   $2 — the raw variable name (becomes the replacement)
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches any of the recognised sanitisation wrapper calls around a single
// simple identifier. The wrappers covered:
//   html.escape   bleach.clean   shlex.quote   re.escape
//   escape        sanitize       quote
//
// Only matches when the argument is a plain identifier (word characters) with
// optional surrounding whitespace — no commas, no keyword args — to ensure the
// substitution never breaks the call-site syntax.
const SANITIZE_PATTERN =
  /\b(html\.escape|bleach\.clean|shlex\.quote|re\.escape|escape|sanitize|quote)\s*\(\s*(\w+)\s*\)/;

export default {
  name: 'string-format-injection',
  category: 'security',
  description:
    "Strips sanitisation wrappers (html.escape, shlex.quote, re.escape, etc.) leaving raw user input in string interpolations",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, SANITIZE_PATTERN, filename);

    // Exclude lines that are import statements — the pattern could fire on
    // `from html import escape` if someone named a local `escape(...)`.
    // More importantly, exclude lines where the call result is not used in a
    // string-format context. We accept all matches for simplicity, mirroring
    // the approach of other templates, and rely on the pattern being specific
    // enough to target real sanitisation sites.
    return candidates;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace the FIRST sanitisation wrapper call on the line with just its
    // argument variable. If multiple wrappers appear on the same line, only the
    // leftmost one is stripped — subsequent calls remain, which is conservative
    // and avoids producing confusing multi-hop changes.
    const newLine = line.replace(SANITIZE_PATTERN, '$2');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(SANITIZE_PATTERN);
    const wrapper = m ? m[1] : 'sanitize';
    const varname = m ? m[2] : 'user_input';
    return `Stripped '${wrapper}(${varname})' to bare '${varname}' — untrusted input is no longer escaped, enabling injection attacks`;
  },
};
