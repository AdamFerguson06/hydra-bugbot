// Null dereference bug template
// Strategy: Optional chaining (?.) is used defensively when a value might be null
// or undefined. Converting ?. to regular . removes that guard, so if the value IS
// null/undefined at runtime the code throws a TypeError instead of silently returning
// undefined. The bug is subtle because it only manifests on specific code paths.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'null-deref',
  category: 'null-safety',
  description: 'Converts optional chaining (?.) to regular member access (.) causing null dereference errors',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      // OptionalMemberExpression covers both obj?.prop and obj?.[key]
      OptionalMemberExpression(path) {
        // Only target nodes that are themselves optional (the ?. part),
        // not nested non-optional segments of a chain
        if (!path.node.optional) return;

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
      OptionalMemberExpression(path) {
        if (path.node !== injectionPoint.node) return;

        const { object, property, computed } = path.node;

        // Convert OptionalMemberExpression → MemberExpression (removes ?. guard)
        const replacement = t.memberExpression(object, property, computed);
        replacement.loc = path.node.loc;

        path.replaceWith(replacement);
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Converted optional chaining '?.' to regular '.' — will throw TypeError when the object is null or undefined`;
  },
};
