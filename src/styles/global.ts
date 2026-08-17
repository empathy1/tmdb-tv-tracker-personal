import { colors, spacing } from "@/constants/theme";
import { StyleSheet } from "react-native";

export { colors };

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingHorizontal: spacing.lg,
  },

  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },

  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
  },

  caption: {
    color: colors.textSecondary,
    fontSize: 13,
  },

  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
