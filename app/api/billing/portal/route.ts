import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { ensureProfileForSupabaseUser } from "@/lib/profile-store";
import {
  createSupabaseServerAuthClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

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

  if (
    profile.subscriptionStatus !== "trialing" &&
    profile.subscriptionStatus !== "active" &&
    profile.subscriptionStatus !== "past_due"
  ) {
    return NextResponse.json(
      { error: "The billing portal is available after a paid plan is active." },
      { status: 400 }
    );
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!stripeSecretKey || !appUrl) {
    return NextResponse.json(
      {
        error:
          "Billing portal is not configured yet. Add STRIPE_SECRET_KEY and NEXT_PUBLIC_APP_URL.",
      },
      { status: 501 }
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  let stripeCustomerId = profile.stripeCustomerId;

  try {
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.name,
        metadata: {
          userId: profile.id,
        },
      });
      stripeCustomerId = customer.id;

      const supabaseServiceRole = getSupabaseServiceRoleClient();
      const { error } = await supabaseServiceRole
        .from("profiles")
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (error) {
        throw new Error(`SUPABASE_BILLING_UPDATE_FAILED:${error.message}`);
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${getAppOrigin(appUrl)}/custom`,
    });

    const response = NextResponse.json(
      {
        ok: true,
        portalUrl: portalSession.url,
      },
      { status: 200 }
    );

    responseCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create the billing portal session.",
      },
      { status: 500 }
    );
  }
}
