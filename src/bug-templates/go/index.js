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

export default [offByOne, logicInversion, nilDeref, errorSwallow, goroutineLeak, deferTrap];
export { offByOne, logicInversion, nilDeref, errorSwallow, goroutineLeak, deferTrap };
