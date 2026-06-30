import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { getWorkspaceAccess } from "@/lib/board-store";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import {
  createSupabaseServerAuthClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

type BillingPlan = "basic" | "pro" | "master";
type BillingCurrency = "pln" | "eur";

const isBillingPlan = (value: string): value is BillingPlan =>
  value === "basic" || value === "pro" || value === "master";

const isBillingCurrency = (value: string): value is BillingCurrency =>
  value === "pln" || value === "eur";

const getStripePriceEnvKey = (plan: BillingPlan, currency: BillingCurrency) => {
  const suffix = currency === "eur" ? "EUR" : "PLN";

  if (plan === "master") return `STRIPE_PRICE_MASTER_MONTHLY_${suffix}`;
  if (plan === "pro") return `STRIPE_PRICE_PRO_MONTHLY_${suffix}`;
  return `STRIPE_PRICE_BASIC_MONTHLY_${suffix}`;
};

const getLegacyStripePriceEnvKey = (plan: BillingPlan) => {
  if (plan === "master") return "STRIPE_PRICE_MASTER_MONTHLY";
  if (plan === "pro") return "STRIPE_PRICE_PRO_MONTHLY";
  return "STRIPE_PRICE_BASIC_MONTHLY";
};

const hasActiveSubscriptionStatus = (
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled"
) => status === "trialing" || status === "active" || status === "past_due";

const getAppOrigin = (value: string) => value.replace(/\/+$/, "");

const getPlanFromStripeSubscription = (
  subscription: Stripe.Subscription
): BillingPlan => {
  const value = subscription.metadata.targetPlan?.trim();

  if (value === "master" || value === "pro") {
    return value;
  }

  return "basic";
};

const getBillingCheckoutErrorMessage = (error: unknown) => {
  const fallback = "Could not create the Stripe Checkout session.";

  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message;

  if (
    message.includes("Expired API Key provided") ||
    message.includes("Invalid API Key provided")
  ) {
    return "Your Stripe secret key is expired or invalid. Replace STRIPE_SECRET_KEY in .env.local with a current key from the Stripe dashboard, then restart the app.";
  }

  if (message.includes("No such price")) {
    return "One of your Stripe price IDs is invalid. Check the STRIPE_PRICE_*_MONTHLY_PLN and STRIPE_PRICE_*_MONTHLY_EUR values in .env.local.";
  }

  return message || fallback;
};

const updateProfileBilling = async ({
  userId,
  plan,
  subscriptionStatus,
  stripeCustomerId,
  stripeSubscriptionId,
}: {
  userId: string;
  plan: BillingPlan;
  subscriptionStatus: "inactive" | "trialing" | "active" | "past_due" | "canceled";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) => {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      plan,
      subscription_status: subscriptionStatus,
      stripe_customer_id: stripeCustomerId ?? null,
      stripe_subscription_id: stripeSubscriptionId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`SUPABASE_BILLING_UPDATE_FAILED:${error.message}`);
  }
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

  const body = (await request.json().catch(() => null)) as
    | {
        targetPlan?: string;
        targetCurrency?: string;
        confirmSubscriptionChange?: boolean;
      }
    | null;
  const targetPlan = body?.targetPlan ?? "";
  const targetCurrency = body?.targetCurrency ?? "pln";
  const confirmSubscriptionChange = body?.confirmSubscriptionChange === true;

  if (!isBillingPlan(targetPlan)) {
    return NextResponse.json(
      { error: "Choose a valid workspace plan." },
      { status: 400 }
    );
  }

  if (!isBillingCurrency(targetCurrency)) {
    return NextResponse.json(
      { error: "Choose a valid billing currency." },
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
  const stripePriceId =
    process.env[getStripePriceEnvKey(targetPlan, targetCurrency)] ??
    (targetCurrency === "pln"
      ? process.env[getLegacyStripePriceEnvKey(targetPlan)]
      : undefined);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!stripeSecretKey || !stripePriceId || !appUrl) {
    const response = NextResponse.json(
      {
        error:
          "Checkout is not configured yet. Add STRIPE_SECRET_KEY, NEXT_PUBLIC_APP_URL, and the Stripe price IDs for PLN/EUR next.",
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
    if (profile.stripeCustomerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripeCustomerId,
        status: "all",
        limit: 20,
      });
      const existingActiveSubscription = subscriptions.data.find((subscription) =>
        hasActiveSubscriptionStatus(
          subscription.status as
            | "inactive"
            | "trialing"
            | "active"
            | "past_due"
            | "canceled"
        )
      );

      if (existingActiveSubscription) {
        const activePlan = getPlanFromStripeSubscription(
          existingActiveSubscription
        );

        if (activePlan === targetPlan) {
          const access = getWorkspaceAccess(targetPlan, "active");
          const response = NextResponse.json(
            {
              ok: true,
              message: `Your workspace already has an active ${activePlan} subscription.`,
              plan: activePlan,
              subscriptionStatus: "active",
              maxBoards: Number.isFinite(access.maxBoards) ? access.maxBoards : null,
            },
            { status: 200 }
          );

          responseCookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });

          return response;
        }

        const existingSubscriptionItem = existingActiveSubscription.items.data[0];

        if (!existingSubscriptionItem) {
          throw new Error(
            "Your active Stripe subscription does not have a billable item."
          );
        }

        const upcomingInvoice = await stripe.invoices.createPreview({
          customer: profile.stripeCustomerId,
          subscription: existingActiveSubscription.id,
          subscription_details: {
            items: [
              {
                id: existingSubscriptionItem.id,
                price: stripePriceId,
              },
            ],
            proration_behavior: "create_prorations",
          },
        });
        const estimatedImmediateCharge = upcomingInvoice.amount_due;
        const estimatedNextMonthlyCharge =
          upcomingInvoice.lines.data.find(
            (line) =>
              line.parent?.type === "subscription_item_details" &&
              typeof line.pricing?.price_details?.price === "string" &&
              line.pricing.price_details.price === stripePriceId
          )?.amount ?? null;

        if (!confirmSubscriptionChange) {
          const response = NextResponse.json(
            {
              ok: true,
              requiresPlanChangeConfirmation: true,
              currentPlan: activePlan,
              targetPlan,
              currency: targetCurrency,
              estimatedImmediateCharge,
              estimatedNextMonthlyCharge,
            },
            { status: 200 }
          );

          responseCookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });

          return response;
        }

        const updatedSubscription = await stripe.subscriptions.update(
          existingActiveSubscription.id,
          {
            items: [
              {
                id: existingSubscriptionItem.id,
                price: stripePriceId,
              },
            ],
            proration_behavior: "create_prorations",
            metadata: {
              ...existingActiveSubscription.metadata,
              targetPlan,
              userId: profile.id,
            },
          }
        );

        const nextSubscriptionStatus =
          updatedSubscription.status === "trialing" ||
          updatedSubscription.status === "active" ||
          updatedSubscription.status === "past_due"
            ? updatedSubscription.status
            : "active";

        await updateProfileBilling({
          userId: profile.id,
          plan: targetPlan,
          subscriptionStatus: nextSubscriptionStatus,
          stripeCustomerId:
            typeof updatedSubscription.customer === "string"
              ? updatedSubscription.customer
              : profile.stripeCustomerId,
          stripeSubscriptionId: updatedSubscription.id,
        });

        const access = getWorkspaceAccess(targetPlan, nextSubscriptionStatus);
        const response = NextResponse.json(
          {
            ok: true,
            message: `Your subscription has been updated to ${targetPlan}.`,
            plan: targetPlan,
            subscriptionStatus: nextSubscriptionStatus,
            maxBoards: Number.isFinite(access.maxBoards) ? access.maxBoards : null,
            estimatedImmediateCharge,
          },
          { status: 200 }
        );

        responseCookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        return response;
      }
    }

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
      subscription_data: {
        metadata: {
          targetPlan,
          userId: profile.id,
        },
      },
      success_url: `${appOrigin}/custom?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/custom?checkout=cancelled&plan=${targetPlan}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: getBillingCheckoutErrorMessage(error),
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
