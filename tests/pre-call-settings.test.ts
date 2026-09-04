import { describe, expect, it } from "vitest";

import {
  defaultPreCallSettings,
  parsePreCallSettings,
  supportsSpeakerSelection,
} from "@/lib/pre-call-settings";

describe("pre-call settings", () => {
  it("uses safe defaults when no saved settings exist", () => {
    expect(parsePreCallSettings(null)).toEqual(defaultPreCallSettings);
    expect(parsePreCallSettings("not-json")).toEqual(defaultPreCallSettings);
  });

  it("restores only correctly typed device and join preferences", () => {
    expect(parsePreCallSettings(JSON.stringify({
      microphoneId: "mic-2",
      cameraId: "camera-1",
      speakerId: "speaker-3",
      joinMuted: true,
      joinWithCamera: true,
    }))).toEqual({
      microphoneId: "mic-2",
      cameraId: "camera-1",
      speakerId: "speaker-3",
      joinMuted: true,
      joinWithCamera: true,
    });
    expect(parsePreCallSettings(JSON.stringify({
      microphoneId: 123,
      joinMuted: "yes",
    }))).toMatchObject({ microphoneId: "", joinMuted: false });
  });

  it("shows speaker selection only when the browser supports output routing", () => {
    expect(supportsSpeakerSelection(
      { setSinkId: async () => undefined } as unknown as HTMLMediaElement
    )).toBe(true);
    expect(supportsSpeakerSelection({} as unknown as HTMLMediaElement)).toBe(false);
  });
});
