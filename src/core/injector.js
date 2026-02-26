/**
 * injector.js — Hydra Bugbot core injection engine
 *
 * After a real bug is fixed, this module locates injection points in OTHER files
 * and applies subtle bug templates to them, maintaining the hydra's regrowth loop.
 *
 * Exported API:
 *   injectBugs(fix, options)          — top-level orchestration
 *   selectInjectionPoints(files, fix, options) — scoring and ranking
 *   applyInjection(file, template, injectionPoint) — single-file mutation
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import _generate from '@babel/generator';
const generate = _generate.default || _generate;
import * as t from '@babel/types';

// ---------------------------------------------------------------------------
// Babel parse options — shared across all parse calls
// ---------------------------------------------------------------------------
const PARSE_OPTIONS = {
  sourceType: 'module',
  plugins: [
    'jsx',
    'typescript',
    'classProperties',
    'optionalChaining',
    'nullishCoalescingOperator',
  ],
};

// ---------------------------------------------------------------------------
// Template loader — dynamically imports all JS files in the bug-templates dir
// so we never need to maintain a separate index file.
// ---------------------------------------------------------------------------

/**
 * Resolves the absolute path to the bug-templates directory relative to this file.
 * @returns {string}
 */
function bugTemplatesDir() {
  // __dirname equivalent for ESM
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.resolve(here, '../bug-templates');
}

/**
 * Lazily loaded template array — populated on first call to getTemplates().
 * @type {object[]|null}
 */
let _templates = null;

/**
 * Loads and returns all bug templates from the bug-templates directory.
 * Results are cached after the first load.
 * @returns {Promise<object[]>}
 */
async function getTemplates() {
  if (_templates !== null) return _templates;

  const dir = bugTemplatesDir();
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));

  const loaded = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry);
      // Dynamic import with file:// URL for Windows compatibility
      const mod = await import(`file://${fullPath}`);
      return mod.default ?? mod;
    })
  );

  _templates = loaded.filter(Boolean);
  return _templates;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collects all JS/TS/JSX/TSX files under `scopeDir`, excluding
 * `node_modules` and the file that was just fixed.
 *
 * @param {string} scopeDir  - Absolute directory to search in.
 * @param {string} fixedFile - Absolute path to exclude (the file that was fixed).
 * @returns {string[]} Sorted list of absolute file paths.
 */
function collectCandidateFiles(scopeDir, fixedFile) {
  const JS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip silently
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.')) continue;

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && JS_EXTENSIONS.has(path.extname(entry.name))) {
        const resolved = path.resolve(full);
        if (resolved !== path.resolve(fixedFile)) {
          results.push(resolved);
        }
      }
    }
  }

  walk(scopeDir);
  return results.sort();
}

// ---------------------------------------------------------------------------
// Relatedness scoring helpers
// ---------------------------------------------------------------------------

/**
 * Extracts bare import specifiers from an AST to help score file relatedness.
 * @param {object} ast - Babel AST.
 * @returns {string[]}
 */
function extractImports(ast) {
  const imports = [];
  try {
    traverse(ast, {
      ImportDeclaration(nodePath) {
        imports.push(nodePath.node.source.value);
      },
      CallExpression(nodePath) {
        // require('...')
        if (
          t.isIdentifier(nodePath.node.callee, { name: 'require' }) &&
          nodePath.node.arguments.length > 0 &&
          t.isStringLiteral(nodePath.node.arguments[0])
        ) {
          imports.push(nodePath.node.arguments[0].value);
        }
      },
    });
  } catch {
    // Traverse errors on partial ASTs are non-fatal
  }
  return imports;
}

/**
 * Returns a 0–1 score representing how related `candidateFile` is to `fixedFile`
 * based on directory proximity and shared import stems.
 *
 * @param {string} candidateFile - Absolute path of the file being scored.
 * @param {string} fixedFile     - Absolute path of the fixed file.
 * @param {string[]} candidateImports - Import specifiers found in the candidate.
 * @param {string[]} fixedImports     - Import specifiers found in the fixed file.
 * @returns {number} 0–1
 */
function relatednessScore(candidateFile, fixedFile, candidateImports, fixedImports) {
  let score = 0;

  // Directory proximity — same directory = 0.4, same parent = 0.2
  const candidateDir = path.dirname(candidateFile);
  const fixedDir = path.dirname(fixedFile);
  if (candidateDir === fixedDir) {
    score += 0.4;
  } else if (path.dirname(candidateDir) === path.dirname(fixedDir)) {
    score += 0.2;
  }

  // Shared import stems (filename without extension)
  const fixedStem = path.basename(fixedFile, path.extname(fixedFile)).toLowerCase();
  const importsFixedFile = candidateImports.some((imp) =>
    imp.toLowerCase().endsWith(fixedStem)
  );
  if (importsFixedFile) score += 0.4;

  // Overlapping external packages
  const fixedExternal = new Set(fixedImports.filter((i) => !i.startsWith('.')));
  const sharedExternal = candidateImports.filter(
    (i) => !i.startsWith('.') && fixedExternal.has(i)
  );
  score += Math.min(sharedExternal.length * 0.05, 0.2);

  return Math.min(score, 1);
}

/**
 * Returns a 0–1 score for how well a template's category fits the fix context.
 * Uses simple keyword heuristics on the fix description and the fixed file path.
 *
 * @param {object} template  - Bug template object.
 * @param {object} fix       - Fix result object.
 * @returns {number}
 */
function categoryFitScore(template, fix) {
  const context = `${fix.file ?? ''} ${fix.description ?? ''}`.toLowerCase();
  switch (template.category) {
    case 'react':
      return /react|hook|component|jsx|tsx|render|state/.test(context) ? 0.8 : 0.2;
    case 'async':
      return /async|await|promise|fetch|api|request|callback/.test(context) ? 0.8 : 0.3;
    case 'logic':
      return 0.5; // logic bugs are universally applicable
    case 'null-safety':
      return /null|undefined|optional|safe/.test(context) ? 0.8 : 0.4;
    default:
      return 0.3;
  }
}

/**
 * Returns a 0–1 score reflecting how close the template's implicit severity is
 * to the requested severity level (1–5 scale).
 *
 * Templates don't carry an explicit severity, so we derive a rough value from
 * the category: async > react > null-safety > logic.
 *
 * @param {object} template         - Bug template object.
 * @param {number} requestedSeverity - 1–5 integer.
 * @returns {number}
 */
function severityMatchScore(template, requestedSeverity) {
  const CATEGORY_SEVERITY = {
    async: 4,
    react: 3,
    'null-safety': 3,
    logic: 2,
  };
  const templateSeverity = CATEGORY_SEVERITY[template.category] ?? 3;
  const distance = Math.abs(templateSeverity - requestedSeverity);
  return Math.max(0, 1 - distance * 0.25);
}

// ---------------------------------------------------------------------------
// Diff generation
// ---------------------------------------------------------------------------

/**
 * Generates a simple unified diff between two strings, showing changed lines
 * with `-`/`+` prefixes and up to `contextLines` lines of surrounding context.
 *
 * @param {string} original   - Content before the change.
 * @param {string} modified   - Content after the change.
 * @param {string} filePath   - File path label shown in the diff header.
 * @param {number} [contextLines=3] - Number of unchanged lines to show around changes.
 * @returns {string}
 */
function generateDiff(original, modified, filePath, contextLines = 3) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');

  // Build a simple line-by-line comparison.
  // For files that differ significantly this produces a serviceable hunk-based diff.
  const maxLen = Math.max(origLines.length, modLines.length);
  const changes = []; // { type: 'eq'|'del'|'add', origIdx, modIdx, text }

  let oi = 0;
  let mi = 0;

  // Walk both sequences looking for matching lines (greedy, not LCS)
  while (oi < origLines.length || mi < modLines.length) {
    if (oi < origLines.length && mi < modLines.length && origLines[oi] === modLines[mi]) {
      changes.push({ type: 'eq', origIdx: oi, modIdx: mi, text: origLines[oi] });
      oi++;
      mi++;
    } else {
      // Find nearest match within a small lookahead window
      const WINDOW = 8;
      let matched = false;
      for (let d = 1; d <= WINDOW && !matched; d++) {
        // Deletion at oi+d matches current mi?
        if (oi + d < origLines.length && origLines[oi + d] === modLines[mi]) {
          for (let k = 0; k < d; k++) {
            changes.push({ type: 'del', origIdx: oi + k, text: origLines[oi + k] });
          }
          oi += d;
          matched = true;
        }
        // Insertion: current oi matches mi+d?
        else if (mi + d < modLines.length && origLines[oi] === modLines[mi + d]) {
          for (let k = 0; k < d; k++) {
            changes.push({ type: 'add', modIdx: mi + k, text: modLines[mi + k] });
          }
          mi += d;
          matched = true;
        }
      }
      if (!matched) {
        // Treat as a one-to-one substitution
        if (oi < origLines.length)
          changes.push({ type: 'del', origIdx: oi, text: origLines[oi] });
        if (mi < modLines.length)
          changes.push({ type: 'add', modIdx: mi, text: modLines[mi] });
        oi++;
        mi++;
      }
    }
  }

  // Group contiguous changed lines into hunks with context
  const changedIndices = new Set(
    changes
      .map((c, i) => (c.type !== 'eq' ? i : -1))
      .filter((i) => i !== -1)
  );

  if (changedIndices.size === 0) return '';

  const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let i = 0;
  while (i < changes.length) {
    if (!changedIndices.has(i)) {
      i++;
      continue;
    }

    // Compute hunk boundaries
    const start = Math.max(0, i - contextLines);
    let end = i;
    while (end < changes.length && (changedIndices.has(end) || end < i + contextLines)) {
      end++;
    }
    end = Math.min(changes.length, end + contextLines);

    // Count original/modified lines for hunk header
    const hunkChanges = changes.slice(start, end);
    const origStart = hunkChanges.find((c) => c.origIdx != null)?.origIdx ?? 0;
    const modStart = hunkChanges.find((c) => c.modIdx != null)?.modIdx ?? 0;
    const origCount = hunkChanges.filter((c) => c.type !== 'add').length;
    const modCount = hunkChanges.filter((c) => c.type !== 'del').length;

    lines.push(`@@ -${origStart + 1},${origCount} +${modStart + 1},${modCount} @@`);

    for (const change of hunkChanges) {
      if (change.type === 'eq') lines.push(` ${change.text}`);
      else if (change.type === 'del') lines.push(`-${change.text}`);
      else if (change.type === 'add') lines.push(`+${change.text}`);
    }

    i = end;
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyzes candidate files using all loaded bug templates to find suitable
 * injection points, then returns a scored and ranked list.
 *
 * Scoring combines three factors:
 *   1. File relatedness to the fix (directory proximity, shared imports).
 *   2. Template category fit for the fix context.
 *   3. Severity proximity to the requested severity level.
 *
 * @param {string[]} files   - Absolute paths of candidate files to analyze.
 * @param {object}  fix      - Fix result object with at least `{ file, description }`.
 * @param {object}  options  - Options `{ severity?: number }`.
 * @param {object[]} templates - Loaded bug template objects.
 * @returns {Array<{
 *   file: string,
 *   template: object,
 *   injectionPoint: object,
 *   score: number,
 *   ast: object,
 *   originalCode: string
 * }>} Scored injection candidates, sorted descending by score.
 */
export function selectInjectionPoints(files, fix, options, templates) {
  const { severity = 3 } = options ?? {};
  const candidates = [];

  // Parse the fixed file so we can extract its imports for relatedness scoring.
  let fixedImports = [];
  if (fix.file) {
    try {
      const fixedSrc = fs.readFileSync(fix.file, 'utf8');
      const fixedAst = parse(fixedSrc, PARSE_OPTIONS);
      fixedImports = extractImports(fixedAst);
    } catch {
      // Non-fatal — relatedness will still use directory proximity
    }
  }

  for (const filePath of files) {
    let src;
    try {
      src = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      continue; // unreadable file — skip
    }

    let ast;
    try {
      ast = parse(src, PARSE_OPTIONS);
    } catch {
      continue; // unparseable file — skip
    }

    const candidateImports = extractImports(ast);
    const relScore = relatednessScore(filePath, fix.file ?? '', candidateImports, fixedImports);

    for (const template of templates) {
      let points;
      try {
        points = template.findInjectionPoints(ast, filePath);
      } catch {
        continue; // template threw — skip this template/file combo
      }

      if (!points || points.length === 0) continue;

      const catScore = categoryFitScore(template, fix);
      const sevScore = severityMatchScore(template, severity);

      for (const injectionPoint of points) {
        const score = relScore * 0.4 + catScore * 0.35 + sevScore * 0.25;
        candidates.push({
          file: filePath,
          template,
          injectionPoint,
          score,
          ast,            // retain parsed AST to avoid re-parsing during apply
          originalCode: src,
        });
      }
    }
  }

  // Sort descending by composite score
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Reads `file`, applies `template.inject()` to the AST at `injectionPoint`,
 * regenerates the source, writes it back, and returns the injection result.
 *
 * The caller is responsible for passing the correct `ast` and `originalCode`
 * (obtained via `selectInjectionPoints`) to avoid double-reading the file.
 *
 * @param {string} file           - Absolute path to the target file.
 * @param {object} template       - Bug template to apply.
 * @param {object} injectionPoint - Injection point object from `findInjectionPoints`.
 * @param {object} ast            - Pre-parsed Babel AST for the file.
 * @param {string} originalCode   - Full original source content of the file.
 * @returns {{
 *   file: string,
 *   line: number,
 *   category: string,
 *   severity: number,
 *   description: string,
 *   originalCode: string,
 *   injectedCode: string,
 *   diff: string
 * }|null} Result object, or null if the injection fails.
 */
export function applyInjection(file, template, injectionPoint, ast, originalCode) {
  let mutatedAst;
  try {
    mutatedAst = template.inject(ast, injectionPoint);
  } catch (err) {
    return null; // injection threw — treat as failure
  }

  let injectedCode;
  try {
    const result = generate(mutatedAst, { retainLines: false, concise: false }, originalCode);
    injectedCode = result.code;
  } catch {
    return null; // codegen failure — skip
  }

  // Sanity: if generated code is identical to original, the injection was a no-op
  if (injectedCode === originalCode) return null;

  try {
    fs.writeFileSync(file, injectedCode, 'utf8');
  } catch {
    return null; // write failure
  }

  const line = injectionPoint.loc?.start?.line ?? 0;
  const relativeFile = path.relative(process.cwd(), file);

  // Derive severity from the template category (same mapping used in scoring)
  const CATEGORY_SEVERITY = {
    async: 4,
    react: 3,
    'null-safety': 3,
    logic: 2,
  };
  const severity = CATEGORY_SEVERITY[template.category] ?? 3;

  let description;
  try {
    description = template.describe(injectionPoint);
  } catch {
    description = template.description;
  }

  const diff = generateDiff(originalCode, injectedCode, relativeFile);

  return {
    file: relativeFile,
    line,
    category: template.category,
    severity,
    description,
    originalCode,
    injectedCode,
    diff,
  };
}

/**
 * Top-level injection orchestrator. Given a fix result, finds `ratio` injection
 * points in files OTHER than the fixed file, applies bug templates to them, and
 * returns an array of injection result objects.
 *
 * @param {object} fix - Fix result object, expected shape:
 *   ```
 *   {
 *     file: string,        // path of the file that was fixed (absolute or cwd-relative)
 *     description: string, // human-readable summary of the fix
 *   }
 *   ```
 * @param {object} [options]
 * @param {number} [options.ratio=2]      - How many bugs to inject.
 * @param {number} [options.severity=3]   - Target severity level (1–5).
 * @param {string} [options.scope='src/'] - Directory to search for injection targets
 *                                          (resolved relative to process.cwd()).
 * @returns {Promise<Array<{
 *   file: string,
 *   line: number,
 *   category: string,
 *   severity: number,
 *   description: string,
 *   originalCode: string,
 *   injectedCode: string,
 *   diff: string
 * }>>} Resolves with array of successful injection results (may be fewer than `ratio`
 *      if not enough suitable targets exist).
 */
export async function injectBugs(fix, options = {}) {
  const { ratio = 2, severity = 3, scope = 'src/' } = options;

  // Resolve the fixed file to an absolute path so exclusion comparisons are reliable
  const fixedFileAbs = fix.file ? path.resolve(process.cwd(), fix.file) : null;

  // Resolve scope directory
  const scopeAbs = path.resolve(process.cwd(), scope);
  if (!fs.existsSync(scopeAbs)) {
    return []; // scope directory does not exist
  }

  // Load templates
  let templates;
  try {
    templates = await getTemplates();
  } catch {
    return [];
  }

  if (!templates || templates.length === 0) return [];

  // Collect candidate files (excludes the fixed file)
  let candidateFiles = collectCandidateFiles(scopeAbs, fixedFileAbs ?? '');

  // Fallback: if no other files exist, inject into the fixed file itself
  // (targeting different locations within the same file)
  if (candidateFiles.length === 0 && fixedFileAbs && fs.existsSync(fixedFileAbs)) {
    candidateFiles = [fixedFileAbs];
  }

  if (candidateFiles.length === 0) return [];

  // Score and rank all injection points across all candidate files
  const ranked = selectInjectionPoints(
    candidateFiles,
    { ...fix, file: fixedFileAbs ?? fix.file ?? '' },
    { severity },
    templates
  );

  if (ranked.length === 0) return [];

  // Select the top `ratio` candidates, avoiding duplicate files when possible
  const selected = [];
  const usedFiles = new Set();

  // First pass: prefer different files
  for (const candidate of ranked) {
    if (selected.length >= ratio) break;
    if (!usedFiles.has(candidate.file)) {
      selected.push(candidate);
      usedFiles.add(candidate.file);
    }
  }

  // Second pass: fill remaining slots from any file if we don't have enough
  if (selected.length < ratio) {
    for (const candidate of ranked) {
      if (selected.length >= ratio) break;
      if (!selected.includes(candidate)) {
        selected.push(candidate);
      }
    }
  }

  // Apply injections
  const results = [];
  for (const candidate of selected) {
    const result = applyInjection(
      candidate.file,
      candidate.template,
      candidate.injectionPoint,
      candidate.ast,
      candidate.originalCode
    );
    if (result !== null) {
      results.push(result);
    }
  }

  return results;
}
