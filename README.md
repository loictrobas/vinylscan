# VinylScan

Management tool for record stores: scan vinyl labels with AI (Claude Vision), match against Discogs, and manage inventory, lots, consignment, pricing, point of sale, and a public storefront. No manual data entry for cataloging — photo in, matched Discogs release out.

This README is written for both humans and AI coding agents setting the project up for the first time. If you're an agent: follow the steps in order, they're meant to work without asking the user anything beyond the credentials listed.

---

## Architecture

| Layer | Tech | Host (this project's deployment) |
|---|---|---|
| Backend | FastAPI, SQLAlchemy async (asyncpg), Alembic migrations | Render (free tier) |
| Database | PostgreSQL | Supabase (free tier) |
| Frontend | Next.js 15 App Router, TypeScript, Tailwind | Vercel |
| Mobile app | Capacitor iOS (Vite + React), native iPhone install | — |
| AI | Anthropic Claude Vision | Anthropic API |
| Music DB | Discogs API (OAuth 1.0a) | — |
| Image storage | Local disk in dev; Cloudflare R2 in prod | — |
| Payments | Stripe (subscription + one-time credit packs) | — |
| Auth | Custom JWT + bcrypt-style PBKDF2, plus Discogs OAuth login | — |

> **Render free tier:** the backend spins down after ~15 min of inactivity; the first request after idle takes 30-60s to cold-start.
>
> **Note:** Render's free web services sit behind Cloudflare, which buffers small streaming HTTP responses. If you touch the SSE endpoint (`/scan/stream`), keep the padding workaround in `routers/scan.py` — without it, no event ever reaches the client in production, even though it works fine locally.

---

## Prerequisites

- Python 3.11+ (a working `pip install fastapi` — no specific venv tooling required, but one is recommended)
- Node.js 20+
- PostgreSQL running locally (`createdb` available)
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- A Discogs account + registered application ([discogs.com/settings/developers](https://www.discogs.com/settings/developers)) — only needed to actually search/add releases; the app boots fine without it
- Optional: Stripe test keys, Cloudinary account (store logo/banner uploads) — both degrade gracefully if unset

---

## 1. Clone and get credentials

Ask whoever owns the project for (do **not** put these in git):
- `ANTHROPIC_API_KEY`
- `DISCOGS_CONSUMER_KEY` / `DISCOGS_CONSUMER_SECRET` (or register your own app — see below)
- Optionally: Stripe test keys, Cloudinary keys, if you're working on billing or storefront image uploads

### Registering your own Discogs app (if not sharing one)

1. [discogs.com/settings/developers](https://www.discogs.com/settings/developers) → **Create an Application**
2. Callback URL: `http://localhost:8000/auth/discogs/callback`
3. Copy the Consumer Key/Secret into `backend/.env`

---

## 2. Backend setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt

cp .env.example .env
# edit .env: at minimum set DATABASE_URL, SECRET_KEY, ENCRYPTION_KEY (any random
# strings for local dev), ANTHROPIC_API_KEY. Leave DEV_MODE=true.

createdb vinylscan   # local Postgres, matching DATABASE_URL

uvicorn main:app --reload --port 8000
```

What happens on first boot, automatically — **no manual seeding needed**:
- Alembic runs all migrations against your fresh DB (`alembic upgrade head`, done in code at startup)
- An admin user is created: `loictrobas1@gmail.com` / `loicisadmin` by default, or your own email/password if you set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`

Log in with that account and you're in — registration is invite-only otherwise (an admin creates invites from `/admin`).

**`DEV_MODE=true`** matters for local dev: it gives every user 9999 credits (bypassing the real 5-credits/month free tier) and relaxes CORS to accept any private-network IP (`192.168.*`, `10.*`, `172.16-31.*`) — needed for testing the phone app against your laptop's LAN IP.

Run tests: `pytest tests/ -v` (uses an in-memory SQLite DB, no Postgres needed for tests).

---

## 3. Frontend setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Open `http://localhost:3000`, log in with the seeded admin account.

Typecheck: `npx tsc --noEmit`.

---

## 4. Mobile app (optional — only if working on the phone-scan flow)

Native iPhone app (Capacitor), separate from the web frontend, in `mobile-app/`. Talks to the *same* backend as the desktop — the phone uploads a photo, the backend runs Claude Vision + Discogs in the background, and pushes the result to any open desktop `/scan` tab over SSE (or the desktop's 8-second poll fallback if SSE is unavailable, e.g. on Render/Cloudflare — see the note in Architecture above).

```bash
cd mobile-app
npm install
cp .env.example .env   # VITE_API_URL — your Mac's LAN IP for a physical phone, not localhost
npm run build && npx cap sync ios
# open ios/App/App.xcodeproj in Xcode, select your iPhone, hit Run
```

**Critical for phone↔desktop to actually see each other:** both must point at the *same* backend (same `NEXT_PUBLIC_API_URL` / `VITE_API_URL` / in-app server override). Pointing the phone at Render while the desktop runs against localhost — or vice versa — means they're talking to two completely separate databases; nothing will ever sync between them, no error will explain why.

If installed with a free (non-paid) Apple ID, the app stops opening after 7 days ("no longer available") — reinstall via Xcode to reset the clock. This is an Apple provisioning limit, not an app bug.

---

## Feature areas (backend routers)

| Router | Prefix | Covers |
|---|---|---|
| `auth` | `/auth` | Email/password login (invite-gated register), Discogs OAuth login, JWT issuance |
| `scan` | `/scan` | Upload/identify pipeline, SSE stream, confirm/skip, barcode lookup, admin debug search |
| `catalog` | `/catalog` | Record CRUD, lots, pricing, CSV export, stats |
| `consignments` | `/consignments` | Consignor CRUD, payout tracking |
| `accessories` | `/accessories` | Non-record inventory (turntables, sleeves — has real stock counts) |
| `store` | `/store` | Store settings/theme, public storefront (paginated), checkout, sell/trade leads, orders |
| `dashboard` | `/dashboard` | Home screen stats |
| `billing` | `/billing` | Stripe checkout, subscription, webhook |
| `discogs` | `/discogs` | Collection sync helpers |
| `admin` | `/admin` | User management, invites |
| `benchmark` | `/admin/benchmark` | Search-strategy benchmarking |
| `eval_router` | `/admin/eval` | AI accuracy eval harness (ground-truth dataset + scoring) |

Full request/response shapes: run the backend and check `http://localhost:8000/docs` (FastAPI auto-generated).

---

## Testing & CI

- Backend: `pytest backend/tests/ -v` — in-memory SQLite, no external services called (Claude/Discogs are mocked where needed)
- Frontend/mobile: `npx tsc --noEmit`
- GitHub Actions (`.github/workflows/ci.yml`) runs both on every push/PR to `main`

---

## Deployment

Already set up for this project (ask the owner for dashboard access rather than re-provisioning):
- **Backend** — Render, git-connected (`render.yaml` blueprint), auto-deploys on push to `main`
- **Database** — Supabase Postgres. Connect via the **session pooler on port 5432**, not the direct host (IPv6-only, unreachable from Render) and not the 6543 transaction pooler (breaks asyncpg's prepared-statement cache)
- **Frontend** — Vercel, git-connected, or `vercel --prod` from `frontend/`

If bootstrapping a brand-new empty database (rare — only if setting up a fresh environment): the very first Alembic migration is a no-op that assumes `users`/`scans`/`credit_transactions` already exist from a pre-Alembic era. Against a truly empty DB, run `Base.metadata.create_all()` once (creates everything current `models.py` defines), manually apply the two raw-SQL pieces not expressible in the ORM (`CREATE EXTENSION pg_trgm` + its two GIN indexes, from migration `u1v2w3x4y5z6`), then `alembic stamp head` — not `alembic upgrade head`, which fails on the missing baseline tables.

---

## Credits system

- New accounts start with 5 credits; topped back up to 5 on the 1st of each month if below that (never stacked above it)
- 1 scan = 1 credit, deducted on **confirm or skip** — not on upload, and not if Claude fails to identify anything
- `DEV_MODE=true` overrides all of this to a flat 9999 credits, refreshed on login

| Pack | Credits | Price |
|---|---|---|
| Small | 25 | $1.99 |
| Medium | 75 | $4.99 |
| Large | 200 | $9.99 |

Every authenticated response carries an `X-Credit-Balance` header for live client-side sync.
