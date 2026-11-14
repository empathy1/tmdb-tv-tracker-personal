import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  getFavoriteMovies,
  getFavoriteSeries,
  getHubBackgroundOptions,
  getHubListItems,
  getHubLists,
  getHubSettings,
  getHubStatistics,
  getWatchHistory,
  HubBackgroundOption,
  HubFavoriteMovie,
  HubFavoriteSeries,
  HubHistoryItem,
  HubList,
  HubListItem,
  HubStatistics,
  saveHubSettings,
  type HubSettings,
} from "@/database";

import { colors } from "@/styles/global";

import HorizontalMediaList from "@/components/HorizontalMediaList";
import ListsCarousel from "@/components/lists/ListsCarousel";
import MediaCard from "@/components/MediaCard";
import { spacing } from "@/constants/theme";
import {
  getMediaBackdrops,
  TMDB_IMAGE_BASE_URL,
  type TMDBBackdrop,
} from "@/services/tmdb";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
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
  const [lists, setLists] = useState<(HubList & { items: HubListItem[] })[]>(
    [],
  );

  const [backgroundOptions, setBackgroundOptions] = useState<
    HubBackgroundOption[]
  >([]);

  const [isSavingBackground, setIsSavingBackground] = useState(false);
  const [selectedMedia, setSelectedMedia] =
    useState<HubBackgroundOption | null>(null);

  const [mediaBackdrops, setMediaBackdrops] = useState<TMDBBackdrop[]>([]);
  const [isLoadingBackdrops, setIsLoadingBackdrops] = useState(false);

  const backgroundSheetRef = useRef<BottomSheetModal>(null);
  const backgroundSnapPoints = ["85%"];

  const openBackgroundSheet = () => {
    setSelectedMedia(null);
    setMediaBackdrops([]);
    setIsLoadingBackdrops(false);
    backgroundSheetRef.current?.present();
  };

  const openMediaBackdrops = async (item: HubBackgroundOption) => {
    setSelectedMedia(item);
    setMediaBackdrops([]);
    setIsLoadingBackdrops(true);

    try {
      const backdrops = await getMediaBackdrops(
        item.tmdb_id,
        item.media_type === "movie" ? "movie" : "tv",
      );

      setMediaBackdrops(backdrops);
    } catch (error) {
      console.error("Errore nel caricamento dei backdrop:", error);
    } finally {
      setIsLoadingBackdrops(false);
    }
  };

  const selectBackground = async (backdropPath: string) => {
    if (isSavingBackground) return;

    setIsSavingBackground(true);
    backgroundSheetRef.current?.dismiss();

    try {
      const hubPoster = `${TMDB_IMAGE_BASE_URL.replace("/w500", "/w1280")}${backdropPath}`;

      const updatedSettings: HubSettings = {
        name: settings?.name ?? null,
        avatar: settings?.avatar ?? null,
        hub_poster: hubPoster,
      };

      await saveHubSettings(updatedSettings);

      setSettings(updatedSettings);
    } catch (error) {
      console.error("Errore nel salvataggio dello sfondo:", error);
    } finally {
      setIsSavingBackground(false);
    }
  };

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
          listsResult,
          backgroundOptionsResult,
        ] = await Promise.all([
          getHubSettings(),
          getWatchHistory(20),
          getFavoriteSeries(),
          getFavoriteMovies(),
          getHubStatistics(),
          getHubLists(),
          getHubBackgroundOptions(),
        ]);

        const listsWithItems = await Promise.all(
          listsResult.map(async (list) => ({
            ...list,
            items: await getHubListItems(list.list_id),
          })),
        );

        if (active) {
          setSettings(settingsResult);
          setHistory(historyResult);
          setFavoriteSeries(favoriteSeriesResult);
          setFavoriteMovies(favoriteMoviesResult);
          setStatistics(statisticsResult);
          setLists(listsWithItems);
          setBackgroundOptions(backgroundOptionsResult);
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
    <>
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

            <Pressable
              onPress={openBackgroundSheet}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#00000099",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="pencil" size={19} color="#FFFFFF" />
            </Pressable>
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

        {/* Liste */}
        <View style={{ marginHorizontal: 20 }}>
          <ListsCarousel
            lists={lists}
            onListPress={(list) => {
              console.log("Lista selezionata:", list.list_id);
            }}
          />
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

      {isSavingBackground && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
            elevation: 20,
            backgroundColor: "#000000a1",
          }}
          pointerEvents="auto"
        >
          <View
            style={{
              backgroundColor: colors.surface,
              paddingHorizontal: 24,
              paddingVertical: 18,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.text, marginTop: 10 }}>
              Salvataggio dello sfondo...
            </Text>
          </View>
        </View>
      )}

      <BottomSheetModal
        ref={backgroundSheetRef}
        snapPoints={backgroundSnapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.6}
          />
        )}
      >
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            {selectedMedia && (
              <Pressable
                onPress={() => {
                  setSelectedMedia(null);
                  setMediaBackdrops([]);
                }}
                style={{ marginRight: 12 }}
              >
                <Ionicons name="arrow-back" size={23} color={colors.text} />
              </Pressable>
            )}

            <Text
              style={{
                color: colors.text,
                fontSize: 18,
                fontWeight: "700",
                flex: 1,
              }}
            >
              {selectedMedia ? selectedMedia.title : "Scegli lo sfondo"}
            </Text>
          </View>

          <BottomSheetFlatList<HubBackgroundOption | TMDBBackdrop>
            data={selectedMedia ? mediaBackdrops : backgroundOptions}
            keyExtractor={(item) =>
              selectedMedia
                ? (item as TMDBBackdrop).file_path
                : `${(item as HubBackgroundOption).media_type}-${(item as HubBackgroundOption).tmdb_id}`
            }
            numColumns={2}
            contentContainerStyle={{ paddingBottom: 30 }}
            columnWrapperStyle={{ gap: 12 }}
            renderItem={({ item }) => {
              // Se è un backdrop TMDB
              if ("file_path" in item) {
                return (
                  <Pressable
                    onPress={() => selectBackground(item.file_path)}
                    style={{ flex: 1, marginBottom: 16 }}
                  >
                    <Image
                      source={{
                        uri: `${TMDB_IMAGE_BASE_URL.replace("/w500", "/w1280")}${item.file_path}`,
                      }}
                      style={{
                        width: "100%",
                        aspectRatio: 16 / 9,
                        borderRadius: 8,
                        backgroundColor: colors.surfaceLight,
                      }}
                      contentFit="cover"
                    />
                  </Pressable>
                );
              }

              // Se è un film o una serie
              return (
                <Pressable
                  onPress={() => openMediaBackdrops(item)}
                  style={{ flex: 1, marginBottom: 16 }}
                >
                  <Image
                    source={{
                      uri: `${TMDB_IMAGE_BASE_URL.replace("/w500", "/w1280")}${item.backdrop_path}`,
                    }}
                    style={{
                      width: "100%",
                      aspectRatio: 16 / 9,
                      borderRadius: 8,
                      backgroundColor: colors.surfaceLight,
                    }}
                    contentFit="cover"
                  />

                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      marginTop: 6,
                    }}
                  >
                    {item.title}
                  </Text>

                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                    {item.is_favorite ? "♥ Preferito · " : ""}
                    {item.media_type === "movie" ? "Film" : "Serie"}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: colors.textSecondary }}>
                Non ci sono contenuti con un'immagine di sfondo disponibile.
              </Text>
            }
          />
        </View>
      </BottomSheetModal>
    </>
  );
}
