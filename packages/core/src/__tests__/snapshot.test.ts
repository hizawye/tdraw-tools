import { describe, expect, it } from "vitest";
import { createDrawingEngine } from "../engine";
import type { PointerInput } from "../types";

function input(logical: number, price: number): PointerInput {
  return {
    x: logical,
    y: price,
    logical,
    price,
    viewport: {
      logicalPerPixel: 1,
      pricePerPixel: 1
    },
    pointerType: "mouse",
    button: 0
  };
}

describe("snapshot", () => {
  it("round-trips drawing state", () => {
    const engine = createDrawingEngine({ emitOnAnimationFrame: false });

    engine.setTool("text");
    engine.pointerDown(input(12, 120));
    engine.pointerUp(input(12, 120));

    const snapshot = engine.exportSnapshot();
    const next = createDrawingEngine({ emitOnAnimationFrame: false });
    next.importSnapshot(snapshot);

    expect(next.getState().drawings).toHaveLength(1);
    expect(next.getState().drawings[0]?.tool).toBe("text");
  });
});
