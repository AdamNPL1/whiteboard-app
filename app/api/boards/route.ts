import { NextRequest, NextResponse } from "next/server";
import { createBoardForUser, getUserBoards } from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

  return NextResponse.json(
    await getUserBoards(supabase, user.id, profile?.plan ?? "basic")
  );
}

export async function POST(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const profile = authUser
      ? await ensureProfileForSupabaseUser(supabase, authUser)
      : null;

    return NextResponse.json(
      await createBoardForUser(supabase, user.id, profile?.plan ?? "basic")
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "You reached the board limit for your current plan." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not create a new board." },
      { status: 500 }
    );
  }
}
