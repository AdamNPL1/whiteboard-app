import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/call-privacy-authorization.sql"),
  "utf8"
);

describe("call privacy authorization migration", () => {
  it("ends calls when board access is revoked or a board closes", () => {
    expect(migration).toContain("end_calls_before_board_share_revocation");
    expect(migration).toContain("end_calls_before_board_close");
    expect(migration).toContain("board_access_revoked");
    expect(migration).toContain("board_closed");
  });

  it("keeps cleanup private and applies finite retention", () => {
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("revoke all on function public.cleanup_private_call_data()");
    expect(migration).toContain("grant execute on function public.cleanup_private_call_data() to service_role");
  });
});
