import { LanguageProvider } from "@/contexts/LanguageContext";
import { DATABASE_NAME, initializeDatabase } from "@/database";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        assetSource={{
          assetId: require("../../assets/tv_tracker.db"),
          forceOverwrite: true,
        }}
        onInit={async (db) => {
          await initializeDatabase(db);
        }}
      >
        <LanguageProvider>
          <BottomSheetModalProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
            </Stack>
          </BottomSheetModalProvider>
        </LanguageProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
