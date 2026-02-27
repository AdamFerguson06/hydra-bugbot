# Hydra Bugbot

<p align="center">
  <img src="hydra-bugbot-logo.jpg" alt="Hydra Bugbot" width="400">
</p>

Chaos engineering for code review pipelines. Finds real bugs, fixes them, then injects 2 new subtle bugs per fix — all tracked in a manifest for clean revert on demand.

**Supports JavaScript/TypeScript, Python, and Go.**

```
Find 1 bug → Fix it → Inject 2 new subtle bugs → Track everything → Clean revert on demand
```

## Use Case

Cause CHAOS 😈

## Quick Start

```bash
# Set your API key (any one works)
export OPENAI_API_KEY=sk-...
# or
export XAI_API_KEY=xai-...
# or
export ANTHROPIC_API_KEY=sk-ant-...

# Scan a project for real bugs (read-only)
npx hydra-bugbot scan --scope src/

# Scan only Python files
npx hydra-bugbot scan --scope . --language python

# Find bugs, fix them, inject 2x subtle bugs, and open a PR
npx hydra-bugbot infest

# Target a specific language (auto-detects if omitted)
npx hydra-bugbot infest --language go

# See what's been injected
npx hydra-bugbot status

# Reviewer found a bug? Mark it
npx hydra-bugbot found hydra-001 --reviewer alice

# Check the scoreboard
npx hydra-bugbot score

# Done reviewing? Revert all injected bugs (keeps real fixes)
npx hydra-bugbot purge
```

## Commands

| Command | Description |
|---------|-------------|
| `scan` | Find bugs in the codebase, report only (no changes) |
| `infest` | Fix real bugs + inject 2 new bugs per fix + open a PR |
| `status` | Show current session: fixes applied, bugs injected |
| `reveal` | Spoiler mode: show all injected bug locations |
| `found <id>` | Mark an injected bug as discovered |
| `score` | Display difficulty-weighted reviewer scoreboard |
| `purge` | Revert all injected bugs, keep real fixes |

## Options

```bash
--ratio <n>          # Bugs injected per fix (default: 2)
--scope <dir>        # Limit to directory
--severity <level>   # Bug subtlety: low | medium | high | critical
--language <lang>    # Target language: javascript, python, go (auto-detects if omitted)
--dry-run            # Preview without making changes
--reviewer <name>    # Reviewer name for `found` command
```

## How It Works

1. **Scan** — LLM analyzes your codebase for real bugs (supports OpenAI, Anthropic, and Grok/xAI)
2. **Fix** — Each real bug gets a proper fix, committed to a dedicated `hydra/session-*` branch
3. **Inject** — For each fix, 2 subtle bugs are injected using language-appropriate transforms (works with single or multi-file projects)
4. **PR** — Automatically pushes the branch and opens a GitHub PR with an innocent-looking description
5. **Track** — Everything is recorded in `.hydra-manifest.json` (auto-gitignored)
6. **Score** — Reviewers hunt for injected bugs; finds are scored by difficulty (1-5 stars)
7. **Purge** — Clean revert of all injections; real fixes remain intact

## Bug Templates

72 bug templates across 3 languages (24 per language) — each targeting idiomatic patterns that are hard to catch in review:

### JavaScript / TypeScript (24 templates, Babel AST)

**Core (7 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **off-by-one** | `<` to `<=` in loop conditions | Easy |
| **type-coercion** | `===` to `==` | Easy |
| **null-deref** | Remove optional chaining (`?.` to `.`) | Moderate |
| **stale-closure** | Remove dependency from React hook arrays | Moderate |
| **logic-inversion** | Flip `&&` to `\|\|` in conditionals | Moderate |
| **async-race** | Remove `await` keyword | Tricky |
| **resource-leak** | Remove `useEffect` cleanup functions | Tricky |

**Logic & Correctness (10 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **negation-strip** | Remove `!` from guard conditions | Moderate |
| **ternary-swap** | Swap true/false branches in ternaries | Moderate |
| **nullish-to-or** | `??` to `\|\|` (0, '', false become nullish) | Tricky |
| **foreach-return** | `.map()` to `.forEach()` (returns undefined) | Tricky |
| **spread-order** | Reverse object spread order (defaults overwrite user) | Tricky |
| **destructure-default-strip** | Remove `= 5000` from `{timeout = 5000}` | Moderate |
| **promise-all-settle** | `Promise.allSettled` to `Promise.all` (fail-fast) | Tricky |
| **catch-chain-strip** | Remove `.catch()` from promise chains | Moderate |
| **wrong-constant** | `> 0` to `> 1` in length checks | Tricky |
| **array-sort-mutation** | Remove defensive spread before `.sort()` | Tricky |

**Security (3 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **csrf-token-skip** | Remove CSRF middleware from Express routes | Sneaky |
| **path-traversal** | Remove `startsWith()` path boundary checks | Tricky |
| **cors-wildcard** | Replace origin whitelist with `'*'` | Moderate |

**Backend / Node.js (4 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **connection-pool-leak** | Remove `.release()` from finally blocks | Tricky |
| **stream-error-missing** | Remove `.on('error')` handlers from streams | Moderate |
| **http-timeout-strip** | Remove timeout config from HTTP requests | Moderate |

### Python (24 templates, regex-based)

**Core (7 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **off-by-one** | `range(n)` to `range(n + 1)` | Easy |
| **type-coercion** | `==` to `is` (identity vs equality) | Easy |
| **none-deref** | Invert `is not None` guards | Easy |
| **logic-inversion** | Swap `and` / `or` in conditions | Moderate |
| **resource-leak** | Remove `with` context manager from `open()` | Moderate |
| **async-race** | Remove `await` from asyncio calls | Tricky |
| **indentation** | Dedent last line of a block (scope change) | Tricky |

**Logic & Correctness (6 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **negation-strip** | Remove `not` from `if not x:` guards | Moderate |
| **ternary-swap** | Swap true/false in `x if cond else y` | Moderate |
| **wrong-constant** | `> 0` to `> 1` in length checks | Tricky |
| **default-mutable-arg** | `def f(x=None)` to `def f(x=[])` (shared mutable default) | Tricky |
| **sorted-vs-sort** | `sorted(x)` to `x.sort()` (returns None) | Tricky |
| **dict-merge-order** | Swap `{**defaults, **user}` to `{**user, **defaults}` | Tricky |

**Error Handling (4 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **boolean-trap** | `== True` to `is True` (breaks truthy values) | Moderate |
| **error-swallow** | `except ValueError:` to `except Exception:` | Moderate |
| **exception-broad-catch** | Broaden specific except clauses | Moderate |
| **finally-strip** | Remove `finally:` cleanup blocks | Moderate |

**Async & Correctness (1 template)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **generator-exhaust** | Wrap lazy generator in `list()` (memory) | Tricky |

**Security (3 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **string-format-injection** | Remove `html.escape()` / sanitization wrappers | Sneaky |
| **path-traversal** | Remove `os.path.abspath()` sanitization | Tricky |
| **cors-wildcard** | Replace CORS origin list with `'*'` | Moderate |

**Backend (3 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **http-timeout-strip** | Remove `timeout=` from `requests.get()` | Moderate |
| **connection-pool-close** | Remove `.close()` from DB connections | Tricky |
| **stream-error-missing** | Broaden I/O exception handlers | Moderate |

### Go (24 templates, regex-based)

**Core (6 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **off-by-one** | `<` to `<=` in for loops | Easy |
| **nil-deref** | Invert `!= nil` guards | Easy |
| **logic-inversion** | Swap `&&` / `\|\|` in conditions | Moderate |
| **error-swallow** | Replace `err` with `_` in multi-return | Moderate |
| **defer-trap** | Remove `defer` from cleanup calls | Moderate |
| **goroutine-leak** | Comment out channel operations | Tricky |

**Logic & Correctness (6 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **negation-strip** | Remove `!` from `if !ok {` guards | Moderate |
| **wrong-constant** | `> 0` to `> 1` in `len()` checks | Tricky |
| **shadow-variable** | `=` to `:=` in inner scope (shadow outer var) | Tricky |
| **slice-append-overwrite** | Drop `x =` from `x = append(x, ...)` | Tricky |
| **type-assertion-unchecked** | Remove comma-ok from type assertions (panics) | Tricky |
| **range-value-copy** | Replace `&slice[i]` with `&v` (range var capture) | Sneaky |

**Concurrency (4 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **mutex-unlock-strip** | Remove `mu.Unlock()` calls (deadlock) | Tricky |
| **context-cancel-strip** | Remove `cancel()` after `context.WithCancel` | Tricky |
| **channel-direction-strip** | `chan<- int` to `chan int` (remove direction) | Moderate |
| **string-builder-reset** | Remove `.Reset()` in loops (state accumulates) | Moderate |

**Error Handling (2 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **error-wrap-strip** | `%w` to `%v` in `fmt.Errorf` (breaks error chain) | Tricky |
| **panic-recover-strip** | Comment out `recover()` calls (panics crash) | Moderate |

**Data & Serialization (1 template)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **json-tag-strip** | Remove `json:"field"` struct tags | Moderate |

**Security (3 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **path-traversal** | Remove `filepath.Clean()` sanitization | Tricky |
| **cors-wildcard** | Replace CORS origin with `"*"` | Moderate |
| **sql-injection** | Replace parameterized `$1` with `fmt.Sprintf` | Sneaky |

**Backend (2 templates)**

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **http-timeout-strip** | Remove `Timeout:` from `http.Client{}` | Moderate |
| **connection-close-strip** | Remove `defer db.Close()` / `defer rows.Close()` | Tricky |

## Git Workflow

Hydra never touches your main branch. It creates a dedicated session branch and opens a PR:

```
main ─────────────────────────────────────
  │
  └── hydra/session-a1b2c3d4  →  PR #42: "fix: improve code quality"
        commit 1: "fix: orphaned setTimeout in App.jsx"        (real fix)
        commit 2: "refactor: cleanup Modal effect deps"        (contains hydra-001)
        commit 3: "fix: improve error handling in utils"       (contains hydra-002)
```

## Architecture

```
src/
  languages/           # Language adapter layer
    index.js           # Registry: detectLanguage(), getAdapter()
    javascript.js      # Babel AST adapter
    python.js          # Regex-based adapter
    go.js              # Regex-based adapter
  bug-templates/
    javascript/        # 24 JS/TS templates (Babel AST transforms)
    python/            # 24 Python templates (regex + line-context)
    go/                # 24 Go templates (regex + line-context)
  core/
    scanner.js         # LLM-powered bug discovery
    fixer.js           # LLM-powered bug fixing
    injector.js        # Language-agnostic injection engine
```

Each language provides an **adapter** with: file extensions, parser, code generator, import extractor, skip directories, and bug templates. The injector delegates to the adapter — no language-specific logic in the core pipeline.

## Tech Stack

- **Node.js** CLI with [Commander](https://github.com/tj/commander.js)
- **Babel** for JavaScript/TypeScript AST manipulation (precise, syntax-safe)
- **Regex + line-context** for Python and Go manipulation (lightweight, no external parser needed)
- **Multi-provider LLM** — supports OpenAI (`gpt-4o-mini`), xAI/Grok (`grok-3-mini`), and Anthropic (`claude-sonnet`) for bug discovery and fix generation
- **GitHub CLI** (`gh`) for automatic PR creation
- **chalk** + **ora** for terminal UI

## Requirements

- Node.js 18+
- `OPENAI_API_KEY`, `XAI_API_KEY`, or `ANTHROPIC_API_KEY` environment variable
- `gh` CLI (optional, for auto PR creation)

## License

MIT
