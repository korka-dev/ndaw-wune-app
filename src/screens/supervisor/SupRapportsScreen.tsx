import React, { useState, useCallback, useEffect } from "react";
import { trackUsage } from "../../services/usage";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { useStore } from "../../store/useStore";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { rapportJournalierApi, superviseurApi } from "../../services/api";
import {
  getCachedSupRapportQuestions,
  setCachedSupRapportQuestions,
  SupRapportQuestionItem,
  getCachedSupRapportLibelles,
  setCachedSupRapportLibelles,
} from "../../services/cache";
import {
  getRapportsJournalier,
  insertRapportJournalier,
  markRapportJournalierSynced,
  enqueueAction,
  RapportJournalierLocal,
} from "../../services/db";
import AppHeader from "../../components/AppHeader";
import BackButton from "../../components/BackButton";
import ProfileSheet from "../../components/ProfileSheet";
import TourTarget from "../../components/TourTarget";

const BILANS = ["Bien", "Moyen", "Difficile"] as const;
type Bilan = typeof BILANS[number];

const TOTAL_STEPS = 2;

export default function SupRapportsScreen() {
  useEffect(() => { trackUsage("rapports").catch(() => {}); }, []);
  const insets = useSafeAreaInsets();
  const { user, isOnline, syncOffline } = useStore();
  const [history,    setHistory]    = useState<RapportJournalierLocal[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [view, setView] = useState<"menu" | "rapport">("menu");

  const loadAndSync = useCallback(async () => {
    try {
      const all = getRapportsJournalier();
      setHistory(all);
      const hasPending = all.some(r => r.synced === 0);
      if (isOnline && hasPending) {
        await syncOffline(true);
        setHistory(getRapportsJournalier());
      }
    } catch (e) {
      console.warn("[SupRapports] Erreur lecture SQLite :", e);
    }
  }, [isOnline, syncOffline]);

  useFocusEffect(useCallback(() => { loadAndSync(); }, [loadAndSync]));

  // Sync manuelle depuis le bouton du header : sync superviseur globale
  // (profil, école, questions, libellés) + rapports locaux
  const [syncing, setSyncing] = useState(false);
  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      await syncOffline(true).catch(() => {});
      // Répercuter les questions/libellés fraîchement synchronisés sur le formulaire
      const sd: any = useStore.getState().syncData;
      if (sd?.rapport_questions) {
        setSupQuestions(sd.rapport_questions);
        setCachedSupRapportQuestions(sd.rapport_questions).catch(() => {});
      }
      if (sd?.rapport_libelles) {
        setLibelles(sd.rapport_libelles);
        setCachedSupRapportLibelles(sd.rapport_libelles).catch(() => {});
      }
      await loadAndSync();
    } finally { setSyncing(false); }
  };

  // Questions complémentaires configurées par l'admin (dynamiques, cible = superviseur)
  const [supQuestions, setSupQuestions] = useState<SupRapportQuestionItem[]>([]);
  const [reponses,     setReponses]     = useState<Record<string, string>>({});

  // Libellés des champs fixes de ce rapport, configurés par l'admin (repli = texte par défaut)
  const [libelles, setLibelles] = useState<Record<string, string>>({});
  const L = (cle: string, fallback: string) => libelles[cle] || fallback;

  useEffect(() => {
    getCachedSupRapportQuestions().then(cached => { if (cached) setSupQuestions(cached); }).catch(() => {});
    getCachedSupRapportLibelles().then(cached => { if (cached) setLibelles(cached); }).catch(() => {});
    if (!isOnline) return;
    superviseurApi.sync()
      .then(({ data }) => {
        const items: SupRapportQuestionItem[] = data.rapport_questions ?? [];
        setSupQuestions(items);
        setCachedSupRapportQuestions(items).catch(() => {});
        const libs: Record<string, string> = data.rapport_libelles ?? {};
        setLibelles(libs);
        setCachedSupRapportLibelles(libs).catch(() => {});
      })
      .catch(() => {});
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    const all = getRapportsJournalier();
    if (!all.some(r => r.synced === 0)) return;
    syncOffline(true)
      .then(() => { try { setHistory(getRapportsJournalier()); } catch {} })
      .catch(() => {});
  }, [isOnline]);

  /* 0 = liste principale · 1 = page 1 du formulaire · 2 = page 2 du formulaire */
  const [formStep,   setFormStep]   = useState<0 | 1 | 2>(0);
  const [detail,     setDetail]     = useState<RapportJournalierLocal | null>(null);
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [classesTerminees, setClassesTerminees] = useState(4);
  const [incidents,        setIncidents]        = useState<boolean | null>(null);
  const [incidentDetail,   setIncidentDetail]   = useState("");
  const [bilan,            setBilan]            = useState<Bilan | null>(null);
  const [commentaire,      setCommentaire]      = useState("");

  const okCount = history.filter(r => r.synced === 1).length;
  const pendingCount = history.filter(r => r.synced === 0).length;
  const bilanColor: Record<Bilan, string> = { Bien:C.success, Moyen:C.warn, Difficile:C.danger };

  /* Date du jour, affichée en en-tête des pages du formulaire (remplace l'ancienne date factice) */
  const todayLabel = (() => {
    const d = new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
    return d.charAt(0).toUpperCase() + d.slice(1);
  })();

  const resetForm = () => {
    setFormStep(0);
    setView("menu");
    setClassesTerminees(4); setIncidents(null); setIncidentDetail(""); setBilan(null); setCommentaire("");
    setReponses({});
  };

  const startForm = () => setFormStep(1);

  /* Si un incident est signalé, sa description devient obligatoire avant de continuer */
  const canGoNext = incidents !== null && (!incidents || incidentDetail.trim().length > 0);

  const goNext = () => {
    if (!canGoNext) return;
    setFormStep(2);
  };

  const goPrev = () => setFormStep(1);

  const missingRequiredQuestion = supQuestions.find(q => q.required && !reponses[q.id]?.trim());

  const handleSend = async () => {
    if (bilan === null) return;
    if (missingRequiredQuestion) {
      Alert.alert("Champ manquant", `Veuillez répondre : « ${missingRequiredQuestion.label} »`);
      return;
    }
    setSending(true);
    try {
      const now = new Date();
      const localId = `rj_sup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const dateIso = format(now, "yyyy-MM-dd");
      const offline = !isOnline;

      const resume = [
        `Classes ayant terminé leur planning : ${classesTerminees}`,
        `Incidents signalés : ${incidents ? `Oui — ${incidentDetail.trim()}` : "Non"}`,
        `Bilan global : ${bilan}`,
      ].join("\n");

      const commentFinal = commentaire.trim() ? `${resume}\n\n${commentaire.trim()}` : resume;
      const diffsJson = JSON.stringify(incidents ? [incidentDetail.trim() || "Incident signalé"] : []);
      const reponsesJson = Object.keys(reponses).length > 0 ? JSON.stringify(reponses) : null;

      insertRapportJournalier({
        id: localId, date_rapport: dateIso,
        ief: "—", commune: "—", ecole: "Tournée de supervision",
        superviseur: user?.name ?? "", nom_tuteur: user?.name ?? "",
        nb_absences: 0, absents: null,
        semaine: 1, jour_cours: 1,
        difficultes: diffsJson,
        autres_difficultes: null,
        description_difficultes: incidents ? incidentDetail.trim() : null,
        directeur_venu: 0, besoin_appui: 0, domaines_appui: null,
        has_observations: 1,
        commentaires: commentFinal,
        soumis_en_offline: offline ? 1 : 0,
        photo_classe: null,
        photos_classe: null,
        reponses_questions: reponsesJson,
      });

      const apiBody = {
        local_id: localId, date_rapport: dateIso,
        ief: "—", commune: "—", ecole: "Tournée de supervision",
        superviseur: user?.name ?? "", nom_tuteur: user?.name ?? "",
        nb_absences: 0, absents: null,
        semaine: 1, jour_cours: 1,
        difficultes: diffsJson,
        autres_difficultes: null,
        description_difficultes: incidents ? incidentDetail.trim() : null,
        directeur_venu: false, besoin_appui: false, domaines_appui: null,
        has_observations: true,
        commentaires: commentFinal,
        soumis_en_offline: offline,
        photo_classe_url: null,
        reponses_questions: reponsesJson,
      };

      if (isOnline) {
        try { await rapportJournalierApi.submit(apiBody); markRapportJournalierSynced(localId); }
        catch { enqueueAction("SUBMIT_RAPPORT_JOURNALIER", apiBody); }
      } else {
        enqueueAction("SUBMIT_RAPPORT_JOURNALIER", apiBody);
      }

      setHistory(getRapportsJournalier());
      resetForm();
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      console.warn("[SupRapports] Erreur envoi :", e);
      Alert.alert("Erreur", "Impossible d'enregistrer le rapport.");
    } finally {
      setSending(false);
    }
  };

  /* ── En-tête commun aux pages du formulaire ── */
  const FormTopBar = ({ step, onBack }: { step: 1 | 2; onBack: () => void }) => (
    <>
      <View style={styles.topBar}>
        <BackButton
          onPress={onBack}
          label={step === 1 ? "Retour" : "Étape précédente"}
          style={{ marginRight: rs(10) }}
        />
        <Text style={styles.topTitle}>Rapport du jour</Text>
      </View>
      <View style={styles.progressWrap}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` as any }]} />
        </View>
        <Text style={styles.progressTxt}>{step} / {TOTAL_STEPS}</Text>
      </View>
    </>
  );

  /* ── Menu de sélection du type de rapport ── */
  if (view === "menu") {
    return (
      <View style={styles.root}>
        <AppHeader
          userName={user?.name ?? ""}
          onAvatarPress={() => setProfileOpen(true)}
          onSyncPress={handleManualSync}
          syncing={syncing}
          isOnline={isOnline}
          sectionLabel="Espace Superviseur"
        />

        <ScrollView contentContainerStyle={styles.menuPage} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Rapports</Text>
            <Text style={styles.pageSubtitle}>Sélectionnez le type de rapport</Text>
          </View>

          {/* ── Rapport journalier ── */}
          <TouchableOpacity
            style={styles.menuCard}
            onPress={() => setView("rapport")}
            activeOpacity={0.85}
          >
            <View style={[styles.menuCardIcon, { backgroundColor: styles.sendBtnIcon.backgroundColor }]}>
              <Feather name="send" size={rf(22)} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuCardTitle}>Rapport</Text>
              <Text style={styles.menuCardSub}>Rapport de votre tournée quotidienne</Text>
            </View>
            <Feather name="chevron-right" size={rf(20)} color={C.brand} />
          </TouchableOpacity>

          {/* ── Rapport pédagogiques — non disponible ── */}
          <View style={[styles.menuCard, styles.menuCardDisabled]}>
            <View style={[styles.menuCardIcon, { backgroundColor: C.surfaceAlt }]}>
              <Feather name="book-open" size={rf(22)} color={C.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuCardTitle, { color: C.textMuted }]}>Rapports pédagogiques</Text>
              <Text style={styles.menuCardSub}>Suivi pédagogique des enseignants</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonTxt}>Bientôt</Text>
            </View>
          </View>
        </ScrollView>

        <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
      </View>
    );
  }

  /* ── Page 1 : Professeurs présents → Incidents signalés ── */
  if (formStep === 1) {
    return (
      <KeyboardAvoidingView
        style={[styles.formRoot, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FormTopBar step={1} onBack={resetForm} />
        <ScrollView style={styles.formBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formScrollContent}>
          <Text style={styles.stepIntro}>{todayLabel} · {user?.name ?? "Superviseur"}</Text>
          <Text style={styles.stepHeading}>Votre tournée du jour</Text>
          <Text style={styles.stepSub}>Renseignez ces quelques informations pour commencer votre rapport.</Text>

          <View style={styles.fieldCard}>
            <View style={styles.fieldCardHeader}>
              <View style={[styles.fieldIconWrap, { backgroundColor: C.successSoft }]}>
                <Feather name="check-square" size={rf(17)} color={C.success} />
              </View>
              <Text style={styles.fieldLabel}>{L("superviseur.classes_terminees_label", "Classes ayant terminé leur planning")}</Text>
            </View>
            <View style={styles.counterRow}>
              <TouchableOpacity onPress={() => setClassesTerminees(p => Math.max(0,p-1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>−</Text></TouchableOpacity>
              <Text style={styles.counterValue}>{classesTerminees}</Text>
              <TouchableOpacity onPress={() => setClassesTerminees(p => Math.min(20,p+1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>+</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldCard}>
            <View style={styles.fieldCardHeader}>
              <View style={[styles.fieldIconWrap, { backgroundColor: C.dangerSoft }]}>
                <Feather name="alert-triangle" size={rf(17)} color={C.danger} />
              </View>
              <Text style={styles.fieldLabel}>{L("superviseur.incidents_question", "Incidents signalés ?")}</Text>
            </View>
            <View style={styles.optionRow}>
              {([{v:false,l:"Non ✓",c:C.success},{v:true,l:"Oui ⚠",c:C.danger}] as {v:boolean;l:string;c:string}[]).map(opt => {
                const sel = incidents === opt.v;
                return <TouchableOpacity key={String(opt.v)} onPress={() => setIncidents(opt.v)} style={[styles.toggle, sel && { borderColor:opt.c, backgroundColor:opt.c+"22" }]}>
                  <Text style={[styles.toggleText, sel && { color:opt.c }]}>{opt.l}</Text>
                </TouchableOpacity>;
              })}
            </View>

            {/* Zone de description — visible uniquement si un incident est signalé */}
            {incidents === true && (
              <View style={styles.incidentBox}>
                <Text style={styles.incidentLabel}>Décrivez l'incident <Text style={styles.fieldLabelOptional}>(obligatoire)</Text></Text>
                <TextInput
                  value={incidentDetail} onChangeText={setIncidentDetail}
                  multiline numberOfLines={3}
                  placeholder="Que s'est-il passé ? Où, quand, qui est concerné…"
                  placeholderTextColor={C.textMuted}
                  style={styles.incidentInput}
                />
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.nextBtn, !canGoNext && styles.nextBtnDisabled]} onPress={goNext} disabled={!canGoNext} activeOpacity={0.85}>
            <Text style={styles.nextBtnTxt}>Suivant</Text>
            <Feather name="arrow-right" size={rf(16)} color="#fff" style={{ marginLeft: rs(6) }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ── Page 2 : Bilan global → fin ── */
  if (formStep === 2) {
    const canSend = bilan !== null && !missingRequiredQuestion;
    return (
      <KeyboardAvoidingView
        style={[styles.formRoot, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FormTopBar step={2} onBack={goPrev} />
        <ScrollView style={styles.formBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formScrollContent}>
          <Text style={styles.stepIntro}>{todayLabel} · {user?.name ?? "Superviseur"}</Text>
          <Text style={styles.stepHeading}>Bilan de la journée</Text>
          <Text style={styles.stepSub}>Donnez votre appréciation globale et ajoutez vos observations.</Text>

          <View style={styles.fieldCard}>
            <View style={styles.fieldCardHeader}>
              <View style={[styles.fieldIconWrap, { backgroundColor: C.brandSoft }]}>
                <Feather name="bar-chart-2" size={rf(17)} color={C.brand} />
              </View>
              <Text style={styles.fieldLabel}>{L("superviseur.bilan_label", "Bilan global")}</Text>
            </View>
            <View style={styles.optionRow}>
              {BILANS.map(b => {
                const sel = bilan === b;
                const col = bilanColor[b];
                return <TouchableOpacity key={b} onPress={() => setBilan(b)} style={[styles.bilanBtn, sel && { borderColor:col, backgroundColor:col+"22" }]}>
                  <Text style={[styles.bilanText, sel && { color:col }]}>{b}</Text>
                </TouchableOpacity>;
              })}
            </View>
          </View>

          <View style={styles.fieldCard}>
            <View style={styles.fieldCardHeader}>
              <View style={[styles.fieldIconWrap, { backgroundColor: C.surfaceAlt }]}>
                <Feather name="message-square" size={rf(17)} color={C.textMuted} />
              </View>
              <Text style={styles.fieldLabel}>{L("superviseur.commentaire_label", "Commentaire")} <Text style={styles.fieldLabelOptional}>(optionnel)</Text></Text>
            </View>
            <TextInput value={commentaire} onChangeText={setCommentaire} multiline numberOfLines={4} placeholder="Observations, points positifs, difficultés rencontrées…" placeholderTextColor={C.textMuted}
              style={styles.textarea} />
          </View>

          {/* Questions complémentaires configurées par l'admin (dynamiques) */}
          {supQuestions.map(q => (
            <View key={q.id} style={styles.fieldCard}>
              <View style={styles.fieldCardHeader}>
                <View style={[styles.fieldIconWrap, { backgroundColor: C.surfaceAlt }]}>
                  <Feather name="help-circle" size={rf(17)} color={C.textMuted} />
                </View>
                <Text style={styles.fieldLabel}>{q.label}{q.required ? " *" : ""}</Text>
              </View>

              {(q.type === "texte_court" || q.type === "nombre") && (
                <TextInput
                  value={reponses[q.id] ?? ""}
                  onChangeText={(v) => setReponses(prev => ({ ...prev, [q.id]: v }))}
                  placeholder="Votre réponse…" placeholderTextColor={C.textMuted}
                  keyboardType={q.type === "nombre" ? "numeric" : "default"}
                  style={[styles.textarea, { minHeight: undefined }]}
                />
              )}

              {q.type === "texte_long" && (
                <TextInput
                  value={reponses[q.id] ?? ""}
                  onChangeText={(v) => setReponses(prev => ({ ...prev, [q.id]: v }))}
                  placeholder="Votre réponse…" placeholderTextColor={C.textMuted}
                  multiline numberOfLines={4}
                  style={styles.textarea}
                />
              )}

              {q.type === "oui_non" && (
                <View style={styles.optionRow}>
                  <TouchableOpacity
                    onPress={() => setReponses(prev => ({ ...prev, [q.id]: "oui" }))}
                    style={[styles.bilanBtn, reponses[q.id] === "oui" && { borderColor: C.success, backgroundColor: C.success + "22" }]}
                  >
                    <Text style={[styles.bilanText, reponses[q.id] === "oui" && { color: C.success }]}>Oui</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setReponses(prev => ({ ...prev, [q.id]: "non" }))}
                    style={[styles.bilanBtn, reponses[q.id] === "non" && { borderColor: C.danger, backgroundColor: C.danger + "22" }]}
                  >
                    <Text style={[styles.bilanText, reponses[q.id] === "non" && { color: C.danger }]}>Non</Text>
                  </TouchableOpacity>
                </View>
              )}

              {q.type === "choix_unique" && (
                <View style={{ gap: rs(8) }}>
                  {(q.options ?? []).map(opt => {
                    const sel = reponses[q.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => setReponses(prev => ({ ...prev, [q.id]: opt }))}
                        style={[styles.choiceRow, sel && styles.choiceRowSel]}
                      >
                        <Text style={[styles.choiceTxt, sel && styles.choiceTxtSel]}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {q.type === "choix_multiple" && (
                <View style={{ gap: rs(8) }}>
                  {(q.options ?? []).map(opt => {
                    const selected = (reponses[q.id] ?? "").split("||").filter(Boolean);
                    const checked = selected.includes(opt);
                    return (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => {
                          const next = checked ? selected.filter(o => o !== opt) : [...selected, opt];
                          setReponses(prev => ({ ...prev, [q.id]: next.join("||") }));
                        }}
                        style={[styles.choiceRow, checked && styles.choiceRowSel]}
                      >
                        <Text style={[styles.choiceTxt, checked && styles.choiceTxtSel]}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <View style={styles.navRow}>
          <TouchableOpacity onPress={handleSend} disabled={!canSend || sending}
            style={[styles.nextBtn, styles.submitBtn, (!canSend || sending) && styles.nextBtnDisabled]} activeOpacity={0.85}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <><Feather name="send" size={rf(16)} color="#fff" style={{ marginRight: rs(6) }} /><Text style={styles.nextBtnTxt}>Envoyer</Text></>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ── Page principale : statistiques + historique (même design que la partie enseignant) ── */
  const dernierRapport = history.length > 0 ? history[0].date_rapport : null;

  return (
    <View style={styles.root}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
        sectionLabel="Espace Superviseur"
      />

      <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
        {sent && (
          <View style={styles.sentBanner}>
            <Feather name="check" size={rs(16)} color={C.success} />
            <Text style={styles.sentText}>{isOnline ? "Rapport envoyé avec succès !" : "Rapport enregistré — envoi auto à la reconnexion"}</Text>
          </View>
        )}

        {/* ── Retour au menu ── */}
        <TouchableOpacity
          style={styles.backToMenu}
          onPress={() => setView("menu")}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={rf(14)} color={C.brand} />
          <Text style={styles.backToMenuTxt}>Rapports</Text>
        </TouchableOpacity>

        {/* ── En-tête page ── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Mes rapports</Text>
          {dernierRapport && (
            <Text style={styles.pageSubtitle}>Dernier envoi : {(() => {
              try {
                const d = new Date(dernierRapport + "T00:00:00");
                const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
                return s.charAt(0).toUpperCase() + s.slice(1);
              } catch { return dernierRapport; }
            })()}</Text>
          )}
        </View>

        {/* ── Statistiques globales ── */}
        {history.length > 0 ? (
          <View style={styles.statsSection}>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: C.success + "18" }]}>
                  <Feather name="check-circle" size={rf(18)} color={C.success} />
                </View>
                <Text style={[styles.statValue, { color: C.success }]}>{okCount}</Text>
                <Text style={styles.statLabel}>Envoyés</Text>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: C.warn + "18" }]}>
                  <Feather name="clock" size={rf(18)} color={C.warn} />
                </View>
                <Text style={[styles.statValue, { color: C.warn }]}>{pendingCount}</Text>
                <Text style={styles.statLabel}>En attente</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyStats}>
            <Feather name="bar-chart-2" size={rf(36)} color={C.border} />
            <Text style={styles.emptyStatsTxt}>Aucune statistique pour l'instant</Text>
            <Text style={styles.emptyStatsSub}>Envoyez votre premier rapport pour voir vos données ici.</Text>
          </View>
        )}

        {/* ── Bouton Envoyer un rapport ── */}
        <TourTarget id="sup.rapports.envoi">
        <TouchableOpacity style={styles.sendBtnCard} onPress={startForm} activeOpacity={0.85}>
          <View style={styles.sendBtnInner}>
            <View style={styles.sendBtnIcon}>
              <Feather name="plus" size={rf(20)} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sendBtnTitle}>Envoyer un rapport</Text>
              <Text style={styles.sendBtnSub}>Rapport de votre tournée du jour</Text>
            </View>
            <Feather name="chevron-right" size={rf(20)} color={C.brand} />
          </View>
        </TouchableOpacity>
        </TourTarget>

        {/* ── Historique ── */}
        {history.length > 0 && (
          <TourTarget id="sup.rapports.historique" style={styles.histSection}>
            <View style={styles.histHeader}>
              <Text style={styles.sectionTitle}>Historique</Text>
              <Text style={styles.histCount}>{history.length} rapport{history.length > 1 ? "s" : ""}</Text>
            </View>

            {history.map((r) => {
              const synced = r.synced === 1;
              const dateLabel = (() => {
                try {
                  const d = new Date(r.date_rapport + "T00:00:00");
                  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
                  return s.charAt(0).toUpperCase() + s.slice(1);
                } catch { return r.date_rapport; }
              })();
              return (
                <TouchableOpacity key={r.id} style={styles.card} onPress={() => setDetail(r)} activeOpacity={0.75}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardDate} numberOfLines={1}>{dateLabel}</Text>
                    <View style={[styles.badge, synced ? styles.badgeOk : styles.badgeProgress]}>
                      <Feather name={synced ? "check-circle" : "clock"} size={rf(10)} color={synced ? C.success : C.warn} />
                      <Text style={[styles.badgeTxt, { color: synced ? C.success : C.warn }]}>{synced ? "Envoyé" : "En attente"}</Text>
                    </View>
                  </View>
                  <View style={styles.cardRow}>
                    <Feather name="message-square" size={rf(13)} color={C.brand} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {r.commentaires ? r.commentaires.split("\n")[0] : "Rapport de supervision"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </TourTarget>
        )}
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!detail} animationType="slide" transparent>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setDetail(null)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {detail && (
              <>
                <Text style={styles.sheetTitle}>Rapport · {detail.date_rapport}</Text>
                <Text style={styles.sheetSub}>{detail.synced === 1 ? "Envoyé" : "En attente de synchronisation"}</Text>
                <View style={{ gap:rs(8) }}>
                  {detail.commentaires ? detail.commentaires.split("\n").filter(Boolean).map((line, i) => (
                    <View key={i} style={styles.detailRow}>
                      <Text style={styles.detailVal}>{line}</Text>
                    </View>
                  )) : null}
                  {detail.description_difficultes ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailKey}>Détail incident</Text>
                      <Text style={styles.detailVal}>{detail.description_difficultes}</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => setDetail(null)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>Fermer</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex:1, backgroundColor:C.bg },
  scroll:     { gap:rs(12), paddingHorizontal:rs(14), paddingBottom:rs(24) },
  scrollPage: { padding: rs(16), paddingBottom: rs(48) },
  sentBanner: { flexDirection:"row", alignItems:"center", gap:rs(8), backgroundColor:C.successSoft, borderWidth:1, borderColor:C.success, borderRadius:rs(12), padding:rs(12), marginBottom: rs(16) },
  sentText:   { fontSize:rf(15), fontWeight:"700", color:C.success },

  /* En-tête page (même design que la partie enseignant) */
  pageHeader:   { marginBottom: rs(20) },
  pageTitle:    { fontSize: rf(22), fontWeight: "800", color: C.text, marginBottom: rs(2) },
  pageSubtitle: { fontSize: rf(14), color: C.textMuted, fontWeight: "500", textTransform: "capitalize" },

  sectionTitle: { fontSize: rf(14), fontWeight: "800", color: C.brand, textTransform: "uppercase", letterSpacing: 0.6 },

  /* Statistiques */
  statsSection: { marginBottom: rs(24) },
  statsRow:   { flexDirection:"row", gap:rs(10) },
  statCard:   {
    flex: 1, backgroundColor: C.surface, borderRadius: rs(14),
    borderWidth: 1, borderColor: C.border, padding: rs(14), alignItems: "center",
  },
  statIconWrap: { width: rs(40), height: rs(40), borderRadius: rs(12), alignItems: "center", justifyContent: "center", marginBottom: rs(8) },
  statValue:  { fontSize: rf(24), fontWeight: "800", marginBottom: rs(2) },
  statLabel:  { fontSize: rf(12), color: C.textMuted, fontWeight: "600", textAlign: "center" },

  /* Empty stats */
  emptyStats: {
    alignItems: "center", paddingVertical: rs(28), backgroundColor: C.surface,
    borderRadius: rs(14), borderWidth: 1, borderColor: C.border, marginBottom: rs(24), gap: rs(8),
  },
  emptyStatsTxt: { fontSize: rf(16), fontWeight: "700", color: C.textMuted },
  emptyStatsSub: { fontSize: rf(14), color: C.textMuted, textAlign: "center", paddingHorizontal: rs(24) },

  /* Bouton envoyer */
  sendBtnCard: { backgroundColor: C.surface, borderRadius: rs(16), borderWidth: 2, borderColor: C.brand, marginBottom: rs(28), overflow: "hidden" },
  sendBtnInner:{ flexDirection: "row", alignItems: "center", padding: rs(16), gap: rs(14) },
  sendBtnIcon: { width: rs(46), height: rs(46), borderRadius: rs(13), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  sendBtnTitle:{ fontSize: rf(17), fontWeight: "800", color: C.brand, marginBottom: rs(2) },
  sendBtnSub:  { fontSize: rf(13), color: C.textMuted, fontWeight: "500" },

  /* Historique */
  histSection: {},
  histHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(12) },
  histCount:   { fontSize: rf(13), color: C.textMuted, fontWeight: "600" },

  /* Carte rapport */
  card:    { backgroundColor: C.surface, borderRadius: rs(14), borderWidth: 1, borderColor: C.border, padding: rs(14), marginBottom: rs(10) },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(8) },
  cardDate:{ fontSize: rf(15), fontWeight: "700", color: C.text, flex: 1, textTransform: "capitalize", marginRight: rs(8) },
  badge:   { flexDirection: "row", alignItems: "center", gap: rs(4), borderRadius: rs(20), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeOk:       { backgroundColor: C.successSoft },
  badgeProgress: { backgroundColor: C.dangerSoft },
  badgeTxt: { fontSize: rf(12), fontWeight: "700" },
  cardRow:  { flexDirection: "row", alignItems: "center", gap: rs(6), marginBottom: rs(4) },
  cardMeta: { fontSize: rf(14), color: C.textMuted, flex: 1 },
  overlay:    { flex:1, backgroundColor:"rgba(0,0,0,0.45)", justifyContent:"flex-end" },
  sheet:      { backgroundColor:C.surface, borderTopLeftRadius:rs(24), borderTopRightRadius:rs(24), padding:rs(20), paddingBottom:rs(32), gap:rs(14) },
  handle:     { width:rs(40), height:rs(4), borderRadius:rs(2), backgroundColor:C.border, alignSelf:"center" },
  sheetTitle: { fontSize:rf(19), fontWeight:"700", color:C.text },
  sheetSub:   { fontSize:rf(14), color:C.textMuted, marginTop:-rs(8) },
  detailRow:  { backgroundColor:C.surfaceAlt, borderRadius:rs(12), padding:rs(12), flexDirection:"row", justifyContent:"space-between" },
  detailKey:  { fontSize:rf(15), color:C.textMuted },
  detailVal:  { fontSize:rf(16), fontWeight:"700", color:C.text },
  closeBtn:   { backgroundColor:C.surfaceAlt, padding:rs(13), borderRadius:rs(12), alignItems:"center" },
  closeBtnText: { fontSize:rf(16), fontWeight:"600", color:C.text },

  /* ── Pages du formulaire (pas de modal — 2 pages dédiées) ── */
  formRoot: { flex:1, backgroundColor:C.bg },
  topBar:   { flexDirection:"row", alignItems:"center", paddingHorizontal:rs(16), paddingVertical:rs(12), backgroundColor:C.surface, borderBottomWidth:1, borderBottomColor:C.border },
  topTitle: { fontSize:rf(18), fontWeight:"700", color:C.text, flex:1 },
  progressWrap: { flexDirection:"row", alignItems:"center", paddingHorizontal:rs(16), paddingVertical:rs(12), gap:rs(10) },
  progressBar:  { flex:1, height:rs(6), backgroundColor:C.border, borderRadius:rs(3), overflow:"hidden" },
  progressFill: { height:"100%", backgroundColor:C.brand, borderRadius:rs(3) },
  progressTxt:  { fontSize:rf(14), fontWeight:"700", color:C.textMuted, minWidth:rs(32), textAlign:"right" },
  formBody: { flex:1, paddingHorizontal:rs(16) },
  /* Le contenu démarre en haut de page et remplit naturellement l'espace
     disponible grâce aux cartes pleine largeur (au lieu de flotter centré
     avec un grand vide autour, comme c'était le cas auparavant). */
  formScrollContent: { paddingTop:rs(18), paddingBottom:rs(28) },
  stepIntro:   { fontSize:rf(13), color:C.textMuted, fontWeight:"600" },
  stepHeading: { fontSize:rf(21), fontWeight:"800", color:C.text, marginTop:rs(3) },
  stepSub:     { fontSize:rf(14), color:C.textMuted, marginTop:rs(4), marginBottom:rs(20), lineHeight:rf(20) },

  /* Carte de champ — pleine largeur, en-tête icône + libellé, contenu dessous */
  fieldCard:       { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:rs(16), padding:rs(16), marginBottom:rs(14) },
  fieldCardHeader: { flexDirection:"row", alignItems:"center", gap:rs(11), marginBottom:rs(16) },
  fieldIconWrap:   { width:rs(36), height:rs(36), borderRadius:rs(10), backgroundColor:C.brandSoft, alignItems:"center", justifyContent:"center" },
  fieldLabel:      { flex:1, fontSize:rf(15.5), fontWeight:"700", color:C.text },
  fieldLabelOptional: { fontWeight:"400", color:C.textMuted, fontSize:rf(13) },

  counterRow: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:rs(22), backgroundColor:C.surfaceAlt, borderRadius:rs(13), paddingVertical:rs(12) },
  optionRow:  { flexDirection:"row", gap:rs(10), width:"100%" },
  counterBtn: { width:rs(40), height:rs(40), borderRadius:rs(20), backgroundColor:C.surface, borderWidth:1, borderColor:C.border, alignItems:"center", justifyContent:"center" },
  counterBtnText: { fontSize:rf(20), color:C.text, fontWeight:"700" },
  counterValue: { fontSize:rf(26), fontWeight:"800", color:C.text, minWidth:rs(46), textAlign:"center" },
  toggle:     { flex:1, paddingVertical:rs(12), borderRadius:rs(11), borderWidth:2, borderColor:C.border, alignItems:"center" },
  toggleText: { fontSize:rf(16), fontWeight:"700", color:C.textMuted },
  /* Zone de description de l'incident — apparaît seulement si "Oui" est sélectionné */
  incidentBox:   { marginTop:rs(14), backgroundColor:C.dangerSoft, borderWidth:1, borderColor:C.danger+"33", borderRadius:rs(13), padding:rs(14) },
  incidentLabel: { fontSize:rf(14), fontWeight:"700", color:C.danger, marginBottom:rs(8) },
  incidentInput: { borderWidth:1.5, borderColor:C.danger+"55", borderRadius:rs(11), padding:rs(12), color:C.text, fontSize:rf(14.5), minHeight:rs(80), textAlignVertical:"top", backgroundColor:C.surface },
  bilanBtn:   { flex:1, paddingVertical:rs(12), borderRadius:rs(11), borderWidth:2, borderColor:C.border, alignItems:"center" },
  bilanText:  { fontSize:rf(15), fontWeight:"700", color:C.textMuted },
  textarea:   { borderWidth:1.5, borderColor:C.border, borderRadius:rs(12), padding:rs(12), color:C.text, fontSize:rf(15), minHeight:rs(100), textAlignVertical:"top", backgroundColor:C.bg, width:"100%", alignSelf:"stretch" },
  choiceRow:    { flexDirection:"row", alignItems:"center", paddingVertical:rs(11), paddingHorizontal:rs(14), borderRadius:rs(11), borderWidth:1.5, borderColor:C.border, backgroundColor:C.bg },
  choiceRowSel: { borderColor:C.brand, backgroundColor:C.brandSoft },
  choiceTxt:    { fontSize:rf(14), color:C.text, fontWeight:"500" },
  choiceTxtSel: { color:C.brand, fontWeight:"700" },
  navRow:     { padding:rs(16), borderTopWidth:1, borderTopColor:C.border, backgroundColor:C.surface },
  nextBtn:    { backgroundColor:C.brand, paddingVertical:rs(15), borderRadius:rs(14), flexDirection:"row", alignItems:"center", justifyContent:"center" },
  nextBtnDisabled: { backgroundColor:C.surfaceAlt },
  nextBtnTxt: { color:"#fff", fontSize:rf(17), fontWeight:"700" },
  submitBtn:  { backgroundColor:C.primary },

  /* ── Menu rapports ── */
  menuPage: { padding: rs(16), paddingBottom: rs(48) },
  menuCard: {
    backgroundColor: C.surface,
    borderRadius: rs(16),
    borderWidth: 1.5,
    borderColor: C.brand + "44",
    padding: rs(16),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(14),
    marginBottom: rs(14),
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  menuCardDisabled: {
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    opacity: 0.75,
  },
  menuCardIcon: {
    width: rs(50),
    height: rs(50),
    borderRadius: rs(14),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuCardTitle: {
    fontSize: rf(16),
    fontWeight: "800",
    color: C.brand,
    marginBottom: rs(3),
  },
  menuCardSub: {
    fontSize: rf(13),
    color: C.textMuted,
    lineHeight: rf(18),
  },
  comingSoonBadge: {
    backgroundColor: C.warnSoft,
    borderRadius: rs(20),
    paddingHorizontal: rs(9),
    paddingVertical: rs(4),
    borderWidth: 1,
    borderColor: C.warn + "55",
  },
  comingSoonTxt: {
    fontSize: rf(11),
    fontWeight: "700",
    color: C.warn,
  },

  /* Retour au menu depuis la page rapport */
  backToMenu: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(5),
    marginBottom: rs(14),
    alignSelf: "flex-start",
  },
  backToMenuTxt: {
    fontSize: rf(13),
    fontWeight: "700",
    color: C.brand,
  },
});
