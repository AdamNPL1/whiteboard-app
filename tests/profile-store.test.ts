import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serviceFrom: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRoleClient: vi.fn(() => ({
    from: mocks.serviceFrom,
  })),
}));

import { ensureProfileForSupabaseUser } from "@/lib/profile-store";

const profileRow = {
  id: "user-1",
  email: "person@example.com",
  name: "Old name",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  plan: "pro",
  subscription_status: "active",
  subscription_cancel_at_period_end: false,
  subscription_current_period_end: null,
  stripe_customer_id: "cus_123",
  stripe_subscription_id: "sub_123",
  onboarding_status: "completed",
};

describe("profile store write isolation", () => {
  beforeEach(() => {
    mocks.serviceFrom.mockReset();
  });

  it("uses the authenticated client only to read and the service role to update", async () => {
    const authenticatedUpdate = vi.fn();
    const authenticatedRead = {
      select: vi.fn(() => authenticatedRead),
      eq: vi.fn(() => authenticatedRead),
      maybeSingle: vi.fn(async () => ({ data: profileRow, error: null })),
      update: authenticatedUpdate,
    };
    const authenticatedClient = {
      from: vi.fn(() => authenticatedRead),
    };

    const serviceUpdate = vi.fn();
    const serviceQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    serviceQuery.update = serviceUpdate.mockImplementation(() => serviceQuery);
    serviceQuery.eq = vi.fn(() => serviceQuery);
    serviceQuery.select = vi.fn(() => serviceQuery);
    serviceQuery.single = vi.fn(async () => ({
      data: { ...profileRow, name: "New name" },
      error: null,
    }));
    mocks.serviceFrom.mockReturnValue(serviceQuery);

    const result = await ensureProfileForSupabaseUser(
      authenticatedClient as never,
      {
        id: "user-1",
        email: "person@example.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        user_metadata: { name: "New name" },
      } as never
    );

    expect(authenticatedClient.from).toHaveBeenCalledWith("profiles");
    expect(authenticatedUpdate).not.toHaveBeenCalled();
    expect(mocks.serviceFrom).toHaveBeenCalledWith("profiles");
    expect(serviceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New name" })
    );
    expect(serviceUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({
        plan: expect.anything(),
        subscription_status: expect.anything(),
        stripe_customer_id: expect.anything(),
        stripe_subscription_id: expect.anything(),
      })
    );
    expect(result?.plan).toBe("pro");
  });
});
