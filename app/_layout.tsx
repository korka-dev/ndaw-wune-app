import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import NetworkWatcher from "../src/components/NetworkWatcher";
import UpdateBanner from "../src/components/UpdateBanner";
import AppLockGate from "../src/components/AppLockGate";
import { initDB } from "../src/services/db";
import {
  setupNotifications,
  speakAlert,
  triggerAlertVibration,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from "../src/services/notifications";

// Empêcher le splash natif de se cacher automatiquement
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const fgRef  = useRef<{ remove: () => void } | null>(null);
  const tapRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    async function prepare() {
      try {
        // ── Base de données ─────────────────────────────────────
        try {
          initDB();
          console.log("[DB] Base SQLite initialisée");
        } catch (e) {
          console.error("[DB] Erreur d'initialisation SQLite :", e);
        }

        // ── Canal Android + permission notifications ────────────
        const granted = await setupNotifications();
        console.log("[Notif] Prêt :", granted ? "oui" : "permission refusée");
      } finally {
        // Cacher le splash natif — le LoadingScreen JS prend le relais
        await SplashScreen.hideAsync();
      }
    }

    prepare();

    // ── Listener foreground : TTS + vibration quand notif arrive app ouverte ──
    fgRef.current = addNotificationReceivedListener(notification => {
      const data = notification.request.content.data as Record<string, unknown>;
      if (data?.alertType && typeof data.alertType === "string") {
        triggerAlertVibration(data.alertType);
      }
      if (data?.speechMsg && typeof data.speechMsg === "string") {
        setTimeout(() => speakAlert(data.speechMsg as string), 800);
      }
    });

    // ── Listener tap : TTS quand l'user tape la notif (background) ──
    tapRef.current = addNotificationResponseReceivedListener(response => {
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
      {/* ── StatusBar visible sur Android : icônes sombres sur fond clair ── */}
      <StatusBar
        style="dark"
        backgroundColor="#FAF7F1"
        translucent={false}
      />
      <NetworkWatcher />
      <UpdateBanner />
      <AppLockGate>
        <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="welcome" />
          <Stack.Screen
            name="onboarding"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="user-type"
            options={{ animation: "slide_from_right" }}
          />
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
          <Stack.Screen
            name="today-summary"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="next-planning"
            options={{ animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="remarques"
            options={{ animation: "slide_from_bottom" }}
          />
        </Stack>
      </AppLockGate>
    </SafeAreaProvider>
  );
}
