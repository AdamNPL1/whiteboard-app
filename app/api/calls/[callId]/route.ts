import { NextRequest, NextResponse } from "next/server";

import { getCallSessionForUser, transitionBoardCall } from "@/lib/call-store";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions = new Set(["accept", "decline", "cancel", "end"]);

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
  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action ?? "";
  if (!uuidPattern.test(callId) || !allowedActions.has(action)) {
    return NextResponse.json({ error: "Invalid call action." }, { status: 400 });
  }

  const limit = await enforceRateLimit(request, {
    action: "call-transition",
    limit: 30,
    windowSeconds: 60,
    identifiers: [user.id, `${user.id}:${callId}`],
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    return NextResponse.json(
      {
        call: await transitionBoardCall(
          callId,
          user.id,
          action as "accept" | "decline" | "cancel" | "end"
        ),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_NOT_FOUND") {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }
    if (code.startsWith("CALL_CANNOT_")) {
      return NextResponse.json(
        { error: "This call action is no longer allowed.", code },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Could not update the call." }, { status: 500 });
  }
}
