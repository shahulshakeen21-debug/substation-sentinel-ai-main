"""Pydantic request/response schemas.

Field names deliberately match `src/lib/types.ts` on the frontend.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

HealthStatus = Literal["Healthy", "Warning", "Critical"]
AlertType = Literal["EarlyWarning", "ActiveFault", "PredictedRisk", "Recovery"]
MaintenanceStatus = Literal["Pending", "InProgress", "Completed"]
Priority = Literal["Immediate", "High", "Medium", "Low"]


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    ok: bool
    username: str | None = None


class SensorReading(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    equipment_id: str = "T1-400kV"

    # Core (backwards-compatible)
    temperature: float
    voltage: float
    current: float
    oil_level: float
    humidity: float
    vibration: float

    # Extended transformer parameters
    oil_temperature: float = 50.0
    winding_temperature: float = 65.0
    oil_leakage: int = 0           # 0=None, 1=Suspected, 2=Confirmed
    pressure: float = 0.5          # bar
    cooling_fan_status: int = 1    # 1=OK, 0=Fault
    cooling_pump_status: int = 1   # 1=OK, 0=Fault
    oil_condition: float = 85.0    # quality 0-100
    load_factor: float = 0.60      # 0-1


class PredictionOut(BaseModel):
    model_config = {"protected_namespaces": ()}

    status: HealthStatus
    failure_probability: float
    recommendation: str
    reasons: List[str] = []
    model_confidence: Optional[float] = None


class AlertOut(BaseModel):
    id: str
    timestamp: datetime
    severity: HealthStatus
    message: str
    equipment_id: str = "T1-400kV"
    parameter: str = ""
    alert_type: AlertType = "ActiveFault"
    resolved: bool = False
    is_read: bool = False           # per-user read status


class MaintenanceItemOut(BaseModel):
    model_config = {"from_attributes": True, "protected_namespaces": ()}

    id: int
    created_at: datetime
    updated_at: datetime
    equipment_id: str
    parameter: str
    current_value: float
    configured_limit: float
    unit: str
    severity: HealthStatus
    alert_type: AlertType
    reason: str
    trend_description: str
    recommended_action: str
    priority: Priority
    inspection_timeframe: str
    status: MaintenanceStatus
    model_confidence: Optional[float] = None
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    completion_notes: Optional[str] = None


class MaintenanceUpdateRequest(BaseModel):
    status: MaintenanceStatus
    completed_by: Optional[str] = None
    completion_notes: Optional[str] = None


class ReportSummary(BaseModel):
    total_samples: int
    healthy: int
    warning: int
    critical: int
    avg_temperature: float
    avg_current: float


class EquipmentHealthSummary(BaseModel):
    equipment_id: str
    overall_status: HealthStatus
    failure_probability: float
    active_warnings: int
    active_faults: int
    pending_maintenance: int
    last_updated: Optional[datetime] = None


class NotificationReadRequest(BaseModel):
    alert_ids: List[int]
    username: Optional[str] = None


class ThresholdConfig(BaseModel):
    """Configurable operating limits — sent by the client or read from environment."""
    temperature_warn: float = 80.0
    temperature_crit: float = 95.0
    voltage_high_warn: float = 410.0
    voltage_high_crit: float = 420.0
    voltage_low_warn: float = 390.0
    voltage_low_crit: float = 380.0
    current_warn: float = 950.0
    current_crit: float = 1100.0
    oil_level_warn: float = 55.0
    oil_level_crit: float = 45.0
    humidity_warn: float = 65.0
    humidity_crit: float = 80.0
    vibration_warn: float = 5.0
    vibration_crit: float = 7.5
    oil_temp_warn: float = 85.0
    oil_temp_crit: float = 100.0
    winding_temp_warn: float = 95.0
    winding_temp_crit: float = 115.0
    pressure_high_warn: float = 1.0
    pressure_high_crit: float = 1.5
    pressure_low_warn: float = 0.1
    oil_condition_warn: float = 60.0
    oil_condition_crit: float = 40.0


# ── SMS Schemas ─────────────────────────────────────────────────────────────

class SmsConfigOut(BaseModel):
    enabled: bool
    provider: str
    min_severity: str
    send_recovery: bool
    cooldown_minutes: int
    recipient_numbers: str
    is_live_configured: bool = False  # True if Twilio / Fast2SMS credentials exist in env
    provider_name: str = "Simulator"  # Human friendly provider status


class SmsConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    provider: Optional[str] = None
    min_severity: Optional[str] = None
    send_recovery: Optional[bool] = None
    cooldown_minutes: Optional[int] = None
    recipient_numbers: Optional[str] = None


class TestSmsRequest(BaseModel):
    phone_number: str
    scenario: Optional[str] = "warning"  # normal / warning / critical / recovery
    custom_message: Optional[str] = None


class SmsLogOut(BaseModel):
    id: int
    timestamp: datetime
    recipient: str
    message: str
    severity: str
    event_type: str
    equipment_id: str
    parameter: str
    delivery_status: str
    provider: str
    provider_sid: Optional[str] = None
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}

