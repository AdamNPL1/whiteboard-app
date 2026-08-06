export const MAX_BOARD_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_BOARD_ELEMENTS = 5_000;
export const MAX_BOARD_CALENDAR_ENTRIES = 1_000;

export type BoardDocumentLimitError =
  | "BOARD_DOCUMENT_INVALID"
  | "BOARD_DOCUMENT_TOO_LARGE"
  | "BOARD_ELEMENT_LIMIT_REACHED"
  | "BOARD_CALENDAR_LIMIT_REACHED";

export const getBoardDocumentByteLength = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return new TextEncoder().encode(serialized).byteLength;
};

export const validateBoardDocumentPayload = (
  value: unknown
): BoardDocumentLimitError | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "BOARD_DOCUMENT_INVALID";
  }

  const document = value as {
    elements?: unknown;
    calendarEntries?: unknown;
  };

  if (!Array.isArray(document.elements)) {
    return "BOARD_DOCUMENT_INVALID";
  }
  if (document.elements.length > MAX_BOARD_ELEMENTS) {
    return "BOARD_ELEMENT_LIMIT_REACHED";
  }

  if (
    document.calendarEntries !== undefined &&
    !Array.isArray(document.calendarEntries)
  ) {
    return "BOARD_DOCUMENT_INVALID";
  }
  if (
    Array.isArray(document.calendarEntries) &&
    document.calendarEntries.length > MAX_BOARD_CALENDAR_ENTRIES
  ) {
    return "BOARD_CALENDAR_LIMIT_REACHED";
  }

  try {
    if (getBoardDocumentByteLength(value) > MAX_BOARD_DOCUMENT_BYTES) {
      return "BOARD_DOCUMENT_TOO_LARGE";
    }
  } catch {
    return "BOARD_DOCUMENT_INVALID";
  }

  return null;
};
