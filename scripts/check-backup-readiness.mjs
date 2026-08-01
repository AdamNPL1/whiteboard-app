import { findBackupFile, readBackup, validatePayload } from "./lib/backup-utils.mjs";

const maxAgeHours = Number(process.env.BACKUP_MAX_AGE_HOURS || "26");
if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
  throw new Error("BACKUP_MAX_AGE_HOURS must be a positive number.");
}

const filePath = findBackupFile(process.argv[2]);
const { absolutePath, payload } = readBackup(filePath);
const summary = validatePayload(payload);
const createdAt = Date.parse(payload.manifest.createdAt);
if (!Number.isFinite(createdAt)) throw new Error("Backup createdAt is invalid.");

const ageHours = (Date.now() - createdAt) / 3_600_000;
if (ageHours < 0) throw new Error("Backup creation time is in the future.");
if (ageHours > maxAgeHours) {
  throw new Error(
    `Latest backup is ${ageHours.toFixed(1)} hours old; maximum allowed age is ${maxAgeHours} hours.`
  );
}

console.log(
  JSON.stringify(
    {
      status: "fresh-and-valid",
      file: absolutePath,
      ageHours: Number(ageHours.toFixed(2)),
      maximumAgeHours: maxAgeHours,
      summary,
      warning:
        "This is an application-data backup. Supabase Auth users and Storage objects require Supabase managed/full-database recovery.",
    },
    null,
    2
  )
);
