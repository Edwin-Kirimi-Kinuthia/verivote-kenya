"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { StatusBadge } from "@/components/status-badge";
import { CardSkeleton } from "@/components/loading-skeleton";
import type { ApiResponse, ReviewDetails } from "@/lib/types";

type DeceasedResult = {
  voterId: string;
  status: string;
  deceasedAt: string;
  sbtRevokedAt: string | null;
  sbtRevokeTxHash: string | null;
  note: string;
};

export default function VoterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [voter, setVoter] = useState<ReviewDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deceasedResult, setDeceasedResult] = useState<DeceasedResult | null>(null);
  const [markingDeceased, setMarkingDeceased] = useState(false);
  const [deceasedError, setDeceasedError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<ApiResponse<ReviewDetails>>(
          `/api/admin/review/${id}`
        );
        if (res.data) setVoter(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load voter");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <>
        <Header title="Voter Detail" />
        <div className="p-6 space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </>
    );
  }

  if (error || !voter) {
    return (
      <>
        <Header title="Voter Detail" />
        <div className="p-6">
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error || "Voter not found"}
          </div>
          <button
            onClick={() => router.back()}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Go back
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Voter Detail" />
      <div className="p-6 space-y-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to voters
        </button>

        {/* Voter Info Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Voter Information
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Voter ID</dt>
              <dd className="mt-1 font-mono text-sm text-gray-900">
                {voter.voterId}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">National ID</dt>
              <dd className="mt-1 font-mono text-sm text-gray-900">
                {voter.nationalId}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <StatusBadge status={voter.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">
                Polling Station
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {voter.pollingStation
                  ? `${voter.pollingStation.code} — ${voter.pollingStation.name}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">
                Registered At
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(voter.createdAt).toLocaleString()}
              </dd>
            </div>
            {voter.verificationFailureReason && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-500">
                  Failure Reason
                </dt>
                <dd className="mt-1 text-sm text-red-700">
                  {voter.verificationFailureReason}
                </dd>
              </div>
            )}
            {voter.manualReviewRequestedAt && (
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Manual Review Requested
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(voter.manualReviewRequestedAt).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Mark as Deceased */}
        {voter.status !== "DECEASED" && (
          <div className="rounded-lg border border-gray-300 bg-gray-50 p-6">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">Deceased Voter Action</h2>
            <p className="mb-4 text-xs text-gray-500">
              Use this only after receiving official notification of death. This will permanently
              block the account, revoke the SBT on-chain, and cannot be undone. Past votes are
              unaffected and remain counted.
            </p>
            {deceasedError && (
              <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{deceasedError}</div>
            )}
            {deceasedResult ? (
              <div className="rounded bg-gray-100 p-3 text-xs text-gray-700 space-y-1">
                <p className="font-medium text-gray-900">Voter marked as deceased.</p>
                <p>{deceasedResult.note}</p>
                {deceasedResult.sbtRevokeTxHash && (
                  <p className="font-mono break-all">TX: {deceasedResult.sbtRevokeTxHash}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={markingDeceased}
                onClick={async () => {
                  if (!confirm(
                    `Are you sure you want to mark voter ${voter.nationalId} as deceased?\n\n` +
                    "This will:\n" +
                    "• Permanently block their account from login and voting\n" +
                    "• Revoke their SBT on the blockchain\n" +
                    "• Leave all previously cast votes unchanged\n\n" +
                    "This action CANNOT be undone."
                  )) return;
                  setMarkingDeceased(true);
                  setDeceasedError("");
                  try {
                    const res = await api.post<ApiResponse<DeceasedResult>>(
                      `/api/admin/voters/${voter.voterId}/mark-deceased`,
                      {}
                    );
                    if (res.success && res.data) {
                      setDeceasedResult(res.data);
                      setVoter((v) => v ? { ...v, status: "DECEASED" } : v);
                    } else {
                      setDeceasedError(res.error ?? "Failed to mark voter as deceased");
                    }
                  } catch (err) {
                    setDeceasedError(err instanceof Error ? err.message : "Unknown error");
                  } finally {
                    setMarkingDeceased(false);
                  }
                }}
                className="rounded bg-gray-800 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {markingDeceased ? "Processing…" : "Mark Voter as Deceased"}
              </button>
            )}
          </div>
        )}

        {voter.status === "DECEASED" && (
          <div className="rounded-lg border border-gray-400 bg-gray-100 p-4 text-sm text-gray-700">
            This voter has been marked as deceased. Their account is permanently closed.
            All previously cast votes remain counted.
          </div>
        )}

        {/* Blockchain / SBT Confirmation Card */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Blockchain / SBT Confirmation
          </h2>
          {voter.sbtAddress ? (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-gray-500">
                  SBT Address
                </dt>
                <dd className="mt-1 font-mono text-sm text-gray-900 break-all">
                  {voter.sbtAddress}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Token ID
                </dt>
                <dd className="mt-1 font-mono text-sm text-gray-900">
                  {voter.sbtTokenId ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">
                  Minted At
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {voter.sbtMintedAt
                    ? new Date(voter.sbtMintedAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">
              No SBT has been minted for this voter yet.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
