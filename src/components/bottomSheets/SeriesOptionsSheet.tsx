import { Ionicons } from "@expo/vector-icons";
import {
    BottomSheetBackdrop,
    BottomSheetBackdropProps,
    BottomSheetModal,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback } from "react";
import { Pressable, Text } from "react-native";

import { spacing } from "@/constants/theme";
import { colors } from "@/styles/global";

type Props = {
  isFavorite: boolean;
  hasRewatch: boolean;
  watchStatus: string | null;
  onAddToList: () => void;
  onToggleFavorite: () => void;
  onViewRewatches: () => void;
  onStopWatching: () => void;
};

const SeriesOptionsSheet = forwardRef<BottomSheetModal, Props>(
  function SeriesOptionsSheet(
    {
      isFavorite,
      hasRewatch,
      watchStatus,
      onAddToList,
      onToggleFavorite,
      onViewRewatches,
      onStopWatching,
    },
    ref,
  ) {
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

    const actions = [
      {
        label: "Aggiungi alla lista",
        icon: "list-outline" as const,
        onPress: onAddToList,
        visible: true,
      },
      {
        label: isFavorite ? "Togli dai preferiti" : "Preferiti",
        icon: isFavorite
          ? ("heart-dislike-outline" as const)
          : ("heart-outline" as const),
        onPress: onToggleFavorite,
        visible: true,
      },
      {
        label: "Consulta rewatch",
        icon: "time-outline" as const,
        onPress: onViewRewatches,
        visible: hasRewatch,
      },
      {
        label: "Smetti di guardare",
        icon: "pause-circle-outline" as const,
        onPress: onStopWatching,
        visible: watchStatus === "continuing",
      },
    ];

    return (
      <BottomSheetModal
        ref={ref}
        index={1}
        snapPoints={["33%"]}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.text }}
      >
        <BottomSheetView
          style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
        >
          {actions
            .filter((action) => action.visible)
            .map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => {
                  // Chiude il menu prima di eseguire l'azione.
                  if (ref && typeof ref !== "function" && "current" in ref) {
                    ref.current?.dismiss();
                  }
                  action.onPress();
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 54,
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.background,
                }}
              >
                <Ionicons
                  name={action.icon}
                  size={23}
                  color={colors.text}
                  style={{ width: 38 }}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 16,
                    flex: 1,
                  }}
                >
                  {action.label}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textSecondary ?? colors.text}
                />
              </Pressable>
            ))}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

export default SeriesOptionsSheet;
