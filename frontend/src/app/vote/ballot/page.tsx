"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import { CandidateCard } from "@/components/candidate-card";
import { ballotPositions } from "@/lib/candidates";
import type { BallotSelection } from "@/lib/types";

export default function BallotPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const { t } = useTranslation();
  const [selections, setSelections] = useState<BallotSelection>({});

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/vote");
    }
  }, [isLoading, token, router]);

  // Restore selections from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem("ballot-selections");
    if (saved) {
      try {
        setSelections(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  function handleSelect(positionId: string, candidateId: string) {
    setSelections((prev) => {
      const next = { ...prev, [positionId]: candidateId };
      sessionStorage.setItem("ballot-selections", JSON.stringify(next));
      return next;
    });
  }

  const allSelected = ballotPositions.every((p) => selections[p.id]);

  function handleReview() {
    if (!allSelected) return;
    sessionStorage.setItem("ballot-selections", JSON.stringify(selections));
    router.push("/vote/review");
  }

  if (isLoading || !token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">{t("ballot.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("ballot.subtitle")}</p>
      </div>

      <div className="space-y-8">
        {ballotPositions.map((position) => (
          <section key={position.id}>
            <h2 className="mb-3 text-lg font-semibold text-gray-800">
              {t(position.titleKey)}
            </h2>
            <div role="radiogroup" aria-label={t(position.titleKey)} className="space-y-3">
              {position.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  selected={selections[position.id] === candidate.id}
                  onSelect={() => handleSelect(position.id, candidate.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8">
        {!allSelected && (
          <p className="mb-3 text-center text-sm text-amber-600">
            {t("ballot.selectAll")}
          </p>
        )}
        <button
          onClick={handleReview}
          disabled={!allSelected}
          className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("ballot.review")}
        </button>
      </div>
    </div>
  );
}
