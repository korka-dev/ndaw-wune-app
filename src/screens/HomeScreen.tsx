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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore }                from "../store/useStore";
import { seancesApi, rapportsApi } from "../services/api";
import { enqueueAction, upsertRapportCache } from "../services/db";
import { rs, rf }                  from "../utils/responsive";
import { C }                       from "../utils/theme";
import AppHeader                   from "../components/AppHeader";
import ProfileSheet                from "../components/ProfileSheet";

/* ── Utilitaires ─────────────────────────────────────────────── */
function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(secs: number) {
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}
function segDurSec(debut: string, fin: string): number {
  const [sh, sm] = debut.split(":").map(Number);
  const [eh, em] = fin.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) * 60);
}
function segDurMin(debut: string, fin: string): number {
  return Math.round(segDurSec(debut, fin) / 60);
}
function findActiveIdx(segs: any[]): number {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < segs.length; i++) {
    const [h, m]   = segs[i].heure_debut.split(":").map(Number);
    const [eh, em] = segs[i].heure_fin.split(":").map(Number);
    if (cur >= h * 60 + m && cur < eh * 60 + em) return i;
  }
  return new Date().getHours() < parseInt(segs[0]?.heure_debut ?? "99") ? 0 : segs.length - 1;
}
function segTitle(seg: any): string { return seg.titre ?? seg.classe ?? ""; }

const JOURS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

/* ── Composant ───────────────────────────────────────────────── */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, syncData, activeSeance, setActiveSeance, isOnline } = useStore();
  const planning = syncData?.planning ?? [];
  const session  = syncData?.active_session;

  const jsDay    = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const todayPlan = [...planning]
    .filter(p => p.jour === todayIdx)
    .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));

  /* ── Timer ── */
  const [curIdx,  setCurIdx]  = useState(() => todayPlan.length > 0 ? findActiveIdx(todayPlan) : 0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [done,    setDone]    = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeSeg = todayPlan[curIdx] ?? null;
  const durSec    = activeSeg ? segDurSec(activeSeg.heure_debut, activeSeg.heure_fin) : 0;
  const durMin    = activeSeg ? segDurMin(activeSeg.heure_debut, activeSeg.heure_fin) : 0;
  const progress  = durSec > 0 ? Math.max(0, Math.min(1, 1 - seconds / durSec)) : 0;

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(timerRef.current!);
            const next = curIdx + 1;
            if (next < todayPlan.length) {
              setCurIdx(next);
              setSeconds(segDurSec(todayPlan[next].heure_debut, todayPlan[next].heure_fin));
            } else {
              setDone(true);
              setRunning(false);
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, curIdx]);

  const handleStart = () => {
    if (!session) {
      Alert.alert("Aucune session active", "Un administrateur doit activer une session.");
      return;
    }
    if (!activeSeg) {
      Alert.alert("Aucun cours prévu", "Aucun segment n'est planifié pour aujourd'hui.");
      return;
    }
    setSeconds(durSec);
    setRunning(true);
    setStarted(true);
  };

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
      const dureeMinutes = Math.max(1, Math.round((durSec - seconds) / 60));
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
      setActiveSeance(null); setRunning(false); setDone(true);
      setShowRapport(false); resetForm();
      Alert.alert("Rapport envoyé !", isOnline ? "Séance terminée." : "Enregistré hors-ligne.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.response?.data?.detail ?? "Erreur lors de l'envoi.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Date ── */
  const now       = new Date();
  const dateLabel = `${JOURS_FR[todayIdx]} ${now.getDate()} ${now.toLocaleDateString("fr-FR", { month: "long" })} ${now.getFullYear()}`;
  const greetName = user?.name ?? "";

  /* ── Carte segment ── */
  const renderSegCard = () => {
    // Journée terminée
    if (done) return (
      <View style={[s.segCard, { backgroundColor: C.success }]}>
        <Text style={[s.segTitle, { color: "#fff" }]}>🎉 Journée terminée !</Text>
      </View>
    );

    const isPaused     = started && !running;
    const isNotStarted = !started;
    const statusLabel  = running ? "▶  EN COURS"
                       : isPaused ? "⏸  EN PAUSE"
                       : "⏳  PAS ENCORE COMMENCÉ";

    // Valeurs affichées — placeholders si aucun segment
    const displayTitle     = activeSeg ? segTitle(activeSeg) : "Aucun cours planifié";
    const displayTimeRange = activeSeg
      ? `${activeSeg.heure_debut.slice(0, 5)} – ${activeSeg.heure_fin.slice(0, 5)}`
      : "—";
    const displayTimer     = activeSeg ? fmt(running ? seconds : durSec) : "00:00";
    const displaySub       = activeSeg
      ? (running
          ? `restantes sur ${durMin} min`
          : `${durMin} min${activeSeg.matiere ? ` · ${activeSeg.matiere}` : ""}`)
      : "appuyez sur Commencer pour vérifier";

    return (
      <View style={s.segCard}>
        <View style={s.segTopRow}>
          <View style={s.segBadge}>
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

          {isNotStarted && (
            <TouchableOpacity style={s.btnAction} onPress={handleStart} activeOpacity={0.8}>
              <Text style={s.btnActionTxt}>▶  Commencer</Text>
            </TouchableOpacity>
          )}
          {running && (
            <TouchableOpacity style={[s.btnAction, s.btnPause]} onPress={() => setRunning(false)} activeOpacity={0.8}>
              <Text style={s.btnActionTxt}>⏸  Pause</Text>
            </TouchableOpacity>
          )}
          {isPaused && (
            <View>
              <TouchableOpacity style={s.btnAction} onPress={() => setRunning(true)} activeOpacity={0.8}>
                <Text style={s.btnActionTxt}>▶  Reprendre</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnAction, { backgroundColor: "rgba(255,255,255,0.15)", marginTop: rs(6) }]}
                onPress={() => setShowRapport(true)} activeOpacity={0.8}
              >
                <Text style={s.btnActionTxt}>⏹  Terminer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={s.progressBg}>
          <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>
      </View>
    );
  };

  /* ── Ligne planning ── */
  const renderPlanRow = (seg: any, i: number) => {
    const isDone  = done || (started && i < curIdx);
    const isCur   = !done && i === curIdx;
    const isNext  = !done && running && i === curIdx + 1;
    const isFirst = !started && i === 0;

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
          {isCur ? <Text style={{ fontSize: rf(10), color: "#fff" }}>▶</Text>
           : isDone ? <Text style={{ fontSize: rf(11), color: C.success }}>✓</Text>
           : <View style={[s.planDotInner, { backgroundColor: isFirst ? C.brand : C.border }]} />}
        </View>

        <Text style={[s.planHeure, isCur && { color: C.brand, fontWeight: "700" }]}>
          {seg.heure_debut.slice(0, 5)}
        </Text>

        <View style={{ flex: 1 }}>
          <Text style={[s.planSegTitle, isCur && { fontWeight: "700" }, isDone && { color: C.textMuted }]}>
            {segTitle(seg)}
          </Text>
          <Text style={s.planSegSub}>{segDurMin(seg.heure_debut, seg.heure_fin)} min</Text>
        </View>

        {isFirst && !started && (
          <View style={s.badgeProchain}><Text style={s.badgeProchainTxt}>PROCHAIN</Text></View>
        )}
        {isCur && running && (
          <View style={s.badgeEnCours}><Text style={s.badgeEnCoursTxt}>EN COURS</Text></View>
        )}
        {isNext && (
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
                {done ? todayPlan.length : (started ? curIdx : 0)} / {todayPlan.length} faits
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

        {!session && (
          <View style={s.noSession}>
            <Text style={s.noSessionTxt}>⚠️  Aucune session active — contactez votre coordinateur.</Text>
          </View>
        )}
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
  segBadge:     { backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(20) },
  segBadgeTxt:  { color: "#fff", fontSize: rf(11), fontWeight: "700", letterSpacing: 0.5 },
  segTimeRange: { color: "#fff", fontSize: rf(13), fontWeight: "600", opacity: 0.9 },
  segTitle:     { color: "#fff", fontSize: rf(18), fontWeight: "700", marginBottom: rs(14), lineHeight: rf(24) },
  segTimerRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(14) },
  timerText:    { fontSize: rf(42), fontWeight: "700", color: "#fff", letterSpacing: 1.5, flexShrink: 1 },
  timerSub:     { fontSize: rf(12), color: "rgba(255,255,255,0.75)", marginTop: rs(4) },
  btnAction:    { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: rs(12), paddingHorizontal: rs(18), paddingVertical: rs(12) },
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
  planSegTitle:  { fontSize: rf(14), fontWeight: "600", color: C.text },
  planSegSub:    { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },

  badgeProchain:    { backgroundColor: C.brandSoft, borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeProchainTxt: { fontSize: rf(10), fontWeight: "700", color: C.brand },
  badgeEnCours:     { backgroundColor: "rgba(0,0,0,0.07)", borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeEnCoursTxt:  { fontSize: rf(10), fontWeight: "700", color: C.brand },
  badgeSuivant:     { borderWidth: 1, borderColor: C.border, borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeSuivantTxt:  { fontSize: rf(10), fontWeight: "600", color: C.textMuted },

  noSession:    { backgroundColor: C.warnSoft, borderRadius: rs(12), padding: rs(14), borderWidth: 1, borderColor: C.warn },
  noSessionTxt: { fontSize: rf(13), color: C.warn, fontWeight: "600" },

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
