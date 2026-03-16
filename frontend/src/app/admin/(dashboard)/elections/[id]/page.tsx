"use client";

import { useState, useEffect, use, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { ApiResponse } from "@/lib/types";

type PositionScope = "NATIONAL" | "COUNTY" | "CONSTITUENCY" | "WARD" | "CUSTOM";
type ElectionStatus = "DRAFT" | "NOMINATIONS" | "ACTIVE" | "CLOSED" | "TALLIED" | "ARCHIVED";
type ElectionType = "GOVERNMENT" | "INSTITUTIONAL" | "CORPORATE" | "CUSTOM";

interface CandidateDetail {
  id: string;
  name: string;
  party: string | null;
  ballotNumber: number | null;
  isActive: boolean;
  scopeValue: string | null;
}

interface PositionDetail {
  id: string;
  title: string;
  description: string | null;
  scope: PositionScope;
  scopeValue: string | null;
  maxVotesPerVoter: number;
  orderIndex: number;
  candidates: CandidateDetail[];
}

interface ElectionDetail {
  id: string;
  name: string;
  description: string | null;
  type: ElectionType;
  status: ElectionStatus;
  orgName: string | null;
  startDate: string | null;
  endDate: string | null;
  positions: PositionDetail[];
  _count: { votes: number; enrollments: number };
}

const SCOPE_LABELS: Record<PositionScope, string> = {
  NATIONAL:      "National",
  COUNTY:        "County",
  CONSTITUENCY:  "Constituency",
  WARD:          "Ward",
  CUSTOM:        "Custom (Enrollment)",
};

const STATUS_COLOURS: Record<ElectionStatus, string> = {
  DRAFT:       "bg-gray-100 text-gray-700",
  NOMINATIONS: "bg-yellow-100 text-yellow-800",
  ACTIVE:      "bg-green-100 text-green-800",
  CLOSED:      "bg-orange-100 text-orange-800",
  TALLIED:     "bg-blue-100 text-blue-800",
  ARCHIVED:    "bg-gray-200 text-gray-500",
};

// Status-transition actions shown in the header
interface StatusAction {
  label: string;
  next: ElectionStatus;
  style: "primary" | "danger" | "ghost";
}

function getStatusActions(status: ElectionStatus): StatusAction[] {
  switch (status) {
    case "DRAFT":
      return [
        { label: "Submit for Nominations →", next: "NOMINATIONS", style: "primary" },
      ];
    case "NOMINATIONS":
      return [
        { label: "← Back to Draft",   next: "DRAFT",   style: "ghost" },
        { label: "Go Live →",          next: "ACTIVE",  style: "primary" },
      ];
    case "ACTIVE":
      return [{ label: "Close Voting", next: "CLOSED", style: "danger" }];
    case "CLOSED":
      return [{ label: "Begin Tally →", next: "TALLIED", style: "primary" }];
    case "TALLIED":
      return [{ label: "Archive", next: "ARCHIVED", style: "ghost" }];
    default:
      return [];
  }
}

type Tab = "overview" | "ballot";

export default function ElectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [election, setElection] = useState<ElectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  // Status transition
  const [advancingStatus, setAdvancingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Add Position form
  const [addingPosition, setAddingPosition] = useState(false);
  const [positionForm, setPositionForm] = useState({
    title: "",
    description: "",
    scope: "NATIONAL" as PositionScope,
    scopeValue: "",
    maxVotesPerVoter: 1,
  });
  const [positionSaving, setPositionSaving] = useState(false);
  const [positionError, setPositionError] = useState("");

  // Add Candidate (per position)
  const [addingCandidateTo, setAddingCandidateTo] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState({ name: "", party: "", ballotNumber: "", scopeValue: "" });
  const [candidateSaving, setCandidateSaving] = useState(false);
  const [candidateError, setCandidateError] = useState("");

  // Geo data for GOVERNMENT elections
  const [geoCounties, setGeoCounties]             = useState<string[]>([]);
  const [geoConstituencies, setGeoConstituencies] = useState<string[]>([]);
  const [geoWards, setGeoWards]                   = useState<string[]>([]);
  const [posGeoCounty, setPosGeoCounty]           = useState("");
  const [posGeoConstituency, setPosGeoConstituency] = useState("");
  const [posGeoWard, setPosGeoWard]               = useState("");
  // For candidate geo search in template positions
  const [candGeoSearch, setCandGeoSearch]         = useState("");

  useEffect(() => { fetchElection(); }, [id]);

  // Load counties for GOVERNMENT election geo dropdowns
  useEffect(() => {
    api.get<{ success: boolean; data: string[] }>("/api/geo/counties")
      .then(res => setGeoCounties(res.data ?? []))
      .catch(() => {});
  }, []);

  // Load constituencies when posGeoCounty changes
  useEffect(() => {
    if (!posGeoCounty) { setGeoConstituencies([]); setPosGeoConstituency(""); return; }
    api.get<{ success: boolean; data: Array<{ constituency: string }> }>(
      `/api/geo/constituencies?county=${encodeURIComponent(posGeoCounty)}`
    ).then(res => setGeoConstituencies((res.data ?? []).map(r => r.constituency)))
      .catch(() => {});
    setPosGeoConstituency("");
    setPosGeoWard("");
  }, [posGeoCounty]);

  // Load wards when posGeoConstituency changes
  useEffect(() => {
    if (!posGeoConstituency) { setGeoWards([]); setPosGeoWard(""); return; }
    api.get<{ success: boolean; data: Array<{ ward: string }> }>(
      `/api/geo/wards?constituency=${encodeURIComponent(posGeoConstituency)}`
    ).then(res => setGeoWards((res.data ?? []).map(r => r.ward)))
      .catch(() => {});
    setPosGeoWard("");
  }, [posGeoConstituency]);

  async function fetchElection() {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<ElectionDetail>>(`/api/elections/${id}`);
      if (res.success && res.data) setElection(res.data);
      else setError(res.error ?? "Election not found");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvanceStatus(next: ElectionStatus) {
    if (!confirm(`Transition this election to ${next}?`)) return;
    setAdvancingStatus(true);
    setStatusError("");
    try {
      await api.patch(`/api/elections/${id}/status`, { status: next });
      await fetchElection();
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Failed to change status");
    } finally {
      setAdvancingStatus(false);
    }
  }

  async function handleAddPosition(e: FormEvent) {
    e.preventDefault();
    setPositionError("");
    setPositionSaving(true);
    const isGovElection = election?.type === "GOVERNMENT";
    try {
      await api.post(`/api/elections/${id}/positions`, {
        title: positionForm.title,
        description: positionForm.description || undefined,
        scope: isGovElection ? positionForm.scope : "CUSTOM",
        scopeValue: positionForm.scopeValue || undefined,
        maxVotesPerVoter: positionForm.maxVotesPerVoter,
      });
      setAddingPosition(false);
      setPositionForm({ title: "", description: "", scope: isGovElection ? "NATIONAL" : "CUSTOM", scopeValue: "", maxVotesPerVoter: 1 });
      setPosGeoCounty("");
      setPosGeoConstituency("");
      setPosGeoWard("");
      await fetchElection();
    } catch (e) {
      setPositionError(e instanceof Error ? e.message : "Failed to add position");
    } finally {
      setPositionSaving(false);
    }
  }

  async function handleDeletePosition(positionId: string, title: string) {
    if (!confirm(`Delete position "${title}" and all its candidates?`)) return;
    try {
      await api.delete(`/api/elections/positions/${positionId}`);
      await fetchElection();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete position");
    }
  }

  async function handleAddCandidate(e: FormEvent) {
    e.preventDefault();
    if (!addingCandidateTo) return;
    setCandidateError("");
    setCandidateSaving(true);
    try {
      await api.post(`/api/elections/positions/${addingCandidateTo}/candidates`, {
        name: candidateForm.name,
        party: candidateForm.party || undefined,
        ballotNumber: candidateForm.ballotNumber ? parseInt(candidateForm.ballotNumber) : undefined,
        scopeValue: candidateForm.scopeValue.trim() || undefined,
      });
      setAddingCandidateTo(null);
      setCandidateForm({ name: "", party: "", ballotNumber: "", scopeValue: "" });
      setCandGeoSearch("");
      await fetchElection();
    } catch (e) {
      setCandidateError(e instanceof Error ? e.message : "Failed to add candidate");
    } finally {
      setCandidateSaving(false);
    }
  }

  async function handleDeleteCandidate(candidateId: string, name: string) {
    if (!confirm(`Remove candidate "${name}"?`)) return;
    try {
      await api.delete(`/api/elections/candidates/${candidateId}`);
      await fetchElection();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove candidate");
    }
  }

  async function handleDeleteElection() {
    if (!confirm(`Permanently delete "${election?.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/elections/${id}`);
      router.push("/admin/elections");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete election");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-700">
        {error || "Election not found."}
        <button onClick={() => router.back()} className="ml-4 underline">Go back</button>
      </div>
    );
  }

  const canEdit = !["ACTIVE", "CLOSED", "TALLIED", "ARCHIVED"].includes(election.status);
  const statusActions = getStatusActions(election.status);
  const isGov = election.type === "GOVERNMENT";

  const btnStyle = {
    primary: "bg-green-700 text-white hover:bg-green-800",
    danger:  "bg-red-600 text-white hover:bg-red-700",
    ghost:   "border border-gray-300 text-gray-700 hover:bg-gray-50",
  };

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => router.push("/admin/elections")}
          className="mb-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All Elections
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{election.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              {election.orgName && <span>{election.orgName}</span>}
              <span>·</span>
              <span>{election.type}</span>
              <span>·</span>
              <span>{election._count.votes} votes cast</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${STATUS_COLOURS[election.status]}`}>
              {election.status}
            </span>
            {statusActions.map((action) => (
              <button
                key={action.next}
                type="button"
                disabled={advancingStatus}
                onClick={() => handleAdvanceStatus(action.next)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50 ${btnStyle[action.style]}`}
              >
                {advancingStatus ? "…" : action.label}
              </button>
            ))}
            {election.status === "DRAFT" && (
              <button
                type="button"
                onClick={handleDeleteElection}
                className="rounded-lg px-4 py-1.5 text-sm font-semibold border border-red-300 text-red-600 hover:bg-red-50"
              >
                Delete Draft
              </button>
            )}
          </div>
        </div>

        {statusError && (
          <p className="mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{statusError}</p>
        )}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1">
        {(["overview", "ballot"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "ballot" ? "Ballot Setup" : "Overview"}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          {election.description && (
            <p className="text-sm text-gray-700">{election.description}</p>
          )}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-400">Type</dt>
              <dd className="mt-1 text-sm text-gray-900">{election.type}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-400">Status</dt>
              <dd className="mt-1">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOURS[election.status]}`}>
                  {election.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-400">Positions</dt>
              <dd className="mt-1 text-sm text-gray-900">{election.positions.length}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-400">Votes Cast</dt>
              <dd className="mt-1 text-sm text-gray-900">{election._count.votes}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-gray-400">Enrollments</dt>
              <dd className="mt-1 text-sm text-gray-900">{election._count.enrollments}</dd>
            </div>
            {election.startDate && (
              <div>
                <dt className="text-xs font-semibold uppercase text-gray-400">Voting Opens</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(election.startDate).toLocaleString("en-KE")}
                </dd>
              </div>
            )}
            {election.endDate && (
              <div>
                <dt className="text-xs font-semibold uppercase text-gray-400">Voting Closes</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(election.endDate).toLocaleString("en-KE")}
                </dd>
              </div>
            )}
          </dl>

          {/* Status flow guide */}
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Status Flow</p>
            <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
              {(["DRAFT", "NOMINATIONS", "ACTIVE", "CLOSED", "TALLIED", "ARCHIVED"] as ElectionStatus[]).map((s, i, arr) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${
                    s === election.status ? STATUS_COLOURS[s] : "bg-gray-100 text-gray-400"
                  }`}>{s}</span>
                  {i < arr.length - 1 && <span>→</span>}
                </span>
              ))}
            </div>
          </div>

          {!canEdit && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              This election is {election.status.toLowerCase()} — positions and candidates are locked.
            </p>
          )}
        </div>
      )}

      {/* ── Ballot Setup Tab ─────────────────────────────────────────────────── */}
      {tab === "ballot" && (
        <div className="space-y-4">
          {/* Add Position button */}
          {canEdit && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {election.positions.length === 0
                  ? "No positions yet — add one to build the ballot."
                  : `${election.positions.length} position${election.positions.length !== 1 ? "s" : ""} · ${election.positions.reduce((n, p) => n + p.candidates.length, 0)} total candidates`}
              </p>
              <button
                type="button"
                onClick={() => setAddingPosition((v) => !v)}
                className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Position
              </button>
            </div>
          )}

          {/* New Position form */}
          {addingPosition && (
            <form
              onSubmit={handleAddPosition}
              className="rounded-xl border-2 border-green-200 bg-green-50 p-5 space-y-4"
            >
              <h3 className="font-semibold text-gray-900">New Position</h3>
              {positionError && <p className="text-sm text-red-600">{positionError}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Position Title *</label>
                  <input
                    required
                    value={positionForm.title}
                    onChange={(e) => setPositionForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                    placeholder="e.g. Governor, Member of National Assembly, MCA"
                  />
                </div>

                {isGov ? (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-700">Geographic Scope *</label>
                      <select
                        value={positionForm.scope}
                        onChange={(e) => {
                          setPositionForm((f) => ({ ...f, scope: e.target.value as PositionScope, scopeValue: "" }));
                          setPosGeoCounty(""); setPosGeoConstituency(""); setPosGeoWard("");
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                      >
                        <option value="NATIONAL">National — all voters see this</option>
                        <option value="COUNTY">County — filtered by voter&apos;s county</option>
                        <option value="CONSTITUENCY">Constituency — filtered by voter&apos;s constituency</option>
                        <option value="WARD">Ward — filtered by voter&apos;s ward</option>
                      </select>
                    </div>

                    {positionForm.scope === "COUNTY" && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Restrict to specific county? <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <select
                          value={posGeoCounty}
                          onChange={(e) => { setPosGeoCounty(e.target.value); setPositionForm(f => ({ ...f, scopeValue: e.target.value })); }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                        >
                          <option value="">All counties (template position)</option>
                          {geoCounties.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <p className="mt-1 text-xs text-gray-400">
                          {posGeoCounty ? `Only voters in ${posGeoCounty} County see this.` : "Leave blank to make a template — add one candidate per county."}
                        </p>
                      </div>
                    )}
                    {positionForm.scope === "CONSTITUENCY" && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Restrict to specific constituency? <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={posGeoCounty}
                            onChange={(e) => { setPosGeoCounty(e.target.value); setPosGeoConstituency(""); setPositionForm(f => ({ ...f, scopeValue: "" })); }}
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          >
                            <option value="">All constituencies</option>
                            {geoCounties.map(c => <option key={c} value={c}>{c} County</option>)}
                          </select>
                          {posGeoCounty && (
                            <select
                              value={posGeoConstituency}
                              onChange={(e) => { setPosGeoConstituency(e.target.value); setPositionForm(f => ({ ...f, scopeValue: e.target.value })); }}
                              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="">Select constituency</option>
                              {geoConstituencies.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                    {positionForm.scope === "WARD" && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700">
                          Restrict to specific ward? <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          <select
                            value={posGeoCounty}
                            onChange={(e) => { setPosGeoCounty(e.target.value); setPosGeoConstituency(""); setPosGeoWard(""); setPositionForm(f => ({ ...f, scopeValue: "" })); }}
                            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          >
                            <option value="">All wards</option>
                            {geoCounties.map(c => <option key={c} value={c}>{c} County</option>)}
                          </select>
                          {posGeoCounty && (
                            <select
                              value={posGeoConstituency}
                              onChange={(e) => { setPosGeoConstituency(e.target.value); setPosGeoWard(""); setPositionForm(f => ({ ...f, scopeValue: "" })); }}
                              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="">Select constituency</option>
                              {geoConstituencies.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                          {posGeoConstituency && (
                            <select
                              value={posGeoWard}
                              onChange={(e) => { setPosGeoWard(e.target.value); setPositionForm(f => ({ ...f, scopeValue: e.target.value })); }}
                              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="">Select ward</option>
                              {geoWards.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Non-government: no scope selector — all positions use CUSTOM/NATIONAL scope */
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 sm:col-span-2">
                    Scope: <strong>Enrollment-based</strong> — all enrolled members see this position.
                  </div>
                )}

                <div className={["COUNTY", "CONSTITUENCY", "WARD"].includes(positionForm.scope) ? "sm:col-span-2" : ""}>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Description</label>
                  <textarea
                    rows={2}
                    value={positionForm.description}
                    onChange={(e) => setPositionForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                    placeholder="Optional notes about this position"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={positionSaving}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {positionSaving ? "Saving…" : "Save Position"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingPosition(false); setPositionError(""); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Positions with inline candidate management */}
          {election.positions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              {canEdit ? "No positions yet. Add a position above to start building the ballot." : "No positions configured."}
            </div>
          ) : (
            election.positions
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((pos) => (
                <div key={pos.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  {/* Position header */}
                  <div className="flex items-center justify-between bg-gray-50 px-5 py-3 border-b border-gray-100">
                    <div>
                      <h3 className="font-semibold text-gray-900">{pos.title}</h3>
                      <p className="text-xs text-gray-500">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 mr-1">
                          {SCOPE_LABELS[pos.scope]}
                          {pos.scopeValue ? ` — ${pos.scopeValue}` : ""}
                        </span>
                        {pos.candidates.length} candidate{pos.candidates.length !== 1 ? "s" : ""}
                      </p>
                      {pos.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{pos.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingCandidateTo(addingCandidateTo === pos.id ? null : pos.id);
                              setCandidateForm({ name: "", party: "", ballotNumber: "", scopeValue: "" });
                              setCandidateError("");
                            }}
                            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Candidate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePosition(pos.id, pos.title)}
                            className="rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Delete Position
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Add Candidate inline form */}
                  {addingCandidateTo === pos.id && (
                    <form
                      onSubmit={handleAddCandidate}
                      className="border-b border-gray-200 bg-green-50 px-5 py-4 space-y-3"
                    >
                      <p className="text-xs font-semibold text-green-800">New Candidate for "{pos.title}"</p>
                      {candidateError && <p className="text-sm text-red-600">{candidateError}</p>}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-semibold text-gray-700">Full Name *</label>
                          <input
                            required
                            value={candidateForm.name}
                            onChange={(e) => setCandidateForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                            placeholder="Candidate full name"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-700">Ballot #</label>
                          <input
                            type="number"
                            min={1}
                            value={candidateForm.ballotNumber}
                            onChange={(e) => setCandidateForm((f) => ({ ...f, ballotNumber: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                            placeholder="1"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-semibold text-gray-700">Party / Affiliation</label>
                          <input
                            value={candidateForm.party}
                            onChange={(e) => setCandidateForm((f) => ({ ...f, party: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                            placeholder="e.g. Jubilee, ODM, Independent"
                          />
                        </div>
                        {/* Area field — only shown for GOVERNMENT template positions (no position-level scopeValue) */}
                        {isGov && !pos.scopeValue && ["COUNTY", "CONSTITUENCY", "WARD"].includes(pos.scope) && (
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-700">
                              {pos.scope === "COUNTY" ? "County" : pos.scope === "CONSTITUENCY" ? "Constituency" : "Ward"} *
                            </label>
                            <input
                              list={`geo-list-${pos.id}`}
                              required
                              value={candidateForm.scopeValue}
                              onChange={(e) => setCandidateForm((f) => ({ ...f, scopeValue: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
                              placeholder={`Search ${pos.scope === "COUNTY" ? "county" : pos.scope === "CONSTITUENCY" ? "constituency" : "ward"}…`}
                            />
                            <datalist id={`geo-list-${pos.id}`}>
                              {pos.scope === "COUNTY" && geoCounties.map(c => <option key={c} value={c} />)}
                              {pos.scope === "CONSTITUENCY" && geoConstituencies.map(c => <option key={c} value={c} />)}
                              {pos.scope === "WARD" && geoWards.map(w => <option key={w} value={w} />)}
                            </datalist>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={candidateSaving}
                          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                        >
                          {candidateSaving ? "Saving…" : "Add Candidate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingCandidateTo(null); setCandidateError(""); setCandidateForm({ name: "", party: "", ballotNumber: "", scopeValue: "" }); }}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Candidates list */}
                  {pos.candidates.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">
                      No candidates yet{canEdit ? " — click \"Add Candidate\" above." : "."}
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {pos.candidates
                        .sort((a, b) => (a.ballotNumber ?? 99) - (b.ballotNumber ?? 99))
                        .map((c) => (
                          <li key={c.id} className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-3">
                              {c.ballotNumber != null && (
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                                  {c.ballotNumber}
                                </span>
                              )}
                              <div>
                                <span className="font-medium text-gray-900">{c.name}</span>
                                {c.party && (
                                  <span className="ml-2 text-sm text-gray-500">{c.party}</span>
                                )}
                                {c.scopeValue && (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                    {c.scopeValue}
                                  </span>
                                )}
                              </div>
                            </div>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCandidate(c.id, c.name)}
                                className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
