import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type CallContactPermission = {
  allowed: boolean;
  reason: "allowed" | "unavailable" | "cooldown";
  retryAfterSeconds: number;
};

export async function getCallContactPermission(callerUserId: string, recipientUserId: string): Promise<CallContactPermission> {
  const { data, error } = await getSupabaseServiceRoleClient().rpc("check_call_contact_permission", {
    p_caller_user_id: callerUserId,
    p_recipient_user_id: recipientUserId,
  });
  if (error) throw new Error(`CALL_CONTACT_PERMISSION_FAILED:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    reason: row?.reason === "cooldown" ? "cooldown" : row?.reason === "unavailable" ? "unavailable" : "allowed",
    retryAfterSeconds: Math.max(0, Number(row?.retry_after_seconds) || 0),
  };
}

export async function blockCallParticipant(blockerUserId: string, blockedUserId: string) {
  const { error } = await getSupabaseServiceRoleClient().rpc("block_call_participant", {
    p_blocker_user_id: blockerUserId,
    p_blocked_user_id: blockedUserId,
  });
  if (error) throw new Error(`CALL_BLOCK_FAILED:${error.message}`);
}

export async function unblockCallParticipant(blockerUserId: string, blockedUserId: string) {
  const { error } = await getSupabaseServiceRoleClient().from("call_blocks").delete()
    .eq("blocker_user_id", blockerUserId).eq("blocked_user_id", blockedUserId);
  if (error) throw new Error(`CALL_UNBLOCK_FAILED:${error.message}`);
}

export async function getBlockedCallers(userId: string) {
  const client = getSupabaseServiceRoleClient();
  const { data, error } = await client.from("call_blocks").select("blocked_user_id,created_at")
    .eq("blocker_user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(`CALL_BLOCKS_READ_FAILED:${error.message}`);
  const ids = (data ?? []).map((row) => String(row.blocked_user_id));
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await client.from("profiles").select("id,name").in("id", ids);
  if (profileError) throw new Error(`CALL_BLOCK_PROFILES_FAILED:${profileError.message}`);
  const names = new Map((profiles ?? []).map((profile) => [String(profile.id), String(profile.name || "Scriboo user")]));
  return (data ?? []).map((row) => ({ userId: String(row.blocked_user_id), name: names.get(String(row.blocked_user_id)) ?? "Scriboo user", blockedAt: String(row.created_at) }));
}
