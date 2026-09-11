import "server-only";

import { createHash } from "crypto";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type EmailJob =
  | { kind: "board_share_invite"; payload: { appOrigin: string; ownerEmail: string; recipientEmail: string; invitationToken: string; expiresAt: string } }
  | { kind: "account_deleted"; payload: { recipientEmail: string } }
  | { kind: "subscription_lifecycle"; payload: { recipientEmail: string; subject: string; heading: string; message: string; details?: Array<{ label: string; value: string }>; eventId?: string } }
  | { kind: "support_request"; payload: { ticketNumber: string; requesterEmail: string; subject: string; category: string; message: string; accountId?: string } };

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export const getEmailIdempotencyKey = (job: EmailJob) => {
  switch (job.kind) {
    case "board_share_invite": return `invite:${digest(job.payload.invitationToken)}`;
    case "account_deleted": return `account-deleted:${digest(job.payload.recipientEmail.toLowerCase())}`;
    case "subscription_lifecycle": return `billing:${job.payload.eventId ?? digest(JSON.stringify(job.payload))}:${digest(job.payload.subject).slice(0, 16)}`;
    case "support_request": return `support:${job.payload.ticketNumber}`;
  }
};

export const enqueueEmail = async (job: EmailJob) => {
  const { error } = await getSupabaseServiceRoleClient().from("email_jobs").upsert({
    kind: job.kind,
    idempotency_key: getEmailIdempotencyKey(job),
    payload: job.payload,
    status: "pending",
    available_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (error) throw new Error(`EMAIL_QUEUE_FAILED:${error.code || "unknown"}`);
};
