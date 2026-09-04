import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getActiveCalls: vi.fn(),
  getCall: vi.fn(),
  startCall: vi.fn(),
  transitionCall: vi.fn(),
  updateParticipantState: vi.fn(),
  getParticipantStates: vi.fn(),
  saveSignal: vi.fn(),
  getSignals: vi.fn(),
  generateTurn: vi.fn(),
}));

vi.mock("@/lib/supabase-auth", () => ({
  getSupabaseUserFromRequest: mocks.getUser,
}));
vi.mock("@/lib/call-store", () => ({
  getActiveCallsForUser: mocks.getActiveCalls,
  getCallSessionForUser: mocks.getCall,
  startBoardCall: mocks.startCall,
  transitionBoardCall: mocks.transitionCall,
  updateCallParticipantState: mocks.updateParticipantState,
  getCallParticipantStates: mocks.getParticipantStates,
}));
vi.mock("@/lib/cloudflare-turn", () => ({
  generateCloudflareTurnCredentials: mocks.generateTurn,
}));
vi.mock("@/lib/call-signal-store", () => ({
  saveDurableCallSignal: mocks.saveSignal,
  getRecoverableCallSignals: mocks.getSignals,
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/monitoring", () => ({
  reportOperationalError: vi.fn(),
}));

import { POST as startCall } from "@/app/api/calls/route";
import { PATCH as transitionCall } from "@/app/api/calls/[callId]/route";
import { POST as getTurnCredentials } from "@/app/api/calls/[callId]/turn-credentials/route";
import {
  GET as getParticipantStates,
  PATCH as updateParticipantState,
} from "@/app/api/calls/[callId]/participant-state/route";
import {
  GET as recoverSignals,
  POST as persistSignal,
} from "@/app/api/calls/[callId]/signals/route";

const caller = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "caller@example.com",
};
const recipientId = "22222222-2222-4222-8222-222222222222";
const callId = "33333333-3333-4333-8333-333333333333";
const clientRequestId = "44444444-4444-4444-8444-444444444444";
const call = {
  id: callId,
  boardId: "board-1",
  callerUserId: caller.id,
  recipientUserId: recipientId,
  status: "ringing",
  outcome: null,
  version: 1,
  stateChangedAt: new Date().toISOString(),
  stateReason: "caller_started",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ringExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

const request = (path: string, method: string, body?: unknown) =>
  new NextRequest(`https://scribooapp.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("call API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue(caller);
    mocks.startCall.mockResolvedValue(call);
    mocks.transitionCall.mockResolvedValue(call);
    mocks.updateParticipantState.mockResolvedValue({
      callId,
      userId: caller.id,
      connectionState: "connected",
      stateReason: "ice_connected",
      stateChangedAt: new Date().toISOString(),
      version: 2,
    });
    mocks.getParticipantStates.mockResolvedValue([]);
    mocks.saveSignal.mockResolvedValue(undefined);
    mocks.getSignals.mockResolvedValue([]);
  });

  it("requires authentication before starting a call", async () => {
    mocks.getUser.mockResolvedValue(null);
    const response = await startCall(
      request("/api/calls", "POST", {
        boardId: "board-1",
        recipientUserId: recipientId,
        clientRequestId,
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.startCall).not.toHaveBeenCalled();
  });

  it("passes the authenticated caller identity to the trusted call function", async () => {
    const response = await startCall(
      request("/api/calls", "POST", {
        boardId: "board-1",
        recipientUserId: recipientId,
        clientRequestId,
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.startCall).toHaveBeenCalledWith(
      "board-1", caller.id, recipientId, clientRequestId
    );
    expect(await response.json()).toMatchObject({
      signalingTopic: `call:${callId}`,
      recipientTopic: `user:${recipientId}:calls`,
    });
  });

  it("does not reveal whether an unauthorized board relationship exists", async () => {
    mocks.startCall.mockRejectedValue(new Error("CALL_FORBIDDEN"));
    const response = await startCall(
      request("/api/calls", "POST", {
        boardId: "board-1",
        recipientUserId: recipientId,
        clientRequestId,
      })
    );

    expect(response.status).toBe(403);
  });

  it("lets the database enforce who may accept or end a call", async () => {
    const response = await transitionCall(
      request(`/api/calls/${callId}`, "PATCH", { action: "accept" }),
      { params: Promise.resolve({ callId }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.transitionCall).toHaveBeenCalledWith(
      callId, caller.id, "accept", undefined
    );
  });

  it("returns the authoritative call with transition conflicts", async () => {
    mocks.transitionCall.mockRejectedValue(new Error("CALL_TRANSITION_CONFLICT"));
    mocks.getCall.mockResolvedValue({ ...call, status: "ended", outcome: "missed" });
    const response = await transitionCall(
      request(`/api/calls/${callId}`, "PATCH", { action: "accept" }),
      { params: Promise.resolve({ callId }) }
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CALL_TRANSITION_CONFLICT",
      call: { id: callId, status: "ended", outcome: "missed" },
    });
  });

  it("records a participant connection state through the trusted store", async () => {
    const response = await updateParticipantState(
      request(`/api/calls/${callId}/participant-state`, "PATCH", {
        connectionState: "connected",
        reason: "ice_connected",
        expectedVersion: 1,
      }),
      { params: Promise.resolve({ callId }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.updateParticipantState).toHaveBeenCalledWith(
      callId, caller.id, "connected", "ice_connected", 1
    );
  });

  it("loads participant connection states only through authenticated access", async () => {
    mocks.getParticipantStates.mockResolvedValue([
      {
        callId,
        userId: recipientId,
        connectionState: "reconnecting",
        stateReason: "ice_disconnected",
        stateChangedAt: new Date().toISOString(),
        version: 3,
      },
    ]);
    const response = await getParticipantStates(
      request(`/api/calls/${callId}/participant-state`, "GET"),
      { params: Promise.resolve({ callId }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.getParticipantStates).toHaveBeenCalledWith(callId, caller.id);
    expect(await response.json()).toMatchObject({
      participantStates: [{ connectionState: "reconnecting", version: 3 }],
    });
  });

  it("persists an authorized offer for reconnect recovery", async () => {
    const signal = {
      protocolVersion: 1,
      callId,
      senderUserId: caller.id,
      messageId: "55555555-5555-4555-8555-555555555555",
      sentAt: Date.now(),
      sequenceNumber: 1,
      signalingVersion: 2,
      generation: 1,
      data: { kind: "offer", description: { type: "offer", sdp: "v=0" } },
    };
    const response = await persistSignal(
      request(`/api/calls/${callId}/signals`, "POST", signal),
      { params: Promise.resolve({ callId }) }
    );
    expect(response.status).toBe(201);
    expect(mocks.saveSignal).toHaveBeenCalledWith(caller.id, signal);
  });

  it("rejects transient ICE candidates from durable storage", async () => {
    const response = await persistSignal(
      request(`/api/calls/${callId}/signals`, "POST", {
        protocolVersion: 1,
        callId,
        senderUserId: caller.id,
        messageId: "55555555-5555-4555-8555-555555555555",
        sentAt: Date.now(),
        sequenceNumber: 1,
        signalingVersion: 2,
        generation: 1,
        data: { kind: "ice-candidate", candidate: { candidate: "candidate" } },
      }),
      { params: Promise.resolve({ callId }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.saveSignal).not.toHaveBeenCalled();
  });

  it("loads missed durable signals for the requested version", async () => {
    const response = await recoverSignals(
      request(`/api/calls/${callId}/signals?version=2`, "GET"),
      { params: Promise.resolve({ callId }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.getSignals).toHaveBeenCalledWith(callId, caller.id, 2);
  });

  it("issues TURN credentials only for an accepted active call", async () => {
    mocks.getCall.mockResolvedValue({ ...call, status: "accepted" });
    mocks.generateTurn.mockResolvedValue({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const response = await getTurnCredentials(
      request(`/api/calls/${callId}/turn-credentials`, "POST"),
      { params: Promise.resolve({ callId }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.generateTurn).toHaveBeenCalledWith(
      expect.objectContaining({ callId, userId: caller.id })
    );
  });

  it("does not issue TURN credentials while a call is only ringing", async () => {
    mocks.getCall.mockResolvedValue(call);
    const response = await getTurnCredentials(
      request(`/api/calls/${callId}/turn-credentials`, "POST"),
      { params: Promise.resolve({ callId }) }
    );

    expect(response.status).toBe(409);
    expect(mocks.generateTurn).not.toHaveBeenCalled();
  });
});
