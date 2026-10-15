import * as SQLite from "expo-sqlite";

import type { TMDBTvDetails, TMDBTvSeasonDetails } from "@/types/tmdb";

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
    ON CONFLICT(tmdb_id) DO UPDATE SET
      tvdb_id = excluded.tvdb_id,
      imdb_id = excluded.imdb_id,
      title = excluded.title,
      poster_path = excluded.poster_path,
      status = excluded.status,
      backdrop_path = excluded.backdrop_path,
      overview = excluded.overview,
      first_air_date = excluded.first_air_date`,
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
          is_special
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(series_tmdb_id, season_number, episode_number)
        DO UPDATE SET
          tmdb_id = excluded.tmdb_id,
          title = excluded.title,
          overview = excluded.overview,
          air_date = excluded.air_date,
          still_path = excluded.still_path,
          is_special = excluded.is_special`,
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
