/**
 * Notifications vocales — Ndaw Wune
 * ─────────────────────────────────────────────────────────────────
 * Deux canaux Android :
 *   • "ndawwune-planning"  : fin de segment (déjà existant)
 *   • "ndawwune-alerts"    : alertes 30 min / 5 min (importance MAX)
 *
 * Vocal :
 *   • App ouverte (foreground)  → expo-speech lit le message à voix haute
 *   • App en arrière-plan       → notif système + son fort ; tap → TTS
 *   • Écran verrouillé          → lockscreenVisibility PUBLIC + son + vibration
 *
 * API publique :
 *   setupNotifications()              → init canal + permission
 *   scheduleSessionAlerts(segments)   → planifie J/30min + J/5min pour aujourd'hui
 *   cancelAllSessionAlerts()          → annule toutes les alertes planifiées
 *   speakAlert(message)               → TTS immédiat (French)
 *   notifySegmentEnd(finished, next?) → notif immédiate fin de segment
 */
import * as Speech from "expo-speech";
import { Platform, Vibration } from "react-native";
import { Audio } from "expo-av";
import Constants, { ExecutionEnvironment } from "expo-constants";

let Notifications: any;

// Détecte si l'app s'exécute dans l'application Expo Go sur Android
const isAndroidExpoGo = Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (isAndroidExpoGo) {
  console.warn("[Notif] Environnement Expo Go Android détecté (SDK 53+).");
  console.warn("[Notif] Désactivation des notifications système natives pour éviter le crash d'Expo Go.");
  
  // Utilisation d'un stub de secours complet
  Notifications = {
    setNotificationHandler: () => {},
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ status: "undetermined" }),
    requestPermissionsAsync: async () => ({ status: "undetermined" }),
    scheduleNotificationAsync: async () => "stub-id",
    getAllScheduledNotificationsAsync: async () => [],
    cancelScheduledNotificationAsync: async () => {},
    AndroidImportance: {
      MAX: 5,
      HIGH: 4,
      DEFAULT: 3,
      LOW: 2,
      MIN: 1,
      NONE: 0
    },
    AndroidNotificationVisibility: {
      PUBLIC: 1,
      PRIVATE: 0,
      SECRET: -1
    }
  };
} else {
  try {
    Notifications = require("expo-notifications");
  } catch (e) {
    console.warn("[Notif] Impossible de charger expo-notifications nativement.");
    Notifications = {
      setNotificationHandler: () => {},
      setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ status: "undetermined" }),
      requestPermissionsAsync: async () => ({ status: "undetermined" }),
      scheduleNotificationAsync: async () => "stub-id",
      getAllScheduledNotificationsAsync: async () => [],
      cancelScheduledNotificationAsync: async () => {},
      AndroidImportance: {
        MAX: 5,
        HIGH: 4,
        DEFAULT: 3,
        LOW: 2,
        MIN: 1,
        NONE: 0
      },
      AndroidNotificationVisibility: {
        PUBLIC: 1,
        PRIVATE: 0,
        SECRET: -1
      }
    };
  }
}

/* ════════════════════════════════════════════════════════════════
   Handler global — foreground
   ════════════════════════════════════════════════════════════════ */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

/* ════════════════════════════════════════════════════════════════
   Canaux Android
   ════════════════════════════════════════════════════════════════ */
const CHANNEL_PLANNING = "ndawwune-planning";
const CHANNEL_ALERTS   = "ndawwune-alerts";

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  // Canal fin de segment
  await Notifications.setNotificationChannelAsync(CHANNEL_PLANNING, {
    name:             "Planning Ndaw Wune",
    description:      "Alertes de fin de segment du planning quotidien",
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500, 250, 500],
    lightColor:       "#1a56db",
    sound:            "default",
    enableVibrate:    true,
    showBadge:        false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // Canal alertes 30 min / 5 min — importance MAXIMUM + son pré-enregistré
  // Le canal est créé UNE SEULE FOIS par installation. Si le son change,
  // il faudra désinstaller/réinstaller l'app (limitation Android).
  await Notifications.setNotificationChannelAsync(CHANNEL_ALERTS, {
    name:             "Alertes de séance — Ndaw Wune",
    description:      "Rappels vocaux 30 min et 5 min avant le début des séances",
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],  // vibration longue
    lightColor:       "#f59e0b",
    // Son pré-enregistré (copié dans res/raw par le plugin expo-notifications)
    // Fallback automatique sur "default" si le fichier n'existe pas encore
    sound:            "alerte_30min",
    enableVibrate:    true,
    showBadge:        false,
    bypassDnd:        false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/* ════════════════════════════════════════════════════════════════
   Init (à appeler une fois au démarrage, dans _layout.tsx)
   ════════════════════════════════════════════════════════════════ */
export async function setupNotifications(): Promise<boolean> {
  await ensureAndroidChannels();

  if (Platform.OS === "android" && Number(Platform.Version) < 33) {
    return true;
  }

  const { status: current } = await Notifications.getPermissionsAsync();
  if (current === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    console.warn("[Notif] Permission refusée.");
    return false;
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   TTS — parle le message à voix haute (français)
   ════════════════════════════════════════════════════════════════ */
export function speakAlert(message: string): void {
  // Stoppe toute lecture en cours avant de commencer
  Speech.stop();
  Speech.speak(message, {
    language: "fr-FR",
    rate:     0.88,   // légèrement plus lent = meilleure compréhension
    pitch:    1.05,
  });
}

/* ════════════════════════════════════════════════════════════════
   Messages vocaux
   ════════════════════════════════════════════════════════════════ */
function msg30(titre: string): string {
  return `Êtes-vous prêt ? Votre programme commence dans 30 minutes. La séance "${titre}" vous attend. Préparez votre matériel !`;
}

function msg5(titre: string): string {
  return `Attention ! Votre cours "${titre}" commence dans 5 minutes. Il est temps de commencer !`;
}

/* ════════════════════════════════════════════════════════════════
   Planification des alertes du jour
   ════════════════════════════════════════════════════════════════ */
export interface PlanningSegment {
  id:          string;
  titre?:      string;
  matiere?:    string;
  classe?:     string;
  heure_debut: string;  // "HH:MM" ou "HH:MM:SS"
  heure_fin:   string;
  jour:        number;  // 0 = Lundi … 5 = Samedi
}

/**
 * Planifie (ou re-planifie) les alertes 30 min et 5 min
 * pour les segments d'aujourd'hui.
 * Annule automatiquement les alertes précédentes avant de replanifier.
 */
export async function scheduleSessionAlerts(
  segments: PlanningSegment[],
): Promise<void> {
  // Annule les alertes déjà planifiées
  await cancelAllSessionAlerts();

  const now   = new Date();
  // Convertit getDay() (0=Dim) → notre index (0=Lun)
  const jsDay = now.getDay();
  const today = jsDay === 0 ? 6 : jsDay - 1;

  const todaySegs = segments.filter(s => s.jour === today);
  if (todaySegs.length === 0) return;

  let scheduled = 0;

  for (const seg of todaySegs) {
    const rawTitle = seg.titre ?? seg.matiere ?? seg.classe ?? "Séance";
    const [h, m]  = seg.heure_debut.split(":").map(Number);

    // Heure de début du segment (aujourd'hui)
    const start = new Date(now);
    start.setHours(h, m, 0, 0);

    // ── Alerte 30 minutes avant ──────────────────────────────
    const at30 = new Date(start.getTime() - 30 * 60 * 1000);
    if (at30 > now) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `alert-30-${seg.id}`,
          content: {
            title: "🔔 Votre programme commence bientôt !",
            body:  `La séance "${rawTitle}" débute à ${h}h${String(m).padStart(2, "0")}. Êtes-vous prêt ?`,
            // Son pré-enregistré → joue même app fermée (iOS: avec extension, Android: sans)
            sound: Platform.OS === "ios" ? "alerte_30min.wav" : "alerte_30min",
            data: {
              alertType: "30min",
              seance:    rawTitle,
              speechMsg: msg30(rawTitle),
            },
            ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS }),
          },
          trigger: { date: at30 } as any,
        });
        scheduled++;
      } catch (e) {
        console.warn("[Notif] Erreur alerte 30min :", e);
      }
    }

    // ── Alerte 5 minutes avant ───────────────────────────────
    const at5 = new Date(start.getTime() - 5 * 60 * 1000);
    if (at5 > now) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `alert-5-${seg.id}`,
          content: {
            title: "⚡ Votre cours commence dans 5 minutes !",
            body:  `Préparez-vous ! "${rawTitle}" commence très bientôt.`,
            sound: Platform.OS === "ios" ? "alerte_5min.wav" : "alerte_5min",
            data: {
              alertType: "5min",
              seance:    rawTitle,
              speechMsg: msg5(rawTitle),
            },
            ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS }),
          },
          trigger: { date: at5 } as any,
        });
        scheduled++;
      } catch (e) {
        console.warn("[Notif] Erreur alerte 5min :", e);
      }
    }
  }

  console.log(`[Notif] ${scheduled} alerte(s) planifiée(s) pour aujourd'hui.`);
}

/**
 * Annule toutes les alertes 30min/5min planifiées.
 * (Pas les notifications de fin de segment.)
 */
export async function cancelAllSessionAlerts(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (
        n.identifier.startsWith("alert-30-") ||
        n.identifier.startsWith("alert-5-")
      ) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.warn("[Notif] Erreur cancelAllSessionAlerts :", e);
  }
}

/* ════════════════════════════════════════════════════════════════
   Notification immédiate — fin de segment (usage existant)
   ════════════════════════════════════════════════════════════════ */
export async function playAlarmSound(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      require("../../assets/sounds/alarm.mp3")
    );
    await sound.playAsync();

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch (e) {
    console.warn("[AlarmSound] Erreur lecture :", e);
  }
}

export async function notifySegmentEnd(
  finishedTitle: string,
  nextTitle?: string,
): Promise<void> {
  try {
    // 1. Notif système (joue le son du canal)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${finishedTitle} — terminé ✓`,
        body:  nextTitle
          ? `Prochain : ${nextTitle}`
          : "Bonne journée, c'est fini pour aujourd'hui !",
        sound: "default",
        color: "#1a56db",
        ...(Platform.OS === "android" && { channelId: CHANNEL_PLANNING }),
      },
      trigger: null,
    });

    // 2. Parler à voix haute immédiatement (TTS Ndaw Wune)
    const voiceMsg = nextTitle
      ? `Attention. L'activité "${finishedTitle}" est terminée. Veuillez passer à l'activité suivante : "${nextTitle}".`
      : `L'activité "${finishedTitle}" est terminée. C'est fini pour aujourd'hui. Profitez de votre temps libre !`;
    speakAlert(voiceMsg);

    // 3. Vibrer fortement la tablette/le téléphone (rythme d'alarme)
    Vibration.vibrate([0, 500, 250, 500, 250, 500, 250, 500]);

    // 4. Jouer le son d'alarme physique de la séance
    await playAlarmSound();
  } catch (e) {
    console.warn("[Notif] Erreur notifySegmentEnd :", e);
  }
}
