import { describe, expect, it } from "vitest";

import { summarizeOperationalHealth } from "@/lib/health-status";

const ok = { error: null, count: 0 };

describe("operational health", () => {
  it("is healthy when storage and queues are available and clear", () => {
    expect(summarizeOperationalHealth({ database: ok, failedEmails: ok, stuckEmails: ok, failedWebhooks: ok })).toEqual({
      healthy: true,
      components: { database: "ok", emailQueue: "ok", billingWebhooks: "ok" },
      problems: [],
    });
  });

  it("reports durable delivery failures without exposing their contents", () => {
    const health = summarizeOperationalHealth({
      database: ok,
      failedEmails: { error: null, count: 1 },
      stuckEmails: ok,
      failedWebhooks: { error: null, count: 2 },
    });
    expect(health.healthy).toBe(false);
    expect(health.problems).toEqual(["email_queue", "billing_webhooks"]);
    expect(health.components).toEqual({ database: "ok", emailQueue: "degraded", billingWebhooks: "degraded" });
  });

  it("distinguishes an unavailable monitor query from an empty queue", () => {
    const health = summarizeOperationalHealth({
      database: { error: new Error("offline") },
      failedEmails: { error: new Error("missing table") },
      stuckEmails: ok,
      failedWebhooks: ok,
    });
    expect(health.healthy).toBe(false);
    expect(health.components.database).toBe("unavailable");
    expect(health.components.emailQueue).toBe("unavailable");
  });
});
