import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import NetworkWatcher from "../src/components/NetworkWatcher";
import { initDB } from "../src/services/db";
import { setupNotifications, speakAlert } from "../src/services/notifications";

export default function RootLayout() {
  const fgRef  = useRef<Notifications.Subscription | null>(null);
  const tapRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // ── Base de données ───────────────────────────────────────
    try {
      initDB();
      console.log("[DB] Base SQLite initialisée");
    } catch (e) {
      console.error("[DB] Erreur d'initialisation SQLite :", e);
    }

    // ── Canal Android + permission notifications ──────────────
    setupNotifications().then(granted => {
      console.log("[Notif] Prêt :", granted ? "oui" : "permission refusée");
    });

    // ── Listener foreground : TTS quand notif arrive app ouverte ──
    // Seules les alertes de planning parlent (alertType présent)
    fgRef.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as Record<string, unknown>;
      if (data?.speechMsg && typeof data.speechMsg === "string") {
        // Délai court pour ne pas couper le son de la notif
        setTimeout(() => speakAlert(data.speechMsg as string), 800);
      }
    });

    // ── Listener tap : TTS quand l'user tape la notif (background) ──
    tapRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.speechMsg && typeof data.speechMsg === "string") {
        setTimeout(() => speakAlert(data.speechMsg as string), 600);
      }
    });

    return () => {
      fgRef.current?.remove();
      tapRef.current?.remove();
    };
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
