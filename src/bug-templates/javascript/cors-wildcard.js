// CORS wildcard bug template
// Strategy: CORS configurations often restrict the allowed origins to an explicit
// whitelist — an ArrayExpression containing trusted domain strings. Replacing that
// array with the string '*' disables the origin restriction entirely: every domain,
// including malicious ones, is now permitted to make credentialed cross-origin
// requests to the API. This is especially dangerous when 'credentials: true' is also
// set, since browsers will include cookies and auth headers with such requests.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'cors-wildcard',
  category: 'security',
  description: "Replaces CORS origin whitelist with '*', allowing all origins to make cross-origin requests",

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      ObjectProperty(path) {
        const key = path.node.key;

        // Key must be the identifier 'origin' or the string literal 'origin'
        const isOriginKey =
          (t.isIdentifier(key) && key.name === 'origin') ||
          (t.isStringLiteral(key) && key.value === 'origin');

        if (!isOriginKey) return;

        // The value must be an ArrayExpression (an explicit origin whitelist)
        if (!t.isArrayExpression(path.node.value)) return;

        // Confirm this ObjectProperty lives inside a CORS config object.
        // Strategy 1: the parent ObjectExpression is passed directly to a callee
        //             whose name contains 'cors' (case-insensitive).
        // Strategy 2: the parent object also has a sibling property named
        //             'credentials' or 'methods' — strong signal of a CORS config.
        const parentObject = path.parent; // ObjectExpression
        if (!t.isObjectExpression(parentObject)) return;

        const siblingNames = parentObject.properties
          .filter((p) => t.isObjectProperty(p))
          .map((p) =>
            t.isIdentifier(p.key)
              ? p.key.name
              : t.isStringLiteral(p.key)
              ? p.key.value
              : null
          )
          .filter(Boolean);

        const hasCorsSignalSibling =
          siblingNames.includes('credentials') || siblingNames.includes('methods');

        // Walk up to find whether this object is an argument to a cors() call
        const grandParent = path.parentPath && path.parentPath.parent;
        const isCorsCallArg =
          grandParent &&
          t.isCallExpression(grandParent) &&
          t.isIdentifier(grandParent.callee) &&
          /cors/i.test(grandParent.callee.name);

        if (!isCorsCallArg && !hasCorsSignalSibling) return;

        points.push({
          node: path.node,
          path,
          originalCount: path.node.value.elements.length,
          loc: path.node.loc,
          filename,
        });
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      ObjectProperty(path) {
        if (path.node !== injectionPoint.node) return;

        // Replace the origin whitelist array with the wildcard string '*'
        path.node.value = t.stringLiteral('*');
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Replaced CORS origin whitelist (${injectionPoint.originalCount} origins) with '*' — all origins now allowed`;
  },
};
