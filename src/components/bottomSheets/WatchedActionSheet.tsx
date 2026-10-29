import { BottomSheetView } from "@gorhom/bottom-sheet";
import { Pressable, Text } from "react-native";

import { colors } from "@/styles/global";

type Props = {
  onUnwatch: () => void;
  onRewatch: () => void;
  onResetRewatch: () => void;
  onEditFirstWatch: () => void;
  hasRewatch: boolean;
  onRemoveLastRewatch: () => void;
};

export default function WatchedActionSheet({
  onUnwatch,
  onRewatch,
  onResetRewatch,
  onEditFirstWatch,
  hasRewatch,
  onRemoveLastRewatch,
}: Props) {
  const actionStyle = {
    backgroundColor: colors.background,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
  } as const;

  const textStyle = {
    color: colors.text,
    fontSize: 14,
  } as const;

  return (
    <BottomSheetView
      style={{
        padding: 20,
        gap: 7,
      }}
    >
      <Pressable onPress={onUnwatch} style={actionStyle}>
        <Text style={textStyle}>Non visto</Text>
      </Pressable>

      <Pressable onPress={onRewatch} style={actionStyle}>
        <Text style={textStyle}>Rivisto +1</Text>
      </Pressable>

      <Pressable onPress={onEditFirstWatch} style={actionStyle}>
        <Text style={textStyle}>Cambia data</Text>
      </Pressable>

      {hasRewatch && (
        <Pressable onPress={onResetRewatch} style={actionStyle}>
          <Text style={textStyle}>Visto una volta</Text>
        </Pressable>
      )}

      {hasRewatch && (
        <Pressable onPress={onRemoveLastRewatch} style={actionStyle}>
          <Text style={textStyle}>Elimina ultimo rewatch</Text>
        </Pressable>
      )}
    </BottomSheetView>
  );
}
