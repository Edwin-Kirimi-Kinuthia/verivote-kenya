"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { ApiResponse } from "@/lib/types";

type ElectionType   = "GOVERNMENT" | "INSTITUTIONAL" | "CORPORATE" | "CUSTOM";
type ElectionStatus = "NOMINATIONS" | "ACTIVE" | "CLOSED" | "TALLIED" | "ARCHIVED";
type AuthMethod     = "PERSONA_KYC" | "EMAIL_DOMAIN" | "OTP_ONLY";

interface PublicPosition {
  id: string;
  title: string;
  scope: string;
  candidates: { id: string; name: string; party: string | null }[];
}

interface PublicElectionDetail {
  id: string;
  name: string;
  description: string | null;
  type: ElectionType;
  status: ElectionStatus;
  orgName: string | null;
  authMethod: AuthMethod;
  allowedDomains: string[];
  startDate: string | null;
  endDate: string | null;
  positions: PublicPosition[];
  _count: { votes: number; enrollments: number };
  countryCode: string | null;
  eligibilityNote: string | null;
}

interface DeclaredResult {
  id: string;
  positionId: string;
  positionTitle: string | null;
  positionScope: string | null;
  positionScopeValue: string | null;
  tallySnapshot: Record<string, number> | null;
  declaredAt: string | null;
  jurisdictionLevel: string | null;
  jurisdictionValue: string | null;
}

const TYPE_LABELS: Record<ElectionType, string> = {
  GOVERNMENT:    "General Election",
  INSTITUTIONAL: "Institutional Election",
  CORPORATE:     "Corporate Election",
  CUSTOM:        "Custom Election",
};

const AUTH_INFO: Record<AuthMethod, { label: string; color: string; icon: string; detail: string }> = {
  PERSONA_KYC: {
    label:  "Government ID / KYC Required",
    color:  "bg-indigo-50 border-indigo-200 text-indigo-900",
    icon:   "🪪",
    detail: "You will need to verify your identity with a government-issued ID or passport through Persona KYC.",
  },
  EMAIL_DOMAIN: {
    label:  "Institutional Email Required",
    color:  "bg-blue-50 border-blue-200 text-blue-900",
    icon:   "📧",
    detail: "You will need an email address from an approved institution or domain to participate.",
  },
  OTP_ONLY: {
    label:  "Email or Phone — OTP Verification",
    color:  "bg-gray-50 border-gray-200 text-gray-900",
    icon:   "💬",
    detail: "Any email address or phone number. You will receive a one-time code to verify.",
  },
};

const STATUS_LABELS: Record<ElectionStatus, { label: string; color: string }> = {
  NOMINATIONS: { label: "Accepting Nominations",  color: "bg-yellow-100 text-yellow-800" },
  ACTIVE:      { label: "Voting Open",            color: "bg-green-100 text-green-800" },
  CLOSED:      { label: "Voting Closed",          color: "bg-gray-100 text-gray-600" },
  TALLIED:     { label: "Results Available",      color: "bg-blue-100 text-blue-800" },
  ARCHIVED:    { label: "Archived",               color: "bg-gray-100 text-gray-500" },
};


export default function PublicElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const [election, setElection] = useState<PublicElectionDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [declarations, setDeclarations] = useState<DeclaredResult[]>([]);

  useEffect(() => {
    api
      .get<ApiResponse<PublicElectionDetail>>(`/api/elections/public/${id}`)
      .then((res) => {
        if (res.success && res.data) setElection(res.data);
        else setError(res.error ?? "Election not found");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    // Fetch declared results (public endpoint — no auth required)
    api
      .get<ApiResponse<DeclaredResult[]>>(`/api/declarations/public/${id}`)
      .then((res) => {
        if (res.success && res.data) setDeclarations(res.data);
      })
      .catch(() => {}); // silently ignore — results may not be available yet
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
        <p className="text-gray-600">{error || "Election not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/elections")}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800"
        >
          Back to Elections
        </button>
      </div>
    );
  }

  const authInfo = AUTH_INFO[election.authMethod];
  const statusInfo = STATUS_LABELS[election.status];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/elections")}
            className="flex items-center gap-1 text-green-200 hover:text-white text-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Elections
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Election header */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {TYPE_LABELS[election.type]}
            </span>
            {election.orgName && (
              <span className="text-sm text-gray-500">{election.orgName}</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{election.name}</h1>
          {election.description && (
            <p className="mt-2 text-sm text-gray-600">{election.description}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
            {election.startDate && (
              <span>
                Opens: {new Date(election.startDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
            {election.endDate && (
              <span>
                Closes: {new Date(election.endDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
            {election._count.votes > 0 && (
              <span>{election._count.votes.toLocaleString()} votes cast</span>
            )}
          </div>
        </div>

        {/* Eligibility note (country-specific requirements) */}
        {(election.countryCode || election.eligibilityNote) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              {election.countryCode && (
                <span className="shrink-0 rounded-md bg-amber-100 border border-amber-300 px-2 py-1 text-xs font-bold text-amber-800 tracking-wider">
                  {election.countryCode}
                </span>
              )}
              <div>
                <h2 className="text-sm font-semibold text-amber-900">Eligibility Requirements</h2>
                {election.eligibilityNote && (
                  <p className="mt-1 text-sm text-amber-800">{election.eligibilityNote}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Authentication requirement */}
        <div className={`rounded-xl border p-5 ${authInfo.color}`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">{authInfo.icon}</span>
            <div>
              <h2 className="font-semibold text-sm">{authInfo.label}</h2>
              <p className="mt-1 text-sm opacity-80">{authInfo.detail}</p>
              {election.authMethod === "EMAIL_DOMAIN" && (election.allowedDomains ?? []).length > 0 && (
                <p className="mt-2 text-xs font-medium opacity-90">
                  Approved domains: {election.allowedDomains.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Register CTA — only for open elections */}
        {(election.status === "ACTIVE" || election.status === "NOMINATIONS") && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-green-900 text-sm">
                {election.status === "ACTIVE" ? "Voting is open" : "Nominations are open"}
              </h2>
              <p className="text-xs text-green-700 mt-0.5">
                Register to participate in this election.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/register?electionId=${election.id}`)}
              className="shrink-0 rounded-lg bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 transition-colors"
            >
              Register to Vote
            </button>
          </div>
        )}


        {/* Declared results (TALLIED elections) */}
        {declarations.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">
            <div className="bg-blue-700 text-white px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">Official Declared Results</h2>
                <p className="text-xs text-blue-200 mt-0.5">
                  {declarations.length} position{declarations.length !== 1 ? "s" : ""} declared
                </p>
              </div>
              <span className="text-xl">🏛️</span>
            </div>
            <div className="divide-y divide-gray-100">
              {declarations.map((decl) => {
                const tally = decl.tallySnapshot;
                const entries = tally ? Object.entries(tally) : [];
                const total = entries.reduce((s, [, v]) => s + v, 0);
                const sorted = [...entries].sort(([, a], [, b]) => b - a);
                const winner = sorted[0];
                return (
                  <div key={decl.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {decl.positionTitle ?? "Position"}
                      </h3>
                      {decl.positionScope && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {decl.positionScope}
                        </span>
                      )}
                      {decl.jurisdictionValue && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          {decl.jurisdictionValue}
                        </span>
                      )}
                      {decl.declaredAt && (
                        <span className="ml-auto text-xs text-gray-400">
                          Declared {new Date(decl.declaredAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                    {sorted.length > 0 ? (
                      <div className="space-y-2">
                        {sorted.map(([name, votes], i) => {
                          const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                          return (
                            <div key={name}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={`font-medium ${i === 0 ? "text-green-700" : "text-gray-600"}`}>
                                  {name} {i === 0 ? "🏆" : ""}
                                </span>
                                <span className="text-gray-500">{votes.toLocaleString()} ({pct}%)</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${i === 0 ? "bg-green-500" : "bg-blue-400"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {winner && (
                          <p className="text-xs text-green-700 font-medium pt-1 border-t border-green-100">
                            Winner: <strong>{winner[0]}</strong> — {winner[1].toLocaleString()} of {total.toLocaleString()} votes
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No tally data available.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Positions */}
        {election.positions.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Positions ({election.positions.length})
            </h2>
            <div className="space-y-4">
              {election.positions.map((pos) => (
                <div key={pos.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">{pos.title}</h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {pos.scope}
                    </span>
                  </div>
                  {pos.candidates.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {pos.candidates.map((c) => (
                        <li key={c.id} className="text-xs text-gray-600">
                          {c.name}{c.party ? ` — ${c.party}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
