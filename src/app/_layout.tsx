import { LanguageProvider } from "@/contexts/LanguageContext";
import { DATABASE_NAME, initializeDatabase } from "@/database";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";

export default function RootLayout() {
  return (
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
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </LanguageProvider>
    </SQLiteProvider>
  );
}
