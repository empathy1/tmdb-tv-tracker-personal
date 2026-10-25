import { Ionicons } from "@expo/vector-icons";
import { useRef } from "react";
import { Animated, Pressable } from "react-native";

type FavoriteButtonProps = {
  tmdbId: number;
  title: string;
  isFavorite: boolean;
  onToggleFavorite: () => Promise<boolean>;
};

export default function FavoriteButton({
  tmdbId,
  title,
  isFavorite,
  onToggleFavorite,
}: FavoriteButtonProps) {
  const heartScale = useRef(new Animated.Value(1)).current;
  /*
  useEffect(() => {
    let active = true;

    async function loadFavorite() {
      setLoading(true);

      try {
        const favorite = await isTvSeriesFavorite(tmdbId);

        if (active) {
          setIsFavorite(favorite);
        }
      } catch (error) {
        console.error("Errore caricando il preferito:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadFavorite();

    return () => {
      active = false;
    };
  }, [tmdbId]);
*/

  function animateHeart() {
    heartScale.setValue(0.7);

    Animated.sequence([
      Animated.timing(heartScale, {
        toValue: 1.2,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }

  /*
  async function toggleFavorite() {
    if (saving || loading) return;

    setSaving(true);

    try {
      if (isFavorite) {
        await removeTvSeriesFavorite(tmdbId);
        setIsFavorite(false);
      } else {
        await addTvSeriesFavorite(tmdbId, title);
        setIsFavorite(true);
      }

      animateHeart();
    } catch (error) {
      console.error("Errore aggiornando i preferiti:", error);

      Alert.alert("Errore", "Non è stato possibile aggiornare i preferiti.");
    } finally {
      setSaving(false);
    }
  }
    */

  return (
    <Pressable
      onPress={async (event) => {
        event.stopPropagation();

        const success = await onToggleFavorite();

        if (success) {
          animateHeart();
        }
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={
        isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"
      }
      style={{
        width: 46,
        height: 46,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View style={{ transform: [{ scale: heartScale }] }}>
        <Ionicons
          name={isFavorite ? "heart" : "heart-outline"}
          size={28}
          color={isFavorite ? "#ff3b5c" : "#ffffff"}
        />
      </Animated.View>
    </Pressable>
  );
}
