/**
 * Écran Accueil — Timer de segment + Planning du jour.
 * Design identique à la maquette Ndaw Wune v2.
 * Adapté à tous les appareils via useSafeAreaInsets.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Modal, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore }                          from "../store/useStore";
import { seancesApi, rapportsApi, syncApi } from "../services/api";
import { enqueueAction, upsertRapportCache } from "../services/db";
import { rs, rf }                  from "../utils/responsive";
import { C }                       from "../utils/theme";
import { useFocusEffect, useRouter } from "expo-router";
import AppHeader                   from "../components/AppHeader";
import ProfileSheet                from "../components/ProfileSheet";
import {
  notifySegmentEnd,
  scheduleSessionAlerts,
  enableAutoReschedule,
  updateCachedSegments,
  schedulePauseAlert,
  cancelPauseAlert,
  NOTIF_SETUP_MODAL_KEY,
} from "../services/notifications";
import NotificationSetupModal from "../components/NotificationSetupModal";

/* ── Utilitaires ─────────────────────────────────────────────── */
function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(secs: number) {
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}
/** Convertit "HH:MM:SS" ou "HH:MM" en minutes depuis minuit */
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function segDurMin(debut: string, fin: string): number {
  return Math.max(0, toMin(fin) - toMin(debut));
}
/** Convertit des minutes depuis minuit en "HH:MM" */
function toHHMM(totalMin: number): string {
  const m = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function segTitle(seg: any): string { return seg.titre ?? seg.matiere ?? seg.classe ?? ""; }

const JOURS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

/* ── Composant ───────────────────────────────────────────────── */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, syncData, activeSeance, setActiveSeance, isOnline, syncOffline } = useStore();
  const planning = syncData?.planning ?? [];

  const jsDay     = new Date().getDay();
  const todayIdx  = jsDay === 0 ? 6 : jsDay - 1;
  const todayPlan = [...planning]
    .filter(p => p.jour === todayIdx)
    .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));

  /**
   * Prochain jour avec un planning.
   * Cherche jusqu'à 7 jours en avant (cycle hebdomadaire).
   */
  const nextScheduledDay = useMemo(() => {
    for (let offset = 1; offset <= 7; offset++) {
      const dayIdx = (todayIdx + offset) % 7;
      const segs   = [...planning]
        .filter(p => p.jour === dayIdx)
        .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
      if (segs.length > 0) {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return { dayIdx, segs, offset, date: d };
      }
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planning, todayIdx]);

  /* ── État démarrage explicite de la séance ── */
  const [seanceStarted, setSeanceStarted] = useState(false);
  /* Liste des segments complétés aujourd'hui */
  const [completedSegIds, setCompletedSegIds] = useState<string[]>([]);
  /* Liste des segments manqués aujourd'hui (non démarrés après heure de fin) */
  const [missedSegIds, setMissedSegIds] = useState<string[]>([]);
  /* Segment manqué à afficher dans la carte d'alerte (null = pas d'alerte) */
  const [missedAlertSeg, setMissedAlertSeg] = useState<any>(null);

  /* Clés AsyncStorage du jour */
  const todayKey = new Date().toISOString().split("T")[0];

  /* Charger les segments déjà complétés et manqués depuis la persistance */
  useEffect(() => {
    const load = async () => {
      try {
        const [completedRaw, missedRaw] = await Promise.all([
          AsyncStorage.getItem(`completed-segs-${todayKey}`),
          AsyncStorage.getItem(`missed-segs-${todayKey}`),
        ]);
        if (completedRaw) setCompletedSegIds(JSON.parse(completedRaw));
        if (missedRaw)    setMissedSegIds(JSON.parse(missedRaw));
      } catch {}
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayCompleted = todayPlan.length > 0 &&
    todayPlan.every(seg => completedSegIds.includes(seg.id) || missedSegIds.includes(seg.id));

  // Vrai si la journée est "terminée" mais qu'aucune tâche n'a été complétée
  const dayAllMissed = dayCompleted &&
    !todayPlan.some(seg => completedSegIds.includes(seg.id));

  /* ── Modal configuration notifications (première fois) ── */
  const [showNotifSetup, setShowNotifSetup] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_SETUP_MODAL_KEY)
      .then(val => { if (!val) setShowNotifSetup(true); })
      .catch(() => {});
  }, []);

  /* Sync manuelle */
  const [syncing, setSyncing] = useState(false);

  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      // Invalide d'abord le cache Redis côté serveur → garantit des données fraîches
      await syncApi.invalidate().catch(() => {});
      await syncOffline(true);
    } catch {}
    finally { setSyncing(false); }
  };

  /* ── Replanification des alertes vocales au focus ── */
  /* La sync elle-même est gérée centralement par NetworkWatcher (polling 30 s). */
  useFocusEffect(
    useCallback(() => {
      const { syncData: sd } = useStore.getState();
      const segs = sd?.planning ?? [];
      // Planifier les notifications (skip si planning inchangé < 6h)
      scheduleSessionAlerts(segs).catch(() => {});
      // Activer la re-planification auto quand l'app revient au premier plan
      enableAutoReschedule(segs);
      // Mettre à jour le cache pour la re-planification auto
      updateCachedSegments(segs);
    }, [])
  );

  // ── Horloge : force un re-rendu périodique pour réévaluer l'heure courante
  //    (ex: déblocage du bouton "Démarrer" 5 minutes avant le créneau) ──
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Chronomètre / Timer Manuel de l'activité en cours ── */
  const TIMER_STATE_KEY = "timer_pause_state";

  const [elapsed,       setElapsed]       = useState(0);
  const [isPaused,      setIsPaused]      = useState(false);
  // Timestamp (ms) auquel la pause a commencé
  const [pausedAt,      setPausedAt]      = useState<number | null>(null);
  // Durée totale des pauses accumulées (ms) — pour calculer le temps réel actif
  const [totalPausedMs, setTotalPausedMs] = useState(0);
  // Historique des pauses pour envoi au serveur : [{paused_at, resumed_at?}]
  const [pauseEvents, setPauseEvents] = useState<{paused_at: string; resumed_at?: string}[]>([]);

  // ── Guard : évite d'envoyer la notif de fin plusieurs fois pour la même séance ──
  const notifiedEndRef = useRef(false);

  // ── Restaurer l'état de pause depuis AsyncStorage au montage / changement de séance ──
  useEffect(() => {
    if (!activeSeance) {
      setSeanceStarted(false);
      setElapsed(0);
      setIsPaused(false);
      setPausedAt(null);
      setTotalPausedMs(0);
      setPauseEvents([]);
      notifiedEndRef.current = false; // réinitialiser pour la prochaine séance
      return;
    }
    setSeanceStarted(true);
    // Charger l'état persisté pour cette séance
    AsyncStorage.getItem(TIMER_STATE_KEY)
      .then(raw => {
        if (!raw) return;
        try {
          const saved = JSON.parse(raw);
          if (saved.seanceId !== activeSeance.id) return; // état d'une autre séance
          const savedTotalPausedMs = saved.totalPausedMs ?? 0;
          setIsPaused(saved.isPaused ?? false);
          setPausedAt(saved.pausedAt ?? null);
          setTotalPausedMs(savedTotalPausedMs);
          setPauseEvents(saved.pauseEvents ?? []);

          // Si la séance était en pause au moment du kill, recalculer
          // l'elapsed exact à l'instant de la pause (le timer ne tourne pas en pause)
          if (saved.isPaused && saved.pausedAt) {
            const start = new Date(activeSeance.started_at).getTime();
            const elapsedAtPause = Math.floor(
              (saved.pausedAt - start - savedTotalPausedMs) / 1000
            );
            setElapsed(Math.max(0, elapsedAtPause));
          }
        } catch {}
      })
      .catch(() => {});
  }, [activeSeance?.id]); // eslint-disable-line

  // ── Timer : s'actualise chaque seconde, soustrait les pauses accumulées ──
  useEffect(() => {
    if (!activeSeance || isPaused) return;
    const start = new Date(activeSeance.started_at).getTime();
    const update = () => {
      const sec = Math.floor((Date.now() - start - totalPausedMs) / 1000);
      setElapsed(Math.max(0, sec));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeSeance, isPaused, totalPausedMs]);

  /* ── Calcul basé sur l'heure réelle ── */
  const now    = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const curSec = curMin * 60 + now.getSeconds();

  // Segments non encore complétés ni manqués — dans l'ordre du planning
  const pendingSegs = todayPlan.filter(
    seg => !completedSegIds.includes(seg.id) && !missedSegIds.includes(seg.id)
  );
  // Segment actif : le premier non complété ni manqué; nextSeg : le suivant (pour la notif de fin)
  const activeSeg = pendingSegs[0] ?? null;
  const nextSeg   = pendingSegs[1] ?? null;

  // La restriction "5 minutes avant l'heure de début" ne s'applique qu'à la
  // toute première tâche de la journée. Pour les suivantes, on laisse la main.
  const isFirstTaskOfDay = activeSeg ? todayPlan[0]?.id === activeSeg.id : false;
  const canStartActiveSeg = activeSeg
    ? (isFirstTaskOfDay ? curMin >= toMin(activeSeg.heure_debut) - 5 : true)
    : false;

  const durMin  = activeSeg ? segDurMin(activeSeg.heure_debut, activeSeg.heure_fin) : 0;
  const durSec  = durMin * 60;
  const remainSec = activeSeance ? Math.max(0, durSec - elapsed) : durSec;
  const progress = durSec > 0 ? (durSec - remainSec) / durSec : 0;

  /* ── Détection et signalement des tâches manquées ────────────────────────── */
  // Parcourt TOUS les segments du jour : si l'heure de fin est passée et que
  // le segment n'est ni complété ni manqué ni en cours → le marquer comme manqué.
  useEffect(() => {
    if (activeSeance) return; // ne pas marquer pendant une séance en cours

    const newlyMissed: string[] = [];
    for (const seg of todayPlan) {
      if (completedSegIds.includes(seg.id)) continue;
      if (missedSegIds.includes(seg.id))    continue;
      if (toMin(seg.heure_debut) > curMin)  break; // pas encore commencé → ne peut pas être manqué
      if (toMin(seg.heure_fin) > curMin)    break; // en cours → pas encore manqué
      newlyMissed.push(seg.id);
    }
    if (newlyMissed.length === 0) return;

    const updated = [...missedSegIds, ...newlyMissed];
    setMissedSegIds(updated);
    AsyncStorage.setItem(`missed-segs-${todayKey}`, JSON.stringify(updated)).catch(() => {});

    // Afficher la carte d'alerte pour le premier segment nouvellement manqué
    const firstMissed = todayPlan.find(s => s.id === newlyMissed[0]);
    if (firstMissed) setMissedAlertSeg(firstMissed);

    // Signaler chaque tâche manquée au backend (fire-and-forget ou queue offline)
    const sessionId = syncData?.active_session?.id ?? "";
    for (const segId of newlyMissed) {
      const seg = todayPlan.find(s => s.id === segId);
      if (!seg || !sessionId) continue;
      const payload = {
        session_id:           sessionId,
        planning_segment_id:  seg.id,
        classe:               seg.classe ?? "—",
        matiere:              seg.matiere ?? null,
        date_seance:          new Date().toISOString(),
        heure_debut:          seg.heure_debut,
        heure_fin:            seg.heure_fin,
      };
      if (isOnline) {
        seancesApi.reportMissed(payload).catch(() => {
          enqueueAction("REPORT_MISSED_SEANCE", payload);
        });
      } else {
        enqueueAction("REPORT_MISSED_SEANCE", payload);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curMin, activeSeance]);

  /* ── Détection fin de segment → notification (une seule fois par séance) ── */
  useEffect(() => {
    if (activeSeance && remainSec === 0 && elapsed > 0 && !notifiedEndRef.current) {
      notifiedEndRef.current = true;
      notifySegmentEnd(
        activeSeg ? segTitle(activeSeg) : "Séance en cours",
        nextSeg ? segTitle(nextSeg) : undefined,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainSec, activeSeance, elapsed]);

  const handlePause = () => {
    if (!activeSeance) return;
    const nowMs  = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    setIsPaused(true);
    setPausedAt(nowMs);

    // Ajouter l'événement dans la liste locale
    const newPauseEvents = [...pauseEvents, { paused_at: nowIso }];
    setPauseEvents(newPauseEvents);

    // Persister pour survie au background
    AsyncStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
      seanceId:    activeSeance.id,
      isPaused:    true,
      pausedAt:    nowMs,
      totalPausedMs,
      pauseEvents: newPauseEvents,
    })).catch(() => {});

    // Envoyer au serveur (fire-and-forget) — ou mettre en queue offline
    const seanceId = activeSeance.id;
    if (isOnline && !seanceId.startsWith("offline-")) {
      seancesApi.pause(seanceId, nowIso).catch(() => {
        // Échec réseau : sera réconcilié via le payload de finish
      });
    } else {
      enqueueAction("PAUSE_SEANCE", { seance_id: seanceId, paused_at: nowIso });
    }

    // Notification si toujours en pause dans 5 min
    schedulePauseAlert().catch(() => {});
  };

  const handleResume = () => {
    if (!activeSeance) return;
    const nowMs       = Date.now();
    const nowIso      = new Date(nowMs).toISOString();
    const addedMs     = pausedAt ? nowMs - pausedAt : 0;
    const newTotalPausedMs = totalPausedMs + addedMs;

    setIsPaused(false);
    setPausedAt(null);
    setTotalPausedMs(newTotalPausedMs);

    // Fermer le dernier événement de pause
    const newPauseEvents = pauseEvents.map((e, i) =>
      i === pauseEvents.length - 1 && !e.resumed_at
        ? { ...e, resumed_at: nowIso }
        : e
    );
    setPauseEvents(newPauseEvents);

    // Persister l'état repris
    AsyncStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
      seanceId:      activeSeance.id,
      isPaused:      false,
      pausedAt:      null,
      totalPausedMs: newTotalPausedMs,
      pauseEvents:   newPauseEvents,
    })).catch(() => {});

    // Envoyer la reprise au serveur
    const seanceId = activeSeance.id;
    if (isOnline && !seanceId.startsWith("offline-")) {
      seancesApi.resume(seanceId, nowIso).catch(() => {});
    } else {
      enqueueAction("RESUME_SEANCE", { seance_id: seanceId, resumed_at: nowIso });
    }

    // Annuler l'alerte de pause
    cancelPauseAlert().catch(() => {});
  };

  const handleStartSeance = () => {
    if (!activeSeg) return;
    if (!canStartActiveSeg) {
      Alert.alert(
        "Pas encore disponible",
        `Vous pourrez démarrer cette activité à partir de ${toHHMM(toMin(activeSeg.heure_debut) - 5)}, soit 5 minutes avant son heure de début (${activeSeg.heure_debut.slice(0, 5)}).`
      );
      return;
    }
    const startedAt  = new Date().toISOString();
    const localId    = `offline-seance-${Date.now()}`;
    const sessionId  = syncData?.active_session?.id ?? "";
    const classeVal  = activeSeg.classe?.trim() || "—";
    const matiereVal = activeSeg.matiere ?? null;

    // ── 1. Démarrer IMMÉDIATEMENT avec un ID local provisoire ───────────────
    setActiveSeance({
      id:         localId,
      classe:     classeVal,
      matiere:    matiereVal,
      started_at: startedAt,
      session_id: sessionId,
    });
    setSeanceStarted(true);
    setElapsed(0);
    setIsPaused(false);
    notifiedEndRef.current = false; // nouvelle séance → réinitialiser le guard

    // Sauvegarder le payload de démarrage pour la réconciliation offline
    const _startPayload = {
      classe:              classeVal,
      matiere:             matiereVal,
      planning_segment_id: activeSeg.id ?? null,
      session_id:          sessionId,
      date_seance:         startedAt,
      started_at:          startedAt,
    };
    AsyncStorage.setItem(`start_payload_${localId}`, JSON.stringify(_startPayload)).catch(() => {});

    // ── 2. Enregistrer sur le serveur en arrière-plan ───────────────────────
    if (isOnline) {
      seancesApi
        .start({
          classe:               classeVal,
          matiere:              matiereVal,
          planning_segment_id:  activeSeg.id ?? null,
          session_id:           sessionId,
          date_seance:          startedAt,   // date du jour (ISO 8601)
          started_at:           startedAt,
        })
        .then(({ data }) => {
          // Remplacer l'ID local par l'ID réel du serveur si la séance est toujours active
          const current = useStore.getState().activeSeance;
          if (current?.id === localId) {
            setActiveSeance({
              ...current,
              id:         data.id,
              started_at: data.started_at ?? startedAt,
            });
          }
        })
        .catch(() => {
          // Échec réseau : on garde l'ID local, la séance sera réconciliée plus tard
        });
    }
  };



  /* ── Profil ── */
  const [showProfile,   setShowProfile]   = useState(false);

  /* ── Tâches non faites (modal "Voir plus") ── */
  const [showPendingTasks, setShowPendingTasks] = useState(false);

  /* ── Rapport modal ── */
  const [showRapport, setShowRapport] = useState(false);
  const [presences,   setPresences]   = useState(0);
  const [segsDone,    setSegsDone]    = useState<boolean | null>(null);
  const [bilan,       setBilan]       = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const canSend = segsDone !== null && bilan !== null;

  const resetForm = () => { setPresences(0); setSegsDone(null); setBilan(null); setCommentaire(""); };

  // Bouton "Terminer" → demande confirmation avant d'agir
  const handleFinishPress = () => {
    Alert.alert(
      "Terminer l'activité ?",
      "Êtes-vous sûr de vouloir terminer cette séance ?",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Terminer", style: "destructive", onPress: handleFinishSeance },
      ],
      { cancelable: true }
    );
  };

  const handleFinishSeance = async () => {
    // Garde : éviter les double-appels
    if (submitting || !activeSeance) return;
    setSubmitting(true);

    // ── Capture immédiate des valeurs (avant que le state change) ───────────
    const seanceId    = activeSeance.id;
    const classe      = activeSeance.classe;
    const matiere     = activeSeance.matiere ?? null;
    const startedAt   = activeSeance.started_at;
    const finishedAt  = new Date().toISOString();
    // Durée réelle = temps écoulé depuis le démarrage, hors pauses (minimum 1 min)
    const startMs     = new Date(startedAt).getTime();
    const dureeMinutes = Math.max(1, Math.round((Date.now() - startMs - totalPausedMs) / 60000));
    const totalPausedMin = Math.round(totalPausedMs / 60000);
    const segId = activeSeg?.id ?? null;
    // Capturer les pauses AVANT de réinitialiser l'état
    const snapshotPauseEvents = [...pauseEvents];

    // ── 1. Mise à jour locale IMMÉDIATE — ne pas attendre le serveur ────────
    // Annuler l'alerte de pause en cours + nettoyer l'état persisté
    cancelPauseAlert().catch(() => {});
    AsyncStorage.removeItem(TIMER_STATE_KEY).catch(() => {});

    setActiveSeance(null);
    setSeanceStarted(false);
    setIsPaused(false);
    setPausedAt(null);
    setTotalPausedMs(0);
    setPauseEvents([]);
    setElapsed(0);

    if (segId) {
      const newCompleted = [...completedSegIds, segId];
      setCompletedSegIds(newCompleted);
      // Persistance AsyncStorage en fire-and-forget
      const key = `completed-segs-${new Date().toISOString().split("T")[0]}`;
      AsyncStorage.setItem(key, JSON.stringify(newCompleted)).catch(() => {});
    }

    setSubmitting(false);

    // ── 2. Sync serveur en arrière-plan (ne bloque JAMAIS l'UI) ─────────────
    const isOfflineSeance = seanceId.startsWith("offline-");

    if (isOnline && !isOfflineSeance) {
      // Appel API sans await → l'écran s'est déjà mis à jour
      seancesApi
        .finish(seanceId, {
          finished_at:          finishedAt,
          duree_minutes:        dureeMinutes,
          pauses:               snapshotPauseEvents,
          total_paused_minutes: totalPausedMin,
        })
        .then(() =>
          rapportsApi.submit({
            seance_id:       seanceId,
            contenu:         "Séance complétée avec succès.",
            points_positifs: "Séance complétée",
            difficultes:     null,
            soumis_en_offline: false,
          })
        )
        .then(() => {
          try {
            upsertRapportCache({
              id:              `${seanceId}-rapport`,
              seance_id:       seanceId,
              classe,
              matiere,
              date_seance:     startedAt ?? finishedAt,
              contenu:         "Séance complétée avec succès.",
              points_positifs: "Séance complétée",
              difficultes:     null,
              synced:          1,
            });
          } catch {}
        })
        .catch(() => {
          // Serveur injoignable → on queue pour sync ultérieure
          try {
            const localId = `offline-${Date.now()}`;
            enqueueAction("FINISH_SEANCE", {
              seance_id:            seanceId,
              finished_at:          finishedAt,
              duree_minutes:        dureeMinutes,
              pauses:               snapshotPauseEvents,
              total_paused_minutes: totalPausedMin,
            });
            enqueueAction("SUBMIT_RAPPORT", {
              local_rapport_id: localId,
              seance_id:        seanceId,
              contenu:          "Séance complétée avec succès.",
              soumis_en_offline: true,
            });
          } catch {}
        });
    } else {
      // Hors-ligne ou séance locale → queue directement avec payload de démarrage
      try {
        const localId = `offline-${Date.now()}`;
        // Récupérer le start_payload stocké au démarrage de la séance
        const startPayloadRaw = await AsyncStorage.getItem(`start_payload_${seanceId}`).catch(() => null);
        const startPayload = startPayloadRaw ? JSON.parse(startPayloadRaw) : null;
        // Nettoyer le payload temporaire
        AsyncStorage.removeItem(`start_payload_${seanceId}`).catch(() => {});

        enqueueAction("FINISH_SEANCE", {
          seance_id:            seanceId,
          finished_at:          finishedAt,
          duree_minutes:        dureeMinutes,
          pauses:               snapshotPauseEvents,
          total_paused_minutes: totalPausedMin,
          start_payload: startPayload, // pour la réconciliation dans queue.ts
        });
        enqueueAction("SUBMIT_RAPPORT", {
          local_rapport_id:  localId,
          seance_id:         seanceId,
          contenu:           "Séance complétée avec succès.",
          soumis_en_offline: true,
        });
      } catch {}
    }
  };

  const submitRapport = async () => {
    if (!canSend || submitting) return;
    setSubmitting(true);
    try {
      const finishedAt = new Date().toISOString();
      // Durée réelle = temps actif depuis le démarrage, hors pauses (minimum 1 min)
      const dureeMinutes = activeSeance
        ? Math.max(1, Math.round(
            (Date.now() - new Date(activeSeance.started_at).getTime() - totalPausedMs) / 60000
          ))
        : Math.max(1, todayPlan.reduce(
            (acc, seg) => acc + segDurMin(seg.heure_debut, seg.heure_fin), 0
          ));

      if (isOnline && activeSeance) {
        await seancesApi.finish(activeSeance.id, { finished_at: finishedAt, duree_minutes: dureeMinutes });
        await rapportsApi.submit({
          seance_id: activeSeance.id,
          contenu: commentaire.trim() || `Présences: ${presences}. Bilan: ${bilan}.`,
          points_positifs: bilan === "Bien" ? "Bonne séance" : null,
          difficultes: bilan === "Difficile" ? commentaire.trim() || null : null,
          soumis_en_offline: false,
        });
        upsertRapportCache({
          id: `${activeSeance.id}-rapport`, seance_id: activeSeance.id,
          classe: activeSeance.classe, matiere: activeSeance.matiere ?? null,
          date_seance: activeSeance.started_at ?? finishedAt,
          contenu: commentaire.trim() || `Présences: ${presences}. Bilan: ${bilan}.`,
          points_positifs: bilan === "Bien" ? "Bonne séance" : null,
          difficultes: bilan === "Difficile" ? commentaire.trim() || null : null,
          synced: 1,
        });
      } else if (activeSeance) {
        const localId = `offline-${Date.now()}`;
        enqueueAction("FINISH_SEANCE", { seance_id: activeSeance.id, finished_at: finishedAt, duree_minutes: dureeMinutes });
        enqueueAction("SUBMIT_RAPPORT", {
          local_rapport_id: localId, seance_id: activeSeance.id,
          contenu: commentaire.trim() || `Présences: ${presences}. Bilan: ${bilan}.`,
          soumis_en_offline: true,
        });
      }

      // Nettoyer l'état du timer
      cancelPauseAlert().catch(() => {});
      AsyncStorage.removeItem(TIMER_STATE_KEY).catch(() => {});
      setActiveSeance(null);
      setSeanceStarted(false);
      setIsPaused(false);
      setPausedAt(null);
      setTotalPausedMs(0);
      setElapsed(0);
      setShowRapport(false); resetForm();

      if (activeSeg) {
        const newCompleted = [...completedSegIds, activeSeg.id];
        setCompletedSegIds(newCompleted);
        const key = `completed-segs-${new Date().toISOString().split('T')[0]}`;
        AsyncStorage.setItem(key, JSON.stringify(newCompleted)).catch(() => {});
      }
      Alert.alert("Rapport envoyé !", isOnline ? "Séance terminée." : "Enregistré hors-ligne.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail ?? "Erreur lors de l'envoi.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Date ── */
  const dateLabel = `${JOURS_FR[todayIdx]} ${now.getDate()} ${now.toLocaleDateString("fr-FR", { month: "long" })} ${now.getFullYear()}`;
  const greetName = user?.name ?? "";

  /* ── Carte segment ── */
  const renderSegCard = () => {
    type FName = React.ComponentProps<typeof Feather>["name"];

    // 1. Aucun cours planifié aujourd'hui
    if (todayPlan.length === 0) {
      return (
        <View style={[s.segCard, s.segCardEmpty]}>
          <Feather name="calendar" size={rf(32)} color={C.brand} style={{ marginBottom: rs(12) }} />
          <Text style={s.segEmptyTitle}>Pas de cours aujourd'hui</Text>
          <Text style={s.segEmptyMsg}>Profitez de votre journée de repos</Text>
        </View>
      );
    }

    // 2. Journée terminée — soit tout complété, soit tout manqué
    if (dayCompleted) {
      return (
        <View style={{ gap: rs(14) }}>
          {/* Carte 1 : résumé de la journée */}
          {dayAllMissed ? (
            /* Toutes les tâches ont été manquées */
            <View style={[s.segCard, { backgroundColor: "#FFF3F3", borderWidth: 1.5, borderColor: C.danger, marginBottom: 0 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(10) }}>
                <Feather name="alert-circle" size={rf(20)} color={C.danger} style={{ marginRight: rs(8) }} />
                <Text style={[s.segTitle, { color: C.danger, marginBottom: 0 }]}>
                  {todayPlan.length} tâche{todayPlan.length > 1 ? "s" : ""} manquée{todayPlan.length > 1 ? "s" : ""}
                </Text>
              </View>
              <Text style={{ color: "#666", fontSize: rf(14), marginBottom: rs(16), lineHeight: rs(20) }}>
                Aucune activité du planning d'aujourd'hui n'a été démarrée dans les créneaux prévus.
              </Text>
              <TouchableOpacity
                style={[s.btnAction, { backgroundColor: C.danger, alignSelf: "flex-start" }]}
                onPress={() => router.push("/today-summary")} activeOpacity={0.8}
              >
                <Feather name="eye" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
                <Text style={s.btnActionTxt}>Voir les détails</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Au moins une tâche complétée (peut-être quelques manquées aussi) */
            <View style={[s.segCard, { backgroundColor: C.success, marginBottom: 0 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(10) }}>
                <Feather name="check-circle" size={rf(20)} color="#fff" style={{ marginRight: rs(8) }} />
                <Text style={[s.segTitle, { color: "#fff", marginBottom: 0 }]}>Planning du jour effectué ✓</Text>
              </View>
              <Text style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: rf(16), marginBottom: rs(16), lineHeight: rs(22) }}>
                {missedSegIds.filter(id => todayPlan.some(s => s.id === id)).length > 0
                  ? `${completedSegIds.filter(id => todayPlan.some(s => s.id === id)).length} activité(s) complétée(s), ${missedSegIds.filter(id => todayPlan.some(s => s.id === id)).length} manquée(s).`
                  : "Toutes les activités de votre planning sont complétées pour aujourd'hui. Bravo !"}
              </Text>
              <TouchableOpacity
                style={[s.btnAction, { backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "flex-start" }]}
                onPress={() => router.push("/today-summary")} activeOpacity={0.8}
              >
                <Feather name="eye" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
                <Text style={s.btnActionTxt}>Voir les détails</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Carte 2 : Prochain planning */}
          {nextScheduledDay ? (
            <View style={[s.segCard, s.segCardEmpty, { marginTop: 0 }]}>
              <Feather name="calendar" size={rf(32)} color={C.brand} style={{ marginBottom: rs(10) }} />
              <Text style={s.segEmptyTitle}>Prochain planning</Text>
              <Text style={s.segEmptyMsg}>
                {JOURS_FR[nextScheduledDay.dayIdx]}{" "}
                {nextScheduledDay.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                {" · "}{nextScheduledDay.segs.length} cours
              </Text>

              {/* Bouton Voir plus */}
              <TouchableOpacity
                style={[s.nextCourseBtn, { marginTop: rs(16), width: '80%' }]}
                onPress={() => {
                  const dateStr = nextScheduledDay.date.toISOString();
                  router.push(`/next-planning?dayIdx=${nextScheduledDay.dayIdx}&dateStr=${encodeURIComponent(dateStr)}`);
                }}
                activeOpacity={0.8}
              >
                <Feather name="eye" size={rf(14)} color="#fff" style={{ marginRight: rs(6) }} />
                <Text style={s.nextCourseBtnTxt}>Voir plus</Text>
                <Feather name="chevron-right" size={rf(14)} color="#fff" style={{ marginLeft: rs(6) }} />
              </TouchableOpacity>
            </View>
          ) : (
            /* Aucun prochain planning dans la semaine */
            <View style={[s.segCard, s.segCardEmpty, { marginTop: 0 }]}>
              <Feather name="calendar" size={rf(32)} color={C.brand} style={{ marginBottom: rs(10) }} />
              <Text style={s.segEmptyTitle}>Prochain planning</Text>
              <Text style={s.segEmptyMsg}>Aucun cours planifié cette semaine</Text>
            </View>
          )}
        </View>
      );
    }

    // 3. Tâche manquée — afficher l'alerte si aucune séance n'est en cours
    if (!activeSeance && missedAlertSeg) {
      const missedTitle     = segTitle(missedAlertSeg);
      const missedTimeRange = `${missedAlertSeg.heure_debut.slice(0, 5)} – ${missedAlertSeg.heure_fin.slice(0, 5)}`;
      const hasNextSeg      = pendingSegs.length > 0;

      return (
        <View style={[s.segCard, { backgroundColor: "#FFF3F3", borderWidth: 1.5, borderColor: C.danger }]}>
          <View style={s.segTopRow}>
            <View style={[s.segBadge, { backgroundColor: C.danger }]}>
              <Feather name="alert-triangle" size={rf(10)} color="#fff" style={{ marginRight: rs(4) }} />
              <Text style={s.segBadgeTxt}>TÂCHE MANQUÉE</Text>
            </View>
            <Text style={s.segTimeRange}>{missedTimeRange}</Text>
          </View>

          <Text style={[s.segTitle, { color: C.danger }]}>{missedTitle}</Text>

          <Text style={{ color: "#666", fontSize: rf(13), marginBottom: rs(16), lineHeight: rs(19) }}>
            Cette activité n'a pas été démarrée dans le créneau prévu.
          </Text>

          <TouchableOpacity
            style={[s.btnAction, { backgroundColor: hasNextSeg ? C.brand : "#999", alignSelf: "flex-start" }]}
            onPress={() => setMissedAlertSeg(null)}
            activeOpacity={0.8}
          >
            <Feather name={hasNextSeg ? "skip-forward" : "check"} size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
            <Text style={s.btnActionTxt}>
              {hasNextSeg ? "Passer à la tâche suivante" : "Fermer"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isSeanceActive = !!activeSeance;

    // 4. Séance active (Timer qui tourne) — inchangé
    if (isSeanceActive) {
      const displayTitle = activeSeg ? segTitle(activeSeg) : "Séance en cours";
      const displayTimeRange = activeSeg
        ? `${activeSeg.heure_debut.slice(0, 5)} – ${activeSeg.heure_fin.slice(0, 5)}`
        : "—";
      
      const displayTimer = fmt(remainSec);
      const displaySub = remainSec > 0 
        ? `restantes sur ${durMin} min` 
        : "Temps écoulé ! Pensez à terminer.";

      const statusIcon: FName = isPaused ? "pause" : "play";
      const statusLabel = isPaused ? "EN PAUSE" : "EN COURS";

      return (
        <View style={s.segCard}>
          <View style={s.segTopRow}>
            <View style={s.segBadge}>
              <Feather name={statusIcon} size={rf(10)} color="#fff" style={{ marginRight: rs(4) }} />
              <Text style={s.segBadgeTxt}>{statusLabel}</Text>
            </View>
            <Text style={s.segTimeRange}>{displayTimeRange}</Text>
          </View>

          <Text style={s.segTitle}>{displayTitle}</Text>

          <View style={s.segTimerRow}>
            <View style={{ flex: 1, marginRight: rs(12) }}>
              <Text style={s.timerText} numberOfLines={1} adjustsFontSizeToFit>
                {displayTimer}
              </Text>
              <Text style={s.timerSub} numberOfLines={2}>{displaySub}</Text>
            </View>

            <View style={{ flexDirection: "column", gap: rs(8) }}>
              {isPaused ? (
                <TouchableOpacity style={s.btnAction} onPress={handleResume} activeOpacity={0.8}>
                  <Feather name="play" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
                  <Text style={s.btnActionTxt}>Reprendre</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.btnAction, s.btnPause]} onPress={handlePause} activeOpacity={0.8}>
                  <Feather name="pause" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
                  <Text style={s.btnActionTxt}>Pause</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[s.btnAction, { backgroundColor: C.danger }]}
                onPress={handleFinishPress}
                activeOpacity={0.8}
              >
                <Feather name="check" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
                <Text style={s.btnActionTxt}>Terminer</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
          </View>
        </View>
      );
    }

    // 5. Aucune séance active -> Prêt à démarrer l'activité
    const displayTitle = activeSeg ? segTitle(activeSeg) : "Aucun cours planifié";
    const displayTimeRange = activeSeg
      ? `${activeSeg.heure_debut.slice(0, 5)} – ${activeSeg.heure_fin.slice(0, 5)}`
      : "—";

    // 5a. Le créneau n'est pas encore disponible (plus de 5 min avant son début)
    //     -> on fige cette zone sur le planning du jour, en attendant l'ouverture.
    if (activeSeg && !canStartActiveSeg) {
      return (
        <View style={s.segCard}>
          <View style={s.segTopRow}>
            <View style={[s.segBadge, { backgroundColor: "rgba(255,255,255,0.22)" }]}>
              <Feather name="clock" size={rf(10)} color="#fff" style={{ marginRight: rs(4) }} />
              <Text style={s.segBadgeTxt}>PROCHAINE ACTIVITÉ</Text>
            </View>
            <Text style={s.segTimeRange}>{displayTimeRange}</Text>
          </View>
          <Text style={s.segTitle}>{displayTitle}</Text>
          <Text style={s.pendingRowTxt}>
            Disponible à partir de {toHHMM(toMin(activeSeg.heure_debut) - 5)} (5 min avant le début)
          </Text>
        </View>
      );
    }

    return (
      <View style={s.segCard}>
        <View style={s.segTopRow}>
          <View style={[s.segBadge, { backgroundColor: C.brand }]}>
            <Feather name="play" size={rf(10)} color="#fff" style={{ marginRight: rs(4) }} />
            <Text style={s.segBadgeTxt}>PRÊT À DÉMARRER</Text>
          </View>
          <Text style={s.segTimeRange}>{displayTimeRange}</Text>
        </View>
        <Text style={s.segTitle}>{displayTitle}</Text>
        <TouchableOpacity
          style={s.btnStart}
          onPress={handleStartSeance}
          activeOpacity={0.85}
        >
          <Feather name="play" size={rf(15)} color={C.brand} style={{ marginRight: rs(8) }} />
          <Text style={s.btnStartTxt}>Démarrer l'activité</Text>
        </TouchableOpacity>

        {pendingSegs.length > 1 && (
          <View style={s.pendingRow}>
            <Text style={s.pendingRowTxt}>
              {pendingSegs.length} tâches non faites aujourd'hui
            </Text>
            <TouchableOpacity onPress={() => setShowPendingTasks(true)} activeOpacity={0.7}>
              <Text style={s.pendingRowLink}>Voir plus</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  /* ── Ligne planning ── */
  const doneCount = todayPlan.filter(seg => completedSegIds.includes(seg.id)).length;

  /** Carte d'un créneau du PROCHAIN jour (tout à venir, pas d'état live/done) */
  const renderNextPlanRow = (seg: any, i: number) => (
    <View key={seg.id ?? i} style={s.planItemCard}>
      <View style={s.planItemBody}>
        <Text style={s.planItemTitle} numberOfLines={1}>{segTitle(seg)}</Text>
        <Text style={s.planItemMeta}>
          {seg.heure_debut.slice(0, 5)} – {seg.heure_fin.slice(0, 5)}
          {" · "}{segDurMin(seg.heure_debut, seg.heure_fin)} min
        </Text>
      </View>
    </View>
  );

  /** Carte d'un créneau du jour courant */
  const renderPlanRow = (seg: any, i: number) => {
    const isDone    = completedSegIds.includes(seg.id);
    const isMissed  = missedSegIds.includes(seg.id);
    const dur       = segDurMin(seg.heure_debut, seg.heure_fin);
    const timeRange = `${seg.heure_debut.slice(0, 5)} – ${seg.heure_fin.slice(0, 5)}`;

    return (
      <View key={seg.id} style={s.planItemCard}>
        <View style={s.planItemBody}>
          <Text
            style={[s.planItemTitle, isDone && s.planItemTitleDone, isMissed && { color: C.danger, opacity: 0.7 }]}
            numberOfLines={1}
          >
            {segTitle(seg)}
            {isMissed ? "  ⚠" : ""}
          </Text>
          <Text style={[s.planItemMeta, (isDone || isMissed) && { opacity: 0.55 }]}>
            {timeRange} · {dur} min{isMissed ? " · Manquée" : ""}
          </Text>
        </View>
      </View>
    );
  };

  /* ── Rendu ── */
  return (
    <View style={s.screen}>
      <AppHeader
        userName={greetName}
        onAvatarPress={() => setShowProfile(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
      />

      {/* ── Mode "pas de cours" ── */}
      {todayPlan.length === 0 ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.centeredContent, { paddingBottom: rs(32) + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Bloc centré */}
          <View style={s.centeredTop}>
            <Text style={s.dateLabelCenter}>{dateLabel}</Text>
            <Text style={s.greetingCenter}>Bonjour, {greetName} 👋</Text>

            {/* Carte 1 — Pas de cours */}
            <View style={[s.segCard, s.segCardEmpty]}>
              <Feather name="calendar" size={rf(32)} color={C.brand} style={{ marginBottom: rs(10) }} />
              <Text style={s.segEmptyTitle}>Pas de cours aujourd'hui</Text>
              <Text style={s.segEmptyMsg}>Profitez de votre journée de repos</Text>
            </View>

            {/* Carte 2 — Prochain cours */}
            {nextScheduledDay && (
              <View style={[s.segCard, s.segCardEmpty, { marginTop: rs(12) }]}>
                <Feather name="calendar" size={rf(32)} color={C.brand} style={{ marginBottom: rs(10) }} />
                <Text style={s.segEmptyTitle}>Prochain cours</Text>
                <Text style={s.segEmptyMsg}>
                  {JOURS_FR[nextScheduledDay.dayIdx]}{" "}
                  {nextScheduledDay.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                  {" · "}{nextScheduledDay.segs.length} cours
                </Text>

                {/* Bouton Voir Planning */}
                <TouchableOpacity
                  style={[s.nextCourseBtn, { marginTop: rs(16), width: '80%' }]}
                  onPress={() => {
                    const dateStr = nextScheduledDay.date.toISOString();
                    router.push(`/next-planning?dayIdx=${nextScheduledDay.dayIdx}&dateStr=${encodeURIComponent(dateStr)}`);
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="calendar" size={rf(14)} color="#fff" style={{ marginRight: rs(6) }} />
                  <Text style={s.nextCourseBtnTxt}>Voir le planning</Text>
                  <Feather name="chevron-right" size={rf(14)} color="#fff" style={{ marginLeft: rs(6) }} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

      ) : (
        /* ── Mode normal : activité/timer fixe en haut, planning défile en bas ── */
        <View style={s.scroll}>
          <View style={s.fixedHeader}>
            <Text style={s.dateLabel}>{dateLabel}</Text>
            <Text style={s.greeting}>Bonjour, {greetName} 👋</Text>

            {renderSegCard()}
          </View>

          {/* ── Planning du jour — masqué si tout est complété ── */}
          {!dayCompleted && (() => {
            const remaining = todayPlan.filter(seg => !completedSegIds.includes(seg.id));
            return (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[s.scrollContent, { paddingTop: 0, paddingBottom: rs(24) + insets.bottom }]}
                showsVerticalScrollIndicator={false}
              >
                <View style={s.planSection}>
                  <View style={s.planHeader}>
                    <Text style={s.planTitle}>Planning du jour</Text>
                    <Text style={s.planCount}>
                      {remaining.length} restant{remaining.length > 1 ? "s" : ""}
                    </Text>
                  </View>
                  {remaining.map(renderPlanRow)}
                </View>
              </ScrollView>
            );
          })()}
        </View>
      )}

      <ProfileSheet visible={showProfile} onClose={() => setShowProfile(false)} />

      {/* ── Configuration notifications (1ère ouverture) ── */}
      <NotificationSetupModal
        visible={showNotifSetup}
        onClose={() => setShowNotifSetup(false)}
      />

      {/* Modal rapport */}
      <Modal visible={showRapport} animationType="slide" transparent onRequestClose={() => setShowRapport(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => !submitting && setShowRapport(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <TouchableOpacity activeOpacity={1} style={[s.sheet, { paddingBottom: rs(20) + insets.bottom }]} onPress={() => {}}>
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Rapport du jour</Text>
              <Text style={s.sheetSub}>{activeSeg ? segTitle(activeSeg) : ""}</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Présences */}
                <Text style={s.fieldLabel}>Élèves présents</Text>
                <View style={s.counterRow}>
                  <TouchableOpacity style={s.counterBtn} onPress={() => setPresences(p => Math.max(0, p - 1))}>
                    <Text style={s.counterBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.counterVal}>{presences}</Text>
                  <TouchableOpacity style={s.counterBtn} onPress={() => setPresences(p => Math.min(100, p + 1))}>
                    <Text style={s.counterBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* Segments réalisés */}
                <Text style={s.fieldLabel}>Tous les segments réalisés ?</Text>
                <View style={s.toggleRow}>
                  {([{ v: true, l: "Oui ✓" }, { v: false, l: "Non ✗" }] as const).map(opt => (
                    <TouchableOpacity
                      key={String(opt.v)}
                      style={[s.toggleBtn, segsDone === opt.v && s.toggleBtnActive]}
                      onPress={() => setSegsDone(opt.v)}
                    >
                      <Text style={[s.toggleBtnTxt, segsDone === opt.v && s.toggleBtnTxtActive]}>{opt.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Bilan */}
                <Text style={s.fieldLabel}>Bilan global</Text>
                <View style={s.bilanRow}>
                  {(["Bien", "Moyen", "Difficile"] as const).map(b => {
                    const col: Record<string, string> = { Bien: C.success, Moyen: C.warn, Difficile: C.danger };
                    const sel = bilan === b;
                    return (
                      <TouchableOpacity
                        key={b}
                        style={[s.bilanBtn, sel && { borderColor: col[b], backgroundColor: col[b] + "22" }]}
                        onPress={() => setBilan(b)}
                      >
                        <Text style={[s.bilanBtnTxt, sel && { color: col[b] }]}>{b}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Commentaire */}
                <Text style={s.fieldLabel}>Commentaire <Text style={{ fontWeight: "400", color: C.textMuted }}>(optionnel)</Text></Text>
                <TextInput
                  style={s.textarea} multiline numberOfLines={3}
                  value={commentaire} onChangeText={setCommentaire}
                  placeholder="Difficultés, remarques..." placeholderTextColor={C.textMuted}
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[s.sendBtn, !canSend && { backgroundColor: C.surfaceAlt }]}
                  onPress={submitRapport} disabled={!canSend || submitting} activeOpacity={0.8}
                >
                  {submitting
                    ? <ActivityIndicator color={canSend ? "#fff" : C.textMuted} />
                    : <Text style={[s.sendBtnTxt, !canSend && { color: C.textMuted }]}>
                        {isOnline ? "Envoyer le rapport" : "Enregistrer hors-ligne"}
                      </Text>
                  }
                </TouchableOpacity>
                <View style={{ height: rs(16) }} />
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Modal tâches non faites */}
      <Modal visible={showPendingTasks} animationType="slide" transparent onRequestClose={() => setShowPendingTasks(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowPendingTasks(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.sheet, { paddingBottom: rs(20) + insets.bottom }]} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Tâches non faites</Text>
            <Text style={s.sheetSub}>{pendingSegs.length} tâche(s) restante(s) aujourd'hui</Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {pendingSegs.map(renderPlanRow)}
              <View style={{ height: rs(16) }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: C.bg },
  scroll:        { flex: 1 },
  scrollContent: { padding: rs(16) },
  fixedHeader:   { padding: rs(16), paddingBottom: 0 },

  /* Layout "pas de cours" */
  centeredContent:   { flexGrow: 1, paddingHorizontal: rs(16) },
  centeredTop:       { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: rs(32), paddingBottom: rs(16) },
  dateLabelCenter:   { fontSize: rf(15), color: C.textMuted, fontWeight: "500", marginBottom: rs(4), textAlign: "center" },
  greetingCenter:    { fontSize: rf(24), fontWeight: "800", color: C.text, marginBottom: rs(20), textAlign: "center" },

  /* Bouton Voir Planning */
  nextCourseBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.brand, paddingVertical: rs(14), borderRadius: rs(14), marginTop: rs(12), width: "100%" },
  nextCourseBtnTxt:  { fontSize: rf(16), fontWeight: "700", color: "#fff" },

  dateLabel:  { fontSize: rf(15), color: C.textMuted, fontWeight: "500", marginBottom: rs(4) },
  greeting:   { fontSize: rf(24), fontWeight: "800", color: C.text, marginBottom: rs(16) },

  /* Segment card */
  segCard:      { backgroundColor: C.brand, borderRadius: rs(18), padding: rs(18), marginBottom: rs(16) },
  segTopRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: rs(10) },
  segBadge:     { backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(20), flexDirection: "row", alignItems: "center" },
  segBadgeTxt:  { color: "#fff", fontSize: rf(13), fontWeight: "700", letterSpacing: 0.5 },
  segTimeRange: { color: "#fff", fontSize: rf(15), fontWeight: "600", opacity: 0.9 },

  pendingRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: rs(14), paddingTop: rs(12), borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.22)" },
  pendingRowTxt: { color: "#fff", fontSize: rf(13), fontWeight: "600", opacity: 0.9 },
  pendingRowLink:{ color: "#fff", fontSize: rf(13), fontWeight: "800", textDecorationLine: "underline" },

  segTitle:     { color: "#fff", fontSize: rf(20), fontWeight: "800", marginBottom: rs(14), lineHeight: rf(26) },
  segTimerRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(14) },
  timerText:    { fontSize: rf(44), fontWeight: "700", color: "#fff", letterSpacing: 1.5, flexShrink: 1 },
  timerSub:     { fontSize: rf(14), color: "rgba(255,255,255,0.8)", marginTop: rs(4) },
  btnAction:    { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: rs(12), paddingHorizontal: rs(18), paddingVertical: rs(12), flexDirection: "row", alignItems: "center" },
  btnPause:     { backgroundColor: "rgba(0,0,0,0.22)" },
  btnActionTxt: { color: "#fff", fontWeight: "700", fontSize: rf(15) },
  btnStart:     { backgroundColor: "#fff", borderRadius: rs(14), paddingVertical: rs(16), marginTop: rs(16), flexDirection: "row", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 3 },
  btnStartTxt:  { color: C.brand, fontWeight: "800", fontSize: rf(17) },
  progressBg:   { height: rs(6), backgroundColor: "rgba(255,255,255,0.25)", borderRadius: rs(3), overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: rs(3) },

  /* ── Planning du jour — cartes séparées ── */
  planSection:       { marginBottom: rs(14) },
  planHeader:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: rs(10) },
  planTitle:         { fontSize: rf(16), fontWeight: "700", color: C.text },
  planCount:         { fontSize: rf(14), color: C.textMuted },

  /* Carte individuelle */
  planItemCard:      {
    backgroundColor: C.surface,
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: rs(8),
  },
  planItemBody:      { paddingHorizontal: rs(14), paddingVertical: rs(12) },
  planItemTitle:     { fontSize: rf(17), fontWeight: "600", color: C.text, marginBottom: rs(3) },
  planItemTitleDone: { color: C.textMuted, fontWeight: "400" },
  planItemMeta:      { fontSize: rf(14), color: C.textMuted },

  /* Segment card — pas de cours aujourd'hui */
  segCardEmpty:   { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center", paddingVertical: rs(32), width: "100%" },
  segEmptyTitle:  { fontSize: rf(19), fontWeight: "700", color: C.text, marginBottom: rs(6) },
  segEmptyMsg:    { fontSize: rf(15), color: C.textMuted, marginBottom: rs(20) },
  segEmptyBtn:    { flexDirection: "row", alignItems: "center", backgroundColor: C.brand, paddingHorizontal: rs(18), paddingVertical: rs(10), borderRadius: rs(20) },
  segEmptyBtnTxt: { fontSize: rf(15), fontWeight: "700", color: "#fff" },

  /* Modal rapport */
  overlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet:         { backgroundColor: C.surface, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), padding: rs(20), maxHeight: "92%" },
  handle:        { width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: C.border, alignSelf: "center", marginBottom: rs(16) },
  sheetTitle:    { fontSize: rf(19), fontWeight: "700", color: C.text, marginBottom: rs(2) },
  sheetSub:      { fontSize: rf(14), color: C.textMuted, marginBottom: rs(16) },
  fieldLabel:    { fontSize: rf(15), fontWeight: "600", color: C.text, marginBottom: rs(10), marginTop: rs(4) },
  counterRow:    { flexDirection: "row", alignItems: "center", marginBottom: rs(16), gap: rs(16) },
  counterBtn:    { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  counterBtnTxt: { fontSize: rf(24), color: C.text, lineHeight: rf(30) },
  counterVal:    { fontSize: rf(30), fontWeight: "700", color: C.text, minWidth: rs(40), textAlign: "center" },
  toggleRow:     { flexDirection: "row", gap: rs(10), marginBottom: rs(16) },
  toggleBtn:     { flex: 1, padding: rs(12), borderRadius: rs(12), borderWidth: 2, borderColor: C.border, backgroundColor: C.bg, alignItems: "center" },
  toggleBtnActive:{ borderColor: C.primary, backgroundColor: C.primarySoft },
  toggleBtnTxt:  { fontSize: rf(15), fontWeight: "700", color: C.textMuted },
  toggleBtnTxtActive:{ color: C.primary },
  bilanRow:      { flexDirection: "row", gap: rs(8), marginBottom: rs(16) },
  bilanBtn:      { flex: 1, padding: rs(12), borderRadius: rs(12), borderWidth: 2, borderColor: C.border, backgroundColor: C.bg, alignItems: "center" },
  bilanBtnTxt:   { fontSize: rf(15), fontWeight: "700", color: C.textMuted },
  textarea:      { borderWidth: 1.5, borderColor: C.border, borderRadius: rs(12), padding: rs(12), fontSize: rf(15), color: C.text, backgroundColor: C.bg, minHeight: rs(80), marginBottom: rs(16), textAlignVertical: "top" },
  sendBtn:       { backgroundColor: C.primary, borderRadius: rs(14), paddingVertical: rs(16), alignItems: "center" },
  sendBtnTxt:    { color: "#fff", fontWeight: "700", fontSize: rf(17) },
});
