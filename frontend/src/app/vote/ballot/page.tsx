"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import { api } from "@/lib/api-client";
import { CandidateCard } from "@/components/candidate-card";
import { ballotPositions } from "@/lib/candidates";
import type {
  ApiResponse,
  BallotSelection,
  DynamicBallot,
  DynamicCandidate,
} from "@/lib/types";

// Colour palette for candidate avatars (no photo)
const AVATAR_COLOURS = [
  "#1B5E20", "#1565C0", "#6A1B9A", "#E65100",
  "#37474F", "#880E4F", "#0277BD", "#2E7D32",
];

function avatarColour(index: number): string {
  return AVATAR_COLOURS[index % AVATAR_COLOURS.length];
}

// Adapt a dynamic candidate to the shape CandidateCard expects
function adaptCandidate(c: DynamicCandidate, idx: number) {
  return {
    id: c.candidateId,
    name: c.name,
    party: c.party ?? "Independent",
    partyAbbreviation: c.party
      ? c.party
          .split(" ")
          .filter((w) => w.length > 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 4)
      : "IND",
    photoPlaceholder: avatarColour(idx),
    position: "",
  };
}

function BallotPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const electionId = searchParams.get("electionId");
  const { token, isLoading } = useAuth();
  const { t } = useTranslation();

  const [selections, setSelections] = useState<BallotSelection>({});
  const [dynamicBallot, setDynamicBallot] = useState<DynamicBallot | null>(null);
  const [ballotLoading, setBallotLoading] = useState(false);
  const [ballotError, setBallotError] = useState("");

  // Auth guard
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
        const parsed = JSON.parse(saved);
        // Only restore if it's for the same election (or legacy)
        const savedElectionId = sessionStorage.getItem("ballot-election-id");
        if (!electionId || savedElectionId === electionId) {
          setSelections(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, [electionId]);

  // Fetch dynamic ballot when electionId is present
  useEffect(() => {
    if (!electionId || !token) return;
    setBallotLoading(true);
    setBallotError("");
    api
      .get<ApiResponse<DynamicBallot>>(`/api/ballot/${electionId}`)
      .then((res) => {
        if (res.success && res.data) {
          setDynamicBallot(res.data);
          sessionStorage.setItem("ballot-election-id", electionId);
          sessionStorage.setItem("ballot-election-name", res.data.electionName);
          sessionStorage.setItem("ballot-data", JSON.stringify(res.data));
        } else {
          setBallotError(res.error ?? "Failed to load ballot");
        }
      })
      .catch((e) => setBallotError(e.message))
      .finally(() => setBallotLoading(false));
  }, [electionId, token]);

  function handleSelect(positionId: string, candidateId: string) {
    setSelections((prev) => {
      const next = { ...prev, [positionId]: candidateId };
      sessionStorage.setItem("ballot-selections", JSON.stringify(next));
      return next;
    });
  }

  function handleReview() {
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

  // ── Dynamic ballot (electionId provided) ──────────────────────────────────
  if (electionId) {
    if (ballotLoading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
        </div>
      );
    }

    if (ballotError) {
      return (
        <div className="mx-auto max-w-lg py-12 text-center">
          <p className="mb-4 text-red-600">{ballotError}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Go back
          </button>
        </div>
      );
    }

    if (!dynamicBallot) return null;

    const allSelected = dynamicBallot.positions.every((p) => selections[p.positionId]);

    return (
      <div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{dynamicBallot.electionName}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Select one candidate per position, then review your ballot.
          </p>
        </div>

        <div className="space-y-8">
          {dynamicBallot.positions.map((position) => (
            <section key={position.positionId}>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-gray-800">{position.title}</h2>
                {position.description && (
                  <p className="text-sm text-gray-500">{position.description}</p>
                )}
                {position.scopeValue && (
                  <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {position.scope === "COUNTY" && "County: "}
                    {position.scope === "CONSTITUENCY" && "Constituency: "}
                    {position.scope === "WARD" && "Ward: "}
                    {position.scopeValue}
                  </span>
                )}
              </div>
              <div role="radiogroup" aria-label={position.title} className="space-y-3">
                {position.candidates.map((candidate, idx) => (
                  <CandidateCard
                    key={candidate.candidateId}
                    candidate={adaptCandidate(candidate, idx)}
                    selected={selections[position.positionId] === candidate.candidateId}
                    onSelect={() => handleSelect(position.positionId, candidate.candidateId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8">
          {!allSelected && (
            <p className="mb-3 text-center text-sm text-amber-600">
              Please make a selection for every position before continuing.
            </p>
          )}
          <button
            onClick={handleReview}
            disabled={!allSelected}
            className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review My Ballot
          </button>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("ballot-data");
              sessionStorage.removeItem("ballot-election-id");
              sessionStorage.removeItem("ballot-election-name");
              router.back();
            }}
            className="mt-3 w-full rounded-lg border border-gray-300 px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to Elections
          </button>
        </div>
      </div>
    );
  }

  // ── Legacy static ballot (no electionId) ──────────────────────────────────
  const allSelected = ballotPositions.every((p) => selections[p.id]);

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

export default function BallotPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
        </div>
      }
    >
      <BallotPageInner />
    </Suspense>
  );
}
