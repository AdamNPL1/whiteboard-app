import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type CallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "cancelled"
  | "missed"
  | "ended";

export type CallSession = {
  id: string;
  boardId: string;
  callerUserId: string;
  recipientUserId: string;
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
  ringExpiresAt: string;
  expiresAt: string;
  acceptedAt?: string;
  declinedAt?: string;
  endedAt?: string;
  endedByUserId?: string;
};

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
  status: CallStatus;
  created_at: string;
  updated_at: string;
  ring_expires_at: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  ended_at: string | null;
  ended_by_user_id: string | null;
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
  "id,board_id,caller_user_id,recipient_user_id,status,created_at,updated_at,ring_expires_at,expires_at,accepted_at,declined_at,ended_at,ended_by_user_id";

const mapCallSession = (row: CallSessionRow): CallSession => ({
  id: row.id,
  boardId: row.board_id,
  callerUserId: row.caller_user_id,
  recipientUserId: row.recipient_user_id,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ringExpiresAt: row.ring_expires_at,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at ?? undefined,
  declinedAt: row.declined_at ?? undefined,
  endedAt: row.ended_at ?? undefined,
  endedByUserId: row.ended_by_user_id ?? undefined,
});

const unwrapRpcRow = (data: unknown): CallSessionRow | null => {
  if (Array.isArray(data)) return (data[0] as CallSessionRow | undefined) ?? null;
  return (data as CallSessionRow | null) ?? null;
};

const normalizeDatabaseCallError = (message: string) => {
  const knownCodes = [
    "CALL_SELF_NOT_ALLOWED",
    "CALL_INVALID_EXPIRATION",
    "CALL_BOARD_NOT_FOUND",
    "CALL_FORBIDDEN",
    "CALL_PARTICIPANT_BUSY",
    "CALL_NOT_FOUND",
    "CALL_CANNOT_ACCEPT",
    "CALL_CANNOT_DECLINE",
    "CALL_CANNOT_CANCEL",
    "CALL_CANNOT_END",
    "CALL_INVALID_ACTION",
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
  recipientUserId: string
) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "start_board_call",
    {
      p_board_id: boardId,
      p_caller_user_id: callerUserId,
      p_recipient_user_id: recipientUserId,
      p_ring_seconds: 45,
      p_session_seconds: 24 * 60 * 60,
    }
  );

  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  const row = unwrapRpcRow(data);
  if (!row) throw new Error("CALL_DATABASE_ERROR");
  return mapCallSession(row);
};

export const getCallSessionForUser = async (callId: string, userId: string) => {
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
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServiceRoleClient()
    .from("call_sessions")
    .select(callColumns)
    .or(`caller_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
    .in("status", ["ringing", "accepted"])
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`CALL_READ_FAILED:${error.message}`);
  return ((data ?? []) as CallSessionRow[])
    .map(mapCallSession)
    .filter(
      (call) =>
        call.status === "accepted" || new Date(call.ringExpiresAt).getTime() > Date.now()
    );
};

export const transitionBoardCall = async (
  callId: string,
  userId: string,
  action: "accept" | "decline" | "cancel" | "end"
) => {
  const { data, error } = await getSupabaseServiceRoleClient().rpc(
    "transition_board_call",
    {
      p_call_id: callId,
      p_user_id: userId,
      p_action: action,
    }
  );

  if (error) throw new Error(normalizeDatabaseCallError(error.message));
  const row = unwrapRpcRow(data);
  if (!row) throw new Error("CALL_DATABASE_ERROR");
  return mapCallSession(row);
};
