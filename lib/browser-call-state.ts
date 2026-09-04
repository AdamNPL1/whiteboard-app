import type { CallRecord, ParticipantConnectionState } from "@/lib/call-types";

export type BrowserCallState = {
  call: CallRecord | null;
  connectionState: ParticipantConnectionState | "";
  displayedCallId: string | null;
  lastServerVersion: number;
};

export type BrowserCallAction =
  | { type: "select"; call: CallRecord }
  | { type: "server-record"; call: CallRecord }
  | { type: "connection"; state: ParticipantConnectionState | "" }
  | { type: "clear" };

export const initialBrowserCallState: BrowserCallState = {
  call: null,
  connectionState: "",
  displayedCallId: null,
  lastServerVersion: 0,
};

const participantStateTransitions: Record<
  ParticipantConnectionState,
  ReadonlySet<ParticipantConnectionState>
> = {
  accepting: new Set(["connecting", "failed"]),
  connecting: new Set(["connected", "reconnecting", "failed"]),
  connected: new Set(["reconnecting", "failed"]),
  reconnecting: new Set(["connected", "failed"]),
  failed: new Set(),
};

export const canTransitionParticipantConnectionState = (
  current: ParticipantConnectionState | "",
  next: ParticipantConnectionState | ""
) =>
  current === next ||
  current === "" ||
  next === "" ||
  participantStateTransitions[current].has(next);

export const aggregateParticipantConnectionStates = (
  local: ParticipantConnectionState | "",
  remote: ParticipantConnectionState | ""
): ParticipantConnectionState | "" => {
  if (!local) return remote;
  if (!remote) return local;
  if (local === "failed" || remote === "failed") return "failed";
  if (local === "reconnecting" || remote === "reconnecting") return "reconnecting";
  if (local === "connecting" || remote === "connecting") return "connecting";
  if (local === "accepting" || remote === "accepting") return "accepting";
  return "connected";
};

export const browserCallReducer = (
  state: BrowserCallState,
  action: BrowserCallAction
): BrowserCallState => {
  if (action.type === "clear") return initialBrowserCallState;
  if (action.type === "connection") {
    if (!canTransitionParticipantConnectionState(state.connectionState, action.state)) {
      return state;
    }
    return { ...state, connectionState: action.state };
  }
  if (action.type === "select") {
    return {
      ...state,
      call: action.call,
      displayedCallId: action.call.id,
      lastServerVersion: action.call.version,
    };
  }
  if (
    state.displayedCallId !== null &&
    (action.call.id !== state.displayedCallId ||
      action.call.version < state.lastServerVersion)
  ) {
    return state;
  }
  return {
    ...state,
    call: action.call,
    displayedCallId: action.call.id,
    lastServerVersion: action.call.version,
  };
};
