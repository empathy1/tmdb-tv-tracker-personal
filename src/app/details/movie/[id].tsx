import {
  getMovieDetails,
  getMovieExternalIds,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TMDBMovieDetails } from "@/types/tmdb";

import AddMediaButton from "@/components/AddMediaButton";
import WatchedActionSheet from "@/components/bottomSheets/WatchedActionSheet";
import WatchedDateSheet from "@/components/bottomSheets/WatchedDateSheet";
import { spacing } from "@/constants/theme";
import {
  addMovieFavorite,
  addMovieRewatch,
  clearMovieRewatches,
  getMovieRewatches,
  getMovieWatchInfo,
  isMovieFavorite,
  isMovieSaved,
  markMovieUnwatched,
  markMovieWatched,
  removeLastMovieRewatch,
  removeMovieFavorite,
  saveMovieDetails,
} from "@/database";
import {
  colors,
  getBottomActionContainerStyle,
  globalStyles,
} from "@/styles/global";
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

import SeriesOptionsSheet from "@/components/bottomSheets/SeriesOptionsSheet";
import FavoriteButton from "@/components/FavoriteButton";
import ZoomableImageModal from "@/components/ZoomableImageModal";

type MovieDetailItem = {
  title: string;
  backdrop: string | null;
  overview: string;
  date: string;
  status: string;
  rating: number;
  genres: string[];
  extraInfo: string;
};

export default function MovieDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [details, setDetails] = useState<MovieDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [isFavorite, setIsFavorite] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [watchedAt, setWatchedAt] = useState<string | null>(null);
  const [rewatchCount, setRewatchCount] = useState(0);

  const [showFullBackdrop, setShowFullBackdrop] = useState(false);

  const [overviewExpanded, setOverviewExpanded] = useState(false);

  const [pendingDateMode, setPendingDateMode] = useState<
    "first_watch" | "rewatch" | "edit_first_watch" | null
  >(null);

  const watchedSheetRef = useRef<BottomSheetModal>(null);
  const watchedDateSheetRef = useRef<BottomSheetModal>(null);

  const optionsSheetRef = useRef<BottomSheetModal>(null);

  const pendingDateModeRef = useRef<
    "first_watch" | "rewatch" | "edit_first_watch" | null
  >(null);

  const [watchedDateMode, setWatchedDateMode] = useState<
    "first_watch" | "rewatch" | "edit_first_watch" | null
  >(null);

  async function loadMovieTracking(movieId: number) {
    const [favorite, watchInfo, rewatches] = await Promise.all([
      isMovieFavorite(movieId),
      getMovieWatchInfo(movieId),
      getMovieRewatches(movieId),
    ]);

    setIsFavorite(favorite);
    setIsWatched(Boolean(watchInfo?.is_watched));
    setWatchedAt(watchInfo?.watched_at ?? null);
    setRewatchCount(rewatches.length);
  }

  useEffect(() => {
    async function loadDetails() {
      try {
        setLoading(true);
        setError(null);

        const mediaId = Number(id);

        if (!Number.isFinite(mediaId) || mediaId <= 0) {
          throw new Error("Film non valido.");
        }

        const alreadySaved = await isMovieSaved(mediaId);
        setIsSaved(alreadySaved);

        if (alreadySaved) {
          await loadMovieTracking(mediaId);
        } else {
          setIsFavorite(false);
          setIsWatched(false);
          setWatchedAt(null);
          setRewatchCount(0);
        }

        const data: TMDBMovieDetails = await getMovieDetails(mediaId);

        setDetails({
          title: data.title,
          backdrop: data.backdrop_path,
          overview: data.overview,
          date: data.release_date,
          status: data.status,
          rating: data.vote_average,
          genres: data.genres.map((genre) => genre.name),
          extraInfo: data.runtime ? `${data.runtime} minuti` : "",
        });
      } catch {
        setError("Impossibile caricare i dettagli del film.");
      } finally {
        setLoading(false);
      }
    }

    loadDetails();
  }, [id]);

  async function handleSaveMovie() {
    if (saving) return;

    try {
      setSaving(true);

      const movieId = Number(id);
      const movie = await getMovieDetails(movieId);
      const externalIds = await getMovieExternalIds(movieId);

      await saveMovieDetails(movie, {
        imdb_id: externalIds.imdb_id,
      });

      setIsSaved(true);

      Alert.alert(
        "Salvataggio completato",
        "Il film è stato aggiunto alla tua raccolta.",
      );
    } catch (error) {
      console.error("Errore durante il salvataggio del film:", error);

      Alert.alert("Errore", "Non è stato possibile salvare il film.");
    } finally {
      setSaving(false);
    }
  }

  function getMovieId() {
    return Number(id);
  }

  function renderWatchedBackdrop(props: BottomSheetBackdropProps) {
    return (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    );
  }

  function openWatchedSheet() {
    pendingDateModeRef.current = null;
    watchedSheetRef.current?.present();
  }

  function openDateSheet(mode: "first_watch" | "rewatch" | "edit_first_watch") {
    pendingDateModeRef.current = mode;
    setWatchedDateMode(mode);
    watchedSheetRef.current?.dismiss();
  }

  async function handleWatchDate(date: Date) {
    const movieId = getMovieId();

    // Garantisce che il film esista nel database.
    if (!(await isMovieSaved(movieId))) {
      const movie = await getMovieDetails(movieId);
      const externalIds = await getMovieExternalIds(movieId);

      await saveMovieDetails(movie, {
        imdb_id: externalIds.imdb_id,
      });

      setIsSaved(true);
    }

    const watchedDate = date.toISOString();

    if (
      watchedDateMode === "first_watch" ||
      watchedDateMode === "edit_first_watch"
    ) {
      await markMovieWatched(movieId, watchedDate);
    } else if (watchedDateMode === "rewatch") {
      await addMovieRewatch(movieId, watchedDate);
    }

    await loadMovieTracking(movieId);

    watchedDateSheetRef.current?.dismiss();
    setWatchedDateMode(null);
  }

  async function handleWatchNow() {
    await handleWatchDate(new Date());
  }

  async function handleWatchYesterday() {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    await handleWatchDate(date);
  }

  async function handleWatchOnReleaseDate() {
    if (!details?.date) return;

    // Imposta mezzogiorno per evitare problemi di fuso orario.
    const date = new Date(`${details.date}T12:00:00`);

    if (Number.isNaN(date.getTime())) return;

    await handleWatchDate(date);
  }

  function handleCustomWatchDate() {
    const now = new Date();
    const initialDate =
      watchedDateMode === "edit_first_watch" && watchedAt
        ? new Date(watchedAt)
        : now;

    DateTimePickerAndroid.open({
      value: initialDate,
      mode: "date",
      maximumDate: now,
      onValueChange: (_event, selectedDate) => {
        if (!selectedDate) return;

        const chosenDate = new Date(selectedDate);
        chosenDate.setHours(
          initialDate.getHours(),
          initialDate.getMinutes(),
          initialDate.getSeconds(),
          0,
        );

        DateTimePickerAndroid.open({
          value: chosenDate,
          mode: "time",
          onValueChange: async (_timeEvent, selectedTime) => {
            if (!selectedTime) return;

            const finalDate = new Date(chosenDate);
            finalDate.setHours(
              selectedTime.getHours(),
              selectedTime.getMinutes(),
              selectedTime.getSeconds(),
              0,
            );

            if (finalDate > new Date()) {
              Alert.alert(
                "Data non valida",
                "La data e l'ora della visione non possono essere future.",
              );
              return;
            }

            try {
              await handleWatchDate(finalDate);
            } catch (error) {
              console.error(
                "Errore durante il salvataggio della visione:",
                error,
              );
              Alert.alert("Errore", "Non è stato possibile salvare la data.");
            }
          },
        });
      },
    });
  }

  function handleUnwatch() {
    watchedSheetRef.current?.dismiss();

    setTimeout(() => {
      Alert.alert(
        "Segnare come non visto?",
        "Verranno eliminate la prima visione e tutte le revisioni registrate per questo film.",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Non visto",
            style: "destructive",
            onPress: async () => {
              await markMovieUnwatched(getMovieId());
              await loadMovieTracking(getMovieId());
            },
          },
        ],
      );
    }, 150);
  }

  function handleResetRewatch() {
    watchedSheetRef.current?.dismiss();

    setTimeout(() => {
      Alert.alert(
        "Visto una volta",
        "Vuoi eliminare tutte le revisioni e conservare soltanto la prima visione?",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Conferma",
            style: "destructive",
            onPress: async () => {
              await clearMovieRewatches(getMovieId());
              await loadMovieTracking(getMovieId());
            },
          },
        ],
      );
    }, 150);
  }

  function handleRemoveLastRewatch() {
    watchedSheetRef.current?.dismiss();

    setTimeout(() => {
      Alert.alert(
        "Eliminare l'ultima revisione?",
        "La registrazione dell'ultima visione ripetuta verrà eliminata.",
        [
          { text: "Annulla", style: "cancel" },
          {
            text: "Elimina",
            style: "destructive",
            onPress: async () => {
              await removeLastMovieRewatch(getMovieId());
              await loadMovieTracking(getMovieId());
            },
          },
        ],
      );
    }, 150);
  }

  async function handleToggleFavorite(): Promise<boolean> {
    const movieId = getMovieId();

    try {
      if (isFavorite) {
        await removeMovieFavorite(movieId);
        setIsFavorite(false);
        return false;
      }

      // Se il film non è nel database, salviamo prima i suoi dati.
      const alreadySaved = await isMovieSaved(movieId);

      if (!alreadySaved) {
        const movie = await getMovieDetails(movieId);
        const externalIds = await getMovieExternalIds(movieId);

        await saveMovieDetails(movie, {
          imdb_id: externalIds.imdb_id,
        });

        setIsSaved(true);
      }

      // Solo dopo aver garantito che il film esista, lo aggiungiamo ai preferiti.
      await addMovieFavorite(movieId, details?.title ?? "");
      setIsFavorite(true);

      return true;
    } catch (error) {
      console.error("Errore durante l'aggiornamento del preferito:", error);

      Alert.alert("Errore", "Non è stato possibile aggiornare il preferito.");

      return isFavorite;
    }
  }

  function handleAddToList() {
    Alert.alert(
      "Liste",
      "La gestione delle liste sarà disponibile in seguito.",
    );
  }

  function handleViewRewatches() {
    Alert.alert(
      "Rewatch",
      "La consultazione dei rewatch dei film sarà disponibile in seguito.",
    );
  }

  const hasRewatch = rewatchCount > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={globalStyles.container}
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={globalStyles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error || !details ? (
          <Text style={globalStyles.empty}>
            {error ?? "Film non disponibile."}
          </Text>
        ) : (
          <>
            <View
              style={{
                width: "100%",
                height: 280 + insets.top,
                backgroundColor: colors.surface,
              }}
            >
              {details.backdrop ? (
                <Pressable
                  onPress={() => setShowFullBackdrop(true)}
                  style={{ flex: 1 }}
                >
                  <View
                    style={{
                      flex: 1,
                      paddingTop: insets.top,
                      justifyContent: "space-between",
                      overflow: "hidden",
                    }}
                  >
                    <Image
                      source={{
                        uri: `${TMDB_IMAGE_BASE_URL.replace(
                          "/w500",
                          "/w1280",
                        )}${details.backdrop}`,
                      }}
                      resizeMode="cover"
                      style={StyleSheet.absoluteFill}
                    />

                    <View
                      style={{
                        flex: 1,
                        justifyContent: "space-between",
                        backgroundColor: "rgba(0,0,0,0.12)",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: spacing.lg,
                        }}
                      >
                        <Pressable
                          onPress={() => router.back()}
                          accessibilityRole="button"
                          accessibilityLabel="Indietro"
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 21,
                            backgroundColor: "rgba(0,0,0,0.65)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons
                            name="arrow-back"
                            size={24}
                            color={colors.text}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => optionsSheetRef.current?.present()}
                          accessibilityRole="button"
                          accessibilityLabel="Opzioni del film"
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 21,
                            backgroundColor: "rgba(0,0,0,0.65)",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons
                            name="ellipsis-vertical"
                            size={24}
                            color={colors.text}
                          />
                        </Pressable>
                      </View>

                      <View
                        style={{
                          padding: spacing.lg,
                          paddingTop: 20,
                          backgroundColor: "rgba(0,0,0,0.55)",
                        }}
                      >
                        <Text style={globalStyles.title}>{details.title}</Text>

                        <View
                          style={{
                            position: "absolute",
                            right: 18,
                            bottom: 18,
                            zIndex: 2,
                          }}
                        >
                          <FavoriteButton
                            tmdbId={getMovieId()}
                            title={details.title}
                            isFavorite={isFavorite}
                            onToggleFavorite={handleToggleFavorite}
                          />
                        </View>

                        <Text
                          style={{
                            color: colors.text,
                            marginTop: spacing.xs,
                          }}
                        >
                          {[
                            details.date?.slice(0, 4),
                            details.extraInfo,
                            details.rating > 0
                              ? `★ ${details.rating.toFixed(1)}/10`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>

                        {details.genres.length > 0 && (
                          <Text
                            style={{
                              color: colors.text,
                              marginTop: spacing.xs,
                            }}
                          >
                            {details.genres.join(" · ")}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                </Pressable>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: spacing.lg,
                      paddingTop: insets.top,
                    }}
                  >
                    <Pressable
                      onPress={() => router.back()}
                      accessibilityRole="button"
                      accessibilityLabel="Indietro"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        backgroundColor: "rgba(0,0,0,0.65)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="arrow-back"
                        size={24}
                        color={colors.text}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => optionsSheetRef.current?.present()}
                      accessibilityRole="button"
                      accessibilityLabel="Opzioni del film"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        backgroundColor: "rgba(0,0,0,0.65)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="ellipsis-vertical"
                        size={24}
                        color={colors.text}
                      />
                    </Pressable>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      justifyContent: "flex-end",
                      padding: spacing.lg,
                      paddingTop: 20,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Text style={globalStyles.title}>{details.title}</Text>

                    <Text
                      style={{
                        color: colors.text,
                        marginTop: spacing.xs,
                      }}
                    >
                      {[
                        details.date?.slice(0, 4),
                        details.extraInfo,
                        details.rating > 0
                          ? `★ ${details.rating.toFixed(1)}/10`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>

                    {details.genres.length > 0 && (
                      <Text
                        style={{
                          color: colors.text,
                          marginTop: spacing.xs,
                        }}
                      >
                        {details.genres.join(" · ")}
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.md,
                backgroundColor: colors.background,
              }}
            >
              <Pressable
                onPress={() => {
                  if (isWatched) {
                    openWatchedSheet();
                  } else {
                    openDateSheet("first_watch");
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  isWatched
                    ? "Gestisci visione del film"
                    : "Segna il film come visto"
                }
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: isWatched
                    ? colors.completed
                    : colors.surface,
                  borderWidth: isWatched ? 0 : 1,
                  borderColor: colors.text,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: spacing.sm,
                }}
              >
                {isWatched && rewatchCount > 0 ? (
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
                    ×{rewatchCount + 1}
                  </Text>
                ) : (
                  <Ionicons
                    name={isWatched ? "checkmark" : "checkmark"}
                    size={23}
                    color={isWatched ? "#000000" : colors.text}
                  />
                )}
              </Pressable>

              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  marginTop: spacing.sm,
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    opacity: 0.7,
                  }}
                >
                  {isWatched ? "Visto il" : "Non visto"}
                </Text>

                {isWatched && watchedAt ? (
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: "600",
                      marginTop: 2,
                    }}
                  >
                    {new Date(watchedAt).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={{ padding: spacing.lg }}>
              {details.overview ? (
                <>
                  <Text style={[globalStyles.sectionTitle]}>Trama</Text>

                  <Text style={globalStyles.text}>
                    {overviewExpanded || details.overview.length <= 250
                      ? details.overview
                      : `${details.overview.slice(0, 250).trimEnd()}…`}
                  </Text>
                  {details.overview.length > 250 && (
                    <Pressable
                      onPress={() =>
                        setOverviewExpanded((previous) => !previous)
                      }
                      style={{ alignSelf: "flex-start", marginTop: spacing.sm }}
                      hitSlop={8}
                    >
                      <Text
                        style={{ color: colors.primary, fontWeight: "600" }}
                      >
                        {overviewExpanded ? "Mostra meno" : "Vedi altro"}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : null}

              {details.status ? (
                <Text style={[globalStyles.caption, { marginTop: spacing.lg }]}>
                  Stato: {details.status}
                </Text>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <ZoomableImageModal
        visible={showFullBackdrop}
        imageUri={
          details?.backdrop
            ? `${TMDB_IMAGE_BASE_URL.replace(
                "/w500",
                "/original",
              )}${details.backdrop}`
            : null
        }
        topInset={insets.top}
        onClose={() => setShowFullBackdrop(false)}
      />

      {!loading && !error && details && !isSaved && (
        <View style={getBottomActionContainerStyle(insets.bottom)}>
          <AddMediaButton
            label="Aggiungi film"
            loading={saving}
            onPress={handleSaveMovie}
          />
        </View>
      )}

      <BottomSheetModal
        ref={watchedSheetRef}
        index={0}
        snapPoints={["35%"]}
        enablePanDownToClose
        backdropComponent={renderWatchedBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
        onDismiss={() => {
          const mode = pendingDateModeRef.current;

          if (mode === null) return;

          pendingDateModeRef.current = null;
          watchedDateSheetRef.current?.present();
        }}
      >
        <WatchedActionSheet
          hasRewatch={hasRewatch}
          onUnwatch={handleUnwatch}
          onRewatch={() => openDateSheet("rewatch")}
          onResetRewatch={handleResetRewatch}
          onRemoveLastRewatch={handleRemoveLastRewatch}
          onEditFirstWatch={() => openDateSheet("edit_first_watch")}
        />
      </BottomSheetModal>

      <BottomSheetModal
        ref={watchedDateSheetRef}
        index={0}
        snapPoints={["45%"]}
        enablePanDownToClose
        backdropComponent={renderWatchedBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
        onDismiss={() => setWatchedDateMode(null)}
      >
        <WatchedDateSheet
          onNow={handleWatchNow}
          onYesterday={handleWatchYesterday}
          onReleaseDate={handleWatchOnReleaseDate}
          onCustomDate={handleCustomWatchDate}
          hasReleaseDate={Boolean(details?.date)}
        />
      </BottomSheetModal>
      <SeriesOptionsSheet
        ref={optionsSheetRef}
        isFavorite={isFavorite}
        hasRewatch={hasRewatch}
        watchStatus={null}
        onAddToList={handleAddToList}
        onToggleFavorite={handleToggleFavorite}
        onViewRewatches={handleViewRewatches}
        onStopWatching={() => {}}
      />
    </View>
  );
}
