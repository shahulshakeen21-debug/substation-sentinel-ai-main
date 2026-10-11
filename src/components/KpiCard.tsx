import type { ReactNode } from "react";

// A single KPI tile used on the dashboard. Keeps every metric visually
// consistent: label, big value, unit, and an optional icon on the right.
export function KpiCard({
  label,
  value,
  unit,
  icon,
  tone = "default",
  formatValue,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon?: ReactNode;
  tone?: "default" | "healthy" | "warning" | "critical";
  formatValue?: (v: number | string) => string;
}) {
  const toneClass =
    tone === "healthy"
      ? "text-healthy"
      : tone === "warning"
        ? "text-warning"
        : tone === "critical"
          ? "text-critical"
          : "text-primary";

  const displayed = formatValue ? formatValue(value) : typeof value === "number" ? value.toFixed(1) : value;

  return (
    <div className="panel p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className={`mt-2 font-mono text-xl font-semibold ${toneClass}`}>
          {displayed}
          {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
        </div>
      </div>
      {icon && <div className={`${toneClass} opacity-80 shrink-0`}>{icon}</div>}
    </div>
  );
}
