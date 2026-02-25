import fs from 'node:fs';
import path from 'node:path';

/**
 * Absolute path to the manifest file, resolved from the current working directory.
 * @type {string}
 */
export const MANIFEST_PATH = path.resolve(process.cwd(), '.hydra-manifest.json');

/**
 * Reads and parses the manifest file from disk.
 * @returns {object|null} The parsed manifest object, or null if the file does not exist.
 */
export function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return null;
  }
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * Creates a new empty manifest for the given branch and writes it to disk.
 * @param {string} branch - The git branch name for this session (e.g. "hydra/session-abc123").
 * @returns {object} The newly created manifest object.
 */
export function createManifest(branch) {
  const manifest = {
    version: '1.0.0',
    created: new Date().toISOString(),
    branch,
    realFixes: [],
    injectedBugs: [],
    stats: {
      totalRealFixes: 0,
      totalInjected: 0,
      discovered: 0,
      undiscovered: 0,
    },
  };
  saveManifest(manifest);
  return manifest;
}

/**
 * Writes the manifest object to disk as pretty-printed JSON.
 * @param {object} manifest - The manifest object to persist.
 */
export function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Adds a real fix entry to the manifest.
 * Auto-generates a sequential id like "fix-001". Updates stats and saves.
 * @param {object} manifest - The current manifest object (mutated in place).
 * @param {{ file: string, line: number, description: string, diff: string }} fix - Fix metadata.
 * @returns {object} The manifest with the new fix appended.
 */
export function addRealFix(manifest, fix) {
  const nextIndex = manifest.realFixes.length + 1;
  const id = `fix-${String(nextIndex).padStart(3, '0')}`;
  manifest.realFixes.push({ id, ...fix });
  updateStats(manifest);
  return manifest;
}

/**
 * Adds an injected bug entry to the manifest.
 * Auto-generates a sequential id like "hydra-001". Updates stats and saves.
 * @param {object} manifest - The current manifest object (mutated in place).
 * @param {{
 *   parentFix: string,
 *   file: string,
 *   line: number,
 *   category: string,
 *   severity: number,
 *   description: string,
 *   originalCode: string,
 *   diff: string
 * }} bug - Injected bug metadata.
 * @returns {object} The manifest with the new bug appended.
 */
export function addInjectedBug(manifest, bug) {
  const nextIndex = manifest.injectedBugs.length + 1;
  const id = `hydra-${String(nextIndex).padStart(3, '0')}`;
  manifest.injectedBugs.push({
    id,
    ...bug,
    discoveredBy: null,
    discoveredAt: null,
  });
  updateStats(manifest);
  return manifest;
}

/**
 * Marks an injected bug as discovered by a reviewer.
 * Updates the discoveredBy and discoveredAt fields, recalculates stats, and saves.
 * @param {object} manifest - The current manifest object (mutated in place).
 * @param {string} bugId - The id of the injected bug (e.g. "hydra-001").
 * @param {string} reviewer - Name or identifier of the reviewer who found the bug.
 * @returns {object} The manifest with the updated bug entry.
 * @throws {Error} If the bugId does not exist in the manifest.
 */
export function markDiscovered(manifest, bugId, reviewer) {
  const bug = manifest.injectedBugs.find((b) => b.id === bugId);
  if (!bug) {
    throw new Error(`Bug "${bugId}" not found in manifest.`);
  }
  bug.discoveredBy = reviewer;
  bug.discoveredAt = new Date().toISOString();
  updateStats(manifest);
  return manifest;
}

/**
 * Recalculates all stats from the current arrays and saves the manifest.
 * @param {object} manifest - The current manifest object (mutated in place).
 * @returns {object} The manifest with updated stats.
 */
export function updateStats(manifest) {
  const discovered = manifest.injectedBugs.filter((b) => b.discoveredBy !== null).length;
  manifest.stats = {
    totalRealFixes: manifest.realFixes.length,
    totalInjected: manifest.injectedBugs.length,
    discovered,
    undiscovered: manifest.injectedBugs.length - discovered,
  };
  saveManifest(manifest);
  return manifest;
}

/**
 * Returns the subset of injected bugs that have not yet been discovered.
 * @param {object} manifest - The current manifest object.
 * @returns {object[]} Array of injected bug entries where discoveredBy is null.
 */
export function getUndiscoveredBugs(manifest) {
  return manifest.injectedBugs.filter((b) => b.discoveredBy === null);
}
