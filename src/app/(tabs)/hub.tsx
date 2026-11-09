import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  getFavoriteMovies,
  getFavoriteSeries,
  getHubSettings,
  getHubStatistics,
  getWatchHistory,
  HubFavoriteMovie,
  HubFavoriteSeries,
  HubHistoryItem,
  HubStatistics,
  type HubSettings,
} from "@/database";

import { colors } from "@/styles/global";

import HorizontalMediaList from "@/components/HorizontalMediaList";
import MediaCard from "@/components/MediaCard";
import { spacing } from "@/constants/theme";
import { TMDB_IMAGE_BASE_URL } from "@/services/tmdb";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

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
    minutes > 0 && months === 0 ? `${minutes}min` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatNumber(value: number): string {
  return value.toLocaleString("it-IT");
}

export default function HubScreen() {
  const [settings, setSettings] = useState<HubSettings | null>(null);
  const [statistics, setStatistics] = useState<HubStatistics | null>(null);

  const [history, setHistory] = useState<HubHistoryItem[]>([]);
  const [favoriteSeries, setFavoriteSeries] = useState<HubFavoriteSeries[]>([]);
  const [favoriteMovies, setFavoriteMovies] = useState<HubFavoriteMovie[]>([]);

  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadHub() {
        const [
          settingsResult,
          historyResult,
          favoriteSeriesResult,
          favoriteMoviesResult,
          statisticsResult,
        ] = await Promise.all([
          getHubSettings(),
          getWatchHistory(20),
          getFavoriteSeries(),
          getFavoriteMovies(),
          getHubStatistics(),
        ]);

        if (active) {
          setSettings(settingsResult);
          setHistory(historyResult);
          setFavoriteSeries(favoriteSeriesResult);
          setFavoriteMovies(favoriteMoviesResult);
          setStatistics(statisticsResult);
        }
      }

      loadHub();

      return () => {
        active = false;
      };
    }, []),
  );

  const openHistoryItem = (item: HubHistoryItem) => {
    if (item.media_type === "movie") {
      router.push({
        pathname: "/details/movie/[id]",
        params: { id: String(item.tmdb_id) },
      });
    } else {
      router.push({
        pathname: "/details/episode/[id]",
        params: {
          id: String(item.tmdb_id ?? ""),
          seriesId: String(item.series_tmdb_id),
          seasonNumber: String(item.season_number),
          episodeNumber: String(item.episode_number),
        },
      });
    }
  };

  const renderHistoryItem = (item: HubHistoryItem) => {
    const isEpisode = item.media_type === "episode";

    return (
      <MediaCard
        title={isEpisode ? item.series_title || item.title : item.title}
        poster={
          item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : null
        }
        horizontal
        onPress={() => openHistoryItem(item)}
        info={
          <View style={{ marginTop: spacing.xs }}>
            {isEpisode ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                S{String(item.season_number).padStart(2, "0")} · E
                {String(item.episode_number).padStart(2, "0")}
              </Text>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Film
              </Text>
            )}

            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12,
                marginTop: spacing.xs,
              }}
            >
              {new Date(item.watched_at).toLocaleDateString("it-IT")}
            </Text>
          </View>
        }
        action={
          <View
            style={{
              width: 35,
              height: 35,
              borderRadius: 20,
              backgroundColor: colors.completed,
              alignItems: "center",
              justifyContent: "center",
              marginTop: spacing.sm,
            }}
          >
            {item.watch_number > 1 ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  color: "#000000",
                  fontWeight: "700",
                  fontSize: 15,
                  includeFontPadding: false,
                  textAlign: "center",
                }}
              >
                ×{item.watch_number}
              </Text>
            ) : (
              <Ionicons name="checkmark" size={23} color="#000000" />
            )}
          </View>
        }
      />
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0F0F0F" }}
      contentContainerStyle={{
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Profilo */}
      <View style={{ marginBottom: 30 }}>
        <View
          style={{
            width: "100%",
            aspectRatio: 16 / 9,
            overflow: "hidden",
            backgroundColor: colors.surface,
          }}
        >
          {settings?.hub_poster ? (
            <Image
              source={{ uri: settings.hub_poster }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : null}

          <LinearGradient
            colors={["transparent", "#0F0F0F"]}
            locations={[0.35, 1]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "55%",
            }}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: -35,
            marginLeft: 20,
          }}
        >
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: "#ffffffa8",
              backgroundColor: colors.surface,
              overflow: "hidden",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {settings?.avatar ? (
              <Image
                source={{ uri: settings.avatar }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 28 }}>
                ?
              </Text>
            )}
          </View>

          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              marginLeft: 12,
              marginTop: 30,
            }}
          >
            {settings?.name || "Il mio profilo"}
          </Text>
        </View>
      </View>

      {/* Statistiche */}
      <Pressable
        onPress={() => router.push("../statistics")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 20,
          marginBottom: 30,
          paddingVertical: 8,
          paddingHorizontal: 10,
          backgroundColor: colors.surface,
          borderRadius: 12,
        }}
      >
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {formatNumber(statistics?.totalDistinctEpisodes ?? 0)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Episodi
          </Text>
        </View>

        <View
          style={{
            width: 1,
            height: 45,
            backgroundColor: colors.textSecondary,
            opacity: 0.5,
          }}
        />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {formatNumber(statistics?.totalDistinctMovies ?? 0)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Film
          </Text>
        </View>
        <View
          style={{
            width: 1,
            height: 45,
            backgroundColor: colors.textSecondary,
            opacity: 0.5,
          }}
        />

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {formatWatchTime(statistics?.totalMinutes ?? 0)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Tempo totale
          </Text>
        </View>
      </Pressable>

      {/* Cronologia */}
      <View style={{ marginHorizontal: 20 }}>
        <HorizontalMediaList<HubHistoryItem>
          title="Cronologia"
          data={history}
          keyExtractor={(item, index) =>
            `${item.media_type}-${item.tmdb_id}-${item.watched_at}-${index}`
          }
          renderItem={({ item }) => renderHistoryItem(item)}
          emptyMessage="Non hai ancora registrato nessuna visione."
        />
      </View>

      {/* Serie preferite */}
      <View style={{ marginHorizontal: 20 }}>
        <HorizontalMediaList<HubFavoriteSeries>
          title="Serie preferite"
          data={favoriteSeries}
          keyExtractor={(item) => String(item.tmdb_id)}
          renderItem={({ item }) => (
            <MediaCard
              title={item.title}
              poster={
                item.poster_path
                  ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                  : null
              }
              horizontal
              onPress={() =>
                router.push({
                  pathname: "/details/series/[id]",
                  params: { id: String(item.tmdb_id) },
                })
              }
            />
          )}
          emptyMessage="Non hai ancora aggiunto serie ai preferiti."
        />
      </View>

      {/* Film preferiti */}
      <View style={{ marginHorizontal: 20 }}>
        <HorizontalMediaList<HubFavoriteMovie>
          title="Film preferiti"
          data={favoriteMovies}
          keyExtractor={(item) => String(item.tmdb_id)}
          renderItem={({ item }) => (
            <MediaCard
              title={item.title}
              poster={
                item.poster_path
                  ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                  : null
              }
              horizontal
              onPress={() =>
                router.push({
                  pathname: "/details/movie/[id]",
                  params: { id: String(item.tmdb_id) },
                })
              }
            />
          )}
          emptyMessage="Non hai ancora aggiunto film ai preferiti."
        />
      </View>
    </ScrollView>
  );
}
