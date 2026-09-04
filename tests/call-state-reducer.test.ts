import { describe, expect, it } from "vitest";

import {
  aggregateParticipantConnectionStates,
  browserCallReducer,
} from "@/lib/browser-call-state";
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
  it("aggregates both participants into one visible connection state", () => {
    expect(aggregateParticipantConnectionStates("connected", "reconnecting")).toBe(
      "reconnecting"
    );
    expect(aggregateParticipantConnectionStates("reconnecting", "connected")).toBe(
      "reconnecting"
    );
    expect(aggregateParticipantConnectionStates("connected", "connected")).toBe("connected");
    expect(aggregateParticipantConnectionStates("connected", "failed")).toBe("failed");
  });
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

  it("ignores a stale connected event after local connection failure", () => {
    const failed = {
      call: record("call-a", 2, "accepted"),
      connectionState: "failed" as const,
      displayedCallId: "call-a",
      lastServerVersion: 2,
    };
    const result = browserCallReducer(failed, {
      type: "connection",
      state: "connected",
    });
    expect(result).toBe(failed);
  });

  it("allows only the legal connected to reconnecting to connected path", () => {
    const connected = {
      call: record("call-a", 2, "accepted"),
      connectionState: "connected" as const,
      displayedCallId: "call-a",
      lastServerVersion: 2,
    };
    const reconnecting = browserCallReducer(connected, {
      type: "connection",
      state: "reconnecting",
    });
    const restored = browserCallReducer(reconnecting, {
      type: "connection",
      state: "connected",
    });
    expect(restored.connectionState).toBe("connected");
  });
});
