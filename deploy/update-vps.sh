#!/usr/bin/env bash
set -euo pipefail
umask 077

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${HOME}/hr-recruiter"
STATE_FILE="${BASE}/deployed-sha"
NODE_BIN="${BASE}/runtime/node/bin"

export PATH="${NODE_BIN}:${PATH}"
export GIT_TERMINAL_PROMPT=0
cd "${SOURCE_DIR}"
git fetch --quiet origin main

target="$(git rev-parse origin/main)"
deployed=""
if [[ -f "${STATE_FILE}" ]]; then
  deployed="$(cat "${STATE_FILE}")"
fi
if [[ "${target}" == "${deployed}" ]]; then
  exit 0
fi

release="${BASE}/releases/git-${target}"
previous="$(readlink -f "${BASE}/current" || true)"
mkdir -p "${release}"
git archive "${target}" | tar -x -C "${release}"
ln -sfn "${BASE}/.env" "${release}/.env"

cd "${release}"
npm ci --no-audit --no-fund
npm run build -w apps/backend
npm run build -w apps/frontend
npm run db:migrate
npm prune --omit=dev --workspace=@recruiter/backend --include-workspace-root --no-audit --no-fund

ln -sfn "${release}" "${BASE}/current"
if ! systemctl --user restart hr-recruiter-api.service hr-recruiter-web.service; then
  if [[ -n "${previous}" ]]; then
    ln -sfn "${previous}" "${BASE}/current"
    systemctl --user restart hr-recruiter-api.service hr-recruiter-web.service || true
  fi
  exit 1
fi

healthy=false
for attempt in $(seq 1 40); do
  if curl --silent --fail http://127.0.0.1:3000/api/health >/dev/null &&
     curl --silent --fail http://127.0.0.1:8081/ >/dev/null; then
    healthy=true
    break
  fi
  sleep 3
done
if [[ "${healthy}" != true ]]; then
  if [[ -n "${previous}" ]]; then
    ln -sfn "${previous}" "${BASE}/current"
    systemctl --user restart hr-recruiter-api.service hr-recruiter-web.service || true
  fi
  exit 1
fi

printf '%s\n' "${target}" > "${STATE_FILE}.tmp"
mv "${STATE_FILE}.tmp" "${STATE_FILE}"
echo "Deployed ${target}"
