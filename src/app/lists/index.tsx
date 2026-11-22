import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import AddMediaButton from "@/components/AddMediaButton";
import ListCard from "@/components/lists/ListCard";
import { spacing } from "@/constants/theme";
import { useTitleLanguage } from "@/contexts/LanguageContext";
import {
  addHubListItem,
  createHubList,
  deleteHubList,
  getHubListItems,
  getHubLists,
  removeHubListItem,
  renameHubList,
  type HubList,
  type HubListItem,
} from "@/database";
import { colors, globalStyles } from "@/styles/global";
import { getMediaCardLayout } from "@/utils/mediaLayout";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ListWithItems = HubList & {
  items: HubListItem[];
};

function sortHubLists(lists: ListWithItems[]): ListWithItems[] {
  const automaticOrder = ["Archivio", "Droppate", "Watchlist", "Archiviati"];

  return [...lists].sort((a, b) => {
    const indexA = automaticOrder.indexOf(a.name);
    const indexB = automaticOrder.indexOf(b.name);

    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return -1;
    if (indexB === -1) return 1;

    return indexA - indexB;
  });
}

export default function MyListsScreen() {
  const [lists, setLists] = useState<ListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const { mode, itemType, tmdbId } = useLocalSearchParams<{
    mode?: string;
    itemType?: "series" | "movie";
    tmdbId?: string;
  }>();

  const isSelectingMedia = mode === "select" && !!itemType && !!tmdbId;

  const { titleLanguage } = useTitleLanguage();

  const insets = useSafeAreaInsets();
  const addListSheetRef = useRef<BottomSheetModal>(null);
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [selectedList, setSelectedList] = useState<ListWithItems | null>(null);
  const listOptionsSheetRef = useRef<BottomSheetModal>(null);
  const [renameListName, setRenameListName] = useState("");
  const renameListSheetRef = useRef<BottomSheetModal>(null);
  const [isRenamingList, setIsRenamingList] = useState(false);

  const { width: screenWidth } = useWindowDimensions();
  const { gap, containerPadding } = getMediaCardLayout(screenWidth, false);

  async function handleCreateList() {
    const name = newListName.trim();

    if (!name) {
      Alert.alert("Nome mancante", "Inserisci un nome per la lista.");
      return;
    }

    try {
      setIsCreatingList(true);

      await createHubList(name);

      const hubLists = await getHubLists();

      const listsWithItems = await Promise.all(
        hubLists.map(async (list) => ({
          ...list,
          items: await getHubListItems(list.list_id),
        })),
      );

      setLists(sortHubLists(listsWithItems));
      setNewListName("");
      addListSheetRef.current?.dismiss();
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error ? error.message : "Impossibile creare la lista.",
      );
    } finally {
      setIsCreatingList(false);
    }
  }

  async function handleRenameList() {
    if (!selectedList) return;

    const name = renameListName.trim();

    if (!name) {
      Alert.alert("Nome mancante", "Inserisci un nome per la lista.");
      return;
    }

    try {
      setIsRenamingList(true);

      await renameHubList(selectedList.list_id, name);

      const hubLists = await getHubLists();

      const listsWithItems = await Promise.all(
        hubLists.map(async (list) => ({
          ...list,
          items: await getHubListItems(list.list_id),
        })),
      );

      setLists(sortHubLists(listsWithItems));
      renameListSheetRef.current?.dismiss();
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error
          ? error.message
          : "Impossibile rinominare la lista.",
      );
    } finally {
      setIsRenamingList(false);
    }
  }

  function handleDeleteList() {
    if (!selectedList) return;

    Alert.alert(
      "Elimina lista",
      `Vuoi eliminare la lista "${selectedList.name}"? Questa operazione non può essere annullata.`,
      [
        {
          text: "Annulla",
          style: "cancel",
        },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteHubList(selectedList.list_id);

              const hubLists = await getHubLists();

              const listsWithItems = await Promise.all(
                hubLists.map(async (list) => ({
                  ...list,
                  items: await getHubListItems(list.list_id),
                })),
              );

              setLists(sortHubLists(listsWithItems));
              setSelectedList(null);
            } catch (error) {
              Alert.alert(
                "Errore",
                error instanceof Error
                  ? error.message
                  : "Impossibile eliminare la lista.",
              );
            }
          },
        },
      ],
    );
  }

  const renderBackdrop = useCallback(
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

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadLists() {
        try {
          setLoading(true);

          const hubLists = await getHubLists();

          const listsWithItems = await Promise.all(
            hubLists.map(async (list) => ({
              ...list,
              items: await getHubListItems(list.list_id),
            })),
          );

          if (isActive) {
            setLists(sortHubLists(listsWithItems));
          }
        } catch (error) {
          console.error("Errore durante il caricamento delle liste:", error);
        } finally {
          if (isActive) {
            setLoading(false);
          }
        }
      }

      loadLists();

      return () => {
        isActive = false;
      };
    }, []),
  );

  async function handleToggleList(list: ListWithItems) {
    if (!itemType || !tmdbId) return;

    const mediaId = Number(tmdbId);

    const isAlreadyInList = list.items.some(
      (item) => item.item_type === itemType && item.tmdb_id === mediaId,
    );

    try {
      if (isAlreadyInList) {
        await removeHubListItem(list.list_id, itemType, mediaId);
      } else {
        await addHubListItem(list.list_id, itemType, mediaId, titleLanguage);
      }

      const updatedItems = await getHubListItems(list.list_id);

      setLists((currentLists) =>
        currentLists.map((currentList) =>
          currentList.list_id === list.list_id
            ? {
                ...currentList,
                items: updatedItems,
                item_count: updatedItems.length,
              }
            : currentList,
        ),
      );
    } catch {
      Alert.alert("Errore", "Non è stato possibile aggiornare la lista.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: containerPadding,
          paddingTop: insets.top + 16,
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

          <Text style={globalStyles.screenTitle}>Le mie liste</Text>
        </View>

        <AddMediaButton
          label="+ Aggiungi una nuova lista"
          loading={false}
          onPress={() => {
            setNewListName("");
            addListSheetRef.current?.present();
          }}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: containerPadding,
          paddingTop: 8,
          paddingBottom: 16,
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          lists.map((list) => (
            <ListCard
              key={list.list_id}
              list={list}
              selectionMode={isSelectingMedia}
              isSelected={
                !!itemType &&
                !!tmdbId &&
                list.items.some(
                  (item) =>
                    item.item_type === itemType &&
                    item.tmdb_id === Number(tmdbId),
                )
              }
              onToggleSelect={() => handleToggleList(list)}
              onPress={() => {
                if (!isSelectingMedia) {
                  router.push({
                    pathname: "../lists/[id]",
                    params: { id: list.list_id },
                  });
                }
              }}
              onMenuPress={() => {
                setSelectedList(list);
                listOptionsSheetRef.current?.present();
              }}
            />
          ))
        )}
      </ScrollView>

      {/* Nuova lista */}
      <BottomSheetModal
        ref={addListSheetRef}
        index={0}
        snapPoints={["35%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={{ padding: 16 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              marginBottom: 20,
            }}
          >
            Nuova lista
          </Text>

          <BottomSheetTextInput
            value={newListName}
            onChangeText={setNewListName}
            placeholder="Nome della lista"
            placeholderTextColor={colors.textSecondary}
            style={{
              color: colors.text,
              backgroundColor: colors.surfaceLight,
              borderRadius: 8,
              padding: 14,
              fontSize: 16,
              marginBottom: spacing.xl,
            }}
          />
          <AddMediaButton
            label="Crea lista"
            loading={isCreatingList}
            onPress={handleCreateList}
          />
        </BottomSheetView>
      </BottomSheetModal>

      {/* Opzioni della lista */}
      <BottomSheetModal
        ref={listOptionsSheetRef}
        index={0}
        snapPoints={["25%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={{ paddingHorizontal: 16 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              marginBottom: 16,
            }}
          >
            {selectedList?.name}
          </Text>
          <Pressable
            onPress={() => {
              setRenameListName(selectedList?.name ?? "");
              listOptionsSheetRef.current?.dismiss();
              renameListSheetRef.current?.present();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 50,
              borderBottomWidth: 1,
              borderBottomColor: colors.background,
            }}
          >
            <Ionicons
              name="pencil-outline"
              size={22}
              color={colors.text}
              style={{ width: 38 }}
            />
            <Text style={{ color: colors.text, fontSize: 16 }}>Rinomina</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              listOptionsSheetRef.current?.dismiss();
              handleDeleteList();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              minHeight: 50,
            }}
          >
            <Ionicons
              name="trash-outline"
              size={22}
              color="#FF6B6B"
              style={{ width: 38 }}
            />
            <Text style={{ color: "#FF6B6B", fontSize: 16 }}>Elimina</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>

      {/* Rinomina lista */}
      <BottomSheetModal
        ref={renameListSheetRef}
        index={0}
        snapPoints={["35%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={{ padding: 16 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              marginBottom: 20,
            }}
          >
            Rinomina lista
          </Text>

          <BottomSheetTextInput
            value={renameListName}
            onChangeText={setRenameListName}
            placeholder="Nome della lista"
            placeholderTextColor={colors.textSecondary}
            style={{
              color: colors.text,
              backgroundColor: colors.surfaceLight,
              borderRadius: 8,
              padding: 14,
              fontSize: 16,
              marginBottom: spacing.xl,
            }}
          />
          <AddMediaButton
            label="Salva modifiche"
            loading={isRenamingList}
            onPress={handleRenameList}
          />
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}
