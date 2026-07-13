import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  reauthError: null as null | { message: string },
  deletedTables: [] as string[],
  deleteUser: vi.fn(),
  deletionEmail: vi.fn(),
}));

const resultForTable = (table: string) => {
  if (table === "profiles") {
    return {
      data: {
        id: "user-1",
        email: "person@example.com",
        name: "Person",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        plan: "basic",
        subscription_status: "inactive",
        subscription_cancel_at_period_end: false,
        subscription_current_period_end: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        onboarding_status: "completed",
      },
      error: null,
    };
  }
  if (table === "user_board_state") return { data: null, error: null };
  return { data: [], error: null };
};

const queryBuilder = (table: string) => {
  let isDelete = false;
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.delete = vi.fn(() => {
    isDelete = true;
    mocks.deletedTables.push(table);
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => resultForTable(table));
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(isDelete ? { error: null } : resultForTable(table)).then(resolve);
  return builder;
};

const serviceRole = {
  from: vi.fn((table: string) => queryBuilder(table)),
  auth: { admin: { deleteUser: mocks.deleteUser } },
};

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerAuthClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mocks.user } })),
      signInWithPassword: vi.fn(async () => ({ error: mocks.reauthError })),
    },
  })),
  getSupabaseServiceRoleClient: vi.fn(() => serviceRole),
}));
vi.mock("@/lib/email", () => ({
  sendAccountDeletedEmail: mocks.deletionEmail,
}));

import { DELETE as deleteAccount } from "@/app/api/account/route";
import { GET as exportAccount } from "@/app/api/account/export/route";

const deletionRequest = (body: unknown) =>
  new NextRequest("https://scribooapp.com/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("account deletion and export", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.reauthError = null;
    mocks.deletedTables.length = 0;
    mocks.deleteUser.mockReset().mockResolvedValue({ error: null });
    mocks.deletionEmail.mockReset().mockResolvedValue(undefined);
    serviceRole.from.mockClear();
  });

  it("requires password and an exact DELETE confirmation", async () => {
    const missingPassword = await deleteAccount(
      deletionRequest({ confirmation: "DELETE" })
    );
    expect(missingPassword.status).toBe(400);

    const wrongConfirmation = await deleteAccount(
      deletionRequest({ password: "password1", confirmation: "delete" })
    );
    expect(wrongConfirmation.status).toBe(400);
  });

  it("does not export data for an unauthenticated request", async () => {
    const response = await exportAccount(
      new NextRequest("https://scribooapp.com/api/account/export")
    );
    expect(response.status).toBe(401);
  });

  it("deletes account-owned records only after reauthentication", async () => {
    mocks.user = {
      id: "user-1",
      email: "person@example.com",
      app_metadata: { providers: ["email"] },
    };
    const response = await deleteAccount(
      deletionRequest({ password: "password1", confirmation: "DELETE" })
    );
    expect(response.status).toBe(200);
    expect(mocks.deletedTables).toEqual(
      expect.arrayContaining([
        "user_board_state",
        "board_shares",
        "boards",
        "profiles",
      ])
    );
    expect(mocks.deleteUser).toHaveBeenCalledWith("user-1");
    expect(mocks.deletionEmail).toHaveBeenCalledWith({
      recipientEmail: "person@example.com",
    });
  });

  it("exports a reusable JSON package for the authenticated account", async () => {
    mocks.user = {
      id: "user-1",
      email: "PERSON@EXAMPLE.COM",
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      last_sign_in_at: "2026-01-02T00:00:00.000Z",
      app_metadata: { providers: ["email"] },
    };
    const response = await exportAccount(
      new NextRequest("https://scribooapp.com/api/account/export")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const payload = await response.json();
    expect(payload.account.auth.email).toBe("person@example.com");
    expect(payload).toHaveProperty("boards");
    expect(payload).toHaveProperty("subscription");
    expect(payload).toHaveProperty("sharing");
  });
});
