"""
Accessories — non-record sellable items (turntables, sleeves, slipmats, etc).
Kept as their own entity rather than overloading Record, since they have a
real stock count instead of being unique 1-of-1 items.
"""
import asyncio
import os
import uuid
from functools import partial

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Accessory, User
from routers.auth import get_current_user
from routers.scan import _set_credit_header

router = APIRouter(prefix="/accessories", tags=["accessories"])

CATEGORIES = ["Turntables", "Cartridges", "Care", "Sleeves", "Slipmats", "Storage", "Other"]

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")


# ── Schemas ───────────────────────────────────────────────────────────────────

class AccessoryOut(BaseModel):
    id: str
    name: str
    category: str
    description: str | None
    price: float | None
    stock_quantity: int
    cover_image_url: str | None
    is_listed: bool
    created_at: str


class CreateAccessoryRequest(BaseModel):
    name: str
    category: str = "Other"
    description: str | None = None
    price: float | None = None
    stock_quantity: int = 0
    is_listed: bool = True


class UpdateAccessoryRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None
    price: float | None = None
    stock_quantity: int | None = None
    is_listed: bool | None = None


def _out(a: Accessory) -> AccessoryOut:
    return AccessoryOut(
        id=str(a.id),
        name=a.name,
        category=a.category,
        description=a.description,
        price=float(a.price) if a.price is not None else None,
        stock_quantity=a.stock_quantity,
        cover_image_url=a.cover_image_url,
        is_listed=a.is_listed,
        created_at=a.created_at.isoformat(),
    )


def _validate_category(category: str) -> None:
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Use one of: {CATEGORIES}")


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AccessoryOut])
async def list_accessories(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Accessory).where(Accessory.user_id == user.id).order_by(Accessory.created_at.desc())
    )
    _set_credit_header(response, user)
    return [_out(a) for a in result.scalars().all()]


@router.post("", response_model=AccessoryOut, status_code=201)
async def create_accessory(
    body: CreateAccessoryRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _validate_category(body.category)
    a = Accessory(
        user_id=user.id,
        name=body.name,
        category=body.category,
        description=body.description,
        price=body.price,
        stock_quantity=body.stock_quantity,
        is_listed=body.is_listed,
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    _set_credit_header(response, user)
    return _out(a)


@router.get("/{accessory_id}", response_model=AccessoryOut)
async def get_accessory(
    accessory_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Accessory).where(Accessory.id == accessory_id, Accessory.user_id == user.id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accessory not found")
    return _out(a)


@router.patch("/{accessory_id}", response_model=AccessoryOut)
async def update_accessory(
    accessory_id: uuid.UUID,
    body: UpdateAccessoryRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Accessory).where(Accessory.id == accessory_id, Accessory.user_id == user.id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accessory not found")
    if body.category is not None:
        _validate_category(body.category)
    for field in ("name", "category", "description", "price", "stock_quantity", "is_listed"):
        val = getattr(body, field)
        if val is not None:
            setattr(a, field, val)
    await db.commit()
    await db.refresh(a)
    _set_credit_header(response, user)
    return _out(a)


@router.delete("/{accessory_id}", status_code=204)
async def delete_accessory(
    accessory_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Accessory).where(Accessory.id == accessory_id, Accessory.user_id == user.id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accessory not found")
    await db.delete(a)
    await db.commit()


# ── Image upload ──────────────────────────────────────────────────────────────

def _upload_image_sync(data: bytes, public_id: str) -> str:
    result = cloudinary.uploader.upload(
        data,
        public_id=public_id,
        folder="vinylscan/accessory-images",
        overwrite=True,
        resource_type="image",
        transformation=[{"width": 800, "height": 800, "crop": "limit", "quality": "auto", "fetch_format": "auto"}],
    )
    return result["secure_url"]


@router.post("/{accessory_id}/image", response_model=AccessoryOut)
async def upload_accessory_image(
    accessory_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not CLOUDINARY_CLOUD_NAME:
        raise HTTPException(status_code=503, detail="Image uploads not configured (missing CLOUDINARY_CLOUD_NAME)")
    result = await db.execute(select(Accessory).where(Accessory.id == accessory_id, Accessory.user_id == user.id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accessory not found")

    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    loop = asyncio.get_event_loop()
    try:
        url = await loop.run_in_executor(None, partial(_upload_image_sync, data, f"accessory_{a.id}"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    a.cover_image_url = url
    await db.commit()
    await db.refresh(a)
    return _out(a)


@router.delete("/{accessory_id}/image", response_model=AccessoryOut)
async def delete_accessory_image(
    accessory_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Accessory).where(Accessory.id == accessory_id, Accessory.user_id == user.id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accessory not found")
    a.cover_image_url = None
    await db.commit()
    await db.refresh(a)
    return _out(a)
