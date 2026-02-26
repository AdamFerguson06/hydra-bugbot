import fs from 'node:fs';
import path from 'node:path';
import { getLLMClient, chatCompletion } from '../utils/llm.js';

/**
 * Builds the prompt sent to Claude to generate a corrected file.
 * @param {string} filePath - Path of the file being fixed (for context).
 * @param {string} content - Current full source code of the file.
 * @param {object} bug - Bug object from the scanner.
 * @returns {string}
 */
function buildFixPrompt(filePath, content, bug) {
  return `You are a senior software engineer fixing a real bug in production code.

File: ${filePath}
Bug on line ${bug.line}: ${bug.description}
Suggested fix: ${bug.suggestedFix}

Apply the minimal, correct fix for this specific bug. Do not refactor unrelated code, add comments, change style, or make any other modifications.

Here is the full file content:

\`\`\`
${content}
\`\`\`

Respond ONLY with the complete, corrected file content — no explanations, no markdown fences, no extra text. The response must be the raw file content ready to be written to disk.`;
}

/**
 * Generates a basic unified diff between two strings by comparing them line by line.
 *
 * Produces output in a simplified unified diff format showing changed lines
 * with a few lines of context on either side. Lines unchanged at identical
 * positions are shown as context lines (prefixed with a space). Removed lines
 * are prefixed with `-` and added lines with `+`.
 *
 * @param {string} original - The original file content.
 * @param {string} fixed - The fixed file content.
 * @param {string} filePath - Used in the diff header.
 * @returns {string} Unified diff string.
 */
function generateDiff(original, fixed, filePath) {
  const CONTEXT = 3;
  const originalLines = original.split('\n');
  const fixedLines = fixed.split('\n');

  // Build a simple edit script: compare line-by-line at the same index,
  // flag lines that differ. This is not a full LCS diff — it's a positional
  // comparison that works well for the targeted single-bug fixes this tool applies.
  const maxLen = Math.max(originalLines.length, fixedLines.length);
  const hunks = [];
  let i = 0;

  while (i < maxLen) {
    const origLine = originalLines[i] ?? null;
    const fixedLine = fixedLines[i] ?? null;

    if (origLine !== fixedLine) {
      // Found a differing region — expand to collect contiguous changes
      const start = i;
      while (
        i < maxLen &&
        (originalLines[i] ?? null) !== (fixedLines[i] ?? null)
      ) {
        i++;
      }
      const end = i; // exclusive

      hunks.push({ start, end });
    } else {
      i++;
    }
  }

  if (hunks.length === 0) {
    return '(no changes)';
  }

  const header = `--- a/${filePath}\n+++ b/${filePath}`;
  const parts = [header];

  for (const hunk of hunks) {
    const ctxStart = Math.max(0, hunk.start - CONTEXT);
    const ctxEnd = Math.min(maxLen, hunk.end + CONTEXT);

    // Hunk header: @@ -origStart,origCount +fixedStart,fixedCount @@
    const origCount = Math.min(ctxEnd, originalLines.length) - ctxStart;
    const fixedCount = Math.min(ctxEnd, fixedLines.length) - ctxStart;
    const hunkHeader = `@@ -${ctxStart + 1},${origCount} +${ctxStart + 1},${fixedCount} @@`;

    const lines = [hunkHeader];

    for (let j = ctxStart; j < ctxEnd; j++) {
      if (j < hunk.start || j >= hunk.end) {
        // Context line — present in both versions
        const contextLine = originalLines[j] ?? fixedLines[j] ?? '';
        lines.push(` ${contextLine}`);
      } else {
        // Changed region: emit removed then added
        if (j < originalLines.length) {
          lines.push(`-${originalLines[j]}`);
        }
        if (j < fixedLines.length) {
          lines.push(`+${fixedLines[j]}`);
        }
      }
    }

    parts.push(lines.join('\n'));
  }

  return parts.join('\n');
}

/**
 * Calls the LLM to produce a corrected version of the file.
 * @param {string} filePath - Path of the file.
 * @param {string} content - Current file content.
 * @param {object} bug - Bug object from the scanner.
 * @param {object} llm - LLM client from getLLMClient().
 * @returns {Promise<string>} The corrected file content as a string.
 */
async function generateFix(filePath, content, bug, llm) {
  const prompt = buildFixPrompt(filePath, content, bug);

  let raw;
  try {
    raw = await chatCompletion(llm, prompt, 8192);
  } catch (err) {
    if (err.status === 429) {
      throw new Error(`Rate limit hit while fixing ${filePath}. Wait a moment and retry.`);
    }
    throw new Error(`API error while fixing ${filePath}: ${err.message}`);
  }

  // LLMs sometimes wrap output in markdown fences despite explicit instructions.
  const stripped = raw
    .replace(/^```(?:\w+)?\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  return stripped;
}

/**
 * Applies a fix for a single bug: generates corrected code via Claude, writes it
 * to disk, and returns a detailed result object.
 *
 * @param {{
 *   file: string,
 *   line: number,
 *   description: string,
 *   severity: string,
 *   suggestedFix: string
 * }} bug - A single bug object as returned by scanFiles / scanDirectory.
 * @param {object} [options={}] - Reserved for future options (e.g. dry-run).
 * @returns {Promise<{
 *   file: string,
 *   line: number,
 *   description: string,
 *   originalCode: string,
 *   fixedCode: string,
 *   diff: string
 * }>} Result object describing what was changed.
 */
export async function fixBug(bug, options = {}) {
  const llm = getLLMClient();

  const filePath = path.resolve(bug.file);

  let originalCode;
  try {
    originalCode = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file to fix: ${filePath} — ${err.message}`);
  }

  const fixedCode = await generateFix(filePath, originalCode, bug, llm);

  if (!fixedCode || fixedCode === originalCode) {
    // Claude returned the same content — nothing to write
    return {
      file: bug.file,
      line: bug.line,
      description: `No change applied for: ${bug.description}`,
      originalCode,
      fixedCode: originalCode,
      diff: '(no changes)',
    };
  }

  // Write the fixed content back to disk
  try {
    fs.writeFileSync(filePath, fixedCode, 'utf8');
  } catch (err) {
    throw new Error(`Failed to write fix to ${filePath}: ${err.message}`);
  }

  const diff = generateDiff(originalCode, fixedCode, bug.file);

  return {
    file: bug.file,
    line: bug.line,
    description: `Fixed: ${bug.description}`,
    originalCode,
    fixedCode,
    diff,
  };
}

/**
 * Applies fixes for an array of bugs sequentially, returning all results.
 *
 * Bugs are fixed one at a time in order. If a fix fails, the error is caught
 * and recorded in the result so remaining bugs can still be processed.
 *
 * @param {Array<{
 *   file: string,
 *   line: number,
 *   description: string,
 *   severity: string,
 *   suggestedFix: string
 * }>} bugs - Array of bug objects as returned by scanFiles / scanDirectory.
 * @param {object} [options={}] - Reserved for future options (e.g. dry-run).
 * @returns {Promise<Array<{
 *   file: string,
 *   line: number,
 *   description: string,
 *   originalCode: string,
 *   fixedCode: string,
 *   diff: string
 * }>>} Array of fix result objects, one per bug.
 */
export async function fixBugs(bugs, options = {}) {
  const results = [];

  for (const bug of bugs) {
    try {
      const result = await fixBug(bug, options);
      results.push(result);
    } catch (err) {
      // Record the failure without stopping the rest of the fixes
      results.push({
        file: bug.file,
        line: bug.line,
        description: `Error fixing bug: ${err.message}`,
        originalCode: '',
        fixedCode: '',
        diff: '',
      });
    }
  }

  return results;
}
