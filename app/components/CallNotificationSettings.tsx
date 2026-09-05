"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

type Preferences = { enabled: boolean; ringingEnabled: boolean; dndUntil: string | null };

const decodeVapidKey = (value: string) => {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export default function CallNotificationSettings() {
  const { text: t } = useLanguage();
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({ enabled: true, ringingEnabled: true, dndUntil: null });
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    if (!available) return;
    void Promise.all([
      fetch("/api/call-notifications", { cache: "no-store" }).then((response) => response.json()),
      navigator.serviceWorker.register("/scriboo-sw.js").then((registration) => registration.pushManager.getSubscription()),
    ]).then(([settings, subscription]) => {
      setPublicKey(settings.publicKey ?? "");
      if (settings.preferences) setPreferences(settings.preferences);
      setSubscribed(Boolean(subscription));
    }).catch(() => setMessage(t("Could not load notification settings.", "Nie udało się wczytać ustawień powiadomień.")));
  }, [t]);

  const enableNotifications = async () => {
    setBusy(true); setMessage("");
    try {
      if (!publicKey) throw new Error(t("Push notifications are not configured yet.", "Powiadomienia push nie są jeszcze skonfigurowane."));
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(t("Notifications were not allowed.", "Nie zezwolono na powiadomienia."));
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
      const response = await fetch("/api/call-notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
      if (!response.ok) throw new Error(t("Could not enable notifications.", "Nie udało się włączyć powiadomień."));
      setSubscribed(true);
      setMessage(t("Background call notifications are enabled.", "Powiadomienia o połączeniach w tle są włączone."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Could not enable notifications.", "Nie udało się włączyć powiadomień."));
    } finally { setBusy(false); }
  };

  const disableNotifications = async () => {
    setBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/call-notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage(t("Background call notifications are disabled on this device.", "Powiadomienia w tle są wyłączone na tym urządzeniu."));
    } finally { setBusy(false); }
  };

  const savePreferences = async (next: Preferences) => {
    setPreferences(next);
    const response = await fetch("/api/call-notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) setMessage(t("Could not save notification preferences.", "Nie udało się zapisać ustawień powiadomień."));
  };

  if (!supported) return <p>{t("This browser does not support background call notifications.", "Ta przeglądarka nie obsługuje powiadomień o połączeniach w tle.")}</p>;
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <button type="button" disabled={busy} onClick={() => void (subscribed ? disableNotifications() : enableNotifications())} style={buttonStyle}>
        {subscribed ? <BellOff size={17}/> : <Bell size={17}/>} {subscribed ? t("Disable on this device", "Wyłącz na tym urządzeniu") : t("Enable call notifications", "Włącz powiadomienia o połączeniach")}
      </button>
      <label style={labelStyle}><input type="checkbox" checked={preferences.ringingEnabled} onChange={(event) => void savePreferences({ ...preferences, ringingEnabled: event.target.checked })}/>{t("Play notification sound", "Odtwarzaj dźwięk powiadomienia")}</label>
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 700 }}>
        {t("Do Not Disturb", "Nie przeszkadzać")}
        <select value={preferences.dndUntil ? "active" : "off"} onChange={(event) => {
          const dndUntil = event.target.value === "off" ? null : new Date(Date.now() + Number(event.target.value) * 3_600_000).toISOString();
          void savePreferences({ ...preferences, dndUntil });
        }} style={{ height: 40, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 10px", background: "white" }}>
          <option value="off">{t("Off", "Wyłączone")}</option>
          {preferences.dndUntil && <option value="active">{t("Active", "Aktywne")}</option>}
          <option value="1">{t("For 1 hour", "Przez 1 godzinę")}</option>
          <option value="8">{t("For 8 hours", "Przez 8 godzin")}</option>
          <option value="24">{t("For 24 hours", "Przez 24 godziny")}</option>
        </select>
      </label>
      {message && <span role="status" style={{ color: "#475569", fontSize: 12 }}>{message}</span>}
    </div>
  );
}

const buttonStyle = { minHeight: 44, width: "fit-content", display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", color: "#334155", fontWeight: 750, cursor: "pointer" } as const;
const labelStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 } as const;
