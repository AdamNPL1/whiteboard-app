import { createClient } from "@supabase/supabase-js";

import {
  TABLES,
  findBackupFile,
  hashRows,
  projectHost,
  readAllRows,
  readBackup,
  validatePayload,
} from "./lib/backup-utils.mjs";

if (process.env.RESTORE_CONFIRM !== "RESTORE_TO_EMPTY_NON_PRODUCTION") {
  throw new Error("Set RESTORE_CONFIRM=RESTORE_TO_EMPTY_NON_PRODUCTION to acknowledge this restoration test.");
}

const targetUrl = process.env.RESTORE_TARGET_SUPABASE_URL?.trim();
const targetKey = process.env.RESTORE_TARGET_SERVICE_ROLE_KEY?.trim();
if (!targetUrl || !targetKey) {
  throw new Error("RESTORE_TARGET_SUPABASE_URL and RESTORE_TARGET_SERVICE_ROLE_KEY are required.");
}

const filePath = findBackupFile(process.argv[2]);
const { absolutePath, payload } = readBackup(filePath);
const expectedSummary = validatePayload(payload);
if (projectHost(targetUrl) === payload.manifest.sourceSupabaseHost) {
  throw new Error("Refusing to restore into the source/production Supabase project.");
}

const client = createClient(targetUrl, targetKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const alreadyRestored = new Set();

for (const { name, key } of TABLES) {
  const { count, error } = await client.from(name).select("*", { count: "exact", head: true });
  if (error) throw new Error(`RESTORE_TARGET_CHECK_FAILED:${name}:${error.code || "unknown"}`);
  if ((count ?? 0) === 0) continue;

  // A previous restore attempt may have completed some tables before a later
  // table failed. Resume only when the existing table exactly matches the
  // encrypted backup; otherwise refuse to overwrite anything.
  const existingRows = await readAllRows(client, name, key);
  if (hashRows(existingRows, key) !== payload.manifest.tables[name].sha256) {
    throw new Error(`Refusing to restore: target table ${name} is not empty and does not match the backup.`);
  }
  alreadyRestored.add(name);
}

for (const { name } of TABLES) {
  if (alreadyRestored.has(name)) continue;
  const rows = payload.tables[name];
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    if (!batch.length) continue;
    // The target was verified empty above, so a plain insert is both safer and
    // avoids adding an unnecessary on_conflict query parameter to the request.
    const { error } = await client.from(name).insert(batch);
    if (error) {
      throw new Error(
        `RESTORE_WRITE_FAILED:${name}:${error.code || "unknown"}:${error.message || "unknown"}`
      );
    }
  }
}

for (const { name, key } of TABLES) {
  const restoredRows = await readAllRows(client, name, key);
  if (hashRows(restoredRows, key) !== payload.manifest.tables[name].sha256) {
    throw new Error(`RESTORE_VERIFICATION_FAILED:${name}`);
  }
}

console.log(
  JSON.stringify(
    {
      status: "restored-and-verified",
      backup: absolutePath,
      target: projectHost(targetUrl),
      summary: expectedSummary,
    },
    null,
    2
  )
);
