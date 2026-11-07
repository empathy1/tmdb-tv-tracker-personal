import { Image } from "expo-image";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { colors } from "@/styles/global";
import { getMediaCardLayout } from "@/utils/mediaLayout";

type Props = {
  title: string;
  poster?: string | null;
  info?: React.ReactNode;
  showCheck?: boolean;
  checked?: boolean;
  horizontal?: boolean;
  action?: React.ReactNode;
  onCheck?: () => void;
  onPress: () => void;
  bottomContent?: React.ReactNode;
};

export default function MediaCard({
  title,
  poster,
  horizontal = false,
  action,
  onPress,
  bottomContent,
  info,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const { cardWidth } = getMediaCardLayout(screenWidth, horizontal);
  const normalizedPoster = poster?.trim();

  return (
    <View
      style={{
        width: cardWidth,
        height: horizontal ? 230 : undefined,
        marginBottom: 10,
      }}
    >
      <Pressable onPress={onPress}>
        <View style={{ position: "relative", width: "100%" }}>
          {normalizedPoster ? (
            <Image
              source={{ uri: normalizedPoster }}
              style={{
                width: "100%",
                aspectRatio: 2 / 3,
                borderRadius: 5,
              }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: "100%",
                aspectRatio: 2 / 3,
                borderRadius: 5,
                backgroundColor: colors.surface,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                Nessun poster
              </Text>
            </View>
          )}

          {bottomContent && (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
              }}
            >
              {bottomContent}
            </View>
          )}
        </View>

        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: "600",
            marginTop: 6,
          }}
        >
          {title}
        </Text>
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 4,
        }}
      >
        {info && <View style={{ flex: 1, paddingRight: 8 }}>{info}</View>}

        {action}
      </View>
    </View>
  );
}
