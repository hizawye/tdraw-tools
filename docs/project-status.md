# Project Status

## Current progress
- Monorepo initialized with packages: core, lightweight-adapter, svelte, risk, playground.
- Implemented headless drawing engine with:
  - built-in tool registry
  - selection/marquee
  - drag/duplicate/delete flows
  - undo/redo history
  - snapshot import/export (`version: "1"`)
  - lock/hide/z-order controls
- Implemented canvas overlay adapter for Lightweight Charts with:
  - pointer + keyboard routing
  - logical/price coordinate transforms
  - rendering for line/ray/extended/rect/arrow/ruler/fib/brush/text
  - debug overlay metrics
- Implemented optional `risk_position` extension package.
- Added Svelte controller helper package.
- Added playground app for manual validation.
- Hardened package consumption behavior for external apps:
  - adapter/risk now consume core through peer dependency contract
  - core emits ESM-compatible `.js` internal import specifiers
- Completed integration validation with `../better-backtest`:
  - local `file:` dependency linking
  - feature-flagged chart swap to `ChartTdraw`
  - successful `check`/`build` validation in consumer app
- Validation status:
  - `bun run check` passes
  - `bun run build` passes

## Blockers/Bugs
- No hard blockers.
- Primitive backend integration for lightweight-charts v5 plugin API is deferred; overlay backend is the active v1 path.
- Text editing is currently display/placement-focused; rich editing UX (inline edit handles, font controls) is deferred.
- Bun local-link installs can intermittently report `EEXIST`; use `bun install --force` in consuming apps when needed.

## Next immediate starting point
- Add CI release workflow (versioning + package publish) and freeze a first tagged release for consumer pinning.
