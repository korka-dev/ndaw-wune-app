import React, { useState, useEffect, useCallback } from "react";
import { trackUsage } from "../services/usage";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { teacherEvalApi, syncApi, propositionsGroupeApi } from "../services/api";
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
import { useRafraichissementAuto } from "../hooks/useRafraichissementAuto";

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

interface Proposition {
  id: string; eleve_id: string; domaine: string; ancien_groupe: string | null;
  nouveau_groupe: string; motif: string; statut: string; motif_refus?: string | null; created_at: string;
}
const STATUT_PROP: Record<string, string> = { proposee: "En attente de décision", validee: "Validée", refusee: "Refusée" };

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

  // ── RET07 : vue par élève (groupes, historique, proposition de groupe) ──
  const syncData = useStore(st => st.syncData);
  const propositionActive = syncData?.parametres_terrain?.proposition_groupe_active !== false;
  const [vue, setVue] = useState<"competence" | "eleve">("competence");
  const [eleveChoisi, setEleveChoisi] = useState<string | null>(null);
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [propDomaine, setPropDomaine] = useState<"lecture" | "maths">("lecture");
  const [propGroupe, setPropGroupe] = useState("");
  const [propMotif, setPropMotif] = useState("");
  const [propEnvoi, setPropEnvoi] = useState(false);

  const chargerPropositions = useCallback(async () => {
    try { setPropositions(((await propositionsGroupeApi.mes()).data ?? []) as Proposition[]); } catch {}
  }, []);
  useEffect(() => { if (isOnline) chargerPropositions(); }, [isOnline, chargerPropositions]);

  const elevesSync = syncData?.eleves ?? [];
  const elevesParId = new Map<string, { id: string; nom: string; prenom: string | null; classe: string;
    groupe_lecture?: string | null; groupe_maths?: string | null }>();
  for (const e of elevesSync) elevesParId.set(e.id, e);
  for (const ev of evals) if (!elevesParId.has(ev.eleve_id)) {
    elevesParId.set(ev.eleve_id, { id: ev.eleve_id, nom: ev.nom, prenom: ev.prenom, classe: ev.classe });
  }
  const listeEleves = [...elevesParId.values()].sort((a, b) =>
    a.classe.localeCompare(b.classe) || a.nom.localeCompare(b.nom));
  const eleveSel = eleveChoisi ? elevesParId.get(eleveChoisi) ?? null : null;
  const histoireSel = eleveChoisi
    ? evals.filter(e => e.eleve_id === eleveChoisi).sort((a, b) => b.date_eval.localeCompare(a.date_eval))
    : [];
  const propsSel = eleveChoisi ? propositions.filter(p => p.eleve_id === eleveChoisi) : [];

  const ouvrirEleve = (id: string) => {
    setEleveChoisi(id); setPropDomaine("lecture"); setPropGroupe(""); setPropMotif("");
  };

  const envoyerProposition = async () => {
    if (!eleveSel || propEnvoi) return;
    if (!isOnline) {
      Alert.alert("Hors connexion", "La proposition doit être envoyée avec du réseau, pour que l'équipe programme la reçoive.");
      return;
    }
    setPropEnvoi(true);
    try {
      await propositionsGroupeApi.proposer({
        eleve_id: eleveSel.id, domaine: propDomaine,
        nouveau_groupe: propGroupe.trim(), motif: propMotif.trim(),
      });
      setPropGroupe(""); setPropMotif("");
      await chargerPropositions();
      Alert.alert("Proposition envoyée",
        "L'équipe programme va l'examiner. Le groupe actuel reste en place tant qu'elle n'est pas validée.");
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      Alert.alert("Envoi impossible", typeof d === "string" ? d : "Le serveur n'a pas pu être joint. Réessayez plus tard.");
    } finally { setPropEnvoi(false); }
  };

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
  // Retour sur l'écran ou dans l'app : changements du tableau de bord récupérés (lot L13).
  useRafraichissementAuto(() => fetchEvaluations());

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

        <View style={styles.toggleRow}>
          {([["competence", "Par compétence"], ["eleve", "Par élève"]] as const).map(([k, lbl]) => (
            <TouchableOpacity key={k} style={[styles.toggleBtn, vue === k && styles.toggleBtnOn]} onPress={() => setVue(k)}>
              <Text style={[styles.toggleTxt, vue === k && styles.toggleTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {vue === "eleve" && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { await onRefresh(); await chargerPropositions(); }} tintColor={C.brand} />}
            contentContainerStyle={styles.listContent}
          >
            {listeEleves.length === 0 && (
              <Text style={styles.emptyText}>Aucun élève sur ce téléphone. Synchronisez pour récupérer votre liste.</Text>
            )}
            {listeEleves.map(e => {
              const n = evals.filter(ev => ev.eleve_id === e.id).length;
              const enAttente = propositions.some(p => p.eleve_id === e.id && p.statut === "proposee");
              return (
                <TouchableOpacity key={e.id} style={styles.compCard} onPress={() => ouvrirEleve(e.id)} activeOpacity={0.75}>
                  <View style={{ flex: 1, gap: rs(3) }}>
                    <Text style={styles.compLabel}>{e.nom}{e.prenom ? ` ${e.prenom}` : ""}</Text>
                    <Text style={styles.compDate}>
                      Classe {e.classe} · Lecture : {e.groupe_lecture ?? "—"} · Maths : {e.groupe_maths ?? "—"}
                    </Text>
                    <Text style={styles.compTotal}>
                      {n} observation{n > 1 ? "s" : ""}{enAttente ? " · proposition en attente" : ""}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={rs(20)} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
            <View style={{ height: rs(24) }} />
          </ScrollView>
        )}

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
        {vue === "competence" && !error && evals.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="clipboard" size={rs(48)} color={C.textMuted} />
            <Text style={styles.emptyTitle}>Aucune évaluation reçue</Text>
            <Text style={styles.emptyText}>
              Votre superviseur n'a pas encore enregistré d'évaluations pour votre classe.
            </Text>
          </View>
        )}

        {/* Liste par compétence */}
        {vue === "competence" && groups.length > 0 && (
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

      {/* ── Modal élève : groupes, historique, proposition (RET07) ── */}
      <Modal visible={!!eleveSel} animationType="slide" transparent onRequestClose={() => setEleveChoisi(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setEleveChoisi(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{eleveSel?.nom}{eleveSel?.prenom ? ` ${eleveSel.prenom}` : ""}</Text>
                <Text style={styles.sheetSub}>
                  Classe {eleveSel?.classe} · Lecture : {eleveSel?.groupe_lecture ?? "—"} · Maths : {eleveSel?.groupe_maths ?? "—"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEleveChoisi(null)} style={styles.closeBtn}>
                <Feather name="x" size={rs(20)} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: rs(460) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLbl}>Historique des observations</Text>
              {histoireSel.length === 0 && <Text style={styles.compDate}>Aucune observation pour cet élève.</Text>}
              {histoireSel.map((ev, i) => {
                const res = RESULTATS[ev.resultat as Resultat] ?? RESULTATS.en_cours;
                return (
                  <View key={`${ev.competence}-${ev.date_eval}-${i}`} style={[styles.eleveRow, styles.eleveBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eleveName}>{getCompetenceLabel(ev.competence, competencesList)}</Text>
                      <Text style={styles.eleveClasse}>{formatDate(ev.date_eval)}{ev.superviseur_nom ? ` · ${ev.superviseur_nom}` : ""}</Text>
                      {ev.commentaire ? <Text style={styles.eleveComment}>{ev.commentaire}</Text> : null}
                    </View>
                    <View style={[styles.resultBadge, { backgroundColor: res.bg }]}>
                      <Text style={[styles.resultBadgeText, { color: res.color }]}>{res.icon}</Text>
                    </View>
                  </View>
                );
              })}

              {propsSel.length > 0 && <Text style={[styles.sectionLbl, { marginTop: rs(14) }]}>Mes propositions</Text>}
              {propsSel.map(p => (
                <View key={p.id} style={[styles.eleveRow, styles.eleveBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eleveName}>
                      {p.domaine === "lecture" ? "Lecture" : "Maths"} : {p.ancien_groupe ?? "aucun"} → {p.nouveau_groupe}
                    </Text>
                    <Text style={styles.eleveClasse}>{STATUT_PROP[p.statut] ?? p.statut} · {formatDate(p.created_at)}</Text>
                    {p.motif_refus ? <Text style={styles.eleveComment}>Motif du refus : {p.motif_refus}</Text> : null}
                  </View>
                </View>
              ))}

              {propositionActive && (
                <View style={{ marginTop: rs(14), gap: rs(8) }}>
                  <Text style={styles.sectionLbl}>Proposer un changement de groupe</Text>
                  <Text style={styles.compDate}>
                    Le groupe actuel reste en place jusqu'à la décision de l'équipe programme. L'historique est conservé.
                  </Text>
                  <View style={styles.toggleRow}>
                    {(["lecture", "maths"] as const).map(d => (
                      <TouchableOpacity key={d} style={[styles.toggleBtn, propDomaine === d && styles.toggleBtnOn]} onPress={() => setPropDomaine(d)}>
                        <Text style={[styles.toggleTxt, propDomaine === d && styles.toggleTxtOn]}>
                          {d === "lecture" ? "Lecture" : "Maths"} ({(d === "lecture" ? eleveSel?.groupe_lecture : eleveSel?.groupe_maths) ?? "aucun"})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={styles.input} placeholder="Nouveau groupe (ex. G2)" placeholderTextColor={C.textMuted}
                    value={propGroupe} onChangeText={setPropGroupe} maxLength={30} />
                  <TextInput style={[styles.input, { minHeight: rs(70), textAlignVertical: "top" }]} multiline
                    placeholder="Pourquoi ? (ce que l'élève sait faire maintenant)" placeholderTextColor={C.textMuted}
                    value={propMotif} onChangeText={setPropMotif} maxLength={1000} />
                  <TouchableOpacity
                    style={[styles.submitBtn, (propGroupe.trim().length < 1 || propMotif.trim().length < 3 || propEnvoi) && { opacity: 0.5 }]}
                    disabled={propGroupe.trim().length < 1 || propMotif.trim().length < 3 || propEnvoi}
                    onPress={envoyerProposition}
                  >
                    {propEnvoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Envoyer la proposition</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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

  toggleRow:    { flexDirection: "row", gap: rs(8), marginBottom: rs(12) },
  toggleBtn:    { flex: 1, paddingVertical: rs(9), borderRadius: rs(10), borderWidth: 1, borderColor: C.border, alignItems: "center", backgroundColor: C.surface },
  toggleBtnOn:  { backgroundColor: C.primarySoft, borderColor: C.primary },
  toggleTxt:    { fontSize: rf(13), fontWeight: "600", color: C.textMuted },
  toggleTxtOn:  { color: C.primary },
  sectionLbl:   { fontSize: rf(13), fontWeight: "800", color: C.text, marginBottom: rs(4) },
  input:        { borderWidth: 1, borderColor: C.border, borderRadius: rs(10), paddingHorizontal: rs(12), paddingVertical: rs(10), fontSize: rf(14), color: C.text, backgroundColor: C.bg },
  submitBtn:    { backgroundColor: C.primary, borderRadius: rs(12), paddingVertical: rs(13), alignItems: "center" },
  submitTxt:    { color: "#fff", fontSize: rf(15), fontWeight: "700" },
});
