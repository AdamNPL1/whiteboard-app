import { describe, expect, it } from "vitest";

import { rateCallQuality, type CallQualityMetrics } from "@/lib/call-quality";

const metrics = (overrides: Partial<CallQualityMetrics> = {}): CallQualityMetrics => ({
  roundTripTimeMs: 45,
  jitterMs: 8,
  audioPacketLossPercent: 0.2,
  videoPacketLossPercent: 0.4,
  availableBitrateKbps: 2500,
  frameRate: 30,
  frameWidth: 1280,
  frameHeight: 720,
  audioLevel: 0.4,
  frozenVideoSeconds: 0,
  route: "host → srflx",
  secondsSinceMediaReceived: 0,
  ...overrides,
});

describe("call quality rating", () => {
  it("rates healthy transport as good", () => {
    expect(rateCallQuality(metrics())).toBe("good");
  });

  it("rates moderate latency or loss as fair", () => {
    expect(rateCallQuality(metrics({ roundTripTimeMs: 280 }))).toBe("fair");
    expect(rateCallQuality(metrics({ audioPacketLossPercent: 3 }))).toBe("fair");
  });

  it("rates severe degradation as poor", () => {
    expect(rateCallQuality(metrics({ jitterMs: 90 }))).toBe("poor");
    expect(rateCallQuality(metrics({ videoPacketLossPercent: 10 }))).toBe("poor");
  });

  it("prioritizes a media stall over numeric quality", () => {
    expect(rateCallQuality(metrics({ secondsSinceMediaReceived: 11 }))).toBe("no-media");
  });
});
