<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { createChart, type CandlestickData, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
  import { createDrawingEngine, type EngineStateView, type ToolId } from "@tdraw-tools/core";
  import { attachLightweightCharts, type AttachedDrawingAdapter } from "@tdraw-tools/lightweight-adapter";
  import { registerRiskTool, riskPositionRenderer, RISK_TOOL_ID } from "@tdraw-tools/risk";

  const tools: ToolId[] = [
    "cursor",
    "trend_line",
    "horizontal_line",
    "vertical_line",
    "ray",
    "extended_line",
    "rectangle",
    "arrow",
    "ruler",
    "fibonacci",
    "brush",
    "text",
    RISK_TOOL_ID
  ];

  let container: HTMLDivElement;
  let chart: IChartApi | null = null;
  let series: ISeriesApi<"Candlestick", Time> | null = null;
  let adapter: AttachedDrawingAdapter | null = null;

  const engine = createDrawingEngine({
    initialTool: "cursor",
    emitOnAnimationFrame: true,
    historyLimit: 500,
    holdToDrawMs: 180,
    enableHoldToDraw: true
  });

  registerRiskTool(engine, { defaultRiskReward: 2 });

  let state: EngineStateView = engine.getState();
  let showDebug = true;
  let fps = 0;
  let frameMs = 0;
  let p95 = 0;

  function randomData(): CandlestickData<Time>[] {
    const result: CandlestickData<Time>[] = [];
    const now = Math.floor(Date.now() / 1000);
    let value = 100;

    for (let i = 240; i >= 0; i -= 1) {
      const time = (now - i * 60) as Time;
      const open = value;
      const drift = (Math.random() - 0.5) * 1.7;
      value = Math.max(40, value + drift);
      const close = value;
      const high = Math.max(open, close) + Math.random() * 0.9;
      const low = Math.min(open, close) - Math.random() * 0.9;

      result.push({
        time,
        open,
        high,
        low,
        close
      });
    }

    return result;
  }

  function setTool(tool: ToolId): void {
    engine.setTool(tool);
  }

  function toggleDebug(): void {
    showDebug = !showDebug;
    if (adapter) {
      adapter.detach();
      adapter = null;
      if (chart && series) {
        adapter = attachLightweightCharts(engine, {
          chart,
          series,
          container,
          showDebugOverlay: showDebug,
          customRenderers: {
            [RISK_TOOL_ID]: riskPositionRenderer
          },
          onMetrics(next) {
            fps = next.fps;
            frameMs = next.frameMs;
            p95 = next.p95FrameMs;
          }
        });
      }
    }
  }

  function exportSnapshot(): void {
    const snapshot = engine.exportSnapshot();
    console.info("snapshot", snapshot);
  }

  const unsubscribe = engine.subscribe((event) => {
    state = event.state;
  });

  onMount(() => {
    chart = createChart(container, {
      layout: {
        background: { color: "#090f17" },
        textColor: "#dbe8f7",
        fontFamily: "IBM Plex Sans"
      },
      rightPriceScale: {
        borderColor: "rgba(147, 180, 214, 0.25)"
      },
      timeScale: {
        borderColor: "rgba(147, 180, 214, 0.25)"
      },
      grid: {
        vertLines: { color: "rgba(73, 104, 131, 0.18)" },
        horzLines: { color: "rgba(73, 104, 131, 0.18)" }
      },
      crosshair: {
        mode: 1
      },
      handleScale: {
        axisPressedMouseMove: true,
        pinch: true,
        mouseWheel: true
      },
      handleScroll: {
        pressedMouseMove: true,
        mouseWheel: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      }
    });

    series = chart.addCandlestickSeries({
      upColor: "#05b26a",
      downColor: "#f34757",
      borderVisible: false,
      wickUpColor: "#06c074",
      wickDownColor: "#f05a68"
    });
    series.setData(randomData());

    adapter = attachLightweightCharts(engine, {
      chart,
      series,
      container,
      showDebugOverlay: showDebug,
      customRenderers: {
        [RISK_TOOL_ID]: riskPositionRenderer
      },
      onMetrics(next) {
        fps = next.fps;
        frameMs = next.frameMs;
        p95 = next.p95FrameMs;
      }
    });

    chart.timeScale().fitContent();

    return () => {
      adapter?.detach();
      chart?.remove();
      adapter = null;
      chart = null;
      series = null;
    };
  });

  onDestroy(() => {
    unsubscribe();
  });
</script>

<div class="shell">
  <header class="toolbar">
    <div class="brand">
      <h1>TDraw Tools</h1>
      <p>Native-feel drawing engine for Lightweight Charts</p>
    </div>
    <div class="stats">
      <span>{Math.round(fps)} fps</span>
      <span>{frameMs.toFixed(2)} ms</span>
      <span>p95 {p95.toFixed(2)} ms</span>
      <span>{state.drawings.length} objs</span>
      <span>{state.selection.ids.length} selected</span>
    </div>
  </header>

  <section class="controls">
    {#each tools as tool}
      <button
        type="button"
        class:active={state.activeTool === tool}
        on:click={() => setTool(tool)}
      >
        {tool}
      </button>
    {/each}
  </section>

  <section class="actions">
    <button on:click={() => engine.undo()}>Undo</button>
    <button on:click={() => engine.redo()}>Redo</button>
    <button on:click={() => engine.duplicateSelection()}>Duplicate</button>
    <button on:click={() => engine.deleteSelection()}>Delete</button>
    <button on:click={() => engine.selectAll()}>Select All</button>
    <button on:click={() => engine.clearSelection()}>Clear Selection</button>
    <button on:click={exportSnapshot}>Log Snapshot</button>
    <button on:click={toggleDebug}>{showDebug ? "Hide" : "Show"} Debug</button>
  </section>

  <main class="chart-wrap">
    <div bind:this={container} class="chart"></div>
  </main>
</div>

<style>
  :global(html, body) {
    margin: 0;
    width: 100%;
    height: 100%;
    background:
      radial-gradient(1600px 640px at 8% -12%, rgba(4, 120, 87, 0.26), transparent 62%),
      radial-gradient(1200px 500px at 94% 6%, rgba(186, 128, 0, 0.18), transparent 58%),
      #050b13;
    color: #e6f0fd;
    font-family: "IBM Plex Sans", system-ui, sans-serif;
  }

  :global(#app) {
    width: 100%;
    height: 100%;
  }

  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: auto auto auto 1fr;
    padding: 16px;
    gap: 10px;
    box-sizing: border-box;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-radius: 14px;
    border: 1px solid rgba(106, 145, 179, 0.28);
    background: linear-gradient(150deg, rgba(13, 25, 40, 0.85), rgba(8, 16, 28, 0.9));
    backdrop-filter: blur(6px);
  }

  .brand h1 {
    margin: 0;
    font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
    font-weight: 700;
    letter-spacing: 0.02em;
    font-size: 1.25rem;
  }

  .brand p {
    margin: 4px 0 0;
    color: #90abc7;
    font-size: 0.9rem;
  }

  .stats {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: #c2d7f0;
  }

  .controls,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  button {
    border: 1px solid rgba(130, 160, 190, 0.3);
    color: #d4e8ff;
    background: linear-gradient(180deg, rgba(23, 41, 61, 0.9), rgba(14, 28, 43, 0.9));
    border-radius: 10px;
    padding: 7px 11px;
    font-size: 0.82rem;
    cursor: pointer;
    transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
  }

  button:hover {
    transform: translateY(-1px);
    border-color: rgba(165, 198, 229, 0.55);
  }

  button.active {
    background: linear-gradient(170deg, rgba(5, 124, 89, 0.95), rgba(6, 91, 78, 0.95));
    border-color: rgba(126, 251, 212, 0.68);
    color: #eafff8;
  }

  .chart-wrap {
    min-height: 0;
    border-radius: 16px;
    border: 1px solid rgba(104, 140, 172, 0.32);
    background: rgba(7, 13, 20, 0.75);
    overflow: hidden;
    box-shadow: 0 14px 50px rgba(0, 0, 0, 0.35);
  }

  .chart {
    width: 100%;
    height: 100%;
  }

  @media (max-width: 840px) {
    .shell {
      padding: 10px;
      gap: 8px;
    }

    .toolbar {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    button {
      padding: 7px 10px;
      font-size: 0.78rem;
    }
  }
</style>
