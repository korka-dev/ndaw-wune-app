/**
 * Notifications locales — Ndaw Wune
 * ──────────────────────────────────────────────────────────────
 * Production-ready : fonctionne sur APK signé, IPA App Store,
 * Expo Dev Client et Expo Go.
 *
 * Android 8+ (API 26+) : canal "planning" requis.
 * Android 13+ (API 33) : permission POST_NOTIFICATIONS demandée.
 * iOS : permission via requestPermissionsAsync().
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/* ════════════════════════════════════════════════════════════════
   1. Handler global — doit être défini au niveau module, avant
      tout scheduleNotification. Détermine le comportement quand
      l'app est au premier plan (foreground).
   ════════════════════════════════════════════════════════════════ */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,   // afficher la bannière même app ouverte
    shouldPlaySound:  true,   // son système
    shouldSetBadge:   false,
    shouldShowBanner: true,   // SDK 54
    shouldShowList:   true,
  }),
});

/* ════════════════════════════════════════════════════════════════
   2. Canal Android (obligatoire Android 8+ / API 26+)
      Sans canal → aucune notification n'apparaît sur un vrai APK.
      Appelé une seule fois au démarrage via setupNotifications().
   ════════════════════════════════════════════════════════════════ */
const CHANNEL_ID = "ndawwune-planning";

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name:              "Planning Ndaw Wune",
    description:       "Alertes de fin de segment du planning quotidien",
    importance:        Notifications.AndroidImportance.HIGH,   // bannière + son
    vibrationPattern:  [0, 200, 100, 200],                     // court · pause · court
    lightColor:        "#1a56db",
    sound:             "default",
    enableVibrate:     true,
    showBadge:         false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/* ════════════════════════════════════════════════════════════════
   3. Point d'entrée unique — à appeler une fois au démarrage de
      l'app (dans _layout.tsx), avant tout envoi de notification.
   ════════════════════════════════════════════════════════════════ */
export async function setupNotifications(): Promise<boolean> {
  // a) Créer le canal Android
  await ensureAndroidChannel();

  // b) Demander la permission
  //    Android < 13 : implicite (POST_NOTIFICATIONS n'existe pas encore)
  //    Android 13+  : dialog système obligatoire
  //    iOS          : dialog APN
  if (Platform.OS === "android" && Platform.Version < 33) {
    return true; // pas besoin de demander
  }

  const { status: current } = await Notifications.getPermissionsAsync();
  if (current === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    console.warn("[Notif] Permission refusée par l'utilisateur.");
    return false;
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   4. Notification de fin de segment
   ════════════════════════════════════════════════════════════════ */
/**
 * Envoie une notification immédiate signalant la fin d'un segment.
 * @param finishedTitle  Titre du segment terminé
 * @param nextTitle      Titre du suivant (undefined = fin de journée)
 */
export async function notifySegmentEnd(
  finishedTitle: string,
  nextTitle?: string,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${finishedTitle} — terminé ✓`,
        body: nextTitle
          ? `Prochain : ${nextTitle}`
          : "Bonne journée, c'est fini pour aujourd'hui !",
        sound:   "default",
        color:   "#1a56db",                   // icône Android tintée
        // Lie la notif au canal créé ci-dessus
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: null, // déclenchement immédiat
    });
  } catch (e) {
    // Ne jamais faire crasher l'app pour une notif
    console.warn("[Notif] Erreur lors de l'envoi :", e);
  }
}
