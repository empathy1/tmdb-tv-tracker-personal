import { colors, spacing } from "@/constants/theme";
import { StyleSheet, ViewStyle } from "react-native";

export { colors };

export const globalStyles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingHorizontal: spacing.lg,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Titoli
  screenTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },

  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.md,
  },

  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },

  // Testi
  text: {
    color: colors.text,
    fontSize: 14,
  },

  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
  },

  caption: {
    color: colors.textSecondary,
    fontSize: 13,
  },

  // Ricerca
  searchInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    padding: spacing.md,
    borderRadius: 10,
  },

  // Filtri
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },

  filterButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },

  filterButtonActive: {
    backgroundColor: colors.primary,
  },

  filterText: {
    color: colors.text,
    fontWeight: "600",
  },

  filterTextActive: {
    color: colors.background,
  },

  // Stati
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },

  empty: {
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
  },

  progressBackground: {
    height: 6,
    width: "100%",
    borderRadius: 0,
    backgroundColor: colors.progressBackground,
    overflow: "hidden",
  },

  progressBar: {
    height: "100%",
    borderRadius: 0,
  },

  background: {
    position: "relative",
    overflow: "hidden",
  },

  backgroundImage: {
    ...StyleSheet.absoluteFill,
  },

  //card liste
  card: {
    width: 145,
    height: 190,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    justifyContent: "space-between",
    marginRight: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Poster anteprima liste
  listPostersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    width: 112,
    height: 112,
    alignSelf: "center",
  },

  listPoster: {
    width: 54,
    height: 54,
    borderRadius: 4,
  },

  listPosterPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
  },
});

export function getBottomActionContainerStyle(bottomInset: number): ViewStyle {
  return {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Math.max(bottomInset + 30, spacing.md),
    backgroundColor: colors.background,
  };
}
