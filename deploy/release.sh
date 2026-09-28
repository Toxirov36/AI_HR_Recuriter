#!/usr/bin/env bash
set -euo pipefail
umask 077

revision=${1:?Commit SHA required}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit SHA'; exit 1; }
base="$HOME/hr-recruiter"
test -s "$base/.env"
mkdir -p "$base/releases" "$base/backups"
exec 9>"$base/.deploy.lock"
flock -w 1200 9

source_dir="$base/releases/$revision"
mkdir -p "$source_dir"
entries=$(tar -tzf "$base/incoming/$revision.tar.gz")
if grep -Eq '(^|/)\.env$|(^|/)\.\.(/|$)|^/' <<< "$entries"; then
  echo 'Archive contains a protected or unsafe path'
  exit 1
fi
# Git archive files must stay readable by the non-root user inside the image.
# The surrounding umask keeps backups private; do not apply it to source modes.
tar -xzf "$base/incoming/$revision.tar.gz" -C "$source_dir" --no-same-owner --same-permissions
if [[ -L "$source_dir/.env" && "$(readlink "$source_dir/.env")" == "$base/.env" ]]; then
  : # Allow retrying the same release.
elif [[ -e "$source_dir/.env" || -L "$source_dir/.env" ]]; then
  echo 'Release must not contain .env'
  exit 1
else
  ln -s "$base/.env" "$source_dir/.env"
fi
cd "$source_dir"
export DEPLOY_SHA="$revision"
compose=(docker compose -p ai-hr-recruiter -f compose.yaml -f deploy/compose.production.yaml -f deploy/compose.ci.yaml --profile app)
"${compose[@]}" config --quiet
available=$(df -Pk "$base" | awk 'NR==2 {print $4}')
if (( available < 1048576 )); then
  echo 'Less than 1 GiB free. Expand disk or review Docker build cache before deploying.'
  exit 1
fi
"${compose[@]}" build backend frontend
"${compose[@]}" run --rm --no-deps --entrypoint node backend -e \
  "require('fs').accessSync('/app/package.json', 4); require('fs').accessSync('/app/apps/backend/dist/main.js', 4)" < /dev/null

# Back up before startup applies migrations. A schema rollback is never automatic.
backup="$base/backups/pre-$revision-$(date -u +%Y%m%dT%H%M%SZ).dump"
"${compose[@]}" exec -T postgres pg_dump -U recruiter -d recruiter -Fc < /dev/null > "$backup"
test -s "$backup"
"${compose[@]}" up -d --no-build

healthy=false
for attempt in {1..24}; do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health >/dev/null &&
     curl --fail --silent --max-time 5 http://127.0.0.1:8080/ >/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done
if [[ "$healthy" != true ]]; then
  echo "Deployment health check failed. Previous release and database backup are retained: $backup"
  exit 1
fi
for service in backend frontend; do
  container=$("${compose[@]}" ps -q "$service")
  actual=$(docker inspect --format '{{.Config.Image}}' "$container")
  [[ "$actual" == "ai-hr-recruiter-$service:$revision" ]] || { echo 'Running image does not match release'; exit 1; }
done
ln -sfn "$source_dir" "$base/current"
printf '%s\n' "$revision" > "$base/deployed-sha"
rm -f "$base/incoming/$revision.tar.gz"
rm -f "$base/incoming/$revision.sh"
echo "Deployed $revision successfully."
