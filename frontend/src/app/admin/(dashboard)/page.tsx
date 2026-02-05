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

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [recent, setRecent] = useState<Voter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, votersRes] = await Promise.all([
          api.get<ApiResponse<ReviewStats>>("/api/admin/review-stats"),
          api.get<{ success: boolean } & PaginatedResponse<Voter>>(
            "/api/voters?page=1&limit=5"
          ),
        ]);
        if (statsRes.data) setStats(statsRes.data);
        if (votersRes.data) setRecent(votersRes.data);
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

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
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
            </>
          ) : null}
        </div>

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
