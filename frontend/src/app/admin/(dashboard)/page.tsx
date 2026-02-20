"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { StatCard } from "@/components/stat-card";
import { CardSkeleton } from "@/components/loading-skeleton";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import type {
  ApiResponse,
  ReviewStats,
  PaginatedResponse,
  Voter,
  DistressVote,
  ColumnDef,
} from "@/lib/types";

const recentColumns: ColumnDef<Voter>[] = [
  { key: "nationalId", header: "National ID" },
  {
    key: "status",
    header: "Status",
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "sbtAddress",
    header: "SBT Address",
    render: (row) =>
      row.sbtAddress
        ? `${row.sbtAddress.slice(0, 6)}...${row.sbtAddress.slice(-4)}`
        : "—",
  },
  {
    key: "createdAt",
    header: "Registered",
    render: (row) => new Date(row.createdAt).toLocaleDateString(),
  },
];

const distressColumns: ColumnDef<DistressVote>[] = [
  { key: "serialNumber", header: "Serial Number" },
  {
    key: "pollingStation",
    header: "Polling Station",
    render: (row) => row.pollingStation?.name ?? "—",
  },
  {
    key: "timestamp",
    header: "Cast At",
    render: (row) => new Date(row.timestamp).toLocaleString(),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        {row.status}
      </span>
    ),
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [recent, setRecent] = useState<Voter[]>([]);
  const [distressVotes, setDistressVotes] = useState<DistressVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, votersRes, distressRes] = await Promise.all([
          api.get<ApiResponse<ReviewStats>>("/api/admin/review-stats"),
          api.get<{ success: boolean } & PaginatedResponse<Voter>>(
            "/api/voters?page=1&limit=5"
          ),
          api.get<{ success: boolean } & PaginatedResponse<DistressVote>>(
            "/api/admin/distress-votes?page=1&limit=10"
          ),
        ]);
        if (statsRes.data) setStats(statsRes.data);
        if (votersRes.data) setRecent(votersRes.data);
        if (distressRes.data) setDistressVotes(distressRes.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
          ) : stats ? (
            <>
              <StatCard
                title="Total Voters"
                value={stats.totalVoters}
                borderColor="border-blue-500"
              />
              <StatCard
                title="SBTs Minted"
                value={stats.totalRegistered}
                borderColor="border-green-500"
              />
              <StatCard
                title="Pending Reviews"
                value={stats.pendingReviews}
                borderColor="border-yellow-500"
              />
              <StatCard
                title="Failed Verifications"
                value={stats.totalFailed}
                borderColor="border-red-500"
              />
              <StatCard
                title="Distress Votes"
                value={stats.distressFlagged}
                borderColor={stats.distressFlagged > 0 ? "border-red-600" : "border-gray-300"}
              />
            </>
          ) : null}
        </div>

        {!loading && stats && stats.distressFlagged > 0 && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-800">
                  {stats.distressFlagged} vote{stats.distressFlagged !== 1 ? "s" : ""} cast under distress — immediate investigation required
                </p>
                <p className="mt-1 text-xs text-red-700">
                  These votes were submitted using a distress PIN, indicating the voter may have been coerced. Review the records below and contact the relevant polling station immediately.
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && distressVotes.length > 0 && (
          <div className="mb-6 rounded-lg border border-red-200 bg-white">
            <div className="border-b border-red-200 bg-red-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-red-900">
                Distress-Flagged Votes
              </h2>
            </div>
            <DataTable columns={distressColumns} data={distressVotes} />
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Recent Registrations
            </h2>
          </div>
          {loading ? (
            <div className="p-4">
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-4 rounded bg-gray-200" />
                ))}
              </div>
            </div>
          ) : (
            <DataTable
              columns={recentColumns}
              data={recent}
              onRowClick={(row) => router.push(`/admin/voters/${row.id}`)}
            />
          )}
        </div>
      </div>
    </>
  );
}
