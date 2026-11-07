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

export async function getTvSeriesWatchStatus(
  tmdbId: number,
): Promise<string | null> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{
    watch_status: string | null;
  }>("SELECT watch_status FROM series WHERE tmdb_id = ? LIMIT 1", tmdbId);

  return result?.watch_status ?? null;
}

export async function updateTvSeriesWatchStatus(
  tmdbId: number,
  watchStatus: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE series
     SET watch_status = ?
     WHERE tmdb_id = ?`,
    watchStatus,
    tmdbId,
  );
}

export type SavedEpisodeNumber = {
  season_number: number;
  episode_number: number;
  tmdb_id: number | null;
  is_watched: number;
  watched_at: string | null;
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
       is_watched,
       watched_at
     FROM episodes
     WHERE series_tmdb_id = ?`,
    seriesTmdbId,
  );
}

async function getHomeSeriesByWatchStatus(
  watchStatus: string,
): Promise<HomeSeries[]> {
  const db = await getDatabase();

  return db.getAllAsync<HomeSeries>(
    `SELECT
       s.tmdb_id,
       e.tmdb_id AS episode_tmdb_id,
       (
        SELECT COUNT(*)
        FROM episodes remaining
        WHERE remaining.series_tmdb_id = s.tmdb_id
          AND remaining.is_special = 0
          AND remaining.is_watched = 0
          AND NOT (
            remaining.season_number = e.season_number
            AND remaining.episode_number = e.episode_number
          )
       ) AS remaining_episodes,
       s.title,
       s.poster_path,
       s.backdrop_path,
       s.overview,
       s.first_air_date,
       e.season_number,
       e.episode_number,
       e.title AS episode_title,
       e.still_path,
       e.air_date
     FROM series s
     JOIN episodes e
       ON e.series_tmdb_id = s.tmdb_id
     WHERE s.watch_status = ?
       AND e.is_special = 0
       AND e.is_watched = 0
       AND NOT EXISTS (
         SELECT 1
         FROM episodes previous
         WHERE previous.series_tmdb_id = e.series_tmdb_id
           AND previous.is_special = 0
           AND previous.is_watched = 0
           AND (
             previous.season_number < e.season_number
             OR (
               previous.season_number = e.season_number
               AND previous.episode_number < e.episode_number
             )
           )
       )
     ORDER BY
  CASE
    WHEN s.watch_status = 'continuing' THEN (
      SELECT MAX(watched_episode.watched_at)
      FROM episodes watched_episode
      WHERE watched_episode.series_tmdb_id = s.tmdb_id
        AND watched_episode.is_special = 0
        AND watched_episode.is_watched = 1
    )
  END DESC,
  s.title COLLATE NOCASE`,
    watchStatus,
  );
}

export function getContinuingSeries(): Promise<HomeSeries[]> {
  return getHomeSeriesByWatchStatus("continuing");
}

export function getNotStartedSeries(): Promise<HomeSeries[]> {
  return getHomeSeriesByWatchStatus("not_started_yet");
}

export function getWatchLaterSeries(): Promise<HomeSeries[]> {
  return getHomeSeriesByWatchStatus("watch_later");
}

export type CalendarSeries = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
};

export async function getCalendarSeries(): Promise<CalendarSeries[]> {
  const db = await getDatabase();

  return db.getAllAsync<CalendarSeries>(
    `SELECT
       tmdb_id,
       title,
       poster_path
     FROM series
     WHERE watch_status IN ('continuing', 'not_started_yet')
     ORDER BY title COLLATE NOCASE`,
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

export async function isTvSeriesFavorite(tmdbId: number): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ found: number }>(
    `SELECT 1 AS found
     FROM "preferiti"
     WHERE item_type = 'series'
       AND series_tmdb_id = ?
     LIMIT 1`,
    tmdbId,
  );

  return result !== null;
}

export async function isMovieFavorite(tmdbId: number): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ found: number }>(
    `SELECT 1 AS found
     FROM "preferiti"
     WHERE item_type = 'movie'
       AND movie_tmdb_id = ?
     LIMIT 1`,
    tmdbId,
  );

  return result !== null;
}

export async function addTvSeriesFavorite(
  tmdbId: number,
  name: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO "preferiti" (
       item_type,
       series_tmdb_id,
       movie_tmdb_id,
       name
     )
     SELECT 'series', ?, NULL, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM "preferiti"
       WHERE item_type = 'series'
         AND series_tmdb_id = ?
     )`,
    tmdbId,
    name,
    tmdbId,
  );
}

export async function removeTvSeriesFavorite(tmdbId: number): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM "preferiti"
     WHERE item_type = 'series'
       AND series_tmdb_id = ?`,
    tmdbId,
  );
}

export async function addMovieFavorite(
  tmdbId: number,
  name: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO "preferiti" (
       item_type,
       series_tmdb_id,
       movie_tmdb_id,
       name
     )
     SELECT 'movie', NULL, ?, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM "preferiti"
       WHERE item_type = 'movie'
         AND movie_tmdb_id = ?
     )`,
    tmdbId,
    name,
    tmdbId,
  );
}

export async function removeMovieFavorite(tmdbId: number): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM "preferiti"
     WHERE item_type = 'movie'
       AND movie_tmdb_id = ?`,
    tmdbId,
  );
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
       AND season_number = ?
       AND is_watched = 0`,
    watchedAt,
    seriesTmdbId,
    seasonNumber,
  );
}

/**
 * Modifica la data della prima visione di tutti
 * gli episodi già visti di una stagione.
 * Non modifica lo storico dei rewatch.
 */
export async function updateSeasonFirstWatchDate(
  seriesTmdbId: number,
  seasonNumber: number,
  watchedAt: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE episodes
     SET watched_at = ?
     WHERE series_tmdb_id = ?
       AND season_number = ?
       AND is_watched = 1`,
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

/**
 * Verifica se una serie ha almeno un rewatch registrato.
 */
export async function hasTvSeriesRewatch(
  seriesTmdbId: number,
): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ found: number }>(
    `
      SELECT 1 AS found
      FROM rewatch
      WHERE item_type = 'episode'
        AND series_tmdb_id = ?
      LIMIT 1
    `,
    seriesTmdbId,
  );

  return result !== null;
}

/**
 * Verifica se un film ha almeno un rewatch registrato.
 */
export async function hasMovieRewatch(movieTmdbId: number): Promise<boolean> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<{ found: number }>(
    `
      SELECT 1 AS found
      FROM rewatch
      WHERE item_type = 'movie'
        AND movie_tmdb_id = ?
      LIMIT 1
    `,
    movieTmdbId,
  );

  return result !== null;
}

export type TvSeriesRewatch = {
  id: number;
  series_tmdb_id: number;
  season_number: number;
  episode_number: number;
  watched_at: string;
};

export async function getTvSeriesRewatches(
  seriesTmdbId: number,
): Promise<TvSeriesRewatch[]> {
  const db = await getDatabase();

  return db.getAllAsync<TvSeriesRewatch>(
    `SELECT
       id,
       series_tmdb_id,
       season_number,
       episode_number,
       watched_at
     FROM rewatch
     WHERE item_type = 'episode'
       AND series_tmdb_id = ?
     ORDER BY watched_at DESC, id DESC`,
    seriesTmdbId,
  );
}

/**
 * Modifica la data e l'ora di un singolo rewatch.
 */
export async function updateTvSeriesRewatch(
  rewatchId: number,
  watchedAt: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE rewatch
     SET watched_at = ?
     WHERE id = ?
       AND item_type = 'episode'
       AND series_tmdb_id IS NOT NULL`,
    watchedAt,
    rewatchId,
  );
}

/**
 * Elimina un singolo rewatch senza modificare la prima visione.
 */
export async function deleteTvSeriesRewatch(rewatchId: number): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM rewatch
     WHERE id = ?
       AND item_type = 'episode'
       AND series_tmdb_id IS NOT NULL`,
    rewatchId,
  );
}

export type MovieRewatch = {
  id: number;
  movie_tmdb_id: number;
  watched_at: string;
};

export async function getMovieRewatches(
  movieTmdbId: number,
): Promise<MovieRewatch[]> {
  const db = await getDatabase();

  return db.getAllAsync<MovieRewatch>(
    `SELECT
       id,
       movie_tmdb_id,
       watched_at
     FROM rewatch
     WHERE item_type = 'movie'
       AND movie_tmdb_id = ?
     ORDER BY watched_at DESC, id DESC`,
    movieTmdbId,
  );
}

export type MovieWatchInfo = {
  is_watched: number;
  watched_at: string | null;
};

export type HomeMovie = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
};

export async function getNotWatchedMovies(): Promise<HomeMovie[]> {
  const db = await getDatabase();

  return db.getAllAsync<HomeMovie>(
    `SELECT
       tmdb_id,
       title,
       poster_path,
       release_date
     FROM movies
     WHERE is_watched = 0
     ORDER BY
       CASE WHEN release_date IS NULL OR release_date = '' THEN 1 ELSE 0 END,
       release_date,
       title COLLATE NOCASE`,
  );
}

/**
 * Recupera lo stato della prima visione del film.
 */
export async function getMovieWatchInfo(
  movieTmdbId: number,
): Promise<MovieWatchInfo | null> {
  const db = await getDatabase();

  return db.getFirstAsync<MovieWatchInfo>(
    `SELECT is_watched, watched_at
     FROM movies
     WHERE tmdb_id = ?
     LIMIT 1`,
    movieTmdbId,
  );
}

/**
 * Registra la prima visione del film.
 */
export async function markMovieWatched(
  movieTmdbId: number,
  watchedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE movies
     SET is_watched = 1,
         watched_at = ?
     WHERE tmdb_id = ?`,
    watchedAt,
    movieTmdbId,
  );
}

/**
 * Segna il film come non visto ed elimina tutti i suoi rewatch.
 */
export async function markMovieUnwatched(movieTmdbId: number): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE movies
       SET is_watched = 0,
           watched_at = NULL
       WHERE tmdb_id = ?`,
      movieTmdbId,
    );

    await db.runAsync(
      `DELETE FROM rewatch
       WHERE item_type = 'movie'
         AND movie_tmdb_id = ?`,
      movieTmdbId,
    );
  });
}

/**
 * Registra un rewatch di un film già visto.
 */
export async function addMovieRewatch(
  movieTmdbId: number,
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
       'movie',
       NULL,
       NULL,
       NULL,
       NULL,
       tmdb_id,
       ?
     FROM movies
     WHERE tmdb_id = ?
       AND is_watched = 1`,
    watchedAt,
    movieTmdbId,
  );
}

/**
 * Elimina tutti i rewatch del film, conservando la prima visione.
 */
export async function clearMovieRewatches(movieTmdbId: number): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM rewatch
     WHERE item_type = 'movie'
       AND movie_tmdb_id = ?`,
    movieTmdbId,
  );
}

/**
 * Elimina il rewatch più recente del film.
 */
export async function removeLastMovieRewatch(
  movieTmdbId: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM rewatch
     WHERE id = (
       SELECT id
       FROM rewatch
       WHERE item_type = 'movie'
         AND movie_tmdb_id = ?
       ORDER BY watched_at DESC, id DESC
       LIMIT 1
     )`,
    movieTmdbId,
  );
}

/**
 * Modifica la data di un singolo rewatch del film.
 */
export async function updateMovieRewatch(
  rewatchId: number,
  watchedAt: string,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE rewatch
     SET watched_at = ?
     WHERE id = ?
       AND item_type = 'movie'
       AND movie_tmdb_id IS NOT NULL`,
    watchedAt,
    rewatchId,
  );
}

/**
 * Elimina un singolo rewatch senza modificare la prima visione.
 */
export async function deleteMovieRewatch(rewatchId: number): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `DELETE FROM rewatch
     WHERE id = ?
       AND item_type = 'movie'
       AND movie_tmdb_id IS NOT NULL`,
    rewatchId,
  );
}

export type SavedEpisode = {
  id: number;
  series_tmdb_id: number;
  season_number: number;
  episode_number: number;
  title: string | null;
  is_watched: number;
  watched_at: string | null;
  rewatch_count: number;
  is_special: number;
  tmdb_id: number | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
};

export type HomeWatchStatus = "continuing" | "not_started_yet" | "watch_later";

export type HomeSeries = {
  tmdb_id: number;
  episode_tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  first_air_date: string | null;
  season_number: number;
  episode_number: number;
  episode_title: string | null;
  still_path: string | null;
  air_date: string | null;
  remaining_episodes: number;
};

export async function getEpisodeByTmdbId(
  episodeTmdbId: number,
): Promise<SavedEpisode | null> {
  const db = await getDatabase();

  return db.getFirstAsync<SavedEpisode>(
    `SELECT *
     FROM episodes
     WHERE tmdb_id = ?`,
    [episodeTmdbId],
  );
}

export async function getEpisodeWatchInfo(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<{
  is_watched: number;
  watched_at: string | null;
} | null> {
  const db = await getDatabase();

  return db.getFirstAsync(
    `SELECT is_watched, watched_at
     FROM episodes
     WHERE series_tmdb_id = ?
       AND season_number = ?
       AND episode_number = ?
     LIMIT 1`,
    seriesTmdbId,
    seasonNumber,
    episodeNumber,
  );
}

/**
 * Registra la visione di un episodio dalla Home.
 * Se la serie non è già in visione, aggiorna
 * il suo stato personale a "continuing".
 */
export async function markHomeEpisodeWatched(
  seriesTmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  currentWatchStatus: HomeWatchStatus,
  watchedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE episodes
       SET is_watched = 1,
           watched_at = ?
       WHERE series_tmdb_id = ?
         AND season_number = ?
         AND episode_number = ?
         AND is_special = 0`,
      watchedAt,
      seriesTmdbId,
      seasonNumber,
      episodeNumber,
    );

    if (currentWatchStatus !== "continuing") {
      await db.runAsync(
        `UPDATE series
         SET watch_status = 'continuing'
         WHERE tmdb_id = ?`,
        seriesTmdbId,
      );
    }
  });
}
