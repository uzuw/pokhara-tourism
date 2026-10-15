#!/usr/bin/env bash
# Production boot check for the API: proves the process refuses an unsafe
# configuration and comes up healthy (and shuts down gracefully) with a good one.
#
#   bash scripts/deploy_check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${DEPLOY_CHECK_PORT:-4488}"
TMP="$(mktemp -d)"
DB="$TMP/tourism.db"
LOG="$TMP/api.log"
PASS=0
FAIL=0

ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 — expected $3, got $2"; fi; }

cleanup() {
  [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

cd "$ROOT"

echo "== 1. refuses to boot in production without a real JWT_SECRET =="
# cwd is a temp dir so dotenv does not pick up the repo .env
( cd "$TMP" && NODE_ENV=production JWT_SECRET=pokhara-tourism-dev-secret-change-me \
    PORT="$PORT" TOURISM_DB_FILE="$DB" node "$ROOT/server/index.js" ) >"$LOG" 2>&1
CODE=$?
if [ "$CODE" -ne 0 ] && grep -q 'JWT_SECRET' "$LOG"; then
  ok "boot aborted with an actionable message"
else
  bad "boot did NOT abort (exit=$CODE) — grep the log: $LOG"
fi

echo "== 2. boots with a proper secret =="
SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
NODE_ENV=production JWT_SECRET="$SECRET" PORT="$PORT" TOURISM_DB_FILE="$DB" \
  TRUST_PROXY=false CATALOGUE_MAX_AGE=60 node server/index.js >>"$LOG" 2>&1 &
PID=$!

for _ in $(seq 1 40); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.25
done

HEALTH="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health")"
check "GET /api/health" "$HEALTH" "200"

echo "== 3. security headers on a live production process =="
HDRS="$(curl -sD - -o /dev/null "http://127.0.0.1:$PORT/api/health")"
echo "$HDRS" | grep -qi 'x-powered-by' && bad "x-powered-by is exposed" || ok "x-powered-by removed"
echo "$HDRS" | grep -qi 'x-content-type-options: nosniff' && ok "nosniff present" || bad "nosniff missing"
echo "$HDRS" | grep -qi 'content-security-policy' && ok "CSP present" || bad "CSP missing"
echo "$HDRS" | grep -qi 'strict-transport-security' && ok "HSTS present" || bad "HSTS missing"

echo "== 4. API surface =="
LIST="$(curl -s "http://127.0.0.1:$PORT/api/destinations")"
if echo "$LIST" | grep -q '"destinations"'; then ok "catalogue served and seeded"; else bad "catalogue broken: $LIST"; fi
NOTFOUND_CT="$(curl -s -o /dev/null -w '%{content_type}' "http://127.0.0.1:$PORT/api/nope")"
case "$NOTFOUND_CT" in application/json*) ok "unknown API route returns JSON";; *) bad "404 content-type: $NOTFOUND_CT";; esac
BADSECRET_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/auth/register" \
  -H 'content-type: application/json' -d '{"identifier":{"$gt":""}}')"
if [ "$BADSECRET_CODE" -lt 500 ]; then ok "type-confusion payload handled ($BADSECRET_CODE)"; else bad "payload produced $BADSECRET_CODE"; fi

echo "== 5. traversal + auth gates =="
TRAV="$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "http://127.0.0.1:$PORT/assets/images/../../../.env")"
if [ "$TRAV" = "403" ] || [ "$TRAV" = "404" ] || [ "$TRAV" = "400" ]; then ok "path traversal blocked ($TRAV)"; else bad "traversal returned $TRAV"; fi
ME="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/users/me")"
check "unauthenticated /api/users/me" "$ME" "401"

echo "== 6. graceful shutdown on SIGTERM =="
kill -TERM "$PID"
for _ in $(seq 1 40); do kill -0 "$PID" 2>/dev/null || break; sleep 0.25; done
if kill -0 "$PID" 2>/dev/null; then bad "process still alive 10s after SIGTERM"; kill -9 "$PID"; else ok "exited cleanly"; fi
wait "$PID" 2>/dev/null
PID=""

echo
echo "deploy_check: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
