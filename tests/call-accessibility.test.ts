import { describe, expect, it } from "vitest";
import { getCallKeyboardAction } from "../lib/call-accessibility";

const key = (overrides: Partial<KeyboardEvent> = {}) => ({
  key: "", code: "", ctrlKey: false, metaKey: false, shiftKey: false, repeat: false,
  ...overrides,
}) as KeyboardEvent;

describe("call keyboard accessibility", () => {
  it("supports microphone, camera and help shortcuts", () => {
    expect(getCallKeyboardAction(key({ key: "d", ctrlKey: true }), { connected: true, muted: false })).toBe("toggle-microphone");
    expect(getCallKeyboardAction(key({ key: "e", metaKey: true }), { connected: true, muted: false })).toBe("toggle-camera");
    expect(getCallKeyboardAction(key({ key: "?", shiftKey: true }), { connected: true, muted: false })).toBe("show-shortcuts");
  });

  it("uses Space as push-to-talk only while muted", () => {
    expect(getCallKeyboardAction(key({ key: " ", code: "Space" }), { connected: true, muted: true })).toBe("push-to-talk-start");
    expect(getCallKeyboardAction(key({ key: " ", code: "Space" }), { connected: true, muted: true, keyUp: true })).toBe("push-to-talk-stop");
    expect(getCallKeyboardAction(key({ key: " ", code: "Space" }), { connected: true, muted: false })).toBeNull();
  });

  it("ignores shortcuts outside a connected call", () => {
    expect(getCallKeyboardAction(key({ key: "d", ctrlKey: true }), { connected: false, muted: false })).toBeNull();
  });
});
