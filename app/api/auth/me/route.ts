import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";

import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const getCurrentPeriodEndIso = (subscription: Stripe.Subscription) => {
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  return typeof currentPeriodEnd === "number"
    ? new Date(currentPeriodEnd * 1000).toISOString()
    : null;
};

const getScheduledCancelAtIso = (subscription: Stripe.Subscription) =>
  typeof subscription.cancel_at === "number"
    ? new Date(subscription.cancel_at * 1000).toISOString()
    : null;

const getCancellationScheduledFlag = (subscription: Stripe.Subscription) =>
  subscription.cancel_at_period_end ||
  (typeof subscription.cancel_at === "number" &&
    subscription.cancel_at * 1000 > Date.now());

const getEffectiveSubscriptionEndIso = (subscription: Stripe.Subscription) =>
  getScheduledCancelAtIso(subscription) ?? getCurrentPeriodEndIso(subscription);

const getSubscriptionSortScore = (
  subscription: Stripe.Subscription,
  desiredPlan: string
) => {
  const metadataPlan = subscription.metadata.targetPlan?.trim().toLowerCase() ?? "";
  const planMatchScore = metadataPlan === desiredPlan ? 100 : 0;
  const activeLikeScore = subscription.status !== "canceled" ? 20 : 0;
  const cancelAtPeriodEndScore = subscription.cancel_at_period_end ? 10 : 0;
  const currentPeriodEndScore = subscription.items.data[0]?.current_period_end ?? 0;

  return (
    planMatchScore +
    activeLikeScore +
    cancelAtPeriodEndScore +
    currentPeriodEndScore / 100000000
  );
};

const pickBestSubscription = (
  subscriptions: Stripe.Subscription[],
  desiredPlan: string
) => {
  const uniqueSubscriptions = subscriptions.filter(
    (subscription, index, list) =>
      list.findIndex((candidate) => candidate.id === subscription.id) === index
  );

  return uniqueSubscriptions
    .sort(
      (first, second) =>
        getSubscriptionSortScore(second, desiredPlan) -
        getSubscriptionSortScore(first, desiredPlan)
    )[0] ?? null;
};

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerAuthClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      });
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await ensureProfileForSupabaseUser(supabase, user) : null;

  let enhancedUser = profile
    ? {
        ...profile,
        subscriptionCancelAtPeriodEnd: profile.subscriptionCancelAtPeriodEnd,
        subscriptionCurrentPeriodEnd: profile.subscriptionCurrentPeriodEnd,
      }
    : null;

  if (
    enhancedUser &&
    (enhancedUser.stripeSubscriptionId || enhancedUser.stripeCustomerId) &&
    process.env.STRIPE_SECRET_KEY
  ) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const subscriptionCandidates: Stripe.Subscription[] = [];

      if (enhancedUser.stripeSubscriptionId) {
        try {
          const directSubscription = await stripe.subscriptions.retrieve(
            enhancedUser.stripeSubscriptionId
          );

          subscriptionCandidates.push(directSubscription);
        } catch {
          // Fall back to listing by customer below.
        }
      }

      if (enhancedUser.stripeCustomerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: enhancedUser.stripeCustomerId,
          status: "all",
          limit: 10,
        });

        subscriptionCandidates.push(...subscriptions.data);
      }

      const subscription = pickBestSubscription(
        subscriptionCandidates,
        enhancedUser.plan
      );

      if (subscription) {
        enhancedUser = {
          ...enhancedUser,
          subscriptionCancelAtPeriodEnd: getCancellationScheduledFlag(subscription),
          subscriptionCurrentPeriodEnd: getEffectiveSubscriptionEndIso(subscription),
        };
      }
    } catch {
      // If Stripe is temporarily unavailable, still return the local profile.
    }
  }

  return NextResponse.json(
    {
      user: enhancedUser,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
