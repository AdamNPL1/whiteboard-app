import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type BillingPlan = "basic" | "pro" | "master";

const isBillingPlan = (value: string): value is BillingPlan =>
  value === "basic" || value === "pro" || value === "master";

const getStripePriceEnvKey = (plan: BillingPlan) => {
  if (plan === "master") return "STRIPE_PRICE_MASTER_MONTHLY";
  if (plan === "pro") return "STRIPE_PRICE_PRO_MONTHLY";
  return "STRIPE_PRICE_BASIC_MONTHLY";
};

const hasActiveSubscriptionStatus = (
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled"
) => status === "trialing" || status === "active" || status === "past_due";

const getAppOrigin = (value: string) => value.replace(/\/+$/, "");

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

  const body = (await request.json().catch(() => null)) as
    | {
        targetPlan?: string;
      }
    | null;
  const targetPlan = body?.targetPlan ?? "";

  if (!isBillingPlan(targetPlan)) {
    return NextResponse.json(
      { error: "Choose a valid workspace plan." },
      { status: 400 }
    );
  }

  if (
    targetPlan === profile.plan &&
    hasActiveSubscriptionStatus(profile.subscriptionStatus)
  ) {
    return NextResponse.json({
      ok: true,
      message: `Your workspace is already on the ${profile.plan} plan.`,
    });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env[getStripePriceEnvKey(targetPlan)];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!stripeSecretKey || !stripePriceId || !appUrl) {
    const response = NextResponse.json(
      {
        error:
          "Checkout is not configured yet. Add STRIPE_SECRET_KEY, NEXT_PUBLIC_APP_URL, and the Stripe price IDs next.",
      },
      { status: 501 }
    );

    responseCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  }

  const stripe = new Stripe(stripeSecretKey);
  const appOrigin = getAppOrigin(appUrl);
  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      customer: profile.stripeCustomerId ?? undefined,
      customer_email: profile.stripeCustomerId ? undefined : profile.email,
      client_reference_id: profile.id,
      metadata: {
        targetPlan,
        userId: profile.id,
      },
      success_url: `${appOrigin}/custom?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/custom?checkout=cancelled&plan=${targetPlan}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create the Stripe Checkout session.",
      },
      { status: 500 }
    );
  }

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe Checkout did not return a redirect URL." },
      { status: 500 }
    );
  }

  const response = NextResponse.json(
    {
      ok: true,
      checkoutReady: true,
      checkoutUrl: session.url,
      targetPlan,
    },
    { status: 200 }
  );

  responseCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}
