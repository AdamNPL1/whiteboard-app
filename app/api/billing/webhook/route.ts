import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { sendSubscriptionLifecycleEmail } from "@/lib/email";
import { reportOperationalError } from "@/lib/monitoring";
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

type WebhookClaimResult = {
  claimed: boolean;
  already_completed: boolean;
};

const claimWebhookEvent = async (event: Stripe.Event) => {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .rpc("claim_stripe_webhook_event", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_stale_after_seconds: 300,
    })
    .single();

  if (error) {
    throw new Error(
      `SUPABASE_STRIPE_WEBHOOK_CLAIM_FAILED:${error.code || "unknown"}`
    );
  }

  return data as WebhookClaimResult;
};

const markWebhookEventCompleted = async (eventId: string) => {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      last_error_code: null,
    })
    .eq("event_id", eventId);

  if (error) {
    throw new Error(
      `SUPABASE_STRIPE_WEBHOOK_COMPLETE_FAILED:${error.code || "unknown"}`
    );
  }
};

const markWebhookEventFailed = async (eventId: string) => {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status: "failed",
      completed_at: null,
      last_error_code: "PROCESSING_FAILED",
    })
    .eq("event_id", eventId);

  if (error) {
    reportOperationalError(
      new Error(
        `SUPABASE_STRIPE_WEBHOOK_FAILURE_MARK_FAILED:${error.code || "unknown"}`
      ),
      { area: "stripe", operation: "webhook-mark-failed" }
    );
  }
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

const getCurrentPeriodEndIso = (subscription: Stripe.Subscription) =>
  typeof subscription.items.data[0]?.current_period_end === "number"
    ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
    : null;

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

type BillingProfileSnapshot = {
  email: string;
  plan: AppProfilePlan;
  subscription_status: AppProfileSubscriptionStatus;
  subscription_cancel_at_period_end: boolean;
};

const getBillingProfileSnapshot = async ({
  userId,
  stripeCustomerId,
  stripeSubscriptionId,
}: {
  userId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) => {
  const supabase = getSupabaseServiceRoleClient();
  let query = supabase
    .from("profiles")
    .select(
      "email,plan,subscription_status,subscription_cancel_at_period_end"
    );

  if (userId) query = query.eq("id", userId);
  else if (stripeCustomerId)
    query = query.eq("stripe_customer_id", stripeCustomerId);
  else if (stripeSubscriptionId)
    query = query.eq("stripe_subscription_id", stripeSubscriptionId);
  else return null;

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`SUPABASE_BILLING_READ_FAILED:${error.message}`);
  }

  if (!data) return null;

  return {
    email: data.email,
    plan: normalizePlan(data.plan),
    subscription_status: normalizeSubscriptionStatus(
      data.subscription_status
    ),
    subscription_cancel_at_period_end: Boolean(
      data.subscription_cancel_at_period_end
    ),
  } as BillingProfileSnapshot;
};

const sendLifecycleEmailSafely = async (
  params: Parameters<typeof sendSubscriptionLifecycleEmail>[0]
) => {
  try {
    await sendSubscriptionLifecycleEmail(params);
  } catch (error) {
    // Billing state remains authoritative even if SMTP is temporarily down.
    // Returning 2xx prevents Stripe from retrying a successfully processed
    // billing event and creating duplicate customer notifications.
    console.error("Subscription lifecycle email failed", error);
    reportOperationalError(error, { area: "email", operation: "subscription-lifecycle" });
  }
};

const updateProfileBilling = async ({
  userId,
  stripeCustomerId,
  stripeSubscriptionId,
  plan,
  subscriptionStatus,
  subscriptionCancelAtPeriodEnd,
  subscriptionCurrentPeriodEnd,
}: {
  userId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  plan: AppProfilePlan;
  subscriptionStatus: AppProfileSubscriptionStatus;
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionCurrentPeriodEnd?: string | null;
}) => {
  const supabase = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();

  let query = supabase.from("profiles").update({
    plan,
    subscription_status: subscriptionStatus,
    subscription_cancel_at_period_end: subscriptionCancelAtPeriodEnd ?? false,
    subscription_current_period_end: subscriptionCurrentPeriodEnd ?? null,
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

const handleCheckoutCompleted = async (
  session: Stripe.Checkout.Session,
  eventId: string
) => {
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
    subscriptionCancelAtPeriodEnd: false,
    subscriptionCurrentPeriodEnd: null,
  });

  const recipientEmail = session.customer_details?.email?.trim();
  if (recipientEmail) {
    await sendLifecycleEmailSafely({
      recipientEmail,
      subject: `Your Scriboo ${targetPlan} subscription has started`,
      heading: "Your subscription is active",
      message: `Welcome to Scriboo ${targetPlan}. Your paid plan is ready to use.`,
      details: [{ label: "Plan", value: targetPlan }],
      eventId,
    });
  }
};

const handleSubscriptionUpdated = async (
  subscription: Stripe.Subscription,
  previousAttributes: Partial<Stripe.Subscription> | null,
  eventId: string,
  shouldSendChangeEmails = true
) => {
  const userId = getUserIdFromSubscription(subscription);
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : null;
  const stripeSubscriptionId = subscription.id;
  const targetPlan = normalizePlan(subscription.metadata.targetPlan);
  const subscriptionStatus = normalizeSubscriptionStatus(subscription.status);
  const previousProfile = await getBillingProfileSnapshot({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
  });
  const cancellationScheduled = getCancellationScheduledFlag(subscription);
  const effectiveDate = getEffectiveSubscriptionEndIso(subscription);

  await updateProfileBilling({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan: targetPlan,
    subscriptionStatus,
    subscriptionCancelAtPeriodEnd: cancellationScheduled,
    subscriptionCurrentPeriodEnd: effectiveDate,
  });

  if (!shouldSendChangeEmails || !previousProfile?.email) return;

  const previousCancellationFlag =
    typeof previousAttributes?.cancel_at_period_end === "boolean"
      ? previousAttributes.cancel_at_period_end
      : previousProfile.subscription_cancel_at_period_end;

  if (cancellationScheduled && !previousCancellationFlag) {
    await sendLifecycleEmailSafely({
      recipientEmail: previousProfile.email,
      subject: "Your Scriboo cancellation is scheduled",
      heading: "Cancellation scheduled",
      message:
        "Your subscription will remain active until the end of your paid billing period. You will not be charged again after that date.",
      details: [
        { label: "Plan", value: targetPlan },
        ...(effectiveDate
          ? [
              {
                label: "Access ends",
                value: new Date(effectiveDate).toLocaleDateString("en-GB"),
              },
            ]
          : []),
      ],
      eventId,
    });
    return;
  }

  if (!cancellationScheduled && previousCancellationFlag) {
    await sendLifecycleEmailSafely({
      recipientEmail: previousProfile.email,
      subject: "Your Scriboo cancellation was reversed",
      heading: "Your subscription will continue",
      message:
        "The scheduled cancellation was removed. Your subscription and normal renewals will continue.",
      details: [{ label: "Plan", value: targetPlan }],
      eventId,
    });
    return;
  }

  if (previousProfile.plan !== targetPlan) {
    const direction =
      previousProfile.plan === "master" ||
      (previousProfile.plan === "pro" && targetPlan === "basic")
        ? "downgraded"
        : "upgraded";
    await sendLifecycleEmailSafely({
      recipientEmail: previousProfile.email,
      subject: `Your Scriboo plan is now ${targetPlan}`,
      heading: `Your plan was ${direction}`,
      message: `Your ${targetPlan} plan is now active.`,
      details: [
        { label: "Previous plan", value: previousProfile.plan },
        { label: "Current plan", value: targetPlan },
      ],
      eventId,
    });
    return;
  }

  const previousPriceId = previousAttributes?.items?.data[0]?.price?.id;
  const currentPriceId = subscription.items.data[0]?.price.id;
  if (
    previousPriceId &&
    currentPriceId &&
    previousPriceId !== currentPriceId
  ) {
    await sendLifecycleEmailSafely({
      recipientEmail: previousProfile.email,
      subject: "Your Scriboo subscription price changed",
      heading: "Subscription price updated",
      message:
        "The price attached to your subscription changed. Review your billing page for the amount and next renewal date.",
      details: [{ label: "Plan", value: targetPlan }],
      eventId,
    });
  }
};

const handleSubscriptionDeleted = async (
  subscription: Stripe.Subscription,
  eventId: string
) => {
  const userId = getUserIdFromSubscription(subscription);
  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : null;
  const previousProfile = await getBillingProfileSnapshot({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
  });

  await updateProfileBilling({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan: "basic",
    subscriptionStatus: "canceled",
    subscriptionCancelAtPeriodEnd: false,
    subscriptionCurrentPeriodEnd: null,
  });

  if (previousProfile?.email) {
    await sendLifecycleEmailSafely({
      recipientEmail: previousProfile.email,
      subject: "Your Scriboo subscription has ended",
      heading: "Your subscription ended",
      message:
        "Your paid Scriboo subscription has ended. Your account now uses the Free plan and its limits.",
      details: [
        { label: "Previous plan", value: previousProfile.plan },
        { label: "Current plan", value: "Free" },
      ],
      eventId,
    });
  }
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
    subscriptionCancelAtPeriodEnd: false,
    subscriptionCurrentPeriodEnd: null,
  });
};

const handleInvoicePaid = async (invoice: Stripe.Invoice, eventId: string) => {
  const stripe = getStripeClient();
  const stripeCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : null;
  const subscriptionReference = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId =
    typeof subscriptionReference === "string"
      ? subscriptionReference
      : subscriptionReference?.id ?? null;

  if (!stripeSubscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(
    stripeSubscriptionId
  );
  const userId = getUserIdFromSubscription(subscription);
  const previousProfile = await getBillingProfileSnapshot({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
  });

  if (previousProfile?.subscription_status !== "past_due") return;

  const plan = normalizePlan(subscription.metadata.targetPlan);
  await updateProfileBilling({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    plan,
    subscriptionStatus: "active",
    subscriptionCancelAtPeriodEnd: getCancellationScheduledFlag(subscription),
    subscriptionCurrentPeriodEnd: getEffectiveSubscriptionEndIso(subscription),
  });

  await sendLifecycleEmailSafely({
    recipientEmail: previousProfile.email,
    subject: "Your Scriboo payment was recovered",
    heading: "Your payment is now successful",
    message:
      "Stripe successfully collected the previously failed payment. Your subscription is active again and no further action is required.",
    details: [{ label: "Plan", value: plan }],
    eventId,
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
    const claim = await claimWebhookEvent(event);

    if (!claim.claimed) {
      return NextResponse.json({
        received: true,
        duplicate: claim.already_completed,
        processing: !claim.already_completed,
      });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          (event.data.previous_attributes as Partial<Stripe.Subscription>) ?? null,
          event.id
        );
        break;
      case "customer.subscription.created":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          null,
          event.id,
          false
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          event.id
        );
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice, event.id);
        break;
      default:
        break;
    }

    await markWebhookEventCompleted(event.id);
  } catch (error) {
    await markWebhookEventFailed(event.id);
    reportOperationalError(error, { area: "stripe", operation: `webhook-${event.type}` });
    return NextResponse.json(
      { error: "Could not process the Stripe webhook event." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
