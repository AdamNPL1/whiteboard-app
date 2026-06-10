import { NextRequest, NextResponse } from "next/server";
import {
  authSessionCookieName,
  deleteSession,
} from "@/lib/auth-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await deleteSession(request.cookies.get(authSessionCookieName)?.value);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authSessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

