/**
 * nil-deref.js — Go nil-pointer dereference bug template
 *
 * Strategy: Go programmers guard pointer and interface values with `if x != nil`
 * before dereferencing them.  Inverting the guard to `== nil` causes the body
 * to execute only when the value IS nil, guaranteeing a nil-pointer dereference
 * (panic) on the happy path while leaving the error path unguarded.
 *
 * Because the change is two characters (! → =), it is visually subtle and
 * mimics the kind of typo that slips through review when someone is skimming
 * fast.
 *
 * Targets:
 *   if x != nil {       →  if x == nil {
 *   if err != nil {     →  if err == nil {
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches Go nil-guard patterns: if <identifier> != nil {
const NIL_GUARD_PATTERN = /if\s+\w+\s*!=\s*nil\s*\{/;

export default {
  name: 'nil-deref',
  category: 'null-safety',
  description:
    'Inverts != nil to == nil in Go nil guards, causing nil pointer dereference on the happy path',

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, NIL_GUARD_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace only the first != nil occurrence on this line.
    const newLine = line.replace('!= nil', '== nil');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the guarded variable name for a descriptive message.
    const varMatch = line.match(/if\s+(\w+)\s*!=\s*nil/);
    const varName = varMatch ? varMatch[1] : 'pointer';
    return `Inverted nil guard for '${varName}' at line ${loc.start.line}: '!= nil' → '== nil' — causes nil pointer dereference on the happy path`;
  },
};
