import { NextRequest, NextResponse } from "next/server";

import { getSafeInternalRedirectPath } from "@/lib/auth-utils";
import {
  createPasswordRecoveryTicket,
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_TTL_SECONDS,
} from "@/lib/password-recovery-ticket";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeInternalRedirectPath(requestUrl.searchParams.get("next"));
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

  const redirectUrl = new URL(nextPath, requestUrl.origin);

  if (!code) {
    redirectUrl.searchParams.set("error", "missing_code");
  } else {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      redirectUrl.searchParams.set("error", "invalid_or_expired_link");
    } else if (nextPath === "/reset-password") {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        redirectUrl.searchParams.set("error", "invalid_or_expired_link");
      } else {
        redirectUrl.searchParams.set("ready", "1");
        responseCookies.push({
          name: PASSWORD_RECOVERY_COOKIE,
          value: createPasswordRecoveryTicket(user.id),
          options: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: PASSWORD_RECOVERY_TTL_SECONDS,
          },
        });
      }
    }
  }

  const response = NextResponse.redirect(redirectUrl);

  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
