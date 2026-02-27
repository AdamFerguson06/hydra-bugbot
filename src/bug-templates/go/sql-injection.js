/**
 * sql-injection.js — Go parameterized query removal bug template
 *
 * Strategy: The standard defense against SQL injection in Go is to use
 * parameterized queries via database/sql's placeholder syntax.  For PostgreSQL
 * and lib/pq, placeholders are $1, $2, …; for MySQL/SQLite they are ?.
 * The database driver binds each argument separately so user-supplied values
 * are never interpolated into the SQL string.
 *
 * This template targets the common single-parameter form:
 *
 *   db.QueryRow("SELECT * FROM users WHERE id = $1", userID)
 *
 * and rewrites it to use fmt.Sprintf string interpolation:
 *
 *   db.QueryRow(fmt.Sprintf("SELECT * FROM users WHERE id = %v", userID))
 *
 * With fmt.Sprintf, a caller that supplies:
 *   userID = "1 OR 1=1"
 * produces the string:
 *   SELECT * FROM users WHERE id = 1 OR 1=1
 * which bypasses all row-level access controls.
 *
 * The injected code still compiles and passes superficial tests that only
 * use benign inputs.  The vulnerability only surfaces under adversarial input.
 *
 * Limitation: the template handles the common $1 single-argument case.
 * Multi-placeholder queries (using $2, $3, …) are skipped because safely
 * rewriting them requires reconstructing the full argument list, which is
 * not reliably achievable with a line-level regex transform.
 *
 * Targets:
 *   rows, err := db.Query("SELECT ... WHERE col = $1", val)
 *     → rows, err := db.Query(fmt.Sprintf("SELECT ... WHERE col = %v", val))
 *
 *   row := db.QueryRow("SELECT ... WHERE id = $1", id)
 *     → row := db.QueryRow(fmt.Sprintf("SELECT ... WHERE id = %v", id))
 *
 *   _, err = db.Exec("DELETE FROM sessions WHERE token = $1", tok)
 *     → _, err = db.Exec(fmt.Sprintf("DELETE FROM sessions WHERE token = %v", tok))
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches db.Query / db.QueryRow / db.Exec / db.QueryContext / db.ExecContext
// calls where the SQL string literal contains exactly one $1 placeholder and
// is followed by exactly one argument identifier.
//
// Capture groups:
//   1 — everything before the opening quote of the SQL string
//       (e.g. `rows, err := db.Query(`)
//   2 — the SQL text before $1
//   3 — the SQL text after $1
//   4 — the single argument identifier (variable name)
const PARAM_QUERY_PATTERN =
  /^(\s*.*\.\s*(?:Query|QueryRow|Exec|QueryContext|ExecContext)\s*\(\s*)"([^"]*)\$1([^"]*)"\s*,\s*(\w+)\s*\)(.*)$/;

export default {
  name: 'sql-injection',
  category: 'security',
  description:
    'Replaces parameterized SQL queries ($1 placeholder) with fmt.Sprintf string interpolation, opening the query to SQL injection',

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, PARAM_QUERY_PATTERN, filename);

    // Only inject on queries using exactly one $1 and no further placeholders
    // ($2, $3, ?, etc.) so the transform produces valid Go without needing to
    // reconstruct a multi-argument rewrite.
    return matches.filter((m) => {
      const sql = m.match[2] + m.match[3]; // text before + after $1
      return !/\$[2-9]|\$\d{2,}|\?/.test(sql);
    });
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Rewrite:
    //   <prefix>"<before>$1<after>", <arg>)<suffix>
    // to:
    //   <prefix>fmt.Sprintf("<before>%v<after>", <arg>))<suffix>
    //
    // Note the extra closing paren: the outer db.Query(...) call already
    // had one closing paren, and fmt.Sprintf(...) adds another.
    const newLine = line.replace(
      /^(\s*.*\.\s*(?:Query|QueryRow|Exec|QueryContext|ExecContext)\s*\(\s*)"([^"]*)\$1([^"]*)"\s*,\s*(\w+)\s*\)(.*)$/,
      (_, prefix, before, after, arg, suffix) =>
        `${prefix}fmt.Sprintf("${before}%v${after}", ${arg}))${suffix}`
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the method name for a precise message.
    const methodMatch = line.match(/\.\s*(Query|QueryRow|Exec|QueryContext|ExecContext)\s*\(/);
    const method = methodMatch ? methodMatch[1] : 'query';
    const argMatch = line.match(/\$1[^"]*"\s*,\s*(\w+)/);
    const arg = argMatch ? argMatch[1] : 'arg';
    return `Replaced parameterized $1 placeholder in db.${method}() at line ${loc.start.line} with fmt.Sprintf — '${arg}' is now interpolated directly into the SQL string, enabling injection attacks`;
  },
};
