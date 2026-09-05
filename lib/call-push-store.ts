import "server-only";

import webpush, { type PushSubscription } from "web-push";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type CallPushPayload = {
  type: "incoming-call" | "dismiss-call" | "missed-call";
  callId: string;
  boardId?: string;
  boardName?: string;
  callerName?: string;
};

const configureWebPush = () => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@scribooapp.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
};

export const saveCallPushSubscription = async (
  userId: string,
  subscription: PushSubscription,
  userAgent: string | null
) => {
  const keys = subscription.keys;
  if (!subscription.endpoint || !keys?.p256dh || !keys.auth) throw new Error("INVALID_PUSH_SUBSCRIPTION");
  const { error } = await getSupabaseServiceRoleClient().from("call_push_subscriptions").upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw new Error(`PUSH_SUBSCRIPTION_SAVE_FAILED:${error.message}`);
};

export const deleteCallPushSubscription = async (userId: string, endpoint: string) => {
  const { error } = await getSupabaseServiceRoleClient().from("call_push_subscriptions")
    .delete().eq("user_id", userId).eq("endpoint", endpoint);
  if (error) throw new Error(`PUSH_SUBSCRIPTION_DELETE_FAILED:${error.message}`);
};

export const getCallNotificationPreferences = async (userId: string) => {
  const { data, error } = await getSupabaseServiceRoleClient().from("call_notification_preferences")
    .select("enabled,ringing_enabled,dnd_until").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`PUSH_PREFERENCES_READ_FAILED:${error.message}`);
  return {
    enabled: data?.enabled ?? true,
    ringingEnabled: data?.ringing_enabled ?? true,
    dndUntil: data?.dnd_until ?? null,
  };
};

export const saveCallNotificationPreferences = async (
  userId: string,
  preferences: { enabled: boolean; ringingEnabled: boolean; dndUntil: string | null }
) => {
  const { error } = await getSupabaseServiceRoleClient().from("call_notification_preferences").upsert({
    user_id: userId,
    enabled: preferences.enabled,
    ringing_enabled: preferences.ringingEnabled,
    dnd_until: preferences.dndUntil,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(`PUSH_PREFERENCES_SAVE_FAILED:${error.message}`);
};

export const sendCallPush = async (userId: string, payload: CallPushPayload) => {
  if (!configureWebPush()) return;
  const preferences = await getCallNotificationPreferences(userId);
  if (!preferences.enabled && payload.type !== "dismiss-call") return;
  if (payload.type === "incoming-call" && preferences.dndUntil && new Date(preferences.dndUntil).getTime() > Date.now()) return;
  const { data, error } = await getSupabaseServiceRoleClient().from("call_push_subscriptions")
    .select("endpoint,p256dh,auth").eq("user_id", userId);
  if (error) throw new Error(`PUSH_SUBSCRIPTION_READ_FAILED:${error.message}`);
  await Promise.all((data ?? []).map(async (row) => {
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, JSON.stringify({ ...payload, ringingEnabled: preferences.ringingEnabled }), { TTL: 60, urgency: "high" });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await getSupabaseServiceRoleClient().from("call_push_subscriptions").delete().eq("endpoint", row.endpoint);
      }
    }
  }));
};
