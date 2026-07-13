# Blackboard App

Next.js whiteboard app with:

- Supabase auth and database
- Stripe subscription billing
- plan-based board limits
- plan-based sharing limits
- calendar access for paid tiers

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Fill in `.env.local`.

Required keys:

```bash
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_FROM_ACCOUNTS=
SMTP_FROM_BILLING=
SMTP_FROM_SUPPORT=
SUPPORT_EMAIL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_PRICE_BASIC_MONTHLY_PLN=
STRIPE_PRICE_PRO_MONTHLY_PLN=
STRIPE_PRICE_MASTER_MONTHLY_PLN=
STRIPE_PRICE_BASIC_MONTHLY_EUR=
STRIPE_PRICE_PRO_MONTHLY_EUR=
STRIPE_PRICE_MASTER_MONTHLY_EUR=
SITE_CLOSED=false
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
```

## Automated tests

Run the complete safe, mocked test suite with:

```bash
npm test
```

Use `npm run test:watch` while developing. Supabase, Stripe, and email delivery
are mocked, so tests do not create real users, charge cards, delete production
data, or send real messages.

## Monitoring

Sentry monitoring is privacy-restricted: default PII is disabled and request
bodies, cookies, query strings, authorization headers, IP forwarding headers,
and user identity are removed before events are sent. Set the Sentry DSN in
Vercel to activate reporting. Source-map upload additionally uses the private
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` build variables.

The public `/api/health` endpoint verifies both the Next.js application and a
minimal Supabase query without returning database contents. Use that URL with
an external uptime monitor. A non-200 response should trigger an alert.

## Production email

The application supports separate authenticated senders for account, billing,
and support messages. `SMTP_FROM` remains a fallback while migrating providers.

For Resend SMTP use `smtp.resend.com`, port `465`, `SMTP_SECURE=true`, username
`resend`, and a Resend API key as the password. Verify `scribooapp.com` in the
provider and publish the exact SPF and DKIM records it supplies. Start DMARC in
monitoring mode and strengthen the policy only after delivery has been tested.

Supabase sends registration confirmation and password-reset messages itself.
Configure the same authenticated domain separately in **Supabase Dashboard →
Authentication → SMTP Settings**; Vercel SMTP variables do not configure
Supabase Auth emails.

## Maintenance Mode

Set `SITE_CLOSED=true` in Vercel and redeploy to show the maintenance page
instead of the app. Set `SITE_CLOSED=false` and redeploy to reopen the app.

While maintenance mode is on, `/privacy`, `/terms`, and static assets stay
public, app pages redirect to `/maintenance`, and app API routes return `503`.

For private testing while maintenance mode is enabled, set a strong
`TESTER_ACCESS_PASSWORD` environment variable and send the trusted tester to
`/tester-access`. Successful access is remembered in that browser for 14 days.

3. Run the Supabase SQL in this order:

- [supabase/profiles.sql](/abs/path/C:/Users/Adam/blackboard-app/supabase/profiles.sql:1)
- [supabase/boards.sql](/abs/path/C:/Users/Adam/blackboard-app/supabase/boards.sql:1)
- [supabase/rls-policies.sql](/abs/path/C:/Users/Adam/blackboard-app/supabase/rls-policies.sql:1)
- [supabase/board-shares.sql](/abs/path/C:/Users/Adam/blackboard-app/supabase/board-shares.sql:1)

4. Start the app:

```bash
npm run dev
```

5. Build-check before deploy:

```bash
npm run build
```

## Current Plan Rules

- `Free`: 1 board, 0 shares, no calendar
- `Basic`: 5 boards, 1 share, no calendar
- `Pro`: unlimited boards, 3 shares, calendar
- `Master`: unlimited boards, 10 shares, calendar

## What To Test Next

1. Register a user and confirm login works.
2. Create a board and refresh the page.
3. Check free/basic/pro/master board limits.
4. Check sharing limits by plan.
5. Check that calendar is blocked on free/basic and works on pro/master.
6. Test Stripe checkout success and cancel flows.
7. Test the Stripe webhook updates the stored plan.

## Important Note

The app will not sell subscriptions correctly until all six Stripe price IDs are set in `.env.local` and in production environment variables.
