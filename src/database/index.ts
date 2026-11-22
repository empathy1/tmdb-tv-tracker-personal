import * as SQLite from "expo-sqlite";

import type {
  TitleLanguage,
  TMDBMovieDetails,
  TMDBTvDetails,
  TMDBTvSeasonDetails,
} from "@/types/tmdb";

import {
  getMovieDetails,
  getMovieExternalIds,
  getTvDetails,
  getTvExternalIds,
  getTvSeasonDetails,
} from "@/services/tmdb";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export const DATABASE_NAME = "tv_tracker.db";
let databaseInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase() {
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

async function addToArchiveList(
  itemType: "series" | "movie",
  tmdbId: number,
): Promise<void> {
  const db = await getDatabase();

  const archiveList = await db.getFirstAsync<{ list_id: string }>(
    `SELECT list_id
     FROM elenco_liste
     WHERE name = 'Archivio' COLLATE NOCASE`,
  );

  if (!archiveList) {
    throw new Error("La lista Archivio non è stata trovata.");
  }

  if (itemType === "series") {
    await db.runAsync(
      `INSERT INTO liste (list_id, item_type, series_tmdb_id)
       SELECT ?, 'series', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM liste
         WHERE list_id = ? AND item_type = 'series' AND series_tmdb_id = ?
       )`,
      archiveList.list_id,
      tmdbId,
      archiveList.list_id,
      tmdbId,
    );
  } else {
    await db.runAsync(
      `INSERT INTO liste (list_id, item_type, movie_tmdb_id)
       SELECT ?, 'movie', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM liste
         WHERE list_id = ? AND item_type = 'movie' AND movie_tmdb_id = ?
       )`,
      archiveList.list_id,
      tmdbId,
      archiveList.list_id,
      tmdbId,
    );
  }
}

async function syncWatchlistItem(
  itemType: "series" | "movie",
  tmdbId: number,
  shouldBeInWatchlist: boolean,
): Promise<void> {
  const db = await getDatabase();

  const watchlist = await db.getFirstAsync<{ list_id: string }>(
    `SELECT list_id
     FROM elenco_liste
     WHERE name = 'Watchlist' COLLATE NOCASE`,
  );

  if (!watchlist) {
    throw new Error("La lista Watchlist non è stata trovata.");
  }

  if (shouldBeInWatchlist) {
    if (itemType === "series") {
      await db.runAsync(
        `INSERT INTO liste (list_id, item_type, series_tmdb_id)
         SELECT ?, 'series', ?
         WHERE NOT EXISTS (
           SELECT 1 FROM liste
           WHERE list_id = ?
             AND item_type = 'series'
             AND series_tmdb_id = ?
         )`,
        watchlist.list_id,
        tmdbId,
        watchlist.list_id,
        tmdbId,
      );
    } else {
      await db.runAsync(
        `INSERT INTO liste (list_id, item_type, movie_tmdb_id)
         SELECT ?, 'movie', ?
         WHERE NOT EXISTS (
           SELECT 1 FROM liste
           WHERE list_id = ?
             AND item_type = 'movie'
             AND movie_tmdb_id = ?
         )`,
        watchlist.list_id,
        tmdbId,
        watchlist.list_id,
        tmdbId,
      );
    }
  } else {
    await db.runAsync(
      `DELETE FROM liste
       WHERE list_id = ?
         AND item_type = ?
         AND ${itemType === "series" ? "series_tmdb_id" : "movie_tmdb_id"} = ?`,
      watchlist.list_id,
      itemType,
      tmdbId,
    );
  }
}

async function syncDroppedListItem(
  tmdbId: number,
  shouldBeDropped: boolean,
): Promise<void> {
  const db = await getDatabase();

  const droppedList = await db.getFirstAsync<{ list_id: string }>(
    `SELECT list_id
     FROM elenco_liste
     WHERE name = 'Droppate' COLLATE NOCASE`,
  );

  if (!droppedList) {
    throw new Error("La lista Droppate non è stata trovata.");
  }

  if (shouldBeDropped) {
    await db.runAsync(
      `INSERT INTO liste (list_id, item_type, series_tmdb_id)
       SELECT ?, 'series', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM liste
         WHERE list_id = ?
           AND item_type = 'series'
           AND series_tmdb_id = ?
       )`,
      droppedList.list_id,
      tmdbId,
      droppedList.list_id,
      tmdbId,
    );
  } else {
    await db.runAsync(
      `DELETE FROM liste
       WHERE list_id = ?
         AND item_type = 'series'
         AND series_tmdb_id = ?`,
      droppedList.list_id,
      tmdbId,
    );
  }
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

  await addToArchiveList("series", details.id);
  const savedSeries = await db.getFirstAsync<{
    watch_status: string | null;
  }>("SELECT watch_status FROM series WHERE tmdb_id = ?", details.id);

  await syncWatchlistItem(
    "series",
    details.id,
    savedSeries?.watch_status === "not_started_yet",
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
      release_date,
      runtime,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tmdb_id) DO UPDATE SET
      runtime = COALESCE(excluded.runtime, movies.runtime)
    WHERE movies.source = 'legacy'`,
    details.id,
    externalIds.imdb_id,
    details.title,
    details.poster_path,
    details.backdrop_path,
    details.overview,
    details.release_date || null,
    details.runtime,
  );

  await addToArchiveList("movie", details.id);
  const savedMovie = await db.getFirstAsync<{
    is_watched: number;
  }>("SELECT is_watched FROM movies WHERE tmdb_id = ?", details.id);

  await syncWatchlistItem("movie", details.id, savedMovie?.is_watched === 0);
}

export async function saveTvSeasonEpisodes(
  seriesTmdbId: number,
  season: TMDBTvSeasonDetails,
): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const episode of season.episodes) {
      await db.runAsync(
        `INSERT INTO episodes (
          series_tmdb_id,
          season_number,
          episode_number,
          tmdb_id,
          title,
          overview,
          air_date,
          still_path,
          is_special,
          runtime
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(series_tmdb_id, season_number, episode_number)
        DO UPDATE SET
          runtime = COALESCE(excluded.runtime, episodes.runtime)
        WHERE EXISTS (
          SELECT 1
          FROM series
          WHERE series.tmdb_id = episodes.series_tmdb_id
            AND series.source = 'legacy'
        )`,
        seriesTmdbId,
        episode.season_number,
        episode.episode_number,
        episode.id,
        episode.name,
        episode.overview,
        episode.air_date,
        episode.still_path,
        episode.season_number === 0 ? 1 : 0,
        episode.runtime,
      );
    }
  });
}

export async function exportDatabaseFile(
  onBeforeShare?: () => void,
): Promise<void> {
  const db = await getDatabase();

  // Crea una copia temporanea del database originale.
  const originalBackup = await db.serializeAsync();
  const temporaryDb = await SQLite.deserializeDatabaseAsync(originalBackup);

  try {
    await temporaryDb.execAsync("PRAGMA foreign_keys = OFF;");

    const excludedTables = [
      "legacy_episode_mapping_attempts",
      "episode_history_mappings",
      "legacy_series_migrations",
      "legacy_episodes",
      "legacy_movies",
      "legacy_series",
      "schema_migrations",
    ];

    for (const table of excludedTables) {
      await temporaryDb.execAsync(`DROP TABLE IF EXISTS "${table}";`);
    }

    const tables = await temporaryDb.getAllAsync<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       ORDER BY name`,
    );

    console.log(
      "Tabelle nel backup:",
      tables.map((table) => table.name),
    );

    const backup = await temporaryDb.serializeAsync();

    const fileName = `tv_tracker_${Date.now()}.db`;
    const destination = `${FileSystem.cacheDirectory}${fileName}`;

    const bytes = Array.from(backup);
    const binaryString = bytes
      .map((byte) => String.fromCharCode(byte))
      .join("");

    const base64 = btoa(binaryString);

    await FileSystem.writeAsStringAsync(destination, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("La condivisione dei file non è disponibile.");
    }

    // Comunica a HubScreen che il file è pronto.
    onBeforeShare?.();

    // Attende un frame per permettere l'aggiornamento dell'interfaccia.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    await Sharing.shareAsync(destination, {
      mimeType: "application/x-sqlite3",
      dialogTitle: "Esporta database TV Tracker",
      UTI: "public.database",
    });
  } finally {
    await temporaryDb.closeAsync();
  }
}

export async function importDatabaseFile(file: File): Promise<void> {
  const db = await getDatabase();

  // Legge direttamente il file selezionato.
  const bytes = await file.bytes();

  // Apre il backup come database temporaneo in memoria.
  const importedDb = await SQLite.deserializeDatabaseAsync(bytes);

  try {
    // Verifica che il database sia integro.
    const integrity = await importedDb.getFirstAsync<{
      integrity_check: string;
    }>("PRAGMA integrity_check");

    if (integrity?.integrity_check !== "ok") {
      throw new Error("Il database selezionato non è integro.");
    }

    // Controlla la presenza delle principali tabelle.
    const tables = await importedDb.getAllAsync<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'`,
    );

    const tableNames = tables.map((table) => table.name);
    console.log("TABELLE PRESENTI NEL BACKUP:", tableNames);
    const requiredTables = [
      "series",
      "episodes",
      "movies",
      "liste",
      "elenco_liste",
      "preferiti",
      "rewatch",
      "hub_settings",
    ];

    if (!requiredTables.every((name) => tableNames.includes(name))) {
      throw new Error(
        "Il file selezionato non è un backup valido di TV Tracker.",
      );
    }

    // Verifica che le colonne delle tabelle siano compatibili.
    for (const table of requiredTables) {
      const importedColumns = await importedDb.getAllAsync<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>(`PRAGMA table_info("${table}")`);

      const currentColumns = await db.getAllAsync<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>(`PRAGMA table_info("${table}")`);

      const importedStructure = importedColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull,
        dflt_value: column.dflt_value,
        pk: column.pk,
      }));

      const currentStructure = currentColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull,
        dflt_value: column.dflt_value,
        pk: column.pk,
      }));

      if (
        JSON.stringify(importedStructure) !== JSON.stringify(currentStructure)
      ) {
        throw new Error(
          `La struttura della tabella "${table}" non è compatibile con questa versione dell'app.`,
        );
      }
    }

    // Ripristina il database.
    await SQLite.backupDatabaseAsync({
      sourceDatabase: importedDb,
      destDatabase: db,
      sourceDatabaseName: "main",
      destDatabaseName: "main",
    });
  } finally {
    await importedDb.closeAsync();
  }
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

  await syncWatchlistItem("series", tmdbId, watchStatus === "not_started_yet");
  await syncDroppedListItem(tmdbId, watchStatus === "stopped");
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
      CASE
        WHEN s.watch_status = 'not_started_yet' THEN s.created_at
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

  await db.withTransactionAsync(async () => {
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

    await db.runAsync(
      `UPDATE series
       SET watch_status = 'continuing'
       WHERE tmdb_id = ?
         AND (
           watch_status IS NULL OR
           watch_status = 'not_started_yet' OR
           watch_status = 'stopped'
         )`,
      seriesTmdbId,
    );

    await syncWatchlistItem("series", seriesTmdbId, false);
    await syncDroppedListItem(seriesTmdbId, false);
  });
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

    const series = await db.getFirstAsync<{
      watch_status: string | null;
    }>(
      `SELECT watch_status
       FROM series
       WHERE tmdb_id = ?`,
      seriesTmdbId,
    );

    if (
      series?.watch_status === "up_to_date" ||
      series?.watch_status === "continuing"
    ) {
      const result = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM episodes
         WHERE series_tmdb_id = ?
           AND is_watched = 1`,
        seriesTmdbId,
      );

      const nextStatus =
        (result?.total ?? 0) > 0 ? "continuing" : "not_started_yet";

      await db.runAsync(
        `UPDATE series
         SET watch_status = ?
         WHERE tmdb_id = ?`,
        nextStatus,
        seriesTmdbId,
      );

      await syncWatchlistItem(
        "series",
        seriesTmdbId,
        nextStatus === "not_started_yet",
      );
      await syncDroppedListItem(seriesTmdbId, false);
    }
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

  await db.withTransactionAsync(async () => {
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

    await db.runAsync(
      `UPDATE series
       SET watch_status = 'continuing'
       WHERE tmdb_id = ?
         AND (
           watch_status IS NULL OR
           watch_status = 'not_started_yet' OR
           watch_status = 'stopped'
         )`,
      seriesTmdbId,
    );

    await syncWatchlistItem("series", seriesTmdbId, false);
    await syncDroppedListItem(seriesTmdbId, false);
  });
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

    const series = await db.getFirstAsync<{
      watch_status: string | null;
    }>(
      `SELECT watch_status
       FROM series
       WHERE tmdb_id = ?`,
      seriesTmdbId,
    );

    if (
      series?.watch_status === "up_to_date" ||
      series?.watch_status === "continuing"
    ) {
      const result = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM episodes
         WHERE series_tmdb_id = ?
           AND is_watched = 1`,
        seriesTmdbId,
      );

      const nextStatus =
        (result?.total ?? 0) > 0 ? "continuing" : "not_started_yet";

      await db.runAsync(
        `UPDATE series
         SET watch_status = ?
         WHERE tmdb_id = ?`,
        nextStatus,
        seriesTmdbId,
      );

      await syncWatchlistItem(
        "series",
        seriesTmdbId,
        nextStatus === "not_started_yet",
      );
      await syncDroppedListItem(seriesTmdbId, false);
    }
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
     ORDER BY created_at DESC`,
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

  await syncWatchlistItem("movie", movieTmdbId, false);
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

    await syncWatchlistItem("movie", movieTmdbId, true);

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

    await syncWatchlistItem("series", seriesTmdbId, false);
    await syncDroppedListItem(seriesTmdbId, false);
  });
}

export type HubSettings = {
  name: string | null;
  hub_poster: string | null;
  avatar: string | null;
};

export async function getHubSettings(): Promise<HubSettings | null> {
  const db = await getDatabase();

  return db.getFirstAsync<HubSettings>(
    `SELECT name, hub_poster, avatar
     FROM hub_settings
     ORDER BY id ASC
     LIMIT 1`,
  );
}

export async function saveHubSettings(settings: HubSettings): Promise<void> {
  const db = await getDatabase();

  const existing = await getHubSettings();

  if (existing) {
    await db.runAsync(
      `UPDATE hub_settings
       SET name = ?, hub_poster = ?, avatar = ?
       WHERE id = (
         SELECT id FROM hub_settings ORDER BY id ASC LIMIT 1
       )`,
      settings.name,
      settings.hub_poster,
      settings.avatar,
    );
  } else {
    await db.runAsync(
      `INSERT INTO hub_settings (name, hub_poster, avatar)
       VALUES (?, ?, ?)`,
      settings.name,
      settings.hub_poster,
      settings.avatar,
    );
  }
}

export type HubFavoriteSeries = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  first_air_date: string | null;
  status: string | null;
  watch_status: string | null;
  favorite_date: string | null;
};

export type HubFavoriteMovie = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  is_watched: number;
  favorite_date: string | null;
};

export async function getFavoriteSeries(): Promise<HubFavoriteSeries[]> {
  const db = await getDatabase();

  return db.getAllAsync<HubFavoriteSeries>(
    `SELECT
       s.tmdb_id,
       s.title,
       s.poster_path,
       s.backdrop_path,
       s.overview,
       s.first_air_date,
       s.status,
       s.watch_status,
       p.favorite_date
     FROM preferiti p
     INNER JOIN series s ON s.tmdb_id = p.series_tmdb_id
     WHERE p.item_type = 'series'
     ORDER BY p.favorite_date DESC`,
  );
}

export async function getFavoriteMovies(): Promise<HubFavoriteMovie[]> {
  const db = await getDatabase();

  return db.getAllAsync<HubFavoriteMovie>(
    `SELECT
       m.tmdb_id,
       m.title,
       m.poster_path,
       m.backdrop_path,
       m.overview,
       m.release_date,
       m.is_watched,
       p.favorite_date
     FROM preferiti p
     INNER JOIN movies m ON m.tmdb_id = p.movie_tmdb_id
     WHERE p.item_type = 'movie'
     ORDER BY p.favorite_date DESC`,
  );
}

export type HubBackgroundOption = {
  media_type: "series" | "movie";
  tmdb_id: number;
  title: string;
  backdrop_path: string;
  is_favorite: number;
};

export async function getHubBackgroundOptions(): Promise<
  HubBackgroundOption[]
> {
  const db = await getDatabase();

  return db.getAllAsync<HubBackgroundOption>(
    `SELECT
       'series' AS media_type,
       s.tmdb_id,
       s.title,
       s.backdrop_path,
       CASE WHEN p.series_tmdb_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
     FROM series s
     LEFT JOIN preferiti p
       ON p.item_type = 'series'
       AND p.series_tmdb_id = s.tmdb_id
     WHERE s.backdrop_path IS NOT NULL

     UNION ALL

     SELECT
       'movie' AS media_type,
       m.tmdb_id,
       m.title,
       m.backdrop_path,
       CASE WHEN p.movie_tmdb_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
     FROM movies m
     LEFT JOIN preferiti p
       ON p.item_type = 'movie'
       AND p.movie_tmdb_id = m.tmdb_id
     WHERE m.backdrop_path IS NOT NULL

     ORDER BY is_favorite DESC, title COLLATE NOCASE`,
  );
}

export type HubHistoryItem = {
  media_type: "movie" | "episode";
  tmdb_id: number | null;
  title: string;
  series_title: string | null;
  poster_path: string | null;
  still_path: string | null;
  season_number: number | null;
  episode_number: number | null;
  watched_at: string;
  watch_number: number;
  series_tmdb_id: number | null;
};

export async function getWatchHistory(
  limit: number = 20,
): Promise<HubHistoryItem[]> {
  const db = await getDatabase();

  return db.getAllAsync<HubHistoryItem>(
    `WITH all_views AS (
      SELECT
        'movie' AS media_type,
        NULL AS series_tmdb_id,
        NULL AS season_number,
        NULL AS episode_number,
        m.tmdb_id AS movie_tmdb_id,
        m.tmdb_id AS tmdb_id,
        m.watched_at AS watched_at,
        0 AS event_order,
        0 AS event_id
      FROM movies m
      WHERE m.is_watched = 1
        AND m.watched_at IS NOT NULL

      UNION ALL

      SELECT
        'movie',
        NULL,
        NULL,
        NULL,
        r.movie_tmdb_id,
        r.movie_tmdb_id,
        r.watched_at,
        1,
        r.id
      FROM rewatch r
      WHERE r.item_type = 'movie'

      UNION ALL

      SELECT
        'episode',
        e.series_tmdb_id,
        e.season_number,
        e.episode_number,
        NULL,
        e.tmdb_id,
        e.watched_at,
        0,
        0
      FROM episodes e
      WHERE e.is_watched = 1
        AND e.watched_at IS NOT NULL

      UNION ALL

      SELECT
        'episode',
        r.series_tmdb_id,
        r.season_number,
        r.episode_number,
        NULL,
        r.episode_tmdb_id,
        r.watched_at,
        1,
        r.id
      FROM rewatch r
      WHERE r.item_type = 'episode'
    ),
    numbered_views AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY
            media_type,
            series_tmdb_id,
            season_number,
            episode_number,
            movie_tmdb_id
          ORDER BY watched_at ASC, event_order ASC, event_id ASC
        ) AS watch_number
      FROM all_views
    )
    SELECT
      v.media_type,
      v.tmdb_id,
      v.series_tmdb_id,
      CASE
        WHEN v.media_type = 'movie' THEN m.title
        ELSE e.title
      END AS title,
      s.title AS series_title,
      CASE
        WHEN v.media_type = 'movie' THEN m.poster_path
        ELSE s.poster_path
      END AS poster_path,
      e.still_path,
      v.season_number,
      v.episode_number,
      v.watched_at,
      v.watch_number
    FROM numbered_views v
    LEFT JOIN movies m
      ON v.movie_tmdb_id = m.tmdb_id
    LEFT JOIN episodes e
      ON v.series_tmdb_id = e.series_tmdb_id
      AND v.season_number = e.season_number
      AND v.episode_number = e.episode_number
    LEFT JOIN series s
      ON v.series_tmdb_id = s.tmdb_id
    ORDER BY v.watched_at DESC, v.event_order DESC, v.event_id DESC
    LIMIT ?`,
    limit,
  );
}

export type HubStatistics = {
  weeklyEpisodes: number;
  weeklyDistinctEpisodes: number;
  weeklyMovies: number;
  weeklyDistinctMovies: number;

  monthlyEpisodes: number;
  monthlyMovies: number;

  yearlyEpisodes: number;
  yearlyMovies: number;

  totalEpisodes: number;
  totalDistinctEpisodes: number;
  totalMovies: number;
  totalDistinctMovies: number;
  totalSeriesWatched: number;

  startedSeries: number;
  completedSeries: number;

  totalMinutes: number;
  seriesFirstWatchMinutes: number;
  movieFirstWatchMinutes: number;
  seriesRewatchMinutes: number;
  movieRewatchMinutes: number;
  monthlyDistinctEpisodes: number;
  monthlyDistinctMovies: number;
  yearlyDistinctEpisodes: number;
  yearlyDistinctMovies: number;
};

export type MostRewatchedMovie = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  watch_count: number;
};

export type MostWatchedEpisode = {
  tmdb_id: number | null;
  series_tmdb_id: number;
  series_title: string;
  episode_title: string;
  season_number: number;
  episode_number: number;
  poster_path: string | null;
  watch_count: number;
};

export async function getHubStatistics(): Promise<HubStatistics> {
  const db = await getDatabase();

  const result = await db.getFirstAsync<HubStatistics>(
    `SELECT
      (
        SELECT COUNT(*) FROM episodes
        WHERE is_watched = 1 AND watched_at IS NOT NULL
          AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
          AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')
      ) +
      (
        SELECT COUNT(*) FROM rewatch
        WHERE item_type = 'episode'
          AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
          AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')
      ) AS weeklyEpisodes,

      (
  SELECT COUNT(*)
  FROM (
    SELECT series_tmdb_id, season_number, episode_number
    FROM episodes
    WHERE is_watched = 1 AND watched_at IS NOT NULL
      AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
      AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')

    UNION

    SELECT series_tmdb_id, season_number, episode_number
    FROM rewatch
    WHERE item_type = 'episode'
      AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
      AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')
  )
) AS weeklyDistinctEpisodes,

      (
        SELECT COUNT(*) FROM movies
        WHERE is_watched = 1 AND watched_at IS NOT NULL
          AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
          AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')
      ) +
      (
        SELECT COUNT(*) FROM rewatch
        WHERE item_type = 'movie'
          AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
          AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')
      ) AS weeklyMovies,

      (
        SELECT COUNT(DISTINCT movie_tmdb_id)
        FROM (
          SELECT tmdb_id AS movie_tmdb_id
          FROM movies
          WHERE is_watched = 1 AND watched_at IS NOT NULL
            AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
            AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')
          UNION
          SELECT movie_tmdb_id
          FROM rewatch
          WHERE item_type = 'movie'
            AND date(watched_at) >= date('now', 'localtime', 'weekday 0', '-6 days')
            AND date(watched_at) < date('now', 'localtime', 'weekday 0', '+1 day')
        )
      ) AS weeklyDistinctMovies,
             (
        SELECT COUNT(*) FROM episodes
        WHERE is_watched = 1 AND watched_at IS NOT NULL
          AND date(watched_at) >= date('now', 'localtime', 'start of month')
          AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')
      ) +
      (
        SELECT COUNT(*) FROM rewatch
        WHERE item_type = 'episode'
          AND date(watched_at) >= date('now', 'localtime', 'start of month')
          AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')
      ) AS monthlyEpisodes,

      (
        SELECT COUNT(*) FROM movies
        WHERE is_watched = 1 AND watched_at IS NOT NULL
          AND date(watched_at) >= date('now', 'localtime', 'start of month')
          AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')
      ) +
      (
        SELECT COUNT(*) FROM rewatch
        WHERE item_type = 'movie'
          AND date(watched_at) >= date('now', 'localtime', 'start of month')
          AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')
      ) AS monthlyMovies,

      (
  SELECT COUNT(DISTINCT series_tmdb_id || '-' || season_number || '-' || episode_number)
  FROM (
    SELECT series_tmdb_id, season_number, episode_number
    FROM episodes
    WHERE is_watched = 1 AND watched_at IS NOT NULL
      AND date(watched_at) >= date('now', 'localtime', 'start of month')
      AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')

    UNION

    SELECT series_tmdb_id, season_number, episode_number
    FROM rewatch
    WHERE item_type = 'episode'
      AND date(watched_at) >= date('now', 'localtime', 'start of month')
      AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')
  )
) AS monthlyDistinctEpisodes,

(
  SELECT COUNT(DISTINCT movie_tmdb_id)
  FROM (
    SELECT tmdb_id AS movie_tmdb_id
    FROM movies
    WHERE is_watched = 1 AND watched_at IS NOT NULL
      AND date(watched_at) >= date('now', 'localtime', 'start of month')
      AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')

    UNION

    SELECT movie_tmdb_id
    FROM rewatch
    WHERE item_type = 'movie'
      AND date(watched_at) >= date('now', 'localtime', 'start of month')
      AND date(watched_at) < date('now', 'localtime', 'start of month', '+1 month')
  )
) AS monthlyDistinctMovies,

      (
        SELECT COUNT(*) FROM episodes
        WHERE is_watched = 1 AND watched_at IS NOT NULL
          AND date(watched_at) >= date('now', 'localtime', 'start of year')
          AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')
      ) +
      (
        SELECT COUNT(*) FROM rewatch
        WHERE item_type = 'episode'
          AND date(watched_at) >= date('now', 'localtime', 'start of year')
          AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')
      ) AS yearlyEpisodes,

      (
        SELECT COUNT(*) FROM movies
        WHERE is_watched = 1 AND watched_at IS NOT NULL
          AND date(watched_at) >= date('now', 'localtime', 'start of year')
          AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')
      ) +
      (
        SELECT COUNT(*) FROM rewatch
        WHERE item_type = 'movie'
          AND date(watched_at) >= date('now', 'localtime', 'start of year')
          AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')
      ) AS yearlyMovies,

      (
  SELECT COUNT(DISTINCT series_tmdb_id || '-' || season_number || '-' || episode_number)
  FROM (
    SELECT series_tmdb_id, season_number, episode_number
    FROM episodes
    WHERE is_watched = 1 AND watched_at IS NOT NULL
      AND date(watched_at) >= date('now', 'localtime', 'start of year')
      AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')

    UNION

    SELECT series_tmdb_id, season_number, episode_number
    FROM rewatch
    WHERE item_type = 'episode'
      AND date(watched_at) >= date('now', 'localtime', 'start of year')
      AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')
  )
) AS yearlyDistinctEpisodes,

(
  SELECT COUNT(DISTINCT movie_tmdb_id)
  FROM (
    SELECT tmdb_id AS movie_tmdb_id
    FROM movies
    WHERE is_watched = 1 AND watched_at IS NOT NULL
      AND date(watched_at) >= date('now', 'localtime', 'start of year')
      AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')

    UNION

    SELECT movie_tmdb_id
    FROM rewatch
    WHERE item_type = 'movie'
      AND date(watched_at) >= date('now', 'localtime', 'start of year')
      AND date(watched_at) < date('now', 'localtime', 'start of year', '+1 year')
  )
) AS yearlyDistinctMovies,

      (
        SELECT COUNT(*) FROM episodes WHERE is_watched = 1
      ) +
      (
        SELECT COUNT(*) FROM rewatch WHERE item_type = 'episode'
      ) AS totalEpisodes,

      (
        SELECT COUNT(*) FROM episodes WHERE is_watched = 1
      ) AS totalDistinctEpisodes,

            (
        SELECT COUNT(DISTINCT series_tmdb_id)
        FROM episodes
        WHERE is_watched = 1
      ) AS totalSeriesWatched,

      (
        SELECT COUNT(*) FROM movies WHERE is_watched = 1
      ) +
      (
        SELECT COUNT(*) FROM rewatch WHERE item_type = 'movie'
      ) AS totalMovies,

      (
        SELECT COUNT(*) FROM movies WHERE is_watched = 1
      ) AS totalDistinctMovies,

      (
        SELECT COUNT(*) FROM series
        WHERE watch_status IN ('continuing', 'up_to_date', 'stopped', 'completed')
      ) AS startedSeries,

      (
        SELECT COUNT(*) FROM series
        WHERE watch_status = 'up_to_date'
      ) AS completedSeries,
       
             (
        SELECT COALESCE(SUM(runtime), 0)
        FROM episodes
        WHERE is_watched = 1
      ) +
      (
        SELECT COALESCE(SUM(runtime), 0)
        FROM movies
        WHERE is_watched = 1
      ) AS totalMinutes,

      (
        SELECT COALESCE(SUM(runtime), 0)
        FROM episodes
        WHERE is_watched = 1
      ) AS seriesFirstWatchMinutes,

      (
        SELECT COALESCE(SUM(runtime), 0)
        FROM movies
        WHERE is_watched = 1
      ) AS movieFirstWatchMinutes,

      (
        SELECT COALESCE(SUM(e.runtime), 0)
        FROM rewatch r
        JOIN episodes e
          ON e.series_tmdb_id = r.series_tmdb_id
          AND e.season_number = r.season_number
          AND e.episode_number = r.episode_number
        WHERE r.item_type = 'episode'
      ) AS seriesRewatchMinutes,

      (
        SELECT COALESCE(SUM(m.runtime), 0)
        FROM rewatch r
        JOIN movies m ON m.tmdb_id = r.movie_tmdb_id
        WHERE r.item_type = 'movie'
      ) AS movieRewatchMinutes`,
  );

  return (
    result ?? {
      weeklyEpisodes: 0,
      weeklyDistinctEpisodes: 0,
      weeklyMovies: 0,
      weeklyDistinctMovies: 0,
      totalEpisodes: 0,
      totalDistinctEpisodes: 0,
      totalMovies: 0,
      totalDistinctMovies: 0,
      startedSeries: 0,
      completedSeries: 0,
      totalMinutes: 0,
      monthlyEpisodes: 0,
      monthlyMovies: 0,
      yearlyEpisodes: 0,
      yearlyMovies: 0,
      totalSeriesWatched: 0,
      seriesFirstWatchMinutes: 0,
      movieFirstWatchMinutes: 0,
      seriesRewatchMinutes: 0,
      movieRewatchMinutes: 0,
      monthlyDistinctEpisodes: 0,
      monthlyDistinctMovies: 0,
      yearlyDistinctEpisodes: 0,
      yearlyDistinctMovies: 0,
    }
  );
}

export async function getMostRewatchedMovies(): Promise<MostRewatchedMovie[]> {
  const db = await getDatabase();

  return db.getAllAsync<MostRewatchedMovie>(
    `SELECT
      m.tmdb_id,
      m.title,
      m.poster_path,
      (
        CASE WHEN m.is_watched = 1 THEN 1 ELSE 0 END +
        COUNT(r.id)
      ) AS watch_count
    FROM movies m
    LEFT JOIN rewatch r
      ON r.item_type = 'movie'
      AND r.movie_tmdb_id = m.tmdb_id
    WHERE m.is_watched = 1
    GROUP BY m.tmdb_id
    HAVING watch_count > 1
    ORDER BY watch_count DESC, m.title COLLATE NOCASE ASC
    LIMIT 10`,
  );
}

export async function getMostWatchedEpisodes(): Promise<MostWatchedEpisode[]> {
  const db = await getDatabase();

  return db.getAllAsync<MostWatchedEpisode>(
    `SELECT
      e.tmdb_id,
      e.series_tmdb_id,
      s.title AS series_title,
      e.title AS episode_title,
      e.season_number,
      e.episode_number,
      s.poster_path,
      (
        CASE WHEN e.is_watched = 1 THEN 1 ELSE 0 END +
        (
          SELECT COUNT(*)
          FROM rewatch r
          WHERE r.item_type = 'episode'
            AND r.series_tmdb_id = e.series_tmdb_id
            AND r.season_number = e.season_number
            AND r.episode_number = e.episode_number
        )
      ) AS watch_count
    FROM episodes e
    JOIN series s ON s.tmdb_id = e.series_tmdb_id
    WHERE e.is_watched = 1
       OR EXISTS (
          SELECT 1
          FROM rewatch r
          WHERE r.item_type = 'episode'
            AND r.series_tmdb_id = e.series_tmdb_id
            AND r.season_number = e.season_number
            AND r.episode_number = e.episode_number
       )
    ORDER BY watch_count DESC, s.title COLLATE NOCASE ASC,
      e.season_number ASC, e.episode_number ASC
    LIMIT 10`,
  );
}

export type HubList = {
  list_id: string;
  name: string;
  item_count: number;
};

export type HubListItem = {
  item_type: "series" | "movie";
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  added_at: string;
  custom_order: number;
  created_at: string;
  watch_status: string | null;
  is_watched: number | null;
  first_air_date: string | null;
  release_date: string | null;
  status: string | null;
};

export async function getHubLists(): Promise<HubList[]> {
  const db = await getDatabase();

  return db.getAllAsync<HubList>(
    `SELECT
       el.list_id,
       el.name,
       COUNT(l.id) AS item_count
     FROM elenco_liste el
     LEFT JOIN liste l ON l.list_id = el.list_id
     GROUP BY el.list_id, el.name
     ORDER BY el.name COLLATE NOCASE ASC`,
  );
}

export async function getHubListItems(listId: string): Promise<HubListItem[]> {
  const db = await getDatabase();

  return db.getAllAsync<HubListItem>(
    `SELECT
       l.item_type,
       COALESCE(s.tmdb_id, m.tmdb_id) AS tmdb_id,
       COALESCE(s.title, m.title, l.name) AS title,
       COALESCE(s.poster_path, m.poster_path) AS poster_path,
       COALESCE(s.backdrop_path, m.backdrop_path) AS backdrop_path,
       COALESCE(s.created_at, m.created_at) AS created_at,
        s.watch_status,
        s.status AS status,
        m.is_watched,
        s.first_air_date,
        m.release_date,
       l.added_at,
       l.custom_order
     FROM liste l
     LEFT JOIN series s
       ON l.item_type = 'series'
       AND s.tmdb_id = l.series_tmdb_id
     LEFT JOIN movies m
       ON l.item_type = 'movie'
       AND m.tmdb_id = l.movie_tmdb_id
     WHERE l.list_id = ?
     ORDER BY l.added_at ASC`,
    listId,
  );
}

export async function addHubListItem(
  listId: string,
  itemType: "series" | "movie",
  tmdbId: number,
  titleLanguage: TitleLanguage = "it",
): Promise<void> {
  const db = await getDatabase();

  if (itemType === "series") {
    const existingSeries = await db.getFirstAsync<{ found: number }>(
      "SELECT 1 AS found FROM series WHERE tmdb_id = ?",
      tmdbId,
    );

    if (!existingSeries) {
      const [details, externalIds] = await Promise.all([
        getTvDetails(tmdbId, titleLanguage),
        getTvExternalIds(tmdbId),
      ]);

      await saveTvSeriesDetails(details, {
        tvdb_id: externalIds.tvdb_id,
        imdb_id: externalIds.imdb_id,
      });

      for (const season of details.seasons) {
        const seasonDetails = await getTvSeasonDetails(
          tmdbId,
          season.season_number,
          titleLanguage,
        );

        await saveTvSeasonEpisodes(tmdbId, seasonDetails);
      }
    }
  } else {
    const [details, externalIds] = await Promise.all([
      getMovieDetails(tmdbId, titleLanguage),
      getMovieExternalIds(tmdbId),
    ]);

    await saveMovieDetails(details, {
      imdb_id: externalIds.imdb_id,
    });
  }

  if (itemType === "series") {
    await db.runAsync(
      `INSERT INTO liste (list_id, item_type, series_tmdb_id)
       SELECT ?, 'series', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM liste
         WHERE list_id = ? AND item_type = 'series' AND series_tmdb_id = ?
       )`,
      listId,
      tmdbId,
      listId,
      tmdbId,
    );
  } else {
    await db.runAsync(
      `INSERT INTO liste (list_id, item_type, movie_tmdb_id)
       SELECT ?, 'movie', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM liste
         WHERE list_id = ? AND item_type = 'movie' AND movie_tmdb_id = ?
       )`,
      listId,
      tmdbId,
      listId,
      tmdbId,
    );
  }
}

export async function removeHubListItem(
  listId: string,
  itemType: "series" | "movie",
  tmdbId: number,
): Promise<void> {
  const db = await getDatabase();

  if (itemType === "series") {
    await db.runAsync(
      `DELETE FROM liste
       WHERE list_id = ? AND item_type = 'series' AND series_tmdb_id = ?`,
      listId,
      tmdbId,
    );
  } else {
    await db.runAsync(
      `DELETE FROM liste
       WHERE list_id = ? AND item_type = 'movie' AND movie_tmdb_id = ?`,
      listId,
      tmdbId,
    );
  }
}

export async function createHubList(name: string): Promise<void> {
  const db = await getDatabase();

  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Inserisci un nome per la lista.");
  }

  const baseId = normalizedName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!baseId) {
    throw new Error("Il nome della lista non è valido.");
  }

  const existing = await db.getFirstAsync<{ list_id: string }>(
    `SELECT list_id
     FROM elenco_liste
     WHERE name = ? COLLATE NOCASE`,
    normalizedName,
  );

  if (existing) {
    throw new Error("Esiste già una lista con questo nome.");
  }

  let listId = baseId;
  let suffix = 2;

  while (
    await db.getFirstAsync<{ list_id: string }>(
      "SELECT list_id FROM elenco_liste WHERE list_id = ?",
      listId,
    )
  ) {
    listId = `${baseId}_${suffix}`;
    suffix++;
  }

  await db.runAsync(
    `INSERT INTO elenco_liste (list_id, name)
     VALUES (?, ?)`,
    listId,
    normalizedName,
  );
}

export async function renameHubList(
  listId: string,
  newName: string,
): Promise<void> {
  const db = await getDatabase();

  const normalizedName = newName.trim();

  if (!normalizedName) {
    throw new Error("Inserisci un nome per la lista.");
  }

  const existing = await db.getFirstAsync<{ list_id: string }>(
    `SELECT list_id
     FROM elenco_liste
     WHERE name = ? COLLATE NOCASE
       AND list_id != ?`,
    normalizedName,
    listId,
  );

  if (existing) {
    throw new Error("Esiste già una lista con questo nome.");
  }

  const result = await db.runAsync(
    `UPDATE elenco_liste
     SET name = ?
     WHERE list_id = ?`,
    normalizedName,
    listId,
  );

  if (result.changes === 0) {
    throw new Error("La lista da rinominare non esiste.");
  }
}

export async function deleteHubList(listId: string): Promise<void> {
  const db = await getDatabase();

  const result = await db.runAsync(
    `DELETE FROM elenco_liste
     WHERE list_id = ?`,
    listId,
  );

  if (result.changes === 0) {
    throw new Error("La lista da eliminare non esiste.");
  }
}
