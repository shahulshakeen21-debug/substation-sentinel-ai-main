"""WebSocket connection manager for real-time notifications.

Maintains a registry of active WebSocket connections (one per authenticated
session). When a new alert is issued the backend broadcasts it to all connected
clients instantly — avoiding repeated notifications for the same fingerprint.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Thread-safe(ish) registry of active WebSocket connections."""

    def __init__(self):
        # Maps username -> list of WebSocket connections (multiple tabs)
        self._connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, username: str) -> None:
        await websocket.accept()
        self._connections.setdefault(username, []).append(websocket)
        logger.info("WS connect: %s (%d total)", username, self.active_count)

    def disconnect(self, websocket: WebSocket, username: str) -> None:
        conns = self._connections.get(username, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(username, None)
        logger.info("WS disconnect: %s (%d total)", username, self.active_count)

    @property
    def active_count(self) -> int:
        return sum(len(v) for v in self._connections.values())

    async def broadcast(self, data: Any) -> None:
        """Send a JSON payload to every connected client."""
        payload = json.dumps(data, default=str)
        dead: list[tuple[str, WebSocket]] = []
        for username, conns in list(self._connections.items()):
            for ws in list(conns):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append((username, ws))
        for username, ws in dead:
            self.disconnect(ws, username)

    async def send_to_user(self, username: str, data: Any) -> None:
        """Send a JSON payload to a specific user's connections."""
        payload = json.dumps(data, default=str)
        for ws in list(self._connections.get(username, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(ws, username)


# Singleton — imported by routers
manager = ConnectionManager()
