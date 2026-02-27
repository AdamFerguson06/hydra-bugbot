/**
 * finally-strip.js — Python finally-block removal bug template
 *
 * Strategy: A `finally:` block in Python is guaranteed to run regardless of
 * whether an exception was raised or caught. It is the canonical location for
 * resource cleanup — closing file handles, releasing locks, committing or rolling
 * back transactions, disconnecting from databases, and so on.
 *
 * Removing the `finally:` block entirely means that cleanup code is simply gone.
 * The try/except logic still functions, so unit tests that only exercise the
 * happy path will pass. The damage only surfaces under exceptional conditions:
 * a lock that is never released causes a deadlock; a database connection that is
 * never closed leaks until the pool is exhausted; a temp file that is never
 * removed accumulates on disk.
 *
 * Algorithm:
 *   1. Find every `finally:` line via FINALLY_PATTERN.
 *   2. Walk forward from that line collecting all body lines — any line whose
 *      leading whitespace is strictly deeper than the `finally:` line itself.
 *      Blank lines inside the block are included so they are also removed.
 *   3. Build a sorted list of [finally-header, ...body-lines] indices.
 *   4. In inject(), remove all those lines in REVERSE index order so that each
 *      removal does not shift the indices of the remaining lines to delete.
 *
 * The injection point carries the full list of line indices to remove so that
 * inject() is a pure transformation with no additional scanning.
 *
 * NOTE: removeLine() is immutable — each call returns a new parsed object.
 * Iterating in reverse order and threading the returned value through each call
 * keeps all subsequent indices valid.
 */

import { findMatchingLines, removeLine, getIndent } from '../../utils/regex-parser.js';

// Matches: <indent>finally:
// Captures group 1 = leading whitespace (used to measure block body depth).
const FINALLY_PATTERN = /^(\s*)finally\s*:\s*$/;

export default {
  name: 'finally-strip',
  category: 'resource',
  description:
    "Removes 'finally:' blocks entirely, dropping all resource-cleanup code they contained",

  findInjectionPoints(parsed, filename) {
    const headers = findMatchingLines(parsed, FINALLY_PATTERN, filename);
    const points = [];

    for (const header of headers) {
      const { lineIndex, line } = header;
      const headerIndentLen = getIndent(line).length;

      // Collect body lines: everything after the header that is more indented.
      // We include blank lines that fall inside the block (they don't break
      // indentation counting because we use a "last seen deeper" heuristic).
      const bodyIndices = [];
      let i = lineIndex + 1;
      while (i < parsed.lines.length) {
        const bodyLine = parsed.lines[i];

        // A blank line inside the block — include it and keep scanning.
        if (!bodyLine.trim()) {
          // Peek ahead: if the next non-blank line is still deeper, include this blank.
          let peek = i + 1;
          while (peek < parsed.lines.length && !parsed.lines[peek].trim()) peek++;
          if (
            peek < parsed.lines.length &&
            getIndent(parsed.lines[peek]).length > headerIndentLen
          ) {
            bodyIndices.push(i);
            i++;
            continue;
          }
          // Otherwise the block has ended — stop.
          break;
        }

        if (getIndent(bodyLine).length > headerIndentLen) {
          bodyIndices.push(i);
          i++;
        } else {
          // Returned to or past the header's indentation level — block is over.
          break;
        }
      }

      // Include the finally: header itself plus all body lines.
      const indicesToRemove = [lineIndex, ...bodyIndices];

      points.push({
        lineIndex,
        line,
        match: header.match,
        loc: header.loc,
        filename,
        indicesToRemove,
        bodyLineCount: bodyIndices.length,
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { indicesToRemove } = injectionPoint;

    // Sort descending so each removal does not invalidate later indices.
    const sortedDesc = [...indicesToRemove].sort((a, b) => b - a);

    let result = parsed;
    for (const idx of sortedDesc) {
      result = removeLine(result, idx);
    }

    return result;
  },

  describe(injectionPoint) {
    const { bodyLineCount } = injectionPoint;
    const lineWord = bodyLineCount === 1 ? 'line' : 'lines';
    return `Removed 'finally:' block and its ${bodyLineCount} body ${lineWord} — resource cleanup code is permanently gone`;
  },
};
