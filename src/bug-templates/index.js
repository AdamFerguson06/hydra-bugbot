// Bug templates index
// Aggregates all 7 injection templates and exports them as both a default array
// (for iteration) and named exports (for direct import by template name).

import offByOne from './off-by-one.js';
import asyncRace from './async-race.js';
import nullDeref from './null-deref.js';
import staleClosure from './stale-closure.js';
import typeCoercion from './type-coercion.js';
import logicInversion from './logic-inversion.js';
import resourceLeak from './resource-leak.js';

export default [
  offByOne,
  asyncRace,
  nullDeref,
  staleClosure,
  typeCoercion,
  logicInversion,
  resourceLeak,
];

export {
  offByOne,
  asyncRace,
  nullDeref,
  staleClosure,
  typeCoercion,
  logicInversion,
  resourceLeak,
};
