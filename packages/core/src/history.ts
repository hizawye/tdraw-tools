import type { DrawingEntity, HistoryFrame } from "./types.js";

export function cloneEntity(entity: DrawingEntity): DrawingEntity {
  const cloned: DrawingEntity = {
    ...entity,
    points: entity.points.map((point) => ({ ...point })),
    style: { ...entity.style }
  };
  if (entity.metadata) {
    cloned.metadata = { ...entity.metadata };
  }
  return cloned;
}

export function cloneEntities(entities: DrawingEntity[]): DrawingEntity[] {
  return entities.map(cloneEntity);
}

export class HistoryStore {
  private undoStack: HistoryFrame[] = [];
  private redoStack: HistoryFrame[] = [];

  constructor(private readonly limit: number) {}

  push(frame: HistoryFrame): void {
    this.undoStack.push(frame);
    this.redoStack = [];
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  undo(): HistoryFrame | null {
    const frame = this.undoStack.pop() ?? null;
    if (!frame) {
      return null;
    }
    this.redoStack.push(frame);
    return frame;
  }

  redo(): HistoryFrame | null {
    const frame = this.redoStack.pop() ?? null;
    if (!frame) {
      return null;
    }
    this.undoStack.push(frame);
    return frame;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  depth(): { undoDepth: number; redoDepth: number } {
    return {
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length
    };
  }
}
