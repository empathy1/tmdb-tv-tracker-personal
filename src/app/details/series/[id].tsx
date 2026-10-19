import {
  getTvDetails,
  getTvExternalIds,
  getTvSeasonDetails,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";

import { Ionicons } from "@expo/vector-icons";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useRef, useState } from "react";
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
import SeriesProgressBar from "@/components/SeriesProgressBar";
import { spacing } from "@/constants/theme";
import {
  addEpisodeRewatch,
  addSeasonRewatch,
  getEpisodeRewatchCount,
  getSavedEpisodeNumbers,
  isTvSeriesSaved,
  markEpisodeWatched,
  markSeasonWatched,
  saveTvSeasonEpisodes,
  saveTvSeriesDetails,
} from "@/database";
import {
  colors,
  getBottomActionContainerStyle,
  globalStyles,
} from "@/styles/global";
import { BottomSheetModal } from "@gorhom/bottom-sheet";

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

  const [episodeHistory, setEpisodeHistory] = useState<SavedEpisodeProgress[]>(
    [],
  );

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

            {isSaved && (
              <View style={{ width: "100%" }}>
                <SeriesProgressBar
                  watched={watchedEpisodes}
                  total={totalEpisodes}
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
                                <Ionicons
                                  name={
                                    isSeasonWatched(season.season_number)
                                      ? "checkmark-circle"
                                      : "checkmark-circle-outline"
                                  }
                                  size={35}
                                  color={
                                    isSeasonWatched(season.season_number)
                                      ? colors.completed
                                      : colors.text
                                  }
                                />
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
                                        <Ionicons
                                          name={
                                            episodeHistory.some(
                                              (saved) =>
                                                saved.season_number ===
                                                  season.season_number &&
                                                saved.episode_number ===
                                                  episode.episode_number &&
                                                saved.is_watched === 1,
                                            )
                                              ? "checkmark-circle"
                                              : "checkmark-circle-outline"
                                          }
                                          size={35}
                                          color={
                                            episodeHistory.some(
                                              (saved) =>
                                                saved.season_number ===
                                                  season.season_number &&
                                                saved.episode_number ===
                                                  episode.episode_number &&
                                                saved.is_watched === 1,
                                            )
                                              ? colors.completed
                                              : colors.text
                                          }
                                        />
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
    </View>
  );
}
