/**
 * SupEvaluationScreen
 *
 * Flux :
 *   1. "enseignants"  → enseignants assignés au superviseur
 *   2. "evaluations"  → choix du dossier d'évaluation (Seereer / Pulaar / Wolof)
 *   3. "eleves"       → liste des élèves de la classe, sélection libre
 *   4. "evaluer"      → fiche d'évaluation par élève (scores lettres/syllabes/mots/opérations)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";

// ── Données des dossiers d'évaluation ─────────────────────────────────────────

interface EvalDoc {
  id:       string;
  langue:   string;
  lettres:  string[];
  syllabes: string[];
  mots:     string[];
  operations: string[];
}

const EVAL_DOCS: EvalDoc[] = [
  {
    id:       "seereer",
    langue:   "Seereer",
    lettres:  ["a", "l", "t", "e", "n", "r", "m", "k", "g", "s"],
    syllabes: ["wo", "si", "ka", "ko", "ta", "am", "fi", "nu", "at", "de"],
    mots:     ["met", "tali", "kalaas", "yaru", "bat", "laamit", "fuuli", "simin", "fog", "mayu"],
    operations: ["22 + 35 =", "34 + 12 =", "19 - 7 =", "45 - 33 ="],
  },
  {
    id:       "pulaar",
    langue:   "Pulaar",
    lettres:  ["a", "l", "t", "e", "n", "r", "m", "k", "g", "s"],
    syllabes: ["as", "yo", "kii", "ko", "ta", "am", "fi", "nii", "to", "de"],
    mots:     ["bee", "makko", "galle", "lekkol", "maama", "kadi", "tawii", "woni", "maa", "goggo"],
    operations: ["22 + 35 =", "34 + 12 =", "19 - 7 =", "45 - 33 ="],
  },
  {
    id:       "wolof",
    langue:   "Wolof",
    lettres:  ["a", "l", "t", "e", "n", "r", "m", "k", "g", "s"],
    syllabes: ["gi", "bi", "ak", "ko", "di", "am", "la", "nu", "ay", "de"],
    mots:     ["meew", "tali", "kalaas", "kàddu", "baat", "liggeey", "tuuti", "garab", "bokk", "dafay"],
    operations: ["22 + 35 =", "34 + 12 =", "19 - 7 =", "45 - 33 ="],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewType = "enseignants" | "evaluations" | "eleves" | "evaluer";

interface ClasseMeta  { classe: string; nb_eleves: number }
interface Teacher     { teacher_id: string; teacher_name: string; classes: ClasseMeta[] }
interface Eleve       { id: string; nom: string; prenom: string | null; genre: string | null; classe: string }

interface StudentScores {
  lettres:    number | null;   // /10
  syllabes:   number | null;   // /10
  mots:       number | null;   // /10
  operations: number | null;   // /4
}

interface EvalEntry { eleve: Eleve; scores: StudentScores }

function emptyScores(): StudentScores {
  return { lettres: null, syllabes: null, mots: null, operations: null };
}

function resultat(score: number | null, max: number): "acquis" | "a_aider" | null {
  if (score === null) return null;
  return score >= Math.ceil(max / 2) ? "acquis" : "a_aider";
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

// ── Composant scoreur +/- ─────────────────────────────────────────────────────

function ScoreInput({
  label, hint, value, max, onChange,
}: {
  label: string; hint: string; value: number | null; max: number; onChange: (v: number) => void;
}) {
  const pct = value !== null ? value / max : null;
  const res = resultat(value, max);
  return (
    <View style={sc.wrapper}>
      <View style={sc.top}>
        <View>
          <Text style={sc.label}>{label}</Text>
          <Text style={sc.hint}>{hint}</Text>
        </View>
        {res && (
          <View style={[sc.resBadge, { backgroundColor: res === "acquis" ? C.successSoft : C.dangerSoft }]}>
            <Text style={[sc.resBadgeText, { color: res === "acquis" ? C.success : C.danger }]}>
              {res === "acquis" ? "✓ Acquis" : "✗ À aider"}
            </Text>
          </View>
        )}
      </View>

      <View style={sc.row}>
        <TouchableOpacity
          style={[sc.btn, value === 0 && sc.btnDisabled]}
          onPress={() => onChange(Math.max(0, (value ?? 0) - 1))}
          activeOpacity={0.7}
        >
          <Feather name="minus" size={rs(18)} color={value === 0 ? C.textMuted : C.text} />
        </TouchableOpacity>

        <View style={sc.scoreBox}>
          <Text style={sc.scoreValue}>{value ?? "—"}</Text>
          <Text style={sc.scoreMax}>/{max}</Text>
        </View>

        <TouchableOpacity
          style={[sc.btn, value === max && sc.btnDisabled]}
          onPress={() => onChange(Math.min(max, (value ?? 0) + 1))}
          activeOpacity={0.7}
        >
          <Feather name="plus" size={rs(18)} color={value === max ? C.textMuted : C.text} />
        </TouchableOpacity>

        {/* Barre de progression */}
        <View style={sc.progTrack}>
          <View
            style={[
              sc.progFill,
              pct !== null && { width: `${Math.round(pct * 100)}%` as any },
              pct !== null && { backgroundColor: pct >= 0.5 ? C.success : C.danger },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  wrapper:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), padding: rs(14), gap: rs(10) },
  top:          { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  label:        { fontSize: rf(14), fontWeight: "700", color: C.text },
  hint:         { fontSize: rf(11), color: C.textMuted, marginTop: rs(2) },
  resBadge:     { paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(8) },
  resBadgeText: { fontSize: rf(12), fontWeight: "700" },
  row:          { flexDirection: "row", alignItems: "center", gap: rs(10) },
  btn:          { width: rs(36), height: rs(36), borderRadius: rs(10), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  btnDisabled:  { opacity: 0.35 },
  scoreBox:     { flexDirection: "row", alignItems: "baseline", gap: rs(2), minWidth: rs(48), justifyContent: "center" },
  scoreValue:   { fontSize: rf(22), fontWeight: "900", color: C.text },
  scoreMax:     { fontSize: rf(13), color: C.textMuted, fontWeight: "600" },
  progTrack:    { flex: 1, height: rs(6), borderRadius: rs(3), backgroundColor: C.border, overflow: "hidden" },
  progFill:     { height: "100%", borderRadius: rs(3), backgroundColor: C.brand },
});

// ── Écran principal ───────────────────────────────────────────────────────────

export default function SupEvaluationScreen() {
  const insets = useSafeAreaInsets();
  const { user, isOnline } = useStore();

  // Données
  const [teachers,      setTeachers]      = useState<Teacher[]>([]);
  const [eleves,        setEleves]        = useState<Eleve[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadingEleves, setLoadingEleves] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [profileOpen,   setProfileOpen]   = useState(false);

  // Navigation
  const [view,          setView]          = useState<ViewType>("enseignants");
  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null);
  const [activeClasse,  setActiveClasse]  = useState<string | null>(null);
  const [activeDoc,     setActiveDoc]     = useState<EvalDoc | null>(null);

  // Sélection élèves
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Évaluation
  const [evalEntries, setEvalEntries] = useState<EvalEntry[]>([]);
  const [evalIndex,   setEvalIndex]   = useState(0);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitDone,  setSubmitDone]  = useState(false);

  // ── Chargement enseignants ─────────────────────────────────────────────────

  const fetchTeachers = useCallback(async () => {
    setError(null);
    try {
      const { data } = await superviseurApi.eleves();
      setTeachers(data?.teachers ?? []);
    } catch {
      setError("Impossible de charger les enseignants. Vérifiez votre connexion.");
    }
  }, []);

  useEffect(() => { fetchTeachers().finally(() => setLoading(false)); }, [fetchTeachers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTeachers();
    setRefreshing(false);
  };

  // ── Chargement élèves ──────────────────────────────────────────────────────

  const openClasse = async (teacher: Teacher, classe: string) => {
    setActiveTeacher(teacher);
    setActiveClasse(classe);
    setActiveDoc(null);
    setSelectedIds(new Set());
    setView("evaluations");
  };

  const loadEleves = async (teacher: Teacher, classe: string) => {
    setLoadingEleves(true);
    setView("eleves");
    try {
      const { data } = await superviseurApi.classeEleves(teacher.teacher_id, classe);
      setEleves(data ?? []);
    } catch {
      Alert.alert("Erreur", "Impossible de charger les élèves de cette classe.");
      setView("evaluations");
    } finally {
      setLoadingEleves(false);
    }
  };

  const chooseDoc = (doc: EvalDoc) => {
    setActiveDoc(doc);
    loadEleves(activeTeacher!, activeClasse!);
  };

  // ── Sélection élèves ───────────────────────────────────────────────────────

  const toggleEleve = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    setSelectedIds(selectedIds.size === eleves.length ? new Set() : new Set(eleves.map(e => e.id)));
  };

  // ── Démarrer l'évaluation ─────────────────────────────────────────────────

  const startEvaluation = () => {
    const selected = eleves.filter(e => selectedIds.has(e.id));
    if (!selected.length) return;
    setEvalEntries(selected.map(e => ({ eleve: e, scores: emptyScores() })));
    setEvalIndex(0);
    setSubmitDone(false);
    setView("evaluer");
  };

  // ── Mise à jour scores ────────────────────────────────────────────────────

  const updateScore = (field: keyof StudentScores, value: number) => {
    setEvalEntries(prev => prev.map((e, i) =>
      i === evalIndex ? { ...e, scores: { ...e.scores, [field]: value } } : e
    ));
  };

  // ── Soumission ────────────────────────────────────────────────────────────

  const submitAll = async () => {
    const today  = todayIso();
    const langue = activeDoc!.langue;
    const toSend: Parameters<typeof superviseurApi.submitEvaluations>[0] = [];

    for (const entry of evalEntries) {
      const { scores, eleve } = entry;
      const fields: { key: keyof StudentScores; label: string; max: number }[] = [
        { key: "lettres",    label: `${langue} - Lecture - Lettres`,    max: 10 },
        { key: "syllabes",   label: `${langue} - Lecture - Syllabes`,   max: 10 },
        { key: "mots",       label: `${langue} - Lecture - Mots`,       max: 10 },
        { key: "operations", label: `${langue} - Mathématiques`,        max: 4  },
      ];
      for (const f of fields) {
        const score = scores[f.key];
        if (score === null) continue;
        const res = resultat(score, f.max);
        if (!res) continue;
        toSend.push({
          eleve_id:    eleve.id,
          competence:  f.label,
          resultat:    res,
          date_eval:   today,
          commentaire: `${score}/${f.max}`,
        });
      }
    }

    if (!toSend.length) {
      Alert.alert("Aucune note", "Veuillez saisir au moins une note avant de valider.");
      return;
    }
    setSubmitting(true);
    try {
      await superviseurApi.submitEvaluations(toSend);
      setSubmitDone(true);
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer les évaluations. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Navigation retour ─────────────────────────────────────────────────────

  const goTo = (target: ViewType) => {
    if (target === "enseignants") {
      setActiveTeacher(null); setActiveClasse(null); setActiveDoc(null);
      setEleves([]); setSelectedIds(new Set());
      setEvalEntries([]); setEvalIndex(0); setSubmitDone(false);
    }
    setView(target);
  };

  // ── Calculs ───────────────────────────────────────────────────────────────

  if (loading) return (
    <View style={[st.root, st.center]}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={st.loadingText}>Chargement…</Text>
    </View>
  );

  const nbSelected = selectedIds.size;
  const current    = evalEntries[evalIndex] ?? null;
  const nbNotes    = evalEntries.filter(e =>
    Object.values(e.scores).some(v => v !== null)
  ).length;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={st.root}>
      <AppHeader userName={user?.name ?? ""} onAvatarPress={() => setProfileOpen(true)} isOnline={isOnline} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VUE 1 — Enseignants                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "enseignants" && (
        <View style={{ flex: 1 }}>
          <View style={st.viewHeader}>
            <Text style={st.viewTitle}>Évaluations</Text>
            <Text style={st.viewSub}>Sélectionnez un enseignant</Text>
          </View>

          {error && (
            <View style={st.errorBanner}>
              <Feather name="alert-circle" size={rs(14)} color={C.danger} />
              <Text style={st.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); fetchTeachers().finally(() => setLoading(false)); }}>
                <Text style={st.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}

          {teachers.length === 0 && !error ? (
            <ScrollView
              contentContainerStyle={st.emptyState}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
            >
              <Feather name="users" size={rs(40)} color={C.textMuted} />
              <Text style={st.emptyText}>Aucun enseignant assigné.{"\n"}Contactez l'administrateur.</Text>
            </ScrollView>
          ) : (
            <FlatList
              data={teachers}
              keyExtractor={t => t.teacher_id}
              contentContainerStyle={st.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
              renderItem={({ item: t }) => (
                <View style={st.teacherCard}>
                  <View style={st.teacherCardHeader}>
                    <View style={st.teacherAvatar}>
                      <Feather name="user" size={rs(18)} color={C.primary} />
                    </View>
                    <Text style={st.teacherName}>{t.teacher_name}</Text>
                  </View>
                  {t.classes.length === 0 ? (
                    <Text style={st.noClassText}>Aucune classe assignée</Text>
                  ) : (
                    <View style={st.classesList}>
                      {t.classes.map(cls => (
                        <TouchableOpacity
                          key={cls.classe}
                          style={st.classeRow}
                          onPress={() => openClasse(t, cls.classe)}
                          activeOpacity={0.75}
                        >
                          <View style={st.classeIcon}>
                            <Feather name="book-open" size={rs(14)} color={C.primary} />
                          </View>
                          <Text style={st.classeName}>{cls.classe}</Text>
                          <Text style={st.classeCount}>{cls.nb_eleves} élève{cls.nb_eleves !== 1 ? "s" : ""}</Text>
                          <Feather name="chevron-right" size={rs(14)} color={C.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VUE 2 — Choix du dossier d'évaluation                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "evaluations" && activeTeacher && (
        <View style={{ flex: 1 }}>
          <View style={st.subHeader}>
            <TouchableOpacity onPress={() => goTo("enseignants")} style={st.backBtn}>
              <Feather name="arrow-left" size={rs(20)} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>{activeTeacher.teacher_name}</Text>
              <Text style={st.subHeaderSub}>Classe {activeClasse}</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={st.listContent} showsVerticalScrollIndicator={false}>
            <View style={st.evalDocHeader}>
              <Feather name="file-text" size={rs(18)} color={C.primary} />
              <Text style={st.evalDocTitle}>Choisissez le dossier d'évaluation</Text>
            </View>

            {EVAL_DOCS.map(doc => (
              <TouchableOpacity
                key={doc.id}
                style={st.docCard}
                onPress={() => chooseDoc(doc)}
                activeOpacity={0.8}
              >
                <View style={st.docCardLeft}>
                  <View style={st.docLangBadge}>
                    <Text style={st.docLangText}>{doc.langue.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.docLangName}>Test Élève en {doc.langue}</Text>
                    <View style={st.docTagsRow}>
                      <View style={st.docTag}><Text style={st.docTagText}>Lecture</Text></View>
                      <View style={st.docTag}><Text style={st.docTagText}>Mathématiques</Text></View>
                    </View>
                  </View>
                </View>
                <Feather name="chevron-right" size={rs(18)} color={C.textMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VUE 3 — Sélection des élèves                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "eleves" && activeTeacher && activeDoc && (
        <View style={{ flex: 1 }}>
          <View style={st.subHeader}>
            <TouchableOpacity onPress={() => goTo("evaluations")} style={st.backBtn}>
              <Feather name="arrow-left" size={rs(20)} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>
                {activeTeacher.teacher_name} — {activeClasse}
              </Text>
              <Text style={st.subHeaderSub}>
                {activeDoc.langue} · {nbSelected} sélectionné{nbSelected !== 1 ? "s" : ""}
              </Text>
            </View>
            {eleves.length > 0 && (
              <TouchableOpacity onPress={toggleAll} style={st.selectAllBtn}>
                <Text style={st.selectAllText}>{selectedIds.size === eleves.length ? "Aucun" : "Tous"}</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingEleves ? (
            <View style={st.center}>
              <ActivityIndicator size="large" color={C.brand} />
              <Text style={st.loadingText}>Chargement des élèves…</Text>
            </View>
          ) : eleves.length === 0 ? (
            <View style={st.emptyState}>
              <Feather name="users" size={rs(40)} color={C.textMuted} />
              <Text style={st.emptyText}>Aucun élève dans cette classe.</Text>
            </View>
          ) : (
            <FlatList
              data={eleves}
              keyExtractor={e => e.id}
              contentContainerStyle={st.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: eleve }) => {
                const selected = selectedIds.has(eleve.id);
                return (
                  <TouchableOpacity
                    style={[st.eleveRow, selected && st.eleveRowSelected]}
                    onPress={() => toggleEleve(eleve.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[st.checkbox, selected && st.checkboxSelected]}>
                      {selected && <Feather name="check" size={rs(13)} color="#fff" />}
                    </View>
                    <View style={st.eleveAvatar}>
                      <Text style={st.eleveAvatarText}>
                        {eleve.nom.charAt(0)}{(eleve.prenom ?? "").charAt(0)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.eleveName} numberOfLines={1}>
                        {eleve.prenom ? `${eleve.prenom} ` : ""}{eleve.nom}
                      </Text>
                      {eleve.genre ? (
                        <Text style={st.eleveGenre}>{eleve.genre === "M" ? "Garçon" : "Fille"}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Bouton évaluer — juste au-dessus du menu de navigation */}
          <View style={st.evalBtnBar}>
            <TouchableOpacity
              style={[st.evalBtn, nbSelected === 0 && st.evalBtnDisabled]}
              onPress={startEvaluation}
              disabled={nbSelected === 0}
              activeOpacity={0.85}
            >
              <Feather name="edit-3" size={rs(16)} color={nbSelected === 0 ? C.textMuted : "#fff"} />
              <Text style={[st.evalBtnText, nbSelected === 0 && st.evalBtnTextDisabled]}>
                {nbSelected === 0
                  ? "Sélectionnez des élèves"
                  : `Évaluer ${nbSelected} élève${nbSelected !== 1 ? "s" : ""}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VUE 4 — Fiche d'évaluation par élève                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "evaluer" && current && activeDoc && (
        <View style={{ flex: 1 }}>
          <View style={st.subHeader}>
            <TouchableOpacity onPress={() => goTo("eleves")} style={st.backBtn} disabled={submitting}>
              <Feather name="arrow-left" size={rs(20)} color={submitting ? C.textMuted : C.text} />
            </TouchableOpacity>
            <View style={st.evalHeaderIcon}>
              <Feather name="edit-3" size={rs(15)} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>
                {current.eleve.prenom ? `${current.eleve.prenom} ` : ""}{current.eleve.nom}
              </Text>
              <Text style={st.subHeaderSub}>
                Élève {evalIndex + 1}/{evalEntries.length} · {activeDoc.langue}
              </Text>
            </View>
          </View>

          {submitDone ? (
            <View style={[st.center, { gap: rs(16) }]}>
              <Feather name="check-circle" size={rs(52)} color={C.success} />
              <Text style={st.doneTitle}>Évaluations enregistrées !</Text>
              <Text style={st.doneSub}>{nbNotes} élève{nbNotes !== 1 ? "s" : ""} évalué{nbNotes !== 1 ? "s" : ""}</Text>
              <TouchableOpacity style={st.doneBtn} onPress={() => goTo("enseignants")} activeOpacity={0.85}>
                <Text style={st.doneBtnText}>Retour aux enseignants</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Barre de progression globale */}
              <View style={st.progBarOuter}>
                <View style={[st.progBarFill, { width: `${Math.round((evalIndex / evalEntries.length) * 100)}%` as any }]} />
              </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={st.evalScroll}
                showsVerticalScrollIndicator={false}
              >
                {/* ── Section LECTURE ─────────────────────────────────── */}
                <View style={st.sectionHeader}>
                  <Feather name="book-open" size={rs(15)} color={C.primary} />
                  <Text style={st.sectionTitle}>Lecture</Text>
                </View>

                {/* Lettres */}
                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Lettres à reconnaître</Text>
                  <View style={st.tokensRow}>
                    {activeDoc.lettres.map((l, i) => (
                      <View key={i} style={st.token}><Text style={st.tokenText}>{l}</Text></View>
                    ))}
                  </View>
                  <Text style={st.contentHint}>Demandez à l'élève de dire le son de chaque lettre.</Text>
                </View>
                <ScoreInput
                  label="Score — Lettres"
                  hint="Nombre de lettres correctement lues"
                  value={current.scores.lettres}
                  max={10}
                  onChange={v => updateScore("lettres", v)}
                />

                {/* Syllabes */}
                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Syllabes à lire</Text>
                  <View style={st.tokensRow}>
                    {activeDoc.syllabes.map((s, i) => (
                      <View key={i} style={st.token}><Text style={st.tokenText}>{s}</Text></View>
                    ))}
                  </View>
                  <Text style={st.contentHint}>Demandez à l'élève de lire chaque syllabe.</Text>
                </View>
                <ScoreInput
                  label="Score — Syllabes"
                  hint="Nombre de syllabes correctement lues"
                  value={current.scores.syllabes}
                  max={10}
                  onChange={v => updateScore("syllabes", v)}
                />

                {/* Mots */}
                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Mots à lire</Text>
                  <View style={st.tokensRow}>
                    {activeDoc.mots.map((m, i) => (
                      <View key={i} style={[st.token, st.tokenMot]}><Text style={st.tokenText}>{m}</Text></View>
                    ))}
                  </View>
                  <Text style={st.contentHint}>Demandez à l'élève de lire chaque mot.</Text>
                </View>
                <ScoreInput
                  label="Score — Mots"
                  hint="Nombre de mots correctement lus"
                  value={current.scores.mots}
                  max={10}
                  onChange={v => updateScore("mots", v)}
                />

                {/* ── Section MATHÉMATIQUES ───────────────────────────── */}
                <View style={[st.sectionHeader, { marginTop: rs(6) }]}>
                  <Feather name="hash" size={rs(15)} color={C.primary} />
                  <Text style={st.sectionTitle}>Mathématiques</Text>
                </View>

                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Opérations à effectuer</Text>
                  <View style={st.opsGrid}>
                    {activeDoc.operations.map((op, i) => (
                      <View key={i} style={st.opItem}>
                        <Text style={st.opText}>{op}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={st.contentHint}>Demandez à l'élève de résoudre chaque opération.</Text>
                </View>
                <ScoreInput
                  label="Score — Opérations"
                  hint="Nombre d'opérations réussies"
                  value={current.scores.operations}
                  max={4}
                  onChange={v => updateScore("operations", v)}
                />

                {/* ── Autres élèves ───────────────────────────────────── */}
                {evalEntries.length > 1 && (
                  <View style={st.otherEleves}>
                    <Text style={st.otherElevesTitle}>Autres élèves</Text>
                    {evalEntries.map((e, i) => {
                      if (i === evalIndex) return null;
                      const hasNote = Object.values(e.scores).some(v => v !== null);
                      return (
                        <TouchableOpacity
                          key={e.eleve.id}
                          style={st.otherEleveRow}
                          onPress={() => setEvalIndex(i)}
                          activeOpacity={0.75}
                        >
                          <Text style={st.otherEleveName} numberOfLines={1}>
                            {e.eleve.prenom ? `${e.eleve.prenom} ` : ""}{e.eleve.nom}
                          </Text>
                          <View style={[st.miniBadge, hasNote ? { backgroundColor: C.successSoft } : { backgroundColor: C.surfaceAlt }]}>
                            <Text style={[st.miniBadgeText, { color: hasNote ? C.success : C.textMuted }]}>
                              {hasNote ? "✓ Noté" : "En attente"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Boutons navigation + validation */}
              <View style={st.evalBtnBar}>
                <View style={st.navRow}>
                  <TouchableOpacity
                    style={[st.navBtn, evalIndex === 0 && st.navBtnDisabled]}
                    onPress={() => setEvalIndex(i => i - 1)}
                    disabled={evalIndex === 0}
                    activeOpacity={0.8}
                  >
                    <Feather name="chevron-left" size={rs(18)} color={evalIndex === 0 ? C.textMuted : C.text} />
                    <Text style={[st.navBtnText, evalIndex === 0 && { color: C.textMuted }]}>Préc.</Text>
                  </TouchableOpacity>

                  {evalIndex < evalEntries.length - 1 ? (
                    <TouchableOpacity style={st.mainNavBtn} onPress={() => setEvalIndex(i => i + 1)} activeOpacity={0.85}>
                      <Text style={st.mainNavBtnText}>Suivant</Text>
                      <Feather name="chevron-right" size={rs(18)} color="#fff" />
                    </TouchableOpacity>
                  ) : submitting ? (
                    <View style={[st.mainNavBtn, { backgroundColor: C.surfaceAlt }]}>
                      <ActivityIndicator size="small" color={C.brand} />
                    </View>
                  ) : (
                    <TouchableOpacity style={[st.mainNavBtn, { backgroundColor: C.success }]} onPress={submitAll} activeOpacity={0.85}>
                      <Feather name="check" size={rs(17)} color="#fff" />
                      <Text style={st.mainNavBtnText}>Valider tout</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      )}

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText: { fontSize: rf(15), color: C.textMuted },

  viewHeader: { paddingHorizontal: rs(16), paddingTop: rs(12), paddingBottom: rs(8) },
  viewTitle:  { fontSize: rf(22), fontWeight: "800", color: C.text },
  viewSub:    { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },

  // Liste générique
  listContent: { paddingHorizontal: rs(14), paddingTop: rs(8), paddingBottom: rs(16), gap: rs(10) },

  // Enseignants
  teacherCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(16), overflow: "hidden",
  },
  teacherCardHeader: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingHorizontal: rs(14), paddingTop: rs(14), paddingBottom: rs(10),
  },
  teacherAvatar: {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },
  teacherName:  { fontSize: rf(16), fontWeight: "700", color: C.text, flex: 1 },
  noClassText:  { fontSize: rf(13), color: C.textMuted, paddingHorizontal: rs(14), paddingBottom: rs(12) },
  classesList:  { borderTopWidth: 1, borderTopColor: C.border },
  classeRow:    {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingHorizontal: rs(14), paddingVertical: rs(11),
    borderBottomWidth: 1, borderBottomColor: C.border + "60",
  },
  classeIcon:   {
    width: rs(28), height: rs(28), borderRadius: rs(8),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },
  classeName:   { flex: 1, fontSize: rf(14), fontWeight: "600", color: C.text },
  classeCount:  { fontSize: rf(12), color: C.textMuted, marginRight: rs(4) },

  // Dossiers d'évaluation
  evalDocHeader: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingVertical: rs(8),
  },
  evalDocTitle:  { fontSize: rf(15), fontWeight: "700", color: C.text },
  docCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(16), padding: rs(16), gap: rs(12),
  },
  docCardLeft:  { flex: 1, flexDirection: "row", alignItems: "center", gap: rs(12) },
  docLangBadge: {
    width: rs(48), height: rs(48), borderRadius: rs(14),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },
  docLangText:  { fontSize: rf(15), fontWeight: "900", color: C.primary },
  docLangName:  { fontSize: rf(15), fontWeight: "700", color: C.text, marginBottom: rs(4) },
  docTagsRow:   { flexDirection: "row", gap: rs(6) },
  docTag:       { backgroundColor: C.surfaceAlt, paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: rs(6) },
  docTagText:   { fontSize: rf(11), color: C.textMuted, fontWeight: "600" },

  // Sous-header
  subHeader: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingHorizontal: rs(14), paddingTop: rs(10), paddingBottom: rs(12),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:        { padding: rs(4) },
  subHeaderTitle: { fontSize: rf(16), fontWeight: "800", color: C.text },
  subHeaderSub:   { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },
  selectAllBtn:   { paddingHorizontal: rs(12), paddingVertical: rs(6), backgroundColor: C.primarySoft, borderRadius: rs(8) },
  selectAllText:  { fontSize: rf(13), fontWeight: "700", color: C.primary },
  evalHeaderIcon: {
    width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },

  // Élèves
  eleveRow:         { flexDirection: "row", alignItems: "center", gap: rs(10), paddingVertical: rs(11), borderBottomWidth: 1, borderBottomColor: C.border },
  eleveRowSelected: { backgroundColor: C.primarySoft + "50" },
  checkbox:         { width: rs(22), height: rs(22), borderRadius: rs(6), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: C.primary, borderColor: C.primary },
  eleveAvatar:      { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  eleveAvatarText:  { fontSize: rf(12), fontWeight: "700", color: C.textMuted },
  eleveName:        { fontSize: rf(15), fontWeight: "600", color: C.text },
  eleveGenre:       { fontSize: rf(12), color: C.textMuted },

  // Bouton évaluer
  evalBtnBar: {
    backgroundColor: C.bg, paddingHorizontal: rs(16),
    paddingTop: rs(10), paddingBottom: rs(10),
    borderTopWidth: 1, borderTopColor: C.border,
  },
  evalBtn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), backgroundColor: C.primary, borderRadius: rs(14), paddingVertical: rs(15) },
  evalBtnDisabled:     { backgroundColor: C.surfaceAlt },
  evalBtnText:         { fontSize: rf(16), fontWeight: "800", color: "#fff" },
  evalBtnTextDisabled: { color: C.textMuted },

  // Évaluation
  progBarOuter: { height: rs(3), backgroundColor: C.border },
  progBarFill:  { height: "100%", backgroundColor: C.brand },

  evalScroll:    { paddingHorizontal: rs(14), paddingTop: rs(14), paddingBottom: rs(24), gap: rs(12) },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(4) },
  sectionTitle:  { fontSize: rf(16), fontWeight: "800", color: C.primary },

  contentCard:  { backgroundColor: C.primarySoft + "60", borderRadius: rs(14), padding: rs(14), gap: rs(10) },
  contentLabel: { fontSize: rf(13), fontWeight: "700", color: C.primary },
  contentHint:  { fontSize: rf(12), color: C.primary + "aa", fontStyle: "italic" },
  tokensRow:    { flexDirection: "row", flexWrap: "wrap", gap: rs(6) },
  token:        { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(5) },
  tokenMot:     { paddingHorizontal: rs(12) },
  tokenText:    { fontSize: rf(15), fontWeight: "700", color: C.text },
  opsGrid:      { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  opItem:       { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(10), paddingHorizontal: rs(14), paddingVertical: rs(8) },
  opText:       { fontSize: rf(16), fontWeight: "700", color: C.text, fontFamily: "monospace" },

  // Autres élèves
  otherEleves:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), overflow: "hidden" },
  otherElevesTitle: { fontSize: rf(11), fontWeight: "700", color: C.textMuted, paddingHorizontal: rs(14), paddingTop: rs(12), paddingBottom: rs(6), textTransform: "uppercase" },
  otherEleveRow:    { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(14), paddingVertical: rs(10), borderTopWidth: 1, borderTopColor: C.border + "60" },
  otherEleveName:   { flex: 1, fontSize: rf(14), color: C.text, fontWeight: "500" },
  miniBadge:        { paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(8) },
  miniBadgeText:    { fontSize: rf(11), fontWeight: "700" },

  // Navigation évaluation
  navRow:        { flexDirection: "row", gap: rs(10) },
  navBtn:        { flexDirection: "row", alignItems: "center", gap: rs(4), paddingVertical: rs(14), paddingHorizontal: rs(16), backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14) },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText:    { fontSize: rf(14), fontWeight: "700", color: C.text },
  mainNavBtn:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), paddingVertical: rs(14), borderRadius: rs(14), backgroundColor: C.primary },
  mainNavBtnText: { fontSize: rf(15), fontWeight: "800", color: "#fff" },

  // Confirmation
  doneTitle:   { fontSize: rf(20), fontWeight: "800", color: C.text },
  doneSub:     { fontSize: rf(14), color: C.textMuted },
  doneBtn:     { paddingHorizontal: rs(28), paddingVertical: rs(14), backgroundColor: C.primary, borderRadius: rs(14) },
  doneBtnText: { fontSize: rf(15), fontWeight: "800", color: "#fff" },

  // Utilitaires
  errorBanner: { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderRadius: rs(10), padding: rs(12), margin: rs(14) },
  errorText:   { flex: 1, fontSize: rf(14), color: C.danger },
  retryText:   { fontSize: rf(14), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },
  emptyState:  { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12), paddingVertical: rs(60) },
  emptyText:   { fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(22) },
});
