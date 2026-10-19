import * as SQLite from "expo-sqlite";

import type {
  TMDBMovieDetails,
  TMDBTvDetails,
  TMDBTvSeasonDetails,
} from "@/types/tmdb";

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export const DATABASE_NAME = "tv_tracker.db";
let databaseInstance: SQLite.SQLiteDatabase | null = null;

async function getDatabase() {
  if (!databaseInstance) {
    databaseInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
  }

  return databaseInstance;
}

export async function initializeDatabase(
  database: SQLite.SQLiteDatabase,
): Promise<void> {
  databaseInstance = database;
}

export async function saveTvSeriesDetails(
  details: TMDBTvDetails,
  externalIds: {
    tvdb_id: number | null;
    imdb_id: string | null;
  },
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO series (
      tmdb_id,
      tvdb_id,
      imdb_id,
      title,
      poster_path,
      status,
      backdrop_path,
      overview,
      first_air_date,
      watch_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tmdb_id) DO NOTHING`,
    details.id,
    externalIds.tvdb_id,
    externalIds.imdb_id,
    details.name,
    details.poster_path,
    details.status,
    details.backdrop_path,
    details.overview,
    details.first_air_date || null,
    "not_started_yet",
  );
}

export async function saveMovieDetails(
  details: TMDBMovieDetails,
  externalIds: {
    imdb_id: string | null;
  },
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO movies (
      tmdb_id,
      imdb_id,
      title,
      poster_path,
      backdrop_path,
      overview,
      release_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tmdb_id) DO NOTHING`,
    details.id,
    externalIds.imdb_id,
    details.title,
    details.poster_path,
    details.backdrop_path,
    details.overview,
    details.release_date || null,
  );
}

export async function saveTvSeasonEpisodes(
  seriesTmdbId: number,
  season: TMDBTvSeasonDetails,
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const episode of season.episodes) {
      await db.runAsync(
        `INSERT OR IGNORE INTO episodes (
          series_tmdb_id,
          season_number,
          episode_number,
          tmdb_id,
          title,
          overview,
          air_date,
          still_path,
          is_special
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        seriesTmdbId,
        episode.season_number,
        episode.episode_number,
        episode.id,
        episode.name,
        episode.overview,
        episode.air_date,
        episode.still_path,
        episode.season_number === 0 ? 1 : 0,
      );
    }
  });
}

export async function exportDatabaseFile(): Promise<void> {
  const db = await getDatabase();

  // Verifica che il database sia leggibile.
  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
     ORDER BY name`,
  );

  console.log(
    "Tabelle nel database:",
    tables.map((table) => table.name),
  );

  // Crea una copia coerente del database nella cache.
  const backup = await db.serializeAsync();

  const fileName = `tv_tracker_${Date.now()}.db`;
  const destination = `${FileSystem.cacheDirectory}${fileName}`;

  const bytes = Array.from(backup);

  const binaryString = bytes.map((byte) => String.fromCharCode(byte)).join("");

  const base64 = btoa(binaryString);

  await FileSystem.writeAsStringAsync(destination, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("La condivisione dei file non è disponibile.");
  }

  await Sharing.shareAsync(destination, {
    mimeType: "application/x-sqlite3",
    dialogTitle: "Esporta database TV Tracker",
    UTI: "public.database",
  });
}

export async function isTvSeriesSaved(tmdbId: number): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ found: number }>(
    "SELECT 1 AS found FROM series WHERE tmdb_id = ? LIMIT 1",
    tmdbId,
  );

  return result !== null;
}

export type SavedEpisodeNumber = {
  season_number: number;
  episode_number: number;
  tmdb_id: number | null;
  is_watched: number;
};

export async function getSavedEpisodeNumbers(
  seriesTmdbId: number,
): Promise<SavedEpisodeNumber[]> {
  const db = await getDatabase();

  return db.getAllAsync<SavedEpisodeNumber>(
    `SELECT
       season_number,
       episode_number,
       tmdb_id,
       is_watched
     FROM episodes
     WHERE series_tmdb_id = ?`,
    seriesTmdbId,
  );
}

export async function isMovieSaved(tmdbId: number): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ found: number }>(
    "SELECT 1 AS found FROM movies WHERE tmdb_id = ? LIMIT 1",
    tmdbId,
  );

  return result !== null;
}

/**
 * Registra la prima visione di un episodio.
 */
export async function markEpisodeWatched(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watchedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE episodes
     SET is_watched = 1,
         watched_at = ?
     WHERE series_tmdb_id = ?
       AND season_number = ?
       AND episode_number = ?`,
    watchedAt,
    seriesTmdbId,
    seasonNumber,
    episodeNumber,
  );
}

/**
 * Segna un episodio come non visto ed elimina i suoi rewatch.
 */
export async function markEpisodeUnwatched(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE episodes
       SET is_watched = 0,
           watched_at = NULL
       WHERE series_tmdb_id = ?
         AND season_number = ?
         AND episode_number = ?`,
      seriesTmdbId,
      seasonNumber,
      episodeNumber,
    );

    await db.runAsync(
      `DELETE FROM rewatch
       WHERE item_type = 'episode'
         AND series_tmdb_id = ?
         AND season_number = ?
         AND episode_number = ?`,
      seriesTmdbId,
      seasonNumber,
      episodeNumber,
    );
  });
}

/**
 * Registra la prima visione di tutti gli episodi di una stagione.
 */
export async function markSeasonWatched(
  seriesTmdbId: number,
  seasonNumber: number,
  watchedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE episodes
     SET is_watched = 1,
         watched_at = ?
     WHERE series_tmdb_id = ?
       AND season_number = ?`,
    watchedAt,
    seriesTmdbId,
    seasonNumber,
  );
}

/**
 * Segna tutti gli episodi di una stagione come non visti
 * ed elimina i relativi rewatch.
 */
export async function markSeasonUnwatched(
  seriesTmdbId: number,
  seasonNumber: number,
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE episodes
       SET is_watched = 0,
           watched_at = NULL
       WHERE series_tmdb_id = ?
         AND season_number = ?`,
      seriesTmdbId,
      seasonNumber,
    );

    await db.runAsync(
      `DELETE FROM rewatch
       WHERE item_type = 'episode'
         AND series_tmdb_id = ?
         AND season_number = ?`,
      seriesTmdbId,
      seasonNumber,
    );
  });
}

/**
 * Aggiunge un rewatch a un episodio già presente nel database.
 */
export async function addEpisodeRewatch(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watchedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO rewatch (
       item_type,
       episode_tmdb_id,
       series_tmdb_id,
       season_number,
       episode_number,
       movie_tmdb_id,
       watched_at
     )
     SELECT
       'episode',
       tmdb_id,
       series_tmdb_id,
       season_number,
       episode_number,
       NULL,
       ?
     FROM episodes
     WHERE series_tmdb_id = ?
       AND season_number = ?
       AND episode_number = ?
       AND is_watched = 1`,
    watchedAt,
    seriesTmdbId,
    seasonNumber,
    episodeNumber,
  );
}

/**
 * Aggiunge un rewatch a ogni episodio già visto della stagione.
 */
export async function addSeasonRewatch(
  seriesTmdbId: number,
  seasonNumber: number,
  watchedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO rewatch (
       item_type,
       episode_tmdb_id,
       series_tmdb_id,
       season_number,
       episode_number,
       movie_tmdb_id,
       watched_at
     )
     SELECT
       'episode',
       tmdb_id,
       series_tmdb_id,
       season_number,
       episode_number,
       NULL,
       ?
     FROM episodes
     WHERE series_tmdb_id = ?
       AND season_number = ?
       AND is_watched = 1`,
    watchedAt,
    seriesTmdbId,
    seasonNumber,
  );
}

/**
 * Elimina tutti i rewatch di un episodio.
 * La prima visione rimane invariata.
 */
export async function clearEpisodeRewatches(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM rewatch
     WHERE item_type = 'episode'
       AND series_tmdb_id = ?
       AND season_number = ?
       AND episode_number = ?`,
    seriesTmdbId,
    seasonNumber,
    episodeNumber,
  );
}

/**
 * Elimina tutti i rewatch degli episodi di una stagione.
 */
export async function clearSeasonRewatches(
  seriesTmdbId: number,
  seasonNumber: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM rewatch
     WHERE item_type = 'episode'
       AND series_tmdb_id = ?
       AND season_number = ?`,
    seriesTmdbId,
    seasonNumber,
  );
}

/**
 * Elimina il rewatch più recente di un episodio.
 */
export async function removeLastEpisodeRewatch(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM rewatch
     WHERE id = (
       SELECT id
       FROM rewatch
       WHERE item_type = 'episode'
         AND series_tmdb_id = ?
         AND season_number = ?
         AND episode_number = ?
       ORDER BY watched_at DESC, id DESC
       LIMIT 1
     )`,
    seriesTmdbId,
    seasonNumber,
    episodeNumber,
  );
}

/**
 * Elimina il rewatch più recente di ogni episodio della stagione
 * che possiede almeno un rewatch.
 */
export async function removeLastSeasonRewatch(
  seriesTmdbId: number,
  seasonNumber: number,
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    const episodes = await db.getAllAsync<{
      episode_number: number;
    }>(
      `SELECT DISTINCT episode_number
       FROM rewatch
       WHERE item_type = 'episode'
         AND series_tmdb_id = ?
         AND season_number = ?`,
      seriesTmdbId,
      seasonNumber,
    );

    for (const episode of episodes) {
      await db.runAsync(
        `DELETE FROM rewatch
         WHERE id = (
           SELECT id
           FROM rewatch
           WHERE item_type = 'episode'
             AND series_tmdb_id = ?
             AND season_number = ?
             AND episode_number = ?
           ORDER BY watched_at DESC, id DESC
           LIMIT 1
         )`,
        seriesTmdbId,
        seasonNumber,
        episode.episode_number,
      );
    }
  });
}

/**
 * Restituisce il numero di rewatch di un episodio.
 */
export async function getEpisodeRewatchCount(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<number> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM rewatch
     WHERE item_type = 'episode'
       AND series_tmdb_id = ?
       AND season_number = ?
       AND episode_number = ?`,
    seriesTmdbId,
    seasonNumber,
    episodeNumber,
  );

  return result?.count ?? 0;
}
