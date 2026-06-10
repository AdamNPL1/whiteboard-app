import { NextResponse } from "next/server";
import {
  authSessionCookieName,
  authSessionMaxAgeSeconds,
  createSession,
  findUserByEmail,
  getPublicUser,
  normalizeEmail,
  verifySecret,
} from "@/lib/auth-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
        password?: string;
      }
    | null;
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 }
    );
  }

  const { user } = await findUserByEmail(email);

  if (!user) {
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 }
    );
  }

  if (!user.emailVerified) {
    return NextResponse.json(
      {
        error: "Please verify your email before logging in.",
        needsVerification: true,
      },
      { status: 403 }
    );
  }

  const passwordMatches = await verifySecret(password, user.passwordHash);

  if (!passwordMatches) {
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 }
    );
  }

  const token = await createSession(user.id);
  const response = NextResponse.json({
    ok: true,
    user: getPublicUser(user),
  });

  response.cookies.set(authSessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authSessionMaxAgeSeconds,
  });

  return response;
}

