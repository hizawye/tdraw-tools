import type { ToolDefinition } from "./types.js";

export const BUILTIN_TOOLS: ToolDefinition[] = [
  { id: "cursor", minPoints: 0, maxPoints: 0 },
  { id: "trend_line", minPoints: 2, maxPoints: 2 },
  { id: "horizontal_line", minPoints: 1, maxPoints: 1 },
  { id: "vertical_line", minPoints: 1, maxPoints: 1 },
  { id: "ray", minPoints: 2, maxPoints: 2 },
  { id: "extended_line", minPoints: 2, maxPoints: 2 },
  { id: "rectangle", minPoints: 2, maxPoints: 2 },
  { id: "arrow", minPoints: 2, maxPoints: 2 },
  { id: "ruler", minPoints: 2, maxPoints: 2 },
  { id: "fibonacci", minPoints: 2, maxPoints: 2 },
  { id: "brush", minPoints: 2, maxPoints: 5000, continuous: true },
  { id: "text", minPoints: 1, maxPoints: 1 }
];
