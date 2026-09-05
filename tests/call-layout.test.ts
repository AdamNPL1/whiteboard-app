import { describe, expect, it } from "vitest";

import { clampCallPanelPosition, readStoredCallLayout } from "@/lib/call-layout";

describe("responsive call layout", () => {
  it("keeps a moved panel inside the viewport and below the board toolbar", () => {
    expect(clampCallPanelPosition(
      { left: -50, top: 2 },
      { width: 350, height: 300 },
      { width: 800, height: 600 }
    )).toEqual({ left: 8, top: 52 });
    expect(clampCallPanelPosition(
      { left: 900, top: 900 },
      { width: 350, height: 300 },
      { width: 800, height: 600 }
    )).toEqual({ left: 442, top: 292 });
  });

  it("validates persisted layout preferences", () => {
    expect(readStoredCallLayout(JSON.stringify({
      dock: "bottom-left",
      mode: "whiteboard",
      position: null,
      videoHeight: 240,
    }))).toMatchObject({ dock: "bottom-left", mode: "whiteboard", videoHeight: 240 });
    expect(readStoredCallLayout('{"dock":"outside","mode":"video"}')).toBeNull();
  });
});
