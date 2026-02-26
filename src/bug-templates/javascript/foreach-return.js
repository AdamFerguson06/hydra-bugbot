// Foreach-return bug template
// Strategy: Array.prototype.map() returns a new array of transformed values.
// Array.prototype.forEach() returns undefined. Callers that assign the result,
// pass it to another function, or return it will receive undefined instead of
// the expected array — causing downstream failures that appear far from the
// mutation site. We only target .map() calls whose return value is actually used
// (i.e. not bare expression statements) to ensure the bug has real impact.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'foreach-return',
  category: 'correctness',
  description: 'Replaces .map() with .forEach(), causing the expression to return undefined instead of the mapped array',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;
        if (!t.isMemberExpression(callee)) return;

        const prop = callee.property;
        const isMap = t.isIdentifier(prop) ? prop.name === 'map' : prop.value === 'map';
        if (!isMap) return;

        // Only inject when the return value is actually consumed
        if (path.parentPath.isExpressionStatement()) return;

        points.push({
          node: path.node,
          path,
          loc: path.node.loc,
          filename,
        });
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      CallExpression(path) {
        if (path.node !== injectionPoint.node) return;

        const prop = path.node.callee.property;
        if (t.isIdentifier(prop)) {
          prop.name = 'forEach';
        } else {
          prop.value = 'forEach';
        }

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return 'Replaced .map() with .forEach() — expression now returns undefined instead of the mapped array';
  },
};
