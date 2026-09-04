import { afterEach, describe, expect, it, vi } from "vitest";

import { aggregateParticipantConnectionStates } from "@/lib/browser-call-state";
import { CallMediaWatchdog } from "@/lib/call-media-watchdog";
import { CallReconnectionController } from "@/lib/call-reconnection";
import { resolveCallStatusKind } from "@/lib/call-status";
import { TurnCredentialLoader } from "@/lib/turn-credential-loader";

afterEach(() => vi.useRealTimers());

describe("complete call recovery flow", () => {
  it("pauses offline, restarts with fresh TURN, and returns both peers to connected", async () => {
    vi.useFakeTimers();
    let connected = true;
    const requestCredentials = vi.fn(async () => ({
      iceServers: [{ urls: "turn:relay.example.com" }],
      expiresAt: "2099-01-01T00:00:00.000Z",
    }));
    const credentials = new TurnCredentialLoader(requestCredentials);
    const controller = new CallReconnectionController({
      canRecover: () => true,
      isConnected: () => connected,
      restartConnection: async () => {
        await credentials.loadFresh("call-a");
      },
      onExhausted: vi.fn(),
    });

    controller.markConnected();
    connected = false;
    controller.handleOffline();
    controller.handleTransportState("disconnected");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(requestCredentials).not.toHaveBeenCalled();

    controller.handleOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(requestCredentials).toHaveBeenCalledTimes(1);
    expect(controller.recoveryState).toBe("reconnecting");
    expect(aggregateParticipantConnectionStates("reconnecting", "connected")).toBe(
      "reconnecting"
    );

    connected = true;
    controller.handleTransportState("connected");
    expect(controller.recoveryState).toBe("recovered");
    expect(aggregateParticipantConnectionStates("connected", "connected")).toBe("connected");
    expect(resolveCallStatusKind({
      phase: "connected",
      connectionState: "connected",
      remoteMuted: false,
      restored: true,
      hasMessage: false,
    })).toBe("restored");
  });

  it("recovers a fake-connected media stall and stops later retries", async () => {
    vi.useFakeTimers();
    const restartConnection = vi.fn(async () => undefined);
    const onExhausted = vi.fn();
    const controller = new CallReconnectionController({
      maxAttempts: 3,
      canRecover: () => true,
      // This deliberately remains true: it recreates the fake-connected bug.
      isConnected: () => true,
      restartConnection,
      onExhausted,
    });
    const watchdog = new CallMediaWatchdog({
      stalledAfterMs: 10_000,
      onStalled: () => controller.handleMediaStalled(),
      onRecovered: () => controller.markConnected(),
    });

    watchdog.observe({ connected: true, packetsSent: 5, packetsReceived: 5, sampledAt: 0 });
    watchdog.observe({ connected: true, packetsSent: 5, packetsReceived: 5, sampledAt: 10_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(restartConnection).toHaveBeenCalledTimes(1);

    watchdog.observe({ connected: true, packetsSent: 6, packetsReceived: 6, sampledAt: 11_000 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(restartConnection).toHaveBeenCalledTimes(1);
    expect(onExhausted).not.toHaveBeenCalled();
    expect(controller.recoveryState).toBe("recovered");
  });

  it("keeps End terminal while a pending recovery later rejects", async () => {
    vi.useFakeTimers();
    let rejectRestart!: (error: Error) => void;
    const onExhausted = vi.fn();
    const controller = new CallReconnectionController({
      maxAttempts: 1,
      canRecover: () => true,
      isConnected: () => false,
      restartConnection: () =>
        new Promise<void>((_resolve, reject) => {
          rejectRestart = reject;
        }),
      onExhausted,
    });
    controller.handleFailed();
    await vi.advanceTimersByTimeAsync(0);
    controller.dispose();
    rejectRestart(new Error("closed"));
    await Promise.resolve();
    expect(controller.recoveryState).toBe("ended");
    expect(onExhausted).not.toHaveBeenCalled();
  });
});
