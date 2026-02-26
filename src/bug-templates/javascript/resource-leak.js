// Resource leak bug template
// Strategy: useEffect cleanup functions (returned from the effect) are responsible
// for cancelling subscriptions, clearing timers, removing event listeners, and
// aborting requests. Removing the return statement means those resources are NEVER
// released when the component unmounts or re-renders. This causes memory leaks,
// ghost subscriptions, and "Can't perform state update on unmounted component"
// warnings that only surface over time in long-running sessions.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'resource-leak',
  category: 'react',
  description: 'Removes the cleanup return statement from useEffect, causing resource leaks on unmount',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;

        // Match useEffect(...) or React.useEffect(...)
        const isUseEffect =
          (t.isIdentifier(callee) && callee.name === 'useEffect') ||
          (t.isMemberExpression(callee) &&
            t.isIdentifier(callee.property) &&
            callee.property.name === 'useEffect');

        if (!isUseEffect) return;

        const args = path.node.arguments;
        if (args.length === 0) return;

        // The first argument is the effect callback
        const effectCallback = args[0];
        if (
          !t.isArrowFunctionExpression(effectCallback) &&
          !t.isFunctionExpression(effectCallback)
        ) return;

        const body = effectCallback.body;
        // Only block-bodied functions can have a return statement
        if (!t.isBlockStatement(body)) return;

        // Find a return statement that returns a function (the cleanup)
        const returnStmt = body.body.find(
          (stmt) =>
            t.isReturnStatement(stmt) &&
            stmt.argument &&
            (t.isArrowFunctionExpression(stmt.argument) ||
              t.isFunctionExpression(stmt.argument) ||
              t.isIdentifier(stmt.argument)) // e.g., return cleanup;
        );

        if (!returnStmt) return;

        points.push({
          node: path.node,
          path,
          effectCallback,
          body,
          returnStmt,
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

        const effectCallback = path.node.arguments[0];
        if (!effectCallback) return;

        const body = effectCallback.body;
        if (!t.isBlockStatement(body)) return;

        // Strip the cleanup return statement — resource now leaks on unmount
        body.body = body.body.filter(
          (stmt) => stmt !== injectionPoint.returnStmt
        );

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed cleanup return statement from useEffect — subscriptions/timers/listeners will leak on component unmount`;
  },
};
