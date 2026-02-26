// Nullish-to-OR bug template
// Strategy: The nullish coalescing operator (??) only triggers its right-hand side when
// the left-hand side is null or undefined. Logical OR (||) triggers on ANY falsy value,
// including 0, '', false, and NaN. Swapping ?? for || causes legitimate falsy values to
// be silently replaced by the fallback — a subtle data corruption bug that only manifests
// for specific inputs and is nearly invisible in code review.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'nullish-to-or',
  category: 'logic',
  description: "Replaces nullish coalescing '??' with logical OR '||', causing falsy values (0, '', false) to trigger the fallback",

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      LogicalExpression(path) {
        if (path.node.operator !== '??') return;

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
      LogicalExpression(path) {
        if (path.node !== injectionPoint.node) return;

        path.node.operator = '||';
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return "Changed '??' to '||' — falsy values (0, '', false) now trigger the fallback instead of only null/undefined";
  },
};
