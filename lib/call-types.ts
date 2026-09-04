export type CallLifecycleStatus =
  | "creating"
  | "ringing"
  | "accepted"
  | "ending"
  | "ended";

export type CallOutcome =
  | "declined"
  | "missed"
  | "unavailable"
  | "failed"
  | null;

export type ParticipantConnectionState =
  | "accepting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type CallRecord = {
  id: string;
  boardId: string;
  callerUserId: string;
  recipientUserId: string;
  status: CallLifecycleStatus;
  outcome: CallOutcome;
  version: number;
  stateChangedAt: string;
  stateReason: string;
  createdAt: string;
  updatedAt: string;
  ringExpiresAt: string;
  expiresAt: string;
  acceptedAt?: string;
  declinedAt?: string;
  endedAt?: string;
  endedByUserId?: string;
  callerLastSeenAt?: string;
  recipientLastSeenAt?: string;
};

export type CallParticipantState = {
  callId: string;
  userId: string;
  connectionState: ParticipantConnectionState;
  stateChangedAt: string;
  stateReason: string;
  version: number;
};
