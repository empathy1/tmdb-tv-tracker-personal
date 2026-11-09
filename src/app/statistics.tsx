import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { spacing } from "@/constants/theme";
import {
    getHubStatistics,
    getMostRewatchedMovies,
    getMostWatchedEpisodes,
    MostRewatchedMovie,
    MostWatchedEpisode,
    type HubStatistics,
} from "@/database";
import { colors } from "@/styles/global";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatWatchTime(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 min";

  const months = Math.floor(totalMinutes / (60 * 24 * 30));
  const days = Math.floor((totalMinutes % (60 * 24 * 30)) / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  return [
    months > 0 ? `${months}M` : null,
    days > 0 ? `${days}g` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}min` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatNumber(value: number): string {
  return value.toLocaleString("it-IT");
}

function StatCard({
  title,
  watches,
  contents,
  contentLabel,
  seriesCount,
}: {
  title: string;
  watches: number;
  contents: number;
  contentLabel: string;
  seriesCount?: number;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{title}</Text>

      <Text
        style={{
          color: colors.text,
          fontSize: 28,
          fontWeight: "700",
          marginTop: spacing.sm,
        }}
      >
        {formatNumber(watches)}
      </Text>

      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>visioni</Text>

      <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          marginVertical: 12,
        }}
      />

      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
        {formatNumber(contents)}
      </Text>

      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
        {contentLabel}
      </Text>

      {seriesCount !== undefined && (
        <>
          <View
            style={{
              height: 1,
              backgroundColor: colors.border,
              marginVertical: 12,
            }}
          />

          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
            {formatNumber(seriesCount)}
          </Text>

          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            serie coinvolte
          </Text>
        </>
      )}
    </View>
  );
}

function PeriodStatCard({
  title,
  episodes,
  distinctEpisodes,
  movies,
  distinctMovies,
}: {
  title: string;
  episodes: number;
  distinctEpisodes: number;
  movies: number;
  distinctMovies: number;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: 15,
          fontWeight: "700",
          marginBottom: 14,
        }}
      >
        {title}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="tv-outline" size={19} color={colors.primary} />
        <Text
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "700",
            marginLeft: 8,
          }}
        >
          {formatNumber(episodes)}
        </Text>
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
        episodi di {formatNumber(distinctEpisodes)} distinti
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <Ionicons name="film-outline" size={19} color={colors.primary} />
        <Text
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "700",
            marginLeft: 8,
          }}
        >
          {formatNumber(movies)}
        </Text>
      </View>

      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
        film di {formatNumber(distinctMovies)} distinti
      </Text>
    </View>
  );
}

function RankingItem({
  posterPath,
  title,
  watches,
}: {
  posterPath: string | null;
  title: string;
  watches: number;
}) {
  return (
    <View
      style={{
        width: 110,
        marginRight: 12,
      }}
    >
      {posterPath ? (
        <Image
          source={{
            uri: `https://image.tmdb.org/t/p/w185${posterPath}`,
          }}
          style={{
            width: 110,
            height: 165,
            borderRadius: 8,
            backgroundColor: colors.surface,
          }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: 110,
            height: 165,
            borderRadius: 8,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="image-outline"
            size={32}
            color={colors.textSecondary}
          />
        </View>
      )}

      <Text
        numberOfLines={2}
        style={{
          color: colors.text,
          fontSize: 13,
          fontWeight: "600",
          marginTop: 8,
        }}
      >
        {title}
      </Text>

      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: colors.surface,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          marginTop: 6,
        }}
      >
        <Text
          style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}
        >
          {formatNumber(watches)} riproduzioni
        </Text>
      </View>
    </View>
  );
}

export default function StatisticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mostRewatchedMovies, setMostRewatchedMovies] = useState<
    MostRewatchedMovie[]
  >([]);

  const [mostWatchedEpisodes, setMostWatchedEpisodes] = useState<
    MostWatchedEpisode[]
  >([]);

  const [statistics, setStatistics] = useState<HubStatistics | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadStatistics() {
        const [result, movies, series] = await Promise.all([
          getHubStatistics(),
          getMostRewatchedMovies(),
          getMostWatchedEpisodes(),
        ]);

        if (active) {
          setStatistics(result);
          setMostRewatchedMovies(movies);
          setMostWatchedEpisodes(series);
        }
      }

      loadStatistics();

      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: insets.top + 20,
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/*
      <Pressable
        onPress={() => router.push("/runtime")}
        style={{
          backgroundColor: colors.primary,
          padding: 14,
          borderRadius: 10,
          alignItems: "center",
          marginTop: 20,
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>
          Recupera runtime episodi
        </Text>
      </Pressable>

      <Pressable
        onPress={exportDatabaseFile}
        style={{
          backgroundColor: colors.primary,
          padding: 14,
          borderRadius: 10,
          alignItems: "center",
          marginTop: 20,
        }}
      >
        <Text style={{ color: "white", fontWeight: "bold" }}>
          Esporta database
        </Text>
      </Pressable>
      */}

      {/* Header */}
      <Pressable
        onPress={() => router.back()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 30,
        }}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
        <Text
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "700",
            marginLeft: 8,
          }}
        >
          Statistiche
        </Text>
      </Pressable>

      {/* Tempo totale */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              marginLeft: 8,
            }}
          >
            Tempo totale di visione
          </Text>
        </View>

        <Text
          style={{
            color: colors.text,
            fontSize: 30,
            fontWeight: "700",
            marginTop: 12,
          }}
        >
          {formatWatchTime(statistics?.totalMinutes ?? 0)}
        </Text>

        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          Prime visioni
        </Text>

        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: 16,
          }}
        />

        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 12,
          }}
        >
          Dettaglio prime visioni
        </Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Serie
          </Text>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {formatWatchTime(statistics?.seriesFirstWatchMinutes ?? 0)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Film
          </Text>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {formatWatchTime(statistics?.movieFirstWatchMinutes ?? 0)}
          </Text>
        </View>

        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: 16,
          }}
        />

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
            Rewatch totali
          </Text>
          <Text
            style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}
          >
            {formatWatchTime(
              (statistics?.seriesRewatchMinutes ?? 0) +
                (statistics?.movieRewatchMinutes ?? 0),
            )}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 12,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Serie
          </Text>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {formatWatchTime(statistics?.seriesRewatchMinutes ?? 0)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Film
          </Text>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {formatWatchTime(statistics?.movieRewatchMinutes ?? 0)}
          </Text>
        </View>
      </View>

      {/* Episodi e film */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
        <StatCard
          title="Episodi"
          watches={statistics?.totalEpisodes ?? 0}
          contents={statistics?.totalDistinctEpisodes ?? 0}
          contentLabel="episodi visti"
          seriesCount={statistics?.totalSeriesWatched ?? 0}
        />

        <StatCard
          title="Film"
          watches={statistics?.totalMovies ?? 0}
          contents={statistics?.totalDistinctMovies ?? 0}
          contentLabel="film visti"
        />
      </View>

      {/* Periodi */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
        <PeriodStatCard
          title="Questa settimana"
          episodes={statistics?.weeklyEpisodes ?? 0}
          distinctEpisodes={statistics?.weeklyDistinctEpisodes ?? 0}
          movies={statistics?.weeklyMovies ?? 0}
          distinctMovies={statistics?.weeklyDistinctMovies ?? 0}
        />

        <PeriodStatCard
          title="Questo mese"
          episodes={statistics?.monthlyEpisodes ?? 0}
          distinctEpisodes={statistics?.monthlyDistinctEpisodes ?? 0}
          movies={statistics?.monthlyMovies ?? 0}
          distinctMovies={statistics?.monthlyDistinctMovies ?? 0}
        />
      </View>

      <View style={{ marginTop: 16 }}>
        <PeriodStatCard
          title="Quest'anno"
          episodes={statistics?.yearlyEpisodes ?? 0}
          distinctEpisodes={statistics?.yearlyDistinctEpisodes ?? 0}
          movies={statistics?.yearlyMovies ?? 0}
          distinctMovies={statistics?.yearlyDistinctMovies ?? 0}
        />
      </View>

      {/* Serie */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 18,
          marginTop: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Serie iniziate
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              fontWeight: "700",
              marginTop: 6,
            }}
          >
            {statistics?.startedSeries ?? 0}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Serie completate
          </Text>
          <Text
            style={{
              color: colors.completed,
              fontSize: 24,
              fontWeight: "700",
              marginTop: 6,
            }}
          >
            {statistics?.completedSeries ?? 0}
          </Text>
        </View>
      </View>

      {/* Film più visti */}
      <View style={{ marginTop: 30 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 14,
          }}
        >
          Film più visti
        </Text>

        {mostRewatchedMovies.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {mostRewatchedMovies.map((movie) => (
              <RankingItem
                key={movie.tmdb_id}
                posterPath={movie.poster_path}
                title={movie.title}
                watches={movie.watch_count}
              />
            ))}
          </ScrollView>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Non ci sono ancora film visti.
          </Text>
        )}
      </View>

      {/* Episodi più visti */}
      <View style={{ marginTop: 30 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 14,
          }}
        >
          Episodi più visti
        </Text>

        {mostWatchedEpisodes.length > 0 ? (
          <View style={{ gap: 14 }}>
            {mostWatchedEpisodes.map((episode) => (
              <View
                key={`${episode.series_tmdb_id}-${episode.season_number}-${episode.episode_number}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 10,
                  gap: 12,
                }}
              >
                {episode.poster_path ? (
                  <Image
                    source={{
                      uri: `https://image.tmdb.org/t/p/w185${episode.poster_path}`,
                    }}
                    style={{
                      width: 65,
                      height: 98,
                      borderRadius: 6,
                      backgroundColor: colors.background,
                    }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 65,
                      height: 98,
                      borderRadius: 6,
                      backgroundColor: colors.background,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="image-outline"
                      size={24}
                      color={colors.textSecondary}
                    />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    {episode.episode_title}
                  </Text>

                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.textSecondary,
                      fontSize: 13,
                      marginTop: 5,
                    }}
                  >
                    {episode.series_title}
                  </Text>

                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      marginTop: 3,
                    }}
                  >
                    Stagione {episode.season_number} · Episodio{" "}
                    {episode.episode_number}
                  </Text>

                  <Text
                    style={{
                      color: colors.primary,
                      fontSize: 12,
                      fontWeight: "700",
                      marginTop: 8,
                    }}
                  >
                    {episode.watch_count} riproduzioni
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Non ci sono ancora episodi visti.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
