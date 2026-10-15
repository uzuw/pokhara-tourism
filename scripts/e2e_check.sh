#!/usr/bin/env bash
# End-to-end check of the FULL stack: API + built Next app + the dev/prod proxy
# between them (same-origin /api and /assets) + a real user journey.
#
#   npm run build && bash scripts/e2e_check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${E2E_API_PORT:-4000}"
WEB_PORT="${E2E_WEB_PORT:-3000}"
TMP="$(mktemp -d)"
PASS=0; FAIL=0

ok()  { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
expect() { # name expected actual
  if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 — expected $2, got $3"; fi
}
contains() { # name needle url  (no -f: a 404 body still needs checking)
  if curl -s "$3" | grep -q "$2"; then ok "$1"; else bad "$1 — '$2' not found at $3"; fi
}

cleanup() {
  [ -n "${API:-}" ] && kill "$API" 2>/dev/null
  [ -n "${WEB:-}" ] && kill "$WEB" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

cd "$ROOT"
SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"

echo "== starting API on :$API_PORT and Next on :$WEB_PORT =="
NODE_ENV=production JWT_SECRET="$SECRET" PORT="$API_PORT" TRUST_PROXY=false \
  TOURISM_DB_FILE="$TMP/e2e.db" node server/index.js >"$TMP/api.log" 2>&1 &
API=$!
for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 && break; sleep 0.25; done
curl -fsS "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1 || { echo "API failed:"; cat "$TMP/api.log"; exit 2; }
ok "API healthy on :$API_PORT"

( cd frontend && NODE_ENV=production PORT="$WEB_PORT" npm run start >"$TMP/web.log" 2>&1 ) &
WEB=$!
for _ in $(seq 1 80); do curl -fsS "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 && break; sleep 0.25; done
curl -fsS "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 || { echo "Next failed:"; tail -20 "$TMP/web.log"; exit 2; }
ok "Next server healthy on :$WEB_PORT"

echo "== pages =="
for p in / /destinations /map /login /register "/destination/phewa-lake" /robots.txt /sitemap.xml; do
  expect "GET $p" "200" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT$p")"
done
contains "home renders the brand" "Hamro Pokhara" "http://127.0.0.1:$WEB_PORT/"

echo "== 404 handling =="
expect "unknown route -> 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/definitely-not-a-page")"
contains "404 page body is ours" "trail leads nowhere" "http://127.0.0.1:$WEB_PORT/definitely-not-a-page"

echo "== same-origin proxy (what the browser actually uses) =="
expect "GET /api/health via Next" "200" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/api/health")"
contains "catalogue JSON via Next" '"destinations"' "http://127.0.0.1:$WEB_PORT/api/destinations"
expect "GET /assets image via Next" "200" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/assets/images/phewa-lake.jpg")"
expect "image content-type" "image/jpeg" "$(curl -s -o /dev/null -w '%{content_type}' "http://127.0.0.1:$WEB_PORT/assets/images/phewa-lake.jpg")"

echo "== user journey (scripts/smoke_test.js) =="
if SMOKE_BASE="http://127.0.0.1:$API_PORT" node scripts/smoke_test.js >"$TMP/smoke.log" 2>&1; then
  ok "register -> rate -> comment -> profile"
  tail -3 "$TMP/smoke.log" | sed 's/^/       /'
else
  bad "user journey failed:"; tail -8 "$TMP/smoke.log" | sed 's/^/       /'
fi

echo
echo "e2e_check: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
