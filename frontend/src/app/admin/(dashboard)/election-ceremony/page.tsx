"use client";

import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface MixnetSummary {
  ceremonyId: string;
  inputVoteCount: number;
  outputVoteCount: number;
  finalCommitment: string;
  durationMs: number;
  nodes: MixNodeProof[];
  productionNote: string;
}

interface CandidateTally {
  candidateId: string;
  candidateName: string;
  positionId: string;
  positionTitle: string;
  votes: number;
}

interface TallyResult {
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

interface ElectionCeremonyResult {
  ceremonySummaryId: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  mixnet: MixnetSummary;
  tally: TallyResult;
  integrityHash: string;
  sovereigntyNote: string;
}

type Phase = "idle" | "running" | "done" | "error";
type ActiveTab = "results" | "mixnet" | "tally";

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pct(votes: number, total: number) {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Re-encryption Mixnet", desc: "Anonymising vote order" },
  { label: "Homomorphic Tally",    desc: "Counting without decrypting" },
  { label: "Results Ready",        desc: "Ceremony complete" },
];

function StepIndicator({ active }: { active: number }) {
  return (
    <ol className="flex items-center gap-0 w-full">
      {STEPS.map((s, i) => {
        const done    = i < active;
        const current = i === active;
        return (
          <li key={s.label} className="flex-1 flex flex-col items-center relative">
            {i < STEPS.length - 1 && (
              <div className={`absolute top-4 left-1/2 w-full h-0.5 ${done ? "bg-green-500" : "bg-gray-200"}`} />
            )}
            <div className={`z-10 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
              done    ? "bg-green-500 border-green-500 text-white" :
              current ? "bg-indigo-600 border-indigo-600 text-white" :
                        "bg-white border-gray-300 text-gray-400"
            }`}>
              {done ? "✓" : i + 1}
            </div>
            <p className={`mt-2 text-xs font-semibold text-center ${current ? "text-indigo-700" : done ? "text-green-700" : "text-gray-400"}`}>
              {s.label}
            </p>
            <p className="text-[10px] text-gray-400 text-center">{s.desc}</p>
          </li>
        );
      })}
    </ol>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface ElectionOption {
  id: string;
  name: string;
  status: string;
  type: string;
}

const TYPE_LABELS: Record<string, string> = {
  GOVERNMENT:    "Government",
  INSTITUTIONAL: "Institutional",
  CORPORATE:     "Corporate",
  CUSTOM:        "Custom",
};

export default function ElectionCeremonyPage() {
  const [phase, setPhase]   = useState<Phase>("idle");
  const [result, setResult] = useState<ElectionCeremonyResult | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [step, setStep]     = useState(0);           // 0=mixnet, 1=tally, 2=done
  const [tab, setTab]       = useState<ActiveTab>("results");

  // Election selection
  const [elections, setElections]               = useState<ElectionOption[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<string>("");
  const [electionsLoading, setElectionsLoading] = useState(true);

  // Load elections (CLOSED only — cannot tally an active election) and last result
  useEffect(() => {
    fetch(`${API}/api/elections?limit=100`, { headers: authHeader() })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const items: ElectionOption[] = (data.data?.items ?? []).filter(
            (e: ElectionOption) => e.status === "CLOSED"
          );
          setElections(items);
          if (items.length === 1) setSelectedElectionId(items[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setElectionsLoading(false));

    fetch(`${API}/api/election/result`, { headers: authHeader() })
      .then(async (r) => {
        if (r.ok) {
          setResult(await r.json());
          setPhase("done");
          setStep(2);
        }
      })
      .catch(() => {});
  }, []);

  async function handleRun() {
    if (!selectedElectionId) {
      setError("Please select an election before running the ceremony.");
      return;
    }
    setPhase("running");
    setError(null);
    setResult(null);
    setStep(0);

    // Animate steps while the ceremony runs
    const stepTimer = setTimeout(() => setStep(1), 1200);

    try {
      const res  = await fetch(`${API}/api/election/ceremony`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ electionId: selectedElectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ceremony failed");

      clearTimeout(stepTimer);
      setStep(2);
      setResult(data.result);
      setPhase("done");
      setTab("results");
    } catch (e) {
      clearTimeout(stepTimer);
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
      setStep(0);
    }
  }

  // Group candidates by position
  const byPosition = result
    ? result.tally.candidates.reduce<Record<string, CandidateTally[]>>((acc, c) => {
        (acc[c.positionTitle] ??= []).push(c);
        return acc;
      }, {})
    : {};

  const nodeColors = [
    { bg: "bg-blue-50 border-blue-300",   header: "bg-blue-600" },
    { bg: "bg-purple-50 border-purple-300", header: "bg-purple-600" },
    { bg: "bg-green-50 border-green-300",  header: "bg-green-600" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Election Ceremony</h1>
        <p className="mt-1 text-sm text-gray-500">
          One-click ceremony: re-encryption mixnet → threshold homomorphic tally → results.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-indigo-700">
        <div>
          <p className="font-semibold mb-1">Phase 1 — Re-encryption Mixnet</p>
          <p>Each vote is re-encrypted with fresh randomness across 3 independent mix nodes and then shuffled, cryptographically breaking the link between voters and their ballots.</p>
          <p className="mt-1 font-mono">c1&apos; = c1·g<sup>r</sup>  c2&apos; = c2·h<sup>r</sup></p>
        </div>
        <div>
          <p className="font-semibold mb-1">Phase 2 — Threshold Homomorphic Tally</p>
          <p>Per-candidate ciphertexts are multiplied homomorphically, then 3 commissioner shares combine to reveal only the aggregated counts — no individual vote is ever decrypted.</p>
          <p className="mt-1 font-mono">D = D₁·D₂·D₃  →  BSGS  →  count</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Election selector */}
      {(phase === "idle" || phase === "error") && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Election to Tally <span className="text-red-500">*</span>
          </label>
          {electionsLoading ? (
            <p className="text-sm text-gray-400">Loading elections…</p>
          ) : elections.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No elections are currently CLOSED. Close an election before running the ceremony.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {elections.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedElectionId(e.id)}
                  className={`rounded-lg border px-4 py-2.5 text-left transition-all ${
                    selectedElectionId === e.id
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300"
                      : "border-gray-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">{e.name}</p>
                  <span className="text-xs text-gray-500">{TYPE_LABELS[e.type] ?? e.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Idle */}
      {(phase === "idle" || phase === "error") && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
            <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Ready to run the election ceremony</p>
          <p className="mb-6 text-xs text-gray-500">
            Confirmed votes for the selected election will be anonymised then tallied. No individual vote is decrypted.
          </p>
          <button
            onClick={handleRun}
            disabled={!selectedElectionId || elections.length === 0}
            className="rounded-md bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Run Election Ceremony
          </button>
        </div>
      )}

      {/* Running */}
      {phase === "running" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-indigo-200 bg-white p-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              <span className="text-sm font-semibold text-indigo-700">Ceremony in progress…</span>
            </div>
            <StepIndicator active={step} />
          </div>
          <p className="text-center text-xs text-gray-400">
            This may take a few seconds — 2048-bit ElGamal operations are CPU-intensive.
          </p>
        </div>
      )}

      {/* Done */}
      {phase === "done" && result && (
        <div className="space-y-6">

          {/* Step completion */}
          <div className="rounded-lg border border-green-200 bg-white p-6">
            <StepIndicator active={3} />
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Votes processed",  value: result.tally.totalBallotsProcessed.toString() },
              { label: "Positions tallied", value: Object.keys(byPosition).length.toString() },
              { label: "Total duration",   value: `${result.totalDurationMs}ms` },
              { label: "Mix nodes",        value: result.mixnet.nodes.length.toString() },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                <p className="text-xs text-gray-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              {(["results", "mixnet", "tally"] as ActiveTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`pb-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
                    tab === t
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t === "results" ? "Election Results" : t === "mixnet" ? "Mixnet Proofs" : "Tally Proofs"}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab: Election Results */}
          {tab === "results" && (
            <div className="space-y-4">
              {Object.entries(byPosition).map(([position, candidates]) => {
                const total  = candidates.reduce((s, c) => s + c.votes, 0);
                const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
                const winner = sorted[0];
                return (
                  <div key={position} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                    <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
                      <span className="font-semibold">{position}</span>
                      <span className="text-xs text-gray-400">{total} total votes</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {sorted.map((c, i) => (
                        <div key={c.candidateId}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className={`font-medium ${i === 0 ? "text-green-700" : "text-gray-700"}`}>
                              {c.candidateName} {i === 0 && "🏆"}
                            </span>
                            <span className="text-gray-500">{c.votes} votes ({pct(c.votes, total)}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${i === 0 ? "bg-green-500" : "bg-blue-400"}`}
                              style={{ width: `${pct(c.votes, total)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-green-50 border-t border-green-200 px-4 py-2 text-xs text-green-700">
                      Winner: <strong>{winner?.candidateName}</strong> with {winner?.votes} votes
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab: Mixnet Proofs */}
          {tab === "mixnet" && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${
                result.mixnet.inputVoteCount === result.mixnet.outputVoteCount
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}>
                <span className="text-lg">
                  {result.mixnet.inputVoteCount === result.mixnet.outputVoteCount ? "✓" : "✗"}
                </span>
                <p className="text-sm font-medium text-gray-800">
                  Count integrity: {result.mixnet.inputVoteCount} votes in → {result.mixnet.outputVoteCount} votes out
                  {result.mixnet.inputVoteCount === result.mixnet.outputVoteCount
                    ? " — no votes added or removed"
                    : " — DISCREPANCY DETECTED"}
                </p>
              </div>

              {result.mixnet.nodes.map((node, i) => (
                <div key={node.nodeId} className={`rounded-lg border ${nodeColors[i].bg} overflow-hidden`}>
                  <div className={`px-4 py-2 ${nodeColors[i].header} text-white text-sm font-semibold flex justify-between`}>
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

              <div className="rounded-lg border border-gray-900 bg-gray-900 p-4 text-white">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Mixnet Final Commitment — SHA-256 of all node proof hashes
                </p>
                <p className="font-mono text-sm text-green-400 break-all">{result.mixnet.finalCommitment}</p>
                <p className="mt-2 text-xs text-gray-400">
                  Ceremony: <span className="text-gray-300">{result.mixnet.ceremonyId}</span>
                  &nbsp;·&nbsp; Duration: <span className="text-gray-300">{result.mixnet.durationMs}ms</span>
                </p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <p className="font-semibold mb-1">Production note</p>
                <p>{result.mixnet.productionNote}</p>
              </div>
            </div>
          )}

          {/* Tab: Tally Proofs */}
          {tab === "tally" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {result.tally.commissionersWhoParticipated.map((id) => (
                  <div key={id} className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                    <p className="text-xs font-semibold text-green-800 capitalize">Commissioner {id}</p>
                    <p className="text-xs text-green-600 mt-0.5">Partial submitted ✓</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2 text-xs font-mono">
                <div>
                  <span className="text-gray-500">Ceremony ID     </span>
                  <span className="text-gray-900 break-all">{result.tally.ceremonyId}</span>
                </div>
                <div>
                  <span className="text-gray-500">Ballots tallied </span>
                  <span className="text-gray-900">{result.tally.totalBallotsProcessed}</span>
                </div>
                <div>
                  <span className="text-gray-500">Duration        </span>
                  <span className="text-gray-900">{result.tally.durationMs}ms (BSGS)</span>
                </div>
              </div>

              <div className="rounded-lg border border-gray-900 bg-gray-900 p-4 text-white">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Tally Hash — SHA-256(ceremonyId | candidateId:votes…)
                </p>
                <p className="font-mono text-sm text-green-400 break-all">{result.tally.finalHash}</p>
                <p className="mt-2 text-xs text-gray-400">
                  {new Date(result.tally.completedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Integrity hash */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wider mb-2">
              Ceremony Integrity Hash — SHA-256(mixnet commitment | tally hash)
            </p>
            <p className="font-mono text-xs text-indigo-900 break-all">{result.integrityHash}</p>
            <p className="mt-1 text-xs text-indigo-600">
              Ties both phases together into a single tamper-evident fingerprint.
            </p>
          </div>

          {/* Sovereignty */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
            ✓ {result.sovereigntyNote}
          </div>

          {/* Re-run */}
          <button
            onClick={() => { setPhase("idle"); setResult(null); setStep(0); setError(null); }}
            className="rounded-md bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Run Another Election
          </button>
        </div>
      )}
    </div>
  );
}
