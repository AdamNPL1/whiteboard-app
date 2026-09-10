import type { NextRequest } from "next/server";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileVerificationResponse = {
  success?: boolean;
  hostname?: string;
  [key: string]: unknown;
};

export const isTurnstileEnabled = () =>
  Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());

export const verifyTurnstileToken = async (
  request: NextRequest,
  token?: string
) => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  // Local development remains convenient, but a production deployment must
  // never silently disable bot protection because an environment variable was
  // forgotten or removed.
  if (!secret) return process.env.NODE_ENV !== "production";

  const normalizedToken = token?.trim() ?? "";
  if (!normalizedToken || normalizedToken.length > 2_048) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", normalizedToken);

  const forwardedFor = request.headers.get("x-forwarded-for");
  const remoteIp = forwardedFor?.split(",")[0]?.trim();
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;

    const result = (await response.json()) as TurnstileVerificationResponse;
    if (result.success !== true) return false;

    // A stolen token issued for another website must not be accepted here.
    const verifiedHostname = result.hostname?.trim().toLowerCase();
    return verifiedHostname === request.nextUrl.hostname.toLowerCase();
  } catch (error) {
    console.error("Turnstile verification failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};
