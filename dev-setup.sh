#!/usr/bin/env bash
# VinylScan local dev setup
# Run once: bash dev-setup.sh
# Then start backend and frontend in separate terminals.

set -e

# ── detect local IP ──────────────────────────────────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
BACKEND_PORT=8000
FRONTEND_PORT=3000
BACKEND_URL="http://${LOCAL_IP}:${BACKEND_PORT}"
FRONTEND_URL="http://${LOCAL_IP}:${FRONTEND_PORT}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              VinylScan Dev Setup                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Detected local IP : ${LOCAL_IP}"
echo "  Backend URL       : ${BACKEND_URL}"
echo "  Frontend URL      : ${FRONTEND_URL}"
echo ""

# ── collect secrets ──────────────────────────────────────────────────────────
read -r -p "  Anthropic API key (sk-ant-...): " ANTHROPIC_KEY
read -r -p "  Discogs Consumer Key          : " DISCOGS_KEY
read -r -p "  Discogs Consumer Secret       : " DISCOGS_SECRET

# Generate a random secret key
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

# ── write backend .env ───────────────────────────────────────────────────────
cat > backend/.env << ENV
DATABASE_URL=postgresql+asyncpg://localhost/vinylscan
SECRET_KEY=${SECRET_KEY}
DISCOGS_CONSUMER_KEY=${DISCOGS_KEY}
DISCOGS_CONSUMER_SECRET=${DISCOGS_SECRET}
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
FRONTEND_URL=${FRONTEND_URL}
BACKEND_URL=${BACKEND_URL}
IMAGES_DIR=/tmp/vinylscan_images
DEV_MODE=true
ENV

echo ""
echo "  ✓ backend/.env written"

# ── write frontend .env.local ────────────────────────────────────────────────
cat > frontend/.env.local << ENV
NEXT_PUBLIC_API_URL=${BACKEND_URL}
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
NEXT_PUBLIC_DEV_MODE=true
ENV

echo "  ✓ frontend/.env.local written"

# ── create postgres db if missing ────────────────────────────────────────────
if command -v createdb &> /dev/null; then
  createdb vinylscan 2>/dev/null && echo "  ✓ postgres db 'vinylscan' created" || echo "  ℹ postgres db 'vinylscan' already exists"
else
  echo "  ⚠  createdb not found — create DB manually: createdb vinylscan"
fi

# ── backend virtualenv ───────────────────────────────────────────────────────
echo ""
echo "  Setting up Python virtualenv..."
cd backend
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
deactivate
cd ..
echo "  ✓ backend deps installed"

# ── frontend deps ────────────────────────────────────────────────────────────
echo "  Installing frontend deps..."
cd frontend
npm install --silent
cd ..
echo "  ✓ frontend deps installed"

# ── update Discogs app callback URL reminder ─────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  IMPORTANT: Update your Discogs app callback URL        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Go to: https://www.discogs.com/settings/developers"
echo "  Set callback URL to: ${BACKEND_URL}/auth/discogs/callback"
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  To start the app:                                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Terminal 1 (backend):"
echo "    cd backend && source .venv/bin/activate"
echo "    uvicorn main:app --host 0.0.0.0 --port ${BACKEND_PORT} --reload"
echo ""
echo "  Terminal 2 (frontend):"
echo "    cd frontend"
echo "    npm run dev -- --hostname 0.0.0.0 --port ${FRONTEND_PORT}"
echo ""
echo "  On your phone (same WiFi):"
echo "    Open: ${FRONTEND_URL}"
echo "    Tap Share → Add to Home Screen  (iOS Safari)"
echo "    or  Menu → Install App           (Android Chrome)"
echo ""
