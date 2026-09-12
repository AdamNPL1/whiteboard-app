import { expect, test } from "@playwright/test";

test.describe("public account journeys", () => {
  test("registration page exposes legal and password safeguards", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Service" }).first()).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy" }).first()).toHaveAttribute("href", "/privacy");

    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("minlength", "12");
    await expect(page.getByLabel(/I accept the/)).toHaveAttribute("required", "");
  });

  test("reset page rejects weak and mismatched passwords before an API call", async ({ page }) => {
    let resetRequests = 0;
    await page.route("**/api/auth/reset-password", async (route) => {
      resetRequests += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Password updated." }) });
    });

    await page.goto("/reset-password?ready=1");
    await expect(page.getByText("Enter your new password below.")).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill("WeakPassword1");
    await page.getByLabel("Confirm new password", { exact: true }).fill("WeakPassword1");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText(/Use at least 12 characters/)).toBeVisible();
    expect(resetRequests).toBe(0);

    await page.getByLabel("New password", { exact: true }).fill("StrongPassword1!");
    await page.getByLabel("Confirm new password", { exact: true }).fill("DifferentPassword1!");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Passwords must match.")).toBeVisible();
    expect(resetRequests).toBe(0);
  });

  test("expired reset links display a safe recovery message", async ({ page }) => {
    await page.goto("/reset-password?error=invalid_or_expired_link");
    await expect(page.getByText("This reset link is invalid or expired. Request a new one.")).toBeVisible();
  });
});

test.describe("request security", () => {
  test("private APIs reject an unauthenticated browser", async ({ request }) => {
    const response = await request.get("/api/account/export");
    expect(response.status()).toBe(401);
  });

  test("cross-site API mutations are blocked before reaching application code", async ({ request }) => {
    const response = await request.post("/api/boards", {
      headers: { Origin: "https://attacker.example" },
      data: { name: "Must not be created" },
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Cross-site request blocked." });
  });
});
