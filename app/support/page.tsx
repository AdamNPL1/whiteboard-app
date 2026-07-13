"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, Headphones, Send } from "lucide-react";

const categories = ["Billing", "Login", "Lost data", "Cancellation", "Withdrawal / refund", "Complaint", "Privacy", "Other"];

export default function SupportPage() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject, category, message, website: form.get("website") }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; ticketNumber?: string };
      if (!response.ok || !data.ticketNumber) {
        setError(data.error || "Could not send your request. Please try again.");
        return;
      }
      setTicketNumber(data.ticketNumber);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", padding: "32px 18px", background: "linear-gradient(145deg, #f8fafc 0%, #eef2ff 55%, #ecfeff 100%)", color: "#0f172a" }}>
      <div style={{ width: "min(720px, 100%)", margin: "0 auto" }}>
        <Link href="/custom" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24, color: "#475569", textDecoration: "none", fontSize: 14, fontWeight: 700 }}>
          <ArrowLeft size={17} /> Back to app
        </Link>
        <section style={{ padding: "clamp(24px, 5vw, 46px)", border: "1px solid #dbe4f0", borderRadius: 24, background: "rgba(255,255,255,0.94)", boxShadow: "0 24px 70px rgba(15,23,42,0.12)" }}>
          {ticketNumber ? (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <CheckCircle2 size={52} color="#16a34a" style={{ marginBottom: 18 }} />
              <h1 style={{ margin: "0 0 12px", fontSize: 30 }}>We received your request</h1>
              <p style={{ margin: "0 auto 22px", maxWidth: 500, color: "#64748b", lineHeight: 1.6 }}>A confirmation was sent to <strong>{email}</strong>. Keep this number so we can quickly find your request.</p>
              <div style={{ display: "inline-block", padding: "14px 20px", borderRadius: 12, background: "#f5f3ff", color: "#6d28d9", fontSize: 18, fontWeight: 800, letterSpacing: ".04em" }}>{ticketNumber}</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 8 }}>
                <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 13, background: "linear-gradient(135deg, #7c3aed, #22c1c3)", color: "white" }}><Headphones size={22} /></div>
                <h1 style={{ margin: 0, fontSize: 30 }}>Help &amp; Support</h1>
              </div>
              <p style={{ margin: "0 0 28px", color: "#64748b", lineHeight: 1.6 }}>Tell us what happened. You will receive a ticket number and an email confirming that your request arrived.</p>
              <p style={{ margin: "-14px 0 24px", color: "#64748b", lineHeight: 1.6, fontSize: 14 }}>
                Want to withdraw from a recent subscription or request a refund? Use the dedicated{" "}
                <Link href="/withdrawal" style={{ color: "#6d28d9", fontWeight: 800 }}>withdrawal and refund form</Link>.
              </p>
              <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px" }} />
                <label style={labelStyle}>Email<input required type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} /></label>
                <label style={labelStyle}>Category<select required value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}><option value="">Choose a category</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label style={labelStyle}>Subject<input required minLength={3} maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the problem" style={inputStyle} /></label>
                <label style={labelStyle}>Message<textarea required minLength={10} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explain what happened and what you expected..." rows={7} style={{ ...inputStyle, height: "auto", paddingTop: 13, resize: "vertical" }} /><span style={{ justifySelf: "end", color: "#94a3b8", fontSize: 11 }}>{message.length}/5000</span></label>
                {error && <div role="alert" style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>{error}</div>}
                <button disabled={isSending} style={{ height: 48, border: 0, borderRadius: 12, background: "linear-gradient(90deg, #7c3aed, #22aeca)", color: "white", fontWeight: 800, fontSize: 15, cursor: isSending ? "default" : "pointer", opacity: isSending ? .7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}><Send size={17} />{isSending ? "Sending..." : "Send request"}</button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

const labelStyle = { display: "grid", gap: 8, color: "#334155", fontSize: 13, fontWeight: 750 } as const;
const inputStyle = { width: "100%", height: 46, boxSizing: "border-box", padding: "0 13px", border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#0f172a", font: "inherit", outlineColor: "#7c3aed" } as const;
