"""Extended sensor endpoints.

GET /sensors/latest?mode=...&equipment_id=... — generate one reading, persist,
    run early-warning analysis, create/update maintenance items and alerts, broadcast via WS.
GET /sensors/history?limit=N — recent stored readings.
GET /sensors/thresholds — current configurable thresholds.
POST /sensors/thresholds — update thresholds (in-memory for demo; extend to DB for production).
"""
from __future__ import annotations

import random
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, MaintenanceItem, SensorData
from ..schemas import SensorReading, ThresholdConfig
from ..ml.early_warning import analyze
from ..ws_manager import manager

router = APIRouter(prefix="/sensors", tags=["sensors"])

# In-memory threshold store — survives the process lifetime.
# For production, persist to a settings table.
_current_thresholds = ThresholdConfig()


def _generate(mode: str, equipment_id: str = "T1-400kV") -> SensorReading:
    """Match the frontend simulator so demos behave consistently.
    Extended with all new sensor parameters.
    """
    def j(base: float, spread: float) -> float:
        return round(base + (random.random() - 0.5) * spread, 2)

    r = SensorReading(
        timestamp=datetime.utcnow(),
        equipment_id=equipment_id,
        temperature=j(55, 15),
        voltage=j(400, 6),
        current=j(550, 250),
        oil_level=j(78, 10),
        humidity=j(38, 15),
        vibration=j(2, 1.5),
        oil_temperature=j(50, 8),
        winding_temperature=j(65, 10),
        oil_leakage=0,
        pressure=j(0.5, 0.2),
        cooling_fan_status=1,
        cooling_pump_status=1,
        oil_condition=j(85, 5),
        load_factor=j(0.6, 0.2),
    )

    if mode == "overheat":
        r.temperature = j(92, 10)
        r.oil_level = j(58, 6)
        r.oil_temperature = j(88, 8)
        r.winding_temperature = j(105, 8)
        r.cooling_fan_status = 0  # fan fault contributed to overheat

    elif mode == "overload":
        r.current = j(1050, 120)
        r.temperature = j(82, 8)
        r.winding_temperature = j(98, 8)
        r.load_factor = j(0.92, 0.05)

    elif mode == "oil_leak":
        r.oil_level = j(48, 6)
        r.temperature = j(78, 8)
        r.oil_temperature = j(80, 6)
        r.oil_leakage = random.choice([1, 1, 2])  # suspected or confirmed
        r.pressure = j(0.08, 0.05)  # conservator pressure dropping

    elif mode == "insulation":
        r.humidity = j(75, 10)
        r.vibration = j(6, 1.5)
        r.oil_condition = j(38, 8)

    elif mode == "cooling_fault":
        r.cooling_fan_status = 0
        r.cooling_pump_status = 0
        r.temperature = j(78, 8)
        r.oil_temperature = j(82, 6)

    elif mode == "pressure_fault":
        r.pressure = j(1.4, 0.2)
        r.vibration = j(5.5, 1.0)

    return r


async def _process_early_warnings(reading: SensorReading, db: Session) -> list[dict]:
    """Analyse reading, persist new alerts/maintenance items, broadcast via WS.
    Returns list of new alert dicts for the response.
    """
    findings = analyze(reading, _current_thresholds)
    new_alerts = []

    for f in findings:
        # Avoid duplicate open MaintenanceItem rows for the same issue
        existing_mi = (
            db.query(MaintenanceItem)
            .filter(
                MaintenanceItem.fingerprint == f.fingerprint,
                MaintenanceItem.status != "Completed",
            )
            .first()
        )
        if not existing_mi:
            mi = MaintenanceItem(
                equipment_id=reading.equipment_id,
                parameter=f.parameter,
                current_value=f.current_value,
                configured_limit=f.configured_limit,
                unit=f.unit,
                severity=f.severity,
                alert_type=f.alert_type,
                reason=f.reason,
                trend_description=f.trend_description,
                recommended_action=f.recommended_action,
                priority=f.priority,
                inspection_timeframe=f.inspection_timeframe,
                fingerprint=f.fingerprint,
                model_confidence=f.model_confidence,
            )
            db.add(mi)

        # Avoid repeated alert notifications — one open alert per fingerprint
        existing_alert = (
            db.query(Alert)
            .filter(
                Alert.fingerprint == f.fingerprint,
                Alert.resolved == False,  # noqa: E712
            )
            .first()
        )
        if not existing_alert:
            msg = f"{f.alert_type.upper()}: {f.parameter} — {f.reason[:200]}"
            alert = Alert(
                severity=f.severity,
                message=msg,
                equipment_id=reading.equipment_id,
                parameter=f.parameter,
                alert_type=f.alert_type,
                fingerprint=f.fingerprint,
            )
            db.add(alert)
            db.flush()  # get alert.id for WS payload

            alert_payload = {
                "event": "new_alert",
                "id": alert.id,
                "timestamp": alert.timestamp.isoformat(),
                "severity": alert.severity,
                "message": msg,
                "equipment_id": alert.equipment_id,
                "parameter": alert.parameter,
                "alert_type": alert.alert_type,
            }
            new_alerts.append(alert_payload)

            # Dispatch SMS to authorized recipients if configured
            try:
                from ..sms import dispatch_alert_sms
                dispatch_alert_sms(
                    alert=alert,
                    issue_desc=f.reason,
                    action=f.recommended_action,
                    priority=f.priority,
                    db=db,
                    status_override=f.trend_description,
                )
            except Exception as e:
                # Safe failure: SMS error must never block sensor processing or WS broadcast
                pass

    db.commit()

    # Broadcast to all connected WS clients
    for payload in new_alerts:
        await manager.broadcast(payload)

    return new_alerts


@router.get("/thresholds", response_model=ThresholdConfig)
def get_thresholds() -> ThresholdConfig:
    return _current_thresholds


@router.post("/thresholds", response_model=ThresholdConfig)
def update_thresholds(cfg: ThresholdConfig) -> ThresholdConfig:
    global _current_thresholds
    _current_thresholds = cfg
    return _current_thresholds


@router.get("/latest", response_model=SensorReading)
async def latest(
    mode: str = Query("normal"),
    equipment_id: str = Query("T1-400kV"),
    db: Session = Depends(get_db),
) -> SensorReading:
    reading = _generate(mode, equipment_id)
    row = SensorData(**reading.model_dump())
    db.add(row)
    db.commit()

    # Run early-warning analysis and broadcast alerts
    await _process_early_warnings(reading, db)

    return reading


@router.get("/history", response_model=List[SensorReading])
def history(limit: int = 50, db: Session = Depends(get_db)) -> List[SensorReading]:
    rows = db.query(SensorData).order_by(desc(SensorData.timestamp)).limit(limit).all()
    return [SensorReading.model_validate(r, from_attributes=True) for r in rows[::-1]]
