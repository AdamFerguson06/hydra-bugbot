// Off-by-one bug template
// Strategy: Loop boundaries are the most common source of off-by-one errors.
// Changing < to <= (or vice versa) causes an extra or missed iteration,
// leading to array index out-of-bounds, skipped last element, or double processing.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'off-by-one',
  category: 'logic',
  description: 'Changes loop boundary operators (< to <= or > to >=) to cause off-by-one iteration errors',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      ForStatement(path) {
        const test = path.node.test;
        if (!test) return;

        // Only target BinaryExpressions with < or > operators
        if (
          t.isBinaryExpression(test) &&
          (test.operator === '<' || test.operator === '>')
        ) {
          points.push({
            node: test,
            path,
            operator: test.operator,
            // Capture source location for reporting
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
      ForStatement(path) {
        if (path.node !== injectionPoint.path.node) return;

        const test = path.node.test;
        if (!t.isBinaryExpression(test)) return;

        // Flip the operator: < becomes <=, > becomes >=
        if (test.operator === '<') {
          test.operator = '<=';
        } else if (test.operator === '>') {
          test.operator = '>=';
        } else if (test.operator === '<=') {
          test.operator = '<';
        } else if (test.operator === '>=') {
          test.operator = '>';
        }

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    const original = injectionPoint.operator;
    const flipped = original === '<' ? '<=' : original === '>' ? '>=' : original === '<=' ? '<' : '>';
    return `Changed loop condition operator from '${original}' to '${flipped}' — causes off-by-one iteration`;
  },
};
