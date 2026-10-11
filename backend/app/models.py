"""ORM models for the Digital Twin backend.

Six tables:
  users                — operator accounts (username + bcrypt password hash)
  sensor_data          — raw telemetry samples from the substation twin
  predictions          — ML output per sample (status + failure probability)
  alerts               — Warning/Critical events surfaced to the operator
  maintenance_items    — Predictive maintenance recommendations
  notification_reads   — per-user read/unread tracking for alerts
"""
from __future__ import annotations

from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)  # E.164 e.g. +919876543210
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    notification_reads: Mapped[list["NotificationRead"]] = relationship(
        "NotificationRead", back_populates="user"
    )


class SensorData(Base):
    __tablename__ = "sensor_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    equipment_id: Mapped[str] = mapped_column(String(32), default="T1-400kV")

    # Core electrical
    temperature: Mapped[float] = mapped_column(Float)      # winding °C
    voltage: Mapped[float] = mapped_column(Float)          # kV
    current: Mapped[float] = mapped_column(Float)          # A
    oil_level: Mapped[float] = mapped_column(Float)        # %
    humidity: Mapped[float] = mapped_column(Float)         # %
    vibration: Mapped[float] = mapped_column(Float)        # mm/s

    # Extended transformer parameters
    oil_temperature: Mapped[float] = mapped_column(Float, default=50.0)       # °C
    winding_temperature: Mapped[float] = mapped_column(Float, default=65.0)   # °C
    oil_leakage: Mapped[int] = mapped_column(Integer, default=0)              # 0=None,1=Suspected,2=Confirmed
    pressure: Mapped[float] = mapped_column(Float, default=0.5)               # bar (conservator pressure)
    cooling_fan_status: Mapped[int] = mapped_column(Integer, default=1)       # 1=OK, 0=Fault
    cooling_pump_status: Mapped[int] = mapped_column(Integer, default=1)      # 1=OK, 0=Fault
    oil_condition: Mapped[float] = mapped_column(Float, default=85.0)         # 0-100 quality index
    load_factor: Mapped[float] = mapped_column(Float, default=0.60)           # 0-1

    prediction = relationship("Prediction", back_populates="sensor", uselist=False)


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensor_data.id"))
    status: Mapped[str] = mapped_column(String(16))              # Healthy / Warning / Critical
    failure_probability: Mapped[float] = mapped_column(Float)
    recommendation: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sensor = relationship("SensorData", back_populates="prediction")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    severity: Mapped[str] = mapped_column(String(16))            # Warning / Critical
    message: Mapped[str] = mapped_column(String(512))
    equipment_id: Mapped[str] = mapped_column(String(32), default="T1-400kV")
    parameter: Mapped[str] = mapped_column(String(64), default="")
    # EarlyWarning / ActiveFault / PredictedRisk / Recovery
    alert_type: Mapped[str] = mapped_column(String(32), default="ActiveFault")
    # Fingerprint to avoid repeated notifications for the same issue
    fingerprint: Mapped[str] = mapped_column(String(128), default="", index=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    notification_reads: Mapped[list["NotificationRead"]] = relationship(
        "NotificationRead", back_populates="alert"
    )


class MaintenanceItem(Base):
    __tablename__ = "maintenance_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    equipment_id: Mapped[str] = mapped_column(String(32), default="T1-400kV")
    parameter: Mapped[str] = mapped_column(String(64))
    current_value: Mapped[float] = mapped_column(Float)
    configured_limit: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16), default="")
    severity: Mapped[str] = mapped_column(String(16))            # Warning / Critical
    alert_type: Mapped[str] = mapped_column(String(32))          # EarlyWarning / ActiveFault / PredictedRisk
    reason: Mapped[str] = mapped_column(Text)
    trend_description: Mapped[str] = mapped_column(Text, default="")
    recommended_action: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(16))            # Immediate / High / Medium / Low
    inspection_timeframe: Mapped[str] = mapped_column(String(64))
    # Pending / InProgress / Completed
    status: Mapped[str] = mapped_column(String(16), default="Pending")
    model_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    completion_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Fingerprint to deduplicate open items
    fingerprint: Mapped[str] = mapped_column(String(128), default="", index=True)


class NotificationRead(Base):
    """Tracks which alerts each user has read."""
    __tablename__ = "notification_reads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id"), index=True)
    read_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notification_reads")
    alert = relationship("Alert", back_populates="notification_reads")


class SmsLog(Base):
    """Tracks every SMS notification attempt, delivery status, and provider response."""
    __tablename__ = "sms_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    recipient: Mapped[str] = mapped_column(String(32), index=True)        # E.164 phone number
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16))                     # Warning / Critical / Recovery / Test
    event_type: Mapped[str] = mapped_column(String(32))                   # EarlyWarning / ActiveFault / Recovery / Test
    equipment_id: Mapped[str] = mapped_column(String(32), default="T1-400kV")
    parameter: Mapped[str] = mapped_column(String(64), default="")
    # Delivery status: "delivered" (confirmed by provider), "sent", "simulated", "failed"
    delivery_status: Mapped[str] = mapped_column(String(32), default="sent", index=True)
    provider: Mapped[str] = mapped_column(String(32), default="simulator") # twilio / fast2sms / simulator
    provider_sid: Mapped[str | None] = mapped_column(String(128), nullable=True) # e.g. Twilio SMxxxxxxxx
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), nullable=True)


class SmsConfig(Base):
    """Persistent SMS configuration."""
    __tablename__ = "sms_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Gateway provider: "twilio" / "fast2sms" / "simulator"
    provider: Mapped[str] = mapped_column(String(32), default="twilio")
    # Minimum severity level to trigger SMS: "Warning" or "Critical"
    min_severity: Mapped[str] = mapped_column(String(16), default="Warning")
    # Send recovery SMS when condition clears
    send_recovery: Mapped[bool] = mapped_column(Boolean, default=True)
    # Cooldown period in minutes for same fingerprint
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=30)
    # Primary alert recipient numbers (comma separated, E.164 e.g. +919876543210)
    recipient_numbers: Mapped[str] = mapped_column(String(255), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

