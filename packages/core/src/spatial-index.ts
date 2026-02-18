import RBush from "rbush";
import type { DrawingEntity, EngineViewport } from "./types.js";
import { entityBBox, expandBBoxByPixels } from "./geometry.js";

interface IndexItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

export class SpatialIndex {
  private readonly tree = new RBush<IndexItem>();

  rebuild(drawings: DrawingEntity[], viewport: EngineViewport, tolerancePx: number): void {
    this.tree.clear();
    const items: IndexItem[] = [];

    for (const drawing of drawings) {
      if (!drawing.visible) {
        continue;
      }
      const bbox = expandBBoxByPixels(entityBBox(drawing, viewport), viewport, tolerancePx);
      items.push({
        minX: bbox.minLogical,
        minY: bbox.minPrice,
        maxX: bbox.maxLogical,
        maxY: bbox.maxPrice,
        id: drawing.id
      });
    }

    if (items.length > 0) {
      this.tree.load(items);
    }
  }

  queryPoint(logical: number, price: number): string[] {
    const hits = this.tree.search({
      minX: logical,
      minY: price,
      maxX: logical,
      maxY: price
    });
    return hits.map((item) => item.id);
  }
}
