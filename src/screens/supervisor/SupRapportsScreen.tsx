import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Modal, ActivityIndicator, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { useStore } from "../../store/useStore";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { rapportJournalierApi } from "../../services/api";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";

const BILANS = ["Bien", "Moyen", "Difficile"] as const;
type Bilan = typeof BILANS[number];

const TOTAL_STEPS = 2;

interface Rapport {
  id: number; date: string; heure: string; status: "ok" | "fail";
  profsPresents: number | null; classesTerminees: number | null;
  incidents: boolean | null; incidentDetail?: string; bilan: Bilan | null; commentaire: string;
}

export default function SupRapportsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useStore();
  /* Historique réel du superviseur — vide tant qu'il n'a envoyé aucun rapport
     (auparavant pré-rempli avec des données de démonstration, ce qui affichait
     des statistiques trompeuses dès l'ouverture de l'écran). */
  const [history,    setHistory]    = useState<Rapport[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  /* 0 = liste principale · 1 = page 1 du formulaire · 2 = page 2 du formulaire */
  const [formStep,   setFormStep]   = useState<0 | 1 | 2>(0);
  const [detail,     setDetail]     = useState<Rapport | null>(null);
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [profsPresents,    setProfsPresents]    = useState(4);
  const [classesTerminees, setClassesTerminees] = useState(4);
  const [incidents,        setIncidents]        = useState<boolean | null>(null);
  const [incidentDetail,   setIncidentDetail]   = useState("");
  const [bilan,            setBilan]            = useState<Bilan | null>(null);
  const [commentaire,      setCommentaire]      = useState("");

  const okCount = history.filter(r => r.status === "ok").length;
  const failCount = history.filter(r => r.status === "fail").length;
  const bilanColor: Record<Bilan, string> = { Bien:C.success, Moyen:C.warn, Difficile:C.danger };

  /* Date du jour, affichée en en-tête des pages du formulaire (remplace l'ancienne date factice) */
  const todayLabel = (() => {
    const d = new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
    return d.charAt(0).toUpperCase() + d.slice(1);
  })();

  const resetForm = () => {
    setFormStep(0);
    setProfsPresents(4); setClassesTerminees(4); setIncidents(null); setIncidentDetail(""); setBilan(null); setCommentaire("");
  };

  const startForm = () => setFormStep(1);

  /* Si un incident est signalé, sa description devient obligatoire avant de continuer */
  const canGoNext = incidents !== null && (!incidents || incidentDetail.trim().length > 0);

  const goNext = () => {
    if (!canGoNext) return;
    setFormStep(2);
  };

  const goPrev = () => setFormStep(1);

  const handleSend = async () => {
    if (bilan === null) return;
    setSending(true);
    try {
      const now = new Date();
      const resume = [
        `Professeurs présents : ${profsPresents}`,
        `Classes ayant terminé leur planning : ${classesTerminees}`,
        `Incidents signalés : ${incidents ? `Oui — ${incidentDetail.trim()}` : "Non"}`,
        `Bilan global : ${bilan}`,
      ].join("\n");

      /* Le rapport superviseur est enregistré via le même endpoint que celui
         des enseignants (/app/rapports/journalier — accessible aux deux rôles).
         Comme le superviseur n'est rattaché à aucune école précise, les champs
         école/commune/IEF reçoivent une valeur générique et le détail de sa
         tournée (profs présents, classes terminées, incident, bilan) est
         consigné dans les commentaires pour rester visible côté admin. */
      await rapportJournalierApi.submit({
        date_rapport: format(now, "yyyy-MM-dd"),
        ief: "—", commune: "—", ecole: "Tournée de supervision",
        superviseur: user?.name ?? "", nom_tuteur: user?.name ?? "",
        nb_absences: 0, absents: null,
        semaine: 1, jour_cours: 1,
        difficultes: JSON.stringify(incidents ? [incidentDetail.trim() || "Incident signalé"] : []),
        autres_difficultes: null,
        description_difficultes: incidents ? incidentDetail.trim() : null,
        directeur_venu: false, besoin_appui: false, domaines_appui: null,
        has_observations: true,
        commentaires: commentaire.trim() ? `${resume}\n\n${commentaire.trim()}` : resume,
        soumis_en_offline: false,
        photo_classe_url: null,
      });

      setHistory(h => [{
        id: Date.now(),
        date: now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }),
        heure: `${now.getHours()}h${String(now.getMinutes()).padStart(2, "0")}`,
        status: "ok", profsPresents, classesTerminees, incidents, incidentDetail: incidents ? incidentDetail.trim() : "", bilan, commentaire,
      }, ...h]);
      resetForm();
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch {
      Alert.alert("Erreur", "Impossible d'envoyer le rapport. Vérifiez votre connexion et réessayez.");
    } finally {
      setSending(false);
    }
  };

  /* ── En-tête commun aux pages du formulaire ── */
  const FormTopBar = ({ step, onBack }: { step: 1 | 2; onBack: () => void }) => (
    <>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>
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

  /* ── Page 1 : Professeurs présents → Incidents signalés ── */
  if (formStep === 1) {
    return (
      <View style={[styles.formRoot, { paddingTop: insets.top }]}>
        <FormTopBar step={1} onBack={resetForm} />
        <ScrollView style={styles.formBody} showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScrollContent}>
          <Text style={styles.stepIntro}>{todayLabel} · {user?.name ?? "Superviseur"}</Text>
          <Text style={styles.stepHeading}>Votre tournée du jour</Text>
          <Text style={styles.stepSub}>Renseignez ces quelques informations pour commencer votre rapport.</Text>

          <View style={styles.fieldCard}>
            <View style={styles.fieldCardHeader}>
              <View style={styles.fieldIconWrap}>
                <Feather name="users" size={rf(17)} color={C.brand} />
              </View>
              <Text style={styles.fieldLabel}>Professeurs présents</Text>
            </View>
            <View style={styles.counterRow}>
              <TouchableOpacity onPress={() => setProfsPresents(p => Math.max(0,p-1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>−</Text></TouchableOpacity>
              <Text style={styles.counterValue}>{profsPresents}</Text>
              <TouchableOpacity onPress={() => setProfsPresents(p => Math.min(20,p+1))} style={styles.counterBtn}><Text style={styles.counterBtnText}>+</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldCard}>
            <View style={styles.fieldCardHeader}>
              <View style={[styles.fieldIconWrap, { backgroundColor: C.successSoft }]}>
                <Feather name="check-square" size={rf(17)} color={C.success} />
              </View>
              <Text style={styles.fieldLabel}>Classes ayant terminé leur planning</Text>
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
              <Text style={styles.fieldLabel}>Incidents signalés ?</Text>
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
      </View>
    );
  }

  /* ── Page 2 : Bilan global → fin ── */
  if (formStep === 2) {
    const canSend = bilan !== null;
    return (
      <View style={[styles.formRoot, { paddingTop: insets.top }]}>
        <FormTopBar step={2} onBack={goPrev} />
        <ScrollView style={styles.formBody} showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScrollContent}>
          <Text style={styles.stepIntro}>{todayLabel} · {user?.name ?? "Superviseur"}</Text>
          <Text style={styles.stepHeading}>Bilan de la journée</Text>
          <Text style={styles.stepSub}>Donnez votre appréciation globale et ajoutez vos observations.</Text>

          <View style={styles.fieldCard}>
            <View style={styles.fieldCardHeader}>
              <View style={[styles.fieldIconWrap, { backgroundColor: C.brandSoft }]}>
                <Feather name="bar-chart-2" size={rf(17)} color={C.brand} />
              </View>
              <Text style={styles.fieldLabel}>Bilan global</Text>
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
              <Text style={styles.fieldLabel}>Commentaire <Text style={styles.fieldLabelOptional}>(optionnel)</Text></Text>
            </View>
            <TextInput value={commentaire} onChangeText={setCommentaire} multiline numberOfLines={4} placeholder="Observations, points positifs, difficultés rencontrées…" placeholderTextColor={C.textMuted}
              style={styles.textarea} />
          </View>
        </ScrollView>

        <View style={styles.navRow}>
          <TouchableOpacity onPress={handleSend} disabled={!canSend || sending}
            style={[styles.nextBtn, styles.submitBtn, (!canSend || sending) && styles.nextBtnDisabled]} activeOpacity={0.85}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <><Feather name="send" size={rf(16)} color="#fff" style={{ marginRight: rs(6) }} /><Text style={styles.nextBtnTxt}>Envoyer</Text></>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── Page principale : statistiques + historique (même design que la partie enseignant) ── */
  const dernierRapport = history.length > 0 ? history[0].date : null;

  return (
    <View style={styles.root}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
      />

      <ScrollView contentContainerStyle={styles.scrollPage} showsVerticalScrollIndicator={false}>
        {sent && (
          <View style={styles.sentBanner}>
            <Feather name="check" size={rs(16)} color={C.success} />
            <Text style={styles.sentText}>Rapport envoyé avec succès !</Text>
          </View>
        )}

        {/* ── En-tête page ── */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Mes rapports</Text>
          {dernierRapport && (
            <Text style={styles.pageSubtitle}>Dernier envoi : {dernierRapport}</Text>
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
                <View style={[styles.statIconWrap, { backgroundColor: C.danger + "18" }]}>
                  <Feather name="alert-triangle" size={rf(18)} color={C.danger} />
                </View>
                <Text style={[styles.statValue, { color: C.danger }]}>{failCount}</Text>
                <Text style={styles.statLabel}>Non envoyés</Text>
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

        {/* ── Historique ── */}
        {history.length > 0 && (
          <View style={styles.histSection}>
            <View style={styles.histHeader}>
              <Text style={styles.sectionTitle}>Historique</Text>
              <Text style={styles.histCount}>{history.length} rapport{history.length > 1 ? "s" : ""}</Text>
            </View>

            {history.map((r, i) => {
              const ok = r.status === "ok";
              return (
                <TouchableOpacity key={r.id} style={styles.card} onPress={() => setDetail(r)} activeOpacity={0.75}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardDate} numberOfLines={1}>{r.date}</Text>
                    <View style={[styles.badge, ok ? styles.badgeOk : styles.badgeProgress]}>
                      <Feather name={ok ? "check-circle" : "alert-triangle"} size={rf(10)} color={ok ? C.success : C.danger} />
                      <Text style={[styles.badgeTxt, { color: ok ? C.success : C.danger }]}>{ok ? "Envoyé" : "Échoué"}</Text>
                    </View>
                  </View>
                  {ok && (
                    <>
                      <View style={styles.cardRow}>
                        <Feather name="users" size={rf(13)} color={C.brand} />
                        <Text style={styles.cardMeta}>Professeurs présents : {r.profsPresents}</Text>
                      </View>
                      <View style={styles.cardRow}>
                        <Feather name="check-square" size={rf(13)} color={C.brand} />
                        <Text style={styles.cardMeta}>Classes terminées : {r.classesTerminees}</Text>
                      </View>
                      <View style={[styles.cardRow, { marginTop: rs(2) }]}>
                        <Feather name="alert-circle" size={rf(13)} color={C.textMuted} />
                        <Text style={[styles.cardMeta, { color: C.textMuted }]} numberOfLines={1}>
                          {r.incidents ? "Incident signalé" : "Aucun incident"} · Bilan {r.bilan}
                        </Text>
                      </View>
                    </>
                  )}
                  {!ok && (
                    <View style={styles.cardRow}>
                      <Feather name="alert-circle" size={rf(13)} color={C.danger} />
                      <Text style={[styles.cardMeta, { color: C.danger }]}>Envoi échoué — à renvoyer</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
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
                <Text style={styles.sheetTitle}>Rapport · {detail.date}</Text>
                <Text style={styles.sheetSub}>{detail.status==="ok" ? `Envoyé à ${detail.heure}` : "Envoi échoué"}</Text>
                {detail.status === "ok" && (
                  <View style={{ gap:rs(8) }}>
                    {[["Profs présents", `${detail.profsPresents}`],["Classes terminées",`${detail.classesTerminees}`],["Incidents", detail.incidents?"Oui ⚠":"Non ✓"],["Bilan",detail.bilan??""]]
                      .map(([k,v]) => (
                        <View key={k} style={styles.detailRow}>
                          <Text style={styles.detailKey}>{k}</Text>
                          <Text style={styles.detailVal}>{v}</Text>
                        </View>
                      ))}
                    {detail.incidents && detail.incidentDetail ? <View style={styles.detailRow}><Text style={styles.detailKey}>Détail incident</Text><Text style={styles.detailVal}>{detail.incidentDetail}</Text></View> : null}
                    {detail.commentaire ? <View style={styles.detailRow}><Text style={styles.detailKey}>Commentaire</Text><Text style={styles.detailVal}>{detail.commentaire}</Text></View> : null}
                  </View>
                )}
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
  backBtn:  { marginRight:rs(12) },
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
  navRow:     { padding:rs(16), borderTopWidth:1, borderTopColor:C.border, backgroundColor:C.surface },
  nextBtn:    { backgroundColor:C.brand, paddingVertical:rs(15), borderRadius:rs(14), flexDirection:"row", alignItems:"center", justifyContent:"center" },
  nextBtnDisabled: { backgroundColor:C.surfaceAlt },
  nextBtnTxt: { color:"#fff", fontSize:rf(17), fontWeight:"700" },
  submitBtn:  { backgroundColor:C.primary },
});
