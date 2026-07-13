import { NextRequest, NextResponse } from "next/server";

import {
  getTesterAccessSignature,
  TESTER_ACCESS_COOKIE,
} from "@/lib/tester-access";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rateLimit = await enforceRateLimit(request, {
    action: "tester-access",
    limit: 5,
    windowSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const configuredPassword = process.env.TESTER_ACCESS_PASSWORD?.trim();

  if (!configuredPassword) {
    return NextResponse.json(
      { error: "Private tester access is not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { password?: string }
    | null;
  const password = body?.password?.trim() ?? "";

  const suppliedSignature = await getTesterAccessSignature(password);
  const expectedSignature = await getTesterAccessSignature(configuredPassword);

  if (!password || suppliedSignature !== expectedSignature) {
    return NextResponse.json(
      { error: "That private access password is incorrect." },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(TESTER_ACCESS_COOKIE, expectedSignature, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TESTER_ACCESS_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
