import type { ParticipantConnectionState } from "@/lib/call-types";

export type VisibleCallPhase =
  | "idle"
  | "choosing"
  | "precall-incoming"
  | "precall-outgoing"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "error";

export type CallStatusKind =
  | "message"
  | "incoming"
  | "precall-incoming"
  | "precall-outgoing"
  | "ringing"
  | "connecting"
  | "reconnecting"
  | "offline"
  | "restored"
  | "connected"
  | "connected-muted"
  | "failed"
  | "ending"
  | "idle";

export const resolveCallStatusKind = ({
  phase,
  connectionState,
  remoteMuted,
  restored,
  hasMessage,
  offline = false,
}: {
  phase: VisibleCallPhase;
  connectionState: ParticipantConnectionState | "";
  remoteMuted: boolean;
  restored: boolean;
  hasMessage: boolean;
  offline?: boolean;
}): CallStatusKind => {
  if ((phase === "error" || phase === "ended") && hasMessage) return "message";
  if (connectionState === "failed") return "failed";
  if (offline) return "offline";
  if (connectionState === "reconnecting") return "reconnecting";
  if (restored && connectionState === "connected") return "restored";
  if (phase === "incoming") return "incoming";
  if (phase === "precall-incoming") return "precall-incoming";
  if (phase === "precall-outgoing") return "precall-outgoing";
  if (phase === "outgoing") return "ringing";
  if (phase === "ending") return "ending";
  if (phase === "connecting" || connectionState === "connecting") return "connecting";
  if (phase === "connected" || connectionState === "connected") {
    return remoteMuted ? "connected-muted" : "connected";
  }
  return "idle";
};
