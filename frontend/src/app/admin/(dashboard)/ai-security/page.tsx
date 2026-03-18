"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { getSocket } from "@/lib/socket";

// ── Recharts (browser-only) ───────────────────────────────────────────────────
const BarChart            = dynamic(() => import("recharts").then((m) => m.BarChart),            { ssr: false });
const Bar                 = dynamic(() => import("recharts").then((m) => m.Bar),                 { ssr: false });
const Cell                = dynamic(() => import("recharts").then((m) => m.Cell),                { ssr: false });
const XAxis               = dynamic(() => import("recharts").then((m) => m.XAxis),               { ssr: false });
const YAxis               = dynamic(() => import("recharts").then((m) => m.YAxis),               { ssr: false });
const CartesianGrid       = dynamic(() => import("recharts").then((m) => m.CartesianGrid),       { ssr: false });
const Tooltip             = dynamic(() => import("recharts").then((m) => m.Tooltip),             { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const ReferenceLine       = dynamic(() => import("recharts").then((m) => m.ReferenceLine),       { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface StationScore {
  id: number; ts: string; election_id: string;
  station_id: string; station_name: string;
  county: string; constituency: string; ward: string;
  anomaly_score: number; alert_level: string;
  triggered_rules: { rule_id: string; severity: string; description: string }[];
  features: Record<string, number>;
  explanation: string;
}
interface SecurityEvent {
  id: number; ts: string; event_type: string; severity: string;
  election_id: string | null; station_id: string | null;
  description: string; details: Record<string, unknown>;
}
interface IntegrityCheck {
  id: number; ts: string; election_id: string; election_name: string;
  total_votes: number; blockchain_confirmed: number; blockchain_pending: number;
  tally_total: number | null; discrepancy: number | null; discrepancy_pct: number | null;
  status: string;
  details: { findings?: Array<{ check: string; severity: string; description: string }>; note?: string };
}
interface FraudReport {
  generated_at: string; period_hours: number;
  summary: { total_checks: number; avg_score: number; max_score: number;
    critical_count: number; high_count: number; medium_count: number;
    normal_count: number; stations_monitored: number; elections_monitored: number };
  top_risk_stations: Array<{ station_id: string; station_name: string; county: string;
    peak_score: number; avg_score: number; worst_alert: string; check_count: number }>;
  recommendation: string;
}
interface SystemHealth {
  health_status: string; generated_at: string;
  monitoring: { running: boolean; last_station_check: string | null;
    last_integrity_check: string | null; last_security_check: string | null;
    stations_analyzed_total: number; integrity_checks_total: number; monitoring_errors: number };
  last_hour_fraud: { total_checks: number; critical_count: number; high_count: number; medium_count: number };
  recent_integrity_issues: IntegrityCheck[];
  recent_critical_security: SecurityEvent[];
}
interface MonitorStatus {
  running: boolean; last_monitor_run: string | null;
  last_integrity_run: string | null; last_security_run: string | null;
  monitoring_errors: number; stations_analyzed: number;
  integrity_checks_run: number; security_checks_run: number;
  intervals: { station_seconds: number; integrity_seconds: number; security_seconds: number };
}
interface AuditEntry {
  ts: string; request_id: string; station_code: string;
  anomaly_score: number; model_prediction: string; rule_severity: string;
  final_alert_level: string; alert_triggered: boolean; processing_ms: number;
  features: Record<string, number>;
  triggered_rules: { rule_id: string; severity: string; description: string }[];
  explanation?: string; explanation_tier?: string; explanation_model?: string;
}
interface LlmStatus {
  ollama_running: boolean; configured_model: string; model_available: boolean;
  fallback_active?: boolean; gpu_upgrade_path?: string;
}
interface AnalysisForm {
  station_code: string; voting_velocity: string; temporal_deviation: string;
  geographic_cluster_score: string; repeat_attempt_rate: string;
  distress_correlation: string; recent_distress_count: string; station_hourly_average: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Stations", "Security Events", "Integrity", "Fraud Report", "Manual Lab", "Audit Log"] as const;
type Tab = (typeof TABS)[number];

const ALERT_COLORS: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  CRITICAL: { bg: "bg-red-50",     text: "text-red-700",    border: "border-red-300",    dot: "bg-red-500",    label: "CRITICAL" },
  HIGH:     { bg: "bg-orange-50",  text: "text-orange-700", border: "border-orange-300", dot: "bg-orange-500", label: "HIGH"     },
  MEDIUM:   { bg: "bg-yellow-50",  text: "text-yellow-700", border: "border-yellow-300", dot: "bg-yellow-500", label: "MEDIUM"   },
  LOW:      { bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-300",   dot: "bg-blue-500",   label: "LOW"      },
  NONE:     { bg: "bg-gray-50",    text: "text-gray-500",   border: "border-gray-200",   dot: "bg-gray-300",   label: "NORMAL"   },
};
const HEALTH_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: "bg-red-600",    text: "text-white", label: "CRITICAL" },
  WARNING:  { bg: "bg-orange-500", text: "text-white", label: "WARNING"  },
  ELEVATED: { bg: "bg-yellow-500", text: "text-white", label: "ELEVATED" },
  HEALTHY:  { bg: "bg-green-600",  text: "text-white", label: "HEALTHY"  },
};
const EVENT_ICONS: Record<string, string> = {
  DISTRESS_CLUSTER_STATION:  "🆘",
  DISTRESS_CLUSTER_ELECTION: "🚨",
  MASS_DISTRESS:             "⚠️",
  VELOCITY_SURGE:            "⚡",
  AFTER_HOURS_VOTING:        "🌙",
  BLOCKCHAIN_LAG_STATION:    "⛓️",
  BLOCKCHAIN_LAG_ELECTION:   "⛓️",
  ZERO_BLOCKCHAIN_ELECTION:  "🔴",
};

// ── Shared components ─────────────────────────────────────────────────────────
function AlertBadge({ level }: { level: string }) {
  const s = ALERT_COLORS[level] ?? ALERT_COLORS.NONE;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
function ScoreBar({ score, compact }: { score: number; compact?: boolean }) {
  const color = score >= 85 ? "bg-red-500" : score >= 70 ? "bg-orange-400" : score >= 50 ? "bg-yellow-400" : "bg-green-400";
  if (compact) return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-gray-200">
        <div className={`h-1.5 rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono">{score.toFixed(0)}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200">
        <div className={`h-2 rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono font-medium">{score.toFixed(1)}</span>
    </div>
  );
}
function PulseDot({ color = "bg-green-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}
function ScannerLine() {
  return (
    <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="absolute h-full w-1/3 animate-[scan_2s_linear_infinite] rounded-full bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
    </div>
  );
}
function timeAgo(ts: string | null): string {
  if (!ts) return "never";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5)  return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
function IntegrityStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PASS:             "bg-green-100 text-green-800",
    NO_TALLY:         "bg-gray-100 text-gray-600",
    PARTIAL:          "bg-yellow-100 text-yellow-800",
    BLOCKCHAIN_LAG:   "bg-orange-100 text-orange-800",
    MISMATCH:         "bg-red-100 text-red-800",
    CRITICAL_MISMATCH:"bg-red-200 text-red-900 font-bold",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────
export default function AISecurityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading AI Security Monitor…</div>}>
      <AISecurityContent />
    </Suspense>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
function AISecurityContent() {
  const [isMounted, setIsMounted]         = useState(false);
  const [activeTab, setActiveTab]         = useState<Tab>("Overview");
  const [scanCount, setScanCount]         = useState(0);
  const [lastScanTs, setLastScanTs]       = useState<Date | null>(null);
  const [nextScanIn, setNextScanIn]       = useState(10);
  const [isScanning, setIsScanning]       = useState(false);

  // Monitoring data
  const [health,     setHealth]     = useState<SystemHealth | null>(null);
  const [monStatus,  setMonStatus]  = useState<MonitorStatus | null>(null);
  const [stations,   setStations]   = useState<StationScore[]>([]);
  const [security,   setSecurity]   = useState<SecurityEvent[]>([]);
  const [integrity,  setIntegrity]  = useState<{ overall_status: string; summary: Record<string,number>; mismatches: IntegrityCheck[]; recent_checks: IntegrityCheck[]; interpretation: string } | null>(null);
  const [fraud,      setFraud]      = useState<FraudReport | null>(null);
  const [llmStatus,  setLlmStatus]  = useState<LlmStatus | null>(null);
  const [auditLog,   setAuditLog]   = useState<AuditEntry[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<{ station_code: string; level: string; ts: string }[]>([]);

  // Manual analysis
  const [form, setForm] = useState<AnalysisForm>({
    station_code: "KE-NBO-001", voting_velocity: "0.25", temporal_deviation: "0.10",
    geographic_cluster_score: "0.08", repeat_attempt_rate: "0.02",
    distress_correlation: "0.01", recent_distress_count: "0", station_hourly_average: "45",
  });
  const [analysisResult, setAnalysisResult] = useState<{
    anomaly_score: number; alert_level: string; message: string;
    explanation: string; explanation_tier: string; explanation_model: string | null;
    explanation_latency_ms: number;
    triggered_rules: { rule_id: string; severity: string; description: string }[];
    model_prediction: string;
  } | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError,   setAnalysisError]   = useState("");

  const scanIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch all monitoring data ───────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const [healthRes, statusRes, stationsRes, securityRes, integrityRes, fraudRes, llmRes, auditRes] =
        await Promise.allSettled([
          api.get<SystemHealth>("/api/ai/reports/health"),
          api.get<MonitorStatus>("/api/ai/monitor/status"),
          api.get<{ count: number; scores: StationScore[] }>("/api/ai/monitor/scores?limit=200"),
          api.get<{ all_recent: SecurityEvent[] }>("/api/ai/reports/security"),
          api.get<typeof integrity>("/api/ai/reports/integrity"),
          api.get<FraudReport>("/api/ai/reports/fraud?hours=24"),
          api.get<LlmStatus>("/api/ai/llm-status"),
          api.get<{ count: number; entries: AuditEntry[] }>("/api/ai/audit/recent?limit=50"),
        ]);

      if (healthRes.status    === "fulfilled") setHealth(healthRes.value);
      if (statusRes.status    === "fulfilled") setMonStatus(statusRes.value);
      if (stationsRes.status  === "fulfilled") setStations(stationsRes.value.scores ?? []);
      if (securityRes.status  === "fulfilled") setSecurity(securityRes.value.all_recent ?? []);
      if (integrityRes.status === "fulfilled") setIntegrity(integrityRes.value);
      if (fraudRes.status     === "fulfilled") setFraud(fraudRes.value);
      if (llmRes.status       === "fulfilled") setLlmStatus(llmRes.value);
      if (auditRes.status     === "fulfilled" && auditRes.value.entries) {
        const seen = new Set<string>();
        setAuditLog(auditRes.value.entries.filter((e) => {
          if (seen.has(e.request_id)) return false;
          seen.add(e.request_id);
          return true;
        }));
      }

      setScanCount((n) => n + 1);
      setLastScanTs(new Date());
      setNextScanIn(10);
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    runScan();

    // Auto-scan every 10 seconds
    scanIntervalRef.current = setInterval(runScan, 10_000);

    // Countdown ticker
    countdownRef.current = setInterval(() => {
      setNextScanIn((n) => (n <= 1 ? 10 : n - 1));
    }, 1_000);

    // Live distress socket
    const socket = getSocket();
    if (socket) {
      socket.on("distress:alert", (data: { stationCode: string; timestamp: string }) => {
        setLiveAlerts((prev) => [
          { station_code: data.stationCode, level: "CRITICAL", ts: data.timestamp },
          ...prev,
        ].slice(0, 8));
      });
    }

    return () => {
      if (scanIntervalRef.current)  clearInterval(scanIntervalRef.current);
      if (countdownRef.current)     clearInterval(countdownRef.current);
      if (socket) socket.off("distress:alert");
    };
  }, [runScan]);

  // ── Computed values ─────────────────────────────────────────────────────────
  const criticalStations  = stations.filter((s) => s.alert_level === "CRITICAL");
  const highStations      = stations.filter((s) => s.alert_level === "HIGH");
  const alertedStations   = stations.filter((s) => ["CRITICAL","HIGH","MEDIUM"].includes(s.alert_level));
  const sortedStations    = [...stations].sort((a, b) => b.anomaly_score - a.anomaly_score);
  const criticalEvents    = security.filter((e) => e.severity === "CRITICAL");
  const highEvents        = security.filter((e) => e.severity === "HIGH");
  const healthColor       = HEALTH_COLORS[health?.health_status ?? ""] ?? HEALTH_COLORS.HEALTHY;
  const trendData         = sortedStations.slice(0, 20).map((s) => ({
    name: s.station_name || s.station_id,
    score: s.anomaly_score,
    fill: s.anomaly_score >= 85 ? "#ef4444" : s.anomaly_score >= 70 ? "#f97316" : s.anomaly_score >= 50 ? "#eab308" : "#22c55e",
  }));

  // ── Manual analysis ─────────────────────────────────────────────────────────
  async function handleAnalyze() {
    setAnalysisLoading(true); setAnalysisError(""); setAnalysisResult(null);
    try {
      const payload = {
        station_code: form.station_code,
        voting_velocity:          parseFloat(form.voting_velocity),
        temporal_deviation:       parseFloat(form.temporal_deviation),
        geographic_cluster_score: parseFloat(form.geographic_cluster_score),
        repeat_attempt_rate:      parseFloat(form.repeat_attempt_rate),
        distress_correlation:     parseFloat(form.distress_correlation),
        recent_distress_count:    parseInt(form.recent_distress_count) || 0,
        station_hourly_average:   parseFloat(form.station_hourly_average) || undefined,
      };
      const res = await api.post<typeof analysisResult>("/api/ai/analyze-voting-pattern", payload);
      setAnalysisResult(res);
      runScan();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  }
  function setScenario(name: string) {
    const s: Record<string, Partial<AnalysisForm>> = {
      normal:   { voting_velocity: "0.15", temporal_deviation: "0.08", geographic_cluster_score: "0.06", repeat_attempt_rate: "0.02", distress_correlation: "0.01", recent_distress_count: "0" },
      velocity: { voting_velocity: "0.92", temporal_deviation: "0.45", geographic_cluster_score: "0.82", repeat_attempt_rate: "0.05", distress_correlation: "0.03", recent_distress_count: "0" },
      coercion: { voting_velocity: "0.70", temporal_deviation: "0.78", geographic_cluster_score: "0.62", repeat_attempt_rate: "0.20", distress_correlation: "0.84", recent_distress_count: "6" },
    };
    setForm((prev) => ({ ...prev, ...(s[name] ?? {}) }));
    setAnalysisResult(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Header title="AI Security Monitor" />

      {/* ── Top control bar ── */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-6 py-2">
        <div className="flex items-center gap-4">

          {/* Live badge */}
          <div className="flex items-center gap-2">
            <PulseDot color={health?.monitoring.running ? "bg-green-500" : "bg-red-500"} />
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-700">
              {health?.monitoring.running ? "Live Monitoring" : "Offline"}
            </span>
          </div>

          {/* Scanner progress */}
          <div className="flex-1 max-w-xs">
            {isScanning
              ? <ScannerLine />
              : <div className="h-0.5 w-full rounded-full bg-gray-100" />}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Scan <span className="font-mono font-semibold text-gray-800">#{scanCount}</span></span>
            <span>Last: <span className="font-mono">{lastScanTs ? timeAgo(lastScanTs.toISOString()) : "—"}</span></span>
            <span>Next: <span className="font-mono font-semibold text-blue-600">{nextScanIn}s</span></span>
          </div>

          {/* Health chip */}
          {health && (
            <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${healthColor.bg} ${healthColor.text}`}>
              {healthColor.label}
            </span>
          )}

          {/* LLM chip */}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            llmStatus?.model_available
              ? "bg-purple-100 text-purple-700"
              : "bg-gray-100 text-gray-500"
          }`}>
            {llmStatus?.model_available ? `LLM · ${llmStatus.configured_model}` : "Template fallback"}
          </span>

          {/* Manual refresh */}
          <button onClick={runScan} disabled={isScanning}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            ↻ Refresh
          </button>
        </div>

        {/* Live distress ticker */}
        {liveAlerts.length > 0 && (
          <div className="mt-1 flex items-center gap-2 overflow-hidden">
            <span className="text-[10px] font-bold uppercase text-red-600 shrink-0">LIVE DISTRESS:</span>
            <div className="flex gap-3 overflow-x-auto scrollbar-none">
              {liveAlerts.map((a, i) => (
                <span key={i} className="flex shrink-0 items-center gap-1 text-[10px] text-red-700">
                  <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-red-500" />
                  {a.station_code} · {new Date(a.ts).toLocaleTimeString()}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Alert banner ── */}
      {(criticalStations.length > 0 || criticalEvents.length > 0) && (
        <div className="mx-6 mt-4 animate-pulse rounded-lg border-2 border-red-400 bg-red-50 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">🚨</span>
            <div>
              <p className="text-sm font-bold text-red-800">
                CRITICAL SECURITY ALERT — Immediate Action Required
              </p>
              <p className="text-xs text-red-700 mt-0.5">
                {criticalStations.length > 0 && `${criticalStations.length} station(s) at CRITICAL risk. `}
                {criticalEvents.length > 0 && `${criticalEvents.length} critical security event(s) detected.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-3 px-6 pt-4 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: "Stations Scanned",  value: stations.length,                        color: "text-gray-900" },
          { label: "Critical Alerts",   value: criticalStations.length,                color: criticalStations.length > 0 ? "text-red-600" : "text-gray-900" },
          { label: "High Alerts",       value: highStations.length,                    color: highStations.length > 0 ? "text-orange-600" : "text-gray-900" },
          { label: "Security Events",   value: security.length,                        color: criticalEvents.length > 0 ? "text-red-600" : "text-gray-900" },
          { label: "Integrity Checks",  value: monStatus?.integrity_checks_run ?? "—", color: "text-gray-900" },
          { label: "Avg Anomaly Score", value: stations.length > 0
              ? (stations.reduce((s, e) => s + e.anomaly_score, 0) / stations.length).toFixed(1)
              : "—",                                                                    color: "text-gray-900" },
          { label: "Monitor Errors",    value: monStatus?.monitoring_errors ?? 0,      color: (monStatus?.monitoring_errors ?? 0) > 0 ? "text-red-600" : "text-green-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="mt-4 px-6">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {TABS.map((tab) => {
            const badge =
              tab === "Security Events" && (criticalEvents.length + highEvents.length) > 0
                ? criticalEvents.length + highEvents.length
              : tab === "Stations" && alertedStations.length > 0
                ? alertedStations.length
              : tab === "Integrity" && (integrity?.summary?.mismatches ?? 0) > 0
                ? integrity?.summary?.mismatches
              : null;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                  activeTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}>
                {tab}
                {badge ? (
                  <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="p-6 space-y-5">

        {/* ════════ OVERVIEW ════════ */}
        {activeTab === "Overview" && (
          <>
            {/* Monitor engine status */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Monitoring Engine</h3>
                  <PulseDot color={monStatus?.running ? "bg-green-500" : "bg-red-500"} />
                </div>
                <dl className="space-y-2 text-xs">
                  {[
                    { label: "Station fraud scan",  value: timeAgo(monStatus?.last_monitor_run ?? null),   interval: `every ${monStatus?.intervals?.station_seconds ?? 60}s` },
                    { label: "Integrity check",     value: timeAgo(monStatus?.last_integrity_run ?? null), interval: `every ${monStatus?.intervals?.integrity_seconds ?? 300}s` },
                    { label: "Security events",     value: timeAgo(monStatus?.last_security_run ?? null),  interval: `every ${monStatus?.intervals?.security_seconds ?? 30}s` },
                  ].map(({ label, value, interval }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-gray-500">{label}</span>
                      <div className="text-right">
                        <span className="font-mono font-medium text-gray-800">{value}</span>
                        <span className="ml-2 text-gray-400">{interval}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                    <span className="text-gray-500">Total stations analyzed</span>
                    <span className="font-mono font-bold text-gray-800">{monStatus?.stations_analyzed ?? 0}</span>
                  </div>
                </dl>
              </div>

              {/* Integrity snapshot */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Blockchain Integrity</h3>
                {integrity ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <IntegrityStatusBadge status={integrity.overall_status === "PASS" ? "PASS" : integrity.overall_status} />
                      <span className="text-xs text-gray-500">overall</span>
                    </div>
                    <dl className="space-y-1.5 text-xs">
                      <div className="flex justify-between"><dt className="text-gray-500">Checks performed</dt><dd className="font-mono font-semibold">{integrity.summary.checks_performed}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Passed</dt><dd className="font-mono text-green-700 font-semibold">{integrity.summary.passed}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Mismatches</dt><dd className={`font-mono font-semibold ${integrity.summary.mismatches > 0 ? "text-red-700" : "text-gray-800"}`}>{integrity.summary.mismatches}</dd></div>
                      <div className="flex justify-between"><dt className="text-gray-500">Lags / partial</dt><dd className="font-mono font-semibold">{integrity.summary.lags}</dd></div>
                    </dl>
                    <p className="rounded bg-gray-50 p-2 text-[10px] text-gray-600 leading-relaxed">{integrity.interpretation}</p>
                  </div>
                ) : <p className="text-xs text-gray-400">Waiting for first integrity check…</p>}
              </div>

              {/* Fraud summary */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Fraud Activity (24h)</h3>
                {fraud ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Critical", value: fraud.summary.critical_count, color: fraud.summary.critical_count > 0 ? "text-red-700 bg-red-50 border-red-200" : "text-gray-700 bg-gray-50 border-gray-200" },
                        { label: "High",     value: fraud.summary.high_count,     color: fraud.summary.high_count > 0 ? "text-orange-700 bg-orange-50 border-orange-200" : "text-gray-700 bg-gray-50 border-gray-200" },
                        { label: "Medium",   value: fraud.summary.medium_count,   color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
                        { label: "Normal",   value: fraud.summary.normal_count,   color: "text-green-700 bg-green-50 border-green-200" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className={`rounded border p-2 text-center ${color}`}>
                          <p className="text-lg font-bold">{value}</p>
                          <p className="text-[10px] uppercase tracking-wide">{label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] leading-relaxed text-gray-600 rounded bg-gray-50 p-2">{fraud.recommendation}</p>
                  </div>
                ) : <p className="text-xs text-gray-400">Loading fraud report…</p>}
              </div>
            </div>

            {/* Anomaly score bar chart */}
            {isMounted && trendData.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Live Station Anomaly Scores — Top 20 by Risk</h3>
                  <span className="text-xs text-gray-400">Updated every 10s · backend re-scores every 60s</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded border border-gray-200 bg-white p-2 shadow text-xs">
                            <p className="font-semibold">{d.name}</p>
                            <p>Score: <span className="font-mono">{d.score.toFixed(1)}</span></p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={70} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "Alert threshold", position: "right", fontSize: 9, fill: "#f97316" }} />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {trendData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Recent security events */}
            {security.slice(0, 6).length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Recent Security Events</h3>
                  <button onClick={() => setActiveTab("Security Events")} className="text-xs text-blue-600 hover:underline">View all →</button>
                </div>
                <div className="space-y-2">
                  {security.slice(0, 6).map((ev, i) => (
                    <div key={i} className={`flex items-start gap-3 rounded-md p-2.5 border ${ALERT_COLORS[ev.severity]?.border ?? "border-gray-200"} ${ALERT_COLORS[ev.severity]?.bg ?? "bg-gray-50"}`}>
                      <span className="text-base shrink-0">{EVENT_ICONS[ev.event_type] ?? "⚠️"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <AlertBadge level={ev.severity} />
                          <span className="text-[10px] font-mono text-gray-500">{ev.event_type}</span>
                          <span className="ml-auto text-[10px] text-gray-400 shrink-0">{timeAgo(ev.ts)}</span>
                        </div>
                        <p className={`mt-0.5 text-xs ${ALERT_COLORS[ev.severity]?.text ?? "text-gray-700"}`}>{ev.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════ STATIONS ════════ */}
        {activeTab === "Stations" && (
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Live Station Fraud Scores</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {stations.length} stations · backend re-scores every 60s · {alertedStations.length} flagged
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                {["CRITICAL","HIGH","MEDIUM"].map((l) => (
                  <span key={l} className={`rounded-full px-2 py-0.5 font-semibold ${ALERT_COLORS[l].bg} ${ALERT_COLORS[l].text}`}>
                    {stations.filter((s) => s.alert_level === l).length} {l}
                  </span>
                ))}
              </div>
            </div>
            {stations.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-gray-400">No station scores yet.</p>
                <p className="text-xs text-gray-400 mt-1">The monitoring engine will score stations once an active election has votes.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-gray-500">Station</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">County</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Score</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Level</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Rules</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Last Scan</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">AI Briefing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStations.map((s, i) => (
                      <tr key={`${s.station_id}-${i}`}
                        className={`border-b border-gray-50 transition-colors ${
                          s.alert_level === "CRITICAL" ? "bg-red-50"
                          : s.alert_level === "HIGH"   ? "bg-orange-50"
                          : s.alert_level === "MEDIUM" ? "bg-yellow-50/50"
                          : ""
                        }`}>
                        <td className="px-4 py-2 font-mono font-medium text-gray-800">{s.station_name || s.station_id}</td>
                        <td className="px-4 py-2 text-gray-500">{s.county}</td>
                        <td className="px-4 py-2">{isMounted && <ScoreBar score={s.anomaly_score} compact />}</td>
                        <td className="px-4 py-2"><AlertBadge level={s.alert_level} /></td>
                        <td className="px-4 py-2 text-gray-500 max-w-[180px] truncate">
                          {(s.triggered_rules ?? []).map((r) => r.rule_id).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-400">{timeAgo(s.ts)}</td>
                        <td className="px-4 py-2 max-w-[240px]">
                          <p className="truncate text-gray-600">{s.explanation || "—"}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════ SECURITY EVENTS ════════ */}
        {activeTab === "Security Events" && (
          <div className="space-y-4">
            {/* Summary chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Critical", count: security.filter((e) => e.severity === "CRITICAL").length, color: "bg-red-100 text-red-800 border-red-200" },
                { label: "High",     count: security.filter((e) => e.severity === "HIGH").length,     color: "bg-orange-100 text-orange-800 border-orange-200" },
                { label: "Medium",   count: security.filter((e) => e.severity === "MEDIUM").length,   color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
                { label: "Total",    count: security.length,                                          color: "bg-gray-100 text-gray-700 border-gray-200" },
              ].map(({ label, count, color }) => (
                <div key={label} className={`rounded-lg border px-4 py-2 ${color}`}>
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-[10px] uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>

            {security.length === 0 ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-semibold text-green-800">No security events detected</p>
                <p className="text-xs text-green-600 mt-1">The monitoring engine is running and has found nothing suspicious.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-50">
                {security.map((ev, i) => (
                  <div key={i} className={`flex items-start gap-4 p-4 ${
                    ev.severity === "CRITICAL" ? "bg-red-50" : ev.severity === "HIGH" ? "bg-orange-50/50" : ""
                  }`}>
                    <span className="text-xl shrink-0 mt-0.5">{EVENT_ICONS[ev.event_type] ?? "⚠️"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <AlertBadge level={ev.severity} />
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">{ev.event_type}</span>
                        {ev.station_id && <span className="text-xs text-gray-500">Station: <span className="font-mono">{ev.station_id}</span></span>}
                        <span className="ml-auto text-xs text-gray-400 shrink-0">{timeAgo(ev.ts)}</span>
                      </div>
                      <p className="text-sm text-gray-800">{ev.description}</p>
                      {Object.keys(ev.details ?? {}).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {Object.entries(ev.details).slice(0, 4).map(([k, v]) => (
                            <span key={k} className="rounded bg-white border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                              {k}: <span className="font-mono">{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════ INTEGRITY ════════ */}
        {activeTab === "Integrity" && (
          <div className="space-y-4">
            {integrity ? (
              <>
                {/* Overall status banner */}
                <div className={`rounded-lg border-2 p-5 ${
                  integrity.overall_status === "PASS"    ? "border-green-300 bg-green-50"
                  : integrity.overall_status === "CRITICAL" ? "border-red-400 bg-red-50"
                  : "border-orange-300 bg-orange-50"
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">
                      {integrity.overall_status === "PASS" ? "✅" : integrity.overall_status === "CRITICAL" ? "🚨" : "⚠️"}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <IntegrityStatusBadge status={integrity.overall_status} />
                        <span className="text-sm font-semibold text-gray-800">Blockchain vs Homomorphic Tally</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{integrity.interpretation}</p>
                    </div>
                  </div>
                </div>

                {/* Per-election table */}
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="border-b border-gray-100 px-5 py-3">
                    <h3 className="text-sm font-semibold text-gray-900">Election-by-Election Integrity</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left">
                          <th className="px-4 py-2.5 font-medium text-gray-500">Election</th>
                          <th className="px-4 py-2.5 font-medium text-gray-500">Status</th>
                          <th className="px-4 py-2.5 font-medium text-gray-500">DB Votes</th>
                          <th className="px-4 py-2.5 font-medium text-gray-500">Blockchain ✓</th>
                          <th className="px-4 py-2.5 font-medium text-gray-500">Tally Total</th>
                          <th className="px-4 py-2.5 font-medium text-gray-500">Discrepancy</th>
                          <th className="px-4 py-2.5 font-medium text-gray-500">Checked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {integrity.recent_checks.map((c, i) => (
                          <tr key={i} className={`border-b border-gray-50 ${
                            c.status === "CRITICAL_MISMATCH" ? "bg-red-50"
                            : c.status === "MISMATCH"        ? "bg-orange-50"
                            : ""
                          }`}>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{c.election_name}</td>
                            <td className="px-4 py-2.5"><IntegrityStatusBadge status={c.status} /></td>
                            <td className="px-4 py-2.5 font-mono">{c.total_votes}</td>
                            <td className="px-4 py-2.5 font-mono text-green-700">{c.blockchain_confirmed}</td>
                            <td className="px-4 py-2.5 font-mono">{c.tally_total ?? "—"}</td>
                            <td className={`px-4 py-2.5 font-mono font-semibold ${(c.discrepancy ?? 0) > 0 ? "text-red-700" : "text-green-700"}`}>
                              {c.discrepancy != null ? (c.discrepancy === 0 ? "✓ 0" : `+${c.discrepancy} (${c.discrepancy_pct?.toFixed(1)}%)`) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-gray-400">{timeAgo(c.ts)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Findings detail */}
                {integrity.mismatches.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-white p-5">
                    <h3 className="mb-3 text-sm font-semibold text-red-800">🚨 Mismatch Details</h3>
                    {integrity.mismatches.map((m, i) => (
                      <div key={i} className="mb-3 rounded-lg bg-red-50 p-4">
                        <p className="font-semibold text-red-800 mb-2">{m.election_name}</p>
                        {(m.details.findings ?? []).map((f, j) => (
                          <div key={j} className={`mb-1 rounded p-2 text-xs ${
                            f.severity === "CRITICAL" ? "bg-red-100 text-red-800"
                            : f.severity === "HIGH"   ? "bg-orange-100 text-orange-800"
                            : "bg-gray-100 text-gray-700"
                          }`}>
                            <span className="font-mono font-bold">[{f.check}]</span> {f.description}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
                <p className="text-sm text-gray-400">Integrity data loading… checks run every 5 minutes.</p>
              </div>
            )}
          </div>
        )}

        {/* ════════ FRAUD REPORT ════════ */}
        {activeTab === "Fraud Report" && (
          <div className="space-y-4">
            {fraud ? (
              <>
                {/* Recommendation banner */}
                <div className={`rounded-lg border-l-4 p-4 ${
                  fraud.summary.critical_count > 0 ? "border-red-500 bg-red-50"
                  : fraud.summary.high_count > 0   ? "border-orange-500 bg-orange-50"
                  : fraud.summary.medium_count > 0  ? "border-yellow-500 bg-yellow-50"
                  : "border-green-500 bg-green-50"
                }`}>
                  <p className="text-sm font-semibold text-gray-800">{fraud.recommendation}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Report covers last {fraud.period_hours}h · Generated {timeAgo(fraud.generated_at)}
                  </p>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                  {[
                    { label: "Total Checks",   value: fraud.summary.total_checks,   color: "text-gray-900" },
                    { label: "Avg Score",      value: fraud.summary.avg_score.toFixed(1), color: "text-gray-900" },
                    { label: "Max Score",      value: fraud.summary.max_score.toFixed(1), color: fraud.summary.max_score >= 70 ? "text-red-700" : "text-gray-900" },
                    { label: "Critical",       value: fraud.summary.critical_count, color: fraud.summary.critical_count > 0 ? "text-red-700" : "text-green-700" },
                    { label: "High",           value: fraud.summary.high_count,     color: fraud.summary.high_count > 0 ? "text-orange-700" : "text-green-700" },
                    { label: "Medium",         value: fraud.summary.medium_count,   color: "text-yellow-700" },
                    { label: "Normal",         value: fraud.summary.normal_count,   color: "text-green-700" },
                    { label: "Stations",       value: fraud.summary.stations_monitored, color: "text-gray-900" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
                      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Top risk stations */}
                {fraud.top_risk_stations.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 px-5 py-3">
                      <h3 className="text-sm font-semibold text-gray-900">Top Risk Stations</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-left">
                            <th className="px-4 py-2.5 font-medium text-gray-500">Station</th>
                            <th className="px-4 py-2.5 font-medium text-gray-500">County</th>
                            <th className="px-4 py-2.5 font-medium text-gray-500">Peak Score</th>
                            <th className="px-4 py-2.5 font-medium text-gray-500">Avg Score</th>
                            <th className="px-4 py-2.5 font-medium text-gray-500">Worst Alert</th>
                            <th className="px-4 py-2.5 font-medium text-gray-500">Scans</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fraud.top_risk_stations.map((s, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="px-4 py-2 font-mono font-medium">{s.station_name || s.station_id}</td>
                              <td className="px-4 py-2 text-gray-500">{s.county}</td>
                              <td className="px-4 py-2">{isMounted && <ScoreBar score={s.peak_score} compact />}</td>
                              <td className="px-4 py-2 font-mono text-gray-500">{s.avg_score?.toFixed(1)}</td>
                              <td className="px-4 py-2"><AlertBadge level={s.worst_alert} /></td>
                              <td className="px-4 py-2 font-mono text-gray-400">{s.check_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Score distribution chart */}
                {isMounted && fraud.summary.total_checks > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-white p-5">
                    <h3 className="mb-3 text-sm font-semibold text-gray-900">Alert Level Distribution</h3>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart
                        data={[
                          { level: "Normal",   count: fraud.summary.normal_count,   fill: "#22c55e" },
                          { level: "Medium",   count: fraud.summary.medium_count,   fill: "#eab308" },
                          { level: "High",     count: fraud.summary.high_count,     fill: "#f97316" },
                          { level: "Critical", count: fraud.summary.critical_count, fill: "#ef4444" },
                        ]}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="level" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {[
                            { fill: "#22c55e" }, { fill: "#eab308" }, { fill: "#f97316" }, { fill: "#ef4444" }
                          ].map((entry, i) => <rect key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
                <p className="text-sm text-gray-400">Loading fraud report…</p>
              </div>
            )}
          </div>
        )}

        {/* ════════ MANUAL LAB ════════ */}
        {activeTab === "Manual Lab" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-1 text-sm font-semibold text-gray-900">On-Demand Pattern Analysis</h2>
              <p className="mb-4 text-xs text-gray-500">
                Submit a custom station reading directly to the Isolation Forest + rule engine + LLM explainer.
              </p>

              <div className="mb-4 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500 self-center">Scenario:</span>
                {[
                  { id: "normal",   label: "Normal",           color: "bg-green-100 text-green-700" },
                  { id: "velocity", label: "Ballot Stuffing",  color: "bg-orange-100 text-orange-700" },
                  { id: "coercion", label: "Coercion Cluster", color: "bg-red-100 text-red-700" },
                ].map((s) => (
                  <button key={s.id} onClick={() => setScenario(s.id)}
                    className={`rounded-full px-3 py-0.5 text-xs font-medium ${s.color} hover:opacity-80`}>
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Station Code</label>
                    <input value={form.station_code}
                      onChange={(e) => setForm((p) => ({ ...p, station_code: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Distress Count (30 min)</label>
                    <input type="number" min="0" value={form.recent_distress_count}
                      onChange={(e) => setForm((p) => ({ ...p, recent_distress_count: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                {[
                  { key: "voting_velocity",          label: "Voting Velocity (0–1)" },
                  { key: "temporal_deviation",       label: "Temporal Deviation (0–1)" },
                  { key: "geographic_cluster_score", label: "Geographic Cluster Score (0–1)" },
                  { key: "repeat_attempt_rate",      label: "Repeat PIN Attempt Rate (0–1)" },
                  { key: "distress_correlation",     label: "Distress Correlation (0–1)" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <div className="mb-1 flex justify-between">
                      <label className="text-xs font-medium text-gray-600">{label}</label>
                      <span className="text-xs font-mono text-gray-500">
                        {parseFloat(form[key as keyof AnalysisForm] || "0").toFixed(2)}
                      </span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01"
                      value={form[key as keyof AnalysisForm]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full accent-blue-600" />
                  </div>
                ))}
                {analysisError && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{analysisError}</p>}
                <button onClick={handleAnalyze} disabled={analysisLoading}
                  className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {analysisLoading ? "Analysing…" : "▶ Run Analysis"}
                </button>
              </div>

              {analysisResult && (
                <div className={`mt-4 rounded-lg border p-4 space-y-3 ${ALERT_COLORS[analysisResult.alert_level]?.border ?? "border-gray-200"} ${ALERT_COLORS[analysisResult.alert_level]?.bg ?? "bg-gray-50"}`}>
                  <div className="flex items-center gap-3">
                    <AlertBadge level={analysisResult.alert_level} />
                    {isMounted && <ScoreBar score={analysisResult.anomaly_score} />}
                    <span className="text-xs text-gray-500">({analysisResult.model_prediction})</span>
                  </div>
                  <div className="rounded-md bg-white/70 p-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">IEBC Officer Briefing</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        analysisResult.explanation_tier === "llm" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {analysisResult.explanation_tier === "llm"
                          ? `LLM · ${analysisResult.explanation_model}`
                          : "template · on-premise"}
                      </span>
                      <span className="ml-auto text-[10px] text-gray-400">{analysisResult.explanation_latency_ms.toFixed(0)}ms</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${ALERT_COLORS[analysisResult.alert_level]?.text ?? "text-gray-700"}`}>
                      {analysisResult.explanation}
                    </p>
                  </div>
                  {analysisResult.triggered_rules.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-600">Triggered rules:</p>
                      {analysisResult.triggered_rules.map((r) => (
                        <div key={r.rule_id} className="text-xs text-gray-600">
                          <span className="font-mono font-medium">{r.rule_id}</span>{" — "}{r.description}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Model info panel */}
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">AI System Architecture</h3>
                <dl className="space-y-2 text-xs">
                  {[
                    { label: "Anomaly detector",   value: "Isolation Forest (200 trees, 9,000 training samples)" },
                    { label: "Rule engine",        value: "8 deterministic rules (R01–R08)" },
                    { label: "LLM explainer",      value: llmStatus?.model_available ? `${llmStatus.configured_model} via Ollama` : "Template fallback (deterministic)" },
                    { label: "Continuous monitor", value: "3 background loops (60s / 300s / 30s)" },
                    { label: "Inference location", value: "On-premise localhost:8000" },
                    { label: "External API calls", value: "None — fully sovereign" },
                    { label: "Audit log",          value: "JSONL per-day (NIRU D2 Auditability)" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">{label}</dt>
                      <dd className="font-medium text-gray-800 text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 rounded bg-green-50 p-2 text-[10px] text-green-700 leading-relaxed">
                  Sovereignty guarantee: all inference runs on Kenyan infrastructure. No voter data,
                  ballot data, or anomaly signals are transmitted outside the system boundary.
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Detection Features</h3>
                <div className="space-y-2">
                  {[
                    { feature: "voting_velocity",          desc: "Votes/hr normalised to station peak capacity" },
                    { feature: "temporal_deviation",       desc: "Deviation from county hourly peer average" },
                    { feature: "geographic_cluster_score", desc: "Isolated surge vs neighbouring stations" },
                    { feature: "repeat_attempt_rate",      desc: "Lifetime distress density at station" },
                    { feature: "distress_correlation",     desc: "Distress vote density in last 30 min" },
                  ].map(({ feature, desc }) => (
                    <div key={feature} className="flex gap-3">
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700">{feature}</span>
                      <span className="text-xs text-gray-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════ AUDIT LOG ════════ */}
        {activeTab === "Audit Log" && (
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">On-Demand Analysis Audit Log</h2>
                <p className="text-xs text-gray-400 mt-0.5">Every analysis call is logged for NIRU D2 auditability</p>
              </div>
              <button onClick={runScan} className="text-xs text-blue-600 hover:text-blue-800">↻ Refresh</button>
            </div>
            {auditLog.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-400">
                No on-demand analyses yet. Use the Manual Lab tab to run one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-gray-500">Time</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Station</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Score</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Level</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Explainer</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">Rules Triggered</th>
                      <th className="px-4 py-2.5 font-medium text-gray-500">ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((entry, i) => (
                      <tr key={`${entry.request_id ?? i}-${i}`}
                        className={`border-b border-gray-50 ${entry.alert_triggered ? "bg-orange-50" : ""}`}>
                        <td className="px-4 py-2 font-mono text-gray-400">{new Date(entry.ts).toLocaleTimeString()}</td>
                        <td className="px-4 py-2 font-mono font-medium">{entry.station_code}</td>
                        <td className="px-4 py-2">{isMounted && <ScoreBar score={entry.anomaly_score} compact />}</td>
                        <td className="px-4 py-2"><AlertBadge level={entry.final_alert_level} /></td>
                        <td className="px-4 py-2">
                          <span className={`text-[10px] ${entry.explanation_tier === "llm" ? "text-purple-600 font-medium" : "text-gray-400"}`}>
                            {entry.explanation_tier === "llm" ? `LLM · ${entry.explanation_model}` : "template"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate">
                          {(entry.triggered_rules ?? []).length > 0
                            ? (entry.triggered_rules as { rule_id: string }[]).map((r) => r.rule_id).join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-400">{entry.processing_ms?.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tailwind keyframe for scanner ── */}
      <style>{`
        @keyframes scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%);  }
        }
      `}</style>
    </>
  );
}
