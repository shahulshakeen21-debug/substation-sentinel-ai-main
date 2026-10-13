// Thin wrapper that talks to the FastAPI backend when VITE_API_URL is set,
// otherwise falls back to the in-browser simulator so the Lovable preview
// always works. Point VITE_API_URL at http://localhost:8000 when you run
// the FastAPI project under /backend.

import {
  generateReading,
  predict,
  type FaultMode,
  getSimulatedSmsConfig,
  saveSimulatedSmsConfig,
  getSimulatedSmsLogs,
  sendSimulatedTestSms,
} from "./simulator";
import type {
  AlertItem,
  EquipmentHealthSummary,
  MaintenanceItem,
  MaintenanceStatus,
  Prediction,
  SensorReading,
  ThresholdConfig,
  WsNotification,
  SmsConfig,
  SmsLogItem,
} from "./types";

const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8000";

async function tryFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<boolean> {
  const remote = await tryFetch<{ ok: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (remote) return remote.ok;
  // Demo-mode fallback (no backend running).
  return username.trim().length > 0 && password.length >= 4;
}

export async function fetchLatestReading(mode: FaultMode = "normal"): Promise<SensorReading> {
  const remote = await tryFetch<SensorReading>(`/sensors/latest?mode=${mode}`);
  return remote ?? generateReading(mode);
}

export async function fetchPrediction(r: SensorReading): Promise<Prediction> {
  const remote = await tryFetch<Prediction>("/predict", {
    method: "POST",
    body: JSON.stringify(r),
  });
  return remote ?? predict(r);
}

export async function fetchAlerts(params?: {
  limit?: number;
  severity?: string;
  resolved?: boolean;
  user?: string;
}): Promise<AlertItem[]> {
  const sp = new URLSearchParams();
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.severity) sp.set("severity", params.severity);
  if (params?.resolved !== undefined) sp.set("resolved", String(params.resolved));
  if (params?.user) sp.set("user", params.user);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  const remote = await tryFetch<AlertItem[]>(`/alerts${qs}`);
  return remote ?? [];
}

export async function fetchUnreadCount(username: string): Promise<number> {
  const remote = await tryFetch<{ unread: number }>(`/alerts/unread-count?username=${encodeURIComponent(username)}`);
  return remote?.unread ?? 0;
}

export async function markAlertsRead(username: string, alertIds: number[]): Promise<void> {
  await tryFetch<unknown>(`/alerts/read?user=${encodeURIComponent(username)}`, {
    method: "POST",
    body: JSON.stringify({ alert_ids: alertIds }),
  });
}

export async function resolveAlert(alertId: number): Promise<void> {
  await tryFetch<unknown>(`/alerts/${alertId}/resolve`, { method: "POST" });
}

// ── Maintenance ─────────────────────────────────────────────────────────────

export async function fetchMaintenanceItems(params?: {
  status?: string;
  severity?: string;
  equipment_id?: string;
}): Promise<MaintenanceItem[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.severity) sp.set("severity", params.severity);
  if (params?.equipment_id) sp.set("equipment_id", params.equipment_id);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  const remote = await tryFetch<MaintenanceItem[]>(`/maintenance${qs}`);
  return remote ?? [];
}

export async function fetchMaintenanceSummary(): Promise<EquipmentHealthSummary[]> {
  const remote = await tryFetch<EquipmentHealthSummary[]>("/maintenance/summary");
  return remote ?? [];
}

export async function fetchMaintenanceHistory(): Promise<MaintenanceItem[]> {
  const remote = await tryFetch<MaintenanceItem[]>("/maintenance/history");
  return remote ?? [];
}

export async function updateMaintenanceStatus(
  id: number,
  status: MaintenanceStatus,
  completedBy?: string,
  notes?: string,
): Promise<MaintenanceItem | null> {
  return tryFetch<MaintenanceItem>(`/maintenance/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      completed_by: completedBy,
      completion_notes: notes,
    }),
  });
}

export async function fetchThresholds(): Promise<ThresholdConfig | null> {
  return tryFetch<ThresholdConfig>("/sensors/thresholds");
}

// ── WebSocket ────────────────────────────────────────────────────────────────

export function openNotificationSocket(
  username: string,
  onMessage: (notification: WsNotification) => void,
  onError?: () => void,
): WebSocket | null {
  if (!BASE) return null;
  const wsBase = BASE.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/alerts/ws?username=${encodeURIComponent(username)}`);

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data) as WsNotification;
      onMessage(data);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onerror = () => {
    onError?.();
  };

  // Heartbeat every 25s to keep the connection alive through proxies
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send("ping");
  }, 25_000);

  ws.onclose = () => clearInterval(ping);

  return ws;
}

// ── SMS Alert Gateway API ────────────────────────────────────────────────────

export async function fetchSmsConfig(): Promise<SmsConfig | null> {
  const remote = await tryFetch<SmsConfig>("/sms/config");
  return remote ?? getSimulatedSmsConfig();
}

export async function updateSmsConfig(patch: Partial<SmsConfig>): Promise<SmsConfig | null> {
  const remote = await tryFetch<SmsConfig>("/sms/config", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return remote ?? saveSimulatedSmsConfig(patch);
}

export async function sendTestSms(params: {
  phone_number: string;
  scenario?: "normal" | "warning" | "critical" | "recovery";
  custom_message?: string;
}): Promise<{
  ok: boolean;
  delivery_status: string;
  provider: string;
  recipient: string;
  formatted_message?: string;
  error?: string;
  log_id?: number;
} | null> {
  const remote = await tryFetch<{
    ok: boolean;
    delivery_status: string;
    provider: string;
    recipient: string;
    formatted_message?: string;
    error?: string;
    log_id?: number;
  }>("/sms/test", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return remote ?? sendSimulatedTestSms(params);
}

export async function fetchSmsLogs(limit: number = 30): Promise<SmsLogItem[]> {
  const remote = await tryFetch<SmsLogItem[]>(`/sms/logs?limit=${limit}`);
  return remote ?? getSimulatedSmsLogs().slice(0, limit);
}

// ── AI Transformer Assistant ─────────────────────────────────────────────────

export async function sendAssistantChat(params: {
  query: string;
  reading?: SensorReading | null;
  prediction?: Prediction | null;
  alerts?: AlertItem[];
}): Promise<AssistantChatResponse> {
  const remote = await tryFetch<AssistantChatResponse>("/assistant/chat", {
    method: "POST",
    body: JSON.stringify({
      query: params.query,
      client_telemetry: params.reading,
    }),
  });

  if (remote) return remote;

  // Local expert engine fallback (when FastAPI backend is not connected or in Vercel preview)
  return generateClientAssistantReply(params.query, params.reading, params.prediction, params.alerts);
}

function generateClientAssistantReply(
  query: string,
  reading?: SensorReading | null,
  prediction?: Prediction | null,
  alerts: AlertItem[] = [],
): AssistantChatResponse {
  const q = query.toLowerCase();
  const r = reading;
  const p = prediction;

  const wt = r?.winding_temperature ?? r?.temperature ?? 65.0;
  const ot = r?.oil_temperature ?? 50.0;
  const v = r?.voltage ?? 400.0;
  const curr = r?.current ?? 550.0;
  const ol = r?.oil_level ?? 78.0;
  const press = r?.pressure ?? 0.5;
  const leak = r?.oil_leakage ?? 0;
  const fan = r?.cooling_fan_status ?? 1;
  const pump = r?.cooling_pump_status ?? 1;
  const status = p?.status ?? (alerts.some((a) => a.severity === "Critical") ? "Critical" : alerts.some((a) => a.severity === "Warning") ? "Warning" : "Healthy");
  const prob = p?.failure_probability ?? 0.05;

  let reply = "";
  let compId: string | null = null;
  let compLabel: string | null = null;

  if (q.includes("why") || q.includes("reason") || q.includes("warning") || q.includes("critical") || q.includes("status")) {
    if (alerts.length > 0) {
      const top = alerts[0];
      const param = top.parameter.toLowerCase();
      if (param.includes("temp") || param.includes("winding") || param.includes("overheat")) {
        compId = "main_tank";
        compLabel = "Main Transformer Tank & Winding Core";
      } else if (param.includes("oil level") || param.includes("conservator")) {
        compId = "conservator_tank";
        compLabel = "Conservator Oil Reservoir & Breather";
      } else if (param.includes("leak") || param.includes("seep")) {
        compId = "oil_piping";
        compLabel = "Oil Header Piping & Flanged Seals";
      } else if (param.includes("voltage") || param.includes("bushing")) {
        compId = "hv_bushings";
        compLabel = "400 kV High Voltage Bushings";
      } else if (param.includes("cooling") || param.includes("fan")) {
        compId = "cooling_fans";
        compLabel = "Forced Cooling Fan Assemblies";
      } else {
        compId = "main_tank";
        compLabel = "Main Transformer Tank";
      }

      reply = `**Equipment Status: ${status.toUpperCase()}**\n\nThe transformer entered **${status}** status due to active alert: \`${top.message}\`.\n\n**Telemetry Context:**\n- Winding Hot-Spot: **${wt.toFixed(1)} °C** (Limit: 95°C / 115°C)\n- Top Oil Temp: **${ot.toFixed(1)} °C**\n- Conservator Oil Level: **${ol.toFixed(1)} %** (Nominal: > 55%)\n- Voltage: **${v.toFixed(1)} kV** | Load Current: **${curr.toFixed(1)} A**\n\n**ML Prognostic Risk:** Random Forest classifier estimates **${(prob * 100).toFixed(1)}% failure probability**. This is an early predictive trend warning, not a confirmed mechanical breakdown.\n\n*Safety Requirement: Live physical checks must be performed by qualified substation personnel under LOTO procedures.*`;
    } else {
      compId = "main_tank";
      compLabel = "Main Transformer Tank";
      reply = `**Equipment Status: HEALTHY**\n\nAll telemetry parameters for Transformer Bay T1-400kV are operating within safe IEEE C57 bounds. Winding temperature is **${wt.toFixed(1)} °C**, oil level is nominal at **${ol.toFixed(1)} %**, and bus voltage is stable at **${v.toFixed(1)} kV**. ML model evaluates failure risk at **${(prob * 100).toFixed(1)}%**.`;
    }
  } else if (q.includes("temperature") || q.includes("thermal") || q.includes("heat")) {
    compId = "main_tank";
    compLabel = "Main Transformer Tank & Winding Core";
    reply = `**Thermal System Telemetry:**\n\n- **Winding Hot-Spot Temperature:** **${wt.toFixed(1)} °C** (Warning: 95 °C, Trip: 115 °C)\n- **Top Oil Temperature:** **${ot.toFixed(1)} °C** (Warning: 85 °C, Trip: 100 °C)\n- **Cooling Equipment:** Fans: **${fan === 1 ? "Operational" : "TRIPPED"}** | Pumps: **${pump === 1 ? "Operational" : "TRIPPED"}**\n\n${wt >= 95 ? "⚠️ Winding hot-spot thermal stress is elevated! Sustained temperature above 98°C accelerates cellulose insulation ageing." : "Temperatures are within nominal continuous rated limits."}`;
  } else if (q.includes("oil") || q.includes("leak") || q.includes("level")) {
    compId = ol < 55 ? "conservator_tank" : "oil_piping";
    compLabel = ol < 55 ? "Conservator Oil Reservoir & Breather" : "Oil Header Piping & Flanged Seals";
    const leakStr = ["None detected", "Suspected seepage", "Confirmed leakage indicated"][leak] ?? "None";
    reply = `**Oil Preservation System Telemetry:**\n\n- **Conservator Oil Level (MOG):** **${ol.toFixed(1)} %** (Alarm: < 55 %, Trip: < 45 %)\n- **Oil Leakage Sensor:** **${leakStr}**\n- **Hydraulic Pressure:** **${press.toFixed(2)} bar**\n\n${ol < 55 || leak > 0 ? "⚠️ Warning: Low oil level or active seepage. Verify conservator sight-glass and examine radiator gasket joints." : "Oil level and pressure are stable in the conservator reservoir."}`;
  } else if (q.includes("voltage") || q.includes("current") || q.includes("load")) {
    compId = "hv_bushings";
    compLabel = "400 kV High Voltage Bushings";
    reply = `**Electrical Telemetry Summary:**\n\n- **Primary Bus Voltage:** **${v.toFixed(1)} kV** (Nominal: 400 kV | Overvoltage Limit: 410 kV)\n- **Phase Load Current:** **${curr.toFixed(1)} A** (Overload Limit: 950 A)\n\n${v > 410 || curr > 950 ? "⚠️ Voltage or current exceeds normal rated bandwidth. Review automatic tap changer (OLTC) stepping." : "Electrical power flow is balanced and within steady-state limits."}`;
  } else if (q.includes("component") || q.includes("affected") || q.includes("which")) {
    if (alerts.length > 0) {
      const top = alerts[0];
      const param = top.parameter.toLowerCase();
      if (param.includes("temp") || param.includes("winding") || param.includes("overheat")) {
        compId = "main_tank";
        compLabel = "Main Transformer Tank & Winding Core";
      } else if (param.includes("oil level") || param.includes("conservator")) {
        compId = "conservator_tank";
        compLabel = "Conservator Oil Reservoir & Breather";
      } else if (param.includes("leak") || param.includes("seep")) {
        compId = "oil_piping";
        compLabel = "Oil Header Piping & Flanged Seals";
      } else if (param.includes("voltage") || param.includes("bushing")) {
        compId = "hv_bushings";
        compLabel = "400 kV High Voltage Bushings";
      } else if (param.includes("fan") || param.includes("cooling")) {
        compId = "cooling_fans";
        compLabel = "Forced Cooling Fan Assemblies";
      } else {
        compId = "main_tank";
        compLabel = "Main Transformer Tank";
      }
      reply = `**Identified Affected Component:** \`${compLabel}\`\n\nThe primary active condition (\`${top.message}\`) maps directly to \`${compLabel}\` on the 3D model. Click **'View Affected Component'** below to focus the digital twin camera on this location.`;
    } else {
      compId = "main_tank";
      compLabel = "Main Transformer Tank";
      reply = "No active faults detected. All 3D digital twin components (Main Tank, Conservator, Bushings, Radiators) are currently in nominal healthy status.";
    }
  } else if (q.includes("maintenance") || q.includes("check") || q.includes("inspect") || q.includes("action")) {
    compId = fan === 0 || pump === 0 ? "cooling_fans" : "main_tank";
    compLabel = fan === 0 || pump === 0 ? "Forced Cooling Fan Assemblies" : "Main Transformer Tank";
    reply = `**Recommended Maintenance Protocol:**\n\n1. **Visual & Acoustic Check:** Inspect main tank seams, radiators, and bushings for acoustic vibration chattering or weeping oil.\n2. **Infrared Thermography:** Perform thermal scan of 400kV bushing connectors and cooling radiator fins.\n3. **Oil DGA Testing:** Draw bottom-sample mineral oil for dissolved gas chromatography (IEC 60599).\n4. **Auxiliary Circuit Test:** Verify cooling fan motor overload relays and silica-gel breather color.\n\n*Always confirm circuit de-energization and safety grounding before accessing the HV yard.*`;
  } else if (q.includes("ml") || q.includes("predict") || q.includes("model")) {
    compId = "main_tank";
    compLabel = "Main Transformer Tank";
    reply = `**Machine Learning Diagnostics:**\n\n- **Model Type:** Multi-Variate Random Forest Classifier\n- **Failure Risk Probability:** **${(prob * 100).toFixed(1)} %**\n- **Diagnostic Assessment:** ${p?.recommendation ?? "Nominal operational status."}\n\n*Note: This probability is an ML-derived anomaly index calculated from live telemetry vectors. It serves as an early decision-support aid.*`;
  } else {
    reply = `**Substation Sentinel AI Diagnostic Assistant**\n\nLive overview for **T1-400kV Substation Bay (315 MVA)**:\n- Current Status: **${status}**\n- ML Failure Probability: **${(prob * 100).toFixed(1)} %**\n- Winding Temp: **${wt.toFixed(1)} °C** | Oil Level: **${ol.toFixed(1)} %**\n- Primary Bus Voltage: **${v.toFixed(1)} kV** | Current: **${curr.toFixed(1)} A**\n\nHow can I help you inspect telemetry, diagnose warnings, or locate affected 3D components?`;
  }

  return {
    reply,
    affected_component_id: compId,
    affected_component_label: compLabel,
    provider: "Substation Sentinel Expert AI Engine",
    is_simulated_data: true,
    suggested_questions: [
      "Why is my transformer showing a warning?",
      "What are the latest temperature and voltage readings?",
      "Is the oil level decreasing?",
      "Which component is associated with the latest alert?",
      "What maintenance checks are recommended?",
      "Explain the latest ML prediction.",
      "Show the component associated with the current fault.",
    ],
  };
}

export const backendConnected = () => Boolean(BASE);

