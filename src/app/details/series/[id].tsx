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
import { useCallback, useState } from "react";
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
import { spacing } from "@/constants/theme";
import {
  getSavedEpisodeNumbers,
  isTvSeriesSaved,
  saveTvSeasonEpisodes,
  saveTvSeriesDetails,
} from "@/database";
import {
  colors,
  getBottomActionContainerStyle,
  globalStyles,
} from "@/styles/global";

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

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadDetails() {
        try {
          setLoading(true);
          setError(null);
          setSeasonsToUpdate([]);

          const mediaId = Number(id);

          if (!Number.isFinite(mediaId) || mediaId <= 0) {
            throw new Error("Serie TV non valida.");
          }

          const alreadySaved = await isTvSeriesSaved(mediaId);

          if (!active) return;

          setIsSaved(alreadySaved);

          const data: TMDBTvDetails = await getTvDetails(mediaId);

          if (!active) return;

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

          // Legge la cronologia senza modificare il database.
          const savedEpisodes = await getSavedEpisodeNumbers(mediaId);

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
                  <Text style={globalStyles.sectionTitle}>
                    Stagioni ed episodi
                  </Text>

                  {details.seasons
                    .slice()
                    .sort((a, b) => a.season_number - b.season_number)
                    .map((season) => {
                      const expanded = expandedSeasons.includes(
                        season.season_number,
                      );

                      const seasonData = seasonDetails[season.season_number];

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
                          <Pressable
                            onPress={() => toggleSeason(season.season_number)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              padding: spacing.md,
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
                                marginLeft: spacing.md,
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
                            </View>

                            <Ionicons
                              name={expanded ? "chevron-up" : "chevron-down"}
                              size={20}
                              color={colors.text}
                            />
                          </Pressable>

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
                                      paddingVertical: spacing.md,
                                      borderTopWidth: 1,
                                      borderTopColor: colors.background,
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
                                        {episode.episode_number}. {episode.name}
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
