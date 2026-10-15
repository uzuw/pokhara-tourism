#!/usr/bin/env bash
# Boots the API in production mode on a throwaway database, runs the black-box
# security audit against it, then tears it down.
#
#   bash scripts/audit_local.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${AUDIT_PORT:-4489}"
TMP="$(mktemp -d)"
LOG="$TMP/api.log"

cleanup() {
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

cd "$ROOT"
SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"

NODE_ENV=production JWT_SECRET="$SECRET" PORT="$PORT" \
  TOURISM_DB_FILE="$TMP/audit.db" TRUST_PROXY=false \
  node server/index.js >"$LOG" 2>&1 &
SRV=$!

for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.25
done

if ! curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "API failed to start:"; cat "$LOG"; exit 2
fi

node scripts/security_audit.mjs --url "http://127.0.0.1:$PORT"
CODE=$?
echo "(server log: $LOG — kept until this script exits)"
exit "$CODE"
