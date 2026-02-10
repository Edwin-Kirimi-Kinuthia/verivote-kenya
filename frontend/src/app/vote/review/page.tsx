"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import { api } from "@/lib/api-client";
import { ballotPositions, getCandidateById } from "@/lib/candidates";
import type { BallotSelection, ApiResponse, VoteReceipt } from "@/lib/types";

export default function ReviewPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const { t } = useTranslation();
  const [selections, setSelections] = useState<BallotSelection>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/vote");
      return;
    }
    const saved = sessionStorage.getItem("ballot-selections");
    if (!saved) {
      router.replace("/vote/ballot");
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      const allSelected = ballotPositions.every((p) => parsed[p.id]);
      if (!allSelected) {
        router.replace("/vote/ballot");
        return;
      }
      setSelections(parsed);
    } catch {
      router.replace("/vote/ballot");
    }
  }, [isLoading, token, router]);

  async function handleSubmit() {
    setError("");
    setSubmitting(true);

    try {
      const res = await api.post<ApiResponse<VoteReceipt>>(
        "/api/votes/cast",
        { selections }
      );

      if (!res.success || !res.data) {
        setError(res.error || t("review.error"));
        return;
      }

      sessionStorage.setItem("vote-receipt", JSON.stringify(res.data));
      sessionStorage.removeItem("ballot-selections");
      router.push("/vote/receipt");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("review.error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !token || Object.keys(selections).length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("review.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t("review.subtitle")}</p>
      </div>

      <div className="space-y-4">
        {ballotPositions.map((position) => {
          const candidate = getCandidateById(selections[position.id]);
          if (!candidate) return null;

          const initials = candidate.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase();

          return (
            <div
              key={position.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: candidate.photoPlaceholder }}
                >
                  {initials}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">
                    {t(position.titleKey)}
                  </p>
                  <p className="text-base font-semibold text-gray-900">
                    {candidate.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {candidate.party} ({candidate.partyAbbreviation})
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push("/vote/ballot")}
                className="text-sm font-medium text-green-700 hover:text-green-800"
              >
                {t("review.change")}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">{t("review.warning")}</p>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t("review.submitting") : t("review.submit")}
        </button>
        <button
          onClick={() => router.push("/vote/ballot")}
          disabled={submitting}
          className="w-full rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t("review.back")}
        </button>
      </div>
    </div>
  );
}
