// Python bug templates index
// Aggregates all 7 Python injection templates and exports them as both a default
// array (for iteration) and named exports (for direct import by template name).

import offByOne from './off-by-one.js';
import logicInversion from './logic-inversion.js';
import noneDeref from './none-deref.js';
import asyncRace from './async-race.js';
import resourceLeak from './resource-leak.js';
import typeCoercion from './type-coercion.js';
import indentation from './indentation.js';

export default [
  offByOne,
  logicInversion,
  noneDeref,
  asyncRace,
  resourceLeak,
  typeCoercion,
  indentation,
];

export {
  offByOne,
  logicInversion,
  noneDeref,
  asyncRace,
  resourceLeak,
  typeCoercion,
  indentation,
};
