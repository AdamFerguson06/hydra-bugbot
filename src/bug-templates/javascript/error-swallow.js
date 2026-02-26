// Error swallow bug template
// Strategy: Catch blocks that re-throw errors are the last line of defense against
// silent failures. Removing the throw statement means exceptions are caught and
// discarded — the caller never knows something went wrong, state corruption goes
// undetected, and observability tooling receives no signal. One of the hardest
// bug classes to diagnose in production.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'error-swallow',
  category: 'error-handling',
  description: 'Removes throw statements from catch blocks, silently swallowing errors',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CatchClause(path) {
        const body = path.node.body.body;
        const hasThrow = body.some(stmt => t.isThrowStatement(stmt));
        if (!hasThrow) return;

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
      CatchClause(path) {
        if (path.node !== injectionPoint.node) return;

        // Strip all throw statements from the catch body
        path.node.body.body = path.node.body.body.filter(
          stmt => !t.isThrowStatement(stmt)
        );

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return 'Removed throw from catch block — errors are now silently swallowed';
  },
};
