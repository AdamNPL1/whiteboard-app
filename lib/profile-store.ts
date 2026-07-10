import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppProfilePlan = "basic" | "pro" | "master";
export type AppProfileSubscriptionStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";
export type AppProfileOnboardingStatus =
  | "new"
  | "started"
  | "completed";

export type AppProfile = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  plan: AppProfilePlan;
  subscriptionStatus: AppProfileSubscriptionStatus;
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionCurrentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  onboardingStatus: AppProfileOnboardingStatus;
};

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
  plan: string | null;
  subscription_status: string | null;
  subscription_cancel_at_period_end: boolean | null;
  subscription_current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  onboarding_status: string | null;
};

const normalizePlan = (value: string | null | undefined): AppProfilePlan =>
  value === "pro" || value === "master" ? value : "basic";

const normalizeSubscriptionStatus = (
  value: string | null | undefined
): AppProfileSubscriptionStatus =>
  value === "trialing" ||
  value === "active" ||
  value === "past_due" ||
  value === "canceled"
    ? value
    : "inactive";

const normalizeOnboardingStatus = (
  value: string | null | undefined
): AppProfileOnboardingStatus =>
  value === "started" || value === "completed" ? value : "new";

const getUserProfileName = (user: User) => {
  const metadata = user.user_metadata;

  if (typeof metadata?.name === "string" && metadata.name.trim().length > 0) {
    return metadata.name.trim();
  }

  if (
    typeof metadata?.full_name === "string" &&
    metadata.full_name.trim().length > 0
  ) {
    return metadata.full_name.trim();
  }

  if (typeof user.email === "string" && user.email.includes("@")) {
    return user.email.split("@")[0] || "User";
  }

  return "User";
};

const mapProfileRow = (row: ProfileRow, user: User): AppProfile => ({
  id: row.id,
  email: row.email,
  name: row.name,
  emailVerified: Boolean(user.email_confirmed_at),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  plan: normalizePlan(row.plan),
  subscriptionStatus: normalizeSubscriptionStatus(row.subscription_status),
  subscriptionCancelAtPeriodEnd: Boolean(row.subscription_cancel_at_period_end),
  subscriptionCurrentPeriodEnd: row.subscription_current_period_end,
  stripeCustomerId: row.stripe_customer_id,
  stripeSubscriptionId: row.stripe_subscription_id,
  onboardingStatus: normalizeOnboardingStatus(row.onboarding_status),
});

export const ensureProfileForSupabaseUser = async (
  supabase: SupabaseClient,
  user: User
) => {
  if (!user.id || !user.email) {
    return null;
  }

  const { data: existingProfile, error: readError } = await supabase
    .from("profiles")
    .select(
      "id,email,name,created_at,updated_at,plan,subscription_status,stripe_customer_id,stripe_subscription_id,onboarding_status"
      + ",subscription_cancel_at_period_end,subscription_current_period_end"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (readError) {
    throw new Error(`SUPABASE_PROFILE_READ_FAILED:${readError.message}`);
  }

  const existingProfileRow = existingProfile as ProfileRow | null;

  const normalizedEmail = user.email.trim().toLowerCase();
  const normalizedName = getUserProfileName(user);
  const now = new Date().toISOString();

  if (!existingProfileRow) {
    const { data: createdProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: normalizedEmail,
        name: normalizedName,
        created_at: now,
        updated_at: now,
        plan: "basic",
        subscription_status: "inactive",
        subscription_cancel_at_period_end: false,
        subscription_current_period_end: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        onboarding_status: "new",
      })
      .select(
        "id,email,name,created_at,updated_at,plan,subscription_status,subscription_cancel_at_period_end,subscription_current_period_end,stripe_customer_id,stripe_subscription_id,onboarding_status"
      )
      .single();

    if (insertError) {
      throw new Error(`SUPABASE_PROFILE_CREATE_FAILED:${insertError.message}`);
    }

    return mapProfileRow(createdProfile as unknown as ProfileRow, user);
  }

  const updates: Partial<ProfileRow> = {};

  if (existingProfileRow.email !== normalizedEmail) {
    updates.email = normalizedEmail;
  }

  if (existingProfileRow.name !== normalizedName) {
    updates.name = normalizedName;
  }

  if (Object.keys(updates).length === 0) {
    return mapProfileRow(existingProfileRow, user);
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({
      ...updates,
      updated_at: now,
    })
    .eq("id", user.id)
    .select(
      "id,email,name,created_at,updated_at,plan,subscription_status,stripe_customer_id,stripe_subscription_id,onboarding_status"
      + ",subscription_cancel_at_period_end,subscription_current_period_end"
    )
    .single();

  if (updateError) {
    throw new Error(`SUPABASE_PROFILE_UPDATE_FAILED:${updateError.message}`);
  }

  return mapProfileRow(updatedProfile as unknown as ProfileRow, user);
};
