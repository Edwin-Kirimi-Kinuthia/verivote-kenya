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
  SetupLinkResult,
} from "@/lib/types";

type PostApprovalStep = "fingerprint" | "done";

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

  // Approve / reject action modal
  const [activeAction, setActiveAction] = useState<{
    voterId: string;
    type: "approve" | "reject";
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Post-approval fingerprint + setup-link flow
  const [postApproval, setPostApproval] = useState<{
    voterId: string;
    nationalId: string;
    step: PostApprovalStep;
    contact?: string;
  } | null>(null);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState("");
  const [fpEnrolled, setFpEnrolled] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

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
    setPostApproval(null);
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
        setActiveAction(null);
        setFpEnrolled(false);
        setFpError("");
        setPostApproval({
          voterId: res.data.voterId,
          nationalId: res.data.nationalId,
          step: "fingerprint",
        });
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

  // ── Fingerprint enrollment (WebAuthn) ─────────────────────────────────────

  async function handleEnrollFingerprint() {
    if (!postApproval) return;
    setFpError("");
    setFpLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/register/options",
        { voterId: postApproval.voterId }
      );
      if (!optRes.success || !optRes.data)
        throw new Error("Failed to get fingerprint options");

      const { startRegistration } = await import("@simplewebauthn/browser");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optRes.data as any });

      const verRes = await api.post<ApiResponse<{ verified: boolean }>>(
        "/api/webauthn/register/verify",
        { voterId: postApproval.voterId, response: attResp }
      );
      if (!verRes.success || !verRes.data?.verified)
        throw new Error("Fingerprint verification failed");

      setFpEnrolled(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fingerprint enrollment failed";
      if (
        msg.toLowerCase().includes("cancel") ||
        msg.toLowerCase().includes("abort") ||
        msg.toLowerCase().includes("user")
      ) {
        setFpError("Fingerprint scan was cancelled. Please ask the voter to try again.");
      } else {
        setFpError(msg);
      }
    } finally {
      setFpLoading(false);
    }
  }

  async function handleSendLink() {
    if (!postApproval) return;
    setFpError("");
    setLinkLoading(true);
    try {
      const res = await api.post<ApiResponse<SetupLinkResult>>(
        "/api/admin/send-setup-link",
        { voterId: postApproval.voterId }
      );
      if (!res.success || !res.data) {
        setFpError(res.error || "Failed to send setup link");
        return;
      }
      setPostApproval((prev) =>
        prev ? { ...prev, step: "done", contact: res.data!.contact } : null
      );
    } catch (err) {
      setFpError(err instanceof Error ? err.message : "Failed to send setup link");
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleSkipFingerprint() {
    setFpEnrolled(false);
    await handleSendLink();
  }

  // ── Table columns ──────────────────────────────────────────────────────────

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

        {/* ── Approve / Reject form ── */}
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

        {/* ── Post-approval: fingerprint enrollment ── */}
        {postApproval && postApproval.step === "fingerprint" && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white font-bold text-[10px]">✓</span>
              <span className="text-sm font-medium text-green-700">Voter approved — SBT minted</span>
              <span className="flex-1 border-t border-blue-200" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-[10px]">2</span>
              <span className="text-sm font-medium text-blue-700">Capture fingerprint</span>
              <span className="flex-1 border-t border-blue-200" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-300 text-gray-600 font-bold text-[10px]">3</span>
              <span className="text-sm text-gray-400">Send PIN link</span>
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>IEBC Officer:</strong> Ask voter <strong>{postApproval.nationalId}</strong> to place
              their finger on the biometric reader or use Windows Hello / Face ID on this device.
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center space-y-3">
              <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${fpEnrolled ? "bg-green-100" : "bg-blue-50"}`}>
                {fpEnrolled ? (
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
                  </svg>
                )}
              </div>

              {fpEnrolled ? (
                <p className="text-sm font-semibold text-green-700">Fingerprint enrolled</p>
              ) : (
                <p className="text-sm text-gray-700">Ready to capture fingerprint</p>
              )}

              {fpError && (
                <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{fpError}</div>
              )}

              {!fpEnrolled && (
                <button
                  type="button"
                  onClick={handleEnrollFingerprint}
                  disabled={fpLoading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {fpLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Waiting for scan…
                    </span>
                  ) : "Scan Fingerprint"}
                </button>
              )}

              {fpEnrolled && (
                <button
                  type="button"
                  onClick={handleSendLink}
                  disabled={linkLoading}
                  className="w-full rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {linkLoading ? "Sending link…" : "Send PIN Setup Link →"}
                </button>
              )}
            </div>

            <p className="text-xs text-blue-600">
              The fingerprint uses FIDO2/WebAuthn — only a cryptographic key is stored, no raw biometric data leaves this device.
            </p>

            {!fpEnrolled && (
              <button
                type="button"
                onClick={handleSkipFingerprint}
                disabled={linkLoading || fpLoading}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                {linkLoading ? "Sending link…" : "Skip fingerprint — device not available"}
              </button>
            )}
          </div>
        )}

        {/* ── Post-approval: done ── */}
        {postApproval && postApproval.step === "done" && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-5">
            <h3 className="mb-3 text-sm font-semibold text-green-900">
              Voter Approved &amp; Notified
            </h3>
            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Identity verified — SBT minted on-chain</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">{fpEnrolled ? "✓" : "–"}</span>
                <span>
                  {fpEnrolled
                    ? "Biometric credential enrolled on this device"
                    : "Fingerprint skipped — voter can enroll later"}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>
                  PIN setup link sent to{" "}
                  <span className="font-medium">{postApproval.contact}</span>
                </span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-green-600">
              The voter will set their own PIN privately using the link. Neither PIN is visible to officers.
            </p>
            <button
              onClick={() => setPostApproval(null)}
              className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dismiss
            </button>
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
