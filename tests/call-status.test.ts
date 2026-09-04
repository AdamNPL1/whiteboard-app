import { describe, expect, it } from "vitest";

import { resolveCallStatusKind } from "@/lib/call-status";

const status = (overrides: Partial<Parameters<typeof resolveCallStatusKind>[0]> = {}) =>
  resolveCallStatusKind({
    phase: "connected",
    connectionState: "connected",
    remoteMuted: false,
    restored: false,
    hasMessage: false,
    offline: false,
    ...overrides,
  });

describe("call status presentation", () => {
  it("shows synchronized recovery over the broad connected phase", () => {
    expect(status({ connectionState: "reconnecting" })).toBe("reconnecting");
    expect(status({ connectionState: "failed" })).toBe("failed");
  });

  it("briefly confirms a successful recovery", () => {
    expect(status({ restored: true })).toBe("restored");
  });

  it("shows offline separately from ordinary reconnection", () => {
    expect(status({ connectionState: "reconnecting", offline: true })).toBe("offline");
  });

  it("keeps terminal user messages visible", () => {
    expect(status({ phase: "error", hasMessage: true })).toBe("message");
    expect(status({ phase: "ended", hasMessage: true })).toBe("message");
  });
});
