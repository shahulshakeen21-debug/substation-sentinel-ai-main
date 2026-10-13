import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  FileCheck,
  FileText,
  Printer,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Nav } from "@/components/Nav";
import { StatusBadge } from "@/components/StatusBadge";
import { generateReading, predict } from "@/lib/simulator";
import type { SensorReading, Prediction, HealthStatus } from "@/lib/types";

// Historical / analytical view. Produces 24 synthetic hourly samples, then
// aggregates them into status distribution and per-sensor averages. Also
// offers CSV export and comprehensive printable maintenance reports.
export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

interface Row extends SensorReading {
  status: HealthStatus;
  failure_probability: number;
}

function buildHistory(): Row[] {
  const rows: Row[] = [];
  const now = Date.now();
  const modes = ["normal", "normal", "normal", "overheat", "overload", "oil_leak"] as const;
  for (let i = 23; i >= 0; i--) {
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const r = generateReading(mode);
    // Backdate the timestamp to make the chart span the last 24h.
    r.timestamp = new Date(now - i * 60 * 60 * 1000).toISOString();
    const p = predict(r);
    rows.push({ ...r, status: p.status, failure_probability: p.failure_probability });
  }
  return rows;
}

function ReportsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [activeTab, setActiveTab] = useState<"standard" | "enhanced">("enhanced");
  const [reportGeneratedAt] = useState<string>(new Date().toLocaleString());

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("dt_user")) {
      navigate({ to: "/" });
      return;
    }
    setRows(buildHistory());
  }, [navigate]);

  const distribution = useMemo(() => {
    const c: Record<HealthStatus, number> = { Healthy: 0, Warning: 0, Critical: 0 };
    rows.forEach((r) => (c[r.status] += 1));
    return [
      { name: "Healthy", value: c.Healthy, color: "var(--color-healthy)" },
      { name: "Warning", value: c.Warning, color: "var(--color-warning)" },
      { name: "Critical", value: c.Critical, color: "var(--color-critical)" },
    ];
  }, [rows]);

  const barData = useMemo(
    () =>
      rows.map((r) => ({
        hour: new Date(r.timestamp).getHours() + "h",
        temperature: r.temperature,
        current: r.current,
      })),
    [rows],
  );

  const exportCsv = () => {
    if (!rows.length) return;
    const header = [
      "timestamp",
      "temperature",
      "voltage",
      "current",
      "oil_level",
      "humidity",
      "vibration",
      "status",
      "failure_probability",
    ];
    const body = rows.map((r) =>
      header.map((h) => (r as unknown as Record<string, string | number>)[h]).join(","),
    );
    const csv = [header.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `substation_report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintReport = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const latestRow = rows[rows.length - 1] ?? rows[0];

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Top Header & Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Substation Diagnostic & Maintenance Reports
            </h1>
            <p className="text-sm text-muted-foreground">
              Comprehensive telemetry logs, ML prognostics, and compliance audit reports for Bay T1-400kV.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* View Switcher */}
            <div className="flex items-center gap-1 bg-background/60 border border-border rounded-lg p-1 text-xs">
              <button
                onClick={() => setActiveTab("enhanced")}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === "enhanced"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                Executive Maintenance Audit
              </button>
              <button
                onClick={() => setActiveTab("standard")}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === "standard"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                24h Telemetry Log & Distribution
              </button>
            </div>

            {/* Export Actions */}
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              onClick={handlePrintReport}
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" /> Print / PDF Report
            </button>
          </div>
        </div>

        {/* Active Tab: Enhanced Executive Maintenance Audit */}
        {activeTab === "enhanced" && (
          <div className="space-y-6">
            {/* Executive Summary Card */}
            <div className="panel p-5 sm:p-6 space-y-4 border-primary/30 bg-gradient-to-br from-card to-card/90">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                      OFFICIAL AUDIT REPORT
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      DOC ID: DT-400KV-T1-AUDIT
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground mt-1.5">
                    Substation Transformer Diagnostic & Health Assessment
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Equipment: <strong className="text-foreground">T1-400kV (315 MVA, 400/220kV Auto-Transformer)</strong> · Bay 04
                  </p>
                </div>

                <div className="text-right text-xs space-y-1">
                  <div className="text-muted-foreground">
                    Generated: <span className="font-mono text-foreground font-semibold">{reportGeneratedAt}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Evaluation Standard: IEEE C57.104 / IEC 60076
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-[10px] text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded">
                    <span>Simulated Telemetry Demonstration Data</span>
                  </div>
                </div>
              </div>

              {/* Top Metric Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-lg bg-background/50 border border-border space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Overall Unit Status</div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={latestRow?.status ?? "Healthy"} size="sm" />
                    <span className="text-sm font-semibold">{latestRow?.status ?? "Healthy"}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">ML Failure Risk</div>
                  <div className="text-base font-bold font-mono text-primary">
                    {Math.round((latestRow?.failure_probability ?? 0.05) * 100)}%
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Peak Winding Temp</div>
                  <div className="text-base font-bold font-mono text-foreground">
                    {latestRow?.temperature ?? 65}°C
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">(Limit: 95°C)</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background/50 border border-border space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Conservator Oil Level</div>
                  <div className="text-base font-bold font-mono text-foreground">
                    {latestRow?.oil_level ?? 78}%
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">(Nominal: &gt;55%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Component-Level Health Audit Matrix */}
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-primary" />
                    Sub-Assembly & Component Condition Matrix
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Real-time operational status mapped across 3D digital twin structural sub-assemblies
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 1. Main Tank */}
                <div className="p-3.5 rounded-lg border border-border bg-background/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Main Tank & Winding Core</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-healthy/40 text-healthy bg-healthy/10">
                      Operational
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Core laminations, low-voltage and high-voltage winding insulation, and internal oil flow ducts.
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                    Telemetry: Temp {latestRow?.temperature ?? 65}°C · Vib {latestRow?.vibration ?? 2.0} mm/s
                  </div>
                </div>

                {/* 2. Conservator */}
                <div className="p-3.5 rounded-lg border border-border bg-background/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Conservator & Breather</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-healthy/40 text-healthy bg-healthy/10">
                      Normal
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Oil expansion reservoir, magnetic level gauge (MOG), and dehydrating silica-gel moisture chamber.
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                    Telemetry: Level {latestRow?.oil_level ?? 78}% · Moisture nominal
                  </div>
                </div>

                {/* 3. 400kV Bushings */}
                <div className="p-3.5 rounded-lg border border-border bg-background/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">400 kV Bushings (R-Y-B)</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-healthy/40 text-healthy bg-healthy/10">
                      Nominal
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    High voltage porcelain condenser bushings, corona shields, and line terminal connectors.
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                    Telemetry: Bus Voltage {latestRow?.voltage ?? 400} kV · Current {latestRow?.current ?? 550} A
                  </div>
                </div>

                {/* 4. Radiator Banks & Fans */}
                <div className="p-3.5 rounded-lg border border-border bg-background/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Radiators & Cooling Fans</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-healthy/40 text-healthy bg-healthy/10">
                      Active
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Convective cooling fin elements, oil circulation headers, and forced draft cooling fans.
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                    Status: Fans OK · Radiator circulation open
                  </div>
                </div>

                {/* 5. Tap Changer */}
                <div className="p-3.5 rounded-lg border border-border bg-background/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">On-Load Tap Changer (OLTC)</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-healthy/40 text-healthy bg-healthy/10">
                      Regulating
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Motor-operated high-speed transition diverter switch mechanism and tap position sensor.
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                    Status: AVR lock on target tap ratio
                  </div>
                </div>

                {/* 6. Buchholz Relay */}
                <div className="p-3.5 rounded-lg border border-border bg-background/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Buchholz Relay Protection</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-healthy/40 text-healthy bg-healthy/10">
                      Armed
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Dual-float gas accumulation and sudden oil surge internal incipient fault detection.
                  </p>
                  <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                    Status: No gas trapped · Surge contact reset
                  </div>
                </div>
              </div>
            </div>

            {/* AI Engineering Prognostics & Action Plan */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="panel p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  AI Machine Learning Diagnostic Assessment
                </h3>
                <div className="text-xs text-muted-foreground space-y-2.5 leading-relaxed bg-background/40 p-3.5 rounded-lg border border-border">
                  <p>
                    <strong>Model:</strong> Multi-Variate Random Forest Classifier Ensemble (trained on EHV transformer telemetry, IEEE C57 parameters).
                  </p>
                  <p>
                    <strong>Diagnostic Finding:</strong> Equipment telemetry indicates steady thermal and electrical dissipation. Estimated failure probability is{" "}
                    <strong className="text-primary font-mono">{Math.round((latestRow?.failure_probability ?? 0.05) * 100)}%</strong>. No uncommanded rapid thermal transients detected.
                  </p>
                  <p>
                    <strong>Evidence Breakdown:</strong> Winding temperature remains below the 95°C continuous thermal limit. Conservator oil level and bus voltage fluctuate within nominal ±2.5% deadbands.
                  </p>
                </div>
              </div>

              <div className="panel p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-healthy" />
                  Prioritized Engineering Action Checklist
                </h3>
                <ul className="text-xs space-y-2.5 text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground">Schedule Routine Oil DGA Sampling:</strong> Draw 500ml oil sample from bottom valve for dissolved gas chromatography (IEC 60599).
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground">Infrared Thermography Scan:</strong> Conduct thermal scan of 400kV bushing palm clamps and radiator fin manifolds.
                    </div>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-foreground">Silica-Gel Breather Inspection:</strong> Verify desiccant color is dark blue. Replace if over 60% pink saturated.
                    </div>
                  </li>
                </ul>
                <div className="text-[10px] text-muted-foreground/80 font-mono pt-2 border-t border-border">
                  Safety Mandate: Substation yard access requires approved permit-to-work and earth switch verification.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Standard Tab: 24h Distribution & Prediction Log */}
        {activeTab === "standard" && (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="panel p-4 lg:col-span-1">
                <div className="text-sm font-semibold uppercase tracking-wider">Status Distribution</div>
                <div className="mt-3 h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {distribution.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel p-4 lg:col-span-2">
                <div className="text-sm font-semibold uppercase tracking-wider">
                  Hourly Temperature vs Current
                </div>
                <div className="mt-3 h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 5, right: 12, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="temperature" fill="var(--color-critical)" name="Temp °C" />
                      <Bar dataKey="current" fill="var(--color-primary)" name="Current A" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="panel overflow-hidden">
              <div className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wider">
                Prediction Log
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-background/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2">Time</th>
                      <th className="px-4 py-2">Temp °C</th>
                      <th className="px-4 py-2">V kV</th>
                      <th className="px-4 py-2">I A</th>
                      <th className="px-4 py-2">Oil %</th>
                      <th className="px-4 py-2">Hum %</th>
                      <th className="px-4 py-2">Vib</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">P(fail)</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {rows.map((r) => (
                      <tr key={r.timestamp} className="border-t border-border">
                        <td className="px-4 py-2">
                          {new Date(r.timestamp).toLocaleTimeString([], { hour12: false })}
                        </td>
                        <td className="px-4 py-2">{r.temperature}</td>
                        <td className="px-4 py-2">{r.voltage}</td>
                        <td className="px-4 py-2">{r.current}</td>
                        <td className="px-4 py-2">{r.oil_level}</td>
                        <td className="px-4 py-2">{r.humidity}</td>
                        <td className="px-4 py-2">{r.vibration}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={r.status} size="sm" />
                        </td>
                        <td className="px-4 py-2">{Math.round(r.failure_probability * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
