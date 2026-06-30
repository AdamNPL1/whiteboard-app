import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { getWorkspaceAccess } from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { getSupabaseServiceRoleClient, createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const normalizePlan = (value: string | null | undefined) => {
  if (value === "pro" || value === "master") {
    return value;
  }

  return "basic";
};

const normalizeSubscriptionStatus = (
  value: string | null | undefined
) => {
  if (
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled"
  ) {
    return value;
  }

  return "active";
};

export async function POST(request: NextRequest) {
  const responseCookies: Array<{
    name: string;
    value: string;
    options: Parameters<NextResponse["cookies"]["set"]>[2];
  }> = [];
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        responseCookies.push({ name, value, options });
      });
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const profile = await ensureProfileForSupabaseUser(supabase, user);

  if (!profile) {
    return NextResponse.json(
      { error: "Could not load your billing profile." },
      { status: 500 }
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Missing STRIPE_SECRET_KEY in .env.local." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        sessionId?: string;
      }
    | null;
  const sessionId = body?.sessionId?.trim() ?? "";

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing Stripe session ID." },
      { status: 400 }
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load the Stripe checkout session.",
      },
      { status: 500 }
    );
  }

  const sessionUserId =
    typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : typeof session.metadata?.userId === "string"
      ? session.metadata.userId
      : "";

  if (sessionUserId !== user.id) {
    return NextResponse.json(
      { error: "This checkout session does not belong to the current user." },
      { status: 403 }
    );
  }

  if (session.status !== "complete") {
    return NextResponse.json(
      { error: "Stripe checkout is not completed yet." },
      { status: 400 }
    );
  }

  const subscription =
    typeof session.subscription === "object" && session.subscription
      ? session.subscription
      : null;
  const targetPlan = normalizePlan(
    subscription?.metadata?.targetPlan ?? session.metadata?.targetPlan
  );
  const subscriptionStatus = normalizeSubscriptionStatus(subscription?.status);
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  const serviceSupabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { error: updateError } = await serviceSupabase
    .from("profiles")
    .update({
      plan: targetPlan,
      subscription_status: subscriptionStatus,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      updated_at: now,
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `SUPABASE_BILLING_UPDATE_FAILED:${updateError.message}` },
      { status: 500 }
    );
  }

  const access = getWorkspaceAccess(targetPlan, subscriptionStatus);

  const response = NextResponse.json(
    {
      ok: true,
      plan: targetPlan,
      subscriptionStatus,
      maxBoards: Number.isFinite(access.maxBoards) ? access.maxBoards : null,
    },
    { status: 200 }
  );

  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
