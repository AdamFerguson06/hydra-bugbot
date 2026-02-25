# Global Rules

## 1. Plan Before Building
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If something goes sideways mid-task, STOP and re-plan. Don't keep pushing.
- Write detailed specs upfront to reduce ambiguity.

## 2. Verify Before Claiming Done
- Never mark work complete without proving it works — run tests, check logs, diff behavior.
- Ask yourself: "Would a staff engineer approve this?"
- If tests fail, errors exist, or implementation is partial, the task is NOT done.

## 3. Self-Improvement Loop
- After ANY user correction, update MEMORY.md with the pattern and write a rule that prevents the same mistake.
- Review memory files at session start for relevant project context.
- Ruthlessly iterate on these rules until mistake rates drop.

## 4. Autonomous Problem Solving
- When given a bug report or failing test, investigate and fix it. Don't ask for hand-holding.
- Point at logs, errors, and failing tests — then resolve them.
- Zero context switching required from the user. Give the problem, not the solution.

## 5. Code Quality
- **Simplicity first.** Make every change as simple as possible. Minimal code, minimal impact.
- **Root causes, not patches.** Find and fix the underlying issue. Senior developer standards.
- **Surgical changes.** Only touch what's necessary. Don't introduce bugs or unrelated changes.
- For architectural decisions or heavily-reused code, pause and consider if there's a cleaner approach. Skip this for straightforward fixes.

## 6. Skill & Pattern Recognition
- If the user does something more than once across sessions, suggest turning it into a skill.
- Use subagents to keep the main context window clean — offload research, exploration, and parallel analysis.
- One task per subagent for focused execution.
