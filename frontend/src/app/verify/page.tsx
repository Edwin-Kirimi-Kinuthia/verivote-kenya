"use client";

import { useState } from "react";
import Link from "next/link";
import { LanguageProvider, useTranslation } from "@/contexts/language-context";
import { api } from "@/lib/api-client";
import type { VerifyVoteResult, VoteStatus } from "@/lib/types";

// ── Header ──────────────────────────────────────────────────────────────────

function VerifyHeader() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <header className="border-b border-amber-100 bg-white print:hidden">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-600 text-sm font-bold text-white">
            V
          </div>
          <span className="text-lg font-semibold text-gray-900">VeriVote</span>
        </div>
        <div className="flex gap-1 rounded-md border border-gray-200 p-0.5">
          <button
            onClick={() => setLanguage("en")}
            aria-pressed={language === "en"}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              language === "en"
                ? "bg-amber-600 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("language.en")}
          </button>
          <button
            onClick={() => setLanguage("sw")}
            aria-pressed={language === "sw"}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              language === "sw"
                ? "bg-amber-600 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("language.sw")}
          </button>
        </div>
      </div>
    </header>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<VoteStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  CONFIRMED: "bg-green-100 text-green-800",
  SUPERSEDED: "bg-amber-100 text-amber-800",
  INVALIDATED: "bg-red-100 text-red-800",
};

function StatusBadge({ status, t }: { status: VoteStatus; t: (k: string) => string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status]}`}
    >
      {t(`verify.status.${status}`)}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function truncateTxHash(hash: string): string {
  if (hash.length <= 20) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-10)}`;
}

// ── Input view ───────────────────────────────────────────────────────────────

interface InputViewProps {
  onResult: (result: VerifyVoteResult) => void;
}

function InputView({ onResult }: InputViewProps) {
  const { t } = useTranslation();
  const [serial, setSerial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = /^[0-9A-F]{16}$/i.test(serial);

  function handleSerialChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value
      .toUpperCase()
      .replace(/[^0-9A-F]/g, "")
      .slice(0, 16);
    setSerial(cleaned);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      setError(t("verify.errors.invalidFormat"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ success: boolean; data: VerifyVoteResult }>(
        `/api/votes/verify/${serial}`
      );
      onResult(response.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "Vote not found") {
        setError(t("verify.errors.notFound"));
      } else {
        setError(t("verify.errors.generic"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100">
            <svg
              className="h-7 w-7 text-amber-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{t("verify.title")}</h1>
          <p className="mt-2 text-sm text-gray-500">{t("verify.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="serial"
              className="block text-sm font-medium text-gray-700"
            >
              {t("verify.label")}
            </label>
            <input
              id="serial"
              type="text"
              value={serial}
              onChange={handleSerialChange}
              placeholder={t("verify.placeholder")}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {serial.length}/16
            </p>
          </div>

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full rounded-lg bg-amber-600 px-6 py-3 text-base font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t("verify.submitting") : t("verify.submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          <Link href="/" className="text-amber-600 hover:underline">
            ← {t("verify.returnHome")}
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Result view ───────────────────────────────────────────────────────────────

interface ResultViewProps {
  result: VerifyVoteResult;
  onVerifyAnother: () => void;
}

function ResultView({ result, onVerifyAnother }: ResultViewProps) {
  const { t } = useTranslation();
  const { cryptographicVerification: cv, blockchainConfirmation: bc } = result;

  const isSuperseded = result.status === "SUPERSEDED";
  const hashValid = cv.hashValid;

  // Determine visual state: superseded > integrity failure > verified
  const state: "superseded" | "warning" | "verified" = isSuperseded
    ? "superseded"
    : hashValid
    ? "verified"
    : "warning";

  const stateConfig = {
    verified: {
      iconBg: "bg-green-100",
      iconColor: "text-green-700",
      headingColor: "text-green-800",
      heading: t("verify.result.verified"),
      desc: t("verify.result.verifiedDesc"),
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      ),
    },
    warning: {
      iconBg: "bg-red-100",
      iconColor: "text-red-700",
      headingColor: "text-red-800",
      heading: t("verify.result.integrity"),
      desc: t("verify.result.integrityDesc"),
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      ),
    },
    superseded: {
      iconBg: "bg-amber-100",
      iconColor: "text-amber-700",
      headingColor: "text-amber-800",
      heading: t("verify.result.superseded"),
      desc: t("verify.result.supersededDesc"),
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
        />
      ),
    },
  }[state];

  return (
    <div className="mx-auto w-full max-w-lg py-8">
      {/* Print-only header */}
      <div className="mb-6 hidden text-center print:block">
        <h1 className="text-xl font-bold text-gray-900">
          VeriVote Kenya — Official Vote Verification Record
        </h1>
        <p className="text-sm text-gray-500">Generated: {new Date().toLocaleString()}</p>
      </div>

      {/* Status banner */}
      <div className={`mb-6 rounded-xl p-6 text-center ${stateConfig.iconBg}`}>
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm`}
        >
          <svg
            className={`h-8 w-8 ${stateConfig.iconColor}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {stateConfig.icon}
          </svg>
        </div>
        <h2 className={`mt-4 text-xl font-bold ${stateConfig.headingColor}`}>
          {stateConfig.heading}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{stateConfig.desc}</p>
      </div>

      {/* Details card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Serial */}
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="text-xs font-medium uppercase text-gray-500">
            {t("verify.labels.serialNumber")}
          </p>
          <p className="mt-1 font-mono text-lg font-bold tracking-wider text-gray-900">
            {result.serialNumber}
          </p>
        </div>

        {/* Status */}
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="text-xs font-medium uppercase text-gray-500">
            {t("verify.labels.voteStatus")}
          </p>
          <div className="mt-1.5">
            <StatusBadge status={result.status} t={t} />
          </div>
        </div>

        {/* Timestamp */}
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="text-xs font-medium uppercase text-gray-500">
            {t("verify.labels.timestamp")}
          </p>
          <p className="mt-1 text-sm text-gray-900">{formatDate(result.timestamp)}</p>
        </div>

        {/* Cryptographic integrity */}
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="text-xs font-medium uppercase text-gray-500">
            {t("verify.labels.cryptoIntegrity")}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {hashValid ? (
              <svg
                className="h-4 w-4 flex-shrink-0 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="h-4 w-4 flex-shrink-0 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="text-sm text-gray-700">
              {hashValid ? t("verify.values.hashValid") : t("verify.values.hashInvalid")}
            </span>
          </div>
        </div>

        {/* Blockchain confirmation */}
        <div className="border-b border-gray-100 px-6 py-4">
          <p className="text-xs font-medium uppercase text-gray-500">
            {t("verify.labels.blockchainConfirmed")}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {bc.confirmed
              ? t("verify.values.confirmed")
              : result.status === "CONFIRMED"
              ? t("verify.values.pending")
              : t("verify.values.unavailable")}
          </p>
        </div>

        {/* TX Hash */}
        {bc.txHash && (
          <div className="border-b border-gray-100 px-6 py-4">
            <p className="text-xs font-medium uppercase text-gray-500">
              {t("verify.labels.txHash")}
            </p>
            <p
              className="mt-1 break-all font-mono text-xs text-gray-700 print:text-sm"
              title={bc.txHash}
            >
              <span className="print:hidden">{truncateTxHash(bc.txHash)}</span>
              <span className="hidden print:block">{bc.txHash}</span>
            </p>
          </div>
        )}

        {/* Blockchain timestamp */}
        {bc.blockchainTimestamp !== null && (
          <div className="border-b border-gray-100 px-6 py-4">
            <p className="text-xs font-medium uppercase text-gray-500">
              {t("verify.labels.blockchainTimestamp")}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {formatDate(new Date(bc.blockchainTimestamp * 1000).toISOString())}
            </p>
          </div>
        )}

        {/* Ballot secrecy note */}
        <div className="px-6 py-4">
          <p className="text-xs italic text-gray-400">{t("verify.secrecyNote")}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-6 space-y-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="w-full rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("verify.print")}
        </button>
        <button
          onClick={onVerifyAnother}
          className="w-full rounded-lg bg-amber-600 px-6 py-3 text-base font-semibold text-white hover:bg-amber-700"
        >
          {t("verify.verifyAnother")}
        </button>
        <Link
          href="/"
          className="block w-full rounded-lg bg-gray-100 px-6 py-3 text-center text-base font-medium text-gray-700 hover:bg-gray-200"
        >
          {t("verify.returnHome")}
        </Link>
      </div>
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

function VerifyPageInner() {
  const [view, setView] = useState<"input" | "result">("input");
  const [result, setResult] = useState<VerifyVoteResult | null>(null);

  function handleResult(r: VerifyVoteResult) {
    setResult(r);
    setView("result");
  }

  function handleVerifyAnother() {
    setResult(null);
    setView("input");
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <VerifyHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {view === "input" ? (
          <InputView onResult={handleResult} />
        ) : (
          result && <ResultView result={result} onVerifyAnother={handleVerifyAnother} />
        )}
      </main>
      <footer className="border-t border-gray-100 py-4 text-center text-xs text-gray-400 print:hidden">
        VeriVote Kenya &mdash; Secure Electronic Voting
      </footer>

      <style>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .hidden.print\\:block { display: block !important; }
          main { max-width: 100%; padding: 0; }
        }
      `}</style>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <LanguageProvider>
      <VerifyPageInner />
    </LanguageProvider>
  );
}
