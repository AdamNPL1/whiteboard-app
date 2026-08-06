import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { verifyTurnstileToken } from "@/lib/turnstile";

const request = new NextRequest("https://scribooapp.com/api/auth/register", {
  method: "POST",
  headers: { "x-forwarded-for": "203.0.113.10" },
});

describe("Turnstile verification", () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    vi.restoreAllMocks();
  });

  it("is optional until a production secret is configured", async () => {
    await expect(verifyTurnstileToken(request, "")).resolves.toBe(true);
  });

  it("rejects a missing token when protection is enabled", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    await expect(verifyTurnstileToken(request, "")).resolves.toBe(false);
  });

  it("accepts a token only after Cloudflare verifies it", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(verifyTurnstileToken(request, "valid-token")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe("POST");
  });
});
