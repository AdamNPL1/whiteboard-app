import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppProfilePlan,
  AppProfileSubscriptionStatus,
} from "@/lib/profile-store";
import { normalizeEmail } from "@/lib/auth-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const trashRetentionMs = 30 * 24 * 60 * 60 * 1000;
const versionRetentionMs = 30 * 24 * 60 * 60 * 1000;
const automaticSnapshotIntervalMs = 5 * 60 * 1000;
const maximumVersionsPerBoard = 50;
const isValidCalendarEntryColor = (
  color: string | undefined
): color is string => typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);

export type GridMode = "none" | "small" | "standard" | "large";

export type BoardDocument = {
  elements: unknown[];
  canvasBackground: string;
  customCanvasBackground: string;
  gridMode: GridMode;
  gridOpacity: number;
  calendarEntries: {
    id: string;
    date: string;
    startHour: string;
    endHour: string;
    title: string;
    color: string;
  }[];
};

export type BoardShareSummary = {
  id: string;
  email: string;
  createdAt: string;
  status: "pending" | "accepted";
  permission: "viewer" | "editor";
  expiresAt?: string;
  acceptedAt?: string;
};

export type BoardVersionSummary = {
  id: string;
  boardName: string;
  reason: "automatic" | "before_restore" | "before_trash";
  sourceUpdatedAt: string;
  createdAt: string;
  elementCount: number;
  calendarEntryCount: number;
};

export type BoardSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  starred?: boolean;
  previewDocument: BoardDocument;
  ownedByUser?: boolean;
  shareCount?: number;
  sharePermission?: "viewer" | "editor";
};

export type WorkspaceAccess = {
  tier: "free" | AppProfilePlan;
  maxBoards: number;
  maxShares: number;
  canUseCalendar: boolean;
};

type StoredBoard = BoardSummary & {
  document: BoardDocument;
  ownerUserId: string;
  ownedByUser: boolean;
  shareCount: number;
  sharePermission?: "viewer" | "editor";
};

type UserBoardCollection = {
  userId: string;
  activeBoardId: string;
  boards: StoredBoard[];
};

type BoardRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  starred: boolean | null;
  document: Partial<BoardDocument> | null;
};

type UserBoardStateRow = {
  user_id: string;
  active_board_id: string | null;
};

type BoardShareRow = {
  id: string;
  board_id: string;
  owner_user_id: string;
  shared_with_email: string;
  recipient_user_id: string | null;
  permission: "viewer" | "editor";
  status: "pending" | "accepted";
  invite_token_hash: string | null;
  invite_expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

type BoardVersionRow = {
  id: string;
  board_id: string;
  owner_user_id: string;
  board_name: string;
  document: Partial<BoardDocument> | null;
  reason: "automatic" | "before_restore" | "before_trash";
  source_updated_at: string;
  created_at: string;
};

export const hasActivePaidSubscription = (
  status: AppProfileSubscriptionStatus
) =>
  status === "trialing" || status === "active" || status === "past_due";

export const getWorkspaceAccess = (
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
): WorkspaceAccess => {
  if (!hasActivePaidSubscription(subscriptionStatus)) {
    return {
      tier: "free",
      maxBoards: 1,
      maxShares: 0,
      canUseCalendar: false,
    };
  }

  if (plan === "master") {
    return {
      tier: "master",
      maxBoards: Number.POSITIVE_INFINITY,
      maxShares: 10,
      canUseCalendar: true,
    };
  }

  if (plan === "pro") {
    return {
      tier: "pro",
      maxBoards: Number.POSITIVE_INFINITY,
      maxShares: 3,
      canUseCalendar: true,
    };
  }

  return {
    tier: "basic",
    maxBoards: 5,
    maxShares: 1,
    canUseCalendar: false,
  };
};

const defaultBoardDocument = (): BoardDocument => ({
  elements: [],
  canvasBackground: "#ffffff",
  customCanvasBackground: "#131619",
  gridMode: "none",
  gridOpacity: 24,
  calendarEntries: [],
});

const createBoardName = (index: number) => `Board ${index}`;

const normalizeBoardDocument = (
  document?: Partial<BoardDocument> | null
): BoardDocument => ({
  elements: Array.isArray(document?.elements) ? document.elements : [],
  canvasBackground:
    typeof document?.canvasBackground === "string" &&
    document.canvasBackground.length > 0
      ? document.canvasBackground
      : "#ffffff",
  customCanvasBackground:
    typeof document?.customCanvasBackground === "string" &&
    document.customCanvasBackground.length > 0
      ? document.customCanvasBackground
      : "#131619",
  gridMode:
    document?.gridMode === "small" ||
    document?.gridMode === "standard" ||
    document?.gridMode === "large"
      ? document.gridMode
      : "none",
  gridOpacity: Math.max(
    0,
    Math.min(
      80,
      Number.isFinite(document?.gridOpacity) ? Number(document?.gridOpacity) : 24
    )
  ),
  calendarEntries: Array.isArray(document?.calendarEntries)
    ? document.calendarEntries
        .filter(
          (entry) =>
            Boolean(
              entry &&
                typeof entry.id === "string" &&
                typeof entry.date === "string" &&
                typeof entry.title === "string"
            )
        )
        .map((entry) => {
          const calendarEntry = entry as {
            id: string;
            date: string;
            startHour?: string;
            endHour?: string;
            hour?: string;
            title: string;
            color?: string;
          };

          return {
            id: calendarEntry.id,
            date: calendarEntry.date,
            startHour:
              typeof calendarEntry.startHour === "string"
                ? calendarEntry.startHour
                : typeof calendarEntry.hour === "string"
                  ? calendarEntry.hour
                  : "12:00",
            endHour:
              typeof calendarEntry.endHour === "string"
                ? calendarEntry.endHour
                : typeof calendarEntry.startHour === "string"
                  ? calendarEntry.startHour
                  : typeof calendarEntry.hour === "string"
                    ? calendarEntry.hour
                    : "13:00",
            title: calendarEntry.title.slice(0, 160),
            color:
              isValidCalendarEntryColor(calendarEntry.color)
                ? calendarEntry.color
                : "#7c3aed",
          };
        })
    : [],
});

const applyCalendarAccessToDocument = (
  document: BoardDocument,
  canUseCalendar: boolean
): BoardDocument =>
  canUseCalendar
    ? document
    : {
        ...document,
        calendarEntries: [],
      };

const isWithinTrashRetention = (deletedAt?: string) => {
  if (!deletedAt) return true;

  return new Date(deletedAt).getTime() + trashRetentionMs > Date.now();
};

const mapBoardRowToStoredBoard = (
  board: BoardRow,
  index: number,
  options?: {
    ownedByUser?: boolean;
    shareCount?: number;
    sharePermission?: "viewer" | "editor";
  }
): StoredBoard => {
  const document = normalizeBoardDocument(board.document);

  return {
    id: board.id,
    ownerUserId: board.user_id,
    ownedByUser: options?.ownedByUser ?? true,
    shareCount: options?.shareCount ?? 0,
    sharePermission: options?.sharePermission,
    name:
      typeof board.name === "string" && board.name.trim().length > 0
        ? board.name
        : createBoardName(index + 1),
    createdAt: board.created_at ?? new Date().toISOString(),
    updatedAt: board.updated_at ?? board.created_at ?? new Date().toISOString(),
    deletedAt: typeof board.deleted_at === "string" ? board.deleted_at : undefined,
    starred: Boolean(board.starred),
    previewDocument: document,
    document,
  };
};

const summarizeBoard = (board: StoredBoard): BoardSummary => ({
  id: board.id,
  name: board.name,
  createdAt: board.createdAt,
  updatedAt: board.updatedAt,
  deletedAt: board.deletedAt,
  starred: board.starred,
  previewDocument: board.document,
  ownedByUser: board.ownedByUser,
  shareCount: board.shareCount,
  sharePermission: board.sharePermission,
});

const sanitizeStoredBoardForAccess = (
  board: StoredBoard,
  canUseCalendar: boolean
): StoredBoard => ({
  ...board,
  previewDocument: applyCalendarAccessToDocument(
    board.previewDocument,
    canUseCalendar
  ),
  document: applyCalendarAccessToDocument(board.document, canUseCalendar),
});

const sanitizeUserBoardCollectionForAccess = (
  entry: UserBoardCollection,
  canUseCalendar: boolean
): UserBoardCollection => ({
  ...entry,
  boards: entry.boards.map((board) =>
    sanitizeStoredBoardForAccess(board, canUseCalendar)
  ),
});

const serializeUserBoards = (
  entry: UserBoardCollection,
  maxBoards: number
) => {
  const activeBoard = entry.boards.find(
    (board) => board.id === entry.activeBoardId && !board.deletedAt
  );

  return {
    boards: entry.boards.map(summarizeBoard),
    activeBoardId: activeBoard?.id ?? "",
    board: activeBoard
      ? {
          id: activeBoard.id,
          name: activeBoard.name,
          document: activeBoard.document,
          ownedByUser: activeBoard.ownedByUser,
          shareCount: activeBoard.shareCount,
          sharePermission: activeBoard.sharePermission,
        }
      : null,
    maxBoards: Number.isFinite(maxBoards) ? maxBoards : null,
  };
};

const getBoardStoreClient = (supabase?: SupabaseClient) =>
  supabase ?? getSupabaseServiceRoleClient();

const loadOwnedBoardRows = async (supabase: SupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from("boards")
    .select("id,user_id,name,created_at,updated_at,deleted_at,starred,document")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`SUPABASE_BOARDS_READ_FAILED:${error.message}`);
  }

  return (data ?? []) as BoardRow[];
};

const loadBoardShareRowsForOwner = async (
  supabase: SupabaseClient,
  userId: string
) => {
  const { data, error } = await supabase
    .from("board_shares")
    .select("id,board_id,owner_user_id,shared_with_email,recipient_user_id,permission,status,invite_token_hash,invite_expires_at,accepted_at,created_at,updated_at")
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(`SUPABASE_BOARD_SHARES_READ_FAILED:${error.message}`);
  }

  return (data ?? []) as BoardShareRow[];
};

const loadBoardShareRowsForRecipient = async (
  supabase: SupabaseClient,
  userId: string
) => {
  const { data, error } = await supabase
    .from("board_shares")
    .select("id,board_id,owner_user_id,shared_with_email,recipient_user_id,permission,status,invite_token_hash,invite_expires_at,accepted_at,created_at,updated_at")
    .eq("recipient_user_id", userId)
    .eq("status", "accepted");

  if (error) {
    throw new Error(`SUPABASE_BOARD_SHARES_READ_FAILED:${error.message}`);
  }

  return (data ?? []) as BoardShareRow[];
};

const loadBoardRowsByIds = async (
  supabase: SupabaseClient,
  boardIds: string[]
) => {
  if (boardIds.length === 0) {
    return [] as BoardRow[];
  }

  const { data, error } = await supabase
    .from("boards")
    .select("id,user_id,name,created_at,updated_at,deleted_at,starred,document")
    .in("id", boardIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`SUPABASE_BOARDS_READ_FAILED:${error.message}`);
  }

  return (data ?? []) as BoardRow[];
};

const loadUserBoardState = async (supabase: SupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from("user_board_state")
    .select("user_id,active_board_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`SUPABASE_BOARD_STATE_READ_FAILED:${error.message}`);
  }

  return (data ?? null) as UserBoardStateRow | null;
};

const persistActiveBoardId = async (
  supabase: SupabaseClient,
  userId: string,
  activeBoardId: string
) => {
  const { error } = await supabase.from("user_board_state").upsert(
    {
      user_id: userId,
      active_board_id: activeBoardId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`SUPABASE_BOARD_STATE_WRITE_FAILED:${error.message}`);
  }
};

const createBoardRecord = async (
  supabase: SupabaseClient,
  userId: string,
  index: number
) => {
  const now = new Date().toISOString();
  const document = defaultBoardDocument();
  const row = {
    id: randomBytes(16).toString("hex"),
    user_id: userId,
    name: createBoardName(index),
    created_at: now,
    updated_at: now,
    deleted_at: null,
    starred: false,
    document,
  };

  const { data, error } = await supabase
    .from("boards")
    .insert(row)
    .select("id,user_id,name,created_at,updated_at,deleted_at,starred,document")
    .single();

  if (error) {
    throw new Error(`SUPABASE_BOARD_CREATE_FAILED:${error.message}`);
  }

  return mapBoardRowToStoredBoard(data as BoardRow, Math.max(index - 1, 0));
};

const loadUserBoardCollection = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string
): Promise<UserBoardCollection> => {
  const [ownedBoardRows, boardState, ownerShareRows, recipientShareRows] =
    await Promise.all([
      loadOwnedBoardRows(supabase, userId),
      loadUserBoardState(supabase, userId),
      loadBoardShareRowsForOwner(supabase, userId),
      loadBoardShareRowsForRecipient(getSupabaseServiceRoleClient(), userId),
    ]);

  const ownerShareCountByBoardId = ownerShareRows.reduce<Record<string, number>>(
    (accumulator, share) => {
      accumulator[share.board_id] = (accumulator[share.board_id] ?? 0) + 1;
      return accumulator;
    },
    {}
  );

  const expiredBoardIds = ownedBoardRows
    .filter((board) => Boolean(board.deleted_at))
    .filter((board) => !isWithinTrashRetention(board.deleted_at ?? undefined))
    .map((board) => board.id);

  if (expiredBoardIds.length > 0) {
    const { error } = await supabase
      .from("boards")
      .delete()
      .eq("user_id", userId)
      .in("id", expiredBoardIds);

    if (error) {
      throw new Error(`SUPABASE_TRASH_PURGE_FAILED:${error.message}`);
    }
  }

  const retainedOwnedBoardRows = ownedBoardRows.filter(
    (board) => !expiredBoardIds.includes(board.id)
  );

  let boards = retainedOwnedBoardRows
    .map((board, index) =>
      mapBoardRowToStoredBoard(board, index, {
        ownedByUser: true,
        shareCount: ownerShareCountByBoardId[board.id] ?? 0,
      })
    )
    .filter((board) => isWithinTrashRetention(board.deletedAt));

  if (boards.length === 0) {
    const firstBoard = await createBoardRecord(supabase, userId, 1);
    boards = [firstBoard];
    await persistActiveBoardId(supabase, userId, firstBoard.id);
  }

  const sharedBoardIds = [...new Set(recipientShareRows.map((share) => share.board_id))];
  const sharedBoardRows = await loadBoardRowsByIds(
    getSupabaseServiceRoleClient(),
    sharedBoardIds
  );
  const recipientShareByBoardId = new Map(
    recipientShareRows.map((share) => [share.board_id, share])
  );
  const sharedBoards = sharedBoardRows
    .filter((board) => board.user_id !== userId)
    .filter((board) => !board.deleted_at)
    .map((board, index) =>
      mapBoardRowToStoredBoard(board, boards.length + index, {
        ownedByUser: false,
        shareCount: 0,
        sharePermission:
          recipientShareByBoardId.get(board.id)?.permission ?? "viewer",
      })
    );

  const mergedBoards = [...boards, ...sharedBoards];
  const availableBoards = mergedBoards.filter((board) => !board.deletedAt);
  const fallbackBoard = availableBoards[0];
  const requestedActiveBoardId = boardState?.active_board_id ?? "";
  const activeBoardId = availableBoards.some(
    (board) => board.id === requestedActiveBoardId
  )
    ? requestedActiveBoardId
    : fallbackBoard?.id ?? "";

  if (activeBoardId !== requestedActiveBoardId) {
    await persistActiveBoardId(supabase, userId, activeBoardId);
  }

  return {
    userId,
    activeBoardId,
    boards: mergedBoards,
  };
};

const getAccessibleBoardOrThrow = (
  entry: UserBoardCollection,
  boardId: string
) => {
  const board = entry.boards.find((item) => item.id === boardId && !item.deletedAt);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  return board;
};

const getOwnedBoardOrThrow = (entry: UserBoardCollection, boardId: string) => {
  const board = getAccessibleBoardOrThrow(entry, boardId);
  if (!board.ownedByUser) {
    throw new Error("BOARD_FORBIDDEN");
  }

  return board;
};

const getOwnedBoardIncludingTrashOrThrow = (
  entry: UserBoardCollection,
  boardId: string
) => {
  const board = entry.boards.find((item) => item.id === boardId);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  if (!board.ownedByUser) {
    throw new Error("BOARD_FORBIDDEN");
  }

  return board;
};

const updateBoardRow = async (
  supabase: SupabaseClient,
  boardId: string,
  updates: Partial<{
    name: string;
    updated_at: string;
    deleted_at: string | null;
    starred: boolean;
    document: BoardDocument;
  }>
) => {
  const { error } = await supabase.from("boards").update(updates).eq("id", boardId);

  if (error) {
    throw new Error(`SUPABASE_BOARD_UPDATE_FAILED:${error.message}`);
  }
};

const deleteExpiredBoardVersions = async (
  client: SupabaseClient,
  boardId: string
) => {
  const cutoff = new Date(Date.now() - versionRetentionMs).toISOString();
  const { error: expiredError } = await client
    .from("board_versions")
    .delete()
    .eq("board_id", boardId)
    .lt("created_at", cutoff);

  if (expiredError) {
    throw new Error(`SUPABASE_BOARD_VERSION_PURGE_FAILED:${expiredError.message}`);
  }

  const { data: overflowRows, error: overflowReadError } = await client
    .from("board_versions")
    .select("id")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false })
    .range(maximumVersionsPerBoard, maximumVersionsPerBoard + 199);

  if (overflowReadError) {
    throw new Error(
      `SUPABASE_BOARD_VERSION_READ_FAILED:${overflowReadError.message}`
    );
  }

  const overflowIds = (overflowRows ?? []).map((row) => String(row.id));
  if (overflowIds.length > 0) {
    const { error: overflowDeleteError } = await client
      .from("board_versions")
      .delete()
      .in("id", overflowIds);

    if (overflowDeleteError) {
      throw new Error(
        `SUPABASE_BOARD_VERSION_PURGE_FAILED:${overflowDeleteError.message}`
      );
    }
  }
};

const createBoardSnapshot = async (
  board: StoredBoard,
  reason: BoardVersionRow["reason"] = "automatic",
  force = false
) => {
  const client = getSupabaseServiceRoleClient();

  if (!force) {
    const { data: latest, error: latestError } = await client
      .from("board_versions")
      .select("created_at")
      .eq("board_id", board.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      throw new Error(`SUPABASE_BOARD_VERSION_READ_FAILED:${latestError.message}`);
    }

    if (
      latest?.created_at &&
      new Date(latest.created_at).getTime() + automaticSnapshotIntervalMs >
        Date.now()
    ) {
      return;
    }
  }

  const createdAt = new Date().toISOString();
  const { error } = await client.from("board_versions").insert({
    id: randomBytes(16).toString("hex"),
    board_id: board.id,
    owner_user_id: board.ownerUserId,
    board_name: board.name,
    document: board.document,
    reason,
    source_updated_at: board.updatedAt,
    created_at: createdAt,
  });

  if (error) {
    throw new Error(`SUPABASE_BOARD_VERSION_CREATE_FAILED:${error.message}`);
  }

  await deleteExpiredBoardVersions(client, board.id);
};

export const getUserBoards = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(
    getBoardStoreClient(supabase),
    userId,
    userEmail
  );
  const sanitizedEntry = sanitizeUserBoardCollectionForAccess(
    entry,
    access.canUseCalendar
  );
  return serializeUserBoards(sanitizedEntry, access.maxBoards);
};

export const createBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const availableBoardCount = entry.boards.filter(
    (board) => board.ownedByUser && !board.deletedAt
  ).length;

  if (availableBoardCount >= access.maxBoards) {
    throw new Error("BOARD_LIMIT_REACHED");
  }

  const board = await createBoardRecord(client, userId, availableBoardCount + 1);
  await persistActiveBoardId(client, userId, board.id);

  return serializeUserBoards(
    sanitizeUserBoardCollectionForAccess({
      ...entry,
      activeBoardId: board.id,
      boards: [...entry.boards, board],
    }, access.canUseCalendar),
    access.maxBoards
  );
};

export const selectBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus,
  boardId: string
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getAccessibleBoardOrThrow(entry, boardId);

  await persistActiveBoardId(client, userId, board.id);

  return serializeUserBoards(
    sanitizeUserBoardCollectionForAccess({
      ...entry,
      activeBoardId: board.id,
    }, access.canUseCalendar),
    access.maxBoards
  );
};

export const saveBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus,
  boardId: string,
  document: Partial<BoardDocument>
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getAccessibleBoardOrThrow(entry, boardId);
  if (!board.ownedByUser && board.sharePermission !== "editor") {
    throw new Error("BOARD_FORBIDDEN");
  }
  const normalizedDocument = normalizeBoardDocument(document);
  const documentToStore = access.canUseCalendar
    ? normalizedDocument
    : {
        ...normalizedDocument,
        calendarEntries: board.document.calendarEntries,
      };
  const updatedAt = new Date().toISOString();

  await createBoardSnapshot(board);
  await updateBoardRow(
    board.ownedByUser ? client : getSupabaseServiceRoleClient(),
    board.id,
    {
    document: documentToStore,
    updated_at: updatedAt,
    }
  );

  return {
    ok: true,
    board: {
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
      updatedAt,
      deletedAt: board.deletedAt,
      starred: board.starred,
      document: applyCalendarAccessToDocument(
        documentToStore,
        access.canUseCalendar
      ),
      ownedByUser: board.ownedByUser,
      shareCount: board.shareCount,
      sharePermission: board.sharePermission,
    },
  };
};

export const renameBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  name: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getOwnedBoardOrThrow(entry, boardId);
  const normalizedName = name.trim().slice(0, 40);

  if (!normalizedName) {
    throw new Error("BOARD_NAME_REQUIRED");
  }

  const updatedAt = new Date().toISOString();
  await updateBoardRow(client, board.id, {
    name: normalizedName,
    updated_at: updatedAt,
  });

  return serializeUserBoards(
    sanitizeUserBoardCollectionForAccess({
      ...entry,
      boards: entry.boards.map((item) =>
        item.id === board.id
          ? {
              ...item,
              name: normalizedName,
              updatedAt,
            }
          : item
      ),
    }, access.canUseCalendar),
    access.maxBoards
  );
};

export const setBoardStarredForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  starred: boolean,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getOwnedBoardOrThrow(entry, boardId);
  const updatedAt = new Date().toISOString();

  await updateBoardRow(client, board.id, {
    starred,
    updated_at: updatedAt,
  });

  return serializeUserBoards(
    sanitizeUserBoardCollectionForAccess({
      ...entry,
      boards: entry.boards.map((item) =>
        item.id === board.id
          ? {
              ...item,
              starred,
              updatedAt,
            }
          : item
      ),
    }, access.canUseCalendar),
    access.maxBoards
  );
};

export const moveBoardToTrashForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getOwnedBoardOrThrow(entry, boardId);
  const deletedAt = new Date().toISOString();
  const nextBoards = entry.boards.map((item) =>
    item.id === board.id
      ? {
          ...item,
          deletedAt,
          updatedAt: deletedAt,
        }
      : item
  );
  const nextActiveBoard =
    entry.activeBoardId === boardId
      ? nextBoards.find((item) => item.id !== boardId && !item.deletedAt)?.id ?? ""
      : entry.activeBoardId;

  await createBoardSnapshot(board, "before_trash", true);
  await Promise.all([
    updateBoardRow(client, board.id, {
      deleted_at: deletedAt,
      updated_at: deletedAt,
    }),
    persistActiveBoardId(client, userId, nextActiveBoard),
  ]);

  return serializeUserBoards(
    sanitizeUserBoardCollectionForAccess({
      ...entry,
      activeBoardId: nextActiveBoard,
      boards: nextBoards,
    }, access.canUseCalendar),
    access.maxBoards
  );
};

export const restoreBoardFromTrashForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getOwnedBoardIncludingTrashOrThrow(entry, boardId);

  if (!board.deletedAt) {
    throw new Error("BOARD_NOT_IN_TRASH");
  }

  const availableBoardCount = entry.boards.filter(
    (item) => item.ownedByUser && !item.deletedAt
  ).length;
  if (availableBoardCount >= access.maxBoards) {
    throw new Error("BOARD_LIMIT_REACHED");
  }

  const updatedAt = new Date().toISOString();
  await updateBoardRow(client, board.id, {
    deleted_at: null,
    updated_at: updatedAt,
  });
  await persistActiveBoardId(client, userId, board.id);

  const nextBoards = entry.boards.map((item) =>
    item.id === board.id
      ? { ...item, deletedAt: undefined, updatedAt }
      : item
  );

  return serializeUserBoards(
    sanitizeUserBoardCollectionForAccess(
      {
        ...entry,
        activeBoardId: board.id,
        boards: nextBoards,
      },
      access.canUseCalendar
    ),
    access.maxBoards
  );
};

export const permanentlyDeleteBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getOwnedBoardIncludingTrashOrThrow(entry, boardId);

  if (!board.deletedAt) {
    throw new Error("BOARD_NOT_IN_TRASH");
  }

  const { error } = await client
    .from("boards")
    .delete()
    .eq("id", board.id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`SUPABASE_BOARD_DELETE_FAILED:${error.message}`);
  }

  const nextBoards = entry.boards.filter((item) => item.id !== board.id);
  const nextActiveBoard = nextBoards.find((item) => !item.deletedAt)?.id ?? "";
  await persistActiveBoardId(client, userId, nextActiveBoard);

  return serializeUserBoards(
    sanitizeUserBoardCollectionForAccess(
      {
        ...entry,
        activeBoardId: nextActiveBoard,
        boards: nextBoards,
      },
      access.canUseCalendar
    ),
    access.maxBoards
  );
};

export const getBoardVersionsForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string
) => {
  const entry = await loadUserBoardCollection(
    getBoardStoreClient(supabase),
    userId,
    userEmail
  );
  getOwnedBoardOrThrow(entry, boardId);

  const client = getSupabaseServiceRoleClient();
  await deleteExpiredBoardVersions(client, boardId);
  const { data, error } = await client
    .from("board_versions")
    .select(
      "id,board_id,owner_user_id,board_name,document,reason,source_updated_at,created_at"
    )
    .eq("board_id", boardId)
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(maximumVersionsPerBoard);

  if (error) {
    throw new Error(`SUPABASE_BOARD_VERSION_READ_FAILED:${error.message}`);
  }

  return {
    retentionDays: 30,
    versions: ((data ?? []) as BoardVersionRow[]).map<BoardVersionSummary>(
      (version) => {
        const document = normalizeBoardDocument(version.document);
        return {
          id: version.id,
          boardName: version.board_name,
          reason: version.reason,
          sourceUpdatedAt: version.source_updated_at,
          createdAt: version.created_at,
          elementCount: document.elements.length,
          calendarEntryCount: document.calendarEntries.length,
        };
      }
    ),
  };
};

export const restoreBoardVersionForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  versionId: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  const board = getOwnedBoardOrThrow(entry, boardId);
  const versionClient = getSupabaseServiceRoleClient();
  const { data, error } = await versionClient
    .from("board_versions")
    .select(
      "id,board_id,owner_user_id,board_name,document,reason,source_updated_at,created_at"
    )
    .eq("id", versionId)
    .eq("board_id", boardId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`SUPABASE_BOARD_VERSION_READ_FAILED:${error.message}`);
  }
  if (!data) {
    throw new Error("BOARD_VERSION_NOT_FOUND");
  }

  const version = data as BoardVersionRow;
  const restoredDocument = normalizeBoardDocument(version.document);
  const updatedAt = new Date().toISOString();

  await createBoardSnapshot(board, "before_restore", true);
  await updateBoardRow(client, board.id, {
    name: version.board_name.trim().slice(0, 40) || board.name,
    document: restoredDocument,
    updated_at: updatedAt,
  });

  return {
    ok: true,
    board: {
      id: board.id,
      name: version.board_name.trim().slice(0, 40) || board.name,
      createdAt: board.createdAt,
      updatedAt,
      starred: board.starred,
      document: applyCalendarAccessToDocument(
        restoredDocument,
        access.canUseCalendar
      ),
      ownedByUser: true,
      shareCount: board.shareCount,
    },
  };
};

export const getBoardSharesForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  getOwnedBoardOrThrow(entry, boardId);

  const shares = await loadBoardShareRowsForOwner(client, userId);
  const boardShares = shares
    .filter((share) => share.board_id === boardId)
    .sort((first, second) => first.created_at.localeCompare(second.created_at))
    .map<BoardShareSummary>((share) => ({
      id: share.id,
      email: share.shared_with_email,
      createdAt: share.created_at,
      status: share.status,
      permission: share.permission,
      expiresAt: share.invite_expires_at ?? undefined,
      acceptedAt: share.accepted_at ?? undefined,
    }));

  return {
    shares: boardShares,
    shareLimit: access.maxShares,
  };
};

export const shareBoardWithUserForPlan = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus,
  email: string
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  getOwnedBoardOrThrow(entry, boardId);

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw new Error("BOARD_SHARE_EMAIL_REQUIRED");
  }

  if (normalizedEmail === normalizeEmail(userEmail)) {
    throw new Error("BOARD_SHARE_SELF");
  }

  const existingShares = (await loadBoardShareRowsForOwner(client, userId)).filter(
    (share) => share.board_id === boardId
  );

  const existingShare = existingShares.find(
    (share) => share.shared_with_email === normalizedEmail
  );
  if (existingShare?.status === "accepted") {
    throw new Error("BOARD_SHARE_EXISTS");
  }

  if (!existingShare && existingShares.length >= access.maxShares) {
    throw new Error("BOARD_SHARE_LIMIT_REACHED");
  }

  const now = new Date().toISOString();
  const invitationToken = randomBytes(32).toString("base64url");
  const invitationTokenHash = createHash("sha256")
    .update(invitationToken)
    .digest("hex");
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    id: existingShare?.id ?? randomBytes(16).toString("hex"),
    board_id: boardId,
    owner_user_id: userId,
    shared_with_email: normalizedEmail,
    recipient_user_id: null,
    permission: "editor" as const,
    status: "pending" as const,
    invite_token_hash: invitationTokenHash,
    invite_expires_at: inviteExpiresAt,
    accepted_at: null,
    created_at: now,
    updated_at: now,
  };

  const query = getSupabaseServiceRoleClient()
    .from("board_shares")
  const { data, error } = await (existingShare
    ? query.update(row).eq("id", existingShare.id)
    : query.insert(row))
    .select("id,board_id,owner_user_id,shared_with_email,recipient_user_id,permission,status,invite_token_hash,invite_expires_at,accepted_at,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(`SUPABASE_BOARD_SHARE_CREATE_FAILED:${error.message}`);
  }

  return {
    ok: true,
    share: {
      id: (data as BoardShareRow).id,
      email: (data as BoardShareRow).shared_with_email,
      createdAt: (data as BoardShareRow).created_at,
      status: (data as BoardShareRow).status,
      permission: (data as BoardShareRow).permission,
      expiresAt: (data as BoardShareRow).invite_expires_at ?? undefined,
    } satisfies BoardShareSummary,
    invitationToken,
    shareCount: existingShare ? existingShares.length : existingShares.length + 1,
    shareLimit: access.maxShares,
  };
};

export const removeBoardShareForUser = async (
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  boardId: string,
  shareId: string,
  plan: AppProfilePlan,
  subscriptionStatus: AppProfileSubscriptionStatus
) => {
  const client = getBoardStoreClient(supabase);
  const access = getWorkspaceAccess(plan, subscriptionStatus);
  const entry = await loadUserBoardCollection(client, userId, userEmail);
  getOwnedBoardOrThrow(entry, boardId);

  const { error } = await client
    .from("board_shares")
    .delete()
    .eq("id", shareId)
    .eq("board_id", boardId)
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(`SUPABASE_BOARD_SHARE_DELETE_FAILED:${error.message}`);
  }

  const remainingShares = (await loadBoardShareRowsForOwner(client, userId)).filter(
    (share) => share.board_id === boardId
  );

  return {
    ok: true,
    shareCount: remainingShares.length,
    shareLimit: access.maxShares,
  };
};

export const acceptBoardInvitationForUser = async (
  userId: string,
  userEmail: string,
  invitationToken: string
) => {
  const token = invitationToken.trim();
  if (!token || token.length > 512) {
    throw new Error("BOARD_INVITATION_INVALID");
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = getSupabaseServiceRoleClient();
  const { data, error } = await client
    .from("board_shares")
    .select("id,board_id,owner_user_id,shared_with_email,recipient_user_id,permission,status,invite_token_hash,invite_expires_at,accepted_at,created_at,updated_at")
    .eq("invite_token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(`SUPABASE_BOARD_INVITATION_READ_FAILED:${error.message}`);
  }
  if (!data) {
    throw new Error("BOARD_INVITATION_INVALID");
  }

  const invitation = data as BoardShareRow;
  if (invitation.status !== "pending") {
    throw new Error("BOARD_INVITATION_USED");
  }
  if (
    !invitation.invite_expires_at ||
    new Date(invitation.invite_expires_at).getTime() <= Date.now()
  ) {
    throw new Error("BOARD_INVITATION_EXPIRED");
  }
  if (normalizeEmail(invitation.shared_with_email) !== normalizeEmail(userEmail)) {
    throw new Error("BOARD_INVITATION_EMAIL_MISMATCH");
  }

  const acceptedAt = new Date().toISOString();
  const { error: updateError } = await client
    .from("board_shares")
    .update({
      recipient_user_id: userId,
      status: "accepted",
      accepted_at: acceptedAt,
      invite_token_hash: null,
      invite_expires_at: null,
      updated_at: acceptedAt,
    })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .eq("invite_token_hash", tokenHash);

  if (updateError) {
    throw new Error(`SUPABASE_BOARD_INVITATION_ACCEPT_FAILED:${updateError.message}`);
  }

  return { ok: true, boardId: invitation.board_id };
};
