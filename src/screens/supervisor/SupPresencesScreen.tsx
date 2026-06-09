import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { enqueueAction,
         upsertSupervisorTeachers, getSupervisorTeachersCache,
         upsertSupervisorPresence, getSupervisorPresenceForDate } from "../../services/db";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";

interface Prof {
  id:        string;
  nom:       string;
  classe:    string;
  present:   boolean | null;
  motif:     string | null;
  initiales: string;
}

const MOTIFS = [
  "Maladie", "Congé", "Formation",
  "Raison familiale", "Événement imprévu",
  "Sans motif communiqué", "Autre",
];

function makeInitials(name: string) {
  return name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function SupPresencesScreen() {
  const insets = useSafeAreaInsets();
  const { user, isOnline, syncOffline } = useStore();

  const [profs,       setProfs]       = useState<Prof[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [motifModal,  setMotifModal]  = useState<Prof | null>(null);
  const [motifChoice, setMotifChoice] = useState<string | null>(null);
  const [validated,   setValidated]   = useState(false);
  const [validating,  setValidating]  = useState(false);
  const [locked,      setLocked]      = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  /* ── Chargement : en ligne → API, hors-ligne → SQLite local ── */
  const fetchTeachers = useCallback(async () => {
    setError(null);
    const dateJour = todayIso();

    if (isOnline) {
      try {
        const [{ data }, presenceRes] = await Promise.all([
          superviseurApi.sync(),
          superviseurApi.getPresenceCheck().catch(() => null),
        ]);

        const rawTeachers: { id: string; name: string; classes?: string[] }[] =
          data.assigned_teachers ?? [];

        if (rawTeachers.length === 0) {
          setProfs([]);
          return;
        }

        // Persister la liste des enseignants pour usage hors-ligne
        upsertSupervisorTeachers(
          rawTeachers.map(t => ({
            id:  t.id,
            nom: t.name,
            cls: (t.classes ?? [])[0] ?? "—",
          })),
        );

        // Pointage déjà enregistré côté serveur pour aujourd'hui
        const saved = new Map<string, { present: boolean; motif: string | null }>();
        for (const e of presenceRes?.data?.entries ?? []) {
          // Conversion explicite en boolean pour éviter toute ambiguïté
          saved.set(e.teacher_id, {
            present: e.present === true,
            motif:   e.motif ?? null,
          });
        }

        const builtProfs = rawTeachers.map(t => {
          const s = saved.get(t.id);
          return {
            id:        t.id,
            nom:       t.name,
            classe:    (t.classes ?? [])[0] ?? "—",
            present:   s !== undefined ? (s.present === true) : null,
            motif:     s ? s.motif : null,
            initiales: makeInitials(t.name),
          };
        });

        // Synchroniser le cache local avec les données serveur
        for (const p of builtProfs) {
          upsertSupervisorPresence({
            date_jour:   dateJour,
            teacher_id:  p.id,
            teacher_nom: p.nom,
            teacher_cls: p.classe,
            present:     p.present,
            motif:       p.motif,
            synced:      saved.has(p.id) ? 1 : 0,
          });
        }

        setProfs(builtProfs);
        setLocked(saved.size > 0);
      } catch {
        setError("Impossible de charger les enseignants. Passage en mode hors-ligne.");
        loadFromLocalCache(dateJour);
      }
    } else {
      // Hors-ligne : lecture depuis SQLite
      loadFromLocalCache(dateJour);
    }
  }, [isOnline]);

  function loadFromLocalCache(dateJour: string) {
    const localEntries = getSupervisorPresenceForDate(dateJour);

    if (localEntries.length > 0) {
      // Reconstruire profs depuis le cache existant pour aujourd'hui
      setProfs(localEntries.map(r => ({
        id:        r.teacher_id,
        nom:       r.teacher_nom,
        classe:    r.teacher_cls,
        present:   r.present === null ? null : r.present === 1,
        motif:     r.motif,
        initiales: makeInitials(r.teacher_nom),
      })));
      const hasSubmitted = localEntries.some(r => r.synced === 1);
      setLocked(hasSubmitted);
    } else {
      // Pas de données pour aujourd'hui — charger la liste des enseignants du cache
      const teachers = getSupervisorTeachersCache();
      setProfs(teachers.map(t => ({
        id:        t.teacher_id,
        nom:       t.teacher_nom,
        classe:    t.teacher_cls,
        present:   null,
        motif:     null,
        initiales: makeInitials(t.teacher_nom),
      })));
      setLocked(false);
    }

    if (!isOnline) {
      setError("Hors-ligne — les modifications seront synchronisées à la reconnexion.");
    }
  }

  useEffect(() => {
    fetchTeachers().finally(() => setLoading(false));
  }, [fetchTeachers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTeachers();
    setRefreshing(false);
  };

  /* ── Sync manuelle (bouton header) ── */
  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      await syncOffline(true);
      await fetchTeachers();
    } catch {}
    finally { setSyncing(false); }
  };

  /* ── Actions de marquage — mise à jour UI + cache local immédiat ── */
  const markPresent = (id: string) => {
    if (locked) return;
    const dateJour = todayIso();
    setProfs(list => {
      const updated = list.map(p =>
        p.id === id ? { ...p, present: true as const, motif: null } : p
      );
      // Persister immédiatement dans SQLite
      const prof = updated.find(p => p.id === id);
      if (prof) {
        upsertSupervisorPresence({
          date_jour: dateJour, teacher_id: prof.id,
          teacher_nom: prof.nom, teacher_cls: prof.classe,
          present: true, motif: null, synced: 0,
        });
      }
      return updated;
    });
  };

  const confirmAbsent = () => {
    if (!motifModal || !motifChoice) return;
    const dateJour = todayIso();
    setProfs(list => {
      const updated = list.map(p =>
        p.id === motifModal.id ? { ...p, present: false as const, motif: motifChoice } : p
      );
      const prof = updated.find(p => p.id === motifModal.id);
      if (prof) {
        upsertSupervisorPresence({
          date_jour: dateJour, teacher_id: prof.id,
          teacher_nom: prof.nom, teacher_cls: prof.classe,
          present: false, motif: motifChoice, synced: 0,
        });
      }
      return updated;
    });
    setMotifModal(null);
    setMotifChoice(null);
  };

  /* ── Validation ── */
  const handleValidate = async () => {
    setValidating(true);
    const dateJour = todayIso();

    // Construire les entrées avec boolean explicite (pas de cast TypeScript)
    const entries = profs
      .filter(p => p.present !== null)
      .map(p => ({
        teacher_id: p.id,
        present:    p.present === true,   // boolean explicite — jamais null/undefined
        motif:      p.present === true ? null : (p.motif ?? null),
      }));

    if (entries.length === 0) {
      setError("Marquez au moins un enseignant avant de valider.");
      setValidating(false);
      return;
    }

    if (isOnline) {
      try {
        await superviseurApi.submitPresenceCheck(dateJour, entries);
        // Marquer comme synchronisé dans le cache local
        for (const e of entries) {
          upsertSupervisorPresence({
            date_jour:   dateJour,
            teacher_id:  e.teacher_id,
            teacher_nom: profs.find(p => p.id === e.teacher_id)?.nom ?? "",
            teacher_cls: profs.find(p => p.id === e.teacher_id)?.classe ?? "",
            present:     e.present,
            motif:       e.motif,
            synced:      1,
          });
        }
        setValidated(true);
        setLocked(true);
        setTimeout(() => setValidated(false), 2500);
      } catch {
        setError("Impossible d'enregistrer les présences. Réessayez ou soumettez hors-ligne.");
      }
    } else {
      // Hors-ligne : mettre en file d'attente
      enqueueAction("SUBMIT_PRESENCE_CHECK", { date_jour: dateJour, entries });
      // Marquer localement comme "soumis hors-ligne" (synced reste 0 jusqu'au flush)
      for (const e of entries) {
        upsertSupervisorPresence({
          date_jour:   dateJour,
          teacher_id:  e.teacher_id,
          teacher_nom: profs.find(p => p.id === e.teacher_id)?.nom ?? "",
          teacher_cls: profs.find(p => p.id === e.teacher_id)?.classe ?? "",
          present:     e.present,
          motif:       e.motif,
          synced:      0,
        });
      }
      setValidated(true);
      setLocked(true);
      setError("Pointage enregistré hors-ligne — sera synchronisé à la reconnexion.");
      setTimeout(() => setValidated(false), 2500);
    }

    setValidating(false);
  };

  /* ── Stats ── */
  const presentsCount = profs.filter(p => p.present === true).length;
  const absentsCount  = profs.filter(p => p.present === false).length;
  const defined       = profs.filter(p => p.present !== null).length;

  const filtered = profs.filter(p =>
    !search.trim() ||
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    p.classe.toLowerCase().includes(search.toLowerCase())
  );

  const avatarBg    = (p: Prof) => p.present === true ? C.successSoft : p.present === false ? C.dangerSoft : C.surfaceAlt;
  const avatarColor = (p: Prof) => p.present === true ? C.success    : p.present === false ? C.danger     : C.textMuted;

  const today = new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  const todayCapital = today.charAt(0).toUpperCase() + today.slice(1);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Chargement des enseignants…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* ── AppHeader identique à l'écran enseignant ── */}
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
      />

      {/* ── Contenu principal ── */}
      <View style={styles.content}>

        {/* Salutation + date */}
        <View style={styles.header}>
          <Text style={styles.headerDate}>{todayCapital}</Text>
          <Text style={styles.headerGreet}>Bonjour, {user?.name ?? "Superviseur"} 👋</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: C.successSoft }]}>
            <Text style={[styles.statValue, { color: C.success }]}>{presentsCount}</Text>
            <Text style={[styles.statLabel, { color: C.success }]}>Présents</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.dangerSoft }]}>
            <Text style={[styles.statValue, { color: C.danger }]}>{absentsCount}</Text>
            <Text style={[styles.statLabel, { color: C.danger }]}>Absents</Text>
          </View>
        </View>

        {/* Recherche */}
        <View style={styles.searchBar}>
          <Feather name="search" size={rs(16)} color={C.textMuted} />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Rechercher un professeur..."
            placeholderTextColor={C.textMuted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={rs(16)} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Erreur / info hors-ligne */}
        {error && (
          <View style={[
            styles.errorBanner,
            !isOnline && styles.warnBanner,
          ]}>
            <Feather
              name={isOnline ? "alert-circle" : "wifi-off"}
              size={rs(14)}
              color={isOnline ? C.danger : C.warn}
            />
            <Text style={[styles.errorText, !isOnline && styles.warnText]}>{error}</Text>
            {isOnline && (
              <TouchableOpacity onPress={() => { setLoading(true); fetchTeachers().finally(() => setLoading(false)); }}>
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Liste enseignants */}
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>
            Présences aujourd'hui
            {profs.length > 0 && (
              <Text style={styles.listCount}> · {profs.length} enseignant{profs.length > 1 ? "s" : ""}</Text>
            )}
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
          >
            {filtered.length === 0 && !error && (
              <View style={styles.emptyState}>
                <Feather name="users" size={rs(32)} color={C.textMuted} />
                <Text style={styles.emptyText}>
                  {profs.length === 0
                    ? "Aucun enseignant assigné.\nContactez l'administrateur."
                    : "Aucun résultat pour cette recherche."}
                </Text>
              </View>
            )}
            {filtered.map((prof, i) => (
              <View key={prof.id} style={[styles.profRow, i < filtered.length - 1 && styles.profBorder]}>
                <View style={[styles.avatar, { backgroundColor: avatarBg(prof) }]}>
                  <Text style={[styles.avatarText, { color: avatarColor(prof) }]}>{prof.initiales}</Text>
                </View>
                <View style={styles.profInfo}>
                  <Text style={styles.profName}>{prof.nom}</Text>
                  <Text style={styles.profClasse}>{prof.classe}</Text>
                </View>
                <View style={styles.profActions}>
                  <TouchableOpacity
                    onPress={() => markPresent(prof.id)}
                    disabled={locked}
                    style={[styles.btn, prof.present === true && styles.btnPresent]}
                  >
                    <Text style={[styles.btnText, prof.present === true && styles.btnTextPresent]}>✓ Présent</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { if (!locked) { setMotifModal(prof); setMotifChoice(null); } }}
                    disabled={locked}
                    style={[styles.btn, prof.present === false && styles.btnAbsent]}
                  >
                    <Text style={[styles.btnText, prof.present === false && styles.btnTextAbsent]}>✗ Absent</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Bouton valider */}
        <TouchableOpacity
          onPress={locked ? undefined : handleValidate}
          disabled={validating || defined === 0 || locked}
          style={[
            styles.validateBtn,
            (validating || defined === 0 || locked) && styles.validateBtnDisabled,
            { marginBottom: rs(10) },
          ]}
        >
          {validating ? (
            <ActivityIndicator size="small" color={C.textMuted} />
          ) : (
            <Text style={[styles.validateText, (defined === 0 || locked) && styles.validateTextDisabled]}>
              {locked
                ? "✓ Présences validées"
                : isOnline
                  ? `✓ Valider les présences${defined > 0 ? ` (${defined}/${profs.length})` : ""}`
                  : `↑ Enregistrer hors-ligne${defined > 0 ? ` (${defined}/${profs.length})` : ""}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Profile sheet ── */}
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* ── Modal succès ── */}
      <Modal visible={validated} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Feather name={isOnline ? "check" : "clock"} size={rs(28)} color={C.success} />
            </View>
            <Text style={styles.successTitle}>
              {isOnline ? "Présences validées !" : "Enregistré hors-ligne !"}
            </Text>
            <Text style={styles.successSub}>
              {presentsCount} présent{presentsCount !== 1 ? "s" : ""} · {absentsCount} absent{absentsCount !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
      </Modal>

      {/* ── Modal motif d'absence ── */}
      <Modal visible={!!motifModal} transparent animationType="slide">
        <View style={styles.motifOverlay}>
          <View style={styles.motifSheet}>
            <View style={styles.motifHandle} />
            <View style={styles.motifHeader}>
              <View style={styles.motifIcon}>
                <Feather name="alert-triangle" size={rs(20)} color={C.danger} />
              </View>
              <View>
                <Text style={styles.motifTitle}>Motif d'absence</Text>
                <Text style={styles.motifSub}>{motifModal?.nom} · Classe {motifModal?.classe}</Text>
              </View>
            </View>
            {MOTIFS.map(m => (
              <TouchableOpacity key={m} onPress={() => setMotifChoice(m)}
                style={[styles.motifOption, motifChoice === m && styles.motifOptionSelected]}>
                <View style={[styles.motifRadio, motifChoice === m && styles.motifRadioSelected]} />
                <Text style={[styles.motifOptionText, motifChoice === m && styles.motifOptionTextSelected]}>{m}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.motifActions}>
              <TouchableOpacity onPress={() => { setMotifModal(null); setMotifChoice(null); }} style={styles.motifCancel}>
                <Text style={styles.motifCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmAbsent} disabled={!motifChoice}
                style={[styles.motifConfirm, !motifChoice && styles.motifConfirmDisabled]}>
                <Text style={styles.motifConfirmText}>Confirmer l'absence</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex:1, backgroundColor:C.bg },
  content:      { flex:1, paddingHorizontal:rs(14), paddingTop:rs(10) },
  center:       { flex:1, backgroundColor:C.bg, alignItems:"center", justifyContent:"center", gap:rs(12) },
  loadingText:  { fontSize:rf(16), color:C.textMuted, marginTop:rs(8) },

  header:       { marginBottom:rs(10) },
  headerDate:   { fontSize:rf(14), color:C.textMuted, fontWeight:"500" },
  headerGreet:  { fontSize:rf(19), fontWeight:"700", color:C.text, marginTop:rs(2) },

  statsRow:     { flexDirection:"row", gap:rs(10), marginBottom:rs(10) },
  statCard:     { flex:1, borderRadius:rs(12), padding:rs(14), alignItems:"center" },
  statValue:    { fontSize:rf(22), fontWeight:"700" },
  statLabel:    { fontSize:rf(14), fontWeight:"600", marginTop:rs(2) },

  searchBar:    { flexDirection:"row", alignItems:"center", gap:rs(10), backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:rs(12), paddingHorizontal:rs(14), paddingVertical:rs(10), marginBottom:rs(10) },
  searchInput:  { flex:1, color:C.text, fontSize:rf(16) },

  errorBanner:  { flexDirection:"row", alignItems:"center", gap:rs(8), backgroundColor:C.dangerSoft, borderRadius:rs(10), padding:rs(12), marginBottom:rs(10) },
  warnBanner:   { backgroundColor:"#FFF8E6", borderColor:"#F5D87A", borderWidth:1 },
  errorText:    { flex:1, fontSize:rf(14), color:C.danger },
  warnText:     { color:C.warn },
  retryText:    { fontSize:rf(14), fontWeight:"700", color:C.danger, textDecorationLine:"underline" },

  listCard:     { flex:1, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:rs(14), overflow:"hidden", marginBottom:rs(10) },
  listTitle:    { fontSize:rf(15), fontWeight:"700", color:C.text, padding:rs(14), borderBottomWidth:1, borderBottomColor:C.border },
  listCount:    { fontWeight:"400", color:C.textMuted },

  emptyState:   { alignItems:"center", justifyContent:"center", padding:rs(40), gap:rs(12) },
  emptyText:    { fontSize:rf(15), color:C.textMuted, textAlign:"center", lineHeight:rf(22) },

  profRow:      { flexDirection:"row", alignItems:"center", gap:rs(10), padding:rs(12), paddingHorizontal:rs(14) },
  profBorder:   { borderBottomWidth:1, borderBottomColor:C.border },
  avatar:       { width:rs(34), height:rs(34), borderRadius:rs(17), alignItems:"center", justifyContent:"center", flexShrink:0 },
  avatarText:   { fontSize:rf(13), fontWeight:"700" },
  profInfo:     { flex:1 },
  profName:     { fontSize:rf(15), fontWeight:"600", color:C.text },
  profClasse:   { fontSize:rf(13), color:C.textMuted, marginTop:rs(1) },
  profActions:  { flexDirection:"row", gap:rs(6) },
  btn:          { paddingVertical:rs(6), paddingHorizontal:rs(10), borderRadius:rs(8), borderWidth:2, borderColor:C.border },
  btnPresent:   { borderColor:C.success, backgroundColor:C.successSoft },
  btnAbsent:    { borderColor:C.danger,  backgroundColor:C.dangerSoft  },
  btnText:      { fontSize:rf(13), fontWeight:"700", color:C.textMuted },
  btnTextPresent: { color:C.success },
  btnTextAbsent:  { color:C.danger },

  validateBtn:         { backgroundColor:C.brand, padding:rs(15), borderRadius:rs(14), alignItems:"center", marginTop:rs(4) },
  validateBtnDisabled: { backgroundColor:C.surfaceAlt },
  validateText:        { color:"#fff", fontSize:rf(17), fontWeight:"700" },
  validateTextDisabled:{ color:C.textMuted },

  overlay:      { flex:1, backgroundColor:"rgba(0,0,0,0.5)", alignItems:"center", justifyContent:"center" },
  successCard:  { backgroundColor:C.surface, borderRadius:rs(24), padding:rs(32), alignItems:"center", gap:rs(14), marginHorizontal:rs(24) },
  successIcon:  { width:rs(64), height:rs(64), borderRadius:rs(32), backgroundColor:C.successSoft, alignItems:"center", justifyContent:"center" },
  successTitle: { fontSize:rf(19), fontWeight:"700", color:C.text },
  successSub:   { fontSize:rf(15), color:C.textMuted },

  motifOverlay: { flex:1, backgroundColor:"rgba(0,0,0,0.45)", justifyContent:"flex-end" },
  motifSheet:   { backgroundColor:C.surface, borderTopLeftRadius:rs(24), borderTopRightRadius:rs(24), padding:rs(20), paddingBottom:rs(32), gap:rs(10) },
  motifHandle:  { width:rs(40), height:rs(4), borderRadius:rs(2), backgroundColor:C.border, alignSelf:"center", marginBottom:rs(4) },
  motifHeader:  { flexDirection:"row", alignItems:"center", gap:rs(12), marginBottom:rs(4) },
  motifIcon:    { width:rs(40), height:rs(40), borderRadius:rs(20), backgroundColor:C.dangerSoft, alignItems:"center", justifyContent:"center" },
  motifTitle:   { fontSize:rf(19), fontWeight:"700", color:C.text },
  motifSub:     { fontSize:rf(14), color:C.textMuted, marginTop:rs(1) },
  motifOption:  { flexDirection:"row", alignItems:"center", gap:rs(12), padding:rs(14), borderRadius:rs(12), backgroundColor:C.surfaceAlt },
  motifOptionSelected: { backgroundColor:C.brandSoft },
  motifOptionText:     { fontSize:rf(16), color:C.text },
  motifOptionTextSelected: { color:C.brand, fontWeight:"600" },
  motifRadio:          { width:rs(20), height:rs(20), borderRadius:rs(10), borderWidth:2, borderColor:C.border },
  motifRadioSelected:  { borderColor:C.brand, backgroundColor:C.brand },
  motifActions: { flexDirection:"row", gap:rs(10), marginTop:rs(6) },
  motifCancel:  { flex:1, padding:rs(13), borderRadius:rs(12), backgroundColor:C.surfaceAlt, alignItems:"center" },
  motifCancelText: { fontSize:rf(16), fontWeight:"600", color:C.text },
  motifConfirm: { flex:1, padding:rs(13), borderRadius:rs(12), backgroundColor:C.primary, alignItems:"center" },
  motifConfirmDisabled: { backgroundColor:C.surfaceAlt },
  motifConfirmText:     { fontSize:rf(14), fontWeight:"700", color:"#fff" },
});
