# Project: tdraw-tools

## 🏗 Tech Stack
- **Core:** TypeScript, lightweight-charts integration, Canvas 2D renderer
- **Build/Test:** Bun workspaces, tsup, Vitest, ESLint, TypeScript
- **Env:** Fedora / Fish / Neovim

## 🔄 Autonomous Workflow
- **Initialization:** Read `docs/` to restore mental model.
- **Sync Routine:**
  1. Update `docs/`
  2. `git add docs/ && git commit -m "docs: sync project state"`
  3. `git add . && git commit -m "feat/fix: [desc]"`

## ⚡ Agent Commands
- **/context**: `cat docs/project-status.md docs/decision-log.md docs/architecture.md`
- **/status**: `cat docs/project-status.md`
- **/history**: `tail -n 20 docs/decision-log.md`
