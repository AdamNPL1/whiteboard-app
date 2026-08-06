import type { NextRequest } from "next/server";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileVerificationResponse = {
  success?: boolean;
  [key: string]: unknown;
};

export const isTurnstileEnabled = () =>
  Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());

export const verifyTurnstileToken = async (
  request: NextRequest,
  token?: string
) => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token?.trim()) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token.trim());

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
    return result.success === true;
  } catch (error) {
    console.error("Turnstile verification failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
};
