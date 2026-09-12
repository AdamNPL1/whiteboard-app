export type OperationalCheck = {
  error: unknown | null;
  count?: number | null;
};

export type OperationalHealth = {
  healthy: boolean;
  components: {
    database: "ok" | "unavailable";
    emailQueue: "ok" | "degraded" | "unavailable";
    billingWebhooks: "ok" | "degraded" | "unavailable";
  };
  problems: string[];
};

export const summarizeOperationalHealth = (checks: {
  database: OperationalCheck;
  failedEmails: OperationalCheck;
  stuckEmails: OperationalCheck;
  failedWebhooks: OperationalCheck;
}): OperationalHealth => {
  const problems: string[] = [];
  const database = checks.database.error ? "unavailable" : "ok";

  let emailQueue: OperationalHealth["components"]["emailQueue"] = "ok";
  if (checks.failedEmails.error || checks.stuckEmails.error) {
    emailQueue = "unavailable";
  } else if ((checks.failedEmails.count ?? 0) > 0 || (checks.stuckEmails.count ?? 0) > 0) {
    emailQueue = "degraded";
  }

  let billingWebhooks: OperationalHealth["components"]["billingWebhooks"] = "ok";
  if (checks.failedWebhooks.error) {
    billingWebhooks = "unavailable";
  } else if ((checks.failedWebhooks.count ?? 0) > 0) {
    billingWebhooks = "degraded";
  }

  if (database !== "ok") problems.push("database");
  if (emailQueue !== "ok") problems.push("email_queue");
  if (billingWebhooks !== "ok") problems.push("billing_webhooks");

  return {
    healthy: problems.length === 0,
    components: { database, emailQueue, billingWebhooks },
    problems,
  };
};
