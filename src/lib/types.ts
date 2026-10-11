// Shared types for the Digital Twin frontend.
// Backend (FastAPI) returns the same shapes; keep in sync with backend/app/schemas.py.

export type HealthStatus = "Healthy" | "Warning" | "Critical";
export type AlertType = "EarlyWarning" | "ActiveFault" | "PredictedRisk" | "Recovery";
export type MaintenanceStatus = "Pending" | "InProgress" | "Completed";
export type Priority = "Immediate" | "High" | "Medium" | "Low";

export interface SensorReading {
  timestamp: string;           // ISO timestamp
  equipment_id: string;        // e.g. "T1-400kV"
  temperature: number;         // winding °C
  voltage: number;             // kV (line voltage)
  current: number;             // A
  oil_level: number;           // %
  humidity: number;            // %
  vibration: number;           // mm/s

  // Extended transformer parameters
  oil_temperature: number;     // °C
  winding_temperature: number; // °C hot-spot
  oil_leakage: number;         // 0=None, 1=Suspected, 2=Confirmed
  pressure: number;            // bar
  cooling_fan_status: number;  // 1=OK, 0=Fault
  cooling_pump_status: number; // 1=OK, 0=Fault
  oil_condition: number;       // quality 0-100
  load_factor: number;         // 0-1
}

export interface Prediction {
  status: HealthStatus;
  failure_probability: number; // 0..1
  recommendation: string;
  reasons: string[];           // which sensors triggered the status
  model_confidence?: number;
}

export interface AlertItem {
  id: string;
  timestamp: string;
  severity: HealthStatus;
  message: string;
  equipment_id: string;
  parameter: string;
  alert_type: AlertType;
  resolved: boolean;
  is_read: boolean;
}

export interface MaintenanceItem {
  id: number;
  created_at: string;
  updated_at: string;
  equipment_id: string;
  parameter: string;
  current_value: number;
  configured_limit: number;
  unit: string;
  severity: HealthStatus;
  alert_type: AlertType;
  reason: string;
  trend_description: string;
  recommended_action: string;
  priority: Priority;
  inspection_timeframe: string;
  status: MaintenanceStatus;
  model_confidence?: number;
  completed_at?: string;
  completed_by?: string;
  completion_notes?: string;
}

export interface EquipmentHealthSummary {
  equipment_id: string;
  overall_status: HealthStatus;
  failure_probability: number;
  active_warnings: number;
  active_faults: number;
  pending_maintenance: number;
  last_updated?: string;
}

export interface ThresholdConfig {
  temperature_warn: number;
  temperature_crit: number;
  voltage_high_warn: number;
  voltage_high_crit: number;
  voltage_low_warn: number;
  voltage_low_crit: number;
  current_warn: number;
  current_crit: number;
  oil_level_warn: number;
  oil_level_crit: number;
  humidity_warn: number;
  humidity_crit: number;
  vibration_warn: number;
  vibration_crit: number;
  oil_temp_warn: number;
  oil_temp_crit: number;
  winding_temp_warn: number;
  winding_temp_crit: number;
  pressure_high_warn: number;
  pressure_high_crit: number;
  pressure_low_warn: number;
  oil_condition_warn: number;
  oil_condition_crit: number;
}

// WebSocket notification payload
export interface WsNotification {
  event: "new_alert" | "alert_resolved";
  id: number;
  timestamp: string;
  severity: HealthStatus | "Healthy";
  message: string;
  equipment_id: string;
  parameter: string;
  alert_type: AlertType | "Recovery";
}

// SMS Configuration
export interface SmsConfig {
  enabled: boolean;
  provider: "twilio" | "fast2sms" | "simulator";
  min_severity: "Warning" | "Critical";
  send_recovery: boolean;
  cooldown_minutes: number;
  recipient_numbers: string;
  is_live_configured: boolean;
  provider_name: string;
}

// SMS Delivery Log
export interface SmsLogItem {
  id: number;
  timestamp: string;
  recipient: string;
  message: string;
  severity: string;
  event_type: string;
  equipment_id: string;
  parameter: string;
  delivery_status: "delivered" | "sent" | "simulated" | "failed";
  provider: string;
  provider_sid?: string;
  error_message?: string;
}

