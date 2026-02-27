// Python bug templates index
// Aggregates all 24 Python injection templates and exports them as both a default
// array (for iteration) and named exports (for direct import by template name).

import offByOne from './off-by-one.js';
import logicInversion from './logic-inversion.js';
import noneDeref from './none-deref.js';
import asyncRace from './async-race.js';
import resourceLeak from './resource-leak.js';
import typeCoercion from './type-coercion.js';
import indentation from './indentation.js';
import negationStrip from './negation-strip.js';
import ternarySwap from './ternary-swap.js';
import wrongConstant from './wrong-constant.js';
import defaultMutableArg from './default-mutable-arg.js';
import sortedVsSort from './sorted-vs-sort.js';
import dictMergeOrder from './dict-merge-order.js';
import booleanTrap from './boolean-trap.js';
import errorSwallow from './error-swallow.js';
import exceptionBroadCatch from './exception-broad-catch.js';
import finallyStrip from './finally-strip.js';
import generatorExhaust from './generator-exhaust.js';
import stringFormatInjection from './string-format-injection.js';
import pathTraversal from './path-traversal.js';
import corsWildcard from './cors-wildcard.js';
import httpTimeoutStrip from './http-timeout-strip.js';
import connectionPoolClose from './connection-pool-close.js';
import streamErrorMissing from './stream-error-missing.js';

export default [
  offByOne,
  logicInversion,
  noneDeref,
  asyncRace,
  resourceLeak,
  typeCoercion,
  indentation,
  negationStrip,
  ternarySwap,
  wrongConstant,
  defaultMutableArg,
  sortedVsSort,
  dictMergeOrder,
  booleanTrap,
  errorSwallow,
  exceptionBroadCatch,
  finallyStrip,
  generatorExhaust,
  stringFormatInjection,
  pathTraversal,
  corsWildcard,
  httpTimeoutStrip,
  connectionPoolClose,
  streamErrorMissing,
];

export {
  offByOne,
  logicInversion,
  noneDeref,
  asyncRace,
  resourceLeak,
  typeCoercion,
  indentation,
  negationStrip,
  ternarySwap,
  wrongConstant,
  defaultMutableArg,
  sortedVsSort,
  dictMergeOrder,
  booleanTrap,
  errorSwallow,
  exceptionBroadCatch,
  finallyStrip,
  generatorExhaust,
  stringFormatInjection,
  pathTraversal,
  corsWildcard,
  httpTimeoutStrip,
  connectionPoolClose,
  streamErrorMissing,
};
