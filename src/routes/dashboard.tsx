import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Droplet,
  Fan,
  Gauge,
  Thermometer,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

import { Nav } from "@/components/Nav";
import { KpiCard } from "@/components/KpiCard";
import { HealthCard } from "@/components/HealthCard";
import { AlertPanel } from "@/components/AlertPanel";
import { RecommendationPanel } from "@/components/RecommendationPanel";
import { LiveChart } from "@/components/LiveChart";
import { SensorTable } from "@/components/SensorTable";
import { Transformer3DViewer, type Transformer3DViewerRef } from "@/components/Transformer3D/Transformer3DViewer";
import { AssistantWidget } from "@/components/Assistant/AssistantWidget";
import { HistoricalTrends } from "@/components/HistoricalTrends";
import { fetchLatestReading, fetchPrediction } from "@/lib/api";
import { makeAlert } from "@/lib/simulator";
import type { FaultMode } from "@/lib/simulator";
import type { AlertItem, Prediction, SensorReading } from "@/lib/types";

// Main control room view.
// The Sensor Simulator (top bar) controls which fault scenario the backend/
// simulator emits. Every 2s we pull a fresh reading, ask the model for a
// prediction, and update charts/alerts.
export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

const HISTORY_LIMIT = 30;
const ALERT_LIMIT = 20;

const FAULT_MODES: { id: FaultMode; label: string }[] = [
  { id: "normal", label: "Normal Ops" },
  { id: "overheat", label: "Overheat" },
  { id: "overload", label: "Overload" },
  { id: "oil_leak", label: "Oil Leak" },
  { id: "insulation", label: "Insulation Fault" },
  { id: "cooling_fault", label: "Cooling Fault" },
  { id: "pressure_fault", label: "Pressure Fault" },
];

function Dashboard() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<FaultMode>("normal");
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const running = useRef(true);
  const transformerViewerRef = useRef<Transformer3DViewerRef>(null);

  // Redirect to /login if the "session" is missing.
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("dt_user")) {
      navigate({ to: "/" });
    }
  }, [navigate]);

  // Polling loop: fetch reading + prediction every 2s.
  useEffect(() => {
    running.current = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!running.current) return;
      const reading = await fetchLatestReading(mode);
      const pred = await fetchPrediction(reading);
      setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), reading]);
      setPrediction(pred);
      const a = makeAlert(reading, pred);
      if (a) setAlerts((prev) => [a, ...prev].slice(0, ALERT_LIMIT));
      timer = setTimeout(tick, 2000);
    };
    tick();

    return () => {
      running.current = false;
      clearTimeout(timer);
    };
  }, [mode]);

  const latest = history[history.length - 1];

  const kpis = useMemo(() => {
    if (!latest || !prediction) return null;
    const tone = (v: number, warn: number, crit: number): "healthy" | "warning" | "critical" =>
      v >= crit ? "critical" : v >= warn ? "warning" : "healthy";
    const toneLow = (v: number, warn: number, crit: number): "healthy" | "warning" | "critical" =>
      v <= crit ? "critical" : v <= warn ? "warning" : "healthy";
    return { latest, prediction, tone, toneLow };
  }, [latest, prediction]);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Sensor Simulator control bar */}
        <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Sensor Simulator
            </div>
            <div className="text-sm font-semibold">Inject a scenario into the digital twin</div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5 italic">
              Simulated data only — not real equipment measurements
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {FAULT_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-md border px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                  mode === m.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI row — now 8 cards across */}
        {kpis && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
            <KpiCard
              label="Winding Temp"
              value={kpis.latest.temperature}
              unit="°C"
              icon={<Thermometer className="h-5 w-5" />}
              tone={kpis.tone(kpis.latest.temperature, 80, 95)}
            />
            <KpiCard
              label="Oil Temp"
              value={kpis.latest.oil_temperature}
              unit="°C"
              icon={<Thermometer className="h-5 w-5" />}
              tone={kpis.tone(kpis.latest.oil_temperature, 85, 100)}
            />
            <KpiCard
              label="Voltage"
              value={kpis.latest.voltage}
              unit="kV"
              icon={<Zap className="h-5 w-5" />}
              tone={kpis.tone(kpis.latest.voltage, 410, 420)}
            />
            <KpiCard
              label="Current"
              value={kpis.latest.current}
              unit="A"
              icon={<Activity className="h-5 w-5" />}
              tone={kpis.tone(kpis.latest.current, 950, 1100)}
            />
            <KpiCard
              label="Oil Level"
              value={kpis.latest.oil_level}
              unit="%"
              icon={<Droplet className="h-5 w-5" />}
              tone={kpis.toneLow(kpis.latest.oil_level, 55, 45)}
            />
            <KpiCard
              label="Humidity"
              value={kpis.latest.humidity}
              unit="%"
              icon={<Waves className="h-5 w-5" />}
              tone={kpis.tone(kpis.latest.humidity, 65, 80)}
            />
            <KpiCard
              label="Vibration"
              value={kpis.latest.vibration}
              unit="mm/s"
              icon={<Gauge className="h-5 w-5" />}
              tone={kpis.tone(kpis.latest.vibration, 5, 7.5)}
            />
            <KpiCard
              label="Cooling"
              value={
                kpis.latest.cooling_fan_status === 1 &&
                kpis.latest.cooling_pump_status === 1
                  ? 1
                  : 0
              }
              unit=""
              icon={<Fan className="h-5 w-5" />}
              tone={
                kpis.latest.cooling_fan_status === 0 ||
                kpis.latest.cooling_pump_status === 0
                  ? "critical"
                  : "healthy"
              }
              formatValue={(v) => (v === 1 ? "OK" : "FAULT")}
            />
          </div>
        )}

        {/* Extended sensor row */}
        {kpis && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="panel p-3 flex items-center gap-3">
              <Wind className="h-4 w-4 text-primary" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pressure</div>
                <div className="font-mono text-sm font-semibold">
                  {kpis.latest.pressure.toFixed(2)} bar
                  {kpis.latest.pressure > 1.0 && <span className="ml-1 text-warning text-[10px]">HIGH</span>}
                  {kpis.latest.pressure < 0.1 && <span className="ml-1 text-warning text-[10px]">LOW</span>}
                </div>
              </div>
            </div>
            <div className="panel p-3 flex items-center gap-3">
              <Droplet className="h-4 w-4 text-primary" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Oil Condition</div>
                <div className="font-mono text-sm font-semibold">
                  {kpis.latest.oil_condition.toFixed(0)}/100
                  {kpis.latest.oil_condition < 60 && <span className="ml-1 text-warning text-[10px]">DEGRADED</span>}
                </div>
              </div>
            </div>
            <div className="panel p-3 flex items-center gap-3">
              <Droplet className="h-4 w-4 text-primary" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Oil Leakage</div>
                <div className={`font-mono text-sm font-semibold ${
                  kpis.latest.oil_leakage === 2 ? "text-critical" :
                  kpis.latest.oil_leakage === 1 ? "text-warning" : "text-healthy"
                }`}>
                  {["None", "Suspected", "Indicated"][kpis.latest.oil_leakage] ?? "None"}
                </div>
              </div>
            </div>
            <div className="panel p-3 flex items-center gap-3">
              <Activity className="h-4 w-4 text-primary" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Load Factor</div>
                <div className="font-mono text-sm font-semibold">
                  {Math.round(kpis.latest.load_factor * 100)}%
                  {kpis.latest.load_factor > 0.85 && <span className="ml-1 text-warning text-[10px]">HIGH</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3D Transformer Digital Twin Interactive Visualization */}
        <Transformer3DViewer
          ref={transformerViewerRef}
          reading={latest}
          prediction={prediction}
          alerts={alerts}
          isSimulated={true}
        />

        {/* Main grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {latest && <SensorTable reading={latest} />}
            <LiveChart
              title="Thermal & Electrical Trend"
              data={history}
              keys={[
                { key: "temperature", color: "var(--color-critical)", label: "Winding Temp °C" },
                { key: "current", color: "var(--color-primary)", label: "Current A" },
                { key: "vibration", color: "var(--color-warning)", label: "Vibration mm/s" },
              ]}
            />
            <LiveChart
              title="Insulation & Oil Trend"
              data={history}
              keys={[
                { key: "oil_level", color: "var(--color-healthy)", label: "Oil Level %" },
                { key: "humidity", color: "var(--color-chart-5)", label: "Humidity %" },
                { key: "voltage", color: "var(--color-primary)", label: "Voltage kV" },
              ]}
            />
            <LiveChart
              title="Oil & Thermal Detail"
              data={history}
              keys={[
                { key: "oil_temperature", color: "var(--color-warning)", label: "Oil Temp °C" },
                { key: "winding_temperature", color: "var(--color-critical)", label: "Winding Hot-Spot °C" },
                { key: "oil_condition", color: "var(--color-healthy)", label: "Oil Condition/100" },
              ]}
            />

            {/* Historical Sensor Trends Multi-Parameter Analytics */}
            <HistoricalTrends history={history} />
          </div>

          <div className="space-y-4">
            {prediction && <HealthCard prediction={prediction} />}
            {prediction && <RecommendationPanel prediction={prediction} />}
            <AlertPanel alerts={alerts} />
          </div>
        </div>

        {/* AI Transformer Diagnostic Assistant Floating Panel */}
        <AssistantWidget
          reading={latest}
          prediction={prediction}
          alerts={alerts}
          onFocusComponent={(cid) => {
            transformerViewerRef.current?.focusComponent(cid);
          }}
        />
      </main>
    </div>
  );
}
