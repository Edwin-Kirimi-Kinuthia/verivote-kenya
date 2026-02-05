"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Header } from "@/components/header";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import type {
  PaginatedResponse,
  Voter,
  PollingStation,
  ColumnDef,
  ApiResponse,
  ApproveResult,
  RejectResult,
} from "@/lib/types";

export default function ReviewsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const { voter } = useAuth();

  const [stations, setStations] = useState<PollingStation[]>([]);
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

  const [activeAction, setActiveAction] = useState<{
    voterId: string;
    type: "approve" | "reject";
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);

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
      const res = await api.get<
        { success: boolean } & PaginatedResponse<Voter>
      >(`/api/admin/pending-reviews?page=${page}&limit=20`);
      if (res.data) setData(res.data);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function handlePageChange(newPage: number) {
    router.push(`/admin/reviews?page=${newPage}`);
  }

  function openAction(voterId: string, type: "approve" | "reject") {
    setActiveAction({ voterId, type });
    setActionNotes("");
    setActionError("");
    setApproveResult(null);
  }

  function cancelAction() {
    setActiveAction(null);
    setActionNotes("");
    setActionError("");
  }

  async function handleApprove(voterId: string) {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<ApiResponse<ApproveResult>>(
        `/api/admin/approve/${voterId}`,
        { reviewerId: voter?.id, notes: actionNotes || undefined }
      );
      if (res.success && res.data) {
        setApproveResult(res.data);
        setActiveAction(null);
        load();
      } else {
        setActionError(res.error || "Approval failed");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(voterId: string) {
    if (!actionNotes.trim()) {
      setActionError("Rejection reason is required");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<ApiResponse<RejectResult>>(
        `/api/admin/reject/${voterId}`,
        { reviewerId: voter?.id, reason: actionNotes }
      );
      if (res.success) {
        setActiveAction(null);
        load();
      } else {
        setActionError(res.error || "Rejection failed");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setActionLoading(false);
    }
  }

  const columns: ColumnDef<Voter>[] = [
    { key: "nationalId", header: "National ID" },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "pollingStationId",
      header: "Station",
      render: (row) => {
        const station = stations.find((s) => s.id === row.pollingStationId);
        return station ? `${station.code} — ${station.name}` : row.pollingStationId ?? "—";
      },
    },
    {
      key: "manualReviewRequestedAt",
      header: "Requested At",
      render: (row) =>
        row.manualReviewRequestedAt
          ? new Date(row.manualReviewRequestedAt).toLocaleString()
          : "—",
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openAction(row.id, "approve");
            }}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Approve
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openAction(row.id, "reject");
            }}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Header title="Manual Reviews" />
      <div className="p-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {approveResult && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-6">
            <h3 className="mb-3 text-sm font-semibold text-green-900">
              Voter Approved Successfully
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-green-700">National ID</dt>
                <dd className="font-mono text-green-900">
                  {approveResult.nationalId}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">PIN</dt>
                <dd className="font-mono text-lg font-bold text-green-900">
                  {approveResult.pin}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">Distress PIN</dt>
                <dd className="font-mono text-lg font-bold text-red-700">
                  {approveResult.distressPin}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">Wallet</dt>
                <dd className="font-mono text-green-900 break-all">
                  {approveResult.walletAddress}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">SBT Token ID</dt>
                <dd className="font-mono text-green-900">
                  {approveResult.sbtTokenId}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-green-700">Tx Hash</dt>
                <dd className="font-mono text-green-900 break-all">
                  {approveResult.txHash}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-green-600">
              Save these PINs securely. They cannot be retrieved later.
            </p>
            <button
              onClick={() => setApproveResult(null)}
              className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeAction && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              {activeAction.type === "approve"
                ? "Confirm Approval"
                : "Confirm Rejection"}
            </h3>
            {actionError && (
              <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            )}
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder={
                activeAction.type === "approve"
                  ? "Optional notes..."
                  : "Rejection reason (required)..."
              }
              rows={3}
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  activeAction.type === "approve"
                    ? handleApprove(activeAction.voterId)
                    : handleReject(activeAction.voterId)
                }
                disabled={actionLoading}
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
                  activeAction.type === "approve"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {actionLoading
                  ? "Processing..."
                  : activeAction.type === "approve"
                    ? "Confirm Approve"
                    : "Confirm Reject"}
              </button>
              <button
                onClick={cancelAction}
                disabled={actionLoading}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white">
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
