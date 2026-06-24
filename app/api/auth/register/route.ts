import { NextRequest, NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth-utils";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { mapSupabaseUserToAppUser } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
      }
    | null;
  const name = (body?.name ?? "").trim();
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";
  const confirmPassword = body?.confirmPassword ?? "";

  if (name.length < 2) {
    return NextResponse.json(
      { error: "Enter your name." },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords must match." },
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
    data: { user, session },
    error,
  } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${request.nextUrl.origin}/auth/callback?next=/custom`,
      data: {
        name,
      },
    },
  });

  if (error) {
    const errorMessage = error.message.toLowerCase();

    if (
      errorMessage.includes("already registered") ||
      errorMessage.includes("already been registered") ||
      errorMessage.includes("user already exists")
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    if (
      errorMessage.includes("password") &&
      (errorMessage.includes("weak") || errorMessage.includes("strength"))
    ) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Could not create your account." },
      { status: 500 }
    );
  }

  const appUser =
    session && user
      ? await ensureProfileForSupabaseUser(supabase, user)
      : mapSupabaseUserToAppUser(user);
  const response = NextResponse.json({
    ok: true,
    email,
    user: session && appUser ? appUser : null,
    message:
      session && appUser
        ? "Account created successfully."
        : "Check your email to confirm your account.",
  });

  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
