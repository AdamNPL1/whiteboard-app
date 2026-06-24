import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppProfilePlan } from "@/lib/profile-store";

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

export type BoardSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  starred?: boolean;
  previewDocument: BoardDocument;
};

type StoredBoard = BoardSummary & {
  document: BoardDocument;
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

export const getBoardLimitForPlan = (plan: AppProfilePlan) => {
  if (plan === "master") return 25;
  if (plan === "pro") return 12;
  return 5;
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

const isWithinTrashRetention = (deletedAt?: string) => {
  if (!deletedAt) return true;

  return new Date(deletedAt).getTime() + trashRetentionMs > Date.now();
};

const mapBoardRowToStoredBoard = (board: BoardRow, index: number): StoredBoard => {
  const document = normalizeBoardDocument(board.document);

  return {
    id: board.id,
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
        }
      : null,
    maxBoards,
  };
};

const loadUserBoardRows = async (supabase: SupabaseClient, userId: string) => {
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
  userId: string
): Promise<UserBoardCollection> => {
  const [boardRows, boardState] = await Promise.all([
    loadUserBoardRows(supabase, userId),
    loadUserBoardState(supabase, userId),
  ]);

  let boards = boardRows
    .map((board, index) => mapBoardRowToStoredBoard(board, index))
    .filter((board) => isWithinTrashRetention(board.deletedAt));

  if (boards.length === 0) {
    const firstBoard = await createBoardRecord(supabase, userId, 1);
    boards = [firstBoard];
    await persistActiveBoardId(supabase, userId, firstBoard.id);

    return {
      userId,
      activeBoardId: firstBoard.id,
      boards,
    };
  }

  const availableBoards = boards.filter((board) => !board.deletedAt);
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
    boards,
  };
};

const getLiveBoardOrThrow = (entry: UserBoardCollection, boardId: string) => {
  const board = entry.boards.find((item) => item.id === boardId && !item.deletedAt);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  return board;
};

const updateBoardRow = async (
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  updates: Partial<{
    name: string;
    updated_at: string;
    deleted_at: string | null;
    starred: boolean;
    document: BoardDocument;
  }>
) => {
  const { error } = await supabase
    .from("boards")
    .update(updates)
    .eq("user_id", userId)
    .eq("id", boardId);

  if (error) {
    throw new Error(`SUPABASE_BOARD_UPDATE_FAILED:${error.message}`);
  }
};

export const getUserBoards = async (
  supabase: SupabaseClient,
  userId: string,
  plan: AppProfilePlan
) => {
  const entry = await loadUserBoardCollection(supabase, userId);
  return serializeUserBoards(entry, getBoardLimitForPlan(plan));
};

export const createBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  plan: AppProfilePlan
) => {
  const entry = await loadUserBoardCollection(supabase, userId);
  const availableBoardCount = entry.boards.filter((board) => !board.deletedAt).length;
  const maxBoardsForPlan = getBoardLimitForPlan(plan);

  if (availableBoardCount >= maxBoardsForPlan) {
    throw new Error("BOARD_LIMIT_REACHED");
  }

  const board = await createBoardRecord(supabase, userId, availableBoardCount + 1);
  await persistActiveBoardId(supabase, userId, board.id);

  return serializeUserBoards({
    ...entry,
    activeBoardId: board.id,
    boards: [...entry.boards, board],
  }, maxBoardsForPlan);
};

export const selectBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  plan: AppProfilePlan,
  boardId: string
) => {
  const entry = await loadUserBoardCollection(supabase, userId);
  const board = getLiveBoardOrThrow(entry, boardId);
  const updatedAt = new Date().toISOString();

  await Promise.all([
    updateBoardRow(supabase, userId, board.id, { updated_at: updatedAt }),
    persistActiveBoardId(supabase, userId, board.id),
  ]);

  return serializeUserBoards({
    ...entry,
    activeBoardId: board.id,
    boards: entry.boards.map((item) =>
      item.id === board.id
        ? {
            ...item,
            updatedAt,
          }
        : item
    ),
  }, getBoardLimitForPlan(plan));
};

export const saveBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  document: Partial<BoardDocument>
) => {
  const entry = await loadUserBoardCollection(supabase, userId);
  const board = getLiveBoardOrThrow(entry, boardId);
  const normalizedDocument = normalizeBoardDocument(document);
  const updatedAt = new Date().toISOString();

  await updateBoardRow(supabase, userId, board.id, {
    document: normalizedDocument,
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
      document: normalizedDocument,
    },
  };
};

export const renameBoardForUser = async (
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  name: string
) => {
  const entry = await loadUserBoardCollection(supabase, userId);
  const board = getLiveBoardOrThrow(entry, boardId);
  const normalizedName = name.trim().slice(0, 40);

  if (!normalizedName) {
    throw new Error("BOARD_NAME_REQUIRED");
  }

  const updatedAt = new Date().toISOString();
  await updateBoardRow(supabase, userId, board.id, {
    name: normalizedName,
    updated_at: updatedAt,
  });

  return serializeUserBoards({
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
  });
};

export const setBoardStarredForUser = async (
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  starred: boolean
) => {
  const entry = await loadUserBoardCollection(supabase, userId);
  const board = getLiveBoardOrThrow(entry, boardId);
  const updatedAt = new Date().toISOString();

  await updateBoardRow(supabase, userId, board.id, {
    starred,
    updated_at: updatedAt,
  });

  return serializeUserBoards({
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
  });
};

export const moveBoardToTrashForUser = async (
  supabase: SupabaseClient,
  userId: string,
  boardId: string
) => {
  const entry = await loadUserBoardCollection(supabase, userId);
  const board = getLiveBoardOrThrow(entry, boardId);
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
    updateBoardRow(supabase, userId, board.id, {
      deleted_at: deletedAt,
      updated_at: deletedAt,
    }),
    persistActiveBoardId(supabase, userId, nextActiveBoard),
  ]);

  return serializeUserBoards({
    ...entry,
    activeBoardId: nextActiveBoard,
    boards: nextBoards,
  });
};
