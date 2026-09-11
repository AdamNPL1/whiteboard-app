import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRoleClient: () => ({
    from: () => ({ upsert: mocks.upsert }),
  }),
}));

import { enqueueEmail, getEmailIdempotencyKey } from "@/lib/email-queue";

describe("durable email queue", () => {
  beforeEach(() => mocks.upsert.mockReset().mockResolvedValue({ error: null }));

  it("uses a stable key without exposing an invitation token", () => {
    const job = { kind: "board_share_invite" as const, payload: { appOrigin: "https://scribooapp.com", ownerEmail: "owner@example.com", recipientEmail: "user@example.com", invitationToken: "secret-token", expiresAt: "tomorrow" } };
    const key = getEmailIdempotencyKey(job);
    expect(key).toMatch(/^invite:[a-f0-9]{64}$/);
    expect(key).not.toContain("secret-token");
  });

  it("inserts duplicate-safe pending jobs", async () => {
    await enqueueEmail({ kind: "account_deleted", payload: { recipientEmail: "USER@example.com" } });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ kind: "account_deleted", status: "pending" }), { onConflict: "idempotency_key", ignoreDuplicates: true });
  });
});
