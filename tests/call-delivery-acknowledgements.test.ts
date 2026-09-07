import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const migration = readFileSync(resolve(process.cwd(), "supabase/call-delivery-acknowledgements.sql"), "utf8");
describe("incoming call delivery acknowledgements", () => {
  it("only allows the recipient to acknowledge a live ringing call", () => {
    expect(migration).toContain("c.recipient_user_id<>p_recipient_user_id");
    expect(migration).toContain("c.status<>'ringing'");
    expect(migration).toContain("c.ring_expires_at<=v_now");
  });
});
