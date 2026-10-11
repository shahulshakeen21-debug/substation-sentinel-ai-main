"""GET /reports/summary — aggregate stats over the persisted predictions."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Prediction, SensorData
from ..schemas import ReportSummary

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportSummary)
def summary(db: Session = Depends(get_db)) -> ReportSummary:
    total = db.query(func.count(Prediction.id)).scalar() or 0
    healthy = db.query(func.count(Prediction.id)).filter(Prediction.status == "Healthy").scalar() or 0
    warning = db.query(func.count(Prediction.id)).filter(Prediction.status == "Warning").scalar() or 0
    critical = db.query(func.count(Prediction.id)).filter(Prediction.status == "Critical").scalar() or 0

    avg_t = db.query(func.avg(SensorData.temperature)).scalar() or 0.0
    avg_i = db.query(func.avg(SensorData.current)).scalar() or 0.0

    return ReportSummary(
        total_samples=total,
        healthy=healthy,
        warning=warning,
        critical=critical,
        avg_temperature=round(float(avg_t), 2),
        avg_current=round(float(avg_i), 2),
    )
