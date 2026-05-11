/**
 * Écran Planning — Vue hebdomadaire de l'emploi du temps de l'enseignant.
 * Compatible Android 7+ / iOS 15.1+, tous formats d'écran.
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Platform,
} from "react-native";
import { useStore } from "../store/useStore";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";

const JOURS_COURT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JOURS_LONG  = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function todayIndex(): number {
  const d = new Date().getDay(); // 0 = dimanche
  return d === 0 ? 6 : d - 1;
}

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
  const { syncData, isOnline, syncOffline, lastSync } = useStore();
  const planning      = syncData?.planning ?? [];
  const activeSession = syncData?.active_session;

  const [selectedDay, setSelectedDay] = useState<number>(todayIndex());
  const [refreshing,  setRefreshing]  = useState(false);

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
            const isToday    = i === todayIndex();
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
                {isToday && (
                  <View style={[s.todayDot, isSelected && { backgroundColor: "#fff" }]} />
                )}
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
        <Text style={s.dayTitle}>{JOURS_LONG[selectedDay]}</Text>

        {daySegments.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📅</Text>
            <Text style={s.emptyText}>Aucun cours ce jour</Text>
          </View>
        ) : (
          daySegments.map((seg) => (
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
              </View>
            </View>
          ))
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
  subtitle: { fontSize: rf(13), color: C.brand, marginTop: rs(2) },

  offlineBadge: { backgroundColor: C.warnSoft, borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(4) },
  offlineText:  { color: C.warn, fontSize: rf(12), fontWeight: "600" },

  dayBar:    { backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  dayScroll: { paddingHorizontal: rs(16), paddingVertical: rs(10) },
  dayBtn: {
    alignItems: "center", paddingHorizontal: rs(14), paddingVertical: rs(8),
    borderRadius: rs(12), backgroundColor: C.surfaceAlt, minWidth: rs(52),
    marginRight: rs(6),
  },
  dayBtnSelected:    { backgroundColor: C.primary },
  dayLabel:          { fontSize: rf(13), fontWeight: "600", color: C.textMuted },
  dayLabelSelected:  { color: "#fff" },
  todayDot: { width: rs(5), height: rs(5), borderRadius: rs(3), backgroundColor: C.brand, marginTop: rs(3) },
  badge: {
    marginTop: rs(4), backgroundColor: C.primarySoft,
    borderRadius: rs(8), paddingHorizontal: rs(6), paddingVertical: rs(1),
  },
  badgeSelected:     { backgroundColor: "rgba(255,255,255,0.25)" },
  badgeText:         { fontSize: rf(11), fontWeight: "700", color: C.primary },
  badgeTextSelected: { color: "#fff" },

  body:     { flex: 1, paddingHorizontal: rs(20) },
  dayTitle: { fontSize: rf(16), fontWeight: "bold", color: C.text, marginTop: rs(16), marginBottom: rs(12) },

  emptyCard: { alignItems: "center", paddingVertical: rs(48) },
  emptyIcon: { fontSize: rf(40), marginBottom: rs(12) },
  emptyText: { color: C.textMuted, fontSize: rf(14) },

  segCard: {
    flexDirection: "row", backgroundColor: C.surface, borderRadius: rs(16),
    marginBottom: rs(10), padding: rs(16),
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: C.border,
  },
  timeCol:    { width: rs(52), alignItems: "center", marginRight: rs(14) },
  timeStart:  { fontSize: rf(13), fontWeight: "700", color: C.primary },
  timeLine:   { flex: 1, width: 2, backgroundColor: C.border, borderRadius: 1, marginVertical: rs(4) },
  timeEnd:    { fontSize: rf(12), color: C.textMuted },

  segBody:    { flex: 1, justifyContent: "center" },
  segClasse:  { fontSize: rf(16), fontWeight: "bold", color: C.text },
  segMatiere: { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },
  durationBadge: {
    marginTop: rs(8), alignSelf: "flex-start",
    backgroundColor: C.brandSoft, borderRadius: rs(8),
    paddingHorizontal: rs(8), paddingVertical: rs(3),
  },
  durationText: { fontSize: rf(12), fontWeight: "600", color: C.brand },
  syncNote:     { textAlign: "center", color: C.textMuted, fontSize: rf(12), marginTop: rs(16) },
});
