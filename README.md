# 🌊 Hamro Pokhara — हाम्रो पोखरा

[![CI](https://github.com/uzuw/pokhara-tourism/actions/workflows/ci.yml/badge.svg)](https://github.com/uzuw/pokhara-tourism/actions/workflows/ci.yml)

A full-stack tourism guide for **Pokhara, Nepal**. Browse curated destinations,
see them on **OpenStreetMap** with real routing ("how to get there"), and sign up
to rate spots and leave reviews.

## Stack

| Layer | Tech |
|------|------|
| Backend | Node.js 20+ + Express 4, SQLite (`node:sqlite`), JWT auth with **scrypt** password hashing, helmet, express-rate-limit |
| Frontend | Next.js 14 (App Router, JavaScript), Tailwind-free custom CSS design system |
| Maps | Leaflet + OpenStreetMap tiles + Leaflet Routing Machine (OSRM public server) |
| Images | Real photos pulled from **Wikimedia Commons** (freely licensed) |

No external API keys required. The map and routing use the public OpenStreetMap /
OSRM services.

## Features

- 🔐 **Full authentication** — register / login / logout, JWT, scrypt-hashed
  passwords (8+ chars, common-password and all-digit rejection), per-IP rate
  limits on login and registration. Protected profile + rating/comment actions.
- 🏞️ **14 real Pokhara destinations** with coordinates, categories, descriptions,
  best-time and entry-fee info.
- ⭐ **Ratings** — 1–5 star, upsert per user, live community average + distribution.
- 💬 **Comments / reviews** — post, view, and delete (owner or admin) per destination.
- 🗺️ **Full map page** — all spots plotted; pick any **From → To** to draw a real
  road route between them.
- 📄 **Per-destination page** — hero image, description, its own mini-map, ratings
  widget, and reviews thread.
- 👤 **Profile page** — edit username/bio, see your ratings and reviews.
- 🧭 Polished 404/error pages, SEO metadata + `robots.txt`/`sitemap.xml`, and a
  catalogue that is cache-friendly for browsers and CDNs.

## Project layout

```
tourism/
├── server/                # Express API + SQLite
│   ├── index.js           # app entry: middleware, routes, boot, graceful shutdown
│   ├── config.js          # env parsing + production validation (fails fast)
│   ├── db.js              # schema, pragmas, prepared-statement cache, stats query
│   ├── auth.js            # scrypt hashing (+ legacy bcrypt verify) + JWT
│   ├── validate.js        # input validation / normalisation rules
│   ├── security.js        # helmet, CORS allow-list, rate limiters, 404 + error handler
│   ├── logger.js          # batched JSON logs + request ids
│   ├── middleware/        # requireAuth / optionalAuth (RFC-compliant Bearer parsing)
│   ├── routes/            # auth, destinations, ratings, comments, users
│   ├── tests/             # Jest + Supertest: functional + security suites
│   └── data/              # destinations.json (seed) + tourism.db (gitignored)
├── frontend/              # Next.js app (:3000)
│   ├── app/               # /, /destinations, /map, /destination/[slug],
│   │                      #   /login, /register, /profile, 404 + error pages
│   ├── components/        # Navbar, Footer, DestinationCard, decor/*
│   └── lib/               # api client + auth context
├── public/assets/images/  # destination photos (served by the API at /assets)
├── scripts/               # setup_env, fetch_images, smoke_test, loadtest,
│                          #   security_audit, deploy_check, audit_local
├── deploy/                # nginx.conf + systemd units
├── docs/AUDIT.md          # security + performance audit (read this)
├── Dockerfile             # API image          frontend/Dockerfile: web image
└── docker-compose.yml     # api + web + nginx, one command
```

## Quick start

```bash
npm install
npm run setup:env                  # writes .env with a strong random JWT_SECRET (0600)
npm --prefix frontend install
node scripts/fetch_images.js       # one-time: download destination photos (resumable)
npm run dev:all                    # API :4000 + web :3000
```

Open **http://localhost:3000**. In dev, Next proxies `/api/*` and `/assets/*` to
the Express backend (see `frontend/next.config.mjs`), so everything is
same-origin — no CORS, no env config needed.

> The backend serves images from `public/assets/images`; the frontend references
> them as `/assets/images/<slug>.jpg`.

### Smoke test

```bash
node scripts/smoke_test.js   # register → rate → comment → profile (needs backend running)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:all` | API (`:4000`) + Next dev server (`:3000`) together |
| `npm test` | 73 tests: functional API + security suites (isolated temp DB) |
| `npm run test:security` | just the security / abuse suites |
| `npm run audit` | **black-box security audit** against a running instance (`--url`, `--origin`) |
| `bash scripts/audit_local.sh` | boots a production-mode instance and audits it |
| `bash scripts/deploy_check.sh` | production boot, headers, auth gates, SIGTERM grace |
| `bash scripts/e2e_check.sh` | full stack: API + built Next app + the same-origin `/api` + `/assets` proxy + a real user journey |
| `bash scripts/nginx_check.sh` | loads `deploy/nginx.conf` in nginx with stub upstreams and checks every route |
| `npm run loadtest -- --label new` | autocannon load test on generated fixtures |
| `npm run loadtest -- --flood` | reads-while-logins-hash responsiveness probe |
| `npm run setup:env` | generate `.env` + `frontend/.env.local` with strong secrets |
| `npm run seed` | insert the 14 destinations if the table is empty |
| `npm run build` / `npm run start:web` | production build / serve the frontend |

## Production

### Docker (recommended)

```bash
cp .env.example .env && npm run setup:env   # generates JWT_SECRET
docker compose up -d --build                # nginx :80 -> web + api
```

Only the proxy publishes a port; the API and web containers stay on the internal
network. The SQLite file lives on the `api-data` volume.

### Bare metal (systemd)

```bash
npm ci --omit=dev && npm --prefix frontend ci && npm --prefix frontend run build
sudo cp deploy/hamro-pokhara-{api,web}.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now hamro-pokhara-api hamro-pokhara-web
```

Put `deploy/nginx.conf` (or any reverse proxy) in front, terminate TLS there, and
serve everything from **one origin** so the browser never needs CORS.

### One VPS, from zero

```bash
# on the box (2 vCPU / 2 GB is plenty)
git clone <repo> && cd tourism
npm run setup:env                        # strong JWT_SECRET, mode 0600
docker compose up -d --build             # nginx :80 -> web + api
docker compose ps                        # api + web must show (healthy)

# TLS: pick ONE
sudo certbot --nginx -d your.domain      # A) keep nginx
#   or B) swap the proxy for Caddy, which renews certificates by itself:
#   see deploy/Caddyfile.example (one file, no certbot cron)

curl -fsS https://your.domain/api/health # {"ok":true,...}
```

Point the domain's `A` record at the box and open 80/443 first. `CORS_ORIGINS`
stays **empty** — same origin needs no CORS at all.

### Configuration

All knobs are documented in [`.env.example`](.env.example). The important ones:

| Variable | Why it matters |
|---|---|
| `JWT_SECRET` | ≥32 chars. **Production refuses to boot** on a placeholder/missing value |
| `CORS_ORIGINS` | Comma-separated allow-list. Empty = same-origin only (recommended) |
| `TRUST_PROXY` | `loopback` behind nginx, so rate limits see the real client IP |
| `TOURISM_DB_FILE` | Absolute path to the SQLite file (mount it on a volume) |
| `AUTH_RATE_MAX`, `REGISTER_RATE_MAX`, `WRITE_RATE_MAX` | Abuse limits per IP |
| `COMPRESSION_*` | gzip trade-off — see `docs/AUDIT.md`; disable when the proxy gzips |
| `LOG_REQUESTS` | `0` keeps warnings/errors only under heavy load |

### Operations

* **Health**: `GET /api/health` → `{ ok, time, uptime_s, env }`, `503` when the DB is unreachable. Wire it to your probe/monitor.
* **Logs**: one JSON object per line on stdout (`level`, `msg`, `request_id`, `status`, `ms`, `ip`) — journald/Loki/CloudWatch friendly.
* **Shutdown**: SIGTERM drains in-flight requests, closes SQLite, exits 0 (10 s hard deadline).
* **Backups**: stop-free `sqlite3 tourism.db ".backup '/backups/tourism-$(date +%F).db'"` on a cron; test a restore.
* **Scaling**: rate limits are in-memory, so run one API process per SQLite file (or add a Redis store) before adding replicas.

## Security

The API is hardened and covered by an executable contract:
`server/tests/security.test.js` (40 assertions: injection, JWT forgery, IDOR,
mass assignment, credential policy, headers, CORS, traversal, fuzz) plus
`security-ratelimit.test.js` (brute-force / abuse). `npm run audit` re-checks the
same properties over HTTP against any running instance.

Full findings with severities and the measured before/after performance numbers:
**[docs/AUDIT.md](docs/AUDIT.md)**.

## Credits

Destination photos come from **Wikimedia Commons** — see **[CREDITS.md](CREDITS.md)**
for the source file, author and licence of each one (most are CC BY-SA and
require attribution). Map data © OpenStreetMap contributors (ODbL); routing by OSRM.

The photos are the one part of the catalogue still needing work: three of the
fourteen currently show the wrong place (the fetch script validated file type but
never content). Details and the fix plan are in
[docs/AUDIT.md §3](docs/AUDIT.md#content-qa-the-destination-photos).

## Notes

- `next build` and `next dev` share `.next` — don't run a production build while
  `npm run dev` is live; restart dev afterwards.
- Map routing uses the public OSRM demo server (`router.project-osrm.org`); for
  production traffic, self-host OSRM or use a keyed provider.
- SQLite runs in WAL mode with `synchronous=NORMAL`; keep the database (and its
  `-wal`/`-shm` siblings) on a local volume, not a network share.
