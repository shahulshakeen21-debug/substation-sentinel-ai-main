"""GET /alerts        — most recent alerts (Warning / Critical).
GET /alerts/unread  — count of unread alerts for the requesting user.
POST /alerts/read   — mark alert IDs as read for the requesting user.
POST /alerts/{id}/resolve — mark an alert as resolved (recovery notification).
GET /alerts/ws      — WebSocket endpoint for real-time notifications.
"""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, NotificationRead, User
from ..schemas import AlertOut, NotificationReadRequest
from ..ws_manager import manager

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _get_user_id(username: str, db: Session) -> int | None:
    u = db.query(User).filter_by(username=username).first()
    return u.id if u else None


def _read_ids(user_id: int, db: Session) -> set[int]:
    rows = db.query(NotificationRead.alert_id).filter_by(user_id=user_id).all()
    return {r.alert_id for r in rows}


@router.get("", response_model=List[AlertOut])
def list_alerts(
    limit: int = 50,
    severity: str | None = Query(None),
    resolved: bool | None = Query(None),
    username: str = Query("", alias="user"),
    db: Session = Depends(get_db),
) -> List[AlertOut]:
    q = db.query(Alert).order_by(desc(Alert.timestamp))
    if severity:
        q = q.filter(Alert.severity == severity)
    if resolved is not None:
        q = q.filter(Alert.resolved == resolved)
    rows = q.limit(limit).all()

    user_id = _get_user_id(username, db) if username else None
    read_ids = _read_ids(user_id, db) if user_id else set()

    return [
        AlertOut(
            id=str(a.id),
            timestamp=a.timestamp,
            severity=a.severity,  # type: ignore[arg-type]
            message=a.message,
            equipment_id=a.equipment_id,
            parameter=a.parameter,
            alert_type=a.alert_type,  # type: ignore[arg-type]
            resolved=a.resolved,
            is_read=a.id in read_ids,
        )
        for a in rows
    ]


@router.get("/unread-count")
@router.get("/unread")
def unread_count(
    username: str = Query("", alias="user"),
    db: Session = Depends(get_db),
) -> dict:
    user_id = _get_user_id(username, db) if username else None
    if not user_id:
        # Return total unresolved count when user not identified
        total = db.query(Alert).filter(Alert.resolved == False).count()  # noqa: E712
        return {"unread": total}
    read_ids = _read_ids(user_id, db)
    total = db.query(Alert).filter(Alert.resolved == False).count()  # noqa: E712
    unread = max(0, total - len(read_ids))
    return {"unread": unread}


@router.post("/read")
async def mark_read(
    body: NotificationReadRequest,
    username: str = Query("", alias="user"),
    db: Session = Depends(get_db),
) -> dict:
    target_user = username or (body.username or "")
    user_id = _get_user_id(target_user, db) if target_user else None
    if not user_id or not body.alert_ids:
        return {"marked": 0}
    existing = {
        r.alert_id
        for r in db.query(NotificationRead)
        .filter(
            NotificationRead.user_id == user_id,
            NotificationRead.alert_id.in_(body.alert_ids),
        )
        .all()
    }
    new_rows = [
        NotificationRead(user_id=user_id, alert_id=aid)
        for aid in body.alert_ids
        if aid not in existing
    ]
    db.add_all(new_rows)
    db.commit()
    return {"marked": len(new_rows)}


@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    db: Session = Depends(get_db),
) -> dict:
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        return {"ok": False, "detail": "Alert not found"}
    if alert.resolved:
        return {"ok": True, "detail": "Already resolved"}

    alert.resolved = True
    alert.resolved_at = datetime.utcnow()
    db.commit()

    # Broadcast recovery notification
    payload = {
        "event": "alert_resolved",
        "id": alert.id,
        "timestamp": alert.resolved_at.isoformat(),
        "severity": "Healthy",
        "message": f"RECOVERY: {alert.parameter or alert.message[:80]} — condition resolved.",
        "equipment_id": alert.equipment_id,
        "parameter": alert.parameter,
        "alert_type": "Recovery",
    }
    await manager.broadcast(payload)

    # Send recovery SMS if enabled
    try:
        from ..sms import dispatch_recovery_sms
        dispatch_recovery_sms(alert, db)
    except Exception:
        pass

    return {"ok": True}


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    username: str = Query("anonymous"),
) -> None:
    """Real-time notification stream.  Connect with:
        ws://localhost:8000/alerts/ws?user=<username>
    """
    await manager.connect(websocket, username)
    try:
        while True:
            # Keep alive — the server pushes; client can send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, username)
