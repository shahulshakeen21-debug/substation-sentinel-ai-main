"""FastAPI application entry point.

- Creates tables on startup
- Seeds the default operator account
- Wires up CORS for the local Vite frontend
- Mounts every router under /auth, /sensors, /predict, /alerts, /reports, /maintenance
- Provides WebSocket endpoint at /alerts/ws for real-time notifications
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers import alerts, auth, predictions, reports, sensors
from .routers import maintenance, sms_router
from .seed import seed_default_user

load_dotenv()

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Create all tables (safe if they already exist) and seed default user.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_default_user(db)
    yield


app = FastAPI(
    title="AI Digital Twin — EHV 400/220 kV Substation",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(auth.router)
app.include_router(sensors.router)
app.include_router(predictions.router)
app.include_router(alerts.router)
app.include_router(reports.router)
app.include_router(maintenance.router)
app.include_router(sms_router.router)



@app.get("/")
def root():
    return {
        "service": "digital-twin-api",
        "version": "2.0.0",
        "status": "ok",
        "docs": "/docs",
        "features": [
            "early-warning-system",
            "predictive-maintenance",
            "websocket-notifications",
            "per-user-read-tracking",
        ],
    }
