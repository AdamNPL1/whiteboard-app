"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, RotateCcw, Send } from "lucide-react";

export default function WithdrawalPage() {
  const [email, setEmail] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [requestType, setRequestType] = useState("Withdrawal from subscription");
  const [reason, setReason] = useState("");
  const [cancelRenewal, setCancelRenewal] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const message = [
      `Request type: ${requestType}`,
      `Subscription/payment date: ${purchaseDate || "Not provided"}`,
      `Cancel future renewal: ${cancelRenewal ? "Yes" : "No"}`,
      `Reason or additional information: ${reason.trim() || "Not provided"}`,
    ].join("\n");

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          category: "Withdrawal / refund",
          subject: requestType,
          message,
          website: form.get("website"),
        }),
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
        <Link href="/support" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24, color: "#475569", textDecoration: "none", fontSize: 14, fontWeight: 700 }}><ArrowLeft size={17} /> Back to Help &amp; Support</Link>
        <section style={{ padding: "clamp(24px, 5vw, 46px)", border: "1px solid #dbe4f0", borderRadius: 24, background: "rgba(255,255,255,0.96)", boxShadow: "0 24px 70px rgba(15,23,42,0.12)" }}>
          {ticketNumber ? (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <CheckCircle2 size={52} color="#16a34a" style={{ marginBottom: 18 }} />
              <h1 style={{ margin: "0 0 12px", fontSize: 30 }}>Your request was received</h1>
              <p style={{ margin: "0 auto 22px", maxWidth: 520, color: "#64748b", lineHeight: 1.6 }}>We sent proof of receipt to <strong>{email}</strong>. Keep the reference number below. We will review the request and reply by email.</p>
              <div style={{ display: "inline-block", padding: "14px 20px", borderRadius: 12, background: "#f5f3ff", color: "#6d28d9", fontSize: 18, fontWeight: 800 }}>{ticketNumber}</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 8 }}><div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 13, background: "linear-gradient(135deg, #7c3aed, #22c1c3)", color: "white" }}><RotateCcw size={22} /></div><h1 style={{ margin: 0, fontSize: 30 }}>Withdrawal &amp; refund request</h1></div>
              <p style={{ margin: "0 0 10px", color: "#64748b", lineHeight: 1.6 }}>Use this form to tell Scriboo that you want to withdraw from a subscription or ask for a refund. You do not have to give a reason for a statutory withdrawal.</p>
              <p style={{ margin: "0 0 28px", color: "#64748b", lineHeight: 1.6, fontSize: 13 }}>We normally respond within 14 days where Polish consumer law requires that deadline. A refund is made to the original payment method after the request is reviewed.</p>
              <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px" }} />
                <label style={labelStyle}>Scriboo account email<input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" style={inputStyle} /></label>
                <label style={labelStyle}>What do you want?<select value={requestType} onChange={(event) => setRequestType(event.target.value)} style={inputStyle}><option>Withdrawal from subscription</option><option>Refund request</option><option>Withdrawal and refund request</option></select></label>
                <label style={labelStyle}>Subscription or payment date (if known)<input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} style={inputStyle} /></label>
                <label style={{ ...labelStyle, display: "flex", gridTemplateColumns: "none", alignItems: "flex-start", gap: 10, fontWeight: 650 }}><input type="checkbox" checked={cancelRenewal} onChange={(event) => setCancelRenewal(event.target.checked)} style={{ marginTop: 3 }} /><span>Also cancel future subscription renewal. Paid access normally remains until the end of the already-paid period unless the law or an approved refund requires otherwise.</span></label>
                <label style={labelStyle}>Reason or additional information (optional)<textarea maxLength={3000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="You may leave this blank for a withdrawal." rows={6} style={{ ...inputStyle, height: "auto", paddingTop: 13, resize: "vertical" }} /></label>
                {error && <div role="alert" style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>{error}</div>}
                <button disabled={isSending} style={{ height: 48, border: 0, borderRadius: 12, background: "linear-gradient(90deg, #7c3aed, #22aeca)", color: "white", fontWeight: 800, fontSize: 15, cursor: isSending ? "default" : "pointer", opacity: isSending ? .7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}><Send size={17} />{isSending ? "Sending..." : "Send request"}</button>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>Read the <Link href="/terms" style={{ color: "#6d28d9", fontWeight: 700 }}>Terms of Service</Link>. You may also email support@scribooapp.com directly.</p>
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
