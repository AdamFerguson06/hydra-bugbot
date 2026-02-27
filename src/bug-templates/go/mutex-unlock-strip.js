/**
 * mutex-unlock-strip.js — Go mutex-unlock-strip bug template
 *
 * Strategy: In Go, a sync.Mutex or sync.RWMutex must be unlocked after it is
 * locked, or any goroutine that subsequently tries to acquire the same lock will
 * block forever — a classic deadlock.  The idiomatic pattern is:
 *
 *   mu.Lock()
 *   defer mu.Unlock()   ← guarantees unlock on every return path
 *
 * This template removes the Unlock (or RUnlock) call entirely.  Whether the
 * line uses `defer` or is a direct call, removing it leaves the mutex
 * permanently locked.  The first goroutine to attempt another Lock() call will
 * hang indefinitely and the program deadlocks.
 *
 * The mutation is subtle: the Lock() call is untouched, so the lock is still
 * acquired — only the release is gone.  To a reviewer skimming the diff the
 * missing line is easy to overlook.
 *
 * Targets (removed entirely):
 *   defer mu.Unlock()       →  (line removed)
 *   mu.Unlock()             →  (line removed)
 *   defer m.Unlock()        →  (line removed)
 *   m.RUnlock()             →  (line removed)
 *   defer lock.Unlock()     →  (line removed)
 *   lock.RUnlock()          →  (line removed)
 *
 * This breaks: any goroutine subsequently calling Lock() on the same mutex
 * will block forever, causing a deadlock that Go's runtime detects (and panics
 * on) only when ALL goroutines are blocked.
 */

import { findMatchingLines, removeLine } from '../../utils/regex-parser.js';

// Matches any line whose only meaningful content is a mutex Unlock or RUnlock
// call — with or without a leading `defer`.
//
// Breakdown:
//   ^\s*            — optional leading whitespace
//   (?:defer\s+)?   — optional `defer ` keyword
//   \w+             — mutex variable name (mu, m, lock, rwmu, …)
//   \.              — dot accessor
//   (?:Unlock|RUnlock) — the unlock method
//   \s*\(\s*\)      — empty call parens, allowing internal whitespace
const UNLOCK_PATTERN = /^\s*(?:defer\s+)?\w+\.(?:Unlock|RUnlock)\s*\(\s*\)/;

export default {
  name: 'mutex-unlock-strip',
  category: 'concurrency',
  description:
    'Removes mutex Unlock/RUnlock calls, leaving the lock permanently held and causing subsequent goroutines to deadlock',

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, UNLOCK_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex } = injectionPoint;
    // Remove the entire line — the mutex is now never unlocked.
    return removeLine(parsed, lineIndex);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the full call expression for the description (e.g. `mu.Unlock()`).
    const callMatch = line.match(/(?:defer\s+)?(\w+\.(?:Unlock|RUnlock)\s*\(\s*\))/);
    const call = callMatch ? callMatch[1] : 'Unlock()';
    return `Removed '${call}' at line ${loc.start.line} — mutex is never released, any goroutine that calls Lock() next will deadlock forever`;
  },
};
