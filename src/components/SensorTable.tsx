import type { SensorReading } from "@/lib/types";

// Latest sensor snapshot rendered as a labeled key/value grid.
// Extended to show all transformer parameters including oil, pressure, cooling.

type RowSpec = {
  key: keyof SensorReading;
  label: string;
  unit: string;
  format?: (v: number) => string;
  warnHigh?: number;
  warnLow?: number;
};

const ROWS: RowSpec[] = [
  { key: "temperature", label: "Winding Temp", unit: "°C", warnHigh: 80 },
  { key: "oil_temperature", label: "Oil Temperature", unit: "°C", warnHigh: 85 },
  { key: "winding_temperature", label: "Hot-Spot Temp", unit: "°C", warnHigh: 95 },
  { key: "voltage", label: "Voltage", unit: "kV", warnHigh: 410 },
  { key: "current", label: "Current", unit: "A", warnHigh: 950 },
  { key: "oil_level", label: "Oil Level", unit: "%", warnLow: 55 },
  { key: "humidity", label: "Humidity", unit: "%", warnHigh: 65 },
  { key: "vibration", label: "Vibration", unit: "mm/s", warnHigh: 5 },
  { key: "pressure", label: "Pressure", unit: "bar", warnHigh: 1.0 },
  { key: "oil_condition", label: "Oil Condition", unit: "/100", warnLow: 60 },
  {
    key: "oil_leakage",
    label: "Oil Leakage",
    unit: "",
    format: (v) => ["None", "Suspected", "Indicated"][Math.round(v)] ?? "None",
    warnHigh: 1,
  },
  {
    key: "cooling_fan_status",
    label: "Cooling Fan",
    unit: "",
    format: (v) => (v === 1 ? "OK" : "FAULT"),
    warnHigh: 0.5,  // anything below 1 is a warning
  },
  {
    key: "cooling_pump_status",
    label: "Cooling Pump",
    unit: "",
    format: (v) => (v === 1 ? "OK" : "FAULT"),
    warnHigh: 0.5,
  },
  {
    key: "load_factor",
    label: "Load Factor",
    unit: "",
    format: (v) => `${Math.round(v * 100)}%`,
    warnHigh: 0.85,
  },
];

function rowTone(row: RowSpec, val: number): string {
  if (row.warnHigh !== undefined && val >= row.warnHigh) return "text-warning";
  if (row.warnLow !== undefined && val <= row.warnLow) return "text-warning";
  return "text-foreground";
}

export function SensorTable({ reading }: { reading: SensorReading }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold uppercase tracking-wider">Live Sensor Values</div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-healthy animate-pulse" />
          <span className="font-mono text-[11px] text-muted-foreground">
            {new Date(reading.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {ROWS.map((r) => {
          const rawVal = reading[r.key];
          const numVal = typeof rawVal === "number" ? rawVal : Number(rawVal);
          const displayed = r.format ? r.format(numVal) : numVal.toFixed(2);
          const tone = rowTone(r, numVal);
          return (
            <div key={r.key} className="rounded-md border border-border bg-background/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
                {r.label}
              </div>
              <div className={`mt-1 font-mono text-sm font-semibold ${tone}`}>
                {displayed}
                {r.unit && <span className="ml-0.5 text-[10px] text-muted-foreground">{r.unit}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground font-mono italic">
        Simulated sensor data — not real equipment measurements.
      </p>
    </div>
  );
}
