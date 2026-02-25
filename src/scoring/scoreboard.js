/**
 * @fileoverview Tracks and displays reviewer performance against injected bugs.
 *
 * Consumes the `.hydra-manifest.json` structure produced by src/core/manifest.js
 * and renders a formatted, colour-coded scoreboard for terminal display.
 */

import chalk from 'chalk';
import { rateDifficulty, getDifficultyStars } from './difficulty.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Left-pads a string to a given width using spaces.
 *
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function padEnd(str, width) {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/**
 * Produces the difficulty-weighted score for a single bug.
 * Discovered bugs earn their difficulty rating; missed bugs earn 0.
 *
 * @param {{ category: string, severity: number, file: string, line: number, description: string, discoveredBy: string|null }} bug
 * @returns {{ earned: number, possible: number }}
 */
function bugScore(bug) {
  const difficulty = rateDifficulty(bug);
  return {
    earned: bug.discoveredBy !== null ? difficulty : 0,
    possible: difficulty,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculates the difficulty-weighted session score from a manifest.
 *
 * Each found bug earns points equal to its difficulty rating (1–5).
 * Total possible points is the sum of all injected bugs' difficulty ratings.
 *
 * @param {{
 *   injectedBugs: Array<{
 *     id: string,
 *     category: string,
 *     severity: number,
 *     file: string,
 *     line: number,
 *     description: string,
 *     discoveredBy: string|null,
 *     discoveredAt: string|null
 *   }>
 * }} manifest
 * @returns {{ earned: number, total: number, percentage: number }}
 */
export function calculateScore(manifest) {
  const bugs = manifest.injectedBugs ?? [];
  let earned = 0;
  let total = 0;

  for (const bug of bugs) {
    const { earned: e, possible } = bugScore(bug);
    earned += e;
    total += possible;
  }

  const percentage = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { earned, total, percentage };
}

/**
 * Builds a per-reviewer breakdown of discovered bugs and scores.
 *
 * Only bugs with a non-null `discoveredBy` field are counted.
 *
 * @param {{
 *   injectedBugs: Array<{
 *     id: string,
 *     category: string,
 *     severity: number,
 *     file: string,
 *     line: number,
 *     description: string,
 *     discoveredBy: string|null
 *   }>
 * }} manifest
 * @returns {Record<string, { found: number, score: number, bugs: string[] }>}
 *   Keys are reviewer identifiers; values contain their discovery count, point
 *   total, and the list of bug IDs they caught.
 */
export function getReviewerStats(manifest) {
  const bugs = manifest.injectedBugs ?? [];
  /** @type {Record<string, { found: number, score: number, bugs: string[] }>} */
  const stats = {};

  for (const bug of bugs) {
    if (bug.discoveredBy === null) continue;

    const reviewer = bug.discoveredBy;
    if (!stats[reviewer]) {
      stats[reviewer] = { found: 0, score: 0, bugs: [] };
    }

    const difficulty = rateDifficulty(bug);
    stats[reviewer].found += 1;
    stats[reviewer].score += difficulty;
    stats[reviewer].bugs.push(bug.id);
  }

  return stats;
}

/**
 * Generates a formatted, colour-coded scoreboard string for terminal display.
 *
 * Colour conventions:
 *  - Title / header:  bold
 *  - Session name:    cyan
 *  - [FOUND]:         green
 *  - [MISSED]:        red
 *  - Stars (★☆):      yellow
 *
 * @param {{
 *   branch: string,
 *   injectedBugs: Array<{
 *     id: string,
 *     category: string,
 *     severity: number,
 *     file: string,
 *     line: number,
 *     description: string,
 *     discoveredBy: string|null,
 *     discoveredAt: string|null
 *   }>,
 *   stats: {
 *     totalRealFixes: number,
 *     totalInjected: number,
 *     discovered: number,
 *     undiscovered: number
 *   }
 * }} manifest
 * @returns {string} Multi-line string ready to pass to console.log().
 */
export function generateScoreboard(manifest) {
  const bugs = manifest.injectedBugs ?? [];
  const stats = manifest.stats ?? {};
  const { earned, total } = calculateScore(manifest);

  const discovered = stats.discovered ?? bugs.filter((b) => b.discoveredBy !== null).length;
  const totalInjected = stats.totalInjected ?? bugs.length;
  const totalRealFixes = stats.totalRealFixes ?? 0;

  const lines = [];

  // ── Title block ─────────────────────────────────────────────────────────────
  lines.push(chalk.bold('Hydra Bugbot Scoreboard'));
  lines.push(chalk.bold('═══════════════════════'));
  lines.push(`Session: ${chalk.cyan(manifest.branch ?? 'unknown')}`);
  lines.push('');

  // ── Summary ─────────────────────────────────────────────────────────────────
  lines.push(chalk.bold('Summary:'));
  lines.push(`  Real bugs fixed: ${totalRealFixes}`);
  lines.push(`  Bugs injected:   ${totalInjected}`);
  lines.push(`  Bugs found:      ${discovered}/${totalInjected}`);
  lines.push(`  Score:           ${earned}/${total} points (difficulty-weighted)`);
  lines.push('');

  // ── Bug breakdown ────────────────────────────────────────────────────────────
  if (bugs.length > 0) {
    lines.push(chalk.bold('Bug Breakdown:'));

    for (const bug of bugs) {
      const found = bug.discoveredBy !== null;
      const status = found
        ? chalk.green('[FOUND]  ')
        : chalk.red('[MISSED] ');

      const difficulty = rateDifficulty(bug);
      const stars = chalk.yellow(getDifficultyStars(difficulty));

      // Fixed-width columns keep the table visually aligned
      const id = padEnd(bug.id ?? '', 10);
      const category = padEnd(bug.category ?? 'unknown', 16);

      const discoveryNote = found
        ? ` (found by: ${bug.discoveredBy})`
        : '';

      lines.push(`  ${id} ${status} ${category} ${stars}${discoveryNote}`);
    }
  }

  return lines.join('\n');
}
