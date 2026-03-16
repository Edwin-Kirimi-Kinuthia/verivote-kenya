"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import type { ApiResponse, ElectionSummary } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  GOVERNMENT: "General Election",
  INSTITUTIONAL: "Institutional",
  CORPORATE: "Corporate",
  CUSTOM: "Custom",
};

const TYPE_COLORS: Record<string, string> = {
  GOVERNMENT: "bg-green-100 text-green-800",
  INSTITUTIONAL: "bg-blue-100 text-blue-800",
  CORPORATE: "bg-purple-100 text-purple-800",
  CUSTOM: "bg-gray-100 text-gray-800",
};

export default function ElectionsSelectionPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/vote");
    }
  }, [isLoading, token, router]);

  useEffect(() => {
    if (!token) return;
    api
      .get<ApiResponse<ElectionSummary[]>>("/api/ballot/active")
      .then((res) => {
        if (res.success && res.data) setElections(res.data);
        else setError(res.error ?? "Failed to load elections");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (isLoading || !token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Active Elections</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select an election below to cast your vote.
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && elections.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <svg
            className="mx-auto mb-3 h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-base font-medium text-gray-500">
            No active elections available for your polling station.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {elections.map((election) => (
          <button
            key={election.electionId}
            type="button"
            onClick={() => router.push(`/vote/ballot?electionId=${election.electionId}`)}
            className="group w-full rounded-xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:border-green-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      TYPE_COLORS[election.type] ?? "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {TYPE_LABELS[election.type] ?? election.type}
                  </span>
                  {election.orgName && (
                    <span className="text-xs text-gray-500">{election.orgName}</span>
                  )}
                </div>
                <h2 className="mt-2 text-base font-semibold text-gray-900 group-hover:text-green-700">
                  {election.name}
                </h2>
                <p className="mt-2 text-xs text-gray-400">
                  {election.positionCount} position{election.positionCount !== 1 ? "s" : ""}
                  {election.endDate && (
                    <>
                      {" · "}Closes{" "}
                      {new Date(election.endDate).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </>
                  )}
                </p>
              </div>
              <svg
                className="mt-1 h-5 w-5 shrink-0 text-gray-400 group-hover:text-green-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
