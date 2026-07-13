import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  event: null as null | Record<string, unknown>,
  claim: { claimed: true, already_completed: false },
  profileUpdate: null as null | Record<string, unknown>,
  billingProfile: {
    email: "person@example.com",
    plan: "pro",
    subscription_status: "active",
    subscription_cancel_at_period_end: false,
  } as Record<string, unknown> | null,
  checkoutProfile: null as Record<string, unknown> | null,
  authUser: { id: "user-1", email: "person@example.com" } as Record<string, unknown> | null,
  subscriptionRetrieve: vi.fn(),
  subscriptionUpdate: vi.fn(),
  subscriptionsList: vi.fn(),
  customerRetrieve: vi.fn(),
  customerUpdate: vi.fn(),
  priceRetrieve: vi.fn(),
  checkoutCreate: vi.fn(),
  lifecycleEmail: vi.fn(),
}));

const databaseBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    if (table === "profiles") mocks.profileUpdate = payload;
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockImplementation(async () => ({
    data: table === "profiles" ? mocks.billingProfile : null,
    error: null,
  }));
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  return builder;
};

const serviceRole = {
  rpc: vi.fn(() => ({
    single: vi.fn().mockImplementation(async () => ({
      data: mocks.claim,
      error: null,
    })),
  })),
  from: vi.fn((table: string) => databaseBuilder(table)),
};

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = { constructEvent: vi.fn(() => mocks.event) };
    subscriptions = {
      retrieve: mocks.subscriptionRetrieve,
      update: mocks.subscriptionUpdate,
      list: mocks.subscriptionsList,
    };
    customers = {
      retrieve: mocks.customerRetrieve,
      update: mocks.customerUpdate,
    };
    prices = { retrieve: mocks.priceRetrieve };
    checkout = { sessions: { create: mocks.checkoutCreate } };
    subscriptionSchedules = {
      retrieve: vi.fn(),
      release: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
  },
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRoleClient: vi.fn(() => serviceRole),
  createSupabaseServerAuthClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mocks.authUser } })) },
  })),
}));
vi.mock("@/lib/profile-store", () => ({
  ensureProfileForSupabaseUser: vi.fn(async () => mocks.checkoutProfile),
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/board-store", () => ({
  getWorkspaceAccess: vi.fn(() => ({ maxBoards: Number.POSITIVE_INFINITY })),
}));
vi.mock("@/lib/email", () => ({
  sendSubscriptionLifecycleEmail: mocks.lifecycleEmail,
}));
vi.mock("@/lib/monitoring", () => ({ reportOperationalError: vi.fn() }));

const webhookRequest = () =>
  new NextRequest("https://scribooapp.com/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "valid-signature" },
    body: "{}",
  });

describe("Stripe billing behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe_for_mock");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_safe_for_mock");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://scribooapp.com");
    vi.stubEnv("STRIPE_PRICE_MASTER_MONTHLY_PLN", "price_master_pln");
    mocks.claim = { claimed: true, already_completed: false };
    mocks.profileUpdate = null;
    mocks.billingProfile = {
      email: "person@example.com",
      plan: "pro",
      subscription_status: "active",
      subscription_cancel_at_period_end: false,
    };
    mocks.checkoutProfile = null;
    mocks.authUser = { id: "user-1", email: "person@example.com" };
    mocks.subscriptionRetrieve.mockReset();
    mocks.subscriptionUpdate.mockReset();
    mocks.subscriptionsList.mockReset();
    mocks.customerRetrieve.mockReset();
    mocks.customerUpdate.mockReset();
    mocks.priceRetrieve.mockReset();
    mocks.checkoutCreate.mockReset();
    mocks.lifecycleEmail.mockReset().mockResolvedValue(undefined);
    serviceRole.rpc.mockClear();
    serviceRole.from.mockClear();
  });

  it("ignores a duplicate completed Stripe webhook", async () => {
    mocks.claim = { claimed: false, already_completed: true };
    mocks.event = {
      id: "evt_duplicate",
      type: "invoice.payment_failed",
      data: { object: {} },
    };
    const { POST } = await import("@/app/api/billing/webhook/route");
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ duplicate: true });
    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
  });

  it("marks the subscription past due after a failed payment", async () => {
    mocks.event = {
      id: "evt_failed_payment",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_1",
          parent: { subscription_details: { subscription: "sub_1" } },
        },
      },
    };
    mocks.subscriptionRetrieve.mockResolvedValue({
      id: "sub_1",
      customer: "cus_1",
      metadata: { targetPlan: "pro", userId: "user-1" },
    });
    const { POST } = await import("@/app/api/billing/webhook/route");
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toMatchObject({
      plan: "pro",
      subscription_status: "past_due",
    });
  });

  it("returns the user to Basic when a subscription is cancelled", async () => {
    mocks.event = {
      id: "evt_cancelled",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          metadata: { targetPlan: "pro", userId: "user-1" },
          items: { data: [] },
        },
      },
    };
    const { POST } = await import("@/app/api/billing/webhook/route");
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toMatchObject({
      plan: "basic",
      subscription_status: "canceled",
      subscription_cancel_at_period_end: false,
    });
    expect(mocks.lifecycleEmail).toHaveBeenCalled();
  });

  it("upgrades an existing subscription immediately without proration", async () => {
    mocks.checkoutProfile = {
      id: "user-1",
      email: "person@example.com",
      name: "Person",
      plan: "pro",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_1",
    };
    mocks.customerRetrieve.mockResolvedValue({
      deleted: false,
      email: "person@example.com",
      name: "Person",
      metadata: { userId: "user-1" },
    });
    mocks.subscriptionsList.mockResolvedValue({
      data: [{
        id: "sub_1",
        status: "active",
        customer: "cus_1",
        schedule: null,
        metadata: { targetPlan: "pro", userId: "user-1" },
        items: { data: [{ id: "si_1", current_period_start: 1, current_period_end: 2_000_000_000, quantity: 1, price: { id: "price_pro" } }] },
      }],
    });
    mocks.priceRetrieve.mockResolvedValue({ unit_amount: 7999 });
    mocks.subscriptionUpdate.mockResolvedValue({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
    });
    const { POST } = await import("@/app/api/billing/checkout/route");
    const response = await POST(new NextRequest(
      "https://scribooapp.com/api/billing/checkout",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetPlan: "master", targetCurrency: "pln" }),
      }
    ));
    expect(response.status).toBe(200);
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ proration_behavior: "none" })
    );
    expect(mocks.profileUpdate).toMatchObject({ plan: "master" });
  });
});
