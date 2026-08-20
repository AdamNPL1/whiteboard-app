"use client";

import { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";

import {
  REALTIME_DIAGNOSTICS_EVENT,
  type RealtimeDiagnosticsUpdate,
} from "@/lib/realtime-diagnostics";

const initialState: RealtimeDiagnosticsUpdate = {
  boardStatus: "idle",
  boardLastEvent: "none",
  boardLatencyMs: null,
  incomingCallStatus: "idle",
  callStage: "idle",
  signalingState: "none",
  iceState: "none",
  connectionState: "none",
  route: "unknown",
  audioPacketsSent: 0,
  audioPacketsReceived: 0,
  reconnectAttempts: 0,
  error: "",
};

export default function RealtimeDiagnostics() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(true);
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const queryValue = query.get("debugRealtime");
    if (queryValue === "1") window.localStorage.setItem("scriboo-realtime-debug", "true");
    if (queryValue === "0") window.localStorage.removeItem("scriboo-realtime-debug");
    const enableTimer = window.setTimeout(() => {
      setEnabled(
        process.env.NODE_ENV === "development" ||
          window.localStorage.getItem("scriboo-realtime-debug") === "true"
      );
    }, 0);

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeDiagnosticsUpdate>).detail;
      if (detail) setState((previous) => ({ ...previous, ...detail }));
    };
    window.addEventListener(REALTIME_DIAGNOSTICS_EVENT, handleUpdate);
    return () => {
      window.clearTimeout(enableTimer);
      window.removeEventListener(REALTIME_DIAGNOSTICS_EVENT, handleUpdate);
    };
  }, []);

  if (!enabled) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Open realtime diagnostics" style={{ position: "fixed", right: 14, bottom: 14, zIndex: 500, width: 38, height: 38, border: 0, borderRadius: 12, background: "#111827", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 8px 24px rgba(15,23,42,.28)" }}>
        <Activity size={18} />
      </button>
    );
  }

  const rows: Array<[string, string | number]> = [
    ["Board", state.boardStatus ?? "unknown"],
    ["Last board event", state.boardLastEvent ?? "none"],
    ["Board latency", state.boardLatencyMs == null ? "unknown" : `${state.boardLatencyMs} ms`],
    ["Incoming calls", state.incomingCallStatus ?? "unknown"],
    ["Call stage", state.callStage ?? "idle"],
    ["Signaling", state.signalingState ?? "none"],
    ["ICE", state.iceState ?? "none"],
    ["Connection", state.connectionState ?? "none"],
    ["Route", state.route ?? "unknown"],
    ["Audio packets sent", state.audioPacketsSent ?? 0],
    ["Audio packets received", state.audioPacketsReceived ?? 0],
    ["Reconnects", state.reconnectAttempts ?? 0],
  ];

  return (
    <aside style={{ position: "fixed", right: 14, bottom: 14, zIndex: 500, width: "min(330px, calc(100vw - 28px))", padding: 14, borderRadius: 14, background: "rgba(15,23,42,.96)", color: "#e2e8f0", boxShadow: "0 18px 50px rgba(15,23,42,.36)", font: "12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <strong style={{ color: "#fff", fontSize: 13 }}>Realtime diagnostics</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close realtime diagnostics" style={{ border: 0, background: "transparent", color: "#94a3b8", cursor: "pointer", padding: 2 }}><X size={16} /></button>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px" }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}><span style={{ color: "#94a3b8" }}>{label}</span><strong style={{ color: "#f8fafc", textAlign: "right", overflowWrap: "anywhere" }}>{value}</strong></div>
        ))}
      </div>
      {state.error && <div role="alert" style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "rgba(239,68,68,.16)", color: "#fecaca", overflowWrap: "anywhere" }}>{state.error}</div>}
      <div style={{ marginTop: 10, color: "#64748b" }}>Disable: add ?debugRealtime=0 and reload</div>
    </aside>
  );
}
