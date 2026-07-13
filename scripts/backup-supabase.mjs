import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  BACKUP_DIRECTORY,
  PAYLOAD_FORMAT,
  TABLES,
  encryptBackup,
  ensureParentDirectory,
  hashRows,
  projectHost,
  readAllRows,
  validatePayload,
} from "./lib/backup-utils.mjs";

const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!sourceUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const client = createClient(sourceUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tables = {};
const tableManifest = {};

for (const { name, key } of TABLES) {
  const rows = await readAllRows(client, name, key);
  tables[name] = rows;
  tableManifest[name] = { count: rows.length, sha256: hashRows(rows, key) };
}

const createdAt = new Date().toISOString();
const payload = {
  format: PAYLOAD_FORMAT,
  manifest: {
    createdAt,
    sourceSupabaseHost: projectHost(sourceUrl),
    tables: tableManifest,
  },
  tables,
};
const summary = validatePayload(payload);
const fileName = `scriboo-${createdAt.replace(/[:.]/g, "-")}.scriboo-backup`;
const outputPath = join(BACKUP_DIRECTORY, fileName);
ensureParentDirectory(outputPath);
writeFileSync(outputPath, `${JSON.stringify(encryptBackup(payload))}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});

console.log(JSON.stringify({ status: "created", file: outputPath, summary }, null, 2));
