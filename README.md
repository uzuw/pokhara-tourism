# 🌊 Pokhara Tú — Tourism Web App

A full-stack tourism guide for **Pokhara, Nepal**. Browse curated destinations,
see them on **OpenStreetMap** with real routing ("how to get there"), and sign up
to rate spots and leave reviews.

## Stack

| Layer | Tech |
|------|------|
| Backend | Node.js + Express, SQLite (`node:sqlite`), JWT auth (`bcryptjs` + `jsonwebtoken`) |
| Frontend | Next.js 14 (App Router, JavaScript), Tailwind-free custom CSS design system |
| Maps | Leaflet + OpenStreetMap tiles + Leaflet Routing Machine (OSRM public server) |
| Images | Real photos pulled from **Wikimedia Commons** (freely licensed) at build time |

No external API keys required. The map and routing use the public OpenStreetMap /
OSRM services.

## Features

- 🔐 **Full authentication** — register / login / logout, JWT stored client-side,
  password hashing with bcrypt. Protected profile + rating/comment actions.
- 🏞️ **14 real Pokhara destinations** with coordinates, categories, descriptions,
  best-time and entry-fee info.
- ⭐ **Ratings** — 1–5 star, upsert per user, live community average + distribution.
- 💬 **Comments / reviews** — post, view, and delete (owner or admin) per destination.
- 🗺️ **Full map page** — all spots plotted; pick any **From → To** to draw a real
  road route between them.
- 📄 **Per-destination page** — hero image, description, its own mini-map, ratings
  widget, and reviews thread.
- 👤 **Profile page** — edit username/bio, see your ratings and reviews.

## Project layout

```
tourism/
├── server/            # Express API + SQLite
│   ├── index.js       # app entry (JSON API on :4000 + static images)
│   ├── db.js          # node:sqlite schema + seed
│   ├── auth.js        # bcrypt + JWT helpers
│   ├── routes/        # auth, destinations, ratings, comments, users
│   └── data/          # destinations.json (seed) + tourism.db
├── frontend/          # Next.js app (UI on :3000)
│   ├── app/           # pages: /, /destinations, /map, /destination/[slug],
│   │                   #        /login, /register, /profile
│   ├── components/    # Navbar, Footer, DestinationCard
│   └── lib/           # api client + auth context
├── public/assets/     # downloaded destination photos (served by Express)
└── scripts/           # fetch_images.js, fetch_one.js, smoke_test.js
```

## Run it locally

Two terminals:

```bash
# 1) Backend (port 4000)
cd server
npm install
node server/index.js          # seeds 14 destinations on first run

# 2) Frontend (port 3000)
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**. In dev, Next proxies `/api/*` and `/assets/*`
to the Express backend (see `frontend/next.config.mjs`), so everything is
same-origin — no CORS, no env config needed.

> The backend serves images from `public/assets/images`. The frontend
> references them as `/assets/images/<slug>.jpg`.

### Images

Photos are fetched from Wikimedia Commons by `scripts/fetch_images.js`
(resumable — re-running skips already-downloaded files). Run it once after
cloning:

```bash
node scripts/fetch_images.js
```

### Smoke test

```bash
node scripts/smoke_test.js   # register → rate → comment → profile (needs backend running)
```

## Production

```bash
cd frontend && npm run build && npm run start   # :3000
cd server   && node server/index.js              # :4000
```

Point `NEXT_PUBLIC_API_URL` at the backend (e.g. behind nginx / a reverse proxy)
if you host them on separate origins.

## Notes

- `next build` and `next dev` share the `.next` directory — don't run a production
  build while `npm run dev` is live; restart dev afterwards.
- Map routing uses the public OSRM demo server (`router.project-osrm.org`); for
  production traffic, self-host OSRM or use a keyed provider.
