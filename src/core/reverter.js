import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves the absolute path to an injected bug's target file.
 * The file path stored in the manifest is relative to the project root,
 * which is the directory that contains the manifest (process.cwd()).
 * @param {string} filePath - Relative file path from the manifest entry.
 * @returns {string} Absolute path to the file.
 */
function resolveFilePath(filePath) {
  return path.resolve(process.cwd(), filePath);
}

/**
 * Reverts a single injected bug entry by restoring the full original file content
 * from the `originalCode` field stored in the manifest.
 *
 * The MVP strategy is full-file restore: `originalCode` holds the entire file
 * content as it existed before injection, making revert a straightforward write.
 *
 * @param {object} manifest - The loaded manifest object.
 * @param {string} bugId - The id of the injected bug to revert (e.g. "hydra-001").
 * @returns {{ success: boolean, error?: string }} Result object.
 */
export function revertSingleInjection(manifest, bugId) {
  const bug = manifest.injectedBugs.find((b) => b.id === bugId);

  if (!bug) {
    return { success: false, error: `Bug "${bugId}" not found in manifest.` };
  }

  if (bug.originalCode == null) {
    return {
      success: false,
      error: `Bug "${bugId}" has no originalCode stored — cannot revert.`,
    };
  }

  const absPath = resolveFilePath(bug.file);

  if (!fs.existsSync(absPath)) {
    return {
      success: false,
      error: `File not found: ${absPath}`,
    };
  }

  try {
    fs.writeFileSync(absPath, bug.originalCode, 'utf8');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to write ${absPath}: ${err.message}`,
    };
  }
}

/**
 * Reverts all injected bugs in the manifest by restoring the original file content
 * for each entry. Bugs are processed in reverse insertion order so that multiple
 * injections into the same file are unwound correctly (last-in, first-out).
 *
 * @param {object} manifest - The loaded manifest object.
 * @returns {{ reverted: number, errors: string[] }} Summary of the revert operation.
 */
export function revertAllInjections(manifest) {
  const summary = { reverted: 0, errors: [] };

  // Reverse order: if multiple bugs touched the same file, the last injection's
  // originalCode represents the state just before that injection, so we need to
  // unwind from the most recent injection backwards to reach the true original.
  const bugsInReverseOrder = [...manifest.injectedBugs].reverse();

  // Track which files we have already reverted in this pass.
  // Because originalCode is the full file snapshot taken before each individual
  // injection, reverting in reverse order means the first revert we apply to a
  // file restores it to the state before the last injection. Subsequent reverts
  // for the same file in this loop would overwrite that with an earlier snapshot,
  // which is correct for a serial injection chain.
  for (const bug of bugsInReverseOrder) {
    const result = revertSingleInjection(manifest, bug.id);
    if (result.success) {
      summary.reverted += 1;
    } else {
      summary.errors.push(`[${bug.id}] ${result.error}`);
    }
  }

  return summary;
}
