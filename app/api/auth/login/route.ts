import { NextRequest, NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth-utils";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { mapSupabaseUserToAppUser } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
        password?: string;
      }
    | null;
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  const rateLimit = await enforceRateLimit(request, {
    action: "auth-login",
    limit: 10,
    windowSeconds: 10 * 60,
    identifiers: [email],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 }
    );
  }

  const responseCookies: Array<{
    name: string;
    value: string;
    options: Parameters<NextResponse["cookies"]["set"]>[2];
  }> = [];
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        responseCookies.push({ name, value, options });
      });
    },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !user) {
    if (
      error?.message?.toLowerCase().includes("email not confirmed") ||
      error?.message?.toLowerCase().includes("email not verified")
    ) {
      return NextResponse.json(
        {
          error: "Please verify your email before logging in.",
          needsVerification: true,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 }
    );
  }

  const profile = await ensureProfileForSupabaseUser(supabase, user);
  const appUser = profile ?? mapSupabaseUserToAppUser(user);
  const response = NextResponse.json({
    ok: true,
    user: appUser,
  });

  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
