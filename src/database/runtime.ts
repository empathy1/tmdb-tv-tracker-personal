import type { TMDBTvSeasonDetails } from "@/types/tmdb";
import { getDatabase } from "./index";

export type SeasonWithMissingRuntimes = {
  series_tmdb_id: number;
  season_number: number;
};

export async function getSeasonsWithMissingRuntimes(): Promise<
  SeasonWithMissingRuntimes[]
> {
  const db = await getDatabase();

  return db.getAllAsync<SeasonWithMissingRuntimes>(
    `SELECT DISTINCT
      series_tmdb_id,
      season_number
    FROM episodes
    WHERE runtime IS NULL
    ORDER BY series_tmdb_id, season_number`,
  );
}

export async function updateMissingEpisodeRuntimes(
  seriesTmdbId: number,
  season: TMDBTvSeasonDetails,
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const episode of season.episodes) {
      if (episode.runtime == null) continue;

      await db.runAsync(
        `UPDATE episodes
        SET runtime = ?
        WHERE series_tmdb_id = ?
          AND season_number = ?
          AND episode_number = ?
          AND runtime IS NULL`,
        episode.runtime,
        seriesTmdbId,
        episode.season_number,
        episode.episode_number,
      );
    }
  });
}
