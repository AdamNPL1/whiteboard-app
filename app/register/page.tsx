"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setMessage(data.error ?? "Could not create your account.");
        return;
      }

      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main style={pageStyle}>
      <form onSubmit={register} style={cardStyle}>
        <div>
          <h1 style={titleStyle}>Create account</h1>
          <p style={subtitleStyle}>We will email you a 6-digit verification code.</p>
        </div>

        <label style={labelStyle}>
          Name
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            style={inputStyle}
          />
        </label>

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
          Password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            style={inputStyle}
          />
        </label>

        {message && <div style={errorStyle}>{message}</div>}

        <button disabled={isSubmitting} type="submit" style={buttonStyle}>
          {isSubmitting ? "Sending code..." : "Send verification code"}
        </button>

        <p style={footerStyle}>
          Already have a code? <Link href="/verify-email">Verify email</Link>
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
  fontWeight: 600,
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

const footerStyle: CSSProperties = {
  margin: 0,
  textAlign: "center",
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
};
