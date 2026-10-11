"""SMS Alert Notification Gateway Service.

Supports:
1. Twilio SMS (Global + India +91)
2. Fast2SMS (Indian SMS Gateway)
3. Simulator Mode (Safe testing, logs exact formatted SMS message, delivery confirmed in DB)

Features:
- Validates E.164 phone formats (supports Indian numbers with +91)
- Never claims delivered unless provider returns confirmed status
- Cooldown and fingerprint deduplication to avoid message flooding
- Formats messages strictly according to substation engineering requirements:
    SUBSTATION ALERT - [SEVERITY]
    Equipment: [ID]
    Issue: [Observed Abnormality / Possible Risk / AI-Predicted Fault]
    Current status: [Status description]
    Action: [Clear Action]
    Priority: [Priority]
    Time: [Timestamp]
    Dashboard: [URL]
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from .models import Alert, SmsConfig, SmsLog

logger = logging.getLogger("sms_gateway")


@dataclass
class SmsSendResult:
    success: bool
    status: str             # "delivered", "sent", "simulated", "failed"
    provider: str
    recipient: str
    message: str
    provider_sid: Optional[str] = None
    error: Optional[str] = None


def normalize_phone_number(phone: str) -> str:
    """Normalize phone number to international E.164 standard.
    Handles Indian numbers e.g. 9876543210 -> +919876543210.
    """
    cleaned = re.sub(r"[\s\-\(\)]", "", phone.strip())
    if not cleaned:
        return ""
    # If 10 digits without country code, assume India (+91)
    if re.fullmatch(r"\d{10}", cleaned):
        return f"+91{cleaned}"
    # If starts with 0 and followed by 10 digits (common in India)
    if cleaned.startswith("0") and len(cleaned) == 11:
        return f"+91{cleaned[1:]}"
    # If already starts with +
    if cleaned.startswith("+"):
        return cleaned
    return f"+{cleaned}"


def is_valid_phone(phone: str) -> bool:
    """Validates international E.164 phone number."""
    normalized = normalize_phone_number(phone)
    return bool(re.fullmatch(r"\+[1-9]\d{7,14}", normalized))


def format_sms_message(
    severity: str,
    equipment_id: str,
    issue: str,
    current_status: str,
    action: str,
    priority: str,
    timestamp: datetime,
    dashboard_url: str = "",
) -> str:
    """Build the required standardized SMS format."""
    time_str = timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
    url = dashboard_url or os.getenv("DASHBOARD_URL", "http://localhost:8080/dashboard")

    return (
        f"SUBSTATION ALERT - {severity.upper()}\n"
        f"Equipment: {equipment_id}\n"
        f"Issue: {issue}\n"
        f"Current status: {current_status}\n"
        f"Action: {action}\n"
        f"Priority: {priority}\n"
        f"Time: {time_str}\n"
        f"Dashboard: {url}"
    )


def format_recovery_sms(
    equipment_id: str,
    parameter: str,
    resolution: str,
    timestamp: datetime,
    dashboard_url: str = "",
) -> str:
    """Build standardized Recovery SMS format."""
    time_str = timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
    url = dashboard_url or os.getenv("DASHBOARD_URL", "http://localhost:8080/dashboard")

    return (
        f"SUBSTATION ALERT - RECOVERY\n"
        f"Equipment: {equipment_id}\n"
        f"Issue: {parameter} condition resolved\n"
        f"Current status: Operating within normal parameters\n"
        f"Action: Routine monitoring resumed\n"
        f"Priority: Normal\n"
        f"Time: {time_str}\n"
        f"Dashboard: {url}"
    )


# ── Provider Implementations ────────────────────────────────────────────────

def _send_twilio(recipient: str, message: str) -> SmsSendResult:
    """Send via Twilio REST API using standard urllib (zero extra native dependencies)."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_PHONE_NUMBER", "").strip()

    if not account_sid or not auth_token or not from_number:
        return SmsSendResult(
            success=False,
            status="failed",
            provider="twilio",
            recipient=recipient,
            message=message,
            error="Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env",
        )

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = urllib.parse.urlencode({
        "To": recipient,
        "From": from_number,
        "Body": message,
    }).encode("utf-8")

    req = urllib.request.Request(url, data=data, method="POST")
    auth_header = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii")
    req.add_header("Authorization", f"Basic {auth_header}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_body = resp.read().decode("utf-8")
            parsed = json.loads(resp_body)
            sid = parsed.get("sid")
            status = parsed.get("status")
            # Twilio statuses: "queued", "sending", "sent", "delivered", "failed", "undelivered"
            delivery_status = "delivered" if status == "delivered" else ("sent" if status in ["sent", "queued", "sending"] else "failed")
            return SmsSendResult(
                success=True,
                status=delivery_status,
                provider="twilio",
                recipient=recipient,
                message=message,
                provider_sid=sid,
            )
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8", errors="ignore")
        logger.error("Twilio HTTP error %s: %s", e.code, err_content)
        return SmsSendResult(
            success=False,
            status="failed",
            provider="twilio",
            recipient=recipient,
            message=message,
            error=f"Twilio HTTP {e.code}: {err_content}",
        )
    except Exception as e:
        logger.error("Twilio send failed: %s", str(e))
        return SmsSendResult(
            success=False,
            status="failed",
            provider="twilio",
            recipient=recipient,
            message=message,
            error=str(e),
        )


def _send_fast2sms(recipient: str, message: str) -> SmsSendResult:
    """Send via Fast2SMS (Indian SMS Gateway)."""
    api_key = os.getenv("FAST2SMS_API_KEY", "").strip()
    if not api_key:
        return SmsSendResult(
            success=False,
            status="failed",
            provider="fast2sms",
            recipient=recipient,
            message=message,
            error="Fast2SMS API key not configured in .env",
        )

    # Fast2SMS expects 10 digit Indian number
    cleaned_num = recipient.replace("+91", "").strip()

    url = "https://www.fast2sms.com/dev/bulkV2"
    payload = json.dumps({
        "route": "q",
        "message": message,
        "language": "english",
        "flash": 0,
        "numbers": cleaned_num,
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("authorization", api_key)
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_body = resp.read().decode("utf-8")
            parsed = json.loads(resp_body)
            return_status = parsed.get("return", False)
            request_id = parsed.get("request_id")
            if return_status:
                return SmsSendResult(
                    success=True,
                    status="sent",
                    provider="fast2sms",
                    recipient=recipient,
                    message=message,
                    provider_sid=str(request_id),
                )
            else:
                return SmsSendResult(
                    success=False,
                    status="failed",
                    provider="fast2sms",
                    recipient=recipient,
                    message=message,
                    error=parsed.get("message", "Fast2SMS rejected request"),
                )
    except urllib.error.HTTPError as e:
        err_msg = str(e)
        try:
            body = e.read().decode("utf-8")
            parsed = json.loads(body)
            err_msg = parsed.get("message") or body
        except Exception:
            pass
        return SmsSendResult(
            success=False,
            status="failed",
            provider="fast2sms",
            recipient=recipient,
            message=message,
            error=f"Fast2SMS Error: {err_msg}",
        )
    except Exception as e:
        return SmsSendResult(
            success=False,
            status="failed",
            provider="fast2sms",
            recipient=recipient,
            message=message,
            error=str(e),
        )


def _send_simulator(recipient: str, message: str) -> SmsSendResult:
    """Simulated mode for testing and development.
    Does not make external network requests; safely records simulated delivery.
    """
    sim_sid = f"SIM-{int(datetime.utcnow().timestamp())}-{abs(hash(recipient)) % 10000}"
    logger.info("[SMS SIMULATOR] To: %s\n%s", recipient, message)
    return SmsSendResult(
        success=True,
        status="simulated",
        provider="simulator",
        recipient=recipient,
        message=message,
        provider_sid=sim_sid,
    )


# ── Public Service Interface ───────────────────────────────────────────────

def send_sms(
    recipient: str,
    message: str,
    provider: Optional[str] = None,
    force_simulator: bool = False,
) -> SmsSendResult:
    """Dispatches an SMS to the given recipient."""
    norm_recipient = normalize_phone_number(recipient)
    if not is_valid_phone(norm_recipient):
        return SmsSendResult(
            success=False,
            status="failed",
            provider=provider or "simulator",
            recipient=recipient,
            message=message,
            error=f"Invalid phone number format: '{recipient}'. Must be valid E.164 (e.g. +919876543210)",
        )

    # Determine provider
    chosen_provider = provider or os.getenv("SMS_PROVIDER", "simulator").lower()

    if force_simulator or chosen_provider == "simulator":
        return _send_simulator(norm_recipient, message)
    elif chosen_provider == "twilio":
        return _send_twilio(norm_recipient, message)
    elif chosen_provider == "fast2sms":
        return _send_fast2sms(norm_recipient, message)
    else:
        return _send_simulator(norm_recipient, message)


def get_sms_config(db: Session) -> SmsConfig:
    """Retrieve or initialize persistent SMS configuration."""
    cfg = db.query(SmsConfig).first()
    if not cfg:
        # Check environment defaults
        env_enabled = os.getenv("SMS_ENABLED", "false").lower() in ("true", "1", "yes")
        env_provider = os.getenv("SMS_PROVIDER", "simulator")
        env_recipients = os.getenv("OPERATOR_PHONE_NUMBER", "")

        cfg = SmsConfig(
            enabled=env_enabled,
            provider=env_provider,
            min_severity="Warning",
            send_recovery=True,
            cooldown_minutes=int(os.getenv("SMS_COOLDOWN_MINUTES", "30")),
            recipient_numbers=env_recipients,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def should_send_sms_for_alert(
    alert: Alert,
    cfg: SmsConfig,
    db: Session,
) -> bool:
    """Checks whether an alert qualifies for an SMS based on:
    1. SMS enabled
    2. Severity meets min_severity threshold
    3. Cooldown: no recent SMS sent for the same parameter/equipment within cooldown period
    """
    if not cfg.enabled:
        return False

    # Severity filter: Critical always passes; Warning passes if min_severity != "Critical"
    if cfg.min_severity == "Critical" and alert.severity != "Critical":
        return False

    # Check cooldown window
    cutoff = datetime.utcnow() - timedelta(minutes=cfg.cooldown_minutes)
    recent = (
        db.query(SmsLog)
        .filter(
            SmsLog.equipment_id == alert.equipment_id,
            SmsLog.parameter == alert.parameter,
            SmsLog.event_type == alert.alert_type,
            SmsLog.timestamp >= cutoff,
            SmsLog.delivery_status.in_(["delivered", "sent", "simulated"]),
        )
        .first()
    )
    if recent:
        logger.info("SMS suppressed by cooldown for %s:%s", alert.equipment_id, alert.parameter)
        return False

    return True


def dispatch_alert_sms(
    alert: Alert,
    issue_desc: str,
    action: str,
    priority: str,
    db: Session,
    status_override: str = "",
) -> list[SmsLog]:
    """Sends SMS to all configured recipients for an alert and logs to DB."""
    cfg = get_sms_config(db)
    if not should_send_sms_for_alert(alert, cfg, db):
        return []

    # Get recipients from config and env
    recipients = [
        r.strip()
        for r in cfg.recipient_numbers.split(",")
        if r.strip()
    ]
    if not recipients:
        env_rec = os.getenv("OPERATOR_PHONE_NUMBER", "").strip()
        if env_rec:
            recipients = [env_rec]

    if not recipients:
        logger.warning("SMS triggered but no recipient numbers configured.")
        return []

    # Map alert type to clear issue wording (per requirement: do not claim unconfirmed fault as failure)
    issue_label = issue_desc
    if alert.alert_type == "EarlyWarning":
        status_label = status_override or f"Possible risk ({alert.parameter} approaching limit)"
    elif alert.alert_type == "PredictedRisk":
        status_label = status_override or f"AI-predicted potential fault"
    else:
        status_label = status_override or f"Observed abnormal condition"

    msg = format_sms_message(
        severity=alert.severity,
        equipment_id=alert.equipment_id,
        issue=issue_label,
        current_status=status_label,
        action=action or "Inspect equipment bay and check auxiliary systems",
        priority=priority or ("High" if alert.severity == "Critical" else "Medium"),
        timestamp=alert.timestamp,
    )

    logs = []
    for r in recipients:
        res = send_sms(r, msg, provider=cfg.provider)
        log = SmsLog(
            recipient=res.recipient,
            message=res.message,
            severity=alert.severity,
            event_type=alert.alert_type,
            equipment_id=alert.equipment_id,
            parameter=alert.parameter,
            delivery_status=res.status,
            provider=res.provider,
            provider_sid=res.provider_sid,
            error_message=res.error,
            alert_id=alert.id,
        )
        db.add(log)
        logs.append(log)

    db.commit()
    return logs


def dispatch_recovery_sms(
    alert: Alert,
    db: Session,
) -> list[SmsLog]:
    """Sends recovery SMS when an alert condition clears."""
    cfg = get_sms_config(db)
    if not cfg.enabled or not cfg.send_recovery:
        return []

    recipients = [
        r.strip()
        for r in cfg.recipient_numbers.split(",")
        if r.strip()
    ]
    if not recipients:
        env_rec = os.getenv("OPERATOR_PHONE_NUMBER", "").strip()
        if env_rec:
            recipients = [env_rec]

    if not recipients:
        return []

    msg = format_recovery_sms(
        equipment_id=alert.equipment_id,
        parameter=alert.parameter or "Telemetry",
        resolution="Alert condition cleared and operating values restored",
        timestamp=alert.resolved_at or datetime.utcnow(),
    )

    logs = []
    for r in recipients:
        res = send_sms(r, msg, provider=cfg.provider)
        log = SmsLog(
            recipient=res.recipient,
            message=res.message,
            severity="Healthy",
            event_type="Recovery",
            equipment_id=alert.equipment_id,
            parameter=alert.parameter,
            delivery_status=res.status,
            provider=res.provider,
            provider_sid=res.provider_sid,
            error_message=res.error,
            alert_id=alert.id,
        )
        db.add(log)
        logs.append(log)

    db.commit()
    return logs
