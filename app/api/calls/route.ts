import { NextRequest, NextResponse } from "next/server";

import { getActiveCallsForUser, startBoardCall } from "@/lib/call-store";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    return NextResponse.json(
      { calls: await getActiveCallsForUser(user.id) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Could not load active calls", error);
    return NextResponse.json({ error: "Could not load calls." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { boardId?: string; recipientUserId?: string; clientRequestId?: string }
    | null;
  const boardId = body?.boardId?.trim() ?? "";
  const recipientUserId = body?.recipientUserId?.trim() ?? "";
  const clientRequestId = body?.clientRequestId?.trim() ?? "";
  if (
    !boardId || boardId.length > 200 || !uuidPattern.test(recipientUserId) ||
    !uuidPattern.test(clientRequestId)
  ) {
    return NextResponse.json({ error: "Invalid call request." }, { status: 400 });
  }

  const burstLimit = await enforceRateLimit(request, {
    action: "call-start-burst",
    limit: 5,
    windowSeconds: 60,
    identifiers: [user.id, `${user.id}:${recipientUserId}`],
  });
  if (!burstLimit.allowed) return rateLimitResponse(burstLimit);

  const hourlyLimit = await enforceRateLimit(request, {
    action: "call-start-hourly",
    limit: 30,
    windowSeconds: 60 * 60,
    identifiers: [user.id],
  });
  if (!hourlyLimit.allowed) return rateLimitResponse(hourlyLimit);

  try {
    const call = await startBoardCall(
      boardId,
      user.id,
      recipientUserId,
      clientRequestId
    );
    return NextResponse.json(
      {
        call,
        signalingTopic: `call:${call.id}`,
        recipientTopic: `user:${call.recipientUserId}:calls`,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_SELF_NOT_ALLOWED") {
      return NextResponse.json({ error: "You cannot call yourself." }, { status: 400 });
    }
    if (code === "CALL_BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }
    if (code === "CALL_FORBIDDEN") {
      return NextResponse.json(
        { error: "The selected person is not authorized for this board." },
        { status: 403 }
      );
    }
    if (code === "CALL_PARTICIPANT_BUSY") {
      return NextResponse.json(
        { error: "One of the participants is already busy.", code },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not start the call." }, { status: 500 });
  }
}
