import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db
from routers import auth, billing, dashboard, scan

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
IMAGES_DIR = os.getenv("IMAGES_DIR", "/tmp/vinylscan_images")
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    for attempt in range(5):
        try:
            await init_db()
            break
        except Exception as e:
            if attempt == 4:
                print(f"[startup] DB init failed after 5 attempts: {e}", flush=True)
            else:
                print(f"[startup] DB not ready (attempt {attempt+1}/5), retrying in 3s: {e}", flush=True)
                await asyncio.sleep(3)
    os.makedirs(IMAGES_DIR, exist_ok=True)
    yield


app = FastAPI(title="VinylScan API", version="1.0.0", lifespan=lifespan)

# In dev mode allow any local-network origin (credentials + "*" is invalid per spec,
# so we use allow_origin_regex to match 192.168.x.x and 10.x.x.x ranges)
_cors_origins = [FRONTEND_URL, "http://localhost:3000"]
_cors_origin_regex = (
    r"http://(192\.168|10\.\d+|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+(:\d+)?"
    if DEV_MODE
    else None
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

app.include_router(auth.router)
app.include_router(scan.router)
app.include_router(dashboard.router)
app.include_router(billing.router)


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}


# Serve uploaded images
os.makedirs(IMAGES_DIR, exist_ok=True)
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")
