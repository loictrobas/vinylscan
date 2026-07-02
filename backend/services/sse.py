"""
SSE broadcast for the phone→desktop scan flow.

Two interchangeable backends behind the same async interface:

- InMemorySSEManager (default): one asyncio.Queue per desktop tab, plus a
  short per-user replay buffer so a tab that (re)connects after results were
  broadcast still sees what it missed. Single-process only.
- RedisSSEManager (activated by REDIS_URL): pub/sub channel per user, replay
  buffer in a capped Redis list with TTL. Works across multiple workers /
  instances — required the day the backend scales past one process.

Broadcast is fire-and-forget: slow/dead consumers drop events rather than
block the upload path.
"""
import asyncio
import json
import logging
import os
import time
from collections import defaultdict

logger = logging.getLogger(__name__)

RECENT_MAX = 200
RECENT_TTL_SECONDS = 1800  # 30 min — covers a long phone shooting session


class InMemorySSEManager:
    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._recent: dict[str, list[tuple[float, str]]] = defaultdict(list)

    async def subscribe(self, user_id: str) -> "_MemorySubscription":
        # Bounded: a hung tab that stops consuming drops events (broadcast's
        # QueueFull handler) instead of growing without limit
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._queues[user_id].append(q)
        return _MemorySubscription(self, user_id, q)

    def _unsubscribe(self, user_id: str, q: asyncio.Queue) -> None:
        try:
            self._queues[user_id].remove(q)
        except ValueError:
            pass

    async def broadcast(self, user_id: str, event: dict) -> None:
        data = json.dumps(event)
        now = time.time()
        cutoff = now - RECENT_TTL_SECONDS
        buf = [(t, d) for t, d in self._recent[user_id] if t >= cutoff]
        buf.append((now, data))
        self._recent[user_id] = buf[-RECENT_MAX:]

        for q in list(self._queues.get(user_id, [])):
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass  # tab is slow/dead — drop rather than block

    async def recent(self, user_id: str) -> list[str]:
        """Buffered events from the last RECENT_TTL_SECONDS, for replay on (re)connect."""
        now = time.time()
        cutoff = now - RECENT_TTL_SECONDS
        return [d for t, d in self._recent.get(user_id, []) if t >= cutoff]


class _MemorySubscription:
    def __init__(self, manager: InMemorySSEManager, user_id: str, q: asyncio.Queue) -> None:
        self._manager = manager
        self._user_id = user_id
        self._q = q

    async def get(self) -> str:
        return await self._q.get()

    async def close(self) -> None:
        self._manager._unsubscribe(self._user_id, self._q)


class RedisSSEManager:
    def __init__(self, url: str) -> None:
        import redis.asyncio as aioredis  # optional dep — only needed with REDIS_URL
        self._redis = aioredis.from_url(url, decode_responses=True)

    @staticmethod
    def _channel(user_id: str) -> str:
        return f"sse:{user_id}"

    @staticmethod
    def _recent_key(user_id: str) -> str:
        return f"sse:recent:{user_id}"

    async def subscribe(self, user_id: str) -> "_RedisSubscription":
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(self._channel(user_id))
        return _RedisSubscription(pubsub)

    async def broadcast(self, user_id: str, event: dict) -> None:
        data = json.dumps(event)
        try:
            key = self._recent_key(user_id)
            async with self._redis.pipeline(transaction=False) as pipe:
                pipe.publish(self._channel(user_id), data)
                pipe.rpush(key, json.dumps([time.time(), data]))
                pipe.ltrim(key, -RECENT_MAX, -1)
                pipe.expire(key, RECENT_TTL_SECONDS)
                await pipe.execute()
        except Exception as e:
            logger.error("Redis SSE broadcast failed for user %s: %s", user_id, e)

    async def recent(self, user_id: str) -> list[str]:
        try:
            raw = await self._redis.lrange(self._recent_key(user_id), 0, -1)
        except Exception as e:
            logger.error("Redis SSE recent() failed for user %s: %s", user_id, e)
            return []
        cutoff = time.time() - RECENT_TTL_SECONDS
        out = []
        for entry in raw:
            try:
                ts, data = json.loads(entry)
                if ts >= cutoff:
                    out.append(data)
            except (ValueError, TypeError):
                continue
        return out


class _RedisSubscription:
    def __init__(self, pubsub) -> None:
        self._pubsub = pubsub

    async def get(self) -> str:
        while True:
            msg = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=None)
            if msg is not None and msg.get("type") == "message":
                return msg["data"]

    async def close(self) -> None:
        try:
            await self._pubsub.unsubscribe()
            await self._pubsub.close()
        except Exception:
            pass


_REDIS_URL = os.getenv("REDIS_URL", "")
if _REDIS_URL:
    sse_manager = RedisSSEManager(_REDIS_URL)
    logger.info("SSE backend: Redis (%s)", _REDIS_URL.split("@")[-1])
else:
    sse_manager = InMemorySSEManager()
