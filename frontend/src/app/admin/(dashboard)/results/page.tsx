'use client';

/**
 * VeriVote Kenya — Election Results & Decryption Ceremony Dashboard (Days 41-42)
 *
 * Features:
 * - IEBC admin triggers ElGamal batch decryption ceremony
 * - Live ceremony log with simulated streaming effect
 * - Candidate vote counts per position with bar charts
 * - Turnout percentage and station-by-station breakdown
 * - Cryptographic proof of tally (SHA-256 hash published on-chain)
 * - Print queue reconciliation (digital tally vs printed receipts)
 * - Downloadable PDF audit report via browser print
 *
 * Sovereignty: All computation on-premise. Zero foreign API calls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports — avoid SSR crash with Recharts
const BarChart    = dynamic(() => import('recharts').then(m => m.BarChart),    { ssr: false });
const Bar         = dynamic(() => import('recharts').then(m => m.Bar),         { ssr: false });
const XAxis       = dynamic(() => import('recharts').then(m => m.XAxis),       { ssr: false });
const YAxis       = dynamic(() => import('recharts').then(m => m.YAxis),       { ssr: false });
const Tooltip     = dynamic(() => import('recharts').then(m => m.Tooltip),     { ssr: false });
const Cell        = dynamic(() => import('recharts').then(m => m.Cell),        { ssr: false });
const PieChart    = dynamic(() => import('recharts').then(m => m.PieChart),    { ssr: false });
const Pie         = dynamic(() => import('recharts').then(m => m.Pie),         { ssr: false });
const Legend      = dynamic(() => import('recharts').then(m => m.Legend),      { ssr: false });
const ResponsiveContainer = dynamic(
  () => import('recharts').then(m => m.ResponsiveContainer),
  { ssr: false }
);

// ── Types (mirrors backend tally.service.ts) ──────────────────────────────────

interface CandidateTally {
  candidateId: string;
  candidateName: string;
  party: string;
  partyAbbreviation: string;
  votes: number;
  percentage: number;
}

interface PositionTally {
  positionId: string;
  positionTitle: string;
  candidates: CandidateTally[];
  totalVotes: number;
  winner: string;
  winnerParty: string;
}

interface StationBreakdown {
  stationId: string;
  stationCode: string;
  stationName: string;
  county: string;
  votesDecrypted: number;
  distressVotes: number;
}

interface PrintReconciliation {
  digitalTally: number;
  printedReceipts: number;
  discrepancy: number;
  match: boolean;
  status: 'CLEAN' | 'DISCREPANCY';
}

interface TallyResult {
  ceremonyId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalVotesDecrypted: number;
  totalVotersEligible: number;
  turnoutPercentage: number;
  positions: PositionTally[];
  stationBreakdown: StationBreakdown[];
  distressVoteCount: number;
  invalidVoteCount: number;
  printReconciliation: PrintReconciliation;
  resultsHash: string;
  blockchainTxHash: string | null;
  published: boolean;
  ceremonyLog: string[];
  sovereigntyNote: string;
}

// ── Colour palette for candidates ────────────────────────────────────────────
const CANDIDATE_COLOURS = ['#15803d', '#1d4ed8', '#b91c1c', '#7c3aed', '#0891b2', '#c2410c'];

// ── API helpers ───────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3005';

async function apiFetch(path: string, opts?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const [tally, setTally]             = useState<TallyResult | null>(null);
  const [status, setStatus]           = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError]             = useState<string | null>(null);
  const [logVisible, setLogVisible]   = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isMounted, setIsMounted]     = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIsMounted(true); }, []);

  // Try loading cached tally on mount
  useEffect(() => {
    apiFetch('/api/tally/results')
      .then((data) => {
        setTally(data.tally);
        setLogVisible(data.tally.ceremonyLog ?? []);
        setStatus('done');
      })
      .catch(() => { /* no cached tally — idle state */ });
  }, []);

  // Animate log entries one by one (streaming effect)
  const streamLog = useCallback((entries: string[]) => {
    setLogVisible([]);
    entries.forEach((line, i) => {
      setTimeout(() => {
        setLogVisible((prev) => [...prev, line]);
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      }, i * 30); // 30 ms per line
    });
  }, []);

  async function startCeremony() {
    setStatus('running');
    setError(null);
    setLogVisible([]);
    try {
      const data = await apiFetch('/api/tally/start', { method: 'POST' });
      setTally(data.tally);
      setStatus('done');
      streamLog(data.tally.ceremonyLog ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ceremony failed');
      setStatus('error');
    }
  }

  async function publishOnChain() {
    setIsPublishing(true);
    try {
      const data = await apiFetch('/api/tally/publish', { method: 'POST' });
      setTally((prev) =>
        prev ? { ...prev, blockchainTxHash: data.txHash, published: true } : prev
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  }

  function downloadAuditReport() {
    window.open(`${API}/api/tally/audit-report`, '_blank');
  }

  function printReport() {
    window.print();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 print:space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Election Results</h1>
          <p className="text-sm text-gray-500 mt-1">
            ElGamal decryption ceremony · SHA-256 tamper-evident seal · On-chain anchoring
          </p>
        </div>
        <div className="flex gap-2">
          {tally && (
            <>
              {!tally.published ? (
                <button
                  onClick={publishOnChain}
                  disabled={isPublishing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isPublishing ? (
                    <span className="inline-block h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                    </svg>
                  )}
                  {isPublishing ? 'Publishing…' : 'Publish On-Chain'}
                </button>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium border border-green-200">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Published On-Chain
                </span>
              )}
              <button
                onClick={downloadAuditReport}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Audit JSON
              </button>
              <button
                onClick={printReport}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print PDF Report
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Print-only header ──────────────────────────────────────────────── */}
      <div className="hidden print:block border-b border-gray-300 pb-4 mb-6">
        <h1 className="text-2xl font-bold">IEBC Election Audit Report</h1>
        <p className="text-sm text-gray-600 mt-1">
          VeriVote Kenya · Ceremony ID: {tally?.ceremonyId} · Generated: {new Date().toLocaleString()}
        </p>
        {tally?.resultsHash && (
          <p className="text-xs text-gray-500 mt-1 font-mono">SHA-256: {tally.resultsHash}</p>
        )}
      </div>

      {/* ── Ceremony trigger (idle state) ─────────────────────────────────── */}
      {status === 'idle' && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-indigo-50 flex items-center justify-center">
            <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Decryption Ceremony</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Initiating this ceremony will decrypt all confirmed votes using the ElGamal private key
            and compute the official tally. This action is logged and auditable.
          </p>
          <button
            onClick={startCeremony}
            className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
          >
            Start Decryption Ceremony
          </button>
        </div>
      )}

      {/* ── Running state ──────────────────────────────────────────────────── */}
      {status === 'running' && (
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-block h-3 w-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
            <span className="text-green-400 text-sm font-mono font-semibold">CEREMONY IN PROGRESS…</span>
          </div>
          <div ref={logRef} className="h-64 overflow-y-auto font-mono text-xs text-green-300 space-y-0.5">
            {logVisible.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error state ────────────────────────────────────────────────────── */}
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <strong>Ceremony failed:</strong> {error}
          <button
            onClick={startCeremony}
            className="ml-3 underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {tally && status === 'done' && (
        <>
          {/* Re-run button */}
          <div className="flex justify-end print:hidden">
            <button
              onClick={startCeremony}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Re-run ceremony
            </button>
          </div>

          {/* ── Summary cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total Votes Decrypted', value: tally.totalVotesDecrypted.toLocaleString(), color: 'text-indigo-700' },
              { label: 'Turnout', value: `${tally.turnoutPercentage}%`, color: 'text-green-700' },
              { label: 'Distress Flags', value: tally.distressVoteCount.toString(), color: tally.distressVoteCount > 0 ? 'text-red-700' : 'text-gray-700' },
              { label: 'Print Reconciliation', value: tally.printReconciliation.status, color: tally.printReconciliation.match ? 'text-green-700' : 'text-orange-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* ── Position results ────────────────────────────────────────────── */}
          {tally.positions.map((pos) => (
            <div key={pos.positionId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Winner banner */}
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-xs font-medium uppercase tracking-wider">{pos.positionTitle}</p>
                  <p className="text-white text-xl font-bold mt-0.5">{pos.winner}</p>
                  <p className="text-green-200 text-sm">{pos.winnerParty}</p>
                </div>
                <div className="text-right">
                  <p className="text-green-100 text-xs">Total votes cast</p>
                  <p className="text-white text-2xl font-bold">{pos.totalVotes.toLocaleString()}</p>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* Candidate table */}
                <div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-100">
                        <th className="pb-2 text-xs text-gray-500 font-medium">Candidate</th>
                        <th className="pb-2 text-xs text-gray-500 font-medium">Party</th>
                        <th className="pb-2 text-xs text-gray-500 font-medium text-right">Votes</th>
                        <th className="pb-2 text-xs text-gray-500 font-medium text-right">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pos.candidates.map((c, ci) => (
                        <tr key={c.candidateId} className={ci === 0 ? 'font-semibold' : ''}>
                          <td className="py-2.5 flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: CANDIDATE_COLOURS[ci] ?? '#6b7280' }}
                            />
                            {c.candidateName}
                            {ci === 0 && (
                              <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                                WINNER
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-gray-500 text-xs">{c.partyAbbreviation}</td>
                          <td className="py-2.5 text-right tabular-nums">{c.votes.toLocaleString()}</td>
                          <td className="py-2.5 text-right tabular-nums text-gray-500">{c.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bar chart */}
                {isMounted && (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pos.candidates.map((c, ci) => ({
                          name: c.candidateName.split(' ')[0],
                          votes: c.votes,
                          fill: CANDIDATE_COLOURS[ci] ?? '#6b7280',
                        }))}
                        margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} width={36} />
                        <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Votes']} />
                        <Bar dataKey="votes" radius={[4, 4, 0, 0]}>
                          {pos.candidates.map((_, ci) => (
                            <Cell key={ci} fill={CANDIDATE_COLOURS[ci] ?? '#6b7280'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* ── Turnout pie + distress ───────────────────────────────────────── */}
          {isMounted && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Turnout pie */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Voter Turnout</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Voted', value: tally.totalVotesDecrypted },
                          { name: 'Did Not Vote', value: Math.max(0, tally.totalVotersEligible - tally.totalVotesDecrypted) },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={70}
                        dataKey="value"
                      >
                        <Cell fill="#15803d" />
                        <Cell fill="#e5e7eb" />
                      </Pie>
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'Voters']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-center text-2xl font-bold text-green-700">{tally.turnoutPercentage}%</p>
                <p className="text-center text-xs text-gray-500">
                  {tally.totalVotesDecrypted.toLocaleString()} of {tally.totalVotersEligible.toLocaleString()} eligible voters
                </p>
              </div>

              {/* Integrity stats */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Integrity Metrics</h3>
                {[
                  { label: 'Valid votes decrypted', value: tally.totalVotesDecrypted, accent: 'text-green-700' },
                  { label: 'Invalid/corrupted votes', value: tally.invalidVoteCount, accent: tally.invalidVoteCount > 0 ? 'text-red-600' : 'text-gray-500' },
                  { label: 'Distress PIN activations', value: tally.distressVoteCount, accent: tally.distressVoteCount > 0 ? 'text-orange-600' : 'text-gray-500' },
                  { label: 'Printed receipts', value: tally.printReconciliation.printedReceipts, accent: 'text-gray-700' },
                  { label: 'Print discrepancy', value: tally.printReconciliation.discrepancy, accent: tally.printReconciliation.match ? 'text-green-600' : 'text-red-600' },
                ].map(({ label, value, accent }) => (
                  <div key={label} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2">
                    <span className="text-gray-600">{label}</span>
                    <span className={`font-semibold tabular-nums ${accent}`}>{value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Print reconciliation ─────────────────────────────────────────── */}
          <div className={`rounded-xl border p-5 ${
            tally.printReconciliation.match
              ? 'bg-green-50 border-green-200'
              : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                tally.printReconciliation.match ? 'bg-green-600' : 'bg-orange-500'
              }`}>
                {tally.printReconciliation.match ? (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01" />
                  </svg>
                )}
              </div>
              <div>
                <p className={`font-semibold text-sm ${tally.printReconciliation.match ? 'text-green-800' : 'text-orange-800'}`}>
                  Print Queue Reconciliation — {tally.printReconciliation.status}
                </p>
                <p className={`text-sm mt-0.5 ${tally.printReconciliation.match ? 'text-green-700' : 'text-orange-700'}`}>
                  Digital tally: {tally.printReconciliation.digitalTally} votes &nbsp;|&nbsp;
                  Printed receipts: {tally.printReconciliation.printedReceipts} &nbsp;|&nbsp;
                  Discrepancy: {tally.printReconciliation.discrepancy}
                  {tally.printReconciliation.match
                    ? ' — Physical and digital counts match perfectly.'
                    : ' — Discrepancy detected. Flag for manual audit by returning officer.'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Station breakdown ────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Station-by-Station Breakdown</h3>
              <span className="text-xs text-gray-400">{tally.stationBreakdown.length} station(s)</span>
            </div>
            {tally.stationBreakdown.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No station data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Station Code', 'Station Name', 'County', 'Votes', 'Distress Flags'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tally.stationBreakdown.map((st) => (
                      <tr key={st.stationId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{st.stationCode}</td>
                        <td className="px-4 py-3 text-gray-900">{st.stationName}</td>
                        <td className="px-4 py-3 text-gray-500">{st.county}</td>
                        <td className="px-4 py-3 font-semibold tabular-nums">{st.votesDecrypted.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {st.distressVotes > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              ⚠ {st.distressVotes}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Cryptographic proof ──────────────────────────────────────────── */}
          <div className="bg-gray-900 rounded-xl p-5 text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Cryptographic Proof of Tally</h3>
                <p className="text-gray-400 text-xs mt-0.5">
                  SHA-256 hash of the canonical results JSON — immutable tamper-evident seal
                </p>
              </div>
              {tally.published && (
                <span className="flex items-center gap-1 text-xs bg-green-900/60 text-green-300 border border-green-700 px-2.5 py-1 rounded-full">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Published
                </span>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Results Hash (SHA-256)</p>
                <p className="font-mono text-green-400 text-xs break-all">{tally.resultsHash}</p>
              </div>
              {tally.blockchainTxHash && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Blockchain TX Hash</p>
                  <p className="font-mono text-blue-400 text-xs break-all">{tally.blockchainTxHash}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                <div>
                  <p className="text-gray-500">Ceremony ID</p>
                  <p className="font-mono text-gray-300 break-all">{tally.ceremonyId}</p>
                </div>
                <div>
                  <p className="text-gray-500">Completed</p>
                  <p className="text-gray-300">{new Date(tally.completedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Duration</p>
                  <p className="text-gray-300">{tally.durationMs}ms</p>
                </div>
                <div>
                  <p className="text-gray-500">Encryption Scheme</p>
                  <p className="text-gray-300">ElGamal 2048-bit FFDHE (RFC 7919)</p>
                </div>
              </div>
              <div className="border-t border-gray-700 pt-3">
                <p className="text-green-400 text-xs">✓ {tally.sovereigntyNote}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  Upgrade path: SEAL/Paillier additive homomorphic scheme for threshold tallying without decryption ceremony.
                </p>
              </div>
            </div>
          </div>

          {/* ── Ceremony log (collapsed by default) ─────────────────────────── */}
          <details className="bg-gray-900 rounded-xl print:hidden">
            <summary className="px-5 py-3 text-sm text-gray-400 cursor-pointer hover:text-gray-200 select-none">
              View full ceremony log ({tally.ceremonyLog.length} entries)
            </summary>
            <div className="px-5 pb-5">
              <div
                ref={logRef}
                className="h-72 overflow-y-auto font-mono text-xs text-green-300 space-y-0.5 mt-3"
              >
                {logVisible.length > 0
                  ? logVisible.map((line, i) => <div key={i}>{line}</div>)
                  : tally.ceremonyLog.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </div>
          </details>

          {/* ── Sovereignty checkpoint ───────────────────────────────────────── */}
          <div className="border border-green-200 bg-green-50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-green-800 mb-2">
              Sovereignty Checkpoint — Full Election Cycle Complete
            </h3>
            <ul className="text-xs text-green-700 space-y-1">
              {[
                'Voter registration: Persona KYC (optional) + local argon2id PIN storage',
                'Vote encryption: ElGamal 2048-bit FFDHE — on-premise, no external calls',
                'Blockchain anchoring: Hardhat / Polygon (configurable RPC endpoint)',
                'Fraud detection: Isolation Forest + deterministic rule engine — on-premise',
                'LLM explanations: Ollama/Llama 3.2 — on-premise or template fallback',
                'Decryption ceremony: Private key held locally by IEBC Commissioner',
                'Results hash: SHA-256 computed locally and anchored on-chain',
                'Zero foreign API dependencies across full election lifecycle ✓',
              ].map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <span className="text-green-600 mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* ── Print stylesheet ─────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          nav, [data-sidebar], aside, header, .print\\:hidden { display: none !important; }
          body { font-size: 12px; }
          .print\\:block { display: block !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}
