// Sensor simulator + lightweight rule-based classifier.
// Used when the FastAPI backend is not reachable, so the demo always works
// in the Lovable preview. The real Random Forest lives in backend/app/ml/.

import type { AlertItem, Prediction, SensorReading } from "./types";

// Normal operating envelopes for an EHV 400/220 kV transformer bay.
const NORMAL = {
  temperature: { min: 40, max: 70, warn: 80, crit: 95 },
  voltage:     { min: 395, max: 405, warn: 410, crit: 420 }, // kV on HV side
  current:     { min: 300, max: 800, warn: 950, crit: 1100 },
  oil_level:   { min: 60, max: 90, warn: 55, crit: 45 },     // lower = worse
  humidity:    { min: 20, max: 55, warn: 65, crit: 80 },
  vibration:   { min: 0.5, max: 3.5, warn: 5.0, crit: 7.5 },
};

// Small helper to jitter a value within +/- pct of its range.
function jitter(base: number, spread: number) {
  return Math.round((base + (Math.random() - 0.5) * spread) * 100) / 100;
}

// One-shot random reading, biased by a fault mode for realistic demos.
export type FaultMode =
  | "normal"
  | "overheat"
  | "overload"
  | "oil_leak"
  | "insulation"
  | "cooling_fault"
  | "pressure_fault";

export function generateReading(mode: FaultMode = "normal"): SensorReading {
  const r: SensorReading = {
    timestamp: new Date().toISOString(),
    equipment_id: "T1-400kV",
    temperature: jitter(55, 15),
    voltage: jitter(400, 6),
    current: jitter(550, 250),
    oil_level: jitter(78, 10),
    humidity: jitter(38, 15),
    vibration: jitter(2, 1.5),
    oil_temperature: jitter(50, 8),
    winding_temperature: jitter(65, 10),
    oil_leakage: 0,
    pressure: jitter(0.5, 0.2),
    cooling_fan_status: 1,
    cooling_pump_status: 1,
    oil_condition: jitter(85, 5),
    load_factor: jitter(0.6, 0.2),
  };

  switch (mode) {
    case "overheat":
      r.temperature = jitter(92, 10);
      r.oil_level = jitter(58, 6);
      r.oil_temperature = jitter(88, 8);
      r.winding_temperature = jitter(105, 8);
      r.cooling_fan_status = 0;
      break;
    case "overload":
      r.current = jitter(1050, 120);
      r.temperature = jitter(82, 8);
      r.winding_temperature = jitter(98, 8);
      r.load_factor = jitter(0.92, 0.05);
      break;
    case "oil_leak":
      r.oil_level = jitter(48, 6);
      r.temperature = jitter(78, 8);
      r.oil_temperature = jitter(80, 6);
      r.oil_leakage = Math.random() > 0.5 ? 1 : 2;
      r.pressure = jitter(0.08, 0.05);
      break;
    case "insulation":
      r.humidity = jitter(75, 10);
      r.vibration = jitter(6, 1.5);
      r.oil_condition = jitter(38, 8);
      break;
    case "cooling_fault":
      r.cooling_fan_status = 0;
      r.cooling_pump_status = 0;
      r.temperature = jitter(78, 8);
      r.oil_temperature = jitter(82, 6);
      break;
    case "pressure_fault":
      r.pressure = jitter(1.4, 0.2);
      r.vibration = jitter(5.5, 1.0);
      break;
  }

  return r;
}

// Rule-based classifier — mirrors what the sklearn RandomForest learns from
// the synthetic dataset generated in backend/app/ml/train.py.
export function predict(r: SensorReading): Prediction {
  const reasons: string[] = [];
  let score = 0;

  const check = (
    name: string,
    value: number,
    warn: number,
    crit: number,
    direction: "high" | "low"
  ) => {
    const bad =
      direction === "high"
        ? value >= crit
          ? 2
          : value >= warn
            ? 1
            : 0
        : value <= crit
          ? 2
          : value <= warn
            ? 1
            : 0;
    if (bad > 0) reasons.push(`${name} ${direction === "high" ? "high" : "low"} (${value})`);
    score += bad;
  };

  check("Temperature", r.temperature, NORMAL.temperature.warn, NORMAL.temperature.crit, "high");
  check("Voltage", r.voltage, NORMAL.voltage.warn, NORMAL.voltage.crit, "high");
  check("Current", r.current, NORMAL.current.warn, NORMAL.current.crit, "high");
  check("Oil level", r.oil_level, NORMAL.oil_level.warn, NORMAL.oil_level.crit, "low");
  check("Humidity", r.humidity, NORMAL.humidity.warn, NORMAL.humidity.crit, "high");
  check("Vibration", r.vibration, NORMAL.vibration.warn, NORMAL.vibration.crit, "high");

  // Additional checks
  if (r.cooling_fan_status === 0) { reasons.push("Cooling fan fault"); score += 1; }
  if (r.cooling_pump_status === 0) { reasons.push("Cooling pump fault"); score += 1; }
  if (r.oil_leakage >= 1) { reasons.push(`Oil leakage ${r.oil_leakage === 1 ? "suspected" : "indicated"}`); score += 1; }

  let status: Prediction["status"] = "Healthy";
  if (score >= 3) status = "Critical";
  else if (score >= 1) status = "Warning";

  const failure_probability = Math.min(1, score / 6 + Math.random() * 0.05);

  const recommendation =
    status === "Critical"
      ? "Isolate the bay, dispatch maintenance crew immediately, inspect cooling & insulation."
      : status === "Warning"
        ? "Schedule inspection within 24h. Verify cooling fans, oil level and load balance."
        : "Continue routine monitoring. No action required.";

  return {
    status,
    failure_probability: Math.round(failure_probability * 100) / 100,
    recommendation,
    reasons,
  };
}

export function makeAlert(r: SensorReading, p: Prediction): AlertItem | null {
  if (p.status === "Healthy") return null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: r.timestamp,
    severity: p.status,
    message: `${p.status.toUpperCase()}: ${p.reasons.join(", ") || "abnormal readings"}`,
    equipment_id: r.equipment_id,
    parameter: p.reasons[0] ?? "multiple",
    alert_type: p.status === "Critical" ? "ActiveFault" : "EarlyWarning",
    resolved: false,
    is_read: false,
  };
}
