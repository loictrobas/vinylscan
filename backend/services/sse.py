"""
SSE connection manager — one asyncio.Queue per desktop tab listening.
Broadcast is fire-and-forget to live queues; slow/dead queues don't block the upload.
Also keeps a short replay buffer per user so a desktop tab that connects (or reconnects)
after results were broadcast — e.g. opening the scan page after a phone shooting session —
still sees what it missed instead of losing it silently.
"""
import asyncio
import json
import time
from collections import defaultdict

RECENT_MAX = 200
RECENT_TTL_SECONDS = 1800  # 30 min — covers a long phone shooting session


class SSEManager:
    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._recent: dict[str, list[tuple[float, str]]] = defaultdict(list)

    def subscribe(self, user_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._queues[user_id].append(q)
        return q

    def unsubscribe(self, user_id: str, q: asyncio.Queue) -> None:
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

    def listener_count(self, user_id: str) -> int:
        return len(self._queues.get(user_id, []))

    def recent(self, user_id: str) -> list[str]:
        """Buffered events from the last RECENT_TTL_SECONDS, for replay on (re)connect."""
        now = time.time()
        cutoff = now - RECENT_TTL_SECONDS
        return [d for t, d in self._recent.get(user_id, []) if t >= cutoff]


sse_manager = SSEManager()
