import { NextRequest, NextResponse } from "next/server";
import {
  permanentlyDeleteBoardForUser,
  restoreBoardFromTrashForUser,
} from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";
import { reportOperationalError } from "@/lib/monitoring";

export const runtime = "nodejs";

const getRequestContext = async (request: NextRequest) => {
  const user = await getSupabaseUserFromRequest(request);
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profile = authUser
    ? await ensureProfileForSupabaseUser(supabase, authUser)
    : null;

  return { user, supabase, profile };
};

const recoveryErrorResponse = (error: unknown) => {
  if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
    return NextResponse.json({ error: "Board not found." }, { status: 404 });
  }
  if (error instanceof Error && error.message === "BOARD_FORBIDDEN") {
    return NextResponse.json(
      { error: "Only the board owner can recover this board." },
      { status: 403 }
    );
  }
  if (error instanceof Error && error.message === "BOARD_NOT_IN_TRASH") {
    return NextResponse.json(
      { error: "This board is not in Trash." },
      { status: 400 }
    );
  }
  if (error instanceof Error && error.message === "BOARD_LIMIT_REACHED") {
    return NextResponse.json(
      { error: "Your current plan has no room to restore this board." },
      { status: 400 }
    );
  }

  reportOperationalError(error, {
    area: "database",
    operation: "board-trash-recovery",
    statusCode: 500,
  });
  return NextResponse.json(
    { error: "Could not update this board in Trash." },
    { status: 500 }
  );
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const { user, supabase, profile } = await getRequestContext(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { boardId } = await context.params;
  try {
    return NextResponse.json(
      await restoreBoardFromTrashForUser(
        supabase,
        user.id,
        user.email,
        boardId,
        profile?.plan ?? "basic",
        profile?.subscriptionStatus ?? "inactive"
      )
    );
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const { user, supabase, profile } = await getRequestContext(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { boardId } = await context.params;
  try {
    return NextResponse.json(
      await permanentlyDeleteBoardForUser(
        supabase,
        user.id,
        user.email,
        boardId,
        profile?.plan ?? "basic",
        profile?.subscriptionStatus ?? "inactive"
      )
    );
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}
