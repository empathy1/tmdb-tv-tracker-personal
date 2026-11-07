import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  getCalendarSeries,
  getContinuingSeries,
  getNotStartedSeries,
  getNotWatchedMovies,
  getWatchLaterSeries,
  markHomeEpisodeWatched,
  markMovieWatched,
} from "@/database";

import { getCalendarCache, setCalendarCache } from "@/services/calendarCache";

import type { HomeMovie, HomeSeries, HomeWatchStatus } from "@/database";

import HorizontalMediaList from "@/components/HorizontalMediaList";
import MediaCard from "@/components/MediaCard";

import { spacing } from "@/constants/theme";
import { getTvDetails, TMDB_IMAGE_BASE_URL } from "@/services/tmdb";
import { colors, globalStyles } from "@/styles/global";

type CalendarItem = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  episode_id: number;
  episode_title: string;
  season_number: number;
  episode_number: number;
  air_date: string;
  days_until: number;
};

type HomeListsData = {
  continuing: HomeSeries[];
  notStarted: HomeSeries[];
  watchLater: HomeSeries[];
  movies: HomeMovie[];
};

type HomeData = HomeListsData & {
  calendar: CalendarItem[];
};

const initialData: HomeData = {
  continuing: [],
  notStarted: [],
  watchLater: [],
  calendar: [],
  movies: [],
};

const CALENDAR_CACHE_DURATION = 6 * 60 * 60 * 1000;

function getDaysUntil(airDate: string): number | null {
  const match = airDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match.map(Number);

  const today = new Date();

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const airDateUtc = Date.UTC(year, month - 1, day);

  return Math.round((airDateUtc - todayUtc) / 86400000);
}

type HomeCheckButtonProps = {
  loading: boolean;
  success: boolean;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

function HomeCheckButton({
  loading,
  success,
  disabled,
  onPress,
  accessibilityLabel = "Segna l'episodio come visto",
}: HomeCheckButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (success) {
      Animated.spring(scale, {
        toValue: 1.45,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start();
    } else {
      scale.setValue(1);
    }
  }, [success, scale]);

  return (
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={{
        padding: spacing.xs,
        marginLeft: spacing.sm,
      }}
    >
      <Animated.View
        style={{
          width: 35,
          height: 35,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons
            name="checkmark-circle"
            size={35}
            color={success ? colors.completed : colors.text}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}

type AnimatedHomeItemProps = {
  fading: boolean;
  children: React.ReactNode;
};

function AnimatedHomeItem({ fading, children }: AnimatedHomeItemProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (fading) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      opacity.setValue(1);
    }
  }, [fading, opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export default function HomeScreen() {
  const router = useRouter();

  const [data, setData] = useState<HomeData>(initialData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingEpisode, setSavingEpisode] = useState<string | null>(null);
  const [successEpisode, setSuccessEpisode] = useState<string | null>(null);
  const [fadingEpisode, setFadingEpisode] = useState<string | null>(null);

  const [savingMovie, setSavingMovie] = useState<number | null>(null);
  const [successMovie, setSuccessMovie] = useState<number | null>(null);
  const [fadingMovie, setFadingMovie] = useState<number | null>(null);

  const fetchHomeData = useCallback(async (): Promise<HomeData> => {
    const [continuing, notStarted, watchLater, movies] = await Promise.all([
      getContinuingSeries(),
      getNotStartedSeries(),
      getWatchLaterSeries(),
      getNotWatchedMovies(),
    ]);

    return {
      continuing,
      notStarted,
      watchLater,
      movies,
      calendar: [],
    };
  }, []);

  const fetchCalendarData = useCallback(async (): Promise<CalendarItem[]> => {
    const cached = getCalendarCache<CalendarItem>();

    if (cached && Date.now() - cached.timestamp < CALENDAR_CACHE_DURATION) {
      return cached.items;
    }

    const seriesList = await getCalendarSeries();
    const calendarItems: CalendarItem[] = [];

    // Massimo 5 richieste TMDB contemporanee.
    const batchSize = 5;

    for (let i = 0; i < seriesList.length; i += batchSize) {
      const batch = seriesList.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (series) => {
          try {
            const details = await getTvDetails(series.tmdb_id);
            const episode = details.next_episode_to_air;

            if (!episode?.air_date) {
              return null;
            }

            const daysUntil = getDaysUntil(episode.air_date);

            if (daysUntil === null || daysUntil <= 0) {
              return null;
            }

            return {
              tmdb_id: series.tmdb_id,
              title: series.title,
              poster_path: series.poster_path,
              episode_id: episode.id,
              episode_title: episode.name,
              season_number: episode.season_number,
              episode_number: episode.episode_number,
              air_date: episode.air_date,
              days_until: daysUntil,
            };
          } catch (error) {
            console.warn(
              `Errore recupero calendario serie ${series.tmdb_id}:`,
              error,
            );

            return null;
          }
        }),
      );

      calendarItems.push(
        ...results.filter((item): item is CalendarItem => item !== null),
      );
    }

    calendarItems.sort((a, b) => a.days_until - b.days_until);

    setCalendarCache(calendarItems);

    return calendarItems;
  }, []);

  const loadHomeData = useCallback(async () => {
    const result = await fetchHomeData();
    setData((prev) => ({ ...prev, ...result }));
  }, [fetchHomeData]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        try {
          // Carica le tre sezioni esistenti.
          const result = await fetchHomeData();

          if (active) {
            setData((prev) => ({ ...prev, ...result }));
          }

          // Carica il Calendario separatamente.
          void fetchCalendarData()
            .then((calendar) => {
              if (active) {
                setData((prev) => ({ ...prev, calendar }));
              }
            })
            .catch((error) => {
              console.error("Errore caricamento Calendario:", error);
            });
        } catch (error) {
          console.error("Errore caricamento Home:", error);

          if (active) {
            Alert.alert(
              "Errore",
              "Non è stato possibile caricare i dati della Home.",
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      void load();

      return () => {
        active = false;
      };
    }, [fetchHomeData, fetchCalendarData]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await loadHomeData();
    } catch (error) {
      console.error("Errore aggiornamento Home:", error);
      Alert.alert("Errore", "Impossibile aggiornare la Home.");
    } finally {
      setRefreshing(false);
    }
  };

  const openSeries = (tmdbId: number) => {
    router.push({
      pathname: "/details/series/[id]",
      params: { id: String(tmdbId) },
    });
  };

  const openMovie = (tmdbId: number) => {
    router.push({
      pathname: "/details/movie/[id]",
      params: { id: String(tmdbId) },
    });
  };

  const formatMovieReleaseDate = (date: string | null) => {
    if (!date) return "Data di uscita sconosciuta";

    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year}`;
  };

  const handleMarkWatched = async (
    series: HomeSeries,
    watchStatus: HomeWatchStatus,
  ) => {
    const episodeKey = `${series.tmdb_id}-${series.season_number}-${series.episode_number}`;

    if (savingEpisode !== null) {
      return;
    }

    setSavingEpisode(episodeKey);

    try {
      await markHomeEpisodeWatched(
        series.tmdb_id,
        series.season_number,
        series.episode_number,
        watchStatus,
      );

      setSuccessEpisode(episodeKey);

      // Animazione della spunta.
      await new Promise<void>((resolve) => setTimeout(resolve, 650));

      // Dissolvenza della card.
      setFadingEpisode(episodeKey);

      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      // Aggiornamento delle liste.
      await loadHomeData();
    } catch (error) {
      console.error("Errore registrazione visione:", error);

      Alert.alert(
        "Errore",
        "Non è stato possibile registrare la visione dell'episodio.",
      );
    } finally {
      setSuccessEpisode(null);
      setFadingEpisode(null);
      setSavingEpisode(null);
    }
  };

  const handleMarkMovieWatched = async (movie: HomeMovie) => {
    const movieId = movie.tmdb_id;

    if (savingMovie !== null) {
      return;
    }

    setSavingMovie(movieId);

    try {
      await markMovieWatched(movieId);

      // Animazione della spunta.
      setSuccessMovie(movieId);

      await new Promise<void>((resolve) => setTimeout(resolve, 650));

      // Dissolvenza della card.
      setFadingMovie(movieId);

      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      // Aggiornamento delle liste.
      await loadHomeData();
    } catch (error) {
      console.error("Errore registrazione visione film:", error);

      Alert.alert(
        "Errore",
        "Non è stato possibile registrare la visione del film.",
      );
    } finally {
      setSuccessMovie(null);
      setFadingMovie(null);
      setSavingMovie(null);
    }
  };

  const renderPoster = (
    posterPath: string | null,
    width: number,
    height: number,
  ) => {
    if (!posterPath) {
      return (
        <View
          style={{
            width,
            height,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
          }}
        >
          <Ionicons
            name="image-outline"
            size={24}
            color={colors.textSecondary}
          />
        </View>
      );
    }

    return (
      <Image
        source={{ uri: `${TMDB_IMAGE_BASE_URL}${posterPath}` }}
        style={{
          width,
          height,
          borderRadius: 6,
          backgroundColor: colors.background,
        }}
        contentFit="cover"
      />
    );
  };

  const renderEpisodeInfo = (series: HomeSeries, showRemaining = false) => (
    <View style={{ marginTop: spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={globalStyles.caption}>
          S{String(series.season_number).padStart(2, "0")} · E
          {String(series.episode_number).padStart(2, "0")}
        </Text>

        {showRemaining && series.remaining_episodes > 0 && (
          <Text style={[globalStyles.caption, { marginLeft: spacing.sm }]}>
            +{series.remaining_episodes}
          </Text>
        )}
      </View>

      <Text
        style={[globalStyles.text, { marginTop: spacing.xs }]}
        numberOfLines={1}
      >
        {series.episode_title || "Titolo non disponibile"}
      </Text>
    </View>
  );

  const renderCheckButton = (
    series: HomeSeries,
    watchStatus: HomeWatchStatus,
  ) => {
    const episodeKey = `${series.tmdb_id}-${series.season_number}-${series.episode_number}`;

    return (
      <HomeCheckButton
        loading={savingEpisode === episodeKey && successEpisode !== episodeKey}
        success={successEpisode === episodeKey}
        disabled={savingEpisode !== null}
        onPress={() => handleMarkWatched(series, watchStatus)}
      />
    );
  };

  const openEpisode = (series: HomeSeries) => {
    router.push({
      pathname: "/details/episode/[id]",
      params: {
        id: String(series.episode_tmdb_id),
        seriesId: String(series.tmdb_id),
        seasonNumber: String(series.season_number),
        episodeNumber: String(series.episode_number),
      },
    });
  };

  // Continua a guardare: lista verticale con immagine dell'episodio.
  const renderContinuingItem = (series: HomeSeries) => {
    const episodeKey = `${series.tmdb_id}-${series.season_number}-${series.episode_number}`;

    return (
      <AnimatedHomeItem
        key={series.tmdb_id}
        fading={fadingEpisode === episodeKey}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.surface,
          }}
        >
          <Pressable onPress={() => openEpisode(series)}>
            {renderPoster(series.still_path, 112, 64)}
          </Pressable>

          <View
            style={{
              flex: 1,
              minWidth: 0,
              marginLeft: spacing.md,
            }}
          >
            <Pressable
              onPress={() => openSeries(series.tmdb_id)}
              style={{
                alignSelf: "flex-start",
                borderWidth: 1,
                borderColor: colors.text,
                borderRadius: 21,
                paddingHorizontal: spacing.xs,
                paddingVertical: 0,
              }}
            >
              <Text style={[globalStyles.text]} numberOfLines={1}>
                {series.title}
              </Text>
            </Pressable>

            <Pressable onPress={() => openEpisode(series)}>
              {renderEpisodeInfo(series, true)}
            </Pressable>
          </View>

          {renderCheckButton(series, "continuing")}
        </View>
      </AnimatedHomeItem>
    );
  };

  // Card orizzontali: poster, informazioni episodio e spunta.
  const renderHorizontalItem = (
    series: HomeSeries,
    watchStatus: HomeWatchStatus,
  ) => {
    const episodeKey = `${series.tmdb_id}-${series.season_number}-${series.episode_number}`;

    return (
      <AnimatedHomeItem fading={fadingEpisode === episodeKey}>
        <MediaCard
          title={series.title}
          poster={
            series.poster_path
              ? `${TMDB_IMAGE_BASE_URL}${series.poster_path}`
              : null
          }
          horizontal
          onPress={() => openSeries(series.tmdb_id)}
          info={renderEpisodeInfo(series)}
          action={renderCheckButton(series, watchStatus)}
        />
      </AnimatedHomeItem>
    );
  };

  const getCalendarTimeLabel = (days: number): string => {
    if (days === 1) {
      return "Tra 1 giorno";
    }

    return `Tra ${days} giorni`;
  };

  const renderCalendarItem = (item: CalendarItem) => {
    return (
      <MediaCard
        title={item.title}
        poster={
          item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : null
        }
        horizontal
        onPress={() => openSeries(item.tmdb_id)}
        info={
          <View style={{ marginTop: spacing.xs }}>
            <Text style={globalStyles.caption}>
              S{String(item.season_number).padStart(2, "0")} · E
              {String(item.episode_number).padStart(2, "0")}
            </Text>

            <Text
              style={[
                globalStyles.text,
                {
                  marginTop: spacing.xs,
                  color: colors.primary,
                },
              ]}
              numberOfLines={1}
            >
              {getCalendarTimeLabel(item.days_until)}
            </Text>
          </View>
        }
      />
    );
  };

  const renderMovieItem = (movie: HomeMovie) => {
    const movieId = movie.tmdb_id;

    return (
      <AnimatedHomeItem fading={fadingMovie === movieId}>
        <MediaCard
          title={movie.title}
          poster={
            movie.poster_path
              ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}`
              : null
          }
          horizontal
          onPress={() => openMovie(movieId)}
          info={
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                color: colors.textSecondary,
                fontSize: 12,
              }}
            >
              {formatMovieReleaseDate(movie.release_date)}
            </Text>
          }
          action={
            <HomeCheckButton
              loading={savingMovie === movieId}
              success={successMovie === movieId}
              disabled={savingMovie !== null}
              onPress={() => handleMarkMovieWatched(movie)}
              accessibilityLabel="Segna il film come visto"
            />
          }
        />
      </AnimatedHomeItem>
    );
  };

  const renderSection = (
    title: string,
    items: HomeSeries[],
    watchStatus: HomeWatchStatus,
    horizontal: boolean,
  ) => {
    if (items.length === 0) {
      return null;
    }

    if (horizontal) {
      return (
        <HorizontalMediaList<HomeSeries>
          key={title}
          title={title}
          data={items}
          keyExtractor={(item) => String(item.tmdb_id)}
          renderItem={({ item }) => renderHorizontalItem(item, watchStatus)}
        />
      );
    }

    return (
      <View style={{ marginTop: spacing.xl }}>
        <Text style={globalStyles.sectionTitle}>{title}</Text>

        <View>{items.map(renderContinuingItem)}</View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={globalStyles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={globalStyles.container}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {renderSection(
        "Continua a guardare",
        data.continuing,
        "continuing",
        false,
      )}

      {renderSection(
        "Inizia a guardare",
        data.notStarted,
        "not_started_yet",
        true,
      )}

      {renderSection(
        "Da guardare più tardi",
        data.watchLater,
        "watch_later",
        true,
      )}

      {data.calendar.length > 0 && (
        <HorizontalMediaList<CalendarItem>
          title="Calendario"
          data={data.calendar}
          keyExtractor={(item) => String(item.tmdb_id)}
          renderItem={({ item }) => renderCalendarItem(item)}
        />
      )}

      {data.movies.length > 0 && (
        <HorizontalMediaList<HomeMovie>
          title="Film da guardare"
          data={data.movies}
          keyExtractor={(item) => String(item.tmdb_id)}
          renderItem={({ item }) => renderMovieItem(item)}
        />
      )}

      {data.continuing.length === 0 &&
        data.notStarted.length === 0 &&
        data.watchLater.length === 0 &&
        data.calendar.length === 0 &&
        data.movies.length === 0 && (
          <Text style={globalStyles.empty}>
            Non ci sono serie da visualizzare.
          </Text>
        )}
    </ScrollView>
  );
}
