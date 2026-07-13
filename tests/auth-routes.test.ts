import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  client: null as unknown as { auth: Record<string, ReturnType<typeof vi.fn>> },
  ensureProfile: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerAuthClient: vi.fn(() => mocks.client),
}));
vi.mock("@/lib/profile-store", () => ({
  ensureProfileForSupabaseUser: mocks.ensureProfile,
}));
vi.mock("@/lib/supabase-auth", () => ({
  mapSupabaseUserToAppUser: vi.fn((user) => user),
}));

import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";

const request = (path: string, body: unknown) =>
  new NextRequest(`https://scribooapp.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("authentication routes", () => {
  beforeEach(() => {
    mocks.ensureProfile.mockReset();
    mocks.client = {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      },
    };
  });

  it("validates registration before creating an account", async () => {
    const response = await register(
      request("/api/auth/register", {
        name: "A",
        email: "person@example.com",
        password: "password1",
        confirmPassword: "password1",
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Enter your name." });
    expect(mocks.client.auth.signUp).not.toHaveBeenCalled();
  });

  it("creates an unconfirmed registration and asks for email confirmation", async () => {
    mocks.client.auth.signUp.mockResolvedValue({
      data: { user: { id: "user-1", email: "person@example.com" }, session: null },
      error: null,
    });
    const response = await register(
      request("/api/auth/register", {
        name: "Person",
        email: " PERSON@EXAMPLE.COM ",
        password: "password1",
        confirmPassword: "password1",
      })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.email).toBe("person@example.com");
    expect(data.user).toBeNull();
    expect(data.message).toMatch(/confirm/i);
  });

  it("blocks login until the email is confirmed", async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Email not confirmed" },
    });
    const response = await login(
      request("/api/auth/login", {
        email: "person@example.com",
        password: "password1",
      })
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ needsVerification: true });
  });

  it("logs in a confirmed user", async () => {
    const user = { id: "user-1", email: "person@example.com" };
    mocks.client.auth.signInWithPassword.mockResolvedValue({
      data: { user },
      error: null,
    });
    mocks.ensureProfile.mockResolvedValue({ id: user.id, email: user.email });
    const response = await login(
      request("/api/auth/login", {
        email: user.email,
        password: "password1",
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("can log out from every device", async () => {
    const response = await logout(
      request("/api/auth/logout", { allDevices: true })
    );
    expect(response.status).toBe(200);
    expect(mocks.client.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("sends forgotten-password requests to the reset callback", async () => {
    const response = await forgotPassword(
      request("/api/auth/forgot-password", { email: " PERSON@EXAMPLE.COM " })
    );
    expect(response.status).toBe(200);
    expect(mocks.client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "person@example.com",
      { redirectTo: "https://scribooapp.com/auth/callback?next=/reset-password" }
    );
    expect(await response.json()).toMatchObject({ ok: true });
  });
});
