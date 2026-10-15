
import type { TitleLanguage } from "@/types/tmdb";

export function getTMDBLanguage(
  titleLanguage: TitleLanguage,
): string | null {
  switch (titleLanguage) {
    case "it":
      return "it-IT";

    case "en":
      return "en-US";

    case "original":
      return null;
  }
}
