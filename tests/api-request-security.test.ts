import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { isCrossSiteApiMutation } from "@/lib/request-security";

const request = (
  path: string,
  headers: Record<string, string> = {},
  method = "POST"
) => new NextRequest(`https://scribooapp.com${path}`, { method, headers });

describe("API request origin protection", () => {
  it("allows same-origin mutations", () => {
    expect(
      isCrossSiteApiMutation(
        request("/api/boards", {
          origin: "https://scribooapp.com",
          "sec-fetch-site": "same-origin",
        })
      )
    ).toBe(false);
  });

  it("blocks foreign and opaque browser origins", () => {
    expect(
      isCrossSiteApiMutation(
        request("/api/account", { origin: "https://attacker.example" }, "DELETE")
      )
    ).toBe(true);
    expect(
      isCrossSiteApiMutation(
        request("/api/account", { origin: "null" }, "DELETE")
      )
    ).toBe(true);
  });

  it("blocks cross-site browser metadata even without an Origin header", () => {
    expect(
      isCrossSiteApiMutation(
        request("/api/account/security", { "sec-fetch-site": "cross-site" }, "PATCH")
      )
    ).toBe(true);
  });

  it("allows safe reads, non-browser clients, and signed Stripe webhooks", () => {
    expect(isCrossSiteApiMutation(request("/api/boards", {}, "GET"))).toBe(false);
    expect(isCrossSiteApiMutation(request("/api/calls"))).toBe(false);
    expect(
      isCrossSiteApiMutation(
        request("/api/billing/webhook", { origin: "https://stripe.com" })
      )
    ).toBe(false);
  });
});

const walkRoutes = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? walkRoutes(path)
      : entry.name === "route.ts"
        ? [path]
        : [];
  });

const explicitlyPublicMutations = new Set([
  "auth/forgot-password/route.ts",
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/register/route.ts",
  "auth/resend/route.ts",
  "billing/webhook/route.ts",
  "support/route.ts",
  "tester-access/route.ts",
]);

describe("API mutation authentication inventory", () => {
  it("requires identity checks unless a route is explicitly public", () => {
    const apiRoot = join(process.cwd(), "app", "api");
    const unprotected = walkRoutes(apiRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      if (!/export async function (POST|PUT|PATCH|DELETE)/.test(source)) return [];

      const route = relative(apiRoot, path).replaceAll("\\", "/");
      if (explicitlyPublicMutations.has(route)) return [];

      const verifiesUser =
        source.includes("getSupabaseUserFromRequest") ||
        source.includes(".auth.getUser(");
      return verifiesUser ? [] : [route];
    });

    expect(unprotected).toEqual([]);
  });
});
