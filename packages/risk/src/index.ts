import type { DrawingEngine, DrawingEntity, DrawingPoint, ToolId } from "@tdraw-tools/core";

export type RiskCanvasRenderer = (
  ctx: CanvasRenderingContext2D,
  drawing: DrawingEntity,
  helpers: {
    toScreen: (point: DrawingPoint) => { x: number; y: number } | null;
    viewportWidth: number;
    viewportHeight: number;
    dpr: number;
  }
) => void;

export const RISK_TOOL_ID: ToolId = "risk_position";

export interface RegisterRiskToolOptions {
  defaultRiskReward?: number;
}

export function registerRiskTool(
  engine: DrawingEngine,
  options: RegisterRiskToolOptions = {}
): ToolId {
  const riskReward = options.defaultRiskReward ?? 2;

  engine.registerTool({
    id: RISK_TOOL_ID,
    minPoints: 2,
    maxPoints: 2,
    normalize(entity) {
      return {
        ...entity,
        metadata: {
          ...(entity.metadata ?? {}),
          riskReward
        }
      };
    },
    defaultStyle: {
      strokeColor: "#00a85a",
      fillColor: "rgba(0, 168, 90, 0.16)"
    }
  });

  return RISK_TOOL_ID;
}

function getRiskReward(entity: DrawingEntity): number {
  const raw = entity.metadata?.riskReward;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 2;
}

export const riskPositionRenderer: RiskCanvasRenderer = (ctx, drawing, helpers) => {
  if (drawing.points.length < 2) {
    return;
  }

  const firstPoint = drawing.points[0];
  const secondPoint = drawing.points[1];
  if (!firstPoint || !secondPoint) {
    return;
  }

  const a = helpers.toScreen(firstPoint);
  const b = helpers.toScreen(secondPoint);
  if (!a || !b) {
    return;
  }

  const rr = getRiskReward(drawing);
  const entryY = a.y;
  const stopY = b.y;
  const riskHeight = stopY - entryY;
  const targetY = entryY - riskHeight * rr;
  const x = Math.min(a.x, b.x);
  const w = Math.max(10, Math.abs(b.x - a.x));

  ctx.save();
  ctx.lineWidth = drawing.style.lineWidth;
  ctx.strokeStyle = drawing.style.strokeColor;

  ctx.fillStyle = "rgba(214, 48, 49, 0.28)";
  ctx.fillRect(x, Math.min(entryY, stopY), w, Math.abs(riskHeight));

  ctx.fillStyle = "rgba(0, 168, 90, 0.26)";
  ctx.fillRect(x, Math.min(entryY, targetY), w, Math.abs(entryY - targetY));

  ctx.beginPath();
  ctx.moveTo(x, entryY);
  ctx.lineTo(x + w, entryY);
  ctx.moveTo(x, stopY);
  ctx.lineTo(x + w, stopY);
  ctx.moveTo(x, targetY);
  ctx.lineTo(x + w, targetY);
  ctx.stroke();

  ctx.fillStyle = "rgba(16, 24, 32, 0.82)";
  ctx.fillRect(x + w + 6, entryY - 11, 66, 22);
  ctx.fillStyle = "#d4e7ff";
  ctx.font = "11px 'IBM Plex Sans', 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`RR ${rr.toFixed(2)}`, x + w + 12, entryY);

  ctx.restore();
};
