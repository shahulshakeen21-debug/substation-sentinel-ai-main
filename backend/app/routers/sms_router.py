"""SMS Management Router.

Endpoints:
GET  /sms/config       — view SMS notification settings & live gateway status
PATCH /sms/config      — update settings (enable/disable, provider, numbers, cooldown)
POST /sms/test         — send a test SMS (with scenario: normal, warning, critical, recovery)
GET  /sms/logs         — audit log of SMS notifications sent with delivery status
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SmsConfig, SmsLog
from ..schemas import SmsConfigOut, SmsConfigUpdate, SmsLogOut, TestSmsRequest
from ..sms import (
    format_recovery_sms,
    format_sms_message,
    get_sms_config,
    is_valid_phone,
    normalize_phone_number,
    send_sms,
)

router = APIRouter(prefix="/sms", tags=["sms"])


def _check_live_credentials(provider: str) -> bool:
    """Checks whether the environment has valid live credentials for the provider."""
    if provider == "twilio":
        return bool(
            os.getenv("TWILIO_ACCOUNT_SID")
            and os.getenv("TWILIO_AUTH_TOKEN")
            and os.getenv("TWILIO_PHONE_NUMBER")
        )
    elif provider == "fast2sms":
        return bool(os.getenv("FAST2SMS_API_KEY"))
    return False


@router.get("/config", response_model=SmsConfigOut)
def get_config(db: Session = Depends(get_db)) -> SmsConfigOut:
    cfg = get_sms_config(db)
    is_live = _check_live_credentials(cfg.provider)

    provider_name = {
        "twilio": "Twilio SMS Gateway" + (" (Ready)" if is_live else " (No Credentials)"),
        "fast2sms": "Fast2SMS (India)" + (" (Ready)" if is_live else " (No API Key)"),
        "simulator": "Safe Simulator (Mock Mode)",
    }.get(cfg.provider, cfg.provider)

    return SmsConfigOut(
        enabled=cfg.enabled,
        provider=cfg.provider,
        min_severity=cfg.min_severity,
        send_recovery=cfg.send_recovery,
        cooldown_minutes=cfg.cooldown_minutes,
        recipient_numbers=cfg.recipient_numbers,
        is_live_configured=is_live,
        provider_name=provider_name,
    )


@router.patch("/config", response_model=SmsConfigOut)
def update_config(update: SmsConfigUpdate, db: Session = Depends(get_db)) -> SmsConfigOut:
    cfg = get_sms_config(db)
    if update.enabled is not None:
        cfg.enabled = update.enabled
    if update.provider is not None:
        cfg.provider = update.provider.lower()
    if update.min_severity is not None:
        cfg.min_severity = update.min_severity
    if update.send_recovery is not None:
        cfg.send_recovery = update.send_recovery
    if update.cooldown_minutes is not None:
        cfg.cooldown_minutes = update.cooldown_minutes
    if update.recipient_numbers is not None:
        # Validate recipient numbers if provided
        nums = [normalize_phone_number(n) for n in update.recipient_numbers.split(",") if n.strip()]
        cfg.recipient_numbers = ",".join(nums)

    db.commit()
    db.refresh(cfg)
    return get_config(db)


@router.post("/test")
def send_test_sms(req: TestSmsRequest, db: Session = Depends(get_db)) -> dict:
    """Send a test SMS to verify the integration and format."""
    cfg = get_sms_config(db)
    norm_phone = normalize_phone_number(req.phone_number)

    if not is_valid_phone(norm_phone):
        return {
            "ok": False,
            "detail": f"Invalid phone number format: '{req.phone_number}'. Please provide a valid number with country code (e.g. +919876543210)",
        }

    now = datetime.utcnow()
    scenario = (req.scenario or "warning").lower()

    if scenario == "recovery":
        msg = format_recovery_sms(
            equipment_id="TX-001 (T1-400kV)",
            parameter="Oil Level & Conservator Pressure",
            resolution="Oil level replenished and seals inspected. Normal pressure restored.",
            timestamp=now,
        )
        severity = "Healthy"
        event_type = "Recovery"
    elif scenario == "critical":
        msg = format_sms_message(
            severity="CRITICAL",
            equipment_id="TX-001 (T1-400kV)",
            issue="Severe oil leakage confirmed. Conservator level critically low (42.0%).",
            current_status="Active observed fault with high thermal runaway risk.",
            action="Isolate 400kV bay immediately and dispatch emergency response team.",
            priority="Critical",
            timestamp=now,
        )
        severity = "Critical"
        event_type = "ActiveFault"
    elif scenario == "normal":
        msg = format_sms_message(
            severity="INFO",
            equipment_id="TX-001 (T1-400kV)",
            issue="Routine telemetry validation",
            current_status="All 14 equipment telemetry channels operating nominally.",
            action="No action required. Routine monitoring ongoing.",
            priority="Low",
            timestamp=now,
        )
        severity = "Healthy"
        event_type = "Test"
    else:  # warning
        msg = format_sms_message(
            severity="WARNING",
            equipment_id="TX-001 (T1-400kV)",
            issue="Oil level declining abnormally (-1.2%/hr).",
            current_status="Possible risk: Declining oil trend with optical sensor alert.",
            action="Inspect oil tank, main conservator valves and radiator flange seals.",
            priority="High",
            timestamp=now,
        )
        severity = "Warning"
        event_type = "EarlyWarning"

    if req.custom_message:
        msg = req.custom_message

    # Dispatch SMS
    res = send_sms(norm_phone, msg, provider=cfg.provider)

    # Store in audit log
    log = SmsLog(
        recipient=res.recipient,
        message=res.message,
        severity=severity,
        event_type=event_type,
        equipment_id="TX-001",
        parameter="Test Scenario",
        delivery_status=res.status,
        provider=res.provider,
        provider_sid=res.provider_sid,
        error_message=res.error,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    return {
        "ok": res.success,
        "delivery_status": res.status,
        "provider": res.provider,
        "provider_sid": res.provider_sid,
        "recipient": res.recipient,
        "formatted_message": res.message,
        "error": res.error,
        "log_id": log.id,
    }


@router.get("/logs", response_model=List[SmsLogOut])
def list_logs(
    limit: int = Query(50, le=200),
    recipient: str | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
) -> List[SmsLogOut]:
    q = db.query(SmsLog).order_by(desc(SmsLog.timestamp))
    if recipient:
        q = q.filter(SmsLog.recipient.contains(recipient))
    if status:
        q = q.filter(SmsLog.delivery_status == status)
    rows = q.limit(limit).all()
    return rows
