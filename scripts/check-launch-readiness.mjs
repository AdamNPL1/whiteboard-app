const requiredVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_BASIC_MONTHLY_PLN",
  "STRIPE_PRICE_PRO_MONTHLY_PLN",
  "STRIPE_PRICE_MASTER_MONTHLY_PLN",
  "STRIPE_PRICE_BASIC_MONTHLY_EUR",
  "STRIPE_PRICE_PRO_MONTHLY_EUR",
  "STRIPE_PRICE_MASTER_MONTHLY_EUR",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM_ACCOUNTS",
  "SMTP_FROM_BILLING",
  "SMTP_FROM_SUPPORT",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
];

const errors = [];
const warnings = [];
const value = (key) => process.env[key]?.trim() ?? "";

for (const key of requiredVariables) {
  if (!value(key)) errors.push(`${key} is missing.`);
}

const appUrl = value("NEXT_PUBLIC_APP_URL");
if (appUrl) {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:") {
      errors.push("NEXT_PUBLIC_APP_URL must use HTTPS for production.");
    }
    if (parsed.hostname !== "scribooapp.com") {
      warnings.push(
        `NEXT_PUBLIC_APP_URL uses ${parsed.hostname}; expected scribooapp.com for launch.`
      );
    }
  } catch {
    errors.push("NEXT_PUBLIC_APP_URL is not a valid URL.");
  }
}

const stripeKey = value("STRIPE_SECRET_KEY");
if (stripeKey && !stripeKey.startsWith("sk_live_")) {
  errors.push("STRIPE_SECRET_KEY is not a Stripe live-mode secret key.");
}

const webhookSecret = value("STRIPE_WEBHOOK_SECRET");
if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
  errors.push("STRIPE_WEBHOOK_SECRET does not look like a webhook signing secret.");
}

const priceKeys = requiredVariables.filter((key) =>
  key.startsWith("STRIPE_PRICE_")
);
const priceValues = priceKeys.map((key) => value(key)).filter(Boolean);
for (const key of priceKeys) {
  if (value(key) && !value(key).startsWith("price_")) {
    errors.push(`${key} does not look like a Stripe Price ID.`);
  }
}
if (new Set(priceValues).size !== priceValues.length) {
  errors.push("Every Stripe plan/currency must use a distinct Price ID.");
}

if (value("SITE_CLOSED").toLowerCase() !== "false") {
  warnings.push("SITE_CLOSED is not false; customers will still see maintenance mode.");
}

if (errors.length) {
  console.error("Scriboo launch configuration is NOT ready:");
  errors.forEach((error) => console.error(`- ${error}`));
} else {
  console.log("Scriboo launch configuration contains all required billing, auth and email variables.");
}

if (warnings.length) {
  console.warn("Warnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length) process.exitCode = 1;
