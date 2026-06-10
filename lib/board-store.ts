import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

const dataDirectory = path.join(process.cwd(), ".data");
const boardStorePath = path.join(dataDirectory, "boards.json");
const maxBoardsPerUser = 10;
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

type BoardStoreData = {
  users: UserBoardCollection[];
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

const createStoredBoard = (index: number): StoredBoard => {
  const now = new Date().toISOString();
  const document = defaultBoardDocument();

  return {
    id: randomBytes(16).toString("hex"),
    name: createBoardName(index),
    createdAt: now,
    updatedAt: now,
    starred: false,
    previewDocument: document,
    document,
  };
};

const emptyBoardStore = (): BoardStoreData => ({
  users: [],
});

const ensureBoardStore = async () => {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(boardStorePath);
  } catch {
    await fs.writeFile(
      boardStorePath,
      JSON.stringify(emptyBoardStore(), null, 2)
    );
  }
};

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

const readBoardStore = async (): Promise<BoardStoreData> => {
  await ensureBoardStore();

  try {
    const rawData = await fs.readFile(boardStorePath, "utf8");
    const parsedData = JSON.parse(rawData) as Partial<BoardStoreData>;

    return {
      users: Array.isArray(parsedData.users)
        ? parsedData.users
            .filter(
              (entry): entry is UserBoardCollection =>
                Boolean(entry?.userId && Array.isArray(entry?.boards))
            )
            .map((entry) => {
              const boards = entry.boards
                .filter((board) => Boolean(board?.id))
                .map((board, index) => ({
                  document: normalizeBoardDocument(board.document),
                  id: board.id,
                  name:
                    typeof board.name === "string" && board.name.trim().length > 0
                      ? board.name
                      : createBoardName(index + 1),
                  createdAt: board.createdAt ?? new Date().toISOString(),
                  updatedAt:
                    board.updatedAt ?? board.createdAt ?? new Date().toISOString(),
                  deletedAt:
                    typeof board.deletedAt === "string" ? board.deletedAt : undefined,
                  starred: Boolean(board.starred),
                  previewDocument: normalizeBoardDocument(board.document),
                }))
                .filter((board) => {
                  if (!board.deletedAt) return true;

                  return (
                    new Date(board.deletedAt).getTime() + trashRetentionMs > Date.now()
                  );
                });

              const availableBoards = boards.filter((board) => !board.deletedAt);
              const fallbackBoard = availableBoards[0];
              const hasActiveBoard = availableBoards.some(
                (board) => board.id === entry.activeBoardId
              );

              return {
                userId: entry.userId,
                activeBoardId: hasActiveBoard
                  ? entry.activeBoardId
                  : fallbackBoard?.id ?? "",
                boards,
              };
            })
        : [],
    };
  } catch {
    return emptyBoardStore();
  }
};

const writeBoardStore = async (data: BoardStoreData) => {
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(boardStorePath, JSON.stringify(data, null, 2));
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

const ensureUserBoardCollection = (data: BoardStoreData, userId: string) => {
  let entry = data.users.find((item) => item.userId === userId);

  if (!entry) {
    const firstBoard = createStoredBoard(1);
    entry = {
      userId,
      activeBoardId: firstBoard.id,
      boards: [firstBoard],
    };
    data.users.push(entry);
  }

  if (entry.boards.length === 0) {
    const firstBoard = createStoredBoard(1);
    entry.boards = [firstBoard];
    entry.activeBoardId = firstBoard.id;
  }

  const availableBoards = entry.boards.filter((board) => !board.deletedAt);

  if (!availableBoards.some((board) => board.id === entry.activeBoardId)) {
    entry.activeBoardId = availableBoards[0]?.id ?? "";
  }

  return entry;
};

const serializeUserBoards = (entry: UserBoardCollection) => {
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
    maxBoards: maxBoardsPerUser,
  };
};

export const getUserBoards = async (userId: string) => {
  const data = await readBoardStore();
  const entry = ensureUserBoardCollection(data, userId);
  await writeBoardStore(data);
  return serializeUserBoards(entry);
};

export const createBoardForUser = async (userId: string) => {
  const data = await readBoardStore();
  const entry = ensureUserBoardCollection(data, userId);
  const availableBoardCount = entry.boards.filter((board) => !board.deletedAt).length;

  if (availableBoardCount >= maxBoardsPerUser) {
    throw new Error("BOARD_LIMIT_REACHED");
  }

  const board = createStoredBoard(availableBoardCount + 1);
  entry.boards.push(board);
  entry.activeBoardId = board.id;
  await writeBoardStore(data);

  return serializeUserBoards(entry);
};

export const selectBoardForUser = async (userId: string, boardId: string) => {
  const data = await readBoardStore();
  const entry = ensureUserBoardCollection(data, userId);
  const board = entry.boards.find((item) => item.id === boardId && !item.deletedAt);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  entry.activeBoardId = board.id;
  board.updatedAt = new Date().toISOString();
  await writeBoardStore(data);

  return serializeUserBoards(entry);
};

export const saveBoardForUser = async (
  userId: string,
  boardId: string,
  document: Partial<BoardDocument>
) => {
  const data = await readBoardStore();
  const entry = ensureUserBoardCollection(data, userId);
  const board = entry.boards.find((item) => item.id === boardId && !item.deletedAt);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  board.document = normalizeBoardDocument(document);
  board.previewDocument = board.document;
  board.updatedAt = new Date().toISOString();
  await writeBoardStore(data);

  return {
    ok: true,
    board: {
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      deletedAt: board.deletedAt,
      starred: board.starred,
      document: board.document,
    },
  };
};

export const renameBoardForUser = async (
  userId: string,
  boardId: string,
  name: string
) => {
  const data = await readBoardStore();
  const entry = ensureUserBoardCollection(data, userId);
  const board = entry.boards.find((item) => item.id === boardId && !item.deletedAt);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  const normalizedName = name.trim().slice(0, 40);

  if (!normalizedName) {
    throw new Error("BOARD_NAME_REQUIRED");
  }

  board.name = normalizedName;
  board.updatedAt = new Date().toISOString();
  await writeBoardStore(data);

  return serializeUserBoards(entry);
};

export const setBoardStarredForUser = async (
  userId: string,
  boardId: string,
  starred: boolean
) => {
  const data = await readBoardStore();
  const entry = ensureUserBoardCollection(data, userId);
  const board = entry.boards.find((item) => item.id === boardId && !item.deletedAt);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  board.starred = starred;
  board.updatedAt = new Date().toISOString();
  await writeBoardStore(data);

  return serializeUserBoards(entry);
};

export const moveBoardToTrashForUser = async (userId: string, boardId: string) => {
  const data = await readBoardStore();
  const entry = ensureUserBoardCollection(data, userId);
  const board = entry.boards.find((item) => item.id === boardId && !item.deletedAt);

  if (!board) {
    throw new Error("BOARD_NOT_FOUND");
  }

  board.deletedAt = new Date().toISOString();
  board.updatedAt = board.deletedAt;

  if (entry.activeBoardId === boardId) {
    const nextBoard = entry.boards.find(
      (item) => item.id !== boardId && !item.deletedAt
    );
    entry.activeBoardId = nextBoard?.id ?? "";
  }

  await writeBoardStore(data);
  return serializeUserBoards(entry);
};

export const boardsLimit = maxBoardsPerUser;
