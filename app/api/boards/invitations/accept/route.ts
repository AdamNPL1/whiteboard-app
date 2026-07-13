import { NextRequest, NextResponse } from "next/server";
import { acceptBoardInvitationForUser } from "@/lib/board-store";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "Sign in with the invited email address first." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { token?: string }
    | null;
  const rateLimit = await enforceRateLimit(request, {
    action: "board-invitation-accept",
    limit: 20,
    windowSeconds: 15 * 60,
    identifiers: [user.id],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    return NextResponse.json(
      await acceptBoardInvitationForUser(
        user.id,
        user.email,
        body?.token ?? ""
      )
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "BOARD_INVITATION_EXPIRED") {
      return NextResponse.json(
        { error: "This invitation expired. Ask the owner to send it again." },
        { status: 410 }
      );
    }
    if (code === "BOARD_INVITATION_EMAIL_MISMATCH") {
      return NextResponse.json(
        { error: "This invitation belongs to a different email address." },
        { status: 403 }
      );
    }
    if (code === "BOARD_INVITATION_USED") {
      return NextResponse.json(
        { error: "This invitation was already used." },
        { status: 409 }
      );
    }
    if (code === "BOARD_INVITATION_INVALID") {
      return NextResponse.json(
        { error: "This invitation link is invalid." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not accept this invitation." },
      { status: 500 }
    );
  }
}
