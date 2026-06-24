import { NextRequest, NextResponse } from "next/server";
import { selectBoardForUser } from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

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

  const { boardId } = await context.params;

  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const profile = authUser
      ? await ensureProfileForSupabaseUser(supabase, authUser)
      : null;

    return NextResponse.json(
      await selectBoardForUser(
        supabase,
        user.id,
        profile?.plan ?? "basic",
        boardId
      )
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Could not open this board." },
      { status: 500 }
    );
  }
}
