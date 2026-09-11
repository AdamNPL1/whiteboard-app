import { NextRequest, NextResponse } from "next/server";

import {
  PASSWORD_RECOVERY_COOKIE,
  verifyPasswordRecoveryTicket,
} from "@/lib/password-recovery-ticket";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";
import { getPasswordPolicyError } from "@/lib/password-policy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { password?: string; confirmPassword?: string }
    | null;
  const password = body?.password ?? "";
  const confirmPassword = body?.confirmPassword ?? "";

  const passwordPolicyError = getPasswordPolicyError(password);
  if (passwordPolicyError) {
    return NextResponse.json(
      { error: passwordPolicyError },
      { status: 400 }
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords must match." }, { status: 400 });
  }

  const responseCookies: Array<{
    name: string;
    value: string;
    options: Parameters<NextResponse["cookies"]["set"]>[2];
  }> = [];
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => responseCookies.push(...cookiesToSet),
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  const ticket = request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value;

  if (
    userError ||
    !user?.id ||
    !verifyPasswordRecoveryTicket(ticket, user.id)
  ) {
    return NextResponse.json(
      { error: "This password-reset link is invalid or expired." },
      { status: 401 }
    );
  }

  const rateLimit = await enforceRateLimit(request, {
    action: "auth-reset-password",
    limit: 5,
    windowSeconds: 15 * 60,
    identifiers: [user.id],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return NextResponse.json(
      { error: "Could not update your password." },
      { status: 400 }
    );
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    return NextResponse.json(
      { error: "Password changed, but sessions could not be revoked. Contact support." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    message: "Password updated. Sign in again with your new password.",
  });
  responseCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
