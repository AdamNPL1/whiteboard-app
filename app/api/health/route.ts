import { NextResponse } from "next/server";

import { summarizeOperationalHealth } from "@/lib/health-status";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const client = getSupabaseServiceRoleClient();
    const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
    const [database, failedEmails, stuckEmails, failedWebhooks] = await Promise.all([
      client.from("profiles").select("id", { count: "exact", head: true }),
      client.from("email_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      client
        .from("email_jobs")
        .select("id", { count: "exact", head: true })
        .or(`and(status.eq.pending,available_at.lt.${staleBefore}),and(status.eq.processing,processing_started_at.lt.${staleBefore})`),
      client.from("stripe_webhook_events").select("event_id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    const health = summarizeOperationalHealth({ database, failedEmails, stuckEmails, failedWebhooks });
    if (!health.healthy) {
      reportOperationalError(new Error(`HEALTH_CHECK_DEGRADED:${health.problems.join(",")}`), {
        area: "health",
        operation: "dependency-check",
        statusCode: 503,
        durationMs: Date.now() - startedAt,
      });
    }
    return NextResponse.json(
      {
        status: health.healthy ? "ok" : "degraded",
        database: health.components.database,
        components: health.components,
        responseTimeMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      },
      { status: health.healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    reportOperationalError(error, {
      area: "health",
      operation: "health-route",
      statusCode: 503,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { status: "degraded", components: { database: "unavailable" }, checkedAt: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
