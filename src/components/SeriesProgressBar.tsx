import { colors, spacing } from "@/constants/theme";
import { globalStyles } from "@/styles/global";
import { Text, View } from "react-native";

type Props = {
  watched: number;
  total: number;
};

export default function SeriesProgressBar({ watched, total }: Props) {
  const progress = total === 0 ? 0 : (watched / total) * 100;

  return (
    <>
      <View style={globalStyles.progressBackground}>
        <View
          style={[
            globalStyles.progressBar,
            {
              width: `${progress}%`,
              backgroundColor:
                watched === total ? colors.completed : colors.continuing,
            },
          ]}
        />
      </View>
      <View
        style={{
          paddingHorizontal: spacing.lg,
          marginTop: spacing.xs,
          alignItems: "flex-end",
        }}
      >
        <Text style={globalStyles.caption}>
          {watched}/{total} episodi
        </Text>
      </View>
    </>
  );
}
