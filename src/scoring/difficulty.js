/**
 * @fileoverview Rates the difficulty/subtlety of injected bugs on a 1-5 scale.
 *
 * Baseline scores by category reflect how hard the bug pattern is to spot
 * during code review. Context adjustments account for structural factors
 * (e.g. deeply nested code) that compound difficulty.
 */

/**
 * Baseline difficulty ratings by bug category.
 * @type {Record<string, number>}
 */
const CATEGORY_BASELINES = {
  'off-by-one':      2,
  'type-coercion':   1,
  'stale-closure':   3,
  'async-race':      4,
  'null-deref':      2,
  'logic-inversion': 3,
  'resource-leak':   4,
  // Python-specific
  'none-deref':      2,
  'indentation':     4,
  // Go-specific
  'nil-deref':       2,
  'error-swallow':   3,
  'goroutine-leak':  4,
  'defer-trap':      3,
  // JavaScript expanded — Tier 1
  'negation-strip':           3,
  'ternary-swap':             3,
  'nullish-to-or':            4,
  'foreach-return':           4,
  'spread-order':             4,
  'destructure-default-strip': 3,
  // JavaScript expanded — Tier 2
  'promise-all-settle':  4,
  'catch-chain-strip':   3,
  'wrong-constant':      4,
  'array-sort-mutation': 4,
  // JavaScript expanded — Tier 3 (security)
  'csrf-token-skip':     5,
  'path-traversal':      4,
  'cors-wildcard':       3,
  // JavaScript expanded — Tier 4 (backend)
  'connection-pool-leak':  4,
  'stream-error-missing':  3,
  'http-timeout-strip':    3,
};

/**
 * Human-readable labels for each difficulty score.
 * @type {Record<number, string>}
 */
const DIFFICULTY_LABELS = {
  1: 'Obvious',
  2: 'Easy',
  3: 'Moderate',
  4: 'Tricky',
  5: 'Sneaky',
};

/**
 * Clamps a numeric value to the inclusive range [min, max].
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Infers a context-based difficulty adjustment from the injection result.
 *
 * Rules (each stacks independently, capped collectively at ±1):
 *  +1 — Line number is high (> 200), suggesting the bug sits deep in a large file.
 *  +1 — Severity is low (≤ 1), meaning the bug manifests subtly rather than crashing loudly.
 *  -1 — Description contains obvious surface keywords that a reviewer would flag immediately.
 *
 * The final adjustment is clamped to [-1, +1] so a single injection never moves
 * more than one step beyond its category baseline.
 *
 * @param {{ category: string, severity: number, file: string, line: number, description: string }} injection
 * @returns {number} Adjustment value in the range [-1, 1].
 */
function contextAdjustment(injection) {
  let adjustment = 0;

  // Deep in a large file — harder to navigate to and reason about
  if (typeof injection.line === 'number' && injection.line > 200) {
    adjustment += 1;
  }

  // Low-severity bugs are silent failures — easy to overlook
  if (typeof injection.severity === 'number' && injection.severity <= 1) {
    adjustment += 1;
  }

  // Description hints at an obvious footgun reviewers are already primed to catch
  const obviousKeywords = ['crash', 'undefined', 'null', 'throw', 'error'];
  const descLower = (injection.description || '').toLowerCase();
  if (obviousKeywords.some((kw) => descLower.includes(kw))) {
    adjustment -= 1;
  }

  return clamp(adjustment, -1, 1);
}

/**
 * Rates the difficulty of a single injected bug on a 1–5 scale.
 *
 * Scoring:
 *  1. Look up the category baseline (defaults to 2 for unknown categories).
 *  2. Apply a context-based ±1 adjustment.
 *  3. Clamp the result to [1, 5].
 *
 * @param {{ category: string, severity: number, file: string, line: number, description: string }} injection
 *   An injected bug record from the manifest's `injectedBugs` array.
 * @returns {number} Difficulty score in the range [1, 5].
 */
export function rateDifficulty(injection) {
  const baseline = CATEGORY_BASELINES[injection.category] ?? 2;
  const adjustment = contextAdjustment(injection);
  return clamp(baseline + adjustment, 1, 5);
}

/**
 * Returns a human-readable label for a difficulty score.
 *
 * @param {number} score - Integer difficulty score in the range [1, 5].
 * @returns {string} One of: "Obvious", "Easy", "Moderate", "Tricky", "Sneaky".
 */
export function getDifficultyLabel(score) {
  return DIFFICULTY_LABELS[score] ?? 'Unknown';
}

/**
 * Returns a star-rating string for a difficulty score.
 *
 * Filled stars (★) represent the score; empty stars (☆) fill the remainder
 * up to 5, e.g. score 3 → "★★★☆☆".
 *
 * @param {number} score - Integer difficulty score in the range [1, 5].
 * @returns {string} A 5-character string of ★ and ☆ characters.
 */
export function getDifficultyStars(score) {
  const clamped = clamp(score, 1, 5);
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}
