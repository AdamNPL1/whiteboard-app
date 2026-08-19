export type RealtimeDiagnosticsUpdate = {
  boardStatus?: string;
  boardLastEvent?: string;
  boardLatencyMs?: number | null;
  callStage?: string;
  signalingState?: string;
  iceState?: string;
  connectionState?: string;
  route?: string;
  audioPacketsSent?: number;
  audioPacketsReceived?: number;
  reconnectAttempts?: number;
  error?: string;
};

export const REALTIME_DIAGNOSTICS_EVENT = "scriboo-realtime-diagnostics";

export const reportRealtimeDiagnostics = (update: RealtimeDiagnosticsUpdate) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<RealtimeDiagnosticsUpdate>(REALTIME_DIAGNOSTICS_EVENT, {
      detail: update,
    })
  );
};

