/**
 * error-swallow.js — Python error-swallowing bug template
 *
 * Strategy: Python's except handlers typically contain meaningful recovery
 * logic — logging, re-raising, cleanup, or returning an error value. This
 * template replaces the handler body with a bare `pass`, silently discarding
 * the exception. The except clause still catches the named type, but the
 * application silently continues as if nothing happened.
 *
 * This is distinct from exception-broad-catch (which widens WHAT is caught)
 * — error-swallow changes HOW a caught exception is handled: by doing nothing.
 *
 * Targets:
 *   except ValueError as e:     →  except ValueError as e:
 *       logger.error(e)                 pass
 *       raise
 *
 *   except IOError:             →  except IOError:
 *       cleanup()                       pass
 *       return None
 *
 * The template finds except blocks whose body contains at least one
 * non-pass statement, then replaces the entire body with `pass`.
 */

import { findMatchingLines, replaceLine, removeLine } from '../../utils/regex-parser.js';

// Matches any except line (with or without type, with or without `as`).
// We require a named type to avoid matching bare `except:` which is already
// a known anti-pattern and would be too obvious.
const EXCEPT_LINE_PATTERN = /^(\s*)except\s+\w[\w.,\s()]*(?:\s+as\s+\w+)?\s*:/;

/**
 * Returns the indentation string of a line.
 */
function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
}

export default {
  name: 'error-swallow',
  category: 'error-handling',
  description:
    "Replaces except handler body with 'pass', silently swallowing caught exceptions instead of handling them",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, EXCEPT_LINE_PATTERN, filename);
    const points = [];

    for (const candidate of candidates) {
      const { lineIndex } = candidate;
      const exceptIndent = getIndent(parsed.lines[lineIndex]);
      const bodyIndent = exceptIndent + '    '; // Python standard 4-space indent

      // Scan forward to find the except body lines.
      // Body lines are those indented deeper than the except line.
      const bodyLines = [];
      for (let i = lineIndex + 1; i < parsed.lines.length; i++) {
        const ln = parsed.lines[i];
        // Blank lines inside the body are part of it.
        if (ln.trim() === '') {
          bodyLines.push(i);
          continue;
        }
        // If indented deeper than the except keyword, it's part of the body.
        if (getIndent(ln).length > exceptIndent.length) {
          bodyLines.push(i);
        } else {
          break;
        }
      }

      // Skip if body is empty or already just `pass`.
      if (bodyLines.length === 0) continue;
      const nonBlankBody = bodyLines.filter((i) => parsed.lines[i].trim() !== '');
      if (
        nonBlankBody.length === 1 &&
        parsed.lines[nonBlankBody[0]].trim() === 'pass'
      ) {
        continue;
      }

      // Must have at least one meaningful statement to replace.
      if (nonBlankBody.length === 0) continue;

      points.push({
        ...candidate,
        bodyLines,
        bodyIndent,
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, bodyLines, bodyIndent } = injectionPoint;

    // Remove all body lines (in reverse order to preserve indices).
    let result = parsed;
    for (let i = bodyLines.length - 1; i >= 0; i--) {
      result = removeLine(result, bodyLines[i]);
    }

    // Insert `pass` as the new body right after the except line.
    // After removals, the except line is still at lineIndex.
    const passLine = bodyIndent + 'pass';
    result.lines.splice(lineIndex + 1, 0, passLine);

    return result;
  },

  describe(injectionPoint) {
    const bodyCount = injectionPoint.bodyLines.filter(
      (i) => injectionPoint.line && true // just count them
    ).length;
    return `Replaced ${bodyCount}-line except handler body with 'pass' — exception is now silently swallowed`;
  },
};
