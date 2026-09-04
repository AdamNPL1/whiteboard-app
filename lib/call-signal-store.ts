import "server-only";

import { getCallSessionForUser } from "@/lib/call-store";
import type { CallSignalEnvelope } from "@/lib/call-signaling";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

type SignalRow = {
  id: string;
  call_id: string;
  sender_user_id: string;
  protocol_version: 1;
  signaling_version: number;
  generation: number;
  sequence_number: number;
  kind: "offer" | "answer";
  payload: { description: RTCSessionDescriptionInit };
  sent_at: string;
};

const assertActiveSignalingCall = async (
  callId: string,
  userId: string,
  signalingVersion: number
) => {
  const call = await getCallSessionForUser(callId, userId);
  if (call.status !== "accepted") throw new Error("CALL_SIGNALING_NOT_ACTIVE");
  if (call.version !== signalingVersion) throw new Error("CALL_SIGNALING_VERSION_CONFLICT");
  return call;
};

export const saveDurableCallSignal = async (
  userId: string,
  envelope: CallSignalEnvelope
) => {
  const call = await assertActiveSignalingCall(
    envelope.callId,
    userId,
    envelope.signalingVersion
  );
  if (envelope.senderUserId !== userId) throw new Error("CALL_SIGNAL_FORBIDDEN");
  if (envelope.data.kind !== "offer" && envelope.data.kind !== "answer") {
    throw new Error("CALL_SIGNAL_NOT_DURABLE");
  }
  const recipientUserId =
    userId === call.callerUserId ? call.recipientUserId : call.callerUserId;
  const { error } = await getSupabaseServiceRoleClient()
    .from("call_signal_messages")
    .upsert(
      {
        id: envelope.messageId,
        call_id: envelope.callId,
        sender_user_id: userId,
        recipient_user_id: recipientUserId,
        protocol_version: envelope.protocolVersion,
        signaling_version: envelope.signalingVersion,
        generation: envelope.generation,
        sequence_number: envelope.sequenceNumber,
        kind: envelope.data.kind,
        payload: { description: envelope.data.description },
        sent_at: new Date(envelope.sentAt).toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`CALL_SIGNAL_WRITE_FAILED:${error.message}`);
};

export const getRecoverableCallSignals = async (
  callId: string,
  userId: string,
  signalingVersion: number
): Promise<CallSignalEnvelope[]> => {
  await assertActiveSignalingCall(callId, userId, signalingVersion);
  const client = getSupabaseServiceRoleClient();
  const { error: cleanupError } = await client.rpc("cleanup_expired_call_signals");
  if (cleanupError) throw new Error(`CALL_SIGNAL_CLEANUP_FAILED:${cleanupError.message}`);
  const { data, error } = await client
    .from("call_signal_messages")
    .select("id,call_id,sender_user_id,protocol_version,signaling_version,generation,sequence_number,kind,payload,sent_at")
    .eq("call_id", callId)
    .eq("recipient_user_id", userId)
    .eq("signaling_version", signalingVersion)
    .gt("expires_at", new Date().toISOString())
    .order("generation", { ascending: false })
    .order("sequence_number", { ascending: false })
    .limit(20);
  if (error) throw new Error(`CALL_SIGNAL_READ_FAILED:${error.message}`);
  return ((data ?? []) as SignalRow[]).reverse().map((row) => ({
    protocolVersion: row.protocol_version,
    callId: row.call_id,
    senderUserId: row.sender_user_id,
    messageId: row.id,
    sentAt: new Date(row.sent_at).getTime(),
    sequenceNumber: row.sequence_number,
    signalingVersion: row.signaling_version,
    generation: row.generation,
    data: { kind: row.kind, description: row.payload.description },
  }));
};
