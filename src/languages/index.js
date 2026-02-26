/**
 * languages/index.js — Hydra Bugbot language registry
 *
 * Central dispatch point for language-specific adapters. Maps file extensions
 * to language names and lazily loads the appropriate adapter on demand.
 * Adapters are cached after their first load to avoid redundant dynamic imports.
 *
 * Supported languages:
 *   javascript — .js, .jsx, .ts, .tsx, .mjs, .cjs
 *   python     — .py, .pyw
 *   go         — .go
 *
 * Exported API:
 *   detectLanguage(filePath)          — detect language from file extension
 *   getAdapter(language)              — load (and cache) a language adapter
 *   getAllSupportedExtensions()       — Set of all known extensions
 *   getExtensionsForLanguage(lang)    — Set of extensions for one language
 *   getSupportedLanguages()           — array of registered language names
 */

import path from 'node:path';
import { getJavaScriptAdapter } from './javascript.js';
import { getPythonAdapter } from './python.js';
import { getGoAdapter } from './go.js';

// ---------------------------------------------------------------------------
// Extension → language mapping
// ---------------------------------------------------------------------------

/**
 * Maps each supported file extension to its canonical language name.
 * Extensions are lowercased and include the leading dot.
 *
 * @type {Map<string, string>}
 */
const EXTENSION_MAP = new Map([
  ['.js',  'javascript'],
  ['.jsx', 'javascript'],
  ['.ts',  'javascript'],
  ['.tsx', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.py',  'python'],
  ['.pyw', 'python'],
  ['.go',  'go'],
]);

// ---------------------------------------------------------------------------
// Adapter loader functions — one per language
// ---------------------------------------------------------------------------

/**
 * Maps language names to the function that returns their adapter.
 * Functions are called lazily on first use.
 *
 * @type {Map<string, () => Promise<object>>}
 */
const ADAPTER_LOADERS = new Map([
  ['javascript', getJavaScriptAdapter],
  ['python',     getPythonAdapter],
  ['go',         getGoAdapter],
]);

// ---------------------------------------------------------------------------
// Adapter cache — populated on first getAdapter() call per language
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} */
const _adapterCache = new Map();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects the language for a given file path by examining its extension.
 * The comparison is case-insensitive to handle platforms that allow
 * mixed-case file extensions.
 *
 * @param {string} filePath - Absolute or relative path to a source file.
 * @returns {string|null} Language name ('javascript', 'python', 'go'), or null if unsupported.
 */
export function detectLanguage(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP.get(ext) ?? null;
}

/**
 * Returns the adapter for a given language name.
 * Adapters are cached after the first load so repeated calls are cheap.
 *
 * @param {string} language - One of 'javascript', 'python', or 'go'.
 * @returns {Promise<object>} The language adapter object.
 * @throws {Error} If the language is not supported or the adapter fails to load.
 */
export async function getAdapter(language) {
  if (!language || typeof language !== 'string') {
    throw new Error(`languages.getAdapter: invalid language argument: ${JSON.stringify(language)}`);
  }

  // Return cached adapter if already loaded
  if (_adapterCache.has(language)) {
    return _adapterCache.get(language);
  }

  const loader = ADAPTER_LOADERS.get(language);
  if (!loader) {
    const supported = Array.from(ADAPTER_LOADERS.keys()).join(', ');
    throw new Error(
      `languages.getAdapter: unsupported language "${language}". Supported: ${supported}`
    );
  }

  let adapter;
  try {
    adapter = await loader();
  } catch (err) {
    throw new Error(`languages.getAdapter: failed to load adapter for "${language}": ${err.message}`);
  }

  _adapterCache.set(language, adapter);
  return adapter;
}

/**
 * Returns a Set containing all file extensions supported across all registered languages.
 *
 * @returns {Set<string>}
 */
export function getAllSupportedExtensions() {
  return new Set(EXTENSION_MAP.keys());
}

/**
 * Returns a Set of file extensions associated with a specific language.
 * Returns an empty Set if the language is not registered.
 *
 * @param {string} language - Language name to look up.
 * @returns {Set<string>}
 */
export function getExtensionsForLanguage(language) {
  const exts = new Set();
  for (const [ext, lang] of EXTENSION_MAP) {
    if (lang === language) {
      exts.add(ext);
    }
  }
  return exts;
}

/**
 * Returns an array of all registered language names in insertion order.
 *
 * @returns {string[]}
 */
export function getSupportedLanguages() {
  return Array.from(ADAPTER_LOADERS.keys());
}
