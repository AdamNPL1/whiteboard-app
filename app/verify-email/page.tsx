"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const verifyEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setMessage(data.error ?? "Could not verify your email.");
        return;
      }

      setIsVerified(true);
      setMessage("Email verified. You can now use your account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (isSubmitting || resendCooldown > 0) return;

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        retryAfter?: number;
      };

      if (!response.ok) {
        setMessage(data.error ?? "Could not resend the code.");
        setResendCooldown(data.retryAfter ?? 60);
        return;
      }

      setMessage(data.message ?? "A new code was sent.");
      setResendCooldown(60);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    setEmail(new URLSearchParams(window.location.search).get("email") ?? "");
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setTimeout(
      () => setResendCooldown((current) => Math.max(0, current - 1)),
      1000
    );

    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  return (
    <main style={pageStyle}>
      <form onSubmit={verifyEmail} style={cardStyle}>
        <div>
          <h1 style={titleStyle}>Verify email</h1>
          <p style={subtitleStyle}>Enter the 6-digit code we sent to your email.</p>
        </div>

        <label style={labelStyle}>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Verification code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))
            }
            style={{ ...inputStyle, textAlign: "center", letterSpacing: "0.18em" }}
          />
        </label>

        {message && (
          <div style={isVerified ? successStyle : errorStyle}>{message}</div>
        )}

        <button disabled={isSubmitting || isVerified} type="submit" style={buttonStyle}>
          {isSubmitting ? "Checking..." : "Verify email"}
        </button>

        <button
          disabled={isSubmitting || resendCooldown > 0 || isVerified}
          type="button"
          onClick={resendCode}
          style={secondaryButtonStyle}
        >
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : "Send a new code"}
        </button>

        <p style={footerStyle}>
          Done verifying? <Link href="/custom">Open board</Link>
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

const secondaryButtonStyle: CSSProperties = {
  height: "42px",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  background: "#ffffff",
  color: "#4f46e5",
  fontSize: "14px",
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
