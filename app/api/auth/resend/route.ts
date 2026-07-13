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
    action: "auth-resend-confirmation",
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

  const supabase = createSupabaseServerAuthClient({
    getAll: () => [],
  });
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${new URL(request.url).origin}/auth/callback?next=/custom`,
    },
  });

  if (error) {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes("rate limit")) {
      return NextResponse.json(
        { error: "Please wait a moment before requesting another email." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Could not resend the confirmation email." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    email,
    message: "A new confirmation email was sent. Check your inbox.",
  });
}
