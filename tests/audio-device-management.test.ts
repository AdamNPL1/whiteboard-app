import { describe, expect, it } from "vitest";

import {
  audioPacketsAreStalled,
  chooseAvailableDevice,
  classifyAudioDeviceError,
} from "@/lib/audio-device-management";

describe("audio device management", () => {
  it("distinguishes permission, missing, busy, and disconnected errors", () => {
    expect(classifyAudioDeviceError(new DOMException("", "NotAllowedError"))).toBe("permission-denied");
    expect(classifyAudioDeviceError(new DOMException("", "NotFoundError"))).toBe("missing");
    expect(classifyAudioDeviceError(new DOMException("", "NotReadableError"))).toBe("busy");
    expect(classifyAudioDeviceError(new DOMException("", "OverconstrainedError"))).toBe("disconnected");
  });

  it("keeps an available preference and falls back after removal", () => {
    expect(chooseAvailableDevice("headset", ["built-in", "headset"])).toEqual({
      deviceId: "headset",
      changed: false,
    });
    expect(chooseAvailableDevice("headset", ["built-in"])).toEqual({
      deviceId: "built-in",
      changed: true,
    });
  });

  it("warns only after repeated unmuted packet stalls", () => {
    expect(audioPacketsAreStalled({ previousPackets: 10, currentPackets: 10, consecutiveStalls: 2, muted: false })).toBe(true);
    expect(audioPacketsAreStalled({ previousPackets: 10, currentPackets: 10, consecutiveStalls: 2, muted: true })).toBe(false);
    expect(audioPacketsAreStalled({ previousPackets: 10, currentPackets: 11, consecutiveStalls: 3, muted: false })).toBe(false);
  });
});
