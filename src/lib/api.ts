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

export const backendConnected = () => Boolean(BASE);

