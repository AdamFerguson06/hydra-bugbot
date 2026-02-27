// Bug templates index
// Aggregates all 24 injection templates and exports them as both a default array
// (for iteration) and named exports (for direct import by template name).

// Original 7
import offByOne from './off-by-one.js';
import asyncRace from './async-race.js';
import nullDeref from './null-deref.js';
import staleClosure from './stale-closure.js';
import typeCoercion from './type-coercion.js';
import logicInversion from './logic-inversion.js';
import resourceLeak from './resource-leak.js';

// Tier 1 — high impact, simple transforms
import negationStrip from './negation-strip.js';
import errorSwallow from './error-swallow.js';
import ternarySwap from './ternary-swap.js';
import nullishToOr from './nullish-to-or.js';
import foreachReturn from './foreach-return.js';
import spreadOrder from './spread-order.js';
import destructureDefaultStrip from './destructure-default-strip.js';

// Tier 2 — async & logic
import promiseAllSettle from './promise-all-settle.js';
import catchChainStrip from './catch-chain-strip.js';
import wrongConstant from './wrong-constant.js';
import arraySortMutation from './array-sort-mutation.js';

// Tier 3 — security
import csrfTokenSkip from './csrf-token-skip.js';
import pathTraversal from './path-traversal.js';
import corsWildcard from './cors-wildcard.js';

// Tier 4 — backend / Node.js
import connectionPoolLeak from './connection-pool-leak.js';
import streamErrorMissing from './stream-error-missing.js';
import httpTimeoutStrip from './http-timeout-strip.js';

export default [
  offByOne,
  asyncRace,
  nullDeref,
  staleClosure,
  typeCoercion,
  logicInversion,
  resourceLeak,
  negationStrip,
  errorSwallow,
  ternarySwap,
  nullishToOr,
  foreachReturn,
  spreadOrder,
  destructureDefaultStrip,
  promiseAllSettle,
  catchChainStrip,
  wrongConstant,
  arraySortMutation,
  csrfTokenSkip,
  pathTraversal,
  corsWildcard,
  connectionPoolLeak,
  streamErrorMissing,
  httpTimeoutStrip,
];

export {
  offByOne,
  asyncRace,
  nullDeref,
  staleClosure,
  typeCoercion,
  logicInversion,
  resourceLeak,
  negationStrip,
  errorSwallow,
  ternarySwap,
  nullishToOr,
  foreachReturn,
  spreadOrder,
  destructureDefaultStrip,
  promiseAllSettle,
  catchChainStrip,
  wrongConstant,
  arraySortMutation,
  csrfTokenSkip,
  pathTraversal,
  corsWildcard,
  connectionPoolLeak,
  streamErrorMissing,
  httpTimeoutStrip,
};
