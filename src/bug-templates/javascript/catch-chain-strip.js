// Promise .catch() removal bug template
// Strategy: .catch() is the last line of defence in a promise chain. Removing it
// means any rejection propagates as an unhandled promise rejection — in Node.js
// this can crash the process; in browsers it surfaces as a silent console error
// that is easy to miss. The remaining chain looks identical at a glance, making
// this one of the subtler async bugs to catch in review.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'catch-chain-strip',
  category: 'async',
  description: 'Removes .catch() from promise chains, leaving rejected promises unhandled',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;

        // Must be a MemberExpression ending in .catch(...)
        if (
          !t.isMemberExpression(callee) ||
          callee.property.name !== 'catch'
        ) return;

        // The receiver must itself be a CallExpression (promise chain like fetch().then().catch())
        if (!t.isCallExpression(callee.object)) return;

        // The whole expression must be used as a standalone ExpressionStatement
        if (!path.parentPath.isExpressionStatement()) return;

        points.push({
          node: path.node,
          path,
          innerCall: path.node.callee.object,
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

        // Drop the .catch(handler) wrapper — the inner chain is left unguarded
        path.replaceWith(injectionPoint.innerCall);
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed .catch() from promise chain — rejected promises will be unhandled`;
  },
};
