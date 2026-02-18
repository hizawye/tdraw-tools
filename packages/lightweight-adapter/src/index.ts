import type { DrawingEngine, DrawingEntity, DrawingPoint, PointerInput, ToolId } from "@tdraw-tools/core";

interface TimeScaleLike {
  coordinateToLogical: (x: number) => number | null;
  logicalToCoordinate: (logical: number) => number | null;
  subscribeVisibleLogicalRangeChange?: (handler: (range: unknown) => void) => void;
  unsubscribeVisibleLogicalRangeChange?: (handler: (range: unknown) => void) => void;
}

interface ChartLike {
  timeScale: () => TimeScaleLike;
}

interface SeriesLike {
  priceToCoordinate: (price: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
}

export type AdapterBackend = "overlay" | "primitive";

export interface RenderHelpers {
  toScreen: (point: DrawingPoint) => { x: number; y: number } | null;
  viewportWidth: number;
  viewportHeight: number;
  dpr: number;
}

export type CustomCanvasRenderer = (
  ctx: CanvasRenderingContext2D,
  drawing: DrawingEntity,
  helpers: RenderHelpers
) => void;

export interface AttachOptions {
  chart: ChartLike;
  series: SeriesLike;
  container: HTMLElement;
  backend?: AdapterBackend;
  customRenderers?: Partial<Record<ToolId, CustomCanvasRenderer>>;
  showDebugOverlay?: boolean;
  onMetrics?: (metrics: {
    fps: number;
    frameMs: number;
    p95FrameMs: number;
    drawings: number;
    selected: number;
  }) => void;
}

export interface AttachedDrawingAdapter {
  requestRender: () => void;
  detach: () => void;
  canvas: HTMLCanvasElement;
}

const DASH_MAP: Record<string, number[]> = {
  solid: [],
  dashed: [8, 6],
  dotted: [2, 4]
};

export function attachLightweightCharts(
  engine: DrawingEngine,
  options: AttachOptions
): AttachedDrawingAdapter {
  if (options.backend && options.backend !== "overlay") {
    console.warn(
      `[tdraw-tools] backend '${options.backend}' requested; using overlay backend in v1.`
    );
  }

  const chart = options.chart;
  const series = options.series;
  const container = options.container;
  const customRenderers = options.customRenderers ?? {};

  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "20";
  canvas.style.touchAction = "none";
  canvas.tabIndex = 0;

  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to initialize 2D drawing context");
  }

  const debugOverlay = document.createElement("div");
  debugOverlay.style.position = "absolute";
  debugOverlay.style.top = "8px";
  debugOverlay.style.left = "8px";
  debugOverlay.style.zIndex = "40";
  debugOverlay.style.padding = "6px 8px";
  debugOverlay.style.borderRadius = "8px";
  debugOverlay.style.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  debugOverlay.style.background = "rgba(16, 24, 32, 0.74)";
  debugOverlay.style.color = "#d4e7ff";
  debugOverlay.style.pointerEvents = "none";
  debugOverlay.style.display = options.showDebugOverlay ? "block" : "none";
  container.appendChild(debugOverlay);

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let dirty = true;
  let lastFrameAt = performance.now();
  const frameSamples: number[] = [];

  const pointerState = {
    activeId: -1
  };

  const toScreen = (point: DrawingPoint): { x: number; y: number } | null => {
    const x = chart.timeScale().logicalToCoordinate(point.logical);
    const y = series.priceToCoordinate(point.price);
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  };

  const computeViewportScale = (x: number, y: number): { logicalPerPixel: number; pricePerPixel: number } => {
    const logicalA = chart.timeScale().coordinateToLogical(x);
    const logicalB = chart.timeScale().coordinateToLogical(x + 1);
    const priceA = series.coordinateToPrice(y);
    const priceB = series.coordinateToPrice(y + 1);

    const logicalPerPixel =
      logicalA != null && logicalB != null ? Math.abs(logicalB - logicalA) || 1 : 1;
    const pricePerPixel = priceA != null && priceB != null ? Math.abs(priceB - priceA) || 1 : 1;

    return {
      logicalPerPixel,
      pricePerPixel
    };
  };

  const pointerToInput = (event: PointerEvent): PointerInput | null => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);

    if (logical == null || price == null || !Number.isFinite(logical) || !Number.isFinite(price)) {
      return null;
    }

    const viewport = computeViewportScale(x, y);

    const pointerType = (event.pointerType || "mouse") as NonNullable<PointerInput["pointerType"]>;

    return {
      x,
      y,
      logical,
      price,
      viewport,
      pointerId: event.pointerId,
      pointerType,
      button: event.button,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey
    };
  };

  const resizeCanvas = (): void => {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestRender();
  };

  const applyStyle = (drawing: DrawingEntity): void => {
    ctx.strokeStyle = drawing.style.strokeColor;
    ctx.fillStyle = drawing.style.fillColor;
    ctx.lineWidth = drawing.style.lineWidth;
    ctx.globalAlpha = drawing.style.opacity;
    ctx.setLineDash(DASH_MAP[drawing.style.lineStyle] ?? []);
  };

  const withOpacity = (value: string, alpha: number): string => {
    if (value.startsWith("rgba") || value.startsWith("rgb")) {
      return value;
    }
    if (!value.startsWith("#")) {
      return value;
    }

    const hex = value.slice(1);
    if (hex.length !== 6) {
      return value;
    }

    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const drawArrowHead = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const len = 10;
    const spread = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - len * Math.cos(angle - spread), to.y - len * Math.sin(angle - spread));
    ctx.lineTo(to.x - len * Math.cos(angle + spread), to.y - len * Math.sin(angle + spread));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  };

  const extendRayToViewport = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    bothSides = false
  ): { start: { x: number; y: number }; end: { x: number; y: number } } => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return { start: a, end: b };
    }

    const intersections: { x: number; y: number; t: number }[] = [];
    const addPoint = (x: number, y: number, t: number): void => {
      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        intersections.push({ x, y, t });
      }
    };

    if (Math.abs(dx) > 0.001) {
      const tLeft = (0 - a.x) / dx;
      addPoint(0, a.y + tLeft * dy, tLeft);
      const tRight = (width - a.x) / dx;
      addPoint(width, a.y + tRight * dy, tRight);
    }

    if (Math.abs(dy) > 0.001) {
      const tTop = (0 - a.y) / dy;
      addPoint(a.x + tTop * dx, 0, tTop);
      const tBottom = (height - a.y) / dy;
      addPoint(a.x + tBottom * dx, height, tBottom);
    }

    if (intersections.length === 0) {
      return { start: a, end: b };
    }

    if (bothSides) {
      intersections.sort((p, q) => p.t - q.t);
      const first = intersections[0];
      const last = intersections[intersections.length - 1];
      if (!first || !last) {
        return { start: a, end: b };
      }
      return {
        start: { x: first.x, y: first.y },
        end: { x: last.x, y: last.y }
      };
    }

    const forward = intersections.filter((item) => item.t >= 0).sort((p, q) => p.t - q.t);
    const forwardLast = forward[forward.length - 1];
    return {
      start: a,
      end: forwardLast ? { x: forwardLast.x, y: forwardLast.y } : b
    };
  };

  const drawTextBox = (drawing: DrawingEntity, at: { x: number; y: number }): void => {
    const text = drawing.text ?? "Text";
    const lines = text.split(/\n/);
    const paddingX = 8;
    const lineHeight = 14;
    const boxWidth = 150;
    const boxHeight = Math.max(30, lines.length * lineHeight + 10);

    ctx.fillStyle = withOpacity(drawing.style.fillColor, 0.75);
    ctx.strokeStyle = withOpacity(drawing.style.strokeColor, 0.9);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.rect(at.x, at.y - boxHeight, boxWidth, boxHeight);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = drawing.style.textColor;
    ctx.font = "12px 'IBM Plex Sans', 'Segoe UI', sans-serif";
    ctx.textBaseline = "middle";

    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i] ?? "", at.x + paddingX, at.y - boxHeight + 8 + i * lineHeight);
    }
  };

  const drawSelectionHandles = (drawing: DrawingEntity, selected: boolean): void => {
    if (!selected || drawing.locked) {
      return;
    }

    for (const point of drawing.points) {
      const screen = toScreen(point);
      if (!screen) {
        continue;
      }
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#2a7fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  const drawEntity = (drawing: DrawingEntity, selected: boolean): void => {
    if (!drawing.visible) {
      return;
    }

    const custom = customRenderers[drawing.tool];
    if (custom) {
      custom(ctx, drawing, {
        toScreen,
        viewportWidth: width,
        viewportHeight: height,
        dpr
      });
      drawSelectionHandles(drawing, selected);
      return;
    }

    applyStyle(drawing);
    const p = drawing.points.map(toScreen);

    if (drawing.tool === "horizontal_line" && p[0]) {
      ctx.beginPath();
      ctx.moveTo(0, p[0].y);
      ctx.lineTo(width, p[0].y);
      ctx.stroke();
      drawSelectionHandles(drawing, selected);
      return;
    }

    if (drawing.tool === "vertical_line" && p[0]) {
      ctx.beginPath();
      ctx.moveTo(p[0].x, 0);
      ctx.lineTo(p[0].x, height);
      ctx.stroke();
      drawSelectionHandles(drawing, selected);
      return;
    }

    if ((drawing.tool === "trend_line" || drawing.tool === "arrow" || drawing.tool === "ruler") && p[0] && p[1]) {
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      ctx.lineTo(p[1].x, p[1].y);
      ctx.stroke();

      if (drawing.tool === "arrow") {
        drawArrowHead(p[0], p[1]);
      }

      if (drawing.tool === "ruler") {
        const firstPoint = drawing.points[0];
        const secondPoint = drawing.points[1];
        if (!firstPoint || !secondPoint) {
          return;
        }
        const bars = Math.abs(secondPoint.logical - firstPoint.logical);
        const price = secondPoint.price - firstPoint.price;
        const label = `${bars.toFixed(0)} bars • ${price.toFixed(2)}`;

        ctx.font = "11px 'IBM Plex Sans', 'Segoe UI', sans-serif";
        const w = ctx.measureText(label).width + 10;
        const x = (p[0].x + p[1].x) / 2 - w / 2;
        const y = (p[0].y + p[1].y) / 2 - 18;

        ctx.fillStyle = "rgba(16, 24, 32, 0.78)";
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(x, y, w, 18);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#d4e7ff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + 5, y + 9);
      }

      drawSelectionHandles(drawing, selected);
      return;
    }

    if ((drawing.tool === "ray" || drawing.tool === "extended_line") && p[0] && p[1]) {
      const extended = extendRayToViewport(p[0], p[1], drawing.tool === "extended_line");
      ctx.beginPath();
      ctx.moveTo(extended.start.x, extended.start.y);
      ctx.lineTo(extended.end.x, extended.end.y);
      ctx.stroke();
      drawSelectionHandles(drawing, selected);
      return;
    }

    if (drawing.tool === "rectangle" && p[0] && p[1]) {
      const x = Math.min(p[0].x, p[1].x);
      const y = Math.min(p[0].y, p[1].y);
      const w = Math.abs(p[1].x - p[0].x);
      const h = Math.abs(p[1].y - p[0].y);

      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();

      drawSelectionHandles(drawing, selected);
      return;
    }

    if (drawing.tool === "fibonacci" && p[0] && p[1]) {
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const x1 = p[0].x;
      const x2 = p[1].x;
      const y1 = p[0].y;
      const y2 = p[1].y;

      ctx.font = "11px 'IBM Plex Sans', 'Segoe UI', sans-serif";
      ctx.setLineDash([5, 4]);

      for (const level of levels) {
        const y = y1 + (y2 - y1) * level;
        ctx.beginPath();
        ctx.moveTo(Math.min(x1, x2), y);
        ctx.lineTo(Math.max(x1, x2), y);
        ctx.stroke();

        const label = `${(level * 100).toFixed(1)}%`;
        ctx.fillStyle = "rgba(16,24,32,0.75)";
        const labelW = ctx.measureText(label).width + 8;
        ctx.fillRect(Math.max(x1, x2) + 4, y - 8, labelW, 14);
        ctx.fillStyle = drawing.style.strokeColor;
        ctx.fillText(label, Math.max(x1, x2) + 8, y + 3);
      }

      ctx.setLineDash([]);
      drawSelectionHandles(drawing, selected);
      return;
    }

    if (drawing.tool === "brush" && p.length > 1) {
      ctx.beginPath();
      const start = p[0];
      if (start) {
        ctx.moveTo(start.x, start.y);
      }
      for (let i = 1; i < p.length; i += 1) {
        const point = p[i];
        if (!point) {
          continue;
        }
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      drawSelectionHandles(drawing, selected);
      return;
    }

    if (drawing.tool === "text" && p[0]) {
      drawTextBox(drawing, p[0]);
      drawSelectionHandles(drawing, selected);
      return;
    }
  };

  const render = (): void => {
    raf = 0;
    if (!dirty) {
      return;
    }
    dirty = false;

    const frameStart = performance.now();
    ctx.clearRect(0, 0, width, height);

    const state = engine.getState();
    const selected = new Set(state.selection.ids);

    for (const drawing of state.drawings) {
      drawEntity(drawing, selected.has(drawing.id));
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    if (state.selection.marquee) {
      const start = toScreen(state.selection.marquee.start);
      const current = toScreen(state.selection.marquee.current);
      if (start && current) {
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        const w = Math.abs(current.x - start.x);
        const h = Math.abs(current.y - start.y);

        ctx.fillStyle = "rgba(42, 127, 255, 0.12)";
        ctx.strokeStyle = "rgba(42, 127, 255, 0.82)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
      }
    }

    const frameMs = performance.now() - frameStart;
    const dt = Math.max(1, performance.now() - lastFrameAt);
    lastFrameAt = performance.now();
    const fps = 1000 / dt;

    frameSamples.push(frameMs);
    if (frameSamples.length > 240) {
      frameSamples.shift();
    }
    const sorted = [...frameSamples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    const p95 = sorted[Math.max(0, idx - 1)] ?? frameMs;

    engine.reportFrame(frameMs);

    if (options.showDebugOverlay) {
      debugOverlay.textContent = [
        `fps: ${fps.toFixed(1)}`,
        `frame: ${frameMs.toFixed(2)}ms`,
        `p95: ${p95.toFixed(2)}ms`,
        `drawings: ${state.drawings.length}`,
        `selected: ${state.selection.ids.length}`,
        `mode: ${state.interactionMode}`
      ].join(" | ");
    }

    options.onMetrics?.({
      fps,
      frameMs,
      p95FrameMs: p95,
      drawings: state.drawings.length,
      selected: state.selection.ids.length
    });
  };

  const requestRender = (): void => {
    dirty = true;
    if (raf !== 0) {
      return;
    }
    raf = window.requestAnimationFrame(render);
  };

  const onPointerDown = (event: PointerEvent): void => {
    canvas.focus();
    pointerState.activeId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    const input = pointerToInput(event);
    if (!input) {
      return;
    }
    engine.pointerDown(input);
    requestRender();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pointerState.activeId !== -1 && event.pointerId !== pointerState.activeId) {
      return;
    }
    const input = pointerToInput(event);
    if (!input) {
      return;
    }
    engine.pointerMove(input);
    requestRender();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (pointerState.activeId !== -1 && event.pointerId !== pointerState.activeId) {
      return;
    }
    const input = pointerToInput(event);
    if (input) {
      engine.pointerUp(input);
    }
    pointerState.activeId = -1;
    requestRender();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    engine.keyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey
    });
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
    }
    requestRender();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    engine.keyUp({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey
    });
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("keyup", onKeyUp);

  const unsubscribeEngine = engine.subscribe((event) => {
    if (event.reason !== "metrics") {
      requestRender();
    }
  });

  const onRangeChange = (): void => requestRender();
  chart.timeScale().subscribeVisibleLogicalRangeChange?.(onRangeChange);

  const resizeObserver = new ResizeObserver(() => {
    resizeCanvas();
  });
  resizeObserver.observe(container);
  resizeCanvas();
  requestRender();

  return {
    requestRender,
    detach() {
      if (raf !== 0) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }

      resizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange?.(onRangeChange);
      unsubscribeEngine();

      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);

      canvas.remove();
      debugOverlay.remove();
    },
    canvas
  };
}
