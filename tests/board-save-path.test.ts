import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRoleClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));

import { saveBoardForUser } from "@/lib/board-store";

const unusedRequestClient = {} as SupabaseClient;
const document = {
  elements: [{ id: "shape-1" }],
  canvasBackground: "#ffffff",
  customCanvasBackground: "#ffffff",
  gridMode: "none" as const,
  gridOpacity: 0.2,
  calendarEntries: [],
};

describe("dedicated board save path", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("saves through one board-scoped RPC and returns only save metadata", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ board_id: "board-1", updated_at: "2026-09-19T12:00:00Z" }],
      error: null,
    });

    await expect(
      saveBoardForUser(
        unusedRequestClient,
        "user-1",
        "person@example.com",
        "basic",
        "inactive",
        "board-1",
        document,
        "2026-09-19T11:59:00Z"
      )
    ).resolves.toEqual({
      ok: true,
      board: { id: "board-1", updatedAt: "2026-09-19T12:00:00Z" },
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("save_board_document", {
      p_board_id: "board-1",
      p_user_id: "user-1",
      p_document: document,
      p_expected_updated_at: "2026-09-19T11:59:00Z",
      p_can_use_calendar: false,
    });
  });

  it.each([
    "BOARD_NOT_FOUND",
    "BOARD_FORBIDDEN",
    "BOARD_SAVE_CONFLICT",
  ])("preserves the %s API error contract", async (code) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: code, details: null },
    });

    await expect(
      saveBoardForUser(
        unusedRequestClient,
        "user-1",
        "person@example.com",
        "basic",
        "inactive",
        "board-1",
        document
      )
    ).rejects.toThrow(code);
  });
});
