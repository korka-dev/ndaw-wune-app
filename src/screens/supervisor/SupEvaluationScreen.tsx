/**
 * SupEvaluationScreen — Évaluation des élèves tirés au sort.
 *
 * Le superviseur ne choisit plus les élèves : le programme les tire au sort
 * lors de la création du sujet d'évaluation par l'admin.
 *
 * Flux :
 *   1. "sujets"    → sujets d'évaluation avec les élèves tirés au sort
 *   2. "presence"  → marquer les élèves tirés présents / absents, puis valider
 *   3. "doc"       → choix du dossier d'évaluation (support fixe par période)
 *   4. "evaluer"   → pour chaque élève présent : Réussi / Intermédiaire / Pas réussi
 *   5. envoi des résultats
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { trackUsage } from "../../services/usage";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";
import TourTarget from "../../components/TourTarget";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalDoc {
  id:         string;
  langue:     string;
  titre:      string;
  lettres:    string[];
  syllabes:   string[];
  mots:       string[];
  operations: string[];
}

interface TirageApp {
  tirage_id:    string;
  eleve_id:     string;
  eleve_nom:    string;
  eleve_prenom: string | null;
  eleve_genre:  string | null;
  eleve_classe: string;
  present:      boolean | null;
  resultat:     string | null;
}

interface SujetApp {
  id:          string;
  titre:       string;
  description: string | null;
  created_at:  string;
  eleves:      TirageApp[];
}

type ViewType = "sujets" | "presence" | "doc" | "evaluer";

type Resultat = "reussi" | "intermediaire" | "pas_reussi";

const RESULTATS: { key: Resultat; label: string; icon: keyof typeof Feather.glyphMap; color: string; soft: string }[] = [
  { key: "reussi",        label: "Réussi",        icon: "check-circle", color: C.success,  soft: C.successSoft },
  { key: "intermediaire", label: "Intermédiaire", icon: "minus-circle", color: C.warn,     soft: C.warnSoft },
  { key: "pas_reussi",    label: "Pas réussi",    icon: "x-circle",     color: C.danger,   soft: C.dangerSoft },
];

function eleveName(t: TirageApp): string {
  return `${t.eleve_prenom ? `${t.eleve_prenom} ` : ""}${t.eleve_nom}`;
}

// ── Écran principal ───────────────────────────────────────────────────────────

export default function SupEvaluationScreen() {
  useEffect(() => { trackUsage("evaluations").catch(() => {}); }, []);
  const { user, isOnline } = useStore();

  // Données
  const [sujets,      setSujets]      = useState<SujetApp[]>([]);
  const [evalDocs,    setEvalDocs]    = useState<EvalDoc[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Navigation
  const [view,        setView]        = useState<ViewType>("sujets");
  const [activeSujet, setActiveSujet] = useState<SujetApp | null>(null);
  const [activeDoc,   setActiveDoc]   = useState<EvalDoc | null>(null);

  // Étape présence : tirage_id → présent ?
  const [presenceMap, setPresenceMap] = useState<Map<string, boolean>>(new Map());
  const [savingPresence, setSavingPresence] = useState(false);

  // Étape évaluation : élèves présents + résultat choisi
  const [evalList,    setEvalList]    = useState<TirageApp[]>([]);
  const [results,     setResults]     = useState<Map<string, Resultat>>(new Map());
  const [evalIndex,   setEvalIndex]   = useState(0);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitDone,  setSubmitDone]  = useState(false);

  // ── Chargement ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [sujetsRes, docsRes] = await Promise.all([
        superviseurApi.evaluationSujets(),
        superviseurApi.evaluationDocs(),
      ]);
      setSujets(sujetsRes.data ?? []);
      setEvalDocs(docsRes.data ?? []);
    } catch {
      setError("Impossible de charger les évaluations. Vérifiez votre connexion.");
    }
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // ── Étape 1 → 2 : ouvrir un sujet ──────────────────────────────────────────

  const openSujet = (sujet: SujetApp) => {
    setActiveSujet(sujet);
    const m = new Map<string, boolean>();
    for (const t of sujet.eleves) {
      if (t.present !== null) m.set(t.tirage_id, t.present);
    }
    setPresenceMap(m);
    setActiveDoc(null);
    setResults(new Map());
    setSubmitDone(false);
    setView("presence");
  };

  const setPresence = (tirageId: string, present: boolean) => {
    setPresenceMap(prev => new Map(prev).set(tirageId, present));
  };

  // ── Étape 2 → 3 : valider les présences ────────────────────────────────────

  const validatePresences = async () => {
    if (!activeSujet || savingPresence) return;
    const entries = activeSujet.eleves
      .filter(t => presenceMap.has(t.tirage_id))
      .map(t => ({ tirage_id: t.tirage_id, present: presenceMap.get(t.tirage_id)! }));

    if (entries.length < activeSujet.eleves.length) {
      Alert.alert("Pointage incomplet", "Indiquez présent ou absent pour chaque élève tiré au sort.");
      return;
    }

    const presents = activeSujet.eleves.filter(
      t => presenceMap.get(t.tirage_id) === true && !t.resultat
    );

    setSavingPresence(true);
    try {
      await superviseurApi.setTiragesPresences(entries);
      setEvalList(presents);
      setEvalIndex(0);
      if (presents.length === 0) {
        Alert.alert("Pointage enregistré", "Aucun élève présent restant à évaluer pour ce sujet.");
        await fetchData();
        goTo("sujets");
      } else {
        setView("doc");
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer les présences. Vérifiez votre connexion.");
    } finally {
      setSavingPresence(false);
    }
  };

  // ── Étape 3 → 4 : choix du dossier ─────────────────────────────────────────

  const chooseDoc = (doc: EvalDoc) => {
    setActiveDoc(doc);
    setView("evaluer");
  };

  // ── Étape 4 : évaluation à 3 options ───────────────────────────────────────

  const current = evalList[evalIndex] ?? null;
  const nbEvalues = evalList.filter(t => results.has(t.tirage_id)).length;

  const chooseResult = (r: Resultat) => {
    if (!current) return;
    setResults(prev => new Map(prev).set(current.tirage_id, r));
  };

  const submitAll = async () => {
    if (submitting) return;
    if (nbEvalues < evalList.length) {
      Alert.alert("Évaluation incomplète", "Choisissez un résultat pour chaque élève avant d'envoyer.");
      return;
    }
    setSubmitting(true);
    try {
      for (const t of evalList) {
        const r = results.get(t.tirage_id);
        if (!r) continue;
        const fd = new FormData();
        fd.append("resultat", r);
        await superviseurApi.submitTirage(t.tirage_id, fd);
      }
      setSubmitDone(true);
      fetchData().catch(() => {});
    } catch {
      Alert.alert("Erreur", "Impossible d'envoyer les évaluations. Vérifiez votre connexion et réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Navigation retour ─────────────────────────────────────────────────────

  const goTo = (target: ViewType) => {
    if (target === "sujets") {
      setActiveSujet(null);
      setActiveDoc(null);
      setPresenceMap(new Map());
      setEvalList([]);
      setResults(new Map());
      setEvalIndex(0);
      setSubmitDone(false);
    }
    setView(target);
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <View style={[st.root, st.center]}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={st.loadingText}>Chargement…</Text>
    </View>
  );

  const nbPointes = activeSujet
    ? activeSujet.eleves.filter(t => presenceMap.has(t.tirage_id)).length
    : 0;
  const nbPresents = activeSujet
    ? activeSujet.eleves.filter(t => presenceMap.get(t.tirage_id) === true).length
    : 0;

  return (
    <View style={st.root}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        isOnline={isOnline}
        sectionLabel="Espace Superviseur"
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VUE 1 — Sujets d'évaluation (élèves déjà tirés au sort)            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "sujets" && (
        <View style={{ flex: 1 }}>
          <View style={st.viewHeader}>
            <Text style={st.viewTitle}>Évaluations</Text>
            <Text style={st.viewSub}>
              Les élèves sont tirés au sort automatiquement par le programme
            </Text>
          </View>

          {error && (
            <View style={st.errorBanner}>
              <Feather name="alert-circle" size={rs(14)} color={C.danger} />
              <Text style={st.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}>
                <Text style={st.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}

          <TourTarget id="sup.evaluation.contenu" style={{ flex: 1 }}>
          {sujets.length === 0 && !error ? (
            <ScrollView
              contentContainerStyle={st.emptyState}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
            >
              <Feather name="award" size={rs(40)} color={C.textMuted} />
              <Text style={st.emptyText}>
                Aucun sujet d'évaluation pour vos classes.{"\n"}L'administrateur crée les sujets et le programme tire les élèves au sort.
              </Text>
            </ScrollView>
          ) : (
            <FlatList
              data={sujets}
              keyExtractor={s => s.id}
              contentContainerStyle={st.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
              renderItem={({ item: sujet }) => {
                const nbTotal   = sujet.eleves.length;
                const nbFaits   = sujet.eleves.filter(t => t.resultat).length;
                const nbAbsents = sujet.eleves.filter(t => t.present === false).length;
                const done      = nbTotal > 0 && nbFaits + nbAbsents >= nbTotal;
                return (
                  <TouchableOpacity
                    style={st.sujetCard}
                    onPress={() => openSujet(sujet)}
                    activeOpacity={0.8}
                  >
                    <View style={st.sujetIconWrap}>
                      <Feather name="shuffle" size={rs(18)} color={C.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.sujetTitre} numberOfLines={1}>{sujet.titre}</Text>
                      {sujet.description ? (
                        <Text style={st.sujetDesc} numberOfLines={1}>{sujet.description}</Text>
                      ) : null}
                      <View style={st.sujetMetaRow}>
                        <View style={st.sujetBadge}>
                          <Feather name="users" size={rf(11)} color={C.primary} />
                          <Text style={st.sujetBadgeTxt}>{nbTotal} élève{nbTotal !== 1 ? "s" : ""} tiré{nbTotal !== 1 ? "s" : ""}</Text>
                        </View>
                        {done ? (
                          <View style={[st.sujetBadge, { backgroundColor: C.successSoft }]}>
                            <Feather name="check" size={rf(11)} color={C.success} />
                            <Text style={[st.sujetBadgeTxt, { color: C.success }]}>Terminé</Text>
                          </View>
                        ) : nbFaits > 0 ? (
                          <View style={[st.sujetBadge, { backgroundColor: C.warnSoft }]}>
                            <Text style={[st.sujetBadgeTxt, { color: C.warn }]}>{nbFaits}/{nbTotal} évalué{nbFaits !== 1 ? "s" : ""}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Feather name="chevron-right" size={rs(18)} color={C.textMuted} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
          </TourTarget>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VUE 2 — Présence des élèves tirés au sort                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "presence" && activeSujet && (
        <View style={{ flex: 1 }}>
          <View style={st.subHeader}>
            <TouchableOpacity onPress={() => goTo("sujets")} style={st.backBtn}>
              <Feather name="arrow-left" size={rs(20)} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>{activeSujet.titre}</Text>
              <Text style={st.subHeaderSub}>
                Étape 1/3 — Pointez les élèves tirés au sort · {nbPointes}/{activeSujet.eleves.length}
              </Text>
            </View>
          </View>

          <FlatList
            data={activeSujet.eleves}
            keyExtractor={t => t.tirage_id}
            contentContainerStyle={st.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: t }) => {
              const p = presenceMap.get(t.tirage_id);
              const dejaEvalue = !!t.resultat;
              return (
                <View style={[st.presCard, dejaEvalue && { opacity: 0.55 }]}>
                  <View style={st.eleveAvatar}>
                    <Text style={st.eleveAvatarText}>
                      {t.eleve_nom.charAt(0)}{(t.eleve_prenom ?? "").charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.eleveName} numberOfLines={1}>{eleveName(t)}</Text>
                    <Text style={st.eleveGenre}>
                      {t.eleve_classe}{dejaEvalue ? " · Déjà évalué" : ""}
                    </Text>
                  </View>
                  <View style={st.presBtns}>
                    <TouchableOpacity
                      style={[st.presBtn, p === true && st.presBtnOnP]}
                      onPress={() => setPresence(t.tirage_id, true)}
                      disabled={dejaEvalue}
                      activeOpacity={0.75}
                    >
                      <Feather name="check" size={rf(14)} color={p === true ? "#fff" : C.success} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.presBtn, st.presBtnA, p === false && st.presBtnOnA]}
                      onPress={() => setPresence(t.tirage_id, false)}
                      disabled={dejaEvalue}
                      activeOpacity={0.75}
                    >
                      <Feather name="x" size={rf(14)} color={p === false ? "#fff" : C.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />

          <View style={st.evalBtnBar}>
            <TouchableOpacity
              style={[st.evalBtn, (nbPointes < activeSujet.eleves.length || savingPresence) && st.evalBtnDisabled]}
              onPress={validatePresences}
              disabled={nbPointes < activeSujet.eleves.length || savingPresence}
              activeOpacity={0.85}
            >
              {savingPresence ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={rs(16)} color={nbPointes < activeSujet.eleves.length ? C.textMuted : "#fff"} />
                  <Text style={[st.evalBtnText, nbPointes < activeSujet.eleves.length && st.evalBtnTextDisabled]}>
                    Valider ({nbPresents} présent{nbPresents !== 1 ? "s" : ""})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VUE 3 — Choix du dossier d'évaluation (support fixe par période)   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "doc" && activeSujet && (
        <View style={{ flex: 1 }}>
          <View style={st.subHeader}>
            <TouchableOpacity onPress={() => setView("presence")} style={st.backBtn}>
              <Feather name="arrow-left" size={rs(20)} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>{activeSujet.titre}</Text>
              <Text style={st.subHeaderSub}>Étape 2/3 — Choisissez le dossier d'évaluation</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={st.listContent} showsVerticalScrollIndicator={false}>
            {evalDocs.length === 0 ? (
              <View style={st.emptyState}>
                <Feather name="file-text" size={rs(40)} color={C.textMuted} />
                <Text style={st.emptyText}>Aucun dossier d'évaluation disponible.{"\n"}Contactez l'administrateur.</Text>
              </View>
            ) : null}
            {evalDocs.map(doc => (
              <TouchableOpacity key={doc.id} style={st.docCard} onPress={() => chooseDoc(doc)} activeOpacity={0.8}>
                <View style={st.docCardLeft}>
                  <View style={st.docLangBadge}>
                    <Text style={st.docLangText}>{doc.langue.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.docLangName}>{doc.titre || `Test Élève en ${doc.langue}`}</Text>
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
      {/* VUE 4 — Évaluation : Réussi / Intermédiaire / Pas réussi           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {view === "evaluer" && activeSujet && activeDoc && (
        <View style={{ flex: 1 }}>
          <View style={st.subHeader}>
            <TouchableOpacity onPress={() => setView("doc")} style={st.backBtn} disabled={submitting}>
              <Feather name="arrow-left" size={rs(20)} color={submitting ? C.textMuted : C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>
                {current ? eleveName(current) : activeSujet.titre}
              </Text>
              <Text style={st.subHeaderSub}>
                Étape 3/3 — Élève {Math.min(evalIndex + 1, evalList.length)}/{evalList.length} · {activeDoc.langue}
              </Text>
            </View>
          </View>

          {submitDone ? (
            <View style={[st.center, { gap: rs(16) }]}>
              <Feather name="check-circle" size={rs(52)} color={C.success} />
              <Text style={st.doneTitle}>Évaluations envoyées !</Text>
              <Text style={st.doneSub}>{nbEvalues} élève{nbEvalues !== 1 ? "s" : ""} évalué{nbEvalues !== 1 ? "s" : ""}</Text>
              <TouchableOpacity style={st.doneBtn} onPress={() => goTo("sujets")} activeOpacity={0.85}>
                <Text style={st.doneBtnText}>Retour aux sujets</Text>
              </TouchableOpacity>
            </View>
          ) : current ? (
            <>
              <View style={st.progBarOuter}>
                <View style={[st.progBarFill, { width: `${Math.round((nbEvalues / Math.max(1, evalList.length)) * 100)}%` as any }]} />
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={st.evalScroll} showsVerticalScrollIndicator={false}>
                {/* ── Support d'évaluation (fixe pour la période) ── */}
                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Lettres</Text>
                  <View style={st.tokensRow}>
                    {activeDoc.lettres.map((l, i) => (
                      <View key={i} style={st.token}><Text style={st.tokenText}>{l}</Text></View>
                    ))}
                  </View>
                </View>
                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Syllabes</Text>
                  <View style={st.tokensRow}>
                    {activeDoc.syllabes.map((x, i) => (
                      <View key={i} style={st.token}><Text style={st.tokenText}>{x}</Text></View>
                    ))}
                  </View>
                </View>
                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Mots</Text>
                  <View style={st.tokensRow}>
                    {activeDoc.mots.map((x, i) => (
                      <View key={i} style={[st.token, st.tokenMot]}><Text style={st.tokenText}>{x}</Text></View>
                    ))}
                  </View>
                </View>
                <View style={st.contentCard}>
                  <Text style={st.contentLabel}>Opérations</Text>
                  <View style={st.opsGrid}>
                    {activeDoc.operations.map((op, i) => (
                      <View key={i} style={st.opItem}><Text style={st.opText}>{op}</Text></View>
                    ))}
                  </View>
                </View>

                {/* ── Résultat : 3 options ── */}
                <Text style={st.resultTitle}>Résultat de l'élève</Text>
                <View style={st.resultRow}>
                  {RESULTATS.map(r => {
                    const sel = results.get(current.tirage_id) === r.key;
                    return (
                      <TouchableOpacity
                        key={r.key}
                        style={[st.resultBtn, { borderColor: r.color + "55", backgroundColor: sel ? r.color : r.soft }]}
                        onPress={() => chooseResult(r.key)}
                        activeOpacity={0.8}
                      >
                        <Feather name={r.icon} size={rf(20)} color={sel ? "#fff" : r.color} />
                        <Text style={[st.resultBtnTxt, { color: sel ? "#fff" : r.color }]}>{r.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── Autres élèves ── */}
                {evalList.length > 1 && (
                  <View style={st.otherEleves}>
                    <Text style={st.otherElevesTitle}>Élèves à évaluer</Text>
                    {evalList.map((t, i) => {
                      const r = results.get(t.tirage_id);
                      const cfg = RESULTATS.find(x => x.key === r);
                      return (
                        <TouchableOpacity
                          key={t.tirage_id}
                          style={[st.otherEleveRow, i === evalIndex && { backgroundColor: C.primarySoft + "50" }]}
                          onPress={() => setEvalIndex(i)}
                          activeOpacity={0.75}
                        >
                          <Text style={st.otherEleveName} numberOfLines={1}>{eleveName(t)}</Text>
                          <View style={[st.miniBadge, { backgroundColor: cfg ? cfg.soft : C.surfaceAlt }]}>
                            <Text style={[st.miniBadgeText, { color: cfg ? cfg.color : C.textMuted }]}>
                              {cfg ? cfg.label : "En attente"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Navigation + envoi */}
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

                  {evalIndex < evalList.length - 1 ? (
                    <TouchableOpacity style={st.mainNavBtn} onPress={() => setEvalIndex(i => i + 1)} activeOpacity={0.85}>
                      <Text style={st.mainNavBtnText}>Suivant</Text>
                      <Feather name="chevron-right" size={rs(18)} color="#fff" />
                    </TouchableOpacity>
                  ) : submitting ? (
                    <View style={[st.mainNavBtn, { backgroundColor: C.surfaceAlt }]}>
                      <ActivityIndicator size="small" color={C.brand} />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[st.mainNavBtn, { backgroundColor: nbEvalues < evalList.length ? C.surfaceAlt : C.success }]}
                      onPress={submitAll}
                      activeOpacity={0.85}
                    >
                      <Feather name="send" size={rs(16)} color={nbEvalues < evalList.length ? C.textMuted : "#fff"} />
                      <Text style={[st.mainNavBtnText, nbEvalues < evalList.length && { color: C.textMuted }]}>
                        Envoyer ({nbEvalues}/{evalList.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          ) : null}
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

  listContent: { paddingHorizontal: rs(14), paddingTop: rs(8), paddingBottom: rs(16), gap: rs(10) },

  // Sujets
  sujetCard: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(16), padding: rs(14),
  },
  sujetIconWrap: {
    width: rs(44), height: rs(44), borderRadius: rs(13),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },
  sujetTitre:   { fontSize: rf(15), fontWeight: "800", color: C.text },
  sujetDesc:    { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },
  sujetMetaRow: { flexDirection: "row", gap: rs(6), marginTop: rs(6), flexWrap: "wrap" },
  sujetBadge: {
    flexDirection: "row", alignItems: "center", gap: rs(4),
    backgroundColor: C.primarySoft, borderRadius: rs(8),
    paddingHorizontal: rs(7), paddingVertical: rs(3),
  },
  sujetBadgeTxt: { fontSize: rf(11), fontWeight: "700", color: C.primary },

  // Sous-header
  subHeader: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingHorizontal: rs(14), paddingTop: rs(10), paddingBottom: rs(12),
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:        { padding: rs(4) },
  subHeaderTitle: { fontSize: rf(16), fontWeight: "800", color: C.text },
  subHeaderSub:   { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },

  // Présence
  presCard: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(14), padding: rs(12),
  },
  presBtns: { flexDirection: "row", gap: rs(8) },
  presBtn: {
    width: rs(38), height: rs(38), borderRadius: rs(11),
    backgroundColor: C.successSoft, borderWidth: 1.5, borderColor: C.success + "55",
    alignItems: "center", justifyContent: "center",
  },
  presBtnA:   { backgroundColor: C.dangerSoft, borderColor: C.danger + "55" },
  presBtnOnP: { backgroundColor: C.success, borderColor: C.success },
  presBtnOnA: { backgroundColor: C.danger, borderColor: C.danger },

  eleveAvatar:     { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  eleveAvatarText: { fontSize: rf(12), fontWeight: "700", color: C.textMuted },
  eleveName:       { fontSize: rf(15), fontWeight: "600", color: C.text },
  eleveGenre:      { fontSize: rf(12), color: C.textMuted },

  // Dossiers d'évaluation
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

  // Bouton bas
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
  evalScroll:   { paddingHorizontal: rs(14), paddingTop: rs(14), paddingBottom: rs(24), gap: rs(12) },

  contentCard:  { backgroundColor: C.primarySoft + "60", borderRadius: rs(14), padding: rs(14), gap: rs(10) },
  contentLabel: { fontSize: rf(13), fontWeight: "700", color: C.primary },
  tokensRow:    { flexDirection: "row", flexWrap: "wrap", gap: rs(6) },
  token:        { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(5) },
  tokenMot:     { paddingHorizontal: rs(12) },
  tokenText:    { fontSize: rf(15), fontWeight: "700", color: C.text },
  opsGrid:      { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  opItem:       { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(10), paddingHorizontal: rs(14), paddingVertical: rs(8) },
  opText:       { fontSize: rf(16), fontWeight: "700", color: C.text, fontFamily: "monospace" },

  resultTitle: { fontSize: rf(16), fontWeight: "800", color: C.text, marginTop: rs(4) },
  resultRow:   { flexDirection: "row", gap: rs(8) },
  resultBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: rs(6),
    borderRadius: rs(14), borderWidth: 1.5, paddingVertical: rs(14),
  },
  resultBtnTxt: { fontSize: rf(12), fontWeight: "800", textAlign: "center" },

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
