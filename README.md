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
```

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
