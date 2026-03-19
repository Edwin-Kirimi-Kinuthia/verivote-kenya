"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { ApiResponse } from "@/lib/types";

type ElectionType   = "GOVERNMENT" | "INSTITUTIONAL" | "CORPORATE" | "CUSTOM";
type ElectionStatus = "NOMINATIONS" | "ACTIVE" | "CLOSED" | "TALLIED" | "ARCHIVED";
type AuthMethod     = "PERSONA_KYC" | "EMAIL_DOMAIN" | "OTP_ONLY";

interface PublicElection {
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
  _count: { votes: number; enrollments: number };
}

const TYPE_LABELS: Record<ElectionType, string> = {
  GOVERNMENT:    "General Election",
  INSTITUTIONAL: "Institutional",
  CORPORATE:     "Corporate",
  CUSTOM:        "Custom",
};

const TYPE_COLORS: Record<ElectionType, string> = {
  GOVERNMENT:    "bg-green-100 text-green-800",
  INSTITUTIONAL: "bg-blue-100 text-blue-800",
  CORPORATE:     "bg-purple-100 text-purple-800",
  CUSTOM:        "bg-gray-100 text-gray-800",
};

const STATUS_COLORS: Record<ElectionStatus, string> = {
  NOMINATIONS: "bg-yellow-100 text-yellow-800",
  ACTIVE:      "bg-green-100 text-green-800",
  CLOSED:      "bg-gray-100 text-gray-600",
  TALLIED:     "bg-blue-100 text-blue-800",
  ARCHIVED:    "bg-gray-100 text-gray-500",
};

const AUTH_LABELS: Record<AuthMethod, string> = {
  PERSONA_KYC:  "KYC Required",
  EMAIL_DOMAIN: "Institutional Email",
  OTP_ONLY:     "Open (OTP)",
};

const AUTH_COLORS: Record<AuthMethod, string> = {
  PERSONA_KYC:  "bg-indigo-100 text-indigo-800",
  EMAIL_DOMAIN: "bg-blue-100 text-blue-800",
  OTP_ONLY:     "bg-gray-100 text-gray-700",
};

export default function PublicElectionsPage() {
  const router = useRouter();
  const [elections, setElections] = useState<PublicElection[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [filter, setFilter]       = useState<"ALL" | ElectionStatus>("ACTIVE");

  useEffect(() => {
    api
      .get<ApiResponse<PublicElection[]>>("/api/elections/public")
      .then((res) => {
        if (res.success && res.data) setElections(res.data);
        else setError(res.error ?? "Failed to load elections");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = filter === "ALL"
    ? elections
    : elections.filter((e) => e.status === filter);

  const activeCount = elections.filter((e) => e.status === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center font-black text-lg hover:bg-white/30 transition-colors"
            >
              V
            </button>
            <div>
              <h1 className="font-bold text-lg leading-tight">Elections</h1>
              <p className="text-green-200 text-xs">VeriVote Kenya — Voter Portal</p>
            </div>
          </div>
          {activeCount > 0 && (
            <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-semibold">
              {activeCount} active
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Filter tabs */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {(["ALL", "ACTIVE", "NOMINATIONS", "CLOSED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === s
                  ? "bg-green-700 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
              }`}
            >
              {s === "ALL" ? "All Elections" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && shown.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">No elections found.</p>
          </div>
        )}

        <div className="space-y-4">
          {shown.map((election) => (
            <button
              key={election.id}
              type="button"
              onClick={() => router.push(`/elections/${election.id}`)}
              className="group w-full rounded-xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:border-green-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[election.type]}`}>
                      {TYPE_LABELS[election.type]}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[election.status]}`}>
                      {election.status.charAt(0) + election.status.slice(1).toLowerCase()}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${AUTH_COLORS[election.authMethod]}`}>
                      {AUTH_LABELS[election.authMethod]}
                    </span>
                    {election.orgName && (
                      <span className="text-xs text-gray-500">{election.orgName}</span>
                    )}
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-gray-900 group-hover:text-green-700">
                    {election.name}
                  </h2>
                  {election.description && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{election.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    {election.endDate && (
                      <span>
                        Closes{" "}
                        {new Date(election.endDate).toLocaleDateString("en-KE", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </span>
                    )}
                    {election._count.votes > 0 && (
                      <span>{election._count.votes.toLocaleString()} votes cast</span>
                    )}
                  </div>
                </div>
                <svg
                  className="mt-1 h-5 w-5 shrink-0 text-gray-400 group-hover:text-green-700"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
