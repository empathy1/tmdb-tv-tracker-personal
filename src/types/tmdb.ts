export type TMDBTvSearchResult = {
  id: number;
  name: string;
  original_name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  overview: string;
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
};

export type TMDBMovieSearchResponse = {
  page: number;
  results: TMDBMovieSearchResult[];
  total_pages: number;
  total_results: number;
};