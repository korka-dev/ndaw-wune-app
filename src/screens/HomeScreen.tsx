/**
 * Écran Accueil — Timer de segment + Planning du jour.
 * Design identique à la maquette Ndaw Wune v2.
 * Adapté à tous les appareils via useSafeAreaInsets.
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Modal, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore }                from "../store/useStore";
import { seancesApi, rapportsApi } from "../services/api";
import { enqueueAction, upsertRapportCache } from "../services/db";
import { rs, rf }                  from "../utils/responsive";
import { C }                       from "../utils/theme";
import AppHeader                   from "../components/AppHeader";
import ProfileSheet                from "../components/ProfileSheet";
import { notifySegmentEnd }        from "../services/notifications";

/* ── Utilitaires ─────────────────────────────────────────────── */
function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(secs: number) {
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}
/** Convertit "HH:MM:SS" ou "HH:MM" en minutes depuis minuit */
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function segDurMin(debut: string, fin: string): number {
  return Math.max(0, toMin(fin) - toMin(debut));
}
function segTitle(seg: any): string { return seg.titre ?? seg.matiere ?? seg.classe ?? ""; }

const JOURS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

/* ── Composant ───────────────────────────────────────────────── */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, syncData, activeSeance, setActiveSeance, isOnline } = useStore();
  const planning = syncData?.planning ?? [];

  const jsDay     = new Date().getDay();
  const todayIdx  = jsDay === 0 ? 6 : jsDay - 1;
  const todayPlan = [...planning]
    .filter(p => p.jour === todayIdx)
    .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));

  /* ── Horloge temps réel (tick toutes les secondes) ── */
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pausedRemain, setPausedRemain] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

  /* ── Calcul basé sur l'heure réelle ── */
  const now    = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  const curSec = curMin * 60 + now.getSeconds();

  // Index du segment actuellement en cours
  const liveIdx = todayPlan.findIndex(seg =>
    curMin >= toMin(seg.heure_debut) && curMin < toMin(seg.heure_fin)
  );
  // Index du prochain segment à venir
  const nextIdx = liveIdx === -1
    ? todayPlan.findIndex(seg => curMin < toMin(seg.heure_debut))
    : -1;
  // Tous les segments sont terminés
  const allDone = todayPlan.length > 0 &&
    todayPlan.every(seg => curMin >= toMin(seg.heure_fin));

  // Segment affiché dans la carte principale
  const shownIdx = liveIdx !== -1 ? liveIdx
                 : nextIdx !== -1 ? nextIdx
                 : todayPlan.length - 1;
  const activeSeg = todayPlan[shownIdx] ?? null;

  // Secondes restantes (live ou gelées si pause)
  const liveRemain = activeSeg && liveIdx !== -1
    ? Math.max(0, toMin(activeSeg.heure_fin) * 60 - curSec)
    : activeSeg ? segDurMin(activeSeg.heure_debut, activeSeg.heure_fin) * 60 : 0;
  const remainSec = paused ? pausedRemain : liveRemain;

  const durMin  = activeSeg ? segDurMin(activeSeg.heure_debut, activeSeg.heure_fin) : 0;
  const durSec  = durMin * 60;
  const progress = durSec > 0 ? Math.max(0, Math.min(1, remainSec / durSec)) : 0;

  /* ── Détection fin de segment → notification ── */
  const prevLiveIdxRef = useRef<number>(-2); // -2 = première render, ne pas notifier

  useEffect(() => {
    const prev = prevLiveIdxRef.current;

    // Ignorer la toute première render (évite fausse notif au démarrage)
    if (prev === -2) {
      prevLiveIdxRef.current = liveIdx;
      return;
    }

    // Un segment était en cours et il vient de changer (terminé ou suivant)
    if (prev >= 0 && liveIdx !== prev) {
      const endedSeg = todayPlan[prev];
      if (endedSeg) {
        // Segment suivant : soit le nouveau liveIdx, soit le prochain à venir
        const followIdx  = liveIdx >= 0 ? liveIdx : nextIdx >= 0 ? nextIdx : -1;
        const followSeg  = followIdx >= 0 ? todayPlan[followIdx] : undefined;
        notifySegmentEnd(
          segTitle(endedSeg),
          followSeg ? segTitle(followSeg) : undefined,
        );
      }
    }

    prevLiveIdxRef.current = liveIdx;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveIdx]);

  const handlePause = () => {
    setPausedRemain(liveRemain);
    setPaused(true);
  };
  const handleResume = () => setPaused(false);

  /* ── Profil ── */
  const [showProfile, setShowProfile] = useState(false);

  /* ── Rapport modal ── */
  const [showRapport, setShowRapport] = useState(false);
  const [presences,   setPresences]   = useState(0);
  const [segsDone,    setSegsDone]    = useState<boolean | null>(null);
  const [bilan,       setBilan]       = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const canSend = segsDone !== null && bilan !== null;

  const resetForm = () => { setPresences(0); setSegsDone(null); setBilan(null); setCommentaire(""); };

  const submitRapport = async () => {
    if (!canSend || submitting) return;
    setSubmitting(true);
    try {
      const finishedAt   = new Date().toISOString();
      // Durée totale planifiée pour aujourd'hui (en minutes)
      const dureeMinutes = Math.max(1, todayPlan.reduce(
        (acc, seg) => acc + segDurMin(seg.heure_debut, seg.heure_fin), 0
      ));
      if (isOnline && activeSeance) {
        await seancesApi.finish(activeSeance.id, { finished_at: finishedAt, duree_minutes: dureeMinutes });
        await rapportsApi.submit({
          seance_id: activeSeance.id,
          contenu: commentaire.trim() || `Présences: ${presences}. Bilan: ${bilan}.`,
          points_positifs: bilan === "Bien" ? "Bonne séance" : null,
          difficultes: bilan === "Difficile" ? commentaire.trim() || null : null,
          soumis_en_offline: false,
        });
        upsertRapportCache({
          id: `${activeSeance.id}-rapport`, seance_id: activeSeance.id,
          classe: activeSeance.classe, matiere: activeSeance.matiere ?? null,
          date_seance: activeSeance.started_at ?? finishedAt,
          contenu: commentaire.trim() || `Présences: ${presences}. Bilan: ${bilan}.`,
          points_positifs: bilan === "Bien" ? "Bonne séance" : null,
          difficultes: bilan === "Difficile" ? commentaire.trim() || null : null,
          synced: 1,
        });
      } else if (activeSeance) {
        const localId = `offline-${Date.now()}`;
        enqueueAction("FINISH_SEANCE", { seance_id: activeSeance.id, finished_at: finishedAt, duree_minutes: dureeMinutes });
        enqueueAction("SUBMIT_RAPPORT", {
          local_rapport_id: localId, seance_id: activeSeance.id,
          contenu: commentaire.trim() || `Présences: ${presences}. Bilan: ${bilan}.`,
          soumis_en_offline: true,
        });
      }
      setActiveSeance(null);
      setShowRapport(false); resetForm();
      Alert.alert("Rapport envoyé !", isOnline ? "Séance terminée." : "Enregistré hors-ligne.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail ?? "Erreur lors de l'envoi.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Date ── */
  const dateLabel = `${JOURS_FR[todayIdx]} ${now.getDate()} ${now.toLocaleDateString("fr-FR", { month: "long" })} ${now.getFullYear()}`;
  const greetName = user?.name ?? "";

  /* ── Carte segment ── */
  const renderSegCard = () => {
    type FName = React.ComponentProps<typeof Feather>["name"];

    // Journée terminée
    if (allDone) return (
      <View style={[s.segCard, { backgroundColor: C.success }]}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(14) }}>
          <Feather name="check-circle" size={rf(20)} color="#fff" style={{ marginRight: rs(8) }} />
          <Text style={[s.segTitle, { color: "#fff", marginBottom: 0 }]}>Journée terminée !</Text>
        </View>
        <TouchableOpacity
          style={[s.btnAction, { backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "flex-start" }]}
          onPress={() => setShowRapport(true)} activeOpacity={0.8}
        >
          <Feather name="send" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
          <Text style={s.btnActionTxt}>Soumettre le rapport</Text>
        </TouchableOpacity>
      </View>
    );

    const isLive = liveIdx !== -1;
    const statusIcon: FName = isLive ? (paused ? "pause" : "play") : "clock";
    const statusLabel = isLive
      ? (paused ? "EN PAUSE" : "EN COURS")
      : "À VENIR";

    const displayTitle     = activeSeg ? segTitle(activeSeg) : "Aucun cours planifié";
    const displayTimeRange = activeSeg
      ? `${activeSeg.heure_debut.slice(0, 5)} – ${activeSeg.heure_fin.slice(0, 5)}`
      : "—";
    const displayTimer = activeSeg && isLive ? fmt(remainSec) : "—:——";
    const displaySub   = isLive
      ? `restantes sur ${durMin} min`
      : activeSeg ? `Début à ${activeSeg.heure_debut.slice(0, 5)}` : "";

    return (
      <View style={s.segCard}>
        <View style={s.segTopRow}>
          <View style={s.segBadge}>
            <Feather name={statusIcon} size={rf(10)} color="#fff" style={{ marginRight: rs(4) }} />
            <Text style={s.segBadgeTxt}>{statusLabel}</Text>
          </View>
          <Text style={s.segTimeRange}>{displayTimeRange}</Text>
        </View>

        <Text style={s.segTitle}>{displayTitle}</Text>

        <View style={s.segTimerRow}>
          <View style={{ flex: 1, marginRight: rs(12) }}>
            <Text style={s.timerText} numberOfLines={1} adjustsFontSizeToFit>
              {displayTimer}
            </Text>
            <Text style={s.timerSub} numberOfLines={2}>{displaySub}</Text>
          </View>

          {/* Pause / Reprendre uniquement si le segment est en cours */}
          {isLive && !paused && (
            <TouchableOpacity style={[s.btnAction, s.btnPause]} onPress={handlePause} activeOpacity={0.8}>
              <Feather name="pause" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
              <Text style={s.btnActionTxt}>Pause</Text>
            </TouchableOpacity>
          )}
          {isLive && paused && (
            <TouchableOpacity style={s.btnAction} onPress={handleResume} activeOpacity={0.8}>
              <Feather name="play" size={rf(13)} color="#fff" style={{ marginRight: rs(6) }} />
              <Text style={s.btnActionTxt}>Reprendre</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.progressBg}>
          <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>
      </View>
    );
  };

  /* ── Ligne planning ── */
  const doneCount = todayPlan.filter(seg => curMin >= toMin(seg.heure_fin)).length;

  const renderPlanRow = (seg: any, i: number) => {
    // Basé uniquement sur l'heure réelle
    const isDone    = curMin >= toMin(seg.heure_fin);
    const isCur     = liveIdx === i;
    // Prochain segment à venir (rien en cours actuellement)
    const isUpNext  = liveIdx === -1 && nextIdx === i;
    // Segment suivant immédiatement celui en cours
    const isFollowing = liveIdx !== -1 && i === liveIdx + 1;

    return (
      <View
        key={seg.id}
        style={[
          s.planRow,
          i < todayPlan.length - 1 && s.planRowBorder,
          isCur && { backgroundColor: C.brandSoft },
        ]}
      >
        <View style={[s.planDot, {
          backgroundColor: isCur ? C.brand : isDone ? C.successSoft : C.surfaceAlt,
        }]}>
          {isCur
            ? <Feather name="play"  size={rf(10)} color="#fff" />
            : isDone
              ? <Feather name="check" size={rf(11)} color={C.success} />
              : <View style={[s.planDotInner, { backgroundColor: isUpNext ? C.brand : C.border }]} />
          }
        </View>

        <Text style={[s.planHeure, isCur && { color: C.brand, fontWeight: "700" }]}>
          {seg.heure_debut.slice(0, 5)}
        </Text>

        <View style={{ flex: 1 }}>
          <View style={s.planTitleRow}>
            <Text
              style={[s.planSegTitle, isCur && { fontWeight: "700" }, isDone && { color: C.textMuted }]}
              numberOfLines={1}
            >
              {segTitle(seg)}
            </Text>
            <Text style={[s.planSegDur, isDone && { color: C.textMuted }]}>
              {" · "}{segDurMin(seg.heure_debut, seg.heure_fin)} min
            </Text>
          </View>
        </View>

        {isUpNext && (
          <View style={s.badgeProchain}><Text style={s.badgeProchainTxt}>PROCHAIN</Text></View>
        )}
        {isCur && (
          <View style={s.badgeEnCours}><Text style={s.badgeEnCoursTxt}>EN COURS</Text></View>
        )}
        {isFollowing && (
          <View style={s.badgeSuivant}><Text style={s.badgeSuivantTxt}>Suivant</Text></View>
        )}
      </View>
    );
  };

  /* ── Rendu ── */
  return (
    <View style={s.screen}>
      <AppHeader userName={greetName} onAvatarPress={() => setShowProfile(true)} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          // padding extra en bas pour ne pas être caché par la tab bar
          { paddingBottom: rs(24) + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.dateLabel}>{dateLabel}</Text>
        <Text style={s.greeting}>Bonjour, {greetName} 👋</Text>

        {renderSegCard()}

        <View style={s.planCard}>
          <View style={s.planHeader}>
            <Text style={s.planTitle}>Planning du jour</Text>
            {todayPlan.length > 0 && (
              <Text style={s.planCount}>
                {doneCount} / {todayPlan.length} faits
              </Text>
            )}
          </View>
          {todayPlan.length > 0
            ? todayPlan.map(renderPlanRow)
            : (
              <View style={s.emptyPlan}>
                <Text style={s.emptyPlanTxt}>Aucun cours planifié pour aujourd'hui</Text>
              </View>
            )
          }
        </View>

      </ScrollView>

      <ProfileSheet visible={showProfile} onClose={() => setShowProfile(false)} />

      {/* Modal rapport */}
      <Modal visible={showRapport} animationType="slide" transparent onRequestClose={() => setShowRapport(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => !submitting && setShowRapport(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <TouchableOpacity activeOpacity={1} style={[s.sheet, { paddingBottom: rs(20) + insets.bottom }]} onPress={() => {}}>
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Rapport du jour</Text>
              <Text style={s.sheetSub}>{activeSeg ? segTitle(activeSeg) : ""}</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Présences */}
                <Text style={s.fieldLabel}>Élèves présents</Text>
                <View style={s.counterRow}>
                  <TouchableOpacity style={s.counterBtn} onPress={() => setPresences(p => Math.max(0, p - 1))}>
                    <Text style={s.counterBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.counterVal}>{presences}</Text>
                  <TouchableOpacity style={s.counterBtn} onPress={() => setPresences(p => Math.min(100, p + 1))}>
                    <Text style={s.counterBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>

                {/* Segments réalisés */}
                <Text style={s.fieldLabel}>Tous les segments réalisés ?</Text>
                <View style={s.toggleRow}>
                  {([{ v: true, l: "Oui ✓" }, { v: false, l: "Non ✗" }] as const).map(opt => (
                    <TouchableOpacity
                      key={String(opt.v)}
                      style={[s.toggleBtn, segsDone === opt.v && s.toggleBtnActive]}
                      onPress={() => setSegsDone(opt.v)}
                    >
                      <Text style={[s.toggleBtnTxt, segsDone === opt.v && s.toggleBtnTxtActive]}>{opt.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Bilan */}
                <Text style={s.fieldLabel}>Bilan global</Text>
                <View style={s.bilanRow}>
                  {(["Bien", "Moyen", "Difficile"] as const).map(b => {
                    const col: Record<string, string> = { Bien: C.success, Moyen: C.warn, Difficile: C.danger };
                    const sel = bilan === b;
                    return (
                      <TouchableOpacity
                        key={b}
                        style={[s.bilanBtn, sel && { borderColor: col[b], backgroundColor: col[b] + "22" }]}
                        onPress={() => setBilan(b)}
                      >
                        <Text style={[s.bilanBtnTxt, sel && { color: col[b] }]}>{b}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Commentaire */}
                <Text style={s.fieldLabel}>Commentaire <Text style={{ fontWeight: "400", color: C.textMuted }}>(optionnel)</Text></Text>
                <TextInput
                  style={s.textarea} multiline numberOfLines={3}
                  value={commentaire} onChangeText={setCommentaire}
                  placeholder="Difficultés, remarques..." placeholderTextColor={C.textMuted}
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[s.sendBtn, !canSend && { backgroundColor: C.surfaceAlt }]}
                  onPress={submitRapport} disabled={!canSend || submitting} activeOpacity={0.8}
                >
                  {submitting
                    ? <ActivityIndicator color={canSend ? "#fff" : C.textMuted} />
                    : <Text style={[s.sendBtnTxt, !canSend && { color: C.textMuted }]}>
                        {isOnline ? "Envoyer le rapport" : "Enregistrer hors-ligne"}
                      </Text>
                  }
                </TouchableOpacity>
                <View style={{ height: rs(16) }} />
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: C.bg },
  scroll:        { flex: 1 },
  scrollContent: { padding: rs(16) },

  dateLabel:  { fontSize: rf(13), color: C.textMuted, fontWeight: "500", marginBottom: rs(4) },
  greeting:   { fontSize: rf(22), fontWeight: "700", color: C.text, marginBottom: rs(16) },

  /* Segment card */
  segCard:      { backgroundColor: C.brand, borderRadius: rs(18), padding: rs(18), marginBottom: rs(16) },
  segTopRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: rs(10) },
  segBadge:     { backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(20), flexDirection: "row", alignItems: "center" },
  segBadgeTxt:  { color: "#fff", fontSize: rf(11), fontWeight: "700", letterSpacing: 0.5 },
  segTimeRange: { color: "#fff", fontSize: rf(13), fontWeight: "600", opacity: 0.9 },
  segTitle:     { color: "#fff", fontSize: rf(18), fontWeight: "700", marginBottom: rs(14), lineHeight: rf(24) },
  segTimerRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(14) },
  timerText:    { fontSize: rf(42), fontWeight: "700", color: "#fff", letterSpacing: 1.5, flexShrink: 1 },
  timerSub:     { fontSize: rf(12), color: "rgba(255,255,255,0.75)", marginTop: rs(4) },
  btnAction:    { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: rs(12), paddingHorizontal: rs(18), paddingVertical: rs(12), flexDirection: "row", alignItems: "center" },
  btnPause:     { backgroundColor: "rgba(0,0,0,0.22)" },
  btnActionTxt: { color: "#fff", fontWeight: "700", fontSize: rf(13) },
  progressBg:   { height: rs(6), backgroundColor: "rgba(255,255,255,0.25)", borderRadius: rs(3), overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: rs(3) },

  /* Planning */
  planCard:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(16), overflow: "hidden", marginBottom: rs(14) },
  planHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: rs(14), borderBottomWidth: 1, borderBottomColor: C.border },
  planTitle:     { fontSize: rf(14), fontWeight: "700", color: C.text },
  planCount:     { fontSize: rf(12), color: C.textMuted },
  planRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(14), paddingVertical: rs(12) },
  planRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  planDot:       { width: rs(30), height: rs(30), borderRadius: rs(15), alignItems: "center", justifyContent: "center", marginRight: rs(12), flexShrink: 0 },
  planDotInner:  { width: rs(8), height: rs(8), borderRadius: rs(4) },
  planHeure:     { fontSize: rf(13), color: C.textMuted, minWidth: rs(42) },
  planTitleRow:  { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  planSegTitle:  { fontSize: rf(14), fontWeight: "600", color: C.text, flexShrink: 1 },
  planSegDur:    { fontSize: rf(12), color: C.textMuted, flexShrink: 0 },

  badgeProchain:    { backgroundColor: C.brandSoft, borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeProchainTxt: { fontSize: rf(10), fontWeight: "700", color: C.brand },
  badgeEnCours:     { backgroundColor: "rgba(0,0,0,0.07)", borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeEnCoursTxt:  { fontSize: rf(10), fontWeight: "700", color: C.brand },
  badgeSuivant:     { borderWidth: 1, borderColor: C.border, borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeSuivantTxt:  { fontSize: rf(10), fontWeight: "600", color: C.textMuted },

  emptyPlan:    { padding: rs(20), alignItems: "center" },
  emptyPlanTxt: { fontSize: rf(13), color: C.textMuted, fontStyle: "italic" },

  /* Modal rapport */
  overlay:       { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet:         { backgroundColor: C.surface, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), padding: rs(20), maxHeight: "92%" },
  handle:        { width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: C.border, alignSelf: "center", marginBottom: rs(16) },
  sheetTitle:    { fontSize: rf(17), fontWeight: "700", color: C.text, marginBottom: rs(2) },
  sheetSub:      { fontSize: rf(12), color: C.textMuted, marginBottom: rs(16) },
  fieldLabel:    { fontSize: rf(13), fontWeight: "600", color: C.text, marginBottom: rs(10), marginTop: rs(4) },
  counterRow:    { flexDirection: "row", alignItems: "center", marginBottom: rs(16), gap: rs(16) },
  counterBtn:    { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  counterBtnTxt: { fontSize: rf(22), color: C.text, lineHeight: rf(28) },
  counterVal:    { fontSize: rf(28), fontWeight: "700", color: C.text, minWidth: rs(40), textAlign: "center" },
  toggleRow:     { flexDirection: "row", gap: rs(10), marginBottom: rs(16) },
  toggleBtn:     { flex: 1, padding: rs(12), borderRadius: rs(12), borderWidth: 2, borderColor: C.border, backgroundColor: C.bg, alignItems: "center" },
  toggleBtnActive:{ borderColor: C.primary, backgroundColor: C.primarySoft },
  toggleBtnTxt:  { fontSize: rf(14), fontWeight: "700", color: C.textMuted },
  toggleBtnTxtActive:{ color: C.primary },
  bilanRow:      { flexDirection: "row", gap: rs(8), marginBottom: rs(16) },
  bilanBtn:      { flex: 1, padding: rs(12), borderRadius: rs(12), borderWidth: 2, borderColor: C.border, backgroundColor: C.bg, alignItems: "center" },
  bilanBtnTxt:   { fontSize: rf(13), fontWeight: "700", color: C.textMuted },
  textarea:      { borderWidth: 1.5, borderColor: C.border, borderRadius: rs(12), padding: rs(12), fontSize: rf(13), color: C.text, backgroundColor: C.bg, minHeight: rs(80), marginBottom: rs(16), textAlignVertical: "top" },
  sendBtn:       { backgroundColor: C.primary, borderRadius: rs(14), paddingVertical: rs(16), alignItems: "center" },
  sendBtnTxt:    { color: "#fff", fontWeight: "700", fontSize: rf(15) },
});
