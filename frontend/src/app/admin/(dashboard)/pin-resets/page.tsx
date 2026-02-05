"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Header } from "@/components/header";
import { DataTable } from "@/components/data-table";
import { Pagination } from "@/components/pagination";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type {
  PaginatedResponse,
  PollingStation,
  PendingReset,
  PinResetResult,
  ApiResponse,
  ColumnDef,
} from "@/lib/types";

export default function PinResetsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const { voter } = useAuth();

  const [stations, setStations] = useState<PollingStation[]>([]);
  const [data, setData] = useState<PendingReset[]>([]);
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
  const [filterStation, setFilterStation] = useState("");

  const [activeReset, setActiveReset] = useState<string | null>(null);
  const [resetNotes, setResetNotes] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetResult, setResetResult] = useState<PinResetResult | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean } & PaginatedResponse<PollingStation>>(
        "/api/polling-stations?limit=100"
      )
      .then((res) => {
        if (res.data) setStations(res.data);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let url = `/api/pin-reset/pending?page=${page}&limit=20`;
      if (filterStation) url += `&pollingStationId=${filterStation}`;
      const res = await api.get<
        { success: boolean } & PaginatedResponse<PendingReset>
      >(url);
      if (res.data) setData(res.data);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load pending resets"
      );
    } finally {
      setLoading(false);
    }
  }, [page, filterStation]);

  useEffect(() => {
    load();
  }, [load]);

  function handlePageChange(newPage: number) {
    router.push(`/admin/pin-resets?page=${newPage}`);
  }

  function openReset(voterId: string) {
    setActiveReset(voterId);
    setResetNotes("");
    setResetError("");
    setResetResult(null);
  }

  function cancelReset() {
    setActiveReset(null);
    setResetNotes("");
    setResetError("");
  }

  async function handleVerifyReset(voterId: string) {
    setResetLoading(true);
    setResetError("");
    try {
      const res = await api.post<ApiResponse<PinResetResult>>(
        `/api/pin-reset/verify/${voterId}`,
        {
          officerId: voter?.id,
          notes: resetNotes || undefined,
        }
      );
      if (res.success && res.data) {
        setResetResult(res.data);
        setActiveReset(null);
        load();
      } else {
        setResetError(res.error || "PIN reset failed");
      }
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "PIN reset failed");
    } finally {
      setResetLoading(false);
    }
  }

  const columns: ColumnDef<PendingReset>[] = [
    { key: "nationalId", header: "National ID" },
    {
      key: "pinResetRequestedAt",
      header: "Requested At",
      render: (row) =>
        row.pinResetRequestedAt
          ? new Date(row.pinResetRequestedAt).toLocaleString()
          : "—",
    },
    {
      key: "pollingStation",
      header: "Polling Station",
      render: (row) =>
        row.pollingStation
          ? `${row.pollingStation.code} — ${row.pollingStation.name}`
          : "—",
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openReset(row.id);
          }}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Verify &amp; Reset
        </button>
      ),
    },
  ];

  return (
    <>
      <Header title="PIN Resets" />
      <div className="p-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {resetResult && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-6">
            <h3 className="mb-3 text-sm font-semibold text-green-900">
              PIN Reset Successful
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-green-700">National ID</dt>
                <dd className="font-mono text-green-900">
                  {resetResult.nationalId}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">New PIN</dt>
                <dd className="font-mono text-lg font-bold text-green-900">
                  {resetResult.pin}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">New Distress PIN</dt>
                <dd className="font-mono text-lg font-bold text-red-700">
                  {resetResult.distressPin}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">Reset At</dt>
                <dd className="font-mono text-green-900">
                  {new Date(resetResult.resetAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">Verified By</dt>
                <dd className="font-mono text-green-900">
                  {resetResult.verifiedBy}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-green-600">
              Save these PINs securely. They cannot be retrieved later.
            </p>
            <button
              onClick={() => setResetResult(null)}
              className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeReset && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              Verify &amp; Reset PIN
            </h3>
            {resetError && (
              <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {resetError}
              </div>
            )}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Officer ID
              </label>
              <input
                type="text"
                readOnly
                value={voter?.id || ""}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Notes (optional)
              </label>
              <textarea
                value={resetNotes}
                onChange={(e) => setResetNotes(e.target.value)}
                placeholder="Optional verification notes..."
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleVerifyReset(activeReset)}
                disabled={resetLoading}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {resetLoading ? "Processing..." : "Confirm Reset"}
              </button>
              <button
                onClick={cancelReset}
                disabled={resetLoading}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-4 border-b border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Pending PIN Resets
            </h2>
            <select
              value={filterStation}
              onChange={(e) => {
                setFilterStation(e.target.value);
                router.push("/admin/pin-resets?page=1");
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All Stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            {filterStation && (
              <button
                onClick={() => {
                  setFilterStation("");
                  router.push("/admin/pin-resets?page=1");
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear filter
              </button>
            )}
          </div>
          {loading ? (
            <div className="p-4">
              <LoadingSkeleton rows={10} />
            </div>
          ) : (
            <>
              <DataTable columns={columns} data={data} />
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
