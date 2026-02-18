# Decision Log

## 2026-02-18
- Initialized `tdraw-tools` as a standalone monorepo.
- Selected Bun workspace + TypeScript strict mode for fast local iteration.
- Chosen architecture: headless core engine with lightweight-charts adapter and optional risk module.
- Implemented v1 with overlay canvas backend as default integration strategy.
- Added RBush spatial index for scalable drawing hit-testing.
- Chosen snapshot-based history implementation for deterministic undo/redo.
- Added optional risk module (`risk_position`) to keep core dependency surface minimal.
- Added Svelte integration package as a thin controller layer over the core engine.
- Changed `@tdraw-tools/lightweight-adapter` and `@tdraw-tools/risk` to use `@tdraw-tools/core` as a peer dependency in consumer installs to avoid duplicate local link resolution issues.
- Standardized ESM runtime imports in `@tdraw-tools/core` source to explicit `.js` specifiers so built artifacts load under strict Node ESM (Vite SSR/dev).
