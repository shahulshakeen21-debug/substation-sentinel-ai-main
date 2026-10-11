import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, Bell, FileText, LogOut, Wrench, Zap } from "lucide-react";
import { backendConnected } from "@/lib/api";
import { NotificationBell } from "./NotificationBell";
import { useNotifications } from "@/hooks/useNotifications";

// Shared header for authenticated pages. Shows the app name, the current
// backend status (live FastAPI vs demo mode), primary nav, and logout.
export function Nav() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const username = typeof window !== "undefined" ? (localStorage.getItem("dt_user") ?? "") : "";

  const { alerts, unreadCount, markRead, markAllRead } = useNotifications(username);

  const logout = () => {
    localStorage.removeItem("dt_user");
    navigate({ to: "/" });
  };

  const linkClass = (to: string) =>
    `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
      pathname === to
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-accent"
    }`;

  return (
    <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold leading-tight">Digital Twin · EHV Substation</div>
            <div className="text-[11px] font-mono text-muted-foreground">400 / 220 kV</div>
          </div>
        </div>

        <nav className="hidden gap-1 sm:flex">
          <Link to="/dashboard" className={linkClass("/dashboard")}>
            <Activity className="h-4 w-4" /> Dashboard
          </Link>
          <Link to="/maintenance" className={linkClass("/maintenance")}>
            <Wrench className="h-4 w-4" /> Maintenance
          </Link>
          <Link to="/reports" className={linkClass("/reports")}>
            <FileText className="h-4 w-4" /> Reports
          </Link>
          <Link to="/notifications" className={linkClass("/notifications")}>
            <Bell className="h-4 w-4" /> SMS Alerts
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <span
            className={`hidden sm:inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-mono ${
              backendConnected()
                ? "border-healthy/40 text-healthy bg-healthy/10"
                : "border-warning/40 text-warning bg-warning/10"
            }`}
          >
            <span className="status-dot" style={{ color: "currentColor" }} />
            {backendConnected() ? "API LIVE" : "DEMO MODE"}
          </span>

          {/* Notification Bell */}
          <NotificationBell
            alerts={alerts}
            unreadCount={unreadCount}
            onMarkAllRead={markAllRead}
            onMarkRead={markRead}
          />

          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </div>
    </header>
  );
}
