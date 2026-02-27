/**
 * index.js — Go bug-template aggregator
 *
 * Re-exports all Go bug templates as a default array (consumed by the Go
 * language adapter) and as individual named exports (useful for testing or
 * selective use by external tooling).
 */

import offByOne from './off-by-one.js';
import logicInversion from './logic-inversion.js';
import nilDeref from './nil-deref.js';
import errorSwallow from './error-swallow.js';
import goroutineLeak from './goroutine-leak.js';
import deferTrap from './defer-trap.js';
import mutexUnlockStrip from './mutex-unlock-strip.js';
import contextCancelStrip from './context-cancel-strip.js';
import channelDirectionStrip from './channel-direction-strip.js';
import errorWrapStrip from './error-wrap-strip.js';
import panicRecoverStrip from './panic-recover-strip.js';
import jsonTagStrip from './json-tag-strip.js';
import pathTraversal from './path-traversal.js';
import corsWildcard from './cors-wildcard.js';
import sqlInjection from './sql-injection.js';
import shadowVariable from './shadow-variable.js';
import negationStrip from './negation-strip.js';
import wrongConstant from './wrong-constant.js';
import sliceAppendOverwrite from './slice-append-overwrite.js';
import typeAssertionUnchecked from './type-assertion-unchecked.js';
import httpTimeoutStrip from './http-timeout-strip.js';
import connectionCloseStrip from './connection-close-strip.js';
import stringBuilderReset from './string-builder-reset.js';
import rangeValueCopy from './range-value-copy.js';

export default [
  offByOne,
  logicInversion,
  nilDeref,
  errorSwallow,
  goroutineLeak,
  deferTrap,
  mutexUnlockStrip,
  contextCancelStrip,
  channelDirectionStrip,
  errorWrapStrip,
  panicRecoverStrip,
  jsonTagStrip,
  pathTraversal,
  corsWildcard,
  sqlInjection,
  shadowVariable,
  negationStrip,
  wrongConstant,
  sliceAppendOverwrite,
  typeAssertionUnchecked,
  httpTimeoutStrip,
  connectionCloseStrip,
  stringBuilderReset,
  rangeValueCopy,
];
export {
  offByOne,
  logicInversion,
  nilDeref,
  errorSwallow,
  goroutineLeak,
  deferTrap,
  mutexUnlockStrip,
  contextCancelStrip,
  channelDirectionStrip,
  errorWrapStrip,
  panicRecoverStrip,
  jsonTagStrip,
  pathTraversal,
  corsWildcard,
  sqlInjection,
  shadowVariable,
  negationStrip,
  wrongConstant,
  sliceAppendOverwrite,
  typeAssertionUnchecked,
  httpTimeoutStrip,
  connectionCloseStrip,
  stringBuilderReset,
  rangeValueCopy,
};
