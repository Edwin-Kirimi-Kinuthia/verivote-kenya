"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type { PaginatedResponse, Voter, ColumnDef } from "@/lib/types";

const columns: ColumnDef<Voter>[] = [
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
    key: "sbtTokenId",
    header: "Token ID",
    render: (row) => row.sbtTokenId ?? "—",
  },
  {
    key: "sbtMintedAt",
    header: "Minted At",
    render: (row) =>
      row.sbtMintedAt
        ? new Date(row.sbtMintedAt).toLocaleDateString()
        : "—",
  },
];

export default function VotersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;

  const [data, setData] = useState<Voter[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<{ success: boolean } & PaginatedResponse<Voter>>(
        `/api/voters?page=${page}&limit=20`
      );
      if (res.data) setData(res.data);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load voters");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function handlePageChange(newPage: number) {
    router.push(`/admin/voters?page=${newPage}`);
  }

  return (
    <>
      <Header title="Voters" />
      <div className="p-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white">
          {loading ? (
            <div className="p-4">
              <LoadingSkeleton rows={10} />
            </div>
          ) : (
            <>
              <DataTable
                columns={columns}
                data={data}
                onRowClick={(row) => router.push(`/admin/voters/${row.id}`)}
              />
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                hasNext={pagination.hasNext}
                hasPrev={pagination.hasPrev}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
