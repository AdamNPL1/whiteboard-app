import { describe, expect, it } from "vitest";

import { presentCallMessage } from "@/lib/call-message-presentation";

describe("friendly call message presentation", () => {
  it("keeps ICE diagnostics out of the primary message", () => {
    expect(presentCallMessage("The call could not connect. (ICE-R2)")).toEqual({
      kind: "connection-failed",
      original: "The call could not connect. (ICE-R2)",
      cleaned: "The call could not connect.",
      technicalDetails: "ICE-R2",
    });
  });

  it("classifies busy and rate-limit responses", () => {
    expect(presentCallMessage("One of the participants is already busy. CALL_PARTICIPANT_BUSY").kind).toBe("busy");
    expect(presentCallMessage("Too many requests. Please wait and try again.").kind).toBe("rate-limited");
  });

  it("preserves an ordinary friendly message", () => {
    expect(presentCallMessage("No answer.")).toMatchObject({
      kind: "original",
      cleaned: "No answer.",
      technicalDetails: null,
    });
  });
});
