import { nanoid } from "nanoid";
import { DEFAULT_OPTIONS } from "./defaults.js";
import {
  bboxFromPoints,
  equalPoints,
  expandBBoxByPixels,
  hitTestEntity,
  rectContainsBBox,
  translatePoint
} from "./geometry.js";
import { cloneEntities, cloneEntity, HistoryStore } from "./history.js";
import { SpatialIndex } from "./spatial-index.js";
import { BUILTIN_TOOLS } from "./tools.js";
import type {
  DrawingEngine,
  DrawingEntity,
  DrawingPoint,
  DrawingSnapshotV1,
  EngineEvent,
  EngineOptions,
  EngineStateView,
  EngineSubscriber,
  EngineViewport,
  KeyboardInput,
  PointerInput,
  ToolDefinition,
  ToolId
} from "./types.js";

type EngineReason = EngineEvent["reason"];

type InternalInteraction =
  | {
      mode: "idle";
    }
  | {
      mode: "creating";
      tool: ToolDefinition;
      startedAt: number;
      pointerType: PointerInput["pointerType"];
      downScreen: { x: number; y: number };
      points: DrawingPoint[];
      beforeSnapshot: DrawingEntity[];
      pendingHold: boolean;
    }
  | {
      mode: "dragging-selection";
      start: DrawingPoint;
      beforeSnapshot: DrawingEntity[];
      originPoints: Map<string, DrawingPoint[]>;
    }
  | {
      mode: "marquee";
      start: DrawingPoint;
      current: DrawingPoint;
      baseSelection: Set<string>;
    };

interface EngineMutableState {
  activeTool: ToolId;
  drawings: Map<string, DrawingEntity>;
  selection: Set<string>;
  primaryId: string | null;
  interaction: InternalInteraction;
  revision: number;
}

interface InternalMetrics {
  frameSamples: number[];
  frames: number;
  droppedFrames: number;
  lastFrameMs: number;
  p95FrameMs: number;
  lastHitTestMs: number;
}

function styleChanged(a: DrawingEntity[], b: DrawingEntity[]): boolean {
  if (a.length !== b.length) {
    return true;
  }
  for (let i = 0; i < a.length; i += 1) {
    const aa = a[i];
    const bb = b[i];
    if (!aa || !bb || aa.id !== bb.id || aa.updatedAt !== bb.updatedAt || aa.zIndex !== bb.zIndex) {
      return true;
    }
  }
  return false;
}

function normalizeZ(drawings: DrawingEntity[]): DrawingEntity[] {
  const sorted = [...drawings].sort((a, b) => a.zIndex - b.zIndex);
  return sorted.map((drawing, index) => ({
    ...drawing,
    zIndex: index
  }));
}

function modifierUndo(input: KeyboardInput): boolean {
  return (input.ctrlKey ?? false) || (input.metaKey ?? false);
}

export function createDrawingEngine(options: Partial<EngineOptions> = {}): DrawingEngine {
  let opts: EngineOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    defaultStyle: {
      ...DEFAULT_OPTIONS.defaultStyle,
      ...(options.defaultStyle ?? {})
    }
  };

  const toolRegistry = new Map<ToolId, ToolDefinition>();
  for (const tool of BUILTIN_TOOLS) {
    toolRegistry.set(tool.id, tool);
  }

  const state: EngineMutableState = {
    activeTool: opts.initialTool,
    drawings: new Map(),
    selection: new Set(),
    primaryId: null,
    interaction: { mode: "idle" },
    revision: 0
  };

  const metrics: InternalMetrics = {
    frameSamples: [],
    frames: 0,
    droppedFrames: 0,
    lastFrameMs: 0,
    p95FrameMs: 0,
    lastHitTestMs: 0
  };

  const subscribers = new Set<EngineSubscriber>();
  const history = new HistoryStore(opts.historyLimit);
  const index = new SpatialIndex();
  let lastViewport: EngineViewport = {
    logicalPerPixel: 1,
    pricePerPixel: 1
  };

  const supportsRaf = typeof globalThis.requestAnimationFrame === "function";
  let emitQueued = false;
  let queuedReason: EngineReason = "drawings";

  const sortedDrawings = (): DrawingEntity[] =>
    [...state.drawings.values()].sort((a, b) => a.zIndex - b.zIndex);

  const rebuildIndex = (viewport: EngineViewport, tolerancePx: number): void => {
    index.rebuild(sortedDrawings(), viewport, tolerancePx);
  };

  const activeSelectionIds = (): string[] => {
    const ids = [...state.selection].filter((id) => state.drawings.has(id));
    return ids.sort((a, b) => {
      const aa = state.drawings.get(a);
      const bb = state.drawings.get(b);
      return (aa?.zIndex ?? 0) - (bb?.zIndex ?? 0);
    });
  };

  const interactionMode = (): EngineStateView["interactionMode"] => {
    if (state.interaction.mode === "creating") {
      return "creating";
    }
    if (state.interaction.mode === "dragging-selection") {
      return "dragging-selection";
    }
    if (state.interaction.mode === "marquee") {
      return "marquee";
    }
    if (state.activeTool === "text" && state.interaction.mode === "idle") {
      return "idle";
    }
    return "idle";
  };

  const stateView = (): EngineStateView => ({
    activeTool: state.activeTool,
    drawings: sortedDrawings().map(cloneEntity),
    selection: {
      ids: activeSelectionIds(),
      primaryId: state.primaryId,
      marquee:
        state.interaction.mode === "marquee"
          ? {
              start: { ...state.interaction.start },
              current: { ...state.interaction.current }
            }
          : null
    },
    interactionMode: interactionMode(),
    history: history.depth(),
    metrics: {
      frames: metrics.frames,
      droppedFrames: metrics.droppedFrames,
      lastFrameMs: metrics.lastFrameMs,
      p95FrameMs: metrics.p95FrameMs,
      lastHitTestMs: metrics.lastHitTestMs
    },
    revision: state.revision
  });

  const emit = (reason: EngineReason): void => {
    const event: EngineEvent = {
      reason,
      state: stateView()
    };
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  };

  const notify = (reason: EngineReason): void => {
    state.revision += 1;
    if (!opts.emitOnAnimationFrame || !supportsRaf) {
      emit(reason);
      return;
    }
    queuedReason = reason;
    if (emitQueued) {
      return;
    }
    emitQueued = true;
    globalThis.requestAnimationFrame(() => {
      emitQueued = false;
      emit(queuedReason);
    });
  };

  const selectionSet = (ids: string[]): void => {
    state.selection = new Set(ids.filter((id) => state.drawings.has(id)));
    state.primaryId = ids.length > 0 ? ids[ids.length - 1] ?? null : null;
  };

  const addSelection = (ids: string[]): void => {
    for (const id of ids) {
      if (state.drawings.has(id)) {
        state.selection.add(id);
        state.primaryId = id;
      }
    }
  };

  const removeSelection = (id: string): void => {
    state.selection.delete(id);
    if (state.primaryId === id) {
      state.primaryId = activeSelectionIds().at(-1) ?? null;
    }
  };

  const now = (): number => Date.now();

  const toPoint = (input: PointerInput): DrawingPoint => {
    const point: DrawingPoint = {
      logical: input.logical,
      price: input.price
    };

    if (opts.snapMode === "off") {
      return point;
    }

    const snapped: DrawingPoint = {
      logical: Math.round(point.logical),
      price: point.price
    };

    if (opts.snapMode === "strong") {
      const step = Math.max(input.viewport.pricePerPixel * 5, 1e-4);
      snapped.price = Math.round(snapped.price / step) * step;
    }

    return snapped;
  };

  const hitTolerance = (input: PointerInput): number =>
    input.pointerType === "touch" ? opts.hitTolerancePxTouch : opts.hitTolerancePxMouse;

  const pushHistory = (label: string, before: DrawingEntity[], after: DrawingEntity[]): void => {
    if (!styleChanged(before, after)) {
      return;
    }
    history.push({
      label,
      before,
      after,
      at: now()
    });
  };

  const applyDrawings = (entities: DrawingEntity[]): void => {
    state.drawings.clear();
    const normalized = normalizeZ(cloneEntities(entities));
    for (const entity of normalized) {
      state.drawings.set(entity.id, entity);
    }
    state.selection = new Set([...state.selection].filter((id) => state.drawings.has(id)));
    if (state.primaryId && !state.drawings.has(state.primaryId)) {
      state.primaryId = activeSelectionIds().at(-1) ?? null;
    }
    rebuildIndex(lastViewport, opts.hitTolerancePxMouse);
  };

  const highestZ = (): number => {
    let max = -1;
    for (const drawing of state.drawings.values()) {
      max = Math.max(max, drawing.zIndex);
    }
    return max;
  };

  const newEntity = (tool: ToolDefinition, points: DrawingPoint[]): DrawingEntity => {
    const id = nanoid(10);
    const base: DrawingEntity = {
      id,
      tool: tool.id,
      points,
      style: {
        ...opts.defaultStyle,
        ...(tool.defaultStyle ?? {})
      },
      visible: true,
      locked: false,
      zIndex: highestZ() + 1,
      createdAt: now(),
      updatedAt: now()
    };
    if (tool.id === "text") {
      base.text = "Text";
    }
    return base;
  };

  const topMostHit = (
    point: DrawingPoint,
    viewport: EngineViewport,
    tolerancePx: number
  ): { id: string; kind: "body" | "handle"; handleIndex?: number } | null => {
    const startedAt = now();
    const candidateIds = new Set(index.queryPoint(point.logical, point.price));
    const drawings = sortedDrawings().reverse();

    for (const drawing of drawings) {
      if (!drawing.visible) {
        continue;
      }

      if (candidateIds.size > 0 && !candidateIds.has(drawing.id)) {
        continue;
      }

      const hit = hitTestEntity(drawing, point, viewport, tolerancePx);
      if (hit) {
        metrics.lastHitTestMs = now() - startedAt;
        const base = {
          id: drawing.id,
          kind: hit.kind
        } as const;
        return {
          ...base,
          ...(hit.handleIndex !== undefined ? { handleIndex: hit.handleIndex } : {})
        };
      }
    }

    // Fallback when viewport changed enough that the index is stale.
    for (const drawing of drawings) {
      const hit = hitTestEntity(drawing, point, viewport, tolerancePx);
      if (hit) {
        metrics.lastHitTestMs = now() - startedAt;
        const base = {
          id: drawing.id,
          kind: hit.kind
        } as const;
        return {
          ...base,
          ...(hit.handleIndex !== undefined ? { handleIndex: hit.handleIndex } : {})
        };
      }
    }

    metrics.lastHitTestMs = now() - startedAt;
    return null;
  };

  const startCreating = (input: PointerInput, tool: ToolDefinition): void => {
    const before = cloneEntities(sortedDrawings());
    const point = toPoint(input);

    state.interaction = {
      mode: "creating",
      tool,
      startedAt: now(),
      pointerType: input.pointerType,
      downScreen: { x: input.x, y: input.y },
      points: [point],
      beforeSnapshot: before,
      pendingHold:
        opts.enableHoldToDraw && input.pointerType === "touch" && tool.id !== "cursor" && !tool.continuous
    };
  };

  const startDragSelection = (input: PointerInput): void => {
    const ids = activeSelectionIds();
    if (ids.length === 0) {
      return;
    }

    const originPoints = new Map<string, DrawingPoint[]>();
    for (const id of ids) {
      const drawing = state.drawings.get(id);
      if (!drawing || drawing.locked) {
        continue;
      }
      originPoints.set(
        id,
        drawing.points.map((point) => ({ ...point }))
      );
    }

    state.interaction = {
      mode: "dragging-selection",
      start: toPoint(input),
      beforeSnapshot: cloneEntities(sortedDrawings()),
      originPoints
    };
  };

  const applyMarqueeSelection = (
    start: DrawingPoint,
    current: DrawingPoint,
    baseSelection: Set<string>
  ): void => {
    const selectionBounds = bboxFromPoints([start, current]);
    const matched: string[] = [];

    for (const drawing of state.drawings.values()) {
      const drawingBounds = expandBBoxByPixels(
        bboxFromPoints(drawing.points),
        lastViewport,
        drawing.tool === "brush" ? 2 : 1
      );
      if (rectContainsBBox(selectionBounds, drawingBounds)) {
        matched.push(drawing.id);
      }
    }

    const next = new Set<string>(baseSelection);
    for (const id of matched) {
      next.add(id);
    }

    state.selection = next;
    state.primaryId = [...next].at(-1) ?? null;
  };

  const commitNewEntity = (tool: ToolDefinition, points: DrawingPoint[], beforeSnapshot: DrawingEntity[]): void => {
    if (points.length < tool.minPoints) {
      return;
    }

    const entity = newEntity(tool, points);
    const normalized = tool.normalize ? tool.normalize(entity) : entity;
    state.drawings.set(normalized.id, normalized);
    selectionSet([normalized.id]);

    const after = cloneEntities(sortedDrawings());
    pushHistory(`create:${tool.id}`, beforeSnapshot, after);
    rebuildIndex(lastViewport, opts.hitTolerancePxMouse);
    notify("drawings");
  };

  const finishCreating = (input: PointerInput): void => {
    if (state.interaction.mode !== "creating") {
      return;
    }

    const interaction = state.interaction;
    const elapsed = now() - interaction.startedAt;
    if (
      interaction.pendingHold &&
      interaction.pointerType === "touch" &&
      elapsed < opts.holdToDrawMs
    ) {
      state.interaction = { mode: "idle" };
      notify("pointer");
      return;
    }

    const point = toPoint(input);
    const points = [...interaction.points];

    if (interaction.tool.continuous) {
      if (points.length < interaction.tool.minPoints) {
        state.interaction = { mode: "idle" };
        notify("pointer");
        return;
      }
      commitNewEntity(interaction.tool, points, interaction.beforeSnapshot);
      state.interaction = { mode: "idle" };
      return;
    }

    if (interaction.tool.maxPoints === 1) {
      const first = points[0] ?? point;
      commitNewEntity(interaction.tool, [first], interaction.beforeSnapshot);
      state.interaction = { mode: "idle" };
      return;
    }

    const first = points[0] ?? point;
    const second = points[1] ?? point;
    if (equalPoints(first, second, input.viewport, 2)) {
      state.interaction = { mode: "idle" };
      notify("pointer");
      return;
    }

    commitNewEntity(interaction.tool, [first, second], interaction.beforeSnapshot);
    state.interaction = { mode: "idle" };
  };

  const keyboardMoveSelection = (dxPx: number, dyPx: number): void => {
    const selected = activeSelectionIds();
    if (selected.length === 0) {
      return;
    }

    const before = cloneEntities(sortedDrawings());
    const delta: DrawingPoint = {
      logical: dxPx * lastViewport.logicalPerPixel,
      price: dyPx * lastViewport.pricePerPixel
    };

    for (const id of selected) {
      const drawing = state.drawings.get(id);
      if (!drawing || drawing.locked) {
        continue;
      }
      drawing.points = drawing.points.map((point) => translatePoint(point, delta));
      drawing.updatedAt = now();
    }

    const after = cloneEntities(sortedDrawings());
    pushHistory("move-selection:keyboard", before, after);
    rebuildIndex(lastViewport, opts.hitTolerancePxMouse);
    notify("drawings");
  };

  const engine: DrawingEngine = {
    setTool(tool) {
      if (!toolRegistry.has(tool)) {
        throw new Error(`Unknown tool: ${tool}`);
      }
      state.activeTool = tool;
      state.interaction = { mode: "idle" };
      notify("tool");
    },

    setOptions(nextOptions) {
      opts = {
        ...opts,
        ...nextOptions,
        defaultStyle: {
          ...opts.defaultStyle,
          ...(nextOptions.defaultStyle ?? {})
        }
      };
      notify("tool");
    },

    registerTool(definition) {
      toolRegistry.set(definition.id, definition);
      notify("tool");
    },

    pointerDown(input) {
      lastViewport = input.viewport;
      const tolerance = hitTolerance(input);
      rebuildIndex(input.viewport, tolerance);
      const point = toPoint(input);

      if (state.activeTool === "cursor") {
        const hit = topMostHit(point, input.viewport, tolerance);
        if (hit) {
          if (input.shiftKey) {
            if (state.selection.has(hit.id)) {
              removeSelection(hit.id);
            } else {
              addSelection([hit.id]);
            }
          } else if (!state.selection.has(hit.id)) {
            selectionSet([hit.id]);
          }

          const canDrag =
            !input.shiftKey &&
            input.button !== 2 &&
            activeSelectionIds().some((id) => !state.drawings.get(id)?.locked);

          if (canDrag) {
            if (input.altKey && activeSelectionIds().length > 0) {
              const before = cloneEntities(sortedDrawings());
              const duplicateIds: string[] = [];
              const delta = {
                logical: input.viewport.logicalPerPixel * 14,
                price: input.viewport.pricePerPixel * -14
              };

              for (const id of activeSelectionIds()) {
                const drawing = state.drawings.get(id);
                if (!drawing) {
                  continue;
                }
                const copy = cloneEntity(drawing);
                copy.id = nanoid(10);
                copy.points = copy.points.map((p) => translatePoint(p, delta));
                copy.createdAt = now();
                copy.updatedAt = now();
                copy.zIndex = highestZ() + 1;
                state.drawings.set(copy.id, copy);
                duplicateIds.push(copy.id);
              }

              selectionSet(duplicateIds);
              const after = cloneEntities(sortedDrawings());
              pushHistory("duplicate:alt-drag", before, after);
            }
            startDragSelection(input);
          } else {
            state.interaction = { mode: "idle" };
          }
        } else {
          if (!input.shiftKey) {
            selectionSet([]);
          }
          state.interaction = {
            mode: "marquee",
            start: point,
            current: point,
            baseSelection: input.shiftKey ? new Set(state.selection) : new Set()
          };
        }

        notify("pointer");
        return;
      }

      const tool = toolRegistry.get(state.activeTool);
      if (!tool) {
        return;
      }

      startCreating(input, tool);
      notify("pointer");
    },

    pointerMove(input) {
      lastViewport = input.viewport;

      if (state.interaction.mode === "creating") {
        const interaction = state.interaction;
        const point = toPoint(input);

        if (interaction.pendingHold) {
          const elapsed = now() - interaction.startedAt;
          const movedPx = Math.hypot(
            input.x - interaction.downScreen.x,
            input.y - interaction.downScreen.y
          );
          if (elapsed >= opts.holdToDrawMs || movedPx >= opts.holdMoveTolerancePx) {
            interaction.pendingHold = false;
          }
        }

        if (interaction.pendingHold) {
          return;
        }

        if (interaction.tool.continuous) {
          const last = interaction.points.at(-1);
          if (!last || !equalPoints(last, point, input.viewport, 1)) {
            interaction.points.push(point);
          }
        } else if (interaction.tool.maxPoints > 1) {
          if (interaction.points.length === 1) {
            interaction.points.push(point);
          } else {
            interaction.points[1] = point;
          }
        }

        notify("pointer");
        return;
      }

      if (state.interaction.mode === "dragging-selection") {
        const interaction = state.interaction;
        const delta: DrawingPoint = {
          logical: toPoint(input).logical - interaction.start.logical,
          price: toPoint(input).price - interaction.start.price
        };

        for (const [id, points] of interaction.originPoints.entries()) {
          const drawing = state.drawings.get(id);
          if (!drawing || drawing.locked) {
            continue;
          }
          drawing.points = points.map((point) => translatePoint(point, delta));
          drawing.updatedAt = now();
        }

        rebuildIndex(input.viewport, hitTolerance(input));
        notify("drawings");
        return;
      }

      if (state.interaction.mode === "marquee") {
        state.interaction.current = toPoint(input);
        applyMarqueeSelection(
          state.interaction.start,
          state.interaction.current,
          state.interaction.baseSelection
        );
        notify("selection");
      }
    },

    pointerUp(input) {
      lastViewport = input.viewport;

      if (state.interaction.mode === "creating") {
        finishCreating(input);
        return;
      }

      if (state.interaction.mode === "dragging-selection") {
        const before = state.interaction.beforeSnapshot;
        const after = cloneEntities(sortedDrawings());
        pushHistory("move-selection:pointer", before, after);
        state.interaction = { mode: "idle" };
        rebuildIndex(input.viewport, hitTolerance(input));
        notify("drawings");
        return;
      }

      if (state.interaction.mode === "marquee") {
        state.interaction = { mode: "idle" };
        notify("selection");
      }
    },

    keyDown(input) {
      const isUndo = modifierUndo(input) && input.key.toLowerCase() === "z";
      const isRedo =
        modifierUndo(input) &&
        ((input.shiftKey && input.key.toLowerCase() === "z") || input.key.toLowerCase() === "y");

      if (isUndo) {
        this.undo();
        return;
      }
      if (isRedo) {
        this.redo();
        return;
      }

      if (input.key === "Escape") {
        state.interaction = { mode: "idle" };
        notify("keyboard");
        return;
      }

      if (input.key === "Delete" || input.key === "Backspace") {
        this.deleteSelection();
        return;
      }

      if ((input.ctrlKey || input.metaKey) && input.key.toLowerCase() === "a") {
        this.selectAll();
        return;
      }

      if (input.key === "ArrowLeft") {
        keyboardMoveSelection(-1, 0);
        return;
      }
      if (input.key === "ArrowRight") {
        keyboardMoveSelection(1, 0);
        return;
      }
      if (input.key === "ArrowUp") {
        keyboardMoveSelection(0, -1);
        return;
      }
      if (input.key === "ArrowDown") {
        keyboardMoveSelection(0, 1);
        return;
      }

      if ((input.ctrlKey || input.metaKey) && input.key.toLowerCase() === "d") {
        this.duplicateSelection();
      }
    },

    keyUp() {
      // Reserved for modifier-state synchronization in host adapters.
    },

    undo() {
      const frame = history.undo();
      if (!frame) {
        return;
      }
      applyDrawings(frame.before);
      notify("history");
    },

    redo() {
      const frame = history.redo();
      if (!frame) {
        return;
      }
      applyDrawings(frame.after);
      notify("history");
    },

    deleteSelection() {
      const ids = activeSelectionIds();
      if (ids.length === 0) {
        return;
      }
      const before = cloneEntities(sortedDrawings());
      for (const id of ids) {
        state.drawings.delete(id);
      }
      selectionSet([]);
      state.interaction = { mode: "idle" };
      const after = cloneEntities(sortedDrawings());
      pushHistory("delete-selection", before, after);
      rebuildIndex(lastViewport, opts.hitTolerancePxMouse);
      notify("drawings");
    },

    selectAll() {
      selectionSet(sortedDrawings().map((drawing) => drawing.id));
      notify("selection");
    },

    clearSelection() {
      selectionSet([]);
      notify("selection");
    },

    setVisibility(ids, visible) {
      if (ids.length === 0) {
        return;
      }
      const before = cloneEntities(sortedDrawings());
      for (const id of ids) {
        const drawing = state.drawings.get(id);
        if (!drawing) {
          continue;
        }
        drawing.visible = visible;
        drawing.updatedAt = now();
      }
      const after = cloneEntities(sortedDrawings());
      pushHistory("visibility", before, after);
      rebuildIndex(lastViewport, opts.hitTolerancePxMouse);
      notify("drawings");
    },

    setLocked(ids, locked) {
      if (ids.length === 0) {
        return;
      }
      const before = cloneEntities(sortedDrawings());
      for (const id of ids) {
        const drawing = state.drawings.get(id);
        if (!drawing) {
          continue;
        }
        drawing.locked = locked;
        drawing.updatedAt = now();
      }
      const after = cloneEntities(sortedDrawings());
      pushHistory("lock", before, after);
      notify("drawings");
    },

    bringToFront(ids) {
      if (ids.length === 0) {
        return;
      }
      const before = cloneEntities(sortedDrawings());
      let z = highestZ();
      for (const id of ids) {
        const drawing = state.drawings.get(id);
        if (!drawing) {
          continue;
        }
        z += 1;
        drawing.zIndex = z;
        drawing.updatedAt = now();
      }

      const normalized = normalizeZ(sortedDrawings());
      applyDrawings(normalized);
      const after = cloneEntities(sortedDrawings());
      pushHistory("bring-to-front", before, after);
      notify("drawings");
    },

    sendToBack(ids) {
      if (ids.length === 0) {
        return;
      }
      const before = cloneEntities(sortedDrawings());
      let z = -ids.length;
      for (const id of ids) {
        const drawing = state.drawings.get(id);
        if (!drawing) {
          continue;
        }
        drawing.zIndex = z;
        z += 1;
        drawing.updatedAt = now();
      }

      const normalized = normalizeZ(sortedDrawings());
      applyDrawings(normalized);
      const after = cloneEntities(sortedDrawings());
      pushHistory("send-to-back", before, after);
      notify("drawings");
    },

    duplicateSelection() {
      const ids = activeSelectionIds();
      if (ids.length === 0) {
        return;
      }
      const before = cloneEntities(sortedDrawings());
      const nextIds: string[] = [];
      const delta = {
        logical: lastViewport.logicalPerPixel * 18,
        price: lastViewport.pricePerPixel * -18
      };

      for (const id of ids) {
        const drawing = state.drawings.get(id);
        if (!drawing) {
          continue;
        }
        const copy = cloneEntity(drawing);
        copy.id = nanoid(10);
        copy.zIndex = highestZ() + 1;
        copy.points = copy.points.map((point) => translatePoint(point, delta));
        copy.createdAt = now();
        copy.updatedAt = now();
        state.drawings.set(copy.id, copy);
        nextIds.push(copy.id);
      }

      selectionSet(nextIds);
      const after = cloneEntities(sortedDrawings());
      pushHistory("duplicate-selection", before, after);
      rebuildIndex(lastViewport, opts.hitTolerancePxMouse);
      notify("drawings");
    },

    exportSnapshot(): DrawingSnapshotV1 {
      return {
        version: "1",
        drawings: cloneEntities(sortedDrawings()),
        groups: [],
        prefs: {
          activeTool: state.activeTool,
          snapMode: opts.snapMode
        }
      };
    },

    importSnapshot(snapshot) {
      if (snapshot.version !== "1") {
        throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
      }
      applyDrawings(snapshot.drawings);
      state.activeTool = snapshot.prefs.activeTool;
      opts = {
        ...opts,
        snapMode: snapshot.prefs.snapMode
      };
      selectionSet([]);
      state.interaction = { mode: "idle" };
      history.clear();
      notify("import");
    },

    getState() {
      return stateView();
    },

    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },

    reportFrame(frameMs) {
      metrics.frames += 1;
      metrics.lastFrameMs = frameMs;
      if (frameMs > 16.7) {
        metrics.droppedFrames += 1;
      }
      metrics.frameSamples.push(frameMs);
      if (metrics.frameSamples.length > 240) {
        metrics.frameSamples.shift();
      }
      const sorted = [...metrics.frameSamples].sort((a, b) => a - b);
      const idx = Math.floor(sorted.length * 0.95);
      metrics.p95FrameMs = sorted[Math.max(0, idx - 1)] ?? frameMs;
      notify("metrics");
    }
  };

  if (!toolRegistry.has(opts.initialTool)) {
    state.activeTool = "cursor";
  }

  rebuildIndex(lastViewport, opts.hitTolerancePxMouse);
  return engine;
}
