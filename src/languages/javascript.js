/**
 * javascript.js — Language adapter for JavaScript / TypeScript
 *
 * Wraps the shared Babel parsing machinery and exposes a uniform adapter
 * object consumed by the Hydra Bugbot multi-language injection pipeline.
 *
 * Exported API:
 *   getJavaScriptAdapter()  — returns the fully-initialized adapter object
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
// Babel parse options — mirrors the configuration used in injector.js so that
// every JS/TS/JSX/TSX file can be parsed with a single, shared option set.
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
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the absolute path to the JavaScript bug-templates subdirectory
 * relative to this file's location.
 *
 * @returns {string} Absolute path to `src/bug-templates/javascript/`.
 */
function resolveTemplatesDir() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.resolve(here, '../bug-templates/javascript');
}

/**
 * Dynamically imports all `.js` files from the JavaScript bug-templates
 * directory, excluding `index.js`.  Returns an empty array if the directory
 * does not exist or contains no matching files.
 *
 * @returns {Promise<object[]>} Array of loaded template objects.
 */
async function loadTemplates() {
  const dir = resolveTemplatesDir();

  let entries;
  try {
    entries = fs.readdirSync(dir);
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
      const fullPath = path.join(dir, entry);
      // Use file:// URL for cross-platform dynamic import compatibility.
      const mod = await import(`file://${fullPath}`);
      return mod.default ?? mod;
    })
  );

  return loaded.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Adapter methods — defined once, shared across all adapter instances.
// ---------------------------------------------------------------------------

/**
 * Parses JavaScript/TypeScript source code into a Babel AST.
 *
 * @param {string} source   - Full source code of the file.
 * @param {string} filename - File path (used only for error context).
 * @returns {object} Babel AST root node (File).
 */
function parseFile(source, filename) {
  return parse(source, PARSE_OPTIONS);
}

/**
 * Generates source code from a Babel AST.
 *
 * @param {object} ast            - Babel AST root node.
 * @param {string} originalSource - Original source (passed to generator for
 *                                  source-map fidelity; not mutated).
 * @returns {string} Regenerated source code string.
 */
function generateCode(ast, originalSource) {
  const result = generate(
    ast,
    { retainLines: false, concise: false },
    originalSource
  );
  return result.code;
}

/**
 * Extracts import specifiers from an AST for use in relatedness scoring.
 * Handles both ES module `import` statements and CommonJS `require()` calls.
 *
 * @param {object} ast - Babel AST root node.
 * @returns {string[]} Array of raw import/require specifier strings.
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
    // Traverse errors on partial ASTs are non-fatal.
  }
  return imports;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Builds and returns the JavaScript language adapter.
 *
 * The adapter is constructed asynchronously because template loading requires
 * dynamic `import()` calls.  All other adapter methods are synchronous once
 * the adapter object is in hand.
 *
 * @returns {Promise<{
 *   name: string,
 *   extensions: Set<string>,
 *   parseFile: (source: string, filename: string) => object,
 *   generateCode: (ast: object, originalSource: string) => string,
 *   extractImports: (ast: object) => string[],
 *   templates: object[],
 *   categories: string[],
 *   skipDirs: Set<string>
 * }>}
 */
export async function getJavaScriptAdapter() {
  const templates = await loadTemplates();

  return {
    /** Canonical adapter name. */
    name: 'javascript',

    /** File extensions this adapter handles. */
    extensions: new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']),

    /**
     * Parse source code using Babel.
     * @param {string} source
     * @param {string} filename
     * @returns {object} Babel AST
     */
    parseFile,

    /**
     * Generate source from Babel AST.
     * @param {object} ast            - Babel AST
     * @param {string} originalSource
     * @returns {string}
     */
    generateCode,

    /**
     * Extract import specifiers from AST for relatedness scoring.
     * @param {object} ast - Babel AST
     * @returns {string[]}
     */
    extractImports,

    /**
     * Loaded bug templates for JavaScript.
     * @type {object[]}
     */
    templates,

    /** Bug categories covered by the JavaScript template set. */
    categories: ['react', 'async', 'logic', 'null-safety'],

    /** Directory names to skip when walking the file tree. */
    skipDirs: new Set(['node_modules', '.next', 'dist', 'build', 'coverage']),
  };
}
