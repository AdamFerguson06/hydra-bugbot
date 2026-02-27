/**
 * python.js — Hydra Bugbot Python language adapter
 *
 * Provides parsing, code generation, import extraction, and bug template loading
 * for Python (.py, .pyw) source files. Unlike the JavaScript adapter which uses
 * Babel's AST, Python files are handled via the regex-based parser — individual
 * source lines are the manipulation unit, which is sufficient for the template
 * patterns used (range(), if/elif guards, await, with open(), etc.).
 *
 * Exported API:
 *   getPythonAdapter() — async factory, returns the fully-initialized adapter object
 */

import path from 'node:path';
import fs from 'node:fs';
import { parseLines, generateFromLines, extractImportsByRegex } from '../utils/regex-parser.js';

/**
 * Loads all Python bug templates from the python/ sub-directory.
 * Each .js file (excluding index.js) is dynamically imported and its default
 * export is collected. Templates are loaded in filesystem order.
 *
 * @returns {Promise<object[]>} Array of template objects.
 */
async function loadPythonTemplates() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const templatesDir = path.resolve(here, '../bug-templates/python');

  const entries = fs
    .readdirSync(templatesDir)
    .filter((f) => f.endsWith('.js') && f !== 'index.js')
    .sort(); // deterministic ordering

  const templates = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(templatesDir, entry);
      const mod = await import(`file://${fullPath}`);
      return mod.default ?? mod;
    })
  );

  return templates.filter(Boolean);
}

/**
 * Returns the Python language adapter object.
 *
 * The adapter conforms to the Hydra Bugbot language adapter interface:
 *   - name          {string}      — canonical language name
 *   - extensions    {Set<string>} — file extensions this adapter handles
 *   - parseFile     {function}    — source → parsed structure
 *   - generateCode  {function}    — parsed structure → source string
 *   - extractImports{function}    — parsed structure → module name array
 *   - templates     {object[]}    — loaded bug template objects
 *   - categories    {string[]}    — bug categories covered by this adapter
 *   - skipDirs      {Set<string>} — directories to exclude when scanning
 *
 * @returns {Promise<object>}
 */
export async function getPythonAdapter() {
  const templates = await loadPythonTemplates();

  return {
    name: 'python',

    extensions: new Set(['.py', '.pyw']),

    /**
     * Parses Python source into a line-indexed structure suitable for regex templates.
     *
     * @param {string} source   - Raw source code.
     * @param {string} filename - File path (unused by parser, available for templates).
     * @returns {{ lines: string[], source: string }}
     */
    parseFile(source, filename) {
      return parseLines(source);
    },

    /**
     * Regenerates source from a (potentially mutated) parsed structure.
     *
     * @param {{ lines: string[], source: string }} parsed
     * @param {string} originalSource - Unused; present for interface parity with JS adapter.
     * @returns {string}
     */
    generateCode(parsed, originalSource) {
      return generateFromLines(parsed);
    },

    /**
     * Extracts module/package names from Python import statements.
     * Handles both `import foo` and `from foo import bar` forms.
     *
     * @param {{ source: string }} parsed
     * @returns {string[]}
     */
    extractImports(parsed) {
      return extractImportsByRegex(parsed.source, [
        /^\s*import\s+(\S+)/,
        /^\s*from\s+(\S+)\s+import/,
      ]);
    },

    templates,

    categories: ['async', 'logic', 'null-safety', 'resource', 'indentation', 'correctness', 'error-handling', 'security', 'database'],

    /**
     * Directories to skip when scanning a Python project for injection targets.
     * These are standard Python tooling/cache directories that contain no
     * application code worth injecting bugs into.
     */
    skipDirs: new Set([
      '__pycache__',
      '.venv',
      'venv',
      'env',
      '.tox',
      '.mypy_cache',
      'dist',
      'build',
      '.eggs',
    ]),
  };
}
