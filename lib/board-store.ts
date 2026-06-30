import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppProfilePlan,
  AppProfileSubscriptionStatus,
} from "@/lib/profile-store";
import { normalizeEmail } from "@/lib/auth-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const trashRetentionMs = 30 * 24 * 60 * 60 * 1000;
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
  created_at: string;
  updated_at: string;
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
  }
): StoredBoard => {
  const document = normalizeBoardDocument(board.document);

  return {
    id: board.id,
    ownerUserId: board.user_id,
    ownedByUser: options?.ownedByUser ?? true,
    shareCount: options?.shareCount ?? 0,
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
    .select("id,board_id,owner_user_id,shared_with_email,created_at,updated_at")
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(`SUPABASE_BOARD_SHARES_READ_FAILED:${error.message}`);
  }

  return (data ?? []) as BoardShareRow[];
};

const loadBoardShareRowsForRecipient = async (
  supabase: SupabaseClient,
  email: string
) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return [] as BoardShareRow[];
  }

  const { data, error } = await supabase
    .from("board_shares")
    .select("id,board_id,owner_user_id,shared_with_email,created_at,updated_at")
    .eq("shared_with_email", normalizedEmail);

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
      userEmail ? loadBoardShareRowsForRecipient(supabase, userEmail) : [],
    ]);

  const ownerShareCountByBoardId = ownerShareRows.reduce<Record<string, number>>(
    (accumulator, share) => {
      accumulator[share.board_id] = (accumulator[share.board_id] ?? 0) + 1;
      return accumulator;
    },
    {}
  );

  let boards = ownedBoardRows
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
  const sharedBoardRows = await loadBoardRowsByIds(supabase, sharedBoardIds);
  const sharedBoards = sharedBoardRows
    .filter((board) => board.user_id !== userId)
    .filter((board) => !board.deleted_at)
    .map((board, index) =>
      mapBoardRowToStoredBoard(board, boards.length + index, {
        ownedByUser: false,
        shareCount: 0,
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
  const normalizedDocument = normalizeBoardDocument(document);
  const documentToStore = access.canUseCalendar
    ? normalizedDocument
    : {
        ...normalizedDocument,
        calendarEntries: board.document.calendarEntries,
      };
  const updatedAt = new Date().toISOString();

  await updateBoardRow(client, board.id, {
    document: documentToStore,
    updated_at: updatedAt,
  });

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

  if (existingShares.some((share) => share.shared_with_email === normalizedEmail)) {
    throw new Error("BOARD_SHARE_EXISTS");
  }

  if (existingShares.length >= access.maxShares) {
    throw new Error("BOARD_SHARE_LIMIT_REACHED");
  }

  const now = new Date().toISOString();
  const row = {
    id: randomBytes(16).toString("hex"),
    board_id: boardId,
    owner_user_id: userId,
    shared_with_email: normalizedEmail,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await client
    .from("board_shares")
    .insert(row)
    .select("id,board_id,owner_user_id,shared_with_email,created_at,updated_at")
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
    } satisfies BoardShareSummary,
    shareCount: existingShares.length + 1,
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
