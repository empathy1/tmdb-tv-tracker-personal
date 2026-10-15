import {
    getMovieDetails,
    TMDB_IMAGE_BASE_URL,
} from "@/services/tmdb";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ImageBackground,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TMDBMovieDetails } from "@/types/tmdb";

import { spacing } from "@/constants/theme";
import { colors, globalStyles } from "@/styles/global";

type MovieDetailItem = {
    title: string;
    backdrop: string | null;
    overview: string;
    date: string;
    status: string;
    rating: number;
    genres: string[];
    extraInfo: string;
};

export default function MovieDetails() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [details, setDetails] = useState<MovieDetailItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadDetails() {
            try {
                setLoading(true);
                setError(null);

                const mediaId = Number(id);

                if (!Number.isFinite(mediaId) || mediaId <= 0) {
                    throw new Error("Film non valido.");
                }

                const data: TMDBMovieDetails =
                    await getMovieDetails(mediaId);

                setDetails({
                    title: data.title,
                    backdrop: data.backdrop_path,
                    overview: data.overview,
                    date: data.release_date,
                    status: data.status,
                    rating: data.vote_average,
                    genres: data.genres.map((genre) => genre.name),
                    extraInfo: data.runtime
                        ? `${data.runtime} minuti`
                        : "",
                });
            } catch {
                setError("Impossibile caricare i dettagli del film.");
            } finally {
                setLoading(false);
            }
        }

        loadDetails();
    }, [id]);

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
                        <ActivityIndicator
                            size="large"
                            color={colors.primary}
                        />
                    </View>
                ) : error || !details ? (
                    <Text style={globalStyles.empty}>
                        {error ?? "Film non disponibile."}
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
                                        <Ionicons
                                            name="arrow-back"
                                            size={24}
                                            color={colors.text}
                                        />
                                    </Pressable>
                                </View>

                                <View
                                    style={{
                                        padding: spacing.lg,
                                        paddingTop: 20,
                                        backgroundColor: "rgba(0,0,0,0.55)",
                                    }}
                                >
                                    <Text style={globalStyles.title}>
                                        {details.title}
                                    </Text>

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

                                    <Text style={globalStyles.text}>
                                        {details.overview}
                                    </Text>
                                </>
                            ) : null}

                            {details.status ? (
                                <Text
                                    style={[
                                        globalStyles.caption,
                                        { marginTop: spacing.lg },
                                    ]}
                                >
                                    Stato: {details.status}
                                </Text>
                            ) : null}
                        </View>
                    </>
                )}
            </ScrollView>
        </>
    );
}