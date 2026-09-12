# Scriboo production operations

## Automatic monitoring

- `Production health` calls `https://scribooapp.com/api/health` every ten minutes. A failure covers the database, permanently failed or stuck email jobs, and failed Stripe webhook processing.
- `Daily encrypted Scriboo backup` fails if the backup cannot be created, verified, or uploaded.
- `Process Scriboo email queue` fails if the protected worker endpoint cannot be reached.
- Sentry captures uncaught browser, server, route, and operational errors when its environment variables are configured. Request bodies, cookies, query strings, headers, and user identity are removed before events are sent.

GitHub Actions sends workflow-failure notifications according to the repository owner's GitHub notification settings. Keep Actions email notifications enabled and test them after deployment.

## Required production configuration

Add these encrypted environment variables to Vercel Production and Preview:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN` (the browser DSN is designed to be public; it is not an account secret)
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN` (secret, server/build only; used to upload source maps)

Create Sentry alerts for a new error, a recurring error spike, and health-check failures. Do not enable collection of request bodies or user PII.

## Incident response

1. Confirm impact using `/api/health`, Vercel deployment logs, Supabase status/logs, GitHub Actions, Stripe events, and Sentry.
2. If users could lose work or receive incorrect billing, set `SITE_CLOSED=true` in Vercel Production and redeploy. The maintenance page appears while Stripe webhooks, health checks, backups, and queued-email processing remain reachable.
3. Do not edit customer data directly while investigating. Preserve logs and note the first observed time.
4. Roll back the Vercel deployment if a recent release caused the incident. For database damage, follow `docs/backup-recovery.md` and restore only into an empty test project first.
5. After recovery, set `SITE_CLOSED=false`, redeploy, verify `/api/health`, run the production E2E checklist, and document the cause and prevention.

## Monthly checks

- Confirm the health, email-worker, and backup workflows have recent green runs.
- Review Sentry issues and Vercel/Supabase/Stripe usage limits.
- Confirm at least one operator receives GitHub and Sentry alert emails.
- Run a maintenance-mode drill and a disposable backup restore at least quarterly.
