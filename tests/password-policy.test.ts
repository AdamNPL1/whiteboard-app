import { describe, expect, it } from "vitest";
import { getPasswordPolicyError } from "@/lib/password-policy";

describe("password policy", () => {
  it("accepts a long mixed password", () => {
    expect(getPasswordPolicyError("Secure-board9!")).toBeNull();
  });

  it("rejects short or simple passwords", () => {
    expect(getPasswordPolicyError("password1")).toBeTruthy();
    expect(getPasswordPolicyError("longpassword1!")).toBeTruthy();
    expect(getPasswordPolicyError("LongPassword!!")).toBeTruthy();
    expect(getPasswordPolicyError("LongPassword12")).toBeTruthy();
  });
});
