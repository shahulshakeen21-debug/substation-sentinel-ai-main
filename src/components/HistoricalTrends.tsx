import React, { useMemo, useState } from "react";
import {
  Activity,
  Calendar,
  Clock,
  Droplet,
  Gauge,
  LineChart as LineChartIcon,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Thermometer,
  Waves,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SensorReading } from "@/lib/types";

interface HistoricalTrendsProps {
  history: SensorReading[];
  onFetchMore?: (limit: number) => void;
}

type ParameterGroup = "thermal" | "electrical" | "oil_pressure" | "mechanical";

export function HistoricalTrends({ history }: HistoricalTrendsProps) {
  const [activeGroup, setActiveGroup] = useState<ParameterGroup>("thermal");
  const [sampleLimit, setSampleLimit] = useState<number>(30);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Slice based on selected limit
  const visibleData = useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.slice(-sampleLimit).map((r, idx) => ({
      ...r,
      index: idx + 1,
      timeLabel: new Date(r.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    }));
  }, [history, sampleLimit]);

  // Statistical summary of current visible slice
  const stats = useMemo(() => {
    if (visibleData.length === 0) return null;

    const calc = (key: keyof SensorReading) => {
      const vals = visibleData
        .map((d) => Number(d[key]))
        .filter((v) => !isNaN(v));
      if (vals.length === 0) return { min: 0, max: 0, avg: 0 };
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return {
        min: min.toFixed(1),
        max: max.toFixed(1),
        avg: avg.toFixed(1),
      };
    };

    return {
      windingTemp: calc("temperature"),
      oilTemp: calc("oil_temperature"),
      voltage: calc("voltage"),
      current: calc("current"),
      oilLevel: calc("oil_level"),
      pressure: calc("pressure"),
      vibration: calc("vibration"),
    };
  }, [visibleData]);

  const groupConfigs = {
    thermal: {
      title: "Thermal Behavior (Winding & Top Oil)",
      icon: <Thermometer className="h-4 w-4 text-warning" />,
      lines: [
        { key: "temperature", name: "Winding Temp (°C)", color: "var(--color-critical)", yAxisId: "left" },
        { key: "winding_temperature", name: "Winding Hot-Spot (°C)", color: "oklch(0.68 0.22 35)", yAxisId: "left" },
        { key: "oil_temperature", name: "Top Oil Temp (°C)", color: "var(--color-warning)", yAxisId: "left" },
      ],
      unit: "°C",
    },
    electrical: {
      title: "Electrical Transmission (Voltage & Current)",
      icon: <Zap className="h-4 w-4 text-primary" />,
      lines: [
        { key: "voltage", name: "Primary Voltage (kV)", color: "var(--color-primary)", yAxisId: "left" },
        { key: "current", name: "Load Current (A)", color: "oklch(0.72 0.18 300)", yAxisId: "right" },
      ],
      unit: "kV / A",
    },
    oil_pressure: {
      title: "Oil Reservoir & Hydraulics",
      icon: <Droplet className="h-4 w-4 text-healthy" />,
      lines: [
        { key: "oil_level", name: "Oil Level (%)", color: "var(--color-healthy)", yAxisId: "left" },
        { key: "pressure", name: "Pressure (bar)", color: "var(--color-chart-5)", yAxisId: "right" },
        { key: "oil_condition", name: "Quality Index (/100)", color: "oklch(0.78 0.15 190)", yAxisId: "left" },
      ],
      unit: "% / bar",
    },
    mechanical: {
      title: "Mechanical & Environmental Stress",
      icon: <Gauge className="h-4 w-4 text-primary" />,
      lines: [
        { key: "vibration", name: "Vibration (mm/s)", color: "var(--color-warning)", yAxisId: "left" },
        { key: "humidity", name: "Humidity (%)", color: "var(--color-chart-1)", yAxisId: "right" },
      ],
      unit: "mm/s / %",
    },
  };

  const currentConfig = groupConfigs[activeGroup];

  return (
    <div className="panel p-4 space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary">
            <LineChartIcon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Historical Telemetry & Dynamic Trend Analytics
              <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-accent">
                {visibleData.length} records analyzed
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Multi-parameter trend analysis with honest temporal sampling and statistical envelopes
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Parameter Group Tabs */}
          <div className="flex items-center gap-1 bg-background/50 border border-border rounded-lg p-1 text-xs">
            <button
              onClick={() => setActiveGroup("thermal")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeGroup === "thermal" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Thermal
            </button>
            <button
              onClick={() => setActiveGroup("electrical")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeGroup === "electrical" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Electrical
            </button>
            <button
              onClick={() => setActiveGroup("oil_pressure")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeGroup === "oil_pressure" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Oil & Pressure
            </button>
            <button
              onClick={() => setActiveGroup("mechanical")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeGroup === "mechanical" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Vibration
            </button>
          </div>

          {/* Sample count selector */}
          <div className="flex items-center gap-1 bg-background/50 border border-border rounded-lg p-1 text-xs">
            <Clock className="h-3.5 w-3.5 text-muted-foreground ml-1.5 mr-0.5" />
            {[10, 20, 30, 50].map((num) => (
              <button
                key={num}
                onClick={() => setSampleLimit(num)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  sampleLimit === num ? "bg-accent text-foreground font-bold border border-border" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {num} pts
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Trend Line Chart */}
      <div className="h-64 sm:h-72 w-full pt-2">
        {visibleData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visibleData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid)" strokeOpacity={0.6} />
              <XAxis
                dataKey="timeLabel"
                stroke="var(--color-muted-foreground)"
                fontSize={10}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                stroke="var(--color-muted-foreground)"
                fontSize={10}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              {currentConfig.lines.some((l) => l.yAxisId === "right") && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="var(--color-muted-foreground)"
                  fontSize={10}
                  tickLine={false}
                  domain={["auto", "auto"]}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  borderColor: "var(--color-border)",
                  borderRadius: "0.5rem",
                  fontSize: "11px",
                  color: "var(--color-foreground)",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              {currentConfig.lines.map((line) => (
                <Line
                  key={line.key}
                  yAxisId={line.yAxisId}
                  type="monotone"
                  dataKey={line.key}
                  name={line.name}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={{ r: 2, fill: line.color }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2">
            <Activity className="h-6 w-6 animate-pulse text-primary" />
            <span>Collecting telemetry records for dynamic trend visualization...</span>
          </div>
        )}
      </div>

      {/* Statistical Envelopes Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/60 text-xs font-mono">
          {activeGroup === "thermal" && (
            <>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Winding Avg / Peak</div>
                <div className="text-foreground font-semibold mt-0.5">
                  {stats.windingTemp.avg}°C / <span className="text-critical">{stats.windingTemp.max}°C</span>
                </div>
              </div>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Top Oil Avg / Peak</div>
                <div className="text-foreground font-semibold mt-0.5">
                  {stats.oilTemp.avg}°C / <span className="text-warning">{stats.oilTemp.max}°C</span>
                </div>
              </div>
            </>
          )}

          {activeGroup === "electrical" && (
            <>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Voltage Band</div>
                <div className="text-foreground font-semibold mt-0.5">
                  {stats.voltage.min} - {stats.voltage.max} kV
                </div>
              </div>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Load Current Peak</div>
                <div className="text-foreground font-semibold mt-0.5">
                  <span className="text-primary">{stats.current.max} A</span> (avg: {stats.current.avg} A)
                </div>
              </div>
            </>
          )}

          {activeGroup === "oil_pressure" && (
            <>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Oil Level Range</div>
                <div className="text-foreground font-semibold mt-0.5">
                  {stats.oilLevel.min}% - {stats.oilLevel.max}%
                </div>
              </div>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Conservator Pressure</div>
                <div className="text-foreground font-semibold mt-0.5">
                  {stats.pressure.avg} bar
                </div>
              </div>
            </>
          )}

          {activeGroup === "mechanical" && (
            <>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Vibration Peak</div>
                <div className="text-foreground font-semibold mt-0.5">
                  <span className="text-warning">{stats.vibration.max} mm/s</span>
                </div>
              </div>
              <div className="bg-background/40 border border-border/60 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase">Vibration Avg</div>
                <div className="text-foreground font-semibold mt-0.5">
                  {stats.vibration.avg} mm/s
                </div>
              </div>
            </>
          )}

          <div className="bg-background/40 border border-border/60 rounded p-2 col-span-2">
            <div className="text-[10px] text-muted-foreground uppercase">Data Fidelity & Protocol</div>
            <div className="text-muted-foreground text-[11px] mt-0.5 truncate">
              Continuous 2.0s Telemetry Sampling · IEC 61850 Station Bus
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
