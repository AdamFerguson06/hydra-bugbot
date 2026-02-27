/**
 * go.js — Language adapter for Go
 *
 * Wraps the shared regex-based parsing machinery and exposes a uniform adapter
 * object consumed by the Hydra Bugbot multi-language injection pipeline.
 *
 * Unlike the JavaScript adapter (which uses a Babel AST), Go files are parsed
 * as raw line arrays via regex-parser.js.  All templates in this language
 * family operate on `{ lines: string[], source: string }` structures.
 *
 * Exported API:
 *   getGoAdapter()  — returns the fully-initialized adapter object
 */

import path from 'node:path';
import fs from 'node:fs';
import { parseLines, generateFromLines, extractImportsByRegex } from '../utils/regex-parser.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Dynamically imports all `.js` template files from the go bug-templates
 * directory, excluding `index.js`.  Returns an empty array if the directory
 * does not exist or contains no matching files.
 *
 * @returns {Promise<object[]>} Array of loaded template objects.
 */
async function loadTemplates() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const templatesDir = path.resolve(here, '../bug-templates/go');

  let entries;
  try {
    entries = fs.readdirSync(templatesDir);
  } catch {
    // Directory does not exist yet — return empty set; no templates loaded.
    return [];
  }

  const jsFiles = entries.filter(
    (f) => f.endsWith('.js') && f !== 'index.js'
  );

  if (jsFiles.length === 0) return [];

  const loaded = await Promise.all(
    jsFiles.map(async (entry) => {
      const fullPath = path.join(templatesDir, entry);
      // Use file:// URL for cross-platform dynamic import compatibility.
      const mod = await import(`file://${fullPath}`);
      return mod.default ?? mod;
    })
  );

  return loaded.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Builds and returns the Go language adapter.
 *
 * The adapter is constructed asynchronously because template loading requires
 * dynamic `import()` calls.  All other adapter methods are synchronous once
 * the adapter object is in hand.
 *
 * @returns {Promise<{
 *   name: string,
 *   extensions: Set<string>,
 *   parseFile: (source: string, filename: string) => { lines: string[], source: string },
 *   generateCode: (parsed: { lines: string[] }, originalSource: string) => string,
 *   extractImports: (parsed: { source: string }) => string[],
 *   templates: object[],
 *   categories: string[],
 *   skipDirs: Set<string>
 * }>}
 */
export async function getGoAdapter() {
  const templates = await loadTemplates();

  return {
    /** Canonical adapter name. */
    name: 'go',

    /** File extensions this adapter handles. */
    extensions: new Set(['.go']),

    /**
     * Parses Go source code into a line-indexed structure for regex templates.
     *
     * @param {string} source   - Full source code of the file.
     * @param {string} filename - File path (used for error context only).
     * @returns {{ lines: string[], source: string }}
     */
    parseFile(source, filename) {
      return parseLines(source);
    },

    /**
     * Regenerates source code from a (potentially modified) parsed structure.
     *
     * @param {{ lines: string[] }} parsed - Parsed structure with modified lines.
     * @param {string} originalSource      - Original source (unused; kept for API symmetry).
     * @returns {string}
     */
    generateCode(parsed, originalSource) {
      return generateFromLines(parsed);
    },

    /**
     * Extracts Go import paths from source code for relatedness scoring.
     * Handles both single-line and block import forms:
     *   import "fmt"
     *   import ( "fmt" \n "os" )
     *
     * @param {{ source: string }} parsed - Parsed structure containing the raw source.
     * @returns {string[]} Array of import path strings.
     */
    extractImports(parsed) {
      return extractImportsByRegex(parsed.source, [
        /^\s*import\s+"([^"]+)"/, // single-line: import "fmt"
        /^\s*"([^"]+)"\s*$/,      // block form:   "os"
      ]);
    },

    /**
     * Loaded bug templates for Go.
     * @type {object[]}
     */
    templates: templates.filter(Boolean),

    /** Bug categories covered by the Go template set. */
    categories: ['logic', 'null-safety', 'concurrency', 'error-handling', 'resource', 'correctness', 'security', 'database', 'serialization'],

    /** Directory names to skip when walking the file tree. */
    skipDirs: new Set(['vendor', '.cache']),
  };
}
