import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";
import type {
  CallLifecycleStatus,
  CallOutcome,
  CallParticipantState,
  CallRecord,
  ParticipantConnectionState,
} from "@/lib/call-types";

type StoredCallStatus =
  | "creating"
  | "ringing"
  | "accepted"
  | "ending"
  | "declined"
  | "cancelled"
  | "missed"
  | "ended";

export type CallSession = CallRecord;

export type BoardCallParticipant = {
  userId: string;
  name: string;
  role: "owner" | "collaborator";
};

type CallSessionRow = {
  id: string;
  board_id: string;
  caller_user_id: string;
  recipient_user_id: string;
  status: StoredCallStatus;
  created_at: string;
  updated_at: string;
  ring_expires_at: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  ended_at: string | null;
  ended_by_user_id: string | null;
  outcome?: CallOutcome;
  version?: number;
  state_changed_at?: string;
  state_reason?: string;
  caller_last_seen_at?: string | null;
  recipient_last_seen_at?: string | null;
};

type BoardRow = {
  id: string;
  user_id: string;
  name: string;
  deleted_at: string | null;
};

type ShareRow = {
  recipient_user_id: string | null;
  status: string;
};

const callColumns =
  "id,board_id,caller_user_id,recipient_user_id,status,outcome,version,state_changed_at,state_reason,created_at,updated_at,ring_expires_at,expires_at,accepted_at,declined_at,ended_at,ended_by_user_id,caller_last_seen_at,recipient_last_seen_at";

const normalizeStoredStatus = (
  status: StoredCallStatus
): { status: CallLifecycleStatus; outcome: CallOutcome } => {
  if (status === "ringing" || status === "accepted") {
    return { status, outcome: null };
  }
  if (status === "declined" || status === "missed") {
    return { status: "ended", outcome: status };
  }
  return { status: "ended", outcome: null };
};

const mapCallSession = (row: CallSessionRow): CallSession => ({
  id: row.id,
  boardId: row.board_id,
  callerUserId: row.caller_user_id,
  recipientUserId: row.recipient_user_id,
  ...(row.outcome !== undefined
    ? { status: row.status as CallLifecycleStatus, outcome: row.outcome }
    : normalizeStoredStatus(row.status)),
  version: row.version ?? 1,
  stateChangedAt: row.state_changed_at ?? row.updated_at,
  stateReason: row.state_reason ?? "legacy_import",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ringExpiresAt: row.ring_expires_at,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at ?? undefined,
  declinedAt: row.declined_at ?? undefined,
  endedAt: row.ended_at ?? undefined,
  endedByUserId: row.ended_by_user_id ?? undefined,
  callerLastSeenAt: row.caller_last_seen_at ?? undefined,
  recipientLastSeenAt: row.recipient_last_seen_at ?? undefined,
});

const unwrapRpcRow = (data: unknown): CallSessionRow | null => {
  if (Array.isArray(data)) return (data[0] as CallSessionRow | undefined) ?? null;
  return (data as CallSessionRow | null) ?? null;
};

const normalizeDatabaseCallError = (message: string) => {
  const knownCodes = [
    "CALL_SELF_NOT_ALLOWED",
    "CALL_INVALID_EXPIRATION",
    "CALL_INVALID_REQUEST_ID",
    "CALL_IDEMPOTENCY_CONFLICT",
    "CALL_BOARD_NOT_FOUND",
    "CALL_FORBIDDEN",
    "CALL_PARTICIPANT_BUSY",
    "CALL_NOT_FOUND",
    "CALL_CANNOT_ACCEPT",
    "CALL_CANNOT_DECLINE",
    "CALL_CANNOT_CANCEL",
    "CALL_CANNOT_END",
    "CALL_NOT_ACTIVE",
    "CALL_INVALID_ACTION",
    "CALL_TRANSITION_CONFLICT",
    "CALL_INVALID_PARTICIPANT_STATE",
    "CALL_VERSION_CONFLICT",
  ];
  return knownCodes.find((code) => message.includes(code)) ?? "CALL_DATABASE_ERROR";
};

const loadBoardAndShares = async (boardId: string) => {
  const client = getSupabaseServiceRoleClient();
  const [{ data: boardData, error: boardError }, { data: shareData, error: shareError }] =
    await Promise.all([
      client
        .from("boards")
        .select("id,user_id,name,deleted_at")
        .eq("id", boardId)
        .maybeSingle(),
      client
        .from("board_shares")
        .select("recipient_user_id,status")
        .eq("board_id", boardId)
        .eq("status", "accepted"),
    ]);

  if (boardError) throw new Error(`CALL_BOARD_READ_FAILED:${boardError.message}`);
  if (shareError) throw new Error(`CALL_SHARE_READ_FAILED:${shareError.message}`);
  const board = boardData as BoardRow | null;
  if (!board || board.deleted_at) throw new Error("CALL_BOARD_NOT_FOUND");

  return {
    board,
    shares: (shareData ?? []) as ShareRow[],
  };
};

export const getBoardCallParticipants = async (
  boardId: string,
  requestingUserId: string
) => {
  const { board, shares } = await loadBoardAndShares(boardId);
  const acceptedRecipientIds = shares
    .map((share) => share.recipient_user_id)
    .filter((id): id is string => Boolean(id));
  const participantIds = [...new Set([board.user_id, ...acceptedRecipientIds])];

  if (!participantIds.includes(requestingUserId)) {
    throw new Error("CALL_FORBIDDEN");
  }

  const { data: profiles, error } = await getSupabaseServiceRoleClient()
    .from("profiles")
    .select("id,name")
    .in("id", participantIds);
  if (error) throw new Error(`CALL_PROFILE_READ_FAILED:${error.message}`);

  const nameById = new Map(
    (profiles ?? []).map((profile) => [String(profile.id), String(profile.name || "User")])
  );

  return {
    board: { id: board.id, name: board.name },
    participants: participantIds
      .filter((userId) => userId !== requestingUserId)
      .map<BoardCallParticipant>((userId) => ({
        userId,
        name: nameById.get(userId) ?? "User",
        role: userId === board.user_id ? "owner" : "collaborator",
      })),
  };
};

export const startBoardCall = async (
  boardId: string,
  callerUserId: string,
  recipientUserId: string,
  clientRequestId: string
) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "start_board_call_with_heartbeat",
    {
      p_board_id: boardId,
      p_caller_user_id: callerUserId,
      p_recipient_user_id: recipientUserId,
      p_client_request_id: clientRequestId,
      p_ring_seconds: 45,
      p_session_seconds: 24 * 60 * 60,
      p_stale_seconds: 60,
    }
  );

  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  const row = unwrapRpcRow(data);
  if (!row) throw new Error("CALL_DATABASE_ERROR");
  return mapCallSession(row);
};

const expireCalls = async () => {
  const { error } = await getSupabaseServiceRoleClient().rpc(
    "cleanup_expired_call_sessions"
  );
  if (error) throw new Error(`CALL_CLEANUP_FAILED:${error.message}`);
};

export const getCallSessionForUser = async (callId: string, userId: string) => {
  await expireCalls();
  const { data, error } = await getSupabaseServiceRoleClient()
    .from("call_sessions")
    .select(callColumns)
    .eq("id", callId)
    .maybeSingle();

  if (error) throw new Error(`CALL_READ_FAILED:${error.message}`);
  const row = data as CallSessionRow | null;
  if (!row || (row.caller_user_id !== userId && row.recipient_user_id !== userId)) {
    throw new Error("CALL_NOT_FOUND");
  }
  return mapCallSession(row);
};

export const getActiveCallsForUser = async (userId: string) => {
  await expireCalls();
  const now = new Date().toISOString();
  const staleBefore = Date.now() - 60_000;
  const { data, error } = await getSupabaseServiceRoleClient()
    .from("call_sessions")
    .select(callColumns)
    .or(`caller_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
    .in("status", ["creating", "ringing", "accepted", "ending"])
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`CALL_READ_FAILED:${error.message}`);
  return ((data ?? []) as CallSessionRow[])
    .map(mapCallSession)
    .filter(
      (call) => {
        if (["creating", "ringing"].includes(call.status)) {
          return new Date(call.ringExpiresAt).getTime() > Date.now();
        }
        const initialPresence = call.acceptedAt ?? call.updatedAt;
        return (
          new Date(call.callerLastSeenAt ?? initialPresence).getTime() > staleBefore &&
          new Date(call.recipientLastSeenAt ?? initialPresence).getTime() > staleBefore
        );
      }
    );
};

export const transitionBoardCall = async (
  callId: string,
  userId: string,
  action:
    | "accept"
    | "decline"
    | "cancel"
    | "begin-ending"
    | "end"
    | "report-unavailable"
    | "report-failed",
  reason?: string
) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "transition_board_call",
    {
      p_call_id: callId,
      p_user_id: userId,
      p_action: action,
      p_reason: reason ?? null,
    }
  );

  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  const row = unwrapRpcRow(data);
  if (!row) throw new Error("CALL_DATABASE_ERROR");
  return mapCallSession(row);
};

export const heartbeatBoardCall = async (callId: string, userId: string) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "heartbeat_board_call",
    { p_call_id: callId, p_user_id: userId }
  );
  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  const row = unwrapRpcRow(data);
  if (!row) throw new Error("CALL_DATABASE_ERROR");
  return mapCallSession(row);
};

export const claimCallDeviceSession = async (
  callId: string,
  userId: string,
  sessionId: string
) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "claim_call_device_session",
    { p_call_id: callId, p_user_id: userId, p_session_id: sessionId }
  );
  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  return data === true;
};

export const heartbeatCallDeviceSession = async (
  callId: string,
  userId: string,
  sessionId: string
) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "heartbeat_call_device_session",
    { p_call_id: callId, p_user_id: userId, p_session_id: sessionId }
  );
  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  return data === true;
};

type ParticipantStateRow = {
  call_id: string;
  user_id: string;
  connection_state: ParticipantConnectionState;
  state_changed_at: string;
  state_reason: string;
  version: number;
};

export const updateCallParticipantState = async (
  callId: string,
  userId: string,
  connectionState: ParticipantConnectionState,
  reason: string,
  expectedVersion?: number
): Promise<CallParticipantState> => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "update_call_participant_state",
    {
      p_call_id: callId,
      p_user_id: userId,
      p_connection_state: connectionState,
      p_reason: reason,
      p_expected_version: expectedVersion ?? null,
    }
  );
  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  const row = (Array.isArray(data) ? data[0] : data) as ParticipantStateRow | null;
  if (!row) throw new Error("CALL_DATABASE_ERROR");
  return {
    callId: row.call_id,
    userId: row.user_id,
    connectionState: row.connection_state,
    stateChangedAt: row.state_changed_at,
    stateReason: row.state_reason,
    version: row.version,
  };
};

export const getCallParticipantStates = async (
  callId: string,
  userId: string
): Promise<CallParticipantState[]> => {
  await getCallSessionForUser(callId, userId);
  const { data, error } = await getSupabaseServiceRoleClient()
    .from("call_participant_states")
    .select("call_id,user_id,connection_state,state_changed_at,state_reason,version")
    .eq("call_id", callId);
  if (error) throw new Error("CALL_DATABASE_ERROR");
  return ((data ?? []) as ParticipantStateRow[]).map((row) => ({
    callId: row.call_id,
    userId: row.user_id,
    connectionState: row.connection_state,
    stateChangedAt: row.state_changed_at,
    stateReason: row.state_reason,
    version: row.version,
  }));
};
