import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

/**
 * Executes a git command synchronously and returns trimmed stdout.
 * @param {string} cmd - The full command string to execute.
 * @param {object} [opts] - Additional execSync options.
 * @returns {string}
 */
function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: process.cwd(), ...opts }).trim();
}

/**
 * Returns the name of the current git branch.
 * @returns {string} Current branch name.
 */
export function getCurrentBranch() {
  try {
    return exec('git rev-parse --abbrev-ref HEAD');
  } catch (e) {
    throw new Error(`git.getCurrentBranch failed: ${e.message}`);
  }
}

/**
 * Creates and checks out a new branch named `hydra/session-{sessionId}` from the current HEAD.
 * @param {string} sessionId - Unique session identifier.
 * @returns {string} The new branch name.
 */
export function createHydraBranch(sessionId) {
  const branch = `hydra/session-${sessionId}`;
  try {
    exec(`git checkout -b ${branch}`);
    return branch;
  } catch (e) {
    throw new Error(`git.createHydraBranch failed: ${e.message}`);
  }
}

/**
 * Returns true if there are no uncommitted changes in the working tree.
 * @returns {boolean}
 */
export function isCleanWorkingTree() {
  try {
    const output = exec('git status --porcelain');
    return output === '';
  } catch (e) {
    throw new Error(`git.isCleanWorkingTree failed: ${e.message}`);
  }
}

/**
 * Stages all changes and commits with the given message.
 * @param {string} message - Commit message.
 */
export function commitChanges(message) {
  try {
    exec('git add -A');
    exec(`git commit -m ${JSON.stringify(message)}`);
  } catch (e) {
    throw new Error(`git.commitChanges failed: ${e.message}`);
  }
}

/**
 * Returns the git diff for a specific file (staged + unstaged relative to HEAD).
 * Falls back to a no-HEAD diff if no commits exist yet.
 * @param {string} file - Relative or absolute path to the file.
 * @returns {string} The diff output.
 */
export function getDiff(file) {
  try {
    return exec(`git diff HEAD -- ${JSON.stringify(file)}`);
  } catch (e) {
    // No commits yet — fall back to index diff
    try {
      return exec(`git diff -- ${JSON.stringify(file)}`);
    } catch (e2) {
      throw new Error(`git.getDiff failed: ${e2.message}`);
    }
  }
}

/**
 * Returns an array of tracked JS/TS files within the given directory scope.
 * @param {string} [scope='src/'] - Directory to limit the search to.
 * @returns {string[]} Array of file paths.
 */
export function getTrackedFiles(scope = 'src/') {
  try {
    const output = exec(`git ls-files ${JSON.stringify(scope)}`);
    if (!output) return [];
    return output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .filter((f) => /\.(js|ts|jsx|tsx)$/.test(f));
  } catch (e) {
    throw new Error(`git.getTrackedFiles failed: ${e.message}`);
  }
}

/**
 * Writes originalContent back to the file. Used by the reverter to undo injected changes.
 * @param {string} file - Absolute or relative path to the file.
 * @param {string} originalContent - The original file content to restore.
 */
export function revertLines(file, originalContent) {
  try {
    writeFileSync(file, originalContent, 'utf8');
  } catch (e) {
    throw new Error(`git.revertLines failed: ${e.message}`);
  }
}
