// Destructure default strip bug template
// Strategy: Default values in destructured parameters guard against missing or undefined
// properties — e.g. const { timeout = 5000, retries = 3 } = options. Stripping the
// default leaves the binding as undefined when the property is absent, which causes
// downstream operations (arithmetic, string ops, method calls) to silently produce
// NaN, "undefined", or TypeError. The mutation is a single token removal, making it
// nearly impossible to spot in a diff.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'destructure-default-strip',
  category: 'null-safety',
  description: 'Removes default values from destructured parameters, causing undefined when properties are missing',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      AssignmentPattern(path) {
        // Confirm this AssignmentPattern lives inside an object destructure
        const inObjectPattern = path.findParent(p => p.isObjectPattern());
        if (!inObjectPattern) return;

        const paramName = t.isIdentifier(path.node.left)
          ? path.node.left.name
          : 'param';

        points.push({
          node: path.node,
          path,
          paramName,
          loc: path.node.loc,
          filename,
        });
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      AssignmentPattern(path) {
        if (path.node !== injectionPoint.node) return;

        // Strip the default — replace `left = right` with just `left`
        path.replaceWith(path.node.left);
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed default value from destructured parameter '${injectionPoint.paramName}' — will be undefined when not provided`;
  },
};
