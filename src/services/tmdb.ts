import type {
    TMDBMovieSearchResponse,
    TMDBTvSearchResponse,
} from "@/types/tmdb";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

const TMDB_ACCESS_TOKEN = process.env.EXPO_PUBLIC_TMDB_ACCESS_TOKEN;

if (!TMDB_ACCESS_TOKEN) {
  throw new Error("TMDB Access Token non configurato.");
}

async function tmdbFetch<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>
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
    throw new Error(
      `TMDB error ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

export async function searchTv(
  query: string
): Promise<TMDBTvSearchResponse> {
  return tmdbFetch<TMDBTvSearchResponse>("/search/tv", {
    query,
    language: "it-IT",
    page: 1,
    include_adult: false,
  });
}

export async function searchMovie(
  query: string
): Promise<TMDBMovieSearchResponse> {
  return tmdbFetch<TMDBMovieSearchResponse>("/search/movie", {
    query,
    language: "it-IT",
    page: 1,
    include_adult: false,
  });
}