import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  UserCheck,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import {
  fetchSmsConfig,
  fetchSmsLogs,
  sendTestSms,
  updateSmsConfig,
} from "@/lib/api";
import type { SmsConfig, SmsLogItem } from "@/lib/types";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [logs, setLogs] = useState<SmsLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form states for config
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<"twilio" | "fast2sms" | "simulator">("simulator");
  const [minSeverity, setMinSeverity] = useState<"Warning" | "Critical">("Warning");
  const [sendRecovery, setSendRecovery] = useState(true);
  const [cooldown, setCooldown] = useState(30);
  const [recipientNumbers, setRecipientNumbers] = useState("");

  // Test SMS states
  const [testNumber, setTestNumber] = useState("+91");
  const [testScenario, setTestScenario] = useState<"normal" | "warning" | "critical" | "recovery">("warning");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    delivery_status: string;
    recipient: string;
    formatted_message?: string;
    error?: string;
  } | null>(null);

  // Authenticate
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("dt_user")) {
      navigate({ to: "/" });
    }
  }, [navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [cfg, logList] = await Promise.all([
      fetchSmsConfig(),
      fetchSmsLogs(40),
    ]);
    if (cfg) {
      setConfig(cfg);
      setEnabled(cfg.enabled);
      setProvider(cfg.provider);
      setMinSeverity(cfg.min_severity);
      setSendRecovery(cfg.send_recovery);
      setCooldown(cfg.cooldown_minutes);
      setRecipientNumbers(cfg.recipient_numbers);
      if (!testNumber || testNumber === "+91") {
        const firstNum = cfg.recipient_numbers.split(",")[0]?.trim();
        if (firstNum) setTestNumber(firstNum);
      }
    }
    setLogs(logList);
    setLoading(false);
  }, [testNumber]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    const updated = await updateSmsConfig({
      enabled,
      provider,
      min_severity: minSeverity,
      send_recovery: sendRecovery,
      cooldown_minutes: cooldown,
      recipient_numbers: recipientNumbers,
    });
    if (updated) {
      setConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadData();
    }
    setSaving(false);
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testNumber) return;
    setTestLoading(true);
    setTestResult(null);
    const res = await sendTestSms({
      phone_number: testNumber,
      scenario: testScenario,
    });
    if (res) {
      setTestResult(res);
      // Reload logs to show new entry
      const logList = await fetchSmsLogs(40);
      setLogs(logList);
    } else {
      setTestResult({
        ok: false,
        delivery_status: "failed",
        recipient: testNumber,
        error: "Failed to connect to backend SMS API.",
      });
    }
    setTestLoading(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Mobile SMS Notifications</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Configure SMS alerts, manage authorized recipient mobile numbers, and test multi-provider delivery.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Status
            </button>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  config?.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                }`}
              />
              <span className="font-mono">
                {config?.enabled ? "SMS SERVICE ACTIVE" : "SMS DISABLED"}
              </span>
            </div>
          </div>
        </div>

        {/* Top Info Banner */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-primary">Substation Alert Delivery Assurance</div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              SMS notifications are dispatched to authorized engineers for qualifying <strong>Warning</strong> and <strong>Critical</strong> events. Continuous incidents are protected by fingerprint deduplication and cooldown periods. Every transmission status is permanently audited.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Settings Form (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-primary" />
                Notification Gateway Settings
              </h2>

              <form onSubmit={handleSaveConfig} className="space-y-4">
                {/* Enable Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-background/50">
                  <div>
                    <div className="text-sm font-medium">Automatic SMS Notifications</div>
                    <div className="text-xs text-muted-foreground">
                      Dispatch SMS messages when new telemetry anomalies or early warnings are detected.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnabled(!enabled)}
                    className="text-primary hover:opacity-80 transition"
                  >
                    {enabled ? (
                      <ToggleRight className="h-8 w-8 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-8 w-8 text-muted-foreground" />
                    )}
                  </button>
                </div>

                {/* Gateway Provider */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    SMS Gateway Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="simulator">Safe Simulator (Safe testing — logs exact SMS format to DB)</option>
                    <option value="twilio">Twilio SMS (Global + India +91 delivery)</option>
                    <option value="fast2sms">Fast2SMS (Direct Indian mobile carrier gateway)</option>
                  </select>
                  <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="font-mono">Current Provider:</span>
                    <span className="font-semibold text-foreground">{config?.provider_name}</span>
                  </div>
                </div>

                {/* Recipient Numbers */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Authorized Recipient Numbers (E.164 with Country Code)
                  </label>
                  <input
                    type="text"
                    value={recipientNumbers}
                    onChange={(e) => setRecipientNumbers(e.target.value)}
                    placeholder="+919876543210, +919876543211"
                    className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Comma-separated list. Standard Indian (+91) format supported. Example: <code className="bg-muted px-1 py-0.5 rounded">+919876543210</code>
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Min Severity */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Minimum Severity Trigger
                    </label>
                    <select
                      value={minSeverity}
                      onChange={(e) => setMinSeverity(e.target.value as any)}
                      className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="Warning">Warning & Critical (Recommended)</option>
                      <option value="Critical">Critical Only (High Priority Incidents)</option>
                    </select>
                  </div>

                  {/* Cooldown Period */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Deduplication Cooldown
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="720"
                        value={cooldown}
                        onChange={(e) => setCooldown(Number(e.target.value))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </div>
                </div>

                {/* Recovery SMS Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-background/50">
                  <div>
                    <div className="text-sm font-medium">Send Recovery SMS</div>
                    <div className="text-xs text-muted-foreground">
                      Send a clearance SMS when an abnormal condition is resolved by operators.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sendRecovery}
                    onChange={(e) => setSendRecovery(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  {saveSuccess && (
                    <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Settings saved successfully
                    </span>
                  )}
                  {!saveSuccess && <span />}
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
                  >
                    {saving ? "Saving..." : "Save Configuration"}
                  </button>
                </div>
              </form>
            </div>

            {/* Test SMS Dispatcher */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-base font-semibold flex items-center gap-2 mb-2">
                <Send className="h-4 w-4 text-primary" />
                Dispatch Test SMS Scenario
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Verify real-time carrier formatting and provider connectivity before going live.
              </p>

              <form onSubmit={handleSendTest} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Mobile Number
                    </label>
                    <div className="mt-1.5 relative">
                      <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={testNumber}
                        onChange={(e) => setTestNumber(e.target.value)}
                        placeholder="+919876543210"
                        className="w-full pl-9 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Simulation Scenario
                    </label>
                    <select
                      value={testScenario}
                      onChange={(e) => setTestScenario(e.target.value as any)}
                      className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="warning">Warning: Oil Level Declining (-1.2%/hr)</option>
                      <option value="critical">Critical: Severe Oil Leak & Thermal Runaway</option>
                      <option value="recovery">Recovery: Oil Restored & System Cleared</option>
                      <option value="normal">Normal: Routine Baseline Heartbeat</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={testLoading || !testNumber}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent border border-border hover:bg-accent/80 px-4 py-2 text-sm font-medium transition"
                >
                  {testLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 text-primary" />
                  )}
                  Transmit Test SMS
                </button>
              </form>

              {/* Test Response Preview */}
              {testResult && (
                <div className="mt-4 rounded-md border border-border bg-background p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1.5">
                      {testResult.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      Status:{" "}
                      <span className="uppercase font-mono font-bold">
                        {testResult.delivery_status}
                      </span>
                    </span>
                    <span className="font-mono text-muted-foreground">{testResult.recipient}</span>
                  </div>

                  {testResult.error && (
                    <div className="rounded bg-destructive/10 border border-destructive/30 p-2 text-destructive">
                      {testResult.error}
                    </div>
                  )}

                  {testResult.formatted_message && (
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                        Transmitted Message Body:
                      </div>
                      <pre className="p-2.5 rounded bg-card border border-border font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                        {testResult.formatted_message}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Standard Format Preview & Audit Logs (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Standard SMS Template Specification */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-primary" />
                Standard Engineering Format
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                Every dispatch strictly follows the mandated utility alert format:
              </p>

              <div className="rounded-md border border-border bg-background p-3 font-mono text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap select-all">
{`SUBSTATION ALERT - WARNING
Equipment: TX-001 (T1-400kV)
Issue: Oil level declining abnormally.
Current status: Possible risk (declining trend)
Action: Inspect oil tank, valves and seals.
Priority: High
Time: 2026-10-11 21:00:00 UTC
Dashboard: http://localhost:8080/dashboard`}
              </div>

              <div className="mt-3 text-[11px] text-muted-foreground space-y-1">
                <div>✓ <strong>Observed Abnormality vs Possible Risk</strong> clearly segregated.</div>
                <div>✓ Never flags an unconfirmed leak as a confirmed breakdown.</div>
                <div>✓ Clickable dashboard link included for swift field navigation.</div>
              </div>
            </div>

            {/* Audit Log */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  SMS Delivery Audit Log
                </h2>
                <span className="text-xs font-mono text-muted-foreground">
                  {logs.length} logged
                </span>
              </div>

              {logs.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded">
                  No SMS transmissions logged yet. Use the test tool to send your first message.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded border border-border bg-background/60 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium">{log.recipient}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                            log.delivery_status === "delivered" || log.delivery_status === "sent"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                              : log.delivery_status === "simulated"
                              ? "bg-blue-500/10 text-blue-500 border border-blue-500/30"
                              : "bg-destructive/10 text-destructive border border-destructive/30"
                          }`}
                        >
                          {log.delivery_status}
                        </span>
                      </div>

                      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>
                          [{log.severity}] {log.event_type} · {log.parameter}
                        </span>
                        <span className="font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {log.error_message && (
                        <div className="text-[10px] text-destructive truncate">
                          {log.error_message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
