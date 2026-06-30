import { NextRequest, NextResponse } from "next/server";
import { removeBoardShareForUser } from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ boardId: string; shareId: string }> }
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
  const { boardId, shareId } = await context.params;

  try {
    return NextResponse.json(
      await removeBoardShareForUser(
        supabase,
        user.id,
        user.email,
        boardId,
        shareId,
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
        { error: "Only the board owner can remove sharing." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Could not remove sharing for this board." },
      { status: 500 }
    );
  }
}
