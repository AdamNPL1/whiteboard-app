"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const linkStateMessage = useMemo(() => {
    const error = searchParams.get("error");

    if (error === "invalid_or_expired_link") {
      return "This reset link is invalid or expired. Request a new one.";
    }

    if (error === "missing_code") {
      return "Open this page from your password reset email.";
    }

    if (searchParams.get("ready") === "1") {
      return "Enter your new password below.";
    }

    return "";
  }, [searchParams]);

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (password.length < 8) {
      setIsSuccess(false);
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setIsSuccess(false);
      setMessage("Passwords must match.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setIsSuccess(false);
        setMessage("Could not update your password.");
        return;
      }

      setIsSuccess(true);
      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated. You can now go back to the board and log in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main style={pageStyle}>
      <form onSubmit={updatePassword} style={cardStyle}>
        <div>
          <h1 style={titleStyle}>Reset password</h1>
          <p style={subtitleStyle}>
            Use the link from your email, then choose a new password.
          </p>
        </div>

        {linkStateMessage && (
          <div style={linkStateMessage.includes("Enter") ? successStyle : errorStyle}>
            {linkStateMessage}
          </div>
        )}

        <label style={labelStyle}>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            style={inputStyle}
          />
        </label>

        {message && <div style={isSuccess ? successStyle : errorStyle}>{message}</div>}

        <button disabled={isSubmitting} type="submit" style={buttonStyle}>
          {isSubmitting ? "Updating..." : "Save new password"}
        </button>

        <p style={footerStyle}>
          Back to <Link href="/custom">the board</Link>
        </p>
      </form>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "linear-gradient(135deg, #111827, #312e81 55%, #065f46)",
};

const cardStyle: CSSProperties = {
  width: "min(420px, 100%)",
  display: "grid",
  gap: "14px",
  padding: "24px",
  borderRadius: "18px",
  background: "#ffffff",
  boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111827",
  fontSize: "28px",
  fontWeight: 800,
};

const subtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: "14px",
  fontWeight: 600,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#334155",
  fontSize: "13px",
  fontWeight: 750,
};

const inputStyle: CSSProperties = {
  height: "44px",
  padding: "0 13px",
  borderRadius: "11px",
  border: "1px solid #cbd5e1",
  color: "#111827",
  fontSize: "15px",
  fontWeight: 700,
  outlineColor: "#7c3aed",
};

const buttonStyle: CSSProperties = {
  height: "46px",
  border: "none",
  borderRadius: "12px",
  background: "linear-gradient(90deg, #7c3aed, #3b82f6)",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 800,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "10px",
  background: "#fee2e2",
  color: "#b91c1c",
  fontSize: "13px",
  fontWeight: 700,
};

const successStyle: CSSProperties = {
  ...errorStyle,
  background: "#dcfce7",
  color: "#166534",
};

const footerStyle: CSSProperties = {
  margin: 0,
  textAlign: "center",
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
};
