import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  exportDatabaseFile,
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
  importDatabaseFile,
  saveHubSettings,
  type HubSettings,
} from "@/database";

import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { colors } from "@/styles/global";
import * as FileSystem from "expo-file-system/legacy";

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
  BottomSheetBackdropProps,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetView,
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
  const [refreshKey, setRefreshKey] = useState(0);

  const [backgroundOptions, setBackgroundOptions] = useState<
    HubBackgroundOption[]
  >([]);

  const [isSavingBackground, setIsSavingBackground] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedMedia, setSelectedMedia] =
    useState<HubBackgroundOption | null>(null);
  const [isDatabaseLoading, setIsDatabaseLoading] = useState(false);

  const [mediaBackdrops, setMediaBackdrops] = useState<TMDBBackdrop[]>([]);
  const [isLoadingBackdrops, setIsLoadingBackdrops] = useState(false);

  const [isNameModalVisible, setIsNameModalVisible] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const backgroundSheetRef = useRef<BottomSheetModal>(null);
  const databaseSheetRef = useRef<BottomSheetModal>(null);

  const backgroundSnapPoints = ["85%"];

  const renderDatabaseBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleExportDatabase = async () => {
    if (isDatabaseLoading) return;

    setIsDatabaseLoading(true);

    try {
      await exportDatabaseFile(() => {
        setIsDatabaseLoading(false);
      });
    } catch (error) {
      console.error("Errore durante l'esportazione:", error);

      Alert.alert(
        "Esportazione non riuscita",
        "Non è stato possibile esportare il database.",
      );
    } finally {
      setIsDatabaseLoading(false);
    }
  };

  const handleImportDatabase = async () => {
    try {
      const result = await File.pickFileAsync({
        mimeTypes: ["*/*"],
      });

      if (result.canceled) return;

      const file = result.result;

      Alert.alert(
        "Importa database",
        "Attenzione: tutti i dati attuali verranno sostituiti con quelli del backup. Vuoi continuare?",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Importa",
            style: "destructive",
            onPress: async () => {
              if (isDatabaseLoading) return;

              setIsDatabaseLoading(true);

              try {
                await importDatabaseFile(file);
                setRefreshKey((value) => value + 1);
              } catch (error) {
                console.error("Errore durante l'importazione:", error);

                Alert.alert(
                  "Importazione non riuscita",
                  "Non è stato possibile ripristinare il database.",
                );

                return;
              } finally {
                setIsDatabaseLoading(false);
              }

              Alert.alert(
                "Importazione completata",
                "Il database è stato ripristinato correttamente.",
              );
            },
          },
        ],
      );
    } catch (error) {
      console.error("Errore nella selezione del backup:", error);
      Alert.alert("Errore", "Non è stato possibile selezionare il file.");
    }
  };

  const openBackgroundSheet = () => {
    setSelectedMedia(null);
    setMediaBackdrops([]);
    setIsLoadingBackdrops(false);
    backgroundSheetRef.current?.present();
  };

  const openDatabaseSheet = () => {
    databaseSheetRef.current?.present();
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

  const selectProfileImage = async () => {
    if (isSavingProfile) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permesso necessario",
          "Per scegliere una foto profilo devi consentire l'accesso alla galleria.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      setIsSavingProfile(true);

      const imageUri = result.assets[0].uri;
      const extension = imageUri.split(".").pop()?.split("?")[0] || "jpg";
      const avatarPath = `${FileSystem.documentDirectory}avatar-${Date.now()}.${extension}`;

      await FileSystem.copyAsync({
        from: imageUri,
        to: avatarPath,
      });

      const updatedSettings: HubSettings = {
        name: settings?.name ?? null,
        avatar: avatarPath,
        hub_poster: settings?.hub_poster ?? null,
      };

      await saveHubSettings(updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error("Errore nel salvataggio della foto profilo:", error);
      Alert.alert("Errore", "Non è stato possibile salvare la foto profilo.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveProfileName = async () => {
    if (isSavingName) return;

    setIsSavingName(true);

    try {
      const updatedSettings: HubSettings = {
        name: editedName.trim() || null,
        avatar: settings?.avatar ?? null,
        hub_poster: settings?.hub_poster ?? null,
      };

      await saveHubSettings(updatedSettings);

      setSettings(updatedSettings);
      setIsNameModalVisible(false);
    } catch (error) {
      console.error("Errore nel salvataggio del nome:", error);
      Alert.alert("Errore", "Non è stato possibile salvare il nome.");
    } finally {
      setIsSavingName(false);
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

        const hiddenLists = ["Archivio", "Droppate", "Watchlist", "Archiviati"];

        const visibleLists = listsResult.filter(
          (list) => !hiddenLists.includes(list.name),
        );

        const listsWithItems = await Promise.all(
          visibleLists.map(async (list) => ({
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
    }, [refreshKey]),
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

            <View
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Pressable
                onPress={openDatabaseSheet}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#00000099",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  color="#FFFFFF"
                />
              </Pressable>

              <Pressable
                onPress={openBackgroundSheet}
                style={{
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
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: -35,
              marginLeft: 20,
            }}
          >
            <Pressable
              onPress={selectProfileImage}
              disabled={isSavingProfile}
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
            </Pressable>

            <Pressable
              onPress={() => {
                setEditedName(settings?.name ?? "");
                setIsNameModalVisible(true);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginLeft: 12,
                marginTop: 30,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 20,
                  fontWeight: "700",
                }}
              >
                {settings?.name || "Il mio profilo"}
              </Text>

              <Ionicons
                name="pencil"
                size={14}
                color={colors.textSecondary}
                style={{ marginLeft: 8 }}
              />
            </Pressable>
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
            onListPress={(list) =>
              router.push({
                pathname: "/lists/[id]",
                params: { id: list.list_id },
              })
            }
            onTitlePress={() => router.push("/lists")}
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
            data={favoriteSeries.slice(0, 10)}
            showMore
            onMorePress={() =>
              router.push({
                pathname: "/lists/[id]",
                params: { id: "favorites", type: "series" },
              })
            }
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
            data={favoriteMovies.slice(0, 10)}
            showMore
            onMorePress={() =>
              router.push({
                pathname: "/lists/[id]",
                params: { id: "favorites", type: "movie" },
              })
            }
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
      <Modal
        visible={isNameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNameModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000099",
            justifyContent: "center",
            paddingHorizontal: 30,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 18,
                fontWeight: "700",
                marginBottom: 16,
              }}
            >
              Modifica nome
            </Text>

            <TextInput
              value={editedName}
              onChangeText={setEditedName}
              placeholder="Inserisci il tuo nome"
              placeholderTextColor={colors.textSecondary}
              maxLength={30}
              autoFocus
              style={{
                color: colors.text,
                backgroundColor: colors.surfaceLight,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 16,
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                marginTop: 20,
                gap: 12,
              }}
            >
              <Pressable
                onPress={() => setIsNameModalVisible(false)}
                disabled={isSavingName}
                style={{ padding: 10 }}
              >
                <Text style={{ color: colors.textSecondary }}>Annulla</Text>
              </Pressable>

              <Pressable
                onPress={saveProfileName}
                disabled={isSavingName}
                style={{ padding: 10 }}
              >
                {isSavingName ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>
                    Salva
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

      {isDatabaseLoading && (
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
              Operazione sul database in corso...
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

      <BottomSheetModal
        ref={databaseSheetRef}
        index={0}
        backdropComponent={renderDatabaseBackdrop}
        snapPoints={["35%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
      >
        <BottomSheetView style={{ flex: 1, padding: 20 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "700",
              marginBottom: 20,
            }}
          >
            Database
          </Text>

          <Pressable
            onPress={() => {
              databaseSheetRef.current?.dismiss();
              handleExportDatabase();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
            }}
          >
            <Ionicons name="download-outline" size={22} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 16, marginLeft: 12 }}>
              Esporta database
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              databaseSheetRef.current?.dismiss();
              handleImportDatabase();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
            }}
          >
            <Ionicons
              name="cloud-upload-outline"
              size={22}
              color={colors.text}
            />
            <Text style={{ color: colors.text, fontSize: 16, marginLeft: 12 }}>
              Importa database
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}
