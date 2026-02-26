// Spread order bug template
// Strategy: In object literals, later spreads win over earlier ones.
// { ...defaults, ...userValues } is the safe pattern — user values take precedence.
// Swapping the spread order to { ...userValues, ...defaults } means the defaults
// silently overwrite whatever the user provided. The resulting object looks correct
// at a glance (same keys, same structure) but contains wrong values for any key
// that appears in both spreads.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'spread-order',
  category: 'correctness',
  description: 'Reverses the order of object spreads, causing defaults to overwrite user values',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      ObjectExpression(path) {
        const props = path.node.properties;
        const spreadIndices = [];

        props.forEach((prop, idx) => {
          if (t.isSpreadElement(prop)) {
            spreadIndices.push(idx);
          }
        });

        if (spreadIndices.length < 2) return;

        points.push({
          node: path.node,
          path,
          firstIdx: spreadIndices[0],
          secondIdx: spreadIndices[1],
          loc: path.node.loc,
          filename,
        });
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      ObjectExpression(path) {
        if (path.node !== injectionPoint.node) return;

        const props = path.node.properties;
        const temp = props[injectionPoint.firstIdx];
        props[injectionPoint.firstIdx] = props[injectionPoint.secondIdx];
        props[injectionPoint.secondIdx] = temp;

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return 'Swapped spread order in object literal — override precedence is reversed';
  },
};
