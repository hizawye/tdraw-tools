import type { DrawingStyle, EngineOptions } from "./types.js";

export const DEFAULT_STYLE: DrawingStyle = {
  strokeColor: "#2a7fff",
  fillColor: "rgba(42, 127, 255, 0.16)",
  textColor: "#101820",
  lineWidth: 2,
  lineStyle: "solid",
  opacity: 1,
  showLabel: true
};

export const DEFAULT_OPTIONS: EngineOptions = {
  initialTool: "cursor",
  defaultStyle: DEFAULT_STYLE,
  historyLimit: 300,
  hitTolerancePxMouse: 6,
  hitTolerancePxTouch: 14,
  snapMode: "weak",
  emitOnAnimationFrame: true,
  enableHoldToDraw: true,
  holdToDrawMs: 180,
  holdMoveTolerancePx: 6
};
