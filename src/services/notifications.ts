/**
 * Notifications — Ndaw Wune (Android-first)
 * ─────────────────────────────────────────────────────────────────
 * Trois canaux Android :
 *   • "ndawwune-fin"        : fin d'activité        (finactivite.mp3 + vibration forte)
 *   • "ndawwune-alerts-30"  : rappel 30 min avant   (30minutes.mp3 + vibration douce)
 *   • "ndawwune-alerts-5"   : rappel 5 min avant    (5minutes.mp3 + vibration urgente)
 *
 * Planification :
 *   scheduleSessionAlerts() programme les rappels des 7 prochains jours.
 *   Ainsi même si l'enseignant n'ouvre l'app qu'une fois par semaine,
 *   toutes ses séances sont couvertes.
 *
 * Convention jour : 0 = Lundi, 1 = Mardi, …, 5 = Samedi, 6 = Dimanche
 * (identique à la convention du backend Ndaw Wune)
 *
 * API publique :
 *   setupNotifications()              → init canaux + demande permission
 *   scheduleSessionAlerts(segments)   → planifie J+0 … J+6 × 30min + 5min
 *   cancelAllSessionAlerts()          → annule tous les rappels planifiés
 *   speakAlert(message)               → TTS immédiat (fr-FR)
 *   triggerAlertVibration(alertType)  → vibration foreground selon le type
 *   notifySegmentEnd(finished, next?) → notif immédiate fin de segment
 */

import * as Speech from "expo-speech";
import { Platform, Vibration } from "react-native";
import { Audio } from "expo-av";
import Constants, { ExecutionEnvironment } from "expo-constants";

// ── Détection Expo Go Android (SDK 53+ : notifications natives désactivées) ──
const isExpoGo =
  Platform.OS === "android" &&
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Stub minimal — évite le crash sur Expo Go, aucun effet en production
const stubNotifications = {
  setNotificationHandler:                  () => {},
  setNotificationChannelAsync:             async () => {},
  getPermissionsAsync:                     async () => ({ status: "undetermined" }),
  requestPermissionsAsync:                 async () => ({ status: "granted" }),
  scheduleNotificationAsync:               async () => "stub-id",
  getAllScheduledNotificationsAsync:        async () => [],
  cancelScheduledNotificationAsync:        async () => {},
  cancelAllScheduledNotificationsAsync:    async () => {},
  addNotificationReceivedListener:         () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
} as const;

let Notifications: any;
if (isExpoGo) {
  console.warn("[Notif] Expo Go Android détecté — notifications désactivées (build natif requis).");
  Notifications = stubNotifications;
} else {
  try {
    Notifications = require("expo-notifications");
  } catch {
    Notifications = stubNotifications;
  }
}

/* ════════════════════════════════════════════════════════════════
   Handler global — affiche la notif même quand l'app est au premier plan
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
   Canaux Android + noms de sons
   ════════════════════════════════════════════════════════════════ */
const CHANNEL_FIN        = "ndawwune-fin";
const CHANNEL_ALERTS_30  = "ndawwune-alerts-30";
const CHANNEL_ALERTS_5   = "ndawwune-alerts-5";

// Noms des sons copiés dans res/raw/ par le plugin expo-notifications.
// Android : sans extension (res/raw/xxx) — iOS : avec extension.
const ios = Platform.OS === "ios";
const SOUND_FIN = ios ? "finactivite.mp3" : "finactivité";
const SOUND_30  = ios ? "30minutes.mp3"   : "30minutes";
const SOUND_5   = ios ? "5minutes.mp3"    : "5minutes";

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  // ── Canal fin d'activité : finactivite.mp3 + vibration forte ────
  await Notifications.setNotificationChannelAsync(CHANNEL_FIN, {
    name:             "Fin d'activité — Ndaw Wune",
    description:      "Son joué à la fin de chaque activité",
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 250, 600, 250, 600],
    lightColor:       "#1a56db",
    sound:            SOUND_FIN,
    enableVibrate:    true,
    showBadge:        false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // ── Canal rappel 30 min : 30minutes.mp3 + vibration douce ───────
  // Note : sur Android le canal n'est créé qu'une seule fois par installation.
  // Pour changer le son ultérieurement, désinstaller/réinstaller l'app.
  await Notifications.setNotificationChannelAsync(CHANNEL_ALERTS_30, {
    name:             "Rappel 30 min — Ndaw Wune",
    description:      "Rappel 30 minutes avant le début d'une séance",
    importance:       Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
    lightColor:       "#f59e0b",
    sound:            SOUND_30,
    enableVibrate:    true,
    showBadge:        false,
    bypassDnd:        false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // ── Canal rappel 5 min : 5minutes.mp3 + vibration urgente ───────
  await Notifications.setNotificationChannelAsync(CHANNEL_ALERTS_5, {
    name:             "Rappel 5 min — Ndaw Wune",
    description:      "Rappel 5 minutes avant le début d'une séance",
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor:       "#ef4444",
    sound:            SOUND_5,
    enableVibrate:    true,
    showBadge:        false,
    bypassDnd:        false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/* ════════════════════════════════════════════════════════════════
   Initialisation — à appeler une seule fois au démarrage (_layout.tsx)
   ════════════════════════════════════════════════════════════════ */
export async function setupNotifications(): Promise<boolean> {
  await ensureAndroidChannels();

  // Android < 13 (API 33) : pas de permission POST_NOTIFICATIONS requise
  if (Platform.OS === "android" && Number(Platform.Version) < 33) return true;

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
   TTS — lecture vocale en français
   ════════════════════════════════════════════════════════════════ */
export function speakAlert(message: string): void {
  Speech.stop();
  Speech.speak(message, { language: "fr-FR", rate: 0.88, pitch: 1.05 });
}

/* ════════════════════════════════════════════════════════════════
   Type planning segment
   ════════════════════════════════════════════════════════════════ */
export interface PlanningSegment {
  id:          string;
  titre?:      string;
  matiere?:    string;
  classe?:     string;
  /** 0=Lundi, 1=Mardi, 2=Mercredi, 3=Jeudi, 4=Vendredi, 5=Samedi, 6=Dimanche */
  jour:        number;
  heure_debut: string; // "HH:MM" ou "HH:MM:SS"
  heure_fin:   string;
}

/* ════════════════════════════════════════════════════════════════
   Planification des rappels — 7 prochains jours
   ════════════════════════════════════════════════════════════════ */

/** Convertit getDay() JS (0=Dim, 1=Lun…) → convention backend (0=Lun…6=Dim) */
function jsWeekdayToJour(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Planifie (ou re-planifie) les rappels 30 min et 5 min
 * pour les 7 prochains jours.
 *
 * Annule automatiquement les rappels précédents avant de replanifier.
 * À appeler après chaque sync (NetworkWatcher) ou à l'ouverture de l'app (HomeScreen).
 */
export async function scheduleSessionAlerts(
  segments: PlanningSegment[],
): Promise<void> {
  if (segments.length === 0) return;

  await cancelAllSessionAlerts();

  const now     = new Date();
  let scheduled = 0;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    // Date cible (minuit, heure locale)
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + dayOffset);
    targetDate.setHours(0, 0, 0, 0);

    const targetJour = jsWeekdayToJour(targetDate.getDay());
    const daySegs    = segments.filter(s => s.jour === targetJour);
    if (daySegs.length === 0) continue;

    for (const seg of daySegs) {
      const titre  = seg.titre ?? seg.matiere ?? seg.classe ?? "Séance";
      const parts  = seg.heure_debut.split(":").map(Number);
      const h      = parts[0];
      const m      = parts[1];
      const hLabel = `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;

      // Heure exacte de début du segment ce jour-là
      const startTime = new Date(targetDate);
      startTime.setHours(h, m, 0, 0);

      // ── Rappel 30 minutes avant ────────────────────────────────────
      const at30 = new Date(startTime.getTime() - 30 * 60 * 1000);
      if (at30 > now) {
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: `alert-30-${seg.id}-d${dayOffset}`,
            content: {
              title: "🔔 Cours dans 30 minutes",
              body:  `"${titre}" débute à ${hLabel}. Préparez-vous !`,
              sound: SOUND_30,
              data: {
                alertType:       "30min",
                seance:          titre,
                speechMsg:       `Êtes-vous prêt ? La séance "${titre}" commence dans 30 minutes. Préparez votre matériel !`,
                vibrationPattern: [0, 300, 150, 300],
              },
              ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS_30 }),
            },
            trigger: { date: at30 } as any,
          });
          scheduled++;
        } catch (e) {
          console.warn(`[Notif] Erreur rappel 30min (${seg.id}) :`, e);
        }
      }

      // ── Rappel 5 minutes avant ─────────────────────────────────────
      const at5 = new Date(startTime.getTime() - 5 * 60 * 1000);
      if (at5 > now) {
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: `alert-5-${seg.id}-d${dayOffset}`,
            content: {
              title: "⚡ Cours dans 5 minutes !",
              body:  `"${titre}" commence très bientôt. Il est temps d'y aller !`,
              sound: SOUND_5,
              data: {
                alertType:       "5min",
                seance:          titre,
                speechMsg:       `Attention ! Le cours "${titre}" commence dans 5 minutes. Il est temps de commencer !`,
                vibrationPattern: [0, 500, 200, 500, 200, 500],
              },
              ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS_5 }),
            },
            trigger: { date: at5 } as any,
          });
          scheduled++;
        } catch (e) {
          console.warn(`[Notif] Erreur rappel 5min (${seg.id}) :`, e);
        }
      }
    }
  }

  console.log(`[Notif] ${scheduled} rappel(s) planifié(s) pour les 7 prochains jours.`);
}

/**
 * Annule tous les rappels planifiés (30min + 5min).
 * À appeler au logout ou avant une re-planification manuelle.
 */
export async function cancelAllSessionAlerts(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ids = (scheduled as any[])
      .map((n: any) => n.identifier as string)
      .filter(id => id.startsWith("alert-30-") || id.startsWith("alert-5-"));

    await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));

    if (ids.length > 0) {
      console.log(`[Notif] ${ids.length} rappel(s) annulé(s).`);
    }
  } catch (e) {
    console.warn("[Notif] Erreur cancelAllSessionAlerts :", e);
  }
}

/* ════════════════════════════════════════════════════════════════
   Alerte pause longue — déclenché 5 min après la mise en pause
   ════════════════════════════════════════════════════════════════ */
const PAUSE_ALERT_ID = "pause-seance-5min";

/**
 * Planifie une notification qui se déclenche 5 minutes après l'appel.
 * À appeler dès que l'enseignant met l'activité en pause.
 */
export async function schedulePauseAlert(): Promise<void> {
  // Annuler un éventuel rappel précédent avant d'en programmer un nouveau
  await cancelPauseAlert();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: PAUSE_ALERT_ID,
      content: {
        title: "⏸ Activité en pause",
        body: "Votre activité est en pause depuis 5 minutes. Pensez à reprendre ou à terminer la séance.",
        ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS_5 }),
      },
      trigger: { seconds: 5 * 60 } as any,
    });
  } catch (e) {
    console.warn("[Notif] Erreur schedulePauseAlert :", e);
  }
}

/**
 * Annule le rappel de pause (à appeler à la reprise ou à la fin de la séance).
 */
export async function cancelPauseAlert(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(PAUSE_ALERT_ID);
  } catch {}
}

/* ════════════════════════════════════════════════════════════════
   Notification immédiate — fin de segment (utilisée par le timer séance)
   ════════════════════════════════════════════════════════════════ */
export async function playAlarmSound(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS:       true,
      staysActiveInBackground:    true,
      playThroughEarpieceAndroid: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      require("../../assets/sounds/finactivite.mp3"),
    );
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
    });
  } catch (e) {
    console.warn("[AlarmSound] Erreur lecture :", e);
  }
}

/* ════════════════════════════════════════════════════════════════
   Vibration foreground — appelée depuis le listener de _layout.tsx
   quand une notif arrive app ouverte (le canal ne vibre pas en foreground)
   ════════════════════════════════════════════════════════════════ */
export function triggerAlertVibration(alertType: string): void {
  if (alertType === "5min") {
    Vibration.vibrate([0, 500, 200, 500, 200, 500]);
  } else if (alertType === "30min") {
    Vibration.vibrate([0, 300, 150, 300]);
  }
  // "segment_end" est géré directement dans notifySegmentEnd()
}

/* ════════════════════════════════════════════════════════════════
   Wrappers listeners — utilisés par _layout.tsx pour éviter
   l'import direct de expo-notifications (incompatible Expo Go Android)
   ════════════════════════════════════════════════════════════════ */
export async function getNotificationPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export function addNotificationReceivedListener(
  listener: (notification: any) => void,
): { remove: () => void } {
  return Notifications.addNotificationReceivedListener(listener);
}

export function addNotificationResponseReceivedListener(
  listener: (response: any) => void,
): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export async function notifySegmentEnd(
  finishedTitle: string,
  nextTitle?: string,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${finishedTitle} — terminé ✓`,
        body:  nextTitle
          ? `Prochain : ${nextTitle}`
          : "Bonne journée, c'est fini pour aujourd'hui !",
        sound: SOUND_FIN,
        color: "#1a56db",
        ...(Platform.OS === "android" && { channelId: CHANNEL_FIN }),
      },
      trigger: null,
    });

    const voiceMsg = nextTitle
      ? `L'activité "${finishedTitle}" est terminée. Passez à l'activité suivante : "${nextTitle}".`
      : `L'activité "${finishedTitle}" est terminée. C'est fini pour aujourd'hui !`;
    speakAlert(voiceMsg);
    Vibration.vibrate([0, 600, 250, 600, 250, 600]);
    await playAlarmSound();
  } catch (e) {
    console.warn("[Notif] Erreur notifySegmentEnd :", e);
  }
}
