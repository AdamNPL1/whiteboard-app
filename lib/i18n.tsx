"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AppLanguage = "en" | "pl";

const LANGUAGE_STORAGE_KEY = "scriboo-language";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  text: (english: string, polish: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLanguage === "en" || storedLanguage === "pl") {
      const updateLanguage = window.setTimeout(
        () => setLanguageState(storedLanguage),
        0
      );
      return () => window.clearTimeout(updateLanguage);
    }
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const text = useCallback(
    (english: string, polish: string) =>
      language === "pl" ? polish : english,
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, text }),
    [language, setLanguage, text]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }

  return context;
}
