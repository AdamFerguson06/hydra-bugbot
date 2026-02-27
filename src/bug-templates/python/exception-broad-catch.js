/**
 * exception-broad-catch.js — Python broad exception catch bug template
 *
 * Strategy: Python's `except SomeError as e:` (or `except (TypeA, TypeB) as e:`)
 * catches only the named exception types. This is intentional defensive coding —
 * the developer has documented exactly which errors the handler can deal with.
 * Broadening the clause to `except Exception as e:` silently swallows every
 * exception that inherits from Exception, including ones the surrounding code was
 * never designed to handle: ValueError, RuntimeError, MemoryError, and more.
 *
 * The bug is subtle because the handler body still runs (it isn't removed), so
 * the except block appears functional in tests. The damage only surfaces when an
 * unexpected exception fires in production and is silently swallowed rather than
 * propagating to the appropriate caller.
 *
 * Two regex passes are used to handle both forms:
 *
 *   Form A — with `as` binding:
 *     except ValueError as e:           →  except Exception as e:
 *     except (TypeError, KeyError) as e: →  except Exception as e:
 *
 *   Form B — without `as` binding (bare except with type):
 *     except ValueError:                →  except Exception:
 *     except (TypeError, KeyError):     →  except Exception:
 *
 * In both forms the indentation and the variable name (if present) are preserved;
 * only the exception type specification is widened to `Exception`.
 *
 * Pattern groups for EXCEPT_AS_PATTERN (Form A):
 *   $1 — leading whitespace
 *   $2 — variable name from the `as` clause (preserved in output)
 *
 * Pattern groups for EXCEPT_BARE_PATTERN (Form B):
 *   $1 — leading whitespace
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Form A: except <type-or-tuple> as <varname>:
// Captures: indent, variable name.
// The exception type expression (simple name or parenthesised tuple) is consumed
// but not captured — it is replaced wholesale with `Exception`.
const EXCEPT_AS_PATTERN = /^(\s*)except\s+\(?\w[\w.,\s]*\)?\s+as\s+(\w+)\s*:/;

// Form B: except <type-or-tuple>: (no `as` binding)
// Must NOT match bare `except:` (no type at all — that is already maximally broad).
// The negative look-ahead `(?!:)` ensures there is at least one non-colon character
// after `except ` before the colon terminator.
const EXCEPT_BARE_PATTERN = /^(\s*)except\s+\(?\w[\w.,\s]*\)?\s*:/;

export default {
  name: 'exception-broad-catch',
  category: 'error-handling',
  description:
    "Broadens specific 'except SomeError' clauses to 'except Exception', swallowing all exception types",

  findInjectionPoints(parsed, filename) {
    // Collect Form A matches first, then Form B.
    // Tag each candidate so inject() knows which pattern to apply.
    const asMatches = findMatchingLines(parsed, EXCEPT_AS_PATTERN, filename).map(
      (pt) => ({ ...pt, form: 'as' })
    );
    const bareMatches = findMatchingLines(parsed, EXCEPT_BARE_PATTERN, filename)
      // Exclude lines already matched by Form A to avoid duplicates.
      .filter((pt) => !asMatches.some((a) => a.lineIndex === pt.lineIndex))
      // Exclude lines that are already `except:` or `except Exception:` — nothing to broaden.
      .filter((pt) => !/^(\s*)except\s*:/.test(pt.line))
      .filter((pt) => !/^(\s*)except\s+Exception\s*:/.test(pt.line))
      .map((pt) => ({ ...pt, form: 'bare' }));

    // Also exclude Form A lines that are already `except Exception as ...:`.
    const filteredAs = asMatches.filter(
      (pt) => !/^(\s*)except\s+Exception\s+as\s+\w+\s*:/.test(pt.line)
    );

    return [...filteredAs, ...bareMatches];
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, form } = injectionPoint;

    let newLine;
    if (form === 'as') {
      // Preserve indent and variable name; replace everything between them with
      // `except Exception as <varname>:`
      newLine = line.replace(
        EXCEPT_AS_PATTERN,
        (_, indent, varname) => `${indent}except Exception as ${varname}:`
      );
    } else {
      // Form B — strip the specific type, leave `except Exception:`
      newLine = line.replace(
        EXCEPT_BARE_PATTERN,
        (_, indent) => `${indent}except Exception:`
      );
    }

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, form } = injectionPoint;
    if (form === 'as') {
      const m = line.match(EXCEPT_AS_PATTERN);
      const varname = m ? m[2] : 'e';
      return `Broadened specific except clause to 'except Exception as ${varname}:' — all exception types are now caught, including unexpected ones`;
    }
    return `Broadened specific except clause to 'except Exception:' — all exception types are now silently swallowed`;
  },
};
