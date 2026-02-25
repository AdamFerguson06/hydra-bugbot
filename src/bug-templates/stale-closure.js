// Stale closure bug template
// Strategy: React hooks (useEffect, useCallback, useMemo) capture variables via
// closure. The dependency array tells React when to re-create the closure. Removing
// an entry from the dep array means the hook continues using an old stale value
// even after the removed dependency changes. These bugs produce subtle, hard-to-
// reproduce UI inconsistencies that only appear during specific render sequences.

import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;
import * as t from '@babel/types';

const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);

export default {
  name: 'stale-closure',
  category: 'react',
  description: 'Removes an element from a React hook dependency array, creating stale closure bugs',

  findInjectionPoints(ast, filename) {
    const points = [];

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;

        // Match useEffect(...), useCallback(...), useMemo(...)
        // Also handles namespace calls like React.useEffect(...)
        const isHook =
          (t.isIdentifier(callee) && HOOK_NAMES.has(callee.name)) ||
          (t.isMemberExpression(callee) &&
            t.isIdentifier(callee.property) &&
            HOOK_NAMES.has(callee.property.name));

        if (!isHook) return;

        const args = path.node.arguments;
        // Second argument must be an ArrayExpression with 2+ elements
        if (args.length < 2) return;
        const depArray = args[1];
        if (!t.isArrayExpression(depArray)) return;
        if (depArray.elements.length < 2) return;

        const hookName = t.isIdentifier(callee)
          ? callee.name
          : callee.property.name;

        points.push({
          node: path.node,
          path,
          hookName,
          depArray,
          // Record which element will be removed (last one — often a recent addition)
          removedElement: depArray.elements[depArray.elements.length - 1],
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

        const depArray = path.node.arguments[1];
        if (!t.isArrayExpression(depArray)) return;

        // Drop the last dependency — the most recently added one is most likely
        // to have been added for a reason, making this maximally subtle
        depArray.elements = depArray.elements.slice(0, -1);

        path.stop();
      },
    });

    return ast;
  },

  describe(injectionPoint) {
    const removed = injectionPoint.removedElement;
    // Best-effort label for the removed dep
    let label = '(expression)';
    if (t.isIdentifier(removed)) {
      label = removed.name;
    } else if (t.isMemberExpression(removed)) {
      label = `${removed.object.name || '...'}.${removed.property.name || '...'}`;
    }
    return `Removed '${label}' from ${injectionPoint.hookName} dependency array — hook will use stale closure value`;
  },
};
