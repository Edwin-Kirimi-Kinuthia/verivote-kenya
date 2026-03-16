"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { ApiResponse } from "@/lib/types";

type ElectionType = "GOVERNMENT" | "INSTITUTIONAL" | "CORPORATE" | "CUSTOM";
type ElectionStatus = "DRAFT" | "NOMINATIONS" | "ACTIVE" | "CLOSED" | "TALLIED" | "ARCHIVED";

interface ElectionListItem {
  id: string;
  name: string;
  type: ElectionType;
  status: ElectionStatus;
  orgName: string | null;
  startDate: string | null;
  endDate: string | null;
  _count: { positions: number; votes: number; enrollments: number };
}

interface ElectionListResponse {
  total: number;
  page: number;
  limit: number;
  items: ElectionListItem[];
}

const TYPE_LABELS: Record<ElectionType, string> = {
  GOVERNMENT: "Government",
  INSTITUTIONAL: "Institutional",
  CORPORATE: "Corporate",
  CUSTOM: "Custom",
};

const STATUS_COLOURS: Record<ElectionStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  NOMINATIONS: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  CLOSED: "bg-orange-100 text-orange-800",
  TALLIED: "bg-blue-100 text-blue-800",
  ARCHIVED: "bg-gray-200 text-gray-500",
};

const STATUS_NEXT: Record<ElectionStatus, ElectionStatus | null> = {
  DRAFT: "NOMINATIONS",
  NOMINATIONS: "ACTIVE",
  ACTIVE: "CLOSED",
  CLOSED: "TALLIED",
  TALLIED: "ARCHIVED",
  ARCHIVED: null,
};

export default function AdminElectionsPage() {
  const router = useRouter();
  const [elections, setElections] = useState<ElectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState<string | null>(null);

  useEffect(() => {
    fetchElections();
  }, []);

  async function fetchElections() {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<ElectionListResponse>>("/api/elections");
      if (res.success && res.data) setElections(res.data.items);
      else setError(res.error ?? "Failed to load elections");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(election: ElectionListItem) {
    if (!confirm(`Permanently delete "${election.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/elections/${election.id}`);
      await fetchElections();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete election");
    }
  }

  async function advanceStatus(election: ElectionListItem) {
    const next = STATUS_NEXT[election.status];
    if (!next) return;
    if (!confirm(`Advance "${election.name}" from ${election.status} → ${next}?`)) return;
    setTransitioning(election.id);
    try {
      await api.patch(`/api/elections/${election.id}/status`, { status: next });
      await fetchElections();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to advance status");
    } finally {
      setTransitioning(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Elections</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage all elections — government, institutional, and corporate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/admin/elections/new")}
          className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Election
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
        </div>
      ) : elections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <svg className="mx-auto mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-500">No elections yet. Create the first one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Election</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Positions</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Votes Cast</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Dates</th>
                <th className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {elections.map((election) => (
                <tr key={election.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{election.name}</div>
                    {election.orgName && (
                      <div className="text-xs text-gray-500">{election.orgName}</div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-gray-700">{TYPE_LABELS[election.type]}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOURS[election.status]}`}>
                      {election.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">{election._count.positions}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">{election._count.votes}</td>
                  <td className="px-4 py-4 text-xs text-gray-500">
                    {election.startDate
                      ? new Date(election.startDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                    {election.endDate && (
                      <>
                        {" → "}
                        {new Date(election.endDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/elections/${election.id}`)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                      >
                        Manage
                      </button>
                      {STATUS_NEXT[election.status] && (
                        <button
                          type="button"
                          onClick={() => advanceStatus(election)}
                          disabled={transitioning === election.id}
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {transitioning === election.id ? "…" : `→ ${STATUS_NEXT[election.status]}`}
                        </button>
                      )}
                      {election.status === "DRAFT" && (
                        <button
                          type="button"
                          onClick={() => handleDelete(election)}
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
