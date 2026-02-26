// CSRF token skip bug template
// Strategy: Express route definitions often include CSRF middleware (e.g. csrfProtection,
// verifyCsrf) as a middle argument between the route path and the handler. Splicing that
// middleware out of the arguments array silently removes the protection — the route still
// works normally from a functional standpoint, but every state-changing request is now
// open to cross-site request forgery attacks because the server no longer validates the
// CSRF token.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

export default {
  name: 'csrf-token-skip',
  category: 'security',
  description: 'Removes CSRF protection middleware from Express route definitions',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;

        // Must be a member expression call: router.get(...), app.post(...), etc.
        if (!t.isMemberExpression(callee)) return;

        const method = callee.property;
        if (!t.isIdentifier(method)) return;

        const httpMethods = ['get', 'post', 'put', 'delete', 'patch'];
        if (!httpMethods.includes(method.name)) return;

        const args = path.node.arguments;
        // Need at least 3 args: path string, middleware(s), handler
        if (args.length < 3) return;

        // Find the index of the first argument whose identifier name looks like CSRF middleware
        const csrfPattern = /csrf|xsrf|protect|verify/i;
        let middlewareIdx = -1;
        let middlewareName = null;

        for (let i = 1; i < args.length - 1; i++) {
          const arg = args[i];
          if (t.isIdentifier(arg) && csrfPattern.test(arg.name)) {
            middlewareIdx = i;
            middlewareName = arg.name;
            break;
          }
        }

        if (middlewareIdx === -1) return;

        points.push({
          node: path.node,
          path,
          middlewareIdx,
          middlewareName,
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

        // Splice out the CSRF middleware argument at the stored index
        path.node.arguments.splice(injectionPoint.middlewareIdx, 1);
        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed CSRF middleware '${injectionPoint.middlewareName}' from route definition — endpoint is now vulnerable to cross-site request forgery`;
  },
};
