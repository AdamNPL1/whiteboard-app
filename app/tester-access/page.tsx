"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";

export default function TesterAccessPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/tester-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Private access could not be enabled.");
        return;
      }

      window.location.assign("/");
    } catch {
      setError("Could not reach Scriboo. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at 20% 10%, rgba(124,58,237,0.24), transparent 30%), linear-gradient(135deg, #101827 0%, #172554 48%, #0f766e 100%)",
        color: "#0f172a",
      }}
    >
      <section
        style={{
          width: "min(100%, 430px)",
          padding: "34px",
          borderRadius: "24px",
          background: "rgba(255,255,255,0.97)",
          boxShadow: "0 28px 80px rgba(2,6,23,0.34)",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            display: "grid",
            placeItems: "center",
            marginBottom: "18px",
            background: "linear-gradient(135deg, #7c3aed, #22c1c3)",
            color: "white",
          }}
        >
          <LockKeyhole size={23} />
        </div>
        <h1 style={{ margin: "0 0 9px", fontSize: "28px" }}>
          Private Scriboo testing
        </h1>
        <p style={{ margin: "0 0 24px", color: "#64748b", lineHeight: 1.55 }}>
          Enter the private password supplied by the Scriboo team.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: "14px" }}>
          <label
            style={{
              display: "grid",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 750,
            }}
          >
            Access password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{
                width: "100%",
                height: "46px",
                boxSizing: "border-box",
                borderRadius: "11px",
                border: "1px solid #cbd5e1",
                padding: "0 13px",
                font: "inherit",
                outlineColor: "#7c3aed",
              }}
            />
          </label>
          {error && (
            <div
              role="alert"
              style={{
                padding: "11px 13px",
                borderRadius: "10px",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}
          <button
            disabled={isSubmitting}
            style={{
              height: "47px",
              border: 0,
              borderRadius: "11px",
              background: "linear-gradient(90deg, #7c3aed, #22aeca)",
              color: "white",
              fontSize: "14px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: isSubmitting ? "default" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            <KeyRound size={17} />
            {isSubmitting ? "Checking..." : "Enter private test"}
          </button>
        </form>
      </section>
    </main>
  );
}
