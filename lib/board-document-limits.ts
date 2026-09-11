export const MAX_BOARD_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_BOARD_ELEMENTS = 5_000;
export const MAX_BOARD_CALENDAR_ENTRIES = 1_000;
export const MAX_STROKE_POINTS = 20_000;
export const MAX_TEXT_LENGTH = 100_000;
export const MAX_IMAGE_BYTES = 256 * 1024;

export type BoardDocumentLimitError = "BOARD_DOCUMENT_INVALID" | "BOARD_DOCUMENT_TOO_LARGE" | "BOARD_ELEMENT_LIMIT_REACHED" | "BOARD_CALENDAR_LIMIT_REACHED";
type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: unknown, min = -1_000_000, max = 1_000_000) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const isShortString = (value: unknown, max = 1_000) => typeof value === "string" && value.length <= max;
const isOneOf = <T extends string>(value: unknown, allowed: readonly T[]) => typeof value === "string" && allowed.includes(value as T);
const isPoint = (value: unknown) => isObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
const optionalString = (value: unknown, max = 1_000) => value === undefined || isShortString(value, max);
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
const optionalFiniteNumber = (value: unknown, min: number, max: number) => value === undefined || isFiniteNumber(value, min, max);

const dataImagePattern = /^data:image\/(?:png|jpeg|webp|gif);base64,([a-z0-9+/]+={0,2})$/i;
const isSafeImageSource = (value: unknown) => {
  if (typeof value !== "string") return false;
  const match = dataImagePattern.exec(value);
  if (!match) return false;
  const payload = match[1];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding) <= MAX_IMAGE_BYTES;
};
const isTextRun = (value: unknown) => isObject(value) && isShortString(value.text, MAX_TEXT_LENGTH) && isShortString(value.color, 100) && isShortString(value.fontFamily, 200) && isFiniteNumber(value.fontWeight, 1, 1_000) && isFiniteNumber(value.fontSize, 1, 1_000) && isOneOf(value.fontStyle, ["normal", "italic"] as const) && typeof value.underline === "boolean";
const isBoardElement = (value: unknown) => {
  if (!isObject(value) || typeof value.kind !== "string") return false;
  const dimensionsAreValid = isFiniteNumber(value.width, 0.01, 100_000) && isFiniteNumber(value.height, 0.01, 100_000);
  switch (value.kind) {
    case "stroke": return Array.isArray(value.points) && value.points.length > 0 && value.points.length <= MAX_STROKE_POINTS && value.points.every(isPoint) && isOneOf(value.tool, ["pen", "eraser"] as const) && isFiniteNumber(value.width, 0.01, 1_000) && optionalString(value.id, 200) && optionalString(value.color, 100) && (value.style === undefined || isOneOf(value.style, ["solid", "dashed", "dotted"] as const));
    case "shape": return isPoint(value.start) && isPoint(value.end) && isOneOf(value.tool, ["circle", "square", "triangle", "arrow", "line", "ruler", "oval", "curve"] as const) && isFiniteNumber(value.width, 0.01, 1_000) && isShortString(value.color, 100) && isOneOf(value.style, ["solid", "dashed", "dotted"] as const);
    case "text": return isPoint(value.point) && isShortString(value.value, MAX_TEXT_LENGTH) && isShortString(value.color, 100) && Array.isArray(value.runs) && value.runs.length <= 10_000 && value.runs.every(isTextRun) && isShortString(value.fontFamily, 200) && isFiniteNumber(value.fontWeight, 1, 1_000) && isFiniteNumber(value.fontSize, 1, 1_000) && isOneOf(value.fontStyle, ["normal", "italic"] as const) && typeof value.underline === "boolean" && isOneOf(value.textAlign, ["left", "center", "right"] as const) && dimensionsAreValid && optionalString(value.backgroundColor, 100) && (value.measurementSpace === undefined || isOneOf(value.measurementSpace, ["canvas", "screen"] as const)) && optionalFiniteNumber(value.measurementZoom, 0.01, 100);
    case "image": return isPoint(value.point) && dimensionsAreValid && isSafeImageSource(value.src) && isShortString(value.name, 500) && optionalString(value.id, 200) && optionalFiniteNumber(value.rotation, -360_000, 360_000) && optionalBoolean(value.locked);
    case "converter": return isPoint(value.point) && dimensionsAreValid && isOneOf(value.converter, ["km-mi", "kg-lb", "c-f", "gb-mb", "cm-in"] as const) && isFiniteNumber(value.value, -1e15, 1e15);
    case "calculator": return isPoint(value.point) && dimensionsAreValid && isShortString(value.expression, 10_000);
    default: return false;
  }
};
const isCalendarEntry = (value: unknown) => isObject(value) && isShortString(value.id, 200) && typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && typeof value.startHour === "string" && /^\d{2}:\d{2}$/.test(value.startHour) && typeof value.endHour === "string" && /^\d{2}:\d{2}$/.test(value.endHour) && isShortString(value.title, 1_000) && isShortString(value.color, 100);

export const getBoardDocumentByteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export const validateBoardDocumentPayload = (value: unknown): BoardDocumentLimitError | null => {
  if (!isObject(value)) return "BOARD_DOCUMENT_INVALID";
  try { if (getBoardDocumentByteLength(value) > MAX_BOARD_DOCUMENT_BYTES) return "BOARD_DOCUMENT_TOO_LARGE"; } catch { return "BOARD_DOCUMENT_INVALID"; }
  if (!Array.isArray(value.elements)) return "BOARD_DOCUMENT_INVALID";
  if (value.elements.length > MAX_BOARD_ELEMENTS) return "BOARD_ELEMENT_LIMIT_REACHED";
  if (!value.elements.every(isBoardElement)) return "BOARD_DOCUMENT_INVALID";
  if (value.calendarEntries !== undefined && !Array.isArray(value.calendarEntries)) return "BOARD_DOCUMENT_INVALID";
  if (Array.isArray(value.calendarEntries) && value.calendarEntries.length > MAX_BOARD_CALENDAR_ENTRIES) return "BOARD_CALENDAR_LIMIT_REACHED";
  if (Array.isArray(value.calendarEntries) && !value.calendarEntries.every(isCalendarEntry)) return "BOARD_DOCUMENT_INVALID";
  if (value.canvasBackground !== undefined && !isShortString(value.canvasBackground, 200)) return "BOARD_DOCUMENT_INVALID";
  if (value.customCanvasBackground !== undefined && !isShortString(value.customCanvasBackground, 200)) return "BOARD_DOCUMENT_INVALID";
  if (value.gridMode !== undefined && !isOneOf(value.gridMode, ["none", "small", "standard", "large"] as const)) return "BOARD_DOCUMENT_INVALID";
  if (value.gridOpacity !== undefined && !isFiniteNumber(value.gridOpacity, 0, 100)) return "BOARD_DOCUMENT_INVALID";
  return null;
};
