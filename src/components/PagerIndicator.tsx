import { colors } from "@/styles/global";
import { View } from "react-native";

type Props = {
  pageCount: number;
  currentPage: number;
};

export default function PagerIndicator({ pageCount, currentPage }: Props) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        marginTop: 12,
      }}
    >
      {Array.from({ length: pageCount }).map((_, index) => (
        <View
          key={index}
          style={{
            width: index === currentPage ? 8 : 5,
            height: index === currentPage ? 8 : 5,
            borderRadius: index === currentPage ? 4 : 2.5,
            backgroundColor:
              index === currentPage ? colors.primary : colors.surface,
            marginBottom: 4,
          }}
        />
      ))}
    </View>
  );
}
