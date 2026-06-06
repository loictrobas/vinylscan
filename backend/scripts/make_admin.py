"""
One-time script: grant admin to an existing user by Discogs username or email.

Usage:
  python scripts/make_admin.py --discogs loictrobas
  python scripts/make_admin.py --email you@example.com
"""
import asyncio
import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import select
from database import AsyncSessionLocal
from models import User


async def main(discogs: str | None, email: str | None):
    async with AsyncSessionLocal() as db:
        if discogs:
            result = await db.execute(select(User).where(User.discogs_username == discogs))
        else:
            result = await db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        if not user:
            print(f"[error] User not found")
            sys.exit(1)
        user.is_admin = True
        await db.commit()
        print(f"[ok] {user.discogs_username or user.email} is now admin (id={user.id})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--discogs", help="Discogs username")
    parser.add_argument("--email", help="Email address")
    args = parser.parse_args()
    if not args.discogs and not args.email:
        parser.print_help()
        sys.exit(1)
    asyncio.run(main(args.discogs, args.email))
