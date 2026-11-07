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
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";
import {
  getTvDetails,
  getTvEpisodeDetails,
  getTvExternalIds,
  getTvSeasonDetails,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";
import { colors, globalStyles } from "@/styles/global";
import type { TMDBTvEpisode } from "@/types/tmdb";

import WatchedActionSheet from "@/components/bottomSheets/WatchedActionSheet";
import WatchedDateSheet from "@/components/bottomSheets/WatchedDateSheet";
import ZoomableImageModal from "@/components/ZoomableImageModal";
import {
  addEpisodeRewatch,
  clearEpisodeRewatches,
  getEpisodeByTmdbId,
  getEpisodeRewatchCount,
  getEpisodeWatchInfo,
  isTvSeriesSaved,
  markEpisodeUnwatched,
  markEpisodeWatched,
  removeLastEpisodeRewatch,
  saveTvSeasonEpisodes,
  saveTvSeriesDetails,
} from "@/database";
import { BottomSheetBackdrop, BottomSheetModal } from "@gorhom/bottom-sheet";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

type EpisodeDetailsData = {
  episode: TMDBTvEpisode;
  seriesTitle: string;
  seriesId: number;
};

function isAirDateUpcoming(airDate: string | null | undefined): boolean {
  if (!airDate) return false;

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return airDate > todayString;
}

export default function EpisodeDetails() {
  const { id, seriesId, seasonNumber, episodeNumber } = useLocalSearchParams<{
    id: string;
    seriesId: string;
    seasonNumber: string;
    episodeNumber: string;
  }>();

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [details, setDetails] = useState<EpisodeDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);

  const [isWatched, setIsWatched] = useState(false);
  const [watchedAt, setWatchedAt] = useState<string | null>(null);
  const [rewatchCount, setRewatchCount] = useState(0);

  const [previousEpisode, setPreviousEpisode] = useState<TMDBTvEpisode | null>(
    null,
  );
  const [nextEpisode, setNextEpisode] = useState<TMDBTvEpisode | null>(null);

  const [pendingDateMode, setPendingDateMode] = useState<
    "first_watch" | "rewatch"
  >("first_watch");

  const watchedSheetRef = useRef<BottomSheetModal>(null);
  const watchedDateSheetRef = useRef<BottomSheetModal>(null);

  const pendingDateModeRef = useRef<"first_watch" | "rewatch" | null>(null);

  const pagerRef = useRef<PagerView>(null);
  const changingEpisodeRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(previousEpisode ? 1 : 0);

  useEffect(() => {
    setCurrentPage(previousEpisode ? 1 : 0);
    changingEpisodeRef.current = false;
  }, [id, previousEpisode]);

  const ensureEpisodeSaved = async () => {
    const episodeTmdbId = Number(id);
    const seriesTmdbId = Number(seriesId);
    const season = Number(seasonNumber);

    if (
      !Number.isFinite(episodeTmdbId) ||
      !Number.isFinite(seriesTmdbId) ||
      !Number.isFinite(season)
    ) {
      throw new Error("Parametri episodio non validi.");
    }

    // Controlla se l'episodio è già presente.
    const existingEpisode = await getEpisodeByTmdbId(episodeTmdbId);

    if (existingEpisode) {
      return existingEpisode;
    }

    // Controlla se la serie è già presente.
    const seriesSaved = await isTvSeriesSaved(seriesTmdbId);

    if (!seriesSaved) {
      const [seriesDetails, externalIds] = await Promise.all([
        getTvDetails(seriesTmdbId),
        getTvExternalIds(seriesTmdbId),
      ]);

      await saveTvSeriesDetails(seriesDetails, {
        tvdb_id: externalIds.tvdb_id,
        imdb_id: externalIds.imdb_id,
      });
    }

    // Recupera e salva gli episodi della stagione.
    const seasonDetails = await getTvSeasonDetails(seriesTmdbId, season);

    await saveTvSeasonEpisodes(seriesTmdbId, seasonDetails);

    // Recupera l'episodio appena salvato.
    const savedEpisode = await getEpisodeByTmdbId(episodeTmdbId);

    if (!savedEpisode) {
      throw new Error("Impossibile salvare l'episodio nel database.");
    }

    return savedEpisode;
  };

  const handleWatchDate = async (
    date: Date,
    mode: "first_watch" | "rewatch",
  ) => {
    try {
      const savedEpisode = await ensureEpisodeSaved();

      const watchedAt = date.toISOString();

      if (mode === "first_watch") {
        await markEpisodeWatched(
          savedEpisode.series_tmdb_id,
          savedEpisode.season_number,
          savedEpisode.episode_number,
          watchedAt,
        );
      } else {
        await addEpisodeRewatch(
          savedEpisode.series_tmdb_id,
          savedEpisode.season_number,
          savedEpisode.episode_number,
          watchedAt,
        );
      }

      const watchInfo = await getEpisodeWatchInfo(
        savedEpisode.series_tmdb_id,
        savedEpisode.season_number,
        savedEpisode.episode_number,
      );

      const count = await getEpisodeRewatchCount(
        savedEpisode.series_tmdb_id,
        savedEpisode.season_number,
        savedEpisode.episode_number,
      );

      setIsWatched(watchInfo?.is_watched === 1);
      setWatchedAt(watchInfo?.watched_at ?? null);
      setRewatchCount(count);
      watchedDateSheetRef.current?.dismiss();
    } catch (err) {
      console.error("Errore registrazione visione episodio:", err);
      Alert.alert("Errore", "Impossibile registrare la visione dell'episodio.");
    }
  };

  async function handleWatchNow() {
    await handleWatchDate(new Date(), pendingDateMode);
  }

  async function handleWatchYesterday() {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    await handleWatchDate(date, pendingDateMode);
  }

  async function handleWatchOnReleaseDate() {
    if (!episode?.air_date) return;

    // Imposta mezzogiorno per evitare problemi di fuso orario.
    const date = new Date(`${episode.air_date}T12:00:00`);

    if (Number.isNaN(date.getTime())) return;

    if (date > new Date()) {
      Alert.alert(
        "Data non valida",
        "La data di uscita dell'episodio è futura.",
      );
      return;
    }

    await handleWatchDate(date, pendingDateMode);
  }

  function handleCustomWatchDate() {
    const now = new Date();

    DateTimePickerAndroid.open({
      value: now,
      mode: "date",
      maximumDate: now,
      onValueChange: (_event, selectedDate) => {
        if (!selectedDate) return;

        const chosenDate = new Date(selectedDate);
        chosenDate.setHours(
          now.getHours(),
          now.getMinutes(),
          now.getSeconds(),
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

            await handleWatchDate(finalDate, pendingDateMode);
          },
        });
      },
    });
  }

  const openWatchedSheet = () => {
    watchedSheetRef.current?.present();
  };

  const openDateSheet = (mode: "first_watch" | "rewatch") => {
    setPendingDateMode(mode);

    if (mode === "rewatch") {
      pendingDateModeRef.current = mode;
      watchedSheetRef.current?.dismiss();
    } else {
      watchedDateSheetRef.current?.present();
    }
  };

  const refreshEpisodeTracking = async () => {
    const savedEpisode = await getEpisodeByTmdbId(Number(id));

    if (!savedEpisode) {
      setIsWatched(false);
      setWatchedAt(null);
      setRewatchCount(0);
      return;
    }

    const [watchInfo, count] = await Promise.all([
      getEpisodeWatchInfo(
        savedEpisode.series_tmdb_id,
        savedEpisode.season_number,
        savedEpisode.episode_number,
      ),
      getEpisodeRewatchCount(
        savedEpisode.series_tmdb_id,
        savedEpisode.season_number,
        savedEpisode.episode_number,
      ),
    ]);

    setIsWatched(watchInfo?.is_watched === 1);
    setWatchedAt(watchInfo?.watched_at ?? null);
    setRewatchCount(count);
  };

  const handleUnwatch = () => {
    Alert.alert(
      "Segnare come non visto?",
      "La prima visione e tutti i rewatch registrati per questo episodio verranno eliminati.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Non visto",
          style: "destructive",
          onPress: async () => {
            try {
              await markEpisodeUnwatched(
                Number(seriesId),
                Number(seasonNumber),
                Number(episodeNumber),
              );

              await refreshEpisodeTracking();
              watchedSheetRef.current?.dismiss();
            } catch (err) {
              console.error("Errore annullamento visione:", err);
              Alert.alert("Errore", "Impossibile aggiornare l'episodio.");
            }
          },
        },
      ],
    );
  };

  const handleResetRewatch = () => {
    Alert.alert(
      "Azzerare i rewatch?",
      "Verranno eliminate tutte le visioni successive alla prima.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Azzera",
          style: "destructive",
          onPress: async () => {
            try {
              await clearEpisodeRewatches(
                Number(seriesId),
                Number(seasonNumber),
                Number(episodeNumber),
              );

              await refreshEpisodeTracking();
              watchedSheetRef.current?.dismiss();
            } catch (err) {
              console.error("Errore reset rewatch:", err);
              Alert.alert("Errore", "Impossibile azzerare i rewatch.");
            }
          },
        },
      ],
    );
  };

  const handleRemoveLastRewatch = () => {
    Alert.alert(
      "Rimuovere l'ultimo rewatch?",
      "Verrà eliminata soltanto l'ultima visione registrata.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Rimuovi",
          style: "destructive",
          onPress: async () => {
            try {
              await removeLastEpisodeRewatch(
                Number(seriesId),
                Number(seasonNumber),
                Number(episodeNumber),
              );

              await refreshEpisodeTracking();
              watchedSheetRef.current?.dismiss();
            } catch (err) {
              console.error("Errore rimozione rewatch:", err);
              Alert.alert("Errore", "Impossibile rimuovere il rewatch.");
            }
          },
        },
      ],
    );
  };

  async function loadAdjacentEpisodes(
    seriesId: number,
    seasonNumber: number,
    episodeNumber: number,
    seasons: NonNullable<Awaited<ReturnType<typeof getTvDetails>>["seasons"]>,
  ) {
    const orderedSeasons = [...seasons]
      .filter((season) => season.season_number > 0 && season.episode_count > 0)
      .sort((a, b) => a.season_number - b.season_number);

    const currentSeasonIndex = orderedSeasons.findIndex(
      (season) => season.season_number === seasonNumber,
    );

    if (currentSeasonIndex === -1) {
      return { previous: null, next: null };
    }

    const currentSeason = await getTvSeasonDetails(seriesId, seasonNumber);

    const orderedEpisodes = [...currentSeason.episodes].sort(
      (a, b) => a.episode_number - b.episode_number,
    );

    const currentEpisodeIndex = orderedEpisodes.findIndex(
      (item) => item.episode_number === episodeNumber,
    );

    if (currentEpisodeIndex === -1) {
      return { previous: null, next: null };
    }

    let previous = orderedEpisodes[currentEpisodeIndex - 1] ?? null;
    let next = orderedEpisodes[currentEpisodeIndex + 1] ?? null;

    if (!previous && currentSeasonIndex > 0) {
      const previousSeason = orderedSeasons[currentSeasonIndex - 1];

      const previousSeasonDetails = await getTvSeasonDetails(
        seriesId,
        previousSeason.season_number,
      );

      previous =
        [...previousSeasonDetails.episodes].sort(
          (a, b) => b.episode_number - a.episode_number,
        )[0] ?? null;
    }

    if (!next && currentSeasonIndex < orderedSeasons.length - 1) {
      const nextSeason = orderedSeasons[currentSeasonIndex + 1];

      const nextSeasonDetails = await getTvSeasonDetails(
        seriesId,
        nextSeason.season_number,
      );

      next =
        [...nextSeasonDetails.episodes].sort(
          (a, b) => a.episode_number - b.episode_number,
        )[0] ?? null;
    }

    return { previous, next };
  }

  useEffect(() => {
    let active = true;

    const loadEpisodeDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const seriesTmdbId = Number(seriesId);
        const season = Number(seasonNumber);
        const episodeNumberValue = Number(episodeNumber);

        if (
          !Number.isFinite(seriesTmdbId) ||
          !Number.isFinite(season) ||
          !Number.isFinite(episodeNumberValue)
        ) {
          throw new Error("Parametri episodio non validi.");
        }

        const [series, episode] = await Promise.all([
          getTvDetails(seriesTmdbId),
          getTvEpisodeDetails(seriesTmdbId, season, episodeNumberValue),
        ]);

        if (!active) return;

        const adjacent = await loadAdjacentEpisodes(
          seriesTmdbId,
          season,
          episodeNumberValue,
          series.seasons ?? [],
        );

        if (!active) return;

        const [watchInfo, episodeRewatches] = await Promise.all([
          getEpisodeWatchInfo(seriesTmdbId, season, episodeNumberValue),
          getEpisodeRewatchCount(seriesTmdbId, season, episodeNumberValue),
        ]);

        if (!active) return;

        setPreviousEpisode(adjacent.previous);
        setNextEpisode(adjacent.next);

        setIsWatched(watchInfo?.is_watched === 1);
        setWatchedAt(watchInfo?.watched_at ?? null);
        setRewatchCount(episodeRewatches);

        setDetails({
          episode,
          seriesTitle: series.name,
          seriesId: seriesTmdbId,
        });
      } catch (err) {
        if (!active) return;

        console.error("Errore caricamento dettagli episodio:", err);
        setError("Impossibile caricare i dettagli dell'episodio.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadEpisodeDetails();

    return () => {
      active = false;
    };
  }, [id, seriesId, seasonNumber, episodeNumber]);

  const episode = details?.episode ?? null;

  const isUpcoming = isAirDateUpcoming(episode?.air_date);

  const stillUri = episode?.still_path
    ? `${TMDB_IMAGE_BASE_URL.replace("/w500", "/w1280")}${episode.still_path}`
    : null;

  const navigateToEpisode = (target: TMDBTvEpisode) => {
    if (changingEpisodeRef.current) return;

    changingEpisodeRef.current = true;
    setShowFullImage(false);
    setOverviewExpanded(false);

    router.replace({
      pathname: "/details/episode/[id]",
      params: {
        id: String(target.id),
        seriesId: String(details?.seriesId),
        seasonNumber: String(target.season_number),
        episodeNumber: String(target.episode_number),
      },
    });
  };

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
        ) : error || !details || !episode ? (
          <Text style={globalStyles.empty}>
            {error ?? "Episodio non disponibile."}
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
              <PagerView
                key={`episode-pager-${id}`}
                ref={pagerRef}
                style={{ flex: 1 }}
                initialPage={previousEpisode ? 1 : 0}
                onPageSelected={(event) => {
                  const position = event.nativeEvent.position;
                  setCurrentPage(position);

                  if (changingEpisodeRef.current) return;

                  if (previousEpisode && position === 0) {
                    navigateToEpisode(previousEpisode);
                    return;
                  }

                  const lastPage =
                    Number(previousEpisode !== null) +
                    1 +
                    Number(nextEpisode !== null) -
                    1;

                  if (nextEpisode && position === lastPage) {
                    navigateToEpisode(nextEpisode);
                  }
                }}
              >
                {[
                  previousEpisode ? (
                    <View
                      key={`previous-${previousEpisode.id}`}
                      collapsable={false}
                      style={{
                        flex: 1,
                        backgroundColor: colors.surface,
                        justifyContent: "center",
                        alignItems: "center",
                        padding: spacing.lg,
                        paddingTop: insets.top,
                      }}
                    >
                      {previousEpisode.still_path && (
                        <Image
                          source={{
                            uri: `${TMDB_IMAGE_BASE_URL.replace(
                              "/w500",
                              "/w1280",
                            )}${previousEpisode.still_path}`,
                          }}
                          resizeMode="cover"
                          style={StyleSheet.absoluteFill}
                        />
                      )}

                      <View
                        style={{
                          ...StyleSheet.absoluteFill,
                          backgroundColor: "rgba(0,0,0,0.65)",
                        }}
                      />

                      <View style={{ alignItems: "center" }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 14,
                            marginBottom: spacing.xs,
                          }}
                        >
                          Episodio precedente
                        </Text>

                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 20,
                            fontWeight: "700",
                            textAlign: "center",
                          }}
                        >
                          S{previousEpisode.season_number} · E
                          {previousEpisode.episode_number}
                        </Text>

                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 16,
                            textAlign: "center",
                            marginTop: spacing.xs,
                          }}
                        >
                          {previousEpisode.name}
                        </Text>
                      </View>
                    </View>
                  ) : null,

                  <View
                    key={`current-${episode.id}`}
                    collapsable={false}
                    style={{
                      flex: 1,
                      backgroundColor: colors.surface,
                    }}
                  >
                    {stillUri ? (
                      <Pressable
                        onPress={() => setShowFullImage(true)}
                        style={{
                          ...StyleSheet.absoluteFill,
                        }}
                      >
                        <Image
                          source={{ uri: stillUri }}
                          resizeMode="cover"
                          style={StyleSheet.absoluteFill}
                        />
                      </Pressable>
                    ) : null}

                    <View
                      pointerEvents="box-none"
                      style={{
                        flex: 1,
                        paddingTop: insets.top,
                        justifyContent: "space-between",
                        backgroundColor: stillUri
                          ? "rgba(0,0,0,0.15)"
                          : colors.surface,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.sm,
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
                      </View>

                      <View
                        style={{
                          padding: spacing.lg,
                          backgroundColor: "rgba(0,0,0,0.65)",
                        }}
                      >
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: "/details/series/[id]",
                              params: { id: String(details.seriesId) },
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Vai alla serie ${details.seriesTitle}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 4,
                            paddingHorizontal: spacing.md,
                            height: 21,
                            borderRadius: 21,
                            borderWidth: 1,
                            borderColor: colors.text,
                            alignSelf: "flex-start",
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: colors.text,
                            }}
                          >
                            {details.seriesTitle}
                          </Text>

                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.text}
                          />
                        </Pressable>
                        <Text style={globalStyles.title}>{episode.name}</Text>

                        <Text
                          style={{
                            color: colors.text,
                            marginTop: spacing.xs,
                          }}
                        >
                          {`Stagione ${episode.season_number} · Episodio ${episode.episode_number}`}
                        </Text>

                        <Text
                          style={{
                            color: colors.text,
                            marginTop: spacing.xs,
                            marginBottom: spacing.sm,
                          }}
                        >
                          {[
                            episode.air_date
                              ? new Date(
                                  `${episode.air_date}T12:00:00`,
                                ).toLocaleDateString("it-IT")
                              : "",
                            episode.runtime ? `${episode.runtime} minuti` : "",
                            episode.vote_average > 0
                              ? `★ ${episode.vote_average.toFixed(1)}/10`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                    </View>
                  </View>,

                  nextEpisode ? (
                    <View
                      key={`next-${nextEpisode.id}`}
                      collapsable={false}
                      style={{
                        flex: 1,
                        backgroundColor: colors.surface,
                        justifyContent: "center",
                        alignItems: "center",
                        padding: spacing.lg,
                        paddingTop: insets.top,
                      }}
                    >
                      {nextEpisode.still_path && (
                        <Image
                          source={{
                            uri: `${TMDB_IMAGE_BASE_URL.replace(
                              "/w500",
                              "/w1280",
                            )}${nextEpisode.still_path}`,
                          }}
                          resizeMode="cover"
                          style={StyleSheet.absoluteFill}
                        />
                      )}

                      <View
                        style={{
                          ...StyleSheet.absoluteFill,
                          backgroundColor: "rgba(0,0,0,0.65)",
                        }}
                      />

                      <View style={{ alignItems: "center" }}>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 14,
                            marginBottom: spacing.xs,
                          }}
                        >
                          Episodio successivo
                        </Text>

                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 20,
                            fontWeight: "700",
                            textAlign: "center",
                          }}
                        >
                          S{nextEpisode.season_number} · E
                          {nextEpisode.episode_number}
                        </Text>

                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 16,
                            textAlign: "center",
                            marginTop: spacing.xs,
                          }}
                        >
                          {nextEpisode.name}
                        </Text>
                      </View>
                    </View>
                  ) : null,
                ].filter(Boolean)}
              </PagerView>

              {(previousEpisode || nextEpisode) && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    bottom: spacing.sm,
                    alignSelf: "center",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  {Array.from({
                    length:
                      Number(previousEpisode !== null) +
                      1 +
                      Number(nextEpisode !== null),
                  }).map((_, index) => (
                    <View
                      key={index}
                      style={{
                        width: currentPage === index ? 9 : 6,
                        height: currentPage === index ? 9 : 6,
                        borderRadius: 5,
                        backgroundColor:
                          currentPage === index
                            ? colors.text
                            : "rgba(255,255,255,0.5)",
                      }}
                    />
                  ))}
                </View>
              )}
            </View>

            {!isUpcoming && (
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
                      ? "Gestisci visione dell'episodio"
                      : "Segna l'episodio come visto"
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
                      name="checkmark"
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
            )}

            <View style={{ padding: spacing.lg }}>
              {episode.overview ? (
                <View style={{ marginTop: spacing.lg }}>
                  <Text style={globalStyles.sectionTitle}>Trama</Text>

                  <Text style={globalStyles.text}>
                    {overviewExpanded || episode.overview.length <= 250
                      ? episode.overview
                      : `${episode.overview.slice(0, 250).trimEnd()}…`}
                  </Text>

                  {episode.overview.length > 250 && (
                    <Pressable
                      onPress={() =>
                        setOverviewExpanded((previous) => !previous)
                      }
                      style={{
                        alignSelf: "flex-start",
                        marginTop: spacing.sm,
                      }}
                      hitSlop={8}
                    >
                      <Text
                        style={{
                          color: colors.primary,
                          fontWeight: "600",
                        }}
                      >
                        {overviewExpanded ? "Mostra meno" : "Vedi altro"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <BottomSheetModal
        ref={watchedSheetRef}
        index={0}
        snapPoints={["35%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
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
          hasRewatch={rewatchCount > 0}
          onUnwatch={handleUnwatch}
          onRewatch={() => openDateSheet("rewatch")}
          onResetRewatch={handleResetRewatch}
          onRemoveLastRewatch={handleRemoveLastRewatch}
          onEditFirstWatch={() => openDateSheet("first_watch")}
        />
      </BottomSheetModal>

      <BottomSheetModal
        ref={watchedDateSheetRef}
        index={0}
        snapPoints={["45%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
      >
        <WatchedDateSheet
          onNow={handleWatchNow}
          onYesterday={handleWatchYesterday}
          onReleaseDate={handleWatchOnReleaseDate}
          onCustomDate={handleCustomWatchDate}
          hasReleaseDate={Boolean(episode?.air_date)}
        />
      </BottomSheetModal>

      <ZoomableImageModal
        visible={showFullImage}
        imageUri={
          episode?.still_path
            ? `${TMDB_IMAGE_BASE_URL.replace(
                "/w500",
                "/original",
              )}${episode.still_path}`
            : null
        }
        topInset={insets.top}
        onClose={() => setShowFullImage(false)}
      />
    </View>
  );
}
