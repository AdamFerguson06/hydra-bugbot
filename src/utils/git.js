import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'node:path';

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
 * Ensures .hydra-manifest.json is listed in the target repo's .gitignore.
 * Appends it if not already present.
 */
function ensureManifestIgnored() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const entry = '.hydra-manifest.json';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    if (content.split('\n').some((line) => line.trim() === entry)) return;
    writeFileSync(gitignorePath, content.trimEnd() + '\n' + entry + '\n', 'utf8');
  } else {
    writeFileSync(gitignorePath, entry + '\n', 'utf8');
  }
}

/**
 * Stages all changes and commits with the given message.
 * Automatically ensures .hydra-manifest.json is gitignored before staging.
 * @param {string} message - Commit message.
 */
export function commitChanges(message) {
  try {
    ensureManifestIgnored();
    exec('git add -A');
    exec(`git commit -m ${JSON.stringify(message)}`);
  } catch (e) {
    throw new Error(`git.commitChanges failed: ${e.message}`);
  }
}

/**
 * Pushes the current branch to origin and creates a GitHub PR using the gh CLI.
 * @param {string} branch - Branch name to push.
 * @param {{ title: string, body: string }} pr - PR title and body.
 * @returns {{ pushed: boolean, prUrl: string|null }} Result with PR URL if created.
 */
export function pushAndCreatePR(branch, pr) {
  const result = { pushed: false, prUrl: null };

  try {
    exec(`git push -u origin ${branch}`);
    result.pushed = true;
  } catch (e) {
    throw new Error(`git.pushAndCreatePR push failed: ${e.message}`);
  }

  try {
    const url = exec(
      `gh pr create --title ${JSON.stringify(pr.title)} --body ${JSON.stringify(pr.body)}`
    );
    result.prUrl = url.trim();
  } catch (e) {
    // gh CLI may not be installed or authenticated — non-fatal
    result.prUrl = null;
  }

  return result;
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
