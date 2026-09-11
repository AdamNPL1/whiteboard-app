import { NextRequest, NextResponse } from "next/server";
import {
  deliverAccountDeletedEmail,
  deliverBoardShareInviteEmail,
  deliverSubscriptionLifecycleEmail,
  deliverSupportRequestEmails,
} from "@/lib/email";
import type { EmailJob } from "@/lib/email-queue";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ClaimedJob = { id: string; kind: EmailJob["kind"]; payload: EmailJob["payload"]; attempts: number };

const deliver = async (job: ClaimedJob) => {
  switch (job.kind) {
    case "board_share_invite": return deliverBoardShareInviteEmail(job.payload as Extract<EmailJob, { kind: "board_share_invite" }>["payload"]);
    case "account_deleted": return deliverAccountDeletedEmail(job.payload as Extract<EmailJob, { kind: "account_deleted" }>["payload"]);
    case "subscription_lifecycle": return deliverSubscriptionLifecycleEmail(job.payload as Extract<EmailJob, { kind: "subscription_lifecycle" }>["payload"]);
    case "support_request": return deliverSupportRequestEmails(job.payload as Extract<EmailJob, { kind: "support_request" }>["payload"]);
    default: throw new Error("UNKNOWN_EMAIL_KIND");
  }
};

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const client = getSupabaseServiceRoleClient();
  const { data, error } = await client.rpc("claim_email_jobs", { p_limit: 10, p_stale_seconds: 900 });
  if (error) return NextResponse.json({ error: "Could not claim email jobs." }, { status: 503 });

  let sent = 0;
  let retried = 0;
  let failed = 0;
  for (const job of (data ?? []) as ClaimedJob[]) {
    try {
      await deliver(job);
      const { error: updateError } = await client.from("email_jobs").update({ status: "sent", sent_at: new Date().toISOString(), processing_started_at: null, last_error_code: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      if (updateError) throw updateError;
      sent += 1;
    } catch (deliveryError) {
      const terminal = job.attempts >= 5;
      const delayMinutes = [5, 15, 60, 360][Math.min(Math.max(job.attempts - 1, 0), 3)];
      await client.from("email_jobs").update({
        status: terminal ? "failed" : "pending",
        available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        processing_started_at: null,
        last_error_code: deliveryError instanceof Error ? deliveryError.name.slice(0, 80) : "DELIVERY_FAILED",
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (terminal) {
        failed += 1;
        reportOperationalError(deliveryError, { area: "email", operation: `permanent-failure-${job.kind}` });
      } else retried += 1;
    }
  }
  await client.from("email_jobs").delete().eq("status", "sent").lt("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
  return NextResponse.json({ ok: true, claimed: data?.length ?? 0, sent, retried, failed });
}
