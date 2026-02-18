export type BuiltinToolId =
  | "cursor"
  | "trend_line"
  | "horizontal_line"
  | "vertical_line"
  | "ray"
  | "extended_line"
  | "rectangle"
  | "arrow"
  | "ruler"
  | "fibonacci"
  | "brush"
  | "text";

export type ToolId = BuiltinToolId | (string & {});

export type DrawingLineStyle = "solid" | "dashed" | "dotted";

export interface DrawingPoint {
  logical: number;
  price: number;
}

export interface DrawingStyle {
  strokeColor: string;
  fillColor: string;
  textColor: string;
  lineWidth: number;
  lineStyle: DrawingLineStyle;
  opacity: number;
  showLabel: boolean;
}

export interface DrawingEntity {
  id: string;
  tool: ToolId;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;
  visible: boolean;
  locked: boolean;
  groupId?: string;
  zIndex: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SelectionState {
  ids: string[];
  primaryId: string | null;
  marquee: MarqueeSelection | null;
}

export interface MarqueeSelection {
  start: DrawingPoint;
  current: DrawingPoint;
}

export interface EngineViewport {
  logicalPerPixel: number;
  pricePerPixel: number;
}

export interface PointerInput {
  x: number;
  y: number;
  logical: number;
  price: number;
  viewport: EngineViewport;
  pointerId?: number;
  pointerType?: "mouse" | "touch" | "pen";
  button?: number;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface KeyboardInput {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface ToolDefinition {
  id: ToolId;
  minPoints: number;
  maxPoints: number;
  continuous?: boolean;
  defaultStyle?: Partial<DrawingStyle>;
  normalize?: (entity: DrawingEntity) => DrawingEntity;
}

export interface EngineOptions {
  initialTool: ToolId;
  defaultStyle: DrawingStyle;
  historyLimit: number;
  hitTolerancePxMouse: number;
  hitTolerancePxTouch: number;
  snapMode: "off" | "weak" | "strong";
  emitOnAnimationFrame: boolean;
  enableHoldToDraw: boolean;
  holdToDrawMs: number;
  holdMoveTolerancePx: number;
}

export interface EngineMetrics {
  frames: number;
  droppedFrames: number;
  lastFrameMs: number;
  p95FrameMs: number;
  lastHitTestMs: number;
}

export interface EngineStateView {
  activeTool: ToolId;
  drawings: DrawingEntity[];
  selection: SelectionState;
  interactionMode: InteractionMode;
  history: {
    undoDepth: number;
    redoDepth: number;
  };
  metrics: EngineMetrics;
  revision: number;
}

export type InteractionMode =
  | "idle"
  | "creating"
  | "dragging-selection"
  | "marquee"
  | "editing-text";

export interface EngineEvent {
  reason:
    | "tool"
    | "pointer"
    | "keyboard"
    | "selection"
    | "drawings"
    | "history"
    | "import"
    | "metrics";
  state: EngineStateView;
}

export type EngineSubscriber = (event: EngineEvent) => void;

export interface HistoryFrame {
  label: string;
  before: DrawingEntity[];
  after: DrawingEntity[];
  at: number;
}

export interface DrawingSnapshotV1 {
  version: "1";
  drawings: DrawingEntity[];
  groups: Array<{ id: string; name?: string }>;
  prefs: {
    activeTool: ToolId;
    snapMode: EngineOptions["snapMode"];
  };
  meta?: Record<string, unknown>;
}

export interface DrawingEngine {
  setTool: (tool: ToolId) => void;
  setOptions: (options: Partial<EngineOptions>) => void;
  registerTool: (definition: ToolDefinition) => void;
  pointerDown: (input: PointerInput) => void;
  pointerMove: (input: PointerInput) => void;
  pointerUp: (input: PointerInput) => void;
  keyDown: (input: KeyboardInput) => void;
  keyUp: (input: KeyboardInput) => void;
  undo: () => void;
  redo: () => void;
  deleteSelection: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  setVisibility: (ids: string[], visible: boolean) => void;
  setLocked: (ids: string[], locked: boolean) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  duplicateSelection: () => void;
  exportSnapshot: () => DrawingSnapshotV1;
  importSnapshot: (snapshot: DrawingSnapshotV1) => void;
  getState: () => EngineStateView;
  subscribe: (subscriber: EngineSubscriber) => () => void;
  reportFrame: (frameMs: number) => void;
}
