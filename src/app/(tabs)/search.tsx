import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  searchMovie,
  searchTv,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";

import type {
  TMDBMovieSearchResult,
  TMDBTvSearchResult,
} from "@/types/tmdb";

import MediaCard from "@/components/MediaCard";
import { spacing } from "@/constants/theme";
import { colors, globalStyles } from "@/styles/global";
import { getMediaCardLayout } from "@/utils/mediaLayout";

type Filter = "all" | "series" | "movies";

type SearchItem = {
  id: number;
  title: string;
  poster: string | null;
  year: string;
  type: "series" | "movie";
};

export default function Search() {
  const insets = useSafeAreaInsets();

  const { width: screenWidth } = useWindowDimensions();
  const { gap, containerPadding } = getMediaCardLayout(
    screenWidth,
    false,
  );

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setResults([]);
      setError(null);
      return;
    }

    const timeout = setTimeout(() => {
      loadResults(trimmedQuery);
    }, 500);

    return () => clearTimeout(timeout);
  }, [query, filter]);

  async function loadResults(searchQuery: string) {
    try {
      setLoading(true);
      setError(null);

      let items: SearchItem[] = [];

      if (filter === "series") {
        const data = await searchTv(searchQuery);

        items = data.results.map((item: TMDBTvSearchResult) => ({
          id: item.id,
          title: item.name,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.first_air_date
            ? item.first_air_date.slice(0, 4)
            : "",
          type: "series",
        }));
      } else if (filter === "movies") {
        const data = await searchMovie(searchQuery);

        items = data.results.map((item: TMDBMovieSearchResult) => ({
          id: item.id,
          title: item.title,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.release_date
            ? item.release_date.slice(0, 4)
            : "",
          type: "movie",
        }));
      } else {
        const [seriesData, movieData] = await Promise.all([
          searchTv(searchQuery),
          searchMovie(searchQuery),
        ]);

        const seriesItems: SearchItem[] = seriesData.results.map((item) => ({
          id: item.id,
          title: item.name,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.first_air_date
            ? item.first_air_date.slice(0, 4)
            : "",
          type: "series",
        }));

        const movieItems: SearchItem[] = movieData.results.map((item) => ({
          id: item.id,
          title: item.title,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.release_date
            ? item.release_date.slice(0, 4)
            : "",
          type: "movie",
        }));

        items = [...seriesItems, ...movieItems];
      }

      setResults(items);
    } catch (e) {
      setError("Errore durante la ricerca.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={[
        globalStyles.container,
        {
          paddingTop: insets.top + 10,
          paddingHorizontal: containerPadding,
        },
      ]}
    >
      <Text style={globalStyles.screenTitle}>
        Search
      </Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Cerca..."
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        style={[
          globalStyles.searchInput,
          { marginTop: spacing.lg },
        ]}
      />

      <View style={globalStyles.filterRow}>
        {[
          { key: "all", label: "Tutti" },
          { key: "series", label: "Serie" },
          { key: "movies", label: "Film" },
        ].map((item) => {
          const active = filter === item.key;

          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key as Filter)}
              style={[
                globalStyles.filterButton,
                active && globalStyles.filterButtonActive,
              ]}
            >
              <Text
                style={[
                  globalStyles.filterText,
                  active && globalStyles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={{ marginBottom: 20 }}
        />
      )}

      {error && (
        <Text style={globalStyles.empty}>
          {error}
        </Text>
      )}

      {!loading && !error && query.trim() !== "" && results.length === 0 && (
        <Text style={globalStyles.empty}>
          Nessun risultato.
        </Text>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 65,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            columnGap: gap,
          }}
        >
          {results.map((item) => {
            const info =
              item.year !== "" ? (
                <Text style={globalStyles.caption}>
                  {item.year}
                </Text>
              ) : null;

            return (
              <MediaCard
                key={`${item.type}-${item.id}`}
                title={item.title}
                poster={item.poster}
                info={info}
                onPress={() => {
                  console.log(
                    "Selezionato:",
                    item.type,
                    item.id
                  );
                }}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}