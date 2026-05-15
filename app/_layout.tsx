import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetworkWatcher from "../src/components/NetworkWatcher";
import { initDB } from "../src/services/db";
import { setupNotifications } from "../src/services/notifications";

export default function RootLayout() {
  useEffect(() => {
    // Base de données
    try {
      initDB();
      console.log("[DB] Base SQLite initialisée");
    } catch (e) {
      console.error("[DB] Erreur d'initialisation SQLite :", e);
    }
    // Canal Android + permission notifications
    setupNotifications().then(granted => {
      console.log("[Notif] Prêt :", granted ? "oui" : "permission refusée");
    });
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
        <Stack.Screen
          name="forgot-password"
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(supervisor-tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
