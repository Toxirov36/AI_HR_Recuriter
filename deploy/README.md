# Google Cloud deployment

- VM: `hr-recuriter`, Debian 13, `southamerica-west1-b`.
- URL: `https://34.176.204.70`.
- SSH user: `dilshodbektohirov40`.
- Application directory: `/home/dilshodbektohirov40/hr-recruiter`.
- PostgreSQL starts with an empty database. Local accounts are not copied.
- Production `.env` has separate database, Redis and JWT secrets, with mode `600`.
  SMTP and Gemini configuration were copied privately. Never commit this file.
- R2 is enabled with the separate `hr-recruiter-production` bucket. New CV files
  are stored in R2 and downloaded through authenticated API routes. The S3 endpoint
  is the account URL without the bucket suffix; `R2_BUCKET_NAME` selects the bucket.
  Upload, download and deletion were verified from the server using a temporary
  test file, which was removed afterward. Telegram is not configured yet.

## Start and update

Run on the server from the application directory:

```sh
docker compose -f compose.yaml -f deploy/compose.production.yaml --profile app build
docker compose -f compose.yaml -f deploy/compose.production.yaml --profile app up -d --no-build
docker compose --profile app ps
```

Backend startup applies versioned database migrations. Migration
`202609260004_complete_production_schema` includes retention, MFA, audit and
Telegram schema changes that had previously existed only in development.

Container restart policies start the services after a reboot. Production logging
is limited to three 10 MB files per container. PostgreSQL and Redis use persistent
Docker volumes. Do not use `docker compose down -v` on a database you want to keep.

## HTTPS

Host Nginx uses `nginx-ip.conf`. Only ports 80 and 443 need public web access;
database, Redis, API and frontend container ports are bound to loopback.
Nginx forwards API requests directly to the backend and applies request limits
using the actual client address.

Certbot is installed in `/opt/certbot`. The IP certificate uses Let's Encrypt's
short-lived profile. `hr-certbot-renew.timer` checks twice daily and reloads Nginx
after renewal. Check it with:

```sh
systemctl list-timers hr-certbot-renew.timer
sudo /opt/certbot/bin/certbot renew --dry-run --run-deploy-hooks
```

The external IP was ephemeral when provisioned. Reserve the current IP as static
in Google Cloud before stopping/recreating the VM. If the IP changes, update
`FRONTEND_ORIGIN`, the Nginx configuration and the HTTPS certificate together.

## First administrator

Register your own account on the website, then grant platform privileges to that
specific account from the server:

```sh
docker compose exec -T backend npm run platform:grant -w apps/backend -- YOUR_EMAIL
```

Registration only grants company administrator access. Platform access must be
granted explicitly. Refresh the website after the grant.

## Backups and disk space

The VM has a 10 GB boot disk. Check `df -h /` and `docker system df` before rebuilding
or uploading many CVs. Keep database backups outside this VM. To create a logical
backup without putting the database password on the command line:

```sh
umask 077
docker compose exec -T postgres pg_dump -U recruiter -d recruiter -Fc > recruiter.dump
```

Copy the dump to your backup destination. No application backup schedule has been
configured by this deployment.
