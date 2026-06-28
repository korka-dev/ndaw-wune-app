/**
 * SupEvaluationScreen — Nouvelle interface d'évaluation (Juin 2026)
 *
 * Flux :
 *   1. VUE "sujets"   → liste des sujets créés par l'admin
 *   2. VUE "eleves"   → élèves tirés au sort pour le sujet sélectionné
 *   3. VUE "evaluer"  → fiche d'évaluation directe (résultat + enregistrement audio)
 *
 * Le superviseur ne choisit plus les élèves — ils sont tirés aléatoirement par l'admin.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";

// ── Types ─────────────────────────────────────────────────────────────────────

type Resultat = "acquis" | "a_aider";

interface TirageAppOut {
  tirage_id:    string;
  eleve_id:     string;
  eleve_nom:    string;
  eleve_prenom: string | null;
  eleve_genre:  string | null;
  eleve_classe: string;
  resultat:     string | null;
  commentaire:  string | null;
  audio_url:    string | null;
  date_eval:    string | null;
}

interface SujetAppOut {
  id:                   string;
  titre:                string;
  description:          string | null;
  nb_eleves_par_classe: number;
  created_at:           string;
  eleves:               TirageAppOut[];
}

type View = "sujets" | "eleves" | "evaluer";

const RESULTATS: { value: Resultat; label: string; symbol: string; color: string; bg: string }[] = [
  { value: "acquis",  label: "Acquis",  symbol: "✓", color: C.success, bg: C.successSoft },
  { value: "a_aider", label: "À aider", symbol: "✗", color: C.danger,  bg: C.dangerSoft  },
];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SupEvaluationScreen() {
  const insets = useSafeAreaInsets();
  const { user, isOnline } = useStore();

  const [sujets,       setSujets]       = useState<SujetAppOut[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [profileOpen,  setProfileOpen]  = useState(false);

  // Navigation
  const [view,          setView]         = useState<View>("sujets");
  const [activeSujet,   setActiveSujet]  = useState<SujetAppOut | null>(null);
  const [activeTirage,  setActiveTirage] = useState<TirageAppOut | null>(null);

  // Évaluation locale (tirage_id → résultat)
  const [pendingResults, setPendingResults] = useState<Record<string, Resultat>>({});
  const [submitting,     setSubmitting]     = useState<string | null>(null); // tirage_id en cours
  const [submitOk,       setSubmitOk]       = useState<string | null>(null); // tirage_id réussi

  // Audio recording
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording,  setIsRecording]  = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [recordingSec, setRecordingSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Chargement ─────────────────────────────────────────────────────────────

  const fetchSujets = useCallback(async () => {
    setError(null);
    try {
      const { data } = await superviseurApi.evaluationSujets();
      setSujets(data ?? []);
    } catch {
      setError("Impossible de charger les sujets. Vérifiez votre connexion.");
    }
  }, []);

  useEffect(() => {
    fetchSujets().finally(() => setLoading(false));
  }, [fetchSujets]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSujets();
    setRefreshing(false);
  };

  // ── Audio ──────────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission refusée", "Autorisez l'accès au microphone dans les paramètres.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSec(0);
      timerRef.current = setInterval(() => setRecordingSec(s => s + 1), 1000);
    } catch {
      Alert.alert("Erreur", "Impossible de démarrer l'enregistrement.");
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setRecordingUri(uri ?? null);
    } catch {
      Alert.alert("Erreur", "Impossible d'arrêter l'enregistrement.");
    } finally {
      recordingRef.current = null;
      setIsRecording(false);
    }
  };

  const cancelRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    setIsRecording(false);
    setRecordingUri(null);
    setRecordingSec(0);
  };

  // ── Soumission ─────────────────────────────────────────────────────────────

  const submitResult = async (tirage: TirageAppOut, resultat: Resultat) => {
    if (submitting) return;
    setSubmitting(tirage.tirage_id);
    try {
      const fd = new FormData();
      fd.append("resultat", resultat);
      if (recordingUri) {
        const filename = `eval_${tirage.tirage_id}.m4a`;
        fd.append("audio", { uri: recordingUri, name: filename, type: "audio/m4a" } as any);
      }
      await superviseurApi.submitTirage(tirage.tirage_id, fd);

      // Mise à jour locale
      setPendingResults(prev => ({ ...prev, [tirage.tirage_id]: resultat }));
      setSubmitOk(tirage.tirage_id);
      setTimeout(() => setSubmitOk(null), 2000);
      setRecordingUri(null);

      // Mettre à jour le sujet localement
      setSujets(prev => prev.map(s => s.id === activeSujet?.id ? {
        ...s,
        eleves: s.eleves.map(e => e.tirage_id === tirage.tirage_id
          ? { ...e, resultat, date_eval: new Date().toISOString().slice(0, 10) }
          : e
        ),
      } : s));

      goBackToEleves();
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer l'évaluation. Réessayez.");
    } finally {
      setSubmitting(null);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const openSujet = (sujet: SujetAppOut) => {
    setActiveSujet(sujet);
    setView("eleves");
  };

  const openEvaluer = (tirage: TirageAppOut) => {
    setActiveTirage(tirage);
    setRecordingUri(null);
    setView("evaluer");
  };

  const goBackToSujets = () => {
    setActiveSujet(null);
    setActiveTirage(null);
    setView("sujets");
  };

  const goBackToEleves = () => {
    setActiveTirage(null);
    setRecordingUri(null);
    setView("eleves");
  };

  // ── Chargement ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[st.root, st.center]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={st.loadingText}>Chargement…</Text>
      </View>
    );
  }

  const bottomPad = rs(12);
  const currentEleves = activeSujet?.eleves ?? [];
  const nbEvalues = currentEleves.filter(e =>
    pendingResults[e.tirage_id] !== undefined || e.resultat !== null
  ).length;

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <View style={st.root}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        isOnline={isOnline}
      />

      {/* ── VUE 1 : Liste des sujets ─────────────────────────────────── */}
      {view === "sujets" && (
        <View style={{ flex: 1 }}>
          <View style={st.viewHeader}>
            <Text style={st.viewTitle}>Évaluations</Text>
            <Text style={st.viewSub}>
              Sujets créés par l'administration
            </Text>
          </View>

          {error && (
            <View style={st.errorBanner}>
              <Feather name="alert-circle" size={rs(14)} color={C.danger} />
              <Text style={st.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); fetchSujets().finally(() => setLoading(false)); }}>
                <Text style={st.retryText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}

          {sujets.length === 0 && !error ? (
            <ScrollView
              contentContainerStyle={st.emptyState}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
            >
              <Feather name="clipboard" size={rs(40)} color={C.textMuted} />
              <Text style={st.emptyText}>
                Aucun sujet d'évaluation disponible.{"\n"}L'administrateur n'a pas encore créé de sujet.
              </Text>
            </ScrollView>
          ) : (
            <FlatList
              data={sujets}
              keyExtractor={item => item.id}
              contentContainerStyle={st.sujetList}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
              renderItem={({ item: sujet }) => {
                const total = sujet.eleves.length;
                const done  = sujet.eleves.filter(e => e.resultat !== null).length;
                const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <TouchableOpacity
                    style={st.sujetCard}
                    onPress={() => openSujet(sujet)}
                    activeOpacity={0.8}
                  >
                    <View style={st.sujetCardIcon}>
                      <Feather name="clipboard" size={rs(20)} color={C.primary} />
                    </View>
                    <View style={{ flex: 1, gap: rs(6) }}>
                      <Text style={st.sujetTitle} numberOfLines={2}>{sujet.titre}</Text>
                      {sujet.description ? (
                        <Text style={st.sujetDesc} numberOfLines={1}>{sujet.description}</Text>
                      ) : null}
                      <Text style={st.sujetMeta}>{formatDate(sujet.created_at)}</Text>

                      {/* Barre de progression */}
                      <View style={st.progRow}>
                        <View style={st.progTrack}>
                          <View style={[st.progFill, { width: `${pct}%` as any }]} />
                        </View>
                        <Text style={st.progLabel}>{done}/{total}</Text>
                      </View>
                    </View>
                    <Feather name="chevron-right" size={rs(16)} color={C.textMuted} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── VUE 2 : Élèves du sujet ──────────────────────────────────── */}
      {view === "eleves" && activeSujet && (
        <View style={{ flex: 1 }}>
          {/* Sous-header */}
          <View style={st.subHeader}>
            <TouchableOpacity onPress={goBackToSujets} style={st.backBtn}>
              <Feather name="arrow-left" size={rs(20)} color={C.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>{activeSujet.titre}</Text>
              <Text style={st.subHeaderSub}>
                {nbEvalues}/{currentEleves.length} élève{currentEleves.length !== 1 ? "s" : ""} évalué{nbEvalues !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {activeSujet.description ? (
            <View style={st.descBanner}>
              <Feather name="info" size={rs(13)} color={C.primary} />
              <Text style={st.descBannerText}>{activeSujet.description}</Text>
            </View>
          ) : null}

          <FlatList
            data={currentEleves}
            keyExtractor={e => e.tirage_id}
            contentContainerStyle={[st.eleveList, { paddingBottom: rs(24) + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: tirage }) => {
              const localRes = pendingResults[tirage.tirage_id];
              const res = localRes ?? tirage.resultat as Resultat | null;
              const isOk = submitOk === tirage.tirage_id;
              const resCfg = res ? RESULTATS.find(r => r.value === res) : null;

              return (
                <TouchableOpacity
                  style={[st.eleveRow, isOk && st.eleveRowOk]}
                  onPress={() => openEvaluer(tirage)}
                  activeOpacity={0.75}
                >
                  <View style={[st.eleveAvatar, resCfg && { backgroundColor: resCfg.bg }]}>
                    {res
                      ? <Text style={[st.eleveSymbol, { color: resCfg?.color }]}>{resCfg?.symbol}</Text>
                      : <Text style={st.eleveAvatarText}>
                          {tirage.eleve_nom.charAt(0)}{(tirage.eleve_prenom ?? "").charAt(0)}
                        </Text>
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.eleveName} numberOfLines={1}>
                      {tirage.eleve_prenom ? `${tirage.eleve_prenom} ` : ""}{tirage.eleve_nom}
                    </Text>
                    <Text style={st.eleve_classe}>{tirage.eleve_classe}</Text>
                  </View>
                  {resCfg ? (
                    <View style={[st.resBadge, { backgroundColor: resCfg.bg }]}>
                      <Text style={[st.resBadgeText, { color: resCfg.color }]}>{resCfg.label}</Text>
                    </View>
                  ) : (
                    <View style={st.pendingBadge}>
                      <Text style={st.pendingBadgeText}>En attente</Text>
                    </View>
                  )}
                  <Feather name="chevron-right" size={rs(14)} color={C.textMuted} style={{ marginLeft: rs(4) }} />
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* ── VUE 3 : Fiche d'évaluation ───────────────────────────────── */}
      {view === "evaluer" && activeTirage && (
        <View style={{ flex: 1 }}>
          {/* Sous-header */}
          <View style={st.subHeader}>
            <TouchableOpacity onPress={goBackToEleves} style={st.backBtn} disabled={!!submitting}>
              <Feather name="arrow-left" size={rs(20)} color={submitting ? C.textMuted : C.text} />
            </TouchableOpacity>
            <View style={st.evalHeaderIcon}>
              <Feather name="edit-3" size={rs(16)} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.subHeaderTitle} numberOfLines={1}>
                {activeTirage.eleve_prenom ? `${activeTirage.eleve_prenom} ` : ""}{activeTirage.eleve_nom}
              </Text>
              <Text style={st.subHeaderSub}>{activeTirage.eleve_classe}</Text>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[st.evalScroll, { paddingBottom: rs(160) + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Info sujet */}
            <View style={st.sujetInfoCard}>
              <Text style={st.sujetInfoTitle}>{activeSujet?.titre}</Text>
              {activeSujet?.description ? (
                <Text style={st.sujetInfoDesc}>{activeSujet.description}</Text>
              ) : null}
            </View>

            {/* Résultat précédent */}
            {(() => {
              const prev = pendingResults[activeTirage.tirage_id] ?? activeTirage.resultat as Resultat | null;
              if (!prev) return null;
              const cfg = RESULTATS.find(r => r.value === prev);
              return (
                <View style={[st.prevResult, { backgroundColor: cfg?.bg }]}>
                  <Text style={[st.prevResultText, { color: cfg?.color }]}>
                    Résultat enregistré : {cfg?.label}
                    {activeTirage.date_eval ? ` (${activeTirage.date_eval})` : ""}
                  </Text>
                </View>
              );
            })()}

            {/* Enregistrement audio */}
            <View style={st.audioSection}>
              <View style={st.audioHeader}>
                <Feather name="mic" size={rs(14)} color={C.primary} />
                <Text style={st.audioTitle}>Enregistrement audio (optionnel)</Text>
              </View>

              {isRecording ? (
                <View style={st.recordingRow}>
                  <View style={st.recDot} />
                  <Text style={st.recTimerText}>
                    {String(Math.floor(recordingSec / 60)).padStart(2, "0")}:
                    {String(recordingSec % 60).padStart(2, "0")}
                  </Text>
                  <TouchableOpacity onPress={stopRecording} style={st.recStopBtn} activeOpacity={0.8}>
                    <Feather name="square" size={rs(14)} color="#fff" />
                    <Text style={st.recStopText}>Arrêter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={cancelRecording} style={st.recCancelBtn} activeOpacity={0.8}>
                    <Feather name="x" size={rs(16)} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : recordingUri ? (
                <View style={st.recordingRow}>
                  <Feather name="check-circle" size={rs(16)} color={C.success} />
                  <Text style={st.recReadyText}>Enregistrement prêt ({recordingSec}s)</Text>
                  <TouchableOpacity onPress={cancelRecording} style={st.recCancelBtn} activeOpacity={0.8}>
                    <Feather name="trash-2" size={rs(15)} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={startRecording} style={st.recStartBtn} activeOpacity={0.8}>
                  <Feather name="mic" size={rs(15)} color={C.primary} />
                  <Text style={st.recStartText}>Démarrer l'enregistrement</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Légende */}
            <View style={st.legend}>
              {RESULTATS.map(r => (
                <View key={r.value} style={[st.legendItem, { backgroundColor: r.bg }]}>
                  <Text style={[st.legendText, { color: r.color }]}>{r.symbol} {r.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Boutons résultat */}
          <View style={[st.bottomBar, { paddingBottom: bottomPad + insets.bottom }]}>
            {submitting === activeTirage.tirage_id ? (
              <View style={[st.submitBtn, { backgroundColor: C.surfaceAlt }]}>
                <ActivityIndicator size="small" color={C.brand} />
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: rs(10) }}>
                {RESULTATS.map(r => (
                  <TouchableOpacity
                    key={r.value}
                    onPress={() => submitResult(activeTirage, r.value)}
                    style={[st.submitBtn, { flex: 1, backgroundColor: r.bg, borderColor: r.color, borderWidth: 2 }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[st.submitBtnText, { color: r.color }]}>
                      {r.symbol} {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText: { fontSize: rf(15), color: C.textMuted },

  viewHeader: { paddingHorizontal: rs(16), paddingTop: rs(12), paddingBottom: rs(8) },
  viewTitle:  { fontSize: rf(22), fontWeight: "800", color: C.text },
  viewSub:    { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },

  // Sujets
  sujetList: { paddingHorizontal: rs(14), paddingTop: rs(8), paddingBottom: rs(24), gap: rs(10) },
  sujetCard: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(16), padding: rs(14),
  },
  sujetCardIcon: {
    width: rs(44), height: rs(44), borderRadius: rs(12),
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  sujetTitle:   { fontSize: rf(15), fontWeight: "700", color: C.text },
  sujetDesc:    { fontSize: rf(12), color: C.textMuted },
  sujetMeta:    { fontSize: rf(11), color: C.textMuted },
  progRow:      { flexDirection: "row", alignItems: "center", gap: rs(8) },
  progTrack:    { flex: 1, height: rs(5), borderRadius: rs(3), backgroundColor: C.border, overflow: "hidden" },
  progFill:     { height: "100%", borderRadius: rs(3), backgroundColor: C.brand },
  progLabel:    { fontSize: rf(11), fontWeight: "700", color: C.textMuted, minWidth: rs(28), textAlign: "right" },

  // Sous-header
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

  descBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: rs(8),
    backgroundColor: C.primarySoft, paddingHorizontal: rs(16), paddingVertical: rs(10),
  },
  descBannerText: { flex: 1, fontSize: rf(13), color: C.primary, lineHeight: rf(19) },

  // Liste élèves
  eleveList:   { paddingHorizontal: rs(14), paddingTop: rs(8) },
  eleveRow:    {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingVertical: rs(12), borderBottomWidth: 1, borderBottomColor: C.border,
  },
  eleveRowOk:    { backgroundColor: C.successSoft + "40" },
  eleveAvatar:   {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  eleveAvatarText: { fontSize: rf(13), fontWeight: "700", color: C.textMuted },
  eleveSymbol:     { fontSize: rf(17), fontWeight: "800" },
  eleveName:       { fontSize: rf(15), fontWeight: "600", color: C.text },
  eleve_classe:    { fontSize: rf(12), color: C.textMuted },
  resBadge:        { paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(8) },
  resBadgeText:    { fontSize: rf(11), fontWeight: "700" },
  pendingBadge:    { paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(8), backgroundColor: C.surfaceAlt },
  pendingBadgeText: { fontSize: rf(11), color: C.textMuted, fontWeight: "600" },

  // Vue évaluation
  evalScroll:    { paddingHorizontal: rs(16), paddingTop: rs(12), gap: rs(14) },
  sujetInfoCard: {
    backgroundColor: C.primarySoft, borderRadius: rs(14), padding: rs(14), gap: rs(4),
  },
  sujetInfoTitle: { fontSize: rf(15), fontWeight: "700", color: C.primary },
  sujetInfoDesc:  { fontSize: rf(13), color: C.primary + "cc", lineHeight: rf(19) },

  prevResult: { borderRadius: rs(10), paddingHorizontal: rs(12), paddingVertical: rs(8) },
  prevResultText: { fontSize: rf(13), fontWeight: "600" },

  // Audio
  audioSection: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(14), padding: rs(14), gap: rs(12),
  },
  audioHeader: { flexDirection: "row", alignItems: "center", gap: rs(8) },
  audioTitle:  { fontSize: rf(13), fontWeight: "700", color: C.text },
  recStartBtn: {
    flexDirection: "row", alignItems: "center", gap: rs(8),
    paddingVertical: rs(10), paddingHorizontal: rs(14),
    backgroundColor: C.primarySoft, borderRadius: rs(10),
    borderWidth: 1, borderColor: C.primary + "40",
  },
  recStartText:  { fontSize: rf(13), fontWeight: "600", color: C.primary },
  recordingRow:  { flexDirection: "row", alignItems: "center", gap: rs(10) },
  recDot:        { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: C.danger },
  recTimerText:  { fontFamily: "monospace", fontSize: rf(14), fontWeight: "700", color: C.text, flex: 1 },
  recStopBtn:    {
    flexDirection: "row", alignItems: "center", gap: rs(5),
    paddingVertical: rs(6), paddingHorizontal: rs(12),
    backgroundColor: C.danger, borderRadius: rs(8),
  },
  recStopText:   { fontSize: rf(12), fontWeight: "700", color: "#fff" },
  recCancelBtn:  { padding: rs(6) },
  recReadyText:  { flex: 1, fontSize: rf(13), color: C.success, fontWeight: "600" },

  // Légende
  legend:     { flexDirection: "row", gap: rs(5) },
  legendItem: { flex: 1, paddingVertical: rs(5), borderRadius: rs(8), alignItems: "center" },
  legendText: { fontSize: rf(11), fontWeight: "700" },

  // Barre du bas
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: C.bg, paddingHorizontal: rs(16), paddingTop: rs(10),
    borderTopWidth: 1, borderTopColor: C.border,
  },
  submitBtn: {
    paddingVertical: rs(15), borderRadius: rs(14),
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
  },
  submitBtnText: { fontSize: rf(16), fontWeight: "800" },

  // Bannières
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: rs(8),
    backgroundColor: C.dangerSoft, borderRadius: rs(10), padding: rs(12), margin: rs(14),
  },
  errorText:  { flex: 1, fontSize: rf(14), color: C.danger },
  retryText:  { fontSize: rf(14), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12), paddingVertical: rs(60) },
  emptyText:  { fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(22) },
});
