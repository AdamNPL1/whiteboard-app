import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServiceRoleClient: vi.fn(),
}));

import { getWorkspaceAccess } from "@/lib/board-store";

describe("workspace plan limits", () => {
  it("uses free limits when a subscription is inactive", () => {
    expect(getWorkspaceAccess("master", "inactive")).toEqual({
      tier: "free",
      maxBoards: 3,
      maxShares: 3,
      canUseCalendar: false,
    });
  });

  it("enforces Basic limits", () => {
    expect(getWorkspaceAccess("basic", "active")).toMatchObject({
      tier: "basic",
      maxBoards: 5,
      maxShares: 1,
      canUseCalendar: false,
    });
  });

  it("enforces Pro sharing and calendar access", () => {
    expect(getWorkspaceAccess("pro", "active")).toMatchObject({
      tier: "pro",
      maxBoards: 15,
      maxShares: 1,
      canUseCalendar: true,
    });
  });

  it("enforces Master sharing access", () => {
    expect(getWorkspaceAccess("master", "active")).toMatchObject({
      tier: "master",
      maxShares: 10,
      canUseCalendar: true,
    });
  });
});
