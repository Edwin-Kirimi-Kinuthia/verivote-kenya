"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import en from "@/lib/i18n/en.json";
import sw from "@/lib/i18n/sw.json";

type Language = "en" | "sw";

const translations: Record<Language, Record<string, unknown>> = { en, sw };

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return path;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : path;
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, replacements?: Record<string, string>) => {
      let value = getNestedValue(translations[language], key);
      if (replacements) {
        for (const [placeholder, replacement] of Object.entries(replacements)) {
          value = value.replace(`{${placeholder}}`, replacement);
        }
      }
      return value;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx)
    throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}
