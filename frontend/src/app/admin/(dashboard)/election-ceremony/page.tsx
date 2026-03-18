"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { StaffRole } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

// ── Role helpers ──────────────────────────────────────────────────────────────

const COMMISSION_ROLES: StaffRole[] = [
  "CHAIRPERSON", "COMMISSIONER", "COMMISSION_SECRETARY", "DEPUTY_COMMISSION_SECRETARY",
];

// Only the Chairperson can declare Presidential results
const DECLARATION_ROLES: StaffRole[] = ["CHAIRPERSON"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ElectionOption { id: string; name: string; status: string; type: string; }

interface SelectedCommissioner {
  voterId:      string;
  name:         string;
  nationalId?:  string;    // masked — only in status response
  shareIndex?:  number;    // only in start response
  commitment?:  string;
  hasSubmitted?: boolean;  // only in status response
}

interface CeremonyStartResult {
  ceremonyId:            string;
  totalBallots:          number;
  threshold:             number;
  totalCommissioners:    number;
  selectedCommissioners: SelectedCommissioner[];
  mockShares?:           Record<string, string>; // dev only
}

interface CeremonyStatus {
  started:               boolean;
  ceremonyId?:           string;
  startedAt?:            string;
  electionId?:           string;
  totalBallots?:         number;
  threshold?:            number;
  selectedCommissioners?: SelectedCommissioner[];
  sharesReceived?:       number;
  finalized?:            boolean;
}

interface CandidateTally {
  candidateId:        string;
  candidateName:      string;
  positionId:         string;
  positionTitle:      string;
  positionScope:      string;
  positionScopeValue: string | null;
  votes:              number;
}

interface TallyResult {
  ceremonyId:                  string;
  startedAt:                   string;
  completedAt:                 string;
  durationMs:                  number;
  totalBallotsProcessed:       number;
  commissionersWhoParticipated: string[];
  candidates:                  CandidateTally[];
  finalHash:                   string;
  sovereigntyNote:             string;
}

interface MixNodeProof {
  nodeId: string; nodeLabel: string;
  inputCount: number; inputCommitment: string;
  outputCount: number; outputCommitment: string;
  proofHash: string; durationMs: number;
}

interface MixnetSummary {
  ceremonyId: string; inputVoteCount: number; outputVoteCount: number;
  finalCommitment: string; durationMs: number;
  nodes: MixNodeProof[]; productionNote: string;
}

// Phase of the ceremony UI
type Phase =
  | "idle"          // no ceremony active; select election
  | "initiating"    // running mixnet + splitting key
  | "collecting"    // waiting for k commissioner shares
  | "finalizing"    // threshold met, decrypting
  | "done"          // tally complete, results ready
  | "error";

type ResultTab = "results" | "mixnet" | "tally";

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function pct(votes: number, total: number) {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}

// ── Steps indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Re-encryption Mixnet",     desc: "Anonymising vote order"          },
  { label: "Key Distribution",          desc: "Splitting & emailing shares"     },
  { label: "Commissioner Signatures",   desc: "Collecting key shares"           },
  { label: "Homomorphic Tally",         desc: "Counting without decrypting"     },
  { label: "Results Ready",             desc: "Ceremony complete"               },
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
            <div className={`z-10 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
              done    ? "bg-green-500 border-green-500 text-white"   :
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

// ── Commissioner share card ───────────────────────────────────────────────────

function CommissionerCard({
  commissioner,
  isMe,
  onSubmit,
}: {
  commissioner: SelectedCommissioner;
  isMe:         boolean;
  onSubmit:     (share: string) => Promise<void>;
}) {
  const [share,       setShare]       = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [shareError,  setShareError]  = useState("");
  const [expanded,    setExpanded]    = useState(isMe);

  const submitted = !!commissioner.hasSubmitted;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShareError("");
    if (!share.trim()) { setShareError("Enter your key share."); return; }
    setSubmitting(true);
    try {
      await onSubmit(share.trim());
      setShare("");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`rounded-xl border-2 transition-colors ${
      submitted
        ? "border-green-400 bg-green-50"
        : isMe
        ? "border-indigo-400 bg-indigo-50"
        : "border-gray-200 bg-white"
    }`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${
            submitted ? "bg-green-500 text-white" : isMe ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-500"
          }`}>
            {submitted ? "✓" : (commissioner.shareIndex ?? "?")}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {commissioner.name}
              {isMe && <span className="ml-2 text-xs font-normal text-indigo-600">(you)</span>}
            </p>
            {commissioner.nationalId && (
              <p className="text-xs text-gray-400">ID {commissioner.nationalId}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            submitted ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>
            {submitted ? "Share submitted" : "Awaiting share"}
          </span>
          {isMe && !submitted && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-indigo-600 hover:underline"
            >
              {expanded ? "Hide" : "Enter share"}
            </button>
          )}
        </div>
      </div>

      {isMe && !submitted && expanded && (
        <form onSubmit={handleSubmit} className="border-t border-indigo-200 px-4 py-4 space-y-3">
          <p className="text-xs text-indigo-700 font-medium">
            Paste the key share from your email below:
          </p>
          {shareError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{shareError}</p>
          )}
          <textarea
            rows={3}
            value={share}
            onChange={(e) => setShare(e.target.value)}
            placeholder="Paste your hex key share here…"
            className="w-full rounded-lg border border-indigo-300 px-3 py-2 text-xs font-mono focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 placeholder-gray-400"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting || !share.trim()}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Verifying…" : "Submit Share"}
            </button>
            <p className="text-xs text-gray-400">Your share is validated cryptographically before being accepted.</p>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ElectionCeremonyPage() {
  const { voter } = useAuth();
  const isCommission = voter?.staffRole
    ? COMMISSION_ROLES.includes(voter.staffRole as StaffRole)
    : false;
  const canDeclare = voter?.staffRole
    ? DECLARATION_ROLES.includes(voter.staffRole as StaffRole)
    : false;
  // The staff member's own jurisdiction value (county name, constituency name, etc.)
  const myJurisdiction = voter?.jurisdictionValue ?? null;
  const myVoterId = voter?.id ?? "";

  const [phase,        setPhase]        = useState<Phase>("idle");
  const [error,        setError]        = useState<string | null>(null);
  const [resultTab,    setResultTab]    = useState<ResultTab>("results");
  const [stepActive,   setStepActive]   = useState(0);

  // Election selection
  const [elections,         setElections]         = useState<ElectionOption[]>([]);
  const [selectedId,        setSelectedId]        = useState("");
  const [electionsLoading,  setElectionsLoading]  = useState(true);

  // Ceremony state
  const [startInfo,  setStartInfo]  = useState<CeremonyStartResult | null>(null);
  const [status,     setStatus]     = useState<CeremonyStatus | null>(null);
  const [mixnet,     setMixnet]     = useState<MixnetSummary | null>(null);
  const [tally,      setTally]      = useState<TallyResult | null>(null);

  // Dev: mock shares display
  const [showMockShares, setShowMockShares] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load elections ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/api/elections?limit=100`, { headers: authHeader() })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        const items: ElectionOption[] = (data.data?.items ?? []).filter(
          (e: ElectionOption) => e.status === "CLOSED" || e.status === "TALLIED",
        );
        setElections(items);
        if (items.length === 1) setSelectedId(items[0].id);
      })
      .catch(() => {})
      .finally(() => setElectionsLoading(false));
  }, []);

  // ── Check for active ceremony on mount ─────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/api/ceremony/status`, { headers: authHeader() })
      .then(async (r) => {
        if (!r.ok) return;
        const data: CeremonyStatus = await r.json();
        if (!data.started) return;
        setStatus(data);
        if (data.electionId) setSelectedId(data.electionId);
        if (data.finalized) {
          loadResult();
        } else {
          setPhase("collecting");
          setStepActive(2);
        }
      })
      .catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll ceremony status while collecting ──────────────────────────────────

  const pollStatus = useCallback(() => {
    fetch(`${API}/api/ceremony/status`, { headers: authHeader() })
      .then(async (r) => {
        if (!r.ok) return;
        const data: CeremonyStatus = await r.json();
        setStatus(data);
        if (data.finalized) {
          stopPoll();
          loadResult();
        }
      })
      .catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function startPoll() {
    stopPoll();
    pollRef.current = setInterval(pollStatus, 5000);
  }
  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    if (phase === "collecting") startPoll();
    else stopPoll();
    return stopPoll;
  }, [phase]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load final result ───────────────────────────────────────────────────────

  async function loadResult() {
    try {
      const [mixRes, cerRes] = await Promise.all([
        fetch(`${API}/api/mixnet/status`, { headers: authHeader() }),
        fetch(`${API}/api/ceremony/result`, { headers: authHeader() }),
      ]);
      if (mixRes.ok) setMixnet(await mixRes.json());
      if (cerRes.ok) setTally(await cerRes.json());
      setPhase("done");
      setStepActive(5);
      setResultTab("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results.");
      setPhase("error");
    }
  }

  // ── Initiate ceremony ───────────────────────────────────────────────────────

  async function handleInitiate() {
    if (!selectedId) { setError("Select an election first."); return; }
    setError(null);
    setPhase("initiating");
    setStepActive(0);
    setStartInfo(null);
    setStatus(null);

    try {
      // Step 1: Run mixnet
      setStepActive(0);
      const mixRes = await fetch(`${API}/api/mixnet/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      if (!mixRes.ok) {
        const d = await mixRes.json().catch(() => ({}));
        throw new Error(d.error ?? d.detail ?? "Mixnet failed.");
      }
      const mixData = await mixRes.json();
      setMixnet(mixData.result);

      // Step 2: Split key and email commissioners
      setStepActive(1);
      const startRes = await fetch(`${API}/api/ceremony/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ electionId: selectedId }),
      });
      if (!startRes.ok) {
        const d = await startRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Ceremony start failed.");
      }
      const startData: CeremonyStartResult = await startRes.json();
      setStartInfo(startData);

      // Fetch status immediately so cards populate
      const statusRes = await fetch(`${API}/api/ceremony/status`, { headers: authHeader() });
      if (statusRes.ok) setStatus(await statusRes.json());

      setPhase("collecting");
      setStepActive(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ceremony initiation failed.");
      setPhase("error");
      setStepActive(0);
    }
  }

  // ── Submit a key share ──────────────────────────────────────────────────────

  async function handleSubmitShare(share: string) {
    const res = await fetch(`${API}/api/ceremony/partial`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ share }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Share submission failed.");

    // Update local status optimistically
    setStatus((prev) => {
      if (!prev?.selectedCommissioners) return prev;
      return {
        ...prev,
        selectedCommissioners: prev.selectedCommissioners.map((c) =>
          c.voterId === myVoterId ? { ...c, hasSubmitted: true } : c,
        ),
        sharesReceived: (prev.sharesReceived ?? 0) + 1,
      };
    });

    if (data.finalized) {
      setStepActive(4);
      setPhase("finalizing");
      await loadResult();
    }
  }

  // ── Reset ceremony ──────────────────────────────────────────────────────────

  async function handleReset() {
    if (!confirm("Reset the active ceremony? All submitted shares will be lost.")) return;
    await fetch(`${API}/api/ceremony/reset`, {
      method: "POST", headers: authHeader(),
    });
    setPhase("idle");
    setStartInfo(null);
    setStatus(null);
    setTally(null);
    setMixnet(null);
    setError(null);
    setStepActive(0);
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const commissioners: SelectedCommissioner[] = status?.selectedCommissioners
    ?? startInfo?.selectedCommissioners
    ?? [];

  const threshold     = status?.threshold ?? startInfo?.threshold ?? 0;
  const sharesReceived = status?.sharesReceived ?? 0;
  const isSelected    = commissioners.some((c) => c.voterId === myVoterId);
  const hasSubmitted  = commissioners.find((c) => c.voterId === myVoterId)?.hasSubmitted ?? false;

  const byPosition = tally
    ? tally.candidates.reduce<Record<string, CandidateTally[]>>((acc, c) => {
        (acc[c.positionTitle] ??= []).push(c);
        return acc;
      }, {})
    : {};

  // Presidential declaration: NATIONAL-scope positions only (Chairperson only)
  const declarationPositions = tally
    ? Object.entries(byPosition).filter(([, cands]) => cands[0]?.positionScope === 'NATIONAL')
    : [];

  // Sub-national results — filtered by the viewer's jurisdiction:
  // COUNTY_RO → only see COUNTY-scope results for their county
  // CONSTITUENCY_RO → only see CONSTITUENCY/WARD-scope results for their constituency
  // Commission / NATIONAL_RO → see all sub-national results
  const allSubNational = tally
    ? Object.entries(byPosition).filter(([, cands]) => cands[0]?.positionScope !== 'NATIONAL')
    : [];
  const internalPositions = (() => {
    const role = voter?.staffRole ?? "";
    if (role === "COUNTY_RO") {
      return allSubNational.filter(([, cands]) => {
        const c = cands[0];
        return c?.positionScope === "COUNTY" &&
          (!myJurisdiction || !c.positionScopeValue ||
            c.positionScopeValue.toLowerCase() === myJurisdiction.toLowerCase());
      });
    }
    if (role === "CONSTITUENCY_RO") {
      return allSubNational.filter(([, cands]) => {
        const c = cands[0];
        return ["CONSTITUENCY", "WARD"].includes(c?.positionScope ?? "") &&
          (!myJurisdiction || !c?.positionScopeValue ||
            c.positionScopeValue.toLowerCase() === myJurisdiction.toLowerCase());
      });
    }
    return allSubNational; // commission/national RO see all
  })();

  const nodeColors = [
    { bg: "bg-blue-50 border-blue-300",     header: "bg-blue-600" },
    { bg: "bg-purple-50 border-purple-300", header: "bg-purple-600" },
    { bg: "bg-green-50 border-green-300",   header: "bg-green-600" },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Election Ceremony</h1>
          <p className="mt-1 text-sm text-gray-500">
            Threshold homomorphic tally with dynamic Shamir's Secret Sharing.
          </p>
        </div>
        {(phase === "collecting" || phase === "done") && isCommission && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Reset Ceremony
          </button>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-indigo-700">
        <div>
          <p className="font-semibold mb-1">① Re-encryption Mixnet</p>
          <p>Each vote is re-encrypted and shuffled across 3 mix nodes, breaking the link between voter and ballot.</p>
        </div>
        <div>
          <p className="font-semibold mb-1">② Dynamic Key Splitting</p>
          <p>
            k&nbsp;=&nbsp;⌈√N⌉ commissioners are randomly selected and each receives one Shamir share of the decryption key via secure email.
          </p>
        </div>
        <div>
          <p className="font-semibold mb-1">③ Threshold Tally</p>
          <p>Once all k shares are submitted, the key is reconstructed and only aggregate totals are revealed — no individual vote is ever decrypted.</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── IDLE / ERROR ─────────────────────────────────────────────────────── */}
      {(phase === "idle" || phase === "error") && (
        <>
          {/* Election selector */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <label className="block text-sm font-semibold text-gray-700">
              Select Election to Tally
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
                    onClick={() => setSelectedId(e.id)}
                    className={`rounded-lg border px-4 py-2.5 text-left transition-all ${
                      selectedId === e.id
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300"
                        : "border-gray-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-800">{e.name}</p>
                    <span className={`text-xs ${e.status === "TALLIED" ? "text-green-600" : "text-gray-500"}`}>
                      {e.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {isCommission ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <p className="mb-2 text-sm font-semibold text-gray-700">Ready to initiate the tally ceremony</p>
              <p className="mb-6 text-xs text-gray-500">
                This will run the re-encryption mixnet, compute the Shamir threshold based on active commissioners, and email each selected commissioner their key share.
              </p>
              <button
                onClick={handleInitiate}
                disabled={!selectedId || elections.filter(e => e.status === "CLOSED").length === 0}
                className="rounded-lg bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Initiate Ceremony
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="text-sm font-semibold text-amber-800">
                Only IEBC Commissioners can initiate the tally ceremony.
              </p>
              <p className="mt-1 text-xs text-amber-600">
                If a ceremony is already in progress, it will appear here once initiated.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── INITIATING ───────────────────────────────────────────────────────── */}
      {phase === "initiating" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-indigo-200 bg-white p-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              <span className="text-sm font-semibold text-indigo-700">
                {stepActive === 0 ? "Running re-encryption mixnet…" : "Generating and distributing key shares…"}
              </span>
            </div>
            <StepIndicator active={stepActive} />
          </div>
          <p className="text-center text-xs text-gray-400">
            This may take a few seconds — 2048-bit ElGamal operations are CPU-intensive.
          </p>
        </div>
      )}

      {/* ── COLLECTING ───────────────────────────────────────────────────────── */}
      {(phase === "collecting" || phase === "finalizing") && (
        <div className="space-y-5">

          {/* Step indicator */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <StepIndicator active={phase === "finalizing" ? 4 : 2} />
          </div>

          {/* Progress bar */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-indigo-900">
                Key Share Collection
              </p>
              <span className={`text-sm font-bold ${sharesReceived >= threshold ? "text-green-600" : "text-indigo-700"}`}>
                {sharesReceived} / {threshold} received
              </span>
            </div>
            <div className="w-full bg-indigo-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${sharesReceived >= threshold ? "bg-green-500" : "bg-indigo-600"}`}
                style={{ width: `${threshold > 0 ? Math.round((sharesReceived / threshold) * 100) : 0}%` }}
              />
            </div>
            {sharesReceived >= threshold ? (
              <p className="text-xs text-green-700 font-medium">
                Threshold reached — reconstructing decryption key and tallying…
              </p>
            ) : (
              <p className="text-xs text-indigo-600">
                Waiting for {threshold - sharesReceived} more commissioner share(s) before the key can be reconstructed.
              </p>
            )}
          </div>

          {/* Ceremony metadata */}
          {startInfo && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs font-mono space-y-1">
              <div><span className="text-gray-400">Ceremony  </span><span className="text-gray-900">{startInfo.ceremonyId}</span></div>
              <div><span className="text-gray-400">Threshold </span><span className="text-gray-900">{startInfo.threshold}-of-{startInfo.threshold} (k = ⌈√{startInfo.totalCommissioners}⌉)</span></div>
              <div><span className="text-gray-400">Ballots   </span><span className="text-gray-900">{startInfo.totalBallots}</span></div>
            </div>
          )}

          {/* Dev: mock shares */}
          {startInfo?.mockShares && Object.keys(startInfo.mockShares).length > 0 && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 space-y-2">
              <button
                type="button"
                onClick={() => setShowMockShares((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-yellow-800"
              >
                <span>⚠ Dev Mode: Mock Key Shares</span>
                <span className="text-xs font-normal">({showMockShares ? "hide" : "show"})</span>
              </button>
              {showMockShares && (
                <div className="space-y-2">
                  <p className="text-xs text-yellow-700">
                    In production these are emailed. Copy-paste each share to test submission.
                  </p>
                  {Object.entries(startInfo.mockShares).map(([voterId, shareHex]) => {
                    const comm = commissioners.find((c) => c.voterId === voterId);
                    return (
                      <div key={voterId} className="rounded-lg border border-yellow-200 bg-white p-3">
                        <p className="text-xs font-semibold text-gray-700 mb-1">{comm?.name ?? voterId}</p>
                        <p className="text-xs font-mono text-gray-600 break-all">{shareHex}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Commissioner cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Selected Commissioners</h3>
            {commissioners.map((c) => (
              <CommissionerCard
                key={c.voterId}
                commissioner={c}
                isMe={c.voterId === myVoterId}
                onSubmit={handleSubmitShare}
              />
            ))}
          </div>

          {/* Info for non-selected commissioners */}
          {!isSelected && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              You were not randomly selected for this ceremony. The {threshold} selected commissioner(s) listed above must each submit their share to complete the tally.
            </div>
          )}

          {isSelected && hasSubmitted && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 font-medium">
              Your share has been verified. Waiting for the remaining commissioner(s)…
            </div>
          )}
        </div>
      )}

      {/* ── DONE ─────────────────────────────────────────────────────────────── */}
      {phase === "done" && tally && (
        <div className="space-y-6">

          {/* Step completion */}
          <div className="rounded-xl border border-green-200 bg-white p-6">
            <StepIndicator active={5} />
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Votes processed",    value: tally.totalBallotsProcessed.toString() },
              { label: "Positions tallied",  value: Object.keys(byPosition).length.toString() },
              { label: "Tally duration",     value: `${tally.durationMs}ms` },
              { label: "Commissioners used", value: tally.commissionersWhoParticipated.length.toString() },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{m.value}</p>
                <p className="text-xs text-gray-500 mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              {(["results", "mixnet", "tally"] as ResultTab[]).map((t) => (
                <button key={t} onClick={() => setResultTab(t)}
                  className={`pb-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
                    resultTab === t
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
          {resultTab === "results" && (
            <div className="space-y-6">

              {/* ── Official Presidential Declaration — Chairperson only ──── */}
              {canDeclare && declarationPositions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-red-200" />
                    <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                      Official Declaration — Presidential Results
                    </span>
                    <div className="h-px flex-1 bg-red-200" />
                  </div>
                  <p className="text-xs text-center text-red-700">
                    These results are declared by the IEBC Chairperson as the Presidential Returning Officer.
                  </p>
                  {declarationPositions.map(([position, candidates]) => {
                    const total  = candidates.reduce((s, c) => s + c.votes, 0);
                    const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
                    const winner = sorted[0];
                    return (
                      <div key={position} className="rounded-xl border-2 border-red-400 bg-white overflow-hidden shadow-md">
                        <div className="bg-red-700 text-white px-4 py-3 flex items-center justify-between">
                          <span className="font-bold text-base">{position}</span>
                          <span className="text-xs text-red-200">{total.toLocaleString()} total votes</span>
                        </div>
                        <div className="p-4 space-y-3">
                          {sorted.map((c, i) => (
                            <div key={c.candidateId}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className={`font-semibold ${i === 0 ? "text-red-700" : "text-gray-700"}`}>
                                  {c.candidateName} {i === 0 && "🏆"}
                                </span>
                                <span className="text-gray-500">{c.votes.toLocaleString()} ({pct(c.votes, total)}%)</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2.5">
                                <div
                                  className={`h-2.5 rounded-full ${i === 0 ? "bg-red-500" : "bg-gray-400"}`}
                                  style={{ width: `${pct(c.votes, total)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="bg-red-50 border-t border-red-200 px-4 py-2 text-sm text-red-800 font-semibold">
                          Declared Winner: <strong>{winner?.candidateName}</strong> — {winner?.votes.toLocaleString()} votes ({pct(winner?.votes ?? 0, total)}%)
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Sub-national Results (commissioners' internal view) ───── */}
              {internalPositions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="rounded-full bg-gray-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                      Full Results — Internal View
                    </span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                  <p className="text-xs text-center text-gray-500">
                    Sub-national results are visible to commissioners only. They are declared at county and constituency level by the respective Returning Officers.
                  </p>
                  {internalPositions.map(([position, candidates]) => {
                    const total  = candidates.reduce((s, c) => s + c.votes, 0);
                    const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
                    const winner = sorted[0];
                    return (
                      <div key={position} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                        <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
                          <span className="font-semibold">{position}</span>
                          <span className="text-xs text-gray-400">{total.toLocaleString()} total votes</span>
                        </div>
                        <div className="p-4 space-y-3">
                          {sorted.map((c, i) => (
                            <div key={c.candidateId}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className={`font-medium ${i === 0 ? "text-green-700" : "text-gray-700"}`}>
                                  {c.candidateName} {i === 0 && "🏆"}
                                </span>
                                <span className="text-gray-500">{c.votes.toLocaleString()} ({pct(c.votes, total)}%)</span>
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
                          Winner: <strong>{winner?.candidateName}</strong> with {winner?.votes.toLocaleString()} votes
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {declarationPositions.length === 0 && internalPositions.length === 0 && (
                <p className="text-center text-sm text-gray-400">No results available.</p>
              )}
            </div>
          )}

          {/* Tab: Mixnet Proofs */}
          {resultTab === "mixnet" && mixnet && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${
                mixnet.inputVoteCount === mixnet.outputVoteCount
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}>
                <span>{mixnet.inputVoteCount === mixnet.outputVoteCount ? "✓" : "✗"}</span>
                <p className="text-sm font-medium text-gray-800">
                  Count integrity: {mixnet.inputVoteCount} → {mixnet.outputVoteCount} votes
                  {mixnet.inputVoteCount === mixnet.outputVoteCount ? " — no votes added or removed" : " — DISCREPANCY"}
                </p>
              </div>
              {mixnet.nodes.map((node, i) => (
                <div key={node.nodeId} className={`rounded-lg border ${nodeColors[i % nodeColors.length].bg} overflow-hidden`}>
                  <div className={`px-4 py-2 ${nodeColors[i % nodeColors.length].header} text-white text-sm font-semibold flex justify-between`}>
                    <span>{node.nodeLabel}</span>
                    <span className="opacity-75">{node.durationMs}ms</span>
                  </div>
                  <div className="p-4 space-y-2 font-mono text-xs">
                    <div><span className="text-gray-500">Input  </span><span className="break-all">{node.inputCommitment}</span></div>
                    <div><span className="text-gray-500">Output </span><span className="break-all">{node.outputCommitment}</span></div>
                    <div className="pt-1 border-t border-gray-200">
                      <span className="text-gray-500">Proof  </span><span className="font-bold break-all">{node.proofHash}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-gray-900 bg-gray-900 p-4 text-white">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Final Commitment</p>
                <p className="font-mono text-sm text-green-400 break-all">{mixnet.finalCommitment}</p>
              </div>
            </div>
          )}

          {/* Tab: Tally Proofs */}
          {resultTab === "tally" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {tally.commissionersWhoParticipated.map((name) => (
                  <div key={name} className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center min-w-32">
                    <p className="text-xs font-semibold text-green-800">{name}</p>
                    <p className="text-xs text-green-600 mt-0.5">Share verified ✓</p>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2 text-xs font-mono">
                <div><span className="text-gray-400">Ceremony    </span>{tally.ceremonyId}</div>
                <div><span className="text-gray-400">Ballots     </span>{tally.totalBallotsProcessed}</div>
                <div><span className="text-gray-400">Duration    </span>{tally.durationMs}ms (BSGS)</div>
                <div><span className="text-gray-400">Completed   </span>{new Date(tally.completedAt).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-900 bg-gray-900 p-4 text-white">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Tally Hash — SHA-256(ceremonyId | candidateId:votes…)
                </p>
                <p className="font-mono text-sm text-green-400 break-all">{tally.finalHash}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
                ✓ {tally.sovereigntyNote}
              </div>
            </div>
          )}

          {isCommission && (
            <button
              onClick={() => { setPhase("idle"); setTally(null); setMixnet(null); setStartInfo(null); setStatus(null); setError(null); setStepActive(0); }}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Run Another Election
            </button>
          )}
        </div>
      )}
    </div>
  );
}
