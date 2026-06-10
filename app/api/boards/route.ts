import { NextRequest, NextResponse } from "next/server";
import { authSessionCookieName, getUserFromSessionToken } from "@/lib/auth-store";
import { createBoardForUser, getUserBoards } from "@/lib/board-store";

export const runtime = "nodejs";

const getAuthenticatedUser = async (request: NextRequest) => {
  const token = request.cookies.get(authSessionCookieName)?.value;
  return getUserFromSessionToken(token);
};

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json(await getUserBoards(user.id));
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return NextResponse.json(await createBoardForUser(user.id));
  } catch (error) {
    if (error instanceof Error && error.message === "BOARD_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "You can have up to 10 boards for now." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not create a new board." },
      { status: 500 }
    );
  }
}
