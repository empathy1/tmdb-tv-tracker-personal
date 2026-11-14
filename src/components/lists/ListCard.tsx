import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import type { HubList, HubListItem } from "@/database";
import { TMDB_IMAGE_BASE_URL } from "@/services/tmdb";
import { colors } from "@/styles/global";
import { getMediaCardLayout } from "@/utils/mediaLayout";

type ListCardProps = {
  list: HubList & { items: HubListItem[] };
  onPress: () => void;
};

export default function ListCard({ list, onPress }: ListCardProps) {
  const { width } = useWindowDimensions();

  const { listPosterWidth, listPosterHeight, listCardWidth } =
    getMediaCardLayout(width, false, true);

  const posters = list.items.slice(0, 4);

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: listCardWidth,
        backgroundColor: colors.surface,
        borderRadius: 5,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          height: listPosterHeight,
        }}
      >
        {posters.length > 0 ? (
          posters.map((item) => (
            <Image
              key={`${item.item_type}-${item.tmdb_id}`}
              source={{
                uri: item.poster_path
                  ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}`
                  : undefined,
              }}
              style={{
                width: listPosterWidth,
                height: listPosterHeight,
                backgroundColor: colors.surfaceLight,
              }}
              contentFit="cover"
            />
          ))
        ) : (
          <View
            style={{
              width: "100%",
              height: listPosterHeight,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 30 }}>📚</Text>
          </View>
        )}
      </View>

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          justifyContent: "flex-end",
          padding: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "700",
              flex: 1,
              marginRight: 8,
            }}
          >
            {list.name}
          </Text>

          <Text
            style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: 12,
            }}
          >
            {list.item_count} {list.item_count === 1 ? "elemento" : "elementi"}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
