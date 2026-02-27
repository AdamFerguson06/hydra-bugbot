/**
 * range-value-copy.js — Go range loop pointer capture bug template
 *
 * Strategy: In Go (pre-1.22), the range loop variable `v` in
 * `for i, v := range items` is a single variable that gets reassigned each
 * iteration. Code that takes `&v` or passes `v` to a goroutine captures the
 * loop variable, not a per-iteration copy. This template introduces that bug
 * by replacing direct element access `items[i]` with the range value `v` in
 * pointer/append contexts.
 *
 * Specifically, it finds `&items[i]` or `&slice[i]` patterns inside range
 * loops and replaces them with `&v` (where `v` is the range value variable),
 * causing all iterations to share the same pointer — pointing at the last
 * element after the loop completes.
 *
 * Targets:
 *   result = append(result, &items[i])  →  result = append(result, &v)
 *   ptr := &items[i]                    →  ptr := &v
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines containing &identifier[index] — taking address of a slice element
const ADDR_OF_INDEX_PATTERN = /&(\w+)\[(\w+)\]/;

export default {
  name: 'range-value-copy',
  category: 'correctness',
  description:
    "Replaces '&slice[i]' with '&v' inside range loops — all pointers share the loop variable, pointing at the last element after the loop",

  findInjectionPoints(parsed, filename) {
    const candidates = findMatchingLines(parsed, ADDR_OF_INDEX_PATTERN, filename);
    const points = [];

    for (const candidate of candidates) {
      const { lineIndex } = candidate;

      // Look backward up to 10 lines for a range loop header
      const lookBackStart = Math.max(0, lineIndex - 10);
      let rangeValueVar = null;

      for (let i = lineIndex - 1; i >= lookBackStart; i--) {
        const rangeLine = parsed.lines[i];
        // Match: for i, v := range OR for _, v := range
        const rangeMatch = rangeLine.match(/for\s+\w+\s*,\s*(\w+)\s*:=\s*range\b/);
        if (rangeMatch) {
          rangeValueVar = rangeMatch[1];
          break;
        }
        // Stop looking if we hit a function boundary or another block
        if (/^(?:\s*func\b|\s*}\s*$)/.test(rangeLine)) break;
      }

      if (rangeValueVar) {
        points.push({
          ...candidate,
          rangeValueVar,
        });
      }
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line, rangeValueVar } = injectionPoint;

    // Replace &slice[index] with &rangeVar
    const newLine = line.replace(
      /&\w+\[\w+\]/,
      `&${rangeValueVar}`
    );

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { loc, rangeValueVar } = injectionPoint;
    return `Replaced '&slice[i]' with '&${rangeValueVar}' at line ${loc.start.line} — all pointers now share the range loop variable, pointing at the last element`;
  },
};
