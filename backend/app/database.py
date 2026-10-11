"""SQLAlchemy engine + session factory.

Reads DATABASE_URL from the environment (`.env`). Falls back to a local
SQLite file so the project starts with zero config for the demo.
"""
from __future__ import annotations

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./digital_twin.db")

# SQLite needs a special flag for multi-threaded FastAPI request handling.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def get_db():
    """FastAPI dependency: hand out a session, close it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
