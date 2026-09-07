import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const migration = readFileSync(resolve(process.cwd(), "supabase/call-spam-protection.sql"), "utf8");
describe("call spam protection migration", () => {
  it("enforces blocks, DND and escalating decline cooldowns", () => {
    expect(migration).toContain("public.call_blocks");
    expect(migration).toContain("dnd_until > v_now");
    expect(migration).toContain("when v_declines >= 3 then 1800");
    expect(migration).toContain("when v_declines >= 1 then 120");
  });
  it("retains abuse metadata only temporarily", () => {
    expect(migration).toContain("public.cleanup_call_abuse_events");
    expect(migration).toContain("interval '30 days'");
  });
});
