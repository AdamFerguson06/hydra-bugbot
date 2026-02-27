/**
 * path-traversal.js — Go path sanitization removal bug template
 *
 * Strategy: When Go web handlers receive user-supplied file paths, the correct
 * approach is to sanitize the input with filepath.Clean() or filepath.Abs()
 * before using it to open, read, or write files.  filepath.Clean() resolves
 * ".." components and repeated separators, while filepath.Abs() additionally
 * anchors the path to an absolute root.
 *
 * Removing the sanitization call exposes the handler to path traversal attacks:
 *   - A caller supplies "../../etc/passwd" instead of "report.pdf".
 *   - Without filepath.Clean(), the raw value passes straight to os.Open().
 *   - The server reads (or writes) arbitrary files outside the intended
 *     directory, potentially leaking credentials, source code, or host config.
 *
 * The transformation replaces the sanitization call with just its input
 * variable, preserving the surrounding assignment so the file still compiles.
 * The diff is small enough to miss in a large PR.
 *
 * Targets:
 *   cleaned := filepath.Clean(userPath)          →  cleaned := userPath
 *   safe, _ := filepath.Abs(inputFile)           →  safe, _ := inputFile
 *   full := filepath.Join(base, filepath.Clean(p)) →  full := filepath.Join(base, p)
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches filepath.Clean(x) or filepath.Abs(x) calls anywhere on a line.
// Capture groups:
//   1 — the function name (Clean or Abs)
//   2 — the argument identifier passed to the sanitizer
const FILEPATH_SANITIZE_PATTERN = /\bfilepath\.(Clean|Abs)\s*\(\s*(\w+)\s*\)/;

export default {
  name: 'path-traversal',
  category: 'security',
  description:
    'Removes filepath.Clean() / filepath.Abs() sanitization calls, allowing unsanitized user-supplied paths to reach os.Open() and similar syscalls',

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, FILEPATH_SANITIZE_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace every filepath.Clean(x) / filepath.Abs(x) occurrence on the
    // line with just the raw argument.  Using replace with /g handles the
    // filepath.Join(base, filepath.Clean(p)) pattern in one pass.
    const newLine = line.replace(
      /\bfilepath\.(?:Clean|Abs)\s*\(\s*(\w+)\s*\)/g,
      '$1'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    const fnMatch = line.match(/\bfilepath\.(Clean|Abs)\s*\(\s*(\w+)\s*\)/);
    const fnName = fnMatch ? `filepath.${fnMatch[1]}` : 'filepath sanitizer';
    const argName = fnMatch ? fnMatch[2] : 'path';
    return `Removed '${fnName}(${argName})' at line ${loc.start.line} — raw user input reaches file operations, enabling path traversal (e.g. ../../etc/passwd)`;
  },
};
