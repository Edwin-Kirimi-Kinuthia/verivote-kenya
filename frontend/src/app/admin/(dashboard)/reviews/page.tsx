"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Header } from "@/components/header";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { startRegistration } from "@simplewebauthn/browser";
import type {
  PaginatedResponse,
  Voter,
  PollingStation,
  ColumnDef,
  ApiResponse,
  ApproveResult,
  RejectResult,
  SetupLinkResult,
  KycStartResult,
} from "@/lib/types";

type PostApprovalStep = "kyc" | "fingerprint" | "done";

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
    nationalId: string;
    type: "approve" | "reject";
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Post-approval multi-step: kyc → fingerprint → done
  const [postApproval, setPostApproval] = useState<{
    voterId: string;
    nationalId: string;
    step: PostApprovalStep;
    inquiryId?: string;
    personaUrl?: string;
    contact?: string;
  } | null>(null);
  const [kycPolling, setKycPolling] = useState(false);
  const [kycVerified, setKycVerified] = useState(false);
  const [fpLoading, setFpLoading] = useState(false);
  const [fpDone, setFpDone] = useState(false);
  const [fpError, setFpError] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);
  const [postError, setPostError] = useState("");
  const kycPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up KYC polling on unmount
  useEffect(() => {
    return () => { if (kycPollRef.current) clearInterval(kycPollRef.current); };
  }, []);

  useEffect(() => {
    api
      .get<{ success: boolean } & PaginatedResponse<PollingStation>>(
        "/api/polling-stations?limit=100"
      )
      .then((res) => { if (res.data) setStations(res.data); })
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

  useEffect(() => { load(); }, [load]);

  function handlePageChange(newPage: number) {
    router.push(`/admin/reviews?page=${newPage}`);
  }

  function openAction(voterId: string, nationalId: string, type: "approve" | "reject") {
    setActiveAction({ voterId, nationalId, type });
    setActionNotes("");
    setActionError("");
    setPostApproval(null);
    setKycVerified(false);
    setKycPolling(false);
    setFpDone(false);
    setFpError("");
    setPostError("");
    if (kycPollRef.current) clearInterval(kycPollRef.current);
  }

  function cancelAction() {
    setActiveAction(null);
    setActionNotes("");
    setActionError("");
    if (kycPollRef.current) { clearInterval(kycPollRef.current); kycPollRef.current = null; }
  }

  // ── Step 1: Start KYC via Persona ─────────────────────────────────────────

  async function handleStartKyc() {
    if (!activeAction) return;
    setActionLoading(true);
    setActionError("");
    try {
      const res = await api.post<ApiResponse<KycStartResult>>(
        `/api/admin/start-kyc/${activeAction.voterId}`
      );
      if (res.success && res.data) {
        setActiveAction(null);
        setKycVerified(false);
        setKycPolling(false);
        setFpDone(false);
        setFpError("");
        setPostError("");
        if (kycPollRef.current) clearInterval(kycPollRef.current);
        setPostApproval({
          voterId: res.data.voterId,
          nationalId: res.data.nationalId,
          step: "kyc",
          inquiryId: res.data.inquiryId,
          personaUrl: res.data.personaUrl,
        });
      } else {
        setActionError(res.error || "Failed to start KYC");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start KYC");
    } finally {
      setActionLoading(false);
    }
  }

  function startKycPolling(pa: NonNullable<typeof postApproval>) {
    if (!pa.inquiryId) return;
    if (kycPollRef.current) clearInterval(kycPollRef.current);
    setKycPolling(true);
    setPostError("");

    kycPollRef.current = setInterval(async () => {
      try {
        const res = await api.get<ApiResponse<{ status: string; completed: boolean }>>(
          `/api/admin/kyc-status?inquiryId=${pa.inquiryId}`
        );
        if (res.data?.completed) {
          clearInterval(kycPollRef.current!);
          kycPollRef.current = null;
          setKycPolling(false);
          setKycVerified(true);
          setPostApproval((prev) => prev ? { ...prev, step: "fingerprint" } : null);
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 3000);
  }

  // ── Step 2: Fingerprint via voter's own phone (cross-platform / QR code) ──

  async function handleEnrollFingerprint() {
    if (!postApproval) return;
    setFpError("");
    setFpLoading(true);
    try {
      const optRes = await api.post<ApiResponse<Record<string, unknown>>>(
        "/api/webauthn/register/options",
        { voterId: postApproval.voterId, adminAssisted: true }
      );
      if (!optRes.success || !optRes.data)
        throw new Error("Failed to get fingerprint options");

      // adminAssisted=true → cross-platform → browser shows QR code for voter's phone
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optRes.data as any });

      const verRes = await api.post<ApiResponse<{ verified: boolean }>>(
        "/api/webauthn/register/verify",
        { voterId: postApproval.voterId, response: attResp }
      );
      if (!verRes.success || !verRes.data?.verified)
        throw new Error("Fingerprint verification failed");

      setFpDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("notallowed")) {
        setFpError("Cancelled — ask the voter to scan the QR code with their phone and try again.");
      } else {
        setFpError(msg);
      }
    } finally {
      setFpLoading(false);
    }
  }

  // ── Step 3: Approve (mint SBT) + send PIN setup link ──────────────────────

  async function handleApproveAndSend() {
    if (!postApproval) return;
    setPostError("");
    setApproveLoading(true);
    try {
      const approveRes = await api.post<ApiResponse<ApproveResult>>(
        `/api/admin/approve/${postApproval.voterId}`,
        { reviewerId: voter?.id }
      );
      if (!approveRes.success) {
        setPostError(approveRes.error || "Approval failed");
        return;
      }
      const linkRes = await api.post<ApiResponse<SetupLinkResult>>(
        "/api/admin/send-setup-link",
        { voterId: postApproval.voterId }
      );
      if (!linkRes.success || !linkRes.data) {
        setPostError(linkRes.error || "Failed to send setup link");
        return;
      }
      setPostApproval((prev) =>
        prev ? { ...prev, step: "done", contact: linkRes.data!.contact } : null
      );
      load();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Failed to complete approval");
    } finally {
      setApproveLoading(false);
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
              openAction(row.id, row.nationalId, "approve");
            }}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Approve
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openAction(row.id, row.nationalId, "reject");
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
      <div className="p-6 space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* ── Approve / Reject action panel ── */}
        {activeAction && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              {activeAction.type === "approve"
                ? `Approve voter ${activeAction.nationalId}`
                : `Reject voter ${activeAction.nationalId}`}
            </h3>
            {actionError && (
              <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</div>
            )}
            {activeAction.type === "approve" && (
              <p className="mb-3 text-xs text-gray-500">
                This will start a Persona KYC verification for the voter. The voter completes identity
                verification, then you enroll their fingerprint and send a PIN setup link.
              </p>
            )}
            {activeAction.type === "reject" && (
              <textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Rejection reason (required)..."
                rows={3}
                className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            )}
            <div className="flex gap-2">
              {activeAction.type === "approve" ? (
                <button
                  onClick={handleStartKyc}
                  disabled={actionLoading}
                  className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {actionLoading ? "Starting KYC…" : "Start KYC Verification →"}
                </button>
              ) : (
                <button
                  onClick={() => handleReject(activeAction.voterId)}
                  disabled={actionLoading}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading ? "Rejecting…" : "Confirm Rejection"}
                </button>
              )}
              <button
                onClick={cancelAction}
                disabled={actionLoading}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Post-approval: KYC → Fingerprint → Approve ── */}
        {postApproval && postApproval.step !== "done" && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-5 space-y-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2 flex-wrap text-[10px] font-bold">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${kycVerified ? "bg-green-600" : "bg-purple-600"}`}>
                {kycVerified ? "✓" : "1"}
              </span>
              <span className={`text-sm font-medium ${kycVerified ? "text-green-700" : "text-purple-700"}`}>
                {kycVerified ? "KYC verified" : "Identity Verification (KYC)"}
              </span>
              <span className="border-t border-purple-200 w-6" />
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${fpDone ? "bg-green-600" : kycVerified ? "bg-purple-600" : "bg-gray-300 text-gray-600"}`}>
                {fpDone ? "✓" : "2"}
              </span>
              <span className={`text-sm font-medium ${fpDone ? "text-green-700" : kycVerified ? "text-purple-700" : "text-gray-400"}`}>
                {fpDone ? "Fingerprint enrolled" : "Fingerprint (voter's phone)"}
              </span>
              <span className="border-t border-purple-200 w-6" />
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${fpDone ? "bg-purple-600" : "bg-gray-300 text-gray-600"}`}>3</span>
              <span className={`text-sm font-medium ${fpDone ? "text-purple-700" : "text-gray-400"}`}>Approve &amp; Send PIN link</span>
            </div>

            {postError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{postError}</div>
            )}

            {/* Step 1: KYC */}
            {!kycVerified && (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <strong>IEBC Officer:</strong> Hand the device to voter{" "}
                  <strong>{postApproval.nationalId}</strong>. They will complete identity verification on
                  this screen. The system will automatically detect when verification is complete.
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                  {postApproval.personaUrl && (
                    <a
                      href={postApproval.personaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => startKycPolling(postApproval)}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open KYC Verification
                    </a>
                  )}
                  {kycPolling && (
                    <div className="flex items-center justify-center gap-2 py-2 text-sm text-purple-700">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Waiting for voter to complete KYC…
                    </div>
                  )}
                  {!kycPolling && (
                    <p className="text-center text-xs text-gray-400">
                      Open the KYC link above — the system will automatically detect completion.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Fingerprint (cross-platform → voter's phone) */}
            {kycVerified && !fpDone && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  <strong>IEBC Officer:</strong> Click the button below. A QR code will appear on screen.
                  Ask voter <strong>{postApproval.nationalId}</strong> to scan it with their own phone to
                  enroll their fingerprint. <em>Only the voter&apos;s biometric is registered — the
                  officer&apos;s device cannot be used to impersonate them.</em>
                </div>
                {fpError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{fpError}</div>
                )}
                <button
                  type="button"
                  onClick={handleEnrollFingerprint}
                  disabled={fpLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {fpLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Waiting for voter&apos;s phone…
                    </>
                  ) : "Enroll Fingerprint via Voter's Phone (QR Code)"}
                </button>
                <button
                  type="button"
                  onClick={() => setFpDone(true)}
                  disabled={fpLoading}
                  className="w-full text-center text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  Skip — voter will enroll fingerprint on their own device later
                </button>
              </div>
            )}

            {/* Step 3: Approve + send link */}
            {fpDone && (
              <div className="rounded-lg border border-green-200 bg-white p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-semibold">Identity verified — ready to approve</span>
                </div>
                <p className="text-xs text-gray-500">
                  Clicking <strong>Approve</strong> will mint the voter&apos;s SBT on-chain and send them
                  a secure link to set up their PINs on their own device.
                </p>
                <button
                  type="button"
                  onClick={handleApproveAndSend}
                  disabled={approveLoading}
                  className="w-full rounded-md bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {approveLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Approving &amp; sending link…
                    </span>
                  ) : "Approve Registration & Send PIN Setup Link →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Post-approval: done ── */}
        {postApproval && postApproval.step === "done" && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5">
            <h3 className="mb-3 text-sm font-semibold text-green-900">
              Voter Approved &amp; Notified
            </h3>
            <ul className="space-y-2 text-sm text-green-800">
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>KYC identity verified via Persona</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Fingerprint credential enrolled on voter&apos;s own phone (or skipped)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600">✓</span>
                <span>Registration approved — SBT minted on-chain</span>
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
              The voter will set both PINs and optionally re-enroll their fingerprint on their own device via the link.
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
