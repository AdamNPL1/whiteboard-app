import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const { error } = await getSupabaseServiceRoleClient()
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json(
      { status: "ok", database: "ok", responseTimeMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
