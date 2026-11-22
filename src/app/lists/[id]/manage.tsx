import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTitleLanguage } from "@/contexts/LanguageContext";
import {
  addHubListItem,
  addMovieFavorite,
  addTvSeriesFavorite,
  getFavoriteMovies,
  getFavoriteSeries,
  getHubListItems,
  getHubLists,
  removeHubListItem,
  removeMovieFavorite,
  removeTvSeriesFavorite,
  type HubList,
} from "@/database";
import {
  getTrendingMovies,
  getTrendingTv,
  searchMovie,
  searchTv,
  TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";
import { colors, globalStyles } from "@/styles/global";
import { Image } from "expo-image";

type Filter = "all" | "series" | "movies";
type SearchItem = {
  id: number;
  title: string;
  poster: string | null;
  year: string;
  type: "series" | "movie";
};

export default function ManageListScreen() {
  const { id, type } = useLocalSearchParams<{
    id: string;
    type?: "series" | "movie";
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { titleLanguage } = useTitleLanguage();

  const [results, setResults] = useState<SearchItem[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [list, setList] = useState<HubList | null>(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const activeFilter: Filter =
    id === "favorites" ? (type === "series" ? "series" : "movies") : filter;
  const [listItemIds, setListItemIds] = useState<Set<string>>(new Set());

  const [updatingItemIds, setUpdatingItemIds] = useState<Set<string>>(
    new Set(),
  );

  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadResults() {
      try {
        setResultsLoading(true);
        setError(null);

        const searchQuery = query.trim();
        let items: SearchItem[] = [];

        if (searchQuery) {
          if (activeFilter === "series" || activeFilter === "all") {
            const data = await searchTv(searchQuery, titleLanguage);

            items.push(
              ...data.results.map((item) => ({
                id: item.id,
                title: item.name,
                poster: item.poster_path
                  ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                  : null,
                year: item.first_air_date?.slice(0, 4) ?? "",
                type: "series" as const,
              })),
            );
          }

          if (activeFilter === "movies" || activeFilter === "all") {
            const data = await searchMovie(searchQuery, titleLanguage);

            items.push(
              ...data.results.map((item) => ({
                id: item.id,
                title: item.title,
                poster: item.poster_path
                  ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                  : null,
                year: item.release_date?.slice(0, 4) ?? "",
                type: "movie" as const,
              })),
            );
          }
        } else {
          if (activeFilter === "series" || activeFilter === "all") {
            const data = await getTrendingTv(titleLanguage);

            items.push(
              ...data.results.map((item) => ({
                id: item.id,
                title: item.name,
                poster: item.poster_path
                  ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                  : null,
                year: item.first_air_date?.slice(0, 4) ?? "",
                type: "series" as const,
              })),
            );
          }

          if (activeFilter === "movies" || activeFilter === "all") {
            const data = await getTrendingMovies(titleLanguage);

            items.push(
              ...data.results.map((item) => ({
                id: item.id,
                title: item.title,
                poster: item.poster_path
                  ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                  : null,
                year: item.release_date?.slice(0, 4) ?? "",
                type: "movie" as const,
              })),
            );
          }
        }

        if (isActive) {
          setResults(items);
        }
      } catch (err) {
        console.error("Errore durante il caricamento dei contenuti:", err);

        if (isActive) {
          setError("Impossibile caricare i contenuti.");
          setResults([]);
        }
      } finally {
        if (isActive) {
          setResultsLoading(false);
          setRefreshing(false);
        }
      }
    }

    const timeout = setTimeout(loadResults, query.trim() ? 400 : 0);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [query, activeFilter, titleLanguage, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadList() {
        try {
          if (id === "favorites") {
            if (type === "series") {
              const favorites = await getFavoriteSeries();

              if (isActive) {
                setListItemIds(
                  new Set(favorites.map((item) => `series-${item.tmdb_id}`)),
                );
              }
            } else {
              const favorites = await getFavoriteMovies();

              if (isActive) {
                setListItemIds(
                  new Set(favorites.map((item) => `movie-${item.tmdb_id}`)),
                );
              }
            }

            if (isActive) {
              setList(null);
            }
          } else {
            const hubLists = await getHubLists();
            const selectedList = hubLists.find((item) => item.list_id === id);

            if (selectedList) {
              const items = await getHubListItems(id);

              if (isActive) {
                setListItemIds(
                  new Set(
                    items.map((item) => `${item.item_type}-${item.tmdb_id}`),
                  ),
                );
              }
            }

            if (isActive) {
              setList(selectedList ?? null);
            }
          }
        } catch (error) {
          console.error("Errore durante il caricamento della lista:", error);
        } finally {
          if (isActive) {
            setLoading(false);
          }
        }
      }

      loadList();

      return () => {
        isActive = false;
      };
    }, [id, type, refreshKey]),
  );

  async function toggleListItem(item: SearchItem) {
    const key = `${item.type}-${item.id}`;

    if (updatingItemIds.has(key)) return;

    setUpdatingItemIds((current) => new Set(current).add(key));

    try {
      if (listItemIds.has(key)) {
        if (id === "favorites") {
          if (type === "series") {
            await removeTvSeriesFavorite(item.id);
          } else {
            await removeMovieFavorite(item.id);
          }
        } else {
          await removeHubListItem(id, item.type, item.id);
        }
      } else {
        if (id === "favorites") {
          const hubLists = await getHubLists();
          const archiveList = hubLists.find((list) => list.name === "Archivio");

          if (!archiveList) {
            throw new Error("Lista Archivio non trovata");
          }

          await addHubListItem(
            archiveList.list_id,
            item.type,
            item.id,
            titleLanguage,
          );

          if (type === "series") {
            await addTvSeriesFavorite(item.id, item.title);
          } else {
            await addMovieFavorite(item.id, item.title);
          }
        } else {
          await addHubListItem(id, item.type, item.id, titleLanguage);
        }
      }

      setListItemIds((current) => {
        const updated = new Set(current);

        if (updated.has(key)) {
          updated.delete(key);
        } else {
          updated.add(key);
        }

        return updated;
      });
    } catch (error) {
      console.error("Errore durante la modifica della lista:", error);
    } finally {
      setUpdatingItemIds((current) => {
        const updated = new Set(current);
        updated.delete(key);
        return updated;
      });
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
        </Pressable>

        <Text style={[globalStyles.screenTitle, { flex: 1 }]}>
          Aggiungi/Rimuovi elementi da{" "}
          {id === "favorites"
            ? type === "series"
              ? "Serie preferite"
              : "Film preferiti"
            : (list?.name ?? "Lista non trovata")}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          {/*<Text style={globalStyles.caption}>
            Lista: {list?.name ?? "Lista non trovata"}
          </Text>*/}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Cerca..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            style={[globalStyles.searchInput, { marginTop: 16 }]}
          />
          {/* Filtri */}
          {id !== "favorites" && (
            <View style={globalStyles.filterRow}>
              {[
                { key: "all", label: "Tutti" },
                { key: "series", label: "Serie TV" },
                { key: "movies", label: "Film" },
              ].map((item) => {
                const active = activeFilter === item.key;

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
          )}

          {resultsLoading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 24 }}
            />
          ) : error ? (
            <Text style={globalStyles.empty}>{error}</Text>
          ) : results.length === 0 ? (
            <Text style={globalStyles.empty}>Nessun contenuto trovato.</Text>
          ) : (
            <ScrollView
              style={{ marginTop: 20, flex: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
            >
              {results.map((item) => (
                <View
                  key={`${item.type}-${item.id}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Pressable
                    onPress={() =>
                      router.push(`/details/${item.type}/${item.id}`)
                    }
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    {item.poster ? (
                      <Image
                        source={{ uri: item.poster }}
                        style={{ width: 55, height: 82, borderRadius: 6 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 55,
                          height: 82,
                          borderRadius: 6,
                          backgroundColor: colors.surface,
                        }}
                      />
                    )}

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={globalStyles.text}>{item.title}</Text>
                      <Text style={globalStyles.caption}>
                        {item.type === "series" ? "Serie TV" : "Film"}
                        {item.year ? ` · ${item.year}` : ""}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Pulsanti Aggiungi/Rimuovi */}
                  <Pressable
                    onPress={() => toggleListItem(item)}
                    disabled={updatingItemIds.has(`${item.type}-${item.id}`)}
                    style={{
                      width: 33,
                      height: 33,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.continuing,
                      backgroundColor: "transparent",
                    }}
                  >
                    {updatingItemIds.has(`${item.type}-${item.id}`) ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.continuing}
                      />
                    ) : (
                      <Ionicons
                        name={
                          listItemIds.has(`${item.type}-${item.id}`)
                            ? "remove"
                            : "add"
                        }
                        size={15}
                        color={colors.continuing}
                      />
                    )}
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}
