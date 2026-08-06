import { NextRequest, NextResponse } from "next/server";

import { getBoardCallParticipants } from "@/lib/call-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { boardId } = await context.params;
  if (!boardId || boardId.length > 200) {
    return NextResponse.json({ error: "Invalid board." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getBoardCallParticipants(boardId, user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CALL_FORBIDDEN") {
      return NextResponse.json({ error: "You cannot access this board." }, { status: 403 });
    }
    if (code === "CALL_BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Could not load call participants." },
      { status: 500 }
    );
  }
}
