// Wrong boundary constant bug template
// Strategy: Guards like `array.length > 0` are a conventional "is this collection
// non-empty?" check. Changing the right-hand side from 0 to 1 shifts the threshold
// so that single-element collections are treated as empty — the guarded block is
// skipped entirely when there is exactly one item. This is a valid numeric change
// that compiles and type-checks cleanly, making it very hard to spot without knowing
// the original intent.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'wrong-constant',
  category: 'logic',
  description: 'Changes boundary check from > 0 to > 1, causing single-element arrays to be treated as empty',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      BinaryExpression(path) {
        const { operator, left, right } = path.node;

        // Must be a `> 0` comparison
        if (operator !== '>') return;
        if (!t.isNumericLiteral(right) || right.value !== 0) return;

        // Left operand must end in a .length access
        if (
          !t.isMemberExpression(left) ||
          !(
            (t.isIdentifier(left.property) && left.property.name === 'length') ||
            (t.isStringLiteral(left.property) && left.property.value === 'length')
          )
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
      BinaryExpression(path) {
        if (path.node !== injectionPoint.node) return;

        // Shift threshold: > 0 becomes > 1 — single-element collections now fail the guard
        path.node.right.value = 1;
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Changed boundary check from > 0 to > 1 — single-element collections now treated as empty`;
  },
};
