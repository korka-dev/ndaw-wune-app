import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";

interface Teacher {
  id: string;
  name: string;
  phone?: string;
  classes?: string[];
  school_id?: string;
  status: string;
}

interface Prof {
  id: string;
  nom: string;
  classe: string;
  present: boolean | null;
  motif: string | null;
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

export default function SupPresencesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useStore();

  const [profs,        setProfs]        = useState<Prof[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [motifModal,   setMotifModal]   = useState<Prof | null>(null);
  const [motifChoice,  setMotifChoice]  = useState<string | null>(null);
  const [validated,    setValidated]    = useState(false);
  const [validating,   setValidating]   = useState(false);
  const [locked,       setLocked]       = useState(false);
  const [profileOpen,  setProfileOpen]  = useState(false);

  /* ── Chargement des enseignants assignés depuis l'API ── */
  const fetchTeachers = useCallback(async () => {
    try {
      setError(null);
      const { data } = await superviseurApi.sync();
      const teachers: Teacher[] = data.teachers ?? [];

      if (teachers.length === 0) {
        setProfs([]);
        return;
      }

      setProfs(teachers.map(t => ({
        id:        t.id,
        nom:       t.name,
        classe:    (t.classes ?? [])[0] ?? "—",
        present:   null,
        motif:     null,
        initiales: makeInitials(t.name),
      })));
    } catch (e: any) {
      setError("Impossible de charger les enseignants. Vérifiez votre connexion.");
    }
  }, []);

  useEffect(() => {
    fetchTeachers().finally(() => setLoading(false));
  }, [fetchTeachers]);

  const onRefresh = async () => {
    setRefreshing(true);
    setLocked(false);
    setProfs(p => p.map(x => ({ ...x, present: null, motif: null })));
    await fetchTeachers();
    setRefreshing(false);
  };

  /* ── Actions ── */
  const markPresent = (id: string) => {
    if (locked) return;
    setProfs(list => list.map(p => p.id === id ? { ...p, present: true, motif: null } : p));
  };

  const confirmAbsent = () => {
    if (!motifModal || !motifChoice) return;
    setProfs(list => list.map(p =>
      p.id === motifModal.id ? { ...p, present: false, motif: motifChoice } : p
    ));
    setMotifModal(null);
    setMotifChoice(null);
  };

  const handleValidate = () => {
    setValidating(true);
    setTimeout(() => {
      setValidating(false);
      setValidated(true);
      setLocked(true);
      setTimeout(() => setValidated(false), 2500);
    }, 1000);
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

  /* ── Écran de chargement ── */
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

      {/* ── AppHeader (logo ARED + avatar) ── */}
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
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

        {/* Erreur */}
        {error && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={rs(14)} color={C.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); fetchTeachers().finally(() => setLoading(false)); }}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Liste enseignants (flex:1 → occupe tout l'espace restant) */}
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

        {/* Bouton valider — collé en bas */}
        <TouchableOpacity
          onPress={locked ? undefined : handleValidate}
          disabled={validating || defined === 0 || locked}
          style={[
            styles.validateBtn,
            (validating || defined === 0 || locked) && styles.validateBtnDisabled,
            { marginBottom: insets.bottom + rs(16) },
          ]}
        >
          {validating ? (
            <ActivityIndicator size="small" color={C.textMuted} />
          ) : (
            <Text style={[styles.validateText, (defined === 0 || locked) && styles.validateTextDisabled]}>
              {locked
                ? "✓ Présences validées"
                : `✓ Valider les présences${defined > 0 ? ` (${defined}/${profs.length})` : ""}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Profile sheet (slide depuis le bas) ── */}
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* ── Modal succès ── */}
      <Modal visible={validated} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Feather name="check" size={rs(28)} color={C.success} />
            </View>
            <Text style={styles.successTitle}>Présences validées !</Text>
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
  loadingText:  { fontSize:rf(14), color:C.textMuted, marginTop:rs(8) },

  header:       { marginBottom:rs(10) },
  headerDate:   { fontSize:rf(12), color:C.textMuted, fontWeight:"500" },
  headerGreet:  { fontSize:rf(18), fontWeight:"700", color:C.text, marginTop:rs(2) },

  statsRow:     { flexDirection:"row", gap:rs(10), marginBottom:rs(10) },
  statCard:     { flex:1, borderRadius:rs(12), padding:rs(14), alignItems:"center" },
  statValue:    { fontSize:rf(22), fontWeight:"700" },
  statLabel:    { fontSize:rf(12), fontWeight:"600", marginTop:rs(2) },

  searchBar:    { flexDirection:"row", alignItems:"center", gap:rs(10), backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:rs(12), paddingHorizontal:rs(14), paddingVertical:rs(10), marginBottom:rs(10) },
  searchInput:  { flex:1, color:C.text, fontSize:rf(14) },

  errorBanner:  { flexDirection:"row", alignItems:"center", gap:rs(8), backgroundColor:C.dangerSoft, borderRadius:rs(10), padding:rs(12), marginBottom:rs(10) },
  errorText:    { flex:1, fontSize:rf(12), color:C.danger },
  retryText:    { fontSize:rf(12), fontWeight:"700", color:C.danger, textDecorationLine:"underline" },

  listCard:     { flex:1, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:rs(14), overflow:"hidden", marginBottom:rs(10) },
  listTitle:    { fontSize:rf(13), fontWeight:"700", color:C.text, padding:rs(14), borderBottomWidth:1, borderBottomColor:C.border },
  listCount:    { fontWeight:"400", color:C.textMuted },

  emptyState:   { alignItems:"center", justifyContent:"center", padding:rs(40), gap:rs(12) },
  emptyText:    { fontSize:rf(13), color:C.textMuted, textAlign:"center", lineHeight:rf(20) },

  profRow:      { flexDirection:"row", alignItems:"center", gap:rs(10), padding:rs(12), paddingHorizontal:rs(14) },
  profBorder:   { borderBottomWidth:1, borderBottomColor:C.border },
  avatar:       { width:rs(34), height:rs(34), borderRadius:rs(17), alignItems:"center", justifyContent:"center", flexShrink:0 },
  avatarText:   { fontSize:rf(11), fontWeight:"700" },
  profInfo:     { flex:1 },
  profName:     { fontSize:rf(13), fontWeight:"600", color:C.text },
  profClasse:   { fontSize:rf(11), color:C.textMuted, marginTop:rs(1) },
  profActions:  { flexDirection:"row", gap:rs(6) },
  btn:          { paddingVertical:rs(6), paddingHorizontal:rs(10), borderRadius:rs(8), borderWidth:2, borderColor:C.border },
  btnPresent:   { borderColor:C.success, backgroundColor:C.successSoft },
  btnAbsent:    { borderColor:C.danger,  backgroundColor:C.dangerSoft  },
  btnText:      { fontSize:rf(11), fontWeight:"700", color:C.textMuted },
  btnTextPresent: { color:C.success },
  btnTextAbsent:  { color:C.danger },

  validateBtn:         { backgroundColor:C.brand, padding:rs(15), borderRadius:rs(14), alignItems:"center", marginTop:rs(4) },
  validateBtnDisabled: { backgroundColor:C.surfaceAlt },
  validateText:        { color:"#fff", fontSize:rf(15), fontWeight:"700" },
  validateTextDisabled:{ color:C.textMuted },

  overlay:      { flex:1, backgroundColor:"rgba(0,0,0,0.5)", alignItems:"center", justifyContent:"center" },
  successCard:  { backgroundColor:C.surface, borderRadius:rs(24), padding:rs(32), alignItems:"center", gap:rs(14), marginHorizontal:rs(24) },
  successIcon:  { width:rs(64), height:rs(64), borderRadius:rs(32), backgroundColor:C.successSoft, alignItems:"center", justifyContent:"center" },
  successTitle: { fontSize:rf(18), fontWeight:"700", color:C.text },
  successSub:   { fontSize:rf(13), color:C.textMuted },

  motifOverlay: { flex:1, backgroundColor:"rgba(0,0,0,0.45)", justifyContent:"flex-end" },
  motifSheet:   { backgroundColor:C.surface, borderTopLeftRadius:rs(24), borderTopRightRadius:rs(24), padding:rs(20), paddingBottom:rs(32), gap:rs(10) },
  motifHandle:  { width:rs(40), height:rs(4), borderRadius:rs(2), backgroundColor:C.border, alignSelf:"center", marginBottom:rs(4) },
  motifHeader:  { flexDirection:"row", alignItems:"center", gap:rs(12), marginBottom:rs(4) },
  motifIcon:    { width:rs(40), height:rs(40), borderRadius:rs(20), backgroundColor:C.dangerSoft, alignItems:"center", justifyContent:"center" },
  motifTitle:   { fontSize:rf(17), fontWeight:"700", color:C.text },
  motifSub:     { fontSize:rf(12), color:C.textMuted, marginTop:rs(1) },
  motifOption:  { flexDirection:"row", alignItems:"center", gap:rs(12), padding:rs(14), borderRadius:rs(12), backgroundColor:C.surfaceAlt },
  motifOptionSelected: { backgroundColor:C.brandSoft },
  motifOptionText:     { fontSize:rf(14), color:C.text },
  motifOptionTextSelected: { color:C.brand, fontWeight:"600" },
  motifRadio:          { width:rs(20), height:rs(20), borderRadius:rs(10), borderWidth:2, borderColor:C.border },
  motifRadioSelected:  { borderColor:C.brand, backgroundColor:C.brand },
  motifActions: { flexDirection:"row", gap:rs(10), marginTop:rs(6) },
  motifCancel:  { flex:1, padding:rs(13), borderRadius:rs(12), backgroundColor:C.surfaceAlt, alignItems:"center" },
  motifCancelText: { fontSize:rf(14), fontWeight:"600", color:C.text },
  motifConfirm: { flex:1, padding:rs(13), borderRadius:rs(12), backgroundColor:C.primary, alignItems:"center" },
  motifConfirmDisabled: { backgroundColor:C.surfaceAlt },
  motifConfirmText:     { fontSize:rf(14), fontWeight:"700", color:"#fff" },
});
