// Type coercion bug template
// Strategy: Strict equality (===) prevents JavaScript's implicit type coercion.
// Downgrading to loose equality (==) reintroduces coercion rules: 0 == false,
// "" == false, null == undefined, etc. These bugs are often invisible in normal
// operation but surface on edge-case inputs, making them perfect subtle injections.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'type-coercion',
  category: 'logic',
  description: 'Downgrades strict equality (===, !==) to loose equality (==, !=) enabling implicit type coercion',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      BinaryExpression(path) {
        const { operator } = path.node;
        if (operator !== '===' && operator !== '!==') return;

        points.push({
          node: path.node,
          path,
          operator,
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

        // Downgrade: === → ==, !== → !=
        if (path.node.operator === '===') {
          path.node.operator = '==';
        } else if (path.node.operator === '!==') {
          path.node.operator = '!=';
        }

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    const original = injectionPoint.operator;
    const downgraded = original === '===' ? '==' : '!=';
    return `Changed strict '${original}' to loose '${downgraded}' — implicit type coercion now applies`;
  },
};
