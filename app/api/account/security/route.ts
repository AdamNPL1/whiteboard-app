import { NextRequest, NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth-utils";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type SecurityAction = "display-name" | "email" | "password";

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        action?: SecurityAction;
        displayName?: string;
        email?: string;
        currentPassword?: string;
        newPassword?: string;
      }
    | null;

  const action = body?.action;
  if (!action || !["display-name", "email", "password"].includes(action)) {
    return NextResponse.json({ error: "Choose a valid account change." }, { status: 400 });
  }

  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit(request, {
    action: `account-security-${action}`,
    limit: 5,
    windowSeconds: 15 * 60,
    identifiers: [user.id],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  if (action === "display-name") {
    const displayName = body?.displayName?.trim() ?? "";
    if (displayName.length < 2 || displayName.length > 80) {
      return NextResponse.json(
        { error: "Display name must be between 2 and 80 characters." },
        { status: 400 }
      );
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { ...user.user_metadata, name: displayName },
    });
    if (authError) {
      return NextResponse.json({ error: "Could not update your display name." }, { status: 500 });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ name: displayName, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (profileError) {
      return NextResponse.json({ error: "Could not update your profile." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, displayName });
  }

  const currentPassword = body?.currentPassword ?? "";
  if (!currentPassword) {
    return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  }

  if (action === "password") {
    const newPassword = body?.newPassword ?? "";
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "Choose a password different from your current password." },
        { status: 400 }
      );
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return NextResponse.json({ error: "Could not change your password." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Password changed successfully." });
  }

  const email = normalizeEmail(body?.email ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid new email address." }, { status: 400 });
  }
  if (email === user.email.toLowerCase()) {
    return NextResponse.json({ error: "That is already your account email." }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${request.nextUrl.origin}/auth/callback?next=/account-settings` }
  );
  if (error) {
    return NextResponse.json({ error: "Could not start the email change." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "Verification emails were sent. Your email changes only after the required confirmation is completed.",
  });
}
