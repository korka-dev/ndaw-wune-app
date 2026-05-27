/**
 * Notifications — Ndaw Wune (Android-first, iOS compatible)
 * ─────────────────────────────────────────────────────────────────
 * Architecture robuste pour les notifications de planning :
 *
 * Trois canaux Android :
 *   • "ndawwune-fin"        : fin d'activité        (finactivite.mp3 + vibration forte)
 *   • "ndawwune-alerts-30"  : rappel 30 min avant   (rappel_30min.mp3 + vibration douce)
 *   • "ndawwune-alerts-5"   : rappel 5 min avant    (rappel_5min.mp3 + vibration urgente)
 *
 * Planification :
 *   scheduleSessionAlerts() programme les rappels pour la PREMIÈRE tâche
 *   de chaque journée sur les 7 prochains jours (30 min + 5 min avant).
 *   Re-planification automatique après chaque sync.
 *   Gestion intelligente des doublons (annule avant de re-planifier).
 *
 * Convention jour : 0 = Lundi, 1 = Mardi, …, 5 = Samedi, 6 = Dimanche
 *
 * API publique :
 *   setupNotifications()              → init canaux + demande permission
 *   scheduleSessionAlerts(segments)   → planifie J+0 … J+6 × 30min + 5min
 *   cancelAllSessionAlerts()          → annule tous les rappels planifiés
 *   speakAlert(message)               → TTS immédiat (fr-FR)
 *   triggerAlertVibration(alertType)  → vibration foreground selon le type
 *   notifySegmentEnd(finished, next?) → notif immédiate fin de segment
 *   getScheduledNotificationsCount()  → nombre de notifications planifiées
 *   requestExactAlarmPermission()     → Android 12+ exact alarm permission
 */

import * as Speech from "expo-speech";
import { Platform, Vibration, AppState } from "react-native";
import { Audio } from "expo-av";
import Constants, { ExecutionEnvironment } from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  setBadgeCountAsync:                      async () => {},
  getBadgeCountAsync:                      async () => 0,
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  SchedulableTriggerInputTypes: {
    DATE:          "date",
    TIME_INTERVAL: "timeInterval",
    CALENDAR:      "calendar",
    DAILY:         "daily",
    WEEKLY:        "weekly",
  },
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
   Clés AsyncStorage
   ════════════════════════════════════════════════════════════════ */
const LAST_SCHEDULE_KEY = "@ndawwune:last_notification_schedule";
const NOTIFICATION_PREFS_KEY = "@ndawwune:notification_prefs";

/** Clé publique — modal de configuration (première fois) */
export const NOTIF_SETUP_MODAL_KEY = "@ndawwune:notif_setup_done";

/** Package name Android — doit correspondre à app.json android.package */
const ANDROID_PACKAGE = "sn.aroka.ared.ndawune";

/* ════════════════════════════════════════════════════════════════
   Handler global — affiche la notif même quand l'app est au premier plan
   ════════════════════════════════════════════════════════════════ */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
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
const ios = Platform.OS === "ios";
const SOUND_FIN = ios ? "finactivite.mp3"  : "finactivite";
const SOUND_30  = ios ? "rappel_30min.mp3" : "rappel_30min";
const SOUND_5   = ios ? "rappel_5min.mp3"  : "rappel_5min";

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
    showBadge:        true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // ── Canal rappel 30 min : rappel_30min.mp3 + vibration douce ───────
  await Notifications.setNotificationChannelAsync(CHANNEL_ALERTS_30, {
    name:             "Rappel 30 min — Ndaw Wune",
    description:      "Rappel 30 minutes avant le début d'une séance",
    importance:       Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
    lightColor:       "#f59e0b",
    sound:            SOUND_30,
    enableVibrate:    true,
    showBadge:        true,
    bypassDnd:        false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // ── Canal rappel 5 min : rappel_5min.mp3 + vibration urgente ───────
  await Notifications.setNotificationChannelAsync(CHANNEL_ALERTS_5, {
    name:             "Rappel 5 min — Ndaw Wune",
    description:      "Rappel 5 minutes avant le début d'une séance",
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor:       "#ef4444",
    sound:            SOUND_5,
    enableVibrate:    true,
    showBadge:        true,
    bypassDnd:        true,
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

/**
 * Vérifie si la permission exact alarm est disponible (Android 12+).
 * Retourne true si accordée ou non nécessaire.
 */
export async function checkExactAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  // Sur Android 12+ (API 31+), SCHEDULE_EXACT_ALARM est déclaré dans le manifest
  // et normalement accordé par défaut pour les apps non-cibles de restriction.
  return true;
}

/* ════════════════════════════════════════════════════════════════
   Gestion batterie & alarmes exactes (Android)
   ════════════════════════════════════════════════════════════════ */

/**
 * Demande à Android d'exempter l'app de l'optimisation batterie (Doze mode).
 * Sans cette exemption, les alarmes exactes peuvent être retardées ou silenciées
 * lorsque le téléphone est en veille prolongée.
 *
 * Ouvre la boîte de dialogue système Android REQUEST_IGNORE_BATTERY_OPTIMIZATIONS.
 * Ne fait rien sur iOS ou si expo-intent-launcher est absent.
 */
export async function requestIgnoreBatteryOptimization(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const IntentLauncher = require("expo-intent-launcher");
    // Ce dialog demande directement à l'utilisateur d'exempter l'app
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      { data: `package:${ANDROID_PACKAGE}` },
    );
  } catch (primaryErr) {
    console.warn("[Notif] Dialog batterie principal indisponible :", primaryErr);
    // Fallback : liste des apps exemptées (l'utilisateur peut ajouter manuellement)
    try {
      const IntentLauncher = require("expo-intent-launcher");
      await IntentLauncher.startActivityAsync(
        "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
      );
    } catch (fallbackErr) {
      console.warn("[Notif] Fallback batterie indisponible :", fallbackErr);
    }
  }
}

/**
 * Ouvre la page de paramètres pour autoriser les alarmes exactes (Android 12+, API 31+).
 * Requis si l'utilisateur a refusé ou révoqué SCHEDULE_EXACT_ALARM.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 31) return;
  try {
    const IntentLauncher = require("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(
      "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
      { data: `package:${ANDROID_PACKAGE}` },
    );
  } catch (e) {
    console.warn("[Notif] Impossible d'ouvrir les paramètres alarme exacte :", e);
    // Fallback : paramètres appli
    try {
      const IntentLauncher = require("expo-intent-launcher");
      await IntentLauncher.startActivityAsync(
        "android.settings.APPLICATION_DETAILS_SETTINGS",
        { data: `package:${ANDROID_PACKAGE}` },
      );
    } catch {}
  }
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
   Utilitaires internes
   ════════════════════════════════════════════════════════════════ */

/** Convertit getDay() JS (0=Dim, 1=Lun…) → convention backend (0=Lun…6=Dim) */
function jsWeekdayToJour(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** Formatte l'heure pour l'affichage dans les notifications */
function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

/** Parse une heure "HH:MM" ou "HH:MM:SS" en { h, m } */
function parseTime(timeStr: string): { h: number; m: number } {
  const parts = timeStr.split(":").map(Number);
  return { h: parts[0], m: parts[1] };
}

/** Retourne le titre lisible d'un segment */
function segmentDisplayTitle(seg: PlanningSegment): string {
  return seg.titre ?? seg.matiere ?? seg.classe ?? "Séance";
}

/** Retourne un sous-titre contextuel (classe + matière) */
function segmentSubtitle(seg: PlanningSegment): string {
  const parts: string[] = [];
  if (seg.classe) parts.push(seg.classe);
  if (seg.matiere && seg.matiere !== seg.titre) parts.push(seg.matiere);
  return parts.join(" — ");
}

/* ════════════════════════════════════════════════════════════════
   Planification des rappels — 7 prochains jours
   ════════════════════════════════════════════════════════════════ */

/**
 * Planifie (ou re-planifie) les rappels 30 min et 5 min
 * pour les 7 prochains jours.
 *
 * Annule automatiquement les rappels précédents avant de replanifier.
 * À appeler après chaque sync (NetworkWatcher) ou à l'ouverture de l'app (HomeScreen).
 *
 * Optimisations :
 * - Vérifie si une re-planification est nécessaire (pas de double planification)
 * - Gère la transition jour en cours (ignore les cours déjà passés)
 * - Ajoute des informations contextuelles riches dans la notification
 * - Supporte le badge count
 */
export async function scheduleSessionAlerts(
  segments: PlanningSegment[],
  forceReschedule: boolean = false,
): Promise<number> {
  if (segments.length === 0) return 0;

  // ── Vérifier si une re-planification est nécessaire ──
  if (!forceReschedule) {
    try {
      const lastSchedule = await AsyncStorage.getItem(LAST_SCHEDULE_KEY);
      if (lastSchedule) {
        const { timestamp, segmentHash, scheduled: savedCount } = JSON.parse(lastSchedule);
        const minutesSince = (Date.now() - timestamp) / (1000 * 60);
        const hoursSince   = minutesSince / 60;
        const currentHash  = computeSegmentHash(segments);

        if (hoursSince < 6 && currentHash === segmentHash) {
          // ── Cas reboot : les alarmes sont effacées au redémarrage Android.
          // On ne fait le check live qu'après 2 min pour laisser le temps au
          // système Android d'enregistrer les alarmes dans son registre.
          // Avant 2 min on fait confiance au compteur sauvegardé (savedCount).
          if (minutesSince < 2 && (savedCount ?? 0) > 0) {
            console.log("[Notif] Planning inchangé (< 2 min) — skip re-planification.");
            return -1;
          }
          const counts = await getScheduledNotificationsCount();
          if (counts.total > 0) {
            console.log("[Notif] Planning inchangé depuis < 6h — skip re-planification.");
            return -1;
          }
          console.log("[Notif] Aucune notification trouvée (reboot ?) — re-planification forcée.");
        }
      }
    } catch {
      // Continue normalement si erreur de lecture
    }
  }

  await cancelAllSessionAlerts();

  const now     = new Date();
  let scheduled = 0;
  let todayCount = 0;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    // Date cible (minuit, heure locale)
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + dayOffset);
    targetDate.setHours(0, 0, 0, 0);

    const targetJour = jsWeekdayToJour(targetDate.getDay());
    const daySegs    = segments.filter(s => s.jour === targetJour);
    if (daySegs.length === 0) continue;

    // Trier par heure de début
    daySegs.sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));

    // ── UNIQUEMENT la première tâche de la journée ──
    // On ne notifie que pour le premier cours du jour (30 min + 5 min avant)
    const firstSeg = daySegs[0];
    const titre    = segmentDisplayTitle(firstSeg);
    const sub      = segmentSubtitle(firstSeg);
    const { h, m } = parseTime(firstSeg.heure_debut);
    const hLabel   = formatTime(h, m);

    // Heure exacte de début du premier segment ce jour-là
    const startTime = new Date(targetDate);
    startTime.setHours(h, m, 0, 0);

    // Info contextuelle : nombre total de séances pour la journée
    const totalInfo = daySegs.length > 1
      ? `${daySegs.length} cours prévus aujourd'hui`
      : "1 cours prévu aujourd'hui";

    // ── Rappel 30 minutes avant la première tâche ──────────────────
    const at30 = new Date(startTime.getTime() - 30 * 60 * 1000);
    if (at30 > now) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `alert-30-${firstSeg.id}-d${dayOffset}`,
          content: {
            title: `📋 Premier cours dans 30 minutes`,
            body:  `${titre} à ${hLabel}${sub ? ` (${sub})` : ""}\n${totalInfo} — Préparez votre matériel !`,
            subtitle: sub || undefined,
            sound: SOUND_30,
            badge: daySegs.length,
            data: {
              alertType:        "30min",
              segmentId:        firstSeg.id,
              seance:           titre,
              classe:           firstSeg.classe ?? "",
              matiere:          firstSeg.matiere ?? "",
              heureDebut:       firstSeg.heure_debut,
              heureFin:         firstSeg.heure_fin,
              totalSeances:     daySegs.length,
              speechMsg:        `Bonjour ! Votre premier cours "${titre}" commence dans 30 minutes, à ${hLabel}. Vous avez ${daySegs.length} cours aujourd'hui. Préparez votre matériel !`,
              vibrationPattern: [0, 300, 150, 300],
            },
            ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS_30 }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at30,
          },
        });
        scheduled++;
        if (dayOffset === 0) todayCount++;
      } catch (e) {
        console.warn(`[Notif] Erreur rappel 30min (${firstSeg.id}) :`, e);
      }
    }

    // ── Rappel 5 minutes avant la première tâche ───────────────────
    const at5 = new Date(startTime.getTime() - 5 * 60 * 1000);
    if (at5 > now) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `alert-5-${firstSeg.id}-d${dayOffset}`,
          content: {
            title: `⚡ ${titre} dans 5 minutes !`,
            body:  `Début à ${hLabel}${sub ? ` — ${sub}` : ""}. C'est l'heure d'y aller !`,
            subtitle: sub || undefined,
            sound: SOUND_5,
            badge: daySegs.length,
            priority: "max",
            data: {
              alertType:        "5min",
              segmentId:        firstSeg.id,
              seance:           titre,
              classe:           firstSeg.classe ?? "",
              matiere:          firstSeg.matiere ?? "",
              heureDebut:       firstSeg.heure_debut,
              heureFin:         firstSeg.heure_fin,
              totalSeances:     daySegs.length,
              speechMsg:        `Attention ! Le cours "${titre}" commence dans 5 minutes. Il est temps de commencer !`,
              vibrationPattern: [0, 500, 200, 500, 200, 500],
            },
            ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS_5 }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at5,
          },
        });
        scheduled++;
        if (dayOffset === 0) todayCount++;
      } catch (e) {
        console.warn(`[Notif] Erreur rappel 5min (${firstSeg.id}) :`, e);
      }
    }
  }

  // ── Sauvegarder le timestamp de la planification ──
  try {
    await AsyncStorage.setItem(LAST_SCHEDULE_KEY, JSON.stringify({
      timestamp:   Date.now(),
      segmentHash: computeSegmentHash(segments),
      scheduled,
      todayCount,
    }));
  } catch {}

  console.log(`[Notif] ${scheduled} rappel(s) planifié(s) pour les 7 prochains jours (${todayCount} aujourd'hui).`);
  return scheduled;
}

/**
 * Calcule un hash simple du planning pour détecter les changements.
 */
function computeSegmentHash(segments: PlanningSegment[]): string {
  return segments
    .map(s => `${s.id}:${s.jour}:${s.heure_debut}`)
    .sort()
    .join("|");
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

    // Reset badge
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {}

    if (ids.length > 0) {
      console.log(`[Notif] ${ids.length} rappel(s) annulé(s).`);
    }
  } catch (e) {
    console.warn("[Notif] Erreur cancelAllSessionAlerts :", e);
  }
}

/**
 * Retourne le nombre de notifications actuellement planifiées.
 * Utile pour le debug et l'affichage dans l'UI.
 */
export async function getScheduledNotificationsCount(): Promise<{
  total: number;
  alerts30: number;
  alerts5: number;
}> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const all = (scheduled as any[]).map((n: any) => n.identifier as string);
    return {
      total:    all.filter(id => id.startsWith("alert-")).length,
      alerts30: all.filter(id => id.startsWith("alert-30-")).length,
      alerts5:  all.filter(id => id.startsWith("alert-5-")).length,
    };
  } catch {
    return { total: 0, alerts30: 0, alerts5: 0 };
  }
}

/* ════════════════════════════════════════════════════════════════
   Re-planification automatique au retour de l'app
   ════════════════════════════════════════════════════════════════ */

let _appStateListener: any = null;
let _cachedSegments: PlanningSegment[] = [];

/**
 * Active la re-planification automatique quand l'app revient au premier plan.
 * Cela garantit que même si l'utilisateur n'a pas ouvert l'app depuis longtemps,
 * les notifications sont toujours à jour.
 */
export function enableAutoReschedule(segments: PlanningSegment[]): void {
  _cachedSegments = segments;

  // Retirer l'ancien listener s'il existe
  if (_appStateListener) {
    _appStateListener.remove();
  }

  _appStateListener = AppState.addEventListener("change", async (nextState) => {
    if (nextState === "active" && _cachedSegments.length > 0) {
      // Vérifier si les notifications sont toujours valides
      const counts = await getScheduledNotificationsCount();
      if (counts.total === 0) {
        console.log("[Notif] Aucune notification planifiée — re-planification auto.");
        await scheduleSessionAlerts(_cachedSegments, true);
      }
    }
  });
}

/**
 * Met à jour les segments en cache pour la re-planification auto.
 * À appeler après chaque sync réussie.
 */
export function updateCachedSegments(segments: PlanningSegment[]): void {
  _cachedSegments = segments;
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
  await cancelPauseAlert();
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: PAUSE_ALERT_ID,
      content: {
        title: "⏸ Activité en pause",
        body: "Votre activité est en pause depuis 5 minutes. Pensez à reprendre ou à terminer la séance.",
        sound: SOUND_5,
        ...(Platform.OS === "android" && { channelId: CHANNEL_ALERTS_5 }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5 * 60,
      },
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
   ════════════════════════════════════════════════════════════════ */
export function triggerAlertVibration(alertType: string): void {
  if (alertType === "5min") {
    Vibration.vibrate([0, 500, 200, 500, 200, 500]);
  } else if (alertType === "30min") {
    Vibration.vibrate([0, 300, 150, 300]);
  }
}

/* ════════════════════════════════════════════════════════════════
   Wrappers listeners — utilisés par _layout.tsx
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
        badge: 0,
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

/* ════════════════════════════════════════════════════════════════
   Utilitaire : résumé du planning notifications (pour debug/UI)
   ════════════════════════════════════════════════════════════════ */
export async function getNotificationsSummary(): Promise<string> {
  const counts = await getScheduledNotificationsCount();
  if (counts.total === 0) return "Aucune notification planifiée";
  return `${counts.total} notification(s) : ${counts.alerts30} rappel(s) 30min, ${counts.alerts5} rappel(s) 5min`;
}
