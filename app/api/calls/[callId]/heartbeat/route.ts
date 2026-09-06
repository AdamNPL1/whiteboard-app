import { NextRequest, NextResponse } from "next/server";

import { heartbeatBoardCall } from "@/lib/call-store";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { callId } = await context.params;
  if (!uuidPattern.test(callId)) {
    return NextResponse.json({ error: "Call not found." }, { status: 404 });
  }

  const limit = await enforceRateLimit(request, {
    action: "call-heartbeat",
    limit: 8,
    windowSeconds: 60,
    identifiers: [user.id, `${user.id}:${callId}`],
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    return NextResponse.json(
      { call: await heartbeatBoardCall(callId, user.id) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_NOT_FOUND" || code === "CALL_FORBIDDEN") {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }
    if (code === "CALL_NOT_ACTIVE") {
      return NextResponse.json({ error: "This call has ended.", code }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not refresh the call." }, { status: 500 });
  }
}
