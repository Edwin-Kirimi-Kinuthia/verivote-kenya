"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Header } from "@/components/header";
import { StatusBadge } from "@/components/status-badge";
import { CardSkeleton } from "@/components/loading-skeleton";
import type { ApiResponse, ReviewDetails } from "@/lib/types";

export default function VoterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [voter, setVoter] = useState<ReviewDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
