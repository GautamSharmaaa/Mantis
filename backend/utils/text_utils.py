from __future__ import annotations

import re

_ACTION_VERBS = {
    "analyzed",
    "architected",
    "automated",
    "built",
    "created",
    "delivered",
    "designed",
    "developed",
    "drove",
    "enhanced",
    "implemented",
    "improved",
    "launched",
    "led",
    "managed",
    "optimized",
    "streamlined",
}


def clean_text(text: str | None) -> str:
    if text is None:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def validate_bullet_length(text: str | None) -> bool:
    cleaned = clean_text(text)
    if not cleaned:
        return False
    word_count = len(cleaned.split(" "))
    return 5 <= word_count <= 25


def starts_with_action_verb(text: str | None) -> bool:
    cleaned = clean_text(text)
    if not cleaned:
        return False
    first_word = re.sub(r"[^a-zA-Z-]", "", cleaned.split(" ", maxsplit=1)[0]).lower()
    return first_word in _ACTION_VERBS
