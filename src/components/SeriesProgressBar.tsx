import { spacing } from "@/constants/theme";
import { globalStyles } from "@/styles/global";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Text, View } from "react-native";

type Props = {
  watched: number;
  total: number;
  color: string;
  isComplete?: boolean;
  checkmarkScale?: Animated.Value;
};

export default function SeriesProgressBar({
  watched,
  total,
  color,
  isComplete = false,
  checkmarkScale,
}: Props) {
  const progress = total === 0 ? 0 : (watched / total) * 100;

  return (
    <>
      <View style={globalStyles.progressBackground}>
        <View
          style={[
            globalStyles.progressBar,
            {
              width: `${progress}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          marginTop: spacing.xs,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <Text style={globalStyles.caption}>
          {watched}/{total} episodi
        </Text>

        {isComplete && (
          <Animated.View
            style={{
              marginLeft: spacing.xs,
              transform: [{ scale: checkmarkScale ?? 1 }],
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          </Animated.View>
        )}
      </View>
    </>
  );
}
