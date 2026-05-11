import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetworkWatcher from "../src/components/NetworkWatcher";
import { initDB } from "../src/services/db";

export default function RootLayout() {
  useEffect(() => {
    try {
      initDB();
      console.log("[DB] Base SQLite initialisée");
    } catch (e) {
      console.error("[DB] Erreur d'initialisation SQLite :", e);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <NetworkWatcher />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen
          name="login"
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
