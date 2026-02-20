"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (nationalId?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (nationalId) params.set("nationalId", nationalId);
      const res = await api.get<{ success: boolean } & PaginatedResponse<Voter>>(
        `/api/voters?${params.toString()}`
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
    load(search || undefined);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load(value || undefined);
    }, 300);
  }

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
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="relative max-w-xs">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search by National ID..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full rounded-md border border-gray-300 py-1.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
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
              {!search && (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  hasNext={pagination.hasNext}
                  hasPrev={pagination.hasPrev}
                  onPageChange={handlePageChange}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
