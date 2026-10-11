import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { SensorReading } from "@/lib/types";

// Multi-line live chart. Recharts renders temperature, current and vibration
// on a shared time axis; oil level & humidity live in a separate panel to
// keep scale readable.
export function LiveChart({
  data,
  title,
  keys,
}: {
  data: SensorReading[];
  title: string;
  keys: { key: keyof SensorReading; color: string; label: string }[];
}) {
  const chartData = data.map((d) => ({
    ...d,
    t: new Date(d.timestamp).toLocaleTimeString([], { hour12: false }),
  }));

  return (
    <div className="panel p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider">{title}</div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-grid)" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {keys.map((k) => (
              <Line
                key={String(k.key)}
                type="monotone"
                dataKey={k.key as string}
                stroke={k.color}
                strokeWidth={2}
                dot={false}
                name={k.label}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
