from __future__ import annotations

import hashlib

_CACHE: dict[str, str] = {}


def build_cache_key(selected_text: str, jd: str, instruction: str) -> str:
    payload = f"{selected_text}||{jd}||{instruction}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_cached_value(key: str) -> str | None:
    return _CACHE.get(key)


def set_cached_value(key: str, value: str) -> str:
    _CACHE[key] = value
    return value


def clear_cache() -> None:
    _CACHE.clear()
