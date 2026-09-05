export type CallQualityRating = "good" | "fair" | "poor" | "no-media";

export type CallQualityMetrics = {
  roundTripTimeMs: number | null;
  jitterMs: number | null;
  audioPacketLossPercent: number | null;
  videoPacketLossPercent: number | null;
  availableBitrateKbps: number | null;
  frameRate: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  audioLevel: number | null;
  frozenVideoSeconds: number | null;
  route: string;
  secondsSinceMediaReceived: number | null;
};

export type CallQualitySnapshot = CallQualityMetrics & {
  rating: CallQualityRating;
};

const atLeast = (value: number | null, threshold: number) =>
  value !== null && value >= threshold;

export const rateCallQuality = (metrics: CallQualityMetrics): CallQualityRating => {
  if (atLeast(metrics.secondsSinceMediaReceived, 10)) return "no-media";
  if (
    atLeast(metrics.roundTripTimeMs, 500) ||
    atLeast(metrics.jitterMs, 80) ||
    atLeast(metrics.audioPacketLossPercent, 8) ||
    atLeast(metrics.videoPacketLossPercent, 8) ||
    atLeast(metrics.frozenVideoSeconds, 2)
  ) return "poor";
  if (
    atLeast(metrics.roundTripTimeMs, 250) ||
    atLeast(metrics.jitterMs, 30) ||
    atLeast(metrics.audioPacketLossPercent, 2) ||
    atLeast(metrics.videoPacketLossPercent, 2) ||
    atLeast(metrics.frozenVideoSeconds, 0.25) ||
    (metrics.frameRate !== null && metrics.frameRate > 0 && metrics.frameRate < 12) ||
    (metrics.availableBitrateKbps !== null && metrics.availableBitrateKbps < 150)
  ) return "fair";
  return "good";
};

export const withCallQualityRating = (metrics: CallQualityMetrics): CallQualitySnapshot => ({
  ...metrics,
  rating: rateCallQuality(metrics),
});
