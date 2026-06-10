import { NextRequest, NextResponse } from "next/server";
import { authSessionCookieName, getUserFromSessionToken } from "@/lib/auth-store";
import { selectBoardForUser } from "@/lib/board-store";

export const runtime = "nodejs";

const getAuthenticatedUser = async (request: NextRequest) => {
  const token = request.cookies.get(authSessionCookieName)?.value;
  return getUserFromSessionToken(token);
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { boardId } = await context.params;

  try {
    return NextResponse.json(await selectBoardForUser(user.id, boardId));
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
