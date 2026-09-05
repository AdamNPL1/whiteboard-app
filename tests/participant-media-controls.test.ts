import { describe, expect, it } from "vitest";

import {
  normalizeParticipantVolume,
  shouldOpenParticipantMenuFromKey,
  toggleVideoFit,
} from "@/lib/participant-media-controls";

describe("participant-local media controls", () => {
  it("keeps participant volume inside the browser audio range", () => {
    expect(normalizeParticipantVolume(-1)).toBe(0);
    expect(normalizeParticipantVolume(0.45)).toBe(0.45);
    expect(normalizeParticipantVolume(4)).toBe(1);
    expect(normalizeParticipantVolume(Number.NaN)).toBe(1);
  });

  it("supports the keyboard Context Menu shortcuts", () => {
    expect(shouldOpenParticipantMenuFromKey("ContextMenu", false)).toBe(true);
    expect(shouldOpenParticipantMenuFromKey("F10", true)).toBe(true);
    expect(shouldOpenParticipantMenuFromKey("F10", false)).toBe(false);
  });

  it("switches between fit and fill without changing the remote track", () => {
    expect(toggleVideoFit("cover")).toBe("contain");
    expect(toggleVideoFit("contain")).toBe("cover");
  });
});
