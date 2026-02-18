import { describe, expect, it } from "vitest";
import { createDrawingEngine } from "../engine";
import type { PointerInput } from "../types";

function input(
  logical: number,
  price: number,
  overrides: Partial<PointerInput> = {}
): PointerInput {
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
    button: 0,
    ...overrides
  };
}

describe("drawing engine", () => {
  it("creates a line and supports undo/redo", () => {
    const engine = createDrawingEngine({ emitOnAnimationFrame: false });

    engine.setTool("trend_line");
    engine.pointerDown(input(10, 100));
    engine.pointerMove(input(20, 90));
    engine.pointerUp(input(20, 90));

    expect(engine.getState().drawings).toHaveLength(1);

    engine.undo();
    expect(engine.getState().drawings).toHaveLength(0);

    engine.redo();
    expect(engine.getState().drawings).toHaveLength(1);
  });

  it("selects and deletes via cursor", () => {
    const engine = createDrawingEngine({ emitOnAnimationFrame: false });

    engine.setTool("horizontal_line");
    engine.pointerDown(input(10, 100));
    engine.pointerUp(input(10, 100));

    engine.setTool("cursor");
    engine.pointerDown(input(12, 100));
    engine.pointerUp(input(12, 100));

    expect(engine.getState().selection.ids).toHaveLength(1);

    engine.deleteSelection();
    expect(engine.getState().drawings).toHaveLength(0);
  });

  it("marquee-selects multiple drawings", () => {
    const engine = createDrawingEngine({ emitOnAnimationFrame: false });

    engine.setTool("vertical_line");
    engine.pointerDown(input(10, 100));
    engine.pointerUp(input(10, 100));

    engine.pointerDown(input(30, 100));
    engine.pointerUp(input(30, 100));

    engine.setTool("cursor");
    engine.pointerDown(input(-20, 110));
    engine.pointerMove(input(40, 90));
    engine.pointerUp(input(40, 90));

    expect(engine.getState().selection.ids.length).toBeGreaterThanOrEqual(2);
  });
});
