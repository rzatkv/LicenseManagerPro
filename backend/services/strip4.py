"""Auto-strip 4-byte characters (v3.0).

MySQL `utf8` (3-byte) cannot store 4-byte characters such as emoji; a
single emoji in a text field can break an INSERT. When the
`strip_4byte` setting is "on" (the default), a middleware walks every
JSON request body and removes every character outside the Basic
Multilingual Plane (code point > 0xFFFF) from all string values —
server-side, so no client can sneak one past. Turning the setting
"off" keeps the input untouched (for utf8mb4 databases).
"""
import re

# Any character with a code point above U+FFFF needs 4 bytes in UTF-8.
_FOUR_BYTE_RE = re.compile(r"[\U00010000-\U0010FFFF]")


def strip_4byte(text: str) -> str:
    """Remove 4-byte characters (emoji, etc.) from a string."""
    return _FOUR_BYTE_RE.sub("", text)


def strip_4byte_deep(value):
    """Recursively strip 4-byte characters from all strings in a JSON
    value (dicts, lists, plain strings); other values pass through."""
    if isinstance(value, str):
        return strip_4byte(value)
    if isinstance(value, list):
        return [strip_4byte_deep(item) for item in value]
    if isinstance(value, dict):
        return {key: strip_4byte_deep(item) for key, item in value.items()}
    return value
