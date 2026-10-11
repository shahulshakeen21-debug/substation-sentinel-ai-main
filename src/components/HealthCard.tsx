import type { Prediction } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

// Equipment Health Card — summarises the current AI verdict:
// status pill, failure probability bar, and the sensor reasons.
export function HealthCard({ prediction }: { prediction: Prediction }) {
  const pct = Math.round(prediction.failure_probability * 100);
  const barColor =
    prediction.status === "Critical"
      ? "bg-critical"
      : prediction.status === "Warning"
        ? "bg-warning"
        : "bg-healthy";

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Equipment Health
          </div>
          <div className="mt-1 text-lg font-semibold">Transformer T-1 · 400/220 kV</div>
        </div>
        <StatusBadge status={prediction.status} size="lg" />
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Failure probability</span>
          <span className="font-mono text-lg font-semibold">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={`${barColor} h-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {prediction.reasons.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Contributing factors
          </div>
          <ul className="mt-2 space-y-1 text-sm font-mono">
            {prediction.reasons.map((r) => (
              <li key={r} className="flex items-center gap-2">
                <span className="status-dot text-warning" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
