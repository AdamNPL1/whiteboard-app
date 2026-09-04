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

export const browserCallReducer = (
  state: BrowserCallState,
  action: BrowserCallAction
): BrowserCallState => {
  if (action.type === "clear") return initialBrowserCallState;
  if (action.type === "connection") {
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
