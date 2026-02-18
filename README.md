# tdraw-tools

TradingView-style drawing tools engine for TradingView Lightweight Charts.

## Packages

- `@tdraw-tools/core`: headless drawing engine (tools, selection, history, snapshot).
- `@tdraw-tools/lightweight-adapter`: high-DPI canvas overlay adapter for Lightweight Charts.
- `@tdraw-tools/svelte`: Svelte controller helpers around the core engine.
- `@tdraw-tools/risk`: optional `risk_position` tool and renderer.
- `apps/playground`: local validation app.

## Quick Start

```bash
bun install
bun run check
bun run dev:playground
```

## Core Usage

```ts
import { createDrawingEngine } from "@tdraw-tools/core";

const engine = createDrawingEngine({ initialTool: "cursor" });
engine.setTool("trend_line");
```

## Lightweight Adapter Usage

```ts
import { attachLightweightCharts } from "@tdraw-tools/lightweight-adapter";

const adapter = attachLightweightCharts(engine, {
  chart,
  series,
  container,
  showDebugOverlay: true
});
```
