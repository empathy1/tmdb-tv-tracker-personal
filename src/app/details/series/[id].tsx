import {
  getTvDetails,
  getTvExternalIds,
  getTvSeasonDetails,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";

import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

import { spacing } from "@/constants/theme";
import { saveTvSeasonEpisodes, saveTvSeriesDetails } from "@/database";
import { colors, globalStyles } from "@/styles/global";

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

  const [seasonDetails, setSeasonDetails] = useState<
    Record<number, TMDBTvSeasonDetails>
  >({});

  const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

  useEffect(() => {
    async function loadDetails() {
      try {
        setLoading(true);
        setError(null);
        // setHistoryEpisodes([]);

        const mediaId = Number(id);

        if (!Number.isFinite(mediaId) || mediaId <= 0) {
          throw new Error("Serie TV non valida.");
        }

        // 1. Carica i dettagli dal catalogo TMDB.
        const data: TMDBTvDetails = await getTvDetails(mediaId);
        const externalIds = await getTvExternalIds(mediaId);

        // 3. Mostra i dettagli senza dipendere dalla cronologia legacy.
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
      } catch (error) {
        setError("Impossibile caricare i dettagli della serie TV.");
        console.error("ERRORE DETTAGLI SERIE:", error);
      } finally {
        setLoading(false);
      }
    }

    loadDetails();
  }, [id]);

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

  return (
    <>
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
            {error ?? "Serie TV non disponibile."}
          </Text>
        ) : (
          <>
            {details.backdrop && (
              <ImageBackground
                source={{
                  uri: `${TMDB_IMAGE_BASE_URL.replace(
                    "/w500",
                    "/w1280",
                  )}${details.backdrop}`,
                }}
                style={{
                  width: "100%",
                  height: 280 + insets.top,
                  paddingTop: insets.top,
                  justifyContent: "space-between",
                  backgroundColor: colors.surface,
                }}
                resizeMode="cover"
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
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
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
              </ImageBackground>
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
              <Pressable
                onPress={handleSaveSeries}
                disabled={saving}
                style={{
                  padding: 14,
                  borderRadius: 30,
                  backgroundColor: saving ? "#666" : colors.primary,
                  alignItems: "center",
                  marginTop: spacing.xl,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "bold" }}>
                  {saving ? "Salvataggio in corso..." : "Aggiungi serie"}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}
