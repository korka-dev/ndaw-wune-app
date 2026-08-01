import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useStore } from "../store/useStore";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { segDureeLabel } from "../utils/duree";

const JOURS_NUM = Array.from({ length: 7 }, (_, i) => `Jour ${i + 1}`);

function segTitle(seg: any): string {
  return seg.titre ?? seg.matiere ?? seg.classe ?? "";
}

export default function NextPlanningScreen() {
  const router = useRouter();
  const { dayIdx } = useLocalSearchParams<{ dayIdx: string }>();

  const { syncData } = useStore();
  const planning = syncData?.planning ?? [];

  const targetDayIdx = parseInt(dayIdx ?? "0", 10);

  const targetPlan = useMemo(() => {
    return [...planning]
      .filter(p => p.jour === targetDayIdx)
      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
  }, [planning, targetDayIdx]);

  const renderNextPlanRow = (seg: any, i: number, arr: any[]) => {
    const isLast = i === arr.length - 1;
    return (
      <View key={seg.id ?? i} style={s.timelineRow}>
        {/* Ligne & Point (Gauche) */}
        <View style={s.timelineDivider}>
          <View style={s.timelineDot}>
            <View style={s.timelineInnerDot} />
          </View>
          {!isLast && <View style={s.timelineLine} />}
        </View>

        {/* Contenu (Droite) */}
        <View style={s.timelineContent}>
          <View style={s.courseCard}>
            <Text style={s.courseTitle}>{segTitle(seg)}</Text>
            
            <View style={s.courseMeta}>
              {/* Badge Durée — le planning n'affiche plus d'horaires */}
              <View style={[s.badgeDur, { backgroundColor: C.brand }]}>
                <Feather name="clock" size={rf(12)} color="#fff" />
                <Text style={[s.courseDur, { color: "#fff" }]}>
                  {segDureeLabel(seg.heure_debut, seg.heure_fin)}
                </Text>
              </View>

              {/* Badge Classe */}
              {seg.classe && (
                <View style={[s.badgeDur, { backgroundColor: C.surfaceAlt, marginLeft: rs(8) }]}>
                  <Feather name="users" size={rf(12)} color={C.textMuted} />
                  <Text style={[s.courseDur, { color: C.textMuted }]}>{seg.classe}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      {/* En-tête avec bouton retour */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Prochain Cours</Text>
        <View style={{ width: rs(40) }} />
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.topDateSection}>
          <Text style={s.topDay}>{JOURS_NUM[targetDayIdx]}</Text>
          <Text style={s.topDateStr}>
            {targetPlan.length} séance{targetPlan.length > 1 ? "s" : ""}
          </Text>
        </View>

        <View style={s.timelineContainer}>
          {targetPlan.length > 0 ? (
            targetPlan.map((seg, i, arr) => renderNextPlanRow(seg, i, arr))
          ) : (
            <View style={s.emptyPlan}>
              <Feather name="coffee" size={rf(32)} color={C.border} style={{ marginBottom: rs(12) }} />
              <Text style={s.emptyPlanTxt}>Aucun cours planifié ce jour-là.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingVertical: rs(12),
    backgroundColor: C.bg,
  },
  backBtn: {
    width: rs(40), height: rs(40),
    borderRadius: rs(12),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: rf(18), fontWeight: "700", color: C.text },

  scrollContent: { paddingHorizontal: rs(20), paddingTop: rs(16), paddingBottom: rs(48) },

  /* Section date en haut */
  topDateSection: { marginBottom: rs(24), paddingLeft: rs(8) },
  topDay: { fontSize: rf(28), fontWeight: "800", color: C.text, marginBottom: rs(4), letterSpacing: -0.5 },
  topDateStr: { fontSize: rf(16), color: C.textMuted, fontWeight: "500" },

  timelineContainer: { paddingBottom: rs(20), paddingLeft: rs(4) },

  /* Timeline Row */
  timelineRow: { flexDirection: "row", minHeight: rs(90) },
  
  timelineDivider: { alignItems: "center", width: rs(24), paddingTop: rs(12) },
  timelineDot: { width: rs(16), height: rs(16), borderRadius: rs(8), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center", zIndex: 2 },
  timelineInnerDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: C.brand },
  timelineLine: { width: 2, flex: 1, backgroundColor: C.border, marginTop: -rs(2), marginBottom: -rs(12), zIndex: 1 },

  timelineContent: { flex: 1, paddingLeft: rs(12), paddingBottom: rs(20) },
  courseCard: { 
    backgroundColor: C.surface, 
    borderRadius: rs(18), 
    padding: rs(18), 
    borderWidth: 1, 
    borderColor: C.border, 
    shadowColor: "#000", 
    shadowOpacity: 0.04, 
    shadowRadius: 10, 
    shadowOffset: { width: 0, height: 4 }, 
    elevation: 2 
  },
  courseTitle: { fontSize: rf(18), fontWeight: "700", color: C.text, marginBottom: rs(14), lineHeight: rf(24) },
  courseMeta: { flexDirection: "row", alignItems: "center" },
  badgeDur: { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(10), paddingVertical: rs(6), borderRadius: rs(8) },
  courseDur: { fontSize: rf(14), marginLeft: rs(6), fontWeight: "700" },
  
  emptyPlan: { padding: rs(40), alignItems: "center", justifyContent: "center", marginTop: rs(20) },
  emptyPlanTxt: { fontSize: rf(16), color: C.textMuted, fontWeight: "500", textAlign: "center" },
});
