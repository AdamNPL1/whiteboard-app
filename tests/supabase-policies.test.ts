import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readSql = (filename: string) =>
  readFileSync(resolve("supabase", filename), "utf8").toLowerCase();

describe("Supabase write boundaries", () => {
  it("keeps browser users from mutating billing profiles", () => {
    const sql = readSql("profiles.sql");

    expect(sql).toContain(
      "revoke insert, update, delete on table public.profiles from anon, authenticated"
    );
    expect(sql).not.toContain('create policy "profiles_update_own"');
    expect(sql).not.toContain('create policy "profiles_insert_own"');
  });

  it("keeps browser users from manufacturing board shares", () => {
    const sql = readSql("board-shares.sql");

    expect(sql).toContain(
      "revoke all on table public.board_shares from anon, authenticated"
    );
    expect(sql).toContain(
      "grant select on table public.board_shares to authenticated"
    );
    expect(sql).not.toContain('create policy "board_shares_insert_owner"');
    expect(sql).not.toContain('create policy "board_shares_delete_owner"');
  });
});
