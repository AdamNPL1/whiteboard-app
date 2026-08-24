import { describe, expect, it } from "vitest";

import { getLocalVideoDirection } from "@/lib/call-video";

describe("independent call video controls", () => {
  it("keeps a participant receive-only while their own camera is off", () => {
    expect(getLocalVideoDirection(false)).toBe("recvonly");
  });

  it("sends video only after that participant enables their own camera", () => {
    expect(getLocalVideoDirection(true)).toBe("sendrecv");
  });
});
