"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ElectionItem {
  id: string;
  name: string;
  status: string;
  type: string;
  tallyResultJson: string | null;
}

interface CandidateInfo {
  id: string;
  name: string;
  party: string | null;
  scopeValue: string | null;
}

interface PendingPosition {
  positionId: string;
  positionTitle: string;
  scope: string;
  scopeValue: string | null;
  candidates: CandidateInfo[];
  declaration: { id: string; status: string } | null;
}

interface TallyResult {
  positions: {
    positionId: string;
    candidates: { candidateId: string; votes: number }[];
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "bg-yellow-100 text-yellow-800",
  DECLARED:  "bg-green-100 text-green-800",
  CONTESTED: "bg-red-100 text-red-800",
  ANNULLED:  "bg-gray-100 text-gray-500",
};

const ELECTION_STATUS_COLORS: Record<string, string> = {
  CLOSED:  "bg-orange-100 text-orange-700",
  TALLIED: "bg-green-100 text-green-700",
};

function VoteBar({ votes, total }: { votes: number; total: number }) {
  const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-16 text-right">{votes} ({pct}%)</span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DeclarationsPage() {
  const { voter } = useAuth();

  const [elections, setElections] = useState<ElectionItem[]>([]);
  const [selectedElection, setSelectedElection] = useState<ElectionItem | null>(null);
  const [positions, setPositions] = useState<PendingPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [posLoading, setPosLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const staffRole      = voter?.staffRole;
  const jurisdictionLevel = voter?.jurisdictionLevel ?? "NATIONAL";
  const jurisdictionValue = voter?.jurisdictionValue ?? null;

  // Load elections available for declaration (CLOSED or TALLIED)
  const loadElections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { items: ElectionItem[] } }>(
        "/api/elections?limit=50"
      );
      const items = (res.data?.items ?? []).filter(
        (e: ElectionItem) => e.status === "CLOSED" || e.status === "TALLIED"
      );
      setElections(items);
      if (items.length === 1) setSelectedElection(items[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load elections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadElections(); }, [loadElections]);

  // Load pending positions when election is selected
  const loadPositions = useCallback(async (election: ElectionItem) => {
    setPosLoading(true);
    setPositions([]);
    try {
      const res = await api.get<{ success: boolean; data: PendingPosition[] }>(
        `/api/declarations/pending/${election.id}`
      );
      setPositions(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load positions");
    } finally {
      setPosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedElection) loadPositions(selectedElection);
  }, [selectedElection, loadPositions]);

  // Parse tally result from selected election
  const tallyResult: TallyResult | null = (() => {
    if (!selectedElection?.tallyResultJson) return null;
    try { return JSON.parse(selectedElection.tallyResultJson); }
    catch { return null; }
  })();

  function getVotesForCandidate(candidateId: string): number {
    if (!tallyResult) return 0;
    for (const pos of tallyResult.positions) {
      const found = pos.candidates.find(c => c.candidateId === candidateId);
      if (found !== undefined) return found.votes;
    }
    return 0;
  }

  async function handleDeclare(position: PendingPosition) {
    if (!selectedElection) return;

    // Build tally snapshot for this position's candidates
    const snapshot: Record<string, number> = {};
    for (const c of position.candidates) {
      snapshot[c.id] = getVotesForCandidate(c.id);
    }

    setDeclaring(position.positionId);
    setMessage(null);
    try {
      if (!position.declaration) {
        // Create draft declaration first
        const res = await api.post<{ success: boolean; data: { id: string } }>("/api/declarations", {
          electionId:    selectedElection.id,
          positionId:    position.positionId,
          tallySnapshot: snapshot,
        });
        const declId = res.data?.id;
        if (declId) {
          // Immediately formally declare
          await api.post(`/api/declarations/${declId}/declare`, {});
          setMessage(`Results declared for ${position.positionTitle}`);
        }
      } else if (position.declaration.status === "DRAFT") {
        await api.post(`/api/declarations/${position.declaration.id}/declare`, {});
        setMessage(`Results formally declared for ${position.positionTitle}`);
      }
      await loadPositions(selectedElection);
    } catch (e) {
      setMessage(e instanceof Error ? `Error: ${e.message}` : "Declaration failed");
    } finally {
      setDeclaring(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const canDeclare = ["CHAIRPERSON", "COMMISSIONER", "NATIONAL_RO", "COUNTY_RO", "CONSTITUENCY_RO", "PRESIDING_OFFICER"].includes(staffRole ?? "");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Result Declarations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Formally declare election results for positions in your jurisdiction.
            Only available once an election is closed and tallied.
          </p>
        </div>
        {/* Officer badge */}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-right">
          <p className="text-xs text-gray-500">Your jurisdiction</p>
          <p className="font-semibold text-gray-800 text-sm">{staffRole?.replace(/_/g, " ") ?? "ADMIN"}</p>
          {jurisdictionValue && (
            <p className="text-xs text-blue-600 font-medium mt-0.5">{jurisdictionValue}</p>
          )}
        </div>
      </div>

      {/* Election selector */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Election</label>
        {loading ? (
          <div className="text-sm text-gray-400">Loading elections…</div>
        ) : elections.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No elections are currently CLOSED or TALLIED. Ask a Commissioner to close the election first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {elections.map(e => (
              <button
                key={e.id}
                onClick={() => setSelectedElection(e)}
                className={`rounded-lg border px-4 py-2.5 text-left transition-all ${
                  selectedElection?.id === e.id
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-300"
                    : "border-gray-200 bg-white hover:border-blue-300"
                }`}
              >
                <p className="text-sm font-medium text-gray-800">{e.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${ELECTION_STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {e.status}
                  </span>
                  {e.tallyResultJson && (
                    <span className="text-xs text-green-600 font-medium">✓ Tally complete</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message toast */}
      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          message.startsWith("Error") ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
        }`}>
          {message}
        </div>
      )}

      {/* Positions list */}
      {selectedElection && (
        <div className="space-y-4">
          {posLoading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
              Loading positions…
            </div>
          ) : positions.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm text-gray-500">No positions in your jurisdiction for this election.</p>
            </div>
          ) : (
            positions.map(pos => {
              const total = pos.candidates.reduce((s, c) => s + getVotesForCandidate(c.id), 0);
              const sorted = [...pos.candidates].sort(
                (a, b) => getVotesForCandidate(b.id) - getVotesForCandidate(a.id)
              );
              const winner = sorted[0];
              const isDeclared = pos.declaration?.status === "DECLARED";
              const isDraft    = pos.declaration?.status === "DRAFT";
              const isContested = pos.declaration?.status === "CONTESTED";

              return (
                <div
                  key={pos.positionId}
                  className={`rounded-xl border-2 overflow-hidden ${
                    isDeclared ? "border-green-400" : isDraft ? "border-yellow-400" : isContested ? "border-red-400" : "border-gray-200"
                  } bg-white shadow-sm`}
                >
                  {/* Position header */}
                  <div className={`flex items-center justify-between px-5 py-4 ${
                    isDeclared ? "bg-green-50" : isDraft ? "bg-yellow-50" : "bg-gray-50"
                  }`}>
                    <div>
                      <h3 className="font-semibold text-gray-900">{pos.positionTitle}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">
                          {pos.scope}
                        </span>
                        {pos.scopeValue && (
                          <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                            {pos.scopeValue}
                          </span>
                        )}
                        {jurisdictionValue && !pos.scopeValue && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">
                            {jurisdictionValue} (filtered)
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{total} total votes</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {pos.declaration && (
                        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_COLORS[pos.declaration.status]}`}>
                          {pos.declaration.status}
                        </span>
                      )}
                      {canDeclare && !isDeclared && !isContested && (
                        <button
                          onClick={() => handleDeclare(pos)}
                          disabled={declaring === pos.positionId}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {declaring === pos.positionId
                            ? "Declaring…"
                            : isDraft ? "Confirm Declaration" : "Declare Results"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Candidate results */}
                  <div className="p-5 space-y-3">
                    {!tallyResult && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3">
                        Tally not yet complete. Run the homomorphic ceremony first to see vote counts.
                      </div>
                    )}
                    {sorted.map((c, i) => (
                      <div key={c.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {i === 0 && isDeclared && (
                              <span className="text-base" title="Declared winner">🏆</span>
                            )}
                            <span className={`font-medium ${i === 0 ? "text-gray-900" : "text-gray-600"}`}>
                              {c.name}
                            </span>
                            {c.party && (
                              <span className="text-xs text-gray-400">({c.party})</span>
                            )}
                            {c.scopeValue && (
                              <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                                {c.scopeValue}
                              </span>
                            )}
                          </div>
                        </div>
                        <VoteBar votes={getVotesForCandidate(c.id)} total={total} />
                      </div>
                    ))}

                    {isDeclared && winner && (
                      <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5">
                        <p className="text-sm font-semibold text-green-800">
                          Declared winner: {winner.name}
                          {winner.party && <span className="font-normal text-green-600"> — {winner.party}</span>}
                        </p>
                        <p className="text-xs text-green-600 mt-0.5">
                          {getVotesForCandidate(winner.id)} votes
                          {total > 0 ? ` (${Math.round((getVotesForCandidate(winner.id) / total) * 100)}%)` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600">Declaration roles &amp; scope</p>
        <p>• <strong>Government elections</strong> — Commissioner / National RO can declare all positions. County RO declares county-level positions for their county. Constituency RO declares constituency positions for their constituency.</p>
        <p>• <strong>Institutional / Corporate / Custom elections</strong> — Commissioner or National RO can declare all positions. No geographic restriction applies.</p>
        <p>Declarations can only be made after an election is CLOSED and the homomorphic ceremony is complete.</p>
      </div>
    </div>
  );
}
