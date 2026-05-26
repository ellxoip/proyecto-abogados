"""Redis-backed SSE broadcaster — works across multiple uvicorn workers."""
import asyncio
import json
import logging
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_CHANNEL = "wa_events"
REDIS_URL = "redis://localhost:6379/0"


class WaBroadcaster:
    def __init__(self) -> None:
        self._queues: list[asyncio.Queue] = []
        self._redis: aioredis.Redis | None = None
        self._listener_task: asyncio.Task | None = None

    # ── lifecycle ──────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._redis = aioredis.from_url(REDIS_URL, decode_responses=True)
        self._listener_task = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.aclose()

    # ── pub/sub listener (runs once per worker) ───────────────────────────

    async def _listen(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(REDIS_CHANNEL)
        try:
            async for raw in pubsub.listen():
                if raw["type"] != "message":
                    continue
                payload: str = raw["data"]
                dead: list[asyncio.Queue] = []
                for q in list(self._queues):
                    try:
                        q.put_nowait(payload)
                    except asyncio.QueueFull:
                        dead.append(q)
                for q in dead:
                    self.unsubscribe(q)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("WaBroadcaster listener error: %s", exc)
        finally:
            await pubsub.unsubscribe(REDIS_CHANNEL)
            await pubsub.aclose()

    # ── SSE subscriber management ─────────────────────────────────────────

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._queues.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._queues.remove(q)
        except ValueError:
            pass

    # ── broadcast (publishes to Redis → all workers receive via _listen) ──

    async def broadcast(self, event_type: str, data: dict[str, Any]) -> None:
        if not self._redis:
            return
        payload = json.dumps({"type": event_type, **data})
        try:
            await self._redis.publish(REDIS_CHANNEL, payload)
        except Exception as exc:
            logger.error("WaBroadcaster publish error: %s", exc)


wa_broadcaster = WaBroadcaster()
