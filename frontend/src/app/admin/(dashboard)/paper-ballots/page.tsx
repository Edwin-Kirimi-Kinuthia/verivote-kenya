"use client";

import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ElectionOption {
  id: string;
  name: string;
  status: string;
}

interface TallyEntry {
  rank: number;
  candidateName: string;
  votes: number;
}

interface PositionManifest {
  positionId: string;
  positionTitle: string;
  positionScope: string | null;
  jurisdictionLevel: string;
  jurisdictionValue: string | null;
  declaredAt: string | null;
  declaredBy: string | null;
  tally: TallyEntry[];
  totalVotes: number;
  winner: { name: string; votes: number } | null;
}

interface Manifest {
  election: { id: string; name: string; status: string; startDate: string | null; endDate: string | null };
  officer: { jurisdictionLevel: string; jurisdictionValue: string | null };
  voteStats: { confirmed: number; superseded: number; pending: number; total: number; note: string };
  positions: PositionManifest[];
  positionCount: number;
  generatedAt: string;
  formReference: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaperBallotsPage() {
  const [elections, setElections] = useState<ElectionOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/elections?limit=100`, { headers: authHeader() })
      .then((r) => r.json())
      .then((data) => {
        const items: ElectionOption[] = (data.data?.items ?? []).filter(
          (e: ElectionOption) => ["CLOSED", "TALLIED"].includes(e.status)
        );
        setElections(items);
        if (items.length === 1) setSelectedId(items[0].id);
      })
      .catch(() => {});
  }, []);

  async function fetchManifest() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setManifest(null);
    setPrinted(false);
    try {
      const res = await fetch(`${API}/api/paper-ballots/manifest/${selectedId}`, {
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to load manifest");
      setManifest(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
    setPrinted(true);
    // Log the print event
    if (manifest) {
      fetch(`${API}/api/paper-ballots/print-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          electionId: manifest.election.id,
          formReference: manifest.formReference,
          pageCount: manifest.positions.length,
        }),
      }).catch(() => {});
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paper Ballot Audit Trail</h1>
          <p className="mt-1 text-sm text-gray-500">
            Generate a jurisdiction-scoped ballot manifest (Form 34A style) for physical audit and dispute resolution.
            Only <strong>CONFIRMED</strong> votes appear — revoted (SUPERSEDED) votes are excluded.
          </p>
        </div>
        {manifest && (
          <button
            onClick={handlePrint}
            className="shrink-0 rounded-md bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 print:hidden"
          >
            Print / Save PDF
          </button>
        )}
      </div>

      {/* ── Election selector ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm print:hidden">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Election</label>
            {elections.length === 0 ? (
              <p className="text-sm text-amber-700 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                No elections in CLOSED or TALLIED status. Results must be declared before printing.
              </p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value); setManifest(null); }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                <option value="">— Select an election —</option>
                {elections.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} [{e.status}]</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchManifest}
              disabled={!selectedId || loading}
              className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Generate Manifest"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 print:hidden">
          {error}
        </div>
      )}

      {/* ── Manifest / Printable Form ── */}
      {manifest && (
        <div ref={printRef} className="space-y-6">
          {/* Form header — prints as official document header */}
          <div className="rounded-xl border-2 border-gray-800 bg-white p-6">
            <div className="text-center border-b border-gray-300 pb-5 mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Independent Electoral and Boundaries Commission
              </p>
              <h2 className="text-xl font-black text-gray-900 mt-1">
                BALLOT AUDIT MANIFEST — FORM 34A
              </h2>
              <p className="text-sm text-gray-600 mt-1">{manifest.election.name}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Form Reference</p>
                <p className="font-mono font-bold text-gray-900 break-all">{manifest.formReference}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Jurisdiction</p>
                <p className="font-bold text-gray-900">
                  {manifest.officer.jurisdictionValue ?? "National"}
                  <span className="font-normal text-gray-500 ml-1">({manifest.officer.jurisdictionLevel})</span>
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Generated</p>
                <p className="text-gray-900">
                  {new Date(manifest.generatedAt).toLocaleString("en-KE", {
                    dateStyle: "medium", timeStyle: "short",
                  })}
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Election Status</p>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                  manifest.election.status === "TALLIED" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"
                }`}>
                  {manifest.election.status}
                </span>
              </div>
            </div>

            {/* Vote statistics */}
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Vote Count Summary</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-black text-green-700">{manifest.voteStats.confirmed.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Valid (Confirmed)</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-red-500">{manifest.voteStats.superseded.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Superseded (Revoted)</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-700">{manifest.voteStats.total.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Cast</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">{manifest.voteStats.note}</p>
            </div>
          </div>

          {/* ── Per-position tally sheets ── */}
          {manifest.positions.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              No declared results found for your jurisdiction. Results must be formally declared before the manifest can be generated.
            </div>
          )}

          {manifest.positions.map((pos) => {
            const total = pos.totalVotes;
            return (
              <div key={pos.positionId} className="rounded-xl border border-gray-300 bg-white overflow-hidden">
                {/* Position header */}
                <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">{pos.positionTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {pos.positionScope}
                      {pos.jurisdictionValue && ` · ${pos.jurisdictionValue}`}
                      {pos.jurisdictionLevel && ` (${pos.jurisdictionLevel})`}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    {pos.declaredAt && (
                      <p>Declared: {new Date(pos.declaredAt).toLocaleDateString("en-KE", { dateStyle: "medium" })}</p>
                    )}
                    {pos.declaredBy && <p>By Officer: {pos.declaredBy}</p>}
                  </div>
                </div>

                {/* Candidate tally table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-10">Rank</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Candidate</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Votes</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 w-20">%</th>
                      <th className="px-5 py-2.5 print:hidden w-32"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pos.tally.map((c) => {
                      const pct = total > 0 ? ((c.votes / total) * 100).toFixed(1) : "0.0";
                      const isWinner = c.rank === 1;
                      return (
                        <tr key={c.candidateName} className={isWinner ? "bg-green-50" : ""}>
                          <td className="px-5 py-3 text-xs font-bold text-gray-500">
                            {isWinner ? "🏆" : c.rank}
                          </td>
                          <td className="px-5 py-3 font-medium text-gray-900">
                            {c.candidateName}
                            {isWinner && (
                              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                                Winner
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">
                            {c.votes.toLocaleString()}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-500 tabular-nums">{pct}%</td>
                          <td className="px-5 py-3 print:hidden">
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${isWinner ? "bg-green-500" : "bg-blue-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td colSpan={2} className="px-5 py-2.5 text-xs font-bold text-gray-700">TOTAL VALID VOTES</td>
                      <td className="px-5 py-2.5 text-right text-xs font-black text-gray-900 tabular-nums">{total.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-right text-xs text-gray-500">100%</td>
                      <td className="print:hidden" />
                    </tr>
                  </tfoot>
                </table>

                {/* Signature block (for print) */}
                <div className="border-t border-gray-200 px-5 py-4 grid grid-cols-2 gap-8 text-xs text-gray-500">
                  <div>
                    <p className="font-semibold mb-4">Presiding Officer Signature</p>
                    <div className="border-b border-gray-400 mb-1" />
                    <p>Name &amp; Stamp</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-4">Agent Signature (Tallying Centre)</p>
                    <div className="border-b border-gray-400 mb-1" />
                    <p>Name &amp; Party</p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Print audit footer */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 text-center">
            <p>
              This document was generated by VeriVote Kenya on{" "}
              {new Date(manifest.generatedAt).toLocaleString("en-KE")}.
              Form Reference: <strong className="font-mono">{manifest.formReference}</strong>.
              This is an official audit document of the Independent Electoral and Boundaries Commission.
              Any alteration constitutes a criminal offence under the Elections Act, 2011.
            </p>
          </div>

          {printed && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 text-center print:hidden">
              Print recorded. Keep this document as physical audit evidence. Form Ref: <strong className="font-mono">{manifest.formReference}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
