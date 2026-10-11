"""Inference: turn a SensorReading into a PredictionOut.

If the trained Random Forest (model.pkl) is missing, fall back to a
rule-based classifier so the API stays usable before `train.py` runs.

The rule-based fallback uses the original 6 core features to maintain
backward compatibility. The ML model, if present, will use the same 6 features
from training — extended features are handled by the early_warning engine.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import joblib
import numpy as np

from ..schemas import HealthStatus, PredictionOut, SensorReading

MODEL_PATH = Path(__file__).with_name("model.pkl")

_cache: dict | None = None


def _load():
    global _cache
    if _cache is not None:
        return _cache
    if MODEL_PATH.exists():
        _cache = joblib.load(MODEL_PATH)
    else:
        _cache = {}
    return _cache


def _reasons(r: SensorReading) -> Tuple[List[str], int]:
    """Explain which sensors are outside their envelope + a severity score."""
    reasons: List[str] = []
    score = 0

    def bump(name: str, value: float, warn: float, crit: float, direction: str):
        nonlocal score
        bad = 0
        if direction == "high":
            bad = 2 if value >= crit else 1 if value >= warn else 0
        else:
            bad = 2 if value <= crit else 1 if value <= warn else 0
        if bad:
            reasons.append(f"{name} {direction} ({value})")
        score += bad

    bump("Temperature", r.temperature, 80, 95, "high")
    bump("Voltage", r.voltage, 410, 420, "high")
    bump("Current", r.current, 950, 1100, "high")
    bump("Oil level", r.oil_level, 55, 45, "low")
    bump("Humidity", r.humidity, 65, 80, "high")
    bump("Vibration", r.vibration, 5, 7.5, "high")

    # Extended checks (no score impact — handled by early_warning engine)
    if r.cooling_fan_status == 0:
        reasons.append("Cooling fan fault")
        score += 1
    if r.cooling_pump_status == 0:
        reasons.append("Cooling pump fault")
        score += 1
    if r.oil_leakage >= 1:
        reasons.append(f"Oil leakage {'suspected' if r.oil_leakage == 1 else 'indicated'}")
        score += 1

    return reasons, score


def _recommend(status: HealthStatus) -> str:
    if status == "Critical":
        return "Isolate the bay, dispatch maintenance crew immediately, inspect cooling & insulation."
    if status == "Warning":
        return "Schedule inspection within 24h. Verify cooling fans, oil level and load balance."
    return "Continue routine monitoring. No action required."


def predict_reading(r: SensorReading) -> PredictionOut:
    reasons, score = _reasons(r)
    cache = _load()

    if cache.get("model"):
        model = cache["model"]
        features = cache["features"]
        x = np.array([[getattr(r, f, 0.0) for f in features]])
        status = str(model.predict(x)[0])
        classes = list(model.classes_)
        probs = model.predict_proba(x)[0]
        failure = float(sum(p for c, p in zip(classes, probs) if c != "Healthy"))
        failure_probability = round(min(1.0, failure), 2)
        confidence = round(float(max(probs)), 2)
    else:
        status = "Critical" if score >= 3 else "Warning" if score >= 1 else "Healthy"
        failure_probability = round(min(1.0, score / 6), 2)
        confidence = None

    return PredictionOut(
        status=status,  # type: ignore[arg-type]
        failure_probability=failure_probability,
        recommendation=_recommend(status),  # type: ignore[arg-type]
        reasons=reasons,
        model_confidence=confidence,
    )
