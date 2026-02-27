/**
 * path-traversal.js — Python path sanitization removal bug template
 *
 * Strategy: `os.path.abspath()`, `os.path.realpath()`, and `os.path.normpath()`
 * are Python's standard tools for canonicalising file paths. They resolve `..`
 * components, collapse redundant separators, and (for abspath/realpath) anchor
 * the result to the filesystem root. Code that validates a path against an
 * allowed prefix — e.g. `if not resolved.startswith(BASE_DIR): raise` — relies
 * entirely on the path having been canonicalised first. Without the wrapping
 * call the raw user-supplied string reaches the check unchanged:
 * `../../etc/passwd` does NOT start with `/app/uploads/` so the check would
 * normally fire, but once the canonical wrapper is removed the traversal string
 * passes straight through to `open()` or `os.remove()`.
 *
 * The injection is invisible in happy-path tests because for clean paths like
 * `uploads/photo.jpg` the behaviour is identical with or without the wrapper.
 * Only a path containing `..` or symlinks exposes the difference.
 *
 * Targets:
 *   os.path.abspath(user_path)  →  user_path
 *   os.path.realpath(var)       →  var
 *   os.path.normpath(p)         →  p
 *
 * Pattern groups:
 *   $1 — function name (abspath | realpath | normpath) — consumed, not kept
 *   $2 — single identifier argument (preserved as the replacement value)
 *
 * The transform keeps only the raw argument, dropping the sanitising wrapper.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches: os.path.<abspath|realpath|normpath>(<single_identifier>)
// Requires a plain identifier as the argument so we replace exactly the right
// span. Multi-argument or complex expression calls are left alone.
const PATH_SANITIZE_PATTERN = /\bos\.path\.(abspath|realpath|normpath)\s*\(\s*(\w+)\s*\)/;

export default {
  name: 'path-traversal',
  category: 'security',
  description:
    "Removes os.path.abspath/realpath/normpath wrappers, stripping path canonicalisation and enabling directory traversal",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, PATH_SANITIZE_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace the entire os.path.<fn>(var) call with just the raw variable name.
    // Any surrounding assignment or expression context is preserved.
    const newLine = line.replace(PATH_SANITIZE_PATTERN, '$2');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(PATH_SANITIZE_PATTERN);
    const fn = m ? `os.path.${m[1]}` : 'os.path.abspath';
    const arg = m ? m[2] : 'path';
    return `Removed '${fn}(${arg})' path canonicalisation wrapper — raw user-supplied path now reaches downstream checks, enabling directory traversal via '../' components`;
  },
};
