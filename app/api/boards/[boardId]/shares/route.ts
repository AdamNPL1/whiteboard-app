import { NextRequest, NextResponse } from "next/server";
import {
  getBoardSharesForUser,
  shareBoardWithUserForPlan,
} from "@/lib/board-store";
import { sendBoardShareInviteEmail } from "@/lib/email";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profile = authUser
    ? await ensureProfileForSupabaseUser(supabase, authUser)
    : null;
  const { boardId } = await context.params;

  try {
    return NextResponse.json(
      await getBoardSharesForUser(
        supabase,
        user.id,
        user.email,
        boardId,
        profile?.plan ?? "basic",
        profile?.subscriptionStatus ?? "inactive"
      )
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "BOARD_FORBIDDEN") {
      return NextResponse.json(
        { error: "Only the board owner can manage sharing." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Could not load board sharing." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profile = authUser
    ? await ensureProfileForSupabaseUser(supabase, authUser)
    : null;
  const { boardId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
      }
    | null;

  const rateLimit = await enforceRateLimit(request, {
    action: "board-invitation",
    limit: 10,
    windowSeconds: 60 * 60,
    identifiers: [user.id, body?.email ?? ""],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const result = await shareBoardWithUserForPlan(
      supabase,
      user.id,
      user.email,
      boardId,
      profile?.plan ?? "basic",
      profile?.subscriptionStatus ?? "inactive",
      body?.email ?? ""
    );

    let inviteEmailSent = false;
    let inviteEmailError = "";

    try {
      await sendBoardShareInviteEmail({
        appOrigin: request.nextUrl.origin,
        ownerEmail: user.email,
        recipientEmail: result.share.email,
        invitationToken: result.invitationToken,
        expiresAt: result.share.expiresAt ?? "in 7 days",
      });
      inviteEmailSent = true;
    } catch (error) {
      reportOperationalError(error, { area: "email", operation: "board-invitation" });
      inviteEmailError =
        error instanceof Error ? error.message : "Could not send invite email.";
    }

    return NextResponse.json(
      {
        ok: result.ok,
        share: result.share,
        shareCount: result.shareCount,
        shareLimit: result.shareLimit,
        inviteEmailSent,
        inviteEmailError,
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "BOARD_FORBIDDEN") {
      return NextResponse.json(
        { error: "Only the board owner can share this board." },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === "BOARD_SHARE_EMAIL_REQUIRED") {
      return NextResponse.json(
        { error: "Enter a valid email address to share this board." },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "BOARD_SHARE_SELF") {
      return NextResponse.json(
        { error: "You already have access to your own board." },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === "BOARD_SHARE_EXISTS") {
      return NextResponse.json(
        { error: "This board is already shared with that email." },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === "BOARD_SHARE_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "You reached the sharing limit for your current plan." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not share this board." },
      { status: 500 }
    );
  }
}
