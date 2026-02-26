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
# Set your API key (either works)
export OPENAI_API_KEY=sk-...
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

1. **Scan** — LLM analyzes your codebase for real bugs (supports OpenAI and Anthropic)
2. **Fix** — Each real bug gets a proper fix, committed to a dedicated `hydra/session-*` branch
3. **Inject** — For each fix, 2 subtle bugs are injected using language-appropriate transforms (works with single or multi-file projects)
4. **PR** — Automatically pushes the branch and opens a GitHub PR with an innocent-looking description
5. **Track** — Everything is recorded in `.hydra-manifest.json` (auto-gitignored)
6. **Score** — Reviewers hunt for injected bugs; finds are scored by difficulty (1-5 stars)
7. **Purge** — Clean revert of all injections; real fixes remain intact

## Bug Templates

20 bug templates across 3 languages — each targeting idiomatic patterns that are hard to catch in review:

### JavaScript / TypeScript (7 templates, Babel AST)

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **off-by-one** | `<` to `<=` in loop conditions | Easy |
| **type-coercion** | `===` to `==` | Easy |
| **null-deref** | Remove optional chaining (`?.` to `.`) | Moderate |
| **stale-closure** | Remove dependency from React hook arrays | Moderate |
| **logic-inversion** | Flip `&&` to `\|\|` in conditionals | Moderate |
| **async-race** | Remove `await` keyword | Tricky |
| **resource-leak** | Remove `useEffect` cleanup functions | Tricky |

### Python (7 templates, regex-based)

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **off-by-one** | `range(n)` to `range(n + 1)` | Easy |
| **type-coercion** | `==` to `is` (identity vs equality) | Easy |
| **none-deref** | Invert `is not None` guards | Easy |
| **logic-inversion** | Swap `and` / `or` in conditions | Moderate |
| **resource-leak** | Remove `with` context manager from `open()` | Moderate |
| **async-race** | Remove `await` from asyncio calls | Tricky |
| **indentation** | Dedent last line of a block (scope change) | Tricky |

### Go (6 templates, regex-based)

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **off-by-one** | `<` to `<=` in for loops | Easy |
| **nil-deref** | Invert `!= nil` guards | Easy |
| **logic-inversion** | Swap `&&` / `\|\|` in conditions | Moderate |
| **error-swallow** | Replace `err` with `_` in multi-return | Moderate |
| **defer-trap** | Remove `defer` from cleanup calls | Moderate |
| **goroutine-leak** | Comment out channel operations | Tricky |

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
    javascript/        # 7 JS/TS templates (Babel AST transforms)
    python/            # 7 Python templates (regex + line-context)
    go/                # 6 Go templates (regex + line-context)
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
- **Multi-provider LLM** — supports OpenAI (`gpt-4o-mini`) and Anthropic (`claude-sonnet`) for bug discovery and fix generation
- **GitHub CLI** (`gh`) for automatic PR creation
- **chalk** + **ora** for terminal UI

## Requirements

- Node.js 18+
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable
- `gh` CLI (optional, for auto PR creation)

## License

MIT
