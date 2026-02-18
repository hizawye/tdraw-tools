import { describe, expect, it } from "vitest";
import { hitTestEntity } from "../geometry";
import type { DrawingEntity, EngineViewport } from "../types";

const viewport: EngineViewport = {
  logicalPerPixel: 1,
  pricePerPixel: 1
};

function line(tool: DrawingEntity["tool"]): DrawingEntity {
  return {
    id: "a",
    tool,
    points: [
      { logical: 10, price: 100 },
      { logical: 20, price: 90 }
    ],
    style: {
      strokeColor: "#000",
      fillColor: "#0000",
      textColor: "#000",
      lineWidth: 2,
      lineStyle: "solid",
      opacity: 1,
      showLabel: true
    },
    visible: true,
    locked: false,
    zIndex: 0,
    createdAt: 0,
    updatedAt: 0
  };
}

describe("hitTestEntity", () => {
  it("hits line body", () => {
    const entity = line("trend_line");
    const hit = hitTestEntity(entity, { logical: 15, price: 95 }, viewport, 6);
    expect(hit?.kind).toBe("body");
  });

  it("hits handle", () => {
    const entity = line("trend_line");
    const hit = hitTestEntity(entity, { logical: 10, price: 100 }, viewport, 4);
    expect(hit?.kind).toBe("handle");
    expect(hit?.handleIndex).toBe(0);
  });

  it("hits rectangle edge", () => {
    const entity = {
      ...line("rectangle"),
      points: [
        { logical: 10, price: 100 },
        { logical: 20, price: 90 }
      ]
    };
    const hit = hitTestEntity(entity, { logical: 10, price: 95 }, viewport, 4);
    expect(hit?.kind).toBe("body");
  });
});
