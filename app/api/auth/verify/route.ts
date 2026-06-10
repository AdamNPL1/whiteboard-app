import { NextResponse } from "next/server";
import {
  authSessionCookieName,
  authSessionMaxAgeSeconds,
  createSession,
  findUserByEmail,
  getPublicUser,
  normalizeEmail,
  verifySecret,
  writeAuthData,
} from "@/lib/auth-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
        code?: string;
      }
    | null;
  const email = normalizeEmail(body?.email ?? "");
  const code = (body?.code ?? "").trim();

  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Enter the 6-digit verification code." },
      { status: 400 }
    );
  }

  const { data, user } = await findUserByEmail(email);

  if (!user?.verificationCodeHash || !user.verificationCodeExpiresAt) {
    return NextResponse.json(
      { error: "No pending verification was found for this email." },
      { status: 404 }
    );
  }

  if (new Date(user.verificationCodeExpiresAt).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "The verification code expired. Request a new one." },
      { status: 400 }
    );
  }

  const codeMatches = await verifySecret(code, user.verificationCodeHash);

  if (!codeMatches) {
    return NextResponse.json(
      { error: "That verification code is not correct." },
      { status: 400 }
    );
  }

  user.emailVerified = true;
  user.verificationCodeHash = undefined;
  user.verificationCodeExpiresAt = undefined;
  user.updatedAt = new Date().toISOString();
  await writeAuthData(data);

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

