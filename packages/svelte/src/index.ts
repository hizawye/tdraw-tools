import { writable, type Readable } from "svelte/store";
import type {
  DrawingEngine,
  EngineEvent,
  EngineStateView,
  PointerInput,
  ToolId
} from "@tdraw-tools/core";

export interface DrawingController {
  state: Readable<EngineStateView>;
  setTool: (tool: ToolId) => void;
  pointerDown: (input: PointerInput) => void;
  pointerMove: (input: PointerInput) => void;
  pointerUp: (input: PointerInput) => void;
  undo: () => void;
  redo: () => void;
  deleteSelection: () => void;
  destroy: () => void;
}

export function createDrawingController(engine: DrawingEngine): DrawingController {
  const store = writable<EngineStateView>(engine.getState());
  const unsubscribe = engine.subscribe((event: EngineEvent) => {
    store.set(event.state);
  });

  return {
    state: {
      subscribe: store.subscribe
    },
    setTool(tool) {
      engine.setTool(tool);
    },
    pointerDown(input) {
      engine.pointerDown(input);
    },
    pointerMove(input) {
      engine.pointerMove(input);
    },
    pointerUp(input) {
      engine.pointerUp(input);
    },
    undo() {
      engine.undo();
    },
    redo() {
      engine.redo();
    },
    deleteSelection() {
      engine.deleteSelection();
    },
    destroy() {
      unsubscribe();
    }
  };
}
