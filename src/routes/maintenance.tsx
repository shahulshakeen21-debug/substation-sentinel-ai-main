import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  History,
  RefreshCw,
  Shield,
  Wrench,
  Zap,
  Thermometer,
  Droplet,
} from "lucide-react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Nav } from "@/components/Nav";
import { StatusBadge } from "@/components/StatusBadge";
import {
  fetchMaintenanceItems,
  fetchMaintenanceSummary,
  fetchMaintenanceHistory,
  updateMaintenanceStatus,
  fetchAlerts,
  resolveAlert,
} from "@/lib/api";
import { generateReading, predict } from "@/lib/simulator";
import type {
  EquipmentHealthSummary,
  MaintenanceItem,
  MaintenanceStatus,
  AlertItem,
  Priority,
} from "@/lib/types";

export const Route = createFileRoute("/maintenance")({
  component: MaintenancePage,
});

// ── Priority styling ──────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { cls: string; label: string }> = {
  Immediate: { cls: "bg-critical/15 text-critical border-critical/40", label: "Immediate" },
  High: { cls: "bg-warning/15 text-warning border-warning/40", label: "High" },
  Medium: { cls: "bg-primary/15 text-primary border-primary/40", label: "Medium" },
  Low: { cls: "bg-healthy/15 text-healthy border-healthy/40", label: "Low" },
};

const ALERT_TYPE_CONFIG: Record<string, { label: string; cls: string; Icon: React.FC<{ className?: string }> }> = {
  EarlyWarning: { label: "Early Warning", cls: "text-warning", Icon: AlertTriangle },
  ActiveFault: { label: "Active Fault", cls: "text-critical", Icon: Zap },
  PredictedRisk: { label: "AI Predicted Risk", cls: "text-primary", Icon: Activity },
  Recovery: { label: "Recovery", cls: "text-healthy", Icon: CheckCircle2 },
};

const STATUS_CONFIG: Record<MaintenanceStatus, { label: string; cls: string }> = {
  Pending: { label: "Pending", cls: "bg-warning/15 text-warning border-warning/40" },
  InProgress: { label: "In Progress", cls: "bg-primary/15 text-primary border-primary/40" },
  Completed: { label: "Completed", cls: "bg-healthy/15 text-healthy border-healthy/40" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthSummaryCard({ summary }: { summary: EquipmentHealthSummary }) {
  const pct = Math.round(summary.failure_probability * 100);
  const barCls =
    summary.overall_status === "Critical"
      ? "bg-critical"
      : summary.overall_status === "Warning"
        ? "bg-warning"
        : "bg-healthy";

  return (
    <div className="panel p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Equipment ID</div>
          <div className="mt-0.5 font-mono text-base font-semibold">{summary.equipment_id}</div>
        </div>
        <StatusBadge status={summary.overall_status} size="lg" />
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Failure Probability</span>
          <span className="font-mono font-semibold text-foreground">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full transition-all duration-700 ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: "Faults", value: summary.active_faults, cls: "text-critical" },
          { label: "Warnings", value: summary.active_warnings, cls: "text-warning" },
          { label: "Maintenance", value: summary.pending_maintenance, cls: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-background/50 p-2">
            <div className={`text-xl font-bold font-mono ${s.cls}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {summary.last_updated && (
        <div className="text-[10px] text-muted-foreground font-mono">
          Last updated: {new Date(summary.last_updated).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function MaintenanceItemCard({
  item,
  onStatusChange,
  onResolve,
}: {
  item: MaintenanceItem;
  onStatusChange: (id: number, status: MaintenanceStatus) => void;
  onResolve?: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const pCfg = PRIORITY_CONFIG[item.priority];
  const sCfg = STATUS_CONFIG[item.status];
  const atCfg = ALERT_TYPE_CONFIG[item.alert_type] ?? ALERT_TYPE_CONFIG.ActiveFault;
  const AtIcon = atCfg.Icon;

  const nextStatus: Record<MaintenanceStatus, MaintenanceStatus | null> = {
    Pending: "InProgress",
    InProgress: "Completed",
    Completed: null,
  };
  const next = nextStatus[item.status];

  const handleStatus = async () => {
    if (!next || updating) return;
    setUpdating(true);
    await onStatusChange(item.id, next);
    setUpdating(false);
  };

  return (
    <div
      className={`panel transition-all duration-200 ${
        item.severity === "Critical"
          ? "border-critical/30"
          : item.severity === "Warning"
            ? "border-warning/30"
            : "border-border"
      }`}
    >
      {/* Header row */}
      <div
        className="flex items-start justify-between p-4 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((ex) => !ex)}
      >
        <div className="flex items-start gap-3 min-w-0">
          <AtIcon className={`h-4 w-4 mt-0.5 shrink-0 ${atCfg.cls}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold truncate">{item.parameter}</span>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase ${pCfg.cls}`}>
                {pCfg.label}
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase ${sCfg.cls}`}>
                {sCfg.label}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">{item.equipment_id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <StatusBadge status={item.severity} size="sm" />
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Current reading summary */}
      <div className="border-t border-border/50 px-4 pb-3 pt-2 grid grid-cols-3 gap-3 text-xs font-mono">
        <div>
          <div className="text-muted-foreground">Current</div>
          <div className="font-semibold">{item.current_value.toFixed(1)}{item.unit}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Limit</div>
          <div className="font-semibold">{item.configured_limit.toFixed(1)}{item.unit}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Timeframe</div>
          <div className="font-semibold text-[10px]">{item.inspection_timeframe}</div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-4 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Observed Condition &amp; Reason</div>
            <p className="text-sm leading-relaxed text-foreground/90">{item.reason}</p>
          </div>
          {item.trend_description && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Historical Trend</div>
              <p className="text-sm text-muted-foreground">{item.trend_description}</p>
            </div>
          )}
          <div className="rounded-lg bg-background/60 border border-border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Recommended Action
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">{item.recommended_action}</p>
          </div>
          {item.model_confidence !== undefined && item.model_confidence !== null && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Model confidence:</span>
              <span className="font-mono font-semibold">
                {Math.round(item.model_confidence * 100)}%
              </span>
              <span className="text-[10px] text-muted-foreground">(simulated data — for demo purposes)</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <Clock className="h-3 w-3" />
            Created: {new Date(item.created_at).toLocaleString()}
            {item.completed_at && (
              <span className="ml-3">
                Completed: {new Date(item.completed_at).toLocaleString()}
                {item.completed_by && ` by ${item.completed_by}`}
              </span>
            )}
          </div>
          {item.completion_notes && (
            <div className="text-xs text-muted-foreground italic">{item.completion_notes}</div>
          )}

          {/* Action buttons */}
          {next && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleStatus}
                disabled={updating}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  next === "InProgress"
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-healthy/40 bg-healthy/10 text-healthy hover:bg-healthy/20"
                }`}
              >
                {next === "InProgress" ? (
                  <><Activity className="h-3.5 w-3.5" /> Start Work</>
                ) : (
                  <><CheckCircle2 className="h-3.5 w-3.5" /> Mark Completed</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveAlertRow({ alert, onResolve }: { alert: AlertItem; onResolve: (id: number) => void }) {
  const atCfg = ALERT_TYPE_CONFIG[alert.alert_type] ?? ALERT_TYPE_CONFIG.ActiveFault;
  const AtIcon = atCfg.Icon;
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
      alert.severity === "Critical" ? "border-critical/30 bg-critical/5" : "border-warning/30 bg-warning/5"
    }`}>
      <AtIcon className={`h-4 w-4 mt-0.5 shrink-0 ${atCfg.cls}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={alert.severity} size="sm" />
          <span className={`text-[10px] font-mono uppercase ${atCfg.cls}`}>{atCfg.label}</span>
          {alert.parameter && <span className="font-mono text-[10px] text-muted-foreground">{alert.parameter}</span>}
        </div>
        <div className="mt-1 font-mono text-xs text-foreground/80 truncate">{alert.message.replace(/^[A-Z_]+:\s*/, "")}</div>
        <div className="mt-1 text-[10px] text-muted-foreground font-mono">
          {new Date(alert.timestamp).toLocaleString()}
        </div>
      </div>
      {!alert.resolved && (
        <button
          onClick={() => onResolve(Number(alert.id))}
          className="shrink-0 rounded border border-healthy/40 bg-healthy/10 px-2 py-1 text-[10px] font-mono text-healthy hover:bg-healthy/20"
        >
          Resolve
        </button>
      )}
    </div>
  );
}

// Demo risk trend data (generated from simulator for visual purpose)
function buildDemoRiskTrend() {
  const now = Date.now();
  const modes = ["normal", "normal", "overheat", "overload", "normal", "oil_leak", "normal"] as const;
  return Array.from({ length: 24 }, (_, i) => {
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const r = generateReading(mode);
    const p = predict(r);
    return {
      time: new Date(now - (23 - i) * 3600_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      risk: Math.round(p.failure_probability * 100),
      status: p.status,
    };
  });
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type StatusFilter = "All" | "Pending" | "InProgress" | "Completed";
type PriorityFilter = "All" | "Immediate" | "High" | "Medium" | "Low";

function MaintenancePage() {
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<EquipmentHealthSummary[]>([]);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<MaintenanceItem[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("All");
  const [riskTrend] = useState(buildDemoRiskTrend);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("dt_user")) {
      navigate({ to: "/" });
    }
  }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, m, a, h] = await Promise.all([
      fetchMaintenanceSummary(),
      fetchMaintenanceItems(),
      fetchAlerts({ limit: 30, resolved: false }),
      fetchMaintenanceHistory(),
    ]);

    // Demo fallback: generate synthetic items when backend not connected
    if (m.length === 0 && a.length === 0) {
      const modes = ["overheat", "oil_leak", "insulation", "cooling_fault"] as const;
      const synth: MaintenanceItem[] = modes.map((mode, i) => {
        const r = generateReading(mode);
        const p = predict(r);
        const param = p.reasons[0] ?? "Temperature";
        const priorities: Record<string, string> = { overheat: "Immediate", oil_leak: "High", insulation: "Medium", cooling_fault: "High" };
        return {
          id: i + 1,
          created_at: new Date(Date.now() - i * 3600_000).toISOString(),
          updated_at: new Date().toISOString(),
          equipment_id: "T1-400kV",
          parameter: param,
          current_value: Number(r.temperature.toFixed(1)),
          configured_limit: 80,
          unit: "°C",
          severity: p.status,
          alert_type: p.status === "Critical" ? "ActiveFault" : "EarlyWarning",
          reason: `Simulated ${mode} scenario: ${p.reasons.join(", ") || "abnormal readings detected"}.`,
          trend_description: `Sensor trend shows values approaching configured limit under ${mode} scenario.`,
          recommended_action: p.recommendation,
          priority: (priorities[mode] ?? "Medium") as Priority,
          inspection_timeframe: priorities[mode] === "Immediate" ? "Within 2 hours" : "Within 24 hours",
          status: "Pending",
          model_confidence: p.failure_probability,
        };
      });
      setItems(synth);
    } else {
      setItems(m);
    }

    if (s.length === 0) {
      setSummaries([{
        equipment_id: "T1-400kV",
        overall_status: "Warning",
        failure_probability: 0.35,
        active_warnings: 2,
        active_faults: 0,
        pending_maintenance: 3,
      }]);
    } else {
      setSummaries(s);
    }

    setActiveAlerts(a);
    setHistory(h);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = useCallback(async (id: number, status: MaintenanceStatus) => {
    await updateMaintenanceStatus(id, status);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              completed_at: status === "Completed" ? new Date().toISOString() : item.completed_at,
            }
          : item,
      ),
    );
  }, []);

  const handleResolveAlert = useCallback(async (id: number) => {
    await resolveAlert(id);
    setActiveAlerts((prev) => prev.filter((a) => Number(a.id) !== id));
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      if (priorityFilter !== "All" && item.priority !== priorityFilter) return false;
      return true;
    });
  }, [items, statusFilter, priorityFilter]);

  const stats = useMemo(() => ({
    immediate: items.filter((i) => i.priority === "Immediate" && i.status !== "Completed").length,
    high: items.filter((i) => i.priority === "High" && i.status !== "Completed").length,
    pending: items.filter((i) => i.status === "Pending").length,
    inProgress: items.filter((i) => i.status === "InProgress").length,
    completed: items.filter((i) => i.status === "Completed").length,
  }), [items]);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              Predictive Maintenance
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Early warnings, condition monitoring &amp; maintenance recommendations for EHV transformer equipment.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Immediate", value: stats.immediate, cls: "text-critical" },
            { label: "High Priority", value: stats.high, cls: "text-warning" },
            { label: "Pending", value: stats.pending, cls: "text-primary" },
            { label: "In Progress", value: stats.inProgress, cls: "text-primary" },
            { label: "Completed", value: stats.completed, cls: "text-healthy" },
          ].map((k) => (
            <div key={k.label} className="panel p-4 text-center">
              <div className={`text-2xl font-bold font-mono ${k.cls}`}>{k.value}</div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Equipment health summary */}
        {summaries.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /> Equipment Health Summary
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summaries.map((s) => (
                <HealthSummaryCard key={s.equipment_id} summary={s} />
              ))}
            </div>
          </div>
        )}

        {/* Main content grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: active alerts + maintenance items */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active alerts */}
            {activeAlerts.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" /> Active Alerts &amp; Faults
                  <span className="ml-auto font-mono">{activeAlerts.length} open</span>
                </div>
                <div className="space-y-2">
                  {activeAlerts.slice(0, 5).map((a) => (
                    <ActiveAlertRow key={a.id} alert={a} onResolve={handleResolveAlert} />
                  ))}
                  {activeAlerts.length > 5 && (
                    <div className="text-xs text-muted-foreground text-center font-mono">
                      + {activeAlerts.length - 5} more — see Notifications
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Maintenance recommendations */}
            <div>
              {/* Tab bar */}
              <div className="mb-3 flex items-center gap-4">
                <div className="flex gap-1">
                  {(["active", "history"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeTab === t
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      {t === "active" ? <><Wrench className="h-3.5 w-3.5" /> Recommendations</> : <><History className="h-3.5 w-3.5" /> History</>}
                    </button>
                  ))}
                </div>
                {activeTab === "active" && (
                  <div className="ml-auto flex items-center gap-2 text-xs">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                    >
                      <option>All</option>
                      <option>Pending</option>
                      <option>InProgress</option>
                      <option>Completed</option>
                    </select>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
                      className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                    >
                      <option>All</option>
                      <option>Immediate</option>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Maintenance items */}
              {activeTab === "active" ? (
                loading ? (
                  <div className="panel p-8 text-center text-sm text-muted-foreground">Loading recommendations…</div>
                ) : filteredItems.length === 0 ? (
                  <div className="panel p-8 text-center text-sm text-muted-foreground italic">
                    No maintenance items match the current filters.
                    <br />
                    <span className="text-xs">Use the Dashboard Sensor Simulator to inject a fault scenario, then Refresh.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredItems.map((item) => (
                      <MaintenanceItemCard
                        key={item.id}
                        item={item}
                        onStatusChange={handleStatusChange}
                        onResolve={handleResolveAlert}
                      />
                    ))}
                  </div>
                )
              ) : (
                /* History tab */
                history.length === 0 ? (
                  <div className="panel p-8 text-center text-sm text-muted-foreground italic">
                    No completed maintenance records yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <MaintenanceItemCard
                        key={item.id}
                        item={item}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right sidebar: risk trend chart + inspection schedule */}
          <div className="space-y-5">
            {/* Risk trend chart */}
            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Activity className="h-3.5 w-3.5" /> Risk Trend (24h Demo)
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={riskTrend} margin={{ top: 5, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-warning)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-warning)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} interval={5} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`${v}%`, "Risk"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="risk"
                      stroke="var(--color-warning)"
                      fill="url(#riskGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground font-mono italic">
                Simulated data for demo purposes only.
              </p>
            </div>

            {/* Priority inspection schedule */}
            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Inspection Schedule
              </div>
              <div className="space-y-2">
                {(["Immediate", "High", "Medium", "Low"] as Priority[]).map((p) => {
                  const count = items.filter((i) => i.priority === p && i.status !== "Completed").length;
                  const pCfg = PRIORITY_CONFIG[p];
                  const timeframes: Record<Priority, string> = {
                    Immediate: "Within 2 hours",
                    High: "Within 24 hours",
                    Medium: "Within 72 hours",
                    Low: "Within 7 days",
                  };
                  return (
                    <div
                      key={p}
                      className={`flex items-center justify-between rounded-lg border p-2.5 ${count > 0 ? pCfg.cls : "border-border text-muted-foreground opacity-50"}`}
                    >
                      <div>
                        <div className="text-xs font-semibold">{p}</div>
                        <div className="text-[10px] opacity-80">{timeframes[p]}</div>
                      </div>
                      <span className="font-mono text-lg font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="panel p-4">
              <div className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Alert Type Guide</div>
              <div className="space-y-2">
                {Object.entries(ALERT_TYPE_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.Icon;
                  return (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <Icon className={`h-3.5 w-3.5 mt-0.5 ${cfg.cls}`} />
                      <div>
                        <span className={`font-semibold ${cfg.cls}`}>{cfg.label}</span>
                        <span className="text-muted-foreground ml-1">
                          {key === "EarlyWarning" && "— Observed abnormal trend, not yet critical."}
                          {key === "ActiveFault" && "— Threshold breached, requires action."}
                          {key === "PredictedRisk" && "— AI model indicates elevated risk."}
                          {key === "Recovery" && "— Previously abnormal condition resolved."}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
