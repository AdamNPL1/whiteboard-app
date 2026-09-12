import { beforeAll, describe, expect, it } from "vitest";

import {
  LEGACY_PAYLOAD_FORMAT,
  PAYLOAD_FORMAT,
  PREVIOUS_PAYLOAD_FORMAT,
  PREVIOUS_TABLES,
  TABLES,
  decryptBackup,
  encryptBackup,
  hashRows,
  validatePayload,
} from "../scripts/lib/backup-utils.mjs";

const rows = {
  profiles: [{ id: "user-1", plan: "free" }],
  boards: [{ id: "board-1", user_id: "user-1", document: { calendarEntries: [] } }],
  board_versions: [{ id: "version-1", board_id: "board-1" }],
  user_board_state: [{ user_id: "user-1", active_board_id: "board-1" }],
  board_shares: [{ id: "share-1", board_id: "board-1" }],
  stripe_webhook_events: [{ event_id: "evt_test_1" }],
  board_personal_notes: [
    { board_id: "board-1", user_id: "user-1", title: "Private", content: "Notes" },
  ],
  call_push_subscriptions: [{ id: "push-1", user_id: "user-1" }],
  call_notification_preferences: [{ user_id: "user-1", enabled: true }],
};

const payload = () => ({
  format: PAYLOAD_FORMAT,
  manifest: {
    createdAt: new Date().toISOString(),
    sourceSupabaseHost: "example.supabase.co",
    coverage: {
      type: "application-data-only",
      authUsers: false,
      storageObjects: false,
      excludedEphemeralTables: ["api_rate_limits"],
      excludedManagedTables: ["auth.users"],
    },
    tables: Object.fromEntries(
      TABLES.map(({ name, key }) => [name, { count: rows[name].length, sha256: hashRows(rows[name], key) }])
    ),
  },
  tables: structuredClone(rows),
});

beforeAll(() => {
  process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("Scriboo backup safeguards", () => {
  it("validates all persistent application tables", () => {
    expect(validatePayload(payload())).toMatchObject({
      profiles: 1,
      boards: 1,
      boardVersions: 1,
      processedStripeEvents: 1,
      personalNotes: 1,
      pushSubscriptions: 1,
      notificationPreferences: 1,
      includesAuthUsers: false,
    });
  });

  it("uses small pages for large board documents", () => {
    expect(TABLES.find(({ name }) => name === "boards")?.pageSize).toBe(1);
    expect(TABLES.find(({ name }) => name === "board_versions")?.pageSize).toBe(5);
  });

  it("encrypts and authenticates the payload", () => {
    const original = payload();
    expect(decryptBackup(encryptBackup(original))).toEqual(original);
  });

  it("rejects an orphaned board version", () => {
    const invalid = payload();
    invalid.tables.board_versions[0].board_id = "missing";
    invalid.manifest.tables.board_versions.sha256 = hashRows(
      invalid.tables.board_versions,
      "id"
    );
    expect(() => validatePayload(invalid)).toThrow("references a missing board");
  });

  it("rejects an orphaned personal note", () => {
    const invalid = payload();
    invalid.tables.board_personal_notes[0].board_id = "missing";
    invalid.manifest.tables.board_personal_notes.sha256 = hashRows(
      invalid.tables.board_personal_notes,
      ["board_id", "user_id"]
    );
    expect(() => validatePayload(invalid)).toThrow("references a missing board");
  });

  it("keeps v2 application backups verifiable", () => {
    const previous = payload();
    previous.format = PREVIOUS_PAYLOAD_FORMAT;
    for (const { name } of TABLES) {
      if (PREVIOUS_TABLES.some((table) => table.name === name)) continue;
      delete previous.tables[name];
      delete previous.manifest.tables[name];
    }
    expect(validatePayload(previous).personalNotes).toBe(0);
  });

  it("keeps old v1 application backups verifiable", () => {
    const legacy = payload();
    legacy.format = LEGACY_PAYLOAD_FORMAT;
    delete legacy.manifest.coverage;
    delete legacy.tables.board_versions;
    delete legacy.tables.stripe_webhook_events;
    delete legacy.manifest.tables.board_versions;
    delete legacy.manifest.tables.stripe_webhook_events;
    expect(validatePayload(legacy).legacyFormat).toBe(true);
  });
});
