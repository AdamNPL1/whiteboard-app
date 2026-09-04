export const CALL_SIGNAL_PROTOCOL_VERSION = 1 as const;
export const CALL_SIGNAL_MAX_ATTEMPTS = 6;
export const CALL_SIGNAL_TTL_MS = 45_000;

export type CallSignalData =
  | { kind: "ack"; acknowledgedMessageId: string; acknowledgedSequence: number }
  | { kind: "accepted" }
  | { kind: "declined" }
  | { kind: "ended" }
  | { kind: "mute"; muted: boolean }
  | { kind: "video-state"; enabled: boolean }
  | {
      kind: "connection-state";
      state: "connected" | "reconnecting" | "failed";
      reason: string;
      stateVersion: number;
    }
  | { kind: "renegotiate" }
  | { kind: "offer"; description: RTCSessionDescriptionInit }
  | { kind: "answer"; description: RTCSessionDescriptionInit }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };

export type CallSignalEnvelope = {
  protocolVersion: typeof CALL_SIGNAL_PROTOCOL_VERSION;
  callId: string;
  senderUserId: string;
  messageId: string;
  sentAt: number;
  sequenceNumber: number;
  signalingVersion: number;
  generation: number;
  data: CallSignalData;
};

const signalKinds = new Set([
  "ack", "accepted", "declined", "ended", "mute", "video-state",
  "connection-state", "renegotiate", "offer", "answer", "ice-candidate",
]);

export const isCallSignalEnvelope = (value: unknown): value is CallSignalEnvelope => {
  if (!value || typeof value !== "object") return false;
  const signal = value as Partial<CallSignalEnvelope>;
  const data = signal.data as Partial<CallSignalData> | undefined;
  if (
    signal.protocolVersion !== CALL_SIGNAL_PROTOCOL_VERSION ||
    typeof signal.callId !== "string" ||
    typeof signal.senderUserId !== "string" ||
    typeof signal.messageId !== "string" ||
    typeof signal.sentAt !== "number" ||
    !Number.isSafeInteger(signal.sequenceNumber) || Number(signal.sequenceNumber) < 1 ||
    !Number.isSafeInteger(signal.signalingVersion) || Number(signal.signalingVersion) < 1 ||
    !Number.isSafeInteger(signal.generation) || Number(signal.generation) < 0 ||
    !data || typeof data.kind !== "string" || !signalKinds.has(data.kind)
  ) return false;

  if (data.kind === "ack") {
    return typeof data.acknowledgedMessageId === "string" &&
      Number.isSafeInteger(data.acknowledgedSequence) &&
      Number(data.acknowledgedSequence) >= 1;
  }
  if (data.kind === "mute") return typeof data.muted === "boolean";
  if (data.kind === "video-state") return typeof data.enabled === "boolean";
  if (data.kind === "connection-state") {
    return ["connected", "reconnecting", "failed"].includes(String(data.state)) &&
      typeof data.reason === "string" && /^[a-z0-9_]{1,100}$/.test(data.reason) &&
      Number.isSafeInteger(data.stateVersion) && Number(data.stateVersion) >= 1;
  }
  if (data.kind === "offer" || data.kind === "answer") {
    return Boolean(data.description && typeof data.description === "object");
  }
  if (data.kind === "ice-candidate") {
    return Boolean(data.candidate && typeof data.candidate === "object");
  }
  return true;
};

export const isDurableCallSignal = (data: CallSignalData) =>
  data.kind === "offer" || data.kind === "answer";

export const callSignalRetryDelayMs = (attempts: number) =>
  Math.min(1_000 * 2 ** Math.max(0, attempts - 1), 8_000);

export type PendingCallSignal = {
  envelope: CallSignalEnvelope;
  attempts: number;
  expiresAt: number;
  nextAttemptAt: number;
};

export const createPendingCallSignal = (
  envelope: CallSignalEnvelope,
  now = Date.now()
): PendingCallSignal => ({
  envelope,
  attempts: 1,
  expiresAt: now + CALL_SIGNAL_TTL_MS,
  nextAttemptAt: now + callSignalRetryDelayMs(1),
});

export const shouldRetryCallSignal = (
  pending: PendingCallSignal,
  now = Date.now()
) => pending.attempts < CALL_SIGNAL_MAX_ATTEMPTS &&
  pending.expiresAt > now && pending.nextAttemptAt <= now;

export const decideOfferCollision = ({
  makingOffer,
  settingRemoteAnswer,
  signalingState,
  polite,
}: {
  makingOffer: boolean;
  settingRemoteAnswer: boolean;
  signalingState: RTCSignalingState;
  polite: boolean;
}) => {
  const readyForOffer = !makingOffer &&
    (signalingState === "stable" || settingRemoteAnswer);
  const collision = !readyForOffer;
  return {
    collision,
    ignore: collision && !polite,
    rollback: collision && polite,
  };
};
