import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv(override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import accessories, admin, auth, billing, benchmark, catalog, consignments, dashboard, discogs, scan, store
from routers import eval_router

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
IMAGES_DIR = os.getenv("IMAGES_DIR", "/tmp/vinylscan_images")
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"


def _run_migrations():
    """Run alembic upgrade head synchronously at startup."""
    from alembic.config import Config
    from alembic import command
    import pathlib

    alembic_cfg = Config(str(pathlib.Path(__file__).parent / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(pathlib.Path(__file__).parent / "alembic"))
    command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    for attempt in range(5):
        try:
            await asyncio.get_event_loop().run_in_executor(None, _run_migrations)
            break
        except Exception as e:
            if attempt == 4:
                print(f"[startup] DB migration failed after 5 attempts: {e}", flush=True)
            else:
                print(f"[startup] DB not ready (attempt {attempt+1}/5), retrying in 3s: {e}", flush=True)
                await asyncio.sleep(3)
    os.makedirs(IMAGES_DIR, exist_ok=True)
    await _seed_admin()
    yield


async def _seed_admin():
    """Ensure the hardcoded super-admin account always exists and is admin."""
    import hashlib, binascii, secrets as _sec
    from database import AsyncSessionLocal
    from models import User
    from sqlalchemy import select

    ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "loictrobas1@gmail.com")
    ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "loicisadmin")

    def _hash(pw: str) -> str:
        salt = os.urandom(16)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 260_000)
        return binascii.hexlify(salt).decode() + ":" + binascii.hexlify(dk).decode()

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
            user = result.scalar_one_or_none()
            if user is None:
                user = User(
                    email=ADMIN_EMAIL,
                    password_hash=_hash(ADMIN_PASSWORD),
                    display_name="Admin",
                    is_admin=True,
                    is_active=True,
                    credits=9999,
                    last_free_topup_month="",
                )
                db.add(user)
                print(f"[startup] created admin user: {ADMIN_EMAIL}", flush=True)
            else:
                # Always ensure is_admin=True and password is set
                user.is_admin = True
                user.is_active = True
                if not user.password_hash:
                    user.password_hash = _hash(ADMIN_PASSWORD)
                print(f"[startup] admin user confirmed: {ADMIN_EMAIL}", flush=True)
            await db.commit()
    except Exception as e:
        print(f"[startup] admin seed failed: {e}", flush=True)


app = FastAPI(title="VinylScan API", version="1.0.0", lifespan=lifespan, redirect_slashes=False)

# Allow production frontend + all Vercel preview deployments + local dev
_cors_origins = [FRONTEND_URL, "http://localhost:3000", "capacitor://localhost", "ionic://localhost"]
_cors_origin_regex = (
    r"http://(192\.168|10\.\d+|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+(:\d+)?"
    if DEV_MODE
    else r"https://[a-zA-Z0-9-]+-vinylapp\.vercel\.app"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Credit-Balance"],
)

app.include_router(admin.router)
app.include_router(benchmark.router)
app.include_router(auth.router)
app.include_router(scan.router)
app.include_router(catalog.router)
app.include_router(dashboard.router)
app.include_router(billing.router)
app.include_router(discogs.router)
app.include_router(store.router)
app.include_router(consignments.router)
app.include_router(accessories.router)
app.include_router(eval_router.router)


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}


# Serve uploaded images
os.makedirs(IMAGES_DIR, exist_ok=True)
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")
