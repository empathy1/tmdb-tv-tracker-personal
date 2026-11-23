import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";

import MediaCard from "@/components/MediaCard";
import { useTitleLanguage } from "@/contexts/LanguageContext";
import {
    getPopularMovies,
    getPopularTv,
    getTrendingMovies,
    getTrendingTv,
    TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";
import { colors, globalStyles } from "@/styles/global";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type DiscoverItem = {
  id: number;
  title: string;
  poster: string | null;
  year: string;
  type: "series" | "movie";
};

export default function DiscoverSectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { section } = useLocalSearchParams<{
    section: "trending" | "popular";
  }>();

  const [filter, setFilter] = useState<"all" | "movie" | "series">("all");

  const { titleLanguage } = useTitleLanguage();

  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSection();
  }, [section, titleLanguage]);

  async function loadSection() {
    try {
      setLoading(true);
      setError(null);

      const [tv, movies] =
        section === "trending"
          ? await Promise.all([
              getTrendingTv(titleLanguage),
              getTrendingMovies(titleLanguage),
            ])
          : await Promise.all([
              getPopularTv(titleLanguage),
              getPopularMovies(titleLanguage),
            ]);

      setItems([
        ...tv.results.map((item) => ({
          id: item.id,
          title: item.name,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.first_air_date?.slice(0, 4) ?? "",
          type: "series" as const,
        })),
        ...movies.results.map((item) => ({
          id: item.id,
          title: item.title,
          poster: item.poster_path
            ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
            : null,
          year: item.release_date?.slice(0, 4) ?? "",
          type: "movie" as const,
        })),
      ]);
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

  const filteredItems =
    filter === "all" ? items : items.filter((item) => item.type === filter);

  const title = section === "trending" ? "Di tendenza" : "Popolari";

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
      <Pressable
        onPress={() => router.back()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 17,
        }}
      >
        <Ionicons name="chevron-back" size={18} color={colors.text} />

        <Text style={[globalStyles.screenTitle, { marginLeft: 8 }]}>
          {title}
        </Text>
      </Pressable>

      <View style={globalStyles.filterRow}>
        {[
          { label: "Tutti", value: "all" },
          { label: "Film", value: "movie" },
          { label: "Serie TV", value: "series" },
        ].map((item) => (
          <Pressable
            key={item.value}
            onPress={() => setFilter(item.value as "all" | "movie" | "series")}
            style={[
              globalStyles.filterButton,
              filter === item.value && globalStyles.filterButtonActive,
            ]}
          >
            <Text
              style={[
                globalStyles.filterText,
                filter === item.value && globalStyles.filterTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={{ marginTop: 30 }}
        />
      ) : error ? (
        <Text style={globalStyles.empty}>{error}</Text>
      ) : (
        <FlatList
          data={filteredItems}
          numColumns={3}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
          columnWrapperStyle={{
            justifyContent: "space-between",
          }}
          renderItem={({ item }) => (
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
          )}
          ListEmptyComponent={
            <Text style={globalStyles.empty}>
              Nessun contenuto disponibile.
            </Text>
          }
        />
      )}
    </View>
  );
}
