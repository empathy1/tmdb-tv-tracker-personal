import { Ionicons } from "@expo/vector-icons";
import { Image, Modal, Pressable, View } from "react-native";
import {
    GestureDetector,
    GestureHandlerRootView,
    usePanGesture,
    usePinchGesture,
    useSimultaneousGestures,
} from "react-native-gesture-handler";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
} from "react-native-reanimated";

import { spacing } from "@/constants/theme";
import { colors } from "@/styles/global";

type ZoomableImageModalProps = {
  visible: boolean;
  imageUri: string | null;
  topInset: number;
  onClose: () => void;
};

export default function ZoomableImageModal({
  visible,
  imageUri,
  topInset,
  onClose,
}: ZoomableImageModalProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = usePinchGesture({
    onUpdate: (event) => {
      scale.value = Math.max(1, Math.min(savedScale.value * event.scale, 4));
    },
    onDeactivate: () => {
      savedScale.value = scale.value;

      if (scale.value <= 1) {
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    },
  });

  const panGesture = usePanGesture({
    onUpdate: (event) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      }
    },
    onDeactivate: () => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
  });

  const imageGesture = useSimultaneousGestures(pinchGesture, panGesture);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#000",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {imageUri ? (
            <GestureDetector gesture={imageGesture}>
              <Animated.View
                style={[
                  {
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  imageStyle,
                ]}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                  resizeMode="contain"
                />
              </Animated.View>
            </GestureDetector>
          ) : null}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Chiudi immagine"
            hitSlop={12}
            style={{
              position: "absolute",
              top: topInset + spacing.md,
              right: spacing.lg,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "rgba(40,40,40,0.8)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
