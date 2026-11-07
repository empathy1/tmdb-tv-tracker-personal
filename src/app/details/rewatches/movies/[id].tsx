import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";
import {
    deleteMovieRewatch,
    getMovieRewatches,
    updateMovieRewatch,
} from "@/database";
import { getMovieDetails } from "@/services/tmdb";
import { colors, globalStyles } from "@/styles/global";

type RewatchHistory = Awaited<ReturnType<typeof getMovieRewatches>>;

export default function MovieRewatchHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [rewatches, setRewatches] = useState<RewatchHistory>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        setLoading(true);
        setError(null);

        const movieId = Number(id);

        if (!Number.isFinite(movieId) || movieId <= 0) {
          throw new Error("Film non valido.");
        }

        const [details, history] = await Promise.all([
          getMovieDetails(movieId),
          getMovieRewatches(movieId),
        ]);

        if (!active) return;

        setTitle(details.title);
        setRewatches(history);
      } catch (err) {
        console.error("Errore caricando lo storico dei rewatch:", err);

        if (active) {
          setError("Impossibile caricare lo storico dei rewatch.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [id]);

  function formatWatchedAt(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const formattedDate = date.toLocaleDateString("it-IT");

    if (!value.includes("T")) {
      return formattedDate;
    }

    const formattedTime = date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    return `${formattedDate} · ${formattedTime}`;
  }

  async function refreshRewatches() {
    const movieId = Number(id);

    if (!Number.isFinite(movieId) || movieId <= 0) {
      return;
    }

    const history = await getMovieRewatches(movieId);
    setRewatches(history);
  }

  function handleEditRewatch(rewatchId: number, watchedAt: string) {
    const originalDate = new Date(watchedAt);

    if (Number.isNaN(originalDate.getTime())) {
      Alert.alert(
        "Data non valida",
        "Non è possibile modificare la data di questo rewatch.",
      );
      return;
    }

    const now = new Date();

    DateTimePickerAndroid.open({
      value: originalDate,
      mode: "date",
      maximumDate: now,
      onValueChange: (_event, selectedDate) => {
        if (!selectedDate) {
          return;
        }

        const updatedDate = new Date(originalDate);

        updatedDate.setFullYear(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
        );

        DateTimePickerAndroid.open({
          value: updatedDate,
          mode: "time",
          is24Hour: true,
          onValueChange: (_event, selectedTime) => {
            if (!selectedTime) {
              return;
            }

            const finalDate = new Date(updatedDate);

            finalDate.setHours(
              selectedTime.getHours(),
              selectedTime.getMinutes(),
              0,
              0,
            );

            if (finalDate.getTime() > Date.now()) {
              Alert.alert(
                "Data non valida",
                "La data del rewatch non può essere nel futuro.",
              );
              return;
            }

            void (async () => {
              try {
                await updateMovieRewatch(rewatchId, finalDate.toISOString());

                await refreshRewatches();
              } catch (error) {
                console.error("Errore modificando il rewatch:", error);

                Alert.alert(
                  "Errore",
                  "Impossibile modificare la data del rewatch.",
                );
              }
            })();
          },
        });
      },
    });
  }

  function handleDeleteRewatch(rewatchId: number) {
    Alert.alert(
      "Eliminare il rewatch?",
      "Verrà eliminata soltanto questa registrazione. Le altre visioni resteranno invariate.",
      [
        {
          text: "Annulla",
          style: "cancel",
        },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteMovieRewatch(rewatchId);
                await refreshRewatches();
              } catch (error) {
                console.error("Errore eliminando il rewatch:", error);

                Alert.alert("Errore", "Impossibile eliminare il rewatch.");
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
      }}
    >
      <Stack.Screen
        options={{
          headerShown: false,
          orientation: "portrait",
        }}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: colors.surface,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Torna indietro"
          hitSlop={10}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1 }}>
          {!!title && <Text style={globalStyles.title}>{title}</Text>}
        </View>
      </View>

      {loading ? (
        <View style={globalStyles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ padding: spacing.lg }}>
          <Text style={globalStyles.text}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: spacing.lg,
              marginBottom: spacing.lg,
            }}
          >
            <Text style={globalStyles.caption}>Totale rewatch del film</Text>

            <Text
              style={{
                color: colors.completed,
                fontSize: 30,
                fontWeight: "700",
                marginTop: spacing.xs,
              }}
            >
              {rewatches.length}
            </Text>
          </View>

          {rewatches.length === 0 ? (
            <Text style={globalStyles.empty}>
              Non ci sono rewatch registrati per questo film.
            </Text>
          ) : (
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: spacing.md,
              }}
            >
              <Text style={[globalStyles.text, { fontWeight: "700" }]}>
                Cronologia delle visioni
              </Text>

              {rewatches.map((rewatch) => (
                <View
                  key={rewatch.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderTopWidth: 1,
                    borderTopColor: colors.background,
                    marginTop: spacing.md,
                    paddingTop: spacing.md,
                  }}
                >
                  <Ionicons
                    name="time-outline"
                    size={19}
                    color={colors.completed}
                    style={{ marginRight: spacing.sm }}
                  />

                  <Text style={[globalStyles.text, { flex: 1 }]}>
                    {formatWatchedAt(rewatch.watched_at)}
                  </Text>

                  <Pressable
                    onPress={() =>
                      handleEditRewatch(rewatch.id, rewatch.watched_at)
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Modifica data e ora del rewatch"
                    hitSlop={8}
                    style={{
                      padding: spacing.xs,
                      marginLeft: spacing.sm,
                    }}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={20}
                      color={colors.text}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => handleDeleteRewatch(rewatch.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Elimina questo rewatch"
                    hitSlop={8}
                    style={{
                      padding: spacing.xs,
                      marginLeft: spacing.xs,
                    }}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={colors.stopped}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
