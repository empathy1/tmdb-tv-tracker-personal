export type TMDBTvSearchResult = {
  id: number;
  name: string;
  original_name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  overview: string;
  original_language: string;
};

export type TMDBTvSearchResponse = {
  page: number;
  results: TMDBTvSearchResult[];
  total_pages: number;
  total_results: number;
};

export type TMDBMovieSearchResult = {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  overview: string;
  original_language: string;
};

export type TMDBMovieSearchResponse = {
  page: number;
  results: TMDBMovieSearchResult[];
  total_pages: number;
  total_results: number;
};


export type TMDBTvDetails = {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  status: string;
  seasons: TMDBTvSeasonSummary[];
  number_of_seasons: number;
  number_of_episodes: number;
  vote_average: number;
  original_language: string;
  genres: {
    id: number;
    name: string;
  }[];
};

export type TMDBMovieDetails = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  status: string;
  vote_average: number;
  original_language: string;
  genres: {
    id: number;
    name: string;
  }[];
};


export type TitleLanguage = "it" | "en" | "original";


export type TMDBTvSeasonSummary = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  episode_count: number;
  air_date: string | null;
};

export type TMDBTvSeasonDetails = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  air_date: string | null;
  episodes: TMDBTvEpisode[];
};

export type TMDBTvEpisode = {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  vote_average: number;
  runtime: number | null;
};
