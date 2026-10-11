"""Seed the database with the default operator account (idempotent)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .auth import hash_password
from .models import User

DEFAULT_USERNAME = "operator"
DEFAULT_PASSWORD = "substation"


def seed_default_user(db: Session) -> None:
    if db.query(User).filter_by(username=DEFAULT_USERNAME).first():
        return
    db.add(User(username=DEFAULT_USERNAME, password_hash=hash_password(DEFAULT_PASSWORD)))
    db.commit()
