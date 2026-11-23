import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HorizontalMediaList from "@/components/HorizontalMediaList";
import MediaCard from "@/components/MediaCard";
import { useTitleLanguage } from "@/contexts/LanguageContext";
import {
  getSavedMediaIds,
  saveMovieDetails,
  saveTvSeasonEpisodes,
  saveTvSeriesDetails,
} from "@/database";
import {
  getMovieDetails,
  getMovieExternalIds,
  getPopularMovies,
  getPopularTv,
  getTrendingMovies,
  getTrendingTv,
  getTvDetails,
  getTvExternalIds,
  getTvSeasonDetails,
  getUpcomingMovies,
  getUpcomingTv,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";
import { colors, globalStyles } from "@/styles/global";
import { Ionicons } from "@expo/vector-icons";

type DiscoverItem = {
  id: number;
  title: string;
  poster: string | null;
  year: string;
  releaseDate: string;
  type: "series" | "movie";
};

export default function Discover() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { titleLanguage } = useTitleLanguage();

  const [trending, setTrending] = useState<DiscoverItem[]>([]);
  const [popular, setPopular] = useState<DiscoverItem[]>([]);
  const [upcoming, setUpcoming] = useState<DiscoverItem[]>([]);

  const [savedMediaIds, setSavedMediaIds] = useState<{
    series: number[];
    movies: number[];
    watchlistSeries: number[];
    watchlistMovies: number[];
  }>({
    series: [],
    movies: [],
    watchlistSeries: [],
    watchlistMovies: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiscover();
  }, [titleLanguage]);

  async function loadDiscover() {
    try {
      setLoading(true);
      setError(null);

      const [
        trendingTv,
        trendingMovies,
        popularTv,
        popularMovies,
        upcomingTv,
        upcomingMovies,
        savedIds,
      ] = await Promise.all([
        getTrendingTv(titleLanguage),
        getTrendingMovies(titleLanguage),
        getPopularTv(titleLanguage),
        getPopularMovies(titleLanguage),
        getUpcomingTv(titleLanguage),
        getUpcomingMovies(titleLanguage),
        getSavedMediaIds(),
      ]);

      setTrending([
        ...trendingTv.results.map((item) => ({
          id: item.id,
          title: item.name,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.first_air_date?.slice(0, 4) ?? "",
          releaseDate: item.first_air_date ?? "",
          type: "series" as const,
        })),
        ...trendingMovies.results.map((item) => ({
          id: item.id,
          title: item.title,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.release_date?.slice(0, 4) ?? "",
          releaseDate: item.release_date ?? "",
          type: "movie" as const,
        })),
      ]);

      setPopular([
        ...popularTv.results.map((item) => ({
          id: item.id,
          title: item.name,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.first_air_date?.slice(0, 4) ?? "",
          releaseDate: item.first_air_date ?? "",
          type: "series" as const,
        })),
        ...popularMovies.results.map((item) => ({
          id: item.id,
          title: item.title,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.release_date?.slice(0, 4) ?? "",
          releaseDate: item.release_date ?? "",
          type: "movie" as const,
        })),
      ]);

      setUpcoming(
        [
          ...upcomingTv.results.map((item) => ({
            id: item.id,
            title: item.name,
            poster: item.poster_path
              ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
              : null,
            year: item.first_air_date?.slice(0, 4) ?? "",
            releaseDate: item.first_air_date ?? "",
            type: "series" as const,
          })),
          ...upcomingMovies.results.map((item) => ({
            id: item.id,
            title: item.title,
            poster: item.poster_path
              ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
              : null,
            year: item.release_date?.slice(0, 4) ?? "",
            releaseDate: item.release_date ?? "",
            type: "movie" as const,
          })),
        ].sort((a, b) => {
          if (!a.releaseDate) return 1;
          if (!b.releaseDate) return -1;
          return b.releaseDate.localeCompare(a.releaseDate);
        }),
      );

      setSavedMediaIds(savedIds);
    } catch {
      setError("Errore durante il caricamento dei contenuti.");
    } finally {
      setLoading(false);
    }
  }

  function openDetails(item: DiscoverItem) {
    if (item.type === "movie") {
      router.push({
        pathname: "/details/movie/[id]",
        params: { id: String(item.id) },
      });
    } else {
      router.push({
        pathname: "/details/series/[id]",
        params: { id: String(item.id) },
      });
    }
  }

  async function saveUpcomingItem(item: DiscoverItem) {
    try {
      if (item.type === "movie") {
        const [details, externalIds] = await Promise.all([
          getMovieDetails(item.id, titleLanguage),
          getMovieExternalIds(item.id),
        ]);

        await saveMovieDetails(details, {
          imdb_id: externalIds.imdb_id,
        });

        setSavedMediaIds((prev) => ({
          ...prev,
          movies: [...prev.movies, item.id],
          watchlistMovies: [...prev.watchlistMovies, item.id],
        }));
      } else {
        const [details, externalIds] = await Promise.all([
          getTvDetails(item.id, titleLanguage),
          getTvExternalIds(item.id),
        ]);

        await saveTvSeriesDetails(details, {
          tvdb_id: externalIds.tvdb_id,
          imdb_id: externalIds.imdb_id,
        });

        for (const season of details.seasons) {
          const seasonDetails = await getTvSeasonDetails(
            item.id,
            season.season_number,
            titleLanguage,
          );

          await saveTvSeasonEpisodes(item.id, seasonDetails);
        }

        setSavedMediaIds((prev) => ({
          ...prev,
          series: [...prev.series, item.id],
          watchlistSeries: [...prev.watchlistSeries, item.id],
        }));
      }
    } catch (error) {
      console.error("Errore durante il salvataggio del contenuto:", error);
    }
  }

  function openSection(section: "trending" | "popular") {
    router.push({
      pathname: "../discover/[section]",
      params: { section },
    });
  }

  function renderMediaItem(item: DiscoverItem) {
    return (
      <MediaCard
        title={item.title}
        poster={item.poster}
        info={
          item.year ? (
            <Text style={globalStyles.caption}>{item.year}</Text>
          ) : null
        }
        onPress={() => openDetails(item)}
      />
    );
  }

  function renderUpcomingAction(item: DiscoverItem) {
    const isSaved =
      item.type === "series"
        ? savedMediaIds.series.includes(item.id)
        : savedMediaIds.movies.includes(item.id);

    const isInWatchlist =
      item.type === "series"
        ? savedMediaIds.watchlistSeries.includes(item.id)
        : savedMediaIds.watchlistMovies.includes(item.id);

    if (isSaved && !isInWatchlist) {
      return null;
    }

    return (
      <Pressable
        onPress={() => {
          if (!isSaved) {
            saveUpcomingItem(item);
          }
        }}
        style={{
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
        }}
      >
        <Ionicons
          name={isInWatchlist ? "bookmark" : "bookmark-outline"}
          size={19}
          color={colors.text}
        />
      </Pressable>
    );
  }

  return (
    <View
      style={[
        globalStyles.container,
        {
          paddingTop: insets.top + 10,
          paddingHorizontal: 20,
        },
      ]}
    >
      <Text style={globalStyles.screenTitle}>Scopri</Text>

      {loading ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={{ marginTop: 30 }}
        />
      ) : error ? (
        <Text style={globalStyles.empty}>{error}</Text>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 30,
          }}
        >
          <HorizontalMediaList
            title="Di tendenza"
            data={trending}
            showMore
            onMorePress={() => openSection("trending")}
            renderItem={({ item }) => renderMediaItem(item)}
            keyExtractor={(item) => `${item.type}-${item.id}`}
          />

          <HorizontalMediaList
            title="Popolari"
            data={popular}
            showMore
            onMorePress={() => openSection("popular")}
            renderItem={({ item }) => renderMediaItem(item)}
            keyExtractor={(item) => `${item.type}-${item.id}`}
          />

          <HorizontalMediaList
            title="Attesi"
            data={upcoming}
            renderItem={({ item }) => (
              <MediaCard
                title={item.title}
                poster={item.poster}
                info={
                  item.year ? (
                    <Text style={globalStyles.caption}>{item.year}</Text>
                  ) : null
                }
                action={renderUpcomingAction(item)}
                onPress={() => openDetails(item)}
              />
            )}
            keyExtractor={(item) => `${item.type}-${item.id}`}
          />
        </ScrollView>
      )}
    </View>
  );
}
