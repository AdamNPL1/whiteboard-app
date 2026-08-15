export const LIVE_STROKE_PROTOCOL_VERSION = 1;
export const MAX_LIVE_STROKE_BATCH_POINTS = 96;
export const MAX_LIVE_STROKE_POINTS = 12_000;

export type LiveStrokePoint = { x: number; y: number };
export type LiveStrokeStyle = "solid" | "dashed" | "dotted";

export type LiveStrokeStartMessage = {
  version: 1;
  boardId: string;
  senderId: string;
  strokeId: string;
  sequence: number;
  width: number;
  color: string;
  style: LiveStrokeStyle;
  points: LiveStrokePoint[];
};

export type LiveStrokePointsMessage = {
  version: 1;
  boardId: string;
  senderId: string;
  strokeId: string;
  sequence: number;
  points: LiveStrokePoint[];
};

const isIdentifier = (value: unknown) =>
  typeof value === "string" && value.length >= 1 && value.length <= 160;

const isSequence = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const parsePoints = (value: unknown, maximum: number) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    return null;
  }

  const points: LiveStrokePoint[] = [];
  for (const point of value) {
    if (!point || typeof point !== "object") return null;
    const candidate = point as { x?: unknown; y?: unknown };
    if (
      typeof candidate.x !== "number" ||
      typeof candidate.y !== "number" ||
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.y) ||
      Math.abs(candidate.x) > 1_000_000 ||
      Math.abs(candidate.y) > 1_000_000
    ) {
      return null;
    }
    points.push({ x: candidate.x, y: candidate.y });
  }
  return points;
};

const parseBase = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = payload as Record<string, unknown>;
  if (
    value.version !== LIVE_STROKE_PROTOCOL_VERSION ||
    !isIdentifier(value.boardId) ||
    !isIdentifier(value.senderId) ||
    !isIdentifier(value.strokeId) ||
    !isSequence(value.sequence)
  ) {
    return null;
  }
  return {
    value,
    version: LIVE_STROKE_PROTOCOL_VERSION,
    boardId: value.boardId as string,
    senderId: value.senderId as string,
    strokeId: value.strokeId as string,
    sequence: value.sequence as number,
  } as const;
};

export const parseLiveStrokeStart = (
  payload: unknown
): LiveStrokeStartMessage | null => {
  const base = parseBase(payload);
  if (!base) return null;
  const { value } = base;
  const points = parsePoints(value.points, MAX_LIVE_STROKE_BATCH_POINTS);
  const style = value.style;
  if (
    !points ||
    typeof value.width !== "number" ||
    !Number.isFinite(value.width) ||
    value.width < 0.5 ||
    value.width > 100 ||
    typeof value.color !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(value.color) ||
    (style !== "solid" && style !== "dashed" && style !== "dotted")
  ) {
    return null;
  }
  return {
    version: 1,
    boardId: base.boardId,
    senderId: base.senderId,
    strokeId: base.strokeId,
    sequence: base.sequence,
    width: value.width,
    color: value.color,
    style,
    points,
  };
};

export const parseLiveStrokePoints = (
  payload: unknown,
  options?: { final?: boolean }
): LiveStrokePointsMessage | null => {
  const base = parseBase(payload);
  if (!base) return null;
  const points = parsePoints(
    base.value.points,
    options?.final ? MAX_LIVE_STROKE_POINTS : MAX_LIVE_STROKE_BATCH_POINTS
  );
  if (!points) return null;
  return {
    version: 1,
    boardId: base.boardId,
    senderId: base.senderId,
    strokeId: base.strokeId,
    sequence: base.sequence,
    points,
  };
};
