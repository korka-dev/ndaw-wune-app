import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";
import { ASER_CONTENT, ASER_COMPETENCES, getAserSupport, normaliseLangue } from "../../constants/aserContent";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EleveItem {
  id: string;
  nom: string;
  prenom?: string | null;
  genre?: string | null;
  classe: string;
}

interface ClasseGroup {
  classe: string;
  nb_eleves: number;
  eleves: EleveItem[];
}

type Resultat = "acquis" | "en_cours" | "a_aider";

interface EleveEval {
  eleve: EleveItem;
  resultat: Resultat | null;
}

// ── Labels résultats ──────────────────────────────────────────────────────────

const RESULTATS: { value: Resultat; label: string; color: string; bg: string }[] = [
  { value: "acquis",   label: "Acquis ✓",   color: C.success, bg: C.successSoft },
  { value: "en_cours", label: "En cours →", color: C.warn,    bg: C.warnSoft    },
  { value: "a_aider",  label: "À aider ✗",  color: C.danger,  bg: C.dangerSoft  },
];

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SupEvaluationScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useStore();

  const [classes,       setClasses]       = useState<ClasseGroup[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [selectedClasse, setSelectedClasse] = useState<ClasseGroup | null>(null);
  const [profileOpen,   setProfileOpen]   = useState(false);

  // État de la sheet d'évaluation par compétence
  const [evalModal,     setEvalModal]     = useState<{ competenceId: string; competenceLabel: string } | null>(null);
  const [eleveEvals,    setEleveEvals]    = useState<EleveEval[]>([]);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Résultats enregistrés: Map<`${classeId}:${competenceId}:${eleveId}`, Resultat>
  const [savedEvals, setSavedEvals] = useState<Map<string, Resultat>>(new Map());

  // ── Chargement ─────────────────────────────────────────────────────────────

  const fetchEleves = useCallback(async () => {
    try {
      setError(null);
      const { data } = await superviseurApi.eleves();
      const grouped: ClasseGroup[] = data.classes ?? [];
      setClasses(grouped);
      if (grouped.length > 0 && !selectedClasse) {
        setSelectedClasse(grouped[0]);
      } else if (grouped.length > 0 && selectedClasse) {
        // Rafraîchir la classe sélectionnée
        const updated = grouped.find(g => g.classe === selectedClasse.classe);
        if (updated) setSelectedClasse(updated);
      }
    } catch {
      setError("Impossible de charger les élèves. Vérifiez votre connexion.");
    }
  }, []);

  useEffect(() => {
    fetchEleves().finally(() => setLoading(false));
  }, [fetchEleves]);

  // Charger les évaluations existantes
  useEffect(() => {
    superviseurApi.listEvaluations().then(({ data }) => {
      const map = new Map<string, Resultat>();
      for (const ev of data.evaluations ?? []) {
        map.set(`${ev.competence}:${ev.eleve_id}`, ev.resultat as Resultat);
      }
      setSavedEvals(map);
    }).catch(() => {});
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEleves();
    setRefreshing(false);
  };

  // ── Calcul du badge pour une compétence ────────────────────────────────────

  function getBadge(competenceId: string, eleves: EleveItem[]) {
    const aAider = eleves.filter(e =>
      savedEvals.get(`${competenceId}:${e.id}`) === "a_aider"
    ).length;
    const evaluated = eleves.filter(e => savedEvals.has(`${competenceId}:${e.id}`)).length;
    return { aAider, evaluated, total: eleves.length };
  }

  // ── Ouvrir la sheet d'évaluation ────────────────────────────────────────────

  const openEvalModal = (competenceId: string, competenceLabel: string) => {
    if (!selectedClasse) return;
    const evals: EleveEval[] = selectedClasse.eleves.map(e => ({
      eleve: e,
      resultat: savedEvals.get(`${competenceId}:${e.id}`) ?? null,
    }));
    setEleveEvals(evals);
    setEvalModal({ competenceId, competenceLabel });
  };

  const setEleveResultat = (eleveId: string, r: Resultat) => {
    setEleveEvals(prev => prev.map(ev =>
      ev.eleve.id === eleveId ? { ...ev, resultat: r } : ev
    ));
  };

  // ── Soumettre les évaluations ───────────────────────────────────────────────

  const handleSubmitEvals = async () => {
    if (!evalModal) return;
    const today = new Date().toISOString().slice(0, 10);
    const payload = eleveEvals
      .filter(ev => ev.resultat !== null)
      .map(ev => ({
        eleve_id:   ev.eleve.id,
        competence: evalModal.competenceId,
        resultat:   ev.resultat as Resultat,
        date_eval:  today,
      }));

    if (payload.length === 0) {
      setEvalModal(null);
      return;
    }

    setSubmitting(true);
    try {
      await superviseurApi.submitEvaluations(payload);
      // Mettre à jour le cache local
      setSavedEvals(prev => {
        const next = new Map(prev);
        for (const p of payload) {
          next.set(`${p.competence}:${p.eleve_id}`, p.resultat);
        }
        return next;
      });
      setEvalModal(null);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2500);
    } catch {
      // Conserver la sheet ouverte, l'utilisateur peut réessayer
    } finally {
      setSubmitting(false);
    }
  };

  // ── Écran de chargement ────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Chargement des élèves…</Text>
      </View>
    );
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const competences = selectedClasse ? ASER_COMPETENCES : [];
  const langue = normaliseLangue(user?.langue_enseignement);
  const aserSupport = evalModal ? getAserSupport(evalModal.competenceId) : null;
  const aserContent = ASER_CONTENT[langue];

  return (
    <View style={styles.root}>

      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
      />

      <View style={styles.content}>

        {/* Sélecteur de classe */}
        {classes.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.classeSelector}
            contentContainerStyle={styles.classePills}
          >
            {classes.map(g => (
              <TouchableOpacity
                key={g.classe}
                onPress={() => setSelectedClasse(g)}
                style={[
                  styles.classePill,
                  selectedClasse?.classe === g.classe && styles.classePillActive,
                ]}
              >
                <Text style={[
                  styles.classePillText,
                  selectedClasse?.classe === g.classe && styles.classePillTextActive,
                ]}>
                  {g.classe}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* En-tête de classe */}
        {selectedClasse && (
          <View style={styles.classeHeader}>
            <Text style={styles.classeSubtitle}>
              Classe {selectedClasse.classe} · {selectedClasse.nb_eleves} élève{selectedClasse.nb_eleves !== 1 ? "s" : ""}
            </Text>
            <Text style={styles.classeTitle}>Que voulez-vous évaluer ?</Text>
          </View>
        )}

        {/* Bannière succès */}
        {submitSuccess && (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={rs(16)} color={C.success} />
            <Text style={styles.successBannerText}>Évaluations enregistrées !</Text>
          </View>
        )}

        {/* Erreur */}
        {error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={rs(14)} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); fetchEleves().finally(() => setLoading(false)); }}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* État vide */}
        {!error && classes.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="users" size={rs(40)} color={C.textMuted} />
            <Text style={styles.emptyText}>
              Aucune classe assignée.{"\n"}Contactez l'administrateur.
            </Text>
          </View>
        )}

        {/* Liste des compétences */}
        {selectedClasse && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
            contentContainerStyle={styles.listContent}
          >
            {competences.map(comp => {
              const { aAider, evaluated, total } = getBadge(comp.id, selectedClasse.eleves);
              const isEvaluated = evaluated > 0;
              return (
                <TouchableOpacity
                  key={comp.id}
                  onPress={() => openEvalModal(comp.id, comp.label)}
                  style={styles.compCard}
                  activeOpacity={0.7}
                >
                  {/* Badge */}
                  <View style={[
                    styles.badge,
                    isEvaluated
                      ? (aAider > 0 ? styles.badgeDanger : styles.badgeSuccess)
                      : styles.badgePrimary,
                  ]}>
                    {isEvaluated ? (
                      <Text style={[
                        styles.badgeText,
                        aAider > 0 ? styles.badgeTextDanger : styles.badgeTextSuccess,
                      ]}>
                        {aAider > 0 ? aAider : "✓"}
                      </Text>
                    ) : (
                      <Text style={styles.badgeTextPlus}>+</Text>
                    )}
                  </View>

                  {/* Infos */}
                  <View style={styles.compInfo}>
                    <Text style={styles.compLabel}>{comp.label}</Text>
                    <Text style={styles.compSub}>
                      {isEvaluated
                        ? (aAider > 0
                          ? `${aAider} élève${aAider > 1 ? "s" : ""} à aider`
                          : `${evaluated}/${total} évalué${evaluated > 1 ? "s" : ""} · tous acquis`)
                        : "Pas encore évalué"}
                    </Text>
                  </View>

                  <Feather name="chevron-right" size={rs(20)} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Profile sheet */}
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* ── Modal d'évaluation par compétence ── */}
      <Modal visible={!!evalModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => !submitting && setEvalModal(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {/* En-tête */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIconWrap}>
                <Feather name="list" size={rs(20)} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{evalModal?.competenceLabel}</Text>
                <Text style={styles.sheetSub}>
                  Classe {selectedClasse?.classe} · {eleveEvals.length} élève{eleveEvals.length !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>

            {/* Support ASER (référence par langue d'enseignement) */}
            {aserSupport && (
              <View style={styles.aserCard}>
                <View style={styles.aserHeader}>
                  <Feather name="book-open" size={rs(14)} color={C.primary} />
                  <Text style={styles.aserTitle}>
                    Support ASER · {langue}
                  </Text>
                </View>
                {aserSupport === "lettres" && (
                  <Text style={styles.aserText}>{aserContent.lettres}</Text>
                )}
                {aserSupport === "syllabes" && (
                  <Text style={styles.aserText}>{aserContent.syllabes}</Text>
                )}
                {aserSupport === "mots" && (
                  <Text style={styles.aserText}>{aserContent.mots}</Text>
                )}
                {aserSupport === "operations" && (
                  <Text style={styles.aserText}>{aserContent.operations.join("    ")}</Text>
                )}
              </View>
            )}

            {/* Légende */}
            <View style={styles.legend}>
              {RESULTATS.map(r => (
                <View key={r.value} style={[styles.legendItem, { backgroundColor: r.bg }]}>
                  <Text style={[styles.legendText, { color: r.color }]}>{r.label}</Text>
                </View>
              ))}
            </View>

            {/* Liste élèves */}
            <ScrollView style={{ maxHeight: rs(360) }} showsVerticalScrollIndicator={false}>
              {eleveEvals.map((ev, i) => (
                <View
                  key={ev.eleve.id}
                  style={[styles.eleveRow, i < eleveEvals.length - 1 && styles.eleveBorder]}
                >
                  {/* Avatar */}
                  <View style={styles.eleveAvatar}>
                    <Text style={styles.eleveAvatarText}>
                      {ev.eleve.nom.charAt(0)}{(ev.eleve.prenom ?? "").charAt(0)}
                    </Text>
                  </View>

                  {/* Nom */}
                  <Text style={styles.eleveName} numberOfLines={1}>
                    {ev.eleve.nom}{ev.eleve.prenom ? ` ${ev.eleve.prenom}` : ""}
                  </Text>

                  {/* Boutons résultat */}
                  <View style={styles.eleveActions}>
                    {RESULTATS.map(r => (
                      <TouchableOpacity
                        key={r.value}
                        onPress={() => setEleveResultat(ev.eleve.id, r.value)}
                        style={[
                          styles.resultBtn,
                          ev.resultat === r.value && { backgroundColor: r.bg, borderColor: r.color },
                        ]}
                      >
                        <Text style={[
                          styles.resultBtnText,
                          ev.resultat === r.value && { color: r.color },
                        ]}>
                          {r.value === "acquis" ? "✓" : r.value === "en_cours" ? "→" : "✗"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Bouton enregistrer */}
            <TouchableOpacity
              onPress={handleSubmitEvals}
              disabled={submitting}
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            >
              {submitting
                ? <ActivityIndicator size="small" color={C.textMuted} />
                : <><Feather name="check" size={rs(16)} color="#fff" /><Text style={styles.submitText}>Enregistrer</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  content:        { flex: 1, paddingHorizontal: rs(14), paddingTop: rs(10) },
  center:         { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText:    { fontSize: rf(16), color: C.textMuted, marginTop: rs(8) },

  // Sélecteur classe
  classeSelector: { flexGrow: 0, marginBottom: rs(8) },
  classePills:    { flexDirection: "row", alignItems: "center", gap: rs(6) },
  classePill:     { alignSelf: "flex-start", paddingHorizontal: rs(12), paddingVertical: rs(5), borderRadius: rs(16), backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  classePillActive: { backgroundColor: C.brand, borderColor: C.brand },
  classePillText:   { fontSize: rf(12.5), fontWeight: "600", color: C.textMuted },
  classePillTextActive: { color: "#fff" },

  // En-tête classe
  classeHeader:   { marginBottom: rs(14) },
  classeSubtitle: { fontSize: rf(13), color: C.textMuted, fontWeight: "500" },
  classeTitle:    { fontSize: rf(20), fontWeight: "700", color: C.text, marginTop: rs(3) },

  // Banners
  successBanner:  { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.success, borderRadius: rs(12), padding: rs(12), marginBottom: rs(10) },
  successBannerText: { fontSize: rf(15), fontWeight: "700", color: C.success },
  errorBanner:    { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderRadius: rs(10), padding: rs(12), marginBottom: rs(10) },
  errorText:      { flex: 1, fontSize: rf(14), color: C.danger },
  retryText:      { fontSize: rf(14), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },

  // État vide
  emptyState:     { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12), paddingVertical: rs(60) },
  emptyText:      { fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(22) },

  // Liste compétences
  listContent:    { gap: rs(10), paddingBottom: rs(24) },
  compCard:       { flexDirection: "row", alignItems: "center", gap: rs(14), backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), padding: rs(16) },
  badge:          { width: rs(44), height: rs(44), borderRadius: rs(10), alignItems: "center", justifyContent: "center", flexShrink: 0 },
  badgeDanger:    { backgroundColor: C.dangerSoft },
  badgeSuccess:   { backgroundColor: C.successSoft },
  badgePrimary:   { backgroundColor: C.primarySoft },
  badgeText:      { fontSize: rf(18), fontWeight: "800" },
  badgeTextDanger: { color: C.danger },
  badgeTextSuccess: { color: C.success },
  badgeTextPlus:  { fontSize: rf(22), fontWeight: "700", color: C.primary },
  compInfo:       { flex: 1 },
  compLabel:      { fontSize: rf(16), fontWeight: "700", color: C.text },
  compSub:        { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },

  // Modal sheet
  overlay:        { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet:          { backgroundColor: C.surface, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), padding: rs(20), paddingBottom: rs(32), gap: rs(12) },
  handle:         { width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: C.border, alignSelf: "center" },
  sheetHeader:    { flexDirection: "row", alignItems: "center", gap: rs(12) },
  sheetIconWrap:  { width: rs(44), height: rs(44), borderRadius: rs(22), backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  sheetTitle:     { fontSize: rf(17), fontWeight: "700", color: C.text },
  sheetSub:       { fontSize: rf(13), color: C.textMuted, marginTop: rs(1) },

  // Support ASER
  aserCard:       { backgroundColor: C.primarySoft, borderRadius: rs(12), padding: rs(12), gap: rs(6) },
  aserHeader:     { flexDirection: "row", alignItems: "center", gap: rs(6) },
  aserTitle:      { fontSize: rf(12), fontWeight: "700", color: C.primary },
  aserText:       { fontSize: rf(16), fontWeight: "600", color: C.text, letterSpacing: 1 },

  // Légende
  legend:         { flexDirection: "row", gap: rs(6) },
  legendItem:     { flex: 1, paddingVertical: rs(5), borderRadius: rs(8), alignItems: "center" },
  legendText:     { fontSize: rf(11), fontWeight: "700" },

  // Lignes élèves
  eleveRow:       { flexDirection: "row", alignItems: "center", gap: rs(10), paddingVertical: rs(10) },
  eleveBorder:    { borderBottomWidth: 1, borderBottomColor: C.border },
  eleveAvatar:    { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eleveAvatarText: { fontSize: rf(12), fontWeight: "700", color: C.textMuted },
  eleveName:      { flex: 1, fontSize: rf(14), fontWeight: "600", color: C.text },
  eleveActions:   { flexDirection: "row", gap: rs(5) },
  resultBtn:      { width: rs(32), height: rs(32), borderRadius: rs(8), borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceAlt },
  resultBtnText:  { fontSize: rf(14), fontWeight: "800", color: C.textMuted },

  // Bouton enregistrer
  submitBtn:      { backgroundColor: C.primary, padding: rs(14), borderRadius: rs(13), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), marginTop: rs(4) },
  submitBtnDisabled: { backgroundColor: C.surfaceAlt },
  submitText:     { color: "#fff", fontSize: rf(17), fontWeight: "700" },
});
