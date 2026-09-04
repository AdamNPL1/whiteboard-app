import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CallReconnectionController,
  canTransitionCallRecoveryState,
} from "@/lib/call-reconnection";

afterEach(() => {
  vi.useRealTimers();
});

const setup = (maxAttempts = 2) => {
  let connected = false;
  let recoverable = true;
  const restartConnection = vi.fn(async () => undefined);
  const onExhausted = vi.fn();
  const onDeadline = vi.fn();
  const onStateChange = vi.fn();
  const controller = new CallReconnectionController({
    maxAttempts,
    canRecover: () => recoverable,
    isConnected: () => connected,
    restartConnection,
    onExhausted,
    onDeadline,
    onStateChange,
  });
  return {
    controller,
    restartConnection,
    onExhausted,
    onDeadline,
    onStateChange,
    setConnected: (value: boolean) => (connected = value),
    setRecoverable: (value: boolean) => (recoverable = value),
  };
};

describe("CallReconnectionController", () => {
  it("defines terminal recovery states that cannot return to connected", () => {
    expect(canTransitionCallRecoveryState("failed", "connected")).toBe(false);
    expect(canTransitionCallRecoveryState("ended", "connected")).toBe(false);
    expect(canTransitionCallRecoveryState("reconnecting", "recovered")).toBe(true);
  });

  it("uses one timer when repeated disconnected events arrive", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.handleDisconnected();
    subject.controller.handleDisconnected();
    subject.controller.handleDisconnected();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
    expect(subject.controller.attemptCount).toBe(1);
  });

  it("allows an immediate failure to replace a slower pending retry", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.startConnectionWatchdogs();
    subject.controller.handleFailed();
    await vi.advanceTimersByTimeAsync(0);
    expect(subject.restartConnection).toHaveBeenCalledWith("ice-failed", 1);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
  });

  it("maps WebRTC transport states into controlled recovery actions", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.startInitialRecovery();
    subject.controller.handleTransportState("disconnected");
    await vi.advanceTimersByTimeAsync(4_000);
    expect(subject.restartConnection).toHaveBeenCalledWith("ice-disconnected", 1);

    subject.setConnected(true);
    expect(subject.controller.handleTransportState("connected")).toBe(true);
    expect(subject.controller.recoveryState).toBe("recovered");
  });

  it("routes a media stall through the same serialized ICE recovery", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.handleMediaStalled();
    subject.controller.handleMediaStalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
    expect(subject.restartConnection).toHaveBeenCalledWith("media-stalled", 1);
  });

  it("rejects a late connected event after recovery has terminally failed", async () => {
    vi.useFakeTimers();
    const subject = setup(1);
    subject.restartConnection.mockRejectedValue(new Error("restart failed"));
    subject.controller.handleTransportState("failed");
    await vi.advanceTimersByTimeAsync(0);
    expect(subject.controller.recoveryState).toBe("failed");
    expect(subject.controller.handleTransportState("connected")).toBe(false);
    expect(subject.controller.recoveryState).toBe("failed");
  });

  it("cancels recovery and deadline timers after connection", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.startConnectionWatchdogs();
    subject.setConnected(true);
    subject.controller.markConnected();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(subject.restartConnection).not.toHaveBeenCalled();
    expect(subject.onDeadline).not.toHaveBeenCalled();
    expect(subject.controller.recoveryState).toBe("connected");
  });

  it("runs at most the configured number of restart attempts", async () => {
    vi.useFakeTimers();
    const subject = setup(1);
    subject.restartConnection.mockRejectedValue(new Error("restart failed"));
    subject.controller.handleFailed();
    await vi.advanceTimersByTimeAsync(0);
    subject.controller.handleFailed();
    await vi.advanceTimersByTimeAsync(0);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
    expect(subject.onExhausted).toHaveBeenCalledTimes(1);
    expect(subject.controller.recoveryState).toBe("failed");
    expect(subject.controller.markConnected()).toBe(false);
  });

  it("retries ICE restart with bounded exponential delays", async () => {
    vi.useFakeTimers();
    const subject = setup(3);
    subject.controller.handleTransportState("failed");
    await vi.advanceTimersByTimeAsync(0);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(subject.restartConnection).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_999);
    expect(subject.restartConnection).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(subject.restartConnection).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(12_000);
    expect(subject.restartConnection).toHaveBeenCalledTimes(3);
    expect(subject.onExhausted).toHaveBeenCalledTimes(1);
    expect(subject.controller.recoveryState).toBe("failed");
  });

  it("cancels all later ICE restarts once transport reconnects", async () => {
    vi.useFakeTimers();
    const subject = setup(3);
    subject.controller.handleTransportState("failed");
    await vi.advanceTimersByTimeAsync(0);
    subject.setConnected(true);
    subject.controller.handleTransportState("connected");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
    expect(subject.onExhausted).not.toHaveBeenCalled();
  });

  it("does not let duplicate browser failure events bypass retry cooldown", async () => {
    vi.useFakeTimers();
    const subject = setup(3);
    subject.controller.handleTransportState("failed");
    await vi.advanceTimersByTimeAsync(0);
    subject.controller.handleTransportState("failed");
    subject.controller.handleTransportState("failed");
    await vi.advanceTimersByTimeAsync(2_999);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(subject.restartConnection).toHaveBeenCalledTimes(2);
  });

  it("does nothing after disposal or when recovery is not authorized", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.setRecoverable(false);
    subject.controller.handleFailed();
    subject.setRecoverable(true);
    subject.controller.dispose();
    subject.controller.handleFailed();
    await vi.runAllTimersAsync();
    expect(subject.restartConnection).not.toHaveBeenCalled();
    expect(subject.controller.recoveryState).toBe("ended");
  });

  it("cannot report failure after End disposes an in-flight recovery", async () => {
    vi.useFakeTimers();
    let rejectRecovery!: (error: Error) => void;
    const subject = setup(1);
    subject.restartConnection.mockImplementation(
      () => new Promise<undefined>((_resolve, reject) => (rejectRecovery = reject))
    );
    subject.controller.handleFailed();
    await vi.advanceTimersByTimeAsync(0);
    subject.controller.dispose();
    rejectRecovery(new Error("connection closed by user"));
    await Promise.resolve();
    expect(subject.controller.recoveryState).toBe("ended");
    expect(subject.onExhausted).not.toHaveBeenCalled();
  });

  it("pauses a pending recovery while the browser is offline", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.handleDisconnected();
    subject.controller.handleOffline();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(subject.restartConnection).not.toHaveBeenCalled();
    expect(subject.controller.recoveryState).toBe("interrupted");
  });

  it("starts one controlled recovery as soon as the browser comes online", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.handleOffline();
    subject.controller.handleOnline();
    subject.controller.handleOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
    expect(subject.restartConnection).toHaveBeenCalledWith("network-restored", 1);
  });

  it("recovers after a visible app resumes without overlapping attempts", async () => {
    vi.useFakeTimers();
    const subject = setup();
    subject.controller.startInitialRecovery();
    subject.controller.handleAppResumed();
    subject.controller.handleAppResumed();
    await vi.advanceTimersByTimeAsync(0);
    expect(subject.restartConnection).toHaveBeenCalledTimes(1);
    expect(subject.restartConnection).toHaveBeenCalledWith("app-resumed", 1);
    expect(subject.onStateChange).toHaveBeenCalledWith(
      "interrupted",
      "connecting",
      "app_resumed"
    );
  });
});
