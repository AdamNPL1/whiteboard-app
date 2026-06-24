import { NextRequest, NextResponse } from "next/server";
import {
  moveBoardToTrashForUser,
  renameBoardForUser,
  saveBoardForUser,
  setBoardStarredForUser,
} from "@/lib/board-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function PUT(
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
  const body = (await request.json().catch(() => null)) as
    | {
        elements?: unknown[];
        canvasBackground?: string;
        customCanvasBackground?: string;
        gridMode?: "none" | "small" | "standard" | "large";
        gridOpacity?: number;
        calendarEntries?: {
          id: string;
          date: string;
          startHour: string;
          endHour: string;
          title: string;
          color: string;
        }[];
      }
    | null;

  try {
    return NextResponse.json(
      await saveBoardForUser(supabase, user.id, boardId, {
        elements: body?.elements,
        canvasBackground: body?.canvasBackground,
        customCanvasBackground: body?.customCanvasBackground,
        gridMode: body?.gridMode,
        gridOpacity: body?.gridOpacity,
        calendarEntries: body?.calendarEntries,
      })
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Could not save this board." },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        starred?: boolean;
      }
    | null;

  try {
    if (typeof body?.starred === "boolean") {
      return NextResponse.json(
        await setBoardStarredForUser(supabase, user.id, boardId, body.starred)
      );
    }

    return NextResponse.json(
      await renameBoardForUser(supabase, user.id, boardId, body?.name ?? "")
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "BOARD_NAME_REQUIRED") {
      return NextResponse.json(
        { error: "Enter a board name." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not rename this board." },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    return NextResponse.json(
      await moveBoardToTrashForUser(supabase, user.id, boardId)
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Could not move this board to trash." },
      { status: 500 }
    );
  }
}
