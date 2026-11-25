import { LanguageProvider } from "@/contexts/LanguageContext";
import { DATABASE_NAME, initializeDatabase } from "@/database";
import {
  requestNotificationPermissions
} from "@/utils/notifications";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

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
        <StatusBar hidden />
        <LanguageProvider>
          <BottomSheetModalProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />

              <Stack.Screen
                name="discover/[section]"
                options={{ headerShown: false }}
              />
            </Stack>
          </BottomSheetModalProvider>
        </LanguageProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
