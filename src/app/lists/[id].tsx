import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
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

import AddMediaButton from "@/components/AddMediaButton";
import MediaCard from "@/components/MediaCard";
import {
  getHubListItems,
  getHubLists,
  type HubList,
  type HubListItem,
} from "@/database";
import { TMDB_IMAGE_BASE_URL } from "@/services/tmdb";
import { colors, globalStyles } from "@/styles/global";
import { getMediaCardLayout } from "@/utils/mediaLayout";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [list, setList] = useState<HubList | null>(null);
  const [items, setItems] = useState<HubListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { width: screenWidth } = useWindowDimensions();
  const { gap, containerPadding } = getMediaCardLayout(screenWidth, false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "series" | "movie">(
    "all",
  );

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [productionStatusFilters, setProductionStatusFilters] = useState<
    string[]
  >([]);

  const [movieWatchFilter, setMovieWatchFilter] = useState<
    "all" | "watched" | "unwatched"
  >("all");

  const [sortBy, setSortBy] = useState<
    | "title_asc"
    | "title_desc"
    | "created_at_desc"
    | "created_at_asc"
    | "release_date_desc"
    | "release_date_asc"
  >("title_asc");

  const filtersSheetRef = useRef<BottomSheetModal>(null);
  const sortSheetRef = useRef<BottomSheetModal>(null);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadList() {
        try {
          setLoading(true);

          const hubLists = await getHubLists();
          const selectedList = hubLists.find((item) => item.list_id === id);

          const listItems = await getHubListItems(id);

          if (isActive) {
            setList(selectedList ?? null);
            setItems(listItems);
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
    }, [id]),
  );

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.title
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());

    const matchesType = typeFilter === "all" || item.item_type === typeFilter;

    const matchesSeriesStatus =
      statusFilters.length === 0 ||
      statusFilters.includes(item.watch_status ?? "");

    const matchesProductionStatus =
      productionStatusFilters.length === 0 ||
      productionStatusFilters.includes(item.status ?? "");

    const hasSeriesStatusFilters = statusFilters.length > 0;
    const hasProductionStatusFilters = productionStatusFilters.length > 0;

    const matchesSeriesFilters =
      item.item_type === "movie" ||
      (!hasSeriesStatusFilters && !hasProductionStatusFilters) ||
      (hasSeriesStatusFilters && matchesSeriesStatus) ||
      (hasProductionStatusFilters && matchesProductionStatus);

    const matchesMovieWatch =
      item.item_type === "series" ||
      movieWatchFilter === "all" ||
      (movieWatchFilter === "watched" && item.is_watched === 1) ||
      (movieWatchFilter === "unwatched" && item.is_watched === 0);

    return (
      matchesSearch && matchesType && matchesMovieWatch && matchesSeriesFilters
    );
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case "title_asc":
        return a.title.localeCompare(b.title, "it");

      case "title_desc":
        return b.title.localeCompare(a.title, "it");

      case "created_at_desc":
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

      case "created_at_asc":
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      case "release_date_desc": {
        const dateA =
          a.item_type === "series" ? a.first_air_date : a.release_date;
        const dateB =
          b.item_type === "series" ? b.first_air_date : b.release_date;

        if (!dateA) return 1;
        if (!dateB) return -1;

        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }

      case "release_date_asc": {
        const dateA =
          a.item_type === "series" ? a.first_air_date : a.release_date;
        const dateB =
          b.item_type === "series" ? b.first_air_date : b.release_date;

        if (!dateA) return 1;
        if (!dateB) return -1;

        return new Date(dateA).getTime() - new Date(dateB).getTime();
      }

      default:
        return 0;
    }
  });

  const statusLabels: Record<string, string> = {
    not_started_yet: "Da iniziare",
    continuing: "In corso",
    up_to_date: "Completata",
    stopped: "Interrotta",
    watch_later: "Da guardare più tardi",
  };

  const productionStatusLabels: Record<string, string> = {
    "Returning Series": "In programmazione",
    Planned: "Pianificata",
    "In Production": "In produzione",
    Ended: "Terminata",
    Canceled: "Cancellata",
    Pilot: "Pilot",
  };

  function resetFilters() {
    setTypeFilter("all");
    setStatusFilters([]);
    setProductionStatusFilters([]);
    setMovieWatchFilter("all");
    setSearchQuery("");
    setSortBy("title_asc");
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingHorizontal: containerPadding,
          paddingTop: insets.top + 16,
          paddingBottom: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{ marginRight: 12 }}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </Pressable>

          <Text style={globalStyles.screenTitle}>{list?.name ?? "Lista"}</Text>
        </View>

        {/* Pulsante Add/Remove */}
        <View style={{ marginBottom: 16 }}>
          <AddMediaButton
            label="Aggiungi/Rimuovi elementi"
            loading={false}
            onPress={() =>
              router.push({
                pathname: "/lists/[id]/manage",
                params: { id },
              })
            }
          />
        </View>

        {/* Search bar */}
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Cerca nella lista..."
          placeholderTextColor={colors.textSecondary}
          style={{
            backgroundColor: colors.surface,
            color: colors.text,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 16,
            marginTop: -20,
          }}
        />

        {/* Ordinamento */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={resetFilters}>
              <Ionicons name="refresh-outline" size={18} color={colors.text} />
            </Pressable>

            <Pressable onPress={() => filtersSheetRef.current?.present()}>
              <Ionicons name="options-outline" size={18} color={colors.text} />
            </Pressable>

            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                Ordina per
              </Text>

              <Pressable
                onPress={() => sortSheetRef.current?.present()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13 }}>
                  {sortBy === "title_asc"
                    ? "Titolo (A–Z)"
                    : sortBy === "title_desc"
                      ? "Titolo (Z–A)"
                      : sortBy === "created_at_desc"
                        ? "Data aggiunta (più recenti)"
                        : sortBy === "created_at_asc"
                          ? "Data aggiunta (meno recenti)"
                          : sortBy === "release_date_desc"
                            ? "Data di uscita (più recenti)"
                            : "Data di uscita (meno recenti)"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {filteredItems.length}{" "}
            {filteredItems.length === 1 ? "item" : "items"}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: gap,
                marginTop: 16,
              }}
            >
              {sortedItems.map((item) => (
                <MediaCard
                  key={`${item.item_type}-${item.tmdb_id}`}
                  title={item.title}
                  poster={
                    item.poster_path
                      ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                      : null
                  }
                  onPress={() => {
                    router.push({
                      pathname:
                        item.item_type === "movie"
                          ? "/details/movie/[id]"
                          : "/details/series/[id]",
                      params: { id: String(item.tmdb_id) },
                    });
                  }}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {(statusFilters.length > 0 || productionStatusFilters.length > 0) && (
        <View
          style={{
            backgroundColor: colors.surface,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {statusFilters.map((status) => (
            <Pressable
              key={status}
              onPress={() =>
                setStatusFilters((prev) =>
                  prev.filter((item) => item !== status),
                )
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: colors.background,
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {statusLabels[status]}
              </Text>

              <Ionicons name="close" size={14} color={colors.textSecondary} />
            </Pressable>
          ))}

          {productionStatusFilters.map((status) => (
            <Pressable
              key={`production-${status}`}
              onPress={() =>
                setProductionStatusFilters((prev) =>
                  prev.filter((item) => item !== status),
                )
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: colors.background,
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 12 }}>
                {productionStatusLabels[status]}
              </Text>

              <Ionicons name="close" size={14} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      <BottomSheetModal
        ref={filtersSheetRef}
        snapPoints={["70%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
      >
        <BottomSheetView style={{ padding: 20 }}>
          {/* Filtro Tipologia */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              Tipologia
            </Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { label: "Tutti", value: "all" },
                { label: "Serie TV", value: "series" },
                { label: "Film", value: "movie" },
              ].map((filter) => {
                const selected = typeFilter === filter.value;

                return (
                  <Pressable
                    key={filter.value}
                    onPress={() =>
                      setTypeFilter(filter.value as "all" | "series" | "movie")
                    }
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.background,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.background : colors.text,
                        fontWeight: "600",
                      }}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Filtro Stato di visione della serie */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              Stato di visione delle serie
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                { label: "Da iniziare", value: "not_started_yet" },
                { label: "In corso", value: "continuing" },
                { label: "Completata", value: "up_to_date" },
                { label: "Da guardare più tardi", value: "watch_later" },
                { label: "Interrotta", value: "stopped" },
              ].map((filter) => {
                const selected = statusFilters.includes(filter.value);

                return (
                  <Pressable
                    key={filter.value}
                    onPress={() =>
                      setStatusFilters((prev) =>
                        prev.includes(filter.value)
                          ? prev.filter((status) => status !== filter.value)
                          : [...prev, filter.value],
                      )
                    }
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.background,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.background : colors.text,
                        fontWeight: "600",
                        fontSize: 12,
                      }}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Filtro Stato Produzione delle serie */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              Stato di produzione delle serie
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                { label: "In programmazione", value: "Returning Series" },
                { label: "Pianificata", value: "Planned" },
                { label: "In produzione", value: "In Production" },
                { label: "Terminata", value: "Ended" },
                { label: "Cancellata", value: "Canceled" },
                { label: "Pilot", value: "Pilot" },
              ].map((filter) => {
                const selected = productionStatusFilters.includes(filter.value);

                return (
                  <Pressable
                    key={filter.value}
                    onPress={() =>
                      setProductionStatusFilters((prev) =>
                        prev.includes(filter.value)
                          ? prev.filter((status) => status !== filter.value)
                          : [...prev, filter.value],
                      )
                    }
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.background,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.background : colors.text,
                        fontWeight: "600",
                        fontSize: 12,
                      }}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Filtro visione film */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              Stato dei film
            </Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { label: "Tutti", value: "all" },
                { label: "Visto", value: "watched" },
                { label: "Non visto", value: "unwatched" },
              ].map((filter) => {
                const selected = movieWatchFilter === filter.value;

                return (
                  <Pressable
                    key={filter.value}
                    onPress={() =>
                      setMovieWatchFilter(
                        filter.value as "all" | "watched" | "unwatched",
                      )
                    }
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor: selected
                        ? colors.primary
                        : colors.background,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.background : colors.text,
                        fontWeight: "600",
                        fontSize: 12,
                      }}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Ordinamento BS */}
      <BottomSheetModal
        ref={sortSheetRef}
        snapPoints={["35%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            pressBehavior="close"
          />
        )}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
      >
        <BottomSheetView style={{ padding: 20 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "700",
              marginBottom: 20,
            }}
          >
            Ordina per
          </Text>

          {[
            { label: "Titolo (A–Z)", value: "title_asc" },
            { label: "Titolo (Z–A)", value: "title_desc" },
            { label: "Data aggiunta (più recenti)", value: "created_at_desc" },
            { label: "Data aggiunta (meno recenti)", value: "created_at_asc" },
            {
              label: "Data di uscita (più recenti)",
              value: "release_date_desc",
            },
            {
              label: "Data di uscita (meno recenti)",
              value: "release_date_asc",
            },
          ].map((option) => {
            const selected = sortBy === option.value;

            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setSortBy(
                    option.value as
                      | "title_asc"
                      | "title_desc"
                      | "created_at_desc"
                      | "created_at_asc"
                      | "release_date_desc"
                      | "release_date_asc",
                  );
                  sortSheetRef.current?.dismiss();
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.background,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15 }}>
                  {option.label}
                </Text>

                {selected && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </Pressable>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}
