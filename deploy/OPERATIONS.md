# Production operations

## Database backups

`hr-backup.timer` runs daily at 02:15 Asia/Tashkent (up to five minutes jitter).
The host runs `~/hr-recruiter/ops/backup.mjs`, independently of the application
container. It uses the existing protected `.env` for R2 credentials.

Each PostgreSQL custom-format dump is encrypted with AES-256-GCM, uploaded to
`database-backups/hr-recruiter/` in R2, downloaded and authenticated, then restored
into a disposable PostgreSQL container. That container has no network or production
volume, and is removed afterward. Its temporary database is limited to 256 MB;
increase this limit as the database grows. Dump buffering has a 256 MB limit.
Only a successful upload AND restore writes `ops-state/backup.json`.

Retention: 30 days in this R2 prefix and seven days for local encrypted daily
backups. Cleanup runs only after a verified new backup. Pre-deployment backups
are retained separately. This does not change the bucket's other objects or lifecycle.

The 32-byte encryption key is `~/hr-recruiter/backup-encryption.key`, mode 600.
An offline copy is in the operator's ignored `.local/deploy/backup-encryption.key`.
Keep that copy in a password manager or other protected independent storage.
Never put it in Git or the R2 backup bucket. Without it the backup cannot be restored.

To recover: download a `.dump.enc`, decrypt using `decrypt()` in `ops/crypto.mjs`
with the saved key, then use PostgreSQL 17 `pg_restore` against a new empty database.
The backup job performs this procedure daily in isolation. Production restoration
requires explicit selection of a backup and a maintenance window; it is not automatic.

Inspect:
```sh
systemctl status hr-backup.timer hr-backup.service
journalctl -u hr-backup.service -n 30
cat ~/hr-recruiter/ops-state/backup.json
sudo systemctl start hr-backup.service
```

## External monitoring

GitHub Actions `Production monitoring` checks HTTPS homepage/API, SSH access,
container status, disk usage (85%), failed backup jobs and backup freshness (30h).
It is scheduled at minutes 7, 22, 37, 52; GitHub scheduling may be delayed, so this
is not a guaranteed 15-minute SLA. Public repositories can have inactive schedules
disabled by GitHub; keep Actions enabled and review workflow runs periodically.

Mail goes to `dilshodbektohirov40@gmail.com`, using `MONITOR_SMTP_CONFIG` in GitHub
Secrets. It contains SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD,
SMTP_FROM. Update it if SMTP credentials change. Secrets never enter source or logs.
It sends on issue changes, recovery, and every six hours for an unchanged issue.
Actions cache retains only the issue list/timestamp; cache expiry may repeat an alert.
If SMTP itself fails, the Actions run fails; check GitHub notification settings as
a secondary signal. No external monitor can report an outage of its own provider.

## Ops Agent ports

`hr-monitoring-firewall.service` installs the dedicated `inet hr_monitoring` nftables
table at boot. It drops non-loopback TCP traffic to 20201/20202 for IPv4 and IPv6.
It does not flush existing firewall/Docker rules or change SSH/HTTP/HTTPS access.
Metrics remain reachable from localhost for the agent. Inspect with:
`sudo nft list table inet hr_monitoring`.

## Updating operational scripts

Scripts/dependencies are installed separately in `~/hr-recruiter/ops` so backups
can run when the backend is stopped. To update, copy `deploy/ops/*` excluding
node_modules, then run `npm ci --omit=dev` there and run its tests. Systemd units
live in `/etc/systemd/system`; use daemon-reload after changing them.
