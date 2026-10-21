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

Production was moved to `37.60.247.120`, account `hrdeploy`, root directory
`/home/hrdeploy/hr-recruiter`. The host Node binary is `/usr/local/bin/node`.
Existing applications share the server, so HR has separate loopback ports 3300,
8081, 6433 and 6381. The domain remains `hr-recruiter.ddns.net`.

## Hosting firewall and container internet access

The aaPanel server has `inet profile_hosting` with a forward policy of drop.
Docker's own forwarding rules do not override that policy. HR therefore needs
`hr-egress-firewall.service` and its timer. Install `hr-egress-firewall.sh` as
`/usr/local/sbin/hr-egress-firewall`, install the service/timer in
`/etc/systemd/system`, then daemon-reload, enable/start the timer and start the
service. The script discovers the HR bridge/subnet and default WAN interface.
It manages only `hr_recruiter_egress` and its jump from the panel's forward chain.
It allows internal HR traffic, outbound DNS (TCP/UDP 53), HTTPS (443), SMTP
(465/587), and established replies. The timer restores it every minute after
reboots, Docker network recreation or panel firewall resets.

Verify Telegram from inside `ai-hr-recruiter-backend-1`, not just on the host.
A working host `getMe` does not prove Docker DNS/HTTPS access. Telegram identity
is verified using the protected TELEGRAM_BOT_TOKEN in production `.env`;
the bot must resolve to `my_Ai_hr_recruiter_bot` for this installation.

## CV storage on the server

`STORAGE_DRIVER=local` keeps uploaded CVs on the server instead of Cloudflare R2.
Files live in the Docker volume `uploads_data` (container path `/app/uploads`, mode 600,
served only through the authenticated download API). Object keys are the same as in R2
(`companies/<id>/candidates/<id>/resumes/<uuid>.<ext>`), so the database needs no change.

- `auto` (default) uses R2 when all five `R2_*` variables are set, otherwise CVs stay in the database.
- `r2` forces R2 and fails at startup if it is not configured.

Move existing CVs from R2 to the server (safe to repeat; existing files are skipped):

```sh
cd ~/hr-recruiter/current
export DEPLOY_SHA=$(cat ~/hr-recruiter/deployed-sha)
compose="docker compose -p ai-hr-recruiter -f compose.yaml -f deploy/compose.production.yaml -f deploy/compose.ci.yaml --profile app"
$compose run --rm backend npm run storage:copy-from-r2 -w apps/backend -- --dry-run   # count first
$compose run --rm backend npm run storage:copy-from-r2 -w apps/backend               # copy
```

The `R2_*` variables must still be in `.env` for the copy. Afterwards set `STORAGE_DRIVER=local`
and redeploy; R2 can be left unused.

The daily backup job covers the database only. Back up the CV volume too (it is not in R2 any more):

```sh
docker run --rm -v ai-hr-recruiter_uploads_data:/data:ro -v ~/hr-recruiter/backups:/out alpine \
  tar czf /out/uploads-$(date -u +%F).tgz -C /data .
```

Keep at least one copy off the server. Disk usage: `docker system df -v | grep uploads_data`.
