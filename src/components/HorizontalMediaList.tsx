import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    FlatList,
    Pressable,
    Text,
    View,
    type ListRenderItem,
} from "react-native";

import { colors, globalStyles } from "@/styles/global";
import PagerIndicator from "./PagerIndicator";

type Props<T> = {
  title: string;
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;

  emptyMessage?: string;
  showMore?: boolean;
  onMorePress?: () => void;
  snapInterval?: number;
  showPager?: boolean;
};

export default function HorizontalMediaList<T>({
  title,
  data,
  renderItem,
  keyExtractor,
  emptyMessage,
  showMore = false,
  onMorePress,
  snapInterval,
  showPager = false,
}: Props<T>) {
  const [currentPage, setCurrentPage] = useState(0);

  return (
    <View style={{ marginTop: 30 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <Text
          style={[
            globalStyles.title,
            { fontSize: 18, marginTop: 10, marginBottom: 5 },
          ]}
        >
          {title}
        </Text>

        {showMore && data.length > 0 && (
          <Pressable onPress={onMorePress} hitSlop={10}>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        )}
      </View>

      {data.length === 0 ? (
        emptyMessage ? (
          <Text style={globalStyles.empty}>{emptyMessage}</Text>
        ) : null
      ) : (
        <>
          <FlatList
            horizontal
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 20 }}
            snapToInterval={snapInterval}
            decelerationRate="fast"
            onMomentumScrollEnd={(event) => {
              if (!snapInterval) return;

              const page = Math.round(
                event.nativeEvent.contentOffset.x / snapInterval,
              );

              setCurrentPage(Math.min(page, data.length - 1));
            }}
          />

          {showPager && (
            <PagerIndicator pageCount={data.length} currentPage={currentPage} />
          )}
        </>
      )}
    </View>
  );
}
