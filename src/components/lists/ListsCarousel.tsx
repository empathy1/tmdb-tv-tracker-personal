import { Text, useWindowDimensions, View } from "react-native";
import PagerView from "react-native-pager-view";

import type { HubList, HubListItem } from "@/database";
import { globalStyles } from "@/styles/global";
import { getMediaCardLayout } from "@/utils/mediaLayout";
import ListCard from "./ListCard";

type ListsCarouselProps = {
  lists: (HubList & { items: HubListItem[] })[];
  onListPress: (list: HubList) => void;
};
export default function ListsCarousel({
  lists,
  onListPress,
}: ListsCarouselProps) {
  const { width } = useWindowDimensions();
  const { listPosterHeight } = getMediaCardLayout(width, false, true);

  return (
    <View>
      <Text style={globalStyles.sectionTitle}>Le mie liste</Text>

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
