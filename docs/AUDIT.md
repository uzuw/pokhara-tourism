# Security, load and readiness audit — Hamro Pokhara

Date: 2026-10-15 · Revision audited: `8cc61e8` (pre-hardening) → this branch
Host: Arch Linux, Node v26.7.0, SQLite (`node:sqlite`), 16 GB RAM (load avg ≈ 5.5 during runs)

Everything below was produced by running code in this repository. Commands are
reproducible:

```bash
npm test                                    # 73 functional + security tests
npm run test:security                       # the 44 security-specific ones
bash scripts/deploy_check.sh                # production boot / grace / header checks
bash scripts/audit_local.sh                 # black-box audit against a live prod-mode process
npm run loadtest -- --label new             # autocannon scenarios on fixture data
npm run loadtest -- --flood                 # reads WHILE logins hash
```

---

## 1. Security findings

The suite `server/tests/security.test.js` encodes the defensive contract, so a
failure is a finding. **18 of 40 assertions failed on the pre-hardening revision.**
Result after the work below: **73/73 green**, and 26/26 on the black-box audit of a
live `NODE_ENV=production` process.

| # | Finding (pre-hardening behaviour) | Severity | Fix |
|---|---|---|---|
| 1 | **Anonymous 500 leaking the full stack + absolute source paths** — `POST /api/auth/login {"identifier":{"$gt":""}}` → `Unknown named parameter '$gt' at /home/…/server/routes/auth.js:34`. Type-confused input went straight into the SQL driver. | High | Strict `typeof` validation before every bind parameter (`server/validate.js`); error handler returns JSON only |
| 2 | **JWT secret was the shipped placeholder** (`pokhara-tourism-dev-secret-change-me`) → anyone reading the repo could forge tokens for any user | Critical (prod) | `server/config.js` refuses to boot in production with a missing/placeholder/<32-char secret; dev gets a random per-process secret and a warning |
| 3 | **No rate limiting anywhere** — unlimited credential stuffing and registration spam | High | `express-rate-limit`: login 10/15min/IP (successes excluded), register 10/h/IP, all writes 60/min/IP, each returning JSON + `Retry-After` |
| 4 | **No security headers** (`X-Powered-By: Express`, no nosniff/CSP/frameguard/HSTS/referrer-policy) | Medium | `helmet` with explicit directives; `X-Powered-By` off |
| 5 | **CORS `*`** — every origin could call the API from a browser | Medium | Origin allow-list (`CORS_ORIGINS`); unknown origins get no `Access-Control-Allow-Origin` at all |
| 6 | **HTML error pages with stack traces** for malformed JSON, oversized bodies, unknown routes | Medium | JSON-only 404 + terminal error handler; internals logged, never returned |
| 7 | **Password policy: 6 chars, anything accepted**, and >72-byte passwords were silently truncated by bcrypt | Medium | 8 chars min, ≤72 bytes (explicit), rejects all-digit / single-char / whitespace-only / common passwords (small blocklist) |
| 8 | **Case-sensitive usernames/emails** — `Admin` and `admin` could coexist (impersonation) | Medium | `COLLATE NOCASE` uniqueness checks; emails normalised to lowercase |
| 9 | **Control characters / 40-char / angle-bracket usernames accepted** | Low | `validateUsername()` (trim, 3–32, no control chars, no `<`/`>`) |
| 10 | **`Bearer` scheme was case-sensitive** (RFC 7235 says it is not) | Low | Case-insensitive scheme parsing in `middleware/auth.js` |
| 11 | **No algorithm pinning on JWT verify** | Low | `algorithms: ['HS256']` on verify, `algorithm` on sign |
| 12 | **Auth/token responses were cacheable** by proxies and the browser | Low | `Cache-Control: no-store, private` on all `/api` responses; public routes opt into caching explicitly |
| 13 | **Unbounded query input** (`?q=` 5 KB, deeply nested JSON bodies) | Low | `q` ≤ 100 chars, `category` ≤ 40, `slug` ≤ 120, body limit 64 KB in production |
| 14 | **No account-enumeration timing equalisation** | Low | Dummy hash comparison when the account does not exist |
| 15 | **Legacy vanilla-HTML pages were publicly served** by the API (`/js/*.html`, `/css/styles.css`) | Low | Removed; Express now serves only `/assets` images |
| 16 | **Static handler mounted the whole `public/` tree** | Low | Mounted at `/assets` only, `index: false`, `dotfiles: 'deny'`, `fallthrough: false` |
| 17 | `DELETE /api/destinations/:id` could delete a **comment** by id (route shape leak) | Low | Comment deletion moved to its own router (`/api/comments/:id` only) |
| 18 | `npm run seed` pointed at a **non-existent file** `server/seed.js` | Low | Replaced with a working command; `README`/scripts corrected |

Verified as already safe (regression-tested from now on): SQL parameterisation on
every query, IDOR on comment deletion, mass-assignment of `is_admin`/`email`/
`password_hash` via `PATCH /api/users/me`, prototype pollution, path traversal out
of the static root, `alg=none` / wrong-secret / expired / tampered tokens, token
passed in a query string.

### Known gaps (deliberately not done)

* **Tokens live in `localStorage`** — an XSS anywhere on the origin can read them.
  Moving to `httpOnly` cookies needs a CSRF strategy; noted as follow-up, not silently changed.
* No email verification, password reset, 2FA, or account lockout-after-N-failures (rate limits cover the common case).
* No CSRF token — not needed while auth is a bearer header, required the moment cookies are used.
* `sqlite` is single-node: no read replicas, and backups are your responsibility (`deploy/` + a cron of `sqlite3 .backup`).
* Rate limiting is in-memory: it resets on restart and does not span multiple API containers. Use Redis (`rate-limit-redis`) when you scale past one process.

---

## 2. Performance under moderate load

Fixtures: 14 destinations, **500 users, 3 000 ratings, 4 000 comments**.
Driver: autocannon, **50 connections, 10 s per scenario, 3 interleaved repeats**,
reporting the **median** (single runs on this host vary by up to ±20 % — the
desktop session holds ~12 GB RAM/CPU, so medians are the only defensible number).

| Scenario | Before | After | Change |
|---|---|---|---|
| `GET /api/destinations` (list + stats) | 946 req/s · p50 48 ms | 948 req/s · p50 46 ms | **±0 % (parity)** |
| `GET /api/destinations/:slug/comments` | 2 266 req/s · p50 19 ms | 2 356 req/s · p50 19 ms | +4 % |
| **reads while 50 logins/sec-window hash** | **0 req/s — no response at all in 12 s** | **2 016 req/s · p50 3 ms · p99 12 ms** | **site no longer freezes** |
| login throughput during that flood | 15 req/s · p50 2 532 ms | 62 req/s · p50 589 ms | 4× |

### The one that mattered

`bcryptjs` is pure JavaScript: `compareSync`/`hashSync` block the event loop for
~60–140 ms each. **50 concurrent logins froze the entire API** — a read-only
client received *zero* responses in 12 seconds while a login burst was in flight.

Two things did *not* work, and were discarded after measuring:

* `bcryptjs`'s "async" API — measured with a 5 ms ticker: **1 tick in 573 ms**, i.e. it is fully blocking. (Claimed as a fix, disproved by the benchmark, so it was not kept.)
* Switching to `crypto.scrypt` — measured **25 ticks in 131 ms** (non-blocking): `crypto.scrypt` runs in the libuv threadpool, is built into Node, needs no native build, and is memory-hard. Legacy bcrypt rows still verify and are transparently re-hashed to scrypt on next login.

### What did NOT help (honest results)

* **The N+1 query fix is throughput-neutral at this data size.** The list endpoint
  used to run 1 + 3×N statements (43 for 14 destinations) with a fresh
  `db.prepare()` per row; it is now a single query with correlated subqueries, plus
  a prepared-statement cache. Measured: **946 → 948 req/s (+0.2 %, i.e. noise)**.
  The JS↔SQLite round-trips disappear, but SQLite still performs the same
  per-row aggregate work, and 14 rows is too small to notice. It is the right
  shape as the catalogue grows (and it is why the responses are now cacheable),
  but it is *not* the win the shape suggests.
* **Compression is a trade, not a win**: level 4 + 4 KB threshold costs ~8–9 %
  requests/s and returns ~2.5× (catalogue) to ~9× (comment threads) fewer bytes.
  Both settings are therefore configurable, and the nginx profile in `deploy/`
  gzips at the edge instead (`COMPRESSION_DISABLED=1`).
* Batching the access log (250 ms flush instead of one write per request)
  recovered the ~10 % that per-request logging cost — which is what let the
  hardened build match the old build's throughput *while* adding helmet, CORS,
  rate limits and logging.

---

## 3. Deployment readiness

Verified locally by `scripts/deploy_check.sh` (12/12 pass) and
`scripts/audit_local.sh` (26 pass / 0 fail):

* [x] Production refuses to start without a real `JWT_SECRET` (actionable message, exit ≠ 0)
* [x] `NODE_ENV=production` boots, seeds, and answers `/api/health` (DB ping → 200/503)
* [x] Graceful shutdown on SIGTERM (drains, closes SQLite, exits 0; 10 s hard deadline)
* [x] Structured JSON logs with request ids; `X-Request-Id` echoed
* [x] `/api/health` suitable for Docker/K8s probes and systemd watchdogs
* [x] Config entirely env-driven, validated at boot, documented in `.env.example`
* [x] `npm run setup:env` generates strong secrets into `.env` (mode 0600)
* [x] Dockerfile (API, non-root, volume-backed SQLite) + `frontend/Dockerfile`
* [x] `docker-compose.yml`: api + web + nginx, only the proxy publishes a port
* [x] `deploy/nginx.conf` (single origin: `/`, `/api/`, `/assets/`, gzip, proxy headers)
* [x] systemd units with `ProtectSystem`/`NoNewPrivileges` hardening
* [x] CI workflow: tests + security suites + deploy check + web build

Still open before public traffic:

1. **TLS** (certbot or the proxy of your choice) and a real `SITE_URL`/`CORS_ORIGINS`.
2. **Backups** for the SQLite volume + a restore drill.
3. **Monitoring/alerting** on 5xx rate and `/api/health` (the logs are already JSON).
4. **OSRM**: the map's routing calls the public demo server — self-host or use a
   keyed provider before real traffic (unchanged from before this audit).
5. A staging run of `npm run audit -- --url https://staging… --origin https://staging…`
   and `npm run loadtest` against realistic hardware.
6. **Destination photos** (see below) — three are the wrong place entirely.

### Content QA: the destination photos

`scripts/fetch_images.js` picks the first Commons search hit that downloads and
passes a file-type check. Nothing validated that the photo **depicts the
destination**, and an automated sweep of all 14 with a vision model found that it
frequently does not:

| Destination | Verdict | What the file actually shows |
|---|---|---|
| `pumdikot-shiva-statue` | ✗ wrong place | a temple beside a pond in the flat Terai — not the hilltop Shiva statue |
| `pokhara-old-bazaar` | ✗ wrong place | a single temple gate; the Commons source is from Waling, Syangja |
| `sarangkot` | ✗ wrong place | silhouetted trees at twilight — no lake, no city, no Annapurnas; licence also unrecorded |
| `phewa-lake`, `begnas-lake`, `rupa-lake` | ~ weak | dark/backlit/sepia silhouettes, not the iconic view |
| `seti-river-gorge` | ~ poor | 320×240 and blurry |
| `mahendra-cave`, `international-mountain-museum` | ~ partial | the entrance gate only, not the subject |
| `tal-barahi-temple`, `world-peace-pagoda`, `devis-fall`, `gupteshwor-mahadev-cave`, `bindhyabasini-temple` | ✓ correct | — |

Fix: curate a specific Commons file per destination (by file title, not search),
keep the vision check in the loop, and prefer landscape images ≥1280px. The
attribution for what is currently shipped is recorded in
[`CREDITS.md`](CREDITS.md), generated by `scripts/record_image_credits.js`:
12 of 14 resolved automatically (mostly CC BY-SA, one public domain); the two
whose thumbnails Wikimedia has since re-encoded stay flagged there.

## 4. Product gaps worth a follow-up

* Catalogue pagination/sorting is capped (500 rows) but not exposed in the UI yet; it is fine for 14 destinations, it is not for 500.
* No user favourites/"been there" list, no photo uploads, no trip planner.
* Reviews can be posted without limits beyond the rate limit; no reporting/moderation queue (admin flag exists but has no UI).
* Accessibility was spot-checked (alt text, aria-labels on nav) but not audited with a screen reader or automated axe run.
* i18n: the brand is bilingual but the UI is English-only.
