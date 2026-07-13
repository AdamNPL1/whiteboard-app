import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { sendAccountDeletedEmail } from "@/lib/email";
import {
  createSupabaseServerAuthClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

const assertDeleted = (error: { message: string } | null, operation: string) => {
  if (error) {
    throw new Error(`${operation}:${error.message}`);
  }
};

const cancelCustomerSubscriptions = async (stripeCustomerId: string | null) => {
  if (!stripeCustomerId) return;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!stripeSecretKey) {
    throw new Error("Billing is not configured, so the account cannot be safely deleted yet.");
  }

  const stripe = new Stripe(stripeSecretKey);
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
  });

  for (const subscription of subscriptions.data) {
    if (
      subscription.status === "canceled" ||
      subscription.status === "incomplete_expired"
    ) {
      continue;
    }

    await stripe.subscriptions.cancel(subscription.id, {
      invoice_now: false,
      prorate: false,
    });
  }
};

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { password?: string; confirmation?: string }
    | null;
  const password = body?.password ?? "";
  const confirmation = body?.confirmation?.trim() ?? "";

  if (!password) {
    return NextResponse.json(
      { error: "Enter your password to confirm account deletion." },
      { status: 400 }
    );
  }

  if (confirmation !== "DELETE") {
    return NextResponse.json(
      { error: 'Type "DELETE" exactly to confirm permanent deletion.' },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const providers = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata.providers as string[])
    : typeof user.app_metadata?.provider === "string"
    ? [user.app_metadata.provider]
    : [];
  const hasPasswordProvider = providers.length === 0 || providers.includes("email");

  if (!hasPasswordProvider) {
    return NextResponse.json(
      {
        error:
          "This account uses Google or Apple sign-in. Use Forgot password for this email to create a password, sign in again, and then delete the account.",
      },
      { status: 400 }
    );
  }

  const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (reauthenticationError) {
    return NextResponse.json(
      { error: "The password is incorrect. Your account was not deleted." },
      { status: 401 }
    );
  }

  const serviceRole = getSupabaseServiceRoleClient();
  const { data: profile, error: profileError } = await serviceRole
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: "Could not verify the account billing state. Nothing was deleted." },
      { status: 500 }
    );
  }

  try {
    await cancelCustomerSubscriptions(profile?.stripe_customer_id ?? null);

    const { error: stateError } = await serviceRole
      .from("user_board_state")
      .delete()
      .eq("user_id", user.id);
    assertDeleted(stateError, "ACCOUNT_STATE_DELETE_FAILED");

    const { error: ownedSharesError } = await serviceRole
      .from("board_shares")
      .delete()
      .eq("owner_user_id", user.id);
    assertDeleted(ownedSharesError, "OWNED_SHARES_DELETE_FAILED");

    const { error: receivedSharesError } = await serviceRole
      .from("board_shares")
      .delete()
      .eq("recipient_user_id", user.id);
    assertDeleted(receivedSharesError, "RECEIVED_SHARES_DELETE_FAILED");

    const { error: pendingInvitesError } = await serviceRole
      .from("board_shares")
      .delete()
      .eq("status", "pending")
      .eq("shared_with_email", user.email.trim().toLowerCase());
    assertDeleted(pendingInvitesError, "PENDING_INVITES_DELETE_FAILED");

    const { error: boardsError } = await serviceRole
      .from("boards")
      .delete()
      .eq("user_id", user.id);
    assertDeleted(boardsError, "BOARDS_DELETE_FAILED");

    const { error: profileDeleteError } = await serviceRole
      .from("profiles")
      .delete()
      .eq("id", user.id);
    assertDeleted(profileDeleteError, "PROFILE_DELETE_FAILED");

    const { error: authDeleteError } = await serviceRole.auth.admin.deleteUser(
      user.id
    );
    assertDeleted(authDeleteError, "AUTH_USER_DELETE_FAILED");
  } catch (error) {
    console.error("Account deletion failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      {
        error:
          "Account deletion could not be completed safely. Please contact support before trying again.",
      },
      { status: 500 }
    );
  }

  let confirmationEmailSent = true;

  try {
    await sendAccountDeletedEmail({ recipientEmail: user.email });
  } catch (error) {
    confirmationEmailSent = false;
    console.error("Account deletion confirmation email failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : error,
    });
  }

  const response = NextResponse.json({
    ok: true,
    confirmationEmailSent,
  });

  request.cookies.getAll().forEach(({ name }) => {
    if (name.includes("auth-token")) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  });

  return response;
}
