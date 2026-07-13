import "server-only";

import * as Sentry from "@sentry/nextjs";

type MonitoringContext = {
  area: string;
  operation: string;
  level?: "error" | "warning" | "info";
  durationMs?: number;
  statusCode?: number;
};

export const reportOperationalError = (error: unknown, context: MonitoringContext) => {
  Sentry.withScope((scope) => {
    scope.setTag("scriboo.area", context.area);
    scope.setTag("scriboo.operation", context.operation);
    if (context.statusCode) scope.setTag("http.status_code", String(context.statusCode));
    if (typeof context.durationMs === "number") scope.setExtra("duration_ms", Math.round(context.durationMs));
    scope.setLevel(context.level ?? "error");
    Sentry.captureException(error instanceof Error ? error : new Error("Operational failure"));
  });
};

export const reportOperationalMessage = (message: string, context: MonitoringContext) => {
  Sentry.withScope((scope) => {
    scope.setTag("scriboo.area", context.area);
    scope.setTag("scriboo.operation", context.operation);
    if (typeof context.durationMs === "number") scope.setExtra("duration_ms", Math.round(context.durationMs));
    scope.setLevel(context.level ?? "warning");
    Sentry.captureMessage(message);
  });
};
