import { NextRequest, NextResponse } from "next/server";

import {
  createSupabaseServerAuthClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileExportRow = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
  plan: string | null;
  subscription_status: string | null;
  subscription_cancel_at_period_end: boolean | null;
  subscription_current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  onboarding_status: string | null;
};

type BoardExportRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  starred: boolean | null;
  document: unknown;
};

type BoardShareExportRow = {
  id: string;
  board_id: string;
  owner_user_id: string;
  shared_with_email: string;
  recipient_user_id: string | null;
  permission: "viewer" | "editor";
  status: "pending" | "accepted";
  invite_expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserBoardStateExportRow = {
  user_id: string;
  active_board_id: string | null;
  updated_at: string;
};

const sanitizeEmailForFileName = (email: string) =>
  email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
  "user";

const normalizeCalendarEntries = (document: unknown, boardId: string) => {
  if (
    !document ||
    typeof document !== "object" ||
    !("calendarEntries" in document)
  ) {
    return [];
  }

  const rawEntries = (document as { calendarEntries?: unknown }).calendarEntries;

  if (!Array.isArray(rawEntries)) {
    return [];
  }

  return rawEntries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const candidate = entry as Record<string, unknown>;

      return {
        boardId,
        id: typeof candidate.id === "string" ? candidate.id : "",
        date: typeof candidate.date === "string" ? candidate.date : "",
        startHour:
          typeof candidate.startHour === "string"
            ? candidate.startHour
            : typeof candidate.hour === "string"
              ? candidate.hour
              : null,
        endHour:
          typeof candidate.endHour === "string" ? candidate.endHour : null,
        title: typeof candidate.title === "string" ? candidate.title : "",
        color: typeof candidate.color === "string" ? candidate.color : null,
      };
    });
};

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerAuthClient({
    getAll: () => request.cookies.getAll(),
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const serviceRole = getSupabaseServiceRoleClient();

  const [
    profileResult,
    boardsResult,
    ownedSharesResult,
    receivedSharesResult,
    boardStateResult,
  ] = await Promise.all([
    serviceRole
      .from("profiles")
      .select(
        "id,email,name,created_at,updated_at,plan,subscription_status,subscription_cancel_at_period_end,subscription_current_period_end,stripe_customer_id,stripe_subscription_id,onboarding_status"
      )
      .eq("id", user.id)
      .maybeSingle(),
    serviceRole
      .from("boards")
      .select("id,user_id,name,created_at,updated_at,deleted_at,starred,document")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    serviceRole
      .from("board_shares")
      .select("id,board_id,owner_user_id,shared_with_email,recipient_user_id,permission,status,invite_expires_at,accepted_at,created_at,updated_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true }),
    serviceRole
      .from("board_shares")
      .select("id,board_id,owner_user_id,shared_with_email,recipient_user_id,permission,status,invite_expires_at,accepted_at,created_at,updated_at")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: true }),
    serviceRole
      .from("user_board_state")
      .select("user_id,active_board_id,updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (
    profileResult.error ||
    boardsResult.error ||
    ownedSharesResult.error ||
    receivedSharesResult.error ||
    boardStateResult.error
  ) {
    console.error("Account export failed", {
      userId: user.id,
      profileError: profileResult.error?.message,
      boardsError: boardsResult.error?.message,
      ownedSharesError: ownedSharesResult.error?.message,
      receivedSharesError: receivedSharesResult.error?.message,
      boardStateError: boardStateResult.error?.message,
    });

    return NextResponse.json(
      { error: "Could not prepare your data export right now." },
      { status: 500 }
    );
  }

  const profile = profileResult.data as ProfileExportRow | null;
  const boards = (boardsResult.data ?? []) as BoardExportRow[];
  const ownedShares = (ownedSharesResult.data ?? []) as BoardShareExportRow[];
  const receivedShares = (receivedSharesResult.data ?? []) as BoardShareExportRow[];
  const boardState = boardStateResult.data as UserBoardStateExportRow | null;

  const referencedSharedBoardIds = Array.from(
    new Set(receivedShares.map((share) => share.board_id).filter(Boolean))
  );

  const receivedBoardMetadataResult =
    referencedSharedBoardIds.length > 0
      ? await serviceRole
          .from("boards")
          .select("id,name,user_id,created_at,updated_at,deleted_at,starred")
          .in("id", referencedSharedBoardIds)
      : { data: [], error: null };

  if (receivedBoardMetadataResult.error) {
    console.error("Account export shared board metadata lookup failed", {
      userId: user.id,
      sharedBoardMetadataError: receivedBoardMetadataResult.error.message,
    });

    return NextResponse.json(
      { error: "Could not prepare your data export right now." },
      { status: 500 }
    );
  }

  const exportPayload = {
    exportMeta: {
      generatedAt: new Date().toISOString(),
      format: "json",
      version: 1,
      requestedByUserId: user.id,
    },
    account: {
      auth: {
        id: user.id,
        email: normalizedEmail,
        emailVerifiedAt: user.email_confirmed_at ?? null,
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        providers: Array.isArray(user.app_metadata?.providers)
          ? user.app_metadata.providers
          : typeof user.app_metadata?.provider === "string"
            ? [user.app_metadata.provider]
            : [],
      },
      profile: profile
        ? {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
            onboardingStatus: profile.onboarding_status ?? "new",
          }
        : null,
    },
    subscription: profile
      ? {
          plan: profile.plan ?? "basic",
          status: profile.subscription_status ?? "inactive",
          cancelAtPeriodEnd: Boolean(profile.subscription_cancel_at_period_end),
          currentPeriodEnd: profile.subscription_current_period_end,
          stripeCustomerId: profile.stripe_customer_id,
          stripeSubscriptionId: profile.stripe_subscription_id,
        }
      : null,
    boards: {
      activeBoardId: boardState?.active_board_id ?? null,
      owned: boards.map((board) => ({
        id: board.id,
        ownerUserId: board.user_id,
        name: board.name,
        createdAt: board.created_at,
        updatedAt: board.updated_at,
        deletedAt: board.deleted_at,
        starred: Boolean(board.starred),
        document: board.document,
      })),
    },
    calendarEntries: boards.flatMap((board) =>
      normalizeCalendarEntries(board.document, board.id)
    ),
    sharing: {
      ownedShares,
      receivedShares,
      receivedBoardMetadata: receivedBoardMetadataResult.data ?? [],
    },
  };

  const fileName = `blackboard-data-export-${sanitizeEmailForFileName(normalizedEmail)}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
