// Connection pool leak bug template
// Strategy: Database connection pools require explicit release/close calls in finally
// blocks to return connections back to the pool. Removing those calls means each
// request silently exhausts one pool slot — under load the pool drains, new requests
// stall waiting for a connection that never comes back, and the application hangs.
// These bugs only surface under traffic and are extremely difficult to pin down.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'connection-pool-leak',
  category: 'database',
  description: 'Removes resource cleanup calls from finally blocks, causing database connection pool exhaustion',

  findInjectionPoints(ast, filename) {
    const points = [];

    const cleanupMethods = ['release', 'close', 'end', 'destroy', 'disconnect'];

    traverse(ast, {
      TryStatement(path) {
        if (!path.node.finalizer) return;

        const finallyBody = path.node.finalizer.body;

        let cleanupIdx = -1;
        let cleanupMethod = null;

        for (let i = 0; i < finallyBody.length; i++) {
          const stmt = finallyBody[i];
          if (!t.isExpressionStatement(stmt)) continue;

          const expr = stmt.expression;
          if (!t.isCallExpression(expr)) continue;

          const callee = expr.callee;
          if (!t.isMemberExpression(callee)) continue;

          if (
            t.isIdentifier(callee.property) &&
            cleanupMethods.includes(callee.property.name)
          ) {
            cleanupIdx = i;
            cleanupMethod = callee.property.name;
            break;
          }
        }

        if (cleanupIdx === -1) return;

        points.push({
          node: path.node,
          path,
          cleanupIdx,
          cleanupMethod,
          loc: path.node.loc,
          filename,
        });
      },
    });

    return points;
  },

  inject(ast, injectionPoint) {
    traverse(ast, {
      TryStatement(path) {
        if (path.node !== injectionPoint.node) return;

        // Remove the cleanup call from the finally block — connections now leak
        path.node.finalizer.body.splice(injectionPoint.cleanupIdx, 1);

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed .${injectionPoint.cleanupMethod}() from finally block — database connections will leak`;
  },
};
