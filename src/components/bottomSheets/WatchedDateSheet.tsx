import { BottomSheetView } from "@gorhom/bottom-sheet";
import { Pressable, Text } from "react-native";

import { colors } from "@/styles/global";

type Props = {
  onNow: () => void;
  onYesterday: () => void;
  onReleaseDate: () => void;
  onCustomDate: () => void;

  hasReleaseDate: boolean;
};

export default function WatchedDateSheet({
  onNow,
  onYesterday,
  onReleaseDate,
  onCustomDate,
  hasReleaseDate,
}: Props) {
  return (
    <BottomSheetView
      style={{
        padding: 20,
        gap: 7,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: 18,
          fontWeight: "600",
          marginBottom: 8,
        }}
      >
        Quando hai visto questo contenuto?
      </Text>

      <Pressable
        onPress={onNow}
        style={{
          backgroundColor: colors.background,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 20,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 14 }}>Proprio ora</Text>
      </Pressable>

      <Pressable
        onPress={onYesterday}
        style={{
          backgroundColor: colors.background,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 20,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 14 }}>Ieri</Text>
      </Pressable>

      {hasReleaseDate && (
        <Pressable
          onPress={onReleaseDate}
          style={{
            backgroundColor: colors.background,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 20,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 14 }}>
            Data di uscita
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={onCustomDate}
        style={{
          backgroundColor: colors.background,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 20,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 14 }}>
          Data personalizzata
        </Text>
      </Pressable>
    </BottomSheetView>
  );
}
