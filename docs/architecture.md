# Architecture

## Packages
- `@tdraw-tools/core`: headless drawing engine, state machine, geometry, hit-testing, history, serialization.
- `@tdraw-tools/lightweight-adapter`: attaches core engine to TradingView Lightweight Charts (overlay backend).
- `@tdraw-tools/svelte`: thin Svelte-oriented controller/store bindings.
- `@tdraw-tools/risk`: optional risk-position tool extension module.
- `apps/playground`: manual validation harness with chart + tool controls.

## Principles
- Deterministic core engine.
- High-frequency input processing via rAF scheduler.
- Spatial indexing for scalable hit-testing.
- Versioned snapshot schema.
