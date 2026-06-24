import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerAuthClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      });
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await ensureProfileForSupabaseUser(supabase, user) : null;

  return NextResponse.json({
    user: profile,
  });
}
