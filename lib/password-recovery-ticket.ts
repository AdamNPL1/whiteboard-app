import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getSupabaseServiceRoleKey } from "@/lib/supabase-service-role-env";

export const PASSWORD_RECOVERY_COOKIE = "scriboo-password-recovery";
export const PASSWORD_RECOVERY_TTL_SECONDS = 10 * 60;

const sign = (payload: string) =>
  createHmac("sha256", getSupabaseServiceRoleKey())
    .update(payload)
    .digest("base64url");

export const createPasswordRecoveryTicket = (userId: string, now = Date.now()) => {
  const expiresAt = Math.floor(now / 1000) + PASSWORD_RECOVERY_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
};

export const verifyPasswordRecoveryTicket = (
  ticket: string | null | undefined,
  userId: string,
  now = Date.now()
) => {
  if (!ticket || !userId) return false;
  const parts = ticket.split(".");
  if (parts.length !== 3) return false;

  const [ticketUserId, expiresAtText, signature] = parts;
  const expiresAt = Number(expiresAtText);
  if (
    ticketUserId !== userId ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000)
  ) {
    return false;
  }

  const expected = Buffer.from(sign(`${ticketUserId}.${expiresAtText}`));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
};
