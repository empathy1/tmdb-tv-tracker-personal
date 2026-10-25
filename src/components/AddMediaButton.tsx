import { Pressable, Text } from "react-native";

import { spacing } from "@/constants/theme";
import { colors } from "@/styles/global";

type AddMediaButtonProps = {
  label: string;
  loading: boolean;
  onPress: () => void;
};

export default function AddMediaButton({
  label,
  loading,
  onPress,
}: AddMediaButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      style={{
        padding: 14,
        borderRadius: 30,
        backgroundColor: loading ? "#666" : colors.continuing,
        alignItems: "center",
        marginTop: spacing.xl,
        opacity: loading ? 0.8 : 1,
      }}
    >
      <Text style={{ color: colors.background, fontWeight: "bold" }}>
        {loading ? "Salvataggio in corso..." : label}
      </Text>
    </Pressable>
  );
}
