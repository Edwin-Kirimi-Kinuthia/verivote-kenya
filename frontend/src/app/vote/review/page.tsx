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

  // PIN confirmation state
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinShakeKey, setPinShakeKey] = useState(0);

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
        { selections, ...(pin ? { pin } : {}) }
      );

      if (!res.success || !res.data) {
        setError(res.error || t("review.error"));
        setPin("");
        setPinShakeKey((k) => k + 1);
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

      {/* PIN confirmation */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <label htmlFor="votePin" className="mb-2 block text-sm font-semibold text-gray-700">
          Enter your voting PIN to confirm
        </label>
        <p className="mb-3 text-xs text-gray-500">
          Use your normal PIN. If you enter your distress PIN, IEBC will be silently alerted.
        </p>

        <div key={pinShakeKey} className={pinShakeKey > 0 ? "animate-shake" : ""}>
          <div className="relative">
            <input
              id="votePin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                if (error) setError("");
              }}
              placeholder="••••"
              className={`w-full rounded-lg border px-4 py-3 text-center text-2xl font-mono tracking-[1em] transition-colors focus:ring-2 focus:outline-none ${
                error
                  ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                  : "border-gray-300 focus:border-green-700 focus:ring-green-700"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showPin ? "Hide PIN" : "Show PIN"}
            >
              {showPin ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}
        </div>
      </div>

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
