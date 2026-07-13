"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";

type AccountUser = { email: string; name: string };

export default function AccountSettingsPage() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ user?: AccountUser | null }>;
      })
      .then(({ user: loadedUser }) => {
        if (!loadedUser) {
          window.location.assign("/custom");
          return;
        }
        setUser(loadedUser);
        setDisplayName(loadedUser.name || "");
      })
      .catch(() => setError("Could not load your account."));
  }, []);

  const patchSecurity = async (payload: Record<string, string>, operation: string) => {
    setBusy(operation); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; displayName?: string };
      if (!response.ok) throw new Error(data.error || "The account change failed.");
      setMessage(data.message || "Account updated successfully.");
      if (data.displayName) setUser((current) => current ? { ...current, name: data.displayName! } : current);
      setCurrentPassword(""); setNewPassword(""); setEmailPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The account change failed.");
    } finally { setBusy(""); }
  };

  const logout = async (allDevices: boolean) => {
    setBusy(allDevices ? "all-devices" : "logout");
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allDevices }) });
    window.location.assign("/custom");
  };

  const deleteAccount = async () => {
    if (!window.confirm("Permanently delete your account and all boards? This cannot be undone.")) return;
    setBusy("delete"); setError("");
    const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: deletePassword, confirmation }) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) { setError(data.error || "Account deletion failed."); setBusy(""); return; }
    window.location.assign("/register");
  };

  return (
    <main style={pageStyle}>
      <div style={{ width: "min(820px,100%)", margin: "0 auto" }}>
        <Link href="/custom" style={backStyle}><ArrowLeft size={17}/> Back to Scriboo</Link>
        <section style={cardStyle}>
          <div style={{ display: "flex", gap: 13, alignItems: "center" }}><div style={iconStyle}><ShieldCheck size={23}/></div><div><h1 style={{ margin: 0, fontSize: 30 }}>Account &amp; security</h1><p style={mutedStyle}>Manage your identity, password, sessions and personal data.</p></div></div>
          {user && <div style={noticeStyle}><strong>{user.name}</strong><br/>{user.email}</div>}
          {message && <div style={{ ...noticeStyle, background: "#f0fdf4", color: "#166534" }}>{message}</div>}
          {error && <div role="alert" style={{ ...noticeStyle, background: "#fef2f2", color: "#b91c1c" }}>{error}</div>}

          <SettingsSection title="Display name" description="This is the name shown inside Scriboo.">
            <form onSubmit={(event) => { event.preventDefault(); void patchSecurity({ action: "display-name", displayName }, "name"); }} style={formStyle}><input required minLength={2} maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle}/><button disabled={!!busy} style={buttonStyle}>{busy === "name" ? "Saving..." : "Save name"}</button></form>
          </SettingsSection>

          <SettingsSection title="Change password" description="Enter your current password before choosing a new one.">
            <form onSubmit={(event: FormEvent) => { event.preventDefault(); void patchSecurity({ action: "password", currentPassword, newPassword }, "password"); }} style={formStyle}><input required type="password" autoComplete="current-password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={inputStyle}/><input required minLength={8} type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle}/><button disabled={!!busy} style={buttonStyle}>{busy === "password" ? "Changing..." : "Change password"}</button></form>
          </SettingsSection>

          <SettingsSection title="Change email" description="Your email changes only after Supabase completes the required verification.">
            <form onSubmit={(event) => { event.preventDefault(); void patchSecurity({ action: "email", email: newEmail, currentPassword: emailPassword }, "email"); }} style={formStyle}><input required type="email" placeholder="New email address" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={inputStyle}/><input required type="password" autoComplete="current-password" placeholder="Current password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} style={inputStyle}/><button disabled={!!busy} style={buttonStyle}>{busy === "email" ? "Sending..." : "Send verification"}</button></form>
          </SettingsSection>

          <SettingsSection title="Sessions" description="Global sign-out revokes refresh sessions on other devices; an already-issued access token can remain valid briefly until it expires.">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button onClick={() => void logout(false)} disabled={!!busy} style={secondaryButton}><LogOut size={16}/> Sign out here</button><button onClick={() => void logout(true)} disabled={!!busy} style={secondaryButton}>Sign out from all devices</button></div>
          </SettingsSection>

          <SettingsSection title="Your data" description="Download a machine-readable JSON export of your profile, boards, calendar and sharing records.">
            <a href="/api/account/export" style={{ ...secondaryButton, textDecoration: "none" }}><Download size={16}/> Download my data</a>
          </SettingsSection>

          <SettingsSection title="Multi-factor authentication" description="MFA/2FA is planned for a later security upgrade."><span style={{ ...noticeStyle, display: "inline-block" }}>Not available yet</span></SettingsSection>

          <div style={{ ...sectionStyle, borderColor: "#fecaca" }}><h2 style={{ margin: 0, color: "#991b1b", fontSize: 20 }}>Delete account</h2><p style={mutedStyle}>Cancels active subscriptions and permanently removes your boards and access. Type DELETE and enter your password.</p><div style={formStyle}><input placeholder="Type DELETE" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} style={inputStyle}/><input type="password" autoComplete="current-password" placeholder="Current password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} style={inputStyle}/><button onClick={() => void deleteAccount()} disabled={!!busy || confirmation !== "DELETE" || !deletePassword} style={dangerButton}><Trash2 size={16}/>{busy === "delete" ? "Deleting..." : "Delete account permanently"}</button></div></div>
        </section>
      </div>
    </main>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div style={sectionStyle}><h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2><p style={mutedStyle}>{description}</p>{children}</div>; }

const pageStyle = { minHeight: "100vh", padding: "32px 18px", background: "linear-gradient(145deg,#f8fafc,#eef2ff 55%,#ecfeff)", color: "#0f172a" } as const;
const cardStyle = { padding: "clamp(24px,5vw,46px)", border: "1px solid #dbe4f0", borderRadius: 24, background: "rgba(255,255,255,.96)", boxShadow: "0 24px 70px rgba(15,23,42,.12)", display: "grid", gap: 22 } as const;
const backStyle = { display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 24, color: "#475569", textDecoration: "none", fontSize: 14, fontWeight: 700 } as const;
const iconStyle = { width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 13, background: "linear-gradient(135deg,#7c3aed,#22c1c3)", color: "white" } as const;
const sectionStyle = { display: "grid", gap: 10, padding: "20px 0", borderTop: "1px solid #e2e8f0" } as const;
const formStyle = { display: "grid", gap: 10, maxWidth: 520 } as const;
const inputStyle = { width: "100%", height: 46, boxSizing: "border-box", padding: "0 13px", border: "1px solid #cbd5e1", borderRadius: 11, background: "white", color: "#0f172a", font: "inherit" } as const;
const buttonStyle = { height: 44, padding: "0 18px", border: 0, borderRadius: 11, background: "linear-gradient(90deg,#7c3aed,#22aeca)", color: "white", fontWeight: 800, cursor: "pointer" } as const;
const secondaryButton = { minHeight: 42, width: "fit-content", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 16px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", color: "#334155", fontWeight: 750, cursor: "pointer" } as const;
const dangerButton = { ...secondaryButton, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c" } as const;
const mutedStyle = { margin: 0, color: "#64748b", lineHeight: 1.6, fontSize: 14 } as const;
const noticeStyle = { padding: "12px 14px", borderRadius: 10, background: "#f8fafc", color: "#475569", fontSize: 13, lineHeight: 1.5 } as const;
