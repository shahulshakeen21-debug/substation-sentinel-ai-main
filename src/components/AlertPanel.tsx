import type { AlertItem } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

// Scrollable alert log — newest first. Trimmed by the parent to keep memory bounded.
export function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="panel p-5 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold uppercase tracking-wider">Alert Log</div>
        <span className="font-mono text-xs text-muted-foreground">{alerts.length} active</span>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
        {alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-6 text-center">
            No alerts — system nominal.
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="rounded-md border border-border bg-background/50 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={a.severity} size="sm" />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-2 font-mono text-xs">{a.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
