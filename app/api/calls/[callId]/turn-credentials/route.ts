import { NextRequest, NextResponse } from "next/server";

import { getCallSessionForUser } from "@/lib/call-store";
import { generateCloudflareTurnCredentials } from "@/lib/cloudflare-turn";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/monitoring";
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
    action: "turn-credentials",
    limit: 12,
    windowSeconds: 60 * 60,
    identifiers: [user.id, `${user.id}:${callId}`],
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const call = await getCallSessionForUser(callId, user.id);
    const remainingSeconds = Math.floor(
      (new Date(call.expiresAt).getTime() - Date.now()) / 1000
    );
    if (call.status !== "accepted" || remainingSeconds < 60) {
      return NextResponse.json(
        { error: "TURN credentials are available only for an accepted active call." },
        { status: 409 }
      );
    }

    const credentials = await generateCloudflareTurnCredentials({
      callId,
      userId: user.id,
      ttlSeconds: Math.min(4 * 60 * 60, remainingSeconds),
    });
    return NextResponse.json(credentials, {
      headers: {
        "Cache-Control": "no-store, private",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_NOT_FOUND") {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }

    reportOperationalError(new Error("TURN credential issuance failed"), {
      area: "calling",
      operation: "turn-credentials",
      statusCode: 502,
    });
    return NextResponse.json(
      { error: "Could not prepare the call connection." },
      { status: 502 }
    );
  }
}
