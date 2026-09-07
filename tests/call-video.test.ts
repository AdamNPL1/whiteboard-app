import { describe, expect, it } from "vitest";

import {
  findNegotiatedVideoTransceiver,
  getReservedVideoDirection,
} from "@/lib/call-video";

describe("independent call video controls", () => {
  it("reserves bidirectional video before either camera is enabled", () => {
    expect(getReservedVideoDirection()).toBe("sendrecv");
  });

  it("selects the offer-associated video transceiver instead of an unnegotiated one", () => {
    const unnegotiatedVideo = {
      mid: null,
      receiver: { track: { kind: "video" } },
    } as RTCRtpTransceiver;
    const negotiatedAudio = {
      mid: "0",
      receiver: { track: { kind: "audio" } },
    } as RTCRtpTransceiver;
    const negotiatedVideo = {
      mid: "1",
      receiver: { track: { kind: "video" } },
    } as RTCRtpTransceiver;

    expect(findNegotiatedVideoTransceiver([
      unnegotiatedVideo,
      negotiatedAudio,
      negotiatedVideo,
    ])).toBe(negotiatedVideo);
  });

  it("returns null before a remote video m-line is negotiated", () => {
    const unnegotiatedVideo = {
      mid: null,
      receiver: { track: { kind: "video" } },
    } as RTCRtpTransceiver;

    expect(findNegotiatedVideoTransceiver([unnegotiatedVideo])).toBeNull();
  });
});
