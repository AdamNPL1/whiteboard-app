export type CallRecoveryReason =
  | "initial-timeout"
  | "ice-disconnected"
  | "ice-failed"
  | "signaling-recovered"
  | "network-restored"
  | "app-resumed"
  | "media-stalled";

export type CallRecoveryState =
  | "idle"
  | "connecting"
  | "connected"
  | "interrupted"
  | "reconnecting"
  | "recovered"
  | "failed"
  | "ended";

export type RecoverableTransportState = "connected" | "disconnected" | "failed";

const recoveryTransitions: Record<CallRecoveryState, ReadonlySet<CallRecoveryState>> = {
  idle: new Set(["connecting", "connected", "interrupted", "ended"]),
  connecting: new Set(["connected", "interrupted", "reconnecting", "failed", "ended"]),
  connected: new Set(["interrupted", "reconnecting", "failed", "ended"]),
  interrupted: new Set(["connected", "reconnecting", "recovered", "failed", "ended"]),
  reconnecting: new Set(["connected", "interrupted", "recovered", "failed", "ended"]),
  recovered: new Set(["connected", "interrupted", "reconnecting", "failed", "ended"]),
  failed: new Set(["ended"]),
  ended: new Set(),
};

export const canTransitionCallRecoveryState = (
  current: CallRecoveryState,
  next: CallRecoveryState
) => current === next || recoveryTransitions[current].has(next);

type TimerHandle = ReturnType<typeof setTimeout>;

type CallReconnectionOptions = {
  maxAttempts?: number;
  disconnectedGraceMs?: number;
  initialRetryMs?: number;
  connectionDeadlineMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  canRecover: () => boolean;
  isConnected: () => boolean;
  restartConnection: (reason: CallRecoveryReason, attempt: number) => Promise<void>;
  onAttempt?: (reason: CallRecoveryReason, attempt: number) => void;
  onStateChange?: (
    state: CallRecoveryState,
    previousState: CallRecoveryState,
    reason: string
  ) => void;
  onExhausted: (reason: CallRecoveryReason, attempts: number) => void;
  onDeadline?: () => void;
};

/**
 * Owns every recovery timer and ICE-restart attempt for one peer connection.
 * UI and WebRTC callbacks report events to this controller; they never launch
 * competing restarts directly.
 */
export class CallReconnectionController {
  private readonly options: Required<
    Pick<
      CallReconnectionOptions,
      | "maxAttempts"
      | "disconnectedGraceMs"
      | "initialRetryMs"
      | "connectionDeadlineMs"
      | "retryBaseMs"
      | "retryMaxMs"
    >
  > &
    Omit<
      CallReconnectionOptions,
      | "maxAttempts"
      | "disconnectedGraceMs"
      | "initialRetryMs"
      | "connectionDeadlineMs"
      | "retryBaseMs"
      | "retryMaxMs"
    >;
  private retryTimer: TimerHandle | null = null;
  private retryDueAt = 0;
  private deadlineTimer: TimerHandle | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private attempts = 0;
  private nextAttemptAllowedAt = 0;
  private disposed = false;
  private exhausted = false;
  private online = true;
  private state: CallRecoveryState = "idle";

  constructor(options: CallReconnectionOptions) {
    this.options = {
      maxAttempts: options.maxAttempts ?? 3,
      disconnectedGraceMs: options.disconnectedGraceMs ?? 4_000,
      initialRetryMs: options.initialRetryMs ?? 10_000,
      connectionDeadlineMs: options.connectionDeadlineMs ?? 25_000,
      retryBaseMs: options.retryBaseMs ?? 3_000,
      retryMaxMs: options.retryMaxMs ?? 12_000,
      canRecover: options.canRecover,
      isConnected: options.isConnected,
      restartConnection: options.restartConnection,
      onAttempt: options.onAttempt,
      onStateChange: options.onStateChange,
      onExhausted: options.onExhausted,
      onDeadline: options.onDeadline,
    };
  }

  get attemptCount() {
    return this.attempts;
  }

  get recoveryState() {
    return this.state;
  }

  startConnectionWatchdogs() {
    if (this.disposed) return;
    this.startInitialRecovery();
    if (!this.options.onDeadline) return;
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = setTimeout(() => {
      this.deadlineTimer = null;
      if (!this.disposed && !this.options.isConnected()) this.options.onDeadline?.();
    }, this.options.connectionDeadlineMs);
  }

  startInitialRecovery() {
    this.transition("connecting", "connection_started");
    this.scheduleRecovery("initial-timeout", this.options.initialRetryMs);
  }

  handleDisconnected() {
    if (!this.transition("interrupted", "ice_disconnected")) return;
    this.scheduleRecovery("ice-disconnected", this.options.disconnectedGraceMs);
  }

  handleFailed() {
    if (!this.transition("interrupted", "ice_failed")) return;
    this.scheduleRecovery("ice-failed", 0);
  }

  handleSignalingRecovered() {
    if (!this.transition("interrupted", "signaling_recovered")) return;
    this.scheduleRecovery("signaling-recovered", 0);
  }

  handleMediaStalled() {
    if (!this.transition("interrupted", "media_stalled")) return;
    this.scheduleRecovery("media-stalled", 0);
  }

  handleTransportState(state: RecoverableTransportState) {
    if (state === "connected") return this.markConnected();
    if (state === "disconnected") {
      this.handleDisconnected();
      return true;
    }
    this.handleFailed();
    return true;
  }

  handleOffline() {
    if (this.disposed || this.state === "failed" || this.state === "ended") return;
    this.online = false;
    this.clearRetryTimer();
    this.transition("interrupted", "browser_offline");
  }

  handleOnline() {
    if (this.disposed || this.state === "failed" || this.state === "ended") return;
    this.online = true;
    if (this.options.isConnected()) {
      this.markConnected();
      return;
    }
    this.transition("interrupted", "browser_online");
    this.scheduleRecovery("network-restored", 0);
  }

  handleAppResumed() {
    if (!this.online || this.disposed || this.state === "failed" || this.state === "ended") {
      return;
    }
    if (this.options.isConnected()) return;
    this.transition("interrupted", "app_resumed");
    this.scheduleRecovery("app-resumed", 0);
  }

  markConnected() {
    const nextState = ["interrupted", "reconnecting"].includes(this.state)
      ? "recovered"
      : "connected";
    if (!this.transition(nextState, "ice_connected")) return false;
    this.clearTimers();
    this.attempts = 0;
    this.nextAttemptAllowedAt = 0;
    this.exhausted = false;
    return true;
  }

  dispose() {
    this.transition("ended", "controller_disposed");
    this.disposed = true;
    this.clearTimers();
  }

  private transition(next: CallRecoveryState, reason: string) {
    if (!canTransitionCallRecoveryState(this.state, next)) return false;
    if (next === this.state) return true;
    const previous = this.state;
    this.state = next;
    this.options.onStateChange?.(next, previous, reason);
    return true;
  }

  private clearTimers() {
    this.clearRetryTimer();
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
  }

  private clearRetryTimer() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryDueAt = 0;
  }

  private scheduleRecovery(reason: CallRecoveryReason, delayMs: number) {
    if (
      this.disposed ||
      !this.online ||
      (reason !== "media-stalled" && this.options.isConnected()) ||
      !this.options.canRecover()
    ) return;
    const effectiveDelayMs = Math.max(delayMs, this.nextAttemptAllowedAt - Date.now(), 0);
    const dueAt = Date.now() + effectiveDelayMs;
    // Keep the earliest pending recovery instead of allowing several event
    // handlers to create overlapping timers.
    if (this.retryTimer !== null && this.retryDueAt <= dueAt) return;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryDueAt = dueAt;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryDueAt = 0;
      return this.runRecovery(reason);
    }, effectiveDelayMs);
  }

  private async runRecovery(reason: CallRecoveryReason) {
    if (
      this.disposed ||
      !this.online ||
      (reason !== "media-stalled" && this.options.isConnected()) ||
      !this.options.canRecover() ||
      this.recoveryPromise
    ) {
      return;
    }
    if (Date.now() < this.nextAttemptAllowedAt) {
      this.scheduleRecovery(reason, this.nextAttemptAllowedAt - Date.now());
      return;
    }
    if (this.attempts >= this.options.maxAttempts) {
      if (!this.exhausted) {
        this.exhausted = true;
        this.transition("failed", "recovery_exhausted");
        this.options.onExhausted(reason, this.attempts);
      }
      return;
    }

    this.attempts += 1;
    const attempt = this.attempts;
    this.nextAttemptAllowedAt = Date.now() + this.retryDelayAfter(attempt);
    if (!this.transition("reconnecting", reason)) return;
    this.options.onAttempt?.(reason, attempt);
    const recovery = this.options.restartConnection(reason, attempt);
    this.recoveryPromise = recovery;
    try {
      await recovery;
    } catch {
      if (
        !this.disposed &&
        this.attempts >= this.options.maxAttempts &&
        !this.exhausted &&
        this.transition("failed", "recovery_exhausted")
      ) {
        this.exhausted = true;
        this.options.onExhausted(reason, this.attempts);
      }
    } finally {
      if (this.recoveryPromise === recovery) this.recoveryPromise = null;
      if (
        !this.exhausted &&
        !this.disposed &&
        this.online &&
        (reason === "media-stalled" || !this.options.isConnected()) &&
        this.options.canRecover()
      ) {
        this.scheduleRecovery(reason, 0);
      }
    }
  }

  private retryDelayAfter(attempt: number) {
    return Math.min(
      this.options.retryBaseMs * 2 ** Math.max(0, attempt - 1),
      this.options.retryMaxMs
    );
  }
}
