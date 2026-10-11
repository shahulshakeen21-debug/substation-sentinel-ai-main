import { Bell, CheckCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AlertItem } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

// Alert-type badge with distinct styling
const ALERT_TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  EarlyWarning:  { label: "Early Warning", cls: "text-warning bg-warning/10 border-warning/30" },
  ActiveFault:   { label: "Active Fault",  cls: "text-critical bg-critical/10 border-critical/30" },
  PredictedRisk: { label: "AI Predicted",  cls: "text-primary bg-primary/10 border-primary/30" },
  Recovery:      { label: "Recovery",      cls: "text-healthy bg-healthy/10 border-healthy/30" },
};

interface Props {
  alerts: AlertItem[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (ids: number[]) => void;
  onClose?: () => void;
}

function AlertRow({ alert, onMarkRead }: { alert: AlertItem; onMarkRead: (id: number) => void }) {
  const typeInfo = ALERT_TYPE_LABELS[alert.alert_type] ?? ALERT_TYPE_LABELS.ActiveFault;
  return (
    <div
      className={`relative rounded-lg border p-3 text-sm transition-all ${
        alert.is_read
          ? "border-border bg-background/30 opacity-70"
          : "border-border bg-card hover:bg-accent/30"
      }`}
    >
      {!alert.is_read && (
        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
      <div className="flex items-start gap-2 pr-4">
        <StatusBadge status={alert.severity} size="sm" />
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase ${typeInfo.cls}`}>
          {typeInfo.label}
        </span>
      </div>
      <div className="mt-1.5 font-mono text-xs text-foreground leading-snug">
        {alert.parameter && <span className="text-primary">[{alert.parameter}] </span>}
        {alert.message.replace(/^[A-Z_]+:\s*/, "")}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">
          {new Date(alert.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
        </span>
        {!alert.is_read && (
          <button
            onClick={() => onMarkRead(Number(alert.id))}
            className="text-[10px] text-muted-foreground underline hover:text-foreground"
          >
            mark read
          </button>
        )}
        {alert.resolved && (
          <span className="text-[10px] text-healthy font-mono">✓ Resolved</span>
        )}
      </div>
    </div>
  );
}

type SeverityFilter = "All" | "Critical" | "Warning";

export function NotificationBell({ alerts, unreadCount, onMarkAllRead, onMarkRead }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<SeverityFilter>("All");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = alerts.filter((a) =>
    filter === "All" ? true : a.severity === filter,
  );

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        id="notification-bell"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center rounded-md border border-border p-2 hover:bg-accent transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-critical text-[9px] font-bold text-white animate-in fade-in">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          id="notification-panel"
          className="absolute right-0 top-10 z-50 w-96 rounded-xl border border-border bg-card shadow-2xl"
          style={{ maxHeight: "calc(100vh - 100px)", display: "flex", flexDirection: "column" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Severity filter */}
          <div className="flex gap-1 border-b border-border px-4 py-2">
            {(["All", "Critical", "Warning"] as SeverityFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors ${
                  filter === f
                    ? f === "Critical"
                      ? "bg-critical/15 text-critical border border-critical/30"
                      : f === "Warning"
                        ? "bg-warning/15 text-warning border border-warning/30"
                        : "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Alert list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground italic">
                {filter === "All" ? "No notifications — system nominal." : `No ${filter} alerts.`}
              </div>
            ) : (
              filtered.map((a) => (
                <AlertRow key={a.id} alert={a} onMarkRead={(id) => onMarkRead([id])} />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground font-mono">
            {alerts.length} total · {alerts.filter((a) => !a.resolved).length} active
          </div>
        </div>
      )}
    </div>
  );
}
