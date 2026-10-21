#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 server for CI/CD deploys.
# Run as root on the NEW server, reading it first:
#
#   CI_PUBKEY='ssh-ed25519 AAAA... github-actions-deploy' \
#   DOMAIN=hrdai.uz \            # optional: enables the nginx site and HTTPS
#   bash bootstrap-server.sh
#
# What it does (idempotent, nothing is deleted):
#   1. installs Docker Engine + Compose plugin if missing
#   2. creates the unprivileged deploy user (default: hrdeploy) in the docker group
#      and authorises the CI public key for that user only
#   3. creates ~/hr-recruiter with a private .env containing freshly generated secrets
#   4. optionally adds an nginx site for DOMAIN that proxies to the frontend container
#
# What it does NOT do: change the firewall, other nginx sites, SSH settings or
# any existing application. It stops if the app ports are already in use.
set -euo pipefail

DEPLOY_USER=${DEPLOY_USER:-hrdeploy}
DOMAIN=${DOMAIN:-}
FRONTEND_PORT=${FRONTEND_PORT:-8080}
BACKEND_PORT=${BACKEND_PORT:-3000}
POSTGRES_PORT=${POSTGRES_PORT:-5433}
REDIS_PORT=${REDIS_PORT:-6379}
CI_PUBKEY=${CI_PUBKEY:?Set CI_PUBKEY to the GitHub Actions deploy PUBLIC key (one line)}

[[ $EUID -eq 0 ]] || { echo 'Run as root.'; exit 1; }
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Invalid DEPLOY_USER'; exit 1; }
[[ "$CI_PUBKEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo 'CI_PUBKEY must be an ssh-ed25519 public key'; exit 1; }
[[ -z "$DOMAIN" || "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'Invalid DOMAIN'; exit 1; }

echo '== 0. Preflight: ports must be free for the app containers'
busy=0
for port in "$FRONTEND_PORT" "$BACKEND_PORT" "$POSTGRES_PORT" "$REDIS_PORT"; do
  if ss -ltn "( sport = :$port )" | grep -q LISTEN; then
    echo "  port $port is already in use"; busy=1
  fi
done
if (( busy )); then
  echo 'Pick free ports, e.g. FRONTEND_PORT=8081 BACKEND_PORT=3300 POSTGRES_PORT=6433 REDIS_PORT=6381, and run again.'
  exit 1
fi
echo "  free: $FRONTEND_PORT $BACKEND_PORT $POSTGRES_PORT $REDIS_PORT"
echo '  current listeners (for your information):'
ss -ltnp | awk 'NR==1 || /:(22|80|443) /'

echo '== 1. Docker'
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker
docker --version; docker compose version

echo "== 2. Deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
touch "$home/.ssh/authorized_keys"
if ! grep -qF "$CI_PUBKEY" "$home/.ssh/authorized_keys"; then
  echo "$CI_PUBKEY" >> "$home/.ssh/authorized_keys"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$home/.ssh/authorized_keys"; chmod 600 "$home/.ssh/authorized_keys"

echo '== 3. Application directory and .env'
base="$home/hr-recruiter"
for d in releases incoming backups; do install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$base/$d"; done
if [[ -s "$base/.env" ]]; then
  echo "  $base/.env already exists, left untouched"
else
  origin="http://localhost:$FRONTEND_PORT"
  [[ -n "$DOMAIN" ]] && origin="https://$DOMAIN"
  umask 077
  cat > "$base/.env" <<ENV
NODE_ENV=production
PORT=3000
FRONTEND_ORIGIN=$origin
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
POSTGRES_PORT=$POSTGRES_PORT
REDIS_PORT=$REDIS_PORT
POSTGRES_USER=recruiter
POSTGRES_DB=recruiter
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
STORAGE_DRIVER=local
# CVs are stored on this server (Docker volume uploads_data). R2_* below are only needed to copy old files.
# Fill these in by hand (never commit them): AI, Telegram, SMTP, Google sign-in.
GOOGLE_CLIENT_ID=
GEMINI_API_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 24)
TELEGRAM_WEBHOOK_URL=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
ENV
  chown "$DEPLOY_USER:$DEPLOY_USER" "$base/.env"; chmod 600 "$base/.env"
  echo "  created $base/.env (mode 600) with generated secrets; fill in the empty keys"
fi

if [[ -n "$DOMAIN" ]]; then
  echo "== 4. nginx site for $DOMAIN"
  command -v nginx >/dev/null || { apt-get install -y nginx; }
  site=/etc/nginx/sites-available/$DOMAIN
  if [[ -e "$site" ]]; then
    echo "  $site exists, left untouched"
  else
    install -d /var/www/letsencrypt
    cat > "$site" <<NGINX
# HTTP only for now; run: certbot --nginx -d $DOMAIN  (after the DNS A record points here)
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    client_max_body_size 6m;
    location / {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 130s;
    }
}
NGINX
    ln -sfn "$site" "/etc/nginx/sites-enabled/$DOMAIN"
    nginx -t && systemctl reload nginx
  fi
  echo "  Next: point the DNS A record of $DOMAIN to this server, then: apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d $DOMAIN"
fi

echo
echo 'Done. Remaining by hand:'
echo "  1. fill the empty keys in $base/.env"
echo '  2. set the GitHub secrets DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS'
echo '  3. push to main (or run the Verify workflow) to deploy'
