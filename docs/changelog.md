# Changelog

## Unreleased
- Bootstrapped repository and autonomous docs.
- Added monorepo workspace with packages:
  - `@tdraw-tools/core`
  - `@tdraw-tools/lightweight-adapter`
  - `@tdraw-tools/svelte`
  - `@tdraw-tools/risk`
  - `apps/playground`
- Implemented drawing engine with core tools, selection, drag/marquee, undo/redo, serialization, and z-order controls.
- Implemented lightweight-charts overlay adapter with high-DPI canvas renderer and debug metrics overlay.
- Implemented optional `risk_position` extension and renderer.
- Added core tests for geometry, engine behavior, and snapshot round-trip.
- Updated package dependency graph for consumers:
  - `@tdraw-tools/lightweight-adapter` uses `@tdraw-tools/core` as peer dependency.
  - `@tdraw-tools/risk` uses `@tdraw-tools/core` as peer dependency.
- Fixed Node/Vite ESM compatibility by emitting explicit `.js` internal import specifiers in `@tdraw-tools/core` runtime output.
- Validated integration path with `../better-backtest` using local `file:` package links and feature-flagged chart swap.
