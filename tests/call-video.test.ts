import { describe, expect, it } from "vitest";

import { getReservedVideoDirection } from "@/lib/call-video";

describe("independent call video controls", () => {
  it("reserves bidirectional video before either camera is enabled", () => {
    expect(getReservedVideoDirection()).toBe("sendrecv");
  });
});
