import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export const BACKUP_FORMAT = "scriboo-encrypted-backup-v1";
export const PAYLOAD_FORMAT = "scriboo-app-data-v1";
export const BACKUP_DIRECTORY = resolve("backups");

export const TABLES = [
  { name: "profiles", key: "id" },
  { name: "boards", key: "id" },
  { name: "user_board_state", key: "user_id" },
  { name: "board_shares", key: "id" },
];

const getEncryptionKey = () => {
  const encoded = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("BACKUP_ENCRYPTION_KEY is required.");

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64.");
  }
  return key;
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
};

export const sortRows = (rows, key) =>
  [...rows].sort((left, right) =>
    String(left?.[key] ?? "").localeCompare(String(right?.[key] ?? ""))
  );

export const hashRows = (rows, key) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(sortRows(rows, key))))
    .digest("hex");

export const encryptBackup = (payload) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);

  return {
    format: BACKUP_FORMAT,
    algorithm: "aes-256-gcm+gzip",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};

export const decryptBackup = (envelope) => {
  if (envelope?.format !== BACKUP_FORMAT) throw new Error("Unsupported backup format.");

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(gunzipSync(compressed).toString("utf8"));
};

export const readBackup = (filePath) => {
  const absolutePath = resolve(filePath);
  const envelope = JSON.parse(readFileSync(absolutePath, "utf8"));
  return { absolutePath, payload: decryptBackup(envelope) };
};

export const findBackupFile = (argument) => {
  if (argument) return resolve(argument);
  if (!existsSync(BACKUP_DIRECTORY)) {
    throw new Error("No backups directory exists. Run npm run backup:create first.");
  }
  const candidates = readdirSync(BACKUP_DIRECTORY)
    .filter((name) => name.endsWith(".scriboo-backup"))
    .sort()
    .reverse();
  if (!candidates[0]) throw new Error("No Scriboo backup file was found.");
  return join(BACKUP_DIRECTORY, candidates[0]);
};

export const ensureParentDirectory = (filePath) => {
  mkdirSync(dirname(filePath), { recursive: true });
};

export const readAllRows = async (client, table, key) => {
  const pageSize = 500;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(key, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`BACKUP_READ_FAILED:${table}:${error.code || "unknown"}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

export const validatePayload = (payload) => {
  if (payload?.format !== PAYLOAD_FORMAT) throw new Error("Invalid Scriboo backup payload.");

  const boardIds = new Set((payload.tables?.boards ?? []).map((row) => row.id));
  const profileIds = new Set((payload.tables?.profiles ?? []).map((row) => row.id));

  for (const { name, key } of TABLES) {
    const rows = payload.tables?.[name];
    if (!Array.isArray(rows)) throw new Error(`Backup table ${name} is missing.`);
    const identifiers = rows.map((row) => String(row?.[key] ?? ""));
    if (identifiers.some((value) => !value)) throw new Error(`${name} contains a missing primary key.`);
    if (new Set(identifiers).size !== identifiers.length) throw new Error(`${name} contains duplicate keys.`);
    if (payload.manifest?.tables?.[name]?.count !== rows.length) {
      throw new Error(`${name} row count does not match its manifest.`);
    }
    if (payload.manifest?.tables?.[name]?.sha256 !== hashRows(rows, key)) {
      throw new Error(`${name} checksum verification failed.`);
    }
  }

  // Legacy/guest boards can exist without a profiles row because the current
  // database schema does not enforce that relationship. Preserve and report
  // them instead of making a disaster-recovery backup impossible.
  const orphanedBoards = payload.tables.boards.filter(
    (board) => !profileIds.has(String(board.user_id))
  );
  for (const state of payload.tables.user_board_state) {
    if (state.active_board_id && !boardIds.has(state.active_board_id)) {
      throw new Error(`Board state for ${state.user_id} references a missing board.`);
    }
  }
  for (const share of payload.tables.board_shares) {
    if (!boardIds.has(share.board_id)) {
      throw new Error(`Share ${share.id} references a missing board.`);
    }
  }

  return {
    profiles: payload.tables.profiles.length,
    boards: payload.tables.boards.length,
    calendarEntries: payload.tables.boards.reduce(
      (total, board) => total + (Array.isArray(board.document?.calendarEntries) ? board.document.calendarEntries.length : 0),
      0
    ),
    sharingRelationships: payload.tables.board_shares.length,
    subscriptionMappings: payload.tables.profiles.filter(
      (profile) => profile.stripe_customer_id || profile.stripe_subscription_id
    ).length,
    orphanedBoards: orphanedBoards.length,
  };
};

export const projectHost = (url) => new URL(url).host.toLowerCase();
