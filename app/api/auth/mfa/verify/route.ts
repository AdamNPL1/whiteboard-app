import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { factorId?: string; code?: string } | null;
  if (!body?.factorId || !/^\d{6}$/.test(body.code ?? "")) {
    return NextResponse.json({ error: "Enter a valid six-digit authentication code." }, { status: 400 });
  }
  const responseCookies: Array<{ name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }> = [];
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
    setAll: (values) => responseCookies.push(...values),
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Your sign-in session expired. Please start again." }, { status: 401 });
  const rateLimit = await enforceRateLimit(request, { action: "auth-mfa-verify", limit: 8, windowSeconds: 15 * 60, identifiers: [user.id] });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: body.factorId, code: body.code! });
  if (error) return NextResponse.json({ error: "That authentication code is incorrect or expired." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  responseCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
