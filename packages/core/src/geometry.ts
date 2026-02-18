import type { DrawingEntity, DrawingPoint, EngineViewport, ToolId } from "./types.js";

export interface ModelBBox {
  minLogical: number;
  maxLogical: number;
  minPrice: number;
  maxPrice: number;
}

export interface HitTestResult {
  kind: "body" | "handle";
  handleIndex?: number;
}

const EPS = 1e-9;
const TEXT_BOX_WIDTH_PX = 130;
const TEXT_BOX_HEIGHT_PX = 44;

export function normalizeBBox(bbox: ModelBBox): ModelBBox {
  return {
    minLogical: Math.min(bbox.minLogical, bbox.maxLogical),
    maxLogical: Math.max(bbox.minLogical, bbox.maxLogical),
    minPrice: Math.min(bbox.minPrice, bbox.maxPrice),
    maxPrice: Math.max(bbox.minPrice, bbox.maxPrice)
  };
}

export function bboxFromPoints(points: DrawingPoint[]): ModelBBox {
  if (points.length === 0) {
    return {
      minLogical: 0,
      maxLogical: 0,
      minPrice: 0,
      maxPrice: 0
    };
  }

  const first = points[0];
  if (!first) {
    return {
      minLogical: 0,
      maxLogical: 0,
      minPrice: 0,
      maxPrice: 0
    };
  }

  let minLogical = first.logical;
  let maxLogical = first.logical;
  let minPrice = first.price;
  let maxPrice = first.price;

  for (const point of points) {
    minLogical = Math.min(minLogical, point.logical);
    maxLogical = Math.max(maxLogical, point.logical);
    minPrice = Math.min(minPrice, point.price);
    maxPrice = Math.max(maxPrice, point.price);
  }

  return { minLogical, maxLogical, minPrice, maxPrice };
}

export function expandBBoxByPixels(
  bbox: ModelBBox,
  viewport: EngineViewport,
  pixels: number
): ModelBBox {
  const logicalPadding = Math.max(viewport.logicalPerPixel * pixels, EPS);
  const pricePadding = Math.max(viewport.pricePerPixel * pixels, EPS);
  return {
    minLogical: bbox.minLogical - logicalPadding,
    maxLogical: bbox.maxLogical + logicalPadding,
    minPrice: bbox.minPrice - pricePadding,
    maxPrice: bbox.maxPrice + pricePadding
  };
}

export function entityBBox(entity: DrawingEntity, viewport: EngineViewport): ModelBBox {
  const bbox = bboxFromPoints(entity.points);

  if (entity.tool === "horizontal_line" && entity.points[0]) {
    return {
      minLogical: bbox.minLogical - viewport.logicalPerPixel * 4,
      maxLogical: bbox.maxLogical + viewport.logicalPerPixel * 4,
      minPrice: entity.points[0].price,
      maxPrice: entity.points[0].price
    };
  }

  if (entity.tool === "vertical_line" && entity.points[0]) {
    return {
      minLogical: entity.points[0].logical,
      maxLogical: entity.points[0].logical,
      minPrice: bbox.minPrice - viewport.pricePerPixel * 4,
      maxPrice: bbox.maxPrice + viewport.pricePerPixel * 4
    };
  }

  if (entity.tool === "text" && entity.points[0]) {
    const logicalWidth = viewport.logicalPerPixel * TEXT_BOX_WIDTH_PX;
    const priceHeight = viewport.pricePerPixel * TEXT_BOX_HEIGHT_PX;
    return {
      minLogical: entity.points[0].logical,
      maxLogical: entity.points[0].logical + logicalWidth,
      minPrice: entity.points[0].price - priceHeight,
      maxPrice: entity.points[0].price
    };
  }

  return bbox;
}

export function translatePoint(point: DrawingPoint, delta: DrawingPoint): DrawingPoint {
  return {
    logical: point.logical + delta.logical,
    price: point.price + delta.price
  };
}

function distPointPx(a: DrawingPoint, b: DrawingPoint, viewport: EngineViewport): number {
  const dx = (a.logical - b.logical) / Math.max(viewport.logicalPerPixel, EPS);
  const dy = (a.price - b.price) / Math.max(viewport.pricePerPixel, EPS);
  return Math.hypot(dx, dy);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function segmentDistancePx(
  p: DrawingPoint,
  a: DrawingPoint,
  b: DrawingPoint,
  viewport: EngineViewport
): number {
  const ax = a.logical;
  const ay = a.price;
  const bx = b.logical;
  const by = b.price;
  const px = p.logical;
  const py = p.price;

  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  if (denom < EPS) {
    return distPointPx(p, a, viewport);
  }

  const t = clamp(((px - ax) * dx + (py - ay) * dy) / denom, 0, 1);
  const proj: DrawingPoint = {
    logical: ax + t * dx,
    price: ay + t * dy
  };
  return distPointPx(p, proj, viewport);
}

function rayDistancePx(
  p: DrawingPoint,
  a: DrawingPoint,
  b: DrawingPoint,
  viewport: EngineViewport
): number {
  const ax = a.logical;
  const ay = a.price;
  const bx = b.logical;
  const by = b.price;
  const px = p.logical;
  const py = p.price;

  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  if (denom < EPS) {
    return distPointPx(p, a, viewport);
  }

  const t = Math.max(((px - ax) * dx + (py - ay) * dy) / denom, 0);
  const proj: DrawingPoint = {
    logical: ax + t * dx,
    price: ay + t * dy
  };
  return distPointPx(p, proj, viewport);
}

function lineDistancePx(
  p: DrawingPoint,
  a: DrawingPoint,
  b: DrawingPoint,
  viewport: EngineViewport
): number {
  const ax = a.logical;
  const ay = a.price;
  const bx = b.logical;
  const by = b.price;
  const px = p.logical;
  const py = p.price;

  const dx = bx - ax;
  const dy = by - ay;
  const denom = dx * dx + dy * dy;
  if (denom < EPS) {
    return distPointPx(p, a, viewport);
  }

  const t = ((px - ax) * dx + (py - ay) * dy) / denom;
  const proj: DrawingPoint = {
    logical: ax + t * dx,
    price: ay + t * dy
  };

  return distPointPx(p, proj, viewport);
}

function nearRectEdge(
  p: DrawingPoint,
  a: DrawingPoint,
  b: DrawingPoint,
  viewport: EngineViewport,
  tolerancePx: number
): boolean {
  const minLogical = Math.min(a.logical, b.logical);
  const maxLogical = Math.max(a.logical, b.logical);
  const minPrice = Math.min(a.price, b.price);
  const maxPrice = Math.max(a.price, b.price);

  const leftA: DrawingPoint = { logical: minLogical, price: minPrice };
  const leftB: DrawingPoint = { logical: minLogical, price: maxPrice };
  const rightA: DrawingPoint = { logical: maxLogical, price: minPrice };
  const rightB: DrawingPoint = { logical: maxLogical, price: maxPrice };
  const topA: DrawingPoint = { logical: minLogical, price: maxPrice };
  const topB: DrawingPoint = { logical: maxLogical, price: maxPrice };
  const bottomA: DrawingPoint = { logical: minLogical, price: minPrice };
  const bottomB: DrawingPoint = { logical: maxLogical, price: minPrice };

  return (
    segmentDistancePx(p, leftA, leftB, viewport) <= tolerancePx ||
    segmentDistancePx(p, rightA, rightB, viewport) <= tolerancePx ||
    segmentDistancePx(p, topA, topB, viewport) <= tolerancePx ||
    segmentDistancePx(p, bottomA, bottomB, viewport) <= tolerancePx
  );
}

function isLineTool(tool: ToolId): boolean {
  return (
    tool === "trend_line" ||
    tool === "arrow" ||
    tool === "ruler" ||
    tool === "fibonacci" ||
    tool === "ray" ||
    tool === "extended_line"
  );
}

export function hitTestEntity(
  entity: DrawingEntity,
  point: DrawingPoint,
  viewport: EngineViewport,
  tolerancePx: number
): HitTestResult | null {
  if (!entity.visible) {
    return null;
  }

  for (let index = 0; index < entity.points.length; index += 1) {
    const handle = entity.points[index];
    if (!handle) {
      continue;
    }
    if (distPointPx(point, handle, viewport) <= tolerancePx) {
      return { kind: "handle", handleIndex: index };
    }
  }

  if (isLineTool(entity.tool) && entity.points.length >= 2) {
    const [a, b] = entity.points;
    if (!a || !b) {
      return null;
    }
    if (entity.tool === "ray" && rayDistancePx(point, a, b, viewport) <= tolerancePx) {
      return { kind: "body" };
    }
    if (entity.tool === "extended_line" && lineDistancePx(point, a, b, viewport) <= tolerancePx) {
      return { kind: "body" };
    }
    if (segmentDistancePx(point, a, b, viewport) <= tolerancePx) {
      return { kind: "body" };
    }
  }

  if (entity.tool === "horizontal_line" && entity.points[0]) {
    const dy = Math.abs((point.price - entity.points[0].price) / Math.max(viewport.pricePerPixel, EPS));
    if (dy <= tolerancePx) {
      return { kind: "body" };
    }
  }

  if (entity.tool === "vertical_line" && entity.points[0]) {
    const dx = Math.abs(
      (point.logical - entity.points[0].logical) / Math.max(viewport.logicalPerPixel, EPS)
    );
    if (dx <= tolerancePx) {
      return { kind: "body" };
    }
  }

  if (entity.tool === "rectangle" && entity.points.length >= 2) {
    const [a, b] = entity.points;
    if (!a || !b) {
      return null;
    }
    if (nearRectEdge(point, a, b, viewport, tolerancePx)) {
      return { kind: "body" };
    }
  }

  if (entity.tool === "brush" && entity.points.length > 1) {
    for (let i = 1; i < entity.points.length; i += 1) {
      const prev = entity.points[i - 1];
      const curr = entity.points[i];
      if (!prev || !curr) {
        continue;
      }
      if (segmentDistancePx(point, prev, curr, viewport) <= tolerancePx) {
        return { kind: "body" };
      }
    }
  }

  if (entity.tool === "text" && entity.points[0]) {
    const logicalWidth = viewport.logicalPerPixel * TEXT_BOX_WIDTH_PX;
    const priceHeight = viewport.pricePerPixel * TEXT_BOX_HEIGHT_PX;
    const anchor = entity.points[0];
    const insideX = point.logical >= anchor.logical && point.logical <= anchor.logical + logicalWidth;
    const insideY = point.price <= anchor.price && point.price >= anchor.price - priceHeight;
    if (insideX && insideY) {
      return { kind: "body" };
    }
  }

  return null;
}

export function rectContainsBBox(selection: ModelBBox, entity: ModelBBox): boolean {
  const normalizedSelection = normalizeBBox(selection);
  return (
    entity.minLogical >= normalizedSelection.minLogical &&
    entity.maxLogical <= normalizedSelection.maxLogical &&
    entity.minPrice >= normalizedSelection.minPrice &&
    entity.maxPrice <= normalizedSelection.maxPrice
  );
}

export function equalPoints(a: DrawingPoint, b: DrawingPoint, viewport: EngineViewport, px = 1): boolean {
  return distPointPx(a, b, viewport) <= px;
}
