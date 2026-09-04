import { describe, expect, it } from "vitest";

import {
  CALL_SIGNAL_MAX_ATTEMPTS,
  CALL_SIGNAL_PROTOCOL_VERSION,
  callSignalRetryDelayMs,
  createPendingCallSignal,
  decideOfferCollision,
  isCallSignalEnvelope,
  shouldRetryCallSignal,
} from "@/lib/call-signaling";
import type { CallSignalEnvelope } from "@/lib/call-signaling";

const envelope = (): CallSignalEnvelope => ({
  protocolVersion: CALL_SIGNAL_PROTOCOL_VERSION,
  callId: "33333333-3333-4333-8333-333333333333",
  senderUserId: "11111111-1111-4111-8111-111111111111",
  messageId: "55555555-5555-4555-8555-555555555555",
  sentAt: 1_000,
  sequenceNumber: 7,
  signalingVersion: 2,
  generation: 3,
  data: { kind: "offer", description: { type: "offer", sdp: "v=0" } },
});

describe("reliable call signaling protocol", () => {
  it("requires sequence, signaling, generation, and protocol versions", () => {
    expect(isCallSignalEnvelope(envelope())).toBe(true);
    expect(isCallSignalEnvelope({ ...envelope(), sequenceNumber: 0 })).toBe(false);
    expect(isCallSignalEnvelope({ ...envelope(), signalingVersion: 0 })).toBe(false);
    expect(isCallSignalEnvelope({ ...envelope(), protocolVersion: 99 })).toBe(false);
  });

  it("retries with a bounded exponential delay", () => {
    expect(callSignalRetryDelayMs(1)).toBe(1_000);
    expect(callSignalRetryDelayMs(4)).toBe(8_000);
    expect(callSignalRetryDelayMs(10)).toBe(8_000);
    const pending = createPendingCallSignal(envelope(), 1_000);
    expect(shouldRetryCallSignal(pending, 1_999)).toBe(false);
    expect(shouldRetryCallSignal(pending, 2_000)).toBe(true);
    pending.attempts = CALL_SIGNAL_MAX_ATTEMPTS;
    expect(shouldRetryCallSignal(pending, 2_000)).toBe(false);
  });

  it("makes the polite peer roll back during simultaneous offers", () => {
    expect(decideOfferCollision({
      makingOffer: true,
      settingRemoteAnswer: false,
      signalingState: "have-local-offer",
      polite: true,
    })).toEqual({ collision: true, ignore: false, rollback: true });
  });

  it("makes the impolite peer ignore a colliding offer", () => {
    expect(decideOfferCollision({
      makingOffer: true,
      settingRemoteAnswer: false,
      signalingState: "have-local-offer",
      polite: false,
    })).toEqual({ collision: true, ignore: true, rollback: false });
  });
});
