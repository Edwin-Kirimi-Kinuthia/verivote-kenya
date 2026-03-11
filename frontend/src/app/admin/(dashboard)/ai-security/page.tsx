"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { getSocket } from "@/lib/socket";

// Recharts — browser only
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });

interface AuditEntry {
  ts: string;
  request_id: string;
  station_code: string;
  anomaly_score: number;
  model_prediction: string;
  rule_severity: string;
  final_alert_level: string;
  alert_triggered: boolean;
  processing_ms: number;
  features: Record<string, number>;
  triggered_rules: { rule_id: string; severity: string; description: string }[];
  explanation?: string;
  explanation_tier?: string;
  explanation_model?: string;
}

interface ModelInfo {
  features: string[];
  meta: { training_samples: number; contamination: number; n_estimators: number };
  alert_threshold: number;
  rule_engine_rules: string[];
}

interface LlmStatus {
  ollama_running: boolean;
  configured_model: string;
  model_available: boolean;
  available_models?: string[];
  error?: string;
  fallback_active?: boolean;
  fallback_description?: string;
  gpu_upgrade_path?: string;
}

interface AnalysisForm {
  station_code: string;
  voting_velocity: string;
  temporal_deviation: string;
  geographic_cluster_score: string;
  repeat_attempt_rate: string;
  distress_correlation: string;
  recent_distress_count: string;
  station_hourly_average: string;
}

const ALERT_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  CRITICAL: { bg: "bg-red-100",    text: "text-red-800",    border: "border-red-300",    label: "CRITICAL" },
  HIGH:     { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300", label: "HIGH"     },
  MEDIUM:   { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300", label: "MEDIUM"   },
  LOW:      { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300",   label: "LOW"      },
  NONE:     { bg: "bg-gray-100",   text: "text-gray-600",   border: "border-gray-200",   label: "NORMAL"   },
};

function AlertBadge({ level }: { level: string }) {
  const s = ALERT_STYLES[level] ?? ALERT_STYLES.NONE;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 85 ? "bg-red-500" : score >= 70 ? "bg-orange-400" : score >= 50 ? "bg-yellow-400" : "bg-green-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono font-medium">{score.toFixed(1)}</span>
    </div>
  );
}

export default function AISecurityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading AI Security Dashboard…</div>}>
      <AISecurityContent />
    </Suspense>
  );
}

function AISecurityContent() {
  const [isMounted, setIsMounted] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [aiHealth, setAiHealth] = useState<{ status: string; model_loaded: boolean } | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveAlerts, setLiveAlerts] = useState<{ station_code: string; level: string; score: number; ts: string }[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [form, setForm] = useState<AnalysisForm>({
    station_code: "KE-NBO-001",
    voting_velocity: "0.25",
    temporal_deviation: "0.10",
    geographic_cluster_score: "0.08",
    repeat_attempt_rate: "0.02",
    distress_correlation: "0.01",
    recent_distress_count: "0",
    station_hourly_average: "45",
  });
  const [analysisResult, setAnalysisResult] = useState<{
    anomaly_score: number;
    alert_level: string;
    message: string;
    explanation: string;
    explanation_tier: string;
    explanation_model: string | null;
    explanation_latency_ms: number;
    triggered_rules: { rule_id: string; severity: string; description: string }[];
    model_prediction: string;
  } | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [auditRes, infoRes, healthRes, llmRes] = await Promise.allSettled([
        api.get<{ count: number; entries: AuditEntry[] }>("/api/ai/audit/recent?limit=50"),
        api.get<ModelInfo>("/api/ai/model-info"),
        api.get<{ status: string; model_loaded: boolean }>("/api/ai/health"),
        api.get<LlmStatus>("/api/ai/llm-status"),
      ]);

      if (auditRes.status === "fulfilled" && auditRes.value.entries) {
        setAuditLog(auditRes.value.entries);
      }
      if (infoRes.status === "fulfilled") setModelInfo(infoRes.value);
      if (healthRes.status === "fulfilled") setAiHealth(healthRes.value);
      if (llmRes.status === "fulfilled") setLlmStatus(llmRes.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    loadData();

    const socket = getSocket();
    if (socket) {
      socket.on("distress:alert", (data: { stationCode: string; timestamp: string }) => {
        setLiveAlerts((prev) => [
          { station_code: data.stationCode, level: "CRITICAL", score: 100, ts: data.timestamp },
          ...prev,
        ].slice(0, 10));
      });
    }

    const interval = setInterval(loadData, 30_000);
    return () => {
      clearInterval(interval);
      if (socket) socket.off("distress:alert");
    };
  }, [loadData]);

  async function handleAnalyze() {
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysisResult(null);
    try {
      const payload = {
        station_code: form.station_code,
        voting_velocity: parseFloat(form.voting_velocity),
        temporal_deviation: parseFloat(form.temporal_deviation),
        geographic_cluster_score: parseFloat(form.geographic_cluster_score),
        repeat_attempt_rate: parseFloat(form.repeat_attempt_rate),
        distress_correlation: parseFloat(form.distress_correlation),
        recent_distress_count: parseInt(form.recent_distress_count) || 0,
        station_hourly_average: parseFloat(form.station_hourly_average) || undefined,
      };
      const res = await api.post<typeof analysisResult>("/api/ai/analyze-voting-pattern", payload);
      setAnalysisResult(res);
      loadData();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  }

  function setScenario(name: string) {
    const scenarios: Record<string, Partial<AnalysisForm>> = {
      normal:   { voting_velocity: "0.25", temporal_deviation: "0.10", geographic_cluster_score: "0.08", repeat_attempt_rate: "0.02", distress_correlation: "0.01", recent_distress_count: "0" },
      velocity: { voting_velocity: "0.90", temporal_deviation: "0.45", geographic_cluster_score: "0.80", repeat_attempt_rate: "0.05", distress_correlation: "0.03", recent_distress_count: "0" },
      coercion: { voting_velocity: "0.65", temporal_deviation: "0.75", geographic_cluster_score: "0.60", repeat_attempt_rate: "0.15", distress_correlation: "0.82", recent_distress_count: "4" },
    };
    setForm((prev) => ({ ...prev, ...(scenarios[name] ?? {}) }));
    setAnalysisResult(null);
  }

  // Build trend chart data from audit log
  const trendData = auditLog.slice().reverse().map((e, i) => ({
    i,
    score: e.anomaly_score,
    time: new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    station: e.station_code,
  }));

  const alertedEntries = auditLog.filter((e) => e.alert_triggered);
  const avgScore = auditLog.length > 0
    ? (auditLog.reduce((s, e) => s + e.anomaly_score, 0) / auditLog.length).toFixed(1)
    : "—";

  // Per-station risk summary
  const stationRisk = Object.entries(
    auditLog.reduce<Record<string, { max: number; count: number; level: string }>>((acc, e) => {
      if (!acc[e.station_code]) acc[e.station_code] = { max: 0, count: 0, level: "NONE" };
      acc[e.station_code].count++;
      if (e.anomaly_score > acc[e.station_code].max) {
        acc[e.station_code].max = e.anomaly_score;
        acc[e.station_code].level = e.final_alert_level;
      }
      return acc;
    }, {})
  ).sort((a, b) => b[1].max - a[1].max).slice(0, 8);

  return (
    <>
      <Header title="AI Security Dashboard" />
      <div className="p-6 space-y-6">

        {/* Status bar */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">AI Service</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${aiHealth?.status === "ok" ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm font-semibold">{aiHealth?.status === "ok" ? "Online" : "Offline"}</span>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">localhost:8000 — on-premise</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">LLM Engine</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${llmStatus?.model_available ? "bg-green-500" : "bg-yellow-400"}`} />
              <span className="text-sm font-semibold">{llmStatus?.model_available ? "Active" : "Fallback"}</span>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              {llmStatus?.model_available ? llmStatus.configured_model : "template mode"}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Analyses (last 50)</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{auditLog.length}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Alerts Fired</p>
            <p className={`mt-1 text-2xl font-bold ${alertedEntries.length > 0 ? "text-red-600" : "text-gray-900"}`}>
              {alertedEntries.length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Avg Anomaly Score</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{avgScore}</p>
          </div>
        </div>

        {/* LLM status banner */}
        {llmStatus && !llmStatus.model_available && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-medium text-yellow-800">
                  Ollama not running — template explanations active (graceful degradation)
                </p>
                <p className="mt-1 text-yellow-700 text-xs">
                  {llmStatus.gpu_upgrade_path} &nbsp;|&nbsp; All explanations are still fully deterministic and auditable.
                </p>
                <p className="mt-1 text-yellow-600 text-xs font-mono">
                  To enable: install Ollama → <span className="bg-yellow-100 px-1">ollama pull {llmStatus.configured_model}</span> → <span className="bg-yellow-100 px-1">ollama serve</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Live distress alerts */}
        {liveAlerts.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-red-800">Live Distress Alerts</h3>
            <div className="space-y-1">
              {liveAlerts.map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-xs text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono">{a.station_code}</span>
                  <AlertBadge level={a.level} />
                  <span className="text-red-400">{new Date(a.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Manual analysis panel */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">Manual Pattern Analysis</h2>
            <p className="mb-4 text-xs text-gray-500">Test the anomaly detector + LLM explainer against a specific station reading.</p>

            <div className="mb-4 flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 self-center">Scenario:</span>
              {[
                { id: "normal",   label: "Normal",          color: "bg-green-100 text-green-700" },
                { id: "velocity", label: "Ballot Stuffing", color: "bg-orange-100 text-orange-700" },
                { id: "coercion", label: "Coercion Cluster",color: "bg-red-100 text-red-700" },
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

              {analysisError && (
                <p className="rounded bg-red-50 p-2 text-xs text-red-700">{analysisError}</p>
              )}

              <button onClick={handleAnalyze} disabled={analysisLoading}
                className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {analysisLoading ? "Analysing…" : "Run Analysis"}
              </button>
            </div>

            {/* Result with explanation */}
            {analysisResult && (
              <div className={`mt-4 rounded-lg border p-4 space-y-3 ${ALERT_STYLES[analysisResult.alert_level]?.border ?? "border-gray-200"} ${ALERT_STYLES[analysisResult.alert_level]?.bg ?? "bg-gray-50"}`}>
                <div className="flex items-center gap-3">
                  <AlertBadge level={analysisResult.alert_level} />
                  {isMounted && <ScoreBar score={analysisResult.anomaly_score} />}
                  <span className="text-xs text-gray-500">({analysisResult.model_prediction})</span>
                </div>

                {/* LLM / template explanation */}
                <div className="rounded-md bg-white/70 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      IEBC Officer Briefing
                    </span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                      analysisResult.explanation_tier === "llm"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {analysisResult.explanation_tier === "llm"
                        ? `LLM · ${analysisResult.explanation_model}`
                        : "template · on-premise"}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-400">
                      {analysisResult.explanation_latency_ms.toFixed(0)}ms
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${ALERT_STYLES[analysisResult.alert_level]?.text ?? "text-gray-700"}`}>
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

          {/* Right column: model info + per-station risk */}
          <div className="space-y-6">
            {/* Model info */}
            {modelInfo && (
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">Model & Explainability</h2>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Anomaly detector</dt>
                    <dd className="font-medium">Isolation Forest ({modelInfo.meta.n_estimators} trees)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Training samples</dt>
                    <dd className="font-medium">{modelInfo.meta.training_samples.toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">LLM explainer</dt>
                    <dd className={`font-medium ${llmStatus?.model_available ? "text-purple-700" : "text-yellow-700"}`}>
                      {llmStatus?.model_available ? llmStatus.configured_model : "template fallback"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Alert threshold</dt>
                    <dd className="font-medium">{modelInfo.alert_threshold}/100</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Inference</dt>
                    <dd className="font-medium text-green-700">On-premise (localhost:8000)</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">External APIs</dt>
                    <dd className="font-medium text-green-700">None — sovereign</dd>
                  </div>
                </dl>
                <div className="mt-3 rounded bg-green-50 p-2 text-[10px] text-green-700">
                  All decisions + explanations logged to <span className="font-mono">ai-service/logs/audit_YYYY-MM-DD.jsonl</span> (NIRU D2 Auditability)
                </div>
              </div>
            )}

            {/* Per-station risk summary */}
            {stationRisk.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-gray-900">Per-Station Risk Level</h2>
                <div className="space-y-2">
                  {stationRisk.map(([code, info]) => (
                    <div key={code} className="flex items-center gap-3">
                      <span className="w-28 truncate font-mono text-xs text-gray-700">{code}</span>
                      {isMounted && <ScoreBar score={info.max} />}
                      <AlertBadge level={info.level} />
                      <span className="ml-auto text-xs text-gray-400">{info.count} scan{info.count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Anomaly score trend chart */}
        {isMounted && trendData.length > 1 && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Anomaly Score Trend</h2>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-red-400" /> Alert threshold (70)</span>
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-blue-500" /> Score</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded border border-gray-200 bg-white p-2 text-xs shadow">
                        <p className="font-medium">{d.station}</p>
                        <p>Score: <span className="font-mono">{d.score.toFixed(1)}</span></p>
                        <p className="text-gray-400">{d.time}</p>
                      </div>
                    );
                  }}
                />
                {/* Alert threshold reference line rendered as a second line */}
                <Line
                  type="monotone"
                  dataKey={() => 70}
                  stroke="#f87171"
                  strokeDasharray="4 4"
                  dot={false}
                  strokeWidth={1}
                  name="threshold"
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#3b82f6" }}
                  activeDot={{ r: 5 }}
                  name="score"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* LLM alert feed — recent triggered alerts with explanations */}
        {alertedEntries.length > 0 && (
          <div className="rounded-lg border border-orange-200 bg-white">
            <div className="border-b border-orange-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-orange-900">
                LLM Alert Feed — {alertedEntries.length} flagged pattern{alertedEntries.length !== 1 ? "s" : ""}
              </h2>
            </div>
            <div className="divide-y divide-gray-50">
              {alertedEntries.slice(0, 10).map((entry) => (
                <div key={entry.request_id} className="p-4">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-gray-800">{entry.station_code}</span>
                    <AlertBadge level={entry.final_alert_level} />
                    {isMounted && <ScoreBar score={entry.anomaly_score} />}
                    <span className="ml-auto text-xs text-gray-400">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  {entry.explanation && (
                    <div className="rounded bg-gray-50 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Officer Briefing</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                          entry.explanation_tier === "llm"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-gray-200 text-gray-600"
                        }`}>
                          {entry.explanation_tier === "llm"
                            ? `LLM · ${entry.explanation_model}`
                            : "template"}
                        </span>
                        <button
                          onClick={() => setExpandedRow(expandedRow === entry.request_id ? null : entry.request_id)}
                          className="ml-auto text-[10px] text-blue-500 hover:text-blue-700"
                        >
                          {expandedRow === entry.request_id ? "Hide rules" : "Show rules"}
                        </button>
                      </div>
                      <p className="text-xs text-gray-700 leading-relaxed">{entry.explanation}</p>
                      {expandedRow === entry.request_id && entry.triggered_rules.length > 0 && (
                        <div className="mt-2 space-y-0.5 border-t border-gray-200 pt-2">
                          {entry.triggered_rules.map((r) => (
                            <p key={r.rule_id} className="text-[10px] text-gray-500">
                              <span className="font-mono">{r.rule_id}</span> ({r.severity}) — {r.description}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full audit log table */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Full Audit Log</h2>
            <button onClick={loadData} className="text-xs text-blue-600 hover:text-blue-800">Refresh</button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : auditLog.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No decisions yet. Run an analysis or wait for real-time votes.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-4 py-2 font-medium text-gray-500">Time</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Station</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Score</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Level</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Explainer</th>
                    <th className="px-4 py-2 font-medium text-gray-500">Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.request_id}
                      className={`border-b border-gray-50 ${entry.alert_triggered ? "bg-orange-50" : ""}`}>
                      <td className="px-4 py-2 font-mono text-gray-500">
                        {new Date(entry.ts).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2 font-mono font-medium">{entry.station_code}</td>
                      <td className="px-4 py-2">
                        {isMounted && <ScoreBar score={entry.anomaly_score} />}
                      </td>
                      <td className="px-4 py-2"><AlertBadge level={entry.final_alert_level} /></td>
                      <td className="px-4 py-2">
                        <span className={`text-[10px] ${entry.explanation_tier === "llm" ? "text-purple-600" : "text-gray-400"}`}>
                          {entry.explanation_tier === "llm" ? `LLM·${entry.explanation_model}` : "template"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {entry.triggered_rules.length > 0
                          ? entry.triggered_rules.map((r) => r.rule_id).join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
