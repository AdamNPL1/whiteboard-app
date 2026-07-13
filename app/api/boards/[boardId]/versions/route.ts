import { NextRequest, NextResponse } from "next/server";
import {
  getBoardVersionsForUser,
  restoreBoardVersionForUser,
} from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";
import { reportOperationalError } from "@/lib/monitoring";

export const runtime = "nodejs";

const versionErrorResponse = (error: unknown) => {
  if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
    return NextResponse.json({ error: "Board not found." }, { status: 404 });
  }
  if (error instanceof Error && error.message === "BOARD_FORBIDDEN") {
    return NextResponse.json(
      { error: "Only the board owner can view version history." },
      { status: 403 }
    );
  }
  if (error instanceof Error && error.message === "BOARD_VERSION_NOT_FOUND") {
    return NextResponse.json(
      { error: "This saved version is no longer available." },
      { status: 404 }
    );
  }

  reportOperationalError(error, {
    area: "database",
    operation: "board-version-recovery",
    statusCode: 500,
  });
  return NextResponse.json(
    { error: "Could not access board version history." },
    { status: 500 }
  );
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });
  const { boardId } = await context.params;
  try {
    return NextResponse.json(
      await getBoardVersionsForUser(supabase, user.id, user.email, boardId)
    );
  } catch (error) {
    return versionErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });
  const { boardId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { versionId?: string }
    | null;
  if (!body?.versionId) {
    return NextResponse.json(
      { error: "Choose a version to restore." },
      { status: 400 }
    );
  }

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profile = authUser
    ? await ensureProfileForSupabaseUser(supabase, authUser)
    : null;

  try {
    return NextResponse.json(
      await restoreBoardVersionForUser(
        supabase,
        user.id,
        user.email,
        boardId,
        body.versionId,
        profile?.plan ?? "basic",
        profile?.subscriptionStatus ?? "inactive"
      )
    );
  } catch (error) {
    return versionErrorResponse(error);
  }
}
