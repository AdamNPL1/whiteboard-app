import { NextRequest, NextResponse } from "next/server";
import {
  authSessionCookieName,
  getPublicUser,
  getUserFromSessionToken,
} from "@/lib/auth-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(authSessionCookieName)?.value;
  const user = await getUserFromSessionToken(token);

  return NextResponse.json({
    user: user ? getPublicUser(user) : null,
  });
}

