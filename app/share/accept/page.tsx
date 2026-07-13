"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function InvitationContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [status, setStatus] = useState<"idle" | "loading" | "accepted">("idle");
  const [message, setMessage] = useState("");

  const acceptInvitation = async () => {
    if (!token || status === "loading") return;
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/boards/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setMessage(data?.error ?? "Could not accept this invitation.");
        setStatus("idle");
        return;
      }

      window.history.replaceState({}, "", "/share/accept");
      setStatus("accepted");
      setMessage("The board is now safely connected to your Scriboo account.");
    } catch {
      setMessage("Could not connect to Scriboo. Try again.");
      setStatus("idle");
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(135deg,#f5f3ff,#ecfeff)" }}>
      <section style={{ width: "min(520px,100%)", padding: 32, borderRadius: 24, background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 24px 70px rgba(15,23,42,.12)", fontFamily: "Arial, sans-serif" }}>
        <div style={{ color: "#7c3aed", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Secure board invitation</div>
        <h1 style={{ margin: "10px 0", color: "#0f172a", fontSize: 30 }}>A board was shared with you</h1>
        <p style={{ margin: "0 0 22px", color: "#475569", lineHeight: 1.6 }}>
          Sign in with the exact email address that received the invitation, then accept it. The link expires after seven days and works only once.
        </p>

        {!token && status !== "accepted" ? (
          <div style={{ padding: 14, borderRadius: 12, background: "#fff7ed", color: "#9a3412" }}>This invitation link is incomplete.</div>
        ) : (
          <button type="button" onClick={acceptInvitation} disabled={status !== "idle"} style={{ width: "100%", height: 48, border: 0, borderRadius: 12, color: "#fff", background: "linear-gradient(90deg,#7c3aed,#22b8cf)", fontWeight: 800, cursor: status === "idle" ? "pointer" : "default" }}>
            {status === "loading" ? "Checking invitation…" : status === "accepted" ? "Invitation accepted" : "Accept invitation"}
          </button>
        )}

        {message && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: status === "accepted" ? "#ecfdf5" : "#fef2f2", color: status === "accepted" ? "#166534" : "#991b1b", lineHeight: 1.5 }}>{message}</div>}

        <div style={{ display: "flex", gap: 16, marginTop: 22, fontSize: 14 }}>
          <Link href="/custom" style={{ color: "#6d28d9", fontWeight: 700 }}>Sign in / open Scriboo</Link>
          <Link href="/register" style={{ color: "#475569" }}>Create account</Link>
        </div>
      </section>
    </main>
  );
}

export default function AcceptBoardInvitationPage() {
  return <Suspense fallback={null}><InvitationContent /></Suspense>;
}
