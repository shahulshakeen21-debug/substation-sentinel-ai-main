"""Password hashing helpers (direct bcrypt to avoid passlib wrap bug on Python 3.12+)."""
from __future__ import annotations

import bcrypt


def hash_password(raw: str) -> str:
    pwd_bytes = raw[:72].encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        pwd_bytes = raw[:72].encode("utf-8")
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False
