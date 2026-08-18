import { NextRequest, NextResponse } from "next/server";

import { getCallSessionForUser } from "@/lib/call-store";
import { generateCloudflareTurnCredentials } from "@/lib/cloudflare-turn";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hasCloudflareTurnConfiguration = () =>
  Boolean(
    process.env.CLOUDFLARE_TURN_KEY_ID?.trim() &&
      process.env.CLOUDFLARE_TURN_API_TOKEN?.trim()
  );

const createDevelopmentIceConfiguration = (ttlSeconds: number) => ({
  iceServers: [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
  expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
});

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
    // A connection attempt can legitimately request credentials again during
    // ICE restart or recovery. Access is already restricted to authenticated
    // participants in an accepted active call, while call creation has its own
    // stricter anti-spam limits.
    limit: 120,
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

    // Local development should not require production TURN secrets. STUN is
    // sufficient for localhost/LAN testing in the usual network setup, while
    // production still fails loudly if its relay configuration is missing.
    if (process.env.NODE_ENV === "development" && !hasCloudflareTurnConfiguration()) {
      return NextResponse.json(createDevelopmentIceConfiguration(remainingSeconds), {
        headers: {
          "Cache-Control": "no-store, private",
          Pragma: "no-cache",
          "X-Scriboo-Ice-Mode": "development-stun",
        },
      });
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
