# VinylScan — Claude Code Context

## What this is

VinylScan is a management tool for record stores: inventory, lots, consignment, pricing, point of sale, and a public storefront. The core time-saver is the scan flow — the user takes a photo of a record label with their phone → AI identifies artist, title, label, catalog number → searches Discogs for the exact release → adds it to the catalog. No manual typing. Store owners only — no separate collector/personal-use mode.

## Stack

| Layer | Tech |
|---|---|
| Backend | Python / FastAPI, PostgreSQL (asyncpg/SQLAlchemy), Alembic migrations |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Mobile app | Capacitor iOS (Vite/React), installed natively on iPhone |
| AI | Claude Vision (claude-sonnet-4-5) — reads label photos |
| Music DB | Discogs API (OAuth 1.0a) — searches and matches releases |
| Image storage | Local `/tmp/vinylscan_images/` in dev; Cloudflare R2 in prod |
| Auth | JWT (custom, no library) + bcrypt |
| Cloud backend | Render — `https://vinylscan-api-nnlv.onrender.com` (has issues, use local for now) |

## Repo structure

```
vinylscan/
├── backend/                  FastAPI app
│   ├── main.py               App entry, CORS, static files, lifespan
│   ├── models.py             SQLAlchemy models
│   ├── schemas.py            Pydantic schemas
│   ├── routers/
│   │   ├── scan.py           Core: upload, SSE stream, confirm, enhance
│   │   ├── catalog.py        Catalog CRUD, pricing, stats
│   │   ├── auth.py           Login, register, /auth/me, Discogs OAuth
│   │   ├── admin.py          Admin endpoints
│   │   ├── eval_router.py    Eval harness API
│   │   └── ...
│   ├── services/
│   │   ├── claude_vision.py  Claude API calls
│   │   ├── discogs.py        Discogs search + OAuth
│   │   └── sse.py            SSE connection manager
│   ├── prompts/              Claude prompt files + registry.json
│   └── eval/                 Eval harness scripts
│       ├── build_dataset.py  Build ground-truth dataset
│       ├── run_eval.py       Run evaluation
│       └── results/          Eval run JSON output
│
├── frontend/                 Next.js desktop app
│   ├── app/
│   │   ├── scan/page.tsx     Main scan page (ScanInterface)
│   │   ├── catalog/page.tsx  Catalog view
│   │   ├── dashboard/page.tsx
│   │   ├── admin/            Admin panel + eval dashboard
│   │   └── ...
│   ├── components/
│   │   ├── ScanInterface.tsx Core desktop scan UI (large, ~1950 lines)
│   │   ├── RecordModal.tsx
│   │   └── Sidebar.tsx
│   ├── lib/api.ts            All API calls + types
│   └── .env.local            NEXT_PUBLIC_API_URL (currently localhost:8000)
│
└── mobile-app/               Capacitor iOS native app
    ├── src/
    │   ├── screens/
    │   │   ├── ScanScreen.tsx  Camera + upload UI
    │   │   ├── LoginScreen.tsx Login + server config
    │   │   └── CameraScreen.tsx Native camera viewfinder
    │   └── lib/api.ts          Mobile API client (dynamic URL via getApiUrl())
    └── .env                    VITE_API_URL (currently Render URL)
```

## How the scan flow works

```
Phone (Capacitor app)
  └─ Takes photo with native camera
  └─ POST /scan/upload → backend
         └─ Compress image (max 1500px, JPEG 85%)
         └─ Save to /tmp/vinylscan_images/{uuid}.jpg
         └─ Claude Vision → extracts: artist, title, year, label, catno, confidence
         └─ Discogs search → ranked list of matching releases
         └─ SSE broadcast → desktop gets result instantly
         └─ Returns to phone: "Sent to desktop" ✓

Desktop browser (Next.js at localhost:3000)
  └─ EventSource open to GET /scan/stream?token=JWT
  └─ Receives scan_result event → result card appears
  └─ User sees: image, AI extraction, Discogs matches, confidence
  └─ User clicks correct match (or pastes Discogs URL) → confirms
  └─ Record added to catalog
```

## Eval harness

Admin tool to measure AI accuracy on real vinyl photos.

```bash
# Build dataset from local label photos (ground truth)
cd backend && python eval/build_dataset.py --from-local eval/test_images/

# Run eval against a prompt
python eval/run_eval.py --prompt v3-literal --dataset eval/dataset.json

# Results saved to eval/results/{run_id}.json
# View in browser: /admin/eval
```

Ground-truth photos: `backend/eval/test_images/{discogs_release_id}.jpg`
Save from scan UI: confirm a scan with "Save to eval dataset" checkbox (admin only).

## Prompt system

`backend/prompts/registry.json` — list of prompts with `id`, `schema`, `active`
`backend/prompts/{id}.txt` — the actual prompt text
`backend/prompts/adapters.py` — normalizes Claude output to flat dict

Two schemas: `flat` (v1/v2) and `v3` (per-field confidence + `catalog_number_candidates` array)

## Key env vars

**backend/.env**
```
DATABASE_URL=postgresql+asyncpg://localhost/vinylscan
ANTHROPIC_API_KEY=...
DISCOGS_CONSUMER_KEY=...
DISCOGS_CONSUMER_SECRET=...
SECRET_KEY=...          # JWT signing
ENCRYPTION_KEY=...      # Discogs OAuth token encryption
FRONTEND_URL=http://localhost:3000
```

**frontend/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**mobile-app/.env**
```
VITE_API_URL=https://vinylscan-api-nnlv.onrender.com
```
Note: mobile app also has a runtime server URL override — tap the WiFi indicator
in the ScanScreen header to change it without rebuilding.

## Running locally

```bash
# Backend
cd backend && source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend && npm run dev   # localhost:3000

# Mobile (after code changes)
cd mobile-app && npm run build && npx cap sync ios
# Then Cmd+R in Xcode to install on device
```

## Current status / what was just worked on

### Phone → Desktop scan flow
- Architecture: phone uploads to backend, backend broadcasts via SSE, desktop receives
- No direct phone↔desktop connection — both talk to same backend
- For production: both should point to Render (cloud backend)
- For local dev: phone points to Render, desktop points to localhost (different DBs — known issue to solve)
- Render backend currently returns 500 on login (DB not migrated there — needs investigation)

### Eval ground-truth collection (built, ready to use)
- Admin can scan a record, confirm correct Discogs release, check "Save to eval dataset"
- Image saved to `backend/eval/test_images/{release_id}.jpg`
- Run `build_dataset.py --from-local` then `run_eval.py` for real accuracy numbers

### Mobile app server URL (just built)
- API URL stored in localStorage, overridable at runtime
- Tap WiFi indicator in header → type any IP/URL → Save (no rebuild needed)
- Falls back to `VITE_API_URL` from build if no override stored

## Admin credentials (local)
- Email: `loictrobas1@gmail.com`
- Password: `loicisadmin`
