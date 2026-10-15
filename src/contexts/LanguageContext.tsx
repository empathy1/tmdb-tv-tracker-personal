import {
    createContext,
    useContext,
    useState,
    type ReactNode,
} from "react";

import type { TitleLanguage } from "@/types/tmdb";

type LanguageContextType = {
  titleLanguage: TitleLanguage;
  setTitleLanguage: (language: TitleLanguage) => void;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [titleLanguage, setTitleLanguage] =
    useState<TitleLanguage>("it");

  return (
    <LanguageContext.Provider
      value={{ titleLanguage, setTitleLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTitleLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useTitleLanguage deve essere usato dentro LanguageProvider.",
    );
  }

  return context;
}