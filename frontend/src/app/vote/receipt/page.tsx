"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/language-context";
import type { VoteReceipt } from "@/lib/types";

const AUTO_LOGOUT_SECONDS = 60;

export default function ReceiptPage() {
  const router = useRouter();
  const { token, isLoading, logout } = useAuth();
  const { t } = useTranslation();
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [countdown, setCountdown] = useState(AUTO_LOGOUT_SECONDS);

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/vote");
      return;
    }
    const saved = sessionStorage.getItem("vote-receipt");
    if (!saved) {
      router.replace("/vote");
      return;
    }
    try {
      setReceipt(JSON.parse(saved));
    } catch {
      router.replace("/vote");
    }
  }, [isLoading, token, router]);

  const handleDone = useCallback(() => {
    sessionStorage.removeItem("vote-receipt");
    sessionStorage.removeItem("ballot-selections");
    logout();
    router.replace("/vote");
  }, [logout, router]);

  useEffect(() => {
    if (!receipt) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [receipt, handleDone]);

  if (isLoading || !token || !receipt) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            {t("receipt.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t("receipt.subtitle")}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-500 uppercase">
              {t("receipt.serialNumber")}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-gray-900">
              {receipt.serialNumber}
            </p>
          </div>

          <div className="mb-6 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase">
              {t("receipt.blockchain")}
            </p>
            <p className="mt-1 break-all font-mono text-sm text-gray-700">
              {receipt.blockchainTxHash || t("receipt.pending")}
            </p>
          </div>

          <p className="text-xs text-gray-400">{t("receipt.keepSafe")}</p>
        </div>

        <div className="mt-6 space-y-3">
          <button
            onClick={() => window.print()}
            className="w-full rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("receipt.print")}
          </button>
          <button
            onClick={handleDone}
            className="w-full rounded-lg bg-green-700 px-6 py-3 text-base font-semibold text-white hover:bg-green-800"
          >
            {t("receipt.done")}
          </button>
        </div>

        <p className="mt-4 text-sm text-gray-400">
          {t("receipt.autoLogout", { seconds: String(countdown) })}
        </p>
      </div>
    </div>
  );
}
