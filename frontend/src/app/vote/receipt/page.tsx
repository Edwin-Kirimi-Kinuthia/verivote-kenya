"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

          <div className="mb-4 border-t border-gray-100 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500 uppercase">
                {t("receipt.blockchain")}
              </p>
              {receipt.blockchainTxHash ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                  Confirmed on-chain
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Pending
                </span>
              )}
            </div>
            {receipt.blockchainTxHash ? (
              <p className="break-all font-mono text-xs text-gray-600">{receipt.blockchainTxHash}</p>
            ) : (
              <p className="text-xs text-gray-500">
                Your vote is securely recorded in the system. Blockchain confirmation is processed in the background and does not affect your vote being counted.
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400">{t("receipt.keepSafe")}</p>
          <Link
            href="/verify"
            className="mt-3 inline-block text-xs font-medium text-amber-600 hover:underline"
          >
            Verify your vote →
          </Link>
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
