import {
  getTvDetails,
  getTvExternalIds,
  getTvSeasonDetails,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";

import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TMDBTvDetails, TMDBTvSeasonDetails } from "@/types/tmdb";

import AddMediaButton from "@/components/AddMediaButton";
import WatchedActionSheet from "@/components/bottomSheets/WatchedActionSheet";
import WatchedDateSheet from "@/components/bottomSheets/WatchedDateSheet";
import SeriesProgressBar from "@/components/SeriesProgressBar";
import { spacing } from "@/constants/theme";
import {
  addEpisodeRewatch,
  addSeasonRewatch,
  clearEpisodeRewatches,
  clearSeasonRewatches,
  getEpisodeRewatchCount,
  getSavedEpisodeNumbers,
  getTvSeriesWatchStatus,
  isTvSeriesSaved,
  markEpisodeUnwatched,
  markEpisodeWatched,
  markSeasonUnwatched,
  markSeasonWatched,
  removeLastEpisodeRewatch,
  removeLastSeasonRewatch,
  saveTvSeasonEpisodes,
  saveTvSeriesDetails,
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

type SavedEpisodeProgress = {
  season_number: number;
  episode_number: number;
  tmdb_id: number | null;
  is_watched: number;
};

type SeriesDetailItem = {
  title: string;
  backdrop: string | null;
  overview: string;
  date: string;
  status: string;
  rating: number;
  genres: string[];
  extraInfo: string;
  seasons: TMDBTvDetails["seasons"];
};

export default function SeriesDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [details, setDetails] = useState<SeriesDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedSeasons, setExpandedSeasons] = useState<number[]>([]);

  const [isSaved, setIsSaved] = useState(false);
  const [watchStatus, setWatchStatus] = useState<string | null>(null);

  const [episodeHistory, setEpisodeHistory] = useState<SavedEpisodeProgress[]>(
    [],
  );

  const [episodeRewatchCounts, setEpisodeRewatchCounts] = useState<
    Record<string, number>
  >({});

  const [seasonsToUpdate, setSeasonsToUpdate] = useState<
    {
      season_number: number;
      season_name: string;
      missing_count: number;
    }[]
  >([]);

  const [seasonDetails, setSeasonDetails] = useState<
    Record<number, TMDBTvSeasonDetails>
  >({});

  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

  const watchedSheetRef = useRef<BottomSheetModal>(null);

  const [selectedEpisode, setSelectedEpisode] = useState<
    TMDBTvSeasonDetails["episodes"][number] | null
  >(null);

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const [watchedSheetPage, setWatchedSheetPage] = useState<"actions" | "date">(
    "actions",
  );

  const [watchedDateMode, setWatchedDateMode] = useState<
    "first_watch" | "rewatch" | null
  >(null);

  const [hasSelectedRewatch, setHasSelectedRewatch] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRewatchCounts() {
      const counts: Record<string, number> = {};

      for (const episode of episodeHistory) {
        if (episode.is_watched !== 1) continue;

        counts[getEpisodeKey(episode.season_number, episode.episode_number)] =
          await getEpisodeRewatchCount(
            Number(id),
            episode.season_number,
            episode.episode_number,
          );
      }

      if (!cancelled) {
        setEpisodeRewatchCounts(counts);
      }
    }

    void loadRewatchCounts();

    return () => {
      cancelled = true;
    };
  }, [episodeHistory, id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadDetails() {
        try {
          setLoading(true);
          setError(null);
          setSeasonsToUpdate([]);
          setEpisodeHistory([]);

          const mediaId = Number(id);

          if (!Number.isFinite(mediaId) || mediaId <= 0) {
            throw new Error("Serie TV non valida.");
          }

          const alreadySaved = await isTvSeriesSaved(mediaId);
          const savedWatchStatus = alreadySaved
            ? await getTvSeriesWatchStatus(mediaId)
            : null;

          setWatchStatus(savedWatchStatus);

          if (!active) return;

          setIsSaved(alreadySaved);

          const data: TMDBTvDetails = await getTvDetails(mediaId);

          if (!active) return;

          const savedEpisodes = alreadySaved
            ? await getSavedEpisodeNumbers(mediaId)
            : [];

          if (!active) return;

          setEpisodeHistory(savedEpisodes);

          setDetails({
            title: data.name,
            backdrop: data.backdrop_path,
            overview: data.overview,
            date: data.first_air_date,
            status: data.status,
            rating: data.vote_average,
            genres: data.genres.map((genre) => genre.name),
            extraInfo:
              `${data.number_of_seasons} stagioni · ` +
              `${data.number_of_episodes} episodi`,
            seasons: data.seasons ?? [],
          });

          // Le serie concluse non richiedono aggiornamenti.
          const normalizedStatus = data.status?.toLowerCase();

          const canUpdate =
            alreadySaved &&
            normalizedStatus !== "ended" &&
            normalizedStatus !== "canceled";

          if (!canUpdate) return;

          const watchedEpisodes = savedEpisodes.filter(
            (ep) => ep.is_watched === 1,
          ).length;

          const totalEpisodes = savedEpisodes.length;

          const seasonProgress = savedEpisodes.reduce(
            (acc, ep) => {
              if (!acc[ep.season_number]) {
                acc[ep.season_number] = {
                  watched: 0,
                  total: 0,
                };
              }

              acc[ep.season_number].total++;

              if (ep.is_watched === 1) {
                acc[ep.season_number].watched++;
              }

              return acc;
            },
            {} as Record<number, { watched: number; total: number }>,
          );

          if (!active) return;

          const tmdbSeasons = (data.seasons ?? [])
            .filter((season) => season.season_number > 0)
            .slice()
            .sort((a, b) => a.season_number - b.season_number);

          if (tmdbSeasons.length === 0) return;

          // Individua l'ultima stagione rappresentata nel database.
          const savedSeasonNumbers = savedEpisodes
            .map((episode) => episode.season_number)
            .filter((seasonNumber) => seasonNumber > 0);

          const lastSavedSeason =
            savedSeasonNumbers.length > 0
              ? Math.max(...savedSeasonNumbers)
              : null;

          // Se il database non contiene episodi, usa come riferimento
          // l'ultima stagione disponibile su TMDB.
          const referenceSeasonNumber =
            lastSavedSeason ??
            tmdbSeasons[tmdbSeasons.length - 1].season_number;

          const lastSeason = tmdbSeasons.find(
            (season) => season.season_number === referenceSeasonNumber,
          );

          // Se la stagione locale non è più presente nell'elenco TMDB,
          // usiamo la stagione TMDB più vicina precedente, se esiste.
          const fallbackLastSeason = [...tmdbSeasons]
            .reverse()
            .find((season) => season.season_number < referenceSeasonNumber);

          const seasonToCheck = lastSeason ?? fallbackLastSeason;

          // Controlliamo l'ultima stagione e la successiva disponibile.
          const nextSeason = tmdbSeasons.find(
            (season) => season.season_number > referenceSeasonNumber,
          );

          const seasonsToCheck = [
            ...(seasonToCheck ? [seasonToCheck] : []),
            ...(nextSeason ? [nextSeason] : []),
          ];

          const savedTmdbIds = new Set(
            savedEpisodes
              .map((episode) => episode.tmdb_id)
              .filter((tmdbId): tmdbId is number => tmdbId !== null),
          );

          const savedPositions = new Set(
            savedEpisodes.map(
              (episode) => `${episode.season_number}:${episode.episode_number}`,
            ),
          );

          const updates: {
            season_number: number;
            season_name: string;
            missing_count: number;
          }[] = [];

          // Tutte le stagioni da verificare devono essere leggibili.
          // Se una richiesta fallisce, non mostriamo un risultato
          // parziale come se il controllo fosse completo.
          for (const season of seasonsToCheck) {
            const seasonData = await getTvSeasonDetails(
              mediaId,
              season.season_number,
            );

            if (!active) return;

            let missingCount = 0;

            for (const episode of seasonData.episodes) {
              const position = `${episode.season_number}:${episode.episode_number}`;

              // Il codice TMDB ha la priorità quando è già presente.
              if (savedTmdbIds.has(episode.id)) {
                continue;
              }

              // La posizione evita di duplicare episodi già salvati
              // senza codice TMDB.
              if (savedPositions.has(position)) {
                continue;
              }

              missingCount++;

              // Evita di contare due volte lo stesso episodio
              // durante questo controllo.
              savedTmdbIds.add(episode.id);
              savedPositions.add(position);
            }

            if (missingCount > 0) {
              updates.push({
                season_number: season.season_number,
                season_name: season.name || `Stagione ${season.season_number}`,
                missing_count: missingCount,
              });
            }
          }

          if (!active) return;

          setSeasonsToUpdate(updates);

          if (updates.length > 0) {
            const message = updates
              .map(
                (season) =>
                  `${season.season_name}: ${season.missing_count} ${
                    season.missing_count === 1
                      ? "episodio nuovo"
                      : "episodi nuovi"
                  }`,
              )
              .join("\n");

            Alert.alert(
              "Nuovi episodi disponibili",
              `${message}\n\nPuoi aggiungerli usando il pulsante "Aggiorna episodi".`,
              [{ text: "OK" }],
            );
          }
        } catch (loadError) {
          if (!active) return;

          setError("Impossibile caricare i dettagli della serie TV.");
          setSeasonsToUpdate([]);

          console.error(
            "Errore durante il caricamento o il controllo degli episodi:",
            loadError,
          );
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void loadDetails();

      return () => {
        active = false;
      };
    }, [id]),
  );

  function openWatchedSheet(page: "actions" | "date") {
    setWatchedSheetPage(page);

    requestAnimationFrame(() => {
      watchedSheetRef.current?.present();
    });
  }

  async function openEpisodeActions(
    episode: TMDBTvSeasonDetails["episodes"][number],
    seasonNumber: number,
  ) {
    const saved = episodeHistory.find(
      (item) =>
        item.season_number === seasonNumber &&
        item.episode_number === episode.episode_number,
    );

    setSelectedEpisode(episode);
    setSelectedSeason(seasonNumber);

    if (saved?.is_watched === 1) {
      const count = await getEpisodeRewatchCount(
        Number(id),
        seasonNumber,
        episode.episode_number,
      );

      setHasSelectedRewatch(count > 0);
      setWatchedDateMode(null);
      openWatchedSheet("actions");
    } else {
      setWatchedDateMode("first_watch");
      openWatchedSheet("date");
    }
  }

  async function toggleSeason(seasonNumber: number) {
    const isExpanded = expandedSeasons.includes(seasonNumber);

    if (isExpanded) {
      setExpandedSeasons((previous) =>
        previous.filter((number) => number !== seasonNumber),
      );
      return;
    }

    setExpandedSeasons((previous) => [...previous, seasonNumber]);

    if (seasonDetails[seasonNumber]) {
      return;
    }

    try {
      setLoadingSeason(seasonNumber);

      const data = await getTvSeasonDetails(Number(id), seasonNumber);

      setSeasonDetails((previous) => ({
        ...previous,
        [seasonNumber]: data,
      }));
    } catch {
      setSeasonDetails((previous) => {
        const updated = { ...previous };
        delete updated[seasonNumber];
        return updated;
      });
    } finally {
      setLoadingSeason(null);
    }
  }

  function isSeasonWatched(seasonNumber: number): boolean {
    const season = details?.seasons.find(
      (item) => item.season_number === seasonNumber,
    );

    if (!season || season.episode_count <= 0) {
      return false;
    }

    const watchedCount = episodeHistory.filter(
      (episode) =>
        episode.season_number === seasonNumber && episode.is_watched === 1,
    ).length;

    return watchedCount >= season.episode_count;
  }

  async function saveSelectedWatchDate(date: string) {
    const seriesId = Number(id);

    if (watchedDateMode === "first_watch") {
      if (selectedEpisode && selectedSeason !== null) {
        await markEpisodeWatched(
          seriesId,
          selectedSeason,
          selectedEpisode.episode_number,
          date,
        );
      } else if (selectedSeason !== null) {
        await markSeasonWatched(seriesId, selectedSeason, date);
      }
    }

    if (watchedDateMode === "rewatch") {
      if (selectedEpisode && selectedSeason !== null) {
        await addEpisodeRewatch(
          seriesId,
          selectedSeason,
          selectedEpisode.episode_number,
          date,
        );
      } else if (selectedSeason !== null) {
        await addSeasonRewatch(seriesId, selectedSeason, date);
      }
    }

    watchedSheetRef.current?.dismiss();

    const savedEpisodes = await getSavedEpisodeNumbers(seriesId);
    setEpisodeHistory(savedEpisodes);
  }

  function getEpisodeKey(seasonNumber: number, episodeNumber: number) {
    return `${seasonNumber}-${episodeNumber}`;
  }

  function getSeasonTotalWatches(
    seasonNumber: number,
    totalEpisodes: number,
  ): number {
    if (totalEpisodes <= 0) return 0;

    const watchedEpisodesInSeason = episodeHistory.filter(
      (episode) =>
        episode.season_number === seasonNumber && episode.is_watched === 1,
    );

    // Il moltiplicatore compare solo se tutti gli episodi sono stati visti.
    if (watchedEpisodesInSeason.length < totalEpisodes) {
      return 0;
    }

    const watchCounts = watchedEpisodesInSeason.map((episode) => {
      const rewatchCount =
        episodeRewatchCounts[
          getEpisodeKey(seasonNumber, episode.episode_number)
        ] ?? 0;

      return 1 + rewatchCount;
    });

    return Math.min(...watchCounts);
  }

  function handleWatchNow() {
    void saveSelectedWatchDate(new Date().toISOString());
  }

  function handleWatchYesterday() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    void saveSelectedWatchDate(date.toISOString());
  }

  function getSelectedReleaseDate(): string | null {
    if (selectedEpisode?.air_date) {
      return selectedEpisode.air_date;
    }

    if (selectedSeason !== null) {
      return (
        details?.seasons.find(
          (season) => season.season_number === selectedSeason,
        )?.air_date ?? null
      );
    }

    return null;
  }

  function handleWatchOnReleaseDate() {
    const releaseDate = getSelectedReleaseDate();

    if (releaseDate) {
      void saveSelectedWatchDate(releaseDate);
    }
  }

  function handleCustomWatchDate() {
    DateTimePickerAndroid.open({
      value: new Date(),
      mode: "date",
      maximumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type === "set" && selectedDate) {
          void saveSelectedWatchDate(selectedDate.toISOString());
        }
      },
    });
  }

  async function refreshEpisodeHistory() {
    const savedEpisodes = await getSavedEpisodeNumbers(Number(id));
    setEpisodeHistory(savedEpisodes);
  }

  async function runWatchedAction(action: () => Promise<void>) {
    try {
      await action();
      await refreshEpisodeHistory();
      watchedSheetRef.current?.dismiss();
    } catch (error) {
      console.error("Errore aggiornando lo storico delle visioni:", error);
      Alert.alert(
        "Errore",
        "Non è stato possibile aggiornare lo storico delle visioni.",
      );
    }
  }

  function handleUnwatch() {
    if (selectedSeason === null) return;

    Alert.alert(
      "Confermare?",
      selectedEpisode
        ? "Vuoi segnare questo episodio come non visto? Verranno eliminati anche i suoi rewatch."
        : "Vuoi segnare tutti gli episodi di questa stagione come non visti? Verranno eliminati anche i loro rewatch.",
      [
        {
          text: "Annulla",
          style: "cancel",
        },
        {
          text: "Non visto",
          style: "destructive",
          onPress: () => {
            const seriesId = Number(id);
            const seasonNumber = selectedSeason;
            const episode = selectedEpisode;

            void runWatchedAction(async () => {
              if (episode) {
                await markEpisodeUnwatched(
                  seriesId,
                  seasonNumber,
                  episode.episode_number,
                );
              } else {
                await markSeasonUnwatched(seriesId, seasonNumber);
              }
            });
          },
        },
      ],
      { cancelable: true },
    );
  }

  function handleRewatch() {
    setWatchedDateMode("rewatch");
    setWatchedSheetPage("date");
  }

  function handleResetRewatch() {
    if (selectedSeason === null) return;

    Alert.alert(
      "Confermare?",
      selectedEpisode
        ? "Vuoi eliminare tutti i rewatch di questo episodio e conservarne soltanto la prima visione?"
        : "Vuoi eliminare tutti i rewatch degli episodi di questa stagione, conservando le prime visioni?",
      [
        {
          text: "Annulla",
          style: "cancel",
        },
        {
          text: "Visto una volta",
          style: "destructive",
          onPress: () => {
            const seriesId = Number(id);
            const seasonNumber = selectedSeason;
            const episode = selectedEpisode;

            void runWatchedAction(async () => {
              if (episode) {
                await clearEpisodeRewatches(
                  seriesId,
                  seasonNumber,
                  episode.episode_number,
                );
              } else {
                await clearSeasonRewatches(seriesId, seasonNumber);
              }
            });
          },
        },
      ],
      { cancelable: true },
    );
  }

  function handleRemoveLastRewatch() {
    if (selectedSeason === null) return;

    Alert.alert(
      "Confermare?",
      selectedEpisode
        ? "Vuoi eliminare l'ultimo rewatch di questo episodio?"
        : "Vuoi eliminare l'ultimo rewatch registrato per ogni episodio della stagione che ne ha almeno uno?",
      [
        {
          text: "Annulla",
          style: "cancel",
        },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => {
            const seriesId = Number(id);
            const seasonNumber = selectedSeason;
            const episode = selectedEpisode;

            void runWatchedAction(async () => {
              if (episode) {
                await removeLastEpisodeRewatch(
                  seriesId,
                  seasonNumber,
                  episode.episode_number,
                );
              } else {
                await removeLastSeasonRewatch(seriesId, seasonNumber);
              }
            });
          },
        },
      ],
      { cancelable: true },
    );
  }

  async function openSeasonActions(seasonNumber: number) {
    setSelectedEpisode(null);
    setSelectedSeason(seasonNumber);
    setWatchedDateMode(null);

    if (!isSeasonWatched(seasonNumber)) {
      setHasSelectedRewatch(false);
      setWatchedDateMode("first_watch");
      openWatchedSheet("date");
      return;
    }

    const episodes = seasonDetails[seasonNumber]?.episodes ?? [];
    let hasRewatch = false;

    for (const episode of episodes) {
      const count = await getEpisodeRewatchCount(
        Number(id),
        seasonNumber,
        episode.episode_number,
      );

      if (count > 0) {
        hasRewatch = true;
        break;
      }
    }

    setHasSelectedRewatch(hasRewatch);
    openWatchedSheet("actions");
  }

  async function handleSaveSeries() {
    if (saving) return;

    try {
      setSaving(true);

      const seriesId = Number(id);

      // Recupera i dati aggiornati della serie e gli ID esterni.
      const series = await getTvDetails(seriesId);
      const externalIds = await getTvExternalIds(seriesId);

      // Salva la serie nel database.
      await saveTvSeriesDetails(series, {
        tvdb_id: externalIds.tvdb_id,
        imdb_id: externalIds.imdb_id,
      });

      // Recupera e salva gli episodi di ogni stagione.
      for (const season of series.seasons ?? []) {
        const seasonDetails = await getTvSeasonDetails(
          seriesId,
          season.season_number,
        );

        await saveTvSeasonEpisodes(seriesId, seasonDetails);
      }

      setIsSaved(true);

      const savedEpisodes = await getSavedEpisodeNumbers(seriesId);
      setEpisodeHistory(savedEpisodes);

      Alert.alert(
        "Salvataggio completato",
        "La serie e gli episodi sono stati salvati nel database.",
      );
    } catch (error) {
      console.error("Errore durante il salvataggio della serie:", error);

      Alert.alert(
        "Errore",
        "Non è stato possibile salvare la serie e i suoi episodi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateEpisodes() {
    if (saving || seasonsToUpdate.length === 0) {
      return;
    }

    try {
      setSaving(true);

      const seriesId = Number(id);
      let addedCount = 0;

      for (const season of seasonsToUpdate) {
        const seasonData = await getTvSeasonDetails(
          seriesId,
          season.season_number,
        );

        await saveTvSeasonEpisodes(seriesId, seasonData);

        // Aggiorna anche i dettagli già caricati nella schermata.
        setSeasonDetails((previous) => ({
          ...previous,
          [season.season_number]: seasonData,
        }));

        addedCount += season.missing_count;
      }

      setSeasonsToUpdate([]);

      Alert.alert(
        "Aggiornamento completato",
        `Sono stati elaborati ${addedCount} ${
          addedCount === 1 ? "episodio" : "episodi"
        } mancanti.`,
        [{ text: "OK" }],
      );
    } catch (error) {
      console.error("Errore durante l'aggiornamento degli episodi:", error);

      Alert.alert(
        "Errore",
        "Non è stato possibile aggiornare gli episodi. Riprova.",
      );
    } finally {
      setSaving(false);
    }
  }

  const watchedEpisodes = episodeHistory.filter(
    (episode) => episode.season_number > 0 && episode.is_watched === 1,
  ).length;

  const totalEpisodes =
    details?.seasons.reduce(
      (total, season) =>
        season.season_number > 0 ? total + season.episode_count : total,
      0,
    ) ?? 0;

  const renderWatchedBackdrop = useCallback(
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

  const seriesProgressColor =
    details?.status === "Returning Series"
      ? colors.completed
      : details?.status === "Ended" || details?.status === "Canceled"
        ? colors.ended
        : null;

  const progressBarColor =
    watchStatus === "continuing"
      ? colors.continuing
      : watchStatus === "stopped"
        ? colors.stopped
        : watchStatus === "up_to_date"
          ? (seriesProgressColor ?? colors.completed)
          : colors.progressBackground;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={[globalStyles.container, { flex: 1 }]}
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
            {error ?? "Serie TV non disponibile."}
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
                <ImageBackground
                  source={{
                    uri: `${TMDB_IMAGE_BASE_URL.replace(
                      "/w500",
                      "/w1280",
                    )}${details.backdrop}`,
                  }}
                  style={{
                    flex: 1,
                    paddingTop: insets.top,
                    justifyContent: "space-between",
                  }}
                  resizeMode="cover"
                >
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "space-between",
                      backgroundColor: "rgba(0,0,0,0.12)",
                    }}
                  >
                    <View style={{ padding: spacing.lg }}>
                      <Pressable
                        onPress={() => router.back()}
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
                        paddingTop: 20,
                        backgroundColor: "rgba(0,0,0,0.55)",
                      }}
                    >
                      <Text style={globalStyles.title}>{details.title}</Text>

                      <Text
                        style={{
                          color: colors.text,
                          marginTop: spacing.sm,
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
                            marginTop: spacing.sm,
                          }}
                        >
                          {details.genres.join(" · ")}
                        </Text>
                      )}
                    </View>
                  </View>
                </ImageBackground>
              ) : (
                <>
                  <View style={{ padding: spacing.lg, paddingTop: insets.top }}>
                    <Pressable
                      onPress={() => router.back()}
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
                        marginTop: spacing.sm,
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
                          marginTop: spacing.sm,
                        }}
                      >
                        {details.genres.join(" · ")}
                      </Text>
                    )}
                  </View>
                </>
              )}
            </View>

            {isSaved && progressBarColor !== null && (
              <View style={{ width: "100%" }}>
                <SeriesProgressBar
                  watched={watchedEpisodes}
                  total={totalEpisodes}
                  color={progressBarColor}
                />
              </View>
            )}

            <View style={{ padding: spacing.lg }}>
              {details.overview ? (
                <>
                  <Text
                    style={[
                      globalStyles.sectionTitle,
                      { marginTop: spacing.md },
                    ]}
                  >
                    Trama
                  </Text>

                  <Text style={globalStyles.text}>{details.overview}</Text>
                </>
              ) : null}

              {details.status ? (
                <Text style={[globalStyles.caption, { marginTop: spacing.lg }]}>
                  Stato: {details.status}
                </Text>
              ) : null}

              {details && (
                <View style={{ marginTop: spacing.xl }}>
                  {details.seasons
                    .slice()
                    .sort((a, b) => a.season_number - b.season_number)
                    .map((season) => {
                      const expanded = expandedSeasons.includes(
                        season.season_number,
                      );

                      const seasonData = seasonDetails[season.season_number];
                      const watched = episodeHistory.filter(
                        (episode) =>
                          episode.season_number === season.season_number &&
                          episode.is_watched === 1,
                      ).length;

                      return (
                        <View
                          key={season.id}
                          style={{
                            marginTop: spacing.md,
                            borderRadius: 12,
                            overflow: "hidden",
                            backgroundColor: colors.surface,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              padding: spacing.md,
                            }}
                          >
                            <Pressable
                              onPress={() => toggleSeason(season.season_number)}
                              style={{
                                flex: 1,
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            >
                              {season.poster_path ? (
                                <Image
                                  source={{
                                    uri: `${TMDB_IMAGE_BASE_URL}${season.poster_path}`,
                                  }}
                                  style={{
                                    width: 56,
                                    height: 80,
                                    borderRadius: 6,
                                    backgroundColor: colors.background,
                                  }}
                                  resizeMode="cover"
                                />
                              ) : null}

                              <View
                                style={{
                                  flex: 1,
                                  marginLeft: season.poster_path
                                    ? spacing.md
                                    : 0,
                                }}
                              >
                                <Text style={globalStyles.text}>
                                  {season.name ||
                                    (season.season_number === 0
                                      ? "Speciali"
                                      : `Stagione ${season.season_number}`)}
                                </Text>

                                <Text
                                  style={[
                                    globalStyles.caption,
                                    { marginTop: spacing.xs },
                                  ]}
                                >
                                  {season.episode_count} episodi
                                  {season.air_date
                                    ? ` · ${season.air_date.slice(0, 4)}`
                                    : ""}
                                </Text>

                                <Text
                                  style={[
                                    globalStyles.caption,
                                    { marginTop: spacing.xs },
                                  ]}
                                >
                                  {watched}/{season.episode_count}
                                </Text>
                              </View>
                            </Pressable>

                            {isSaved && (
                              <Pressable
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Opzioni di visione della stagione"
                                onPress={() =>
                                  openSeasonActions(season.season_number)
                                }
                                style={{
                                  padding: spacing.xs,
                                  marginLeft: spacing.sm,
                                }}
                              >
                                {(() => {
                                  const totalWatches = getSeasonTotalWatches(
                                    season.season_number,
                                    season.episode_count,
                                  );

                                  const allEpisodesWatched =
                                    season.episode_count > 0 &&
                                    watched >= season.episode_count;

                                  return (
                                    <View
                                      style={{
                                        width: 35,
                                        height: 35,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <Ionicons
                                        name={
                                          totalWatches >= 2
                                            ? "ellipse"
                                            : allEpisodesWatched
                                              ? "checkmark-circle"
                                              : "checkmark-circle-outline"
                                        }
                                        size={35}
                                        color={
                                          totalWatches >= 2 ||
                                          allEpisodesWatched
                                            ? colors.completed
                                            : colors.text
                                        }
                                      />

                                      {totalWatches >= 2 && (
                                        <View
                                          style={{
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                        >
                                          <Text
                                            numberOfLines={1}
                                            adjustsFontSizeToFit
                                            style={{
                                              color: "#000000",
                                              fontSize: 15,
                                              fontWeight: "700",
                                              includeFontPadding: false,
                                              textAlign: "center",
                                            }}
                                          >
                                            ×{totalWatches}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                  );
                                })()}
                              </Pressable>
                            )}

                            <Ionicons
                              name={expanded ? "chevron-up" : "chevron-down"}
                              size={20}
                              color={colors.text}
                              style={{ marginLeft: spacing.sm }}
                            />
                          </View>

                          {isSaved && (
                            <>
                              {(() => {
                                const progress =
                                  season.episode_count > 0
                                    ? Math.min(
                                        watched / season.episode_count,
                                        1,
                                      )
                                    : 0;

                                return (
                                  <View style={{ marginTop: spacing.sm }}>
                                    <View
                                      style={globalStyles.progressBackground}
                                    >
                                      <View
                                        style={[
                                          globalStyles.progressBar,
                                          {
                                            width: `${progress * 100}%`,
                                            backgroundColor:
                                              progress === 1
                                                ? colors.completed
                                                : colors.continuing,
                                          },
                                        ]}
                                      />
                                    </View>
                                  </View>
                                );
                              })()}
                            </>
                          )}

                          {expanded && (
                            <View style={{ padding: spacing.md }}>
                              {loadingSeason === season.season_number ? (
                                <ActivityIndicator
                                  size="small"
                                  color={colors.primary}
                                />
                              ) : seasonData ? (
                                seasonData.episodes.map((episode) => (
                                  <View
                                    key={episode.id}
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      paddingVertical: spacing.md,
                                      borderTopWidth: 1,
                                      borderTopColor: colors.background,
                                    }}
                                  >
                                    <Pressable
                                      onPress={() => {
                                        // In seguito apriremo qui il dettaglio dell'episodio.
                                      }}
                                      style={{
                                        flex: 1,
                                        flexDirection: "row",
                                        alignItems: "center",
                                      }}
                                    >
                                      {episode.still_path ? (
                                        <Image
                                          source={{
                                            uri: `${TMDB_IMAGE_BASE_URL}${episode.still_path}`,
                                          }}
                                          style={{
                                            width: 112,
                                            height: 64,
                                            borderRadius: 6,
                                            backgroundColor: colors.background,
                                          }}
                                          resizeMode="cover"
                                        />
                                      ) : null}

                                      <View
                                        style={{
                                          flex: 1,
                                          marginLeft: episode.still_path
                                            ? spacing.md
                                            : 0,
                                        }}
                                      >
                                        <Text
                                          style={[
                                            globalStyles.text,
                                            { fontWeight: "600" },
                                          ]}
                                        >
                                          {episode.episode_number}.{" "}
                                          {episode.name}
                                        </Text>

                                        {episode.air_date ? (
                                          <Text
                                            style={[
                                              globalStyles.caption,
                                              { marginTop: spacing.xs },
                                            ]}
                                          >
                                            {episode.air_date}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </Pressable>

                                    {isSaved && (
                                      <Pressable
                                        hitSlop={10}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          episodeHistory.some(
                                            (saved) =>
                                              saved.season_number ===
                                                season.season_number &&
                                              saved.episode_number ===
                                                episode.episode_number &&
                                              saved.is_watched === 1,
                                          )
                                            ? "Opzioni di visione dell'episodio"
                                            : "Segna l'episodio come visto"
                                        }
                                        onPress={() =>
                                          openEpisodeActions(
                                            episode,
                                            season.season_number,
                                          )
                                        }
                                        style={{
                                          padding: spacing.xs,
                                          marginLeft: spacing.sm,
                                        }}
                                      >
                                        {(() => {
                                          const saved = episodeHistory.find(
                                            (item) =>
                                              item.season_number ===
                                                season.season_number &&
                                              item.episode_number ===
                                                episode.episode_number,
                                          );

                                          const watched =
                                            saved?.is_watched === 1;

                                          const rewatchCount =
                                            episodeRewatchCounts[
                                              getEpisodeKey(
                                                season.season_number,
                                                episode.episode_number,
                                              )
                                            ] ?? 0;

                                          const totalWatches = watched
                                            ? 1 + rewatchCount
                                            : 0;

                                          return (
                                            <View
                                              style={{
                                                width: 35,
                                                height: 35,
                                                alignItems: "center",
                                                justifyContent: "center",
                                              }}
                                            >
                                              <Ionicons
                                                name={
                                                  totalWatches >= 2
                                                    ? "ellipse"
                                                    : watched
                                                      ? "checkmark-circle"
                                                      : "checkmark-circle-outline"
                                                }
                                                size={35}
                                                color={
                                                  watched
                                                    ? colors.completed
                                                    : colors.text
                                                }
                                              />

                                              {totalWatches >= 2 && (
                                                <View
                                                  style={{
                                                    position: "absolute",
                                                    top: 0,
                                                    left: 0,
                                                    right: 0,
                                                    bottom: 0,
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                  }}
                                                >
                                                  <Text
                                                    numberOfLines={1}
                                                    adjustsFontSizeToFit
                                                    style={{
                                                      color: "#000000",
                                                      fontSize: 15,
                                                      fontWeight: "700",
                                                      includeFontPadding: false,
                                                      textAlign: "center",
                                                    }}
                                                  >
                                                    ×{totalWatches}
                                                  </Text>
                                                </View>
                                              )}
                                            </View>
                                          );
                                        })()}
                                      </Pressable>
                                    )}
                                  </View>
                                ))
                              ) : (
                                <Text style={globalStyles.caption}>
                                  Impossibile caricare gli episodi. Chiudi e
                                  riapri la stagione per riprovare.
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      {!loading && !error && details && (
        <>
          {!isSaved ? (
            <View style={getBottomActionContainerStyle(insets.bottom)}>
              <AddMediaButton
                label="Aggiungi serie"
                loading={saving}
                onPress={handleSaveSeries}
              />
            </View>
          ) : seasonsToUpdate.length > 0 ? (
            <View style={getBottomActionContainerStyle(insets.bottom)}>
              <AddMediaButton
                label="Aggiorna episodi"
                loading={saving}
                onPress={handleUpdateEpisodes}
              />
            </View>
          ) : null}
        </>
      )}

      <BottomSheetModal
        ref={watchedSheetRef}
        index={0}
        snapPoints={watchedSheetPage === "actions" ? ["35%"] : ["45%"]}
        enablePanDownToClose
        backdropComponent={renderWatchedBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
      >
        {watchedSheetPage === "actions" ? (
          <WatchedActionSheet
            onUnwatch={handleUnwatch}
            onRewatch={handleRewatch}
            onResetRewatch={handleResetRewatch}
            hasRewatch={hasSelectedRewatch}
            onRemoveLastRewatch={handleRemoveLastRewatch}
          />
        ) : (
          <WatchedDateSheet
            onNow={handleWatchNow}
            onYesterday={handleWatchYesterday}
            onReleaseDate={handleWatchOnReleaseDate}
            onCustomDate={handleCustomWatchDate}
            hasReleaseDate={Boolean(getSelectedReleaseDate())}
          />
        )}
      </BottomSheetModal>
    </View>
  );
}
