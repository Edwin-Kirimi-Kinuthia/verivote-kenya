"use client";

import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

interface MixNodeProof {
  nodeId: string;
  nodeLabel: string;
  inputCount: number;
  inputCommitment: string;
  outputCount: number;
  outputCommitment: string;
  proofHash: string;
  durationMs: number;
}

interface MixnetStatus {
  ceremonyId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  inputVoteCount: number;
  outputVoteCount: number;
  nodes: MixNodeProof[];
  finalCommitment: string;
  logLines?: number;
  log?: string[];
  sovereigntyNote: string;
  productionNote: string;
}

type Phase = "idle" | "running" | "done" | "error";

function authHeader(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function MixnetPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<MixnetStatus | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [visibleLog, setVisibleLog] = useState<string[]>([]);
  const [logIdx, setLogIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Load existing status on mount
  useEffect(() => {
    fetch(`${API}/api/mixnet/status`, { headers: authHeader() }).then(async (r) => {
      if (r.ok) {
        const data: MixnetStatus = await r.json();
        setStatus(data);
        setPhase("done");
      }
    }).catch(() => {});
  }, []);

  // Animate log lines
  useEffect(() => {
    if (phase !== "running" || logIdx >= log.length) return;
    const t = setTimeout(() => {
      setVisibleLog((prev) => [...prev, log[logIdx]]);
      setLogIdx((i) => i + 1);
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 25);
    return () => clearTimeout(t);
  }, [phase, log, logIdx]);

  async function handleRun() {
    setPhase("running");
    setError(null);
    setVisibleLog([]);
    setLog([]);
    setLogIdx(0);

    try {
      const res = await fetch(`${API}/api/mixnet/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Ceremony failed");

      // Fetch log
      const logRes = await fetch(`${API}/api/mixnet/log`, { headers: authHeader() });
      if (logRes.ok) {
        const logData = await logRes.json();
        setLog(logData.log ?? []);
      }

      setStatus(data.result);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  }

  const nodeColors = [
    "bg-blue-50 border-blue-300",
    "bg-purple-50 border-purple-300",
    "bg-green-50 border-green-300",
  ];
  const nodeHeaderColors = ["bg-blue-600", "bg-purple-600", "bg-green-600"];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Re-encryption Mixnet
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Cryptographically breaks the link between voters and their votes before decryption.
          Uses real ElGamal re-encryption — not a simulation.
        </p>
      </div>

      {/* Principle card */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-sm font-semibold text-indigo-800 mb-1">How it works</p>
        <p className="text-sm text-indigo-700 font-mono">
          c1&apos; = c1 · g<sup>r</sup> mod p &nbsp;|&nbsp; c2&apos; = c2 · h<sup>r</sup> mod p
        </p>
        <p className="mt-2 text-sm text-indigo-700">
          Each mix node re-encrypts every vote with fresh random <span className="font-mono">r</span>,
          then randomly shuffles the batch. Result: completely different ciphertexts, same plaintexts,
          same IEBC private key decrypts them — but no one can link input position to output position.
        </p>
      </div>

      {/* Trigger */}
      {phase === "idle" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5m0 0v5m0-5l-6 6M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-1" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 21h5m0 0v-5m0 5l-6-6" />
            </svg>
          </div>
          <p className="mb-4 text-gray-500 text-sm">No mixnet run yet. Trigger the ceremony to anonymize vote order.</p>
          <button
            onClick={handleRun}
            className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Run Mixnet Ceremony
          </button>
        </div>
      )}

      {/* Running — animated log */}
      {phase === "running" && (
        <div className="rounded-lg border border-indigo-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            <span className="text-sm font-semibold text-indigo-700">Ceremony in progress…</span>
          </div>
          <div
            ref={logRef}
            className="h-64 overflow-y-auto rounded bg-slate-900 p-3 font-mono text-xs text-green-300"
          >
            {visibleLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div className="animate-pulse">_</div>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Ceremony failed</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
          <button
            onClick={handleRun}
            className="mt-3 rounded bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Done — results */}
      {phase === "done" && status && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Votes In", value: status.inputVoteCount.toString() },
              { label: "Votes Out", value: status.outputVoteCount.toString() },
              { label: "Mix Nodes", value: status.nodes.length.toString() },
              { label: "Duration", value: `${status.durationMs}ms` },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                <p className="text-xs text-gray-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Count integrity check */}
          <div className={`flex items-center gap-3 rounded-lg border p-3 ${
            status.inputVoteCount === status.outputVoteCount
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}>
            <span className="text-lg">
              {status.inputVoteCount === status.outputVoteCount ? "✓" : "✗"}
            </span>
            <p className="text-sm font-medium text-gray-800">
              Count integrity: {status.inputVoteCount} votes in → {status.outputVoteCount} votes out
              {status.inputVoteCount === status.outputVoteCount
                ? " — no votes added or removed"
                : " — DISCREPANCY DETECTED"}
            </p>
          </div>

          {/* Per-node proofs */}
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Per-Node Cryptographic Proofs</h2>
            <div className="space-y-4">
              {status.nodes.map((node, i) => (
                <div key={node.nodeId} className={`rounded-lg border ${nodeColors[i]} overflow-hidden`}>
                  <div className={`px-4 py-2 ${nodeHeaderColors[i]} text-white text-sm font-semibold flex justify-between`}>
                    <span>{node.nodeLabel}</span>
                    <span className="opacity-75">{node.durationMs}ms</span>
                  </div>
                  <div className="p-4 space-y-2 font-mono text-xs">
                    <div>
                      <span className="text-gray-500">Input commitment  </span>
                      <span className="text-gray-900 break-all">{node.inputCommitment}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Output commitment </span>
                      <span className="text-gray-900 break-all">{node.outputCommitment}</span>
                    </div>
                    <div className="pt-1 border-t border-gray-200">
                      <span className="text-gray-500">Proof hash        </span>
                      <span className="font-bold text-gray-900 break-all">{node.proofHash}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Final commitment */}
          <div className="rounded-lg border border-gray-900 bg-gray-900 p-4 text-white">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Final Ceremony Commitment — SHA-256 of all node proof hashes
            </p>
            <p className="font-mono text-sm text-green-400 break-all">{status.finalCommitment}</p>
            <p className="mt-3 text-xs text-gray-400">
              Ceremony ID: <span className="text-gray-300">{status.ceremonyId}</span>
              &nbsp;|&nbsp; Completed: <span className="text-gray-300">{new Date(status.completedAt).toLocaleString()}</span>
            </p>
          </div>

          {/* Production note */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">Production deployment note</p>
            <p className="text-sm text-amber-700">{status.productionNote}</p>
          </div>

          {/* Log + re-run */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleRun}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Re-run Ceremony
            </button>
            <button
              onClick={() => setShowLog((s) => !s)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {showLog ? "Hide" : "Show"} Full Log
            </button>
            <a
              href="/mixnet"
              target="_blank"
              className="rounded-md border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Public Proof Explorer →
            </a>
          </div>

          {showLog && (
            <div className="rounded-lg bg-slate-900 p-4 font-mono text-xs text-green-300 overflow-y-auto max-h-96">
              {(status.log ?? log).map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
