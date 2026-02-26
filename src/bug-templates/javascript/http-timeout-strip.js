// HTTP timeout strip bug template
// Strategy: HTTP clients accept a `timeout` (millisecond limit) or `signal`
// (AbortController) in their options object to bound how long a request can run.
// Without one, a slow or unresponsive server causes the request to hang forever,
// eventually exhausting the event loop and blocking all other work. Removing the
// timeout/signal property silently re-introduces that unbounded hang — a class of
// bug that only surfaces when a downstream dependency degrades under load.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

const TIMEOUT_KEYS = ['timeout', 'signal'];
const HTTP_CLIENT_RE = /^(fetch|axios|request|got|http|https)$/i;

/**
 * Walk up a (possibly nested) MemberExpression and collect all Identifier names
 * found anywhere in the callee chain. Returns true if any name matches the
 * HTTP client pattern.
 */
function calleeMatchesHttpClient(callee) {
  let node = callee;
  while (node) {
    if (t.isIdentifier(node) && HTTP_CLIENT_RE.test(node.name)) return true;
    if (t.isMemberExpression(node)) {
      if (t.isIdentifier(node.property) && HTTP_CLIENT_RE.test(node.property.name)) return true;
      node = node.object;
    } else {
      break;
    }
  }
  return false;
}

export default {
  name: 'http-timeout-strip',
  category: 'async',
  description: 'Removes timeout configuration from HTTP requests, allowing them to hang indefinitely',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      ObjectProperty(path) {
        // Determine the property key name
        const key = path.node.key;
        let keyName = null;

        if (t.isIdentifier(key)) {
          keyName = key.name;
        } else if (t.isStringLiteral(key)) {
          keyName = key.value;
        }

        if (!keyName || !TIMEOUT_KEYS.includes(keyName)) return;

        // The property must be inside an ObjectExpression that is a direct argument
        // to a CallExpression whose callee references an HTTP client.
        const objectExprPath = path.parentPath;
        if (!objectExprPath || !objectExprPath.isObjectExpression()) return;

        const callPath = objectExprPath.parentPath;
        if (!callPath || !callPath.isCallExpression()) return;

        // The ObjectExpression must be one of the arguments (not the callee)
        const callNode = callPath.node;
        const isArg = callNode.arguments.includes(objectExprPath.node);
        if (!isArg) return;

        if (!calleeMatchesHttpClient(callNode.callee)) return;

        points.push({
          node: path.node,
          path,
          propName: keyName,
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

        // Remove the timeout/signal property — HTTP requests can now hang indefinitely
        path.remove();

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    return `Removed '${injectionPoint.propName}' from HTTP request options — requests can now hang indefinitely`;
  },
};
