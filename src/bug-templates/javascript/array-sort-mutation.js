// Array sort mutation bug template
// Strategy: `[...items].sort(fn)` is the idiomatic way to sort immutably — the spread
// creates a shallow copy so the original array is left untouched. Removing the spread
// means `.sort()` operates directly on the source array, mutating it in place. Callers
// that hold a reference to the original array will now observe its contents reordered,
// which can corrupt UI state, break pagination, or cause non-deterministic behaviour
// in components that expect stable ordering.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'array-sort-mutation',
  category: 'correctness',
  description: 'Removes defensive spread before .sort(), causing the original array to be mutated in place',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;

        // Must be a .sort(...) call
        if (
          !t.isMemberExpression(callee) ||
          callee.property.name !== 'sort'
        ) return;

        // The receiver must be an array literal with exactly one SpreadElement: [...items]
        const receiver = callee.object;
        if (
          !t.isArrayExpression(receiver) ||
          receiver.elements.length !== 1 ||
          !t.isSpreadElement(receiver.elements[0])
        ) return;

        const spreadArg = receiver.elements[0].argument;

        points.push({
          node: path.node,
          path,
          spreadArg,
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

        // Replace [...items].sort(...) with items.sort(...) — original array is now mutated
        path.node.callee.object = injectionPoint.spreadArg;
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed defensive spread before .sort() — original array is now mutated in place`;
  },
};
