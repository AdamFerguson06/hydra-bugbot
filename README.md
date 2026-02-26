# Hydra Bugbot

<p align="center">
  <img src="hydra-bugbot-logo.jpg" alt="Hydra Bugbot" width="400">
</p>

Chaos engineering for code review pipelines. Finds real bugs, fixes them, then injects 2 new subtle bugs per fix — all tracked in a manifest for clean revert on demand.

```
Find 1 bug → Fix it → Inject 2 new subtle bugs → Track everything → Clean revert on demand
```

## Use Case

Cause CHAOS 😈

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Scan a project for real bugs (read-only)
npx hydra-bugbot scan --scope src/

# Find bugs, fix them, and inject 2x subtle bugs
npx hydra-bugbot infest

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
| `infest` | Fix real bugs + inject 2 new bugs per fix |
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
--dry-run            # Preview without making changes
--reviewer <name>    # Reviewer name for `found` command
```

## How It Works

1. **Scan** — Claude API analyzes your codebase for real bugs
2. **Fix** — Each real bug gets a proper fix, committed to a dedicated `hydra/session-*` branch
3. **Inject** — For each fix, 2 subtle bugs are injected into *different* files via Babel AST transforms
4. **Track** — Everything is recorded in `.hydra-manifest.json` (gitignored)
5. **Score** — Reviewers hunt for injected bugs; finds are scored by difficulty (1-5 stars)
6. **Purge** — Clean revert of all injections; real fixes remain intact

## Bug Templates

7 categories of realistic, AST-based bug injections:

| Template | What it does | Subtlety |
|----------|-------------|----------|
| **off-by-one** | `<` to `<=` in loop conditions | Easy |
| **type-coercion** | `===` to `==` | Easy |
| **null-deref** | Remove optional chaining (`?.` to `.`) | Moderate |
| **stale-closure** | Remove dependency from React hook arrays | Moderate |
| **logic-inversion** | Flip `&&` to `\|\|` in conditionals | Moderate |
| **async-race** | Remove `await` keyword | Tricky |
| **resource-leak** | Remove `useEffect` cleanup functions | Tricky |

## Git Workflow

Hydra never touches your main branch. It creates a dedicated session branch:

```
main ─────────────────────────────────────
  │
  └── hydra/session-a1b2c3d4
        commit 1: "fix: orphaned setTimeout in App.jsx"        (real fix)
        commit 2: "refactor: cleanup Modal effect deps"        (contains hydra-001)
        commit 3: "fix: improve error handling in utils"       (contains hydra-002)
```

## Tech Stack

- **Node.js** CLI with [Commander](https://github.com/tj/commander.js)
- **Babel** for AST-based code manipulation (precise, syntax-safe)
- **Claude API** via [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-node) for bug discovery and fix generation
- **chalk** + **ora** for terminal UI

## Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable

## License

MIT
