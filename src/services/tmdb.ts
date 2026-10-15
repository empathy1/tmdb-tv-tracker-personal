import type {
  TitleLanguage,
  TMDBMovieDetails,
  TMDBMovieSearchResponse,
  TMDBMovieSearchResult,
  TMDBTvDetails,
  TMDBTvSearchResponse,
  TMDBTvSearchResult,
  TMDBTvSeasonDetails,
} from "@/types/tmdb";
import { getTMDBLanguage } from "./titleLanguage";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const TMDB_ACCESS_TOKEN = process.env.EXPO_PUBLIC_TMDB_ACCESS_TOKEN;

if (!TMDB_ACCESS_TOKEN) {
  throw new Error("TMDB Access Token non configurato.");
}

async function tmdbFetch<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB error ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function getTvTitle(
  item: TMDBTvSearchResult,
  titleLanguage: TitleLanguage,
): string {
  if (titleLanguage === "original") {
    return item.original_name || item.name;
  }

  return item.name || item.original_name;
}

function getMovieTitle(
  item: TMDBMovieSearchResult,
  titleLanguage: TitleLanguage,
): string {
  if (titleLanguage === "original") {
    return item.original_title || item.title;
  }

  return item.title || item.original_title;
}

export async function searchTv(
  query: string,
  titleLanguage: TitleLanguage = "it",
): Promise<TMDBTvSearchResponse> {
  const [itData, enData] = await Promise.all([
    tmdbFetch<TMDBTvSearchResponse>("/search/tv", {
      query,
      language: "it-IT",
      page: 1,
      include_adult: false,
    }),
    tmdbFetch<TMDBTvSearchResponse>("/search/tv", {
      query,
      language: "en-US",
      page: 1,
      include_adult: false,
    }),
  ]);

  const preferred = titleLanguage === "en" ? enData : itData;
  const secondary = titleLanguage === "en" ? itData : enData;

  const merged = new Map<number, TMDBTvSearchResult>();

  for (const item of [...preferred.results, ...secondary.results]) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  }

  const preferredIds = new Set(preferred.results.map((item) => item.id));

  const results = await Promise.all(
    [...merged.values()].map(async (item) => {
      if (titleLanguage !== "original" && !preferredIds.has(item.id)) {
        try {
          const localized = await tmdbFetch<TMDBTvDetails>(`/tv/${item.id}`, {
            language: titleLanguage === "en" ? "en-US" : "it-IT",
          });

          return {
            ...item,
            name: localized.name || item.original_name || item.name,
          };
        } catch {
          return {
            ...item,
            name: getTvTitle(item, titleLanguage),
          };
        }
      }

      return {
        ...item,
        name: getTvTitle(item, titleLanguage),
      };
    }),
  );

  return {
    ...preferred,
    results,
    total_results: results.length,
  };
}

export async function searchMovie(
  query: string,
  titleLanguage: TitleLanguage = "it",
): Promise<TMDBMovieSearchResponse> {
  const [itData, enData] = await Promise.all([
    tmdbFetch<TMDBMovieSearchResponse>("/search/movie", {
      query,
      language: "it-IT",
      page: 1,
      include_adult: false,
    }),
    tmdbFetch<TMDBMovieSearchResponse>("/search/movie", {
      query,
      language: "en-US",
      page: 1,
      include_adult: false,
    }),
  ]);

  const preferred = titleLanguage === "en" ? enData : itData;
  const secondary = titleLanguage === "en" ? itData : enData;

  const merged = new Map<number, TMDBMovieSearchResult>();

  for (const item of [...preferred.results, ...secondary.results]) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  }

  const preferredIds = new Set(preferred.results.map((item) => item.id));

  const results = await Promise.all(
    [...merged.values()].map(async (item) => {
      if (titleLanguage !== "original" && !preferredIds.has(item.id)) {
        try {
          const localized = await tmdbFetch<TMDBMovieDetails>(
            `/movie/${item.id}`,
            {
              language: titleLanguage === "en" ? "en-US" : "it-IT",
            },
          );

          return {
            ...item,
            title: localized.title || item.original_title || item.title,
          };
        } catch {
          return {
            ...item,
            title: getMovieTitle(item, titleLanguage),
          };
        }
      }

      return {
        ...item,
        title: getMovieTitle(item, titleLanguage),
      };
    }),
  );

  return {
    ...preferred,
    results,
    total_results: results.length,
  };
}

export async function getTvDetails(
  id: number,
  titleLanguage: TitleLanguage = "it",
): Promise<TMDBTvDetails> {
  const language = getTMDBLanguage(titleLanguage) ?? "en-US";

  const details = await tmdbFetch<TMDBTvDetails>(`/tv/${id}`, {
    language,
  });

  if (titleLanguage === "original") {
    return {
      ...details,
      name: details.original_name || details.name,
    };
  }

  return details;
}

export async function getMovieDetails(
  id: number,
  titleLanguage: TitleLanguage = "it",
): Promise<TMDBMovieDetails> {
  const language = getTMDBLanguage(titleLanguage) ?? "en-US";

  const details = await tmdbFetch<TMDBMovieDetails>(`/movie/${id}`, {
    language,
  });

  if (titleLanguage === "original") {
    return {
      ...details,
      title: details.original_title || details.title,
    };
  }

  return details;
}

export async function getTvSeasonDetails(
  tvId: number,
  seasonNumber: number,
  titleLanguage: TitleLanguage = "it",
): Promise<TMDBTvSeasonDetails> {
  const language = getTMDBLanguage(titleLanguage) ?? "en-US";

  return tmdbFetch<TMDBTvSeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`, {
    language,
  });
}

type TMDBTvExternalIds = {
  id: number;
  imdb_id: string | null;
  tvdb_id: number | null;
};

export async function getTvExternalIds(
  tvId: number,
): Promise<TMDBTvExternalIds> {
  return tmdbFetch<TMDBTvExternalIds>(`/tv/${tvId}/external_ids`);
}
type TMDBEpisodeExternalIds = {
  id: number;
  imdb_id: string | null;
  tvdb_id: number | null;
  tvrage_id: number | null;
};

export async function getTvEpisodeExternalIds(
  tvId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<TMDBEpisodeExternalIds> {
  return tmdbFetch<TMDBEpisodeExternalIds>(
    `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`,
  );
}
type TMDBFindByExternalId = {
  tv_episode_results: {
    id: number;
    name: string;
    show_id: number;
    season_number: number;
    episode_number: number;
    air_date: string | null;
  }[];
};

export async function findTvEpisodeByTvdbId(
  tvdbId: number | string,
): Promise<TMDBFindByExternalId> {
  return tmdbFetch<TMDBFindByExternalId>(`/find/${tvdbId}`, {
    external_source: "tvdb_id",
  });
}

type TMDBFindTvByExternalId = {
  tv_results: {
    id: number;
    name: string;
    original_name: string;
    first_air_date: string | null;
  }[];
};

export async function findTvByExternalId(
  externalId: string | number,
  source: "tvdb_id" | "imdb_id",
): Promise<TMDBFindTvByExternalId> {
  return tmdbFetch<TMDBFindTvByExternalId>(
    `/find/${encodeURIComponent(String(externalId))}`,
    { external_source: source },
  );
}

export type TMDBEpisodeTvdbComparison = {
  tmdbEpisodeId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  tvdbId: number | null;
};

export async function getTvEpisodesTvdbIds(
  tvId: number,
): Promise<TMDBEpisodeTvdbComparison[]> {
  const details = await getTvDetails(tvId, "en");
  const result: TMDBEpisodeTvdbComparison[] = [];

  for (const season of details.seasons) {
    // La stagione 0 può contenere gli speciali:
    // non la escludiamo automaticamente.
    const seasonDetails = await getTvSeasonDetails(
      tvId,
      season.season_number,
      "en",
    );

    for (const episode of seasonDetails.episodes) {
      const externalIds = await getTvEpisodeExternalIds(
        tvId,
        episode.season_number,
        episode.episode_number,
      );

      result.push({
        tmdbEpisodeId: episode.id,
        seasonNumber: episode.season_number,
        episodeNumber: episode.episode_number,
        episodeName: episode.name,
        tvdbId: externalIds.tvdb_id,
      });
    }
  }

  return result;
}
