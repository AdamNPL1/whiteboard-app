import { NextRequest, NextResponse } from "next/server";
import type { PushSubscription } from "web-push";

import {
  deleteCallPushSubscription,
  getCallNotificationPreferences,
  saveCallNotificationPreferences,
  saveCallPushSubscription,
} from "@/lib/call-push-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "",
    preferences: await getCallNotificationPreferences(user.id),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { subscription?: PushSubscription } | null;
  const subscription = body?.subscription;
  if (!subscription?.endpoint || subscription.endpoint.length > 2_048 || !subscription.keys?.p256dh || !subscription.keys.auth) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  await saveCallPushSubscription(user.id, subscription, request.headers.get("user-agent"));
  return NextResponse.json({ subscribed: true }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    enabled?: boolean; ringingEnabled?: boolean; dndUntil?: string | null;
  } | null;
  if (typeof body?.enabled !== "boolean" || typeof body.ringingEnabled !== "boolean") {
    return NextResponse.json({ error: "Invalid notification preferences." }, { status: 400 });
  }
  const dndUntil = body.dndUntil === null || body.dndUntil === undefined ? null : new Date(body.dndUntil);
  if (dndUntil && !Number.isFinite(dndUntil.getTime())) {
    return NextResponse.json({ error: "Invalid Do Not Disturb time." }, { status: 400 });
  }
  const preferences = { enabled: body.enabled, ringingEnabled: body.ringingEnabled, dndUntil: dndUntil?.toISOString() ?? null };
  await saveCallNotificationPreferences(user.id, preferences);
  return NextResponse.json({ preferences });
}

export async function DELETE(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { endpoint?: string } | null;
  if (!body?.endpoint || body.endpoint.length > 2_048) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  await deleteCallPushSubscription(user.id, body.endpoint);
  return NextResponse.json({ subscribed: false });
}
