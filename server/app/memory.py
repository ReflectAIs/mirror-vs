"""Per-user memory store for Mirror XR.

In-memory implementation backed by a thread-safe deque per user.
This satisfies the "memory lookup" leg of the coordinator loop and is
trivially swappable for a persistent store (SQLite / Qdrant / Redis) later.
"""

import threading
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Dict, Deque, List, Optional


class MemoryStore:
    """Holds a rolling transcript per user_id."""

    def __init__(self, history_size: int = 40) -> None:
        self._history_size = history_size
        self._history: Dict[str, Deque[Dict[str, Any]]] = defaultdict(
            lambda: deque(maxlen=history_size)
        )
        self._lock = threading.Lock()

    def add(self, user_id: str, role: str, text: str, timestamp: Optional[str] = None) -> None:
        entry = {
            "role": role,
            "text": text,
            "timestamp": timestamp
            or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        with self._lock:
            self._history[user_id].append(entry)

    def recent(self, user_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        with self._lock:
            items = list(self._history.get(user_id, []))
        return items[-limit:] if limit else items

    def context_for(self, user_id: str, limit: int = 6) -> str:
        """A compact textual snapshot of recent history, for prompt-building."""
        recent = self.recent(user_id, limit)
        if not recent:
            return "No prior conversation yet."
        return "\n".join(
            f"[{entry['role']}] {entry['text']}" for entry in recent
        )


# Module-level singleton shared across the app.
memory = MemoryStore()
