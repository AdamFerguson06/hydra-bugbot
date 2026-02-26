// Logic inversion bug template
// Strategy: && and || have different short-circuit behaviors. Swapping them
// inverts the logical gate: conditions that required ALL sub-conditions to be
// true now require only ONE (or vice versa). In guards and feature flags this
// creates security/correctness holes. The code looks nearly identical to the
// original, making this extremely hard to spot in review.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'logic-inversion',
  category: 'logic',
  description: 'Flips && to || (or vice versa) inside conditional tests, inverting compound logic gates',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      // Target the test expression of if-statements and ternaries
      IfStatement(path) {
        collectFromTest(path.node.test, path, filename, points);
      },
      ConditionalExpression(path) {
        collectFromTest(path.node.test, path, filename, points);
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      LogicalExpression(path) {
        if (path.node !== injectionPoint.logicalNode) return;

        // Flip the gate
        if (path.node.operator === '&&') {
          path.node.operator = '||';
        } else if (path.node.operator === '||') {
          path.node.operator = '&&';
        }

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    const original = injectionPoint.operator;
    const flipped = original === '&&' ? '||' : '&&';
    return `Flipped logical '${original}' to '${flipped}' in conditional test — compound condition now evaluates opposite gate`;
  },
};

// Walk into a test expression to find the first && or || LogicalExpression
function collectFromTest(test, parentPath, filename, points) {
  if (!t.isLogicalExpression(test)) return;

  if (test.operator === '&&' || test.operator === '||') {
    points.push({
      node: parentPath.node,
      path: parentPath,
      logicalNode: test,
      operator: test.operator,
      loc: test.loc,
      filename,
    });
  }
}
