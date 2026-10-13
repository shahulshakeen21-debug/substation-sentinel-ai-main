import type { AlertItem, HealthStatus, Prediction, SensorReading } from "@/lib/types";

export type TransformerComponentId =
  | "main_tank"
  | "conservator_tank"
  | "hv_bushings"
  | "lv_bushings"
  | "radiator_cooling"
  | "cooling_fans"
  | "cooling_pumps"
  | "oil_piping"
  | "buchholz_relay"
  | "tap_changer"
  | "explosion_vent"
  | "marshalling_kiosk";

export type ComponentVisualState = "Healthy" | "Warning" | "Critical" | "Unknown";

export interface ComponentTelemetryData {
  name: string;
  unit: string;
  value: number | string;
  thresholdWarn?: string;
  thresholdCrit?: string;
}

export interface ComponentDiagnostic {
  id: TransformerComponentId;
  label: string;
  subsystem: string;
  description: string;
  state: ComponentVisualState;
  primaryTelemetry: ComponentTelemetryData[];
  relatedAlerts: AlertItem[];
  mlRiskProbability?: number;
  mlRecommendation?: string;
  recommendedInspection: string[];
}

export interface CameraPreset {
  id: string;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}
