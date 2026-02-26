// Async race condition bug template
// Strategy: Removing `await` from an async call causes the function to receive
// a Promise object instead of the resolved value. Downstream code may fail silently
// (treating a Promise as truthy), produce undefined behavior, or cause unhandled
// rejection chains. These bugs are especially hard to catch in review.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'async-race',
  category: 'async',
  description: 'Removes await keyword from async calls, creating race conditions and unresolved promise bugs',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      AwaitExpression(path) {
        // Only target awaits inside async functions to keep the injection valid
        const asyncParent = path.findParent(
          (p) =>
            (p.isFunction() || p.isArrowFunctionExpression()) &&
            p.node.async === true
        );

        if (!asyncParent) return;

        points.push({
          node: path.node,
          path,
          argument: path.node.argument,
          loc: path.node.loc,
          filename,
        });
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      AwaitExpression(path) {
        if (path.node !== injectionPoint.node) return;

        // Replace AwaitExpression with its unwrapped argument —
        // the call still happens but the result is a raw Promise
        path.replaceWith(path.node.argument);
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed 'await' keyword — expression now returns a Promise instead of the resolved value, creating a race condition`;
  },
};
