import type { AlertItem, Prediction, SensorReading } from "@/lib/types";
import type {
  ComponentDiagnostic,
  ComponentVisualState,
  TransformerComponentId,
} from "./types";

export function evaluateComponentDiagnostics(
  reading: SensorReading | null | undefined,
  prediction: Prediction | null | undefined,
  alerts: AlertItem[] = [],
  isSimulated: boolean = true,
): Record<TransformerComponentId, ComponentDiagnostic> {
  // If telemetry is completely missing, return Unknown states
  if (!reading) {
    return createUnknownDiagnostics();
  }

  const findAlertsForComponent = (keywords: string[]): AlertItem[] => {
    return alerts.filter((a) => {
      const text = `${a.parameter} ${a.message}`.toLowerCase();
      return keywords.some((kw) => text.includes(kw.toLowerCase()));
    });
  };

  // Helper to determine severity from related alerts and threshold checks
  const getSev = (
    value: number | undefined,
    warnThresh: number,
    critThresh: number,
    lowIsBad: boolean = false,
  ): ComponentVisualState => {
    if (value === undefined || isNaN(value)) return "Unknown";
    if (lowIsBad) {
      if (value <= critThresh) return "Critical";
      if (value <= warnThresh) return "Warning";
      return "Healthy";
    } else {
      if (value >= critThresh) return "Critical";
      if (value >= warnThresh) return "Warning";
      return "Healthy";
    }
  };

  // 1. MAIN TANK (Thermal & mechanical envelope: Winding Temp, Oil Temp, Vibration)
  const windingSev = getSev(reading.winding_temperature ?? reading.temperature, 95, 115);
  const oilTempSev = getSev(reading.oil_temperature, 85, 100);
  const vibSev = getSev(reading.vibration, 5.0, 7.5);
  const mainTankAlerts = findAlertsForComponent(["winding", "temperature", "overheat", "vibration", "insulation"]);
  let mainTankState: ComponentVisualState = "Healthy";
  if (windingSev === "Critical" || oilTempSev === "Critical" || vibSev === "Critical" || mainTankAlerts.some((a) => a.severity === "Critical")) {
    mainTankState = "Critical";
  } else if (windingSev === "Warning" || oilTempSev === "Warning" || vibSev === "Warning" || mainTankAlerts.some((a) => a.severity === "Warning")) {
    mainTankState = "Warning";
  }

  // 2. CONSERVATOR TANK (Oil Level, Conservator Pressure, Moisture)
  const oilLevelSev = getSev(reading.oil_level, 55, 45, true);
  const pressureSev = reading.pressure !== undefined
    ? reading.pressure >= 1.5 || reading.pressure <= 0.05
      ? "Critical"
      : reading.pressure >= 1.0 || reading.pressure <= 0.1
      ? "Warning"
      : "Healthy"
    : "Unknown";
  const conservatorAlerts = findAlertsForComponent(["oil level", "conservator", "breather", "moisture", "humidity"]);
  let conservatorState: ComponentVisualState = "Healthy";
  if (oilLevelSev === "Critical" || pressureSev === "Critical" || conservatorAlerts.some((a) => a.severity === "Critical")) {
    conservatorState = "Critical";
  } else if (oilLevelSev === "Warning" || pressureSev === "Warning" || conservatorAlerts.some((a) => a.severity === "Warning")) {
    conservatorState = "Warning";
  }

  // 3. HV BUSHINGS (400 kV Bushings: Voltage, Current, Overvoltage)
  const voltHighSev = getSev(reading.voltage, 410, 420);
  const currSev = getSev(reading.current, 950, 1100);
  const hvAlerts = findAlertsForComponent(["voltage", "overvoltage", "current", "bushing", "overload", "phase"]);
  let hvState: ComponentVisualState = "Healthy";
  if (voltHighSev === "Critical" || currSev === "Critical" || hvAlerts.some((a) => a.severity === "Critical")) {
    hvState = "Critical";
  } else if (voltHighSev === "Warning" || currSev === "Warning" || hvAlerts.some((a) => a.severity === "Warning")) {
    hvState = "Warning";
  }

  // 4. LV BUSHINGS (220 kV Terminals & Neutral)
  const lvAlerts = findAlertsForComponent(["secondary", "neutral", "tap", "lv bushing", "overload"]);
  let lvState: ComponentVisualState = currSev === "Critical" ? "Critical" : currSev === "Warning" ? "Warning" : "Healthy";
  if (lvAlerts.some((a) => a.severity === "Critical")) lvState = "Critical";
  else if (lvAlerts.some((a) => a.severity === "Warning")) lvState = "Warning";

  // 5. RADIATOR BANKS (Cooling heat exchange fins)
  const radiatorAlerts = findAlertsForComponent(["cooling", "radiator", "oil temp", "fan"]);
  let radiatorState: ComponentVisualState = "Healthy";
  if (reading.cooling_fan_status === 0 && reading.cooling_pump_status === 0) radiatorState = "Critical";
  else if (reading.cooling_fan_status === 0 || reading.cooling_pump_status === 0 || oilTempSev !== "Healthy") radiatorState = "Warning";
  if (radiatorAlerts.some((a) => a.severity === "Critical")) radiatorState = "Critical";

  // 6. COOLING FANS
  const fanState: ComponentVisualState = reading.cooling_fan_status === 0 ? "Critical" : "Healthy";

  // 7. COOLING PUMPS
  const pumpState: ComponentVisualState = reading.cooling_pump_status === 0 ? "Critical" : "Healthy";

  // 8. OIL PIPING & SEALS (Oil leakage sensor, pressure drop)
  const leakageVal = reading.oil_leakage ?? 0;
  const pipingAlerts = findAlertsForComponent(["leak", "seepage", "pipe", "seal", "gasket"]);
  let pipingState: ComponentVisualState = leakageVal === 2 ? "Critical" : leakageVal === 1 ? "Warning" : "Healthy";
  if (pipingAlerts.some((a) => a.severity === "Critical")) pipingState = "Critical";
  else if (pipingAlerts.some((a) => a.severity === "Warning") && pipingState === "Healthy") pipingState = "Warning";

  // 9. BUCHHOLZ RELAY (Gas accumulation & surge between main tank and conservator)
  const buchholzAlerts = findAlertsForComponent(["buchholz", "gas", "pressure fault", "surge"]);
  let buchholzState: ComponentVisualState = "Healthy";
  if (reading.pressure >= 1.5 || buchholzAlerts.some((a) => a.severity === "Critical")) {
    buchholzState = "Critical";
  } else if (reading.pressure >= 1.2 || buchholzAlerts.some((a) => a.severity === "Warning")) {
    buchholzState = "Warning";
  }

  // 10. TAP CHANGER (OLTC)
  const oltcAlerts = findAlertsForComponent(["tap", "oltc", "voltage regulation", "diverter"]);
  let oltcState: ComponentVisualState = oltcAlerts.some((a) => a.severity === "Critical")
    ? "Critical"
    : oltcAlerts.some((a) => a.severity === "Warning")
    ? "Warning"
    : "Healthy";

  // 11. EXPLOSION VENT / PRD
  let prdState: ComponentVisualState = reading.pressure >= 1.4 ? "Critical" : "Healthy";

  // 12. MARSHALLING KIOSK
  let kioskState: ComponentVisualState = (fanState !== "Healthy" || pumpState !== "Healthy") ? "Warning" : "Healthy";

  return {
    main_tank: {
      id: "main_tank",
      label: "Main Transformer Tank & Core/Winding Assembly",
      subsystem: "Core Active Part & Winding Enclosure",
      description: "Heavy welded steel tank enclosing the 315 MVA 400/220kV magnetic core and high-grade copper windings submerged in mineral insulating oil.",
      state: mainTankState,
      primaryTelemetry: [
        { name: "Winding Hot-Spot", value: reading.winding_temperature ?? reading.temperature, unit: "°C", thresholdWarn: "95 °C", thresholdCrit: "115 °C" },
        { name: "Top Oil Temperature", value: reading.oil_temperature, unit: "°C", thresholdWarn: "85 °C", thresholdCrit: "100 °C" },
        { name: "Tank Vibration", value: reading.vibration, unit: "mm/s", thresholdWarn: "5.0 mm/s", thresholdCrit: "7.5 mm/s" },
        { name: "Oil Quality Index", value: reading.oil_condition, unit: "/100", thresholdWarn: "60 /100", thresholdCrit: "40 /100" },
      ],
      relatedAlerts: mainTankAlerts,
      mlRiskProbability: prediction?.failure_probability,
      mlRecommendation: prediction?.recommendation,
      recommendedInspection: [
        "Perform infrared thermography survey on main tank walls for localized eddy current hot spots.",
        "Verify core-to-ground isolation test (Megger 1kV testing: nominal > 500 MΩ).",
        "Draw representative oil sample from lower drain valve for dissolved gas analysis (DGA - IEC 60599).",
        "Inspect exterior tank stiffeners and welded seams for acoustic vibration chattering.",
      ],
    },
    conservator_tank: {
      id: "conservator_tank",
      label: "Conservator Oil Reservoir & Dehydrating Breather",
      subsystem: "Oil Preservation & Expansion System",
      description: "Elevated cylindrical tank accommodating oil thermal expansion, equipped with magnetic oil level gauge (MOG) and silica-gel moisture trap breather.",
      state: conservatorState,
      primaryTelemetry: [
        { name: "Magnetic Oil Level (MOG)", value: reading.oil_level, unit: "%", thresholdWarn: "< 55 %", thresholdCrit: "< 45 %" },
        { name: "Tank Pressure", value: reading.pressure, unit: "bar", thresholdWarn: "> 1.0 or < 0.1 bar", thresholdCrit: "> 1.5 or < 0.05 bar" },
        { name: "Humidity / Moisture Index", value: reading.humidity, unit: "%", thresholdWarn: "> 65 %", thresholdCrit: "> 80 %" },
      ],
      relatedAlerts: conservatorAlerts,
      mlRiskProbability: prediction?.failure_probability,
      mlRecommendation: prediction?.recommendation,
      recommendedInspection: [
        "Verify magnetic oil level gauge mechanical pointer against physical sight-glass calibration.",
        "Inspect silica-gel breather chamber; replace immediately if desiccating crystals show pink/saturated color.",
        "Check oil seal cup at bottom of breather for clean oil level and unobstructed air bubbling.",
        "Verify rubber diaphragm / air cell integrity inside the conservator if nitrogen-blanketed.",
      ],
    },
    hv_bushings: {
      id: "hv_bushings",
      label: "400 kV High Voltage Outdoor Bushings (R-Y-B)",
      subsystem: "Primary Electrical Feed & Insulation Barrier",
      description: "Oil-impregnated paper (OIP) or resin-impregnated synthetic (RIP) 400kV outdoor porcelain condenser bushings connecting the transmission line to internal windings.",
      state: hvState,
      primaryTelemetry: [
        { name: "Primary Bus Voltage", value: reading.voltage, unit: "kV", thresholdWarn: "410 kV", thresholdCrit: "420 kV" },
        { name: "HV Phase Current", value: reading.current, unit: "A", thresholdWarn: "950 A", thresholdCrit: "1100 A" },
        { name: "Transformer Bay Load", value: Math.round((reading.load_factor ?? 0.6) * 100), unit: "%", thresholdWarn: "> 85 %", thresholdCrit: "> 95 %" },
      ],
      relatedAlerts: hvAlerts,
      mlRiskProbability: prediction?.failure_probability,
      recommendedInspection: [
        "Inspect porcelain sheds for surface tracking, industrial pollution accumulation, or hairline fissures.",
        "Perform IR thermographic scan on top terminal palms and test taps for high-resistance joints.",
        "Verify capacitance and dissipation factor (tan delta / power factor) on bushing test tap.",
        "Inspect oil sight-domes atop condenser bushings for oil discoloration or low level.",
      ],
    },
    lv_bushings: {
      id: "lv_bushings",
      label: "220 kV Secondary Bushings & Neutral Bushing",
      subsystem: "Secondary Transmission & Grounding Interface",
      description: "Three-phase 220kV outdoor bushings and dedicated solid-grounding neutral bushing carrying secondary stepped-down power.",
      state: lvState,
      primaryTelemetry: [
        { name: "Load Current", value: reading.current, unit: "A", thresholdWarn: "950 A", thresholdCrit: "1100 A" },
        { name: "Neutral Current Balance", value: "Balanced", unit: "", thresholdWarn: "Unbalance > 10%", thresholdCrit: "Unbalance > 25%" },
      ],
      relatedAlerts: lvAlerts,
      mlRiskProbability: prediction?.failure_probability,
      recommendedInspection: [
        "Inspect terminal torque marks on flexible bi-metallic dropper connectors to 220kV busbar.",
        "Verify neutral grounding CT (Current Transformer) connection and earth bus link integrity.",
        "Check corona rings for displacement or spark erosion pitting.",
      ],
    },
    radiator_cooling: {
      id: "radiator_cooling",
      label: "Forced-Oil / Forced-Air Radiator Cooling Banks",
      subsystem: "Thermal Dissipation (OFAF / ONAF System)",
      description: "Flanged radiator banks with multi-fin convective cooling elements, butterfly isolation valves, and automated forced-cooling circulation.",
      state: radiatorState,
      primaryTelemetry: [
        { name: "Top Oil Temperature", value: reading.oil_temperature, unit: "°C", thresholdWarn: "85 °C", thresholdCrit: "100 °C" },
        { name: "Cooling Fan Bank", value: reading.cooling_fan_status === 1 ? "Operational" : "Faulted", unit: "", thresholdWarn: "Tripped", thresholdCrit: "Lockout" },
        { name: "Oil Circulation Pump", value: reading.cooling_pump_status === 1 ? "Operational" : "Faulted", unit: "", thresholdWarn: "Tripped", thresholdCrit: "Lockout" },
      ],
      relatedAlerts: radiatorAlerts,
      mlRiskProbability: prediction?.failure_probability,
      recommendedInspection: [
        "Perform thermal imaging of radiator fins to verify uniform oil flow distribution (detect choked fin tubes).",
        "Inspect upper and lower radiator butterfly valves to ensure they are locked in 100% open position.",
        "Wash cooling fin surfaces to remove airborne dust and debris blankets.",
        "Inspect radiator header pipe flanges and gasket joints for seepage.",
      ],
    },
    cooling_fans: {
      id: "cooling_fans",
      label: "Forced Cooling Fan Assemblies",
      subsystem: "Auxiliary Aerodynamic Heat Rejection",
      description: "High-efficiency weather-proof axial fans mounted below or alongside radiator banks to force airflow during elevated loading.",
      state: fanState,
      primaryTelemetry: [
        { name: "Fan Group Status", value: reading.cooling_fan_status === 1 ? "Running Normal" : "Motor Trip / Fault", unit: "", thresholdWarn: "Group 1 Trip", thresholdCrit: "All Groups Locked" },
      ],
      relatedAlerts: findAlertsForComponent(["fan", "cooling"]),
      recommendedInspection: [
        "Check fan motor thermal overload relays and control contactors in marshalling box.",
        "Verify fan blade clearance, aerodynamic balance, and protective finger guards.",
        "Lubricate motor bearings with approved extreme-temperature grease.",
      ],
    },
    cooling_pumps: {
      id: "cooling_pumps",
      label: "Submersible Oil Circulation Pumps",
      subsystem: "Forced Oil Flow Circuit",
      description: "Glandless centrifugal pumps driving oil velocity across winding ducts to optimize hot-spot thermal extraction.",
      state: pumpState,
      primaryTelemetry: [
        { name: "Pump Operation", value: reading.cooling_pump_status === 1 ? "Running Normal" : "Differential Flow Alarm", unit: "", thresholdWarn: "Cavitation", thresholdCrit: "Reverse Flow" },
      ],
      relatedAlerts: findAlertsForComponent(["pump", "cooling", "circulation"]),
      recommendedInspection: [
        "Check pump oil-flow sight indicator flapper in discharge piping.",
        "Verify pump motor phase rotation direction (reverse rotation severely starves cooling).",
        "Measure motor running current against nameplate rating.",
      ],
    },
    oil_piping: {
      id: "oil_piping",
      label: "Oil Header Piping & Flanged Gasket Seals",
      subsystem: "Hydraulic Insulating Fluid Conduit",
      description: "Heavy seamless steel pipework routing oil between main tank, conservator, Buchholz relay, and radiator isolation manifolds.",
      state: pipingState,
      primaryTelemetry: [
        { name: "Oil Leakage Flag", value: leakageVal === 2 ? "Confirmed Leak" : leakageVal === 1 ? "Suspected Seepage" : "Tight / Zero Leakage", unit: "", thresholdWarn: "Suspected", thresholdCrit: "Confirmed" },
        { name: "Conservator Pipe Pressure", value: reading.pressure, unit: "bar", thresholdWarn: "Abnormal", thresholdCrit: "Depressurized" },
      ],
      relatedAlerts: pipingAlerts,
      recommendedInspection: [
        "Visually inspect all nitrile/viton cork gasket flanges using UV fluorescent leak detector.",
        "Check sample valve and drain valve threaded plugs for weeping oil drops.",
        "Verify slope of conservator pipework (minimum 2° to 4° upward slope to Buchholz relay for proper gas venting).",
      ],
    },
    buchholz_relay: {
      id: "buchholz_relay",
      label: "Buchholz Protective Relay (Gas & Surge)",
      subsystem: "Internal Incipient Fault Protection",
      description: "Dual-float protective device installed in pipe connecting main tank to conservator, sensitive to gas accumulation and oil surge.",
      state: buchholzState,
      primaryTelemetry: [
        { name: "Gas Collection Status", value: buchholzState === "Critical" ? "Trip / High Surge" : buchholzState === "Warning" ? "Gas Alarm Float Down" : "Normal / Oil Filled", unit: "", thresholdWarn: "Gas Alarm", thresholdCrit: "Oil Surge Trip" },
        { name: "Hydraulic Pressure", value: reading.pressure, unit: "bar", thresholdWarn: "> 1.0 bar", thresholdCrit: "> 1.5 bar" },
      ],
      relatedAlerts: buchholzAlerts,
      recommendedInspection: [
        "Check relay inspection sight glass for trapped combustible gas bubbles.",
        "If gas detected, collect gas sample using petcock syringe and test flammability.",
        "Verify alarm float (incipient fault) and trip float (catastrophic surge) circuit continuity.",
        "Inspect electrical terminal box gasket for rainwater ingress.",
      ],
    },
    tap_changer: {
      id: "tap_changer",
      label: "On-Load Tap Changer (OLTC) Compartment",
      subsystem: "Automatic Voltage Regulation (AVR) Mechanism",
      description: "Motor-driven high-speed resistor-type diverter switch compartment adjusting winding tap ratio under load.",
      state: oltcState,
      primaryTelemetry: [
        { name: "Bus Voltage Regulation", value: reading.voltage, unit: "kV", thresholdWarn: "410 kV", thresholdCrit: "420 kV" },
        { name: "Tap Mechanism Status", value: "Locked on Target Step", unit: "", thresholdWarn: "Drive Hunting", thresholdCrit: "Diverter Stuck" },
      ],
      relatedAlerts: oltcAlerts,
      recommendedInspection: [
        "Verify mechanical tap position indicator matches SCADA remote supervisory display.",
        "Inspect motor drive mechanism compartment for heater operation and gear train lubrication.",
        "Check OLTC oil surge relay (separate from main Buchholz relay) for trip flags.",
      ],
    },
    explosion_vent: {
      id: "explosion_vent",
      label: "Pressure Relief Device (PRD) & Vent Stack",
      subsystem: "Overpressure Protection Enclosure",
      description: "Spring-loaded pressure relief diaphragm with visual visual trip flag and directional deflector pipe protecting tank against rupture.",
      state: prdState,
      primaryTelemetry: [
        { name: "Tank Internal Pressure", value: reading.pressure, unit: "bar", thresholdWarn: "> 1.0 bar", thresholdCrit: "> 1.4 bar" },
      ],
      relatedAlerts: findAlertsForComponent(["pressure", "prd", "relief"]),
      recommendedInspection: [
        "Inspect micro-switch operating pin on PRD top dome (ensure trip flag has not popped).",
        "Inspect directional discharge shroud to ensure rain drainage weep hole is open.",
      ],
    },
    marshalling_kiosk: {
      id: "marshalling_kiosk",
      label: "Substation Marshalling & Control Kiosk",
      subsystem: "Local Telemetry & Auxiliary Switchgear",
      description: "Outdoor IP55 stainless steel kiosk housing winding temperature indicators (WTI), oil temperature indicators (OTI), and cooling automation contactors.",
      state: kioskState,
      primaryTelemetry: [
        { name: "Auxiliary Control Supply", value: "230V AC / 110V DC Normal", unit: "", thresholdWarn: "DC Fail", thresholdCrit: "AC Fail" },
      ],
      relatedAlerts: findAlertsForComponent(["control", "kiosk", "marshalling"]),
      recommendedInspection: [
        "Check door seals and space heater operation to eliminate condensation inside cabinet.",
        "Verify calibration of dial-type capillary OTI/WTI gauges against digital telemetry readings.",
        "Inspect terminal blocks and wiring harnesses for vermin ingress or loose terminal screws.",
      ],
    },
  };
}

function createUnknownDiagnostics(): Record<TransformerComponentId, ComponentDiagnostic> {
  const ids: TransformerComponentId[] = [
    "main_tank",
    "conservator_tank",
    "hv_bushings",
    "lv_bushings",
    "radiator_cooling",
    "cooling_fans",
    "cooling_pumps",
    "oil_piping",
    "buchholz_relay",
    "tap_changer",
    "explosion_vent",
    "marshalling_kiosk",
  ];

  const result = {} as Record<TransformerComponentId, ComponentDiagnostic>;
  for (const id of ids) {
    result[id] = {
      id,
      label: id.replace(/_/g, " ").toUpperCase(),
      subsystem: "Substation Telemetry",
      description: "Component telemetry currently offline or awaiting telemetry stream.",
      state: "Unknown",
      primaryTelemetry: [{ name: "Telemetry Signal", value: "OFFLINE / UNKNOWN", unit: "" }],
      relatedAlerts: [],
      recommendedInspection: ["Restore telemetry connectivity to equipment RTU."],
    };
  }
  return result;
}
