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

const CAN_PARTICIPATE: ElectionStatus[] = ["NOMINATIONS", "ACTIVE"];

export default function PublicElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();
  const [election, setElection] = useState<PublicElectionDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    api
      .get<ApiResponse<PublicElectionDetail>>(`/api/elections/public/${id}`)
      .then((res) => {
        if (res.success && res.data) setElection(res.data);
        else setError(res.error ?? "Election not found");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
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
  const canParticipate = CAN_PARTICIPATE.includes(election.status);

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

        {/* Participate CTA */}
        {canParticipate && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
            <h2 className="text-base font-semibold text-green-900 mb-1">Ready to participate?</h2>
            <p className="text-sm text-green-700 mb-4">
              Register and authenticate to cast your vote in this election.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/register?electionId=${election.id}`)}
              className="rounded-lg bg-green-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2"
            >
              Register &amp; Participate
            </button>
            <p className="mt-2 text-xs text-green-600">
              Already registered?{" "}
              <button
                type="button"
                onClick={() => router.push("/vote")}
                className="font-medium underline hover:no-underline"
              >
                Sign in to vote
              </button>
            </p>
          </div>
        )}

        {!canParticipate && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-center text-sm text-gray-500">
            This election is not currently accepting participation ({statusInfo.label}).
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
