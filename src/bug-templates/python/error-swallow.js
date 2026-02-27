/**
 * error-swallow.js — Python overly-broad exception handler bug template
 *
 * Strategy: Python's exception handling is precise by design. Writing
 * `except ValueError:` or `except (TypeError, KeyError):` catches only the
 * named exceptions and lets everything else propagate. This allows
 * KeyboardInterrupt, SystemExit, GeneratorExit, and programmer errors like
 * NameError to surface correctly.
 *
 * This template replaces specific exception types with `Exception`:
 *
 *   except ValueError:           →  except Exception:
 *   except (TypeError, KeyError): →  except Exception:  (first name only)
 *
 * `Exception` is the base class of almost all built-in exceptions, including
 * ones that should never be silently caught:
 *   - KeyboardInterrupt (Ctrl-C handling)
 *   - SystemExit (sys.exit() calls)
 *   - MemoryError, RecursionError, ...
 *
 * In practice this causes two problems:
 *   1. Signals and shutdown sequences are swallowed, making processes
 *      unkillable or uncleanly terminating.
 *   2. Programming errors (NameError, AttributeError) are caught and hidden,
 *      turning hard crashes into silent misbehaviour.
 *
 * The change looks like a harmless broadening ("catch more errors") but is a
 * well-known Python anti-pattern. It survives review because reviewers often
 * mentally parse `except Exception:` as "catch all exceptions" without
 * considering the implications.
 *
 * Pattern groups (applied to the matched line):
 *   $1 — leading whitespace (indent level preserved)
 *   $2 — original exception type(s) (discarded in favour of Exception)
 *   $3 — remainder of the line after the colon, e.g., '  # handle error' (preserved)
 *
 * Only the first word-token of the exception spec is captured; tuple forms like
 * `except (A, B):` are matched by the same pattern via `/^(\s*)except\s+(\w+)/`
 * and still collapsed to `except Exception:`.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches except clauses with a named exception type.
// Excludes bare `except:` and `except Exception:` (already as broad as we want).
// Capture groups:
//   1 — leading whitespace
//   2 — first token of the exception spec (e.g., ValueError, or the opening paren)
//   3 — everything after the colon on the same line (inline comment, etc.)
//
// We use a negative lookahead to skip lines that already say `except Exception`
// so the template is idempotent — injecting twice produces the same result.
// The character class [\w(] at the start of group 2 handles both the plain form
// `except ValueError:` and the tuple form `except (TypeError, KeyError):`.
const EXCEPT_PATTERN = /^(\s*)except\s+(?!Exception\b)([\w(][\w.,\s()]*?)(\s*:.*)$/;

export default {
  name: 'error-swallow',
  category: 'error-handling',
  description:
    "Broadens 'except SomeError:' to 'except Exception:' — catches KeyboardInterrupt, SystemExit, and hides programming errors",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, EXCEPT_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace the specific exception type(s) with the bare Exception base class.
    // Preserves indent and any inline content after the colon (e.g., comments).
    const newLine = line.replace(
      EXCEPT_PATTERN,
      '$1except Exception$3'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(EXCEPT_PATTERN);
    const original = m ? m[2].trim() : 'SomeError';
    return `Broadened 'except ${original}:' to 'except Exception:' — now catches KeyboardInterrupt, SystemExit, and masks programmer errors`;
  },
};
