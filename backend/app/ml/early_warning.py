"""Early Warning and Predictive Maintenance Engine.

Evaluates sensor readings against configurable thresholds and historical trends
to produce:
  - A list of EarlyWarning / ActiveFault / PredictedRisk findings
  - Maintenance recommendations for each finding

Rules are engineering-configurable via ThresholdConfig.
This module DOES NOT claim a confirmed leak or specific remaining-useful-life
unless the evidence (sensor flags) clearly supports it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from ..schemas import AlertType, HealthStatus, Priority, SensorReading, ThresholdConfig

# Default thresholds — override via ThresholdConfig
_DEFAULT_CFG = ThresholdConfig()


@dataclass
class EarlyWarningFinding:
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
    model_confidence: Optional[float] = None
    # Stable fingerprint — used to avoid duplicate DB rows / repeated alerts
    fingerprint: str = field(default="")

    def __post_init__(self):
        if not self.fingerprint:
            self.fingerprint = f"{self.parameter}:{self.alert_type}:{self.severity}"


def _sev(value: float, warn: float, crit: float, direction: str = "high") -> HealthStatus:
    """Return severity based on configured warn/crit levels."""
    if direction == "high":
        if value >= crit:
            return "Critical"
        if value >= warn:
            return "Warning"
    else:  # low
        if value <= crit:
            return "Critical"
        if value <= warn:
            return "Warning"
    return "Healthy"


def _priority(sev: HealthStatus, alert_type: AlertType) -> Priority:
    if sev == "Critical":
        return "Immediate"
    if sev == "Warning" and alert_type == "ActiveFault":
        return "High"
    if sev == "Warning" and alert_type == "EarlyWarning":
        return "Medium"
    return "Low"


def _timeframe(priority: Priority) -> str:
    return {
        "Immediate": "Within 2 hours",
        "High": "Within 24 hours",
        "Medium": "Within 72 hours",
        "Low": "Within 7 days",
    }[priority]


def analyze(reading: SensorReading, cfg: ThresholdConfig = _DEFAULT_CFG) -> List[EarlyWarningFinding]:
    """Analyse a single reading and return all findings (may be empty if Healthy)."""
    findings: List[EarlyWarningFinding] = []

    # ── Temperature ────────────────────────────────────────────────────────────
    sev = _sev(reading.temperature, cfg.temperature_warn, cfg.temperature_crit)
    if sev != "Healthy":
        atype: AlertType = "ActiveFault" if sev == "Critical" else "EarlyWarning"
        findings.append(EarlyWarningFinding(
            parameter="Winding Temperature",
            current_value=reading.temperature,
            configured_limit=cfg.temperature_crit if sev == "Critical" else cfg.temperature_warn,
            unit="°C",
            severity=sev,
            alert_type=atype,
            reason=(
                f"Winding temperature ({reading.temperature}°C) is approaching the "
                f"configured {'critical' if sev=='Critical' else 'warning'} limit "
                f"({cfg.temperature_crit if sev=='Critical' else cfg.temperature_warn}°C). "
                "Elevated winding temperature accelerates insulation ageing."
            ),
            trend_description="Temperature rising above normal operating band.",
            recommended_action=(
                "Immediately de-rate load and verify all cooling fans/pumps are running. "
                "Dispatch technician to inspect transformer cooling system." if sev == "Critical"
                else "Monitor temperature trend closely. Verify cooling fan operation and load level."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Oil Temperature ─────────────────────────────────────────────────────────
    sev = _sev(reading.oil_temperature, cfg.oil_temp_warn, cfg.oil_temp_crit)
    if sev != "Healthy":
        atype = "ActiveFault" if sev == "Critical" else "EarlyWarning"
        findings.append(EarlyWarningFinding(
            parameter="Oil Temperature",
            current_value=reading.oil_temperature,
            configured_limit=cfg.oil_temp_crit if sev == "Critical" else cfg.oil_temp_warn,
            unit="°C",
            severity=sev,
            alert_type=atype,
            reason=(
                f"Oil temperature ({reading.oil_temperature}°C) exceeds "
                f"{'critical' if sev=='Critical' else 'warning'} threshold "
                f"({cfg.oil_temp_crit if sev=='Critical' else cfg.oil_temp_warn}°C). "
                "High oil temperature degrades insulation and accelerates oil oxidation."
            ),
            trend_description="Oil temperature rising — possible cooling deficiency.",
            recommended_action=(
                "Reduce load immediately. Check and repair cooling system. Sample oil for DGA." if sev == "Critical"
                else "Verify cooling system performance. Schedule oil temperature trend review."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Winding Temperature (separate sensor) ──────────────────────────────────
    sev = _sev(reading.winding_temperature, cfg.winding_temp_warn, cfg.winding_temp_crit)
    if sev != "Healthy":
        atype = "ActiveFault" if sev == "Critical" else "EarlyWarning"
        findings.append(EarlyWarningFinding(
            parameter="Winding Hot-Spot Temperature",
            current_value=reading.winding_temperature,
            configured_limit=cfg.winding_temp_crit if sev == "Critical" else cfg.winding_temp_warn,
            unit="°C",
            severity=sev,
            alert_type=atype,
            reason=(
                f"Winding hot-spot indicator ({reading.winding_temperature}°C) is "
                f"{'above critical' if sev=='Critical' else 'approaching warning'} limit "
                f"({cfg.winding_temp_crit if sev=='Critical' else cfg.winding_temp_warn}°C). "
                "This is a direct indicator of thermal stress on insulation."
            ),
            trend_description="Winding hot-spot rising above rated level.",
            recommended_action=(
                "Immediate load reduction and thermal inspection required." if sev == "Critical"
                else "Monitor winding temperature trend. Verify load balance across phases."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Voltage ────────────────────────────────────────────────────────────────
    sev_high = _sev(reading.voltage, cfg.voltage_high_warn, cfg.voltage_high_crit)
    sev_low = _sev(reading.voltage, cfg.voltage_low_warn, cfg.voltage_low_crit, direction="low")

    if sev_high != "Healthy":
        atype = "ActiveFault" if sev_high == "Critical" else "EarlyWarning"
        findings.append(EarlyWarningFinding(
            parameter="Voltage (Overvoltage)",
            current_value=reading.voltage,
            configured_limit=cfg.voltage_high_crit if sev_high == "Critical" else cfg.voltage_high_warn,
            unit="kV",
            severity=sev_high,
            alert_type=atype,
            reason=(
                f"Measured voltage ({reading.voltage} kV) exceeds the "
                f"{'critical' if sev_high=='Critical' else 'warning'} high-voltage limit "
                f"({cfg.voltage_high_crit if sev_high=='Critical' else cfg.voltage_high_warn} kV). "
                "Sustained overvoltage stresses transformer insulation."
            ),
            trend_description="Bus voltage trending above nominal operating range.",
            recommended_action=(
                "Check AVR/tap changer immediately. Consider shedding load or adjusting reactive power." if sev_high == "Critical"
                else "Review tap changer position. Monitor voltage profile over next hour."
            ),
            priority=_priority(sev_high, atype),
            inspection_timeframe=_timeframe(_priority(sev_high, atype)),
        ))
    elif sev_low != "Healthy":
        atype = "ActiveFault" if sev_low == "Critical" else "EarlyWarning"
        findings.append(EarlyWarningFinding(
            parameter="Voltage (Undervoltage)",
            current_value=reading.voltage,
            configured_limit=cfg.voltage_low_crit if sev_low == "Critical" else cfg.voltage_low_warn,
            unit="kV",
            severity=sev_low,
            alert_type=atype,
            reason=(
                f"Measured voltage ({reading.voltage} kV) is below the "
                f"{'critical' if sev_low=='Critical' else 'warning'} low-voltage limit "
                f"({cfg.voltage_low_crit if sev_low=='Critical' else cfg.voltage_low_warn} kV). "
                "Low voltage may indicate heavy loading or grid disturbance."
            ),
            trend_description="Bus voltage dropping below nominal.",
            recommended_action=(
                "Check for feeder faults or overloading. Adjust tap changer. Alert grid operator." if sev_low == "Critical"
                else "Raise tap changer one step. Monitor loading and reactive power."
            ),
            priority=_priority(sev_low, atype),
            inspection_timeframe=_timeframe(_priority(sev_low, atype)),
        ))

    # ── Current ────────────────────────────────────────────────────────────────
    sev = _sev(reading.current, cfg.current_warn, cfg.current_crit)
    if sev != "Healthy":
        atype = "ActiveFault" if sev == "Critical" else "EarlyWarning"
        findings.append(EarlyWarningFinding(
            parameter="Load Current",
            current_value=reading.current,
            configured_limit=cfg.current_crit if sev == "Critical" else cfg.current_warn,
            unit="A",
            severity=sev,
            alert_type=atype,
            reason=(
                f"Load current ({reading.current} A) is approaching "
                f"{'critical' if sev=='Critical' else 'warning'} overload threshold "
                f"({cfg.current_crit if sev=='Critical' else cfg.current_warn} A). "
                "Sustained overload causes accelerated insulation ageing and thermal stress."
            ),
            trend_description="Current trending toward rated capacity limit.",
            recommended_action=(
                "Initiate load transfer immediately. Check for load-balancing opportunities." if sev == "Critical"
                else "Plan load transfer to adjacent feeders. Notify load dispatch."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Oil Level ──────────────────────────────────────────────────────────────
    sev = _sev(reading.oil_level, cfg.oil_level_warn, cfg.oil_level_crit, direction="low")
    if sev != "Healthy":
        # Distinguish: if leakage sensor also flags, it's stronger evidence
        has_leakage_indication = reading.oil_leakage >= 1
        if has_leakage_indication:
            atype = "ActiveFault"
            reason = (
                f"Oil level ({reading.oil_level}%) is declining AND the oil leakage sensor "
                f"indicates {'suspected' if reading.oil_leakage==1 else 'confirmed'} leakage. "
                "This combination warrants immediate inspection — however, a confirmed leak "
                "requires physical verification by a technician."
            )
        else:
            atype = "EarlyWarning" if sev == "Warning" else "ActiveFault"
            reason = (
                f"Oil level ({reading.oil_level}%) is below the "
                f"{'critical' if sev=='Critical' else 'warning'} threshold "
                f"({cfg.oil_level_crit if sev=='Critical' else cfg.oil_level_warn}%). "
                "Low oil level may indicate a gradual leak, improper topping-up, or oil expansion issues. "
                "Physical inspection is required to confirm the cause."
            )
        findings.append(EarlyWarningFinding(
            parameter="Oil Level",
            current_value=reading.oil_level,
            configured_limit=cfg.oil_level_crit if sev == "Critical" else cfg.oil_level_warn,
            unit="%",
            severity=sev,
            alert_type=atype,
            reason=reason,
            trend_description=(
                "Oil level declining — possible seepage or external leak." if has_leakage_indication
                else "Oil level below normal operating range."
            ),
            recommended_action=(
                "Immediately inspect for external oil leak. Do NOT energise if confirmed. "
                "Top up oil only after identifying root cause." if sev == "Critical" or has_leakage_indication
                else "Inspect conservator, radiators and gaskets for seepage. Schedule oil level monitoring."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Oil Leakage Sensor (standalone check) ──────────────────────────────────
    if reading.oil_leakage >= 1 and not any(f.parameter == "Oil Level" for f in findings):
        # Leakage indicated but oil level still OK — early warning
        findings.append(EarlyWarningFinding(
            parameter="Oil Leakage Sensor",
            current_value=float(reading.oil_leakage),
            configured_limit=0.0,
            unit="",
            severity="Warning",
            alert_type="EarlyWarning",
            reason=(
                f"Oil leakage sensor reports {'suspected' if reading.oil_leakage==1 else 'confirmed'} leakage "
                "but the oil level gauge still reads within normal range. "
                "This may be a sensor artefact or a very early-stage seepage. "
                "Physical inspection is required to confirm."
            ),
            trend_description="Leakage sensor active — oil level still within range.",
            recommended_action=(
                "Schedule visual inspection of seals, gaskets, and radiator connections within 24 hours."
            ),
            priority="High",
            inspection_timeframe="Within 24 hours",
        ))

    # ── Humidity / Moisture ────────────────────────────────────────────────────
    sev = _sev(reading.humidity, cfg.humidity_warn, cfg.humidity_crit)
    if sev != "Healthy":
        atype = "EarlyWarning" if sev == "Warning" else "ActiveFault"
        findings.append(EarlyWarningFinding(
            parameter="Moisture / Humidity",
            current_value=reading.humidity,
            configured_limit=cfg.humidity_crit if sev == "Critical" else cfg.humidity_warn,
            unit="%",
            severity=sev,
            alert_type=atype,
            reason=(
                f"Humidity indicator ({reading.humidity}%) is above the "
                f"{'critical' if sev=='Critical' else 'warning'} threshold "
                f"({cfg.humidity_crit if sev=='Critical' else cfg.humidity_warn}%). "
                "High moisture in oil or the tank atmosphere indicates possible insulation degradation "
                "or breather/silica-gel saturation."
            ),
            trend_description="Moisture rising — possible oil degradation or breather saturation.",
            recommended_action=(
                "Perform dissolved gas analysis (DGA) and moisture-in-oil test. "
                "Replace silica-gel breather. If confirmed, consider dry-out procedure." if sev == "Critical"
                else "Check and replace silica-gel breather. Sample oil for moisture content."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Oil Condition ──────────────────────────────────────────────────────────
    sev = _sev(reading.oil_condition, cfg.oil_condition_warn, cfg.oil_condition_crit, direction="low")
    if sev != "Healthy":
        atype = "EarlyWarning" if sev == "Warning" else "ActiveFault"
        findings.append(EarlyWarningFinding(
            parameter="Oil Condition Index",
            current_value=reading.oil_condition,
            configured_limit=cfg.oil_condition_crit if sev == "Critical" else cfg.oil_condition_warn,
            unit="/100",
            severity=sev,
            alert_type=atype,
            reason=(
                f"Oil condition quality index ({reading.oil_condition}/100) is below "
                f"{'critical' if sev=='Critical' else 'warning'} threshold "
                f"({cfg.oil_condition_crit if sev=='Critical' else cfg.oil_condition_warn}/100). "
                "Degraded oil reduces dielectric strength and cooling efficiency."
            ),
            trend_description="Oil quality deteriorating — dielectric strength may be reduced.",
            recommended_action=(
                "Immediate oil sampling and DGA required. Plan oil regeneration or replacement." if sev == "Critical"
                else "Schedule oil sampling. Review dissolved gas and acidity levels."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Vibration ──────────────────────────────────────────────────────────────
    sev = _sev(reading.vibration, cfg.vibration_warn, cfg.vibration_crit)
    if sev != "Healthy":
        atype = "EarlyWarning" if sev == "Warning" else "ActiveFault"
        findings.append(EarlyWarningFinding(
            parameter="Vibration",
            current_value=reading.vibration,
            configured_limit=cfg.vibration_crit if sev == "Critical" else cfg.vibration_warn,
            unit="mm/s",
            severity=sev,
            alert_type=atype,
            reason=(
                f"Vibration level ({reading.vibration} mm/s) is above the "
                f"{'critical' if sev=='Critical' else 'warning'} threshold "
                f"({cfg.vibration_crit if sev=='Critical' else cfg.vibration_warn} mm/s). "
                "Increased vibration may indicate loose core laminations, cooling fan imbalance, "
                "or resonance with external forces."
            ),
            trend_description="Vibration amplitude increasing — mechanical integrity concern.",
            recommended_action=(
                "Inspect core clamping, bushing connections, and cooling fans immediately." if sev == "Critical"
                else "Schedule vibration analysis. Check for loose hardware and fan balance."
            ),
            priority=_priority(sev, atype),
            inspection_timeframe=_timeframe(_priority(sev, atype)),
        ))

    # ── Pressure ────────────────────────────────────────────────────────────────
    sev_high = _sev(reading.pressure, cfg.pressure_high_warn, cfg.pressure_high_crit)
    sev_low = _sev(reading.pressure, cfg.pressure_low_warn, 0.0, direction="low")

    if sev_high != "Healthy":
        atype = "ActiveFault" if sev_high == "Critical" else "EarlyWarning"
        findings.append(EarlyWarningFinding(
            parameter="Conservator Pressure",
            current_value=reading.pressure,
            configured_limit=cfg.pressure_high_crit if sev_high == "Critical" else cfg.pressure_high_warn,
            unit="bar",
            severity=sev_high,
            alert_type=atype,
            reason=(
                f"Conservator/tank pressure ({reading.pressure} bar) exceeds the "
                f"{'critical' if sev_high=='Critical' else 'warning'} threshold "
                f"({cfg.pressure_high_crit if sev_high=='Critical' else cfg.pressure_high_warn} bar). "
                "Abnormal pressure may indicate internal arcing or buchholz relay activity."
            ),
            trend_description="Pressure elevated — possible internal gas generation.",
            recommended_action=(
                "Check buchholz relay gas collector. Perform DGA immediately. "
                "De-energise if buchholz relay has tripped." if sev_high == "Critical"
                else "Inspect buchholz relay. Schedule DGA test. Monitor pressure trend."
            ),
            priority=_priority(sev_high, atype),
            inspection_timeframe=_timeframe(_priority(sev_high, atype)),
        ))
    elif sev_low != "Healthy":
        findings.append(EarlyWarningFinding(
            parameter="Conservator Pressure (Low)",
            current_value=reading.pressure,
            configured_limit=cfg.pressure_low_warn,
            unit="bar",
            severity="Warning",
            alert_type="EarlyWarning",
            reason=(
                f"Conservator pressure ({reading.pressure} bar) is abnormally low. "
                "This may indicate a leak in the conservator diaphragm or oil drain."
            ),
            trend_description="Pressure falling below normal conservator operating range.",
            recommended_action="Inspect conservator bladder/diaphragm and seals for leakage.",
            priority="Medium",
            inspection_timeframe="Within 72 hours",
        ))

    # ── Cooling Fan Status ──────────────────────────────────────────────────────
    if reading.cooling_fan_status == 0:
        findings.append(EarlyWarningFinding(
            parameter="Cooling Fan",
            current_value=0.0,
            configured_limit=1.0,
            unit="",
            severity="Warning",
            alert_type="ActiveFault",
            reason=(
                "One or more cooling fans have reported a fault condition. "
                "Reduced cooling capacity increases thermal stress, especially under heavy load."
            ),
            trend_description="Cooling fan fault active.",
            recommended_action=(
                "Inspect cooling fan motors, contactors and protective relays. "
                "Reduce load if ambient temperature is high. Repair/replace faulty fans before next high-load period."
            ),
            priority="High",
            inspection_timeframe="Within 24 hours",
        ))

    # ── Cooling Pump Status ─────────────────────────────────────────────────────
    if reading.cooling_pump_status == 0:
        findings.append(EarlyWarningFinding(
            parameter="Cooling Oil Pump",
            current_value=0.0,
            configured_limit=1.0,
            unit="",
            severity="Warning",
            alert_type="ActiveFault",
            reason=(
                "The forced oil cooling pump has reported a fault. "
                "Without forced oil circulation the transformer's thermal rating is significantly reduced."
            ),
            trend_description="Forced oil cooling pump offline.",
            recommended_action=(
                "Immediately check pump motor, motor protection relay and oil flow switch. "
                "Reduce transformer load to natural-cooling rating until pump is restored."
            ),
            priority="High",
            inspection_timeframe="Within 24 hours",
        ))

    return findings
