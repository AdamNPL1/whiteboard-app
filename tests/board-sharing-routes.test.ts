import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  getShares: vi.fn(),
  shareBoard: vi.fn(),
  removeShare: vi.fn(),
  acceptInvite: vi.fn(),
  saveBoard: vi.fn(),
  authGetUser: vi.fn(),
}));

vi.mock("@/lib/board-store", () => ({
  getBoardSharesForUser: mocks.getShares,
  shareBoardWithUserForPlan: mocks.shareBoard,
  removeBoardShareForUser: mocks.removeShare,
  acceptBoardInvitationForUser: mocks.acceptInvite,
  saveBoardForUser: mocks.saveBoard,
  renameBoardForUser: vi.fn(),
  setBoardStarredForUser: vi.fn(),
  moveBoardToTrashForUser: vi.fn(),
}));
vi.mock("@/lib/supabase-auth", () => ({
  getSupabaseUserFromRequest: mocks.getRequestUser,
}));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerAuthClient: vi.fn(() => ({
    auth: { getUser: mocks.authGetUser },
  })),
}));
vi.mock("@/lib/profile-store", () => ({
  ensureProfileForSupabaseUser: vi.fn().mockResolvedValue({
    plan: "pro",
    subscriptionStatus: "active",
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendBoardShareInviteEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/monitoring", () => ({
  reportOperationalError: vi.fn(),
  reportOperationalMessage: vi.fn(),
}));

import { PUT as saveBoard } from "@/app/api/boards/[boardId]/route";
import { POST as shareBoard } from "@/app/api/boards/[boardId]/shares/route";
import { DELETE as revokeShare } from "@/app/api/boards/[boardId]/shares/[shareId]/route";
import { POST as acceptInvitation } from "@/app/api/boards/invitations/accept/route";

const request = (path: string, method: string, body?: unknown) =>
  new NextRequest(`https://scribooapp.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const boardContext = { params: Promise.resolve({ boardId: "board-secret-id" }) };

describe("board authorization and sharing", () => {
  beforeEach(() => {
    mocks.getRequestUser.mockReset();
    mocks.getShares.mockReset();
    mocks.shareBoard.mockReset();
    mocks.removeShare.mockReset();
    mocks.acceptInvite.mockReset();
    mocks.saveBoard.mockReset();
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: "owner-1", email: "owner@example.com" } },
    });
  });

  it("does not reveal or save a board for an unauthorized request", async () => {
    mocks.getRequestUser.mockResolvedValue(null);
    const response = await saveBoard(
      request("/api/boards/guessed-id", "PUT", { elements: [] }),
      { params: Promise.resolve({ boardId: "guessed-id" }) }
    );
    expect(response.status).toBe(401);
    expect(mocks.saveBoard).not.toHaveBeenCalled();
  });

  it("returns a sharing-limit error without creating another share", async () => {
    mocks.getRequestUser.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
    });
    mocks.shareBoard.mockRejectedValue(new Error("BOARD_SHARE_LIMIT_REACHED"));
    const response = await shareBoard(
      request("/api/boards/board-secret-id/shares", "POST", {
        email: "person@example.com",
      }),
      boardContext
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "You reached the sharing limit for your current plan.",
    });
  });

  it("revokes a recipient's share through the owner-only endpoint", async () => {
    mocks.getRequestUser.mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
    });
    mocks.removeShare.mockResolvedValue({ ok: true, shareCount: 0, shareLimit: 3 });
    const response = await revokeShare(
      request("/api/boards/board-secret-id/shares/share-1", "DELETE"),
      { params: Promise.resolve({ boardId: "board-secret-id", shareId: "share-1" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.removeShare).toHaveBeenCalledWith(
      expect.anything(),
      "owner-1",
      "owner@example.com",
      "board-secret-id",
      "share-1",
      "pro",
      "active"
    );
  });

  it("rejects an invitation opened by the wrong account", async () => {
    mocks.getRequestUser.mockResolvedValue({
      id: "wrong-user",
      email: "wrong@example.com",
    });
    mocks.acceptInvite.mockRejectedValue(
      new Error("BOARD_INVITATION_EMAIL_MISMATCH")
    );
    const response = await acceptInvitation(
      request("/api/boards/invitations/accept", "POST", { token: "secret" })
    );
    expect(response.status).toBe(403);
  });
});
