#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${HOME}/hr-recruiter"
STATE_FILE="${DEPLOY_DIR}/deployed.sha"

cd "${APP_DIR}"
export GIT_TERMINAL_PROMPT=0
git fetch --quiet origin main

target="$(git rev-parse origin/main)"
deployed=""
if [[ -f "${STATE_FILE}" ]]; then
  deployed="$(cat "${STATE_FILE}")"
fi

if [[ "${target}" == "${deployed}" ]]; then
  exit 0
fi

git reset --hard "${target}"
docker compose -f compose.yaml -f deploy/compose.production.yaml --profile app build
docker compose -f compose.yaml -f deploy/compose.production.yaml --profile app up -d --no-build

for attempt in $(seq 1 40); do
  if curl --silent --fail http://127.0.0.1:3000/api/health >/dev/null; then
    printf '%s\n' "${target}" > "${STATE_FILE}.tmp"
    mv "${STATE_FILE}.tmp" "${STATE_FILE}"
    exit 0
  fi
  sleep 3
done

docker compose -f compose.yaml -f deploy/compose.production.yaml --profile app ps
exit 1
