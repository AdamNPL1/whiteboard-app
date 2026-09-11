import { describe, expect, it } from "vitest";

import {
  MAX_BOARD_CALENDAR_ENTRIES,
  MAX_BOARD_DOCUMENT_BYTES,
  MAX_BOARD_ELEMENTS,
  validateBoardDocumentPayload,
} from "@/lib/board-document-limits";

const document = (overrides: Record<string, unknown> = {}) => ({
  elements: [],
  canvasBackground: "#ffffff",
  customCanvasBackground: "#131619",
  gridMode: "none",
  gridOpacity: 24,
  calendarEntries: [],
  ...overrides,
});

describe("board document safety limits", () => {
  it("accepts an ordinary board document", () => {
    expect(validateBoardDocumentPayload(document())).toBeNull();
  });

  it("rejects malformed documents", () => {
    expect(validateBoardDocumentPayload(null)).toBe("BOARD_DOCUMENT_INVALID");
    expect(validateBoardDocumentPayload({ elements: "invalid" })).toBe(
      "BOARD_DOCUMENT_INVALID"
    );
  });

  it("rejects excessive object and calendar counts", () => {
    expect(
      validateBoardDocumentPayload(
        document({ elements: Array(MAX_BOARD_ELEMENTS + 1).fill({}) })
      )
    ).toBe("BOARD_ELEMENT_LIMIT_REACHED");
    expect(
      validateBoardDocumentPayload(
        document({
          calendarEntries: Array(MAX_BOARD_CALENDAR_ENTRIES + 1).fill({}),
        })
      )
    ).toBe("BOARD_CALENDAR_LIMIT_REACHED");
  });

  it("rejects documents larger than the byte ceiling", () => {
    expect(
      validateBoardDocumentPayload(
        document({ elements: [{ image: "x".repeat(MAX_BOARD_DOCUMENT_BYTES) }] })
      )
    ).toBe("BOARD_DOCUMENT_TOO_LARGE");
  });

  it("accepts supported elements and rejects malformed coordinates", () => {
    expect(validateBoardDocumentPayload(document({ elements: [{ kind: "stroke", points: [{ x: 1, y: 2 }], tool: "pen", width: 2 }] }))).toBeNull();
    expect(validateBoardDocumentPayload(document({ elements: [{ kind: "stroke", points: [{ x: Number.NaN, y: 2 }], tool: "pen", width: 2 }] }))).toBe("BOARD_DOCUMENT_INVALID");
  });

  it("blocks remote and active-content image sources", () => {
    const image = (src: string) => document({ elements: [{ kind: "image", point: { x: 0, y: 0 }, width: 100, height: 100, src, name: "image" }] });
    expect(validateBoardDocumentPayload(image("https://tracker.example/image.png"))).toBe("BOARD_DOCUMENT_INVALID");
    expect(validateBoardDocumentPayload(image("data:image/svg+xml;base64,PHN2Zz4="))).toBe("BOARD_DOCUMENT_INVALID");
    expect(validateBoardDocumentPayload(image("data:image/png;base64,aGVsbG8="))).toBeNull();
  });

  it("rejects unknown elements and malformed calendar entries", () => {
    expect(validateBoardDocumentPayload(document({ elements: [{ kind: "iframe", src: "https://example.com" }] }))).toBe("BOARD_DOCUMENT_INVALID");
    expect(validateBoardDocumentPayload(document({ calendarEntries: [{ id: "1", date: "today" }] }))).toBe("BOARD_DOCUMENT_INVALID");
  });
});
