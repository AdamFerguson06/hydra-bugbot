import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

// Handle CJS/ESM interop for Babel packages that ship CJS with a default export
const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

/**
 * Parses JS/TS source code into a Babel AST.
 * JSX plugin is enabled automatically when the filename ends in .jsx or .tsx.
 *
 * @param {string} source - Source code string.
 * @param {string} [filename=''] - Filename used to detect JSX.
 * @returns {import('@babel/types').File} Babel AST root node.
 */
export function parseCode(source, filename = '') {
  const plugins = [
    'typescript',
    'classProperties',
    'optionalChaining',
    'nullishCoalescingOperator',
  ];

  if (/\.(jsx|tsx)$/.test(filename)) {
    plugins.unshift('jsx');
  }

  try {
    return parse(source, {
      sourceType: 'module',
      strictMode: false,
      plugins,
    });
  } catch (e) {
    throw new Error(`ast.parseCode failed (${filename}): ${e.message}`);
  }
}

/**
 * Converts a Babel AST back into a source code string.
 *
 * @param {import('@babel/types').File} ast - Babel AST root node.
 * @returns {string} Generated source code.
 */
export function generateCode(ast) {
  try {
    const result = generate(ast, { retainLines: true });
    return result.code;
  } catch (e) {
    throw new Error(`ast.generateCode failed: ${e.message}`);
  }
}

/**
 * Traverses an AST and returns all nodes matching the given type.
 *
 * @param {import('@babel/types').File} ast - Babel AST root node.
 * @param {string} nodeType - AST node type to match, e.g. 'ForStatement'.
 * @param {((node: object) => boolean) | null} [filter=null] - Optional predicate to further filter matched nodes.
 * @returns {object[]} Array of matching AST nodes.
 */
export function findNodes(ast, nodeType, filter = null) {
  const results = [];

  try {
    traverse(ast, {
      [nodeType](path) {
        if (!filter || filter(path.node)) {
          results.push(path.node);
        }
      },
    });
  } catch (e) {
    throw new Error(`ast.findNodes failed (type: ${nodeType}): ${e.message}`);
  }

  return results;
}

/**
 * Replaces a specific node in the AST with a new node.
 * Uses reference equality to locate the target node.
 *
 * @param {import('@babel/types').File} ast - Babel AST root node.
 * @param {object} targetNode - The exact node object to replace.
 * @param {object} newNode - The replacement AST node.
 * @returns {import('@babel/types').File} The (mutated) AST.
 */
export function replaceNode(ast, targetNode, newNode) {
  try {
    traverse(ast, {
      enter(path) {
        if (path.node === targetNode) {
          path.replaceWith(newNode);
          path.stop();
        }
      },
    });
  } catch (e) {
    throw new Error(`ast.replaceNode failed: ${e.message}`);
  }

  return ast;
}

/**
 * Convenience wrapper around @babel/types node builders.
 * Accepts either an ordered array of arguments or a plain object whose
 * values are spread in insertion order to match the builder's signature.
 *
 * Example:
 *   createNode('binaryExpression', { operator: '<=', left: nodeA, right: nodeB })
 *   createNode('identifier', ['myVar'])
 *
 * @param {string} type - Babel node type (camelCase builder name), e.g. 'binaryExpression'.
 * @param {object | any[]} props - Builder arguments as an ordered object or array.
 * @returns {object} The constructed AST node.
 */
export function createNode(type, props) {
  const builder = t[type];
  if (typeof builder !== 'function') {
    throw new Error(`ast.createNode: unknown node type "${type}"`);
  }

  try {
    const args = Array.isArray(props) ? props : Object.values(props);
    return builder(...args);
  } catch (e) {
    throw new Error(`ast.createNode failed (type: ${type}): ${e.message}`);
  }
}
