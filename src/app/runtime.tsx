import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
    getSeasonsWithMissingRuntimes,
    updateMissingEpisodeRuntimes,
} from "@/database/runtime";

import { getTvSeasonDetails } from "@/services/tmdb";
import { colors } from "@/styles/global";

export default function RuntimeBackfillScreen() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");

  async function startBackfill() {
    if (loading) return;

    setLoading(true);
    setProgress(0);
    setMessage("");

    try {
      const seasons = await getSeasonsWithMissingRuntimes();

      setTotal(seasons.length);

      if (seasons.length === 0) {
        setMessage("Tutti gli episodi hanno già il runtime.");
        return;
      }

      let completed = 0;
      let errors = 0;

      for (const season of seasons) {
        try {
          const details = await getTvSeasonDetails(
            season.series_tmdb_id,
            season.season_number,
          );

          await updateMissingEpisodeRuntimes(season.series_tmdb_id, details);
        } catch {
          errors++;
        }

        completed++;
        setProgress(completed);
      }

      setMessage(
        `Operazione completata. Errori: ${errors} su ${seasons.length} stagioni.`,
      );
    } catch {
      setMessage("Errore durante la lettura del database.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        padding: 20,
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "white", fontSize: 22, marginBottom: 16 }}>
        Recupero runtime episodi
      </Text>

      <Text style={{ color: "white", marginBottom: 20 }}>
        Stagioni elaborate: {progress} / {total}
      </Text>

      <Pressable
        onPress={startBackfill}
        disabled={loading}
        style={{
          backgroundColor: colors.primary,
          padding: 16,
          borderRadius: 10,
          alignItems: "center",
          opacity: loading ? 0.5 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>
          {loading ? "Elaborazione..." : "Avvia recupero"}
        </Text>
      </Pressable>

      {message !== "" && (
        <Text style={{ color: "white", marginTop: 20 }}>{message}</Text>
      )}
    </View>
  );
}
