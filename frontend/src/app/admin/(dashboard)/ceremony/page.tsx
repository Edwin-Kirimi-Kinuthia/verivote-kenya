"use client";

import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ElectionOption {
  id: string;
  name: string;
  status: string;
  type: string;
}

interface CommissionerInfo {
  id: string;
  label: string;
  shareIndex: number;
  shareHex: string;   // actual SSS share (shown to admin for distribution)
  commitment: string; // g^share truncated — public verification hint
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

// ── Constants ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "loading" | "distributing" | "entering" | "finalizing" | "done" | "error";

const COMMISSIONER_IDS = ["alpha", "beta", "gamma"] as const;
type CommissionerId = typeof COMMISSIONER_IDS[number];

const COMMISSIONER_COLORS: Record<CommissionerId, {
  bg: string; border: string; header: string; badge: string; ring: string;
}> = {
  alpha: {
    bg: "bg-blue-50",    border: "border-blue-300",   header: "bg-blue-700",
    badge: "bg-blue-100 text-blue-800", ring: "ring-blue-400",
  },
  beta: {
    bg: "bg-purple-50",  border: "border-purple-300", header: "bg-purple-700",
    badge: "bg-purple-100 text-purple-800", ring: "ring-purple-400",
  },
  gamma: {
    bg: "bg-emerald-50", border: "border-emerald-300", header: "bg-emerald-700",
    badge: "bg-emerald-100 text-emerald-800", ring: "ring-emerald-400",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonPost(path: string, body?: Record<string, unknown>) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Truncate a hex string for display: first 24 + … + last 8 chars */
function truncateHex(hex: string): string {
  if (hex.length <= 36) return hex;
  return hex.slice(0, 24) + "…" + hex.slice(-8);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CeremonyPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [commissioners, setCommissioners] = useState<CommissionerInfo[]>([]);
  const [status, setStatus] = useState<CeremonyStatus>({ started: false });
  const [result, setResult] = useState<HomomorphicResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-commissioner share input values and submission errors
  const [shareInputs, setShareInputs] = useState<Partial<Record<CommissionerId, string>>>({});
  const [shareErrors, setShareErrors] = useState<Partial<Record<CommissionerId, string>>>({});
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Election selection
  const [elections, setElections] = useState<ElectionOption[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<string>("");

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing ceremony state on mount (page refresh recovery)
  useEffect(() => {
    fetch(`${API}/api/ceremony/status`, { headers: authHeader() }).then(async (r) => {
      if (r.ok) {
        const s: CeremonyStatus = await r.json();
        if (s.started) {
          setStatus(s);
          setPhase(s.finalized ? "done" : "entering");
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

    // Load elections available for tallying (CLOSED or ACTIVE)
    fetch(`${API}/api/elections?limit=100`, { headers: authHeader() }).then(async (r) => {
      if (r.ok) {
        const data = await r.json();
        const items: ElectionOption[] = (data.data?.items ?? []).filter(
          (e: ElectionOption) => e.status === "CLOSED"
        );
        setElections(items);
        if (items.length === 1) setSelectedElectionId(items[0].id);
      }
    }).catch(() => {});
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleStart() {
    setPhase("loading");
    setError(null);
    setShareInputs({});
    setShareErrors({});
    try {
      const body = selectedElectionId ? { electionId: selectedElectionId } : undefined;
      const res = await jsonPost("/api/ceremony/start", body);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start ceremony");
      setCommissioners(data.commissioners ?? []);
      setStatus({
        started: true,
        ceremonyId:        data.ceremonyId,
        totalBallots:      data.totalBallots,
        partialsReceived:  [],
        partialsRemaining: [...COMMISSIONER_IDS],
        finalized:         false,
      });
      setPhase("distributing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  }

  async function handleSubmitShare(commissionerId: CommissionerId) {
    const shareHex = (shareInputs[commissionerId] ?? "").trim();
    if (!shareHex) {
      setShareErrors((prev) => ({ ...prev, [commissionerId]: "Please enter your key share." }));
      return;
    }
    setShareErrors((prev) => ({ ...prev, [commissionerId]: undefined }));
    try {
      const res = await jsonPost(`/api/ceremony/partial/${commissionerId}`, { share: shareHex });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Share submission failed");
      setStatus((prev) => ({
        ...prev,
        partialsReceived:  data.received,
        partialsRemaining: data.remaining,
      }));
    } catch (e) {
      setShareErrors((prev) => ({
        ...prev,
        [commissionerId]: e instanceof Error ? e.message : "Unknown error",
      }));
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
      setPhase("entering");
    }
  }

  async function handleReset() {
    await jsonPost("/api/ceremony/reset");
    setPhase("idle");
    setStatus({ started: false });
    setResult(null);
    setError(null);
    setCommissioners([]);
    setShareInputs({});
    setShareErrors({});
  }

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopyFeedback(`${label} copied!`);
      copyTimerRef.current = setTimeout(() => setCopyFeedback(null), 2000);
    });
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const byPosition = result
    ? result.candidates.reduce<Record<string, CandidateTally[]>>((acc, c) => {
        (acc[c.positionTitle] ??= []).push(c);
        return acc;
      }, {})
    : {};

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Threshold Homomorphic Ceremony</h1>
        <p className="mt-1 text-sm text-gray-500">
          The decryption key is split into three shares using Shamir&apos;s Secret Sharing.
          All three IEBC commissioners must contribute their share before results can be revealed.
        </p>
      </div>

      {/* ── How it works ── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-800">How key splitting works</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs text-blue-700">
          {[
            { step: "1", title: "Split key (SSS)", body: "f(t) = x + a₁t + a₂t² over Z_p. Three shares (i, f(i)) generated — none reveals x alone." },
            { step: "2", title: "Distribute shares", body: "Each commissioner receives exactly one share. Physical custody — system never stores them after display." },
            { step: "3", title: "Submit & reconstruct", body: "All 3 shares entered → Lagrange interpolation recovers x = f(0). Zero shares = no key." },
            { step: "4", title: "Homomorphic tally", body: "x decrypts only the aggregate ciphertexts. Individual votes remain encrypted throughout." },
          ].map(({ step, title, body }) => (
            <div key={step} className="rounded bg-white border border-blue-200 p-2">
              <p className="font-semibold mb-1">Step {step} — {title}</p>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Copy feedback toast ── */}
      {copyFeedback && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 text-white text-sm px-4 py-2 shadow-lg">
          {copyFeedback}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE: idle / error  — start button
      ══════════════════════════════════════════════════════════════════════ */}
      {(phase === "idle" || phase === "error") && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-3xl">
              🔐
            </div>
            <p className="font-semibold text-gray-800">Ready to begin the decryption ceremony</p>
            <p className="text-sm text-gray-500">
              Select an election and click Start to aggregate confirmed ballots and generate the three commissioner key shares.
            </p>
          </div>

          {/* Election selector */}
          <div className="max-w-sm mx-auto">
            <label className="block text-sm font-medium text-gray-700 mb-1">Election to tally</label>
            {elections.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                No elections in CLOSED or ACTIVE status.
                Use the legacy mode (all confirmed ballots) by leaving this empty.
              </div>
            ) : (
              <select
                value={selectedElectionId}
                onChange={(e) => setSelectedElectionId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Legacy mode (all confirmed ballots) —</option>
                {elections.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} [{e.status}]
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="text-center">
            <button
              onClick={handleStart}
              className="rounded-md bg-blue-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start Ceremony
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE: loading
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === "loading" && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="h-2 w-2 animate-ping rounded-full bg-blue-500" />
            Aggregating ballots and generating key shares…
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE: distributing — show commissioner share cards
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === "distributing" && (
        <div className="space-y-5">
          {/* Ceremony info */}
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {status.totalBallots} ballot{status.totalBallots !== 1 ? "s" : ""} aggregated — key split into 3 shares
              </p>
              <p className="text-xs text-amber-700 font-mono mt-0.5">{status.ceremonyId?.slice(0, 16)}…</p>
            </div>
            <span className="text-2xl">🔑</span>
          </div>

          {/* Instruction */}
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>Important:</strong> Hand each share to the corresponding commissioner now.
            These share codes will not be shown again after you proceed.
            Each commissioner must keep their share private until the ceremony begins.
          </div>

          {/* Share cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {commissioners.map((comm) => {
              const id = comm.id as CommissionerId;
              const colors = COMMISSIONER_COLORS[id];
              return (
                <div key={id} className={`rounded-xl border-2 ${colors.border} ${colors.bg} overflow-hidden`}>
                  {/* Card header */}
                  <div className={`${colors.header} text-white px-4 py-3`}>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-75">Key Share {comm.shareIndex}</p>
                    <p className="font-semibold text-sm mt-0.5">Commissioner {id.charAt(0).toUpperCase() + id.slice(1)}</p>
                  </div>
                  {/* Share body */}
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-gray-500">{comm.label}</p>

                    {/* Share hex */}
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">SECRET SHARE (hex)</p>
                      <div className="rounded-md bg-white border border-gray-200 px-3 py-2 font-mono text-xs text-gray-800 break-all select-all leading-relaxed">
                        {comm.shareHex}
                      </div>
                    </div>

                    {/* Commitment */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">PUBLIC COMMITMENT g^share</p>
                      <p className="font-mono text-xs text-gray-400 truncate">{comm.commitment}</p>
                    </div>

                    {/* Copy button */}
                    <button
                      onClick={() => handleCopy(comm.shareHex, `Share ${comm.shareIndex}`)}
                      className={`w-full text-xs font-semibold rounded-md px-3 py-2 text-white ${colors.header} hover:opacity-90 transition-opacity`}
                    >
                      Copy Share to Clipboard
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Proceed button */}
          <div className="flex justify-end">
            <button
              onClick={() => setPhase("entering")}
              className="rounded-md bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Shares Distributed — Begin Submission →
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE: entering — commissioners type in their shares
      ══════════════════════════════════════════════════════════════════════ */}
      {(phase === "entering" || phase === "finalizing") && (
        <div className="space-y-5">
          {/* Progress bar */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Ceremony: <span className="font-mono text-xs text-gray-500">{status.ceremonyId?.slice(0, 16)}…</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{status.totalBallots} ballots aggregated</p>
            </div>
            <div className="flex items-center gap-2">
              {COMMISSIONER_IDS.map((id) => {
                const verified = status.partialsReceived?.includes(id);
                const colors = COMMISSIONER_COLORS[id];
                return (
                  <div
                    key={id}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      verified ? `${colors.header} text-white ring-2 ring-offset-1 ${colors.ring}` : "bg-gray-100 text-gray-400"
                    }`}
                    title={`Commissioner ${id}: ${verified ? "verified" : "pending"}`}
                  >
                    {verified ? "✓" : id[0].toUpperCase()}
                  </div>
                );
              })}
              <span className={`ml-2 text-xs font-semibold px-2 py-1 rounded-full ${
                status.partialsRemaining?.length === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}>
                {status.partialsReceived?.length ?? 0} / 3 verified
              </span>
            </div>
          </div>

          {/* Commissioner input cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {COMMISSIONER_IDS.map((id) => {
              const info = commissioners.find((c) => c.id === id);
              const verified = status.partialsReceived?.includes(id) ?? false;
              const colors = COMMISSIONER_COLORS[id];
              const inputErr = shareErrors[id];

              return (
                <div key={id} className={`rounded-xl border-2 ${verified ? colors.border : "border-gray-200"} overflow-hidden transition-all`}>
                  {/* Card header */}
                  <div className={`px-4 py-3 flex items-center justify-between ${verified ? colors.header : "bg-gray-700"} text-white`}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider opacity-75">Commissioner</p>
                      <p className="font-semibold text-sm">{id.charAt(0).toUpperCase() + id.slice(1)}</p>
                    </div>
                    {verified && (
                      <span className="text-xl" title="Share verified">✓</span>
                    )}
                  </div>

                  <div className={`p-4 space-y-3 ${verified ? colors.bg : "bg-white"}`}>
                    <p className="text-xs text-gray-500">{info?.label ?? `IEBC Commissioner ${id}`}</p>

                    {verified ? (
                      <div className={`text-center py-3 rounded-lg ${colors.badge} font-semibold text-sm`}>
                        Key share verified ✓
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">
                            Enter your secret key share:
                          </label>
                          <textarea
                            rows={4}
                            className={`w-full rounded-md border px-3 py-2 font-mono text-xs text-gray-800 resize-none focus:outline-none focus:ring-2 ${
                              inputErr ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-blue-300"
                            }`}
                            placeholder="Paste your hex share here…"
                            value={shareInputs[id] ?? ""}
                            onChange={(e) => {
                              setShareInputs((prev) => ({ ...prev, [id]: e.target.value }));
                              if (shareErrors[id]) setShareErrors((prev) => ({ ...prev, [id]: undefined }));
                            }}
                          />
                          {inputErr && (
                            <p className="mt-1 text-xs text-red-600">{inputErr}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleSubmitShare(id)}
                          className={`w-full rounded-md text-sm font-semibold px-3 py-2 text-white ${colors.header} hover:opacity-90 transition-opacity`}
                        >
                          Verify Share
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* All verified — finalize */}
          {status.partialsRemaining?.length === 0 && (
            <div className="rounded-xl border-2 border-green-400 bg-green-50 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-green-800">All 3 key shares verified</p>
                <p className="text-xs text-green-700 mt-1">
                  Lagrange interpolation will reconstruct the decryption key and reveal the results.
                  This operation is irreversible for this ceremony.
                </p>
              </div>
              <button
                onClick={handleFinalize}
                disabled={phase === "finalizing"}
                className="shrink-0 rounded-md bg-green-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50 transition-opacity"
              >
                {phase === "finalizing" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Reconstructing key…
                  </span>
                ) : "Reconstruct Key & Reveal Results"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE: done — results
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === "done" && result && (
        <div className="space-y-6">
          {/* Summary metrics */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Ballots tallied",   value: result.totalBallotsProcessed.toString() },
              { label: "Positions counted", value: Object.keys(byPosition).length.toString() },
              { label: "Key-split scheme",  value: "3-of-3 SSS" },
              { label: "Duration",          value: `${result.durationMs}ms` },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                <p className="text-xs text-gray-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Per-position results */}
          {Object.entries(byPosition).map(([position, candidates]) => {
            const total   = candidates.reduce((s, c) => s + c.votes, 0);
            const sorted  = [...candidates].sort((a, b) => b.votes - a.votes);
            const topVotes = sorted[0]?.votes ?? 0;
            const tied    = topVotes > 0 ? sorted.filter((c) => c.votes === topVotes) : [];
            const isTied  = tied.length > 1;
            return (
              <div key={position} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
                  <span className="font-semibold">{position}</span>
                  <span className="text-xs text-gray-400">{total} total votes</span>
                </div>
                <div className="p-4 space-y-3">
                  {sorted.map((c, i) => {
                    const pct      = total > 0 ? Math.round((c.votes / total) * 100) : 0;
                    const isTop    = c.votes === topVotes && topVotes > 0;
                    const barColor = isTop ? (isTied ? "bg-amber-400" : "bg-green-500") : "bg-blue-400";
                    const textColor = isTop ? (isTied ? "text-amber-700" : "text-green-700") : "text-gray-700";
                    return (
                      <div key={c.candidateId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className={`font-medium ${textColor}`}>
                            {c.candidateName} {isTop && !isTied ? "🏆" : isTop && isTied ? "=" : ""}
                          </span>
                          <span className="text-gray-500">{c.votes} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isTied ? (
                  <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 text-xs text-amber-700">
                    <strong>TIE</strong> — {tied.map((c) => c.candidateName).join(" / ")} each with {topVotes} votes. No winner declared.
                  </div>
                ) : (
                  <div className="bg-green-50 border-t border-green-200 px-4 py-2 text-xs text-green-700">
                    Winner: <strong>{sorted[0]?.candidateName}</strong> with {sorted[0]?.votes} votes
                  </div>
                )}
              </div>
            );
          })}

          {/* Cryptographic proof */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Ceremony Certificate
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500 mb-1">Ceremony ID</p>
                <p className="font-mono text-gray-200 break-all">{result.ceremonyId}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Completed</p>
                <p className="font-mono text-gray-200">{new Date(result.completedAt).toLocaleString()}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">SHA-256 Results Hash (ceremony ID + per-candidate counts)</p>
              <p className="font-mono text-sm text-green-400 break-all">{result.finalHash}</p>
            </div>
            <button
              onClick={() => handleCopy(result.finalHash, "Hash")}
              className="text-xs text-gray-400 hover:text-white underline underline-offset-2"
            >
              Copy hash
            </button>
          </div>

          {/* Sovereignty note */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
            ✓ {result.sovereigntyNote}
          </div>

          {/* Commissioners who participated */}
          <div className="flex flex-wrap gap-2">
            {result.commissionersWhoParticipated.map((id) => (
              <span key={id} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                ✓ Commissioner {id.charAt(0).toUpperCase() + id.slice(1)}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {selectedElectionId && (
              <a
                href={`/admin/declarations?electionId=${selectedElectionId}`}
                className="rounded-md bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800"
              >
                Declare Results →
              </a>
            )}
            <button
              onClick={handleReset}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Reset &amp; Run Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
