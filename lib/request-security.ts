import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CROSS_SITE_VALUES = new Set(["cross-site", "none"]);

// Stripe authenticates its server-to-server webhook with a signature. It does
// not carry a browser Origin header and is not vulnerable to session CSRF.
const ORIGIN_CHECK_EXEMPT_PATHS = new Set(["/api/billing/webhook"]);

export const isCrossSiteApiMutation = (request: NextRequest) => {
  if (
    !request.nextUrl.pathname.startsWith("/api/") ||
    SAFE_METHODS.has(request.method.toUpperCase()) ||
    ORIGIN_CHECK_EXEMPT_PATHS.has(request.nextUrl.pathname)
  ) {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && CROSS_SITE_VALUES.has(fetchSite)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin !== request.nextUrl.origin;
  } catch {
    return true;
  }
};
