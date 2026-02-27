/**
 * stream-error-missing.js — Python I/O error handler broadening bug template
 *
 * Strategy: `except IOError:`, `except OSError:`, `except FileNotFoundError:`,
 * and `except PermissionError:` are precise exception handlers that the
 * developer wrote to deal with specific, anticipated I/O failure modes — a
 * missing file, a permission problem, a broken pipe. The handler body typically
 * contains recovery logic: logging the error, returning a default value, or
 * re-trying with a fallback path.
 *
 * Broadening the catch clause to `except Exception:` silently swallows every
 * exception that inherits from Exception inside the try block, including:
 *   - ValueError (malformed data)
 *   - AttributeError (None dereference inside the block)
 *   - KeyError (missing dict key)
 *   - Any library-specific exception
 *
 * The recovery handler body then runs in response to errors it was never
 * designed to handle. Depending on the body, this can mean:
 *   - Silent data corruption (returning a stale default when a logic error fired)
 *   - Swallowed crashes that should have propagated to the caller
 *   - Security-relevant errors (PermissionError on a path check) being treated
 *     as routine I/O failures
 *
 * This template intentionally targets only I/O-specific exception names so it
 * does not duplicate the exception-broad-catch template, which targets other
 * exception types. The distinguishing characteristic is the semantic context:
 * I/O error handlers are particularly dangerous to broaden because the
 * surrounding code often deals with external resources and user-controlled paths.
 *
 * Targets (both bare and `as <varname>` forms):
 *   except IOError:                →  except Exception:
 *   except OSError:                →  except Exception:
 *   except FileNotFoundError:      →  except Exception:
 *   except PermissionError:        →  except Exception:
 *   except IOError as e:           →  except Exception as e:
 *   except (OSError, IOError):     →  except Exception:
 *   except (FileNotFoundError,):   →  except Exception:
 *
 * Note on tuples: a tuple like `except (OSError, IOError):` is matched because
 * EXCEPT_IO_PATTERN looks for any of the four target names after `except`.
 * The entire type specification (including the tuple) is consumed and replaced
 * wholesale with `Exception`, preserving any trailing `as <varname>:` clause
 * via the AS_SUFFIX_RE auxiliary replacement.
 *
 * Pattern groups for EXCEPT_IO_PATTERN:
 *   $1 — leading whitespace (indent level, preserved)
 *   $2 — matched I/O error type name (consumed; replaced with `Exception`)
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Detection: any except clause that names at least one of the four I/O error types.
// Handles bare names and tuple forms: except (OSError, IOError):
const EXCEPT_IO_PATTERN =
  /^(\s*)except\s+\(?\s*(?:IOError|OSError|FileNotFoundError|PermissionError)\b/;

export default {
  name: 'stream-error-missing',
  category: 'error-handling',
  description:
    "Broadens except IOError/OSError/FileNotFoundError/PermissionError clauses to 'except Exception', swallowing all I/O and non-I/O errors indiscriminately",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, EXCEPT_IO_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace the full type specification with `Exception`.
    // The replacement regex captures:
    //   - leading indent ($1)
    //   - the `except` keyword
    //   - the entire type expression (simple name, tuple, or parenthesised form)
    //     up to but not including any `as <varname>:` suffix or the bare colon
    // Then appends any trailing `as <varname>:` or bare `:` unchanged.
    //
    // We do this in two steps for clarity:
    //   Step 1: replace everything from `except` through the type expression
    //           with `except Exception`, preserving the rest of the line.
    //   Step 2: `line.replace` with a function to handle both tuple and simple forms.

    const newLine = line.replace(
      // Match: indent + `except` + optional `(` + type names + optional `)` +
      //        optional whitespace — stop before `as` or `:`.
      /^(\s*)except\s+\(?\s*(?:IOError|OSError|FileNotFoundError|PermissionError)[\w,\s()]*?(?=\s+as\s|\s*:)/,
      '$1except Exception'
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    // Extract the original exception type name(s) for the message.
    const m = injectionPoint.line.match(
      /except\s+(\(?\s*(?:IOError|OSError|FileNotFoundError|PermissionError)[\w,\s()]*?\s*\)?)\s*(?:as\s+\w+\s*)?:/
    );
    const originalType = m ? m[1].trim() : 'IOError/OSError';
    return `Broadened 'except ${originalType}' to 'except Exception' — I/O-specific error handler now silently swallows all exception types, including unexpected runtime errors`;
  },
};
