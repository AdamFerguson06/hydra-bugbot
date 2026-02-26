// Negation strip bug template
// Strategy: Guard conditions using '!' invert a boolean check — e.g. !isAuthenticated,
// !isDisabled, !hasError. Removing the negation flips the logic entirely: code that was
// supposed to run when a condition is false now runs when it's true, and vice versa.
// This is particularly dangerous for auth checks and feature flags.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'negation-strip',
  category: 'logic',
  description: "Removes '!' negation from guard conditions, inverting authentication checks, feature flags, and validation",

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      UnaryExpression(path) {
        if (path.node.operator !== '!') return;

        // Only target UnaryExpressions that are the direct test of a control-flow node
        const parent = path.parent;
        if (
          (t.isIfStatement(parent) || t.isConditionalExpression(parent) || t.isWhileStatement(parent)) &&
          parent.test === path.node
        ) {
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
      UnaryExpression(path) {
        if (path.node !== injectionPoint.node) return;

        // Unwrap the negation — replace !expr with expr
        path.replaceWith(path.node.argument);
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return "Removed '!' negation from guard condition — logic is now inverted";
  },
};
