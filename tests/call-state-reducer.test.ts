import { describe, expect, it } from "vitest";

import { browserCallReducer } from "@/lib/browser-call-state";
import type { CallRecord } from "@/lib/call-types";

const record = (id: string, version: number, status: CallRecord["status"] = "ringing"): CallRecord => ({
  id,
  boardId: "board-1",
  callerUserId: "caller",
  recipientUserId: "recipient",
  status,
  outcome: null,
  version,
  stateChangedAt: new Date().toISOString(),
  stateReason: "test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ringExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
});

describe("browser call reducer", () => {
  it("ignores an older response for the active call", () => {
    const selected = browserCallReducer(
      { call: null, connectionState: "", displayedCallId: null, lastServerVersion: 0 },
      { type: "select", call: record("call-a", 4, "accepted") }
    );
    const result = browserCallReducer(selected, {
      type: "server-record",
      call: record("call-a", 3, "ringing"),
    });
    expect(result).toBe(selected);
  });

  it("ignores a late response from an old call", () => {
    const selected = browserCallReducer(
      { call: null, connectionState: "", displayedCallId: null, lastServerVersion: 0 },
      { type: "select", call: record("new-call", 1) }
    );
    const result = browserCallReducer(selected, {
      type: "server-record",
      call: record("old-call", 99, "ended"),
    });
    expect(result).toBe(selected);
  });

  it("tracks reconnection separately from the shared call lifecycle", () => {
    const selected = browserCallReducer(
      { call: null, connectionState: "", displayedCallId: null, lastServerVersion: 0 },
      { type: "select", call: record("call-a", 2, "accepted") }
    );
    const result = browserCallReducer(selected, {
      type: "connection",
      state: "reconnecting",
    });
    expect(result.call?.status).toBe("accepted");
    expect(result.connectionState).toBe("reconnecting");
  });
});
