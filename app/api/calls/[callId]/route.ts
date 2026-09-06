import { NextRequest, NextResponse } from "next/server";

import { getBoardCallParticipants, getCallSessionForUser, heartbeatCallDeviceSession, transitionBoardCall } from "@/lib/call-store";
import { CALL_DEVICE_SESSION_HEADER, isValidCallSessionId } from "@/lib/call-device-session";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { sendCallPush } from "@/lib/call-push-store";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions = new Set([
  "accept", "decline", "cancel", "begin-ending", "end",
  "report-unavailable", "report-failed",
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
    return NextResponse.json(
      { call: await getCallSessionForUser(callId, user.id) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Call not found." }, { status: 404 });
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
    | { action?: string; reason?: string }
    | null;
  const action = body?.action ?? "";
  const reason = body?.reason?.trim();
  if (
    !uuidPattern.test(callId) || !allowedActions.has(action) ||
    (reason !== undefined &&
      (reason.length === 0 || reason.length > 100 || !/^[a-z0-9_]+$/.test(reason)))
  ) {
    return NextResponse.json({ error: "Invalid call action." }, { status: 400 });
  }

  const limit = await enforceRateLimit(request, {
    action: "call-transition",
    limit: 30,
    windowSeconds: 60,
    identifiers: [user.id, `${user.id}:${callId}`],
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  if (["accept", "cancel", "begin-ending", "end", "report-unavailable", "report-failed"].includes(action)) {
    const sessionId = request.headers.get(CALL_DEVICE_SESSION_HEADER);
    if (!isValidCallSessionId(sessionId) || !await heartbeatCallDeviceSession(callId, user.id, sessionId!).catch(() => false)) {
      return NextResponse.json(
        { error: "Call active on another device.", code: "CALL_SESSION_NOT_OWNER" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  try {
    const call = await transitionBoardCall(
      callId,
      user.id,
      action as
        | "accept"
        | "decline"
        | "cancel"
        | "begin-ending"
        | "end"
        | "report-unavailable"
        | "report-failed",
      reason
    );
    if (action === "cancel" && reason === "ring_timeout") {
      void getBoardCallParticipants(call.boardId, call.recipientUserId)
        .then((context) => sendCallPush(call.recipientUserId, {
          type: "missed-call",
          callId,
          boardId: call.boardId,
          boardName: context.board.name,
          callerName: context.participants.find((participant) => participant.userId === call.callerUserId)?.name ?? "Scriboo user",
        }))
        .catch((error) => console.warn("Could not send missed call push", error));
    } else if (["accept", "decline", "cancel", "end", "report-unavailable", "report-failed"].includes(action)) {
      void Promise.all([
        sendCallPush(call.callerUserId, { type: "dismiss-call", callId }),
        sendCallPush(call.recipientUserId, { type: "dismiss-call", callId }),
      ]).catch((error) =>
        console.warn("Could not dismiss call push", error)
      );
    }
    return NextResponse.json(
      { call },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_NOT_FOUND" || code === "CALL_FORBIDDEN") {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }
    if (code.startsWith("CALL_CANNOT_") || code === "CALL_TRANSITION_CONFLICT") {
      const latest = await getCallSessionForUser(callId, user.id).catch(() => null);
      return NextResponse.json(
        { error: "This call action is no longer allowed.", code, call: latest },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not update the call." }, { status: 500 });
  }
}
