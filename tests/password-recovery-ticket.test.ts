import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPasswordRecoveryTicket,
  PASSWORD_RECOVERY_TTL_SECONDS,
  verifyPasswordRecoveryTicket,
} from "@/lib/password-recovery-ticket";

describe("password recovery tickets", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";
  });

  afterEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("accepts a recent ticket only for its intended user", () => {
    const now = Date.UTC(2026, 8, 10, 12);
    const ticket = createPasswordRecoveryTicket("user-1", now);

    expect(verifyPasswordRecoveryTicket(ticket, "user-1", now)).toBe(true);
    expect(verifyPasswordRecoveryTicket(ticket, "user-2", now)).toBe(false);
  });

  it("rejects expired and modified tickets", () => {
    const now = Date.UTC(2026, 8, 10, 12);
    const ticket = createPasswordRecoveryTicket("user-1", now);
    const expiredAt = now + PASSWORD_RECOVERY_TTL_SECONDS * 1000;

    expect(verifyPasswordRecoveryTicket(ticket, "user-1", expiredAt)).toBe(false);
    expect(
      verifyPasswordRecoveryTicket(`${ticket.slice(0, -1)}x`, "user-1", now)
    ).toBe(false);
  });
});
