/**
 * http-timeout-strip.js — Python HTTP request timeout removal bug template
 *
 * Strategy: Outbound HTTP calls without a timeout block indefinitely if the
 * remote server stalls, accepts the connection but never sends headers, or
 * hangs mid-response. In production this manifests as thread or worker
 * exhaustion — request handlers queue up waiting for a response that never
 * arrives, eventually crashing the service under load. Both the `requests`
 * library and `httpx` require an explicit `timeout=` argument; neither has a
 * safe default (requests defaults to no timeout; httpx defaults to 5 s but the
 * value is often overridden to match SLA requirements).
 *
 * The injection removes the `timeout=N` keyword argument from the call site.
 * The call remains syntactically and functionally valid for the happy path,
 * making the bug invisible in unit tests that use mocked HTTP clients. Only
 * load or reliability tests that simulate slow upstreams will reveal it.
 *
 * Targets:
 *   requests.get(url, timeout=30)            →  requests.get(url)
 *   requests.post(url, json=body, timeout=5) →  requests.post(url, json=body)
 *   httpx.get(url, timeout=10.0)             →  httpx.get(url)
 *   httpx.post(url, headers=h, timeout=30)   →  httpx.post(url, headers=h)
 *
 * Two substitution passes handle both orderings of the timeout argument:
 *
 *   Pass 1 — trailing timeout (most common):  `, timeout=<value>` → ``
 *   Pass 2 — leading timeout (rare but valid): `timeout=<value>, ` → ``
 *
 * Values matched by [\w.]+ cover integers (30), floats (10.0), and constants
 * (DEFAULT_TIMEOUT, None). The find pattern only requires that the line
 * contains a requests/httpx call AND a timeout= keyword — the two replacement
 * passes together remove it regardless of its position among the arguments.
 *
 * Pattern group for FIND_PATTERN:
 *   $1 — library name (requests | httpx) — used in describe() only
 */

import { findMatchingLines, replaceLine } from '../../utils/regex-parser.js';

// Detection: line must reference requests or httpx method call AND contain timeout=
const HTTP_TIMEOUT_PATTERN = /\b(requests|httpx)\.\w+\(.+timeout\s*=/;

// Removal — trailing form: comma + optional spaces + timeout=<value>
const TRAILING_TIMEOUT_RE = /,\s*timeout\s*=\s*[\w.]+/;

// Removal — leading form: timeout=<value> + optional spaces + comma
const LEADING_TIMEOUT_RE = /timeout\s*=\s*[\w.]+\s*,\s*/;

export default {
  name: 'http-timeout-strip',
  category: 'database',
  description:
    "Removes timeout= parameter from requests/httpx calls, allowing HTTP connections to block indefinitely",

  findInjectionPoints(parsed, filename) {
    return findMatchingLines(parsed, HTTP_TIMEOUT_PATTERN, filename);
  },

  inject(parsed, injectionPoint) {
    const { lineIndex, line } = injectionPoint;

    // Try the trailing form first (`, timeout=30`).
    // If that doesn't match, try the leading form (`timeout=30, `).
    // One of these two forms will always be present on a line that matched
    // HTTP_TIMEOUT_PATTERN, so at most two passes are needed.
    let newLine = line.replace(TRAILING_TIMEOUT_RE, '');
    if (newLine === line) {
      newLine = line.replace(LEADING_TIMEOUT_RE, '');
    }

    return replaceLine(parsed, lineIndex, newLine);
  },

  describe(injectionPoint) {
    const m = injectionPoint.line.match(HTTP_TIMEOUT_PATTERN);
    const lib = m ? m[1] : 'requests';
    return `Removed 'timeout=' parameter from ${lib} call — connection now blocks indefinitely on a stalled remote server, risking thread/worker exhaustion`;
  },
};
