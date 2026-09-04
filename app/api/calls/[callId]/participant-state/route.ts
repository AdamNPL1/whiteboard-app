import { NextRequest, NextResponse } from "next/server";

import { getCallParticipantStates, updateCallParticipantState } from "@/lib/call-store";
import type { ParticipantConnectionState } from "@/lib/call-types";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states = new Set<ParticipantConnectionState>([
  "accepting", "connecting", "connected", "reconnecting", "failed",
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { callId } = await context.params;
  if (!uuidPattern.test(callId)) {
    return NextResponse.json({ error: "Call not found." }, { status: 404 });
  }
  try {
    const participantStates = await getCallParticipantStates(callId, user.id);
    return NextResponse.json(
      { participantStates },
      { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_NOT_FOUND") {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not load connection state." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { callId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { connectionState?: string; reason?: string; expectedVersion?: number }
    | null;
  const connectionState = body?.connectionState as ParticipantConnectionState;
  const reason = body?.reason?.trim() ?? "";
  if (!uuidPattern.test(callId) || !states.has(connectionState) || !reason ||
      reason.length > 100 || !/^[a-z0-9_]+$/.test(reason) || (body?.expectedVersion !== undefined &&
      (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1))) {
    return NextResponse.json({ error: "Invalid participant state." }, { status: 400 });
  }
  const limit = await enforceRateLimit(request, {
    action: "call-participant-state", limit: 120, windowSeconds: 60,
    identifiers: [user.id, `${user.id}:${callId}`],
  });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const participantState = await updateCallParticipantState(
      callId, user.id, connectionState, reason, body?.expectedVersion
    );
    return NextResponse.json(
      { participantState }, { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_NOT_FOUND") {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }
    if (code === "CALL_VERSION_CONFLICT" || code === "CALL_TRANSITION_CONFLICT") {
      return NextResponse.json({ error: "Call state changed.", code }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update connection state." }, { status: 500 });
  }
}
