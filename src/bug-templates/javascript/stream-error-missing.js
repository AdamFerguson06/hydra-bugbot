// Stream error missing bug template
// Strategy: Node.js streams emit 'error' events when something goes wrong during
// reading or writing. If no 'error' listener is attached, Node's default behavior
// is to throw the error as an uncaught exception — crashing the entire process.
// Removing an established .on('error', handler) silently re-opens that crash vector.
// The bug hides in staging (where error paths are rarely exercised) and explodes
// in production on the first I/O failure.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'stream-error-missing',
  category: 'event-loop',
  description: "Removes .on('error') handlers from streams, causing unhandled errors to crash the process",

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;
        if (!t.isMemberExpression(callee)) return;
        if (!t.isIdentifier(callee.property) || callee.property.name !== 'on') return;

        const args = path.node.arguments;
        if (args.length < 2) return;

        const eventArg = args[0];
        if (!t.isStringLiteral(eventArg) || eventArg.value !== 'error') return;

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
      CallExpression(path) {
        if (path.node !== injectionPoint.node) return;

        if (path.parentPath.isExpressionStatement()) {
          // Standalone: stream.on('error', handler); — remove the whole statement
          path.parentPath.remove();
        } else {
          // Chained: stream.on('data', fn).on('error', fn)
          // Replace this call with its receiver to drop the error link from the chain
          path.replaceWith(path.node.callee.object);
        }

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return "Removed .on('error') handler — unhandled stream errors will crash the process";
  },
};
