"""Simple in-process SSE broadcaster for WhatsApp real-time events."""
import asyncio
import json
from typing import Any

class WaBroadcaster:
    def __init__(self) -> None:
        self._queues: list[asyncio.Queue] = []

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._queues.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._queues.remove(q)
        except ValueError:
            pass

    async def broadcast(self, event_type: str, data: dict[str, Any]) -> None:
        if not self._queues:
            return
        payload = json.dumps({"type": event_type, **data})
        dead: list[asyncio.Queue] = []
        for q in self._queues:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.unsubscribe(q)

wa_broadcaster = WaBroadcaster()
