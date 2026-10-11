"""POST /predict — runs a sensor reading through the RandomForest model.
Extended to also call the early-warning engine and persist detailed findings.

The model is trained by `python -m app.ml.train`. If model.pkl is missing
we fall back to the rule-based classifier so the API never breaks.
Predictions and any resulting alerts are persisted.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..ml.predict import predict_reading
from ..ml.early_warning import analyze
from ..models import Alert, MaintenanceItem, Prediction, SensorData
from ..schemas import PredictionOut, SensorReading
from ..ws_manager import manager

router = APIRouter(tags=["predict"])


@router.post("/predict", response_model=PredictionOut)
async def predict(reading: SensorReading, db: Session = Depends(get_db)) -> PredictionOut:
    result = predict_reading(reading)

    # Persist the reading + ML prediction so /reports and /alerts have data.
    sensor_row = SensorData(**reading.model_dump())
    db.add(sensor_row)
    db.flush()  # get sensor_row.id
    db.add(
        Prediction(
            sensor_id=sensor_row.id,
            status=result.status,
            failure_probability=result.failure_probability,
            recommendation=result.recommendation,
        )
    )

    # Also run early-warning analysis for more detailed findings
    findings = analyze(reading)
    new_alerts = []
    for f in findings:
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
            db.flush()
            new_alerts.append({
                "event": "new_alert",
                "id": alert.id,
                "timestamp": alert.timestamp.isoformat(),
                "severity": alert.severity,
                "message": msg,
                "equipment_id": reading.equipment_id,
                "parameter": f.parameter,
                "alert_type": f.alert_type,
            })

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
            except Exception:
                pass

        existing_mi = (
            db.query(MaintenanceItem)
            .filter(
                MaintenanceItem.fingerprint == f.fingerprint,
                MaintenanceItem.status != "Completed",
            )
            .first()
        )
        if not existing_mi:
            db.add(MaintenanceItem(
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
                model_confidence=result.failure_probability,
            ))

    db.commit()

    # Broadcast new alerts via WebSocket
    for payload in new_alerts:
        await manager.broadcast(payload)

    return result
