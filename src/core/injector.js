/**
 * injector.js — Hydra Bugbot core injection engine
 *
 * After a real bug is fixed, this module locates injection points in OTHER files
 * and applies subtle bug templates to them, maintaining the hydra's regrowth loop.
 *
 * Exported API:
 *   injectBugs(fix, options)                                  — top-level orchestration
 *   selectInjectionPoints(files, fix, options, templates, adapter) — scoring and ranking
 *   applyInjection(file, template, injectionPoint, parsed, originalCode, adapter) — single-file mutation
 */

import fs from 'node:fs';
import path from 'node:path';
import { detectLanguage, getAdapter, getAllSupportedExtensions, getExtensionsForLanguage } from '../languages/index.js';

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collects all source files under `scopeDir` for the given adapter,
 * excluding the fixed file and directories the adapter marks as skippable.
 *
 * @param {string} scopeDir  - Absolute directory to search in.
 * @param {string} fixedFile - Absolute path to exclude (the file that was fixed).
 * @param {object|null} adapter - Language adapter (supplies extensions and skipDirs).
 * @returns {string[]} Sorted list of absolute file paths.
 */
function collectCandidateFiles(scopeDir, fixedFile, adapter) {
  const extensions = adapter ? adapter.extensions : getAllSupportedExtensions();
  const skipDirNames = adapter
    ? new Set([...adapter.skipDirs, '.git'])
    : new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv', 'venv', 'vendor']);
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (skipDirNames.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.git') continue;

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
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
 * @param {string} language  - Detected language name.
 * @returns {number}
 */
function categoryFitScore(template, fix, language) {
  const context = `${fix.file ?? ''} ${fix.description ?? ''}`.toLowerCase();
  switch (template.category) {
    case 'react':
      return language === 'javascript' && /react|hook|component|jsx|tsx|render|state/.test(context) ? 0.8 : 0.1;
    case 'async':
      return /async|await|promise|fetch|api|request|callback|asyncio|goroutine/.test(context) ? 0.8 : 0.3;
    case 'logic':
      return 0.5;
    case 'null-safety':
      return /null|undefined|optional|safe|none|nil/.test(context) ? 0.8 : 0.4;
    case 'error-handling':
      return /error|err|exception|panic|recover/.test(context) ? 0.8 : 0.3;
    case 'concurrency':
      return /goroutine|channel|mutex|lock|concurrent|parallel/.test(context) ? 0.8 : 0.2;
    case 'resource':
      return /file|open|close|connection|socket|defer|with\s/.test(context) ? 0.8 : 0.3;
    case 'indentation':
      return language === 'python' ? 0.6 : 0.0;
    case 'correctness':
      return 0.5; // broadly applicable like logic
    case 'security':
      return /auth|login|session|csrf|cors|token|validate|sanitize|path/.test(context) ? 0.9 : 0.2;
    case 'database':
      return /database|db|sql|query|pool|connection|client|pg|mysql|mongo/.test(context) ? 0.9 : 0.2;
    case 'event-loop':
      return /stream|pipe|socket|event|emitter/.test(context) ? 0.8 : 0.2;
    default:
      return 0.3;
  }
}

/**
 * Returns a 0–1 score reflecting how close the template's implicit severity is
 * to the requested severity level (1–5 scale).
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
    'error-handling': 3,
    concurrency: 4,
    resource: 3,
    indentation: 2,
    correctness: 3,
    security: 5,
    database: 4,
    'event-loop': 3,
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
 * @param {string[]} files     - Absolute paths of candidate files to analyze.
 * @param {object}  fix        - Fix result object with at least `{ file, description }`.
 * @param {object}  options    - Options `{ severity?: number }`.
 * @param {object[]} templates - Loaded bug template objects.
 * @param {object}  adapter    - Language adapter for parsing.
 * @returns {Array<{
 *   file: string,
 *   template: object,
 *   injectionPoint: object,
 *   score: number,
 *   parsed: object,
 *   originalCode: string
 * }>} Scored injection candidates, sorted descending by score.
 */
export function selectInjectionPoints(files, fix, options, templates, adapter) {
  const { severity = 3 } = options ?? {};
  const candidates = [];
  const language = adapter?.name ?? 'javascript';

  // Parse the fixed file for relatedness scoring
  let fixedImports = [];
  if (fix.file) {
    try {
      const fixedSrc = fs.readFileSync(fix.file, 'utf8');
      const fixedParsed = adapter.parseFile(fixedSrc, fix.file);
      fixedImports = adapter.extractImports(fixedParsed);
    } catch {
      // Non-fatal
    }
  }

  for (const filePath of files) {
    let src;
    try {
      src = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    let parsed;
    try {
      parsed = adapter.parseFile(src, filePath);
    } catch {
      continue;
    }

    const candidateImports = adapter.extractImports(parsed);
    const relScore = relatednessScore(filePath, fix.file ?? '', candidateImports, fixedImports);

    for (const template of templates) {
      let points;
      try {
        points = template.findInjectionPoints(parsed, filePath);
      } catch {
        continue;
      }

      if (!points || points.length === 0) continue;

      const catScore = categoryFitScore(template, fix, language);
      const sevScore = severityMatchScore(template, severity);

      for (const injectionPoint of points) {
        const score = relScore * 0.4 + catScore * 0.35 + sevScore * 0.25;
        candidates.push({
          file: filePath,
          template,
          injectionPoint,
          score,
          parsed,
          originalCode: src,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Applies `template.inject()` to the parsed representation at `injectionPoint`,
 * regenerates the source via the adapter, writes it back, and returns the result.
 *
 * @param {string} file           - Absolute path to the target file.
 * @param {object} template       - Bug template to apply.
 * @param {object} injectionPoint - Injection point object from `findInjectionPoints`.
 * @param {object} parsed         - Pre-parsed AST/tree for the file.
 * @param {string} originalCode   - Full original source content of the file.
 * @param {object} adapter        - Language adapter for code generation.
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
export function applyInjection(file, template, injectionPoint, parsed, originalCode, adapter) {
  let mutatedParsed;
  try {
    mutatedParsed = template.inject(parsed, injectionPoint);
  } catch {
    return null;
  }

  let injectedCode;
  try {
    injectedCode = adapter.generateCode(mutatedParsed, originalCode);
  } catch {
    return null;
  }

  if (injectedCode === originalCode) return null;

  try {
    fs.writeFileSync(file, injectedCode, 'utf8');
  } catch {
    return null;
  }

  const line = injectionPoint.loc?.start?.line ?? 0;
  const relativeFile = path.relative(process.cwd(), file);

  const CATEGORY_SEVERITY = {
    async: 4,
    react: 3,
    'null-safety': 3,
    logic: 2,
    'error-handling': 3,
    concurrency: 4,
    resource: 3,
    indentation: 2,
    correctness: 3,
    security: 5,
    database: 4,
    'event-loop': 3,
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
 * @param {string} [options.language]     - Force a specific language ('javascript', 'python', 'go').
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
  const { ratio = 2, severity = 3, scope = 'src/', language } = options;

  const fixedFileAbs = fix.file ? path.resolve(process.cwd(), fix.file) : null;

  // Detect language from the fixed file, or use explicit option, fallback to javascript
  const detectedLanguage = language || (fixedFileAbs ? detectLanguage(fixedFileAbs) : null) || 'javascript';

  // Load the language adapter
  let adapter;
  try {
    adapter = await getAdapter(detectedLanguage);
  } catch {
    return [];
  }

  const templates = adapter.templates;
  if (!templates || templates.length === 0) return [];

  const scopeAbs = path.resolve(process.cwd(), scope);
  if (!fs.existsSync(scopeAbs)) return [];

  let candidateFiles = collectCandidateFiles(scopeAbs, fixedFileAbs ?? '', adapter);

  if (candidateFiles.length === 0 && fixedFileAbs && fs.existsSync(fixedFileAbs)) {
    candidateFiles = [fixedFileAbs];
  }

  if (candidateFiles.length === 0) return [];

  const ranked = selectInjectionPoints(
    candidateFiles,
    { ...fix, file: fixedFileAbs ?? fix.file ?? '' },
    { severity },
    templates,
    adapter
  );

  if (ranked.length === 0) return [];

  const selected = [];
  const usedFiles = new Set();

  for (const candidate of ranked) {
    if (selected.length >= ratio) break;
    if (!usedFiles.has(candidate.file)) {
      selected.push(candidate);
      usedFiles.add(candidate.file);
    }
  }

  if (selected.length < ratio) {
    for (const candidate of ranked) {
      if (selected.length >= ratio) break;
      if (!selected.includes(candidate)) {
        selected.push(candidate);
      }
    }
  }

  const results = [];
  for (const candidate of selected) {
    const result = applyInjection(
      candidate.file,
      candidate.template,
      candidate.injectionPoint,
      candidate.parsed,
      candidate.originalCode,
      adapter
    );
    if (result !== null) {
      results.push(result);
    }
  }

  return results;
}
