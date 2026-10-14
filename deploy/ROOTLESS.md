# Rootless deployment on the new server

The `oftobai` account can run the application, PostgreSQL, Redis, and Nginx
without sudo. Keep all files under `~/hr-recruiter`. The preparation scripts
expect Ubuntu 22.04, a private `~/hr-recruiter/.env`, the Ubuntu 14 PostgreSQL
and Redis package binaries extracted into `~/hr-recruiter/runtime/apt-root`,
and Node 22 at `~/hr-recruiter/runtime/node`.

1. Clone the repository into `~/hr-recruiter/releases/<release>`, link
   `~/hr-recruiter/current` to it, and link the private `.env` into the release.
2. Run `npm ci`, `npm run build`, and `npm run db:migrate -w apps/backend`
   with the local Node 22 binary on `PATH`.
3. Run `python3 deploy/rootless-prepare.py` and
   `python3 deploy/rootless-app.py`.
4. Verify `http://127.0.0.1:8081/`, `/api/health`, and
   `/api/auth/google/config` on the server.

The backend listens only on `127.0.0.1:3000`; Nginx listens only on
`127.0.0.1:8081`. User systemd services and lingering keep them running after
SSH logout. Existing apps on ports 8080, 8090, and 8123 are unaffected.

**Public HTTPS still needs a privileged reverse proxy or a hosting panel
mapping 443 to `127.0.0.1:8081`, plus a valid certificate.** Changing the
DDNS A record alone cannot expose this rootless deployment. Do not move the
Telegram webhook or the DDNS record until public HTTPS is verified.
