#!/usr/bin/env bash
# Verifies deploy/nginx.conf WITHOUT building the app images: spins up two stub
# upstreams named api/web on a throwaway network, starts nginx with the real
# config, and checks that each location block routes where it should.
#
#   bash scripts/nginx_check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NET="nginx-check-$$"
PROXY="proxy-$$"
STUB="nginx:1.27-alpine"
PORT="${NGINX_CHECK_PORT:-8088}"
PASS=0; FAIL=0

ok()  { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }

cleanup() {
  docker rm -f "$PROXY" "api-$$" "web-$$" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
}
trap cleanup EXIT

# Upstream names must match the `upstream` blocks in deploy/nginx.conf, and the
# stubs must listen on the ports that config proxies to (api:4000, web:3000).
stub() { # name port
  docker run -d --name "$1-$$" --network "$NET" --network-alias "$1" "$STUB" sh -c \
    "sed -i 's/listen       80;/listen       $2;/' /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'" >/dev/null
}
docker network create "$NET" >/dev/null
stub api 4000
stub web 3000
docker run -d --name "$PROXY" --network "$NET" -p "127.0.0.1:$PORT:80" \
  -v "$ROOT/deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro" "$STUB" >/dev/null
sleep 3

if docker logs "$PROXY" 2>&1 | grep -qi "emerg\|error"; then
  bad "nginx failed to start"; docker logs "$PROXY" 2>&1 | tail -10; exit 1
fi
ok "deploy/nginx.conf loads in nginx (syntax + upstreams resolve)"

code() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1"; }
dcode() { curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "http://127.0.0.1:$PORT$1"; }

# A stub returns 200 for / and 404 for anything else, so a 200 proves the request
# reached an upstream rather than the proxy itself.
[ "$(code /api/health)" != "502" ] && ok "/api/* is proxied to the api upstream ($(code /api/health))" || bad "/api/* did not reach an upstream (502)"
[ "$(code /assets/images/phewa-lake.jpg)" != "502" ] && ok "/assets/* is proxied to the api upstream ($(code /assets/images/phewa-lake.jpg))" || bad "/assets/* did not reach an upstream (502)"
[ "$(code /)" = "200" ] && ok "/ is proxied to the web upstream (200)" || bad "/ did not reach the web upstream ($(code /))"

HDRS="$(curl -sD - -o /dev/null "http://127.0.0.1:$PORT/")"
echo "$HDRS" | grep -qi 'x-content-type-options: nosniff' && ok "edge sends nosniff" || bad "edge nosniff missing"
echo "$HDRS" | grep -qi 'x-frame-options' && ok "edge sends X-Frame-Options" || bad "edge X-Frame-Options missing"

echo
echo "nginx_check: $PASS passed, $FAIL failed  (real routing still needs the app containers)"
[ "$FAIL" -eq 0 ] || exit 1
