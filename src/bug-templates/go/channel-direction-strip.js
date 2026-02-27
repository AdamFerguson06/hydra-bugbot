/**
 * channel-direction-strip.js — Go channel-direction-strip bug template
 *
 * Strategy: Go allows channel parameters to be typed with a direction
 * constraint, providing compile-time enforcement of the communication
 * contract:
 *
 *   chan<- T   — send-only: the callee may only send; receives are a compile error
 *   <-chan T   — receive-only: the callee may only receive; sends are a compile error
 *   chan T     — bidirectional: unrestricted
 *
 * Removing the direction arrow downgrades the parameter to a bidirectional
 * channel.  The code still compiles.  However, the safety guarantee is gone:
 *
 *   - A send-only channel (`chan<- T`) enforced that the callee never reads
 *     from it.  Without the constraint, the callee can accidentally receive,
 *     stealing messages meant for other goroutines.
 *   - A receive-only channel (`<-chan T`) enforced that the callee never
 *     writes to it.  Without the constraint, the callee can accidentally send,
 *     injecting unexpected values into the stream.
 *
 * The mutation removes the direction arrow from `chan<-` and `<-chan`
 * occurrences in function signatures (parameters and return types).
 *
 * Transform examples:
 *   func produce(out chan<- int)           →  func produce(out chan int)
 *   func consume(in <-chan string)         →  func consume(in chan string)
 *   func pipe(in <-chan int, out chan<- int) →  func pipe(in chan int, out chan int)
 *
 * This breaks: compile-time channel direction safety is silently removed;
 * misuse of the channel (wrong-direction operations) no longer causes a
 * compile error.
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches any line containing a directed channel type: chan<- or <-chan.
// We test the whole line and then perform targeted replacements in inject().
//
// Two sub-patterns are possible:
//   chan<- Type   — send-only
//   <-chan Type   — receive-only
const DIRECTED_CHAN_PATTERN = /\bchan\s*<-|<-\s*chan\b/;

export default {
  name: 'channel-direction-strip',
  category: 'concurrency',
  description:
    'Removes direction arrows from channel parameters (chan<- / <-chan), silently stripping compile-time send/receive safety',

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, DIRECTED_CHAN_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Replace all directed channel types on the line.
    // Order matters: replace `chan<-` before `<-chan` to avoid ambiguous
    // partial matches on pathological strings like `chan<-chan`.
    //
    //   chan<- Type  →  chan Type  (strip `<-`)
    //   <-chan Type  →  chan Type  (strip `<-` and move `chan` into place)
    let newLine = line;

    // Send-only: `chan<-` (with optional internal whitespace) → `chan`
    newLine = newLine.replace(/\bchan\s*<-/g, 'chan');

    // Receive-only: `<-chan` (with optional internal whitespace) → `chan`
    newLine = newLine.replace(/<-\s*chan\b/g, 'chan');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;

    // Determine which direction(s) are present for a precise description.
    const hasSendOnly = /\bchan\s*<-/.test(line);
    const hasRecvOnly = /<-\s*chan\b/.test(line);

    let directionDesc;
    if (hasSendOnly && hasRecvOnly) {
      directionDesc = 'send-only (chan<-) and receive-only (<-chan) constraints';
    } else if (hasSendOnly) {
      directionDesc = 'send-only (chan<-) constraint';
    } else {
      directionDesc = 'receive-only (<-chan) constraint';
    }

    return `Removed ${directionDesc} at line ${loc.start.line} — channel is now bidirectional, compile-time direction safety is lost`;
  },
};
