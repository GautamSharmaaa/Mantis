from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4


def generate_uuid() -> str:
    return str(uuid4())


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()
