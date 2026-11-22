import { colors } from "@/constants/theme";
import { getTvSeasonDetails } from "@/services/tmdb";
import type { TMDBTvDetails } from "@/types/tmdb";

export type AvailableEpisode = {
  season_number: number;
  episode_number: number;
};

export async function getAvailableEpisodes(
  seriesId: number,
  seasons: TMDBTvDetails["seasons"],
): Promise<AvailableEpisode[]> {
  const ordinarySeasons = seasons.filter((season) => season.season_number > 0);

  const seasonDetails = await Promise.all(
    ordinarySeasons.map((season) =>
      getTvSeasonDetails(seriesId, season.season_number),
    ),
  );

  return seasonDetails.flatMap((season) =>
    season.episodes
      .filter((episode) => !isAirDateUpcoming(episode.air_date))
      .map((episode) => ({
        season_number: episode.season_number,
        episode_number: episode.episode_number,
      })),
  );
}

export function isAirDateUpcoming(airDate: string | null | undefined): boolean {
  if (!airDate) return false;

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return airDate > todayString;
}

export function getWatchedEpisodesCount(
  availableEpisodes: AvailableEpisode[],
  episodeHistory: {
    season_number: number;
    episode_number: number;
    is_watched: number;
  }[],
): number {
  return availableEpisodes.filter((availableEpisode) =>
    episodeHistory.some(
      (episode) =>
        episode.season_number === availableEpisode.season_number &&
        episode.episode_number === availableEpisode.episode_number &&
        episode.is_watched === 1,
    ),
  ).length;
}

export function getSeriesProgressColor(
  watchStatus: string | null | undefined,
  tmdbStatus: string | null | undefined,
): string {
  const seriesProgressColor =
    tmdbStatus === "Returning Series"
      ? colors.completed
      : tmdbStatus === "Ended" || tmdbStatus === "Canceled"
        ? colors.ended
        : null;

  return watchStatus === "continuing"
    ? colors.continuing
    : watchStatus === "stopped"
      ? colors.stopped
      : watchStatus === "up_to_date"
        ? (seriesProgressColor ?? colors.completed)
        : colors.progressBackground;
}
