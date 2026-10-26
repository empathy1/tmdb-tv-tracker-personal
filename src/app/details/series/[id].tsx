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
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import AnimatedReanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TMDBTvDetails, TMDBTvSeasonDetails } from "@/types/tmdb";

import AddMediaButton from "@/components/AddMediaButton";
import SeriesOptionsSheet from "@/components/bottomSheets/SeriesOptionsSheet";
import WatchedActionSheet from "@/components/bottomSheets/WatchedActionSheet";
import WatchedDateSheet from "@/components/bottomSheets/WatchedDateSheet";
import FavoriteButton from "@/components/FavoriteButton";
import SeriesProgressBar from "@/components/SeriesProgressBar";
import { spacing } from "@/constants/theme";
import {
  addEpisodeRewatch,
  addSeasonRewatch,
  addTvSeriesFavorite,
  clearEpisodeRewatches,
  clearSeasonRewatches,
  getEpisodeRewatchCount,
  getSavedEpisodeNumbers,
  getTvSeriesRewatches,
  getTvSeriesWatchStatus,
  isTvSeriesFavorite,
  isTvSeriesSaved,
  markEpisodeUnwatched,
  markEpisodeWatched,
  markSeasonUnwatched,
  markSeasonWatched,
  removeLastEpisodeRewatch,
  removeLastSeasonRewatch,
  removeTvSeriesFavorite,
  saveTvSeasonEpisodes,
  saveTvSeriesDetails,
  updateTvSeriesWatchStatus,
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
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

type SavedEpisodeProgress = {
  season_number: number;
  episode_number: number;
  tmdb_id: number | null;
  is_watched: number;
  watched_at: string | null;
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

  const [overviewExpanded, setOverviewExpanded] = useState(false);

  const [showFullBackdrop, setShowFullBackdrop] = useState(false);

  const optionsSheetRef = useRef<BottomSheetModal>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [hasRewatch, setHasRewatch] = useState(false);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const pinchStartScale = useSharedValue(1);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

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
  const checkmarkScale = useRef(new Animated.Value(0)).current;

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

          const favorite = await isTvSeriesFavorite(mediaId);
          const rewatchHistory = await getTvSeriesRewatches(mediaId);

          if (!active) return;

          setIsFavorite(favorite);
          setHasRewatch(rewatchHistory.length > 0);

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

  function handleAddToList() {
    Alert.alert(
      "Liste",
      "La gestione delle liste sarà disponibile prossimamente.",
      [{ text: "OK" }],
    );
  }

  async function handleToggleFavorite(): Promise<boolean> {
    try {
      const seriesId = Number(id);

      if (isFavorite) {
        await removeTvSeriesFavorite(seriesId);
        setIsFavorite(false);
      } else {
        await addTvSeriesFavorite(seriesId, details?.title ?? "");
        setIsFavorite(true);
      }

      return true;
    } catch (error) {
      console.error("Errore aggiornando i preferiti:", error);

      Alert.alert("Errore", "Non è stato possibile aggiornare i preferiti.");

      return false;
    }
  }

  function handleViewRewatches() {
    router.push({
      pathname: "../rewatches/series/[id]",
      params: { id: String(id) },
    });
  }

  async function handleStopWatching() {
    try {
      await updateTvSeriesWatchStatus(Number(id), "stopped");
      setWatchStatus("stopped");
    } catch (error) {
      console.error("Errore aggiornando lo stato della serie:", error);

      Alert.alert(
        "Errore",
        "Non è stato possibile aggiornare lo stato della serie.",
      );
    }
  }

  async function handleResumeWatching() {
    try {
      await updateTvSeriesWatchStatus(Number(id), "continuing");
      setWatchStatus("continuing");
    } catch (error) {
      console.error("Errore riprendendo la serie:", error);

      Alert.alert("Errore", "Non è stato possibile riprendere la visione.");
    }
  }

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
    await ensureSeriesSaved();
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

    await refreshEpisodeHistory();
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
      onValueChange: (_event, selectedDate) => {
        if (selectedDate) {
          void saveSelectedWatchDate(selectedDate.toISOString());
        }
      },
    });
  }

  async function refreshEpisodeHistory() {
    const seriesId = Number(id);

    const [savedEpisodes, savedWatchStatus, rewatchHistory] = await Promise.all(
      [
        getSavedEpisodeNumbers(seriesId),
        getTvSeriesWatchStatus(seriesId),
        getTvSeriesRewatches(seriesId),
      ],
    );

    setEpisodeHistory(savedEpisodes);
    setIsSaved(true);
    setHasRewatch(rewatchHistory.length > 0);

    const ordinarySeasons =
      details?.seasons.filter(
        (season) => season.season_number > 0 && season.episode_count > 0,
      ) ?? [];

    const allEpisodesWatched =
      ordinarySeasons.length > 0 &&
      ordinarySeasons.every((season) => {
        const watchedCount = savedEpisodes.filter(
          (episode) =>
            episode.season_number === season.season_number &&
            episode.is_watched === 1,
        ).length;

        return watchedCount >= season.episode_count;
      });

    const hasWatchedEpisodes = savedEpisodes.some(
      (episode) => episode.is_watched === 1,
    );

    let nextWatchStatus = savedWatchStatus;

    if (allEpisodesWatched) {
      nextWatchStatus = "up_to_date";
    } else if (
      hasWatchedEpisodes &&
      (savedWatchStatus === null ||
        savedWatchStatus === "not_started_yet" ||
        savedWatchStatus === "stopped" ||
        savedWatchStatus === "up_to_date")
    ) {
      nextWatchStatus = "continuing";
    }

    if (nextWatchStatus !== savedWatchStatus && nextWatchStatus !== null) {
      await updateTvSeriesWatchStatus(seriesId, nextWatchStatus);
    }

    setWatchStatus(nextWatchStatus);
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
    let allEpisodesRewatched = episodes.length > 0;

    for (const episode of episodes) {
      const count = await getEpisodeRewatchCount(
        Number(id),
        seasonNumber,
        episode.episode_number,
      );

      if (count === 0) {
        allEpisodesRewatched = false;
        break;
      }
    }

    setHasSelectedRewatch(allEpisodesRewatched);
    openWatchedSheet("actions");
  }

  async function handleMarkAllEpisodesWatched() {
    if (saving || !isSaved) return;

    try {
      setSaving(true);

      const seriesId = Number(id);
      const watchedAt = new Date().toISOString();

      // Recupera gli episodi aggiornati di tutte le stagioni.
      for (const season of details?.seasons ?? []) {
        const seasonData = await getTvSeasonDetails(
          seriesId,
          season.season_number,
        );

        await saveTvSeasonEpisodes(seriesId, seasonData);

        setSeasonDetails((previous) => ({
          ...previous,
          [season.season_number]: seasonData,
        }));
      }

      // Recupera lo storico aggiornato dal database.
      const savedEpisodes = await getSavedEpisodeNumbers(seriesId);

      // Segna come viste solo le prime visioni mancanti.
      // Gli episodi già visti conservano data e rewatch.
      for (const episode of savedEpisodes) {
        if (episode.season_number <= 0 || episode.is_watched === 1) {
          continue;
        }

        await markEpisodeWatched(
          seriesId,
          episode.season_number,
          episode.episode_number,
          watchedAt,
        );
      }

      await refreshEpisodeHistory();
    } catch (error) {
      console.error("Errore segnando tutti gli episodi come visti:", error);

      Alert.alert(
        "Errore",
        "Non è stato possibile segnare tutti gli episodi come visti.",
      );
    } finally {
      setSaving(false);
    }
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

  async function ensureSeriesSaved() {
    if (isSaved) return;

    const seriesId = Number(id);
    const series = await getTvDetails(seriesId);
    const externalIds = await getTvExternalIds(seriesId);

    await saveTvSeriesDetails(series, {
      tvdb_id: externalIds.tvdb_id,
      imdb_id: externalIds.imdb_id,
    });

    // Salva gli episodi di tutte le stagioni, speciali inclusi.
    for (const season of series.seasons ?? []) {
      const seasonData = await getTvSeasonDetails(
        seriesId,
        season.season_number,
      );

      await saveTvSeasonEpisodes(seriesId, seasonData);
    }

    setIsSaved(true);
    setWatchStatus("not_started_yet");
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

  const ordinarySeasons =
    details?.seasons.filter(
      (season) => season.season_number > 0 && season.episode_count > 0,
    ) ?? [];

  const isSeriesComplete =
    isSaved &&
    ordinarySeasons.length > 0 &&
    ordinarySeasons.every((season) => {
      const watchedInSeason = episodeHistory.filter(
        (episode) =>
          episode.season_number === season.season_number &&
          episode.is_watched === 1,
      ).length;

      return watchedInSeason >= season.episode_count;
    });

  useEffect(() => {
    if (!isSaved || !isSeriesComplete || watchStatus === "up_to_date") {
      return;
    }

    async function updateStatus() {
      try {
        await updateTvSeriesWatchStatus(Number(id), "up_to_date");
        setWatchStatus("up_to_date");
      } catch (error) {
        console.error("Errore aggiornando lo stato della serie:", error);
      }
    }

    void updateStatus();
  }, [isSaved, isSeriesComplete, watchStatus, id]);

  useEffect(() => {
    if (!isSeriesComplete) {
      checkmarkScale.setValue(0);
      return;
    }

    checkmarkScale.setValue(0);

    Animated.sequence([
      Animated.timing(checkmarkScale, {
        toValue: 1.2,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(checkmarkScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isSeriesComplete, checkmarkScale]);

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

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStartScale.value = scale.value;
    })
    .onUpdate((event) => {
      const nextScale = pinchStartScale.value * event.scale;

      scale.value = Math.max(1, Math.min(nextScale, 4));
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      if (scale.value <= 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const panGesture = Gesture.Pan()
    .minDistance(1)
    .maxPointers(1)
    .onStart(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;

      const maxX = (screenWidth * (scale.value - 1)) / 2;
      const maxY = (screenHeight * (scale.value - 1)) / 2;

      translateX.value = Math.max(
        -maxX,
        Math.min(maxX, panStartX.value + event.translationX),
      );

      translateY.value = Math.max(
        -maxY,
        Math.min(maxY, panStartY.value + event.translationY),
      );
    });

  const imageGestures = Gesture.Exclusive(
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerShown: false,
          orientation: showFullBackdrop ? "default" : "portrait",
        }}
      />

      <View style={[globalStyles.container, { flex: 1 }]}>
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
                height: 250 + insets.top,
                backgroundColor: colors.surface,
              }}
            >
              {details.backdrop ? (
                <Pressable
                  onPress={() => setShowFullBackdrop(true)}
                  style={{ flex: 1 }}
                >
                  <View style={globalStyles.background}>
                    <Image
                      source={{
                        uri: `${TMDB_IMAGE_BASE_URL.replace("/w500", "/w1280")}${details.backdrop}`,
                      }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
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
                          padding: spacing.lg,
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
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

                        <Pressable
                          onPress={() => {
                            optionsSheetRef.current?.present();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Opzioni serie TV"
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
                          paddingTop: 10,
                          backgroundColor: "rgba(0,0,0,0.55)",
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            width: "100%",
                          }}
                        >
                          {/* Colonna con titolo e dettagli */}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={globalStyles.title}>
                              {details.title}
                            </Text>

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

                          {/* Cuore a destra */}
                          <View
                            style={{
                              marginLeft: spacing.md,
                            }}
                          >
                            <View style={{ width: 30, height: 30 }}></View>
                            <FavoriteButton
                              tmdbId={Number(id)}
                              title={details.title}
                              isFavorite={isFavorite}
                              onToggleFavorite={handleToggleFavorite}
                            />
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ) : (
                <>
                  <View
                    style={{
                      padding: spacing.lg,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
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

                    <Pressable
                      onPress={() => optionsSheetRef.current?.present()}
                      accessibilityRole="button"
                      accessibilityLabel="Opzioni serie TV"
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
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
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

                      <View
                        style={{
                          marginLeft: spacing.md,
                        }}
                      >
                        <View style={{ width: 42, height: 42 }}></View>
                        <FavoriteButton
                          tmdbId={Number(id)}
                          title={details.title}
                          isFavorite={isFavorite}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>

            {isSaved && progressBarColor !== null && (
              <View style={[{ width: "100%" }, { marginBottom: spacing.md }]}>
                <SeriesProgressBar
                  watched={watchedEpisodes}
                  total={totalEpisodes}
                  color={progressBarColor}
                  isComplete={isSeriesComplete}
                  checkmarkScale={checkmarkScale}
                />
              </View>
            )}

            <ScrollView
              style={{ padding: spacing.lg }}
              contentContainerStyle={{
                paddingBottom: insets.bottom + spacing.xl,
              }}
              showsVerticalScrollIndicator={false}
            >
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

              {details && (
                <View>
                  {isSaved && (
                    <Pressable
                      onPress={handleMarkAllEpisodesWatched}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel="Segna tutti gli episodi come visti"
                      hitSlop={10}
                      style={{
                        alignSelf: "flex-end",
                        padding: spacing.xs,
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {saving ? (
                        <ActivityIndicator color={colors.completed} />
                      ) : (
                        <Ionicons
                          name={
                            isSeriesComplete
                              ? "checkmark-circle"
                              : "checkmark-circle-outline"
                          }
                          size={26}
                          color={
                            watchStatus === "up_to_date"
                              ? colors.completed
                              : colors.text
                          }
                        />
                      )}
                    </Pressable>
                  )}

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
                                        totalWatches >= 2 || allEpisodesWatched
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

                            <Ionicons
                              name={expanded ? "chevron-up" : "chevron-down"}
                              size={20}
                              color={colors.text}
                              style={{ marginLeft: spacing.sm }}
                            />
                          </View>

                          <>
                            {(() => {
                              const progress =
                                season.episode_count > 0
                                  ? Math.min(watched / season.episode_count, 1)
                                  : 0;

                              return (
                                <View style={{ marginTop: spacing.sm }}>
                                  <View style={globalStyles.progressBackground}>
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
                                            Uscita: {episode.air_date}
                                          </Text>
                                        ) : null}

                                        {(() => {
                                          const saved = episodeHistory.find(
                                            (item) =>
                                              item.season_number ===
                                                season.season_number &&
                                              item.episode_number ===
                                                episode.episode_number,
                                          );

                                          if (
                                            saved?.is_watched !== 1 ||
                                            !saved.watched_at
                                          ) {
                                            return null;
                                          }

                                          const watchedDate = new Date(
                                            saved.watched_at,
                                          );

                                          if (
                                            Number.isNaN(watchedDate.getTime())
                                          ) {
                                            return null;
                                          }

                                          return (
                                            <Text
                                              style={[
                                                globalStyles.caption,
                                                {
                                                  marginTop: spacing.xs,
                                                  color: colors.completed,
                                                },
                                              ]}
                                            >
                                              Prima visione:{" "}
                                              {watchedDate.toLocaleDateString(
                                                "it-IT",
                                              )}
                                            </Text>
                                          );
                                        })()}
                                      </View>
                                    </Pressable>

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

                                        const watched = saved?.is_watched === 1;

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
            </ScrollView>
            <Modal
              visible={showFullBackdrop}
              transparent
              animationType="fade"
              statusBarTranslucent
              onRequestClose={() => setShowFullBackdrop(false)}
            >
              <GestureHandlerRootView style={{ flex: 1 }}>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#000",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {details?.backdrop && (
                    <GestureDetector gesture={imageGestures}>
                      <AnimatedReanimated.View
                        style={[
                          {
                            width: "100%",
                            height: "100%",
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          imageAnimatedStyle,
                        ]}
                      >
                        <Image
                          source={{
                            uri: `${TMDB_IMAGE_BASE_URL.replace(
                              "/w500",
                              "/original",
                            )}${details.backdrop}`,
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                          }}
                          resizeMode="contain"
                        />
                      </AnimatedReanimated.View>
                    </GestureDetector>
                  )}

                  <Pressable
                    onPress={() => setShowFullBackdrop(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Chiudi immagine"
                    hitSlop={12}
                    style={{
                      position: "absolute",
                      top: insets.top + spacing.md,
                      right: spacing.lg,
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: "rgba(40,40,40,0.8)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="close" size={28} color="#fff" />
                  </Pressable>
                </View>
              </GestureHandlerRootView>
            </Modal>
          </>
        )}
      </View>
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
          ) : watchStatus === "stopped" ? (
            <View style={getBottomActionContainerStyle(insets.bottom)}>
              <AddMediaButton
                label="Riprendi la visione"
                loading={saving}
                onPress={handleResumeWatching}
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
      <SeriesOptionsSheet
        ref={optionsSheetRef}
        isFavorite={isFavorite}
        hasRewatch={hasRewatch}
        watchStatus={watchStatus}
        onAddToList={handleAddToList}
        onToggleFavorite={handleToggleFavorite}
        onViewRewatches={handleViewRewatches}
        onStopWatching={handleStopWatching}
      />
    </View>
  );
}
