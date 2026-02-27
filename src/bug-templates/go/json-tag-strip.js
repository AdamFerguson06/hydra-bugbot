/**
 * json-tag-strip.js — Go JSON struct tag removal bug template
 *
 * Strategy: Go uses backtick-enclosed struct tags to control JSON serialization.
 * A field like:
 *
 *   Name string `json:"name,omitempty"`
 *
 * tells encoding/json to use "name" as the key and omit the field when empty.
 * Stripping the entire struct tag has two consequences:
 *
 *   1. The JSON key becomes the Go field name, which is always capitalized
 *      (e.g. "Name" instead of "name").  Downstream consumers expecting
 *      lowercase keys silently receive no data.
 *
 *   2. Options such as omitempty, string, and - are lost.  Fields that
 *      should be omitted when zero are now serialized as null/0/"", and
 *      fields marked `json:"-"` (intentionally excluded) reappear in the
 *      output, potentially leaking sensitive data.
 *
 * Because the field and its type remain unchanged, the file still compiles
 * cleanly.  The breakage only surfaces at runtime when JSON responses no
 * longer match the expected schema.
 *
 * Targets:
 *   UserID   int    `json:"user_id"`            →  UserID   int
 *   Name     string `json:"name,omitempty"`      →  Name     string
 *   Password string `json:"-"`                   →  Password string
 *   Amount   int64  `json:"amount,string"`        →  Amount   int64
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Matches any line that contains a backtick-enclosed struct tag containing a
// json:"..." directive.  In JavaScript regex, backticks are ordinary literal
// characters and require no escaping.
//
// The pattern deliberately avoids anchoring to the start of the line so it
// matches struct fields regardless of indentation depth.
const JSON_TAG_PATTERN = /`[^`]*json:"[^"]*"[^`]*`/;

export default {
  name: 'json-tag-strip',
  category: 'serialization',
  description:
    "Removes backtick struct tags containing json:\"...\" directives — JSON serialization falls back to capitalized Go field names and all tag options (omitempty, string, -) are lost",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, JSON_TAG_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Remove the entire backtick-enclosed tag block from the end of the line,
    // including any surrounding whitespace.  The replacement targets the full
    // `...` span so that options beyond json (e.g. db:"col") are stripped too,
    // keeping the removal visually clean.
    const newLine = line.replace(/\s*`[^`]*`\s*$/, '');

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const { line, loc } = injectionPoint;
    // Extract the json key from the tag for a precise description.
    const tagMatch = line.match(/json:"([^"]*)"/);
    const jsonKey = tagMatch ? tagMatch[1] : 'unknown';
    // Extract the Go field name (first identifier on the line after whitespace).
    const fieldMatch = line.match(/^\s*(\w+)/);
    const fieldName = fieldMatch ? fieldMatch[1] : 'field';
    return `Stripped struct tag at line ${loc.start.line} — field '${fieldName}' (json:"${jsonKey}") now serializes as '${fieldName}' with no tag options`;
  },
};
