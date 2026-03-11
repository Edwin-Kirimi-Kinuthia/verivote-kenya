"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

interface CommissionerInfo {
  id: string;
  label: string;
  publicKeyShare: string;
}

interface CeremonyStatus {
  started: boolean;
  ceremonyId?: string;
  startedAt?: string;
  totalBallots?: number;
  partialsReceived?: string[];
  partialsRemaining?: string[];
  finalized?: boolean;
}

interface CandidateTally {
  candidateId: string;
  candidateName: string;
  positionId: string;
  positionTitle: string;
  votes: number;
}

interface HomomorphicResult {
  ceremonyId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalBallotsProcessed: number;
  commissionersWhoParticipated: string[];
  candidates: CandidateTally[];
  finalHash: string;
  sovereigntyNote: string;
}

type Phase = "idle" | "loading" | "started" | "finalizing" | "done" | "error";

const COMMISSIONER_IDS = ["alpha", "beta", "gamma"] as const;
const COMMISSIONER_COLORS = {
  alpha: { bg: "bg-blue-50 border-blue-200",   header: "bg-blue-600",   badge: "bg-blue-100 text-blue-800" },
  beta:  { bg: "bg-purple-50 border-purple-200", header: "bg-purple-600", badge: "bg-purple-100 text-purple-800" },
  gamma: { bg: "bg-green-50 border-green-200",  header: "bg-green-600",  badge: "bg-green-100 text-green-800" },
};

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonPost(path: string) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
  });
}

export default function CeremonyPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [commissioners, setCommissioners] = useState<CommissionerInfo[]>([]);
  const [status, setStatus] = useState<CeremonyStatus>({ started: false });
  const [result, setResult] = useState<HomomorphicResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing ceremony state on mount
  useEffect(() => {
    fetch(`${API}/api/ceremony/status`, { headers: authHeader() }).then(async (r) => {
      if (r.ok) {
        const s: CeremonyStatus = await r.json();
        if (s.started) {
          setStatus(s);
          setPhase(s.finalized ? "done" : "started");
        }
      }
    }).catch(() => {});
    fetch(`${API}/api/ceremony/result`, { headers: authHeader() }).then(async (r) => {
      if (r.ok) {
        const res: HomomorphicResult = await r.json();
        setResult(res);
        setPhase("done");
      }
    }).catch(() => {});
  }, []);

  async function handleStart() {
    setPhase("loading");
    setError(null);
    try {
      const res = await jsonPost("/api/ceremony/start");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start ceremony");
      setCommissioners(data.commissioners ?? []);
      setStatus({
        started: true,
        ceremonyId: data.ceremonyId,
        totalBallots: data.totalBallots,
        partialsReceived: [],
        partialsRemaining: [...COMMISSIONER_IDS],
        finalized: false,
      });
      setPhase("started");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  }

  async function handlePartial(commissionerId: string) {
    try {
      const res = await jsonPost(`/api/ceremony/partial/${commissionerId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit partial");
      setStatus((prev) => ({
        ...prev,
        partialsReceived: data.received,
        partialsRemaining: data.remaining,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleFinalize() {
    setPhase("finalizing");
    try {
      const res = await jsonPost("/api/ceremony/finalize");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Finalization failed");
      setResult(data.result);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("started");
    }
  }

  async function handleReset() {
    await jsonPost("/api/ceremony/reset");
    setPhase("idle");
    setStatus({ started: false });
    setResult(null);
    setError(null);
    setCommissioners([]);
  }

  // Group result candidates by position
  const byPosition = result
    ? result.candidates.reduce<Record<string, CandidateTally[]>>((acc, c) => {
        (acc[c.positionTitle] ??= []).push(c);
        return acc;
      }, {})
    : {};

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Threshold Homomorphic Ceremony</h1>
        <p className="mt-1 text-sm text-gray-500">
          Three IEBC commissioners each provide a partial decryption share.
          No individual vote is decrypted — only the aggregated totals are revealed.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-800">Homomorphic tallying — how it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-blue-700">
          <div className="rounded bg-white border border-blue-200 p-2">
            <p className="font-semibold mb-1">Step 1 — Aggregate</p>
            <p>All per-candidate ciphertexts are multiplied together homomorphically: ∏ E(g<sup>b</sup>ᵢ) = E(g<sup>count</sup>)</p>
          </div>
          <div className="rounded bg-white border border-blue-200 p-2">
            <p className="font-semibold mb-1">Step 2 — Partial decrypt</p>
            <p>Each commissioner computes D<sub>i</sub> = agg_c1<sup>xᵢ</sup> mod p using their key share</p>
          </div>
          <div className="rounded bg-white border border-blue-200 p-2">
            <p className="font-semibold mb-1">Step 3 — Combine + BSGS</p>
            <p>D = D₁·D₂·D₃ reveals g<sup>count</sup>. Baby-step Giant-step solves the discrete log to get count.</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Idle — start button */}
      {(phase === "idle" || phase === "error") && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <p className="mb-4 text-sm text-gray-500">
            Ready to run the homomorphic counting ceremony. All confirmed votes with
            per-candidate encoding will be aggregated.
          </p>
          <button
            onClick={handleStart}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Start Ceremony
          </button>
        </div>
      )}

      {/* Loading */}
      {phase === "loading" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <div className="h-2 w-2 inline-block animate-ping rounded-full bg-blue-500 mr-2" />
          <span className="text-sm text-gray-500">Aggregating ballots…</span>
        </div>
      )}

      {/* Commissioner cards */}
      {(phase === "started" || phase === "finalizing") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Ceremony: <span className="font-mono text-xs text-gray-500">{status.ceremonyId?.slice(0, 12)}…</span>
              </p>
              <p className="text-xs text-gray-500">{status.totalBallots} ballots aggregated</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              status.partialsRemaining?.length === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}>
              {status.partialsReceived?.length ?? 0} / 3 shares received
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {COMMISSIONER_IDS.map((id) => {
              const info = commissioners.find((c) => c.id === id);
              const received = status.partialsReceived?.includes(id) ?? false;
              const colors = COMMISSIONER_COLORS[id];
              return (
                <div key={id} className={`rounded-lg border ${colors.bg} overflow-hidden`}>
                  <div className={`${colors.header} text-white text-xs font-semibold px-3 py-2 flex justify-between items-center`}>
                    <span>Commissioner {id.charAt(0).toUpperCase() + id.slice(1)}</span>
                    {received && <span>✓</span>}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-xs text-gray-600">{info?.label ?? `IEBC Commissioner ${id}`}</p>
                    {info?.publicKeyShare && (
                      <p className="font-mono text-xs text-gray-500 truncate">
                        g^x<sub>{id[0]}</sub>: {info.publicKeyShare}
                      </p>
                    )}
                    {received ? (
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                        Partial submitted ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => handlePartial(id)}
                        className={`w-full rounded text-xs font-semibold px-3 py-1.5 text-white ${colors.header} hover:opacity-90 transition-opacity`}
                      >
                        Provide Partial Decryption
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {status.partialsRemaining?.length === 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center justify-between">
              <p className="text-sm text-green-700 font-medium">
                All 3 partial decryptions received. Ready to finalize.
              </p>
              <button
                onClick={handleFinalize}
                disabled={phase === "finalizing"}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {phase === "finalizing" ? "Computing…" : "Finalize & Tally"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {phase === "done" && result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Ballots processed", value: result.totalBallotsProcessed.toString() },
              { label: "Positions tallied", value: Object.keys(byPosition).length.toString() },
              { label: "Duration", value: `${result.durationMs}ms` },
              { label: "Commissioners", value: result.commissionersWhoParticipated.length.toString() },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                <p className="text-xs text-gray-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Per-position results */}
          {Object.entries(byPosition).map(([position, candidates]) => {
            const total = candidates.reduce((s, c) => s + c.votes, 0);
            const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
            const winner = sorted[0];
            return (
              <div key={position} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
                  <span className="font-semibold">{position}</span>
                  <span className="text-xs text-gray-400">{total} total votes</span>
                </div>
                <div className="p-4 space-y-3">
                  {sorted.map((c, i) => {
                    const pct = total > 0 ? Math.round((c.votes / total) * 100) : 0;
                    return (
                      <div key={c.candidateId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className={`font-medium ${i === 0 ? "text-green-700" : "text-gray-700"}`}>
                            {c.candidateName} {i === 0 && "🏆"}
                          </span>
                          <span className="text-gray-500">{c.votes} votes ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${i === 0 ? "bg-green-500" : "bg-blue-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-green-50 border-t border-green-200 px-4 py-2 text-xs text-green-700">
                  Winner: <strong>{winner?.candidateName}</strong> with {winner?.votes} votes
                </div>
              </div>
            );
          })}

          {/* Cryptographic proof */}
          <div className="rounded-lg border border-gray-900 bg-gray-900 p-4 text-white">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Ceremony Hash — SHA-256 of ceremony ID + per-candidate counts
            </p>
            <p className="font-mono text-sm text-green-400 break-all">{result.finalHash}</p>
            <p className="mt-2 text-xs text-gray-400">
              {result.ceremonyId} · {new Date(result.completedAt).toLocaleString()}
            </p>
          </div>

          {/* Sovereignty */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
            ✓ {result.sovereigntyNote}
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Reset & Run Again
          </button>
        </div>
      )}
    </div>
  );
}
