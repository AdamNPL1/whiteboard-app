"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Factor = { id: string; friendly_name?: string; status: string };

export default function MfaSettings() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [pending, setPending] = useState<{ id: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const { data, error } = await getSupabaseBrowserClient().auth.mfa.listFactors();
    if (error) throw error;
    setFactors((data.totp ?? []).filter((factor) => factor.status === "verified"));
  }, []);

  useEffect(() => {
    let active = true;
    void getSupabaseBrowserClient().auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("Could not load two-factor authentication.");
      else setFactors((data.totp ?? []).filter((factor) => factor.status === "verified"));
    });
    return () => { active = false; };
  }, []);

  const enroll = async () => {
    setBusy(true); setMessage("");
    const { data, error } = await getSupabaseBrowserClient().auth.mfa.enroll({ factorType: "totp", friendlyName: `Scriboo ${new Date().toLocaleDateString()}` });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setPending({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async () => {
    if (!pending || !/^\d{6}$/.test(code)) { setMessage("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true); setMessage("");
    const { error } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: pending.id, code });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setPending(null); setCode(""); setMessage("Two-factor authentication is now enabled.");
    await refresh();
  };

  const remove = async (factorId: string) => {
    if (!window.confirm("Disable two-factor authentication for this authenticator?")) return;
    setBusy(true); setMessage("");
    const { error } = await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Authenticator removed."); await refresh();
  };

  const cancelEnrollment = async () => {
    if (!pending) return;
    setBusy(true);
    await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId: pending.id });
    setPending(null); setCode(""); setBusy(false);
  };

  return <div style={{ display: "grid", gap: 12 }}>
    {factors.length > 0 ? factors.map((factor) => <div key={factor.id} style={rowStyle}>
      <span><strong>Authenticator enabled</strong><br/><small>{factor.friendly_name || "Authenticator app"}</small></span>
      <button type="button" disabled={busy} onClick={() => void remove(factor.id)} style={dangerStyle}>Disable</button>
    </div>) : !pending && <button type="button" disabled={busy} onClick={() => void enroll()} style={buttonStyle}>{busy ? "Starting…" : "Set up authenticator app"}</button>}
    {pending && <div style={setupStyle}>
      <strong>Scan this QR code with your authenticator app</strong>
      <Image src={pending.qrCode} alt="Authenticator QR code" width={180} height={180} unoptimized />
      <span style={{ fontSize: 12, overflowWrap: "anywhere" }}>Manual key: <code>{pending.secret}</code></span>
      <input aria-label="Six-digit authentication code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} style={inputStyle}/>
      <div style={{ display: "flex", gap: 8 }}><button type="button" disabled={busy} onClick={() => void verify()} style={buttonStyle}>Verify and enable</button><button type="button" disabled={busy} onClick={() => void cancelEnrollment()} style={secondaryStyle}>Cancel</button></div>
    </div>}
    {message && <div role="status" style={noticeStyle}>{message}</div>}
  </div>;
}

const buttonStyle = { minHeight: 42, width: "fit-content", padding: "0 16px", border: 0, borderRadius: 10, background: "linear-gradient(90deg,#7c3aed,#22aeca)", color: "white", fontWeight: 800, cursor: "pointer" } as const;
const secondaryStyle = { ...buttonStyle, border: "1px solid #cbd5e1", background: "white", color: "#334155" } as const;
const dangerStyle = { ...secondaryStyle, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c" } as const;
const inputStyle = { width: 180, height: 44, padding: "0 12px", border: "1px solid #cbd5e1", borderRadius: 10, font: "inherit", letterSpacing: 5 } as const;
const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 14, borderRadius: 11, background: "#f0fdf4", color: "#166534" } as const;
const setupStyle = { display: "grid", gap: 12, justifyItems: "start", padding: 16, border: "1px solid #ddd6fe", borderRadius: 12, background: "#faf5ff" } as const;
const noticeStyle = { padding: "10px 12px", borderRadius: 9, background: "#f8fafc", color: "#475569", fontSize: 13 } as const;
