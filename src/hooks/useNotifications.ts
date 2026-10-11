// Hook for WebSocket-based real-time notifications + unread badge management.
// Works both with the live backend (WebSocket) and in demo mode (polling makeAlert).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  backendConnected,
  fetchAlerts,
  fetchUnreadCount,
  markAlertsRead,
  openNotificationSocket,
} from "@/lib/api";
import type { AlertItem, WsNotification } from "@/lib/types";

interface UseNotificationsReturn {
  alerts: AlertItem[];
  unreadCount: number;
  markRead: (ids: number[]) => void;
  markAllRead: () => void;
  addLocalAlert: (a: AlertItem) => void;  // for demo-mode injection
}

export function useNotifications(username: string): UseNotificationsReturn {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const LIMIT = 50;

  // Load initial alert list from backend or stay empty in demo mode
  const loadAlerts = useCallback(async () => {
    if (!backendConnected()) return;
    const list = await fetchAlerts({ limit: LIMIT, user: username });
    setAlerts(list);
    const count = await fetchUnreadCount(username);
    setUnreadCount(count);
  }, [username]);

  // Handle incoming WebSocket notification
  const handleWsMessage = useCallback((notification: WsNotification) => {
    if (notification.event === "new_alert") {
      const newAlert: AlertItem = {
        id: String(notification.id),
        timestamp: notification.timestamp,
        severity: notification.severity as AlertItem["severity"],
        message: notification.message,
        equipment_id: notification.equipment_id,
        parameter: notification.parameter,
        alert_type: notification.alert_type as AlertItem["alert_type"],
        resolved: false,
        is_read: false,
      };
      setAlerts((prev) => [newAlert, ...prev].slice(0, LIMIT));
      setUnreadCount((n) => n + 1);
    } else if (notification.event === "alert_resolved") {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === String(notification.id) ? { ...a, resolved: true } : a,
        ),
      );
    }
  }, []);

  useEffect(() => {
    loadAlerts();

    if (backendConnected()) {
      const ws = openNotificationSocket(username, handleWsMessage);
      wsRef.current = ws;
    }

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [username, loadAlerts, handleWsMessage]);

  const markRead = useCallback(
    (ids: number[]) => {
      if (!ids.length) return;
      setAlerts((prev) =>
        prev.map((a) => (ids.includes(Number(a.id)) ? { ...a, is_read: true } : a)),
      );
      setUnreadCount((n) => Math.max(0, n - ids.length));
      if (backendConnected()) {
        markAlertsRead(username, ids).catch(() => {});
      }
    },
    [username],
  );

  const markAllRead = useCallback(() => {
    const unreadIds = alerts
      .filter((a) => !a.is_read && !a.resolved)
      .map((a) => Number(a.id));
    markRead(unreadIds);
  }, [alerts, markRead]);

  // Demo-mode: allow parent to inject simulated alerts
  const addLocalAlert = useCallback((a: AlertItem) => {
    setAlerts((prev) => [a, ...prev].slice(0, LIMIT));
    setUnreadCount((n) => n + 1);
  }, []);

  return { alerts, unreadCount, markRead, markAllRead, addLocalAlert };
}
