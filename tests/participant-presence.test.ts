import { describe, expect, it } from "vitest";

import { formatCallDuration, getParticipantInitials } from "@/lib/participant-presence";

describe("participant presence", () => {
  it("creates safe initials from the verified profile name", () => {
    expect(getParticipantInitials("Antek Kowalski")).toBe("AK");
    expect(getParticipantInitials("  Antek  ")).toBe("A");
    expect(getParticipantInitials(" ")).toBe("?");
  });

  it("formats call duration", () => {
    expect(formatCallDuration(65)).toBe("1:05");
    expect(formatCallDuration(3_661)).toBe("1:01:01");
  });
});
