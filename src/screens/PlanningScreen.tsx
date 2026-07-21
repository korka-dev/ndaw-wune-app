/**
 * Écran Planning — Vue hebdomadaire de l'emploi du temps de l'enseignant.
 * Pour le jour courant, chaque créneau expose un bouton « Commencer »
 * qui démarre une séance liée au planning_segment_id (online ou offline).
 * Compatible Android 7+ / iOS 15.1+, tous formats d'écran.
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Platform,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useStore } from "../store/useStore";
import { seancesApi } from "../services/api";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";

const JOURS_COURT = Array.from({ length: 7 }, (_, i) => `J.${i + 1}`);
const JOURS_LONG  = Array.from({ length: 7 }, (_, i) => `Jour ${i + 1}`);

/** Calcule la durée en "Xh Ym" entre deux chaînes "HH:MM:SS". */
function duration(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const total = (eh * 60 + em) - (sh * 60 + sm);
  if (total <= 0) return "";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export default function PlanningScreen() {
  const router = useRouter();
  const { syncData, isOnline, syncOffline, lastSync, activeSeance, setActiveSeance } = useStore();
  const planning      = syncData?.planning ?? [];
  const activeSession = syncData?.active_session;

  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [refreshing,  setRefreshing]  = useState(false);
  // ID du segment en cours de démarrage (pour le spinner)
  const [startingSegId, setStartingSegId] = useState<string | null>(null);

  // Re-sync automatique à chaque focus de l'onglet Planning
  useFocusEffect(
    useCallback(() => {
      if (isOnline) {
        syncOffline(true).catch(() => {});
      }
    }, [isOnline])
  );

  const onRefresh = async () => {
    if (!isOnline) return;
    setRefreshing(true);
    try { await syncOffline(true); } finally { setRefreshing(false); }
  };

  const daySegments = planning
    .filter(p => p.jour === selectedDay)
    .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));

  const countByDay = Array.from({ length: 7 }, (_, i) =>
    planning.filter(p => p.jour === i).length
  );

  const lastSyncLabel = lastSync
    ? new Date(lastSync).toLocaleString("fr-FR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : null;

  // ── Démarrer une séance depuis le planning ────────────────────────────────────
  const handleStartSeg = async (seg: any) => {
    if (startingSegId) return;

    // Si une séance est déjà active, naviguer vers l'accueil pour la gérer
    if (activeSeance) {
      router.push("/(tabs)/home");
      return;
    }

    setStartingSegId(seg.id);

    const startedAt  = new Date().toISOString();
    const localId    = `offline-seance-${Date.now()}`;
    const sessionId  = syncData?.active_session?.id ?? "";
    const classeVal  = seg.classe?.trim() || "—";
    const matiereVal = seg.matiere ?? null;

    // 1. Démarrer IMMÉDIATEMENT avec un ID local provisoire
    setActiveSeance({
      id:         localId,
      classe:     classeVal,
      matiere:    matiereVal,
      started_at: startedAt,
      session_id: sessionId,
    });

    // 2. Persister le payload de démarrage pour la réconciliation offline
    const startPayload = {
      classe:              classeVal,
      matiere:             matiereVal,
      planning_segment_id: seg.id ?? null,
      session_id:          sessionId,
      date_seance:         startedAt,
      started_at:          startedAt,
    };
    AsyncStorage.setItem(`start_payload_${localId}`, JSON.stringify(startPayload)).catch(() => {});

    // 3. Enregistrer sur le serveur en arrière-plan (si en ligne)
    if (isOnline) {
      seancesApi
        .start({
          classe:              classeVal,
          matiere:             matiereVal,
          planning_segment_id: seg.id ?? null,
          session_id:          sessionId,
          date_seance:         startedAt,
          started_at:          startedAt,
        })
        .then(({ data }) => {
          const current = useStore.getState().activeSeance;
          if (current?.id === localId) {
            setActiveSeance({ ...current, id: data.id, started_at: data.started_at ?? startedAt });
            // start_payload ne sert qu'à la réconciliation offline → inutile une fois le serverUUID obtenu
            AsyncStorage.removeItem(`start_payload_${localId}`).catch(() => {});
          }
        })
        .catch(() => {
          // Échec réseau → ID local conservé, réconcilié au retour en ligne
        });
    }

    setStartingSegId(null);

    // 4. Aller sur l'accueil pour afficher le timer et le bouton Terminer
    router.push("/(tabs)/home");
  };

  return (
    <View style={s.screen}>
      {/* En-tête */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Planning</Text>
          {activeSession && (
            <Text style={s.subtitle}>{activeSession.name}</Text>
          )}
        </View>
        {!isOnline && (
          <View style={s.offlineBadge}>
            <Text style={s.offlineText}>Hors-ligne</Text>
          </View>
        )}
      </View>

      {/* Sélecteur de jour */}
      <View style={s.dayBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.dayScroll}
        >
          {JOURS_COURT.map((j, i) => {
            const isSelected = i === selectedDay;
            const count      = countByDay[i];
            return (
              <TouchableOpacity
                key={i}
                style={[s.dayBtn, isSelected && s.dayBtnSelected]}
                onPress={() => setSelectedDay(i)}
                activeOpacity={0.75}
              >
                <Text style={[s.dayLabel, isSelected && s.dayLabelSelected]}>{j}</Text>
                {count > 0 && (
                  <View style={[s.badge, isSelected && s.badgeSelected]}>
                    <Text style={[s.badgeText, isSelected && s.badgeTextSelected]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Contenu : créneaux du jour */}
      <ScrollView
        style={s.body}
        contentContainerStyle={{ paddingBottom: rs(40) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
            {...(Platform.OS === "ios"
              ? { title: isOnline ? "Actualiser…" : "Pas de connexion" }
              : {}
            )}
          />
        }
      >
        <View style={s.dayTitleRow}>
          <Text style={s.dayTitle}>{JOURS_LONG[selectedDay]}</Text>
        </View>

        {daySegments.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📅</Text>
            <Text style={s.emptyText}>Aucun cours ce jour</Text>
          </View>
        ) : (
          daySegments.map((seg) => {
            const isActiveForThisSeg =
              activeSeance?.classe === (seg.classe ?? "") &&
              activeSeance?.matiere === (seg.matiere ?? null);
            const isStarting = startingSegId === seg.id;

            return (
              <View key={seg.id} style={s.segCard}>
                {/* Colonne heure */}
                <View style={s.timeCol}>
                  <Text style={s.timeStart}>{seg.heure_debut.slice(0, 5)}</Text>
                  <View style={s.timeLine} />
                  <Text style={s.timeEnd}>{seg.heure_fin.slice(0, 5)}</Text>
                </View>

                {/* Colonne contenu */}
                <View style={s.segBody}>
                  <Text style={s.segClasse}>{seg.classe}</Text>
                  {seg.matiere && (
                    <Text style={s.segMatiere}>{seg.matiere}</Text>
                  )}
                  <View style={s.durationBadge}>
                    <Text style={s.durationText}>
                      {duration(seg.heure_debut, seg.heure_fin)}
                    </Text>
                  </View>

                  {/* ── Bouton Commencer ─────────────────── */}
                  <View style={s.actionRow}>
                    {isActiveForThisSeg ? (
                      /* Séance en cours pour ce segment → bouton "Voir le timer" */
                      <TouchableOpacity
                        style={[s.btn, s.btnActive]}
                        onPress={() => router.push("/(tabs)/home")}
                        activeOpacity={0.8}
                      >
                        <View style={s.activeDot} />
                        <Text style={s.btnActiveText}>En cours — Voir le timer</Text>
                      </TouchableOpacity>
                    ) : activeSeance ? (
                      /* Une autre séance est déjà active → désactivé */
                      <View style={[s.btn, s.btnDisabled]}>
                        <Text style={s.btnDisabledText}>Autre séance en cours</Text>
                      </View>
                    ) : (
                      /* Aucune séance active → bouton Commencer */
                      <TouchableOpacity
                        style={[s.btn, s.btnStart, isStarting && s.btnLoading]}
                        onPress={() => handleStartSeg(seg)}
                        activeOpacity={0.8}
                        disabled={isStarting}
                      >
                        {isStarting ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={s.btnStartText}>▶ Commencer</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}

        {lastSyncLabel && (
          <Text style={s.syncNote}>Dernière mise à jour : {lastSyncLabel}</Text>
        )}
        {!isOnline && (
          <Text style={s.syncNote}>Données hors-ligne — tirez vers le bas pour actualiser.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: C.bg },
  header:  {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: rs(20), paddingTop: rs(20), paddingBottom: rs(12),
    backgroundColor: C.bg,
  },
  title:    { fontSize: rf(22), fontWeight: "bold", color: C.text },
  subtitle: { fontSize: rf(15), color: C.brand, marginTop: rs(2) },

  offlineBadge: { backgroundColor: C.warnSoft, borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(4) },
  offlineText:  { color: C.warn, fontSize: rf(14), fontWeight: "600" },

  dayBar:    { backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  dayScroll: { paddingHorizontal: rs(16), paddingVertical: rs(10) },
  dayBtn: {
    alignItems: "center", paddingHorizontal: rs(14), paddingVertical: rs(8),
    borderRadius: rs(12), backgroundColor: C.surfaceAlt, minWidth: rs(52),
    marginRight: rs(6),
  },
  dayBtnSelected:    { backgroundColor: C.primary },
  dayLabel:          { fontSize: rf(15), fontWeight: "600", color: C.textMuted },
  dayLabelSelected:  { color: "#fff" },
  todayDot: { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: C.brand, marginTop: rs(3) },
  badge: {
    marginTop: rs(4), backgroundColor: C.primarySoft,
    borderRadius: rs(8), paddingHorizontal: rs(6), paddingVertical: rs(1),
  },
  badgeSelected:     { backgroundColor: "rgba(255,255,255,0.25)" },
  badgeText:         { fontSize: rf(13), fontWeight: "700", color: C.primary },
  badgeTextSelected: { color: "#fff" },

  body:         { flex: 1, paddingHorizontal: rs(20) },
  dayTitleRow:  { flexDirection: "row", alignItems: "center", marginTop: rs(16), marginBottom: rs(12) },
  dayTitle:     { fontSize: rf(18), fontWeight: "bold", color: C.text },
  todayPill: {
    marginLeft: rs(10), backgroundColor: C.brandSoft,
    borderRadius: rs(20), paddingHorizontal: rs(10), paddingVertical: rs(3),
  },
  todayPillText: { fontSize: rf(13), fontWeight: "700", color: C.brand },

  emptyCard: { alignItems: "center", paddingVertical: rs(48) },
  emptyIcon: { fontSize: rf(40), marginBottom: rs(12) },
  emptyText: { color: C.textMuted, fontSize: rf(16) },

  segCard: {
    flexDirection: "row", backgroundColor: C.surface, borderRadius: rs(16),
    marginBottom: rs(10), padding: rs(16),
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: C.border,
  },
  timeCol:    { width: rs(52), alignItems: "center", marginRight: rs(14) },
  timeStart:  { fontSize: rf(15), fontWeight: "700", color: C.primary },
  timeLine:   { flex: 1, width: 2, backgroundColor: C.border, borderRadius: 1, marginVertical: rs(4) },
  timeEnd:    { fontSize: rf(14), color: C.textMuted },

  segBody:    { flex: 1, justifyContent: "center" },
  segClasse:  { fontSize: rf(18), fontWeight: "bold", color: C.text },
  segMatiere: { fontSize: rf(15), color: C.textMuted, marginTop: rs(2) },
  durationBadge: {
    marginTop: rs(8), alignSelf: "flex-start",
    backgroundColor: C.brandSoft, borderRadius: rs(8),
    paddingHorizontal: rs(8), paddingVertical: rs(3),
  },
  durationText: { fontSize: rf(14), fontWeight: "600", color: C.brand },

  // ── Boutons d'action ────────────────────────────────────────────────────────
  actionRow: { marginTop: rs(12) },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: rs(10), paddingVertical: rs(9), paddingHorizontal: rs(16),
    alignSelf: "flex-start",
  },
  btnStart:       { backgroundColor: C.brand },
  btnLoading:     { backgroundColor: C.brand, opacity: 0.75 },
  btnStartText:   { color: "#fff", fontSize: rf(14), fontWeight: "700" },
  btnActive:      { backgroundColor: C.brandSoft, borderWidth: 1, borderColor: C.brand },
  btnActiveText:  { color: C.brand, fontSize: rf(14), fontWeight: "700", marginLeft: rs(4) },
  activeDot: {
    width: rs(8), height: rs(8), borderRadius: rs(4),
    backgroundColor: C.brand, marginRight: rs(6),
  },
  btnDisabled:     { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  btnDisabledText: { color: C.textMuted, fontSize: rf(13), fontWeight: "600" },

  syncNote: { textAlign: "center", color: C.textMuted, fontSize: rf(14), marginTop: rs(16) },
});
