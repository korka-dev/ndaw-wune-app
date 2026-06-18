import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import {
  getCachedEvaluations, setCachedEvaluations, getCachedSupEleves, setCachedSupEleves,
  getCachedEvaluationCompetences, setCachedEvaluationCompetences, EvaluationCompetenceItem,
} from "../../services/cache";
import { enqueueAction } from "../../services/db";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";
import { ASER_COMPETENCES, getAserSupport, normaliseLangue, ASER_CONTENT } from "../../constants/aserContent";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EleveItem {
  id: string;
  nom: string;
  prenom?: string | null;
  genre?: string | null;
  classe: string;
}

// Métadonnées légères retournées par GET /eleves (pas d'élèves)
interface ClasseMeta {
  classe: string;
  nb_eleves: number;
}

interface TeacherGroup {
  teacher_id: string;
  teacher_name: string;
  classes: ClasseMeta[];
}

// Classe sélectionnée avec élèves chargés à la demande
interface SelectedClass {
  classe: string;
  nb_eleves: number;
  teacher_id: string;
  teacher_name: string;
  eleves: EleveItem[];
}

type Resultat = "acquis" | "a_aider";
type EvalView = "classes" | "students" | "evaluate";

const RESULTATS: { value: Resultat; label: string; symbol: string; color: string; bg: string }[] = [
  { value: "acquis",  label: "Acquis",  symbol: "✓", color: C.success, bg: C.successSoft },
  { value: "a_aider", label: "À aider", symbol: "✗", color: C.danger,  bg: C.dangerSoft  },
];

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SupEvaluationScreen() {
  const insets = useSafeAreaInsets();
  const { user, isOnline } = useStore();

  // ── État général ───────────────────────────────────────────────────────────
  const [teachersData,   setTeachersData]   = useState<TeacherGroup[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [profileOpen,    setProfileOpen]    = useState(false);
  const [submitSuccess,  setSubmitSuccess]  = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState<string | null>(null);
  // Chargement des élèves lors de la sélection d'une classe
  const [classeLoading,  setClasseLoading]  = useState(false);
  const [classeError,    setClasseError]    = useState<string | null>(null);

  // ── Navigation entre vues ──────────────────────────────────────────────────
  const [view,           setView]           = useState<EvalView>("classes");
  const [selectedClasse, setSelectedClasse] = useState<SelectedClass | null>(null);

  // ── Sélection d'élèves ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Évaluations ────────────────────────────────────────────────────────────
  const [activeCompCode, setActiveCompCode] = useState<string>("");
  // Évaluations accumulées pendant la session en cours : `compCode:eleveId` → Resultat
  const [pendingEvals, setPendingEvals] = useState<Map<string, Resultat>>(new Map());
  // Évaluations déjà sauvegardées
  const [savedEvals,   setSavedEvals]   = useState<Map<string, Resultat>>(new Map());

  // ── Compétences ────────────────────────────────────────────────────────────
  const [competencesList, setCompetencesList] = useState<EvaluationCompetenceItem[]>(
    ASER_COMPETENCES.map((c, i) => ({ id: c.id, label: c.label, code: c.id, ordre: i }))
  );

  // ── Chargement ─────────────────────────────────────────────────────────────

  const fetchEleves = useCallback(async () => {
    try {
      setError(null);
      const { data } = await superviseurApi.eleves();
      const teachers: TeacherGroup[] = data.teachers ?? [];
      setTeachersData(teachers);
      await setCachedSupEleves(teachers as any).catch(() => {});
    } catch {
      const cached = await getCachedSupEleves();
      if (cached && cached.length > 0) {
        // Gestion cache nouveau format (TeacherGroup[]) et ancien format (ClasseGroup[])
        const first = (cached as any[])[0];
        if (first && "teacher_id" in first) {
          setTeachersData(cached as unknown as TeacherGroup[]);
        }
      } else {
        setError("Impossible de charger les élèves. Vérifiez votre connexion.");
      }
    }
  }, []);

  useEffect(() => {
    fetchEleves().finally(() => setLoading(false));
  }, [fetchEleves]);

  useEffect(() => {
    getCachedEvaluationCompetences().then(cached => {
      if (cached && cached.length > 0) setCompetencesList(cached);
    }).catch(() => {});

    superviseurApi.sync().then(({ data }) => {
      const items: EvaluationCompetenceItem[] = data.evaluation_competences ?? [];
      if (items.length > 0) {
        setCompetencesList(items);
        setCachedEvaluationCompetences(items).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getCachedEvaluations().then(entries => {
      if (entries.length > 0) setSavedEvals(new Map(entries as [string, Resultat][]));
    }).catch(() => {});

    superviseurApi.listEvaluations().then(({ data }) => {
      const map = new Map<string, Resultat>();
      for (const ev of data.evaluations ?? []) {
        map.set(`${ev.competence}:${ev.eleve_id}`, ev.resultat as Resultat);
      }
      setSavedEvals(map);
      setCachedEvaluations(Array.from(map.entries())).catch(() => {});
    }).catch(() => {});
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEleves();
    setRefreshing(false);
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const selectClasse = async (teacher: TeacherGroup, cls: ClasseMeta) => {
    setClasseLoading(true);
    setClasseError(null);
    try {
      const { data } = await superviseurApi.classeEleves(teacher.teacher_id, cls.classe);
      const eleves: EleveItem[] = data ?? [];
      setSelectedClasse({
        classe: cls.classe,
        nb_eleves: cls.nb_eleves,
        teacher_id: teacher.teacher_id,
        teacher_name: teacher.teacher_name,
        eleves,
      });
      setSelectedIds(new Set());
      setView("students");
    } catch {
      setClasseError("Impossible de charger les élèves. Réessayez.");
    } finally {
      setClasseLoading(false);
    }
  };

  const goBackToClasses = () => {
    setView("classes");
    setSelectedClasse(null);
    setSelectedIds(new Set());
    setPendingEvals(new Map());
  };

  const goToEvaluate = () => {
    if (selectedIds.size === 0 || competencesList.length === 0) return;
    setPendingEvals(new Map());
    setActiveCompCode(competencesList[0].code);
    setView("evaluate");
  };

  const goBackToStudents = useCallback(() => {
    if (submitting) return;
    setPendingEvals(new Map());
    setView("students");
  }, [submitting]);

  // ── Sélection d'élèves ─────────────────────────────────────────────────────

  const toggleStudent = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!selectedClasse) return;
    const allIds = selectedClasse.eleves.map(e => e.id);
    setSelectedIds(prev =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    );
  };

  // ── Logique d'évaluation ───────────────────────────────────────────────────

  const getResult = (eleveId: string): Resultat | null =>
    pendingEvals.get(`${activeCompCode}:${eleveId}`)
    ?? savedEvals.get(`${activeCompCode}:${eleveId}`)
    ?? null;

  const setResult = (eleveId: string, res: Resultat) => {
    setPendingEvals(prev => {
      const next = new Map(prev);
      const key = `${activeCompCode}:${eleveId}`;
      next.get(key) === res ? next.delete(key) : next.set(key, res);
      return next;
    });
  };

  const compProgress = (compCode: string) => {
    let done = 0;
    for (const id of selectedIds) {
      if (pendingEvals.has(`${compCode}:${id}`) || savedEvals.has(`${compCode}:${id}`)) done++;
    }
    return done;
  };

  const handleSubmit = async () => {
    if (pendingEvals.size === 0) {
      goBackToStudents();
      return;
    }

    setSubmitError(null);
    const today = new Date().toISOString().slice(0, 10);

    // Clé : "compCode:eleveId" — on sépare sur le premier ":" uniquement
    const payload = Array.from(pendingEvals.entries()).map(([key, resultat]) => {
      const idx = key.indexOf(":");
      const competence = key.slice(0, idx);
      const eleve_id   = key.slice(idx + 1);
      return { eleve_id, competence, resultat, date_eval: today };
    });

    setSubmitting(true);

    const applyLocally = () => {
      setSavedEvals(prev => {
        const next = new Map(prev);
        for (const p of payload) next.set(`${p.competence}:${p.eleve_id}`, p.resultat as Resultat);
        setCachedEvaluations(Array.from(next.entries())).catch(() => {});
        return next;
      });
    };

    const onSuccess = () => {
      applyLocally();
      setPendingEvals(new Map());
      setView("students");
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 2500);
    };

    if (!isOnline) {
      enqueueAction("SUBMIT_EVALUATIONS", { evaluations: payload });
      onSuccess();
      setSubmitting(false);
      return;
    }

    try {
      await superviseurApi.submitEvaluations(payload);
      onSuccess();
    } catch (err: any) {
      // Erreur réseau → file hors-ligne
      if (!err?.response) {
        enqueueAction("SUBMIT_EVALUATIONS", { evaluations: payload });
        onSuccess();
      } else {
        // Erreur serveur → sauvegarde locale + message d'erreur
        applyLocally();
        setPendingEvals(new Map());
        const msg = err.response?.data?.detail ?? "Erreur serveur. Les évaluations ont été sauvegardées localement.";
        setSubmitError(typeof msg === "string" ? msg : "Erreur serveur — sauvegardé localement.");
        enqueueAction("SUBMIT_EVALUATIONS", { evaluations: payload });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Chargement ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Chargement…</Text>
      </View>
    );
  }

  // ── Données dérivées ───────────────────────────────────────────────────────
  const langue = normaliseLangue(user?.langue_enseignement);
  const aserContent = ASER_CONTENT[langue];
  const aserSupport = activeCompCode ? getAserSupport(activeCompCode) : null;
  const filteredEleves = selectedClasse?.eleves.filter(e => selectedIds.has(e.id)) ?? [];
  // Le tab bar gère déjà insets.bottom dans sa hauteur — pas besoin de le rajouter ici.
  const bottomPad = rs(12);

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        isOnline={isOnline}
      />

      {/* ── VUE 1 : Enseignants + leurs classes ─────────────────────────── */}
      {view === "classes" && (
        <View style={{ flex: 1 }}>
          <View style={styles.viewHeader}>
            <Text style={styles.viewTitle}>Évaluation</Text>
            <Text style={styles.viewSub}>
              {teachersData.length === 0
                ? "Aucun enseignant assigné"
                : `${teachersData.length} enseignant${teachersData.length > 1 ? "s" : ""} assigné${teachersData.length > 1 ? "s" : ""}`}
            </Text>
          </View>

          {classeError && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={rs(14)} color={C.danger} />
              <Text style={styles.errorText}>{classeError}</Text>
              <TouchableOpacity onPress={() => setClasseError(null)}>
                <Text style={styles.retryText}>OK</Text>
              </TouchableOpacity>
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={rs(14)} color={C.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); fetchEleves().finally(() => setLoading(false)); }}>
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          ) : teachersData.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="users" size={rs(40)} color={C.textMuted} />
              <Text style={styles.emptyText}>Aucun enseignant assigné.{"\n"}Contactez l'administrateur.</Text>
            </View>
          ) : (
            <FlatList
              data={teachersData}
              keyExtractor={item => item.teacher_id}
              contentContainerStyle={styles.teacherList}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
              renderItem={({ item: teacher }) => {
                const parts = teacher.teacher_name.split(" ");
                const initials = parts.length >= 2
                  ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
                  : teacher.teacher_name.slice(0, 2).toUpperCase();

                const totalEleves = teacher.classes.reduce((s, c) => s + c.nb_eleves, 0);
                const totalEvalues = 0; // calculé après chargement des élèves

                return (
                  <View style={styles.teacherCard}>
                    {/* En-tête enseignant */}
                    <View style={styles.teacherCardHeader}>
                      <View style={styles.teacherAvatar}>
                        <Text style={styles.teacherAvatarText}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.teacherCardName} numberOfLines={1}>
                          {teacher.teacher_name}
                        </Text>
                        <Text style={styles.teacherCardMeta}>
                          {teacher.classes.length > 0
                            ? `${teacher.classes.length} classe${teacher.classes.length > 1 ? "s" : ""}  ·  ${totalEleves} élève${totalEleves !== 1 ? "s" : ""}${totalEvalues > 0 ? `  ·  ${totalEvalues} évalués` : ""}`
                            : "Aucune classe assignée"}
                        </Text>
                      </View>
                    </View>

                    {/* Chips des classes, ou message vide */}
                    {teacher.classes.length === 0 ? (
                      <View style={styles.noClassBanner}>
                        <Feather name="info" size={rs(13)} color={C.textMuted} />
                        <Text style={styles.noClassText}>Pas encore de classe renseignée</Text>
                      </View>
                    ) : (
                      <View style={styles.classChipsRow}>
                        {teacher.classes.map(cls => {
                          const isLoading = classeLoading
                          && selectedClasse === null
                          && view === "classes";
                        return (
                            <TouchableOpacity
                              key={`${teacher.teacher_id}:${cls.classe}`}
                              onPress={() => selectClasse(teacher, cls)}
                              disabled={classeLoading}
                              style={[styles.classChip, classeLoading && styles.classChipDisabled]}
                              activeOpacity={0.75}
                            >
                              <View style={styles.classChipNiveau}>
                                <Text style={styles.classChipNiveauText}>{cls.classe.split(" ")[0]}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.classChipName} numberOfLines={1}>{cls.classe}</Text>
                                <Text style={styles.classChipMeta}>
                                  {cls.nb_eleves} élève{cls.nb_eleves !== 1 ? "s" : ""}
                                </Text>
                              </View>
                              {classeLoading
                                ? <ActivityIndicator size="small" color={C.brand} />
                                : <Feather name="chevron-right" size={rs(15)} color={C.textMuted} />
                              }
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── VUE 2 : Sélection d'élèves ──────────────────────────────────── */}
      {view === "students" && selectedClasse && (
        <View style={{ flex: 1 }}>
          {/* Sous-header */}
          <View style={styles.subHeader}>
            <TouchableOpacity onPress={goBackToClasses} style={styles.backBtn}>
              <Feather name="arrow-left" size={rs(20)} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.subHeaderTitle}>{selectedClasse.classe}</Text>
              {selectedClasse.teacher_name ? (
                <Text style={styles.subHeaderSub} numberOfLines={1}>
                  {selectedClasse.teacher_name}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Bannière succès */}
          {submitSuccess && (
            <View style={styles.successBanner}>
              <Feather name="check-circle" size={rs(16)} color={C.success} />
              <Text style={styles.successBannerText}>Évaluations enregistrées !</Text>
            </View>
          )}

          {/* Liste des élèves */}
          <FlatList
            data={selectedClasse.eleves}
            keyExtractor={e => e.id}
            contentContainerStyle={[styles.studentList, { paddingBottom: rs(140) + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: eleve }) => {
              const checked = selectedIds.has(eleve.id);
              const initials = `${eleve.nom.charAt(0)}${(eleve.prenom ?? "").charAt(0)}`.toUpperCase();
              const evalCount = competencesList.filter(c => savedEvals.has(`${c.code}:${eleve.id}`)).length;
              return (
                <TouchableOpacity
                  onPress={() => toggleStudent(eleve.id)}
                  style={[styles.studentRow, checked && styles.studentRowSelected]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.studentAvatar, checked && styles.studentAvatarSelected]}>
                    {checked
                      ? <Feather name="check" size={rs(15)} color="#fff" />
                      : <Text style={styles.studentAvatarText}>{initials}</Text>
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName} numberOfLines={1}>
                      {eleve.prenom ? `${eleve.prenom} ` : ""}{eleve.nom}
                    </Text>
                    {evalCount > 0 && (
                      <Text style={styles.studentEvalCount}>
                        {evalCount}/{competencesList.length} compétence{evalCount > 1 ? "s" : ""} évaluée{evalCount > 1 ? "s" : ""}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Feather name="check" size={rs(13)} color="#fff" />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />

          {/* Barre du bas — juste au-dessus du menu */}
          <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
            {/* Bouton Tout sélectionner / désélectionner */}
            <TouchableOpacity onPress={toggleAll} style={styles.selectAllBarBtn} activeOpacity={0.8}>
              <Feather
                name={selectedIds.size === selectedClasse.eleves.length ? "x-square" : "check-square"}
                size={rs(16)}
                color={C.brand}
              />
              <Text style={styles.selectAllBarText}>
                {selectedIds.size === selectedClasse.eleves.length
                  ? "Tout désélectionner"
                  : "Tout sélectionner"}
              </Text>
              {selectedIds.size > 0 && (
                <View style={styles.selectedCountBadge}>
                  <Text style={styles.selectedCountText}>{selectedIds.size}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Bouton Évaluer */}
            <TouchableOpacity
              onPress={goToEvaluate}
              disabled={selectedIds.size === 0}
              style={[styles.evalBtn, selectedIds.size === 0 && styles.evalBtnDisabled]}
              activeOpacity={0.85}
            >
              <Feather name="edit-3" size={rs(17)} color={selectedIds.size === 0 ? C.textMuted : "#fff"} />
              <Text style={[styles.evalBtnText, selectedIds.size === 0 && styles.evalBtnTextDisabled]}>
                {selectedIds.size === 0
                  ? "Sélectionnez des élèves"
                  : `Évaluer ${selectedIds.size} élève${selectedIds.size > 1 ? "s" : ""}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── VUE 3 : Feuille d'évaluation (pleine page) ──────────────────── */}
      {view === "evaluate" && selectedClasse && (
        <View style={{ flex: 1 }}>
          {/* Sous-header */}
          <View style={styles.subHeader}>
            <TouchableOpacity onPress={goBackToStudents} style={styles.backBtn} disabled={submitting}>
              <Feather name="arrow-left" size={rs(20)} color={submitting ? C.textMuted : C.text} />
            </TouchableOpacity>
            <View style={styles.evalHeaderIcon}>
              <Feather name="edit-3" size={rs(16)} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subHeaderTitle} numberOfLines={1}>
                {selectedClasse.classe}
                {selectedClasse.teacher_name ? ` · ${selectedClasse.teacher_name}` : ""}
              </Text>
              <Text style={styles.subHeaderSub}>
                {filteredEleves.length} élève{filteredEleves.length !== 1 ? "s" : ""} sélectionné{filteredEleves.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.evalScroll, { paddingBottom: rs(120) + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Sélecteur de compétences */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.compScroll}
              contentContainerStyle={styles.compPills}
            >
              {competencesList.map(comp => {
                const done = compProgress(comp.code);
                const isActive = comp.code === activeCompCode;
                return (
                  <TouchableOpacity
                    key={comp.id}
                    onPress={() => setActiveCompCode(comp.code)}
                    style={[styles.compPill, isActive && styles.compPillActive]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.compPillText, isActive && styles.compPillTextActive]} numberOfLines={1}>
                      {comp.label}
                    </Text>
                    {done > 0 && (
                      <View style={[styles.compDot, isActive && styles.compDotActive]}>
                        <Text style={[styles.compDotText, isActive && { color: C.brand }]}>{done}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Support ASER */}
            {aserSupport && (
              <View style={styles.aserCard}>
                <View style={styles.aserHeaderRow}>
                  <Feather name="book-open" size={rs(14)} color={C.primary} />
                  <Text style={styles.aserTitle}>Support ASER · {langue}</Text>
                </View>
                <Text style={styles.aserText}>
                  {aserSupport === "lettres"   ? aserContent.lettres
                  : aserSupport === "syllabes" ? aserContent.syllabes
                  : aserSupport === "mots"     ? aserContent.mots
                  : aserContent.operations.join("    ")}
                </Text>
              </View>
            )}

            {/* Légende */}
            <View style={styles.legend}>
              {RESULTATS.map(r => (
                <View key={r.value} style={[styles.legendItem, { backgroundColor: r.bg }]}>
                  <Text style={[styles.legendText, { color: r.color }]}>{r.symbol} {r.label}</Text>
                </View>
              ))}
            </View>

            {/* Lignes élèves */}
            {filteredEleves.map((eleve, i) => {
              const result = getResult(eleve.id);
              const initials = `${eleve.nom.charAt(0)}${(eleve.prenom ?? "").charAt(0)}`.toUpperCase();
              const resInfo = RESULTATS.find(r => r.value === result);
              return (
                <View
                  key={eleve.id}
                  style={[styles.eleveRow, i < filteredEleves.length - 1 && styles.eleveBorder]}
                >
                  <View style={[styles.eleveAvatar, resInfo && { backgroundColor: resInfo.bg }]}>
                    {result
                      ? <Text style={[styles.eleveSymbol, { color: resInfo?.color }]}>{resInfo?.symbol}</Text>
                      : <Text style={styles.eleveAvatarText}>{initials}</Text>
                    }
                  </View>
                  <Text style={styles.eleveName} numberOfLines={1}>
                    {eleve.prenom ? `${eleve.prenom} ` : ""}{eleve.nom}
                  </Text>
                  <View style={styles.eleveActions}>
                    {RESULTATS.map(r => (
                      <TouchableOpacity
                        key={r.value}
                        onPress={() => setResult(eleve.id, r.value)}
                        style={[
                          styles.resultBtn,
                          result === r.value && { backgroundColor: r.bg, borderColor: r.color },
                        ]}
                      >
                        <Text style={[
                          styles.resultBtnText,
                          result === r.value && { color: r.color },
                        ]}>
                          {r.symbol}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Erreur serveur */}
          {submitError && (
            <View style={styles.submitErrBanner}>
              <Feather name="alert-circle" size={rs(14)} color={C.danger} />
              <Text style={styles.submitErrText} numberOfLines={2}>{submitError}</Text>
              <TouchableOpacity onPress={() => setSubmitError(null)}>
                <Feather name="x" size={rs(16)} color={C.danger} />
              </TouchableOpacity>
            </View>
          )}

          {/* Bouton Enregistrer — juste au-dessus du menu */}
          <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.evalBtn, submitting && styles.evalBtnDisabled]}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={C.textMuted} />
              ) : (
                <>
                  <Feather name="check" size={rs(17)} color="#fff" />
                  <Text style={styles.evalBtnText}>
                    {pendingEvals.size === 0
                      ? "Terminer"
                      : `Enregistrer (${pendingEvals.size})`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Profile */}
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText: { fontSize: rf(15), color: C.textMuted },

  // Vue classes (header)
  viewHeader: { paddingHorizontal: rs(16), paddingTop: rs(12), paddingBottom: rs(8) },
  viewTitle:  { fontSize: rf(22), fontWeight: "800", color: C.text },
  viewSub:    { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },

  // Liste des enseignants
  teacherList: { paddingHorizontal: rs(14), paddingTop: rs(8), paddingBottom: rs(24), gap: rs(12) },

  teacherCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(18), overflow: "hidden",
  },
  teacherCardHeader: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    paddingHorizontal: rs(14), paddingVertical: rs(14),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  teacherAvatar: {
    width: rs(44), height: rs(44), borderRadius: rs(22),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  teacherAvatarText: { fontSize: rf(15), fontWeight: "800", color: C.primary },
  teacherCardName:   { fontSize: rf(16), fontWeight: "800", color: C.text },
  teacherCardMeta:   { fontSize: rf(12), color: C.textMuted, marginTop: rs(2) },

  // Chips des classes dans la carte enseignant
  classChipsRow: { paddingHorizontal: rs(10), paddingVertical: rs(8), gap: rs(6) },
  classChip: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    backgroundColor: C.bg, borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(10),
    borderWidth: 1, borderColor: C.border,
  },
  classChipNiveau: {
    width: rs(36), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },
  classChipNiveauText: { fontSize: rf(10), fontWeight: "900", color: C.primary },
  classChipName: { fontSize: rf(14), fontWeight: "700", color: C.text },
  classChipMeta:     { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },
  classChipDisabled: { opacity: 0.5 },

  noClassBanner: {
    flexDirection: "row", alignItems: "center", gap: rs(6),
    paddingHorizontal: rs(14), paddingVertical: rs(12),
    backgroundColor: C.surfaceAlt,
  },
  noClassText: { fontSize: rf(13), color: C.textMuted, fontStyle: "italic" },

  // Garder ces anciens styles (encore utilisés ailleurs)
  eleveCount: { fontSize: rf(12), color: C.textMuted, fontWeight: "600" },
  evalBadge:  { backgroundColor: C.successSoft, paddingHorizontal: rs(7), paddingVertical: rs(2), borderRadius: rs(8) },
  evalBadgeText: { fontSize: rf(11), color: C.success, fontWeight: "700" },

  // Sous-header (vues 2 et 3)
  subHeader: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingHorizontal: rs(14), paddingTop: rs(10), paddingBottom: rs(12),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:        { padding: rs(4) },
  subHeaderTitle: { fontSize: rf(16), fontWeight: "800", color: C.text },
  subHeaderSub:   { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },
  evalHeaderIcon: {
    width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },

  // Liste élèves (sélection)
  studentList:        { paddingHorizontal: rs(14), paddingTop: rs(8) },
  studentRow:         { flexDirection: "row", alignItems: "center", gap: rs(12), paddingVertical: rs(11), borderBottomWidth: 1, borderBottomColor: C.border },
  studentRowSelected: {},
  studentAvatar:      { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  studentAvatarSelected: { backgroundColor: C.brand },
  studentAvatarText:  { fontSize: rf(13), fontWeight: "700", color: C.textMuted },
  studentName:        { fontSize: rf(15), fontWeight: "600", color: C.text },
  studentEvalCount:   { fontSize: rf(12), color: C.success, fontWeight: "500", marginTop: rs(1) },
  checkbox:           { width: rs(24), height: rs(24), borderRadius: rs(6), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  checkboxChecked:    { backgroundColor: C.brand, borderColor: C.brand },

  // Barre du bas (vues 2 et 3)
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: C.bg, paddingHorizontal: rs(16), paddingTop: rs(10),
    borderTopWidth: 1, borderTopColor: C.border, gap: rs(8),
  },
  selectAllBarBtn: {
    flexDirection: "row", alignItems: "center", gap: rs(8),
    paddingVertical: rs(10), paddingHorizontal: rs(14),
    backgroundColor: C.primarySoft, borderRadius: rs(12),
    borderWidth: 1, borderColor: C.primary + "40",
  },
  selectAllBarText: { flex: 1, fontSize: rf(14), fontWeight: "600", color: C.primary },
  selectedCountBadge: {
    minWidth: rs(22), height: rs(22), borderRadius: rs(11),
    backgroundColor: C.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: rs(4),
  },
  selectedCountText: { fontSize: rf(11), fontWeight: "800", color: "#fff" },

  evalBtn: {
    backgroundColor: C.brand, paddingVertical: rs(15), borderRadius: rs(14),
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
    shadowColor: C.brand, shadowOpacity: 0.3, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  evalBtnDisabled: { backgroundColor: C.surfaceAlt, shadowOpacity: 0, elevation: 0 },
  evalBtnText:     { color: "#fff", fontSize: rf(16), fontWeight: "800" },
  evalBtnTextDisabled: { color: C.textMuted },

  // Vue évaluation
  evalScroll: { paddingHorizontal: rs(16), paddingTop: rs(12), gap: rs(12) },

  // Pills compétences
  compScroll: { flexGrow: 0 },
  compPills:  { flexDirection: "row", gap: rs(6), paddingVertical: rs(2) },
  compPill: {
    flexDirection: "row", alignItems: "center", gap: rs(5),
    paddingHorizontal: rs(12), paddingVertical: rs(7), borderRadius: rs(20),
    backgroundColor: C.surfaceAlt, borderWidth: 1.5, borderColor: C.border, maxWidth: rs(150),
  },
  compPillActive:     { backgroundColor: C.primarySoft, borderColor: C.primary },
  compPillText:       { fontSize: rf(12), fontWeight: "600", color: C.textMuted },
  compPillTextActive: { color: C.primary },
  compDot:      { minWidth: rs(18), height: rs(18), borderRadius: rs(9), backgroundColor: C.border, alignItems: "center", justifyContent: "center", paddingHorizontal: rs(3) },
  compDotActive: { backgroundColor: C.primarySoft },
  compDotText:   { fontSize: rf(10), fontWeight: "800", color: C.textMuted },

  // Support ASER
  aserCard:      { backgroundColor: C.primarySoft, borderRadius: rs(16), padding: rs(20), gap: rs(12) },
  aserHeaderRow: { flexDirection: "row", alignItems: "center", gap: rs(8) },
  aserTitle:     { fontSize: rf(15), fontWeight: "700", color: C.primary },
  aserText:      { fontSize: rf(42), fontWeight: "800", color: C.text, letterSpacing: 3, lineHeight: rf(58) },

  // Légende
  legend:     { flexDirection: "row", gap: rs(5) },
  legendItem: { flex: 1, paddingVertical: rs(5), borderRadius: rs(8), alignItems: "center" },
  legendText: { fontSize: rf(11), fontWeight: "700" },

  // Lignes élèves (vue évaluation)
  eleveRow:      { flexDirection: "row", alignItems: "center", gap: rs(10), paddingVertical: rs(10) },
  eleveBorder:   { borderBottomWidth: 1, borderBottomColor: C.border },
  eleveAvatar:   { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  eleveAvatarText: { fontSize: rf(14), fontWeight: "700", color: C.textMuted },
  eleveSymbol:   { fontSize: rf(18), fontWeight: "800" },
  eleveName:     { flex: 1, fontSize: rf(17), fontWeight: "600", color: C.text },
  eleveActions:  { flexDirection: "row", gap: rs(5) },
  resultBtn:     { width: rs(34), height: rs(34), borderRadius: rs(9), borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceAlt },
  resultBtnText: { fontSize: rf(15), fontWeight: "800", color: C.textMuted },

  // Bannières
  submitErrBanner:   { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderTopWidth: 1, borderTopColor: C.danger, padding: rs(12), paddingHorizontal: rs(16) },
  submitErrText:     { flex: 1, fontSize: rf(13), color: C.danger, fontWeight: "600" },
  successBanner:     { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.success, borderRadius: rs(12), padding: rs(12), marginHorizontal: rs(14), marginBottom: rs(6) },
  successBannerText: { fontSize: rf(14), fontWeight: "700", color: C.success },
  errorBanner:       { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderRadius: rs(10), padding: rs(12), margin: rs(14) },
  errorText:         { flex: 1, fontSize: rf(14), color: C.danger },
  retryText:         { fontSize: rf(14), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },
  emptyState:        { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12), paddingVertical: rs(60) },
  emptyText:         { fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(22) },
});
