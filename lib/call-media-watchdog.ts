type MediaTransportSample = {
  connected: boolean;
  packetsSent: number;
  packetsReceived: number;
  sampledAt?: number;
};

type CallMediaWatchdogOptions = {
  stalledAfterMs?: number;
  onStalled: () => void;
  onRecovered?: () => void;
};

/** Detects a transport that still reports connected but has stopped moving RTP. */
export class CallMediaWatchdog {
  private readonly stalledAfterMs: number;
  private lastPacketsSent: number | null = null;
  private lastPacketsReceived: number | null = null;
  private lastSentProgressAt = 0;
  private lastReceivedProgressAt = 0;
  private stalledReported = false;

  constructor(private readonly options: CallMediaWatchdogOptions) {
    this.stalledAfterMs = options.stalledAfterMs ?? 10_000;
  }

  observe(sample: MediaTransportSample) {
    const sampledAt = sample.sampledAt ?? Date.now();
    if (!sample.connected) {
      this.reset();
      return false;
    }

    if (this.lastPacketsSent === null || this.lastPacketsReceived === null) {
      this.lastPacketsSent = sample.packetsSent;
      this.lastPacketsReceived = sample.packetsReceived;
      this.lastSentProgressAt = sampledAt;
      this.lastReceivedProgressAt = sampledAt;
      return false;
    }

    const sentProgressed = sample.packetsSent > this.lastPacketsSent;
    const receivedProgressed = sample.packetsReceived > this.lastPacketsReceived;
    this.lastPacketsSent = sample.packetsSent;
    this.lastPacketsReceived = sample.packetsReceived;
    if (sentProgressed) this.lastSentProgressAt = sampledAt;
    if (receivedProgressed) this.lastReceivedProgressAt = sampledAt;
    const sentStalled = sampledAt - this.lastSentProgressAt >= this.stalledAfterMs;
    const receivedStalled = sampledAt - this.lastReceivedProgressAt >= this.stalledAfterMs;
    if (!sentStalled && !receivedStalled) {
      const recovered = this.stalledReported;
      this.stalledReported = false;
      if (recovered) this.options.onRecovered?.();
      return false;
    }
    if (!this.stalledReported && (sentStalled || receivedStalled)) {
      this.stalledReported = true;
      this.options.onStalled();
      return true;
    }
    return false;
  }

  reset() {
    this.lastPacketsSent = null;
    this.lastPacketsReceived = null;
    this.lastSentProgressAt = 0;
    this.lastReceivedProgressAt = 0;
    this.stalledReported = false;
  }
}
