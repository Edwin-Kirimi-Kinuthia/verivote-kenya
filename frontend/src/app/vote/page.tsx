"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import type { ApiResponse, AuthData } from "@/lib/types";

const ELIGIBLE_STATUSES = ["REGISTERED", "VOTED", "REVOTED", "DISTRESS_FLAGGED"];

export default function VotePinPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();
  const [nationalId, setNationalId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post<
        ApiResponse<{ valid: boolean; auth: AuthData }>
      >("/api/voters/verify-pin", { nationalId, pin });

      if (!res.success || !res.data?.valid || !res.data.auth) {
        setError(t("pin.error"));
        return;
      }

      const { auth } = res.data;

      if (!ELIGIBLE_STATUSES.includes(auth.voter.status)) {
        setError(t("pin.notEligible"));
        return;
      }

      login(auth.token, auth.voter);
      router.push("/vote/ballot");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pin.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">{t("pin.title")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("pin.subtitle")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
        >
          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700"
            >
              {error}
            </div>
          )}

          <div className="mb-5">
            <label
              htmlFor="nationalId"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              {t("pin.nationalId")}
            </label>
            <input
              id="nationalId"
              type="text"
              inputMode="numeric"
              pattern="\d{8}"
              maxLength={8}
              required
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
              placeholder={t("pin.nationalIdPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
            />
          </div>

          <div className="mb-8">
            <label
              htmlFor="pin"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              {t("pin.pin")}
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder={t("pin.pinPlaceholder")}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-700 focus:ring-2 focus:ring-green-700 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || nationalId.length !== 8 || pin.length !== 4}
            className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t("pin.submitting") : t("pin.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
