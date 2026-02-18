# Architecture

## Packages
- `@tdraw-tools/core`: deterministic drawing engine and state.
- `@tdraw-tools/lightweight-adapter`: chart adapter and renderer.
- `@tdraw-tools/svelte`: Svelte bindings/controller.
- `@tdraw-tools/risk`: optional risk-position tool.
- `apps/playground`: local validation harness.

## Packaging & Integration
- All package outputs are native ESM in `dist/`.
- Internal runtime imports in published `dist/*.js` use explicit `.js` extensions for Node/Vite ESM compatibility.
- `@tdraw-tools/lightweight-adapter` and `@tdraw-tools/risk` depend on `@tdraw-tools/core` as a peer dependency to avoid duplicate engine instances in consuming apps.
- Consumer apps are expected to install `@tdraw-tools/core` directly and pass the same engine instance to adapters/tools.

## Core Engine
- State:
  - drawings map
  - active tool
  - selection set + primary selection
  - interaction mode (`idle`, `creating`, `dragging-selection`, `marquee`)
- Input:
  - pointer down/move/up with viewport scales (`logicalPerPixel`, `pricePerPixel`)
  - keyboard shortcuts (undo/redo/delete/select all/arrow-nudge)
- History:
  - snapshot-based undo/redo with bounded stack
- Hit testing:
  - geometry-based tool hit tests
  - RBush spatial index for candidate filtering
- Snapshot schema:
  - `DrawingSnapshotV1` with `version`, `drawings`, `groups`, `prefs`

## Adapter
- Overlay canvas rendered above Lightweight Charts pane.
- Converts logical/price points to screen coordinates each frame.
- Renders built-in tool visuals and selection handles.
- Emits debug metrics (fps/frame/p95/object counts).

## Performance Approach
- rAF-driven render scheduling.
- Spatial index candidate narrowing for hit-tests.
- High-DPI canvas scaling for sharp rendering.
- Engine telemetry hook (`reportFrame`) for runtime frame metrics.
