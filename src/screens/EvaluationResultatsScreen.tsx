import React, { useState, useEffect, useCallback } from "react";
import { trackUsage } from "../services/usage";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { teacherEvalApi, syncApi } from "../services/api";
import {
  getCachedTeacherEvaluations, setCachedTeacherEvaluations,
  getCachedEvaluationCompetences,
  type TeacherEvalItem,
} from "../services/cache";
import { ASER_COMPETENCES } from "../constants/aserContent";
import { C } from "../utils/theme";
import { rf, rs } from "../utils/responsive";
import AppHeader from "../components/AppHeader";
import ProfileSheet from "../components/ProfileSheet";

// ── Types ─────────────────────────────────────────────────────────────────────

type Resultat = "acquis" | "en_cours" | "a_aider";

interface CompetenceGroup {
  competenceId:  string;
  competenceLabel: string;
  evals: TeacherEvalItem[];
  lastDate: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const RESULTATS: Record<Resultat, { label: string; color: string; bg: string; icon: string }> = {
  acquis:   { label: "Acquis",   color: C.success, bg: C.successSoft, icon: "✓" },
  en_cours: { label: "En cours", color: C.warn,    bg: C.warnSoft,    icon: "→" },
  a_aider:  { label: "À aider",  color: C.danger,  bg: C.dangerSoft,  icon: "✗" },
};

function getCompetenceLabel(id: string, customList: { code: string; label: string }[]): string {
  const custom = customList.find(c => c.code === id);
  if (custom) return custom.label;
  const aser = ASER_COMPETENCES.find(c => c.id === id);
  return aser?.label ?? id;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function groupByCompetence(
  evals: TeacherEvalItem[],
  labelMap: { code: string; label: string }[],
): CompetenceGroup[] {
  const map = new Map<string, TeacherEvalItem[]>();
  for (const ev of evals) {
    if (!map.has(ev.competence)) map.set(ev.competence, []);
    map.get(ev.competence)!.push(ev);
  }
  return Array.from(map.entries()).map(([id, items]) => ({
    competenceId:    id,
    competenceLabel: getCompetenceLabel(id, labelMap),
    evals:           items,
    lastDate:        items.reduce((max, e) => e.date_eval > max ? e.date_eval : max, ""),
  }));
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function EvaluationResultatsScreen() {
  useEffect(() => { trackUsage("evaluations").catch(() => {}); }, []);
  const insets = useSafeAreaInsets();
  const { user, isOnline } = useStore();

  const [evals,       setEvals]       = useState<TeacherEvalItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Compétences dynamiques (cache local)
  const [competencesList, setCompetencesList] = useState<{ code: string; label: string }[]>(
    ASER_COMPETENCES.map(c => ({ code: c.id, label: c.label }))
  );

  // Détail modal par compétence
  const [detailGroup, setDetailGroup] = useState<CompetenceGroup | null>(null);

  // ── Chargement ────────────────────────────────────────────────────────────

  const fetchEvaluations = useCallback(async () => {
    setError(null);
    try {
      const { data } = await teacherEvalApi.listEvaluations();
      const items: TeacherEvalItem[] = data.evaluations ?? [];
      setEvals(items);
      setCachedTeacherEvaluations(items).catch(() => {});
    } catch {
      const cached = await getCachedTeacherEvaluations();
      if (cached.length > 0) {
        setEvals(cached);
      } else {
        setError("Impossible de charger les évaluations. Vérifiez votre connexion.");
      }
    }
  }, []);

  useEffect(() => {
    // Cache d'abord
    getCachedTeacherEvaluations().then(cached => {
      if (cached.length > 0) setEvals(cached);
    }).catch(() => {});

    // Compétences dynamiques
    getCachedEvaluationCompetences().then(cached => {
      if (cached && cached.length > 0) {
        setCompetencesList(cached.map(c => ({ code: c.code, label: c.label })));
      }
    }).catch(() => {});

    fetchEvaluations().finally(() => setLoading(false));
  }, [fetchEvaluations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEvaluations();
    setRefreshing(false);
  };

  // Sync manuelle depuis le bouton du header : données globales + évaluations
  const { syncOffline } = useStore();
  const [syncing, setSyncing] = useState(false);
  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      await syncApi.invalidate().catch(() => {});
      await Promise.all([syncOffline(true), fetchEvaluations()]);
    } catch {}
    finally { setSyncing(false); }
  };

  // ── Données calculées ─────────────────────────────────────────────────────

  const groups = groupByCompetence(evals, competencesList);

  function getStats(items: TeacherEvalItem[]) {
    const acquis   = items.filter(e => e.resultat === "acquis").length;
    const en_cours = items.filter(e => e.resultat === "en_cours").length;
    const a_aider  = items.filter(e => e.resultat === "a_aider").length;
    return { acquis, en_cours, a_aider, total: items.length };
  }

  // ── Chargement ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Chargement des évaluations…</Text>
      </View>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
        sectionLabel="Espace Tuteur"
      />

      <View style={styles.content}>

        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Mes évaluations</Text>
          <Text style={styles.pageSub}>
            Résultats des observations de votre superviseur
          </Text>
        </View>

        {/* Erreur */}
        {error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={rs(14)} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); fetchEvaluations().finally(() => setLoading(false)); }}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* État vide */}
        {!error && evals.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="clipboard" size={rs(48)} color={C.textMuted} />
            <Text style={styles.emptyTitle}>Aucune évaluation reçue</Text>
            <Text style={styles.emptyText}>
              Votre superviseur n'a pas encore enregistré d'évaluations pour votre classe.
            </Text>
          </View>
        )}

        {/* Liste par compétence */}
        {groups.length > 0 && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
            contentContainerStyle={styles.listContent}
          >
            {groups.map(group => {
              const { acquis, en_cours, a_aider, total } = getStats(group.evals);
              return (
                <TouchableOpacity
                  key={group.competenceId}
                  style={styles.compCard}
                  onPress={() => setDetailGroup(group)}
                  activeOpacity={0.75}
                >
                  {/* Icône */}
                  <View style={styles.compIconWrap}>
                    <Feather name="award" size={rs(20)} color={C.primary} />
                  </View>

                  {/* Infos */}
                  <View style={styles.compBody}>
                    <Text style={styles.compLabel}>{group.competenceLabel}</Text>
                    <Text style={styles.compDate}>
                      Dernière visite : {formatDate(group.lastDate)}
                    </Text>

                    {/* Barres */}
                    <View style={styles.statsRow}>
                      <View style={[styles.statPill, { backgroundColor: C.successSoft }]}>
                        <Text style={[styles.statNum, { color: C.success }]}>{acquis}</Text>
                        <Text style={[styles.statLbl, { color: C.success }]}>Acquis</Text>
                      </View>
                      <View style={[styles.statPill, { backgroundColor: C.warnSoft }]}>
                        <Text style={[styles.statNum, { color: C.warn }]}>{en_cours}</Text>
                        <Text style={[styles.statLbl, { color: C.warn }]}>En cours</Text>
                      </View>
                      <View style={[styles.statPill, { backgroundColor: C.dangerSoft }]}>
                        <Text style={[styles.statNum, { color: C.danger }]}>{a_aider}</Text>
                        <Text style={[styles.statLbl, { color: C.danger }]}>À aider</Text>
                      </View>
                    </View>

                    <Text style={styles.compTotal}>{total} élève{total > 1 ? "s" : ""} évalué{total > 1 ? "s" : ""}</Text>
                  </View>

                  <Feather name="chevron-right" size={rs(20)} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
            <View style={{ height: rs(24) }} />
          </ScrollView>
        )}
      </View>

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* ── Modal détail compétence ── */}
      <Modal visible={!!detailGroup} animationType="slide" transparent>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setDetailGroup(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {/* En-tête */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIconWrap}>
                <Feather name="award" size={rs(20)} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {detailGroup?.competenceLabel}
                </Text>
                <Text style={styles.sheetSub}>
                  {detailGroup?.evals.length ?? 0} élève{(detailGroup?.evals.length ?? 0) > 1 ? "s" : ""} · {detailGroup ? formatDate(detailGroup.lastDate) : ""}
                </Text>
                {/* Superviseur(s) — toujours visible dans l'en-tête */}
                {(() => {
                  if (!detailGroup) return null;
                  const superviseurs = [...new Set(
                    detailGroup.evals.map(e => e.superviseur_nom).filter(Boolean)
                  )];
                  if (superviseurs.length === 0) return null;
                  return (
                    <View style={styles.supBadge}>
                      <Feather name="user-check" size={rs(12)} color={C.primary} />
                      <Text style={styles.supBadgeText}>
                        {superviseurs.length === 1
                          ? `Évalué par ${superviseurs[0]}`
                          : `Évalué par ${superviseurs.join(", ")}`}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              <TouchableOpacity onPress={() => setDetailGroup(null)} style={styles.closeBtn}>
                <Feather name="x" size={rs(20)} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Légende */}
            <View style={styles.legend}>
              {(["acquis", "en_cours", "a_aider"] as Resultat[]).map(r => {
                const res = RESULTATS[r];
                return (
                  <View key={r} style={[styles.legendItem, { backgroundColor: res.bg }]}>
                    <Text style={[styles.legendText, { color: res.color }]}>
                      {res.icon} {res.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Liste élèves */}
            <ScrollView style={{ maxHeight: rs(400) }} showsVerticalScrollIndicator={false}>
              {(() => {
                if (!detailGroup) return null;
                const superviseurs = new Set(detailGroup.evals.map(e => e.superviseur_nom).filter(Boolean));
                const multiSup = superviseurs.size > 1;
                return detailGroup.evals.map((ev, i) => {
                  const res = RESULTATS[ev.resultat as Resultat] ?? RESULTATS.en_cours;
                  return (
                    <View
                      key={`${ev.eleve_id}-${i}`}
                      style={[
                        styles.eleveRow,
                        i < (detailGroup.evals.length - 1) && styles.eleveBorder,
                      ]}
                    >
                      {/* Avatar */}
                      <View style={[styles.eleveAvatar, { backgroundColor: res.bg }]}>
                        <Text style={[styles.eleveAvatarText, { color: res.color }]}>
                          {ev.nom.charAt(0)}{(ev.prenom ?? "").charAt(0)}
                        </Text>
                      </View>

                      {/* Nom + classe */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eleveName} numberOfLines={1}>
                          {ev.nom}{ev.prenom ? ` ${ev.prenom}` : ""}
                        </Text>
                        <Text style={styles.eleveClasse}>Classe {ev.classe}</Text>
                        {/* Superviseur par élève uniquement si plusieurs superviseurs différents */}
                        {multiSup && ev.superviseur_nom ? (
                          <Text style={styles.eleveSupNom} numberOfLines={1}>
                            par {ev.superviseur_nom}
                          </Text>
                        ) : null}
                        {ev.commentaire ? (
                          <Text style={styles.eleveComment} numberOfLines={2}>
                            {ev.commentaire}
                          </Text>
                        ) : null}
                      </View>

                      {/* Badge résultat */}
                      <View style={[styles.resultBadge, { backgroundColor: res.bg }]}>
                        <Text style={[styles.resultBadgeText, { color: res.color }]}>
                          {res.icon}
                        </Text>
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  content:      { flex: 1, paddingHorizontal: rs(14), paddingTop: rs(10) },
  center:       { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText:  { fontSize: rf(16), color: C.textMuted, marginTop: rs(8) },

  pageHeader:   { marginBottom: rs(16) },
  pageTitle:    { fontSize: rf(22), fontWeight: "800", color: C.text },
  pageSub:      { fontSize: rf(13), color: C.textMuted, marginTop: rs(3) },

  errorBanner:  { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderRadius: rs(10), padding: rs(12), marginBottom: rs(12) },
  errorText:    { flex: 1, fontSize: rf(14), color: C.danger },
  retryText:    { fontSize: rf(14), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },

  emptyState:   { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: rs(60), gap: rs(12) },
  emptyTitle:   { fontSize: rf(18), fontWeight: "700", color: C.text },
  emptyText:    { fontSize: rf(14), color: C.textMuted, textAlign: "center", lineHeight: rf(21), maxWidth: rs(280) },

  listContent:  { gap: rs(12) },

  compCard:     { flexDirection: "row", alignItems: "center", gap: rs(12), backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(16), padding: rs(16) },
  compIconWrap: { width: rs(46), height: rs(46), borderRadius: rs(23), backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  compBody:     { flex: 1, gap: rs(5) },
  compLabel:    { fontSize: rf(15), fontWeight: "700", color: C.text },
  compDate:     { fontSize: rf(12), color: C.textMuted },
  compTotal:    { fontSize: rf(12), color: C.textMuted },

  statsRow:     { flexDirection: "row", gap: rs(6), marginTop: rs(2) },
  statPill:     { flexDirection: "row", alignItems: "center", gap: rs(4), paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(8) },
  statNum:      { fontSize: rf(13), fontWeight: "800" },
  statLbl:      { fontSize: rf(11), fontWeight: "600" },

  // Modal
  overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet:        { backgroundColor: C.surface, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), padding: rs(20), paddingBottom: rs(32), gap: rs(12) },
  handle:       { width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: C.border, alignSelf: "center" },

  sheetHeader:  { flexDirection: "row", alignItems: "flex-start", gap: rs(12) },
  sheetIconWrap:{ width: rs(44), height: rs(44), borderRadius: rs(22), backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sheetTitle:   { fontSize: rf(16), fontWeight: "700", color: C.text, flex: 1 },
  sheetSub:     { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },
  closeBtn:     { padding: rs(4) },

  legend:       { flexDirection: "row", gap: rs(6) },
  legendItem:   { flex: 1, paddingVertical: rs(6), borderRadius: rs(8), alignItems: "center" },
  legendText:   { fontSize: rf(11), fontWeight: "700" },

  eleveRow:     { flexDirection: "row", alignItems: "center", gap: rs(12), paddingVertical: rs(10) },
  eleveBorder:  { borderBottomWidth: 1, borderBottomColor: C.border },
  eleveAvatar:  { width: rs(38), height: rs(38), borderRadius: rs(19), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eleveAvatarText: { fontSize: rf(13), fontWeight: "700" },
  eleveName:    { fontSize: rf(14), fontWeight: "600", color: C.text },
  eleveClasse:  { fontSize: rf(12), color: C.textMuted },
  eleveComment: { fontSize: rf(12), color: C.textMuted, fontStyle: "italic", marginTop: rs(2) },
  eleveSupNom:  { fontSize: rf(11), color: C.primary, fontWeight: "600", marginTop: rs(1) },

  resultBadge:  { width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  resultBadgeText: { fontSize: rf(18), fontWeight: "800" },

  supBadge:     { flexDirection: "row", alignItems: "center", gap: rs(5), marginTop: rs(5), backgroundColor: C.primarySoft, borderRadius: rs(8), paddingHorizontal: rs(8), paddingVertical: rs(4), alignSelf: "flex-start" },
  supBadgeText: { fontSize: rf(12), fontWeight: "600", color: C.primary },
});
