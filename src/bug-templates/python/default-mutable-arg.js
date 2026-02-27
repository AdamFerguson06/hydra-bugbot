/**
 * default-mutable-arg.js — Python mutable default argument bug template
 *
 * Strategy: Python evaluates default argument values ONCE at function definition
 * time, not on each call. The idiomatic pattern to avoid the resulting shared-state
 * trap is to use `None` as the sentinel and initialise the real default inside the
 * function body:
 *
 *   def process(items=None):
 *       if items is None:
 *           items = []
 *       ...
 *
 * Replacing `=None` with `=[]` in the function signature reinstates the classic
 * Python footgun: the list default is allocated once and mutated by every call that
 * uses it, so state leaks between invocations. This is one of Python's most
 * notorious gotchas — the code looks completely normal, tests using fresh inputs
 * will pass, and the bug only surfaces when the default is actually relied upon
 * across multiple calls (e.g. accumulating results, caching, or incremental
 * processing).
 *
 * Targets:
 *   def fetch(results=None):         → def fetch(results=[]):
 *   def add_item(self, items=None):  → def add_item(self, items=[]):
 *   def run(config=None, data=None): → def run(config=[], data=None):  (first only)
 *
 * Only the FIRST `=None` in the parameter list is replaced to keep the injection
 * minimal. Lines without a `=None` in a `def` signature are not matched.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches def lines that contain at least one `=None` (with optional spaces) in parameters
const DEF_NONE_DEFAULT_PATTERN = /^(\s*)def\s+\w+\(.*=\s*None.*\)\s*:/;

export default {
  name: 'default-mutable-arg',
  category: 'correctness',
  description:
    "Replaces '=None' with '=[]' in function signatures, introducing the mutable default argument trap where the list is shared across calls",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, DEF_NONE_DEFAULT_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace only the first occurrence of = None (with optional surrounding spaces)
    // inside the parameter list. We match `= None` or `=None` and normalise to `=[]`.
    const newLine = line.replace(/=\s*None/, '=[]');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    // Extract the function name for the describe message
    const fnMatch = injectionPoint.line.match(/def\s+(\w+)\s*\(/);
    const fnName = fnMatch ? fnMatch[1] : 'function';
    return `Replaced '=None' with '=[]' in '${fnName}' signature — mutable default list is now shared across all calls that rely on the default`;
  },
};
