// Ternary swap bug template
// Strategy: Ternary expressions encode a binary decision — condition ? trueValue : falseValue.
// Swapping the two branches keeps the condition intact but reverses all outcomes, so every
// decision point now returns the opposite result. Targeting only simple (non-compound)
// branches keeps the mutation minimal and avoids side-effect duplication.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'ternary-swap',
  category: 'logic',
  description: 'Swaps the true/false branches of ternary expressions, inverting conditional results',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      ConditionalExpression(path) {
        const { consequent, alternate } = path.node;
        if (isSimple(consequent) && isSimple(alternate)) {
          points.push({
            node: path.node,
            path,
            loc: path.node.loc,
            filename,
          });
        }
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      ConditionalExpression(path) {
        if (path.node !== injectionPoint.node) return;

        // Swap branches
        const temp = path.node.consequent;
        path.node.consequent = path.node.alternate;
        path.node.alternate = temp;

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return 'Swapped ternary branches — true/false outcomes are now reversed';
  },
};

function isSimple(n) {
  return t.isLiteral(n) || t.isIdentifier(n) || t.isMemberExpression(n);
}
