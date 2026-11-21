import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getHubLists, type HubList } from "@/database";
import { colors, globalStyles } from "@/styles/global";

export default function ManageListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [list, setList] = useState<HubList | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function loadList() {
        try {
          const hubLists = await getHubLists();
          const selectedList = hubLists.find((item) => item.list_id === id);

          if (isActive) {
            setList(selectedList ?? null);
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
          Aggiungi/Rimuovi elementi
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
          Lista: {list?.name ?? "Lista non trovata"}
        </Text>
      )}
    </View>
  );
}
