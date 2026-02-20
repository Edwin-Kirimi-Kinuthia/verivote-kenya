"use client";

import { LanguageProvider, useTranslation } from "@/contexts/language-context";
import type { ReactNode } from "react";

function RegisterHeader() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <header className="border-b border-green-100 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-700 text-sm font-bold text-white">
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
                ? "bg-green-700 text-white"
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
                ? "bg-green-700 text-white"
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

function RegisterLayoutInner({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <RegisterHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-gray-100 py-4 text-center text-xs text-gray-400">
        VeriVote Kenya &mdash; Secure Electronic Voting
      </footer>
    </div>
  );
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <RegisterLayoutInner>{children}</RegisterLayoutInner>
    </LanguageProvider>
  );
}
