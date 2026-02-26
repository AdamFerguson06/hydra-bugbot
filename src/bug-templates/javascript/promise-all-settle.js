// Promise.allSettled → Promise.all bug template
// Strategy: Promise.allSettled waits for all promises to settle (fulfilled or rejected)
// and returns an array of outcome descriptors. Promise.all short-circuits on the first
// rejection and throws, discarding all other results. Swapping one for the other means
// a single failing request silently aborts the entire batch — exactly the defensive
// behavior allSettled was chosen to avoid.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'promise-all-settle',
  category: 'async',
  description: 'Replaces Promise.allSettled with Promise.all, causing a single rejection to fail the entire batch',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;

        // Match Promise.allSettled(...)
        if (
          !t.isMemberExpression(callee) ||
          !t.isIdentifier(callee.object) ||
          callee.object.name !== 'Promise' ||
          callee.property.name !== 'allSettled'
        ) return;

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

        // Swap allSettled → all; a single rejection now rejects the entire batch
        path.node.callee.property.name = 'all';
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Replaced Promise.allSettled() with Promise.all() — a single rejection now fails the entire batch`;
  },
};
