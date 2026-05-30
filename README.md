# VinylScan

Scan vinyl records with AI (Claude Vision) and add them to your Discogs collection instantly.

---

## Architecture

| Layer | Tech | Host |
|-------|------|------|
| Frontend | Next.js 15 App Router + Tailwind | Vercel |
| Backend | FastAPI + SQLAlchemy async | Render (free tier) |
| Database | PostgreSQL | Render (free tier) |
| AI | Anthropic Claude claude-sonnet-4-20250514 | Anthropic API |
| Auth | Discogs OAuth 1.0a | — |
| Payments | Stripe one-time payments | — |

> **Render free tier note:** The backend spins down after ~15 minutes of inactivity. First request after idle takes ~30s to cold-start. Add a `/health` ping (e.g. via UptimeRobot) to keep it warm if needed.

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL (local or Render)
- Discogs developer account
- Anthropic API key
- Stripe account

---

## Step 1: Register a Discogs App

1. Go to [discogs.com/settings/developers](https://www.discogs.com/settings/developers)
2. Click **Create an Application**
3. Fill in:
   - **Application Name**: VinylScan
   - **Callback URL**: `http://localhost:8000/auth/discogs/callback` (for local dev)  
     For production: `https://your-backend.onrender.com/auth/discogs/callback`
4. Copy **Consumer Key** and **Consumer Secret** → add to backend `.env`

---

## Step 2: Set Up Stripe

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Copy your **Publishable Key** and **Secret Key**
3. Set up a webhook:
   - Endpoint URL: `https://your-backend.onrender.com/billing/webhook`
   - Events to listen for: `payment_intent.succeeded`
   - Copy the **Webhook Secret**
4. For local development, use [Stripe CLI](https://stripe.com/docs/stripe-cli):
   ```bash
   stripe listen --forward-to localhost:8000/billing/webhook
   ```

---

## Step 3: Backend Setup

```bash
cd vinylscan/backend

# Create virtualenv
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env from example
cp .env.example .env
# Edit .env with your values

# Create database
createdb vinylscan  # or use your Render DATABASE_URL

# Run
uvicorn main:app --reload --port 8000
```

### Backend `.env`

```env
DATABASE_URL=postgresql+asyncpg://localhost/vinylscan
SECRET_KEY=your-random-32-char-secret-key
DISCOGS_CONSUMER_KEY=your_key
DISCOGS_CONSUMER_SECRET=your_secret
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
IMAGES_DIR=/tmp/vinylscan_images
```

---

## Step 4: Frontend Setup

```bash
cd vinylscan/frontend

npm install

cp .env.local.example .env.local
# Edit .env.local

npm run dev
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Deployment

### Backend → Render

1. Create a new **Web Service** on Render
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `vinylscan/backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add all env vars from `.env.example`
5. Create a **PostgreSQL** database on Render, copy the **External Database URL** → `DATABASE_URL`
6. Update `DISCOGS_CONSUMER_KEY` callback URL to your Render domain

### Frontend → Vercel

1. Import the repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** to `vinylscan/frontend`
3. Add env vars:
   - `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`
4. Deploy

---

## Credit System

- New users start with **10 free credits**
- On the 1st of each month: if balance < 10, it's topped to 10 (not stacked)
- 1 scan = 1 credit, deducted at **confirmation or skip** (not on upload)
- Auto-add (confidence ≥ 95%) deducts 1 credit immediately
- If Claude fails to identify a record, **no credit is deducted**

### Credit Packs (Stripe)

| Pack | Credits | Price |
|------|---------|-------|
| Small | 25 | $1.99 |
| Medium | 75 | $4.99 |
| Large | 200 | $9.99 |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/auth/discogs/login` | — | Start OAuth |
| GET | `/auth/discogs/callback` | — | OAuth callback |
| GET | `/auth/me` | ✓ | Current user |
| POST | `/auth/logout` | ✓ | Log out |
| POST | `/scan/upload` | ✓ | Upload + identify |
| POST | `/scan/{id}/confirm` | ✓ | Confirm a match |
| POST | `/scan/{id}/skip` | ✓ | Skip |
| GET | `/scan/history` | ✓ | Paginated history |
| GET | `/dashboard/stats` | ✓ | Stats + recent txns |
| GET | `/billing/packs` | ✓ | Available packs |
| POST | `/billing/create-payment` | ✓ | Stripe intent |
| POST | `/billing/webhook` | — | Stripe webhook |

Every authenticated response includes `X-Credit-Balance` header for live sync.

---

## Local Dev Tips

- Use `stripe listen --forward-to localhost:8000/billing/webhook` for Stripe webhooks
- Images are stored in `IMAGES_DIR` (default `/tmp/vinylscan_images`) — ephemeral on Render. For production, use S3/Cloudflare R2.
- OAuth request tokens are stored in-memory. For multi-instance production, use Redis.
