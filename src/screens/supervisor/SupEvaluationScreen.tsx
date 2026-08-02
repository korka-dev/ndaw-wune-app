/**
 * SupEvaluationScreen — Évaluation des élèves par le superviseur.
 *
 * Parcours :
 *   1. "enseignants" → ses enseignants (il en suit souvent plusieurs)
 *   2. "eleves"      → tous les élèves de cet enseignant + bouton « Tirer au sort »
 *   3. "tires"       → les élèves tirés au hasard dans cette liste
 *   4. "dossier"     → contenu du dossier d'évaluation (lettres, syllabes, mots,
 *                      opérations) dans la langue d'enseignement de l'école
 *   5. "evaluer"     → un élève après l'autre : Réussi / Intermédiaire / Pas réussi
 *
 * Le tirage est fait dans l'app, sur la liste réelle de la classe, au moment où
 * le superviseur est devant les élèves — et non plus à l'avance par l'admin.
 *
 * Les résultats sont enregistrés dans `evaluations_eleves`, la table que lit
 * l'onglet « Évaluations » de l'app enseignant : chaque enseignant voit donc
 * les évaluations faites par son superviseur.
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
import BackButton from "../../components/BackButton";
import ProfileSheet from "../../components/ProfileSheet";
import TourTarget from "../../components/TourTarget";
import { useAndroidBack } from "../../hooks/useAndroidBack";

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

interface ClasseMeta { classe: string; nb_eleves: number }

interface Enseignant {
  teacher_id:   string;
  teacher_name: string;
  classes:      ClasseMeta[];
}

interface Eleve {
  id:     string;
  nom:    string;
  prenom: string | null;
  genre:  string | null;
  classe: string;
}

type ViewType = "enseignants" | "eleves" | "tires" | "dossier" | "evaluer";

type Resultat = "reussi" | "intermediaire" | "pas_reussi";

/** Nombre d'élèves tirés au sort par enseignant. */
const NB_TIRAGE = 5;

const RESULTATS: { key: Resultat; label: string; icon: keyof typeof Feather.glyphMap; color: string; soft: string }[] = [
  { key: "reussi",        label: "Réussi",        icon: "check-circle", color: C.success,  soft: C.successSoft },
  { key: "intermediaire", label: "Intermédiaire", icon: "minus-circle", color: C.warn,     soft: C.warnSoft },
  { key: "pas_reussi",    label: "Pas réussi",    icon: "x-circle",     color: C.danger,   soft: C.dangerSoft },
];

const eleveName = (e: Eleve): string => `${e.prenom ? `${e.prenom} ` : ""}${e.nom}`;
const initiales = (e: Eleve): string =>
  `${e.nom.charAt(0)}${(e.prenom ?? "").charAt(0)}`.toUpperCase();

/** Tirage aléatoire sans remise (Fisher-Yates partiel). */
function tirerAuSort<T>(liste: T[], n: number): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, Math.min(n, copie.length));
}

const aujourdhui = (): string => new Date().toISOString().slice(0, 10);

// ── Écran principal ───────────────────────────────────────────────────────────

export default function SupEvaluationScreen() {
  useEffect(() => { trackUsage("evaluations").catch(() => {}); }, []);
  const { user, isOnline, syncData } = useStore();
  const langueRaw   = syncData?.school?.langue ?? null;
  const langueEcole = langueRaw ? langueRaw.charAt(0).toUpperCase() + langueRaw.slice(1) : null;

  // Données
  const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
  const [evalDocs,    setEvalDocs]    = useState<EvalDoc[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Navigation
  const [view,          setView]          = useState<ViewType>("enseignants");
  const [activeEns,     setActiveEns]     = useState<Enseignant | null>(null);
  const [eleves,        setEleves]        = useState<Eleve[]>([]);
  const [loadingEleves, setLoadingEleves] = useState(false);
  const [tires,         setTires]         = useState<Eleve[]>([]);
  // Présence des élèves tirés : un élève absent le jour de la visite est écarté
  // de l'évaluation. Tous présents par défaut.
  const [presences,     setPresences]     = useState<Map<string, boolean>>(new Map());
  const [activeDoc,     setActiveDoc]     = useState<EvalDoc | null>(null);

  // Évaluation
  const [results,    setResults]    = useState<Map<string, Resultat>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  // ── Chargement ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [ensRes, docsRes] = await Promise.all([
        superviseurApi.eleves(),
        superviseurApi.evaluationDocs(),
      ]);
      setEnseignants(ensRes.data?.teachers ?? []);
      setEvalDocs(docsRes.data ?? []);
    } catch {
      setError("Impossible de charger les données. Vérifiez votre connexion.");
    }
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const syncOffline = useStore(st => st.syncOffline);
  const [syncing, setSyncing] = useState(false);
  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try { await Promise.all([syncOffline(true).catch(() => {}), fetchData()]); }
    finally { setSyncing(false); }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const retour = useCallback(() => {
    if (view === "evaluer")  { setView("dossier");     return; }
    if (view === "dossier")  { setView("tires");       return; }
    if (view === "tires")    { setView("eleves");      return; }
    if (view === "eleves")   {
      setView("enseignants");
      setActiveEns(null); setEleves([]); setTires([]);
      setResults(new Map()); setSubmitDone(false);
    }
  }, [view]);

  useAndroidBack(useCallback(() => { retour(); return true; }, [retour]));

  // ── Étape 1 → 2 : charger les élèves de l'enseignant ───────────────────────

  const ouvrirEnseignant = async (ens: Enseignant) => {
    setActiveEns(ens);
    setTires([]); setResults(new Map()); setSubmitDone(false);
    setView("eleves");
    setLoadingEleves(true);
    try {
      // Un enseignant peut avoir plusieurs classes : on réunit tous ses élèves.
      const listes = await Promise.all(
        ens.classes.map(c => superviseurApi.classeEleves(ens.teacher_id, c.classe)),
      );
      const tous = listes.flatMap(r => (r.data ?? []) as Eleve[]);
      tous.sort((a, b) => eleveName(a).localeCompare(eleveName(b)));
      setEleves(tous);
    } catch {
      setEleves([]);
      Alert.alert("Erreur", "Impossible de charger les élèves de cet enseignant.");
    } finally {
      setLoadingEleves(false);
    }
  };

  // ── Étape 2 → 3 : tirage au sort ───────────────────────────────────────────

  const lancerTirage = () => {
    if (eleves.length === 0) return;
    const choisis = tirerAuSort(eleves, NB_TIRAGE);
    setTires(choisis);
    setPresences(new Map(choisis.map(e => [e.id, true])));
    setResults(new Map());
    setView("tires");
  };

  const basculerPresence = (id: string) => {
    setPresences(prev => {
      const m = new Map(prev);
      const present = m.get(id) !== false;
      m.set(id, !present);
      return m;
    });
    // Un élève marqué absent ne doit pas conserver de résultat saisi.
    setResults(prev => {
      const m = new Map(prev);
      m.delete(id);
      return m;
    });
  };

  /** Élèves réellement évalués : les tirés présents. */
  const aEvaluer = tires.filter(e => presences.get(e.id) !== false);

  // ── Étape 3 → 4 : ouvrir le dossier d'évaluation ───────────────────────────

  const ouvrirDossier = () => {
    if (aEvaluer.length === 0) {
      Alert.alert("Aucun élève présent", "Marquez au moins un élève présent, ou relancez le tirage.");
      return;
    }
    if (evalDocs.length === 0) {
      Alert.alert(
        "Dossier d'évaluation manquant",
        `Aucun dossier d'évaluation${langueEcole ? ` en ${langueEcole}` : ""} n'est disponible. Contactez l'administrateur.`,
      );
      return;
    }
    setActiveDoc(evalDocs[0]);   // imposé par la langue de l'école
    setView("dossier");
  };

  // ── Étape 5 : évaluation et envoi ──────────────────────────────────────────

  /** Nombre d'élèves déjà notés (parmi les présents). */
  const nbNotes = aEvaluer.filter(e => results.has(e.id)).length;

  const envoyer = async () => {
    if (!activeDoc || submitting) return;
    const manquants = aEvaluer.filter(e => !results.has(e.id));
    if (manquants.length > 0) {
      Alert.alert("Évaluation incomplète", "Choisissez un résultat pour chaque élève tiré au sort.");
      return;
    }
    setSubmitting(true);
    try {
      await superviseurApi.submitEvaluations(
        aEvaluer.map(e => ({
          eleve_id:   e.id,
          competence: activeDoc.titre,   // le dossier tient lieu de sujet évalué
          resultat:   results.get(e.id)!,
          date_eval:  aujourdhui(),
        })),
      );
      setSubmitDone(true);
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer les évaluations. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  const terminer = () => {
    setView("enseignants");
    setActiveEns(null); setEleves([]); setTires([]);
    setResults(new Map()); setSubmitDone(false);
    fetchData().catch(() => {});
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <View style={[st.root, st.center]}>
      <ActivityIndicator size="large" color={C.brand} />
      <Text style={st.loadingText}>Chargement…</Text>
    </View>
  );

  const enTete = (titre: string, sous: string) => (
    <View style={st.subHeader}>
      <BackButton onPress={retour} disabled={submitting} style={{ marginRight: rs(10) }} />
      <View style={{ flex: 1 }}>
        <Text style={st.subHeaderTitle} numberOfLines={1}>{titre}</Text>
        <Text style={st.subHeaderSub}>{sous}</Text>
      </View>
    </View>
  );

  return (
    <View style={st.root}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
        sectionLabel="Espace Superviseur"
      />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* VUE 1 — Mes enseignants                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === "enseignants" && (
        <View style={{ flex: 1 }}>
          <View style={st.viewHeader}>
            <Text style={st.viewTitle}>Mes enseignants</Text>
            <Text style={st.viewSub}>Choisissez un enseignant pour évaluer ses élèves</Text>
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
          {enseignants.length === 0 && !error ? (
            <ScrollView
              contentContainerStyle={st.emptyState}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
            >
              <Feather name="users" size={rs(40)} color={C.textMuted} />
              <Text style={st.emptyText}>
                Aucun enseignant ne vous est rattaché.{"\n"}Contactez l&apos;administrateur.
              </Text>
            </ScrollView>
          ) : (
            <FlatList
              data={enseignants}
              keyExtractor={e => e.teacher_id}
              contentContainerStyle={st.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
              renderItem={({ item: ens }) => {
                const nbEleves = ens.classes.reduce((n, c) => n + c.nb_eleves, 0);
                return (
                  <TouchableOpacity style={st.sujetCard} onPress={() => ouvrirEnseignant(ens)} activeOpacity={0.8}>
                    <View style={st.sujetIconWrap}>
                      <Feather name="user" size={rs(18)} color={C.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.sujetTitre} numberOfLines={1}>{ens.teacher_name}</Text>
                      {ens.classes.length > 0 && (
                        <Text style={st.sujetDesc} numberOfLines={1}>
                          {ens.classes.map(c => c.classe).join(" · ")}
                        </Text>
                      )}
                      <View style={st.sujetMetaRow}>
                        <View style={st.sujetBadge}>
                          <Feather name="users" size={rf(11)} color={C.primary} />
                          <Text style={st.sujetBadgeTxt}>{nbEleves} élève{nbEleves !== 1 ? "s" : ""}</Text>
                        </View>
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* VUE 2 — Élèves de l'enseignant + tirage au sort                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === "eleves" && activeEns && (
        <View style={{ flex: 1 }}>
          {enTete(activeEns.teacher_name, `Étape 1/4 — ${eleves.length} élève${eleves.length !== 1 ? "s" : ""} dans ses classes`)}

          {loadingEleves ? (
            <View style={[st.center, { flex: 1 }]}>
              <ActivityIndicator size="large" color={C.brand} />
              <Text style={st.loadingText}>Chargement des élèves…</Text>
            </View>
          ) : eleves.length === 0 ? (
            <View style={st.emptyState}>
              <Feather name="users" size={rs(40)} color={C.textMuted} />
              <Text style={st.emptyText}>Aucun élève actif dans les classes de cet enseignant.</Text>
            </View>
          ) : (
            <>
              <FlatList
                data={eleves}
                keyExtractor={e => e.id}
                contentContainerStyle={st.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: e, index }) => (
                  <View style={st.presCard}>
                    <View style={st.eleveAvatar}>
                      <Text style={st.eleveAvatarText}>{initiales(e)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.eleveName} numberOfLines={1}>{eleveName(e)}</Text>
                      <Text style={st.eleveGenre}>{e.classe}</Text>
                    </View>
                    <Text style={st.eleveRang}>{index + 1}</Text>
                  </View>
                )}
              />

              <View style={st.evalBtnBar}>
                <TouchableOpacity style={st.evalBtn} onPress={lancerTirage} activeOpacity={0.85}>
                  <Feather name="shuffle" size={rs(16)} color="#fff" />
                  <Text style={st.evalBtnText}>Tirer au sort {NB_TIRAGE} élèves</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* VUE 3 — Élèves tirés au sort                                    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === "tires" && activeEns && (
        <View style={{ flex: 1 }}>
          {enTete(activeEns.teacher_name, `Étape 2/4 — ${tires.length} tiré${tires.length !== 1 ? "s" : ""} · ${aEvaluer.length} à évaluer`)}

          <ScrollView contentContainerStyle={st.listContent} showsVerticalScrollIndicator={false}>
            <View style={st.tirageBanner}>
              <Feather name="shuffle" size={rf(15)} color={C.brand} />
              <Text style={st.tirageBannerTxt}>
                Tirage parmi les {eleves.length} élèves · marquez les absents avant de continuer
              </Text>
            </View>

            {tires.map(e => {
              const present = presences.get(e.id) !== false;
              return (
                <View key={e.id} style={[st.tireCard, !present && st.tireCardAbsent]}>
                  <View style={[st.eleveAvatar, { backgroundColor: present ? C.brandSoft : C.surfaceAlt }]}>
                    <Text style={[st.eleveAvatarText, { color: present ? C.brand : C.textMuted }]}>
                      {initiales(e)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.tireNom, !present && st.tireNomAbsent]} numberOfLines={1}>
                      {eleveName(e)}
                    </Text>
                    <Text style={st.eleveGenre}>
                      {e.classe}{!present ? "  ·  Absent" : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[st.presenceToggle, !present && st.presenceToggleAbsent]}
                    onPress={() => basculerPresence(e.id)}
                    activeOpacity={0.75}
                  >
                    <Feather
                      name={present ? "user-check" : "user-x"}
                      size={rf(14)}
                      color={present ? C.success : C.danger}
                    />
                    <Text style={[st.presenceToggleTxt, { color: present ? C.success : C.danger }]}>
                      {present ? "Présent" : "Absent"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          <View style={st.navRow}>
            <TouchableOpacity style={st.navBtn} onPress={lancerTirage} activeOpacity={0.8}>
              <Feather name="refresh-cw" size={rs(15)} color={C.brand} />
              <Text style={st.navBtnText}>Retirer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.mainNavBtn} onPress={ouvrirDossier} activeOpacity={0.85}>
              <Text style={st.mainNavBtnText}>Continuer</Text>
              <Feather name="arrow-right" size={rs(16)} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* VUE 4 — Contenu du dossier d'évaluation                         */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === "dossier" && activeDoc && (
        <View style={{ flex: 1 }}>
          {enTete(activeDoc.titre, `Étape 3/4 — Dossier ${activeDoc.langue}`)}

          <ScrollView style={st.evalScroll} contentContainerStyle={{ paddingBottom: rs(16) }} showsVerticalScrollIndicator={false}>
            <View style={st.contentCard}>
              <Text style={st.contentLabel}>Lettres</Text>
              <View style={st.tokensRow}>
                {activeDoc.lettres.map((l, i) => (
                  <View key={`l${i}`} style={st.token}><Text style={st.tokenText}>{l}</Text></View>
                ))}
              </View>

              <Text style={[st.contentLabel, { marginTop: rs(16) }]}>Syllabes</Text>
              <View style={st.tokensRow}>
                {activeDoc.syllabes.map((s, i) => (
                  <View key={`s${i}`} style={st.token}><Text style={st.tokenText}>{s}</Text></View>
                ))}
              </View>

              <Text style={[st.contentLabel, { marginTop: rs(16) }]}>Mots</Text>
              <View style={st.tokensRow}>
                {activeDoc.mots.map((m, i) => (
                  <View key={`m${i}`} style={[st.token, st.tokenMot]}><Text style={st.tokenText}>{m}</Text></View>
                ))}
              </View>

              <Text style={[st.contentLabel, { marginTop: rs(16) }]}>Opérations</Text>
              <View style={st.opsGrid}>
                {activeDoc.operations.map((o, i) => (
                  <View key={`o${i}`} style={st.opItem}><Text style={st.opText}>{o}</Text></View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={st.evalBtnBar}>
            <TouchableOpacity style={st.evalBtn} onPress={() => setView("evaluer")} activeOpacity={0.85}>
              <Feather name="edit-3" size={rs(16)} color="#fff" />
              <Text style={st.evalBtnText}>Commencer l&apos;évaluation</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* VUE 5 — Évaluation : tous les élèves tirés sur une seule page    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === "evaluer" && activeDoc && (
        <View style={{ flex: 1 }}>
          {submitDone ? (
            <View style={[st.center, { gap: rs(16), flex: 1 }]}>
              <Feather name="check-circle" size={rs(56)} color={C.success} />
              <Text style={st.doneTitle}>Évaluation enregistrée</Text>
              <Text style={st.doneSub}>
                {aEvaluer.length} élève{aEvaluer.length !== 1 ? "s" : ""} évalué{aEvaluer.length !== 1 ? "s" : ""}.{"\n"}
                L&apos;enseignant verra les résultats dans son app.
              </Text>
              <TouchableOpacity style={st.doneBtn} onPress={terminer} activeOpacity={0.85}>
                <Text style={st.doneBtnText}>Terminer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {enTete("Évaluation", `Étape 4/4 — ${nbNotes}/${aEvaluer.length} élève${aEvaluer.length !== 1 ? "s" : ""} noté${nbNotes !== 1 ? "s" : ""}`)}

              <View style={st.progBarOuter}>
                <View style={[st.progBarFill, { width: `${(nbNotes / Math.max(aEvaluer.length, 1)) * 100}%` as any }]} />
              </View>

              {/* Un bloc par élève : son nom, puis ses trois options juste en dessous */}
              <ScrollView style={st.evalScroll} contentContainerStyle={{ paddingBottom: rs(16) }} showsVerticalScrollIndicator={false}>
                {aEvaluer.map((e, i) => {
                  const choisi = results.get(e.id);
                  return (
                    <View key={e.id} style={st.eleveEvalCard}>
                      <View style={st.eleveEvalTop}>
                        <View style={[st.eleveAvatar, { backgroundColor: choisi ? C.successSoft : C.brandSoft }]}>
                          <Text style={[st.eleveAvatarText, { color: choisi ? C.success : C.brand }]}>
                            {initiales(e)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.eleveName} numberOfLines={1}>{eleveName(e)}</Text>
                          <Text style={st.eleveGenre}>{e.classe}</Text>
                        </View>
                        <Text style={st.eleveRang}>{i + 1}/{aEvaluer.length}</Text>
                      </View>

                      <View style={st.resultRow}>
                        {RESULTATS.map(r => {
                          const sel = choisi === r.key;
                          return (
                            <TouchableOpacity
                              key={r.key}
                              style={[st.resultBtn, { backgroundColor: sel ? r.color : r.soft }]}
                              onPress={() => setResults(prev => new Map(prev).set(e.id, r.key))}
                              activeOpacity={0.8}
                            >
                              <Feather name={r.icon} size={rs(18)} color={sel ? "#fff" : r.color} />
                              <Text style={[st.resultBtnTxt, { color: sel ? "#fff" : r.color }]}>{r.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={st.evalBtnBar}>
                <TouchableOpacity
                  style={[st.evalBtn, (nbNotes < aEvaluer.length || submitting) && st.evalBtnOff]}
                  onPress={envoyer}
                  disabled={nbNotes < aEvaluer.length || submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Feather name="send" size={rs(16)} color={nbNotes < aEvaluer.length ? C.textMuted : "#fff"} />
                      <Text style={[st.evalBtnText, nbNotes < aEvaluer.length && { color: C.textMuted }]}>
                        Envoyer les {aEvaluer.length} évaluations
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText: { fontSize: rf(15), color: C.textMuted },

  viewHeader: { paddingHorizontal: rs(16), paddingTop: rs(12), paddingBottom: rs(8) },
  viewTitle:  { fontSize: rf(22), fontWeight: "800", color: C.text },
  viewSub:    { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },

  listContent: { paddingHorizontal: rs(14), paddingTop: rs(8), paddingBottom: rs(16), gap: rs(10) },

  // Sujets
  /* Sélecteur de sujet — visible uniquement si plusieurs sujets actifs */

  /* Élèves tirés au sort */
  eleveRang:       { fontSize: rf(12), fontWeight: "700", color: C.textMuted, minWidth: rs(22), textAlign: "right" },
  tirageBanner:    {
    flexDirection: "row", alignItems: "center", gap: rs(8),
    backgroundColor: C.brandSoft, borderRadius: rs(12),
    paddingHorizontal: rs(12), paddingVertical: rs(10), marginBottom: rs(12),
  },
  tirageBannerTxt: { fontSize: rf(13), fontWeight: "600", color: C.brand, flex: 1 },
  tireCard: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    backgroundColor: C.surface, borderRadius: rs(14),
    borderWidth: 1.5, borderColor: C.brand + "40",
    padding: rs(14), marginBottom: rs(10),
  },
  tireNom:         { fontSize: rf(17), fontWeight: "800", color: C.text },
  tireCardAbsent:  { borderColor: C.border, backgroundColor: C.surfaceAlt, opacity: 0.85 },
  tireNomAbsent:   { color: C.textMuted, textDecorationLine: "line-through" },
  presenceToggle:  {
    flexDirection: "row", alignItems: "center", gap: rs(5),
    paddingHorizontal: rs(10), paddingVertical: rs(7),
    borderRadius: rs(10), borderWidth: 1.5, borderColor: C.success + "55",
    backgroundColor: C.successSoft,
  },
  presenceToggleAbsent: { borderColor: C.danger + "55", backgroundColor: C.dangerSoft },
  presenceToggleTxt:    { fontSize: rf(12), fontWeight: "700" },

  /* Évaluation — un bloc par élève */
  eleveEvalCard: {
    backgroundColor: C.surface, borderRadius: rs(14),
    borderWidth: 1, borderColor: C.border,
    padding: rs(14), marginBottom: rs(12),
  },
  eleveEvalTop:  { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(12) },
  evalBtnOff:    { backgroundColor: C.surfaceAlt },

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
  subHeaderTitle: { fontSize: rf(16), fontWeight: "800", color: C.text },
  subHeaderSub:   { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },

  // Présence
  presCard: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(14), padding: rs(12),
  },

  eleveAvatar:     { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  eleveAvatarText: { fontSize: rf(12), fontWeight: "700", color: C.textMuted },
  eleveName:       { fontSize: rf(15), fontWeight: "600", color: C.text },
  eleveGenre:      { fontSize: rf(12), color: C.textMuted },

  // Bouton bas
  evalBtnBar: {
    backgroundColor: C.bg, paddingHorizontal: rs(16),
    paddingTop: rs(10), paddingBottom: rs(10),
    borderTopWidth: 1, borderTopColor: C.border,
  },
  evalBtn:             { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), backgroundColor: C.primary, borderRadius: rs(14), paddingVertical: rs(15) },
  evalBtnText:         { fontSize: rf(16), fontWeight: "800", color: "#fff" },

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

  resultRow:   { flexDirection: "row", gap: rs(8) },
  resultBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: rs(6),
    borderRadius: rs(14), borderWidth: 1.5, paddingVertical: rs(14),
  },
  resultBtnTxt: { fontSize: rf(12), fontWeight: "800", textAlign: "center" },

  // Autres élèves

  // Navigation évaluation
  navRow:        { flexDirection: "row", gap: rs(10) },
  navBtn:        { flexDirection: "row", alignItems: "center", gap: rs(4), paddingVertical: rs(14), paddingHorizontal: rs(16), backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14) },
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
