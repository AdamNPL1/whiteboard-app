import { NextRequest, NextResponse } from "next/server";

import { CALL_DEVICE_SESSION_HEADER, isValidCallSessionId } from "@/lib/call-device-session";
import { claimCallDeviceSession, heartbeatCallDeviceSession } from "@/lib/call-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { callId } = await context.params;
  const sessionId = request.headers.get(CALL_DEVICE_SESSION_HEADER);
  const body = await request.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  if (!uuidPattern.test(callId) || !isValidCallSessionId(sessionId) || !["claim", "heartbeat"].includes(action ?? "")) {
    return NextResponse.json({ error: "Invalid call ownership request." }, { status: 400 });
  }
  try {
    const owned = action === "claim"
      ? await claimCallDeviceSession(callId, user.id, sessionId!)
      : await heartbeatCallDeviceSession(callId, user.id, sessionId!);
    return NextResponse.json({ owned }, { status: owned ? 200 : 409, headers: { "Cache-Control": "no-store" } });
  } catch {
    // A database/network failure is not evidence that another device owns the
    // call. Returning 409 here caused transient backend errors to be shown as
    // the misleading "Call active on another device" message.
    return NextResponse.json(
      { error: "Could not verify call ownership.", code: "CALL_OWNERSHIP_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
