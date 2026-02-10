"use client";

import type { Candidate } from "@/lib/types";

interface CandidateCardProps {
  candidate: Candidate;
  selected: boolean;
  onSelect: () => void;
}

export function CandidateCard({
  candidate,
  selected,
  onSelect,
}: CandidateCardProps) {
  const initials = candidate.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-green-700 focus:ring-offset-2 ${
        selected
          ? "border-green-700 bg-green-50"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div
        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
        style={{ backgroundColor: candidate.photoPlaceholder }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-gray-900">
          {candidate.name}
        </p>
        <p className="text-sm text-gray-500">
          {candidate.party} ({candidate.partyAbbreviation})
        </p>
      </div>
      <div
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
          selected
            ? "border-green-700 bg-green-700"
            : "border-gray-300 bg-white"
        }`}
      >
        {selected && (
          <svg
            className="h-4 w-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
    </button>
  );
}
