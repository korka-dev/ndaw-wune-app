/**
 * Écran Résumé du jour — Affiche toutes les tâches planifiées pour aujourd'hui
 * avec leur statut (effectuée / non commencée).
 * Accessible depuis le bouton "Voir les détails" de la card "Planning du jour effectué".
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "../store/useStore";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { segDurMin, dureeLabel } from "../utils/duree";

const JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function segTitle(seg: any): string {
  return seg.titre ?? seg.matiere ?? seg.classe ?? "";
}

export default function TodaySummaryScreen() {
  const router = useRouter();
  const { syncData } = useStore();
  const planning = syncData?.planning ?? [];

  const now = new Date();
  const jsDay = now.getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;

  const todayPlan = useMemo(() => {
    return [...planning]
      .filter(p => p.jour === todayIdx)
      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
  }, [planning, todayIdx]);

  const [completedSegIds, setCompletedSegIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const key = `completed-segs-${now.toISOString().split("T")[0]}`;
        const val = await AsyncStorage.getItem(key);
        if (val) setCompletedSegIds(JSON.parse(val));
      } catch {}
    };
    load();
  }, []);

  const doneCount  = todayPlan.filter(s => completedSegIds.includes(s.id)).length;
  const totalDurMin = todayPlan.reduce((acc, s) => acc + segDurMin(s.heure_debut, s.heure_fin), 0);
  const totalLabel = dureeLabel(totalDurMin);

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      {/* ── En-tête ─────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Résumé du jour</Text>
        <View style={{ width: rs(40) }} />
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Section date ─────────────────────────────────── */}
        <View style={s.topSection}>
          <Text style={s.topDay}>{JOURS_FR[todayIdx]}</Text>
          <Text style={s.topDate}>
            {now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </Text>

          {/* Bannière journée complétée */}
          <View style={s.completedBanner}>
            <Feather name="check-circle" size={rf(16)} color={C.success} style={{ marginRight: rs(8) }} />
            <Text style={s.completedBannerTxt}>Journée complétée avec succès !</Text>
          </View>

          {/* ── Stats ─────────────────────────────────────── */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{doneCount}</Text>
              <Text style={s.statLabel}>effectuée{doneCount > 1 ? "s" : ""}</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCard}>
              <Text style={s.statValue}>{todayPlan.length}</Text>
              <Text style={s.statLabel}>planifiée{todayPlan.length > 1 ? "s" : ""}</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCard}>
              <Text style={s.statValue}>{totalLabel}</Text>
              <Text style={s.statLabel}>durée totale</Text>
            </View>
          </View>
        </View>

        {/* ── Timeline des tâches ───────────────────────────── */}
        <Text style={s.sectionTitle}>Détail des activités</Text>

        <View style={s.timelineContainer}>
          {todayPlan.length === 0 ? (
            <View style={s.emptyPlan}>
              <Feather name="calendar" size={rf(32)} color={C.border} style={{ marginBottom: rs(12) }} />
              <Text style={s.emptyPlanTxt}>Aucune activité planifiée aujourd'hui.</Text>
            </View>
          ) : (
            todayPlan.map((seg, i, arr) => {
              const isDone = completedSegIds.includes(seg.id);
              const isLast = i === arr.length - 1;
              const dur    = segDurMin(seg.heure_debut, seg.heure_fin);

              return (
                <View key={seg.id ?? i} style={s.timelineRow}>
                  {/* Point & ligne */}
                  <View style={s.timelineDivider}>
                    <View style={[s.timelineDot, isDone && s.timelineDotDone]}>
                      <Feather
                        name={isDone ? "check" : "clock"}
                        size={rf(9)}
                        color="#fff"
                      />
                    </View>
                    {!isLast && <View style={s.timelineLine} />}
                  </View>

                  {/* Carte de la tâche */}
                  <View style={s.timelineContent}>
                    <View style={[s.courseCard, isDone && s.courseCardDone]}>
                      {/* Tag statut */}
                      <View style={[s.statusTag, isDone ? s.statusTagDone : s.statusTagPending]}>
                        <Feather
                          name={isDone ? "check-circle" : "circle"}
                          size={rf(11)}
                          color={isDone ? C.success : C.textMuted}
                          style={{ marginRight: rs(4) }}
                        />
                        <Text style={[s.statusTagTxt, isDone ? s.statusTagTxtDone : s.statusTagTxtPending]}>
                          {isDone ? "Effectuée" : "Non démarrée"}
                        </Text>
                      </View>

                      {/* Titre */}
                      <Text style={[s.courseTitle, isDone && s.courseTitleDone]}>
                        {segTitle(seg)}
                      </Text>

                      {/* Métadonnées — durée de la tâche, jamais d'horaire */}
                      <View style={s.badgeRow}>
                        <View style={[s.badge, isDone ? s.badgeDone : s.badgeActive]}>
                          <Feather
                            name="clock"
                            size={rf(11)}
                            color={isDone ? C.success : "#fff"}
                          />
                          <Text style={[s.badgeTxt, isDone ? s.badgeTxtDone : s.badgeTxtActive]}>
                            {dureeLabel(dur)}
                          </Text>
                        </View>

                        {/* Classe */}
                        {seg.classe && (
                          <View style={[s.badge, s.badgeNeutral]}>
                            <Feather name="users" size={rf(11)} color={C.textMuted} />
                            <Text style={[s.badgeTxt, s.badgeTxtNeutral]}>{seg.classe}</Text>
                          </View>
                        )}
                      </View>

                      {/* Matière si différent du titre */}
                      {seg.matiere && seg.matiere !== segTitle(seg) && (
                        <Text style={s.courseSub}>{seg.matiere}</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Styles ─────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: rs(16), paddingVertical: rs(12), backgroundColor: C.bg,
  },
  backBtn: {
    width: rs(40), height: rs(40), borderRadius: rs(12),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: rf(18), fontWeight: "700", color: C.text },

  scrollContent: { paddingHorizontal: rs(20), paddingTop: rs(16), paddingBottom: rs(48) },

  /* ── Section date ── */
  topSection:    { marginBottom: rs(28) },
  topDay:        { fontSize: rf(28), fontWeight: "800", color: C.text, marginBottom: rs(4), letterSpacing: -0.5 },
  topDate:       { fontSize: rf(16), color: C.textMuted, fontWeight: "500", marginBottom: rs(16) },

  completedBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.successSoft, borderRadius: rs(12),
    paddingHorizontal: rs(14), paddingVertical: rs(10),
    marginBottom: rs(16),
  },
  completedBannerTxt: { fontSize: rf(16), fontWeight: "600", color: C.success },

  /* ── Stats ── */
  statsRow:    {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderRadius: rs(16),
    borderWidth: 1, borderColor: C.border,
    paddingVertical: rs(16),
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  statCard:    { flex: 1, alignItems: "center" },
  statValue:   { fontSize: rf(22), fontWeight: "800", color: C.text },
  statLabel:   { fontSize: rf(13), color: C.textMuted, fontWeight: "500", marginTop: rs(2) },
  statDivider: { width: 1, height: rs(36), backgroundColor: C.border },

  /* ── Timeline ── */
  sectionTitle: {
    fontSize: rf(17), fontWeight: "700", color: C.text,
    marginBottom: rs(16),
  },
  timelineContainer: { paddingLeft: rs(4), paddingBottom: rs(20) },

  timelineRow:    { flexDirection: "row", minHeight: rs(90) },
  timelineDivider:{ alignItems: "center", width: rs(28), paddingTop: rs(14) },
  timelineDot:    {
    width: rs(22), height: rs(22), borderRadius: rs(11),
    backgroundColor: C.surfaceAlt,
    borderWidth: 2, borderColor: C.border,
    alignItems: "center", justifyContent: "center", zIndex: 2,
  },
  timelineDotDone:{ backgroundColor: C.success, borderColor: C.success },
  timelineLine:   {
    width: 2, flex: 1, backgroundColor: C.border,
    marginTop: rs(2), marginBottom: -rs(12), zIndex: 1,
  },

  timelineContent:{ flex: 1, paddingLeft: rs(12), paddingBottom: rs(14) },

  courseCard: {
    backgroundColor: C.surface, borderRadius: rs(16),
    padding: rs(16), borderWidth: 1, borderColor: C.border,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  courseCardDone: { borderColor: C.successSoft, backgroundColor: "#FAFFFE" },

  statusTag:        { flexDirection: "row", alignItems: "center", marginBottom: rs(8), alignSelf: "flex-start" },
  statusTagDone:    {},
  statusTagPending: {},
  statusTagTxt:     { fontSize: rf(13), fontWeight: "700" },
  statusTagTxtDone: { color: C.success },
  statusTagTxtPending:{ color: C.textMuted },

  courseTitle:     { fontSize: rf(18), fontWeight: "700", color: C.text, marginBottom: rs(10), lineHeight: rf(24) },
  courseTitleDone: { color: C.textMuted },
  courseSub:       { fontSize: rf(14), color: C.textMuted, marginTop: rs(6) },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: rs(6) },
  badge: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: rs(10), paddingVertical: rs(5),
    borderRadius: rs(8),
  },
  badgeActive:   { backgroundColor: C.brand },
  badgeDone:     { backgroundColor: C.successSoft },
  badgeNeutral:  { backgroundColor: C.surfaceAlt },
  badgeTxt:      { fontSize: rf(14), marginLeft: rs(5), fontWeight: "700" },
  badgeTxtActive:  { color: "#fff" },
  badgeTxtDone:    { color: C.success },
  badgeTxtNeutral: { color: C.textMuted },

  emptyPlan:    { padding: rs(40), alignItems: "center", justifyContent: "center" },
  emptyPlanTxt: { fontSize: rf(16), color: C.textMuted, fontWeight: "500", textAlign: "center" },
});
