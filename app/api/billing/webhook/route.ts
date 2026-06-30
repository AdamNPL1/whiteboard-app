import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import {
  type AppProfilePlan,
  type AppProfileSubscriptionStatus,
} from "@/lib/profile-store";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const getStripeClient = () => {
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return new Stripe(stripeSecretKey);
};

const normalizePlan = (value: string | null | undefined): AppProfilePlan => {
  if (value === "pro" || value === "master") {
    return value;
  }

  return "basic";
};

const normalizeSubscriptionStatus = (
  value: string | null | undefined
): AppProfileSubscriptionStatus => {
  if (
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled"
  ) {
    return value;
  }

  return "inactive";
};

const getUserIdFromSubscription = (subscription: Stripe.Subscription) => {
  const metadataUserId = subscription.metadata.userId?.trim();

  if (metadataUserId) {
    return metadataUserId;
  }

  const customerReferenceId =
    typeof subscription.metadata.client_reference_id === "string"
      ? subscription.metadata.client_reference_id.trim()
      : "";

  return customerReferenceId || null;
};

const updateProfileBilling = async ({
  userId,
  stripeCustomerId,
  stripeSubscriptionId,
  plan,
  subscriptionStatus,
}: {
  userId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan: AppProfilePlan;
  subscriptionStatus: AppProfileSubscriptionStatus;
}) => {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();

  let query = supabase.from("profiles").update({
    plan,
    subscription_status: subscriptionStatus,
    stripe_customer_id: stripeCustomerId ?? null,
    stripe_subscription_id: stripeSubscriptionId ?? null,
    updated_at: now,
  });

  if (userId) {
    query = query.eq("id", userId);
  } else if (stripeCustomerId) {
    query = query.eq("stripe_customer_id", stripeCustomerId);
  } else if (stripeSubscriptionId) {
    query = query.eq("stripe_subscription_id", stripeSubscriptionId);
  } else {
    throw new Error("No profile selector available for billing update.");
  }

  const { error } = await query;

  if (error) {
    throw new Error(`SUPABASE_BILLING_UPDATE_FAILED:${error.message}`);
  }
};

const handleCheckoutCompleted = async (session: Stripe.Checkout.Session) => {
  const userId =
    typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : typeof session.metadata?.userId === "string"
      ? session.metadata.userId
      : null;
  const targetPlan = normalizePlan(session.metadata?.targetPlan);
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  await updateProfileBilling({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan: targetPlan,
    subscriptionStatus: "active",
  });
};

const handleSubscriptionUpdated = async (subscription: Stripe.Subscription) => {
  const userId = getUserIdFromSubscription(subscription);
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : null;
  const stripeSubscriptionId = subscription.id;
  const targetPlan = normalizePlan(subscription.metadata.targetPlan);
  const subscriptionStatus = normalizeSubscriptionStatus(subscription.status);

  await updateProfileBilling({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan: targetPlan,
    subscriptionStatus,
  });
};

const handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
  const userId = getUserIdFromSubscription(subscription);
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : null;

  await updateProfileBilling({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan: "basic",
    subscriptionStatus: "canceled",
  });
};

const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  const stripe = getStripeClient();
  const stripeCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : null;
  const stripeSubscriptionDetails = invoice.parent?.subscription_details;
  const stripeSubscriptionId =
    typeof stripeSubscriptionDetails?.subscription === "string"
      ? stripeSubscriptionDetails.subscription
      : stripeSubscriptionDetails?.subscription?.id ?? null;

  let plan: AppProfilePlan = "basic";
  let userId: string | null = null;

  if (stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(
      stripeSubscriptionId
    );
    plan = normalizePlan(subscription.metadata.targetPlan);
    userId = getUserIdFromSubscription(subscription);
  }

  await updateProfileBilling({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan,
    subscriptionStatus: "past_due",
  });
};

export async function POST(request: NextRequest) {
  if (!stripeSecretKey || !stripeWebhookSecret) {
    return NextResponse.json(
      {
        error:
          "Stripe webhook is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
      },
      { status: 501 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature header." },
      { status: 400 }
    );
  }

  const payload = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      stripeWebhookSecret
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not verify the Stripe webhook signature.",
      },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process the Stripe webhook event.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
