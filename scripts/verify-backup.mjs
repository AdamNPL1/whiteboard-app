import { findBackupFile, readBackup, validatePayload } from "./lib/backup-utils.mjs";

const filePath = findBackupFile(process.argv[2]);
const { absolutePath, payload } = readBackup(filePath);
const summary = validatePayload(payload);

console.log(
  JSON.stringify(
    {
      status: "verified",
      file: absolutePath,
      createdAt: payload.manifest.createdAt,
      summary,
    },
    null,
    2
  )
);
