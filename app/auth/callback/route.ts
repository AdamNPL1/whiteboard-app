import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const getSafeRedirectPath = (next: string | null) => {
  if (!next || !next.startsWith("/")) {
    return "/custom";
  }

  return next;
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get("next"));
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
      redirectUrl.searchParams.set("ready", "1");
    }
  }

  const response = NextResponse.redirect(redirectUrl);

  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
