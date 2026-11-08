import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  getFavoriteMovies,
  getFavoriteSeries,
  getHubSettings,
  getWatchHistory,
  HubFavoriteMovie,
  HubFavoriteSeries,
  HubHistoryItem,
  type HubSettings,
} from "@/database";

import { colors } from "@/styles/global";

import HorizontalMediaList from "@/components/HorizontalMediaList";
import MediaCard from "@/components/MediaCard";
import { spacing } from "@/constants/theme";
import { TMDB_IMAGE_BASE_URL } from "@/services/tmdb";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

export default function HubScreen() {
  const [settings, setSettings] = useState<HubSettings | null>(null);

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
        ] = await Promise.all([
          getHubSettings(),
          getWatchHistory(20),
          getFavoriteSeries(),
          getFavoriteMovies(),
        ]);

        if (active) {
          setSettings(settingsResult);
          setHistory(historyResult);
          setFavoriteSeries(favoriteSeriesResult);
          setFavoriteMovies(favoriteMoviesResult);
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
