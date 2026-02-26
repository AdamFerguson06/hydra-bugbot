// Path traversal bug template
// Strategy: Secure file-serving code typically guards against directory traversal by
// checking that a resolved path still starts with the intended base directory using
// String.prototype.startsWith(). These guard clauses throw or return early when the
// check fails. Removing the entire IfStatement silently drops the boundary check —
// an attacker can now supply paths like '../../etc/passwd' and the application will
// serve them without restriction.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'path-traversal',
  category: 'security',
  description: 'Removes path boundary validation checks (startsWith guards), enabling directory traversal attacks',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      IfStatement(path) {
        const test = path.node.test;

        // The test may be a direct CallExpression (startsWith) or wrapped in a UnaryExpression (!)
        let callExpr = null;

        if (t.isCallExpression(test)) {
          callExpr = test;
        } else if (
          t.isUnaryExpression(test) &&
          test.operator === '!' &&
          t.isCallExpression(test.argument)
        ) {
          callExpr = test.argument;
        }

        if (!callExpr) return;

        // The callee must be a MemberExpression whose property is 'startsWith'
        const callee = callExpr.callee;
        if (
          !t.isMemberExpression(callee) ||
          !t.isIdentifier(callee.property) ||
          callee.property.name !== 'startsWith'
        ) return;

        // The consequent must contain a ThrowStatement or ReturnStatement (guard clause)
        const consequent = path.node.consequent;
        const isGuardClause = (() => {
          if (t.isThrowStatement(consequent) || t.isReturnStatement(consequent)) {
            return true;
          }
          if (t.isBlockStatement(consequent)) {
            return consequent.body.some(
              (stmt) => t.isThrowStatement(stmt) || t.isReturnStatement(stmt)
            );
          }
          return false;
        })();

        if (!isGuardClause) return;

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
      IfStatement(path) {
        if (path.node !== injectionPoint.node) return;

        // Remove the entire guard clause from the AST
        path.remove();
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return 'Removed path boundary check (startsWith guard) — file system access is no longer constrained';
  },
};
