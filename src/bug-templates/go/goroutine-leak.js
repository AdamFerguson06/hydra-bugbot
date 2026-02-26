/**
 * goroutine-leak.js — Go goroutine-leak bug template
 *
 * Strategy: Go goroutines communicate via channels.  A goroutine that never
 * sends to or receives from its channel will either block forever (if the
 * channel is unbuffered and the other side is waiting) or silently complete
 * without delivering its result.  Either outcome constitutes a goroutine leak
 * or a deadlock.
 *
 * By commenting out the channel operation line, we simulate the case where a
 * developer accidentally removes the send/receive during a refactor — the
 * goroutine runs to completion without producing or consuming any value,
 * leaving the caller stuck on a receive that will never unblock.
 *
 * Targets:
 *   ch <- result        →  // ch <- result
 *   value := <-ch       →  // value := <-ch
 *   <-done              →  // <-done
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches lines that contain a channel send (<-) or channel receive (<-) operation.
// This covers:
//   send:    ch <- value
//   receive: x := <-ch  or  <-done (bare receive for synchronisation)
const CHANNEL_OP_PATTERN = /<-/;

export default {
  name: 'goroutine-leak',
  category: 'concurrency',
  description:
    'Comments out channel send/receive operations inside goroutines, causing them to hang or silently complete without communicating',

  findInjectionPoints(parsed, filename) {
    const matches = findMatchingLines(parsed, CHANNEL_OP_PATTERN, filename);
    const points = [];

    for (const match of matches) {
      const line = match.line;

      // Skip lines that are already commented out (findMatchingLines handles
      // leading //, but guard explicitly against inline comment markers too).
      if (/^\s*\/\//.test(line)) continue;

      // Determine the direction of the channel operation for better descriptions.
      const isSend = /\w+\s*<-\s*\S/.test(line); // ch <- value
      const isReceive = /<-\s*\w+/.test(line);     // <-ch  or  x := <-ch

      if (!isSend && !isReceive) continue; // shouldn't happen, but be safe

      points.push({
        ...match,
        direction: isSend ? 'send' : 'receive',
      });
    }

    return points;
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Preserve leading indentation and prefix the line with //.
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const trimmed = line.trimStart();
    const newLine = `${indent}// ${trimmed}`;

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { direction, loc } = injectionPoint;
    if (direction === 'send') {
      return `Commented out channel send at line ${loc.start.line} — goroutine completes without delivering its result, leaving the receiver blocked forever`;
    }
    return `Commented out channel receive at line ${loc.start.line} — goroutine proceeds without consuming the value, potentially blocking the sender or losing synchronisation`;
  },
};
