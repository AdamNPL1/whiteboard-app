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

  it("keeps browser users from bypassing board limits", () => {
    const sql = readSql("rls-policies.sql");

    expect(sql).toContain(
      "revoke all on table public.boards from anon, authenticated"
    );
    expect(sql).toContain(
      "revoke all on table public.user_board_state from anon, authenticated"
    );
    expect(sql).toContain("create trigger enforce_board_plan_limit_trigger");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).not.toContain('create policy "boards_insert_own"');
    expect(sql).not.toContain('create policy "boards_update_own"');
  });

  it("keeps call mutations server-owned and Realtime topics participant-only", () => {
    const sql = readSql("call-sessions.sql");

    expect(sql).toContain(
      "revoke all on table public.call_sessions from anon, authenticated"
    );
    expect(sql).toContain(
      "grant select on table public.call_sessions to authenticated"
    );
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("call_sessions.caller_user_id");
    expect(sql).toContain("call_sessions.recipient_user_id");
    expect(sql).toContain("on realtime.messages");
    expect(sql).toContain("realtime.messages.extension in ('broadcast', 'presence')");
    expect(sql).not.toContain('create policy "call_sessions_insert');
    expect(sql).not.toContain('create policy "call_sessions_update');
  });

  it("limits private board Realtime topics to authorized board participants", () => {
    const sql = readSql("board-realtime.sql");

    expect(sql).toContain("on realtime.messages");
    expect(sql).toContain("'board:' || boards.id");
    expect(sql).toContain("boards.user_id = (select auth.uid())");
    expect(sql).toContain("board_shares.recipient_user_id = (select auth.uid())");
    expect(sql).toContain("board_shares.status = 'accepted'");
    expect(sql).toContain("board_shares.permission = 'editor'");
  });
});
