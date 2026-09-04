import { NextRequest, NextResponse } from "next/server";

import {
  getRecoverableCallSignals,
  saveDurableCallSignal,
} from "@/lib/call-signal-store";
import {
  isCallSignalEnvelope,
  isDurableCallSignal,
} from "@/lib/call-signaling";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const signalingError = (error: unknown) => {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "";
  if (code === "CALL_NOT_FOUND") return { status: 404, message: "Call not found.", code };
  if (code === "CALL_SIGNALING_VERSION_CONFLICT" || code === "CALL_SIGNALING_NOT_ACTIVE") {
    return { status: 409, message: "This signaling attempt is no longer active.", code };
  }
  if (code === "CALL_SIGNAL_FORBIDDEN") {
    return { status: 403, message: "Signaling sender is not authorized.", code };
  }
  return { status: 500, message: "Could not process call signaling.", code: "CALL_SIGNAL_ERROR" };
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { callId } = await context.params;
  const signalingVersion = Number(request.nextUrl.searchParams.get("version"));
  if (!uuidPattern.test(callId) || !Number.isSafeInteger(signalingVersion) || signalingVersion < 1) {
    return NextResponse.json({ error: "Invalid signaling request." }, { status: 400 });
  }
  const limit = await enforceRateLimit(request, {
    action: "call-signal-recovery", limit: 60, windowSeconds: 60,
    identifiers: [user.id, `${user.id}:${callId}`],
  });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const signals = await getRecoverableCallSignals(callId, user.id, signalingVersion);
    return NextResponse.json({ signals }, {
      headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
    });
  } catch (error) {
    const result = signalingError(error);
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { callId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!uuidPattern.test(callId) || !isCallSignalEnvelope(body) ||
      body.callId !== callId || body.senderUserId !== user.id ||
      !uuidPattern.test(body.messageId) || !isDurableCallSignal(body.data) ||
      Math.abs(Date.now() - body.sentAt) > 2 * 60 * 1000) {
    return NextResponse.json({ error: "Invalid signaling message." }, { status: 400 });
  }
  const description = body.data.kind === "offer" || body.data.kind === "answer"
    ? body.data.description : null;
  if (!description || typeof description.sdp !== "string" ||
      description.sdp.length > 100_000 || description.type !== body.data.kind) {
    return NextResponse.json({ error: "Invalid session description." }, { status: 400 });
  }
  const limit = await enforceRateLimit(request, {
    action: "call-signal-write", limit: 120, windowSeconds: 60,
    identifiers: [user.id, `${user.id}:${callId}`],
  });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    await saveDurableCallSignal(user.id, body);
    return NextResponse.json({ stored: true }, {
      status: 201,
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    const result = signalingError(error);
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }
}
