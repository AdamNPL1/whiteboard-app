import { describe, expect, it } from "vitest";

import { isValidCallSessionId } from "@/lib/call-device-session";

describe("call device session identity", () => {
  it("accepts UUID session identifiers only", () => {
    expect(isValidCallSessionId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isValidCallSessionId("same-user-tab")).toBe(false);
    expect(isValidCallSessionId(null)).toBe(false);
  });
});
