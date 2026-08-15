import { describe, expect, it } from "vitest";
import {
  MAX_LIVE_STROKE_BATCH_POINTS,
  parseLiveStrokePoints,
  parseLiveStrokeStart,
} from "@/lib/board-live-strokes";

const base = {
  version: 1,
  boardId: "board-1",
  senderId: "client-1",
  strokeId: "stroke-1",
  sequence: 0,
};

describe("live board stroke messages", () => {
  it("accepts a bounded start message", () => {
    expect(
      parseLiveStrokeStart({
        ...base,
        width: 4,
        color: "#7c3aed",
        style: "solid",
        points: [{ x: 10, y: 20 }],
      })
    ).toMatchObject({ strokeId: "stroke-1", width: 4 });
  });

  it("rejects malformed coordinates and styling", () => {
    expect(
      parseLiveStrokeStart({
        ...base,
        width: 4,
        color: "red",
        style: "solid",
        points: [{ x: Number.NaN, y: 20 }],
      })
    ).toBeNull();
  });

  it("rejects oversized incremental batches", () => {
    expect(
      parseLiveStrokePoints({
        ...base,
        points: Array.from(
          { length: MAX_LIVE_STROKE_BATCH_POINTS + 1 },
          (_, index) => ({ x: index, y: index })
        ),
      })
    ).toBeNull();
  });

  it("allows a larger bounded final snapshot", () => {
    expect(
      parseLiveStrokePoints(
        {
          ...base,
          sequence: 4,
          points: Array.from({ length: 500 }, (_, index) => ({
            x: index,
            y: index,
          })),
        },
        { final: true }
      )?.points
    ).toHaveLength(500);
  });
});
