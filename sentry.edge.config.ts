import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0.05,
  beforeSend(event) {
    event.user = undefined;
    if (event.request) {
      event.request.data = undefined;
      event.request.cookies = undefined;
      event.request.query_string = undefined;
      event.request.headers = undefined;
    }
    return event;
  },
});
