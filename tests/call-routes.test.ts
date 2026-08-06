import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getActiveCalls: vi.fn(),
  getCall: vi.fn(),
  startCall: vi.fn(),
  transitionCall: vi.fn(),
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
}));
vi.mock("@/lib/cloudflare-turn", () => ({
  generateCloudflareTurnCredentials: mocks.generateTurn,
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

const caller = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "caller@example.com",
};
const recipientId = "22222222-2222-4222-8222-222222222222";
const callId = "33333333-3333-4333-8333-333333333333";
const call = {
  id: callId,
  boardId: "board-1",
  callerUserId: caller.id,
  recipientUserId: recipientId,
  status: "ringing",
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
  });

  it("requires authentication before starting a call", async () => {
    mocks.getUser.mockResolvedValue(null);
    const response = await startCall(
      request("/api/calls", "POST", {
        boardId: "board-1",
        recipientUserId: recipientId,
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
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.startCall).toHaveBeenCalledWith("board-1", caller.id, recipientId);
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
    expect(mocks.transitionCall).toHaveBeenCalledWith(callId, caller.id, "accept");
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
