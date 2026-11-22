import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import PagerView from "react-native-pager-view";

import type { HubList, HubListItem } from "@/database";
import { colors, globalStyles } from "@/styles/global";
import { getMediaCardLayout } from "@/utils/mediaLayout";
import ListCard from "./ListCard";

type ListsCarouselProps = {
  lists: (HubList & { items: HubListItem[] })[];
  onListPress: (list: HubList) => void;
  onTitlePress: () => void;
};

export default function ListsCarousel({
  lists,
  onListPress,
  onTitlePress,
}: ListsCarouselProps) {
  const { width } = useWindowDimensions();
  const { listPosterHeight } = getMediaCardLayout(width, false, true);

  return (
    <View>
      <Pressable
        onPress={onTitlePress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <Text style={globalStyles.sectionTitle}>Le mie liste</Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.text}
          style={{
            marginLeft: 5,
            marginTop: 2,
          }}
        />
      </Pressable>

      <PagerView
        style={{ width: "100%", height: listPosterHeight }}
        initialPage={0}
      >
        {lists.map((list) => (
          <View key={list.list_id} collapsable={false}>
            <ListCard list={list} onPress={() => onListPress(list)} />
          </View>
        ))}
      </PagerView>
    </View>
  );
}
