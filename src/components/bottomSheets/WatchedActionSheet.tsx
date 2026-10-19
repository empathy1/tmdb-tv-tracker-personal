import { BottomSheetView } from "@gorhom/bottom-sheet";
import { Pressable, Text } from "react-native";

import { colors } from "@/styles/global";

type Props = {
  onUnwatch: () => void;
  onRewatch: () => void;
  onResetRewatch: () => void;
  hasRewatch: boolean;
  onRemoveLastRewatch: () => void;
};

export default function WatchedActionSheet({
  onUnwatch,
  onRewatch,
  onResetRewatch,
  hasRewatch,
  onRemoveLastRewatch,
}: Props) {
  return (
    <BottomSheetView
      style={{
        padding: 20,
        gap: 7,
      }}
    >
      <Pressable
        onPress={onUnwatch}
        style={{
          backgroundColor: colors.background,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 20,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
          }}
        >
          Non visto
        </Text>
      </Pressable>

      <Pressable
        onPress={onRewatch}
        style={{
          backgroundColor: colors.background,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 20,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
          }}
        >
          Rivisto +1
        </Text>
      </Pressable>

      {hasRewatch && (
        <Pressable
          onPress={onResetRewatch}
          style={{
            backgroundColor: colors.background,
            paddingVertical: 7,
            paddingHorizontal: 16,
            borderRadius: 20,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 14,
            }}
          >
            Visto una volta
          </Text>
        </Pressable>
      )}
      {hasRewatch && (
        <Pressable
          onPress={onRemoveLastRewatch}
          style={{
            backgroundColor: colors.background,
            paddingVertical: 7,
            paddingHorizontal: 16,
            borderRadius: 20,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 14,
            }}
          >
            Elimina ultimo rewatch
          </Text>
        </Pressable>
      )}
    </BottomSheetView>
  );
}
