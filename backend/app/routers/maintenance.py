"""Maintenance dashboard endpoints.

GET  /maintenance              — list maintenance items (filterable).
GET  /maintenance/summary      — equipment health summary.
GET  /maintenance/{id}         — single item detail.
PATCH /maintenance/{id}        — update status (Pending→InProgress→Completed).
GET  /maintenance/history      — completed items.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, MaintenanceItem, Prediction
from ..schemas import (
    EquipmentHealthSummary,
    MaintenanceItemOut,
    MaintenanceStatus,
    MaintenanceUpdateRequest,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


@router.get("", response_model=List[MaintenanceItemOut])
def list_maintenance(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    equipment_id: Optional[str] = Query(None),
    limit: int = Query(100),
    db: Session = Depends(get_db),
) -> List[MaintenanceItemOut]:
    q = db.query(MaintenanceItem).order_by(
        # Order: Immediate > High > Medium > Low, then by creation date
        MaintenanceItem.created_at.desc()
    )
    if status:
        q = q.filter(MaintenanceItem.status == status)
    if severity:
        q = q.filter(MaintenanceItem.severity == severity)
    if equipment_id:
        q = q.filter(MaintenanceItem.equipment_id == equipment_id)
    rows = q.limit(limit).all()
    return [MaintenanceItemOut.model_validate(r) for r in rows]


@router.get("/summary", response_model=List[EquipmentHealthSummary])
def equipment_summary(db: Session = Depends(get_db)) -> List[EquipmentHealthSummary]:
    """Return one EquipmentHealthSummary per distinct equipment_id."""
    equipment_ids = [
        r[0] for r in db.query(MaintenanceItem.equipment_id).distinct().all()
    ]
    if not equipment_ids:
        equipment_ids = ["T1-400kV"]

    summaries = []
    for eid in equipment_ids:
        active_warnings = (
            db.query(func.count(Alert.id))
            .filter(
                Alert.equipment_id == eid,
                Alert.severity == "Warning",
                Alert.resolved == False,  # noqa: E712
            )
            .scalar()
            or 0
        )
        active_faults = (
            db.query(func.count(Alert.id))
            .filter(
                Alert.equipment_id == eid,
                Alert.severity == "Critical",
                Alert.resolved == False,  # noqa: E712
            )
            .scalar()
            or 0
        )
        pending_maintenance = (
            db.query(func.count(MaintenanceItem.id))
            .filter(
                MaintenanceItem.equipment_id == eid,
                MaintenanceItem.status != "Completed",
            )
            .scalar()
            or 0
        )
        # Use latest prediction for failure probability
        latest_pred = (
            db.query(Prediction)
            .order_by(desc(Prediction.created_at))
            .first()
        )
        failure_prob = latest_pred.failure_probability if latest_pred else 0.0
        last_pred_time = latest_pred.created_at if latest_pred else None

        if active_faults > 0:
            overall = "Critical"
        elif active_warnings > 0 or pending_maintenance > 0:
            overall = "Warning"
        else:
            overall = "Healthy"

        summaries.append(
            EquipmentHealthSummary(
                equipment_id=eid,
                overall_status=overall,  # type: ignore[arg-type]
                failure_probability=round(failure_prob, 2),
                active_warnings=active_warnings,
                active_faults=active_faults,
                pending_maintenance=pending_maintenance,
                last_updated=last_pred_time,
            )
        )
    return summaries


@router.get("/history", response_model=List[MaintenanceItemOut])
def maintenance_history(
    equipment_id: Optional[str] = Query(None),
    limit: int = Query(50),
    db: Session = Depends(get_db),
) -> List[MaintenanceItemOut]:
    q = (
        db.query(MaintenanceItem)
        .filter(MaintenanceItem.status == "Completed")
        .order_by(desc(MaintenanceItem.completed_at))
    )
    if equipment_id:
        q = q.filter(MaintenanceItem.equipment_id == equipment_id)
    rows = q.limit(limit).all()
    return [MaintenanceItemOut.model_validate(r) for r in rows]


@router.get("/{item_id}", response_model=MaintenanceItemOut)
def get_maintenance_item(item_id: int, db: Session = Depends(get_db)) -> MaintenanceItemOut:
    row = db.query(MaintenanceItem).filter(MaintenanceItem.id == item_id).first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Maintenance item not found")
    return MaintenanceItemOut.model_validate(row)


@router.patch("/{item_id}", response_model=MaintenanceItemOut)
def update_maintenance(
    item_id: int,
    body: MaintenanceUpdateRequest,
    db: Session = Depends(get_db),
) -> MaintenanceItemOut:
    row = db.query(MaintenanceItem).filter(MaintenanceItem.id == item_id).first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Maintenance item not found")

    row.status = body.status
    row.updated_at = datetime.utcnow()
    if body.status == "Completed":
        row.completed_at = datetime.utcnow()
        row.completed_by = body.completed_by
        row.completion_notes = body.completion_notes
    db.commit()
    db.refresh(row)
    return MaintenanceItemOut.model_validate(row)
