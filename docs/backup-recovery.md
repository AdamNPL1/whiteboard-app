# Scriboo backup and recovery runbook

## What is protected

The daily GitHub Actions job creates an AES-256-GCM encrypted application-data
backup and retains the off-device artifact for 90 days. The backup includes
profiles, boards, board history, active-board state, sharing relationships,
private notes, push subscriptions, notification preferences, and the Stripe
webhook idempotency ledger.

Short-lived call state, signaling, rate-limit buckets, device ownership, and
abuse-event logs are intentionally excluded. Supabase Auth users and any
Supabase Storage objects are not available through the application backup API;
they require Supabase managed database backups or point-in-time recovery.

## One-time GitHub setup

Add these repository Actions secrets:

- `BACKUP_SUPABASE_URL`: the production Supabase project URL
- `BACKUP_SUPABASE_SERVICE_ROLE_KEY`: the production service-role key
- `BACKUP_ENCRYPTION_KEY`: 32 cryptographically random bytes encoded as base64

Generate the encryption key locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Keep a second copy of the encryption key in a trusted password manager. A
backup cannot be recovered if this key is lost. Never commit it or place it in
the same downloaded folder as a backup.

Enable Supabase managed backups for the production project. Use point-in-time
recovery if the selected Supabase plan provides it; the encrypted application
backup complements rather than replaces the full database backup.

## Routine checks

The `Daily encrypted Scriboo backup` workflow must finish successfully every
day. Investigate a failed or missing run before the backup is 26 hours old.
Download and retain a monthly encrypted artifact in a second restricted
location so GitHub is not the only copy.

Never print decrypted payloads in CI logs. Periodically rotate the service-role
key, but retain old backup encryption keys for as long as backups encrypted
with them are retained.

## Local verification

Create `.env.backup.local` from `.env.backup.example`, then run:

```sh
npm run backup:create
npm run backup:verify
npm run backup:check
```

These commands validate encryption, authenticated decryption, table counts,
checksums, relationships, and backup freshness.

## Restore drill

Never test restoration against production. Create a separate empty Supabase
project, apply the current schema SQL files, and configure `.env.restore.local`
from `.env.restore.example`. Then run:

```sh
npm run backup:restore:test
```

The restore tool refuses to target the source project or overwrite unrelated
rows. It re-reads and hashes every restored table before declaring success.
Run a restore drill after schema changes and at least once per quarter.

For an actual incident, first preserve the damaged production project, decide
whether Supabase point-in-time recovery or the application backup gives the
correct recovery point, restore into a separate project, verify data and login
behavior, and only then switch production configuration.
