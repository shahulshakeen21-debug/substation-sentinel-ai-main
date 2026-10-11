import type { HealthStatus } from "@/lib/types";

// Colored pill for equipment status. Uses semantic tokens so the palette
// stays consistent everywhere.
const STYLES: Record<HealthStatus, string> = {
  Healthy: "text-healthy border-healthy/40 bg-healthy/10",
  Warning: "text-warning border-warning/40 bg-warning/10",
  Critical: "text-critical border-critical/40 bg-critical/10",
};

export function StatusBadge({ status, size = "md" }: { status: HealthStatus; size?: "sm" | "md" | "lg" }) {
  const pad = size === "lg" ? "px-3 py-1.5 text-sm" : size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-mono font-semibold uppercase tracking-wider ${STYLES[status]} ${pad}`}
    >
      <span className="status-dot" style={{ color: "currentColor" }} />
      {status}
    </span>
  );
}
