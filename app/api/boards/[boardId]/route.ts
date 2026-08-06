import { NextRequest, NextResponse } from "next/server";
import {
  moveBoardToTrashForUser,
  renameBoardForUser,
  saveBoardForUser,
  setBoardStarredForUser,
} from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";
import { reportOperationalError, reportOperationalMessage } from "@/lib/monitoring";
import {
  MAX_BOARD_DOCUMENT_BYTES,
  validateBoardDocumentPayload,
} from "@/lib/board-document-limits";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const saveStartedAt = Date.now();
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BOARD_DOCUMENT_BYTES + 64 * 1024
  ) {
    return NextResponse.json(
      { error: "This board is too large to save. Remove some large images and try again." },
      { status: 413 }
    );
  }
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
        expectedUpdatedAt?: string;
      }
    | null;
  const validationError = validateBoardDocumentPayload(body);
  if (validationError) {
    const error =
      validationError === "BOARD_DOCUMENT_TOO_LARGE"
        ? "This board is too large to save. Remove some large images and try again."
        : validationError === "BOARD_ELEMENT_LIMIT_REACHED"
          ? "This board contains too many objects to save safely."
          : validationError === "BOARD_CALENDAR_LIMIT_REACHED"
            ? "This board contains too many calendar entries to save safely."
            : "This board contains invalid data and was not saved.";
    return NextResponse.json(
      { error, code: validationError },
      { status: validationError === "BOARD_DOCUMENT_INVALID" ? 400 : 413 }
    );
  }
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profile = authUser
    ? await ensureProfileForSupabaseUser(supabase, authUser)
    : null;

  try {
    const savedBoard = await saveBoardForUser(
        supabase,
        user.id,
        user.email,
        profile?.plan ?? "basic",
        profile?.subscriptionStatus ?? "inactive",
        boardId,
        {
          elements: body?.elements,
          canvasBackground: body?.canvasBackground,
          customCanvasBackground: body?.customCanvasBackground,
          gridMode: body?.gridMode,
          gridOpacity: body?.gridOpacity,
          calendarEntries: body?.calendarEntries,
        },
        body?.expectedUpdatedAt
      );
    const durationMs = Date.now() - saveStartedAt;
    if (durationMs >= 2_000) {
      reportOperationalMessage("Slow board save", {
        area: "boards",
        operation: "save",
        durationMs,
        level: "warning",
      });
    }
    return NextResponse.json(savedBoard);
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "BOARD_FORBIDDEN") {
      return NextResponse.json(
        { error: "You do not have permission to edit this board." },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === "BOARD_SAVE_CONFLICT") {
      return NextResponse.json(
        {
          error:
            "This board changed in another window or by another editor. Reload it before saving again.",
          code: "BOARD_SAVE_CONFLICT",
        },
        { status: 409 }
      );
    }

    reportOperationalError(error, {
      area: "database",
      operation: "board-save",
      durationMs: Date.now() - saveStartedAt,
      statusCode: 500,
    });

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
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profile = authUser
    ? await ensureProfileForSupabaseUser(supabase, authUser)
    : null;
  const plan = profile?.plan ?? "basic";
  const subscriptionStatus = profile?.subscriptionStatus ?? "inactive";

  try {
    if (typeof body?.starred === "boolean") {
      return NextResponse.json(
        await setBoardStarredForUser(
          supabase,
          user.id,
          user.email,
          boardId,
          body.starred,
          plan,
          subscriptionStatus
        )
      );
    }

    return NextResponse.json(
      await renameBoardForUser(
        supabase,
        user.id,
        user.email,
        boardId,
        body?.name ?? "",
        plan,
        subscriptionStatus
      )
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "BOARD_FORBIDDEN") {
      return NextResponse.json(
        { error: "Only the board owner can change this setting." },
        { status: 403 }
      );
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
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const profile = authUser
    ? await ensureProfileForSupabaseUser(supabase, authUser)
    : null;
  const plan = profile?.plan ?? "basic";
  const subscriptionStatus = profile?.subscriptionStatus ?? "inactive";

  try {
    return NextResponse.json(
      await moveBoardToTrashForUser(
        supabase,
        user.id,
        user.email,
        boardId,
        plan,
        subscriptionStatus
      )
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "BOARD_FORBIDDEN") {
      return NextResponse.json(
        { error: "Only the board owner can move this board to trash." },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Could not move this board to trash." },
      { status: 500 }
    );
  }
}
