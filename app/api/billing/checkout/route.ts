import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { getWorkspaceAccess } from "@/lib/board-store";
import { sendSubscriptionLifecycleEmail } from "@/lib/email";
import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  createSupabaseServerAuthClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

type BillingPlan = "basic" | "pro" | "master";
type BillingCurrency = "pln" | "eur";

const BILLING_PLAN_RANK: Record<BillingPlan, number> = {
  basic: 0,
  pro: 1,
  master: 2,
};

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

const isStripePriceId = (value: string | undefined | null): value is string =>
  typeof value === "string" && value.trim().startsWith("price_");

const resolveStripePriceId = (
  plan: BillingPlan,
  currency: BillingCurrency
): {
  priceId?: string;
  checkedKeys: string[];
} => {
  const checkedKeys: string[] = [];
  const preferredKey = getStripePriceEnvKey(plan, currency);
  const preferredValue = process.env[preferredKey];
  checkedKeys.push(preferredKey);

  if (isStripePriceId(preferredValue)) {
    return {
      priceId: preferredValue.trim(),
      checkedKeys,
    };
  }

  if (currency === "pln") {
    const legacyKey = getLegacyStripePriceEnvKey(plan);
    const legacyValue = process.env[legacyKey];
    checkedKeys.push(legacyKey);

    if (isStripePriceId(legacyValue)) {
      return {
        priceId: legacyValue.trim(),
        checkedKeys,
      };
    }
  }

  return { checkedKeys };
};

const hasActiveSubscriptionStatus = (
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled"
) => status === "trialing" || status === "active" || status === "past_due";

const getAppOrigin = (value: string) => value.replace(/\/+$/, "");

const isPlanUpgrade = (
  currentPlan: BillingPlan,
  targetPlan: BillingPlan
) => BILLING_PLAN_RANK[targetPlan] > BILLING_PLAN_RANK[currentPlan];

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

  const rateLimit = await enforceRateLimit(request, {
    action: "billing-checkout",
    limit: 10,
    windowSeconds: 10 * 60,
    identifiers: [user.id],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

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
  const { priceId: stripePriceId, checkedKeys: checkedStripePriceKeys } =
    resolveStripePriceId(targetPlan, targetCurrency);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!stripeSecretKey || !stripePriceId || !appUrl) {
    const missingConfigDetails = !stripePriceId
      ? ` Checked price variables: ${checkedStripePriceKeys.join(", ")}.`
      : "";
    const response = NextResponse.json(
      {
        error:
          `Checkout is not configured yet. Add STRIPE_SECRET_KEY, NEXT_PUBLIC_APP_URL, and valid Stripe price IDs.${missingConfigDetails}`,
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
      const existingCustomer = await stripe.customers.retrieve(
        profile.stripeCustomerId
      );

      if (!existingCustomer.deleted) {
        const customerEmail = existingCustomer.email?.trim() ?? "";
        const customerName = existingCustomer.name?.trim() ?? "";

        if (
          customerEmail.toLowerCase() !== profile.email.toLowerCase() ||
          customerName !== profile.name
        ) {
          await stripe.customers.update(profile.stripeCustomerId, {
            email: profile.email,
            name: profile.name || undefined,
            metadata: {
              ...existingCustomer.metadata,
              userId: profile.id,
            },
          });
        }
      }

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
        const upgradingPlan = isPlanUpgrade(activePlan, targetPlan);

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

        const targetPrice = await stripe.prices.retrieve(stripePriceId);
        const estimatedImmediateCharge = 0;
        const estimatedNextMonthlyCharge = targetPrice.unit_amount;
        const changeEffectiveAt = new Date(
          existingSubscriptionItem.current_period_end * 1000
        ).toISOString();

        if (!upgradingPlan && !confirmSubscriptionChange) {
          const response = NextResponse.json(
            {
              ok: true,
              requiresPlanChangeConfirmation: true,
              currentPlan: activePlan,
              targetPlan,
              currency: targetCurrency,
              estimatedImmediateCharge,
              estimatedNextMonthlyCharge,
              changeEffectiveAt,
            },
            { status: 200 }
          );

          responseCookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });

          return response;
        }

        if (!upgradingPlan) {
          const scheduleReference = existingActiveSubscription.schedule;

          if (scheduleReference) {
            const scheduleId =
              typeof scheduleReference === "string"
                ? scheduleReference
                : scheduleReference.id;
            const existingSchedule =
              await stripe.subscriptionSchedules.retrieve(scheduleId);

            if (
              existingSchedule.metadata?.scribooChange !== "downgrade"
            ) {
              throw new Error(
                "This subscription already has another scheduled change. Open billing support before scheduling a downgrade."
              );
            }

            await stripe.subscriptionSchedules.release(scheduleId);
          }

          const schedule = await stripe.subscriptionSchedules.create({
            from_subscription: existingActiveSubscription.id,
            metadata: {
              scribooChange: "downgrade",
              userId: profile.id,
              fromPlan: activePlan,
              targetPlan,
            },
          });

          await stripe.subscriptionSchedules.update(schedule.id, {
            end_behavior: "release",
            proration_behavior: "none",
            phases: [
              {
                start_date: existingSubscriptionItem.current_period_start,
                end_date: existingSubscriptionItem.current_period_end,
                items: [
                  {
                    price: existingSubscriptionItem.price.id,
                    quantity: existingSubscriptionItem.quantity ?? 1,
                  },
                ],
                proration_behavior: "none",
                metadata: {
                  ...existingActiveSubscription.metadata,
                  targetPlan: activePlan,
                  userId: profile.id,
                  pendingPlan: targetPlan,
                },
              },
              {
                start_date: existingSubscriptionItem.current_period_end,
                duration: { interval: "month", interval_count: 1 },
                items: [{ price: stripePriceId, quantity: 1 }],
                proration_behavior: "none",
                metadata: {
                  ...existingActiveSubscription.metadata,
                  targetPlan,
                  userId: profile.id,
                  pendingPlan: "",
                },
              },
            ],
          });

          try {
            await sendSubscriptionLifecycleEmail({
              recipientEmail: profile.email,
              subject: `Your ${targetPlan} plan is scheduled`,
              heading: "Your plan change is scheduled",
              message: `You keep ${activePlan} until your next renewal. There is no charge or credit today.`,
              details: [
                { label: "Current plan", value: activePlan },
                { label: "Next plan", value: targetPlan },
                {
                  label: "Change date",
                  value: new Date(changeEffectiveAt).toLocaleDateString("en-GB"),
                },
              ],
            });
          } catch (emailError) {
            console.error("Scheduled downgrade email failed", emailError);
          }

          const access = getWorkspaceAccess(activePlan, "active");
          const response = NextResponse.json(
            {
              ok: true,
              message: `Your ${targetPlan} plan is scheduled to begin on your next renewal date. You keep ${activePlan} until then, and there is no charge today.`,
              plan: activePlan,
              pendingPlan: targetPlan,
              changeEffectiveAt,
              subscriptionStatus: "active",
              maxBoards: Number.isFinite(access.maxBoards)
                ? access.maxBoards
                : null,
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
            proration_behavior: "none",
            metadata: {
              ...existingActiveSubscription.metadata,
              targetPlan,
              userId: profile.id,
              pendingPlan: "",
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

        try {
          await sendSubscriptionLifecycleEmail({
            recipientEmail: profile.email,
            subject: `Your Scriboo plan was upgraded to ${targetPlan}`,
            heading: "Your upgrade is active",
            message: `Your ${targetPlan} features are available now. There is no charge today; the full ${targetPlan} price starts on your next renewal date.`,
            details: [
              { label: "Previous plan", value: activePlan },
              { label: "Current plan", value: targetPlan },
              {
                label: "Next renewal",
                value: new Date(changeEffectiveAt).toLocaleDateString("en-GB"),
              },
            ],
          });
        } catch (emailError) {
          console.error("Upgrade confirmation email failed", emailError);
        }

        const access = getWorkspaceAccess(targetPlan, nextSubscriptionStatus);
        const response = NextResponse.json(
          {
            ok: true,
            message: `Your workspace is now on ${targetPlan}. There is no charge today; Stripe will charge the full ${targetPlan} price on your next renewal date.`,
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
      success_url: `${appOrigin}/?view=plan&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/?view=plan&checkout=cancelled&plan=${targetPlan}`,
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
