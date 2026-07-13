import { NextRequest, NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth-utils";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
      }
    | null;
  const email = normalizeEmail(body?.email ?? "");

  const rateLimit = await enforceRateLimit(request, {
    action: "auth-forgot-password",
    limit: 3,
    windowSeconds: 15 * 60,
    identifiers: [email],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
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

  const redirectTo = `${request.nextUrl.origin}/auth/callback?next=/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return NextResponse.json(
      { error: "Could not send the reset email." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    message: "If an account exists for this email, check your email.",
  });

  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
