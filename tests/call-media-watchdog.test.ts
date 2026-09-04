import { describe, expect, it, vi } from "vitest";

import { CallMediaWatchdog } from "@/lib/call-media-watchdog";

describe("CallMediaWatchdog", () => {
  it("detects a connected transport whose RTP packets stop moving", () => {
    const onStalled = vi.fn();
    const watchdog = new CallMediaWatchdog({ stalledAfterMs: 10_000, onStalled });
    watchdog.observe({ connected: true, packetsSent: 10, packetsReceived: 20, sampledAt: 0 });
    watchdog.observe({ connected: true, packetsSent: 10, packetsReceived: 20, sampledAt: 9_999 });
    expect(onStalled).not.toHaveBeenCalled();
    expect(
      watchdog.observe({ connected: true, packetsSent: 10, packetsReceived: 20, sampledAt: 10_000 })
    ).toBe(true);
    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  it("does not report repeatedly while the same stall continues", () => {
    const onStalled = vi.fn();
    const watchdog = new CallMediaWatchdog({ stalledAfterMs: 5_000, onStalled });
    watchdog.observe({ connected: true, packetsSent: 1, packetsReceived: 1, sampledAt: 0 });
    watchdog.observe({ connected: true, packetsSent: 1, packetsReceived: 1, sampledAt: 5_000 });
    watchdog.observe({ connected: true, packetsSent: 1, packetsReceived: 1, sampledAt: 20_000 });
    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  it("detects a one-way media failure even while the other direction progresses", () => {
    const onStalled = vi.fn();
    const watchdog = new CallMediaWatchdog({ stalledAfterMs: 5_000, onStalled });
    watchdog.observe({ connected: true, packetsSent: 1, packetsReceived: 1, sampledAt: 0 });
    watchdog.observe({ connected: true, packetsSent: 2, packetsReceived: 1, sampledAt: 3_000 });
    watchdog.observe({ connected: true, packetsSent: 3, packetsReceived: 1, sampledAt: 5_000 });
    expect(onStalled).toHaveBeenCalledTimes(1);
  });

  it("reports when bidirectional media resumes after a stall", () => {
    const onStalled = vi.fn();
    const onRecovered = vi.fn();
    const watchdog = new CallMediaWatchdog({
      stalledAfterMs: 5_000,
      onStalled,
      onRecovered,
    });
    watchdog.observe({ connected: true, packetsSent: 1, packetsReceived: 1, sampledAt: 0 });
    watchdog.observe({ connected: true, packetsSent: 1, packetsReceived: 1, sampledAt: 5_000 });
    watchdog.observe({ connected: true, packetsSent: 2, packetsReceived: 2, sampledAt: 6_000 });
    expect(onStalled).toHaveBeenCalledTimes(1);
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it("clears the stall window when packets progress or transport disconnects", () => {
    const onStalled = vi.fn();
    const watchdog = new CallMediaWatchdog({ stalledAfterMs: 5_000, onStalled });
    watchdog.observe({ connected: true, packetsSent: 1, packetsReceived: 1, sampledAt: 0 });
    watchdog.observe({ connected: true, packetsSent: 2, packetsReceived: 2, sampledAt: 4_000 });
    watchdog.observe({ connected: true, packetsSent: 2, packetsReceived: 2, sampledAt: 8_000 });
    watchdog.observe({ connected: false, packetsSent: 2, packetsReceived: 2, sampledAt: 9_000 });
    watchdog.observe({ connected: true, packetsSent: 2, packetsReceived: 2, sampledAt: 20_000 });
    expect(onStalled).not.toHaveBeenCalled();
  });
});
