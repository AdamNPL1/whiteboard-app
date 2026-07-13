import { NextRequest, NextResponse } from "next/server";

import {
  hasValidTesterAccess,
  TESTER_ACCESS_COOKIE,
} from "@/lib/tester-access";

const isSiteClosed = () => {
  const value = process.env.SITE_CLOSED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
};

const publicPathsWhenClosed = new Set([
  "/maintenance",
  "/privacy",
  "/terms",
  "/tester-access",
  "/api/tester-access",
  "/api/health",
  // Stripe must be able to deliver signed billing events even while the
  // customer-facing site is in private maintenance/testing mode.
  "/api/billing/webhook",
  "/favicon.ico",
]);

const isPublicAsset = (pathname: string) =>
  pathname.startsWith("/_next/") ||
  pathname.startsWith("/images/") ||
  pathname.startsWith("/fonts/") ||
  pathname.endsWith(".svg") ||
  pathname.endsWith(".png") ||
  pathname.endsWith(".jpg") ||
  pathname.endsWith(".jpeg") ||
  pathname.endsWith(".webp") ||
  pathname.endsWith(".ico");

export async function proxy(request: NextRequest) {
  if (!isSiteClosed()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (publicPathsWhenClosed.has(pathname) || isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  const testerCookie = request.cookies.get(TESTER_ACCESS_COOKIE)?.value;

  if (await hasValidTesterAccess(testerCookie)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Scriboo is temporarily unavailable." },
      { status: 503 }
    );
  }

  const maintenanceUrl = request.nextUrl.clone();
  maintenanceUrl.pathname = "/maintenance";
  maintenanceUrl.search = "";
  return NextResponse.redirect(maintenanceUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
