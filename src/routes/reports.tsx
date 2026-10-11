import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
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
// offers a CSV export of the raw log.
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

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Historical Reports</h1>
            <p className="text-sm text-muted-foreground">
              Last 24 hours of predicted equipment health and telemetry.
            </p>
          </div>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

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
      </main>
    </div>
  );
}
